# Fuente de cláusulas MACROLIGA: importación fiel

Se conservan **383 registros originales** del documento suministrado por el organizador, desde 160.000 € hasta 101.000.000 €, incluyendo filas duplicadas y valores atípicos. En todos los registros el importe total y la prima coinciden con el multiplicador indicado.

## Auditoría y estado

- Registro duplicado **19.100.000 € (×1,205)**: las dos filas son idénticas. No se borra ninguna.
- Los multiplicadores y primas presentan saltos (por ejemplo: 5.900.000 € ×1,4; 6.000.000 € ×1,435), que deben conservarse hasta ser revisados.
- La cabecera original indica «Desde-A…», pero la columna «Hasta» está vacía. Falta fijar el criterio exacto para valores entre umbrales y el redondeo de importes con céntimos.
- **No activar cláusulas ordinarias** ni importar estas filas como políticas económicas hasta que se acuerden esos detalles.
- El CSV utiliza punto decimal solo para facilitar lectura informática; se respeta el valor exacto del multiplicador.
- La extensión desde 101 millones hasta 200 millones se guarda **separada** con los ejemplos de tramos aprobados. Las cifras intermedias se interpolarán linealmente cuando se concrete el redondeo; no hay regla acordada por encima de 200 millones.

Archivos:
- `tabla_original_383_filas.csv`: cada fila conserva su número, importe, multiplicador y los dos importes originales.
- `extension_101_200_millones.csv`: valores ancla expresamente acordados.
