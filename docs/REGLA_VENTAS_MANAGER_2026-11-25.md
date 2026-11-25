# MACROLIGA · Precio mínimo de venta entre managers

**Norma confirmada el 25 de noviembre de 2026** tras consultar en **modo lectura** `comuniolaviana/web` → `normas.html`, apartado «9. Precios mínimos de compraventa».

Fuente: https://comuniolaviana.github.io/web/normas.html

| Valor de mercado | Precio mínimo |
|---|---|
| Menos de 500.000 € | Valor + 200.000 € |
| 500.000 € a 1.000.000 € (ambos incluidos) | Valor + 300.000 € |
| 1.000.001 € a 2.000.000 € (ambos incluidos) | Valor + 400.000 € |
| Más de 2.000.000 € | Valor + 500.000 € |

Ejemplos: valor 800.000 € → mínimo 1.100.000 €; valor 5.000.000 € → mínimo 5.500.000 €.

## Implantación

- Migración: `supabase/migrations/202611250007_precio_minimo_compraventa_por_tramos.sql`.
- Función exacta: `app_private.precio_minimo_venta_manager(bigint)`, dinero en céntimos.
- `app_private.aceptar_oferta_manager` llama a la función cuando se pretende aceptar una oferta.
- Se ha retirado la exigencia del antiguo porcentaje, sin borrar el campo heredado. El campo `min_sale_percent` debe permanecer `NULL` y no se usa.
- Los importes del mercado se consideran euros enteros, como la tabla original. Un precio que contenga fracciones de euro se rechaza expresamente hasta definir la interpretación; no se inventan tramos para céntimos.
- Configuración de ventas entre managers **desactivada por defecto**; la migración no ha habilitado operaciones reales ni ha creado equipos.
- Las operaciones solo están habilitadas para un servidor de confianza con control de identidad, no desde el navegador.

## Verificación realizada

Diez pruebas directas en PostgreSQL real sobre límites de 499.999 / 500.000 / 1.000.000 / 1.000.001 / 2.000.000 / 2.000.001 € y valores adicionales: resultado correcto en los diez casos.

Actualización de `tests/sql/20261125_ventas_managers_rollback.sql`: prueba integral con equipos ficticios, precio mínimo por tramos, restricción de recompra, idempotencia, saldo, plazas y pujas; pasa sin dejar datos de ensayo.

**Protección:** Comunio Laviana solo fue consultado, nunca modificado. La séptima migración se aplicó exclusivamente al proyecto Supabase `macroliga-piloto` (`xuwjbfnhvvbdargcohfe`).
