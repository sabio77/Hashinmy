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
/src/*             no-cache si no usas nombres con hash
/assets/*          no-cache si no usas nombres con hash
```

Si tu bundler genera archivos con hash, puedes usar cache largo e `immutable` solo para esos assets hasheados.

## Render Static Site conectado a memoriaBACKEND

El archivo `render.yaml` incluido define un servicio `runtime: static`, ejecuta `python tools/generate-release.py` como build command y publica `.`. Esto mantiene `version.json`, `textX/languages.json` y las huellas de assets actualizadas en cada despliegue. El frontend sigue siendo estático; únicamente consume memoriaBACKEND por HTTPS para autenticar y validar sesiones.
