# MACROLIGA | Alta piloto realizada (26/11/2026)

Proyecto verificado: Supabase `macroliga-piloto` (ref `xuwjbfnhvvbdargcohfe`), GitHub `macroliga/web`. **Comunio Laviana es de solo lectura y no se ha modificado.**

## Pruebas reales de base de datos

- Auth: **16** usuarios confirmados con correos ficticios `demo01` a `demo16` y metadatos de ensayo.
- `public.managers`: **16** managers.
- `public.teams`: **16** equipos.
- **1 división**, **1 temporada** y **1 competición** de prueba.
- Relación verificada: 16 managers distintos y 16 usuarios Auth distintos, cero cuentas sin Auth, cero errores de nombres, cero usuarios no ficticios en la división.
- `auth.users.last_sign_in_at`: **2** usuarios con acceso registrado. La función de alta comunicó que validó dos sesiones reales y las RPC del equipo propio; es una prueba de servicio, no de interacción visual de la PWA.
- `wallet_entries`: 0 movimientos; `roster_ownership`: 0 futbolistas. Saldos actuales: 0. No afirmar que se ha efectuado reparto inicial.

## Cierre de la infraestructura temporal

1. Edge Function `macroliga-alta-piloto`, versión 5: **código desactivado**, responde HTTP 410, `verify_jwt=true`; no crea cuentas.
2. Migración `supabase/migrations/202611260003_cerrar_alta_piloto.sql`: eliminadas las cuatro RPC de alta temporales. Consulta posterior verificó **0** funciones con prefijo `macroliga_piloto_`.
3. Verificación posterior: siguen existiendo los 16 usuarios, 16 managers, 16 equipos y 2 logins registrados.
4. **Tarea manual de seguridad pendiente:** eliminar `MACROLIGA_SETUP_TOKEN` desde el panel Supabase → Edge Functions → Secrets. El usuario conoce el secreto; no lo envió al chat.
5. Se recomienda también eliminar la Edge Function inerte desde el panel cuando se confirme que el secreto ha sido eliminado. El código desactivado permanece en GitHub como estado actual.

## Siguiente fase

Abrir y publicar de forma controlada la PWA, comprobar acceso visual con dos PIN propios y diseñar el reparto inicial de 15 futbolistas por manager, valorando el patrimonio inicial igualado. Ninguna de estas operaciones está realizada por el mero hecho de crear las 16 cuentas. Los entrenadores históricos son **alias ficticios de prueba**, no titulares personales de esas identidades.
