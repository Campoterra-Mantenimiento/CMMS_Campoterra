# Instalación Android

El nombre instalado es **Campoterra CMMS**. `app.json` utiliza la imagen
adaptada del diseño proporcionado en `assets/images/campoterra-app-icon.png`.
El fondo azul llega hasta los bordes, sin margen blanco ni esquinas redondeadas
incorporadas en la imagen, como icono convencional.
No se utilizan los iconos adaptativos de ejemplo de Expo.

El perfil `preview` de `eas.json` genera un APK de distribución interna,
sin cliente de desarrollo. El instalador todavía debe compilarse y probarse
en el dispositivo Android; cambiar estos archivos no actualiza una app instalada.

Desde esta carpeta, inicia sesión en la cuenta Expo responsable del proyecto:

```sh
npx eas-cli login
npx eas-cli build:configure --platform android
```

Configura en el entorno **preview** de EAS las variables públicas de Supabase
indicadas en `.env.example`: `EXPO_PUBLIC_BACKEND=supabase`, URL, clave
publishable y UUID de la cuenta del dispositivo. Usa los valores del piloto
validado. No incluyas contraseñas, claves secretas ni service_role. El `.env`
local ignorado por Git no sustituye esta configuración de compilación.

```sh
npx eas-cli build --platform android --profile preview
```

La carpeta `android/` local es generada y está ignorada por Git. Para EAS se
genera a partir de la configuración versionada. Si se compila localmente,
primero sincroniza con `npx expo prebuild --platform android` (sin `--clean`)
y revisa los recursos generados.

Conserva la cuenta Expo y la clave de firma para futuras actualizaciones.
Después de instalar el APK, verifica el icono, autoriza la tablet y prueba
captura, envío y reintentos con la computadora apagada. No desinstales una
versión con reportes pendientes: los datos locales podrían perderse.

Referencia: https://docs.expo.dev/build-reference/apk/
