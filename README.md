# MACROLIGA · Liga piloto 2026/27

Proyecto fantasy independiente, preparado para el piloto de 14–16 managers y para reutilizarse en 2027/28.

**Estado comprobado el 25/11/2026:** base de datos de ensayo instalada en Supabase **`macroliga-piloto`**, proyecto `xuwjbfnhvvbdargcohfe`. No hay managers reales ni cuentas creadas.

**Recursos protegidos, solo lectura:** repositorio `comuniolaviana/web`, Supabase «Comunio Laviana» y su aplicación. No se comparten claves, datos operativos ni automatizaciones.

## Qué hay realmente instalado

- **Siete migraciones** aplicadas en Supabase **macroliga-piloto** (`202611250001` a `202611250007`).
- 33 tablas públicas con seguridad por filas activada; se ha añadido una tabla de políticas económicas en el esquema privado `app_private`.
- Tres funciones RPC de pujas (`public.macroliga_presentar_puja`, `public.macroliga_retirar_puja`, `public.macroliga_mis_pujas`) controladas por la identidad del manager.
- Motor económico privado: ventas al Computer y al Equipo Malo, publicación atómica de mercado y aceptación de ofertas entre managers.
- **Precio mínimo por tramos confirmado desde `comuniolaviana/web/normas.html`, apartado 9**, aplicado exclusivamente en MACROLIGA: valor +200.000 €, +300.000 €, +400.000 € o +500.000 € según tramo. **Ventas entre managers aún desactivadas** hasta tener autenticación y pasarela segura.
- Recompra por compraventa bloqueada durante dos meses; los cálculos de saldo y plazas reservadas se comprueban al transferir.
- Tabla original de cláusulas (383 filas) conservada en `datos/clausulas/`, con extensión de ejemplos hasta 200 millones. Los cobros de cláusulas siguen sin activarse.
- Ninguna función económica puede ejecutarse directamente desde la cuenta anónima; el backend de confianza debe proteger la autorización de cada operación.

## Pruebas realizadas

Los módulos `src/domain/` superaron anteriormente 49 pruebas locales. La prueba adicional `tests/sql/20261125_motor_economico_rollback.sql` se ejecutó con éxito en el PostgreSQL real del piloto y verificó:

- Mayor puja ganadora, descuento íntegro, cambio de propietario e historial.
- Venta inmediata al Computer por importe de la oferta y al Equipo Malo por valor de mercado.
- No pagar dos veces por un reintento con la misma clave.
- Rechazo de una segunda venta y de operaciones sin propietario.
- Bloqueo de publicación anterior a la hora prevista.
- Rollback total de un ciclo cuando uno de sus lotes es inconsistente, sin elegir otro ganador.
- Prohibición de incorporar un 17.º jugador.
- Conciliación del saldo con el libro de movimientos.

Las pruebas de `tests/sql/20261125_ventas_managers_rollback.sql` comprobaron también en PostgreSQL real: venta de manager a manager, precio mínimo inactivo, rechazo de importes inferiores al suelo de prueba, idempotencia, recompra antes de dos meses, saldo sin crédito suficiente, ventas que dejarían pujas sin cobertura y compras que superarían las plazas reservadas. La política usada en las pruebas se revierte.

**Los datos ficticios se revierten dentro del propio bloque de prueba** y se verificó después que `auth.users`, `managers`, `teams`, `players`, `wallet_entries` y `transfer_operations` tienen cero registros.

## Código y ejecución local

El código JavaScript está en `src/domain/`; las migraciones SQL en `supabase/migrations/`; y las pruebas en `tests/`.

```bash
npm test
npm run check
```

## Documentación de esta fase

- `supabase/migrations/202611250006_ventas_entre_managers_protegidas.sql`
- `supabase/migrations/202611250007_precio_minimo_compraventa_por_tramos.sql`
- `docs/REGLA_VENTAS_MANAGER_2026-11-25.md`
- `tests/sql/20261125_ventas_managers_rollback.sql`
- `datos/clausulas/README.md` y los CSV originales.

## Pendiente antes de dar acceso a managers reales

- Validar la autorización de los usuarios en las llamadas desde la PWA y probar varios clientes concurrentes.
- **Aprobar y configurar el mínimo de las ventas entre managers**; el motor ya puede ejecutar la aceptación en pruebas, pero permanece desactivado para uso real.
- Implementar la liquidación de cláusulas y sus horarios con reglas de intervalo y redondeo confirmadas.
- Automatizar el cálculo previo del ciclo (`calculated`), los 15 lotes, la retención de un segundo día, Equipo Malo para no vendidos de bajo valor y el disparo automático a las 06:00.
- Resolver cambios de plantilla/valor posteriores a pujas ya admitidas y la gestión de incidencias.
- Implementar alineaciones, jornadas, premios, correcciones, interfaz y fuentes deportivas con permisos de uso.
- Revisar alertas del asesor de seguridad antes de producción. La función preexistente `public.rls_auto_enable()` quedó intacta.

**No está operativa todavía la liga piloto ni se han activado tareas programadas.** El motor económico está probado en el contexto limitado documentado.

Consulta `docs/RESULTADOS_MOTOR_ECONOMICO_2026-11-25.md` para el detalle de esta fase.
