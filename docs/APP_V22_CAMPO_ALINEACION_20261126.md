# PWA piloto v22 · 26/11/2026
- Campo táctico móvil, sin fotografías: líneas de delanteros, medios, defensas y portero, seleccionables directamente.
- Siete formaciones: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2 y 5-4-1. Solo jugadores activos del propio equipo y de la posición seleccionada, sin duplicados.
- El cambio de sistema recoloca los jugadores compatibles y muestra explícitamente los sobrantes; no los borra automáticamente. Antes de guardar deben resolverse.
- Once oficial: 11 titulares completos, 1 POR, 3–5 DEF, 3–5 MED, 1–3 DEL. Los borradores personales pueden quedar incompletos si son compatibles con una de las formaciones. No puntúan. La formación se deduce de las posiciones de los titulares; un borrador parcial que sea compatible con varios sistemas puede reabrir en otro compatible.
- Conserva la jornada confirmada, el horario de cierre, bloqueo, versión, autenticación y mercado existentes. La migración backend 202611260014_reglas_formacion.sql reside en dev/catalogo-integracion y refuerza los mismos límites en el RPC existente.
- Pruebas: 143 unitarias; Chromium emulado Pixel 7 con Auth/RPC ficticias; SQL local PostgreSQL 17.5, 7 esquemas válidos y rechazo de alineaciones inválidas, control de propiedad/versión/cierre, regresiones de mercado, rollback y reinstalación.
- Datos: lectura agregada previa confirma que los 16 equipos del piloto tienen jugadores para las siete formaciones. Sin modificar plantillas, saldos, partidos ni alineaciones existentes.
