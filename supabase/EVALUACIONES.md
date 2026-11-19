# Evaluaciones diarias

Instalar una sola vez `migrations/202610280008_evaluaciones.sql` en el SQL Editor del proyecto Supabase utilizado por el dashboard, después de las migraciones existentes. Esperar el resultado Success antes de publicar la pantalla.

La migración crea una tabla nueva y una función; no importa el Excel ni altera bitácoras o inventario. Solo el encargado activo puede leer o guardar evaluaciones. Los dispositivos no tienen acceso. No se habilitan escrituras directas a la tabla.

Cada técnico tiene una evaluación por fecha de trabajo, con un turno seleccionado por el encargado. Los cuatro criterios aceptan enteros del 1 al 5. Resultado diario = suma × 5. El promedio semanal se calcula únicamente sobre las evaluaciones guardadas de ese técnico, con el mismo peso por día. Los días sin evaluar no son ceros. La semana va de domingo a sábado, según la convención existente del dashboard. La fecha de trabajo determina la semana; las fechas de creación y última edición se guardan aparte en el servidor.

Las correcciones conservan la fecha y autor de creación, registran autor y fecha de última edición, e incrementan una revisión para impedir que dos ventanas sobrescriban cambios sin avisar. No se conserva un historial completo de versiones. Si la respuesta al guardar se interrumpe, consultar nuevamente la semana antes de reintentar.

## Comprobación en el piloto

1. Registrar una evaluación 4, 3, 5, 4: debe mostrar 80 %.
2. Registrar para el mismo técnico otro día de esa semana 5, 5, 5, 5: promedio 90 %, dos días.
3. Confirmar que un día sin evaluación no reduce ese promedio.
4. Corregir una evaluación y verificar el promedio. Intentar guardar desde otra ventana abierta antes de la corrección: debe pedir volver a consultar.
5. Comprobar que una fecha de trabajo del domingo pertenece a la semana que inicia ese domingo, aunque se evalúe el lunes.
6. Verificar con una cuenta de dispositivo que no se pueden leer ni guardar evaluaciones.

Esta primera versión no asigna actividades, no calcula cumplimiento a partir de bitácoras ni importa datos del Excel. Tampoco cambia la app Android.
