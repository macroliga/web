# Mercado nocturno del piloto y presentación compacta
Fecha de comprobación: 28/11/2026, hora Europe/Madrid.

- El trabajo existente `macroliga_piloto_mercado_diario` está activo y ejecuta `app_private.procesar_mercado_programado` cada cinco minutos.
- Entre 00:30 y 06:25 Madrid, 72 ejecuciones correctas. El ciclo del 27/11 cerró a las 01:00 y se publicó el 28/11 a las 06:00:00.215614. Hubo una adjudicación por puja. No había jugador de segundo día con valor inferior a 750.000 €.
- El ciclo abierto del 28/11 tiene 15 lotes (11 nuevos, 4 arrastrados), 9 inferiores a 750.000 €, de los que 1 está en su segundo día. Si no hay puja ganadora y conserva el valor/estado, se incorpora al Equipo Malo a las 06:00 del 29/11.
- La función vigente ya registra de forma transaccional `bad_team_sale`, propiedad y evento de plantilla, con clave única por ciclo/lote. Se mantiene la regla establecida de dos días, salvo excepción inicial ya ejecutada. No se cambia la programación ni se fuerza ningún fichaje.
- La interfaz v29 muestra previsión de candidatos, sin prometer compras; conserva las operaciones y la seguridad existentes. Menú accesible, filas compactas, pujas desplegables.
- Sin cambios en Comunio Laviana, ni usuarios o fixtures en Supabase.
