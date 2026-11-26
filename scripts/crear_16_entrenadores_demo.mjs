// MACROLIGA · Alta administrativa de 16 cuentas ficticias, SOLO manual.
// Uso: node scripts/crear_16_entrenadores_demo.mjs [--apply]
// Por defecto: simulacion sin cambios; --apply exige credencial privada y confirmacion.
// NUNCA usar service_role en paginas web, ni compartirla por chat o GitHub.
// La credencial local se guarda con permisos 0600 fuera del control de versiones.

import { randomBytes } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cuentasDemostracion } from '../src/demo/entrenadores_historicos.mjs';

const PROJECT_REF = 'xuwjbfnhvvbdargcohfe';
const BASE = `https://${PROJECT_REF}.supabase.co`;
const LISTA = cuentasDemostracion();
const ARCHIVO_SECRETO = resolve('.macroliga-local/credenciales-16-entrenadores.json');
const aplicar = process.argv.includes('--apply');

function comprobarIdentidad() {
  if (LISTA.length !== 16 ||
      new Set(LISTA.map((cuenta) => cuenta.correo)).size !== 16 ||
      new Set(LISTA.map((cuenta) => cuenta.entrenador)).size !== 16) {
    throw new Error('Lista incorrecta o con cuentas duplicadas');
  }
  if (process.argv.some((opcion) => !['--apply', '--dry-run'].includes(opcion))) {
    throw new Error('Argumentos permitidos: --dry-run y --apply');
  }
}

function generarContrasena() {
  return randomBytes(27).toString('base64url'); // 36 caracteres aleatorios
}

function clienteAdministrativo(clave) {
  if (typeof clave !== 'string' || !/^eyJ[A-Za-z0-9_-]+\./.test(clave)) {
    throw new Error('Se requiere la clave JWT service_role de MACROLIGA en una variable privada');
  }

  async function solicitar(metodo, ruta, datos) {
    const cabeceras = {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    };
    const respuesta = await fetch(BASE + ruta, {
      method: metodo, headers: cabeceras,
      ...(datos === undefined ? {} : {body: JSON.stringify(datos)})
    });
    if (!respuesta.ok) {
      // Nunca incluir el cuerpo del error: podria contener datos de cuentas.
      throw new Error(`Error HTTP ${respuesta.status} en operacion ${metodo} ${ruta.split('?')[0]}`);
    }
    const cuerpo = await respuesta.text();
    return cuerpo ? JSON.parse(cuerpo) : null;
  }

  return {
    async vacia(tabla) {
      const filas = await solicitar('GET', `/rest/v1/${tabla}?select=id&limit=1`);
      return Array.isArray(filas) && filas.length === 0;
    },
    async authVacio() {
      const resultado = await solicitar('GET', '/auth/v1/admin/users?page=1&per_page=1');
      return Array.isArray(resultado?.users) && resultado.users.length === 0;
    },
    async insertar(tabla, datos) {
      const filas = await solicitar('POST', `/rest/v1/${tabla}`, datos);
      if (!Array.isArray(filas) || filas.length !== 1 || !filas[0]?.id) {
        throw new Error(`Insercion sin confirmacion de identificador: ${tabla}`);
      }
      return filas[0].id;
    },
    async crearUsuario(cuenta, contrasena) {
      const usuario = await solicitar('POST','/auth/v1/admin/users', {
        email: cuenta.correo,
        password: contrasena,
        email_confirm: true, // alias de prueba, no se enviara correo real
        user_metadata: {demo: true, entrenador_historico: cuenta.entrenador}
      });
      const id = usuario?.id || usuario?.user?.id;
      if (!id) throw new Error('Supabase Auth no devolvio un identificador de usuario');
      return id;
    },
    async borrarTabla(tabla, id) {
      const borradas = await solicitar('DELETE', `/rest/v1/${tabla}?id=eq.${encodeURIComponent(id)}`);
      if (!Array.isArray(borradas) || borradas.length !== 1 || borradas[0].id !== id) {
        throw new Error(`Rollback sin confirmacion para ${tabla}`);
      }
    },
    async borrarUsuario(id) {
      await solicitar('DELETE', `/auth/v1/admin/users/${encodeURIComponent(id)}`);
    }
  };
}

async function prepararArchivo(credenciales) {
  await mkdir(resolve('.macroliga-local'), {recursive: true, mode: 0o700});
  // wx: nunca machacar contrasenas previamente guardadas.
  const archivo = await open(ARCHIVO_SECRETO,'wx',0o600);
  try {
    await archivo.chmod(0o600);
    await archivo.writeFile(JSON.stringify({
      proyecto: PROJECT_REF,
      uso: 'Solo cuentas ficticias para probar MACROLIGA',
      creado: new Date().toISOString(),
      credenciales
    },null,2) + '\n', 'utf8');
  } finally {
    await archivo.close();
  }
}

