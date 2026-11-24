# Actividades dentro de Evaluaciones

## Instalación

Ejecutar una sola vez `migrations/202611040010_actividades.sql` en el SQL Editor del mismo proyecto Supabase. Después publicar los cambios de `campoterra_frontend`. La migración agrega una tabla y una función; no modifica las calificaciones, bitácoras ni existencias. Requiere la base y accesos existentes del proyecto.

## Uso

1. En Evaluaciones, consultar una fecha y, opcionalmente, un técnico. Actividades inicia en hoy; las calificaciones mantienen su fecha de consulta independiente, inicialmente ayer.
2. Pulsar Nueva actividad, elegir fecha, técnico activo, descripción y tipo Preventiva, Correctiva o Emergente. Se puede planear para fechas futuras, únicamente como pendiente.
3. Usar Revisar / editar para registrar Realizada, Pendiente o No realizada. Este último resultado exige explicar el motivo. Se pueden corregir descripción, tipo, resultado y observaciones; se conservan fecha y técnico originales.
4. Elegir Semana para consultar de domingo a sábado, con conteos y páginas de diez actividades. Los pendientes permanecen en su fecha; no se reprograman automáticamente.
5. En la tabla de evaluación diaria, Ver actividades abre el seguimiento del técnico y la fecha de esa evaluación. El encargado asigna las cuatro calificaciones manualmente.

La captura y revisión son exclusivas de cuentas con acceso de encargado activo. No se agrega captura a la app Android ni se crean cuentas nuevas. Las actividades no generan bitácoras, movimientos de inventario ni calificaciones automáticamente. Los PDF y Excel de evaluación conservan su contenido de calificaciones. En Actividades, el bloque Reporte semanal permite seleccionar año, número de semana y técnico para descargar PDF o Excel con logo, resultados y observaciones. Descarga todas las actividades guardadas de esa semana, independientemente de la búsqueda o página del listado. No se implementa cierre semanal que bloquee ediciones.

## Integridad y pruebas

RLS protege la lectura y una función protegida valida las escrituras. El identificador de creación permite reintentar la misma petición sin duplicarla. Las ediciones comprueban la revisión para rechazar sobrescrituras desde ventanas desactualizadas. Se guardan autor y fecha de creación y última edición; no un historial de todas las versiones. Ante una respuesta incierta, volver a consultar antes de crear o cambiar la actividad.

- `node --test campoterra_frontend/tests/*.test.cjs`
- Con PGlite disponible: `node --test supabase/tests/actividades.test.cjs supabase/tests/evaluaciones.test.cjs` (admite `PGLITE_MODULE`).
- Con Playwright y Edge: `node campoterra_frontend/tests/actividades-ui.cjs` (admite `PLAYWRIGHT_MODULE`). Usa datos ficticios, no conecta con Supabase.

Después de instalar y publicar, verificar con una cuenta de encargado: crear tarea planeada, registrar emergente, actualizar resultado, consultar semana y abrir Ver actividades desde una evaluación. Comprobar que las calificaciones existentes no cambiaron.

## Tipos de actividad

Ejecutar también `migrations/202611040011_tipos_actividades.sql` antes de publicar la versión con los nuevos tipos. Las actividades anteriores con tipo Planeada se conservan; al editarlas, el encargado selecciona Preventiva, Correctiva o Emergente. No se reclasifican automáticamente.

## Eliminar actividades

Ejecutar una sola vez `migrations/202611040012_eliminar_actividades.sql` y publicar el frontend. El botón Eliminar pide confirmación con técnico, fecha y descripción. Solo un encargado activo puede borrar; la revisión evita borrar una actividad modificada desde otra ventana. La eliminación es definitiva y actualiza listado y conteos, sin modificar calificaciones ni bitácoras.

## Turnos por actividad
Ejecutar `migrations/202611120013_turnos_actividades.sql` antes de publicar el frontend. El encargado selecciona Día (06:00–14:00), Tarde (14:00–22:00) o Noche (22:00–06:00 del día siguiente). La fecha corresponde al inicio del turno. Los registros anteriores permanecen sin asignar y pueden editarse. El turno se incluye en el listado, búsqueda y exportaciones semanales PDF/Excel. No modifica las calificaciones ni el catálogo de turnos de las bitácoras.

## Fecha de terminación y materiales
Antes de publicar estos cambios, ejecutar una sola vez `migrations/202611200014_terminacion_materiales_actividades.sql` en el SQL Editor de Supabase, después de la migración de turnos. Luego publicar el frontend.

El encargado puede capturar y editar la fecha de terminación y los materiales (texto libre con cantidades, máximo 2000 caracteres). Ambos son opcionales para conservar los registros anteriores. La fecha no puede ser anterior a la fecha de la actividad; no se llena automáticamente ni cambia el resultado. Los materiales son informativos y no descuentan inventario. Ambos campos aparecen en el listado, PDF diario, PDF semanal y Excel semanal. La consulta por día o semana sigue usando la fecha original de la actividad. Guardar y agregar otra limpia estos dos campos para la nueva tarea.

Verificación: crear una actividad con ambos datos, consultarla y editarla, probar fecha anterior, revisar PDF y Excel y comprobar que un registro antiguo se abre sin datos inventados.

## Actividades de rutina
En Nueva actividad aparece una lista de seis rutinas proporcionadas por el encargado, debajo del resultado. Seleccionar fecha, técnico y turno, marcar las tareas y pulsar Asignar seleccionadas. Cada tarea queda independiente en Pendiente, con el tipo, fecha de terminación y materiales del formulario. La descripción y observaciones de una actividad especial no se incluyen: se conservan para Guardar actividad. No hay asignación automática diaria ni movimientos de inventario.

Cada rutina tiene un identificador estable por fecha, técnico y turno. Antes de asignar se consultan las ya guardadas; repetir o reintentar no reemplaza actividades existentes. Ante un fallo parcial se desmarcan las confirmadas y se conservan las restantes para reintentar. Una rutina borrada puede asignarse de nuevo. Otro turno, técnico o fecha tiene asignaciones independientes. Aparecen en los PDF y Excel existentes. No requiere migración SQL adicional (requiere la migración de terminación y materiales ya instalada).
