# ComunioStats: alternativa independiente de datos deportivos

MACROLIGA debe obtener seis datos distintos: nombre, valor, club actual,
posición, puntos de temporada y puntos de una jornada identificada. No se
utilizan datos de Comunio Laviana; no se cambian sus procesos.

## Comprobación real de lectura pública (26/11/2026)

- `https://stats.comunio.es/` indica 551 jugadores activos (igual que el
  diagnóstico previo de Comuniazo). `https://stats.comunio.es/search` ofrece
  posición, inclusión de inactivos, filtros de valor/puntos, temporada y
  rango de jornadas. Sin inicio de sesión ni acceso a comunidad.
- El formulario estándar envía `GET /search.php`: las cuatro posiciones
  `pos[]=t,a,m,s` como cuatro parámetros, temporada 2027 (2026/27), sin
  `inclInactive`. `chkGd=all` da acumulado; `chkGd=sel` con
  `startGd=endGd=13` da la jornada 13. Los resultados tienen 25 filas/página
  y 23 páginas anunciadas. No se ha tratado de eludir ese tamaño de página.
- Dos peticiones estándar a la primera página devolvieron HTTP 200 y el
  total anunciado 551. El parser leyó 25 filas en cada modo y cruzó las 25
  por ID numérico del enlace de perfil. En 21 filas los puntos de temporada
  y de jornada 13 diferían. No se comprobó el conjunto completo ni la
  licencia de reutilización de sus datos. No se guardaron catálogos ni
  filas reales en GitHub/Supabase. Se eliminaron los HTML temporales.
- Las posiciones vienen en el texto alternativo del icono, el club en el
  icono de club, el valor en euros enteros, y el total de puntos en su
  columna. No hace falta copiar imágenes, noticias o estadísticas extra.

## Implementación y seguridad

`src/sports/comuniostats.py` es un parser de páginas de resultados ya
obtenidas; no realiza tráfico HTTP ni escrituras. `parse_search_page` valida
la temporada, actividad, todas las posiciones, filtros, rango de puntos,
paginación, cabecera, identidad y tipos. `combine_search_pages` comprueba
las 23 páginas esperadas para 551 jugadores (número dinámico), 20 clubes y
los cuatro tipos de posición. `join_season_and_matchday` cruza por ID;
no mezcla precios o clubes de fotografías distintas. Los puntos de jornada
se devuelven como observados, con un campo definitivo nulo hasta una
comprobación separada del cierre de toda la jornada. No abona premios.

La cobertura del listado de activos NO basta para calcular jornadas pasadas
si hubo bajas o traspasos. Un futbolista que pertenecía al catálogo debe
seguir teniendo identidad aunque ya no esté activo; no inferir sus puntos
como cero sin evidencia ni borrar propiedad. La fuente de puntos históricos
y el cierre de jornada se integrarán por separado. Los IDs numéricos de
ComunioStats no son slugs de Comuniazo; no mezclar ambos de forma implícita.

Se mantiene el extractor de Comuniazo, las condiciones de procedencia y el
importador alojado existente. La consulta pública no acredita por sí misma
una licencia para copiar toda la base. ComunioStats es una alternativa
tecnológica, no una autorización jurídica comprobada. Antes de elegir una
fuente deportiva persistente, verificar su base legítima de uso y preparar
una migración de proveedor reversible si es necesario. No activar cron,
mercado real ni modificar Laviana. No hay cambios alojados en esta entrega.

## Pruebas

`PYTHONPATH=/ruta/dependencias python -B tests/comuniostats_test.py`: 11
pruebas con dos conjuntos ficticios de 551 jugadores, 20 clubes, cobertura
completa y errores de filtros, páginas, temporada, identidad, precio,
puntuación, negativos y estados de jornada. No usa red ni datos reales.
