# Cloudflare Pages

Configuración sugerida:

- Framework preset: ninguno / static.
- Build command: `python tools/generate-release.py`.
- Output directory: `/` o la raíz publicada del proyecto.
- Conservar `_headers` en la raíz.

Cloudflare Pages lee `_headers`, por eso `sw.js`, `index.html` y `version.json` quedan sin caché de navegador/CDN.
