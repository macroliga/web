# MACROLIGA · Prueba de acceso real pendiente y aislamiento verificado (26/11/2026)

## Recursos autorizados

- Solo proyecto Supabase **macroliga-piloto**, ref `xuwjbfnhvvbdargcohfe`.
- Solo repositorio GitHub **macroliga/web**.
- **Comunio Laviana**: sin modificaciones, sin reutilizar claves administrativas.

## Qué se ha comprobado hoy en Supabase

Se ejecutó otra vez `tests/sql/20261126_lecturas_managers_rollback.sql` contra MACROLIGA, con tres identidades ficticias simuladas bajo el rol PostgreSQL `authenticated`:

1. Manager A consulta únicamente su equipo, saldo y capacidad económica.
2. Manager B, de la misma división, puede consultar la **plantilla pública** del A, pero no su saldo ni los movimientos económicos.
3. Un tercer equipo en otra división no se puede consultar desde A.
4. El rol anónimo no puede ejecutar las dos funciones privadas.
5. Todos los datos ficticios se revierten al terminar el ensayo.

La comprobación posterior confirmó **0 filas** en `auth.users`, `public.managers`, `public.teams`, `public.wallet_entries` y `public.roster_ownership`.

Esto **sí prueba las restricciones SQL**, pero NO equivale a iniciar sesión mediante el servidor HTTP de Supabase Auth con una contraseña real.

## Corrección del cliente de acceso

El cliente `app/api.mjs` usa una clave publicable **solo como cabecera `apikey`** al iniciar sesión. Una clave `sb_publishable_` no es un JWT; para consultar las RPC debe enviarse el **token individual del manager** como `Authorization: Bearer ...`.

También se rechazan las claves `sb_secret_` si alguien intenta ponerlas en el navegador. Nunca publicar `service_role`, contraseñas o claves privadas.

Se añadieron comprobaciones de separación de tokens y de acceso rechazado en `tests/pwa_cliente.test.mjs`.

## Ensayo completo preparado por HTTP (todavía no ejecutado)

Código: `scripts/probar_acceso_real.mjs`. Comando: `npm run test:acceso-real`.

Requisitos: **dos cuentas de ensayo existentes** y confirmadas en el servicio oficial Supabase Auth, con dos managers y equipos distintos **de la misma división** en la base de datos. Las cuentas las debe crear un administrador autorizado mediante la interfaz oficial de Auth o una integración administrativa segura, **nunca insertando contraseñas manualmente en `auth.users`**.

El script comprueba:
- Inicio de sesión independiente con la contraseña de cada cuenta, y JWT distintos.
- Lectura del propio equipo, saldo y plantilla, y de la plantilla visible del rival.
- Ausencia de acceso directo a tablas económicas, pujas y registro completo de managers.
- Denegación de acceso a otra división si se configura un identificador opcional.
- Cierre de ambas sesiones al terminar.

Variables de entorno (en un entorno privado; **no subirlas al repositorio ni escribirlas en el chat**):

```bash
export MACROLIGA_TEST_PUBLIC_KEY="sb_publishable_..."
export MACROLIGA_TEST_EMAIL_A="cuentaA_de_ensayo"
export MACROLIGA_TEST_PASSWORD_A="contrasena_en_privado"
export MACROLIGA_TEST_EMAIL_B="cuentaB_de_ensayo"
export MACROLIGA_TEST_PASSWORD_B="contrasena_en_privado"
# Opcional si existe equipo ficticio en otra division:
# export MACROLIGA_TEST_TEAM_OTRA_DIVISION="uuid-del-equipo"
npm run test:acceso-real
```

**No se ha ejecutado este script contra Supabase Auth**, porque hoy no existen cuentas de ensayo reales ni herramienta administrativa que permita crearlas y limpiarlas con seguridad desde esta conexión. El script no crea cuentas ni escribe en las tablas del juego.

### Condiciones para continuar

1. Validar `npm test` y `npm run check` con CI o entorno local.
2. Preparar procedimiento seguro de alta y eliminación de dos cuentas ficticias, con permisos adecuados.
3. Ejecutar la prueba real. Al finalizar, borrar los datos de prueba creados para el ensayo (si se hubieran aprovisionado) y confirmar que no queda residuo.
4. Solo después habilitar pruebas más amplias con participantes o publicar el inicio de sesión.

La portada pública tiene `app/config.js` todavía con la clave pública vacía, para evitar habilitar un acceso de usuarios antes de cerrar el proceso de altas. Este archivo podrá llevar una **clave publicable** (nunca una secreta) tras configurar la prueba.
