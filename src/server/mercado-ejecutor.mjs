/** MACROLIGA: planificador de mercado, sin trabajos ni secretos incorporados.
 * El tiempo se consulta en PostgreSQL y cada modificación se realiza mediante
 * las funciones transaccionales privadas de macroliga-piloto.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS = new Set(['draft','open','closed','calculated','published','failed']);

function comprobarFecha(v, campo) {
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) throw new Error('Fecha inválida: ' + campo);
  return t;
}

function relojMadrid(instante) {
  const d = new Date(comprobarFecha(instante,'reloj'));
  const fmt = new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map(x=>[x.type,x.value]));
  return {dia:`${p.year}-${p.month}-${p.day}`,minutos:Number(p.hour)*60+Number(p.minute)};
}

function diaAnterior(dia) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error('Día local incorrecto');
  const dt = new Date(dia+'T12:00:00Z');
  if (!Number.isFinite(dt.getTime())) throw new Error('Día local incorrecto');
  dt.setUTCDate(dt.getUTCDate()-1);
  return dt.toISOString().slice(0,10);
}

function normalizarCiclo(c) {
  if (!c || !UUID.test(c.id) || !ESTADOS.has(c.status)) throw new Error('Ciclo o estado inesperado');
  const abre=comprobarFecha(c.opens_at,'opens_at');
  const cierra=comprobarFecha(c.closes_at,'closes_at');
  const publica=comprobarFecha(c.publishes_at,'publishes_at');
  if (!(abre<cierra && cierra<publica)) throw new Error('Ventana de ciclo incoherente: '+c.id);
  return {...c,abre,cierra,publica};
}

/** Fase única y reintentable. Por defecto NO escribe. Los fallos de una
 * división se registran y no bloquean las otras. Nunca salta días perdidos.
 * Contrato del adaptador: horaServidor(), division(uuid), ciclos(uuid),
 * cerrar(uuid), publicar(uuid), preparar(uuid,YYYY-MM-DD), abrir(uuid).
 */
async function ejecutarPasoMercado({store,divisiones,soloLectura=true}={}) {
  if (!store || !Array.isArray(divisiones) || divisiones.length===0 ||
      !divisiones.every(id=>typeof id==='string' && UUID.test(id)) ||
      new Set(divisiones).size!==divisiones.length) {
    throw new Error('Debes indicar una lista explícita de divisiones UUID válidas');
  }
  const ahora=comprobarFecha(await store.horaServidor(),'hora del servidor PostgreSQL');
  const local=relojMadrid(ahora);
  const resultados=[];
  for (const divisionId of divisiones) {
    const pasos=[];
    try {
      const d=await store.division(divisionId);
      if (!d || d.id!==divisionId) throw new Error('División no encontrada o no autorizada');
      if (d.season_status!=='active') throw new Error('Solo se ejecutan temporadas activas');
      if (d.timezone!=='Europe/Madrid') throw new Error('Zona horaria no autorizada');
      const ciclos=(await store.ciclos(divisionId)).map(normalizarCiclo)
        .sort((a,b)=>a.abre-b.abre);
      const actuar=async(accion,ref,fn)=>{
        pasos.push({accion,ref,resultado:soloLectura?'simulación':'solicitado'});
        if (!soloLectura) await fn();
      };
      for (const c of ciclos) {
        if (c.status==='failed') throw new Error('Ciclo marcado failed: '+c.id);
        if (c.status==='draft' && ahora>=c.cierra) {
          throw new Error('Ciclo draft caducado: requiere intervención manual '+c.id);
        }
        if ((c.status==='open'||c.status==='closed') && ahora>=c.cierra) {
          await actuar('cerrar',c.id,()=>store.cerrar(c.id));
          c.status='calculated';
        }
        if (c.status==='calculated' && ahora>=c.publica) {
          await actuar('publicar',c.id,()=>store.publicar(c.id));
          c.status='published';
        }
      }
      const hoy=ciclos.filter(c=>relojMadrid(c.abre).dia===local.dia);
      if (hoy.length>1) throw new Error('Hay varios ciclos que abren el mismo día');
      if (hoy.length) {
        const c=hoy[0];
        if (relojMadrid(c.abre).minutos!==360) {
          throw new Error('El ciclo de hoy no comienza a las 06:00');
        }
        if (c.status==='draft' && ahora>=c.abre && ahora<c.cierra) {
          await actuar('abrir',c.id,()=>store.abrir(c.id));
        }
      } else if(local.minutos>=360) {
        const anteriores=ciclos.filter(c=>c.abre<ahora);
        const ultimo=anteriores.at(-1);
        if(ultimo && (ultimo.status!=='published' ||
            relojMadrid(ultimo.abre).dia!==diaAnterior(local.dia))) {
          throw new Error('Mercado anterior pendiente o días saltados: revisión manual');
        }
        if (soloLectura) {
          pasos.push({accion:'preparar',ref:local.dia,resultado:'simulación'});
          pasos.push({accion:'abrir',ref:'ciclo nuevo',resultado:'simulación'});
        } else {
          let nuevo;
          await actuar('preparar',local.dia,async()=>{
            nuevo=await store.preparar(divisionId,local.dia);
            if(!nuevo || !UUID.test(nuevo.ciclo_id) ||
                !Number.isInteger(nuevo.arrastrados) ||
                !Number.isInteger(nuevo.nuevos) ||
                nuevo.arrastrados<0 || nuevo.nuevos<0 ||
                nuevo.arrastrados+nuevo.nuevos>15) {
              throw new Error('Respuesta de preparación inválida; NO abrir');
            }
          });
          await actuar('abrir',nuevo.ciclo_id,()=>store.abrir(nuevo.ciclo_id));
        }
      }
      resultados.push({divisionId,correcto:true,pasos});
    } catch (error) {
      resultados.push({divisionId,correcto:false,error:String(error?.message||error),pasos});
    }
  }
  return {soloLectura,instanteServidor:new Date(ahora).toISOString(),
    resultado:resultados,errores:resultados.filter(r=>!r.correcto).length};
}

export {relojMadrid,diaAnterior,ejecutarPasoMercado};
