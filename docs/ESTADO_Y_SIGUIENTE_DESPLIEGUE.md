# MACROLIGA · Estado tras el mercado diario (25/11/2026)

## Instalado y comprobado exclusivamente en MACROLIGA

- Repositorio: `macroliga/web`.
- Base de datos: Supabase `macroliga-piloto`, ref `xuwjbfnhvvbdargcohfe`.
- **Once migraciones aplicadas**, 33 tablas públicas de aplicación protegidas con RLS. Las tablas privadas del motor no se exponen al usuario.
- Economía transaccional: pujas privadas, ventas al Computer/Equipo Malo, ventas entre managers condicionadas a un precio mínimo por tramos.
- Mercado: cierre 01:00, publicación 06:00, resultados congelados, preparación diaria con un máximo de **15 jugadores**, arrastre de los no vendidos del primer día y caducidad después del segundo.
- Equipo Malo recibe automáticamente a los futbolistas no adjudicados tras su segundo día si tienen un valor de mercado **estrictamente inferior a 750.000 €**.
- Pruebas en PostgreSQL real realizadas: dos mercados ficticios seguidos, Equipo Malo, límite de 15, dos divisiones independientes, cambio de horario verano/invierno y cuatro suites anteriores de regresión.
- Todos los ensayos se hicieron con reversión de datos ficticios; sin managers ni dinero virtual de prueba permanente.

## Ejecutor preparado (código, NO operativo)

- Planificador con `--dry-run` predeterminado: calcula acciones sobre divisiones aprobadas y temporadas activas.
- Transacciones SQL existentes: cierre a la 01:00, publicación a las 06:00, preparación y apertura del nuevo mercado.
- Bloqueos: sin días saltados, sin mercado posterior cuando falle el anterior, reintento sin repetir ciclos y rechazo de bases ajenas al piloto.
- Adaptador PostgreSQL: host exclusivo de `macroliga-piloto`, usuario exigido `macroliga_runner`, y **solo siete funciones privadas verificadas**. El rol no puede consultar tablas directamente.
- Pruebas PostgreSQL con `SET ROLE` temporal y reversión íntegra: permisos internos, lista blanca, segundo día, Equipo Malo y recuperación tras error comprobados. Pruebas de Node.js 22 en un conjunto local: **61/61** superadas.
- **Conexión segura:** adaptador exclusivo del proyecto, TLS con validación, rol `macroliga_runner`, bloqueo de parámetros `sslmode` y puertos ajenos. No hay aún prueba Node conectada directamente a Supabase: `macroliga_runner` sigue `NOLOGIN` y sin contraseña.
- Documentación detallada: `docs/EJECUTOR_MERCADO_NO_ACTIVADO_2026-11-25.md`.

## No activado y pendientes

- **Sin cron, sin Edge Function activa ni frontend**. No existe todavía ejecución diaria desatendida. El rol SQL `macroliga_runner` está creado con `NOLOGIN`, sin contraseña y sin divisiones autorizadas; no hay credenciales de ejecución configuradas.
- Falta una política definitiva sobre puja mínima inicial del Computer; provisionalmente el generador utiliza el valor de mercado.
- Compraventa real entre managers desactivada hasta pasarela de autorización. Cláusulas ordinarias pendientes por criterios de umbrales/redondeo.
- Sin datos deportivos reales importados ni permisos/licencias comprobadas.
- Pendientes conexión externa real Node/PostgreSQL con gestor de secretos, pruebas concurrentes con conexiones distintas, copias de seguridad y panel de administración. Advertencias restantes: tres RPC de pujas con `SECURITY DEFINER` para authenticated y 33 tablas con RLS sin políticas generales. El aviso anónimo de `public.rls_auto_enable()` fue resuelto en la migración 0011.

Consulta `docs/VALIDACION_MERCADO_DIARIO_2026-11-25.md` y `tests/sql/20261125_mercado_diario_dos_dias_rollback.sql`.

**Comunio Laviana (GitHub y Supabase) sigue fuera de los cambios y protegido.**

Documento actualizado de la cuenta técnica: `docs/USUARIO_TECNICO_EJECUTOR_2026-11-25.md`.

Resultados y límites: `docs/VALIDACION_CONEXION_NODE_Y_SEGURIDAD_2026-11-25.md`.
