#!/usr/bin/env node
/**
 * MACROLIGA PILOTO · EJECUTOR SIN CRON (no se lanza por sí solo).
 * Modo predeterminado: --dry-run (sin escrituras).
 * La ejecución requiere permiso explícito, divisiones en lista blanca
 * y credenciales PostgreSQL limitadas del piloto (nunca usuario postgres).
 */
import {ejecutarPasoMercado} from '../src/server/mercado-ejecutor.mjs';
import {conectarPiloto} from '../src/server/adaptador-postgres.mjs';

const HELP=[
  'MACROLIGA - ejecutor de mercado NO ACTIVADO',
  '  node scripts/ejecutar-mercado.mjs --dry-run',
  '  node scripts/ejecutar-mercado.mjs --execute',
  'Necesita DATABASE_URL (base directa macroliga-piloto) y',
  'MACROLIGA_DIVISION_IDS (UUID separados por comas).',
  'Para --execute, además:',
  '  MACROLIGA_TARGET_REF=xuwjbfnhvvbdargcohfe',
  '  MACROLIGA_MARKET_RUN_ENABLED=CONFIRMO_SOLO_MACROLIGA_PILOTO',
  'No almacenes claves en el repositorio ni en el frontend.',
  'No hay cron: solo funciona cuando alguien lo invoca.'
].join('\n')+'\n';

async function main() {
  const args=process.argv.slice(2);
  if (args.includes('--help')||args.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  if(args.some(x=>!['--dry-run','--execute'].includes(x)) ||
     (args.includes('--dry-run')&&args.includes('--execute')) ||
     args.filter(x=>x==='--execute').length>1) {
    throw new Error('Argumentos incorrectos; consulta --help');
  }
  const ejecutar=args.includes('--execute');
  const divisiones=(process.env.MACROLIGA_DIVISION_IDS||'')
    .split(',').map(x=>x.trim()).filter(Boolean);
  if(!divisiones.length) {
    throw new Error('No hay divisiones autorizadas en MACROLIGA_DIVISION_IDS');
  }
  if(ejecutar && (
    process.env.MACROLIGA_TARGET_REF!=='xuwjbfnhvvbdargcohfe' ||
    process.env.MACROLIGA_MARKET_RUN_ENABLED!=='CONFIRMO_SOLO_MACROLIGA_PILOTO'
  )) {
    throw new Error('Escritura bloqueada: autorización de ejecución no configurada');
  }
  const store=await conectarPiloto({
    cadenaConexion:process.env.DATABASE_URL,
    modoEscritura:ejecutar
  });
  try {
    const informe=await ejecutarPasoMercado({
      store,divisiones,soloLectura:!ejecutar
    });
    process.stdout.write(JSON.stringify(informe,null,2)+'\n');
    if(informe.errores)process.exitCode=1;
  } finally {
    await store.cerrarConexion();
  }
}
main().catch(error=>{
  // No imprimir URL ni variables secretas en los logs.
  process.stderr.write(JSON.stringify({
    tipo:'error_ejecutor',mensaje:String(error.message||error)
  })+'\n');
  process.exitCode=1;
});
