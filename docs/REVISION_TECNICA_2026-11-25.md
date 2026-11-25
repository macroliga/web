# Revisión técnica del primer código de MACROLIGA

**Fecha:** 25/11/2026. **Estado:** revisión local; **migraciones no aplicadas**.

## Qué se ha comprobado

- Identidad del repositorio independiente `macroliga/web` y del proyecto Supabase `macroliga-piloto` (`xuwjbfnhvvbdargcohfe`).
- Los 33 `CREATE TABLE` del esquema inicial tienen activación de RLS y revocación de privilegios directos al cliente en la migración 0001.
- Las claves foráneas compuestas de 0002 vinculan equipos, divisiones, pujas y alineaciones.
- Las RPC de 0003 asocian las ofertas al usuario autenticado, bloquean el registro del equipo y validan dinero/plazas antes de aceptar pujas; no se concede acceso directo a la tabla de ofertas.
- La auditoría de documentación oficial de Supabase confirma la necesidad de verificar conjuntamente GRANT y RLS. En funciones `SECURITY DEFINER`, hay que ejecutar pruebas de aislamiento con usuarios distintos.

## Correcciones preparadas en esta revisión

1. **Calendario:** se normalizan estados (`POSTPONED`, `TIMED`, etc.) antes de calcular la hora de inicio; estados desconocidos se ignoran de forma conservadora. Evita bloquear alineaciones a partir de un partido aplazado.
2. **Fechas inválidas:** la cuenta atrás y el simulador de publicación las rechazan explícitamente en vez de usar `NaN`.
3. **Empates de pujas:** si coinciden importe y marca temporal, se usa una secuencia generada por la base de datos; nunca un UUID arbitrario. La nueva migración 0004 añade ese campo.
4. **Integridad de traspasos:** se preparan restricciones para evitar que un equipo compre a sí mismo y para que el tipo de vendedor/comprador corresponda con la presencia de equipo.
5. **Eventos históricos:** la migración 0004 refuerza la clave única para eventos cuyo `team_id` sea `NULL` (Computer / Equipo Malo).
6. **Importación:** se rechazan claves de futbolista/partido vacías.

## Límites de la validación

Los tests de migraciones son **comprobaciones de texto/contrato**. No se ha ejecutado el SQL sobre PostgreSQL real ni se han probado clientes JWT reales. Pasar estos tests **no equivale a certificar la seguridad**.

**No desplegar todavía**: quedan pendientes la comprobación SQL real, simulaciones multiusuario, procesos transaccionales de ventas, premios y cláusulas y las políticas de lectura segura del frontend. El motor de publicación sigue siendo un **simulador local**, no una función desplegada.

## Próxima autorización necesaria

Antes de aplicar migraciones sobre `macroliga-piloto`, confirmar explícitamente esa intervención. No ejecutar código en `Comunio Laviana`, ni copiar sus secretos ni modificar su repositorio.
