# Netlify

Configuración sugerida:

- Build command: `python tools/generate-release.py`.
- Publish directory: raíz del proyecto.
- Conservar `_headers` y `_redirects`.

`_headers` define reglas de caché y seguridad. `_redirects` permite rutas internas tipo SPA.
