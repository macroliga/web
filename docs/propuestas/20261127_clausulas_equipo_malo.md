# Cláusulas del Equipo Malo — preparación 27/11/2026

**Estado:** borrador en rama de desarrollo, sin despliegue ni configuración económica.
- UI: referencia exacta de los CSV, botón Pagar cláusula, cotización de servidor y confirmación explícita.
- Cotización: autorización por identidad/división, jugador activo del Equipo Malo, versión más reciente de reglas, límites explícitos sin solapamiento, importe exacto y ventana abierta; verifica plazas, deuda y pujas reservadas. Sin regla o ventana no se paga.
- Pago: precio recalculado, clave idempotente ligada al equipo, bloqueo de división y equipos, reutiliza contabilidad existente y registra `bad_team_clause` en transfer_operations (historial/noticias existentes). Sin abono a manager vendedor. La propiedad se actualiza, no se inserta duplicada.
- La sustitución de la función privada conserva los cuatro tipos anteriores. Rollback restaura su definición observada y retira las dos RPC nuevas; no revierte fichajes ya confirmados.
- **Pendiente de decisión:** precio entre umbrales de la tabla (180.000, 260.000 y 380.000 € actuales no tienen referencia exacta), redondeo e intervalos de cláusulas. Una regla explícita futura puede delimitar un intervalo cerrado; no se carga ninguna regla ni ventana automáticamente. Para actualizar reglas/ventanas en el futuro, serializar con los bloqueos de las divisiones afectadas.
- **Pruebas:** 10 pruebas Node ejecutadas localmente y correctas (4 originales + 6 nuevas). Sintaxis JS comprobada. SQL de aislamiento/pago/rollback preparado, NO ejecutado por ausencia de PostgreSQL local/CLI/Docker. No ejecutar fixtures en la base alojada. Antes de activar: ejecutar sobre esquema real desechable, comprobar permisos/RLS, carreras simultáneas, regresión de otros tipos de traspaso y rollback. Comparar definición privada vigente antes de aplicar, para no sobrescribir cambios concurrentes.
- No se modificó la base alojada, ni se realizaron fichajes reales.
