# MACROLIGA — 16 entrenadores históricos para la liga piloto

**Estado a 26/11/2026: PREPARADO EN CÓDIGO, NO EJECUTADO EN SUPABASE AUTH.**

## Lista de participantes de ensayo

Se utilizan como **alias ficticios**, no como identidades personales:

1. Luis Aragonés
2. Vicente del Bosque
3. Miguel Muñoz
4. Javier Irureta
5. Johan Cruyff
6. Helenio Herrera
7. Radomir Antić
8. Alfredo Di Stéfano
9. Alex Ferguson
10. Arsène Wenger
11. Jupp Heynckes
12. Ottmar Hitzfeld
13. Arrigo Sacchi
14. Fabio Capello
15. Marcello Lippi
16. Carlos Bilardo

Cada uno tendrá `Equipo de [Nombre]` y un correo exclusivo ficticio, de la forma `demo01@macroliga.invalid` ... `demo16@macroliga.invalid`. Se utilizan correos bajo `.invalid` para no mandar mensajes a direcciones reales. No existe recuperación por correo en estas identidades; sólo se usan en ensayos.

## Qué hace el programa administrativo

`scripts/crear_16_entrenadores_demo.mjs`:

- Sin argumentos o con `--dry-run`: **simulación**, imprime los 16 alias y correos, sin modificar ningún servicio ni crear contraseñas.
- Con `--apply`: exige confirmación y una clave administrativa **solo de MACROLIGA**, en un ordenador controlado por el administrador, y comprueba que el proyecto no tenga ya competiciones, temporadas, divisiones, managers, equipos ni usuarios Auth.
- Crea una competición piloto, temporada 2026/27 en borrador y una división con límite de 16 jugadores, deuda del 25 % y premio de 10 000 € por punto positivo.
- Crea 16 usuarios oficiales de Supabase Auth con `email_confirm=true`, 16 perfiles de `managers` y 16 equipos vinculados.
- Genera **16 contraseñas independientes y aleatorias de 36 caracteres**, sin ponerlas en GitHub ni mostrarlas en la consola.
- Almacena las credenciales exclusivamente en el ordenador desde el que se ejecuta, en `.macroliga-local/credenciales-16-entrenadores.json`, con permisos de archivo 0600 y carpeta 0700, excluidos mediante `.gitignore`. Guardar posteriormente en un gestor de contraseñas y eliminar el archivo local cuando ya no sea necesario.
- Si falla durante el alta, intenta revertir los registros creados en *esa ejecución* en orden seguro. Si el proceso de limpieza falla, **no reintentar a ciegas**: se requiere auditoría del proyecto.
- Se crean con saldo cero y sin futbolistas. El reparto inicial provisional de 70 millones de patrimonio se hará posteriormente, junto con la asignación de 15 futbolistas y los ajustes de caja.

## Cómo ejecutar, cuando se disponga de la credencial administrativa

Ejecutar únicamente desde un equipo propio y de confianza:

```bash
npm run demo:preview
```

Después, para **crear de verdad** los 16 usuarios, obtener la clave *legacy service_role JWT* **solo del proyecto MACROLIGA**, en el panel privado de Supabase. **Nunca pegar la clave en ChatGPT, GitHub, HTML ni archivos de configuración de la PWA.** Colocarla en una variable privada de entorno de la máquina (sin escribirla como argumento visible) y, tras comprobar el destino, ejecutar:

```bash
MACROLIGA_CONFIRMAR_ALTA_16=SI_SOLO_MACROLIGA_PILOTO npm run demo:create
```

Se requiere además la variable `MACROLIGA_SERVICE_ROLE_KEY` configurada en el entorno de ejecución; su contenido no se imprime.

**La conexión Supabase disponible en este chat no proporciona acciones `auth.admin.createUser` ni `auth.admin.deleteUser` ni entrega claves administrativas.** No se deben crear cuentas introduciendo filas directamente en `auth.users`, porque rompería el flujo oficial de autenticación.

## Prueba posterior

Con dos credenciales creadas, seleccionar `demo01` y `demo02` y ejecutar `npm run test:acceso-real` en entorno privado, como se describe en `docs/PRUEBA_ACCESO_REAL_Y_PRIVACIDAD_2026-11-26.md`. Verifica el inicio de sesión con contraseña, la lectura del saldo propio y las plantillas permitidas, y la imposibilidad de leer pujas y movimientos privados.

Para el piloto con managers humanos, habrá que crear cuentas auténticas con métodos de recuperación y contraseñas renovadas, reemplazando las identidades de prueba. **No activar el mercado real, no crear reglas de reparto todavía y no publicar secretos.**

## Recursos

- Únicos destinos de este trabajo: `macroliga/web` y, cuando se autorice/provisione el acceso, `macroliga-piloto` (ref `xuwjbfnhvvbdargcohfe`).
- Comunio Laviana: **sin cambios**.
