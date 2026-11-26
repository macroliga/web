// MACROLIGA PILOTO: alta administrativa temporal de 16 entrenadores historicos.
// No contiene PIN, secretos ni credenciales. No puede crear nada sin un secreto
// MACROLIGA_SETUP_TOKEN configurado PRIVADAMENTE en Edge Functions > Secrets.
// No reutilizar con Comunio Laviana.
const REF = "xuwjbfnhvvbdargcohfe";
const URL = "https://" + REF + ".supabase.co";
const HEADER = "x-macroliga-setup-token";
const NOMBRES = [
  "Luis Aragonés", "Vicente del Bosque", "Miguel Muñoz", "Javier Irureta",
  "Johan Cruyff", "Helenio Herrera", "Radomir Antić", "Alfredo Di Stéfano",
  "Alex Ferguson", "Arsène Wenger", "Jupp Heynckes", "Ottmar Hitzfeld",
  "Arrigo Sacchi", "Fabio Capello", "Marcello Lippi", "Carlos Bilardo"
];
const CUENTAS = NOMBRES.map((nombre, indice) => ({
  nombre,
  email: "demo" + String(indice + 1).padStart(2, "0") + "@macroliga.invalid",
  equipo: "Equipo de " + nombre
}));
const ORIGENES = new Set(["https://supabase.com", "https://app.supabase.com"]);

