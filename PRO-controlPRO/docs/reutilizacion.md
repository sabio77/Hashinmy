# Cómo reutilizar esta semilla en otro proyecto

## Conserva la infraestructura PWA

Mantén estos archivos como base:

```text
manifest.webmanifest
sw.js
version.json
src/js/app-metadata.js
src/js/config.js
src/js/pwa-update-manager.js
_headers o configuración equivalente del hosting
```

## Reemplaza tu aplicación

Puedes reemplazar:

```text
index.html
src/css/app.css
src/js/app.js
assets/
```

## Rutas internas

Si tu app usa rutas internas como:

```text
/clientes
/admin
/perfil
```

El Service Worker ya responde con `index.html` en navegaciones, por lo que sirve como base para una SPA.

## APIs reales

No caches respuestas privadas o dinámicas de API. Agrega esas rutas a `networkOnlyPathPrefixes` en `src/js/config.js` y replica la misma lógica en `sw.js` si cambias los prefijos.

Ejemplo:

```js
networkOnlyPathPrefixes: [
  '/api/',
  '/auth/',
  '/pagos/'
]
```

## Apps grandes o con framework

Si usas un bundler que genera archivos con hash, evita poner todos los archivos pesados en `fingerprintCheckFiles`. Lo ideal es vigilar:

```text
index.html
manifest.webmanifest
asset-manifest.json
manifest.json del build
```

## Ruta base y múltiples aplicaciones en un mismo dominio

La ruta base —incluyendo mayúsculas/minúsculas— se detecta automáticamente desde `src/js/app-metadata.js` y el scope real del Service Worker. No agregues una variable de entorno al Static Site para indicar la carpeta.

Ejemplos:

```text
https://hashinmy.com/                 -> aplicación root
https://hashinmy.com/contabilidad/    -> aplicación contabilidad
https://hashinmy.com/suite/inventario/ -> aplicación suite/inventario
```

Cada copia debe conservar sus rutas relativas y su propio `sw.js`. El hosting principal debe resolver la carpeta y reescribir las navegaciones internas al `index.html` de esa aplicación. En `memoriaBACKEND`, agrega exactamente esas aplicaciones a `P2P_APLICACIONES_APROBADAS`; de lo contrario la API responde `P2P_APPLICATION_NOT_APPROVED`.

La independencia entre carpetas es lógica y funcional. Web Storage, IndexedDB y otras APIs del navegador siguen perteneciendo al mismo origen, aunque la semilla use nombres separados. Si una app puede ejecutar código no confiable o debe resistir una vulnerabilidad de otra app hermana, usa subdominios distintos: una ruta URL no constituye por sí sola una frontera de seguridad del navegador.


## Reutilización de idiomas

Conserva `textX/app`, `textX/seo`, `textX/languages.json` y `src/js/i18n.js`. Para agregar idiomas, copia las keys de español, pega los nuevos JSON y ejecuta `python tools/generate-release.py`. El selector se alimenta del manifiesto generado, no de código hardcodeado.

## Contrato P2P reutilizable

Conserva `src/js/p2p-client.js`, `src/js/p2p-permissions.js`, `src/js/p2p-storage.js`, `src/js/p2p-durability.js` y `src/js/p2p-crypto.js` al sustituir la interfaz. La app final puede usar `invite`, `respondToInvitation`, `deleteSpace`, `revoke`, `transfer`, `leave`, `retireDevice`, `put`, `patch`, `delete`, `custom`, `publishBatch`, `getEntity` y `listEntities` desde `window.SemillaP2P`. No leas IndexedDB directamente: el cliente bloquea lecturas sin permiso y purga el estado local cuando bootstrap o el evento de membresía confirma una revocación. Solicita la protección persistente desde un gesto explícito del usuario y conserva visible el estado de cuota; no asumas que el navegador concederá o mantendrá esa protección.

Mantén `resourceType` y `permissionProfile` al crear espacios: son parte de la capacidad offline y evitan que una app genérica herede reglas de otra interfaz. No uses `targetDeviceIds` ni intentes excluir al emisor al publicar `put`, `patch`, `delete` o `custom`. Esas operaciones son estado durable común y deben llegar a todas las réplicas autorizadas; el cliente y memoriaBACKEND rechazan cualquier fan-out parcial. Los destinos explícitos pertenecen únicamente al flujo interno de snapshots concedidos y no deben exponerse como una opción funcional de la interfaz.



## Cifrado reutilizable

No envíes payloads funcionales directamente a `/api/p2p/events/publish`. Usa siempre los métodos de `window.SemillaP2P`: para espacios nuevos, el cliente cifra operaciones y snapshots con AES-GCM antes del transporte. Cada dispositivo registra solo su clave pública ECDH P-256; la clave del espacio se entrega en un sobre individual y permanece en IndexedDB del usuario autorizado. Al diseñar una nueva interfaz, conserva `encryptionVersion` de los espacios y no elimines la validación `assertEncryptedTransportEvent`.

