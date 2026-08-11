# Semilla App Web PWA P2P para control de proyectos

## Papelera distribuida y menús contextuales

Los proyectos y registros administrativos exponen un único menú vertical de tres puntos. Las opciones se derivan de la membresía y del perfil `admin-project-v1`: editar requiere `add` o `projection`, mientras enviar a papelera, restaurar y purgar requieren `delete`; una proyección exige además `projection`, y la raíz `admin.project` continúa reservada al propietario.

`entity.trash` y `entity.restore` son operaciones durables cifradas. Guardan una precondición `expected`, por lo que una réplica antigua no puede ocultar o reactivar silenciosamente un registro que otro participante modificó. La papelera se representa mediante `trashedAt` y `trashedBy` dentro del valor replicado; los selectores del dominio excluyen esos elementos de capital, gastos, proyecciones y listas activas sin perder el contenido necesario para restaurarlos.

La eliminación permanente solo se ejecuta desde la papelera mediante `entity.purge` para registros o mediante la eliminación autoritativa del espacio para un proyecto completo. Las guardas de proyecciones y los vínculos compra-proyección se mantienen, y el mismo contrato se valida tanto por memoriaBACKEND como por el bloque opcional `P2P_sin_`.

## Permisos idénticos con backend y por red local

El modo `sinBACKEND` no aplica una política paralela. Cada capacidad firmada incluye el `resourceType` y el `permissionProfile` del espacio, y `src/js/p2p-permissions.js` reproduce en la PWA la misma decisión autoritativa que memoriaBACKEND. En el perfil `admin-project-v1`, la raíz presupuestal queda reservada al propietario, crear o modificar proyecciones requiere `projection`, borrar una proyección exige simultáneamente `delete` y `projection`, y crear o retirar vínculos de proyección depende de `projection`.

Las reglas especiales se activan únicamente cuando el espacio declara `resourceType: admin.project`. Una aplicación genérica puede reutilizar un nombre como `admin.projection` sin recibir por accidente la matriz administrativa. El receptor valida tanto la capacidad certificada como su bootstrap local confirmado antes de aplicar un cambio LAN; memoriaBACKEND vuelve a validar el espacio real al relevarlo.

## Variaciones monetarias grandes sin interrupción visual

Las sumas administrativas pueden superar el rango entero seguro aunque cada factura individual siga dentro de él. La interfaz usa una operación monetaria exacta para obtener el valor absoluto de esas variaciones antes de formatearlas; no delega esa ruta a `Math.abs()`, que no admite `BigInt`. Así un sobrecosto agregado grande conserva precisión y no impide abrir ni renderizar el proyecto.

## Ciclo de vida acotado de snapshots parciales

Los fragmentos recibidos para reconstruir una réplica se conservan únicamente durante la ventana necesaria para completar esa transferencia. La retención local se deriva de `snapshotGrantTtlSeconds` y añade un margen corto para tránsito y persistencia.

Cuando comienza una nueva reconstrucción del mismo proyecto, IndexedDB elimina las sesiones parciales anteriores de ese proyecto, pero conserva la sesión vigente y cualquier recuperación activa de otros proyectos. Si llega un cierre inválido, faltan fragmentos o la integridad no coincide, los fragmentos de esa sesión se descartan inmediatamente antes de solicitar otra réplica. Esto evita que cortes móviles repetidos conviertan snapshots individualmente válidos en crecimiento acumulativo del almacenamiento local.

## Web Push aislado por cuenta e instalación activas

Cada aplicación vincula en su propio Service Worker la cuenta autenticada y el `deviceId` que pueden recibir avisos en esa instalación. Antes de registrar o restaurar una suscripción Push, la PWA confirma ambos valores; al cerrar sesión los elimina usando la cuenta y el dispositivo esperados, por lo que una baja tardía de una identidad anterior no puede borrar el vínculo de otra cuenta ni de una instalación nueva de la misma cuenta.

`memoriaBACKEND` añade siempre `recipientUserId` y `recipientDeviceId` desde la suscripción autoritativa de cada destino, ignorando valores suministrados por el payload. El Service Worker no muestra ni reenvía a la interfaz avisos sin ambos destinatarios o destinados a otra cuenta o instalación, y vuelve a comprobarlos antes de atender un clic. Cuando una colisión obliga a rotar el `deviceId`, el vínculo local se actualiza antes del reinicio para suprimir avisos dirigidos a la identidad anterior mientras el backend completa el nuevo registro.

## Instalación en raíz o subcarpeta sin configuración adicional del Static Site

La semilla deriva automáticamente su identificador de aplicación desde la carpeta pública y conserva exactamente sus mayúsculas/minúsculas. Publicada en `https://hashinmy.com/` usa `root`; publicada en `https://hashinmy.com/contabilidad/` usa `contabilidad`; una ruta anidada como `/suite/inventario/` usa `suite/inventario`.

No declares una variable de entorno en cada `appWEB` para indicar la carpeta. Solo configura `APP_BACKEND_URL` en el build y registra la combinación en `P2P_APLICACIONES_APROBADAS` de `memoriaBACKEND`. El alcance se aplica a sesión, usuario cacheado, dispositivo, IndexedDB funcional, IndexedDB criptográfica, coordinación entre pestañas, idioma, actualización PWA, Cache Storage y Firebase. La limpieza del Service Worker reconoce únicamente las familias `static` y `runtime` del namespace exacto de esa aplicación, por lo que la raíz y las carpetas hermanas no eliminan sus cachés entre sí.

