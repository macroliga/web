# MACROLIGA — Estado verificado y siguiente entrega (25/11/2026)

## Alcance y seguridad
- Repositorio permitido: `macroliga/web`.
- Proyecto Supabase permitido: `macroliga-piloto`, referencia `xuwjbfnhvvbdargcohfe`.
- Recursos de Comunio Laviana: estrictamente **solo lectura**; no compartir credenciales ni modificar código, tablas, usuarios o tareas.
- Este archivo es documentación: no activa ningún servicio ni cambia esquemas.

## Comprobación directa de Supabase (solo lectura)
Consulta efectuada el 25/11/2026:
- 33 tablas en esquema `public` y 3 en `app_private`.
- 7 funciones privadas con prefijo `runner_`.
- Cero registros en `public.managers`, `public.teams`, `public.players`, `public.market_cycles` y `public.wallet_entries`.
- Migraciones instaladas enumeradas por el conector: 11, incluyendo control transaccional, mercado de dos días y rol mínimo de ejecución.
- Sin Edge Functions publicadas.

**Advertencia:** el README del repositorio documenta pruebas anteriores (61 pruebas Node y SQL reversible). En esta revisión no se han vuelto a ejecutar esas pruebas; se ha contrastado directamente el inventario de tablas, funciones y datos.

## Decisiones del juego que deben conservarse
- Máximo 16 futbolistas y máximo de pujas activas igual a plazas libres.
- Suma de pujas activas <= saldo + 25 % del valor de la plantilla.
- Ofertas secretas, mayor importe ganador y empate adjudicado a la oferta registrada primero.
- Mercado cerrado a las 01:00, cálculo del ganador durante la madrugada, publicación efectiva a las 06:00 (hora Europe/Madrid).
- Venta al Computer y al Equipo Malo: cambio de propietario y dinero inmediato al aceptar; respetar ventanas de oferta y operación.
- Calendario de partidos con fuente actualizable y cuenta atrás en Alineación; bloqueo de once al primer partido.
- Puntos deportivos con descarga diaria prevista a las 09:00; correcciones económicas idempotentes.
- Liga piloto independiente, sin cuentas reales ni datos de Comunio Laviana.

## Próxima entrega recomendada
**Prioridad 1: autenticación de 16 managers y lecturas seguras para la PWA.**
1. Inspeccionar columnas y restricciones exactas de las tablas `managers`, `teams`, `wallet_entries`, `roster_ownership` y RPC existentes.
2. Diseñar altas por administrador, credenciales iniciales protegidas y recuperación posterior, sin guardar contraseñas en texto claro.
3. Crear contrato de acceso de lectura mínimo: perfil y plantilla propia, equipos rivales, clasificaciones y alineaciones publicadas; no exponer pujas ajenas ni saldos privados.
4. Escribir pruebas reproducibles de permisos (manager A no puede acceder a datos reservados del manager B; anónimo no puede mutar economía).
5. Implementar primero contra identidades y jugadores ficticios en entorno de ensayo; verificar rollback.
6. Sólo después preparar una PWA de demostración sin conectar cuentas reales.

**Prioridad 2: integración y automatización del motor.**
- No activar el runner sin credenciales independientes de mínimos permisos, ejecución reproducible, ensayos de concurrencia y autorización explícita.
- Reconciliar la hora de liquidación/publicación de transferencias y las ventas inmediatas en pruebas.
- Preparar alertas y reintentos; contemplar cambios de hora Europe/Madrid.

**Prioridad 3: datos deportivos y juego completo.**
- Comprobar condiciones legales de Comuniazo y API de calendario antes de conectarlas.
- Implementar cláusulas, alineaciones, puntuaciones, ajustes de premios, historial y administración.
- Simular al menos dos ciclos completos de mercado, una jornada con aplazamiento y una corrección de puntos.

## Riesgos y decisiones bloqueantes
- La infraestructura observada aún no constituye una liga jugable ni una PWA publicada.
- Una fuente deportiva accesible técnicamente no garantiza derechos de extracción/reutilización.
- El superusuario de Supabase podría acceder a datos privados por privilegios técnicos; los controles deben proteger la aplicación normal, sin prometer invisibilidad criptográfica absoluta.
- No realizar altas de managers reales, activar cron o modificar recursos protegidos antes de aprobación específica.

## Comprobaciones antes de declarar la primera entrega operativa
- Pruebas automatizadas reproducibles y salidas registradas.
- Validación de RLS y ausencia de permisos de escritura directa desde cliente.
- Operaciones económicas atómicas e idempotentes.
- Rollback de pruebas sin usuarios ni transferencias ficticias residuales.
- Revisión de secretos y recursos objetivo.
