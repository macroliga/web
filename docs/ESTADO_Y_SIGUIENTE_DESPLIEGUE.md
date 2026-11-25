# MACROLIGA · Estado comprobado el 25/11/2026

## Infraestructura MACROLIGA

- **GitHub:** `macroliga/web`.
- **Supabase piloto:** `macroliga-piloto`, ref `xuwjbfnhvvbdargcohfe`, región europea.
- **Ocho migraciones** instaladas (0001–0008), 33 tablas públicas de aplicación con RLS activo, dos tablas privadas añadidas por fases (políticas de ventas y ganadores de mercado).
- Datos activos de ejemplo: **cero** usuarios, managers, equipos, futbolistas, ciclos, pujas, movimientos y ganadores congelados.

## Sistemas implementados y probados

- Motor económico transaccional: traspasos, ventas al Computer, ventas al Equipo Malo y compraventas entre managers protegidas por precio y restricciones.
- Precio mínimo para ventas entre managers: valor + **200.000/300.000/400.000/500.000 €**, según tramo de las normas de Comunio Laviana consultadas en **modo lectura**.
- Oferta entre managers aún desactivada en el entorno real hasta autorización del backend y pruebas de red.
- Cierre de mercado en el servidor y ganador congelado (`app_private.cerrar_calcular_ciclo`): orden por puja mayor, tiempo y secuencia, hasta 15 jugadores.
- Publicación desde resultado congelado (`app_private.publicar_ciclo`): operación económica atómica, sin ganadores sustitutos ni doble ejecución.
- Pruebas reales de PostgreSQL con dos identidades ficticias bajo rol `authenticated`: aislamiento de pujas, prohibición de leer datos privados, cierres tardíos y anticipados, rechazo de pujas modificadas y controles de límites. Todos los datos ficticios fueron revertidos.

## Pendiente (no activado)

- **No existe aún cron/Edge Function ejecutando cierres a la 01:00 ni publicaciones a las 06:00.** Las funciones deben invocarse desde un proceso de servidor.
- Falta generar los lotes diarios, la continuidad del segundo día, las ventas automáticas de jugadores sin puja y las reglas completas del Equipo Malo.
- Falta interfaz móvil, registro de managers reales, autenticación extremo a extremo, pruebas reales de carreras entre conexiones distintas y fuente deportiva autorizada.
- Cláusulas de rescisión aún no operativas; se conserva fuente original de 383 filas y extensión pendiente de los criterios de redondeo.
- Permanecen las advertencias conocidas del asesor de seguridad (entre ellas `public.rls_auto_enable()` preexistente); se revisarán antes del piloto real.

## Fuentes de comprobación

- `docs/REGLA_VENTAS_MANAGER_2026-11-25.md`
- `docs/VALIDACION_CIERRE_MERCADO_2026-11-25.md`
- `tests/sql/20261125_roles_cierre_mercado_rollback.sql`
- `tests/sql/20261125_desempate_tope_lotes_rollback.sql`

**Protección permanente:** GitHub `comuniolaviana/web`, Supabase «Comunio Laviana» y su app no han sido modificados por este trabajo.
