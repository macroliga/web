# Arranque de MACROLIGA desde Administración · 26/11/2026

**Preparado y probado localmente. No desplegado.** La rama dev/admin-arranque parte
del motor de catálogo y reparto (GitHub e711545455c957133e9f3c69dfb655ec98de75bb).
No modifica el flujo de PIN ni las sesiones de Supabase; el cambio de caché es
solo para incorporar estos recursos estáticos en una futura publicación conjunta.

## Estado real (lectura de macroliga-piloto)

Proyecto xuwjbfnhvvbdargcohfe, cuenta Macroliga, PostgreSQL 17.12, saludable.
Competición interna MACROLIGA_PILOTO_INVIERNO_2026, temporada 2026_27 draft,
división PILOTO, 16 equipos, max_roster 16, 70 M€, Europe/Madrid.
0 jugadores, 0 titularidades, 0 ciclos de mercado, 0 managers con is_admin.
No se ha modificado el proyecto ni se han consultado recursos de Comunio Laviana.

## Flujo de administración

1. El proveedor real autorizado entrega los nombres, clubes, posiciones, IDs estables,
   estado activo y valores de mercado en céntimos de EUR. La competición deportiva
   LALIGA se distingue del código de la competición interna del piloto.
   Primero preparar el archivo, sin depender de un reparto:
   - `npm run catalogo:preparar -- --catalogo entrada.json --salida catalogo-validado.json`
   - o `npm run catalogo:preparar -- --fuente fuente.json --salida catalogo-validado.json`
     (configuración HTTPS autorizada, descrita en MOTOR_ARRANQUE_CATALOGO_REPARTO_2026-11-26.md).
   No sobrescribe archivos ni guarda credenciales. No sube datos. El archivo de
   salida es el snapshot normalizado, no el expediente completo de reparto.
2. En Admin, cargar el snapshot autorizado y declarar explícitamente el permiso.
   El servidor verifica metadatos, IDs únicos, posiciones, valores y catálogo vacío;
   conserva importación y precios históricos. Registra digest SHA-256 del JSON real.
   La huella canónica del proveedor se verifica en el CLI; el servidor no confunde
   ese valor declarado con una firma ni con autorización jurídica. La etiqueta
   authorized no acredita por sí sola una licencia. No se permite sobrescribir.
3. Configurar patrimonio (70 M€ por defecto, entero en millones), caja mínima,
   cuotas de puestos (2 GK, 5 DEF, 5 MID, 3 FWD por defecto) y fecha futura del
   primer mercado (mañana por defecto). Entre 11 y 15 jugadores, al menos uno
   de cada posición y una plaza libre; regla de posiciones provisional configurable.
   Si no existe un reparto válido, el motor detiene la operación sin cambiar datos.
4. Simular: muestra las 16 plantillas desplegables, valor, saldo, diferencia máxima
   y los 15 futbolistas del primer mercado. El servidor selecciona y asigna con
   hasta 24 muestras de distinto orden/estrato de precio, y hasta 120 rondas de
   uno o dos intercambios de igual posición entre extremos. Mejora el rango sin
   cambiar cuotas, sin déficit ni modificación artificial de valores; no garantiza
   el óptimo global. Caja = patrimonio - valor de plantilla (exacto en céntimos).
   La semilla es aleatoria y se conserva en el plan privado; se debe acordar el
   criterio de sorteo antes de confirmar para evitar selección interesada.
5. Confirmar expresamente la simulación. La RPC solo recibe el ID de preview
   generado por servidor, privado, ligado al actor y división, caduca a los 30
   minutos. Se recalcula la huella de catálogo, equipos y configuración y se
   bloquean filas para evitar aceptar datos modificados. En una sola transacción:
   cambia el patrimonio de la temporada si no se afecta a otra división,
   asigna jugadores, concilia saldos con apuntes iniciales, crea ciclo y 15 lotes
   positivos de jugadores libres, audita. Mismo ID confirmado → resultado idempotente.
   Temporada y mercado siguen draft; **no abre pujas ni programa ejecutor**.
   Horario conforme al modelo diario: 06:00, cierre al día siguiente 01:00,
   publicación 06:00, zona de división. Antes de cualquier despliegue verificar
   que no exista automatización que abra un borrador sin aprobación.