Cuando copies la semilla dentro de un sitio principal, el hosting padre debe servir esa carpeta y devolver su `index.html` para navegaciones internas. Las rutas de los archivos, manifiesto y Service Worker ya son relativas y conservan el scope de la carpeta. El punto de entrada normaliza además una visita como `/PRO-control` hacia `/PRO-control/` antes de cargar recursos, evitando que el navegador solicite por error `/src/...` desde la raíz del dominio.

> **Límite de seguridad del navegador:** las carpetas del mismo dominio quedan aisladas por namespace y por tenant del backend, pero siguen perteneciendo al mismo origen web. Esto evita mezclas accidentales y cruces del protocolo; no convierte cada carpeta en una frontera contra código malicioso o una vulnerabilidad XSS de otra app del mismo dominio. Para aplicaciones administradas por equipos no confiables entre sí, publícalas en subdominios diferentes y aprueba cada origen por separado.

## Bootstrap concurrente sin confirmaciones sobre estado anterior

La debilidad crítica de esta iteración estaba en la coordinación de lecturas autoritativas concurrentes. `fetchBootstrap()` descartaba una respuesta válida en cuanto otra solicitud incrementaba el contador, aunque esa segunda lectura todavía no hubiera respondido y pudiera fallar. Un `p2p.membership.changed` podía entonces recibir como resultado el `bootstrapState` anterior, encontrar allí el proyecto, avanzar el cursor y confirmar el evento sin haber aplicado los permisos o la propiedad nuevos.

La corrección separa la secuencia solicitada de la secuencia realmente aplicada. Una respuesta solo se considera obsoleta cuando una solicitud posterior ya terminó y actualizó correctamente IndexedDB y el estado de autorización. Si la lectura posterior falla, la respuesta válida anterior permanece aplicable; si la posterior ya fue aplicada, una respuesta antigua tardía reutiliza el estado nuevo y no lo revierte. La regresión ejecutable cubre ambas carreras.

## Salud visible de las réplicas

Cada proyecto muestra cuántas instalaciones autorizadas ya tienen aplicada en IndexedDB la revisión actual. El ACK del stream solo retira el evento temporal; la cobertura se confirma con `appliedStateRevisions` leídas después del procesamiento local. Así, un fragmento de snapshot o un evento cifrado todavía diferido no puede presentarse como copia completa. Los indicadores distinguen cobertura saludable, copias pendientes, una sola copia y ausencia de confirmación. Este estado es metadato temporal: el contenido administrativo continúa únicamente en IndexedDB de los dispositivos.

## Cambios de acceso confirmados antes del ACK

La debilidad crítica de esta iteración estaba en el tratamiento de `p2p.membership.changed`. El stream podía recibir un cambio válido de permisos, membresía o propiedad, intentar refrescar el bootstrap y absorber una falla temporal de esa lectura. Después avanzaba el cursor y programaba el ACK aunque no hubiera aplicado ningún estado local. Al retirarse el evento de la cola temporal, la interfaz podía continuar mostrando capacidades obsoletas hasta otra sincronización eventual.

La corrección exige completar el bootstrap autoritativo antes de persistir el cursor o confirmar el evento. Si la lectura falla, el error bloquea la tubería, cierra el stream y conserva el último cursor durable para que Redis reproduzca exactamente el cambio pendiente. Cuando la lectura termina, el proyecto afectado debe existir expresamente en el resultado; una respuesta exitosa pero incompleta también bloquea el ACK y fuerza replay. La señal de interfaz usa el espacio confirmado por el backend y no el grafo transportado, que podría haber sido superado por otra transición concurrente.

# Semilla App Web PWA P2P para control de proyectos


## Operaciones relacionadas recuperables

Una compra y su vínculo con una proyección son entidades independientes porque requieren permisos distintos. Guardarlas mediante dos llamadas aisladas dejaba una ventana crítica: si la PWA se cerraba después de persistir la compra pero antes de crear la segunda entrada del outbox, la réplica podía conservar el gasto sin la relación usada por las métricas proyectado/real.

La API pública incorpora `publishBatch(spaceId, entries)`. El cliente prepara y cifra todas las operaciones primero y después guarda, dentro de una única transacción IndexedDB, tanto sus capas optimistas como sus entradas ordenadas de outbox. El lote puede reanudarse tras recarga o modo offline.

Cuando el outbox conserva el lote completo, la PWA usa `POST /api/p2p/events/publish-batch`. memoriaBACKEND vuelve a validar el permiso específico de cada operación, la membresía de todos los destinos y la autoridad de cifrado, y confirma el conjunto mediante un único script Lua: secuencias, revisión del espacio, colas por dispositivo e idempotencia avanzan para todas las operaciones o no avanzan para ninguna. Un rechazo permanente revierte también todas las capas optimistas dentro de una sola transacción IndexedDB. Si una actualización encuentra un lote que una versión anterior ya empezó a confirmar de forma individual, cambia únicamente ese lote al transporte compatible y reutiliza los resultados idempotentes sin duplicar cambios. En recepción, la PWA no materializa ninguna operación hasta reunir el lote completo; si el stream queda silenciosamente truncado, un vencimiento cercado fuerza reconexión y replay desde el cursor no confirmado.

## Creación de proyectos recuperable

