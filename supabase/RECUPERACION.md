# Respaldo y recuperación de Campoterra

Estado: procedimiento preparado; respaldo alojado y restauración aún NO ejecutados.
No considerar recuperable el sistema hasta completar el ensayo y registrar evidencia.

## Qué conservar

Guardar estructura, funciones, políticas RLS, permisos, datos públicos, esquema
campoterra_private (accesos y claves de reintento) y usuarios/identidades de Auth.
Conservar también una versión identificada del repositorio. Una exportación Excel
no contiene todo esto y no sustituye un respaldo.

Registrar aparte la configuración del proyecto: registro público deshabilitado,
proveedores de acceso, URLs autorizadas y esquemas expuestos. El esquema privado
no debe exponerse en Data API. Contraseñas y secretos van en el gestor de
contraseñas de la institución, nunca en Git ni en capturas compartidas.
Los archivos de Storage, si se incorporan después, requieren respaldo separado.

## Preparación del ensayo

1. Abrir Docker Desktop y esperar a que el motor esté funcionando.
2. Instalar Supabase CLI y el cliente PostgreSQL (psql), registrar versiones.
3. En Connect del proyecto origen obtener los parámetros de Session pooler.
   La contraseña de base se introduce únicamente en el equipo del responsable;
   la clave publicable de la app no sirve para este respaldo.
4. Usar una carpeta nueva fuera del repositorio y almacenamiento institucional
   con acceso restringido. Los dumps contienen información sensible de Auth.
5. Acordar una pausa de capturas y cambios mientras se toma el respaldo y la
   referencia de comparación; no cambiar el esquema durante las exportaciones.
6. Ejecutar tests/recovery_snapshot.sql en origen y conservar TODOS sus resultados.

## Exportación

Seguir la guía oficial enlazada abajo: exportar roles, esquema y datos en archivos
separados con Supabase CLI. Comprobar que todos los comandos terminan con éxito.
Revisar que están incluidos public, campoterra_private y los datos Auth, sin
imprimir contraseñas, hashes de acceso ni sesiones en terminales compartidas.
Guardar fecha, versión CLI, referencia del proyecto, versión del código y hashes
SHA-256 de los archivos. Una suma de comprobación acredita integridad del archivo,
pero no demuestra que se pueda restaurar.

## Restauración de prueba

Crear un proyecto Supabase nuevo y vacío, separado de campoterra-piloto.
Registrar su referencia y comprobar que es distinta de ursyrtrsyuvczpwfdlkk.
No instalar previamente nuestras migraciones ni seed: el respaldo de esquema
ya contendrá los objetos. No restaurar encima del piloto o una base con datos.

Usar el procedimiento oficial de restauración transaccional con psql y parada
ante errores. No ignorar fallos de permisos o eliminar objetos para continuar:
conservar el error y resolverlo antes de repetir en un destino limpio.
Si se usa Vault o cifrado de columnas en el futuro, revisar sus requisitos de
recuperación antes del ensayo. No asumir que todas las opciones de plataforma
se transfieren con el SQL.

## Criterios para aceptar la recuperación

- Comparar todos los conteos, existencias por pieza y movimientos de
  tests/recovery_snapshot.sql. Conteos iguales solos no prueban igualdad completa:
  cotejar también folios, descripciones, fechas y relaciones de los reportes.
- Revisar RLS y ejecutar verify_reportes.sql, verify_administracion.sql y
  verify_refacciones.sql en el destino.
- Probar inicio de sesión real del encargado y tablet. La tablet no debe poder
  administrar y una cuenta sin acceso no debe ver información.
- En el destino, crear un reporte con una pieza, comprobar descuento y movimiento;
  reintentar con la misma clave/payload y comprobar que no se duplica.
- Crear una refacción y un reporte nuevos para detectar problemas de secuencias.
- Revocar la tablet en el destino y comprobar rechazo de nuevas peticiones.
- Probar app/dashboard en una configuración separada; no redirigir el piloto ni
  sincronizar su cola offline al proyecto de ensayo.
- Registrar duración, errores, resultados y fecha del último dato recuperado.

## Operación posterior

El encargado debe designar responsable y frecuencia según cuántos registros
pueden permitirse perder. Mantener varias copias fechadas y una fuera del equipo;
verificar periódicamente restauración y acceso del responsable a las cuentas.
No borrar respaldos antiguos hasta verificar el nuevo. Considerar transferencia
consumida por los respaldos al revisar Usage.

## Fuente del procedimiento de plataforma

https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

Los pasos de comparación y aceptación anteriores son específicos de Campoterra.
