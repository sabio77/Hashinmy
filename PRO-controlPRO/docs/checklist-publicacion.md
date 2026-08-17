# Checklist de publicación

Antes de publicar una app real basada en esta semilla:

## Identidad

- [ ] Cambiar `name`, `short_name` y `description` en `manifest.webmanifest`.
- [ ] Cambiar `appName` en `src/js/app-metadata.js`.
- [ ] Generar/reemplazar los PNG de instalación en `assets/pwa/` usando exactamente los nombres y tamaños descritos por sus `.png.txt`.
- [ ] Generar/reemplazar favicons en `assets/browser/`, Apple Touch Icons en `assets/apple/`, logo interno en `assets/ui/` e iconos de notificación en `assets/notifications/` según corresponda.
- [ ] Ajustar `theme_color` y `background_color`.

## Instalación

- [ ] Verificar que la app se sirve por HTTPS.
- [ ] Confirmar que `sw.js` queda en la raíz pública de la app.
- [ ] Revisar `start_url`, `scope` e `id`.
- [ ] Confirmar PNG reales `192x192` y `512x512` con `purpose: any`, más sus variantes `maskable`, antes de probar instalación.
- [ ] Probar instalación desde el botón propio de la app en escritorio y móvil; no validar como equivalente un simple acceso directo creado por el navegador.

## Autoactualización

- [ ] Confirmar que `/sw.js`, `/index.html` y `/version.json` usan `no-store`.
- [ ] Confirmar que `/src/*` revalida con `no-cache`.
- [ ] Actualizar `version.json` en cada deploy.
- [ ] Actualizar `src/js/app-metadata.js` en cada deploy importante.
- [ ] Revisar `fingerprintCheckFiles`.
- [ ] Probar cambio de CSS/JS con app instalada.
- [ ] Al reemplazar un PNG de `assets/pwa/`, desplegar mediante `tools/generate-release.py` y confirmar que cambió `icon_rev` en `manifest.webmanifest`.
- [ ] En Chrome de escritorio, si aparece **Revisar actualización de la aplicación** por cambio de icono, confirmar la actualización; el navegador puede requerir esa aprobación para cambios de identidad.
- [ ] Mantener estable el nombre y la ubicación de `manifest.webmanifest`; no versionar el archivo cambiando su ruta.


## Conexión con memoriaBACKEND

- [ ] Definir `APP_BACKEND_URL` en el Static Site, sin comillas exteriores.
- [ ] Al guardar variables en Render, elegir **Save, rebuild, and deploy**.
- [ ] Ejecutar `python tools/generate-release.py --require-backend` durante el build.
- [ ] Si la app está en una subcarpeta, ejecutar el generador de esa carpeta desde el build del sitio principal.
- [ ] Abrir públicamente `src/js/runtime-config.js` y confirmar que `backendUrl` no está vacío.
- [ ] Registrar el origen en `P2P_DOMINIOS_APROBADOS`.
- [ ] Registrar la ruta exacta y sensible a mayúsculas/minúsculas en `P2P_APLICACIONES_APROBADAS`.
- [ ] Autorizar el dominio público en Firebase Authentication.

## Seguridad

- [ ] Ajustar CSP si conectas APIs externas.
- [ ] Ajustar `Permissions-Policy` si usas cámara, micrófono o ubicación.
- [ ] No cachear endpoints con datos privados.

## Offline

- [ ] Confirmar que `offline.html` abre sin conexión.
- [ ] Confirmar que la app muestra contenido base al estar offline.


## Checklist textX

- Validar que cada idioma tenga `textX/app/<codigo>.json` y `textX/seo/<codigo>.json`.
- Ejecutar `python tools/generate-release.py` antes de publicar para regenerar `textX/languages.json`, `src/js/app-metadata.js` y `version.json`; en Render Static Site puede hacerlo automáticamente `render.yaml`.
- Ejecutar `python tests/pwa-smoke-check.py`.
- Confirmar que `/textX/*` se sirve con `Cache-Control: no-cache`.
