# Reparto inicial con valor objetivo

El criterio anterior minimizaba únicamente la diferencia de valor entre
plantillas. Por tanto, un reparto de jugadores baratos podía ganar aunque
dejara casi todo el patrimonio en efectivo. El operador pide plantillas
de 50–60M con patrimonio 70M y caja mínima de 12M en efectivo.

Nueva regla: valor de plantilla entre 5/7 y 6/7 del patrimonio configurable,
con techo adicional patrimonio menos caja mínima en efectivo. Con 70M y
12M, resulta 50–58M y 12–20M de saldo. El centro es 54M. Si la caja mínima
es incompatible con la banda, se rechaza la configuración. No se rebaja
silenciosamente el objetivo ni se crea dinero.

Se exploran 64 subconjuntos de jugadores activos, con valor positivo,
reservando previamente el mercado (15). Cada subconjunto conserva cuotas
por posición; se asignan de mayor a menor valor a equipos elegibles.
Prioridad: satisfacer la banda, aproximarse al centro y reducir dispersión;
refinamiento con permutas de igual posición. La simulación rechaza si no
consigue la banda, incluso si encuentra una distribución más barata.
Se conserva el patrimonio exacto; no se permite duplicar ni modificar
jugadores. Las propuestas antiguas quedan invalidadas en el aplicador sin
borrado ni cambios económicos. La versión 2 añade objetivo y límites
monetarios al plan; se vuelven a comprobar al aplicar.

Migración y reversión: `supabase/migrations/202611260011_reparto_valor_objetivo.sql`
y `docs/propuestas/20261126_reparto_valor_objetivo_rollback.sql`.
No cambia firmas, roles ni políticas. Revertir no modifica repartos ya
aplicados. No se debe confirmar sin una revisión del nuevo plan.

Prueba ejecutada en PostgreSQL 17.5 PGlite aislado:
`tests/sql/probar_admin_arranque_local.mjs`. Pasa migración/reversión,
rechazo de plan antiguo y caja incompatible, 16 equipos (50–58M, saldo
>=12M), 240 jugadores únicos, cuotas y 15 reservados, patrimonio exacto,
falta de cuotas, aislamiento, rollback tardío, idempotencia y aplicación
atómica en fixtures locales, no base alojada.