La creación de un proyecto cruza dos persistencias distintas: primero se autoriza el espacio en `memoriaBACKEND` y después se guarda la entidad administrativa cifrada en IndexedDB/outbox. Antes, el `requestId` que unía ambas operaciones solo vivía en memoria de la pestaña; una recarga en ese intervalo podía dejar un espacio vacío y el siguiente intento generaba otra identidad.

La semilla conserva ahora, antes del primer POST, una intención local acotada con `requestId`, `operationId`, datos del proyecto y el `spaceId` tan pronto como el backend lo resuelve. Al iniciar la cuenta vuelve a completar esa misma intención. Si la entidad ya existe no la republica; si la publicación quedó protegida por el outbox elimina el intent redundante; y si el proceso se interrumpe conserva exactamente los identificadores necesarios para continuar sin duplicar espacios ni perder el formulario enviado.

## Liderazgo cercado sin Web Locks

Cuando el navegador no ofrece Web Locks, una comprobación inmediata de `localStorage` no es suficiente: dos pestañas pueden leer un lease anterior, escribir candidaturas distintas y declararse líderes antes de observar la escritura competidora. El fallback asigna un token único a cada reclamación, espera una ventana breve de estabilización y confirma nuevamente propietario y token antes de habilitar SSE, ACK, snapshots o vaciado de outbox.

La vigencia ya no se decide comparando `expiresAt` con `Date.now()` entre documentos. Cada renovación incrementa `heartbeatSeq` y las seguidoras miden con su propio reloj monotónico cuánto tiempo lleva sin cambiar la firma del lease. Un reloj del sistema adelantado, atrasado o corregido no puede inmovilizar el relevo ni permite robar un liderazgo que sigue emitiendo heartbeats. `expiresAt` se conserva únicamente como dato de compatibilidad con despliegues anteriores.

Los eventos `storage` y los anuncios `leader-active` revalidan el token y degradan de inmediato a la pestaña desplazada. Si `localStorage` está bloqueado pero `BroadcastChannel` funciona, las candidatas aplican un desempate estable por identidad de pestaña; el lease autoritativo de memoriaBACKEND continúa actuando como segundo cercado del stream. La regresión fuerza carreras, relojes opuestos, leases abandonados y almacenamiento bloqueado para impedir que la exclusión vuelva a depender de una carrera favorable del navegador o del reloj de pared.


## Restauración segura desde BFCache

Una página guardada por el navegador en BFCache conserva su memoria JavaScript, pero queda congelada y sus temporizadores o conexiones pueden dejar de progresar. La coordinación multiventana libera ahora el Web Lock o lease local cuando recibe `pagehide` con `persisted: true`, notifica al cliente para cerrar SSE, ACK, recuperaciones y vaciado de outbox, y mantiene intactas la sesión, IndexedDB y claves locales.

Al restaurarse mediante `pageshow.persisted`, la pestaña vuelve a competir por el liderazgo. Si otra ventana ya tomó la instalación, permanece como seguidora y solicita su estado; si la exclusión está libre, el flujo normal refresca bootstrap, confirma el outbox y abre un único stream. Esto evita una ventana líder fantasma después de navegar atrás/adelante o de que el sistema móvil congele y restaure la PWA.


## Revocación y borrado consistentes entre pestañas

Los eventos de control que retiran un proyecto —eliminación definitiva, abandono o revocación del usuario actual— se coordinan ahora entre todas las pestañas de la misma cuenta e instalación. La pestaña que confirma el cambio publica el estado depurado y una señal específica por `BroadcastChannel`; las demás eliminan inmediatamente el proyecto, sus invitaciones y cualquier recuperación pendiente, sin depender de que un segundo bootstrap responda. Si el proyecto estaba abierto, la interfaz cierra sus diálogos y vuelve al panel para impedir acciones con permisos obsoletos.

## Eliminación definitiva coordinada

El propietario dispone de una acción explícita para eliminar un proyecto completo. La PWA confirma primero el commit autoritativo de memoriaBACKEND y solo después purga entidades, operaciones pendientes, snapshots, watermarks y claves del dispositivo. El backend retira atómicamente membresías e índices, registra tombstones acotados y deja un outbox recuperable que emite `p2p.space.deleted` a cada instalación conocida y Web Push a las cuentas participantes. Los reintentos posteriores a una respuesta perdida reutilizan el mismo resultado y no duplican avisos. Las invitaciones todavía pendientes hacia ese proyecto quedan invalidadas y dejan de aparecer.

## Autorización genérica lista para reutilizar

La API pública `window.SemillaP2P` puede usar cualquier `entityType` propio de una app futura. Crear, editar o publicar una operación `custom` se autoriza con el permiso visible `add`; eliminar conserva `delete`; el ejemplo administrativo exige `projection` para modificar planificación y la combinación `delete + projection` para borrar `admin.projection`, mientras `admin.projection-link` permanece bajo `projection`. Los proyectos nuevos usan el perfil de control `admin-project-v1`: la compra y su vínculo con una proyección son entidades cifradas independientes, por lo que `add` permite registrar gastos sin conceder capacidad para alterar métricas proyectado/real. La semilla ya no obliga a inventar el permiso oculto `write` ni a nombrar entidades `admin.*` para que un colaborador autorizado pueda sincronizar datos. La raíz `admin.project` es deliberadamente exclusiva del propietario: ningún permiso operativo permite cambiar o borrar el nombre, la dirección o el presupuesto inicial.

