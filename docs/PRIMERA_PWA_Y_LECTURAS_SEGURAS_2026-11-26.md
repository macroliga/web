# MACROLIGA — Primera PWA y lecturas seguras (26/11/2026)

## Alcance exacto de esta entrega

**Únicos destinos modificados:** repositorio GitHub `macroliga/web` y proyecto Supabase `macroliga-piloto` (`xuwjbfnhvvbdargcohfe`). Recursos de Comunio Laviana: **sin cambios**.

### Backend: instalado y ensayado
- Migración `supabase/migrations/202611260001_lecturas_seguras_managers.sql`, aplicada a Supabase como `lecturas_seguras_managers_20261126_v01`.
- `public.macroliga_mi_equipo()`: lectura del propio equipo por identidad `auth.uid()`: saldo, plantilla, pujas activas y márgenes calculados. No devuelve otros equipos.
- `public.macroliga_plantilla_equipo(p_equipo_id)`: devuelve futbolistas de un equipo solo cuando el usuario tiene equipo activo en la misma división. No expone saldos ni pujas ajenas.
- Ambas RPC son `SECURITY DEFINER` con `search_path` vacío, referencias de esquema explícitas, permisos revocados a `PUBLIC` y `anon`, y `EXECUTE` concedido solo a `authenticated`.
- Ensayo reversible `tests/sql/20261126_lecturas_managers_rollback.sql` ejecutado contra el PostgreSQL real de MACROLIGA. Dos usuarios de la misma división, tercero en otra, acceso anónimo y privacidad de saldos. La primera ejecución encontró una posición ficticia incorrecta (`MED`); corregida a `MID` y repetido con éxito. Sin datos persistentes.
- Se comprobaron las ACL en Supabase: `anon` no ejecuta las RPC; `authenticated` sí. Tras el ensayo, `auth.users`, `managers`, `teams`, `wallet_entries` y `roster_ownership` siguen sin filas.

### Frontend: código creado, NO publicado
- `app/index.html`: portada de móvil basada en el diseño aprobado, cuatro tarjetas del mismo tamaño y navegación con espacio reservado a Copa. No incluye Viejo Zorro ni Fair Play.
- `app/styles.css`: visual adaptable al móvil.
- `app/config.js`: URL del proyecto MACROLIGA, **sin clave de acceso todavía**. Nunca colocar `service_role` ni secretos aquí.
- `app/api.mjs`: acceso por correo/contraseña a Supabase Auth y llamadas a una lista blanca de dos RPC de lectura con el token del manager.
- `app/app.js`: consulta del equipo y plantilla con texto protegido contra inyección HTML. La sesión solo se conserva en memoria; no hay persistencia de contraseña ni token en almacenamiento local.
- `app/logic.mjs`: indicadores de horas del Mercado (06:00–01:00) y Equipo Malo (12:00–00:00) calculados en Europe/Madrid. Son indicadores visuales: **no activan el motor**.
- `app/manifest.webmanifest`, `app/icon.svg` y `app/sw.js`: base instalable; el service worker solo precarga estáticos y nunca intercepta solicitudes de lectura privadas, RPC, claves ni credenciales.
- Por ahora: botones de mercado, cláusulas, Copa, clasificación y administración **sin operaciones funcionales**. La cuenta atrás y calendario quedan pendientes de la fuente deportiva. No hay usuarios reales dados de alta.

### Pruebas
- `tests/pwa_cliente.test.mjs`: tests locales previstos para horario de invierno/verano, apertura del Equipo Malo, formato EUR, configuración pública y lista blanca de RPC.
- `npm test` y `npm run check` incluyen las pruebas y sintaxis del frontend.
- `.github/workflows/comprobaciones.yml` configura Node 22 para ejecutar esas pruebas en push/PR sobre MACROLIGA, sin secretos ni contacto con Supabase.
- **Estado CI:** archivo de automatización creado. Aún no se ha confirmado una ejecución completada en el servidor de GitHub.

## Siguiente paso antes de una prueba de acceso real

1. Verificar que pasan las pruebas CI; solucionar errores si los hay.
2. Decidir y aprobar el método para administrar las 16 credenciales iniciales (sin compartir contraseñas en el chat).
3. Configurar la clave **pública** `anon/publishable` de `macroliga-piloto` para el cliente de pruebas; el acceso real depende de las políticas y RPC.
4. Crear **solo identidades ficticias de ensayo** y validar la primera sesión end-to-end, tras autorización expresa. No activar mercado ni credenciales del ejecutor.
5. Incorporar una RPC de listado público de equipos de la **misma división**, después clasificación y fotografías históricas de alineaciones.
6. Comprobar legalmente y técnicamente las fuentes de datos deportivos y calendario antes de conectarlas.

## Seguridad: alcance de lo verificado

Una prueba con `SET ROLE authenticated` valida permisos SQL de Postgres, no sustituye una prueba real con navegadores, tokens de Supabase, concurrencia ni auditoría de producción.

**Estado operativo:** base de datos de ensayo + lectoras seguras + portada de prueba en el repositorio. No existe todavía una liga piloto lista para 16 usuarios, ni PWA publicada, ni ejecución programada del mercado. Ningún proceso nuevo modifica Comunio Laviana.
