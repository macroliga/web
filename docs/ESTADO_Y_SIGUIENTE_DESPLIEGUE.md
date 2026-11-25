# MACROLIGA · Estado tras el mercado diario (25/11/2026)

## Instalado y comprobado exclusivamente en MACROLIGA

- Repositorio: `macroliga/web`.
- Base de datos: Supabase `macroliga-piloto`, ref `xuwjbfnhvvbdargcohfe`.
- **Nueve migraciones aplicadas**, 33 tablas públicas de aplicación protegidas con RLS. Las tablas privadas del motor no se exponen al usuario.
- Economía transaccional: pujas privadas, ventas al Computer/Equipo Malo, ventas entre managers condicionadas a un precio mínimo por tramos.
- Mercado: cierre 01:00, publicación 06:00, resultados congelados, preparación diaria con un máximo de **15 jugadores**, arrastre de los no vendidos del primer día y caducidad después del segundo.
- Equipo Malo recibe automáticamente a los futbolistas no adjudicados tras su segundo día si tienen un valor de mercado **estrictamente inferior a 750.000 €**.
- Pruebas en PostgreSQL real realizadas: dos mercados ficticios seguidos, Equipo Malo, límite de 15, dos divisiones independientes, cambio de horario verano/invierno y cuatro suites anteriores de regresión.
- Todos los ensayos se hicieron con reversión de datos ficticios; sin managers ni dinero virtual de prueba permanente.

## No activado y pendientes

- **Sin cron, sin Edge Function activa ni frontend**. No existe todavía ejecución diaria desatendida.
- Falta una política definitiva sobre puja mínima inicial del Computer; provisionalmente el generador utiliza el valor de mercado.
- Compraventa real entre managers desactivada hasta pasarela de autorización. Cláusulas ordinarias pendientes por criterios de umbrales/redondeo.
- Sin datos deportivos reales importados ni permisos/licencias comprobadas.
- Pendientes pruebas reales entre conexiones simultáneas diferentes, revisión de advertencias de Supabase, copias de seguridad y panel de administración.

Consulta `docs/VALIDACION_MERCADO_DIARIO_2026-11-25.md` y `tests/sql/20261125_mercado_diario_dos_dias_rollback.sql`.

**Comunio Laviana (GitHub y Supabase) sigue fuera de los cambios y protegido.**
