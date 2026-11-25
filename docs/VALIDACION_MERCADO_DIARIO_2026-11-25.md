# MACROLIGA · Mercado diario, segundo día y Equipo Malo

**Fecha de verificación:** 25/11/2026. **Destino exclusivo:** Supabase `macroliga-piloto` (ref `xuwjbfnhvvbdargcohfe`). No se ha utilizado Comunio Laviana para escribir datos.

## Implementación

Novena migración: `supabase/migrations/202611250009_mercado_diario_dos_dias.sql`.

### Preparación

`app_private.preparar_mercado_diario(division_id, dia_local)` crea un ciclo en estado `draft`, idempotente, sin abrir el mercado a los jugadores.

- Apertura prevista: **06:00 de España** el día indicado.
- Cierre de pujas: **01:00 del día siguiente**.
- Publicación de compras: **06:00 del día siguiente**.
- El motor calcula las horas locales con `Europe/Madrid`, almacenando `timestamptz`.
- Cada mercado muestra **como máximo 15 futbolistas**; primero se incluyen los no adjudicados del día anterior (`day_number=2`), y después se añaden otros libres (`day_number=1`) hasta completar plazas.
- Si el ciclo anterior no está publicado o hay un día saltado, se aborta por seguridad.
- En la selección de jugadores libres no se repiten los que estuvieron en el ciclo anterior, evitando un tercer día consecutivo en el mercado.
- La selección de nuevos lotes usa un orden pseudoaleatorio estable para un mismo ciclo; los valores mínimos iniciales se toman del valor de mercado del futbolista **como propuesta técnica provisional**, por validar con el organizador.

`app_private.abrir_mercado_diario(cycle_id)` cambia el estado de `draft` a `open` **solo dentro del horario previsto**. Repetir la apertura no duplica lotes ni estados.

### Publicación, caducidad y Equipo Malo

La función `app_private.publicar_ciclo(cycle_id)`, tras adjudicar ganadores congelados, también resuelve los lotes no vendidos **en la misma transacción**.

- Los que no tienen comprador quedan `expired`.
- Los que han agotado su **segundo día** salen del mercado.
- **Si su valor es inferior a 750.000 €** (no igual), se registra su adquisición por el Equipo Malo en la misma división. La titularidad se refleja en `roster_ownership`, y la operación y el evento en el historial.
- No se altera el saldo de managers porque la adquisición es del Computer al Equipo Malo, sin equipos humanos.
- Si un lote supuestamente sin vender mantiene pujas activas o tiene propietario, se aborta toda la operación. No se elige un segundo ganador ni se publica un resultado parcial.

Todas las funciones nuevas son privadas. Las llamadas desde un móvil no pueden ejecutarlas directamente: el backend de confianza será quien controle la autorización. **No se ha activado ningún cron ni creado una Edge Function.**

## Pruebas ejecutadas en PostgreSQL real

- `tests/sql/20261125_mercado_diario_dos_dias_rollback.sql`: se simularon dos mercados consecutivos, una adjudicación, dos arrastres, 13 nuevos jugadores hasta completar 15, repetición idempotente, puja sobre jugador del segundo día, publicación y retirada correcta; Equipo Malo recibió al de 749.999 € y **no** a uno de exactamente 750.000 € ni a otro superior.
- `tests/sql/20261125_divisiones_horario_mercado_rollback.sql`: dos divisiones independientes con un futbolista compartido en sus mercados; cálculo correcto de horas UTC para las transiciones verano/invierno de 2027.
- El motor económico de la migración 0008 sigue siendo obligatorio: primero calcular ganadores, después publicar a la hora señalada.

Se ha utilizado un patrón de prueba de **excepción controlada y reversión total**, sin dejar managers, pujas ni otros datos ficticios.

## Limitaciones conocidas y próximos pasos

1. **Los trabajos programados no están activos.** Falta crear y ensayar un ejecutor que haga cierre, publicación y generación en el orden correcto, con recuperaciones frente a fallos.
2. La generación consulta el catálogo `players` de Supabase. **No hay importación deportiva real activada** ni permiso de uso de proveedores verificado.
3. Las pruebas se han hecho en una misma sesión PostgreSQL; **faltan pruebas de concurrencia desde conexiones independientes**.
4. Se necesita una regla definitiva para el importe mínimo de pujas del Computer. Por ahora se prepara al valor de mercado, sujeto a aprobación.
5. Queda pendiente la publicación del frontend/PWA, lectura controlada de lotes y autenticación del organizador.
6. Falta revisar las advertencias de seguridad preexistentes y la política de copias de seguridad antes de usar managers reales.

**Nunca ejecutar estas migraciones en Supabase «Comunio Laviana» ni modificar `comuniolaviana/web`.**
