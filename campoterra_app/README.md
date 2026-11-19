# App de técnicos de Campoterra

Aplicación Expo/React Native para iniciar jornada, consultar el inicio,
capturar reportes de mantenimiento.

## Estructura

- `App.js`: navegación con React Navigation y un stack nativo.
- `src/screens/`: Login, Home, NewReport y MyReports.
- `src/services/api.js`: peticiones HTTP y token de sesión móvil.
- `src/services/offlineSync.js`: cola SQLite, caché de catálogos y sincronización.
- `assets/`: imágenes y recursos visuales.

La entrada configurada en `package.json` es `expo/AppEntry`; las pantallas
se registran en `App.js`, no mediante rutas basadas en archivos.

## Configurar y ejecutar

Necesitas Node.js/npm y el backend de Campoterra disponible. Desde esta carpeta:

```powershell
npm ci
Copy-Item .env.example .env
```

Edita `.env` con la dirección de tu backend, sin barra final. Ejemplo para
un emulador o navegador que pueda acceder a la API en esa dirección:

```dotenv
EXPO_PUBLIC_API_URL=http://HOST_DEL_BACKEND:8000
```

Sustituye `HOST_DEL_BACKEND` por una IP o nombre accesible. En un teléfono
físico usa la IP de red de la computadora que ejecuta la API y permite la
conexión al puerto 8000. La app y el servidor deben tener conectividad entre sí.

```powershell
npm start
```

Para compilar y ejecutar Android localmente con su SDK configurado, usa
`npm run android`. Para iOS, `npm run ios` requiere macOS y Xcode.
El proyecto incluye `expo-dev-client` para compilaciones de desarrollo.
`npm run web` también está disponible; verifica en esa plataforma las
funciones que dependen de SQLite y módulos nativos.

Si cambias la configuración, reinicia Expo; puedes usar `npx expo start -c`
para limpiar su caché. En desarrollo existe un respaldo local en `api.js`;
configura siempre tu propia URL. En producción, omitir la variable produce
un error explícito. La URL se incorpora al paquete JavaScript distribuido:
editar un `.env` local no cambia una app ya instalada.

`.env` no se versiona; `.env.example` es la plantilla compartida. Los valores
`EXPO_PUBLIC_*` son públicos dentro de la aplicación, no son un lugar para
contraseñas ni secretos del backend.

## Reportes sin conexión

Los reportes normales se guardan primero en SQLite con una clave UUID de
idempotencia. La sincronización usa esa misma clave al enviarlos a
`/api/reports/new`; el backend controla el inventario y evita duplicar el
descuento en los reintentos. Los catálogos se conservan en caché para capturas
sin red después de haberlos obtenido.

La cola registra estados pendiente, sincronizando, sincronizado y error,
con hasta cinco intentos por reporte. Los conflictos de inventario requieren
revisión. La cola de reportes normales no implica que el inicio de sesión
funcione sin conexión.

## Mis reportes

El inicio muestra un encabezado azul oscuro con nombre, turno, fecha y estado
de red; un botón circular azul para “Nuevo Reporte” sobre fondo claro; y las
cuatro capturas locales más recientes. Cada fila abre su detalle y “Ver todos”
abre Mis reportes. El menú permite consultar el historial o cerrar sesión.
El estado de red no confirma por sí solo la disponibilidad del backend.
El aviso de
sincronización abre directamente el filtro de errores o pendientes, según
corresponda. Ya no consulta las estadísticas generales del dashboard ni
muestra un contador de tiempo de jornada.

Desde el inicio, “Mis reportes” muestra las capturas guardadas en este
dispositivo para el técnico de la jornada activa, de más reciente a más antigua.
Funciona sin red e incluye filtros Todos, Pendientes, Enviados y Con error.
Al tocar una captura puedes consultar fecha, área, tipo de trabajo, descripción,
maquinaria, piezas y el último error de envío. Los nombres se toman de los
catálogos en caché; si faltan, se muestra el identificador correspondiente.
El detalle usa un encabezado industrial, una tarjeta de resumen y secciones
de información general, descripción y piezas con cantidades. El bloque de
sincronización refleja el estado real y conserva las acciones de reintento.
No incluye evidencias, fotografías ni adjuntos.

