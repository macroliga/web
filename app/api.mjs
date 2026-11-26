// Cliente publico de SOLO autenticacion y RPC de lectura.
// Nunca se usa la clave service_role. La identidad se valida en Supabase.
const LECTURAS = new Set(['macroliga_mi_equipo', 'macroliga_plantilla_equipo']);

function extraerSesion(data) {
  if (!data?.access_token || !data?.refresh_token) {
    throw new Error('Supabase no ha devuelto una sesión renovable.');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600
  };
}

export function crearCliente({ supabaseUrl, anonKey, fetchImpl = fetch }) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(supabaseUrl || '')
      || !anonKey || typeof anonKey !== 'string' || anonKey.startsWith('sb_secret_')) {
    throw new Error('Configuracion publica de Supabase incompleta');
  }
  const base = supabaseUrl.replace(/\/$/, '');

  async function solicitar(path, body, bearer) {
    const headers = {
      apikey: anonKey, 'Content-Type': 'application/json'
    };
    // Las claves sb_publishable_ son publicas, pero NO son JWT de usuario.
    // Auth se autentica con apikey; las RPC llevan solo el JWT personal.
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    const response = await fetchImpl(base + path, {
      method: 'POST', headers, body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 400
        ? 'No se pudo completar el acceso. Comprueba las credenciales.'
        : 'La consulta no se pudo completar (' + response.status + ').');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  return {
    async iniciarSesion(correo, contrasena) {
      const data = await solicitar('/auth/v1/token?grant_type=password',
        { email: correo, password: contrasena }, null);
      if (!data?.access_token) throw new Error('Acceso sin sesion valida');
      return data.access_token;
    },
    async iniciarSesionConSesion(correo, pin) {
      // Supabase Auth devuelve un token de acceso y otro de renovación.
      // El PIN no se guarda en el navegador.
      const data = await solicitar('/auth/v1/token?grant_type=password',
        { email: correo, password: pin }, null);
      return extraerSesion(data);
    },
    async renovarSesion(refreshToken) {
      if (typeof refreshToken !== 'string' || refreshToken.length < 1) {
        throw new Error('No hay sesión para recuperar.');
      }
      const data = await solicitar('/auth/v1/token?grant_type=refresh_token',
        { refresh_token: refreshToken }, null);
      return extraerSesion(data);
    },
    async consultar(nombre, parametros, token) {
      if (!LECTURAS.has(nombre)) throw new Error('Operacion no permitida por el cliente');
      if (!token) throw new Error('Debes iniciar sesion');
      return solicitar('/rest/v1/rpc/' + nombre, parametros || {}, token);
    },
    async cerrarSesion(token) {
      if (!token) return;
      try { await solicitar('/auth/v1/logout', {}, token); } catch { /* se borra sesion local */ }
    }
  };
}
