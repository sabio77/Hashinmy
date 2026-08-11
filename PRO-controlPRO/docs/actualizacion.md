# Flujo de autoactualización

Esta semilla usa señales complementarias por eventos para actualizar una app ya instalada sin polling.

## 1. Señal principal: `version.json`

La app instalada consulta `version.json` con `cache: no-store` únicamente cuando ocurre un evento real de ciclo de vida: inicio, foco, visibilidad, reconexión, `pageshow`, `updatefound` o `controllerchange`. Si detecta un cambio en `version`, `build`, `releasedAt`, `channel` o huellas de assets, agenda una recarga automática.

## 2. Señal secundaria: huellas de archivos críticos

El archivo `version.json` contiene huellas SHA-256 de los archivos críticos generadas por `tools/generate-release.py`. El cliente compara esas huellas sin descargar todos los archivos críticos en cada revisión. Cuando el manifiesto de release cambia, pide al Service Worker precargar los `criticalAssets` por evento real; esto ayuda a que idiomas nuevos, logo e íconos queden disponibles tras la recarga sin usar polling.

Existe un fallback directo opcional para errores humanos, pero no usa polling: solo puede ejecutarse cuando una revisión por evento ya está ocurriendo y respeta una ventana mínima entre corridas. Esta verificación directa ahora tolera assets opcionales ausentes, registra el estado `missing` y detecta cuando aparece o cambia `assets/icons/logo.png` o cualquiera de los íconos esperados.

## 3. Service Worker

El Service Worker:

- Precarga el shell mínimo.
- No rompe la instalación si un archivo opcional falla.
- Usa `network-first` para navegación, HTML, CSS, JS y JSON.
- Usa `stale-while-revalidate` para assets estáticos generales.
- Usa `network-first` con fallback geométrico generado para logo/íconos PNG opcionales cuando todavía no existen archivos reales. Además, valida el `Content-Type` para evitar que un rewrite SPA de Render u otro hosting guarde `index.html` como si fuera una imagen real. El manifest conserva rutas PNG reales y agrega fallbacks `data:image/svg+xml` para que la app siga siendo instalable desde una semilla sin binarios de imagen.
- Fuerza frescura para `sw.js`, `version.json` y `app-metadata.js`.
- Ejecuta `skipWaiting()` para activar versiones nuevas.
- Ejecuta `clients.claim()` para tomar control de las ventanas abiertas.
- Limpia únicamente cachés `static` y `runtime` del namespace exacto de la aplicación; no usa el prefijo general que podría incluir carpetas hermanas.

## Archivos que no deben quedar congelados en CDN

Estos archivos deben usar `no-store`:

```text
/index.html
/sw.js
/version.json
```

Estos archivos deberían usar `no-cache` o una política equivalente de revalidación:

```text
/src/*
/assets/*
/textX/*
/manifest.webmanifest
```

Si un CDN congela `sw.js`, `index.html` o `version.json`, ninguna PWA puede garantizar actualización inmediata.


## Sin polling

La actualización no usa `setInterval`. Si la app permanece abierta sin foco, navegación ni reconexión, el navegador no entrega una señal confiable para consultar el static site sin caer en polling. La semilla prioriza la regla solicitada: actualización automática al iniciar, volver a foco, recuperar visibilidad, reconectar o recibir eventos del Service Worker.