## Seguridad y reversión

- SQL de propuesta `docs/propuestas/20261126_admin_arranque.sql`, reemplaza
  funcionalmente (no ejecutar ambas) la propuesta combinada anterior. No se
  incluyen en las migraciones aplicadas.
- RPC exactas para authenticated; cada operación comprueba auth.uid(), is_admin
  y equipo activo de esa división. Sin grant directo a tablas, sin service_role
  en cliente. RLS en las dos tablas privadas nuevas. Un administrador ajeno,
  entrenador normal o administrador distinto del preview no puede confirmar.
- Sin cambios en usuarios ni flags alojados; se necesita autorización específica
  del entrenador que deba administrar. No abrir indiscriminadamente permisos.
- Rollback DDL solo antes de importar o confirmar; tras uso exige plan de datos
  aprobado y no borra transferencias ni catálogo. Si falla una operación,
  PostgreSQL revierte todos sus cambios, incluido el mercado y los saldos.
- Elimina previews anteriores no aplicados del mismo actor/división; no expone
  vistas previas a otros usuarios. La pantalla se limpia al abandonar la sesión.
- RPC de administración separadas de las de lectura. Un 403 no cierra sesión.

## Verificación ejecutada

- `npm test`: 143 pruebas superadas, 0 fallos. Incluye panel de administración,
  formato de dinero/cuotas, confirmación, listado 16/15, rechazo, limpieza de
  respuestas tardías, exportación independiente, y regresiones del PIN.
- `npm run check`: sintaxis correcta.
- `PGLITE_DIR=/ruta/node_modules/@electric-sql/pglite npm run inicio:test-admin-sql`:
  PostgreSQL 17.5 embebido (PGlite 0.3.14), 14 migraciones versionadas.
  Localmente se simulan Auth y la función Supabase-managed rls_auto_enable;
  se omite CREATE EXTENSION pgcrypto (UUID nativo). No es Supabase Auth real.
  Instalación, rollback estructural, reinstalación, importación de 500 futbolistas
  artificiales (duplicado fuerza rollback), reintento, rechazo de fixture/no admin/
  admin ajeno, bloqueo de elevación de privilegios. Simulaciones de 70 y 72 M€,
  12/15 futbolistas, sin duplicados, cuotas y caja exactas. Resultado de la última
  ejecución: a 70 M€ diferencia de plantilla 43.889 €; otro ensayo a 72 M€ con caja
  mínima 10 M€, mejora de 784.218 € a 26.732 €. Son resultados ficticios, no una
  previsión para los precios reales. El patrimonio total coincide exactamente.
  Preview no cambia plantillas ni mercado; rechazo de precio cambiado y de
  preview ajeno; fallo inyectado al insertar lotes revierte incluso saldos y
  patrimonio; confirmación 240 titularidades, 16 apuntes, 15 lotes en borrador,
  0 pujas, temporada draft, otra división intacta. Idempotencia, permisos
  y lecturas seguras verificados con roles locales.
- No se ha ejecutado concurrencia multiproceso ni prueba con navegador móvil
  real; las interacciones del panel se prueban en DOM simulado y su backend
  en PostgreSQL local. No se ha publicado producción en esta rama.
- Pendiente: aprobar fuente real de catálogo/precios; verificar cobertura y
  permiso; identificar administrador autorizado; revisar propuesta contra
  esquema alojado y autorización de migración/publicación. Entonces cargar
  catálogo, simular con valores del día, revisar y confirmar el reparto.
  Cron y activación de mercado quedan expresamente fuera de esta entrega.