La eliminación genérica admite `referenceGuards` cifradas para preservar relaciones heredadas entre entidades sin introducir una base de datos central. En proyectos `admin-project-v1`, cada réplica calcula la relación desde `admin.projection-link` e ignora cualquier `projectionId` inyectado dentro de una compra; el backend exige `projection` para crear, editar o eliminar ese vínculo. La UI impide borrar una proyección que actualmente tenga compras reales vinculadas y cada proyección completada muestra el valor real y la diferencia explícita como sobre presupuesto, por debajo o exacta.

Esta iteración elimina una dependencia destructiva del backend. La PWA ya no interpreta que un proyecto fue revocado solo porque no apareció en un bootstrap. La eliminación local requiere `revokedSpaceIds`, emitido por una revocación o abandono confirmado atómicamente en memoriaBACKEND. Si la autorización queda indeterminada, la réplica y sus claves se conservan y la interfaz muestra el proyecto como **Copia local** en modo de solo lectura; edición, sincronización, invitaciones y administración de acceso permanecen bloqueadas hasta recuperar la confirmación.

Esta iteración elimina una fuga de metadatos del plano de control. La PWA ya no envía el nombre real del proyecto al crear el espacio ni al invitar colaboradores. Ese nombre permanece dentro de la entidad administrativa cifrada y almacenada en IndexedDB; memoriaBACKEND recibe solo `spaceId`, tipo de recurso, membresías, permisos e identificadores de autoridad criptográfica. Las invitaciones y notificaciones previas a la aceptación muestran una etiqueta genérica hasta que el dispositivo autorizado recibe la clave y reconstruye la réplica local.

Esta iteración corrige la autoridad de las claves compartidas. Antes, cada dispositivo decidía localmente qué clave AES estaba activa; un equipo autorizado pero atrasado podía redistribuir una clave anterior y una instalación nueva podía activarla temporalmente. Ahora cada espacio expone desde memoriaBACKEND un `encryptionAuthorityVersion`, un `activeEncryptionKeyId` y un `encryptionKeyEpoch` de control. La activación o rotación solo la confirma el propietario mediante comparación atómica de la clave esperada, mientras solicitudes, sobres y publicaciones con una clave anterior son rechazados.

La PWA guarda la época junto con la clave activa, contrasta los eventos retrasados con la autoridad conocida y evita degradaciones aun cuando el dispositivo todavía no tenga historial criptográfico local. Los espacios heredados se inicializan automáticamente cuando los abre su propietario; un participante distinto no puede invitar nuevas cuentas hasta que exista esa autoridad. El backend no recibe material secreto ni contenido funcional: el identificador de clave y la época son únicamente metadatos temporales de coordinación.

Si una edición queda pendiente justo cuando el propietario rota la clave, no se descarta ni se revierte: permanece en el outbox local, se actualiza la autoridad, se cifra otra vez con la clave vigente y se reenvía manteniendo el orden.

Una cuenta invitada con solo lectura también puede recuperar la clave activa desde otro dispositivo propio que ya conserve la réplica. Esa restauración no concede permisos de edición: el relay exige `read` en ambos dispositivos, limita la fuente de solo lectura a receptores de la misma cuenta y mantiene `write` como requisito para compartir claves entre cuentas distintas.

Esta iteración cierra una fuga de privacidad del ciclo de sesión: una suscripción Web Push podía seguir asociada a la cuenta anterior después del logout o de una sesión vencida. El cierre ahora libera el endpoint en memoriaBACKEND antes de invalidar la credencial. Cuando la red o la sesión ya no permiten esa liberación, la PWA anula la suscripción en el navegador como mecanismo de seguridad local.

La baja queda ligada al token que la inició. Si otra ventana cambia de cuenta durante la operación, el resultado tardío se descarta, no se ejecuta la anulación local y tampoco se envía el logout del backend con la credencial nueva. Cuando el fallback offline sí tuvo que retirar el endpoint del navegador, el siguiente acceso vuelve a crearlo y registrarlo automáticamente si el permiso ya estaba concedido. La regresión forma parte de `tests/session-isolation-smoke.mjs`.

Esta iteración corrige el límite de seguridad entre cuentas cuando una misma instalación abre varias pestañas o ventanas. La sesión P2P ahora conserva el token exacto con el que inició; si otra ventana cierra sesión o entra con una cuenta Google diferente, se detienen stream, outbox y recuperación antes de adoptar el nuevo usuario. Las respuestas autenticadas tardías se descartan y nunca se aplican dentro de la IndexedDB seleccionada para la cuenta anterior.

La interfaz escucha el cambio real de `localStorage`, limpia diálogos y estado visual sensible, confirma la cuenta nueva mediante `/api/bootstrap` y solo entonces reconstruye el panel. El cierre de sesión elimina el token de forma condicionada para no borrar una sesión más reciente creada en otra ventana. Esta frontera está cubierta por `tests/session-isolation-smoke.mjs` y se integra con la coordinación de liderazgo de `p2p-tab-coordinator.js`.

La coordinación multiventana existente se conserva: todas las ventanas de una misma cuenta e instalación comparten `deviceId`, IndexedDB y claves locales, pero solo una mantiene el stream SSE, confirma ACK, vacía el outbox y atiende snapshots. Las demás reciben los cambios por `BroadcastChannel` y toman el liderazgo automáticamente si la ventana principal se cierra. La exclusión usa Web Locks cuando está disponible y, como fallback, un lease de `localStorage` con token de cercado, heartbeat lógico y caducidad medida localmente, sin `setInterval` ni polling al backend.

