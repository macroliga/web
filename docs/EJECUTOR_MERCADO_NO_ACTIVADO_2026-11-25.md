# MACROLIGA · Ejecutor del mercado (PREPARADO, NO ACTIVADO)

**Fecha:** 25/11/2026. **Único destino previsto:** Supabase `macroliga-piloto` (ref `xuwjbfnhvvbdargcohfe`).

Este documento describe código preparado para un proceso de servidor. **No se ha creado ningún cron, GitHub Action, Edge Function ni usuario SQL; no existe ejecución desatendida.** Comunio Laviana no ha sido modificado.

## Código

- `src/server/mercado-ejecutor.mjs`: núcleo de planificación, idempotencia y errores.
- `src/server/adaptador-postgres.mjs`: conexión PostgreSQL con verificación del host del piloto, TLS y consultas parametrizadas.
- `scripts/ejecutar-mercado.mjs`: programa de línea de comandos. `--dry-run` es el modo predeterminado.
- `tests/ejecutor_mercado.test.mjs`: 16 casos de reintentos, secuencias, límites de temporada, fallos y cambios de hora.
- `tests/adaptador_postgres.test.mjs`: pruebas de conexión a un proyecto distinto, usuario administrador y ausencia de secretos en errores.

## Secuencia deseada

| Hora española | Trabajo | Función privada ya existente |
|---|---|---|
| 01:00 (o primer reintento posterior) | Cerrar pujas y congelar ganador | `app_private.cerrar_calcular_ciclo(ciclo_id)` |
| 06:00 (o primer reintento posterior) | Publicar movimientos del mercado que terminó | `app_private.publicar_ciclo(ciclo_id)` |
| A continuación, desde las 06:00 | Preparar hasta 15 jugadores del mercado nuevo | `app_private.preparar_mercado_diario(division_id,dia)` |
| A continuación | Abrir el mercado preparado | `app_private.abrir_mercado_diario(ciclo_id)` |

El programa **consulta la hora al servidor PostgreSQL** y calcula el día local con `Europe/Madrid`, incluidos cambios de verano/invierno. Las funciones SQL rechazan adelantos. Las llamadas se realizan **en orden por división**, sin saltarse una fase fallida.

## Seguridad y bloqueos

- **Sin ejecución automática:** solo se ejecuta si un operador o un programador futuro llama al script.
- **Modo seguro por defecto:** `npm run market:dry-run` solo lee la base y explica qué pasos haría.
- **Lista de divisiones obligatoria:** `MACROLIGA_DIVISION_IDS`, UUID separados por comas. Nunca procesa automáticamente todas las divisiones.
- **Solo temporadas activas:** se consulta `seasons.status`; una división no activa no recibe mercado.
- **Host restringido:** se exige `db.xuwjbfnhvvbdargcohfe.supabase.co/postgres` con PostgreSQL y TLS verificado. No se acepta el host de Comunio Laviana ni un pooler genérico hasta revisión específica.
- **Usuario para ejecutar:** el código solo permite el nombre SQL `macroliga_runner`; **ese usuario todavía no está creado**. Tampoco se han concedido permisos a dicho rol.
- **Confirmación explícita:** `--execute` exige además `MACROLIGA_TARGET_REF=xuwjbfnhvvbdargcohfe` y `MACROLIGA_MARKET_RUN_ENABLED=CONFIRMO_SOLO_MACROLIGA_PILOTO`. Es un seguro frente a errores humanos, no un sustituto de credenciales y privilegios reales.
- **No usar el usuario PostgreSQL `postgres`** para ejecutar, ni publicar la cadena `DATABASE_URL` en GitHub, la PWA, capturas o chats.
- Los secretos deberán inyectarse mediante un sistema privado de secretos del futuro ejecutor. La carpeta `node_modules`, los archivos `.env` y los logs se excluyen con `.gitignore`.
- Si una división falla, se registra error y no se preparan fases posteriores de esa división. Otras divisiones autorizadas pueden seguir.
- Si se ha perdido un día, la preparación aborta: **no salta días** ni reinicia el mercado sin intervención del administrador.
- Si falla la apertura después de preparar, el ciclo queda `draft` y el reintento puede abrirlo sin duplicar jugadores.
- Las funciones SQL son transaccionales e idempotentes, pero faltan **pruebas simultáneas con dos conexiones reales**.

## Antes de probar contra una base de datos

**Todavía pendientes de aprobación:**

1. Crear en `macroliga-piloto` el usuario SQL limitado `macroliga_runner`, diseñando permisos de solo lectura para calendario/ciclos y `EXECUTE` solo en cuatro funciones del mercado. No conceder `BYPASSRLS` general ni acceso a datos privados de pujas.
2. Revisar las advertencias de Supabase y desarrollar una forma segura de leer los datos mínimos (las 33 tablas públicas tienen RLS activada y sin políticas de acceso generales).
3. Configurar el secreto `DATABASE_URL` fuera del repositorio, validar TLS y elegir el servidor o plataforma que lanzaría el proceso.
4. Instalar dependencias en un entorno controlado y generar/verificar `package-lock.json` antes de un despliegue reproducible. Hasta entonces solo está preparado `package.json` con `pg`.
5. Configurar los UUID reales de divisiones autorizadas tras crear la liga piloto. Actualmente no hay divisiones, managers ni jugadores reales.
6. Hacer primero simulación de lectura, después ensayos explícitos sobre datos ficticios y finalmente concurrencia/red. Validar recuperación tras fallos a las 01:00 y 06:00.
7. **Solo con autorización posterior:** activar el programador, con horario `Europe/Madrid`, reintentos y alertas. No se debe usar un cron UTC fijo sin contemplar cambios de hora.

## Comandos previstos (NO ejecutados en un servidor)

```bash
npm install
npm test
npm run check
npm run market:dry-run
```

Para un `dry-run` conectado deben existir `DATABASE_URL` y `MACROLIGA_DIVISION_IDS` en el entorno privado; no se incluyen contraseñas ni UUID de equipos ficticios en el repositorio. **El CLI no puede conectarse todavía con el rol de ejecución porque no existe ni está autorizado.**

## Comprobación realizada de momento

Se validaron en el entorno de análisis las 16 simulaciones del planificador y las 7 pruebas de guardas del adaptador. El código de CLI pasa comprobación sintáctica V8. No se han ejecutado `npm test` ni pruebas con credenciales PostgreSQL desde un proceso Node independiente: esa comprobación queda pendiente de poder descargar el repositorio al entorno de pruebas.

La base `macroliga-piloto` sigue con **nueve migraciones**, sin cambios de tablas ni permisos en esta fase.

**Recursos protegidos**: `comuniolaviana/web`, proyecto Supabase «Comunio Laviana» y aplicación pública, solo lectura.