function cabeceras(origin) {
  const result = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, " + HEADER,
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
  if (ORIGENES.has(origin)) result["Access-Control-Allow-Origin"] = origin;
  return result;
}
function responder(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: cabeceras(origin)
  });
}
async function seguroIgual(provisto, esperado) {
  // Comparamos los hashes completos sin salida anticipada del bucle.
  if (!esperado || esperado.length < 32 || !provisto || provisto.length > 512) return false;
  const encoder = new TextEncoder();
  const hashA = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(provisto)));
  const hashB = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(esperado)));
  let diferencia = 0;
  for (let i = 0; i < hashA.length; i++) diferencia |= hashA[i] ^ hashB[i];
  return diferencia === 0;
}
function credencialesServidor() {
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!key) {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    key = keys.default || "";
  }
  const pub = Deno.env.get("SUPABASE_ANON_KEY") ||
    JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default || "";
  if (!key || !pub) throw new Error("Claves internas de Supabase no disponibles");
  return { key, pub };
}
function claveCabeceras(key) {
  const headers = {
    "apikey": key, "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept": "application/json"
  };
  if (key.startsWith("eyJ")) headers["Authorization"] = "Bearer " + key;
  return headers;
}
async function consultar(path, method, body, key, extraHeaders) {
  const headers = { ...claveCabeceras(key), ...(extraHeaders || {}) };
  const response = await fetch(URL + path, {
    method,
    headers,
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    signal: AbortSignal.timeout(18000)
  });
  if (!response.ok) throw new Error("Servicio Supabase: HTTP " + response.status +
    " en " + method + " " + path.split("?")[0]);
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}
async function vacioAntesDeCrear(key) {
  // Una RPC SECURITY DEFINER acotada al servicio comprueba todas las tablas
  // y Auth sin conceder SELECT directo a service_role.
  const estado = await consultar(
    "/rest/v1/rpc/macroliga_piloto_estado_alta", "POST", {}, key);
  if (!estado || estado.libre !== true) {
    throw new Error("MACROLIGA ya contiene usuarios o datos de juego: alta bloqueada");
  }
}
function generarPines() {
  const seen = new Set();
  const result = [];
  const limite = Math.floor(4294967296 / 1000000) * 1000000;
  while (result.length < 16) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0];
    if (n >= limite) continue;
    const pin = String(n % 1000000).padStart(6, "0");
    if (seen.has(pin)) continue;
    seen.add(pin);
    result.push(pin);
  }
  return result;
}
async function rechazarLecturaDirecta(ruta, keyPublica, jwt) {
  const response = await fetch(URL + ruta, {
    method: "GET",
    headers: {
      "apikey": keyPublica,
      "Authorization": "Bearer " + jwt,
      "Accept": "application/json"
    },
    signal: AbortSignal.timeout(18000)
  });
  // Un 403 es correcto: las tablas privadas NO conceden SELECT a managers.
  if (response.status === 403 || response.status === 404) return;
  if (!response.ok) {
    throw new Error("Fallo al comprobar privacidad: HTTP " + response.status);
  }
  const filas = await response.json();
  if (!Array.isArray(filas) || filas.length > 0) {
    throw new Error("La tabla privada ha quedado expuesta");
  }
}
async function iniciarYConsultar(cuenta, pin, keyPublica) {
  const session = await consultar("/auth/v1/token?grant_type=password",
    "POST", {email: cuenta.email, password: pin}, keyPublica);
  if (!session?.access_token) throw new Error("No hay JWT en inicio de sesion");
  const jwt = session.access_token;
  const perfil = await consultar("/rest/v1/rpc/macroliga_mi_equipo",
    "POST", {}, keyPublica, {Authorization: "Bearer " + jwt});
  if (!Array.isArray(perfil) || perfil.length !== 1) {
    throw new Error("La RPC no devuelve exactamente un equipo del manager");
  }
  const equipo = perfil[0];
  if (equipo.nombre_equipo !== cuenta.equipo || !equipo.equipo_id) {
    throw new Error("La identidad Auth no corresponde con su equipo");
  }
  await rechazarLecturaDirecta("/rest/v1/teams?select=id&limit=1", keyPublica, jwt);
  await rechazarLecturaDirecta("/rest/v1/bids?select=id&limit=1", keyPublica, jwt);
  await rechazarLecturaDirecta("/rest/v1/wallet_entries?select=id&limit=1", keyPublica, jwt);
  return equipo;
}
async function alta(key, keyPublica) {
  const pines = generarPines();
  const idsAuth = [];
  let divisionId = null;
  let limpiezaPendiente = false;
  let solicitudSinConfirmar = false;
  try {
    solicitudSinConfirmar = true;
    const preparado = await consultar(
      "/rest/v1/rpc/macroliga_piloto_preparar_alta", "POST", {}, key);
    solicitudSinConfirmar = false;
    if (!preparado?.division_id) throw new Error("No se obtuvo identificador de la division");
    divisionId = preparado.division_id;

    for (let i = 0; i < CUENTAS.length; i++) {
      const c = CUENTAS[i];
      solicitudSinConfirmar = true;
      const authUser = await consultar("/auth/v1/admin/users", "POST", {
        email: c.email, password: pines[i], email_confirm: true,
        user_metadata: {demo: true, entrenador_historico: c.nombre}
      }, key);
      solicitudSinConfirmar = false;
      const authId = authUser?.id || authUser?.user?.id;
      if (!authId) throw new Error("Auth no devolvio identificador");
      idsAuth.push(authId);
      const vinculo = await consultar(
        "/rest/v1/rpc/macroliga_piloto_vincular_entrenador", "POST",
        {p_division_id: divisionId, p_auth_id: authId, p_numero: i + 1}, key);
      if (!vinculo?.team_id) throw new Error("No se ha vinculado el equipo ficticio");
    }

    // Dos logins reales verifican independencia de perfiles y credenciales.
    const a = await iniciarYConsultar(CUENTAS[0], pines[0], keyPublica);
    const b = await iniciarYConsultar(CUENTAS[1], pines[1], keyPublica);
    if (a.equipo_id === b.equipo_id || a.division_id !== b.division_id) {
      throw new Error("Fallo al separar identidades");
    }
    return {
      ok: true, creados: 16,
      comprobaciones: "Dos accesos reales y privacidad verificados",
      aviso: "GUARDA LOS 16 PIN EN PRIVADO; NO ENVIES UNA CAPTURA NI CIERRES LA RESPUESTA ANTES DE GUARDARLOS",
      credenciales: CUENTAS.map((c, i) => ({
        entrenador: c.nombre, usuario: c.email, pin: pines[i]
      }))
    };
  } catch (e) {
    if (solicitudSinConfirmar) limpiezaPendiente = true;
    // La eliminacion de equipos/managers se hace en una unica transaccion.
    // El servidor Auth se limpia DESPUES, al quitar las referencias FK.
    if (divisionId) {
      try {
        await consultar("/rest/v1/rpc/macroliga_piloto_revertir_alta",
          "POST", {p_division_id: divisionId}, key);
      } catch {
        limpiezaPendiente = true;
      }
    }
    for (const id of idsAuth.reverse()) {
      try {
        await consultar("/auth/v1/admin/users/" + encodeURIComponent(id),
          "DELETE", undefined, key);
      } catch {
        limpiezaPendiente = true;
      }
    }
    return {
      ok: false,
      error: String(e?.message || "Fallo interno"),
      limpieza_completa: !limpiezaPendiente,
      instruccion: limpiezaPendiente
        ? "NO REINTENTAR. Revisar y corregir primero el estado de Supabase."
        : "Las operaciones creadas se han revertido. No se han devuelto PIN."
    };
  }
}
Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, {
    status: 204, headers: cabeceras(origin)
  });
  if (req.method !== "POST") return responder({ok: false, error: "Solo POST"}, 405, origin);
  const setupToken = Deno.env.get("MACROLIGA_SETUP_TOKEN") || "";
  if (!setupToken || setupToken.length < 32) {
    return responder({ok: false, error: "Falta configurar MACROLIGA_SETUP_TOKEN en Secrets"}, 503, origin);
  }
  if (!await seguroIgual(req.headers.get(HEADER) || "", setupToken)) {
    return responder({ok: false, error: "No autorizado"}, 401, origin);
  }
  if ((Number(req.headers.get("content-length")) || 0) > 2048) {
    return responder({ok: false, error: "Solicitud demasiado larga"}, 413, origin);
  }
  try {
    if (Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") !== URL) {
      return responder({ok: false, error: "Proyecto incorrecto: bloqueado"}, 503, origin);
    }
    const json = await req.json();
    const {key, pub} = credencialesServidor();
    if (json?.action === "preview") {
      await vacioAntesDeCrear(key);
      return responder({
        ok: true,
        estado: "Preparado: no se ha modificado ningun dato",
        numero: CUENTAS.length,
        nombres: NOMBRES
      }, 200, origin);
    }
    if (json?.action !== "create" || json?.confirm !== "CREAR_16_MACROLIGA_PILOTO") {
      return responder({ok: false, error: "Accion o confirmacion incorrecta"}, 400, origin);
    }
    await vacioAntesDeCrear(key);
    const result = await alta(key, pub);
    return responder(result, result.ok ? 200 : 500, origin);
  } catch (e) {
    return responder({ok: false, error: String(e?.message || "Error inesperado"),
      consejo: "Revisar el estado de MACROLIGA antes de volver a ejecutar"}, 409, origin);
  }
});
