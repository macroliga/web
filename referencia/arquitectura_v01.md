# MACROLIGA — Arquitectura funcional y técnica, versión de diseño 0.1

**25/11/2026 · Documento de trabajo, no implementación.**

## 1. Objetivo

Liga piloto de invierno 2026/27 para 14–16 managers. Preparación para 2027/28 con tres divisiones de 16–17 managers, mercados, clasificaciones, presupuestos y plantillas independientes. Aplicación web móvil/PWA con estética inspirada en Comunio Laviana, pero código, base de datos y credenciales independientes.

Servicios previstos: frontend en GitHub Pages, Supabase Auth/Postgres/funciones de servidor para juego y economía, agenda de tareas según compatibilidad del plan gratuito, datos externos mediante conectores sustituibles. Cloudflare R2 solo si es necesario y autorizado.

### Separación obligatoria

- Supabase `macroliga-piloto`: exclusivamente datos de MACROLIGA.
- GitHub `macroliga/web`: exclusivamente código de MACROLIGA.
- Comunio Laviana (`comuniolaviana/web`, Supabase `Comunio Laviana`) permanece intocable.
- Ni claves `service_role`, ni credenciales API, ni pujas privadas en el navegador, HTML público, logs de cliente ni GitHub.

## 2. Modelo de datos propuesto

### A. Identidad y competición

- `competitions`: competición y parámetros generales.
- `seasons`: cada edición/piloto y sus fechas.
- `divisions`: divisiones por temporada con reglas y autonomía.
- `managers`: perfil vinculado a Supabase Auth.
- `teams`: participación de un manager en una división y temporada, nombre editable, saldo y estado.
- `team_memberships`: si se requiere continuidad y roles históricos; en primer borrador una fila de `teams` ya identifica la participación.

### B. Catálogo deportivo

- `football_clubs`: clubes reales.
- `players`: futbolistas con identificador interno estable.
- `provider_player_ids`: correspondencia de cada jugador con proveedores externos (evita acoplamiento a Comuniazo).
- `player_market_values`: historial de valores por instante/fuente.
- `sport_import_runs`: fecha, fuente, estado, integridad y trazabilidad de cada actualización.
- `fixtures`: partidos de LaLiga con estado, horario, jornada y marcas de sincronización.
- `player_fixture_points`: puntos del futbolista por partido o por unidad deportiva verificable; conservar revisión y fuente.

### C. Plantillas y economía

- `roster_ownership`: titularidad presente de cada futbolista en cada división (un futbolista puede existir en otra división).
- `roster_events`: historial inmutable de cada entrada/salida.
- `wallet_entries`: libro mayor de ingresos y gastos, con identificador único de operación. `teams.balance_cents` se considera proyección sincronizada por transacciones en servidor; nunca se modifica desde cliente.
- `transfer_operations`: operación económica, partes, importe, estado y sello temporal.

### D. Mercado

- `market_cycles`: ventanas del Computer (06:00–01:00), cierre 01:00, publicación 06:00; estados preparado, abierto, cerrado, calculado, publicado.
- `market_lots`: futbolistas ofertados por Computer; máximo 15 visibles por división y ciclo; arrastre un día y retirada posterior; compra por Equipo Malo si corresponde a reglas.
- `bids`: una puja activa por jugador y manager, sellada con hora de aceptación en servidor; privada.
- `sale_listings`: venta iniciada por manager, duración de publicación, oferta Computer, recepción de ofertas y resolución.
- `manager_offers`: ofertas entre managers, compra solo con aceptación y validación de servidor.

### E. Cláusulas y Equipo Malo

- `clause_rules`: tabla de tramos/multiplicadores versionada, con fuente original auditable; anomalías sin corregir silenciosamente.
- `clause_windows`: días habilitados y horario 15:00–21:00 (España), con excepciones de calendario.
- `bad_team_holdings`: titularidad de Equipo Malo **por división**, separada del Computer.
- Las compras de cláusula y ventas a Equipo Malo crean `transfer_operations`, `roster_events` y `wallet_entries` de forma atómica.

### F. Jornadas

- `gameweeks`: jornada oficial o jornada extra, estado, cierre de alineaciones, cierre de puntuaciones.
- `lineups`: once persistido por equipo/jornada (heredado de la última alineación guardada cuando proceda), con versión y fecha de bloqueo.
- `lineup_slots`: puestos concretos, posición y jugador; huecos sin futbolista para aplicar penalización.
- `team_gameweek_scores`: puntuación provisional o definitiva, motivo de cero por deuda y versión.
- `team_gameweek_awards`: premio por puntos y por posición; estado y `wallet_entry` enlazado.
- `notifications`: inicialmente solo recepción de cláusula; arquitectura extensible.

