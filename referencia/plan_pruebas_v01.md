# MACROLIGA — Plan de implementación y pruebas, versión 0.1

**Sin aprobación no se despliega.** Cada fase incluye verificación y aceptación.

## Fase A — Preparar migración 1 (estructura y permisos)

**Cambios previstos:** crear tablas, índices y RLS por defecto en `macroliga-piloto` exclusivamente. No tocar código de Comunio Laviana. No activar aún operaciones de economía reales.

**Antes de autorizar:** revisar SQL, identificar inconsistencias entre división/equipo, vigencia de futbolistas, históricos de mercado y usuarios. Ejecutar primero un ensayo aislado/local. Esquema inicial no se considera productivo sin funciones y policies.

**Prueba de aceptación:** cliente anónimo o autenticado sin privilegios no puede leer pujas, cambiar saldos ni escribir titularidad.

## Fase B — Identidad, lectura autorizada y reparto inicial

- Crear 16 cuentas iniciales mediante Auth con contraseñas distintas, entrega por canal privado y posibilidad de cambio posterior.
- Implementar creación de perfiles vinculados a Auth, acceso por división y consultas de plantilla propia/plantillas rivales sin filtrar secretos.
- Simular un reparto de 15 jugadores por equipo y compensación hasta patrimonio objetivo, sin grabar nada hasta confirmación.
- Comprobar que no hay jugadores duplicados dentro de una misma división y que cada presupuesto cuadra.

## Fase C — Economía y mercado

- Implementar funciones SQL transaccionales para pujas, retirada, ventas, cláusulas y transferencias; nada de alterar `balance_cents` directamente desde navegador.
- Probar suma de pujas: equipo 50 M€, saldo 10 M€, 22,5 M€ máximo. Cuatro pujas 20 M€ y una quinta 3 M€: rechazo.
- Probar plazas: equipo 15 jugadores admite una sola puja activa; 16 admite cero.
- Probar empate por importe: primero según `accepted_at` del servidor.
- Probar dos compras simultáneas: sin saldo negativo fuera del 25 %, sin duplicar futbolista, nunca más de 16.
- Probar ventas instantáneas a Computer y Equipo Malo: dinero y titularidad cambian juntos, liberación de plaza inmediata.
- Probar cierre 01:00 y publicación 06:00 en invierno y verano españoles, con UTC en base de datos.
- Reintentar la tarea dos veces: exactamente una adjudicación y un conjunto de apuntes económicos.
- Probar fallo en mitad de la transacción: rollback completo, sin jugador perdido ni dinero creado.

## Fase D — Reglas especiales

- Cláusulas según ventanas de calendario y tabla original completa, incluyendo auditoría de anomalías.
- Equipo Malo: 12:00–00:00, adquisición de no vendidos <750.000 €, multiplicadores especiales y operaciones registradas.
- Ventas entre managers con precio mínimo y prohibición de recompra antes de dos meses salvo cláusula.
- Comprobar cambios de saldo o plantilla mientras hay pujas activas, con regla formal de consistencia definida antes de programarla.

## Fase E — Alineaciones, calendario y puntuación

- Bloqueo en instante de inicio del primer encuentro; comprobar desde servidor. Once anterior heredado cuando proceda.
- Venta/cláusula de titular: hueco vacío, -4; si once totalmente vacío: 0. Saldo negativo al inicio: 0.
- Validar jornada con partidos viernes-lunes, entre semana, cambios horarios, aplazamiento/adelanto y jornada extra.
- Descargar datos a las 09:00 únicamente desde fuentes permitidas, con verificación de integridad. Clasificación provisional hasta puntos completos.
- Repetir importación sin duplicar puntos; corregir puntaje después de cierre y abonar/revertir solamente la diferencia.
- Premios 10.000 €/punto final positivo; premios de 1,5/1/0,5 M€ a tres últimos; empate favorece al peor de general previa.

## Fase F — Interfaz y piloto

- Portada visual inspirada en Laviana, cuatro accesos iguales: cláusulas, mercado, alineación y Equipo Malo. Estados abierto/cerrado con horarios.
- Noticias: fichajes del cierre, historial de traspasos con filtros por fecha, manager y jugador.
- Alineación: partidos y cuenta atrás dentro de la pestaña.
- Clasificación: plantilla de cada rival y once histórico por jornada, tras cierre de alineaciones.
- Copa reservada en navegación; eliminar Viejo Zorro y Fair Play.
- Panel admin: consultar incidencias, correcciones justificadas con compensaciones, nunca borrar historial.
- Ensayo con participantes ficticios: varias semanas completas aceleradas, cambios de hora y fallos de API.

## Lista de comprobación de seguridad crítica

- [ ] Cada acción modifica solo la división del equipo autenticado.
- [ ] No hay acceso de clientes a pujas de terceros.
- [ ] Nadie puede crear saldo o comprar por alterar JSON del navegador.
- [ ] No se pueden usar tokens administrativos desde la PWA.
- [ ] Todas las operaciones críticas se registran con claves idempotentes.
- [ ] Los reintentos automáticos no alteran dos veces cuentas y plantillas.
- [ ] Correcciones de jornada producen delta único de premios.
- [ ] Pruebas de límites del plan gratuito completadas con los volúmenes reales.
- [ ] Fuente de datos deportivos y calendario autorizada; alternativa y procedimiento manual documentados.
- [ ] Restauración probada antes de incluir los 16 managers reales.

## Riesgos y mitigaciones

1. **Datos deportivos y licencia:** dependencia de Comuniazo no autorizada aún -> conector sustituible, no automatizar sin permiso.
2. **Horarios tardíos o imprecisos:** contraste y alertas, jamás desbloquear alineaciones pasadas automáticamente.
3. **Pujas y ventas concurrentes:** bloqueos SQL, idempotencia, transacciones y pruebas de carga.
4. **Diferencias tras correcciones:** libro mayor y ajustes por diferencia, historial inmutable.
5. **Plan gratuito y suspensión por inactividad:** medir almacenamiento, consultas, funciones y política de copias actual antes de prometer disponibilidad.
6. **Reglas que faltan por confirmar:** no inferir desempate secundario ni jornadas extra sin decidirlas.

## Próxima autorización solicitada

Para la Fase A: aprobar **crear únicamente el esquema revisado en Supabase `macroliga-piloto`**, tras una revisión adicional del SQL y las pruebas de seguridad. Esto no implicará publicar la PWA ni activar cuentas, fuentes externas o automatismos de mercado.
