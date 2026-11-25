# MACROLIGA · Validación del motor económico transaccional
Fecha: 25/11/2026.

## Identidad y autorización

- Proyecto autorizado y confirmado antes de la migración: **macroliga-piloto**, ref `xuwjbfnhvvbdargcohfe`, región `eu-west-1`.
- GitHub de la aplicación: `macroliga/web`.
- Comunio Laviana no se ha modificado.

## Implementación

Migración nueva: `supabase/migrations/202611250005_motor_economico_transaccional.sql`.

- `app_private._contabilizar_traspaso(...)`: registro del traspaso, actualización del balance, asiento económico, evento de plantilla y propiedad en **una transacción**. Bloqueo por división para serializar operaciones.
- `app_private.vender_computer(anuncio_id, clave)`: exige anuncio vigente y utiliza la oferta registrada. Cierra el anuncio al vender.
- `app_private.vender_equipo_malo(equipo_id, jugador_id, clave)`: exige propiedad real, usa el valor de mercado vigente y comprueba la franja horaria de la división (12:00–00:00).
- `app_private.publicar_ciclo(ciclo_id)`: requiere estado `calculated` y haber alcanzado `publishes_at`; ordena pujas válidas por importe descendente, antigüedad y secuencia; adjudica en una sola transacción; no recurre a un segundo ganador si hay errores.

Los procedimientos son privados: denegados para `anon` y `authenticated`; tres entradas habilitadas solo para `service_role`. El procedimiento auxiliar permanece sin `EXECUTE` para clientes y para `service_role`. Una conexión privilegiada al servidor seguirá siendo necesaria.

## Integración probada en PostgreSQL real

Archivo reproducible: `tests/sql/20261125_motor_economico_rollback.sql`.

Se utilizaron dos managers y equipos ficticios, seis futbolistas iniciales y otros jugadores ficticios para alcanzar 16. Se probaron:
1. Pujas presentadas bajo identidades simuladas de dos usuarios, gana el importe mayor.
2. Se publica un ciclo completo cuando llega su hora; el segundo intento no mueve dinero.
3. El comprador pierde exactamente el importe ganador; el libro mayor guarda un único débito.
4. El Computer compra un jugador a precio de su oferta y no puede volver a comprarlo.
5. Equipo Malo compra a valor de mercado, registrando el movimiento y cambio de propietario.
6. Intentar vender un futbolista ya perdido se rechaza.
7. Un ciclo con un lote correcto y otro inconsistente revierte incluso el movimiento del primer lote.
8. Una plantilla con 16 futbolistas no puede recibir el 17.º.
9. El saldo final coincide con la suma del libro de movimientos.
10. La publicación anterior a `publishes_at` se rechaza.

**Resultado:** ejecución sin excepciones imprevistas. El bloque usa una excepción centinela controlada para revertir todos los datos de prueba y contiene afirmaciones que abortan ante cualquier incumplimiento.

Verificación posterior: **0** filas de managers, usuarios Auth, equipos, futbolistas, traspasos, pujas, ciclos y asientos. La migración figura como quinta migración aplicada.

## Límites de esta prueba y tareas críticas

- No se han simulado solicitudes de red reales ni conexiones concurrentes; el bloqueo por división requiere una prueba de competencia real entre transacciones.
- La publicación requiere un ciclo ya marcado `calculated`; el motor de cálculo, los procesos cron y la apertura automática aún no existen.
- No implementa todavía operaciones entre managers, cláusulas ni la lógica de anuncios/pujas de managers.
- Pujas del Computer admitidas en su momento no se vuelven a validar al adjudicar; ante inconsistencias el ciclo completo falla, sin reasignación.
- No se prueba una caída del servidor a mitad de transacción: PostgreSQL garantiza atomicidad, pero faltan tests de resiliencia y recuperación.
- La API de cliente no tiene aún una pasarela autenticada para vender; **no es una aplicación desplegada para uso real**.
- Quedan avisos del asesor de seguridad: funciones privilegiadas accesibles al rol autenticado por diseño de RPC de pujas (revisar su lógica y autenticación), una función preexistente `rls_auto_enable()` que no hemos modificado y 33 tablas sin políticas de lectura voluntariamente cerradas.

## Próximo hito

Establecer el precio mínimo exacto para ventas entre managers, codificar las ofertas y cláusulas como transacciones protegidas y preparar una pasarela de servidor que valide identidad y permisos sin filtrar la clave de servicio.
