# MACROLIGA · Alta temporal de los 16 entrenadores desde Supabase (26/11/2026)

## Estado real

La Edge Function `macroliga-alta-piloto` está **desplegada y activa** únicamente en el proyecto Supabase `macroliga-piloto` (`xuwjbfnhvvbdargcohfe`). El código fuente está en `supabase/functions/macroliga-alta-piloto/index.ts`. **La función NO ha creado cuentas**: después del despliegue, `auth.users`, `managers`, `teams` y `competitions` siguen vacías.

No se ha tocado Comunio Laviana.

## Protección de la función

- La función usa `verify_jwt=false` porque el administrador del proyecto todavía no dispone de una sesión de manager dentro del piloto. **Esto no equivale a acceso abierto**: todas las operaciones POST están protegidas por un token de configuración de 32 caracteres como mínimo guardado en `Edge Functions > Secrets`, con nombre `MACROLIGA_SETUP_TOKEN`.
- El cliente debe enviarlo en la cabecera `x-macroliga-setup-token`. Sin secreto configurado, devuelve HTTP 503; con secreto incorrecto, HTTP 401. La comparación del token se hace sobre hashes completos.
- El programa utiliza exclusivamente claves internas del proyecto, nunca mostradas ni publicadas en el frontend.
- Valida que la URL de la función pertenece exactamente a `xuwjbfnhvvbdargcohfe`.
- Antes de crear nada, exige que Auth, competición, temporada, división, managers, equipos, economía y plantillas estén vacíos.
- El código de competición único evita repetir la creación con éxito.
- La ejecución de alta requiere `{"action":"create","confirm":"CREAR_16_MACROLIGA_PILOTO"}`, además del secreto.
- Genera 16 PIN de seis cifras distintos en el servidor con `crypto.getRandomValues`, sin guardarlos en código, GitHub, registros ni el chat.
- Las cuentas se crean con `auth/v1/admin/users` oficial, con correo sintético confirmado, perfil, equipo y división. Sin futbolistas ni presupuesto distribuido todavía.
- Tras el alta intenta iniciar sesión realmente con los dos primeros entrenadores y validar que sus JWT devuelven equipos distintos por la RPC privada.
- Si falla, intenta limpiar los objetos creados en orden inverso. La API Auth y la base de datos no comparten transacción atómica: si falla alguna limpieza, **no repetir ni ejecutar de nuevo antes de inspeccionar el estado**.
- Los 16 PIN aparecen **una única vez** en la respuesta JSON de la ejecución correcta, destinada exclusivamente al administrador. Guardarlos en un gestor de contraseñas o fichero privado de su ordenador. **No enviar capturas de esa respuesta a ChatGPT.**

## Siguientes pasos para el administrador

1. En Supabase Dashboard, proyecto `macroliga-piloto`, abrir **Edge Functions > Secrets**.
2. Crear un secreto llamado **`MACROLIGA_SETUP_TOKEN`** con una contraseña aleatoria privada de 40 caracteres o más, generada en su propio gestor de contraseñas. Guardar el valor privado porque se introducirá una segunda vez durante la prueba. **No enviar ese valor al chat**.
3. Volver a **Edge Functions > Functions > macroliga-alta-piloto > Test**.
4. Seleccionar **POST** y colocar en las cabeceras `x-macroliga-setup-token` con el valor secreto, y `Content-Type` con `application/json` si el panel lo requiere.
5. Hacer antes una simulación sin cambios con el cuerpo `{"action":"preview"}`. Debe devolver `ok:true`, `numero:16` y los nombres. Si no coincide, detenerse.
6. Una vez comprobado, ejecutar **una sola vez** con cuerpo `{"action":"create","confirm":"CREAR_16_MACROLIGA_PILOTO"}`. Si devuelve `ok:true`, guardar todos los PIN de la respuesta sin enviarlos ni subirlos a GitHub.
7. Comprobar **Authentication > Users**: deben aparecer exactamente 16 usuarios. Comprobar por separado en SQL el número de managers/equipos y que los dos primeros logins se hayan verificado.
8. **Retirar `MACROLIGA_SETUP_TOKEN` de Edge Functions > Secrets** y desactivar/borrar la función temporal desde el panel. Antes de borrarla conviene guardar el código (ya está en GitHub).
9. Los PIN de seis cifras se reservan para la liga de ensayo. Para managers reales se revisarán el control de intentos y recuperación de acceso.

**Estado actual: se ha terminado hasta el paso 1 de despliegue. No consta que se haya creado el token ni ejecutado la función.**
