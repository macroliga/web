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
const TABLAS_VACIAS = [
  "competitions", "seasons", "divisions", "managers", "teams",
  "wallet_entries", "roster_ownership"
];
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
  const auth = await consultar("/auth/v1/admin/users?page=1&per_page=1", "GET", undefined, key);
  if (!Array.isArray(auth?.users)) throw new Error("No se pudo verificar Auth");
  if (auth.users.length) throw new Error("Auth ya contiene usuarios: alta bloqueada");
  for (const table of TABLAS_VACIAS) {
    const rows = await consultar("/rest/v1/" + table + "?select=id&limit=1", "GET", undefined, key);
    if (!Array.isArray(rows)) throw new Error("No se pudo verificar " + table);
    if (rows.length) throw new Error("Tabla " + table + " no vacia: alta bloqueada");
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
function uno(rows, label) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.id) {
    throw new Error("Fallo al crear " + label);
  }
  return rows[0].id;
}
async function insertar(tabla, body, key) {
  return uno(await consultar("/rest/v1/" + tabla, "POST", body, key), tabla);
}
async function eliminar(op, key) {
  if (op.tipo === "auth") {
    await consultar("/auth/v1/admin/users/" + encodeURIComponent(op.id),
      "DELETE", undefined, key);
    return;
  }
  const response = await consultar("/rest/v1/" + op.tabla + "?id=eq." +
    encodeURIComponent(op.id), "DELETE", undefined, key);
  if (!Array.isArray(response) || response.length !== 1 || response[0].id !== op.id) {
    throw new Error("Rollback incompleto en " + op.tabla);
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
  const directo = await consultar("/rest/v1/teams?select=id&limit=1",
    "GET", undefined, keyPublica, {Authorization: "Bearer " + jwt});
  if (!Array.isArray(directo) || directo.length !== 0) {
    throw new Error("Se ha podido leer la tabla privada teams");
  }
  const pujas = await consultar("/rest/v1/bids?select=id&limit=1",
    "GET", undefined, keyPublica, {Authorization: "Bearer " + jwt});
  if (!Array.isArray(pujas) || pujas.length !== 0) {
    throw new Error("Se ha podido leer la tabla privada bids");
  }
  return equipo;
}
async function alta(key, keyPublica) {
  const creados = [];
  const pines = generarPines();
  let limpiezaPendiente = false;
  try {
    const competitionId = await insertar("competitions", {
      code: "MACROLIGA_PILOTO_INVIERNO_2026", name: "MACROLIGA · Piloto de invierno"
    }, key);
    creados.push({tipo: "tabla", tabla: "competitions", id: competitionId});

    const seasonId = await insertar("seasons", {
      competition_id: competitionId, code: "2026_27",
      name: "Liga piloto invierno 2026/27", status: "draft",
      initial_wealth_cents: 7000000000
    }, key);
    creados.push({tipo: "tabla", tabla: "seasons", id: seasonId});

    const divisionId = await insertar("divisions", {
      season_id: seasonId, code: "PILOTO", name: "División piloto",
      max_roster: 16, max_debt_percent: 25,
      points_eur_cents: 1000000, timezone: "Europe/Madrid"
    }, key);
    creados.push({tipo: "tabla", tabla: "divisions", id: divisionId});

    for (let i = 0; i < CUENTAS.length; i++) {
      const c = CUENTAS[i];
      const authUser = await consultar("/auth/v1/admin/users", "POST", {
        email: c.email, password: pines[i], email_confirm: true,
        user_metadata: {demo: true, entrenador_historico: c.nombre}
      }, key);
      const authId = authUser?.id || authUser?.user?.id;
      if (!authId) throw new Error("Auth no devolvio identificador de usuario");
      creados.push({tipo: "auth", id: authId});

      const managerId = await insertar("managers", {
        auth_user_id: authId, display_name: c.nombre, is_admin: false
      }, key);
      creados.push({tipo: "tabla", tabla: "managers", id: managerId});

      const teamId = await insertar("teams", {
        division_id: divisionId, manager_id: managerId,
        team_name: c.equipo, balance_cents: 0, status: "active"
      }, key);
      creados.push({tipo: "tabla", tabla: "teams", id: teamId});
    }

    // Verificar dos logins Auth reales y que cada JWT ve solamente su equipo.
    const a = await iniciarYConsultar(CUENTAS[0], pines[0], keyPublica);
    const b = await iniciarYConsultar(CUENTAS[1], pines[1], keyPublica);
    if (a.equipo_id === b.equipo_id || a.division_id !== b.division_id) {
      throw new Error("Fallo al separar identidades de prueba");
    }
    return {
      ok: true,
      creados: 16,
      comprobaciones: "Dos inicios de sesion reales y perfiles privados comprobados",
      aviso: "GUARDA AHORA LOS PIN EN UN LUGAR PRIVADO; ESTA RESPUESTA NO SE GUARDA EN LA FUNCION",
      credenciales: CUENTAS.map((c, i) => ({
        entrenador: c.nombre, usuario: c.email, pin: pines[i]
      }))
    };
  } catch (e) {
    for (const op of creados.reverse()) {
      try { await eliminar(op, key); } catch { limpiezaPendiente = true; }
    }
    // No incluir los PIN, JWT ni el secreto en errores o registros.
    return {
      ok: false,
      error: String(e?.message || "Fallo interno"),
      limpieza_completa: !limpiezaPendiente,
      instruccion: limpiezaPendiente
        ? "No volver a ejecutar. Revisar el estado en Supabase antes de limpiar."
        : "No se han conservado voluntariamente las cuentas creadas."
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
