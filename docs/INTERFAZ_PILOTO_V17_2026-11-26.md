# Entrega de interfaz MACROLIGA piloto v17
26/11/2026. Entrega acotada a la aplicación piloto y sus pruebas, sobre el
último main con sesión persistente (0d672eb3e09fda2ff106347947f42971fabd0334).
Código probado en dev/catalogo-integracion, ef5efce8adfc8e0b9cc7d892eb379adfd4fb74ff.

- Inicio y Mi equipo: saldo, valor y patrimonio (saldo + valor), datos
  actualizados sin perder la sesión.
- Mercado: 15 lotes/previa, buscador y filtros de catálogo, historial.
- Clasificación: managers, valor de plantilla y puntos confirmados.
- Administración solo visible al obtener autorización del servidor;
  carga/reparto combinado exige origen autorizado y validaciones del servidor.
  Sin claves administrativas ni PIN en código. El cliente no puede abrir el
  mercado ni crear cuentas.
- Supabase macroliga-piloto: RPC de lectura, arranque privado y administración
  de división instaladas y probadas en PostgreSQL desechable. El piloto
  contiene 16 equipos y ningún futbolista; importación real pendiente.
- No se activa ninguna puja, mercado, cron, runner o nueva competición.
  El actual usuario conserva su login. Session.mjs y configuración pública
  permanecen idénticos al main anterior.
- Esta entrega no incluye otras propuestas de cambios económicos ni aplica
  migraciones a través de GitHub. Reversión de UI: publicar el árbol previo
  de app mediante un nuevo commit, sin revertir datos de Supabase.

Pruebas: 155/155 en desarrollo y 139/139 en el árbol acotado de publicación;
sintaxis correcta; Chromium Pixel 7 con diez etapas de Auth y API ficticias,
incluidas las nuevas pantallas, permiso administrativo y patrimonio después
del arranque. No se utilizan PIN ni fixtures reales.

## Actualización v18
Estado de la división visible en Inicio: 16 managers registrados, catálogo
pendiente y 0/15 lotes cuando la API devuelve esos valores. No se simulan
datos. Acceso administrativo directo solo tras autorización. Actualización
manual y recuperación de HTML obsoleto sin borrar la sesión; sin cambios
de Auth, datos o activación del juego.

Se verificaron las RPC del piloto con rol autenticado en transacción de
solo lectura: clasificación 16 a cero, plantilla y catálogo/mercado vacíos,
arranque válido. 155 pruebas de desarrollo y 13 etapas Chromium móvil
(incluye versión obsoleta, renovación única, actualización manual).
