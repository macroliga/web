# MACROLIGA — verificación de cláusulas del Equipo Malo (27/11/2026)

Rama `dev/equipo-malo-clausulas`, PR #4, base del cambio de tramos `0b73b7f940981a680973b565cab707e95773b9ed`.

## Ejecución real local
PostgreSQL nativo 17.11, binarios de `@embedded-postgres/linux-x64@17.11.0-beta.19`, cliente pg 8.16.3. Cluster temporal inicializado desde cero, escuchando únicamente en 127.0.0.1. No se utilizó ninguna credencial alojada. Plataforma Auth simulada exclusivamente por `tests/sql/bootstrap_postgres_ci.sql` (roles SQL, auth.users ficticia, auth.uid de claims, firma del auxiliar auto-RLS de plataforma) y definición real vigente de `app_private.equipo_manager_activo` obtenida en solo lectura. Tablas y funciones del motor proceden de las 14 migraciones versionadas. No es una copia completa del servicio Auth ni del esquema de las migraciones alojadas posteriores no versionadas; se contrastó el cuerpo contable vigente con el de la migración 0006, coincidencia exacta.

- Primer ensayo: las 14 migraciones y 9 regresiones base correctas; fallo de sintaxis en ampliación del test de cláusulas (se había reducido el delimitador dollar-quote). Se corrigió y se inició un cluster nuevo.
- Segundo ensayo: 14 migraciones, 9 regresiones antes y después, nueva prueba de pago, permisos/RLS y rollback correctos.
- Tercer ensayo completo (código final): 14 migraciones; las 9 regresiones antes y después; prueba de cláusulas; importación real de las 388 reglas (382 umbrales originales distintos + 6 anclajes de extensión), ninguna ventana automática, cero solapamientos; dos conexiones autenticadas a la vez, bloqueo de segunda sesión observado por pg_stat_activity, el ganador pagó exactamente 702.000 € por un jugador de 180.000 €, el otro quedó rechazado (22023), un único asiento/traspaso/propietario; permisos y RLS; reversión y cero fixtures. Se cerró el servidor.
- Función contable privada antes y después: MD5 de pg_get_functiondef `a264413ab28e495f64e046ad942072fc`; ACL `{postgres=X/postgres}`; dos nuevas RPC eliminadas por el rollback. Confirmado que la versión alojada seguía siendo la observada para el rollback.
- Las ocho tablas críticas consultadas en el proyecto Macroliga mediante metadatos (bids, clause_rules, clause_windows, players, roster_ownership, teams, transfer_operations, wallet_entries) tienen RLS habilitada y sin acceso directo de anon/authenticated.
- Permanecen cerradas las reglas/ventanas alojadas. No se ha aplicado ninguna migración, realizado ningún fichaje, creado ningún usuario real, publicado la aplicación ni modificado Comunio Laviana.

## Reproducción
Inicializar una instancia PostgreSQL 17 **desechable, vacía, exclusivamente local**, con base `macroliga_clause_test`, rol postgres, contraseña de fixture `fixture-macroliga-only`. Instalar dependencias existentes del repo. Ejecutar:
```sh
PGHOST=127.0.0.1 PGPORT=<puerto-local> PGDATABASE=macroliga_clause_test PGUSER=postgres PGPASSWORD=fixture-macroliga-only node tests/sql/verificar_clausulas_local.mjs
```
El script aborta si no coincide el entorno y si hay tablas previamente existentes. El motor se aplica y prueba, se habilita una ventana ficticia únicamente para la carrera, se limpian sus filas y se revierte la propuesta. **Nunca usar una base alojada.**

## Pendiente
Autorizar ventana/horario y despliegue concreto; verificar la definición/ACL viva nuevamente inmediatamente antes de desplegar, y después realizar solamente smoke tests de lectura en la liga alojada. Precio fraccional de céntimo y ampliación de 101–200 M fuera de los anclajes quedan bloqueados según política anterior. El flujo CI original no se cambia: el intento de incorporar el servicio PostgreSQL no produjo workflow run para el commit intermedio, por lo que se recuperó su versión previa y la prueba se ejecutó directamente en PostgreSQL nativo.
