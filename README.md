# MACROLIGA · Liga piloto 2026/27

Proyecto fantasy independiente, preparado para el piloto de 14–16 managers y para reutilizarse en 2027/28.

**Estado comprobado el 25/11/2026:** base de datos de ensayo instalada en Supabase **`macroliga-piloto`**, proyecto `xuwjbfnhvvbdargcohfe`. No hay managers reales ni cuentas creadas.

**Recursos protegidos, solo lectura:** repositorio `comuniolaviana/web`, Supabase «Comunio Laviana» y su aplicación. No se comparten claves, datos operativos ni automatizaciones.

## Qué hay realmente instalado

- Cinco migraciones aplicadas en **macroliga-piloto** (`202611250001` a `202611250005`).
- 33 tablas con seguridad por filas activada, sin acceso directo a las tablas para roles `anon` y `authenticated` por defecto.
- Tres funciones RPC de pujas (`public.macroliga_presentar_puja`, `public.macroliga_retirar_puja`, `public.macroliga_mis_pujas`) controladas por la identidad del manager.
- Cuatro funciones privadas económicas en `app_private`: contabilidad interna, ventas al Computer, ventas al Equipo Malo y publicación atómica de un ciclo de mercado.
- La cuenta con `service_role` puede invocar las tres funciones económicas de entrada. El motor interno no tiene permiso directo para roles cliente. **No exponer secretos en el frontend.**

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

**Los datos ficticios se revierten dentro del propio bloque de prueba** y se verificó después que `auth.users`, `managers`, `teams`, `players`, `wallet_entries` y `transfer_operations` tienen cero registros.

## Código y ejecución local

El código JavaScript está en `src/domain/`; las migraciones SQL en `supabase/migrations/`; y las pruebas en `tests/`.

```bash
npm test
npm run check
```

## Pendiente antes de dar acceso a managers reales

- Validar la autorización de los usuarios en las llamadas desde la PWA y probar varios clientes concurrentes.
- Implementar ofertas entre managers con precio mínimo definitivo y todas las cláusulas y sus horarios.
- Automatizar el cálculo previo del ciclo (`calculated`), los 15 lotes, la retención de un segundo día, Equipo Malo para no vendidos de bajo valor y el disparo automático a las 06:00.
- Resolver cambios de plantilla/valor posteriores a pujas ya admitidas y la gestión de incidencias.
- Implementar alineaciones, jornadas, premios, correcciones, interfaz y fuentes deportivas con permisos de uso.
- Revisar alertas del asesor de seguridad antes de producción. La función preexistente `public.rls_auto_enable()` quedó intacta.

**No está operativa todavía la liga piloto ni se han activado tareas programadas.** El motor económico está probado en el contexto limitado documentado.

Consulta `docs/RESULTADOS_MOTOR_ECONOMICO_2026-11-25.md` para el detalle de esta fase.
