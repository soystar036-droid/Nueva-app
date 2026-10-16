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
- Backend Node.js con endpoint de salud y consulta de canal mediante la API pública oficial de Kick.
- Endpoint de descarga con validación estricta del enlace, límite de tamaño, timeout, una descarga simultánea, tareas en segundo plano, consulta de estado y limpieza de temporales.
- Descarga completa o fragmento de hasta 30 minutos mediante yt-dlp + ffmpeg, cuando se habilita explícitamente en el servidor.
- Cache de token OAuth de aplicación en memoria y credenciales solo del lado del servidor.
- Workflow de validación y workflow para construir un APK de depuración con Capacitor.

Aún no implementado:
- Barra de progreso, cancelación de descarga y guardado nativo directo en Android.
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

## Configuración del backend

Crea una aplicación en [Kick Developer](https://dev.kick.com) y configura `KICK_CLIENT_ID` y `KICK_CLIENT_SECRET` como variables de entorno del servidor. No subas credenciales reales al repositorio. El backend expone `GET /api/health`, `GET /api/kick/channel?slug=usuario`, `POST /api/download` y `GET /api/download/status?id=...`.

Para Railway, usa `npm start`; el healthcheck está configurado en `/api/health`. En la web puedes usar el mismo dominio; en Android abre **Conexión del servidor** dentro de la app y guarda la URL HTTPS pública de Railway. El backend permite CORS para el origen local de Capacitor y para los dominios indicados en `APP_ORIGIN` (separados por coma). `nixpacks.toml` añade yt-dlp y ffmpeg si el servicio realmente usa Nixpacks.

La descarga está **desactivada por defecto** para evitar que un endpoint público consuma almacenamiento o CPU sin control. Después de comprobar que las herramientas están disponibles y que tienes un límite de recursos adecuado, activa `VODX_ENABLE_DOWNLOADS=true` en las variables del servicio. Opcionalmente define `YTDLP_PATH`, `FFMPEG_PATH`, `TEMP_DIR` y `FILE_RETENTION_MS` (por defecto seis horas). El límite de archivo es 900 MB; los temporales se limpian al expirar (6 horas). El beta admite una descarga simultánea, hasta 3 descargas completadas cada 10 minutos y fragmentos de hasta 30 minutos. El servidor no elude VODs privados ni controles de acceso.

## Arquitectura

- `server/downloads.js`: servicio de descarga con límites y retención de archivos.
- `nixpacks.toml`: herramientas yt-dlp y ffmpeg para despliegues que usen Nixpacks.
- `www/`: interfaz HTML, CSS y JavaScript.
- `www/core.js`: validaciones y funciones puras.
- `tests/`: pruebas unitarias.
- `.github/workflows/`: validación y compilación Android.

## Seguridad y limitaciones

La validación de una URL no significa que Kick permita descargar el VOD. La consulta de canal requiere credenciales de Kick configuradas en el backend. Esta fase no inicia una descarga real ni evita autenticación, DRM o controles de acceso. La integración debe usar fuentes accesibles y permitidas. No se deben introducir contraseñas de Kick ni publicar tokens en el cliente.

Kick Wrapped muestra métricas como no disponibles hasta disponer de una fuente verificable. No se presentan valores ficticios como estadísticas reales.