async function eliminarSiSeguro() {
  try { await unlink(ARCHIVO_SECRETO); } catch (error) {
    if (error.code !== 'ENOENT') console.error('AVISO: revisa el archivo privado local.');
  }
}

async function ejecutar() {
  comprobarIdentidad();
  if (!aplicar) {
    console.log('SIMULACION: no se creara ningun usuario ni se escribira ningun archivo.');
    for (const c of LISTA) console.log(`${String(c.numero).padStart(2,'0')}. ${c.entrenador} | ${c.correo}`);
    console.log('Para crear cuentas: --apply y variables MACROLIGA_SERVICE_ROLE_KEY y MACROLIGA_CONFIRMAR_ALTA_16.');
    return;
  }

  if (process.env.MACROLIGA_CONFIRMAR_ALTA_16 !== 'SI_SOLO_MACROLIGA_PILOTO') {
    throw new Error('Falta la confirmacion administrativa explicita de alta de ensayo.');
  }
  const admin = clienteAdministrativo(process.env.MACROLIGA_SERVICE_ROLE_KEY);
  // Evita pisar un piloto real o reutilizar el servicio en otro proyecto.
  for (const tabla of ['competitions','seasons','divisions','managers','teams']) {
    if (!await admin.vacia(tabla)) {
      throw new Error(`La tabla ${tabla} no esta vacia; no es seguro inicializar`);
    }
  }
  if (!await admin.authVacio()) {
    throw new Error('Supabase Auth ya contiene cuentas. Alta automatica bloqueada por seguridad.');
  }

  const credenciales = LISTA.map((cuenta) => ({
    numero: cuenta.numero,
    entrenador: cuenta.entrenador,
    correo: cuenta.correo,
    contrasena_temporal: generarContrasena()
  }));
  await prepararArchivo(credenciales);
  // Lista de operaciones revertibles en orden de creacion. Solo IDs propios.
  const creados = [];
  let errorLimpieza = false;
  try {
    const competicion = await admin.insertar('competitions', {
      code: 'MACROLIGA_PILOTO_INVIERNO_2026', name: 'MACROLIGA · Piloto de invierno'
    });
    creados.push({tipo:'tabla',tabla:'competitions',id:competicion});
    const temporada = await admin.insertar('seasons', {
      competition_id: competicion, code: '2026_27',
      name: 'Liga piloto invierno 2026/27', status: 'draft',
      initial_wealth_cents: 7000000000
    });
    creados.push({tipo:'tabla',tabla:'seasons',id:temporada});
    const division = await admin.insertar('divisions', {
      season_id:temporada, code:'PILOTO', name:'División piloto',
      max_roster:16, max_debt_percent:25,
      points_eur_cents:1000000, timezone:'Europe/Madrid'
    });
    creados.push({tipo:'tabla',tabla:'divisions',id:division});

    for (const cuenta of LISTA) {
      const temp = credenciales[cuenta.numero-1];
      const usuario = await admin.crearUsuario(cuenta, temp.contrasena_temporal);
      creados.push({tipo:'auth',id:usuario});
      const manager = await admin.insertar('managers', {
        auth_user_id: usuario, display_name: cuenta.entrenador, is_admin:false
      });
      creados.push({tipo:'tabla',tabla:'managers',id:manager});
      const equipo = await admin.insertar('teams', {
        division_id: division, manager_id: manager,
        team_name: cuenta.equipo, balance_cents: 0, status:'active'
      });
      creados.push({tipo:'tabla',tabla:'teams',id:equipo});
      console.log(`Cuenta ficticia ${cuenta.numero}/16 creada y asociada a su equipo.`);
    }
    console.log('OK: 16 cuentas ficticias y equipos en MACROLIGA piloto.');
    console.log('Contraseñas generadas individualmente. Archivo privado local:', ARCHIVO_SECRETO);
    console.log('Presupuestos y futbolistas siguen pendientes del reparto inicial aprobado.');
  } catch (error) {
    console.error('Alta interrumpida:', error.message);
    // Revertir dependencias: equipos, managers, usuarios Auth, division, temporada, competicion.
    for (const op of creados.reverse()) {
      try {
        if (op.tipo === 'auth') await admin.borrarUsuario(op.id);
        else await admin.borrarTabla(op.tabla, op.id);
      } catch {
        errorLimpieza = true;
      }
    }
    if (!errorLimpieza) {
      await eliminarSiSeguro();
      console.error('Rollback de cuentas creadas en esta ejecucion completado.');
    } else {
      console.error('ATENCION: rollback incompleto. No reintentar sin auditoria manual.');
      console.error('Se conserva archivo local para la investigacion administrativa.');
    }
    throw new Error('No ha sido posible completar el alta de 16 cuentas.');
  }
}

await ejecutar().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
