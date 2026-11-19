# API de Campoterra

Backend de mantenimiento para la app de técnicos y el panel administrativo.
Usa FastAPI, SQLAlchemy y MySQL; Alembic gestiona las migraciones.
`main.py` registra los routers por dominio de `routers/`; `models.py` define
las tablas y `schemas.py` los contratos de entrada y salida.

## Preparación y arranque local

Necesitas Python compatible con las dependencias de `requirements.txt` y
un servidor MySQL. Desde `campoterra_backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Configura `.env` como se explica abajo. La base MySQL debe existir antes de
ejecutar Alembic. Para una base nueva y vacía, ejecuta
`python -m alembic upgrade head`; para una existente, sigue el diagnóstico
y el procedimiento de adopción de este documento.

```powershell
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

La documentación interactiva local está en [Swagger UI](http://localhost:8000/docs).
Este comando inicia el servidor de desarrollo; no ejecuta migraciones.

## Autenticación y perfil

El endpoint `POST /api/login/` conserva `mensaje`, `username` y `rol`, y ahora
también devuelve `access_token` y `token_type: "bearer"`. Las contraseñas nuevas
se almacenan con PBKDF2-SHA256; los registros antiguos en texto plano se migran
al hash tras un inicio de sesión válido.

Configura `CAMPOTERRA_TOKEN_SECRET` con un valor aleatorio largo. En producción
también establece `CAMPOTERRA_ENV=production`; el backend se detendrá con un
mensaje explícito si falta la clave. En desarrollo se genera una clave temporal
para no incluir secretos en el repositorio.

Las rutas del Dashboard requieren `Authorization: Bearer <access_token>`.
`GET /api/shift/options` permanece público porque sólo entrega las opciones
necesarias para mostrar el selector de inicio de jornada. `POST /api/shift/start`
valida que el técnico esté activo y el turno exista, y devuelve un token de
sesión temporal para la app móvil. La app debe enviarlo como
`Authorization: Bearer <token>` en estadísticas, catálogos, inventario y
reportes. Las rutas móviles de lectura/escritura protegidas ya no aceptan
peticiones sin ese token.

El perfil del usuario autenticado del Dashboard se consulta y actualiza con
`GET` y `PUT /api/mi-perfil`. El perfil guarda `nombre` y `cargo` en `usuarios`;
el cambio de contraseña requiere la contraseña actual y conserva PBKDF2-SHA256.
Estas columnas se gestionan con las migraciones de Alembic; el arranque no
modifica el esquema. No se persiste un avatar: la interfaz genera el avatar con las
iniciales mediante `ui-avatars.com`.

## Configuración sensible del backend

Instala las dependencias desde `campoterra_backend` con
`pip install -r requirements.txt`. Para desarrollo local, copia
`.env.example` como `.env` dentro de esa carpeta y sustituye los placeholders
por los datos de una base MySQL local:

```powershell
Copy-Item .env.example .env
```

`CAMPOTERRA_TOKEN_SECRET` debe ser un valor aleatorio de al menos 32 caracteres.
Puedes generar uno localmente con
`python -c "import secrets; print(secrets.token_urlsafe(48))"`. El secreto de
desarrollo temporal existente sigue disponible si no configuras esta variable,
pero los tokens firmados así dejan de ser válidos al reiniciar el backend.
No compartas ni agregues `.env` al repositorio.

En producción, configura `CAMPOTERRA_ENV=production` y las variables
`CAMPOTERRA_DB_HOST`, `CAMPOTERRA_DB_NAME`, `CAMPOTERRA_DB_USER`,
`CAMPOTERRA_DB_PASSWORD` y `CAMPOTERRA_TOKEN_SECRET` en el entorno del proceso o
en el gestor de secretos del despliegue. `CAMPOTERRA_DB_PORT` es opcional y
predeterminado a `3306`. Producción no carga `.env`; el backend falla claramente
si faltan variables de base de datos o si el secreto de autenticación está
ausente, es un placeholder, tiene poca diversidad o no cumple la longitud
mínima.

Rota las credenciales MySQL y el secreto de autenticación si pudieron quedar
expuestos. Al rotar el secreto de autenticación, los tokens existentes dejan
de ser válidos.

## Migraciones de base de datos (Alembic)

El esquema de la base de datos **ya no se crea ni se repara automáticamente**
al arrancar el backend. Se gestiona con [Alembic](https://alembic.sqlalchemy.org/)
mediante migraciones versionadas en `campoterra_backend/alembic/versions/`.

`alembic/env.py` reutiliza `config.build_database_url()` (las mismas
variables `CAMPOTERRA_DB_*` del `.env`), así que no hay que configurar nada
adicional: basta con tener el `.env` listo como se describe arriba.

### Migraciones existentes

1. **`666a25081cd6` (baseline_schema)**: crea las tablas tal como las
   generaba `models.Base.metadata.create_all()` *antes* de que existieran
   los ajustes manuales de perfil de usuario y áreas (sin
   `usuarios.nombre`/`cargo`, sin `bitacoras.id_area`, con
   `bitacoras.id_equipo` todavía obligatorio).
2. **`8fb1b3aaed4d` (perfil_usuario_y_areas)**: réplica versionada de lo que
   hacían, en cada arranque, las funciones ya eliminadas
   `asegurar_columnas_perfil_usuario()` y `asegurar_esquema_areas()`: agrega
   `usuarios.nombre`/`cargo`, agrega `bitacoras.id_area` (con su llave
   foránea), vuelve `bitacoras.id_equipo` opcional y siembra las 7 áreas de
   mantenimiento iniciales si no existen.

> Alembic no tiene "alias" de nombre para revisiones: el identificador que
> hay que usar en los comandos `stamp`/`upgrade` es el hash corto
> (`666a25081cd6`, `8fb1b3aaed4d`), no el slug descriptivo del archivo. Los
> comandos de esta sección usan siempre el hash real.

### Cómo adoptar Alembic en una base existente

Antes de decidir cómo adoptar Alembic, desde `campoterra_backend` ejecuta:

```powershell
python scripts/check_schema.py
```

El diagnóstico es de solo lectura. Compara tablas, columnas, tipos,
nulabilidad (incluido `bitacoras.id_equipo`), índices, restricciones UNIQUE
y llaves foráneas contra los modelos usando Alembic. Comprueba además las
claves primarias y la presencia de las siete áreas iniciales. Una base con
otras tablas pero sin `usuarios` no se considera vacía. Los errores de
inspección se reportan como errores, no como elementos ausentes.

- Base realmente vacía y sin historial: recomienda `python -m alembic upgrade head`.
- Diferencias o áreas faltantes: termina con código 2 y no recomienda ningún
  `stamp`. Revisa las diferencias y prepara una migración hacia adelante.
- Base compatible sin historial: propone únicamente la revisión auditada
  `python -m alembic stamp 8fb1b3aaed4d`, después del respaldo y la revisión
  de los elementos no cubiertos. No marca futuras migraciones como aplicadas.
- Historial existente: lo conserva y pide revisar las migraciones pendientes;
  no recomienda volver a marcar la base.

El código 1 significa que la inspección falló; el 0 indica base vacía o sin
pendientes en las comprobaciones realizadas. El diagnóstico no verifica defaults
SQL (los modelos usan defaults Python), triggers, vistas ni procedimientos
almacenados y no certifica equivalencia absoluta del esquema.

Si el único pendiente es la FK de `bitacoras.id_area`, incluso si ya se
marcó una revisión como aplicada, la reparación que conserva datos e historial es:

```powershell
python scripts/repair_area_fk.py
```

Este script agrega únicamente la FK faltante. Si ya existe una equivalente,
no hace cambios; si encuentra referencias a áreas inexistentes, se detiene
sin borrar ni corregir datos automáticamente. Después vuelve a ejecutar el
diagnóstico. No uses `downgrade` para reparar esa FK: elimina columnas con
datos y requiere una relación que podría no existir.

Haz un respaldo antes de ejecutar cualquier reparación, migración o `stamp`.
El diagnóstico nunca ejecuta esos comandos por ti.

### Cambios de esquema futuros

A partir de ahora, cualquier cambio a `models.py` debe ir acompañado de una
migración:

```powershell
python -m alembic revision --autogenerate -m "descripcion_del_cambio"
python -m alembic upgrade head
```

Revisa siempre el archivo generado en `alembic/versions/` antes de aplicarlo:
`autogenerate` es una ayuda, no un reemplazo de la revisión manual (por
ejemplo, no detecta cambios de datos ni siempre elige bien los nombres de
índices/constraints).

### Validación del flujo completo (realizada durante el desarrollo de este cambio)

Se probó contra **MySQL 8 real** (contenedor Docker local, no SQLite):
- Base vacía → `alembic upgrade head` → esquema resultante idéntico a
  `models.py` (confirmado con `alembic revision --autogenerate`: cero
  diferencias detectadas).
- Base con el esquema viejo + datos de ejemplo → `alembic stamp
  666a25081cd6` + `alembic upgrade head` → columnas agregadas
  correctamente y **todas las filas preservadas sin pérdida**.
- Base con la columna `bitacoras.id_area` ya presente pero SIN la llave
  foránea (caso de instalaciones que corrieron una variante vieja de la
  función ad-hoc) → `alembic upgrade head` → la FK se crea igualmente,
  confirmado que la columna y la FK se verifican de forma independiente.
- Base con la columna `bitacoras.id_area` Y una FK equivalente ya presente
  pero con **otro nombre** de constraint (no
  `fk_bitacoras_id_area_areas_mantenimiento`) → `alembic upgrade head` → no
  se duplica ni falla, porque la detección compara por columnas + tabla
  referenciada, no por el nombre literal de la constraint.
- Base ya "migrada a mano" (equivalente al resultado de las funciones
  ad-hoc) → `alembic stamp head` → no se ejecuta ningún ALTER, `alembic
  current` confirma `head`.
- Dump legado con una sentencia `USE`/`CREATE DATABASE` referenciando un
  nombre de base **entre backticks con guion** (ej. `` `mi-base` ``,
  carácter no cubierto por el patrón original) apuntando a una base
  distinta a la destino configurada → `restore_db.py` lo detecta y aborta
  la restauración en vez de ejecutarla.

## Respaldo y restauración de la base de datos

Scripts en `campoterra_backend/scripts/backup_db.py` y `restore_db.py`
(Python + `subprocess`, no PowerShell) para que funcionen igual sin importar
el shell que uses. Requieren tener instalados los clientes `mysqldump` y
`mysql` de MySQL (se instalan junto con el servidor de MySQL o con "MySQL
Shell"/"MySQL Client" independiente) y accesibles en el `PATH`.

Las credenciales se leen del mismo `.env` que usa el backend
(`config.build_database_url()`) y nunca se imprimen en pantalla ni se pasan
como argumento de línea de comandos: se escriben en un archivo temporal
`--defaults-extra-file` que se borra automáticamente al terminar.

### Generar un respaldo

```powershell
cd campoterra_backend
python scripts\backup_db.py
```

Esto crea un archivo `campoterra_<basededatos>_<AAAAMMDD_HHMMSS>.sql` dentro
de `campoterra_backend/backups/`. Esa carpeta está excluida de git
(`.gitignore`): **los respaldos nunca deben subirse al repositorio**, porque
contienen datos reales.

**Recomendación de frecuencia/retención** (entorno local, sin automatización
en la nube): genera un respaldo manual antes de cada `alembic upgrade`/
`stamp`, antes de cambios riesgosos, y al menos una vez por semana si hay
actividad normal. Conserva los últimos 5–10 respaldos y borra manualmente los
más antiguos desde `backups/` cuando el espacio en disco lo amerite.

### Restaurar un respaldo

⚠️ **Operación destructiva**: puede reemplazar tablas y datos del respaldo en
la base configurada en tu `.env`. No garantiza eliminar objetos ajenos al dump.

```powershell
cd campoterra_backend
python scripts\restore_db.py                                  # lista los respaldos disponibles
python scripts\restore_db.py backups\campoterra_<...>.sql      # restaura uno específico
```

El script pide escribir `CONFIRMAR` antes de continuar. No hay forma de
deshacer una restauración salvo teniendo otro respaldo más reciente.

### Prueba realizada (ciclo completo, contra MySQL real)

Se generó un respaldo de una base de prueba con datos (equipos, usuarios y
áreas de mantenimiento), se **borraron y modificaron** esos datos a propósito
(incluyendo insertar una fila basura), se restauró el respaldo y se comparó
un snapshot completo de las tablas antes/después: **el resultado fue
idéntico, sin pérdida de datos y sin rastro de los cambios destructivos**.

### Limitación de validación en este entorno

Este entorno de desarrollo no tiene instalados los binarios nativos
`mysql`/`mysqldump`, pero sí Docker. Para probar el flujo real se usó un
contenedor `mysql:8` local y un *shim* temporal (no incluido en el
repositorio) que reenviaba las llamadas a `docker exec`, ejercitando
exactamente el mismo código de `backup_db.py`/`restore_db.py` que usará el
usuario final. **Pendiente de validación manual por el usuario**: confirmar
que `mysqldump`/`mysql` están instalados y en el `PATH` de su máquina (lo
usual según los componentes instalados de MySQL) y correr una vez
el ciclo de respaldo/restauración contra una base temporal separada antes de confiar en el
procedimiento para datos de producción.

## Pruebas aisladas

Desde `campoterra_backend`:

```powershell
python -B -m unittest discover -s tests -v
```

Estas pruebas usan simulaciones y no se conectan a MySQL. Cubren el diagnóstico
de esquema y la reparación de FK; no validan por sí solas el funcionamiento
completo de los endpoints ni la restauración con los clientes MySQL locales.
# Acceso exclusivo del encargado

El dashboard admite únicamente cuentas activas con rol `Administrador`.
El servidor verifica el estado y el rol actuales en cada petición protegida;
un token móvil no permite administrar personal, inventario o maquinaria.
Los técnicos activos conservan la lectura de equipos y piezas y el catálogo
móvil de áreas, además de sus rutas de captura.

`POST /api/usuarios/` requiere la sesión de un administrador activo y solo
crea cuentas de encargado. No existe registro público. Las cuentas existentes
con otro rol no tienen acceso al dashboard.

En una instalación nueva, después de aplicar las migraciones y configurar
la base, ejecuta desde `campoterra_backend`:

```powershell
python -m scripts.create_admin
```

El comando solicita la contraseña sin mostrarla, la almacena como hash y se
niega a continuar si ya existe un administrador activo. No sobrescribe cuentas.
Ejecútalo solo desde una terminal del responsable de la instalación.

Para pruebas HTTP aisladas instala `requirements-dev.txt` y ejecuta desde la
raíz `python -B -m unittest discover -s campoterra_backend/tests -v`.
Las pruebas de permisos usan SQLite en memoria, sin cargar `.env` ni acceder a MySQL.

Pendiente antes de publicar: el inicio de jornada móvil aún permite seleccionar
un técnico sin contraseña; debe reemplazarse por autenticación individual.