### G. Administración y trazabilidad

- `admin_audit`: autor, fecha, justificación, estado anterior/posterior y referencia de operación; sin secretos ni credenciales.
- `background_jobs`: tareas programadas, idempotencia, resultados, reintentos y avisos.
- `season_honours`: campeones, ascensos, descensos, históricos de temporadas.

## 3. Reglas confirmadas que debe cumplir el motor

- Piloto: 16 plazas objetivo, 15 jugadores iniciales/equipo; máximo 16, valor conjunto inicial aproximado de 70 M€ ajustable por administración. Simulación previa de reparto y compensación monetaria.
- Límite agregado de pujas: **saldo + 25 % del valor actual de la plantilla**. Sumar TODAS las pujas activas, rechazar la que supere el límite. El número de pujas activas no puede superar las plazas libres (`16 - jugadores actuales`).
- Empates en puja: gana la registrada primero en tiempo de servidor.
- Pujas comprobadas al registrarlas, no durante el reparto como sistema ordinario. Si cambia saldo/plantilla por ventas o cláusulas posteriores, aplicar bloqueos operativos y revalidaciones de integridad sin sorpresas: diseñar esta transición explícitamente antes del despliegue.
- Cierre de pujas a la 01:00 de Madrid. Procesamiento interno en periodo 01:00–06:00. Publicación y vigencia efectiva de fichajes/saldos/plantillas a las 06:00, atómicamente. El cálculo puede adelantarse, pero no la vigencia visible.
- Mercado 15 futbolistas máximo visibles, los no vendidos se arrastran al día siguiente y después salen. Umbral de adquisición automática por Equipo Malo: **menor de 750.000 €**.
- Compra/venta instantánea a Computer o Equipo Malo cuando se acepta oferta; dinero y titularidad cambian juntos, incluso fuera del ciclo de adjudicación si la operación está habilitada por reglas y horario.
- Equipo Malo: 12:00–00:00 España. Cláusulas ordinarias en días autorizados 15:00–21:00, calendario especial por temporada. Tabla base de 383 filas y extensión hasta 200 M€, pendiente incorporar y auditar fuente exacta.
- Alineación: once guardado, arrastre automático, bloqueo al comenzar el primer partido de jornada, huecos no reemplazados y -4 puntos por hueco; once totalmente vacío 0. Jornada con saldo negativo al inicio, 0 puntos. Horas bloqueadas por servidor, no reloj del navegador.
- Puntuación de la jornada: suma de puntos positivos/negativos y penalizaciones, premio solo por puntuación final positiva a 10.000 €/punto.
- Premios por jornada a tres peores: 1,5 M€, 1 M€ y 0,5 M€. Desempatar favoreciendo al que peor esté en la clasificación general anterior a esa jornada. Desempate ulterior aún pendiente.
- Correcciones deportivas: reemplazo/versionado e incidencia económica por **diferencia**, nunca segundo abono completo. Mantener auditoría.
- Calendario LaLiga: fuente actualizable y sustituible; leer horarios diariamente como propuesta de piloto, descargar puntos y valores a las 09:00 (Madrid) según permisos. Solo cerrar jornadas cuando estén completos los puntos oficiales de todos los partidos relevantes. Gestionar aplazados/jornadas extra como reglas por concretar con fuente verificable.
- Notificaciones iniciales: solo cláusula pagada; otras más adelante.
- App: cuatro tarjetas iguales Cláusulas/Mercado/Alineación/Equipo Malo; noticias con transferencias de cierre; consultas de plantillas y onces históricos desde Clasificación; pestaña futura Copa reservada, fuera Viejo Zorro y Fair Play.

## 4. Flujos atómicos de servidor

### `submit_bid(team, lot, amount)`

1. Identificar al manager autenticado; no aceptar un `team_id` ajeno.
2. Bloquear la fila de equipo y las reservas/pujas pertinentes en una transacción.
3. Comprobar hora de mercado; lote presente; cantidad mínima; una puja por lote; plantilla con espacio.
4. Recalcular `valor plantilla * 0,25 + saldo`; calcular suma de pujas activas incluyendo la oferta nueva, con precisión entera en céntimos.
5. Rechazar la operación completa si excede plazas o capacidad económica; si pasa, guardar oferta y `accepted_at` del servidor. La modificación de importe de una oferta previa no debe cambiar arbitrariamente la prioridad salvo que se acuerde expresamente.
6. No exponer pujas ajenas ni valores a otros managers.

