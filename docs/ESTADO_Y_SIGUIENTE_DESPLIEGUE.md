# MACROLIGA — Estado actualizado al 25/11/2026

> Este documento sustituye el inventario inicial anterior al despliegue. Los historiales de migración en GitHub conservan los borradores originales, pero **ya se han aplicado las cinco primeras migraciones a macroliga-piloto**.

## Estado confirmado

- `macroliga-piloto` (ref `xuwjbfnhvvbdargcohfe`): activo en región europea.
- 33 tablas instaladas con seguridad por filas activada.
- 5 migraciones registradas en Supabase; última: motor económico transaccional.
- 3 funciones públicas controladas de pujas y 4 privadas de contabilidad/venta/publicación.
- Prueba integrada en PostgreSQL real superada con rollback automático: cero datos de managers y traspasos.
- Ninguna conexión ni recurso de Comunio Laviana modificado.

## Lo siguiente NO está operativo

Cuentas reales, interfaz móvil, descargas deportivas, cierres automáticos, calendario conectado, ventas entre managers, cláusulas, premios por jornadas y cron.

## Próxima fase

Finalizar reglas mínimas de ventas entre managers y cláusulas, construir la autorización de API, realizar tests con varias sesiones simultáneas y dejar un plan de respaldo y recuperación. No activar la competición sin superar las pruebas de seguridad.

**Detalles verificables:** `docs/RESULTADOS_MOTOR_ECONOMICO_2026-11-25.md`, `tests/sql/20261125_motor_economico_rollback.sql`.
