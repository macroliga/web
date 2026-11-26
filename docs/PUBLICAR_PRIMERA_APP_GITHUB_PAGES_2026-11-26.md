# MACROLIGA — Primera publicación de la aplicación piloto

Fecha: 26/11/2026. **Proyecto exclusivo MACROLIGA**.

## Qué está preparado

- `/index.html`: página de entrada a GitHub Pages; redirige a la PWA de `/app/`.
- `/app/index.html`: portada móvil, selector de los 16 entrenadores históricos, PIN de 6 cifras, panel «Mi equipo», cuatro tarjetas Cláusulas/Alineación/Mercado/Equipo Malo, bloque de noticias y menú inferior con Copa.
- `/app/app.js` + `/app/api.mjs`: login real contra Supabase Auth y lectura solo del propio equipo por `macroliga_mi_equipo` y de su plantilla por `macroliga_plantilla_equipo`, con JWT individual.
- `/app/config.js`: clave **publicable** de MACROLIGA (`sb_publishable_`), que no es un secreto. Ninguna clave de servicio ni PIN está en GitHub.
- `/app/manifest.webmanifest`, `/app/sw.js`: estructura instalable PWA y caché de archivos estáticos (sin cachear respuestas privadas).

## Cómo publicar desde el panel GitHub Pages

En `https://github.com/macroliga/web/settings/pages`:

1. Bajo **Build and deployment**, elegir **Source: Deploy from a branch**.
2. En **Branch**, cambiar `None` por **`main`**.
3. En **Folder**, elegir **`/(root)`** (no `/docs`).
4. Pulsar **Save** y esperar a que GitHub muestre la URL publicada.

La URL normalmente será `https://macroliga.github.io/web/`. Cuando Pages quede activo, el `index.html` enviará a `/web/app/`.

### Comprobar el primer login

- Elegir **Luis Aragonés** en el selector.
- Introducir en la web el PIN que el administrador guardó en privado, **no compartirlo por chat**.
- La aplicación debe mostrar «Equipo de Luis Aragonés» con saldo actual (cero) y plantilla vacía (hasta el reparto).
- Cerrar sesión y comprobar otro entrenador. La información del primer manager no debe persistir en pantalla ni transferirse al segundo.
- Si aparece error, describir el mensaje y el estado (sin revelar PIN ni tokens).

## Estado real: no confundir prototipo con juego completo

La portada y la autenticación están programadas, pero **Pages todavía debe ser habilitado por el propietario**. No afirmar que hay web publicada antes de verificarla.

**Funciones NO disponibles aún:** pujas desde la PWA, adjudicaciones de mercado, cláusulas operativas, alineación editable, clasificación con puntuaciones y copa. No se han distribuido futbolistas ni presupuestos; la base dispone de cuentas ficticias, temporada piloto y equipos, pero no de plantillas activas.

No publicar accesos administrativos ni claves privadas en GitHub Pages. GitHub Pages de un repositorio público produce una web públicamente accesible; solo los datos de cada manager se consultan tras autenticarse.

**Comunio Laviana permanece sin modificaciones.**
