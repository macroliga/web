# Motor de arranque · descarga y reparto · 26/11/2026

**Entrega en rama de desarrollo. No desplegada en Supabase ni activada la competición.**
Base de trabajo: main `0d672eb3e09fda2ff106347947f42971fabd0334` (acceso persistente).
Proyecto exclusivo: macroliga-piloto, `xuwjbfnhvvbdargcohfe`.

## Estado real comprobado en lectura

- Temporada `2026_27`, estado `draft`; división `PILOTO`, máximo 16 jugadores/equipo; objetivo 7.000.000.000 céntimos (70 M€).
- 16 equipos; 0 futbolistas, 0 clubes, 0 identidades de proveedor, 0 importaciones, 0 titularidades, 0 movimientos de caja, 0 ciclos de mercado.
- No se ha modificado ese estado. No se han tocado recursos de Comunio Laviana.

## Motor ejecutable en local

`npm run inicio:simular`: simulación original de 500 futbolistas artificiales y 16 equipos ficticios. Por defecto, ninguna escritura ni archivo generado.
`npm run inicio:simular -- --guardar`: opción explícita, crea un expediente JSON en `.macroliga-local/`, ignorada por Git, sin sobrescritura.
`npm run inicio:preparar -- --catalogo catalogo.json --division division.json --semilla ...`: entrada de archivo autorizado.
`npm run inicio:preparar -- --fuente fuente.json --division division.json --semilla ...`: descarga HTTPS, valida el origen exacto, sin redirecciones, 8 MiB máximo, timeout de 15 s, JSON y metadatos concordantes. Sin credenciales en URL.
`--reglas reglas.json`: cuotas y caja mínima configurables. El programa no tiene modo apply.

### Contrato de datos

La fuente o un adaptador autorizado entrega un JSON:

```json
{
  "schemaVersion": 1,
  "kind": "authorized",
  "provider": "identificador-del-proveedor",
  "competition": "LALIGA",
  "season": "2026_27",
  "currency": "EUR",
  "asOf": "2026-11-26T00:00:00.000Z",
  "permissionRef": "referencia del permiso de reutilización",
  "players": [
    {"externalId":"id-proveedor","name":"Nombre","club":"Club","position":"GK","active":true,"marketValueCents":"100000000"}
  ]
}
```

No se mezclan fuentes por similitud de nombres, ni se inventan valores ausentes ni se interpretan euros como céntimos. Se verifica ID único, posición GK/DEF/MID/FWD, estado y moneda; los valores son enteros en céntimos y se normaliza el orden. SHA-256 identifica cada snapshot y el plan; no equivale a una firma del proveedor ni a justificación de sus derechos.

Configuración local de descarga (ejemplo **no funcional**, no representa proveedor real):

```json
{
  "authorized": true,
  "url": "https://feed.example.invalid/catalogo.json",
  "allowedOrigin": "https://feed.example.invalid",
  "provider": "identificador-del-proveedor",
  "competition": "LALIGA",
  "season": "2026_27",
  "permissionRef": "referencia del permiso de reutilización",
  "auth": "none"
}
```

Para una fuente expresamente autorizada que requiera bearer, usar `"auth":"bearer"`, `MACROLIGA_CATALOGO_BEARER` y `MACROLIGA_CATALOGO_TOKEN_ORIGIN` en el proceso local. El origen debe coincidir; no almacenar credenciales en el repositorio. Este descargador es un CLI de operador de confianza, no un endpoint HTTP para terceros.

División: `divisionId` (UUID real para una futura aplicación), `season`, `status:"draft"`, `maxRoster:16`, `initialWealthCents:"7000000000"`, `teamIds` (IDs de todos los equipos, sin nombres ni PIN).

## Reparto

- 15 futbolistas por equipo, 1 plaza libre en piloto; ID único por división. Un futbolista puede pertenecer a otra división por el modelo existente.
- Patrimonio = valor de plantilla + saldo; exactamente 70 M€ en cada equipo y sin saldo negativo. No aumenta patrimonio para forzar un reparto imposible.
- Propuesta sin aprobar: 2 porteros, 5 defensas, 5 medios, 3 delanteros; 15 jugadores libres como reserva mínima; caja mínima configurable (por defecto 0). Ejemplo con 10 M€ mínimos: `{"minimumCashCents":"1000000000"}`.
- Sorteo reproducible por semilla (hasta 48 ensayos), selección acotada por presupuesto, equilibrio de valor por posición/equipo. Si no encuentra solución, se detiene; no afirma optimalidad global ni aplica datos parciales. Último respaldo: conjunto más barato, únicamente si no hay otro sorteo viable.
- Verificación independiente recalculando el plan canónico; los IDs del plan se vinculan al catálogo por proveedor y externalId. La semilla/criterios deben aprobarse antes de la asignación; no elegirla a posteriori para favorecer a un equipo.
- Ensayo por defecto: 240 asignaciones distintas, 260 jugadores libres, patrimonio exactamente 70 M€ los 16. Son datos artificiales, **NO jugadores reales**.

