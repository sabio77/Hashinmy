# Automatización de release

El archivo central de actualización es `version.json`. Para evitar errores manuales, esta semilla incluye:

```bash
python tools/generate-release.py
```

Ese comando calcula SHA-256 y tamaño de archivos críticos, actualiza `version.json`, regenera `textX/languages.json` y sincroniza `src/js/app-metadata.js` con la versión/build y los idiomas detectados.

## Uso recomendado

```bash
python tools/generate-release.py --version 1.2.1 --build 2026-07-02-004
```

## Qué archivos firma

- `index.html`
- `offline.html`
- `manifest.webmanifest`
- `sw.js`
- `src/css/app.css`
- `src/js/app-metadata.js`
- `src/js/config.js`
- `src/js/pwa-update-manager.js`
- `src/js/app.js`

Puedes ampliar la lista en `tools/generate-release.py` si tu app real tiene más archivos críticos.

## Render Static Site

El archivo `render.yaml` incluido usa:

```bash
python tools/generate-release.py
```

como `buildCommand` y publica la raíz del proyecto. Así, al pegar un nuevo idioma en `textX/app` y `textX/seo`, o al agregar/cambiar `assets/icons/logo.png`, Render regenera los manifiestos antes de servir el static site.

## Flujo recomendado de despliegue

1. Cambia tu app.
2. Ejecuta `python tools/generate-release.py --version X.Y.Z --build BUILD_ID`.
3. Ejecuta `python tests/pwa-smoke-check.py`.
4. Publica todos los archivos juntos.
5. La app instalada detecta el nuevo `version.json` y recarga.
