# Skeletonscreen obligatorio para cargas perceptibles

Esta semilla incluye `src/js/skeleton-screen.js` como utilidad transversal para que cualquier módulo futuro use skeletonscreen cuando una carga o espera pueda superar **500 milisegundos**. La regla de diseño es: si el usuario espera datos, traducciones, imágenes, contenido remoto, autenticación, permisos, consulta a APIs o cualquier operación perceptible, se debe mostrar skeletonscreen antes de recurrir a textos de “cargando” o spinners.

## Regla base

- Umbral por defecto: `AppSkeletonScreen.DEFAULT_DELAY_MS`, igual a `500`.
- No se muestra skeleton si la operación termina antes del umbral.
- Si la espera supera el umbral, el contenedor recibe `is-skeletonscreen-active` y `aria-busy="true"`.
- Los elementos que deben convertirse en esqueleto se marcan con `data-skeleton-slot`.
- La utilidad no usa polling ni intervalos repetitivos; solo usa un temporizador único por operación para evitar parpadeos.

## Uso recomendado para nuevos módulos

```js
async function cargarDatos() {
  var skeleton = window.AppSkeletonScreen.begin({
    target: document.querySelector('[data-panel-usuario]'),
    delayMs: 500
  });

  try {
    return await fetch('./datos.json', { cache: 'no-store' }).then(function (response) {
      return response.json();
    });
  } finally {
    skeleton.end();
  }
}
```

También se puede envolver una promesa existente:

```js
await window.AppSkeletonScreen.track(
  cargarPerfilDesdeApi(),
  { target: document.querySelector('[data-card-perfil]'), delayMs: 500 }
);
```

## Integración incluida en la semilla

La semilla ya usa skeletonscreen en:

1. Carga inicial y cambio de idioma en `src/js/i18n.js`.
2. Carga del logo opcional en `src/js/asset-loader.js`.

Esto mantiene la interfaz mínima con “Hola mundo”, pero deja preparada la infraestructura visual para cualquier pantalla real que se agregue después.

## Reglas para IA o futuros desarrolladores

Cuando se agregue una pantalla nueva:

1. Marcar los bloques que representan contenido pendiente con `data-skeleton-slot`.
2. Envolver las cargas asíncronas con `AppSkeletonScreen.begin()` o `AppSkeletonScreen.track()`.
3. Mantener el umbral de 500 ms salvo una razón de UX documentada.
4. No usar spinners como patrón principal de espera de contenido.
5. No usar polling para mantener el skeleton activo; el estado debe depender de la promesa o evento real que se espera.
