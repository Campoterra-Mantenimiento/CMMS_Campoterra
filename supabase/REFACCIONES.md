# Dar de alta refacciones

Después de instalar las migraciones anteriores, ejecutar en SQL Editor
`migrations/202610080006_nuevas_refacciones.sql` y luego
`tests/verify_refacciones.sql`. Recargar Inventario con Ctrl + F5.

El encargado puede usar **Nueva refacción** para capturar nombre, código único
y categoría. Se crea con cero existencias; seleccionar **Reabastecer** para
registrar las unidades disponibles con su movimiento de entrada.
Los códigos se recortan en los extremos y distinguen mayúsculas de minúsculas.
Si una respuesta se pierde, consultar el inventario antes de reintentar:
el mismo código no permite crear otra pieza.

La función exige un encargado activo y no concede escritura directa sobre
las tablas. La tablet no puede dar de alta piezas. El formulario también usa
el endpoint ya existente cuando se configura el backend local.

Validación manual: crear REF-PRUEBA, comprobar stock 0 y selección para
reabastecimiento; registrar 2 unidades y comprobar stock 2 y un movimiento.
Intentar crear REF-PRUEBA otra vez debe mostrar un error sin duplicarla.
