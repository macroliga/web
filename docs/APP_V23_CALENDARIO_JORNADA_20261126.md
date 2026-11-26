# PWA piloto v23 · 26/11/2026
- Rediseño visual de los partidos de la jornada en Alineación: agrupados por día, ordenados por hora de Madrid, equipos local/visitante separados por hora y contador de encuentros.
- No se muestra TIMED/SCHEDULED si el encuentro está programado; se traducen al español los estados relevantes y se identifica una fecha pendiente. No se inventan horarios ni resultados.
- Se conserva la PWA, el motor, la formación, las alineaciones y la base de datos. No cambia ningún partido.
- Pruebas: 145 unitarias, incluidos agrupación con cambio de día en Madrid, estados, representación y limpieza del DOM. Se amplía la regresión E2E móvil; no pudo ejecutarse localmente por falta del binario de Chromium.
