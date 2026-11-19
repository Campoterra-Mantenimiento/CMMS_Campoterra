# Mínimos de refacciones

Aplicar una vez `migrations/202610190007_minimos_refacciones.sql` en el SQL Editor
del proyecto Supabase antes de publicar el frontend. No cambia existencias ni
movimientos. Los mínimos iniciales son nulos: no se presupone un umbral de 5.

En Inventario, el encargado usa **Configurar mínimo** por pieza. Vacío elimina
el mínimo; cero es válido. Solo la cuenta de encargado activa puede guardar.
Los clientes no reciben permisos de escritura directa sobre las tablas.

- Agotada: stock cero (también sin mínimo).
- Existencia baja: stock positivo menor al mínimo.
- Disponible: stock positivo igual o mayor al mínimo.
- Sin mínimo configurado: stock positivo y mínimo nulo.

El filtro incluye agotadas y bajas. El Excel incluye esas mismas piezas con
logo, fecha, existencias, mínimo y faltante para alcanzar el mínimo. No realiza
compras ni entradas de almacén. Con mínimo desconocido no inventa cantidades.
La configuración de mínimos está habilitada para Supabase; el backend MySQL
anterior no incorpora esta función.

Prueba manual tras instalar: configurar mínimo 5, comprobar stock 2 como bajo,
reabastecer hasta 5 y comprobar Disponible; quitar mínimo y comprobar Sin mínimo
configurado. Verificar la descarga y que los mínimos persistan al recargar.
