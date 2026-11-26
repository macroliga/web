# MACROLIGA: catálogo y ciclo de vida de futbolistas
Fecha: 26/11/2026. Exclusivamente macroliga/web y macroliga-piloto
(xuwjbfnhvvbdargcohfe). Base remota de la rama: 835ab81272976f6ab2d8f5396ca17a6a2a70930f.

## Contrato acordado
- Una descarga completa diaria (fecha Europe/Madrid), con comprobación de los 20
  clubes y al menos 490 activos, identificador externo estable, nombres,
  club, posición, valores en céntimos y puntos acumulados. No se confunden
  puntos acumulados con puntos por jornada/premios.
- Altas activas: Computer por ausencia de titularidad en cada división; no
  implica aparición inmediata en los 15 lotes diarios.
- Baja confirmada: no se borra la ficha ni su historia; se mantiene valor
  último. Si pertenece a un manager, permanece en su plantilla y visible
  hasta que venda a Computer (sin ventas a terceros mientras esté inactivo).
  Si estaba libre, se oculta; si estaba en Equipo Malo se archiva y libera
  titularidad sin pago ni traspaso. No se toca titularidad de managers de
  ninguna división. Si vuelve, conserva UUID y titulares que aún lo posean;
  las divisiones donde estaba libre o en Equipo Malo pasan a Computer.
- No se considera baja una descarga parcial: rechazar si faltan clubes,
  fichas o valores, o más de 30 bajas o más del 10% de activos de golpe.
- Mercado > Todos los jugadores: lectura autenticada de la propia división,
  con filtro por propietario, nombre, club o posición. Un inactivo en manos
  de manager se identifica; no se muestran bajas libres/del Equipo Malo.
  No muestra pujas ajenas, PIN, saldo ni datos de otros usuarios.
- Sin cambios de autenticación/sesión, no activar mercado real.

## Desplegado y verificado
El conector Supabase de la cuenta Macroliga confirmó la migración
20261126155255_catalogo_comuniazo_privado_v01, correspondiente al fichero
versionado 202611260004_catalogo_comuniazo_privado.sql. Solo estructura privada.
La función es SECURITY INVOKER, search_path vacío; el catálogo y los
históricos tienen RLS. Revocado EXECUTE/SELECT a anon, authenticated,
service_role y macroliga_runner; sin RLS pública ni permisos nuevos.
Comprobación de BD antes y después: 16 equipos; 0 jugadores, clubes, saldos
contabilizados, titulares, ciclos, importaciones o bajas archivadas.
No se ha ejecutado la función sobre la BD alojada; cero fixtures reales.
Asesor de seguridad antes/después: 5 avisos previos sobre RPC definer y 1
sobre protección de contraseñas filtradas (sin cambios de Auth); 33 a 36
tablas con RLS sin políticas (tres privadas intencionalmente cerradas).
Sin nuevos WARN/ERROR. Reversión estructural en
docs/propuestas/20261126_catalogo_comuniazo_privado_rollback.sql; se niega si
hay datos para no destruir historial.

## Preparado, NO desplegado
- RPC de catálogo de división, parche mínimo de contabilización de venta a
  Computer para inactivos y respectivas reversiones; SQL en docs/propuestas.
  No cambia el importe de la venta ni las reglas de ofertas vigentes.
- Panel de administración usa ahora el mismo núcleo privado (no una segunda
  lógica de carga), huella del último lote para invalidar simulaciones.
- Vista de mercado/consulta en la PWA de desarrollo; no fusionada en main.
  El listado es de una consulta, advierte si alcanza el límite API de 1000;
  antes de soportar otra liga/temporada o >1000 filas añadir paginación.
- Preparador local del lote de importación: npm run catalogo:preparar-lote --
  .macroliga-local/<directorio>/<día>. Verifica huella, fecha, proveedor,
  cobertura e IDs exactos de puntos; fichero privado, sin conexión a BD.
  No ejecuta SQL ni recibe credenciales. El operador propietario puede usar
  los parámetros de la función privada tras validar origen y ventana.
- Pendiente de acreditar la reutilización según el aviso legal de Comuniazo
  (https://www.comuniazo.com/aviso-legal); el acceso público no es lo mismo que
  obtener autorización para reutilizar datos. No hay referencia real aportada
  ni datos persistidos. Diagnóstico anterior: 623 fichas, 551 activos, 72
  históricos, 20 clubes. No compartir descarga ni bases de Laviana.
- Importar tras liquidar el mercado anterior y antes de preparar el siguiente;
  la función rechaza pujas activas, ciclos pendientes y otras temporadas.
  Pendiente integrar ejecución programada y pruebas de extremo a extremo del
  calendario con ese paso; no se ha creado cron.
- Posibles cambios de identificador externo (distinto slug) requieren
  conciliación supervisada; no se fusionan jugadores solo por nombre.

## Pruebas ejecutadas
- npm test: 148/148; npm run check correcto.
- python -B tests/comuniazo_test.py: 17/17 (dependencia declarada instalada
  temporalmente; HTML ficticio), sin una nueva descarga real.
- PostgreSQL local desechable PGlite 0.3.14 / PG 17.5:
  tests/sql/probar_catalogo_comuniazo_local.mjs: 14 migraciones previas reales,
  dos divisiones, 500 fichas ficticias, instalación/rollback, carga, permisos,
  atomicidad, actualización y nombres, nueva alta Computer, baja equipo de
  usuario, baja Equipo Malo auditada, venta de baja a Computer (exactamente
  un abono), reactivación, otra división intacta, ninguna recompensa de puntos.
  Auth y auto-RLS simulados; pgcrypto omitido (UUID nativo).
- tests/sql/probar_admin_arranque_local.mjs: 14 migraciones, núcleo privado,
  propuesta admin, 16 equipos, patrimonio configurable (70M por defecto),
  cuotas, simulación/reparto local, 15 lotes borrador, idempotencia y
  protección contra huella obsoleta; sin pujas/activación.
- El núcleo se probó en las versiones exactas de los ficheros; se verificó
  estructura y ACL de la instancia 17.12. No se hicieron pruebas con los
  usuarios o jugadores reales del piloto.
