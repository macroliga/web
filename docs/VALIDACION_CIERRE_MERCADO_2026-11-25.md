# MACROLIGA · Cierre y cálculo del mercado (25/11/2026)

## Estado instalado y comprobado

**Destino de la intervención:** Supabase `macroliga-piloto` (`xuwjbfnhvvbdargcohfe`), únicamente. No se ha utilizado ninguna función de escritura en Comunio Laviana.

Se ha aplicado correctamente la octava migración `supabase/migrations/202611250008_cierre_y_ganadores_congelados.sql`.

El ciclo distingue:

- **Apertura:** pujas aceptadas por su identidad y dentro de `opens_at` a `closes_at`.
- **Cierre/cálculo (01:00 hora española, según la ventana programada):** `app_private.cerrar_calcular_ciclo(cycle_id)` bloquea el ciclo, verifica el horario, prohíbe más de 15 lotes, detecta pujas fuera de plazo y guarda el resultado en `app_private.market_winners`.
- **Publicación (06:00, según `publishes_at`):** `app_private.publicar_ciclo(cycle_id)` usa **los ganadores congelados**, verifica que sus importes no han cambiado y aplica fichajes, saldos, historial y estados de pujas dentro de una única transacción. Si hay una inconsistencia aborta toda la publicación, sin elegir a otro ganador.

Las funciones públicas para presentar y retirar una puja toman un bloqueo compartido sobre el ciclo. Así se impide aceptar nuevas operaciones mientras el cierre adquiere su bloqueo exclusivo.

**Privacidad:** la tabla de ganadores está dentro del esquema no expuesto `app_private`. La función de cierre no tiene permiso de ejecución para `anon` ni `authenticated`.

## Pruebas ejecutadas en PostgreSQL real

- `tests/sql/20261125_motor_economico_rollback.sql`: pruebas económicas existentes adaptadas al cierre previo; superadas.
- `tests/sql/20261125_roles_cierre_mercado_rollback.sql`: dos usuarios con rol PostgreSQL `authenticated`, cada uno ve únicamente sus pujas; rechazo de retirada ajena; acceso directo a tabla de pujas o ganadores denegado; cierre antes de hora rechazado; cálculo repetido no duplica; puja modificada tras el cierre bloquea la publicación; sin movimientos parciales.
- `tests/sql/20261125_desempate_tope_lotes_rollback.sql`: mismo importe y marca de tiempo desempata por la secuencia del servidor; ciclo de 16 futbolistas rechazado.

Todas las pruebas se ejecutaron mediante bloques con **excepción centinela que revierte los datos ficticios**. La revisión posterior confirmó cero cuentas Auth, managers, equipos, jugadores, ofertas, ciclos, transferencias, apuntes económicos y ganadores congelados.

La configuración de ventas entre managers continúa desactivada, aunque el precio mínimo por tramos ya está implementado.

## Qué NO se ha hecho

- **No hay cron ni Edge Function activados.** El cierre y la publicación requieren todavía un proceso de servidor que invoque estas funciones a las horas programadas.
- No hay aún distribución automática de los hasta 15 jugadores diarios, arrastre al segundo día ni tratamiento definitivo de lotes sin vender.
- No están verificadas dos conexiones de red concurrentes independientes; las pruebas anteriores representan dos identidades/roles dentro de un mismo ensayo PostgreSQL y comprueban bloqueos por diseño. Antes de abrir el piloto deben probarse carreras reales.
- No existen todavía interfaces, managers reales, fuentes deportivas autorizadas ni plantillas iniciales asignadas.
- Quedan avisos del asesor de seguridad ya conocidos. Revisar especialmente `public.rls_auto_enable()` antes de exponer el sistema. No se modificó en esta fase.

## Siguiente intervención recomendada

Diseñar el proceso de segundo día del mercado y el ejecutor horario **sin activarlo todavía**, además de preparar pruebas de concurrencia desde dos conexiones distintas y autenticación del servidor.

**Nunca ejecutar ni copiar las migraciones a Comunio Laviana.**
