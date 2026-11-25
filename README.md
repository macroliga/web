# MACROLIGA · Primer código de la liga piloto

**Fecha:** 25/11/2026 · **Estado:** código local probado parcialmente, **NO desplegado**.

**Identidad del proyecto autorizada para un futuro despliegue:**
- GitHub: `macroliga/web` (repositorio de MACROLIGA, no Comunio Laviana).
- Supabase: `macroliga-piloto`, proyecto ref `xuwjbfnhvvbdargcohfe`, región `eu-west-1`.
- **Prohibido:** aplicar este código al proyecto Supabase `Comunio Laviana`, repositorio `comuniolaviana/web`, reutilizar sus secretos o alterar su aplicación.

## ¿Qué es funcional hoy?

El código JavaScript de `src/domain/` ejecuta reglas independientes de la interfaz:

- `mercado.mjs`: capacidad económica = saldo + 25 % de valor de plantilla, reserva agregada de pujas, plazas hasta 16, desempate por importe y registro más antiguo, validación de horarios.
- `puntuacion.mjs`: once, penalización -4 por hueco, once vacío 0, saldo negativo al inicio 0, premios por puntos y a tres últimos, ajuste por diferencias.
- `calendario.mjs`: primer comienzo de jornada, aplazamientos y cuenta atrás con marcas de tiempo.
- `publicacion_mercado.mjs`: simulación de cierre/publicación a las 06:00, todo-o-nada, doble ejecución sin duplicidades y sin sustitución de ganadores.
- `importacion.mjs`: importación idempotente de puntos/versiones y correcciones sin acumulación duplicada.

## SQL preparado, pendiente de ejecución y prueba real

`supabase/migrations/` contiene tres migraciones **en borrador revisable**:

1. `202611250001_core_schema.sql`: 33 tablas, RLS denegatorio por defecto y dinero en céntimos.
2. `202611250002_consistencia_divisiones.sql`: claves compuestas para impedir mezclar datos de distintas divisiones.
3. `202611250003_pujas_seguras.sql`: funciones transaccionales para presentar/retirar pujas y consultar SOLO las propias; bloqueo de fila de equipo, horarios y límites comprobados en servidor.

**El SQL aún NO ha pasado una ejecución de PostgreSQL real.** Sus pruebas actuales son verificaciones estructurales estáticas; no constituyen una auditoría de seguridad ni garantizan despliegue sin errores.

## Cómo probar en un ordenador con Node.js 20 o posterior

Desde la carpeta que contiene `package.json`:

```bash
npm test
npm run check
```

Las pruebas no requieren librerías externas ni ninguna contraseña. No hacen conexiones a Internet ni a Supabase.

## Lo que todavía NO funciona en producción

- Cuentas de Supabase Auth, asignación de jugadores y RLS de lectura al frontend.
- Adjudicación del Computer y publicación atómica a las 06:00.
- Transferencias instantáneas, Equipo Malo, cláusulas, liquidación económica y copia de seguridad.
- Descarga de datos de fútbol, calendario oficial y conexión de APIs (permisos pendientes).
- Aplicación móvil y pantallas finales.
- Validaciones de consistencia tras venta o cláusula que cambie el valor de una plantilla con pujas en vigor.

**No cargar usuarios reales, no activar operaciones económicas, no publicar el frontend** hasta superar pruebas de PostgreSQL, aislamiento entre usuarios/divisiones, idempotencia y autorización del organizador.

Consulta `docs/ESTADO_Y_SIGUIENTE_DESPLIEGUE.md` para la lista concreta de cambios y riesgos.
