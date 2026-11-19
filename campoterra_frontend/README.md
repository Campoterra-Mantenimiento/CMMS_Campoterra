# Panel web de Campoterra

## Uso desde celular

Todas las pantallas cargan responsive.css y responsive.js. Por debajo de 992 px
el menú se despliega con el botón Menú; Escape lo cierra. Las tablas conservan
sus columnas dentro de una región desplazable horizontalmente. Los controles
y filtros se acomodan al ancho disponible. El mismo login del encargado permite
consultar y exportar; no se necesita instalar la app técnica para usar el panel.

Después de publicar, comprobar en Safari/Chrome del teléfono: iniciar sesión,
abrir/cerrar menú, consultar inventario, aplicar filtros en Reportes y descargar
PDF/Excel. El sistema del teléfono decide si abre el archivo o lo guarda en
Descargas. La adaptación no cambia permisos ni convierte el panel en offline.

## Publicar el piloto en GitHub Pages

Workflow preparado en `.github/workflows/pages.yml`; no implica que ya se haya
ejecutado o publicado. En GitHub, abrir el repositorio CMSS_Campoterra y seleccionar
Settings > Pages > Build and deployment > Source: GitHub Actions.
Subir los cambios a main y revisar Actions > Publicar dashboard. También se puede
ejecutar manualmente con Run workflow en main. El enlace definitivo aparece al
terminar el despliegue. Sin dominio personalizado, la dirección esperada es
https://iscjmora005-alt.github.io/CMSS_Campoterra/.

El despliegue incluye solo HTML, JavaScript, imágenes y librerías/licencias del
frontend. No publica backend, scripts SQL, pruebas ni respaldos. La URL y clave
publicable de config.js son públicas por diseño; los permisos reales dependen
de Supabase Auth, RLS y las comprobaciones de las funciones SQL.

Verificar desde el enlace publicado: login del encargado, rechazo de la cuenta
tablet, consultas y exportaciones. La sesión de file:// o localhost no se
transfiere al dominio publicado: iniciar sesión nuevamente. Este login usa
correo/contraseña, sin redirecciones OAuth; si luego se habilita recuperación de
contraseña o enlaces de correo, configurar las URLs autorizadas en Supabase.
Si Pages solicita cambiar visibilidad o plan, revisar opciones antes de cambiar
la privacidad del repositorio. No se cambia automáticamente.

Referencia: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

Interfaz administrativa en HTML, CSS y JavaScript. Incluye inicio de sesión,
dashboard, áreas, maquinaria, personal, inventario, bitácoras y reportes.
`auth.js` comparte el manejo de sesión y las peticiones con token Bearer.

## Servir los archivos localmente

Desde la raíz del repositorio (la API en el puerto 8000 solo se necesita en modo `local`):

```powershell
python -m http.server 5500 --bind 127.0.0.1 --directory campoterra_frontend
```

Abre [login.html](http://localhost:5500/login.html). En modo Supabase usa el
correo del encargado; en modo local usa la cuenta del backend anterior.
Este componente no necesita instalación npm ni compilación.

## Rutas del modo local

Las rutas heredadas usan `http://localhost:8000`, interpretado desde la
computadora que abre el navegador. En modo Supabase el adaptador intercepta
esas consultas y no contacta el servidor local. La variable
`EXPO_PUBLIC_API_URL` solo configura la app móvil.

Los estilos y scripts externos enlazados por las páginas requieren acceso
a sus respectivos servidores. El panel no implementa la cola SQLite de la app.
# Piloto con Supabase

`config.js` selecciona ahora `backend: 'supabase'`. Incluye únicamente URL y
clave publicable del piloto; no contiene contraseñas ni claves administrativas.
Instalar primero `../supabase/migrations/202610080004_acceso_encargado.sql`
como una nueva consulta en el SQL Editor. Las migraciones anteriores y las
cuentas autorizadas deben existir.

Servir esta carpeta por HTTP, abrir `login.html` y entrar con el correo y
contraseña del usuario Auth autorizado como `encargado`. La cuenta de la tablet
no permite entrar. La sesión del piloto es distinta de la antigua sesión local.
`Recordarme` usa localStorage; sin marcarlo se utiliza sessionStorage.

Disponibles: indicadores, actividades semanales, bitácoras, reportes, existencias,
movimientos, maquinaria, áreas y técnicos. Se conservan filtros y exportaciones.
Las fechas se agrupan según la zona horaria del navegador, como los filtros
actuales. Las lecturas se paginan en bloques de 500 para no truncar el historial;
esta etapa descarga el historial para calcular indicadores, por lo que debe
migrarse a agregaciones del servidor antes de escalar a historiales grandes.

Instalar también `../supabase/migrations/202610080005_administracion.sql` y
comprobar `../supabase/tests/verify_administracion.sql`. Habilita altas/edición
de catálogos, entradas de inventario y lectura de notificaciones mediante RPC
que verifica al encargado activo. No concede escrituras directas en las tablas.
Eliminar un técnico lo desactiva; maquinaria y áreas con historial no se borran.
La edición de perfil/contraseña sigue deshabilitada en este panel.
El adaptador no recurre a FastAPI cuando falla Supabase.
No se ha publicado el sitio en GitHub Pages todavía.

Las entradas usan una clave de idempotencia que se conserva en sessionStorage
si la respuesta falla. Reintentar con la misma pieza, cantidad y motivo en la
misma pestaña no duplica el movimiento. No cambiar los datos ni cerrar la pestaña
ante una respuesta incierta: verificar primero el historial de movimientos.
El botón se bloquea mientras se procesa. El servidor incrementa stock y registra
el movimiento en una transacción. Concurrencia multiconexión pendiente de prueba.

El indicador de eficiencia ya no muestra el 85 % fijo: indica que faltan tiempos
y metas para calcularlo. No se infiere eficiencia del número de reportes.

Para volver al sistema anterior, cambiar `backend` a `local` en `config.js`.
Las páginas antiguas conservan las rutas de FastAPI para ese modo. No se importan
datos de MySQL ni se sincronizan automáticamente entre ambas bases.

Pruebas: `node --test campoterra_frontend/tests/cloud.test.cjs` desde la raíz.
El SDK UMD 2.117.2 se distribuye localmente en `vendor/` con su licencia MIT;
se copió del paquete instalado en la app, sin depender de un CDN para el login.

## Comprobación manual pendiente

Después de instalar la migración: iniciar sesión con encargado, comprobar los
reportes de la tablet y stock esperado (8 si se hicieron ambos ejemplos), abrir
bitácoras/reportes/inventario, cerrar sesión y confirmar que el acceso con la
cuenta del dispositivo se rechaza. No compartir contraseñas en el chat.

Con migración 005: probar un técnico ficticio, edición y baja; un área ficticia
y cambio de estado; maquinaria sin historial; una entrada de 2 piezas; y marcar
una notificación como leída. Verificar stock y un único movimiento nuevo.
