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
  último, nombre, club, posición y último registro de puntos. Si pertenece a un
  manager, permanece en su plantilla y visible hasta que venda a Computer
  por exactamente ese último valor (sin primas, descuentos ni ventas a
  terceros mientras esté inactivo).
  Si estaba libre, se oculta; si estaba en Equipo Malo se archiva y libera
  titularidad sin pago ni traspaso. No se toca titularidad de managers de
  ninguna división. Si vuelve, conserva UUID y titulares que aún lo posean;
  las divisiones donde estaba libre o en Equipo Malo pasan a Computer.
- No se considera baja una descarga parcial: rechazar si faltan clubes,
  fichas o valores, o más de 30 bajas o más del 10% de activos de golpe.
- Mercado > Todos los jugadores: lectura autenticada de la propia división,
  con búsqueda sin tildes, club, manager/propietario exacto, posición, rangos
  de puntos acumulados y valor en euros, orden por nombre/puntos/valor.
  Los puntos no registrados se distinguen de cero. Un inactivo en manos de
  manager se identifica; no se muestran bajas libres/del Equipo Malo.
  Historial: fecha, jugador, origen, destino, importe y tipo de cada operación
  confirmada de la propia división. No muestra ofertas pendientes, pujas
  ajenas, PIN, saldo, credenciales ni datos de otras divisiones.
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
  Para inactivos, el precio exacto es el último valor congelado, incluso si
  vale cero. Las ofertas antiguas a otro precio se rechazan; la función privada
  preparar_oferta_baja_computer registra una nueva oferta al precio correcto
  sobre un anuncio vigente del titular. Requiere confirmación de la oferta
  actualizada; no cambia las ventas de activos ni los permisos de acceso.
  Esta propuesta económica no está instalada en la instancia alojada.
- Panel de administración usa ahora el mismo núcleo privado (no una segunda
  lógica de carga), huella del último lote para invalidar simulaciones.
- Vista de mercado/consulta en la PWA de desarrollo; no fusionada en main.
  El catálogo usa cursor por UUID (250 por consulta), filtros sobre todos los
  resultados y páginas visibles de 40; máximo de seguridad de 20.250 filas,
  sin presentar datos parciales si se excede. Historial por fecha y UUID,
  50 por consulta, carga a petición. Durante descargas concurrentes podría
  haber una fotografía ligeramente desfasada; reabrir Mercado vuelve a
  consultar. No se persisten lecturas ni se modifica la sesión.
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

## Aclaración de la regla de bajas (26/11/2026)
En el importador ya desplegado se verifica en PostgreSQL local que las filas
inactivas se ignoran para la actualización de ficha, valor y puntos. Dos
descargas sucesivas de una baja, incluida una ficha histórica con precio, club,
nombre y posición distintos, no alteran su última ficha activa ni añaden
observaciones ficticias. La venta a Computer queda pendiente de implantar con
el resto de RPC económicos: la propuesta admite solo el precio congelado,
rechaza ofertas antiguas, conserva la idempotencia y no cambia las ventas
normales. Pruebas adicionales pasadas: venta exacta una sola vez, precio cero,
oferta normal para activo y permisos privados, en PG17.5 desechable.
Ningún cambio adicional en Supabase ni activación de mercado.

## Buscador e historial ampliados (26/11/2026)
Se han actualizado las propuestas de lectura y reversión, con índices para
últimos puntos por jugador y traspasos confirmados. Verificación alojada de
solo lectura: 16 equipos, cero futbolistas, traspasos o ciclos, catálogo
privado de puntos existente; RPC de catálogo aún no instalado.
Pruebas: 151/151 JavaScript, verificación sintáctica correcta. PostgreSQL
17.5 local: catálogo paginado sin repeticiones, puntos congelados, filtros
por división, historial con desempate por UUID, exclusión de pendientes,
revertidos y otras divisiones, rollback y ausencia de permisos para roles
no autorizados. Prueba JavaScript adicional con 1.201 filas. Cambios de PWA
solo en rama de desarrollo. No se ha activado ni ampliado el mercado real.
- Chromium móvil emulado Pixel 7, dependencia temporal local (sin servicio de
  pago): ocho etapas E2E superadas con API/Auth ficticias interceptadas.
  Búsqueda, filtros, historial, baja congelada y ausencia de desbordamiento
  horizontal; navegación, caché sin credenciales, reapertura sin PIN,
  recuperación de fallos/transitorios, dos pestañas y revocación.
