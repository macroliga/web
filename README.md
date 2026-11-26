# MACROLIGA · Liga piloto 2026/27

Proyecto fantasy independiente, preparado para el piloto de 14–16 managers y para reutilizarse en 2027/28.

**Estado comprobado el 25/11/2026:** base de datos de ensayo instalada en Supabase **`macroliga-piloto`**, proyecto `xuwjbfnhvvbdargcohfe`. No hay managers reales ni cuentas creadas.

**Avance del 26/11/2026:** instaladas en `macroliga-piloto` dos RPC de lectura segura para el equipo propio y las plantillas de rivales de la misma división, ensayadas con identidades ficticias y sin datos persistentes. Añadida una primera portada PWA en `app/`, **todavía sin publicar ni configurar el acceso real**. Se ha configurado una comprobación de código en GitHub Actions, pendiente de confirmar su primera ejecución correcta. Véase [la entrega del 26/11](docs/PRIMERA_PWA_Y_LECTURAS_SEGURAS_2026-11-26.md).

**Recursos protegidos, solo lectura:** repositorio `comuniolaviana/web`, Supabase «Comunio Laviana» y su aplicación. No se comparten claves, datos operativos ni automatizaciones.

## Qué hay realmente instalado

- **Doce migraciones** aplicadas en Supabase **macroliga-piloto** (once del 25/11 y una de lecturas del 26/11).
- 33 tablas públicas con seguridad por filas activada; se han añadido tablas privadas para políticas económicas e instantáneas de ganadores en el esquema `app_private`.
- Tres funciones RPC de pujas (`public.macroliga_presentar_puja`, `public.macroliga_retirar_puja`, `public.macroliga_mis_pujas`) controladas por la identidad del manager.
- Motor económico privado: ventas al Computer y al Equipo Malo, cierre con congelación de ganadores, publicación atómica y aceptación protegida de ofertas entre managers.
- Mercado diario: preparación de **máximo 15 futbolistas**, repiten los no vendidos del primer día; tras el segundo día salen del mercado y los de **menos de 750.000 €** pasan al Equipo Malo. Se calcula por la zona horaria de Madrid y **no hay cron activado**.
- **Ejecutor de mercado preparado en código, todavía SIN ACTIVAR:** `src/server/mercado-ejecutor.mjs` y `scripts/ejecutar-mercado.mjs` permiten planificar cierre, publicación y nuevo mercado; por defecto solo lectura. El rol técnico `macroliga_runner` ya existe con `NOLOGIN`, sin contraseña y con lista blanca vacía. Siguen pendientes las credenciales seguras y la programación.
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

Pruebas adicionales `tests/sql/20261125_roles_cierre_mercado_rollback.sql` y `tests/sql/20261125_desempate_tope_lotes_rollback.sql`: dos identidades bajo rol `authenticated`, pujas de terceros inaccesibles, cierre y publicación separados, ganador congelado, desempate por secuencia del servidor y máximo 15 lotes. Todas pasan en el PostgreSQL real y revierten los usuarios de ensayo.

**Node.js 22:** se ejecutaron 61 pruebas locales de la fase 2 y del ejecutor (todas superadas), incluidas cinco pruebas reproducibles en `tests/integracion_ejecutor_node.test.mjs`. Por separado se ejecutó en PostgreSQL real el ensayo reversible `tests/sql/20261125_runner_reintentos_integracion_rollback.sql`. **La conexión externa real desde Node a Supabase sigue pendiente:** el usuario `macroliga_runner` permanece con `NOLOGIN`, sin contraseña ni cron.

## Código y ejecución local

El código JavaScript está en `src/domain/`; las migraciones SQL en `supabase/migrations/`; y las pruebas en `tests/`.

```bash
npm test
npm run check
npm run market:dry-run # requiere configuración de lectura segura
```

## Documentación de esta fase

- `supabase/migrations/202611250006_ventas_entre_managers_protegidas.sql`
- `supabase/migrations/202611250007_precio_minimo_compraventa_por_tramos.sql`
- `supabase/migrations/202611250008_cierre_y_ganadores_congelados.sql`
- `supabase/migrations/202611250009_mercado_diario_dos_dias.sql`
- `docs/REGLA_VENTAS_MANAGER_2026-11-25.md`
- `docs/VALIDACION_CIERRE_MERCADO_2026-11-25.md`
- `docs/VALIDACION_MERCADO_DIARIO_2026-11-25.md`
- `docs/EJECUTOR_MERCADO_NO_ACTIVADO_2026-11-25.md`
- `supabase/migrations/202611250010_runner_minimos_permisos.sql`
- `tests/sql/20261125_runner_permisos_rollback.sql`
- `docs/USUARIO_TECNICO_EJECUTOR_2026-11-25.md`
- `docs/VALIDACION_CONEXION_NODE_Y_SEGURIDAD_2026-11-25.md`
- `tests/integracion_ejecutor_node.test.mjs`
- `tests/sql/20261125_runner_reintentos_integracion_rollback.sql`
- `supabase/migrations/202611250011_restringir_funcion_auto_rls.sql`
- `tests/sql/20261125_ventas_managers_rollback.sql`
- `datos/clausulas/README.md` y los CSV originales.

## Preparado para prueba de acceso (26/11/2026)

- Verificación SQL reversible repetida con tres managers ficticios y dos divisiones, sin residuos.
- Cliente web corregido para separar clave pública de JWT individual.
- Preparado `npm run test:acceso-real` para dos cuentas **de ensayo creadas mediante Supabase Auth**, sin exponer contraseñas ni claves privadas. La prueba HTTP completa **aún no se ha ejecutado** porque esas cuentas no están provisionadas.
- [Procedimiento y límites de la prueba](docs/PRUEBA_ACCESO_REAL_Y_PRIVACIDAD_2026-11-26.md).

## Pendiente antes de dar acceso a managers reales

- Validar la autorización de los usuarios en las llamadas desde la PWA y probar varios clientes concurrentes.
- El precio mínimo de ventas entre managers **ya está confirmado por tramos**; la función sigue inactiva para uso real hasta disponer de autenticación y autorización segura.
- Implementar la liquidación de cláusulas y sus horarios con reglas de intervalo y redondeo confirmadas.
- **Activar únicamente tras nueva aprobación** el ejecutor preparado para preparación, apertura, cierre y publicación a las 06:00/01:00. Aún no hay cron ni credenciales configuradas; `macroliga_runner` existe sin posibilidad de iniciar sesión.
- Confirmar si la puja mínima del Computer debe ser exactamente el valor de mercado (criterio provisional en el generador).
- Resolver cambios de plantilla/valor posteriores a pujas ya admitidas y la gestión de incidencias.
- Implementar alineaciones, jornadas, premios, correcciones, interfaz y fuentes deportivas con permisos de uso.
- Revisión de seguridad: el acceso de clientes a `public.rls_auto_enable()` se ha revocado sin desactivar su disparador. Quedan tres avisos de funciones autenticadas de pujas (intencionadas), 33 tablas sin políticas de lectura deliberadamente cerradas y comprobaciones de carga pendientes.

**No está operativa todavía la liga piloto ni se han activado tareas programadas.** El motor económico está probado en el contexto limitado documentado.

Consulta `docs/RESULTADOS_MOTOR_ECONOMICO_2026-11-25.md` para el detalle de esta fase.