El número mostrado es local, no el folio del servidor. No descarga reportes
de otros dispositivos; borrar los datos de la aplicación elimina este historial
local. Los estados se actualizan cuando la sincronización existente los cambia.

## Verificación del historial

### Errores y reintentos

El detalle permite reintentar un reporte pendiente o con error. El reintento
conserva su contenido y clave de idempotencia; no crea una segunda captura.
Después de cinco intentos, los envíos automáticos se pausan para ese reporte;
un reintento manual inicia un nuevo ciclo. Las capturas agotadas no bloquean
las posteriores. Solo se envían reportes del técnico con sesión activa.

Los errores de inventario o datos muestran el detalle devuelto por el backend
y requieren revisión del encargado antes de reintentar; no se reintentan
automáticamente. No se editan ni se descartan piezas desde este flujo.
Una sesión vencida pide iniciar jornada de nuevo, sin consumir otro intento.
Sin red o sin sesión no se consumen intentos. Cada envío tiene un tiempo
máximo de espera de 20 segundos. Al abrir de nuevo la app se recuperan los
envíos interrumpidos conservando su clave; si ya agotaron cinco intentos,
quedan con error para revisión manual.

Para probar también las consultas de la cola con SQLite en memoria, usa
Node.js 24 o compatible con `node:sqlite`:

```powershell
node --test tests/*.test.cjs
```

Estas pruebas no se conectan a tu backend ni modifican la base del dispositivo.

```powershell
node --test tests/myReports.test.cjs
```

Estas pruebas aisladas comprueban el filtro por técnico, la consulta del historial
y las notificaciones de cambios, sin conectarse a SQLite nativo ni a la API.

## Verificación general

```powershell
npm run lint
```

Para validar el flujo completo, prueba inicio de jornada, captura de un
reporte, reconexión y sincronización contra un backend de prueba. El lint no
sustituye esas comprobaciones ni las pruebas en un dispositivo.
# Piloto Supabase: tablet compartida

El backend se selecciona al iniciar Expo con `EXPO_PUBLIC_BACKEND=local` o
`supabase` en `.env`. Ver las variables públicas en `.env.example`. No guardar
la contraseña de la tablet ni claves secretas en variables `EXPO_PUBLIC_*`.

Antes de abrir la app en modo Supabase, instalar las migraciones 001, 002 y
003 de `../supabase/migrations` en orden. En el proyecto vacío de piloto,
ejecutar `../supabase/pilot_seed.sql` una sola vez para cargar ejemplos ficticios.

Reiniciar con `npx expo start -c`. Aparece **Configurar tablet**: el encargado
introduce el correo y contraseña de la identidad Auth de tipo `dispositivo`,
cuyo UUID coincide con `EXPO_PUBLIC_SUPABASE_DEVICE_ID`. La contraseña no se
guarda; la sesión se persiste con Expo SecureStore. Una sesión vencida o
revocada puede requerir configuración nuevamente. Requiere Android/iOS;
esta configuración no se implementó para navegador. En development builds
existentes es necesario recompilar para incluir `expo-secure-store`.

Los técnicos mantienen nombre y turno. Cerrar la jornada no cierra la sesión
del dispositivo. Con catálogos previamente cargados pueden capturar sin red;
el servidor valida los datos al sincronizar. Recuperar una sesión expirada
tras reiniciar puede necesitar internet; no se promete arranque offline en
ese caso. Revocar el dispositivo bloquea el acceso remoto, no borra su caché.

La cola de SQLite se separa por proyecto y dispositivo. El historial y los
pendientes de MySQL permanecen en `campoterra-offline.db`, accesibles al volver
a `EXPO_PUBLIC_BACKEND=local`; NO se migran ni envían a Supabase automáticamente.
Cada reintento usa la misma clave y fecha de captura original.

Prueba manual del piloto: configurar tablet, elegir técnico de prueba y turno,
capturar reporte con una pieza, verificar bitácora y stock en Supabase, cortar
red, guardar otro reporte y reconectar. El dashboard web todavía usa FastAPI.
Expo Go requiere Metro; una app instalada independiente será necesaria para
probar con la computadora completamente apagada.

Pruebas aisladas: `node --test tests/myReports.test.cjs tests/offlineSync.test.cjs tests/supabase.test.cjs`.
