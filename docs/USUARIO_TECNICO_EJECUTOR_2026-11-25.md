# MACROLIGA · Usuario técnico del ejecutor (25/11/2026)

## Qué se ha creado realmente

**Exclusivamente en Supabase `macroliga-piloto`, ref `xuwjbfnhvvbdargcohfe`.**

Migración 0010: `supabase/migrations/202611250010_runner_minimos_permisos.sql`.

- Rol de PostgreSQL **`macroliga_runner`** creado con `NOLOGIN`, sin contraseña, sin privilegios de superusuario, creación de roles/bases de datos, replicación ni `BYPASSRLS`.
- **Lista blanca `app_private.market_runner_divisions` vacía**: ninguna división activa, ningún mercado autorizado.
- Acceso al esquema privado `app_private` y únicamente siete funciones `runner_*`:
  - `runner_hora_servidor()`: hora del servidor PostgreSQL.
  - `runner_division(uuid)`: lectura mínima de una división autorizada y su temporada.
  - `runner_ciclos(uuid)`: lectura mínima de ciclos de esa división.
  - `runner_preparar(uuid,date)`: crea de forma idempotente el ciclo del día.
  - `runner_abrir(uuid)`: abre un ciclo a su hora.
  - `runner_cerrar(uuid)`: congela las pujas al cierre.
  - `runner_publicar(uuid)`: publica compras, caducidades y Equipo Malo.
- Las funciones de escritura verifican **en PostgreSQL**, no solamente en JavaScript, que la división figure habilitada en la lista blanca, que la temporada esté `active` y que la zona horaria sea `Europe/Madrid`.
- `macroliga_runner` **no tiene acceso directo a tablas**, lista blanca ni a las funciones originales del motor. No se han abierto políticas RLS generales.

## Qué se ha verificado

La prueba reproducible `tests/sql/20261125_runner_permisos_rollback.sql` fue ejecutada en PostgreSQL real. Para verificar el rol `NOLOGIN`, el ensayo concedió a la conexión administrativa un permiso `SET ROLE` **temporal**, dentro de `BEGIN ... ROLLBACK`. Tras finalizar se verificó que dicho permiso no permanece.

La prueba rechazó accesos a tablas del juego, a la lista blanca y a funciones internas; aprobó la preparación de un ciclo ficticio en una división autorizada y rechazó las operaciones sobre otra no habilitada. También confirmó que se pierde el acceso al desactivar la división de prueba. **Todas las divisiones y ciclos ficticios se revirtieron.**

El adaptador `src/server/adaptador-postgres.mjs` usa exclusivamente las siete funciones `runner_*` y exige el usuario `macroliga_runner` incluso para `--dry-run`. Los controles de JavaScript del planificador/adaptador suman **24/24 pruebas superadas en el entorno de análisis**. No se ha ejecutado todavía la batería completa desde Node sobre una conexión externa real.

## Estado y próximos pasos

**No es una cuenta de acceso operativo todavía:** `NOLOGIN` significa que no puede conectarse con contraseña desde ningún servidor. Se ha elegido para no crear una contraseña que hubiera que revelar o guardar en GitHub.

Solo con autorización posterior y un gestor privado de secretos se podrá habilitar el inicio de sesión, proporcionar credenciales seguras sin exponerlas en repositorios/chats y validar la conexión real desde Node.js. Después habrá que preparar **una división ficticia habilitada explícitamente**, probar reintentos y conexiones simultáneas y finalmente solicitar otra aprobación antes de activar cualquier programación horaria.

**No se ha creado ni habilitado ningún cron, tarea programada, Edge Function, manager real o mercado.** No se ha modificado GitHub `comuniolaviana/web`, Supabase «Comunio Laviana» ni su aplicación.
