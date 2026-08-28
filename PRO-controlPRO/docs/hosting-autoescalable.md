# Hosting autoescalable recomendado

## Opción 1: CDN estático

Recomendado para la mayoría de proyectos:

- Cloudflare Pages
- Netlify
- Vercel
- GitHub Pages detrás de CDN
- S3 + CloudFront o equivalente

Ventajas:

- Escala automática.
- HTTPS fácil.
- Deploy atómico en muchos proveedores.
- Costo bajo.

## Opción 2: Docker + Nginx

Usa `Dockerfile` y `deploy/docker/nginx.conf`.

```bash
docker build -t semilla-appweb-pwa .
docker run --rm -p 8080:8080 semilla-appweb-pwa
```

## Opción 3: Kubernetes

Usa los manifiestos en `deploy/kubernetes` si necesitas controlar réplicas, recursos y autoscaling.

## Headers indispensables

Los archivos que controlan actualización deben salir siempre frescos:

```text
/sw.js              no-store
/index.html        no-store
/version.json      no-store
/manifest.webmanifest no-cache
/src/*             public, max-age=86400, stale-while-revalidate=604800
/assets/*          public, max-age=604800, stale-while-revalidate=2592000
/textX/*           public, max-age=86400, stale-while-revalidate=604800
```

El Service Worker mantiene cachés separados por identidad de release. Por eso estos TTL evitan respuestas HTTP repetidas sin congelar un despliegue nuevo: `sw.js` y `version.json` continúan frescos y el nuevo worker precarga el shell del release. Si además tu bundler genera nombres con hash, puedes usar `immutable` para esos assets.

## Render Static Site conectado a memoriaBACKEND

El archivo `render.yaml` incluido define un servicio `runtime: static`, ejecuta `python tools/generate-release.py` como build command y publica `.`. Esto mantiene `version.json`, `textX/languages.json` y las huellas de assets actualizadas en cada despliegue. El frontend sigue siendo estático; únicamente consume memoriaBACKEND por HTTPS para autenticar y validar sesiones.
