# Entrega incremental MACROLIGA · 26/11/2026

Destino exclusivo: macroliga/web; proyecto macroliga-piloto (xuwjbfnhvvbdargcohfe).
No se ha consultado ni modificado Comunio Laviana. No se han introducido fixtures ficticios en Supabase alojado.

## Persistencia y seguridad
- Migración 202611260012: borrador privado por equipo, lectura de jornada/partidos, once de 11 plazas (pueden quedar huecos según modelo de puntuación), propiedad y actividad del futbolista, sin duplicados, división y versión optimista. El guardado oficial usa reloj del servidor y el menor inicio confirmado/fecha de cierre. Sin calendario se permite solo borrador privado.
- Migración 202611260013: ID de lotes, pujas propias, anuncios y ofertas propias. Reutiliza RPC de puja y retirada ya existentes; pasarela de anuncios/ofertas con origen autenticado, bloqueo por ciclo y política de compraventa, mínimos por tramos y contabilidad transaccional. Las ofertas de managers son no vinculantes hasta aceptar y se revalidan en ese momento. No existe lectura de cantidades de pujas rivales.
- RLS activa y sin privilegios directos de cliente en la tabla nueva; las cuatro RPC nuevas solo concedidas a authenticated.
- Ambas migraciones instaladas. La segunda se ejecutó, pero el conector generó la misma versión de historial (un segundo); se verificó su presencia, se convirtió en reinstalable y se registró de nuevo con éxito. No se manipularon registros de migraciones manualmente.
- Rollbacks retiran las RPC y preservan datos de juego. Orden: mercado, alineación. No eliminar jornadas con actividad.

## Calendario comprobado
Se ha configurado la jornada oficial 14, prevista por LaLiga del 27 al 30/11/2026, con los diez encuentros y los veinte clubes existentes del catálogo. Primer partido Levante–Racing, 27/11 21:00 Europe/Madrid (20:00 UTC). Fuente oficial:
- https://www.laliga.com/noticias/horarios-de-la-decimocuarta-jornada-de-laliga-ea-sports-2026-27
- https://www.laliga.com/laliga-easports/resultados/2026-27/jornada-14
Script de alta contrastado: scripts/sql/configurar_jornada14_20261127.sql. No se han cargado resultados ni puntos; comprobar posibles cambios de horarios antes del cierre. No se ha cambiado el estado de temporada ni programado abonos.

## Pruebas efectivamente ejecutadas
- PGlite/PostgreSQL 17.5 aislado: 24 migraciones desde cero, reejecución de pasarela, autenticación ficticia, separación entre managers y divisiones, atacante anónimo, RLS/permisos, propiedad, versión, duplicado, fecha de partido, puja/retirada, anuncios/ofertas, cierre/política, contabilización e idempotencia, rollback y reinstalación sin pérdida, calendario de diez partidos y rollback.
- Verificación alojada tras instalar: 551 jugadores activos, 240 asignados, 16 apuntes de cartera; jornada 14 scheduled, 10 partidos y cierre 20:00 UTC. Cero alineaciones/borradores de usuarios, pujas, anuncios u ofertas reales (no se efectúan pruebas con datos de juego reales). Ciclo de mercado draft, cero políticas de compraventa habilitadas. RPC con EXECUTE authenticated, no anon.
- Las pruebas de aplicación y dispositivo se registran en la rama de interfaz.

## Pendientes antes de abrir juego económico y puntuaciones
- Confirmar y automatizar actualización de calendario (aplazamientos y cambios), formaciones reglamentarias definitivas, validación de titularidad al cierre, captura de saldo de inicio y puntos por partido; liquidación idempotente de jornada y premios solo una vez validados.
- Generar ofertas de Computer a jugadores en venta y gestionar bajas de competición con último valor; Equipo Malo, cláusulas. No se ha inventado una fórmula ni activado estas operaciones.
- Mercado: apertura real/política de ventas y cierre/publicación solo tras autorización; no se activa en este cambio.