Semilla reutilizable para construir aplicaciones instalables, offline y local-first sobre Render Static Site. Incluye una interfaz administrativa de producción para crear proyectos, registrar compras e ingresos, planear compras futuras, contrastar proyección contra valor real, invitar cuentas de Google con permisos granulares y administrar después la revocación, transferencia de propiedad o abandono del proyecto.

## Aplicación funcional incluida

La infraestructura PWA existente se conserva y la demostración genérica fue reemplazada por un panel compacto de proyectos. Después del acceso con Google, cada espacio compartido representa un proyecto y sus datos funcionales viven en IndexedDB de los dispositivos autorizados; `memoriaBACKEND` coordina identidad, membresías, invitaciones, replay temporal y stream, sin convertirse en base canónica del contenido administrativo.

Además, se mantienen las fortalezas existentes de la semilla:

- Agrega `textX/app/ar.json` y `textX/seo/ar.json` con las mismas keys de `es.json`.
- Declara árabe en `textX/languages.json` con `htmlLang: ar` y `dir: rtl`.
- Sincroniza `version.json`, `src/js/app-metadata.js`, `src/js/config.js` y `sw.js` para que AR quede en precache, huellas críticas y fallback del Service Worker.
- Refuerza CSS para orientación RTL: fondo, card, título, selector y aviso de actualización.
- Mantiene la autodetección de idiomas nuevos mediante `tools/generate-release.py`: al pegar un nuevo par `textX/app/<idioma>.json` + `textX/seo/<idioma>.json` y desplegar en Render, el build actualiza el selector sin tocar código.
- Mantiene verificación sin polling: no usa `setInterval` para actualizaciones.
- Revisa cambios solo por eventos reales: inicio, foco, visibilidad, reconexión, `pageshow`, `updatefound` y `controllerchange`.
- Conserva actualización automática por `version.json` con huellas SHA-256 de archivos críticos, textos `textX` y prompts de assets.
- Conserva fallback geométrico para logo/íconos si las imágenes PNG todavía no existen.
- Conserva caché canónica para logos/íconos opcionales: las cargas con parámetros anti-caché no multiplican entradas y, sin conexión, reutilizan el PNG real si ya fue descargado antes.
- Conserva Service Worker con `navigationPreload`, `skipWaiting()`, `clients.claim()` y caché versionada.
- Conserva `render.yaml` para Render Static Site: ejecuta el release en build y publica la raíz como frontend estático y se conecta por HTTPS a memoriaBACKEND.
- Validación local reforzada con smoke test para ES/EN/AR, RTL, autodetección i18n, release y cero polling.

## Qué incluye

```text
semilla_appweb_pwa_autoactualizable/
├── index.html
├── offline.html
├── manifest.webmanifest
├── sw.js
├── version.json
├── health.json
├── robots.txt
├── _headers
├── _redirects
├── vercel.json
├── render.yaml
├── Dockerfile
├── docker-compose.yml
├── CHANGELOG.md
├── assets/
│   └── icons/
├── src/
│   ├── css/
│   │   └── app.css
│   └── js/
│       ├── app-metadata.js
│       ├── config.js
│       ├── p2p-tab-coordinator.js
│       ├── p2p-client.js
│       ├── p2p-permissions.js
│       ├── pwa-update-manager.js
│       └── app.js
├── textX/
│   ├── languages.json
│   ├── app/
│   │   ├── es.json
│   │   ├── ar.json
│   │   └── en.json
│   └── seo/
│       ├── es.json
│       ├── ar.json
│       └── en.json
├── tools/
│   └── generate-release.py
├── tests/
│   ├── p2p-multitab-smoke.mjs
│   └── pwa-smoke-check.py
├── deploy/
│   ├── apache.htaccess.sample
│   ├── nginx.conf.sample
│   ├── cloudflare-pages.md
│   ├── netlify.md
│   ├── vercel.md
│   ├── docker/
│   │   └── nginx.conf
│   └── kubernetes/
│       ├── README.md
│       ├── deployment.yaml
│       ├── service.yaml
│       └── hpa.yaml
├── docs/
│   ├── actualizacion.md
│   ├── arquitectura.md
│   ├── automatizacion-release.md
│   ├── checklist-publicacion.md
│   ├── escalabilidad.md
│   ├── hosting-autoescalable.md
│   ├── limitaciones-reales.md
│   └── reutilizacion.md
└── .github/
    └── workflows/
        └── pwa-static-check.yml
```

## Uso rápido

### Probar localmente

```bash
python -m http.server 8080
```

Abre:

```text
http://localhost:8080
```

No abras `index.html` con `file://`, porque el Service Worker no funciona así.

### Publicar

1. Sube todos los archivos a un hosting HTTPS.
2. En Render Static Site puedes usar `render.yaml`; el build ejecuta `python tools/generate-release.py` y publica `.`.
3. Asegura que el hosting respete `_headers`, `render.yaml`, `vercel.json`, Nginx o configuración equivalente.
4. Abre la URL en navegador compatible.
5. Instala la app.
6. Publica cambios.
7. La app instalada detectará `version.json` nuevo y recargará automáticamente.

## Flujo recomendado de release

Antes de publicar una nueva versión:

```bash
python tools/generate-release.py --version 1.2.1 --build 2026-07-02-004
python tests/pwa-smoke-check.py
```

El script actualiza:

- `version.json`
- `criticalAssets`
- huellas SHA-256
- tamaño de archivos críticos
- `textX/languages.json` escaneando `textX/app/*.json` y `textX/seo/*.json`
- `src/js/app-metadata.js` si pasas versión/build