## Frontera de la raíz administrativa

En la aplicación incluida, `admin.project` contiene nombre, dirección y presupuesto inicial. Esa entidad solo puede ser creada, editada o eliminada por el propietario: `add`, `delete`, `projection` y el permiso heredado `write` no conceden acceso a esa raíz. Mantén la misma separación en interfaces derivadas cuando una entidad defina el capital, identidad o configuración autoritativa del espacio. Para cualquier perfil de aplicación, la reconstrucción de una cuenta distinta mediante snapshot exige una réplica del propietario; una réplica de la misma cuenta puede seguir recuperando sus otros dispositivos aunque solo tenga lectura. No amplíes esta frontera a colaboradores con `write`: la clave compartida les permite cifrar una IndexedDB alterada y memoriaBACKEND no conserva una copia funcional con la cual contrastarla. Conserva también la revalidación atómica de `ownerUserId` y rol en `P2P_ENTREGASx`, porque la validación previa por sí sola deja una carrera durante transferencias de propiedad.

## Regla para formularios editables

Cuando una sola acción de interfaz produzca dos o más operaciones durables que deban sobrevivir juntas a un cierre —por ejemplo, un registro y una entidad de vínculo— usa `publishBatch(spaceId, [{ operation }, ...])` en lugar de invocar `publish`, `put` o `patch` de forma secuencial. El lote admite entre dos y ocho operaciones, conserva los mismos contratos de cifrado y autorización y garantiza una sola escritura local para estado optimista y outbox. Diseña el orden desde la operación base hacia sus dependencias: si la base es rechazada, el cliente cancela las posteriores; si una operación posterior falla después de que una anterior fue aceptada, trata `P2P_BATCH_PARTIAL_REJECTION` y comunica el resultado parcial sin afirmar atomicidad distribuida.

Al crear una entidad usa `put`. Al editar una entidad existente usa `patch` y entrega en `expected` el valor anterior de cada campo realmente modificado. No envíes el objeto completo como reemplazo, porque una interfaz derivada podría borrar cambios concurrentes de otro colaborador. La política predeterminada `preserve-remote` mantiene el dato remoto y devuelve los campos en conflicto dentro del resultado local del evento.

Cuando una entidad no deba eliminarse mientras otra la referencia, usa `delete` con `referenceGuards`. Ejemplo: `SemillaP2P.delete(spaceId, 'app.plan', planId, { expected: planValue, referenceGuards: [{ entityType: 'app.purchase-link', field: 'planId', equals: planId }] })`. La guarda es genérica, admite rutas de campo con puntos, se cifra con la operación y se resuelve de manera determinista en cada réplica.

Protege también el sentido inverso: al crear el vínculo usa `put` con `referenceRequirements`, por ejemplo `SemillaP2P.put(spaceId, 'app.purchase-link', purchaseId, linkValue, { referenceRequirements: [{ entityType: 'app.plan', entityId: planId }] })`. Así, si el borrado queda primero en el orden canónico, el vínculo tardío no revive una relación inválida; si el vínculo queda primero, `referenceGuards` bloquea el borrado. La UI debe bloquear anticipadamente acciones inválidas para responder de inmediato, pero estas dos condiciones P2P son la protección autoritativa frente a concurrencia.



### Baja segura de instalaciones

Para una pantalla de dispositivos usa la lista `bootstrapState.devices` y llama `SemillaP2P.retireDevice(targetDeviceId)` únicamente desde otra instalación de la misma cuenta. No elimines claves Redis ni borres el identificador desde la interfaz: el backend comprueba dentro del mismo commit el índice completo de proyectos, los permisos y cada revisión autoritativa antes de aceptar que otra réplica está al día. Trata `P2P_DEVICE_RETIREMENT_UNSAFE` como una instrucción para abrir y sincronizar otro dispositivo, y `P2P_DEVICE_RETIREMENT_SCOPE_CHANGED` como una solicitud de refrescar el estado antes de reintentar; ninguno debe forzarse. La baja del dispositivo actual se rechaza de forma deliberada.

### Cierre del ciclo de vida

Usa `deleteSpace(spaceId)` únicamente desde una acción exclusiva del propietario y con confirmación irreversible. El método espera la confirmación del backend antes de purgar la copia local; los demás dispositivos reciben `p2p:space-deleted` cuando el outbox recuperable entrega `p2p.space.deleted`. No implementes el borrado de un proyecto eliminando solo entidades de IndexedDB ni interpretando su ausencia en bootstrap como autorización: eso dejaría membresías, claves o réplicas divergentes.


### Transferencia segura de propiedad

No omitas la precondición de réplica al reutilizar `transfer()`: si el espacio tiene contenido, el destinatario debe haber aplicado la revisión vigente en IndexedDB. El backend devuelve `P2P_OWNERSHIP_TARGET_REPLICA_REQUIRED` cuando todavía necesita abrir y sincronizar el proyecto.
