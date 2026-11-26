// Cliente publico de SOLO autenticacion y RPC de lectura.
// Nunca se usa la clave service_role. La identidad se valida en Supabase.
const LECTURAS = new Set(['macroliga_mi_equipo', 'macroliga_plantilla_equipo']);

export function crearCliente({ supabaseUrl, anonKey, fetchImpl = fetch }) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(supabaseUrl || '')
      || !anonKey || typeof anonKey !== 'string') {
    throw new Error('Configuracion publica de Supabase incompleta');
  }
  const base = supabaseUrl.replace(/\/$/, '');

  async function solicitar(path, body, bearer) {
    const headers = {
      apikey: anonKey, 'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (bearer || anonKey)
    };
    const response = await fetchImpl(base + path, {
      method: 'POST', headers, body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 400
        ? 'No se pudo completar el acceso. Comprueba las credenciales.'
        : 'La consulta no se pudo completar (' + response.status + ').');
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
