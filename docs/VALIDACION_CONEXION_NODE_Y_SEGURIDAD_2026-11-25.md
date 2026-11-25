# MACROLIGA — Ejecutor: verificación Node.js, reintentos y seguridad

**25/11/2026 · Proyecto exclusivo:** Supabase `macroliga-piloto` (`xuwjbfnhvvbdargcohfe`) y GitHub `macroliga/web`.

## Resultado comprobado

- **11 migraciones** instaladas. La 0011 revoca el permiso `EXECUTE` público para `public.rls_auto_enable()`. Una prueba reversible confirmó que el disparador `ensure_rls` seguía activando RLS en tablas nuevas.
- **Node.js 22:** 61/61 pruebas superadas en un conjunto local compuesto por las 49 pruebas antiguas de la fase 2 y 12 pruebas nuevas de integración. La prueba de cinco casos `tests/integracion_ejecutor_node.test.mjs` está publicada en GitHub y se ha ejecutado contra archivos del planificador y adaptador cuyo hash Git coincide exactamente con GitHub.
- **PostgreSQL real:** `tests/sql/20261125_runner_reintentos_integracion_rollback.sql` pasa con el rol técnico mediante un permiso temporal `SET ROLE` dentro de `BEGIN/ROLLBACK`. División ficticia, cierre, publicación, fallo inyectado tras preparación, recuperación, segundo día, Equipo Malo y apertura sin duplicar datos.
- La lista blanca de divisiones y los datos de ensayo continúan **vacíos**. El rol `macroliga_runner` continúa sin `LOGIN`, sin contraseña, sin acceso a tablas y sin privilegios de administrador.
- El adaptador sólo llama a las siete funciones `app_private.runner_*`. Comprueba el host exacto de la base de MACROLIGA, el rol SQL, la ruta `/postgres`, el puerto estándar, y rechaza parámetros como `sslmode=disable`; configura TLS con validación de certificado.

## Advertencias Supabase revisadas

- `anon_security_definer_function_executable`: **resuelta (0)**. Se retiró `EXECUTE` a roles cliente sobre la función de disparador RLS; el disparador sigue activo.
- `authenticated_security_definer_function_executable`: **3 advertencias todavía presentes**, correspondientes a las RPC de presentar, retirar y consultar pujas. Su ejecución por usuarios autenticados es intencionada; se revisó el filtro `auth.uid()` y la propiedad del equipo. Antes de producción deberán añadirse pruebas de autenticación extremo a extremo, permisos y estrés.
- `rls_enabled_no_policy`: **33 avisos informativos**. Las tablas públicas están cerradas adrede; no conceder `SELECT` general para hacer desaparecer el aviso. Preparar vistas/RPC de lectura limitada para la PWA.
- Rendimiento: **47 claves externas sin índice (INFO) y 1 índice sin uso (INFO)**. Revisar con mediciones reales antes de aplicar índices indiscriminados.

## Limitaciones que siguen abiertas

**NO se ha probado Node conectado externamente a la base de Supabase.** Este entorno no tiene conectividad PostgreSQL externa ni un secreto de acceso; además, `macroliga_runner` tiene `NOLOGIN`. Las pruebas de Node utilizan transporte simulado; las pruebas de PostgreSQL reales se han ejecutado por separado por la conexión administrativa de pruebas y se han revertido.

Para completar la integración real hay que aprobar dónde se ejecutará el programa, instalar `pg` y cerrar un `package-lock.json`, configurar un gestor privado de secretos, crear una credencial con rotación y habilitar `LOGIN` al rol **solo cuando exista el entorno seguro**. También quedan las carreras entre **dos conexiones independientes**, copias de seguridad y alertas de fallos.

**No hay cron, Edge Function, repositorio ajeno modificado ni cuentas de managers reales.** Comunio Laviana no se ha tocado.

## Comprobación

- Motor y adaptador: `src/server/mercado-ejecutor.mjs`, `src/server/adaptador-postgres.mjs`.
- Node: `tests/integracion_ejecutor_node.test.mjs`.
- SQL reversible: `tests/sql/20261125_runner_reintentos_integracion_rollback.sql`.
- Seguridad: `supabase/migrations/202611250011_restringir_funcion_auto_rls.sql`.