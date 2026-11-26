# Catálogo MACROLIGA: carga y actualización diaria

Alcance autorizado por el operador: solo MACROLIGA, piloto
`xuwjbfnhvvbdargcohfe`. Los 16 participantes son una liga privada, no se
publica el catálogo en GitHub ni se utiliza Laviana. El portal exige
autorización en su aviso legal; no se ha acreditado licencia del proveedor.
La procedencia `public-html` registra exclusivamente la decisión de uso de
los datos factuales visibles por el operador, sin fingir una licencia.
No hay cuentas, APIs privadas, elusión de acceso ni contenido editorial.
Ante un HTTP no exitoso se aborta el lote, sin rutas alternativas.

## Procedimiento privado del operador

1. Verificar cuenta Macroliga, proyecto piloto, temporada 2026_27.
2. Consultar si ya existe fotografía para el día de Europe/Madrid. Si la
   hay, terminar sin nuevas peticiones. No ejecutar con mercado no
   liquidado, pujas activas o catálogo incompatible.
3. Ejecutar `python -B scripts/extraer-comuniazo-piloto.py` con dependencia
   fijada en requirements-comuniazo.txt. Capturar salida exclusivamente en
   memoria o fichero privado ignorado por Git, sin imprimir fichas.
4. Verificar origen, huella, 20 clubes, cobertura de activos y puntos
   acumulados completos.
5. Invocar en una única transacción, exclusivamente como propietario,
   `app_private.importar_catalogo_comuniazo(temporada, catálogo, puntos, null)`.
   No habilitar permisos a managers, runner, service_role o anon. La
   variante HTML de procedencia se rechaza para actores del panel.
6. Confirmar resultado y los invariantes de caja, titularidades, ciclos,
   pujas e identidad. Ante error conservar la última fotografía válida y
   notificar; no forzar reintentos, no liquidar ni abrir mercados.
7. Eliminar la copia temporal tras verificar el resultado.

El importador conserva valor y puntos previos de las bajas poseídas;
Equipo Malo libera la titularidad no económica según su auditoría; los
nuevos quedan disponibles para Computer. Los puntos son acumulados; no se
utilizan como puntos de jornada ni generan premios. Antes de conectar
mercados activos, encadenar la descarga con la liquidación según la regla
de negocio existente. Nunca cambiar el valor durante una puja pendiente.

## Pruebas locales

PGlite PostgreSQL 17 aislado: `tests/sql/probar_catalogo_comuniazo_local.mjs`,
sin usuarios reales ni Supabase alojado. Verifica rechazo de procedencia
HTML ante actor, etiqueta falsa, permisos de roles, rollback de función,
carga inicial, idempotencia, altas/bajas, congelación de valor/puntos,
aislamiento, mercado pendiente, posiciones y rollback de fallos.
19 pruebas Python y 158 pruebas Node superadas; comprobación sintáctica.
La reversión de la función no borra el catálogo ya importado.

## Primera carga real verificada: 26/11/2026

- Implementación: GitHub `dev/catalogo-integracion`, commit
  `3758b7d793eaa3892516e65d32340c6a6102d68c`.
- Migración aplicada al piloto: `catalogo_html_operador`, con la misma
  función invoker y revocaciones verificadas para anon, authenticated,
  service_role, macroliga_runner.
- Importación única: 551 activos, 551 registros de valor, 551 puntos
  acumulados, 20 clubes; 47 GK, 187 DEF, 211 MID, 106 FWD.
  Huella `a978e5aba19bf73782b2f9a637a86519654be94658de807b2fbc430aa385d9c6`.
- Tras la carga: 16 equipos, un administrador, 0 titularidades, 0
  movimientos de caja, 0 ciclos y 0 pujas. Consulta de lectura autenticada
  (rol local en transacción revertida) confirma catálogo paginado y
  vista previa de 15 jugadores (2 GK/5 DEF/5 MID/3 FWD); admin:
  catalogReady=true, initialized=false, marketPrepared=false.
- Tarea diaria creada y habilitada: 07:00 Europe/Madrid, próxima
  ejecución 27/11/2026. El primer ciclo programado aún no ha ocurrido.
- Asesores de Supabase: advertencias de RPC definer autenticadas y
  protección de contraseñas filtradas, y aviso informativo RLS sin policy.
  La función nueva es invoker no ejecutable por roles de aplicación.
  No se cambian las políticas de autenticación ni los permisos existentes.
- Copia temporal del lote eliminada. No se ha modificado Laviana ni
  se ha activado un mercado.
