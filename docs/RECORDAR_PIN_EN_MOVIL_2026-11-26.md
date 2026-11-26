# MACROLIGA — Recordar PIN de seis cifras de forma segura

Fecha: 26/11/2026. Solo se ha modificado el repositorio `macroliga/web`. Ningún recurso de Comunio Laviana se ha cambiado.

## Requisito

El entrenador no debe tener que introducir su PIN repetidamente. Se mantienen dos mecanismos complementarios:

1. **Sesión recordada en MACROLIGA:** la PWA renueva su acceso al volver a abrirse mediante un refresh token de Supabase (implementado anteriormente). No necesita escribir de nuevo el PIN mientras la sesión siga activa.
2. **PIN recordado por el gestor de contraseñas del móvil:** el formulario ofrece la opción marcada `Guardar mi PIN en el gestor de contraseñas del móvil`. Después de un acceso validado, si el navegador permite `PasswordCredential` y `navigator.credentials.store`, se le solicita al gestor guardar el alias interno y el PIN. En navegadores sin esa API se usan las pistas HTML `autocomplete=username` y `autocomplete=current-password` para facilitar la función nativa de guardado/autorrelleno.

**No se guarda el PIN en localStorage, sessionStorage ni en el repositorio GitHub.** La app ya guarda un refresh token de sesión local para el acceso automático; es independiente del PIN y se elimina cuando se pulsa Salir.

## Importante sobre compatibilidad

- En Chrome/Android la API Credential Management de contraseñas tiene soporte y puede presentar un aviso para confirmar el guardado; **no se debe afirmar que el PIN está guardado sin que el usuario lo acepte y lo compruebe**.
- En iPhone/Safari no se soporta `PasswordCredential`: se facilita el Autorrelleno del sistema con los atributos HTML, pero la decisión de ofrecer el guardado y los resultados dependen del navegador y de las opciones de Contraseñas del dispositivo.
- La app no puede forzar ni consultar el contenido de un gestor de contraseñas externo. Si el teléfono no ofrece guardar, se puede almacenar manualmente una entrada en su gestor con sitio `https://macroliga.github.io`, usuario `demoXX@macroliga.invalid` y su PIN, sin enviarlos a ChatGPT.
- Aunque el PIN quede guardado en un gestor del móvil, al pulsar Salir **sí se elimina la sesión activa local**. Para entrar de nuevo, el navegador puede autocompletar el PIN guardado, en lugar de tener que memorizarlo.
- Los PIN tienen seis cifras y son credenciales de **prueba**. Para usuarios reales habrá que revisar políticas de bloqueo de intentos y recuperación segura.

## Archivos y comprobaciones

`app/index.html`: opción y campos compatibles con autofill. `app/gestor-pin.mjs`: solicitud opcional al gestor del navegador después de autenticar. `app/app.js`: integración sin bloquear el acceso. `app/styles.css`: opción discreta. `app/sw.js`: cache estática v7. `tests/pwa_gestor_pin.test.mjs` y `tests/pwa_portada_mobile.test.mjs`: pruebas de validación sin claves reales.

**Pendiente:** prueba de uso real en el móvil elegido, confirmación de que el gestor pregunta y guarda, y comprobación tras Salir. Las pruebas Node/GitHub Actions no pueden comprobar el gestor de contraseñas real de cada móvil.
