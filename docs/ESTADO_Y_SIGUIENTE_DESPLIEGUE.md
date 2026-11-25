# MACROLIGA — Estado técnico de la fase 1 y autorización de despliegue

## Inventario verificado en solo lectura el 25/11/2026

- `macroliga-piloto` / `xuwjbfnhvvbdargcohfe`: ACTIVE_HEALTHY.
- Esquema `public`: sin tablas de aplicación; sin migraciones; sin Edge Functions.
- GitHub `macroliga/web`: código inicial publicado y verificado el 25/11/2026; revisión de seguridad adicional preparada.
- **No se ha ejecutado ninguna migración ni creado tablas en Supabase.** Los cambios posteriores en GitHub son solo archivos fuente.

## Código desarrollado

- 5 módulos JavaScript del dominio y 4 borradores SQL de migración.
- 49 pruebas automatizadas superadas localmente (incluidas pruebas **estáticas** del contrato SQL); no sustituyen pruebas sobre PostgreSQL real.
- Se utiliza `BigInt` para evitar imprecisiones en los euros y se guarda SQL como `BIGINT` en céntimos.
- Validación inmediata de pujas; nada de permitir ofertas que se corregirían al adjudicar.
- Funciones de puja ligadas a identidad `auth.uid()`; no se acepta el equipo como dato confiable del cliente.
- Lectura de pujas restringida a las propias; sin SELECT directo sobre tabla `bids`.

## Próxima intervención propuesta, NO realizada

**Destino EXCLUSIVO:** Supabase `macroliga-piloto` (`xuwjbfnhvvbdargcohfe`).

Cambios planificados al autorizar un despliegue controlado:

1. Inspección del SQL y prueba de sintaxis/transacciones en PostgreSQL de ensayo.
2. Aplicar migración 0001 para crear 33 tablas sin datos, índices y RLS de denegación por defecto.
3. Aplicar 0002: restricciones compuestas de división y pujas activas.
4. Aplicar 0003 y, tras revisar, 0004: tres funciones RPC `macroliga_presentar_puja`, `macroliga_retirar_puja`, `macroliga_mis_pujas`.
5. Verificar permisos `anon` / `authenticated` con dos usuarios de prueba y dos divisiones.
6. Solo después, preparar acceso a datos no sensibles y herramientas administrativas.

**Riesgos reales:** ejecución de DDL no probada aún sobre PostgreSQL; errores de permisos RLS y SECURITY DEFINER; confusión de proyectos (se evita comprobando ref exacta); nuevas reglas de ventas/cláusulas con pujas pendientes (aún por implementar); ausencia de backups gestionados garantizados en plan gratis; cambios futuros de proveedor de datos.

## Pruebas imprescindibles antes de permitir uso con dinero virtual

- Puja con 15 futbolistas: segunda oferta debe ser rechazada, aunque sobre dinero.
- 16 futbolistas: ni una sola puja.
- 50 millones de plantilla y 10 de saldo: límite 22,5 millones, SUMANDO ofertas vigentes.
- Dos solicitudes de puja simultáneas del mismo equipo: solo las compatibles pasan.
- Dos managers distintos: ninguno puede leer las pujas del otro mediante PostgREST, vistas, RPC o roles mal configurados.
- Una división no puede usar otro equipo ni fichar un jugador de otra división.
- No se permite pujar a partir de la 01:00, según UTC de la ventana concreta; DST de Madrid controlado.
- Retirada de puja libera dinero y plaza; volver a ofertar crea un nuevo instante de prioridad (comportamiento provisional, por validar).
- Al resolverse el ciclo: procesamiento interno 01:00–06:00; publicación y efectos económicos a las 06:00 en **una sola transacción**, SIN adjudicaciones de respaldo por supuesta invalidez de puja.
- Compra o venta instantánea autorizada: propiedad, saldo y libro mayor en una transacción, con clave idempotente.
- Correcciones de puntos: únicamente ajuste incremental, no pago completo repetido.

## Cuestiones a desarrollar antes de implementar el resto

- Reglas de integridad de las pujas cuando una cláusula forzosa reduce patrimonio mientras están reservadas.
- Reglas exactas de las ofertas del Computer y ventanas de sus aceptaciones.
- Instantánea y adjudicación definitiva del mercado en SQL, con reintentos seguros e historial íntegro.
- Desempate secundario de premios cuando empatan también en posición previa.
- Jornadas extra por aplazamientos/adelantos; comprobar reglamento aplicable.
- Fuente deportiva/calendario permitida legalmente, calidad real y licencia.

## Autorización

La publicación del código en GitHub `macroliga/web` fue autorizada y realizada. **No se ha autorizado ni ejecutado la instalación de tablas en Supabase**. Antes de escribir en `macroliga-piloto`, confirmar expresamente la intervención y comprobar la identidad del proyecto. Nunca tocar Comunio Laviana.
