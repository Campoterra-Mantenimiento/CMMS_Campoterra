# Campoterra CMMS

Sistema de gestión de mantenimiento desarrollado por Jaime Mora Acosta durante su residencia profesional para Campoterra.

## Operación actual

El panel web y la aplicación Android utilizan Supabase como servicio compartido.
Incluyen bitácoras, catálogos, inventario, asignación y seguimiento de actividades,
evaluaciones de técnicos y exportaciones en PDF y Excel. La aplicación conserva
reportes pendientes de sincronización en SQLite.

- campoterra_frontend: panel web y publicación con GitHub Pages.
- campoterra_app: aplicación Android con React Native y Expo.
- supabase: migraciones, pruebas y procedimientos de respaldo.
- campoterra_backend: alternativa anterior FastAPI/MySQL; no es necesaria para operar con Supabase.

## Publicación

Configurar Pages con GitHub Actions y ejecutar el flujo de publicación en main.
El flujo valida el panel y publica únicamente sus archivos web.
La configuración pública conserva la URL y clave publicable de Supabase actual.
El acceso a datos depende de la autenticación y las políticas de la base de datos.

Para Android consultar campoterra_app/ANDROID.md y la plantilla .env.example.
La vinculación Expo y la identidad Android se conservan durante esta transición.

## Pruebas locales

    node --test campoterra_frontend/tests/*.test.cjs
    node --test campoterra_app/tests/*.test.cjs
    node --test supabase/tests/*.test.cjs

Estas pruebas no sustituyen la comprobación remota de Supabase ni de la APK instalada.
Consultar ENTREGA.md para los pasos pendientes de administración institucional.