### `settle_market(cycle)` + `publish_market(cycle)`

1. Obtener lock por ciclo/división y clave idempotente única.
2. En cierre, inmovilizar instantánea de pujas admitidas y calcular ganadores por importe DESC, instante ASC y ID como desempate técnico.
3. Preparar resultado interno (no visible) y verificar restricciones entre operaciones simultáneas; cualquier variación económica excepcional exige reglas explícitas.
4. A las 06:00 publicar como única transacción: titularidad, cuentas, diario económico, movimiento histórico, resultado visible; idempotencia fuerte.
5. Si hay fallo, reintentar sin adjudicar dos veces; mostrar incidencia al administrador.

### `execute_transfer(...)`

1. Comprobar identidad, disponibilidad, horario, dueño, pujas comprometidas/plazas y cláusulas, además de precio permitido.
2. Bloquear jugador **en esa división**, vendedor, comprador, presupuestos afectados.
3. Cambiar titularidad y saldos, insertar entradas compensadas de dinero e historial en **la misma transacción**.
4. Devolver recibo único; reintento con la misma clave devuelve el mismo resultado.

### `close_gameweek(gameweek)`

1. Verificar calendario/estados de encuentros, puntos por fuente y alineaciones bloqueadas.
2. Calcular puntuaciones; aplicar excepciones y penalizaciones; clasificar jornada.
3. Abonar premios UNA vez mediante claves únicas; cerrar con resumen de integridad.
4. Si hay correcciones posteriores, emitir delta exacta en diario y registrar revisión, sin borrar el cierre anterior.

## 5. Seguridad mínima

- Supabase Auth para contraseña cifrada/hasheada por el proveedor; contraseña inicial privada, preferiblemente cambio posterior.
- Autorización en servidor, RLS para toda tabla expuesta, privilegios por tabla, consultas públicas solo de los campos permitidos; nunca confiar en controles visuales.
- Pujas: sin `SELECT` para `anon`/`authenticated` sobre tabla privada; cada manager consulta **solo sus propias pujas** mediante función controlada o vista estricta. Administrador de la UI no ve pujas ajenas.
- Límite realista: el propietario con acceso administrativo de base de datos tiene privilegios técnicos. Impedirle criptográficamente ver importes requeriría diseño adicional; no prometer imposibilidad absoluta.
- Separación de políticas por `division_id`, `season_id` y `team_id`; pruebas de aislamiento cruzado obligatorias.
- Token/API de fuente externa solo en secretos del servidor. Evitar copiar datos de Comunio Laviana sin verificar permiso y condiciones.
- Copias exportables, registro de cambios y política de recuperación; comprobar prestaciones del plan gratis antes de prometer copias automáticas gestionadas.

## 6. Cuestiones pendientes de definir antes del motor final

1. **Fechas/estados de jornadas extra** ante aplazamientos y partidos adelantados, siguiendo reglas verificadas de Comunio.
2. **Anomalías de la tabla de cláusulas**, regla de redondeo y valores >200 M€; no modificar la tabla fuente sin aprobación.
3. **Desempate secundario** cuando también coincide la general anterior.
4. **Cambios de saldo y valores mientras existen pujas activas**, especialmente pago de cláusula o venta instantánea: diseñar garantías de consistencia sin retirar pujas arbitrariamente.
5. **Prioridad temporal tras modificar una puja** y condiciones exactas de la oferta automática del Computer.
6. **Permiso de uso de fuente deportiva**, cobertura y puntualidad reales del calendario y puntuaciones.
7. **Reparto inicial** si alguna asignación de 15 jugadores excede el patrimonio objetivo: reajuste automático o aumento de capital inicial.
8. **Visibilidad de plantilla en horario de pujas** y política de datos privados de managers.

## 7. Elección técnica propuesta

Postgres con funciones transaccionales para operaciones económicas (RPC restringidas), Supabase Auth y Edge Functions únicamente para procesos que requieren API externa; una agenda para fechas de mercado, consulta del calendario y cierre deportivo. No implementar cron sin verificar que la combinación de plan gratuito y zona horaria Europea/Madrid funciona con cambio de hora de verano. Guardar en UTC y convertir horarios legalmente en servidor.

No se despliega nada antes de una revisión y aprobación de cambios concreta.