## Archivos que debes conservar en cualquier proyecto

Para mantener instalación y autoactualización:

```text
manifest.webmanifest
sw.js
version.json
src/js/app-metadata.js
src/js/config.js
src/js/i18n.js
src/js/asset-loader.js
src/js/pwa-update-manager.js
textX/app/*.json
textX/seo/*.json
textX/languages.json
_headers o configuración equivalente de hosting
tools/generate-release.py
```

Puedes reemplazar libremente:

```text
index.html
src/css/app.css
src/js/app.js
assets/
```

## Configuración principal

Archivo: `src/js/config.js`

```js
window.APP_SEED_CONFIG = Object.freeze({
  versionEndpoint: './version.json',
  serviceWorkerPath: './sw.js',
  periodicUpdateChecksEnabled: false,
  updateCheckIntervalMs: 0,
  multiTabCoordinationEnabled: true,
  releaseManifestAssetsEnabled: true,
  directFingerprintFallbackEnabled: true,
  directFingerprintFallbackIntervalMs: 300000,
  autoReloadWhenVersionChanges: true
});
```

## Skeletonscreen para cargas de más de 500 ms

La semilla incluye `src/js/skeleton-screen.js` y estilos en `src/css/app.css`. Cualquier módulo futuro que espere datos, traducciones, imágenes, permisos o respuestas de APIs durante más de **500 ms** debe usar skeletonscreen.

Uso mínimo recomendado:

```js
var skeleton = window.AppSkeletonScreen.begin({
  target: document.querySelector('[data-panel]'),
  delayMs: 500
});

try {
  await cargarInformacion();
} finally {
  skeleton.end();
}
```

Marca los bloques que representan contenido pendiente con `data-skeleton-slot`. La documentación completa está en `docs/skeletonscreen.md`.

## Sobre actualización “inmediata”

Una PWA no puede saltarse por completo las reglas internas del navegador y del CDN. Esta semilla se acerca al comportamiento inmediato con:

- `sw.js`, `index.html` y `version.json` con `Cache-Control: no-store`.
- `updateViaCache: 'none'` al registrar el Service Worker.
- `skipWaiting()` y `clients.claim()`.
- revisión al iniciar, volver a foco, recuperar visibilidad, reconectar, `pageshow` y eventos del Service Worker.
- recarga automática al detectar cambios.
- cero polling de actualización: no se usa `setInterval` para buscar cambios.
- `version.json` con huellas de archivos críticos.
- precarga por evento de `criticalAssets` cuando cambian las huellas del release.
- fallback directo de huellas para cubrir olvidos de release.


## Multilenguaje `textX`

La semilla separa textos visibles y textos SEO:

```text
textX/app/es.json
textX/app/ar.json
textX/app/en.json
textX/seo/es.json
textX/seo/ar.json
textX/seo/en.json
```

Para agregar un idioma nuevo, copia los mismos keys de `es.json`, por ejemplo:

```text
textX/app/fr.json
textX/seo/fr.json
```

Luego ejecuta el release:

```bash
python tools/generate-release.py --version 1.3.1 --build 2026-07-02-005
```

El script regenera `textX/languages.json`; la app y el selector detectan el nuevo idioma sin modificar código JavaScript. En Render Static Site el `render.yaml` incluido ejecuta ese comando automáticamente durante el build, así que basta con agregar los JSON y desplegar.

## Imágenes y logo

No se crean imágenes dentro de la semilla. Cada imagen esperada tiene su prompt `.txt` en `assets/icons`. Si el PNG no existe, la UI muestra una figura geométrica del tamaño esperado; el manifest incluye íconos geométricos embebidos como `data:image/svg+xml` para mantener la instalabilidad inicial; y el Service Worker puede responder una figura vectorial de respaldo para las rutas PNG declaradas. Si luego subes `assets/icons/logo.png` o cambias los íconos del manifest, la app instalada detecta el cambio por `version.json`/huellas o por la verificación directa disparada por eventos reales, y recarga sin polling.

## Autoescalabilidad

La app es estática y sin sesión de servidor. Eso permite escalar horizontalmente sin afinidad de sesión:

- CDN/hosting estático recomendado para la mayoría de casos.
- Docker + Nginx para contenedores.
- Kubernetes + HPA para clusters.

Documentación relacionada:

- `docs/escalabilidad.md`
- `docs/hosting-autoescalable.md`
- `docs/automatizacion-release.md`
- `deploy/kubernetes/README.md`

## Checklist de producción

- Cambiar nombre, descripción e íconos.
- Revisar `id`, `start_url` y `scope` del manifest según la ruta real.
- Mantener `sw.js` en la raíz pública.
- Respetar headers de no caché para archivos críticos.
- Ejecutar `tools/generate-release.py` en cada deploy, o dejar que `render.yaml` lo ejecute en Render Static Site.
- Ejecutar `tests/pwa-smoke-check.py` antes de publicar.
- Probar instalación, actualización, offline, reconexión y rutas internas.

## Autenticación Google con memoriaBACKEND

El primer acceso requiere que memoriaBACKEND valide Google mediante Firebase Admin. Después, mientras exista una sesión local previa, la PWA puede abrir sin conexión la copia IndexedDB de esa misma cuenta; la sincronización se reanuda al volver internet.

