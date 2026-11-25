/**
 * Adaptador PostgreSQL del ejecutor. Solo una conexión directa al proyecto
 * macroliga-piloto; nunca buscar credenciales en GitHub ni en la PWA.
 * Se importa pg únicamente al iniciar explícitamente el CLI del servidor.
 */
const HOST_PILOTO='db.xuwjbfnhvvbdargcohfe.supabase.co';

export async function conectarPiloto({cadenaConexion,modoEscritura=false}={}) {
  if (!cadenaConexion || typeof cadenaConexion!=='string') {
    throw new Error('DATABASE_URL de MACROLIGA no configurada');
  }
  let uri;
  try { uri=new URL(cadenaConexion); } catch {
    throw new Error('DATABASE_URL no tiene un formato válido');
  }
  if (uri.protocol!=='postgresql:' && uri.protocol!=='postgres:') {
    throw new Error('La conexión debe usar PostgreSQL');
  }
  if (uri.hostname.toLowerCase()!==HOST_PILOTO || uri.pathname!=='/postgres') {
    throw new Error('Destino rechazado: solo se admite la base directa de macroliga-piloto');
  }
  // Una opción de conexión como ?sslmode=disable puede sustituir las
  // opciones TLS del cliente pg. Exigir URL limpia y puerto PostgreSQL.
  if (uri.search || uri.hash || (uri.port && uri.port!=='5432')) {
    throw new Error('Parámetros, fragmentos o puerto no autorizados en DATABASE_URL');
  }
  const usuario=decodeURIComponent(uri.username);
  if (usuario!=='macroliga_runner') {
    throw new Error('Solo se admite macroliga_runner, también para simulaciones de lectura; nunca postgres administrador');
  }
  if (!uri.password) throw new Error('Falta la contraseña en el gestor privado de secretos');

  let Pool;
  try { ({Pool}=await import('pg')); } catch {
    throw new Error('Falta la dependencia pg en el servidor (npm install)');
  }
  const pool=new Pool({
    connectionString:cadenaConexion,
    ssl:{rejectUnauthorized:true},
    max:1,
    connectionTimeoutMillis:8000,
    idleTimeoutMillis:5000,
    statement_timeout:30000,
  });
  const consultar=async(sql,params=[])=>{
    const r=await pool.query(sql,params);
    return r.rows;
  };
  return crearAdaptadorConsultas(consultar,()=>pool.end());
}

/** Construye un adaptador desde un transporte SQL. Permite probar el flujo
 * completo en Node.js con consultas ficticias sin tocar PostgreSQL real. */
export function crearAdaptadorConsultas(consultar,cerrarConexion=async()=>{}) {
  if (typeof consultar!=='function') throw new TypeError('Transporte SQL requerido');
  return {
    async horaServidor() {
      const r=await consultar('select app_private.runner_hora_servidor() as hora');
      return r[0].hora;
    },
    async division(id) {
      const r=await consultar(
        "select * from app_private.runner_division($1::uuid)",
        [id]
      );
      return r[0]??null;
    },
    async ciclos(id) {
      return consultar(
        'select * from app_private.runner_ciclos($1::uuid)',
        [id]
      );
    },
    async cerrar(id) {
      const r=await consultar('select app_private.runner_cerrar($1::uuid) as total',[id]);
      return r[0].total;
    },
    async publicar(id) {
      const r=await consultar('select app_private.runner_publicar($1::uuid) as total',[id]);
      return r[0].total;
    },
    async preparar(id,dia) {
      const r=await consultar('select * from app_private.runner_preparar($1::uuid,$2::date)',[id,dia]);
      if (r.length!==1) throw new Error('La preparación no devolvió un ciclo único');
      return r[0];
    },
    async abrir(id) {
      const r=await consultar('select app_private.runner_abrir($1::uuid) as total',[id]);
      return r[0].total;
    },
    async cerrarConexion() { await cerrarConexion(); },
  };
}
