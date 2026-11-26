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

## Despliegue y verificación real, 26/11/2026

Commit de implementación: `78ed8c617fad21da05da6afb7ff09321a7ce8c7f`.
Se aplicó `reparto_valor_objetivo` exclusivamente a macroliga-piloto.
Dos simulaciones de propietario con 551 futbolistas reales, 16 equipos, 70M,
12M de caja mínima y cuotas 2/5/5/3, ambas en transacciones revertidas:

- Semilla 1: plantillas 54.970.000–54.980.000 €, saldo
  15.020.000–15.030.000 €, diferencia 10.000 €; 240 jugadores únicos y
  reserva de 15; patrimonio exacto.
- Semilla 2: plantillas 54.120.000–54.140.000 €, saldo
  15.860.000–15.880.000 €, diferencia 20.000 €; patrimonio exacto.

Verificación posterior: 0 titularidades, 0 apuntes de caja, 0 ciclos,
0 pujas, 0 repartos aplicados, 0 previews de operador conservadas y 551
activos. Las dos funciones privadas no son ejecutables por anon,
authenticated, service_role ni macroliga_runner. El administrador puede
volver a simular desde la aplicación publicada: no requiere otro despliegue
de interfaz. No se ha realizado el reparto definitivo.
