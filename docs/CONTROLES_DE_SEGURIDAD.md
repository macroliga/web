# Control de seguridad — primera iteración

- Modelo «denegar por defecto»: las 33 tablas activan RLS y revocan acceso directo de `anon` y `authenticated`.
- Funciones elevadas: todas con `SECURITY DEFINER` y `search_path = ''`, nombres de tablas cualificados y privilegios de ejecución revocados salvo al rol `authenticated`.
- `auth.uid()` identifica al manager. La función no acepta un `team_id` facilitado por la PWA.
- La fila de `teams` se bloquea `FOR UPDATE` al validar suma de pujas y plazas; esto serializa dos pujas de un mismo manager.
- Dinero en céntimos: `BIGINT` SQL, `BigInt` JavaScript; el 25 % redondea hacia abajo al céntimo.
- Las claves compuestas de `division_id` en propiedad, mercado, ofertas, alineaciones y premios evitan contaminación entre divisiones.
- Solo el usuario autenticado ve sus pujas a través de `macroliga_mis_pujas()`; no se ha autorizado el acceso directo a `bids` ni siquiera al panel administrativo normal.
- El propietario técnico de la base de datos puede acceder a sus contenidos: ninguna protección del panel evita por sí sola el acceso de un superadministrador con credenciales SQL.
- Queda sin programar el motor de adjudicación, por lo que el sistema no es aún apto para realizar operaciones reales.
- No se guardan secretos ni contraseñas en los archivos de este paquete.
- En la implantación real deben ensayarse políticas, roles, RLS y pruebas de concurrencia; los controles actuales solo están preparados en SQL.

Documentación consultada para estas recomendaciones: https://supabase.com/docs/guides/database/functions y https://supabase.com/docs/guides/database/postgres/row-level-security
