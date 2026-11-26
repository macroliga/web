# MACROLIGA: fuente Comuniazo y descarga independiente

**Decisión confirmada por el usuario:** reproducir el método de extracción de
Comunio Laviana, con proceso, archivos y base de MACROLIGA separados. No se
comparte ninguna descarga, credencial, automatización ni dato de comunidad.

## Referencia comprobada en modo lectura

Se inspeccionaron únicamente los archivos técnicos del repositorio
`comuniolaviana/web`: `experimentos/actualizar_listado_comuniazo.py` (blob
8406720208999b37494a0b82affcd4df6b897c6f), su prueba
`tests/test_equipos_comuniazo.py` y el extractor de fichas
`experimentos/descargar_fichas_comuniazo.py`. No se consultaron archivos de
jugadores descargados, datos privados, base de datos, credenciales o secretos.
No se ejecutó ningún workflow ni se modificó ese repositorio.

El método comprobado en el código de referencia es listado general de
jugadores, índice LaLiga y plantillas de sus 20 clubes, cuatro filtros de
posición y (en otro script) jornadas de fichas individuales. La mera presencia
de un jugador en el listado general **no prueba** que siga en LaLiga.

## Nueva implementación MACROLIGA

- `src/sports/comuniazo.py`: nuevo extractor, basado en el método anterior,
  de las páginas públicas de Comuniazo. Un único lote de datos diario:
  índice `/laliga`, 20 fichas de clubes en `/comunio-apuestas/equipos/`,
  listado general `/comunio-apuestas/jugadores?orden=puntos&posicion=todos&valor=todos`
  y los filtros porteros, defensas, centrocampistas, delanteros.
  Son 26 peticiones HTTP en un lote completo, no una petición única.
- **Activo** significa presente en la sección Jugadores de una de las
  20 plantillas actuales verificadas, con identificador, posición y valor
  válidos. Lesión, sanción, cero puntos o suplencia NO implican baja.
  Un histórico que aparece en noticias, en el listado general o en una
  descarga antigua, pero no en las plantillas actuales, no se incorpora al
  catálogo elegible. Si vuelve a una plantilla válida, vuelve a ser elegible.
- Identidad por slug del enlace de ficha, no por nombre ni por slug
  deducido del nombre. Tolera homónimos y acentos sin fusionarlos.
  Si una ficha tiene dos clubes/posiciones, se rechaza todo el lote.
- Destino fijo HTTPS de Comuniazo, sin redirecciones, secretos ni cookies de
  comunidad. Límites de respuesta y timeout; concurrencia máxima cinco
  fichas de club. No cambia cabeceras para sortear bloqueos.
- Espera las 20 rutas públicas conocidas de 2026/27; si el índice devuelve HTML válido sin enlaces, verifica las 20 fichas directamente. Un error HTTP o de red aborta el lote, sin rutas alternativas. Si devuelve una composición
  distinta o incompleta, aborta. Al menos 15 jugadores por club, 490 activos,
  550 filas generales y 15 por filtro (umbrales del método de referencia).
  Todos los activos necesitan sus datos en el listado y la posición.
  Revisar umbrales y rutas cuando cambie la temporada.
- Conversión exacta de euros enteros a céntimos. Un valor 0 legítimo no hace
  desaparecer el jugador; el motor de arranque y de mercado ya excluye
  valores no positivos. No se inventan precios ausentes.
- De los históricos desconocidos, el informe privado solo conserva su número;
  no guarda su nombre, identidad, valor, puntos ni club. Los jugadores que pertenecieron a
  MACROLIGA conservan su ID, último club/valor registrado y se marcan
  inactivos si salen de las 20 plantillas. Más de 30 bajas o >10% dispara
  revisión, no una desactivación masiva automática.
- Informe diario de altas, reactivaciones, bajas, cambios de precios, clubes
  y posiciones, huella de catálogo, puntos acumulados (informativos) y
  recuento de filas excluidas. No se usan acumulados como puntos por jornada.
