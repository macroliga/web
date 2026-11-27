// Lectura de fichajes confirmados: nunca escribe en el mercado.
const dia = new Intl.DateTimeFormat('es-ES', {timeZone:'Europe/Madrid', dateStyle:'full'});
const hora = new Intl.DateTimeFormat('es-ES', {timeZone:'Europe/Madrid', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const fechaMadrid = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'});
const DIA_MS = 86400000;
const ID_MINIMO = '00000000-0000-0000-0000-000000000000';
export function claveDiaMadrid(fecha) {
  const p=Object.fromEntries(fechaMadrid.formatToParts(new Date(fecha)).map(x=>[x.type,x.value]));
  return p.year.padStart(4,'0')+'-'+p.month+'-'+p.day;
}
export function fechaValida(fecha) {
  if(typeof fecha!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||fecha.startsWith('0000-'))return false;
  const ms=Date.parse(fecha+'T00:00:00Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===fecha;
}
export function desplazarDia(fecha,dias) {
  if(!fechaValida(fecha))throw new Error('Fecha inválida');
  return new Date(Date.parse(fecha+'T00:00:00Z')+dias*DIA_MS).toISOString().slice(0,10);
}
// Primer instante del siguiente día civil de Madrid; incluye días de 23 y 25 horas.
export function cursorDia(fecha) {
  const siguiente=desplazarDia(fecha,1);
  const centro=Date.parse(siguiente+'T00:00:00Z');
  let a=centro-DIA_MS,b=centro+DIA_MS;
  while(a<b){const m=Math.floor((a+b)/2);if(claveDiaMadrid(m)<siguiente)a=m+1;else b=m;}
  return {fecha:new Date(a).toISOString(),traspaso_id:ID_MINIMO};
}
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
    return {...f, claveDia:claveDiaMadrid(f.fecha), dia:dia.format(new Date(f.fecha)), hora:hora.format(new Date(f.fecha)),
      titulo:equipo(f.destino)+' ficha a '+f.nombre_jugador,
      ruta:equipo(f.origen)+' → '+equipo(f.destino)+' · '+importeNoticia(f.importe_centimos),
      etiqueta:Object.hasOwn(tipos,f.tipo)?tipos[f.tipo]:'Traspaso'};
  });
}
export function crearPanelNoticias(portada, historial, contexto, filtros=null, reloj=()=>new Date()) {
  if (!portada || !historial) return null;
  let vista=null, revision=0, ocupado=false, filas=[], mas=false, error=false, filtro='todas', fechaElegida=null;
  const botones=filtros?Array.from(filtros.querySelectorAll('[data-news-filter]')):[];
  const selector=filtros?.querySelector('#news-date');
  function pintarFiltros(){
    if(selector){selector.max=claveDiaMadrid(reloj());selector.value=fechaElegida||'';}
    for(const b of botones)b.setAttribute('aria-pressed',String(b.dataset.newsFilter===filtro));
  }
  function buscar(modo,fecha=null){
    if(vista!=='news')return;
    const hoy=claveDiaMadrid(reloj());
    if(modo==='hoy')fecha=hoy;
    else if(modo==='ayer')fecha=desplazarDia(hoy,-1);
    else if(modo==='todas')fecha=null;
    else if(modo!=='fecha'||!fechaValida(fecha)||fecha>hoy){pintarFiltros();return;}
    revision++;ocupado=false;filas=[];mas=false;error=false;
    filtro=modo;fechaElegida=fecha;pintarFiltros();
    return cargar();
  }
  for(const b of botones)b.addEventListener('click',()=>void buscar(b.dataset.newsFilter));
  selector?.addEventListener('change',()=>void buscar('fecha',selector.value));
  const nodo=(tag,clase,text)=>{const n=document.createElement(tag);if(clase)n.className=clase;if(text)n.textContent=text;return n;};
  const mismo=(a,b)=>Boolean(b.token)&&a.session===b.session&&a.division===b.division&&a.identity===b.identity;
  function pintar() {
    const root=vista==='home'?portada:historial;
    root.replaceChildren();
    if (!filas.length && !error) root.append(nodo('p','news-status',ocupado?'Cargando noticias…':fechaElegida?'No hay fichajes confirmados en esta fecha.':'Todavía no hay fichajes confirmados.'));
    let grupo=null;
    for(const f of filas) {
      if(grupo!==f.dia){grupo=f.dia;root.append(nodo('h3','news-day',grupo));}
      const row=nodo('article','news-transfer');
      row.append(nodo('strong','',f.titulo),nodo('span','news-route',f.ruta),nodo('small','',f.hora+' · '+f.etiqueta));
      root.append(row);
    }
    if(error)root.append(nodo('p','news-status',filas.length?'No se han podido actualizar las noticias. Se muestran los últimos datos recibidos.':'No se han podido cargar las noticias.'));
    if(error || (vista==='news' && mas)) {
      const boton=nodo('button','news-more',ocupado?'Cargando…':error?'Reintentar':fechaElegida?'Ver más fichajes de este día':'Ver noticias anteriores');
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
    const cursor=anexar?filas.at(-1):(actual==='news'&&fechaElegida?cursorDia(fechaElegida):null);
    ocupado=true;pintar();
    try {
      const datos=await ctx.client.consultar('macroliga_historial_traspasos',{
        p_division_id:ctx.division,p_antes_fecha:cursor?.fecha??null,
        p_antes_id:cursor?.traspaso_id??null,p_limite:limite
      },ctx.token);
      if(!valido())return;
      const pagina=prepararNoticias(datos);
      if(pagina.length>limite)throw new Error('Página demasiado grande');
      // La RPC devuelve orden descendente: los resultados de días anteriores
      // marcan el final del día seleccionado, no se muestran ni se paginan.
      if(fechaElegida&&pagina.some(f=>f.claveDia>fechaElegida))throw new Error('Fecha fuera del cursor');
      const nuevas=fechaElegida?pagina.filter(f=>f.claveDia===fechaElegida):pagina;
      const vistas=new Set(anexar?filas.map(f=>f.traspaso_id):[]);
      for(const f of nuevas){if(vistas.has(f.traspaso_id))throw new Error('Traspaso repetido');vistas.add(f.traspaso_id);}
      filas=anexar?[...filas,...nuevas]:nuevas;mas=nuevas.length===limite;error=false;
    } catch {if(valido())error=true;}
    finally {if(valido()){ocupado=false;pintar();}}
  }
  function clear(){
    revision++;vista=null;ocupado=false;filas=[];mas=false;error=false;filtro='todas';fechaElegida=null;
    portada.replaceChildren();historial.replaceChildren();
  }
  return {clear,buscar,show(nombre){clear();vista=nombre;return nombre==='news'?buscar('hoy'):cargar();},
    refreshHome(){if(vista==='home')return cargar();}};
}
