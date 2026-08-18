# Flujo de autoactualización

Esta semilla usa señales complementarias por eventos para actualizar una app ya instalada sin polling.

## 1. Señal única que autoriza recarga: `version.json`

La app instalada consulta `version.json` con `cache: no-store` cuando ocurre un evento real de ciclo de vida: inicio, foco, visibilidad, reconexión, `pageshow`, `updatefound` o `controllerchange`. Esos eventos **solo disparan la comprobación**. La página se recarga únicamente cuando la identidad de release servida por `version.json` es distinta de la identidad embebida en la página que está ejecutándose. Un `Service Worker` en `waiting`, `installed` o un `controllerchange` nunca autoriza una recarga por sí mismo.

`tools/generate-release.py` genera un `build` nuevo y `releasedAt` nuevo en cada ejecución cuando no se pasan valores explícitos. Como `render.yaml` ejecuta ese generador durante cada build, cada deploy de Render obtiene una identidad distinta. Esto convierte el deploy en la única causa válida de una recarga automática, incluso si otra pestaña ya actualizó valores compartidos en `localStorage`.

## 2. Señal secundaria: huellas de archivos críticos

El archivo `version.json` contiene huellas SHA-256 de los archivos críticos generadas por `tools/generate-release.py`. El cliente compara esas huellas sin descargar todos los archivos críticos en cada revisión. Cuando el manifiesto de release cambia, pide al Service Worker precargar los `criticalAssets` por evento real; esto ayuda a que idiomas nuevos, logo e íconos queden disponibles tras la recarga sin usar polling.

Existe un fallback directo opcional para diagnóstico de errores humanos, pero está desactivado por defecto y nunca autoriza una recarga. Si detecta un archivo modificado sin una identidad de release nueva, la app conserva la interfaz actual y espera un deploy válido. La verificación tolera assets opcionales ausentes y puede registrar cuándo aparece o cambia `assets/ui/ui_logo_principal_96x96.png` o cualquiera de los iconos PWA esperados en `assets/pwa`.

## 3. Service Worker

El Service Worker:

- Precarga el shell mínimo.
- No rompe la instalación si un archivo opcional falla.
- Usa `network-first` para navegación, HTML, CSS, JS y JSON.
- Usa `stale-while-revalidate` para assets estáticos generales.
- Usa `network-first` con fallback geométrico únicamente para el logo interno de UI (`assets/ui/ui_logo_principal_96x96.png`). Además, valida el `Content-Type` para evitar que un rewrite SPA de Render u otro hosting guarde `index.html` como si fuera una imagen real. Los íconos declarados por `manifest.webmanifest` no reciben fallbacks generados: la instalación se ofrece solo cuando existen PNG reales. Durante el build, `tools/generate-release.py` conserva estable la ruta del manifest y cambia el parámetro `icon_rev` de cada ícono cuando cambia su contenido, de modo que Chrome para Android pueda detectar el cambio en su ciclo de actualización del WebAPK.
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

## Actualización del icono ya instalado

No cambies el nombre ni la ubicación de `manifest.webmanifest`. En Render, el `buildCommand` ejecuta `python tools/generate-release.py --require-backend`; si reemplazas un PNG dentro de `assets/pwa/`, el generador recalcula su huella y cambia únicamente `icon_rev` en el manifest. Ese cambio de URL permite que Chrome detecte que el icono cambió aun cuando el nombre del archivo físico se conserve.

En Chrome para Android, el icono del launcher se actualiza mediante el ciclo de actualización del WebAPK y puede no ser inmediato. En Chrome de escritorio moderno, los cambios de nombre e icono se consideran cambios de identidad sensibles: Chrome detecta el cambio cuando cambia el campo `icons` o la URL del icono, pero puede exigir que la persona confirme **Revisar actualización de la aplicación** antes de aplicar el nuevo icono. JavaScript y el Service Worker no pueden saltarse esa confirmación del navegador; la semilla sí garantiza que cada PNG nuevo produzca una URL `icon_rev` nueva para que la actualización quede detectable.


## Sin polling

La actualización no usa `setInterval`. Si la app permanece abierta sin foco, navegación ni reconexión, el navegador no entrega una señal confiable para consultar el static site sin caer en polling. La semilla prioriza la regla solicitada: actualización automática al iniciar, volver a foco, recuperar visibilidad, reconectar o recibir eventos del Service Worker.
