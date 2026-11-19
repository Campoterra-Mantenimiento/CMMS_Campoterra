# Piloto Supabase de Campoterra

## Recuperación

Ver [RECUPERACION.md](RECUPERACION.md) para la preparación del respaldo y el ensayo
en un proyecto separado. El ensayo remoto todavía está pendiente; disponer del
código y de las pruebas locales no equivale a tener un respaldo recuperable.

## Concurrencia en PostgreSQL real (13 de octubre de 2026)

Ejecutar `node --test supabase/tests/concurrency.test.cjs` con Docker abierto.
Descarga postgres:17 y crea un contenedor temporal sin puertos ni red; lo elimina
con sus volúmenes al finalizar. No usa credenciales ni datos de Supabase.

Prueba aprobada con dos conexiones independientes y espera de bloqueo observada:
dos reportes distintos compiten por una pieza, solo uno se guarda; dos envíos con
la misma clave devuelven el mismo folio sin duplicar descuento, notificación ni
movimiento. También rechaza alta de refacciones y escritura directa de inventario
desde la tablet, y rechaza reportes/lecturas tras revocar su acceso.

Auth está simulado mediante el rol y el identificador de sesión. Esta prueba
completa la concurrencia local pendiente mencionada en las etapas anteriores;
no valida el inicio de sesión ni la API HTTP del proyecto alojado. Esas pruebas
deben ejecutarse aparte en el proyecto de recuperación con la app y el dashboard.

## Administración del encargado (quinta etapa)

Ejecutar `migrations/202610080005_administracion.sql` una sola vez, después
de las anteriores, y luego `tests/verify_administracion.sql`. Agrega operaciones
controladas de catálogos, entradas de stock con idempotencia y notificaciones.
Ningún cliente puede editar inventario directamente. La identidad dispositivo
se rechaza en todas estas funciones. No importa datos reales ni modifica MySQL.

Pruebas: `node --test supabase/tests/encargado.test.cjs` usando PGLITE_MODULE
como en las instrucciones siguientes. Verifica permisos, catálogos, conflictos,
preservación de historial, stock y reintentos. Falta prueba remota y concurrencia
entre conexiones independientes antes de entregar para uso real.

## Consultas del dashboard (cuarta etapa)

Instalar `migrations/202610080004_acceso_encargado.sql` una vez para habilitar
la comprobación del encargado activo. No cambia datos ni otorga escrituras.
El frontend ya tiene modo de consultas Supabase; instrucciones en
`../campoterra_frontend/README.md`. No repetir seeds ni las migraciones previas.

## Conexión de la tablet (tercera etapa)

Instalar `migrations/202610060003_acceso_dispositivo.sql` después de las dos
anteriores. Permite verificar la autorización de la tablet sin exponer la tabla
privada de accesos. Ejecutar `pilot_seed.sql` solo en el piloto vacío para
crear catálogos ficticios; se niega a mezclarlos con datos existentes.

La app ya tiene un modo Supabase opcional y pantalla de configuración inicial.
Consultar `../campoterra_app/README.md` para activar y probar. El dashboard
todavía no está conectado y los datos de MySQL no se han importado.

Este directorio prepara un piloto independiente. No modifica MySQL ni cambia
las conexiones actuales de la app o del dashboard. No es todavía la migración
completa ni un sistema listo para operar.

## Instalación inicial

1. Seleccionar `campoterra-piloto` en Supabase.
2. Abrir SQL Editor y crear una consulta nueva, con el rol `postgres`.
3. Copiar TODO `migrations/202610060001_pilot_base.sql` y ejecutar una sola vez.
4. Ejecutar `tests/verify_base.sql`: debe terminar sin errores y revertir sus
   datos ficticios automáticamente. Si falla, compartir el error, no credenciales.

La migración es transaccional: un error revierte todos sus cambios. No usa
`DROP` ni borra tablas existentes. Si ya fue aplicada, una segunda ejecución
falla y no altera su instalación. No crea usuarios, contraseñas ni datos reales.

## Identidad del dispositivo compartido

Habrá una identidad de Supabase Auth por encargado y otra por tablet. La
configuración inicial del dispositivo la hará el encargado. Los técnicos
seguirán seleccionando nombre y turno, sin cuentas individuales.

