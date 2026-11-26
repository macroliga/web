# MACROLIGA · Entrenador recordado, sesión persistente y salida discreta

Fecha: 26/11/2026. Único destino: repositorio `macroliga/web`. No se modifica Comunio Laviana ni el esquema de Supabase.

## Comportamiento
- La primera vez, el usuario elige un entrenador y escribe su PIN de 6 cifras.
- Al iniciar sesión, la PWA recuerda el alias de ese entrenador y **solo el refresh token** que emite Supabase Auth en el almacenamiento local de ese navegador. **Nunca se guarda el PIN por nuestro código**.
- Al reabrir el sitio/PWA en el mismo navegador o instalación, la aplicación renueva la sesión usando `/auth/v1/token?grant_type=refresh_token`, comprueba el equipo propio por las RPC existentes y muestra directamente el Inicio, sin formulario.
- Los datos privados permanecen ocultos hasta que Supabase confirme la renovación y el equipo. Si el token deja de ser válido, reaparece el formulario con el entrenador ya seleccionado; entonces sí hace falta introducir de nuevo el PIN.
- El botón discreto **Salir**, fijo a la derecha justo encima de la barra de navegación inferior, elimina inmediatamente el refresh token del almacenamiento de ese dispositivo. Conserva el nombre seleccionado para facilitar volver a entrar o cambiar de entrenador.
- En la reanudación de la PWA, cuando el access token esté cerca de caducar, se intenta renovar. Almacenamiento local bloqueado: el acceso funciona pero no se conserva entre aperturas.

## Seguridad
- No se almacenan PIN, contraseñas de Supabase ni claves de servicio en el código público.
- El refresh token **sí es una credencial sensible**: permanece en el dispositivo y se borra al salir. Esta persistencia es normal para una sesión recordada, pero **en un móvil u ordenador compartido se debe pulsar «Salir»**.
- En `app/index.html` se ha establecido una política CSP que permite código estático del propio origen y conexiones al proyecto Supabase de MACROLIGA.
- Las RPC privadas siguen requiriendo un JWT real de un manager; recordar el nombre por sí solo no concede acceso.
- La caché PWA solo sirve módulos y recursos estáticos, nunca peticiones de Auth, RPC o claves.
- No se restauran automáticamente sesiones entre **dispositivos distintos** ni, según el sistema operativo, necesariamente entre una pestaña del navegador y una PWA instalada que tengan almacenamientos separados.

## Archivos
- `app/session.mjs`: funciones de memoria con comprobaciones del alias, lectura/escritura y limpieza.
- `app/api.mjs`: `iniciarSesionConSesion` y `renovarSesion`, con respuesta de Supabase y tratamiento del 401.
- `app/app.js`: recuperación automática y cierre de sesión; `app/index.html` / `app/styles.css`: botón mini.
- `app/sw.js`: versión `macroliga-pwa-estatica-v6`.
- Tests: `tests/pwa_sesion.test.mjs`, `tests/pwa_cliente.test.mjs`, `tests/pwa_portada_mobile.test.mjs`.

## Validación
Se han superado las pruebas de código de GitHub Actions de esta entrega. **Falta la comprobación manual en un móvil real**: abrir, entrar una vez, cerrar completamente la PWA, abrirla de nuevo (sin pedir PIN), pulsar Salir (se borra sesión) y entrar con otro entrenador. Ninguna de estas operaciones altera presupuestos, plantillas ni mercado.
