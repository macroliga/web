// MACROLIGA · El PIN nunca se escribe en localStorage ni en la base de datos
// como texto en claro. Se ofrece al gestor de contraseñas del navegador cuando
// el usuario lo autoriza y la API estándar es compatible (Chromium).
// Safari/Firefox pueden ofrecer el guardado por su gestión del formulario.
export async function solicitarGuardadoPin({
  navegador, PasswordCredentialCtor, correo, nombre, pin
}) {
  if (!/^demo(?:0[1-9]|1[0-6])@macroliga\.invalid$/.test(correo) ||
      typeof nombre !== 'string' || !/^\d{6}$/.test(pin)) return false;
  if (typeof PasswordCredentialCtor !== 'function' ||
      typeof navegador?.credentials?.store !== 'function') return false;
  try {
    const credencial = new PasswordCredentialCtor({
      id: correo, name: nombre, password: pin
    });
    // La interfaz de la plataforma decide si solicita confirmación al usuario.
    await navegador.credentials.store(credencial);
    return true;
  } catch {
    // No bloquear el acceso si el usuario rechaza el guardado o no hay soporte.
    return false;
  }
}
