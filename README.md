# VODX + Kick Wrapped

Aplicación móvil-first que reúne herramientas para creadores de Kick: preparación de descargas de VODs y tarjetas Wrapped con estadísticas verificables.

## Estado actual — Fase 2

Implementado:
- Interfaz móvil con dos módulos independientes.
- Validación local de URLs de VOD de Kick.
- Validación de intervalos HH:MM:SS.
- Vista previa Wrapped con periodo y nombre de canal.
- Exportación de tarjeta PNG y opción de compartir cuando el dispositivo lo admite.
- Métricas no disponibles identificadas explícitamente; no se fabrican datos.
- Pruebas unitarias con Node.js.
- Backend Node.js con endpoint de salud y consulta de canal mediante la API pública oficial de Kick.\n- Cache de token OAuth de aplicación en memoria y credenciales solo del lado del servidor.\n- Workflow de validación y workflow para construir un APK de depuración con Capacitor.

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
npm start
```

Para preparar Android localmente:

```sh
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

En GitHub, el workflow **Build Android APK** genera el artefacto `vodx-debug-apk`. Se ejecuta al cambiar archivos relevantes o manualmente desde Actions.

## Configuración del backend\n\nCrea una aplicación en [Kick Developer](https://dev.kick.com) y configura `KICK_CLIENT_ID` y `KICK_CLIENT_SECRET` como variables de entorno del servidor. No subas credenciales reales al repositorio. El backend expone `GET /api/health` y `GET /api/kick/channel?slug=usuario`.\n\nPara Railway, usa `npm start`; el healthcheck está configurado en `/api/health`. La interfaz y la API deben servirse desde el mismo origen.\n\n## Arquitectura

- `www/`: interfaz HTML, CSS y JavaScript.
- `www/core.js`: validaciones y funciones puras.
- `tests/`: pruebas unitarias.
- `.github/workflows/`: validación y compilación Android.

## Seguridad y limitaciones

La validación de una URL no significa que Kick permita descargar el VOD. La consulta de canal requiere credenciales de Kick configuradas en el backend. Esta fase no inicia una descarga real ni evita autenticación, DRM o controles de acceso. La integración debe usar fuentes accesibles y permitidas. No se deben introducir contraseñas de Kick ni publicar tokens en el cliente.

Kick Wrapped muestra métricas como no disponibles hasta disponer de una fuente verificable. No se presentan valores ficticios como estadísticas reales.