- El CLI `scripts/descargar-comuniazo.py` genera snapshot canónico con el
  validador JavaScript existente y su hash verificable; no crea/reparte
  equipos ni modifica Supabase. Un directorio fechado por Europe/Madrid
  por lote, bloqueo exclusivo, fichero anterior preservado, publicación
  atómica solo después de validar todo. Staging y datos permanecen en
  `.macroliga-local/`, ignorada por Git. Una descarga exitosa por fecha;
  ante un fallo se permite reintentar sin reemplazar la última válida.
- La primera fotografía se puede cargar en el Admin preparado en
  `dev/admin-arranque` tras autorización de fuente y de despliegue. El
  repartidor/mercado usa solo activos. La actualización diaria de
  precios/clubes en la DB aún debe tener su RPC transaccional separada y
  reglas de tratamiento de jugadores ya poseídos, pujas y lotes abiertos.
  Sin borrado de titularidades ni cambios de saldo por el mero hecho de que
  un jugador desaparezca del catálogo. La descarga de las fichas individuales
  de jornadas y el sistema de puntuación son siguientes pasos; no se confunde
  el total de puntos con esos datos ni se generan cientos de peticiones ahora.

## Permiso de fuente y utilización (sin automatización activada)

El usuario ha elegido la fuente y el método. El aviso legal de Comuniazo
(https://www.comuniazo.com/aviso-legal, comprobado 26/11/2026) requiere
autorización previa escrita para la reutilización de contenidos. No se ha
encontrado evidencia de permiso específico de Comuniazo para MACROLIGA.
El hecho de que el método de otro proyecto funcione no acredita ese permiso.
No se ha realizado una extracción masiva real ni contratado un servicio.

Para ejecutar después de documentar una base legítima de reutilización, instalar deps de Python en entorno
local y preparar un fichero privado con la referencia **real** (no usar esta
plantilla como si fuera una autorización):

```json
{
  "authorized": true,
  "provider": "comuniazo",
  "competition": "LALIGA",
  "season": "2026_27",
  "permissionRef": "REFERENCIA REAL DE AUTORIZACIÓN O BASE LEGÍTIMA DE USO"
}
```

```sh
python -m pip install -r requirements-comuniazo.txt
python -B scripts/descargar-comuniazo.py --permiso .macroliga-local/permiso-comuniazo.json --directorio .macroliga-local/comuniazo
```

El fichero es un control de operador, no una licencia
verificable criptográficamente ni una sustitución de la autorización del titular.
Nunca incluir permiso con información privada ni credenciales en Git.
El resultado es un catálogo validado y un informe; el permiso de despliegue
en el proyecto piloto sigue siendo independiente.
No se ha programado cron ni lanzado el mercado real.

## Verificaciones ejecutadas

- Python 3 + BeautifulSoup 4.13.4 instalada fuera del repo.
- `PYTHONPATH=/ruta/dependencias python -B tests/comuniazo_test.py`: 15
  pruebas con HTML original ficticio generado localmente, 20 clubes, 500 activos
  y 50 históricos incluidos en la tabla general. 26 lecturas simuladas; se
  rechazan históricos, noticias, clubes incompletos, filas sin identidad,
  posiciones/clubes dobles, valores inválidos, bajas anómalas, URLs externas y
  permiso ausente. Prueba de salida local atómica, fallo sin residuos y
  prevención de segunda extracción diaria; snapshot consumido por el motor JS:
  16 equipos, 240 jugadores activos, 260 libres; sin histórico asignado.
- `npm test`: 143 pruebas superadas; `npm run check`: OK (sin cambiar PIN,
  UI, migraciones ni lógica de reparto).
- Sin pruebas contra las 26 páginas reales: comprobadas en lectura las
  referencias públicas de listado/plantilla y aviso legal, no descarga masiva.
- No se ha tocado ni Laviana ni la base alojada de MACROLIGA.

## Comprobación posterior en vivo (solo lectura)

El acceso a /laliga y a la tabla pública de jugadores devolvió HTTP 200,
sin cuenta, API privada ni contraseña. La autorización de reutilización
mencionada arriba no es una condición técnica de acceso.
La tabla real contiene 627 filas HTML: 623 fichas, 1 cabecera y 3 espacios
publicitarios (celdas colspan=9 vacías o con contenedor axd-desktop/axd-content).
Se corrigió el parser para excluir exclusivamente estos espacios y seguir
rechazando fichas incompletas. Nueva prueba real: 623 fichas validadas con
identificador, precio y puntos acumulados, sin guardar sus contenidos.
Se añadió un diagnóstico del lote completo que solo devuelve contadores,
no produce un archivo ni un snapshot importable. 17 pruebas locales superadas.

Resultado del diagnóstico real completo, 26/11/2026, 16:35 hora peninsular:
20 clubes, **623 fichas generales, 551 activos y 72 sin club actual**.
Se comprobaron los cuatro filtros de posición y no faltaron valores/posiciones
de activos. Sin persistir fichero de futbolistas, sin repartir, sin modificar
Supabase o Laviana. Es una comprobación técnica puntual, no una activación
diaria ni una publicación de la base deportiva.

## Aclaración de procedencia y uso (26/11/2026)

El usuario confirma que MACROLIGA es una liga privada de 16 participantes,
sin ánimo de lucro, publicidad, visitas monetizadas ni distribución pública
del catálogo. La fuente acordada sigue siendo Comuniazo. Los valores de
mercado corresponden al juego Comunio; la web presenta estadísticas que
proceden de terceros. No se afirma que Comuniazo sea titular de cada dato
factual, ni que todo uso privado sea ilegal. Tampoco se presupone que esos
hechos acrediten derechos sobre la extracción sistemática de una base
compilada. La referencia de uso puede ser una base legítima comprobable
distinta de una autorización escrita del portal (por ejemplo, una licencia
de datos aplicable). No registrar una decisión del usuario como licencia
de terceros. La publicación de datos en el piloto sigue pendiente. No
contactar al proveedor sin autorización expresa. Se descarta ComunioStats
como sustitución automática por antecedentes de fiabilidad informados por
el usuario; no modificar Laviana.

## Vista previa de lectura pública, sin Excel ni API

El usuario ratifica que el método acordado es leer las tablas HTML públicas,
como hacía Excel, sin sesiones, datos de comunidad, claves ni API privada.
El control `--permiso` es propio del importador de MACROLIGA, no un control
de acceso de Comuniazo. Se separa la lectura de diagnóstico de la exportación.
La vista previa transmite los campos necesarios por stdin al motor en memoria;
solo imprime contadores, reparto de 16 equipos, rango de valores y factibilidad
de reserva de 15 (2/5/5/3). No se analiza ni publica contenido editorial.
No escribe jugadores, no crea equipos ni ciclos y no afirma una licencia.

```sh
python -B scripts/descargar-comuniazo.py --vista-previa
```

El modo diagnóstico no acepta un directorio, no crea snapshots persistentes
y se rechaza por defecto en el contrato de catálogo de carga. El motor de
simulación lo admite expresamente, sin modificar los permisos SQL.
La condición de exportación e importación sigue diferenciada de la mera
lectura del HTML público. El motor excluye jugadores de valor cero del
reparto y de la reserva elegible, de acuerdo con la lógica SQL.

Resultado real de la vista previa (26/11/2026, 18:50 Europe/Madrid):
HTTP público leído sin sesión; 623 filas generales, 551 activos de 20
clubes y 72 históricos excluidos. Reparto en memoria: 16 equipos, 240
jugadores asignados, 311 elegibles para Computer (15 GK, 107 DEF, 131 MID,
58 FWD). Patrimonio simulado de 70.000.000 €; plantillas entre 36.550.000 €
y 39.880.000 €, diferencia de 3.330.000 €. Hay reserva suficiente para
15 jugadores repartidos 2/5/5/3. Este resultado usa el simulador JavaScript,
no el reparto SQL definitivo. No guarda fichas ni activa la liga.
Tras la ejecución se endureció la respuesta ante errores de índice;
la prueba ficticia confirma que un 429 aborta sin consultar otras rutas.
19 pruebas Python y 157 pruebas Node superadas; comprobación de sintaxis
correcta. No se ha cambiado la base alojada ni Comunio Laviana.