## Propuesta SQL

`docs/propuestas/20261126_arranque_catalogo_reparto.sql` (no es migración aplicada): función privada SECURITY INVOKER de propietario, sin GRANT a anon/authenticated/service_role/runner. Un solo arranque de catálogo vacío; verifica temporada, división y todos los equipos, cartera cero, ausencia de propietarios/ciclos/importaciones, cuotas, valores y caja recalculados. Registra catálogo histórico, titularidad, saldo y apunte `initial`, auditoría y digest de contenido; todo en una transacción. Reintento exacto devuelve resultado sin duplicar; contenido distinto bloqueado. Divisiones posteriores necesitan el flujo de importación compartido, no se sobrescribe el catálogo global.
La función no activa temporada ni mercado. La reversión DDL solo se permite antes de usarla; tras una asignación, no borra dinero ni titularidades (requerirá compensación y autorización).

## Pruebas realmente ejecutadas

- `npm test`: batería completa: 138 superadas; 13 nuevas pruebas del catálogo, sorteo, presupuesto, permisos de fuente, metadatos y errores de transporte.
- `npm run inicio:test-descarga`: servidor HTTPS efímero con certificado local confiado por el proceso de pruebas, descarga real de 500 filas ficticias; CLI genera 240 asignaciones y 260 libres. Cero accesos a proveedor ni Supabase.
- `npm run inicio:test-sql`: PostgreSQL 17.5 PGlite 0.3.14, y PostgreSQL 19.0 PGlite 0.6.0, en memorias independientes. 11 migraciones reales (0001 a 0010 y lecturas 202611260001), roles Auth simulados localmente. En PG17 solo se omite `CREATE EXTENSION pgcrypto` por no empaquetarla; UUID nativo funciona. No es un ensayo de concurrencia multiproceso ni Supabase Auth real.
- Ensayo de SQL: instalar/revertir/reinstalar estructura; fallar por saldo alterado, equipo ajeno o jugador duplicado y verificar cero residuos; importar las 500 filas y 500 precios, 240 propietarios, 16 apuntes/saldos conciliados, patrimonio 70 M€ exactamente, 10 M€ mínimo configurado; una división ficticia ajena mantiene saldo cero; 0 ciclos. Reintentar sin duplicar, rechazar otro contenido, prohibir ejecución/lectura a los cuatro roles, validar RPC de plantilla y bloqueo entre divisiones, y prohibir borrar estructura con un arranque realizado.
- Reproducción local: instalar fuera del repo `npm install --save-exact --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.3.14`, luego `PGLITE_DIR=/ruta/node_modules/@electric-sql/pglite npm run inicio:test-sql`. Sin instalar servicios, sin DB alojada.

## Fuente deportiva y próximos pasos

No hay una fuente aprobada de jugadores, precios de mercado fantasy, calendario y puntuaciones en la documentación actual. No se debe reutilizar por defecto datos de otro producto: que una web muestre precios no demuestra autorización de extracción/reutilización. Football-data.org documenta plantillas y calendario, pero precisa verificar disponibilidad y derechos del plan, y no se ha confirmado suministro de precios fantasy. FútbolFantasy y LaLiga Fantasy tienen condiciones propias; no se ha contratado, registrado ni descargado su catálogo. Enlaces para comprobar: https://www.football-data.org/pricing , https://www.football-data.org/client/register , https://www.futbolfantasy.com/aviso-legal , https://www.laliga.com/informacion-legal/condiciones-de-uso-fantasy .

1. Identificar fuente autorizada concreta y su formato; crear adaptador sin credenciales en código. Obtener instantánea real, validar cobertura y valores del día, sin publicar datos brutos.
2. Simular con los 16 equipos reales de ensayo en lectura, confirmar cuotas, caja mínima, regla si presupuesto no resulta viable y semilla; aprobar el resultado.
3. Tras aprobación expresa, convertir la propuesta SQL en migración controlada, verificar contra el esquema real y aplicar solo a macroliga-piloto. Confirmar las 16 plantillas y saldos con las RPC existentes.
4. Diseñar importaciones diarias idempotentes de precios, calendario y puntos a las 09:00; no habilitar mercado ni cron en esta entrega.

**No se han introducido fixtures en la base alojada, creado usuarios ni publicado cambios en main.**