Para Render Static Site configura `APP_BACKEND_URL` con la URL pública del Web Service de `memoriaBACKEND`. Al guardar la variable elige **Save, rebuild, and deploy**; reutilizar un build anterior no puede inyectar el valor en los archivos estáticos. El build de producción debe ejecutar `python tools/generate-release.py --require-backend`; ese comando genera `src/js/runtime-config.js` sin exponer secretos y detiene el despliegue si la URL no fue recibida. El generador también normaliza valores copiados accidentalmente con comillas exteriores, aunque en el panel de Render se recomienda guardar `https://mapsx.app` sin comillas.

Cuando la app vive en una subcarpeta de un Static Site mayor, la variable por sí sola no modifica archivos del navegador: el comando de build del sitio principal debe ejecutar el generador de esa copia. Para `/PRO-controlPRO/`, usa por ejemplo `python PRO-controlPRO/tools/generate-release.py --require-backend`. Si hay varias apps, ejecuta una vez el generador de cada carpeta. Después del deploy, `https://hashinmy.com/PRO-controlPRO/src/js/runtime-config.js` debe contener `backendUrl: "https://mapsx.app"`.

En `memoriaBACKEND`, autoriza el origen y la aplicación exacta —incluidas mayúsculas y minúsculas—:

```text
P2P_DOMINIOS_APROBADOS=https://hashinmy.com
P2P_APLICACIONES_APROBADAS={"https://hashinmy.com":["PRO-controlPRO"]}
APP_BACKEND_PUBLIC_URL=https://mapsx.app
```

`APP_REDIS_URL`, `APP_FIREBASE_SERVICE` y `APP_FIREBASE_CREDENTIALS` también son obligatorias para que memoriaBACKEND inicie. `APP_WEB_PUSH_PUBLIC_KEY` y `APP_WEB_PUSH_PRIVATE_KEY` son opcionales, pero deben configurarse juntas para notificaciones con la PWA cerrada.

En Firebase Authentication habilita Google y autoriza `hashinmy.com`. Las credenciales privadas de Service Account pertenecen únicamente a memoriaBACKEND; nunca deben copiarse a `appWEB`.

## Fundación P2P local-first

La semilla incluye `src/js/p2p-storage.js`, `src/js/p2p-durability.js`, `src/js/p2p-crypto.js` y `src/js/p2p-client.js`. La información compartida se guarda en una IndexedDB distinta por cuenta de Google, el `deviceId` también queda aislado por cuenta y los cambios offline se conservan en un outbox antes de replicarse mediante SSE + POST. Cada entidad mantiene por separado su base confirmada y las operaciones optimistas pendientes: una confirmación se aplica solo a la base canónica y luego se reconstruye la vista con las capas que aún esperan respuesta. Si el backend rechaza definitivamente una operación, esa capa y su outbox se revierten en una sola transacción; los errores temporales o de sesión mantienen el cambio para reintento. Una clave pendiente bloquea únicamente el orden de su propio proyecto, por lo que otros espacios pueden seguir sincronizando; una caída global de sesión, red o backend sí corta el lote para evitar reintentos masivos. Las operaciones de entidad del propio emisor se aplican primero como capa optimista y se consolidan únicamente cuando regresan por su cola privada SSE, evitando que la respuesta HTTP se adelante a una edición remota anterior. Cada receptor avanza mediante una `deviceSequence` privada y contigua; solo confirma el ACK después de aplicar el evento, por lo que el orden no depende de cómo Pub/Sub intercale varias instancias de Render. Cada bootstrap envía las `stateRevisions` locales y solicita automáticamente un snapshot cuando la cola temporal ya no alcanza. Los snapshots se agrupan por bytes, se almacenan primero en un área temporal de IndexedDB y solo se aplican después de verificar todos los fragmentos, el total de entidades y el digest SHA-256. Las listas de espacios e invitaciones se reemplazan con el estado autorizado actual. Cuando una membresía desaparece, una transacción elimina también entidades, outbox, snapshots, revisiones y residuos huérfanos de ese espacio; `getEntity` y `listEntities` solo leen espacios donde la cuenta conserva permiso `read`. `window.SemillaP2P` permite crear espacios idempotentes con `createSpace(options)`, invitar por correo, aceptar invitaciones, revocar participantes con `revoke(spaceId, userId)`, transferir propiedad con `transfer(spaceId, userId)` y abandonar con `leave(spaceId)` y publicar operaciones genéricas o lotes locales recuperables con `publishBatch(spaceId, entries)` sin acoplar la interfaz final al backend. Cada operación asíncrona conserva además la identidad de la sesión que la inició; al cambiar de cuenta se invalidan respuestas, streams y temporizadores anteriores antes de que puedan escribir en la IndexedDB activa o modificar el estado visible. Los proyectos nuevos usan una clave AES-GCM distinta por espacio; cada instalación mantiene una identidad ECDH P-256 privada no extraíble, protege en reposo las claves de proyecto con otra `CryptoKey` local no extraíble y recibe la clave compartida mediante sobres individuales autenticados. Redis solo ve ciphertext y metadatos de coordinación, el cliente rechaza eventos en texto plano para espacios protegidos y conserva temporalmente los ciphertext que llegaron antes de su clave para reproducirlos cuando el dispositivo autorizado la reciba. Al revocar un miembro se rota la clave activa para las operaciones futuras y se distribuye únicamente a los dispositivos que aún conservan acceso. La capa de durabilidad consulta la cuota disponible, solicita almacenamiento persistente únicamente desde acciones explícitas del usuario y muestra una advertencia cuando el navegador mantiene la copia en modo de mejor esfuerzo, no admite la API o se acerca al límite. Esta protección reduce el riesgo de desalojo, pero no sustituye la réplica en otro dispositivo: el sistema sigue necesitando al menos una copia íntegra disponible.