`campoterra_private.accesos` asigna la identidad Auth a `encargado` o
`dispositivo`. Solo administración desde SQL Editor puede modificarla en esta
fase. Ni la tablet ni un usuario recién creado pueden asignarse permisos.
No añadir `campoterra_private` a los esquemas expuestos por Data API.

Desactivar `activo` revoca los permisos de datos en la siguiente petición,
aunque el dispositivo conserve un token. No borra datos previamente descargados.
La publishable key por sí sola NO autoriza la tablet ni identifica al técnico.

## Alcance de esta primera migración

- Ocho tablas públicas de negocio y dos privadas de control.
- RLS en todas las tablas y permisos explícitos de solo lectura.
- Encargado autorizado: consulta todos los datos de negocio.
- Dispositivo autorizado: catálogos y reportes capturados por ese dispositivo.
- Visitante o cuenta Auth no autorizada: sin acceso a datos.
- Ninguna escritura desde clientes, ni siquiera de inventario por un encargado.

Los nombres y campos parten del backend, pero esto NO importa registros antiguos.
Las fechas usan zona horaria; las bitácoras nuevas requieren dispositivo y área.
La migración de registros antiguos necesitará un mapeo separado. No importar
contraseñas de MySQL a tablas públicas.

## Siguiente etapa

Implementar y probar una función transaccional para reporte, piezas, movimientos
y clave de idempotencia (incluyendo reintentos concurrentes). Después, altas y
entradas de inventario, configuración del dispositivo, adaptadores de app/web,
datos ficticios del piloto y pruebas con el servidor local apagado.

## Segunda migración: guardado de reportes

Después de instalar la base, ejecutar una sola vez
`migrations/202610060002_reportes.sql` en SQL Editor, como `postgres`.
Luego ejecutar `tests/verify_reportes.sql` para comprobar instalación y grants.
No volver a ejecutar la primera migración. Esta segunda migración no inserta
datos reales ni conecta automáticamente la app.

La RPC `registrar_reporte(p_clave uuid, p_reporte jsonb)` acepta los campos del
reporte móvil (`tecnico_id`, `turno_id`, `area_id`, `equipo_id` opcional,
`tipo_trabajo`, `descripcion`, `piezas` con `partId`/`qty`) y `fecha_registro`
ISO con zona horaria. El adaptador debe tomar esta fecha del `created_at` de
SQLite y conservarla en cada reintento, junto con la misma clave UUID.
No generar una nueva fecha ni clave al reintentar.

Solo una identidad Auth registrada como dispositivo activo puede ejecutarla.
La identidad se obtiene del token; nombre y turno siguen seleccionándose en
la tablet. El encargado no usa esta RPC con su sesión administrativa.
El replay compara el JSON guardado: reutilizar la clave con otro contenido
o dispositivo devuelve conflicto. Los errores PT422 son de validación,
PT409 requieren revisar conflicto/stock y PT403 indican falta de autorización.

La función guarda bitácora, descuento, movimientos, notificación e idempotencia
en una transacción. Agrupa piezas repetidas, bloquea filas en orden de ID y
serializa claves iguales mediante un advisory lock transaccional. No concede
escritura directa sobre las tablas.

Pruebas locales realizadas con PostgreSQL embebido y Auth simulado: éxito,
replay, conflicto de payload/dispositivo, cantidades inválidas, catálogos
inválidos, rechazo de acceso, reversión por stock insuficiente y revocación.
La concurrencia entre conexiones independientes y el flujo HTTP de Supabase
quedan pendientes de pruebas antes de usar datos reales.

No apuntar todavía la app a Supabase. No se ha ejecutado este SQL en la nube
desde Codex: la clave publicable no permite administrar el esquema.

Referencia: https://supabase.com/docs/guides/database/postgres/row-level-security

## Prueba local reproducible

Se probó la migración con PGlite (PostgreSQL embebido) y un contrato mínimo
simulado de Supabase Auth. Esto verifica SQL, RLS y grants, pero no reemplaza
las pruebas de la API alojada ni del login real.

Desde la raíz, en PowerShell:

```powershell
$sqlTestDir = Join-Path $env:TEMP 'campoterra-sql-validation'
npm install --prefix $sqlTestDir --no-audit --no-fund @electric-sql/pglite
$env:PGLITE_MODULE = Join-Path $sqlTestDir 'node_modules/@electric-sql/pglite'
node --test supabase/tests/base.test.cjs supabase/tests/reportes.test.cjs
```
