# Escalabilidad de la semilla

## Punto débil corregido en esta iteración

La versión anterior era robusta para actualizar, pero podía escalar mal si muchas instalaciones abiertas revisaban varios archivos críticos cada pocos segundos. Esta versión cambia el modelo:

1. La app consulta principalmente un solo archivo pequeño: `version.json`.
2. `version.json` contiene huellas SHA-256 de los archivos críticos.
3. Solo una pestaña o ventana activa por navegador hace la revisión de red.
4. Las demás pestañas reciben el resultado por `BroadcastChannel`.
5. La verificación directa de archivos queda como respaldo condicionado por eventos, no como mecanismo principal.
6. No existe polling de actualización por `setInterval`.

## Modelo recomendado para producción

- Hospeda la app en CDN o hosting estático con HTTPS.
- Mantén `index.html`, `sw.js` y `version.json` con `Cache-Control: no-store`.
- Mantén `src/*` y `textX/*` con `max-age=86400` + `stale-while-revalidate`, y `assets/*` con TTL más largo; el Service Worker los aísla por identidad de release y evita pedirlos de nuevo en cada apertura.
- En apps grandes, usa nombres de archivo con hash y cambia esos assets a `immutable`.
- Ejecuta `python tools/generate-release.py` en cada despliegue.
- Usa blue/green, rolling deploy o despliegue atómico del hosting para que todos los archivos de una versión aparezcan juntos.

## Capas de escala incluidas

### CDN o hosting estático

Es la opción más simple y recomendada. Cloudflare Pages, Netlify, Vercel, GitHub Pages o cualquier hosting estático con HTTPS puede servir esta semilla. La escala la aporta el CDN.

### Contenedor Nginx

Incluye `Dockerfile` y `deploy/docker/nginx.conf`. Sirve la PWA con headers correctos y healthcheck.

### Kubernetes opcional

Incluye manifiestos base con:

- `Deployment` con rolling update.
- `Service` interno.
- `HorizontalPodAutoscaler`.
- `readinessProbe` y `livenessProbe` sobre `health.json`.

## Qué significa “autoescalable” aquí

La semilla es una app web estática, por lo que no necesita sesiones de servidor. Eso permite escalar horizontalmente de forma segura: cualquier réplica puede responder cualquier solicitud. El estado local de instalación, caché y actualización vive en el navegador mediante Service Worker, Cache Storage y localStorage.

## Límite real importante

La PWA instalada no puede obligar al navegador a ignorar reglas internas de actualización. Lo que sí hace esta semilla es reducir al mínimo la espera práctica:

- `updateViaCache: 'none'`.
- `skipWaiting()`.
- `clients.claim()`.
- `version.json` sin caché.
- recarga automática al detectar cambio.
- revisión al iniciar, al volver a foco, recuperar visibilidad, reconectar, `pageshow` y eventos del Service Worker.