Cuando una invitación llega por Web Push, su enlace profundo conserva el identificador hasta que la cuenta autorizada termina el bootstrap; entonces abre automáticamente el panel de invitaciones y enfoca la aceptación. Si la PWA ya estaba abierta, el mensaje del Service Worker provoca una actualización puntual del estado, sin polling.

La pantalla autenticada implementa el caso administrativo completo sobre entidades genéricas (`admin.project`, `admin.purchase`, `admin.income` y `admin.projection`). El panel de participantes conecta directamente `revoke`, `transfer` y `leave`, confirma las acciones destructivas y no presenta una revocación como criptográficamente completa cuando la rotación de clave falla. Puede sustituirse por otra interfaz de negocio conservando `p2p-client.js`, `p2p-permissions.js`, `p2p-storage.js`, `p2p-durability.js`, `p2p-crypto.js` y el mismo contrato de permisos.

`custom(spaceId, payload, options)` también es estado durable: si no se indica `entityId`, usa el `operationId` como identidad única, queda en IndexedDB, incrementa `stateRevision` y viaja dentro de snapshots. Esto permite modelar registros genéricos o una bitácora de operaciones de un CRDT sin depender de que la cola temporal de Redis siga vigente. Si la app reutiliza deliberadamente el mismo `entityId`, prevalece el último payload confirmado para esa identidad.

### Modo opcional `sinBACKEND` por red local

La configuración pública expone `sinBACKEND` en `src/js/runtime-config.js`; el Blueprint `render.yaml` la declara desactivada por defecto y durante el build de Render puede activarse cambiándola a `sinBACKEND=true` y ejecutando un nuevo deploy. Cuando está activo, `p2p-client.js` intenta cargar dinámicamente `P2P_sin_RED_LOCALx/P2P_sin_transport.js`. Si esa carpeta se elimina, el import falla de forma controlada y no altera autenticación, IndexedDB, SSE, POST, Web Push ni el outbox del flujo normal con memoriaBACKEND. Cada instalación mantiene además una clave ECDSA P-256 no extraíble. memoriaBACKEND certifica cuenta, dispositivo, dominio, aplicación, proyectos y permisos mediante una capacidad temporal firmada; toda operación LAN debe incluir esa capacidad y una firma del dispositivo. Así, el código de emparejamiento no puede usarse para declarar otra cuenta o elevar permisos.

El bloque abre un `RTCDataChannel` LAN sin STUN/TURN, separa cada conexión por origen y `P2P_APPLICATION_ID`, fragmenta mensajes grandes, limita ensamblajes y rechaza operaciones cuyo usuario remoto no figure con permisos confirmados en el proyecto local. La interfaz “Red local” permite intercambiar una oferta y una respuesta como códigos de texto. Una conexión abierta recibe operaciones cifradas y registra atómicamente tanto la capa optimista como el sobre firmado original en el outbox. Además, ambos pares intercambian mapas de revisión firmados: si una instalación estuvo cerrada y el emisor ya retiró esas operaciones de su outbox, el propietario —o otra instalación de la misma cuenta— puede enviarle un snapshot canónico, cifrado, firmado y dirigido únicamente a esa sesión. La reconstrucción excluye capas optimistas pendientes, verifica digest, conteos, límites, identidad, capacidad y permisos antes de aplicarse. Al regresar la conectividad, cualquier receptor todavía autorizado actúa únicamente como mensajero: memoriaBACKEND vuelve a validar la capacidad, la firma, la cuenta, el dispositivo, el permiso y la clave activa, publica con el autor y dispositivo originales y devuelve el evento canónico para consolidar la copia local incluso cuando la operación ya era idempotentemente conocida. El transporte también trata `disconnected` como una interrupción recuperable: retira temporalmente el canal de los envíos, lo reincorpora si ICE vuelve a `connected` y vuelve a anunciar revisiones y vaciar el outbox. Si no se recupera dentro de la gracia acotada, cierra la sesión para liberar el cupo; el indicador principal deja de mostrar una conexión Wi‑Fi obsoleta.

La capacidad ES256 no se deja vencer silenciosamente mientras la aplicación conserva conectividad. La única pestaña líder calcula una renovación anticipada a partir de `issuedAt` y `expiresAt`, programa un solo temporizador y reutiliza el bootstrap autoritativo; no existe un intervalo periódico. Si memoriaBACKEND falla, aplica backoff acotado sin descartar la capacidad todavía vigente. Si el móvil ya está offline, espera el evento real de reconexión y continúa operando por Wi‑Fi hasta el vencimiento certificado. El temporizador se elimina al perder liderazgo, cambiar de cuenta o detener el cliente para impedir renovaciones cruzadas entre sesiones.

No existe descubrimiento automático entre dos móviles dentro de la plataforma web estándar: WebRTC necesita que oferta/respuesta/ICE crucen algún canal de señalización. Por ello, la primera conexión local requiere el intercambio de códigos y las dos PWA abiertas. Invitaciones nuevas, revocaciones, transferencias y notificaciones con la app cerrada continúan dependiendo del plano de control del backend. El código local solo empareja el canal; la autorización real proviene de la capacidad ES256 emitida por memoriaBACKEND y de la firma ECDSA de la instalación remota.
