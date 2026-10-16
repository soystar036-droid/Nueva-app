# VODX + Kick Wrapped

Aplicación móvil-first que reúne herramientas para creadores de Kick: preparación de descargas de VODs y tarjetas Wrapped con estadísticas verificables.

## Estado actual — Fase 1

Implementado:
- Interfaz móvil con dos módulos independientes.
- Validación local de URLs de VOD de Kick.
- Validación de intervalos HH:MM:SS.
- Vista previa Wrapped con periodo y nombre de canal.
- Exportación de tarjeta PNG y opción de compartir cuando el dispositivo lo admite.
- Métricas no disponibles identificadas explícitamente; no se fabrican datos.
- Pruebas unitarias con Node.js.
- Workflow de validación y workflow para construir un APK de depuración con Capacitor.

Aún no implementado:
- Descarga real de VODs, selección de calidad, progreso, cancelación y guardado nativo.
- Conexión a una fuente autorizada de Kick para estadísticas reales.
- Datos de chat, emotes, cliperos y ranking de clips.
- Pruebas en un dispositivo Android físico.

## Desarrollo

Requiere Node.js 22 o superior.

```sh
npm install
npm run build
```

Para preparar Android localmente:

```sh
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

En GitHub, el workflow **Build Android APK** genera el artefacto `vodx-debug-apk`. Se ejecuta al cambiar archivos relevantes o manualmente desde Actions.

## Arquitectura

- `www/`: interfaz HTML, CSS y JavaScript.
- `src/core.js`: validaciones y funciones puras.
- `tests/`: pruebas unitarias.
- `.github/workflows/`: validación y compilación Android.

## Seguridad y limitaciones

La validación de una URL no significa que Kick permita descargar el VOD. Esta fase no inicia una descarga real ni evita autenticación, DRM o controles de acceso. La integración debe usar fuentes accesibles y permitidas. No se deben introducir contraseñas de Kick ni publicar tokens en el cliente.

Kick Wrapped muestra métricas como no disponibles hasta disponer de una fuente verificable. No se presentan valores ficticios como estadísticas reales.
