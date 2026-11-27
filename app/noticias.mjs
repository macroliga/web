// Lectura de fichajes confirmados: nunca escribe en el mercado.
const dia = new Intl.DateTimeFormat('es-ES', {timeZone:'Europe/Madrid', dateStyle:'full'});
const hora = new Intl.DateTimeFormat('es-ES', {timeZone:'Europe/Madrid', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const entero = new Intl.NumberFormat('es-ES', {useGrouping:true});
const tipos = Object.freeze({
  market:'Mercado', manager_sale:'Entre managers', computer_sale:'Venta a COMPUTER',
  bad_team_sale:'Equipo Malo', clause:'Cláusula', bad_team_clause:'Cláusula · Equipo Malo',
  admin_correction:'Ajuste administrativo'
});
const texto = v => typeof v === 'string' && v.trim().length > 0;
const equipo = v => v.toLowerCase()==='computer' ? 'COMPUTER' : v;
export function importeNoticia(centimos) {
  if (!/^\d+$/.test(String(centimos)) || (typeof centimos==='number' && !Number.isSafeInteger(centimos))) throw new Error('Importe inválido');
  const valor=BigInt(centimos), resto=valor%100n;
  return entero.format(valor/100n)+(resto?','+String(resto).padStart(2,'0'):'')+' €';
}
export function prepararNoticias(filas) {
  if (!Array.isArray(filas)) throw new Error('Respuesta de noticias inválida');
  return filas.map(f => {
    if (!f || !['traspaso_id','fecha','nombre_jugador','origen','destino','tipo'].every(k=>texto(f[k])) || !Number.isFinite(Date.parse(f.fecha))) throw new Error('Traspaso inválido');
    return {...f, dia:dia.format(new Date(f.fecha)), hora:hora.format(new Date(f.fecha)),
      titulo:equipo(f.destino)+' ficha a '+f.nombre_jugador,
      ruta:equipo(f.origen)+' → '+equipo(f.destino)+' · '+importeNoticia(f.importe_centimos),
      etiqueta:Object.hasOwn(tipos,f.tipo)?tipos[f.tipo]:'Traspaso'};
  });
}
export function crearPanelNoticias(portada, historial, contexto) {
  if (!portada || !historial) return null;
  let vista=null, revision=0, ocupado=false, filas=[], mas=false, error=false;
  const nodo=(tag,clase,text)=>{const n=document.createElement(tag);if(clase)n.className=clase;if(text)n.textContent=text;return n;};
  const mismo=(a,b)=>Boolean(b.token)&&a.session===b.session&&a.division===b.division&&a.identity===b.identity;
  function pintar() {
    const root=vista==='home'?portada:historial;
    root.replaceChildren();
    if (!filas.length && !error) root.append(nodo('p','news-status',ocupado?'Cargando noticias…':'Todavía no hay fichajes confirmados.'));
    let grupo=null;
    for(const f of filas) {
      if(grupo!==f.dia){grupo=f.dia;root.append(nodo('h3','news-day',grupo));}
      const row=nodo('article','news-transfer');
      row.append(nodo('strong','',f.titulo),nodo('span','news-route',f.ruta),nodo('small','',f.hora+' · '+f.etiqueta));
      root.append(row);
    }
    if(error)root.append(nodo('p','news-status',filas.length?'No se han podido actualizar las noticias. Se muestran los últimos datos recibidos.':'No se han podido cargar las noticias.'));
    if(error || (vista==='news' && mas)) {
      const boton=nodo('button','news-more',ocupado?'Cargando…':error?'Reintentar':'Ver noticias anteriores');
      boton.type='button';boton.disabled=ocupado;
      boton.addEventListener('click',()=>void cargar(vista==='news'&&filas.length>0));
      root.append(boton);
    }
  }
  async function cargar(anexar=false) {
    if (!vista || ocupado) return;
    const ctx=contexto(), rev=revision, actual=vista;
    if (!ctx.client || !ctx.token || !ctx.division || !ctx.identity) return;
    const valido=()=>rev===revision&&actual===vista&&mismo(ctx,contexto());
    const limite=actual==='home'?5:50;
    const cursor=anexar?filas.at(-1):null;
    ocupado=true;pintar();
    try {
      const datos=await ctx.client.consultar('macroliga_historial_traspasos',{
        p_division_id:ctx.division,p_antes_fecha:cursor?.fecha??null,
        p_antes_id:cursor?.traspaso_id??null,p_limite:limite
      },ctx.token);
      if(!valido())return;
      const nuevas=prepararNoticias(datos);
      if(nuevas.length>limite)throw new Error('Página demasiado grande');
      const vistas=new Set(anexar?filas.map(f=>f.traspaso_id):[]);
      for(const f of nuevas){if(vistas.has(f.traspaso_id))throw new Error('Traspaso repetido');vistas.add(f.traspaso_id);}
      filas=anexar?[...filas,...nuevas]:nuevas;mas=nuevas.length===limite;error=false;
    } catch {if(valido())error=true;}
    finally {if(valido()){ocupado=false;pintar();}}
  }
  function clear(){
    revision++;vista=null;ocupado=false;filas=[];mas=false;error=false;
    portada.replaceChildren();historial.replaceChildren();
  }
  return {clear,show(nombre){clear();vista=nombre;return cargar();},
    refreshHome(){if(vista==='home')return cargar();}};
}
