# Arquitectura de la semilla

## Commit recuperable de creación

Crear un espacio remoto y su primera entidad local no puede formar una transacción ACID única entre Redis y el navegador. La frontera se convierte en un flujo idempotente: `p2p-space-creation-intent.js` exige un `requestId` estable para el espacio y un `operationId` estable para la entidad, mientras `p2p-storage.js` conserva el intent en la IndexedDB aislada por cuenta antes de iniciar la llamada remota.

Después de recibir `spaceId`, el intent se actualiza antes de publicar la entidad. Una recarga reanuda desde ese punto, consulta primero si la entidad ya está presente y usa la misma identidad de operación cuando necesita publicarla. El registro solo se elimina cuando la entidad existe, la publicación fue confirmada o el outbox ya asumió la entrega offline. Así no se intenta fingir atomicidad distribuida: se conserva una intención durable y repetible hasta alcanzar uno de esos estados seguros.

## Elección multiventana cercada

Web Locks proporciona exclusión real cuando está disponible. El fallback de `localStorage`, en cambio, no dispone de una operación compare-and-set: dos documentos pueden observar el lease anterior antes de escribir y ambos podrían confirmar temporalmente su propia candidatura. `P2PTabCoordinator` evita activar trabajo realtime a partir de esa primera lectura. Cada intento escribe `tabId`, `leaseToken`, `heartbeatSeq`, `claimedAt` y `expiresAt`, espera un periodo corto de contención y vuelve a leer el documento completo antes de notificar liderazgo.

`expiresAt` no es una fuente autoritativa entre pestañas porque depende de `Date.now()` y el reloj de pared puede cambiar durante la vida de la PWA. Cada documento conserva la firma del último lease observado y mide su edad con `performance.now()`, que es monotónico dentro de la pestaña. Mientras el líder renueva, `heartbeatSeq` cambia y reinicia esa observación local; si deja de cambiar durante el TTL, la candidata puede reclamar el lease aunque el registro abandonado tenga una fecha futura. Un heartbeat activo tampoco puede ser invalidado por una seguidora cuyo reloj de pared esté adelantado.

El heartbeat conserva el mismo token y deja de renovar al detectar otro propietario. Los eventos `storage` y los mensajes `leader-active` obligan a revalidar la identidad del lease, por lo que una pestaña desplazada cierra su ciclo de líder sin esperar al siguiente heartbeat. Si el almacenamiento está bloqueado, `BroadcastChannel` usa un desempate lexicográfico estable entre identidades de documento; si tampoco existe un canal compartido, memoriaBACKEND mantiene el cercado final de un único SSE por `userId + deviceId`.

La prueba `tests/p2p-multitab-smoke.mjs` simula lecturas obsoletas simultáneas, comprueba que solo un token queda vigente, fuerza relojes de pared opuestos y valida tanto la recuperación de un lease abandonado como el arbitraje cuando las operaciones de almacenamiento lanzan error.

## Recuperación selectiva por revisión

Un salto de `deviceSequence` obliga a ejecutar un bootstrap inmediato, pero no implica que todos los proyectos legibles hayan perdido estado funcional. La PWA compara por espacio la revisión autoritativa de `memoriaBACKEND` con la revisión aplicada en IndexedDB y conserva watermarks únicamente donde `backendStateRevision > localStateRevision`. El modo `force` acelera esa comprobación; no sustituye la evidencia de una diferencia real.

`P2P_SINCRONIZACIONx` aplica la misma condición antes de conceder una fuente de snapshot. Así, una brecha de un proyecto no provoca reconstrucciones completas en proyectos ya vigentes, no consume su presupuesto de publicación y no mantiene bloqueado el ACK cuando el bootstrap demuestra que el estado local ya cubre todas las revisiones.

## Integridad del sobre y continuidad del stream

El hecho de que `JSON.parse` termine correctamente no garantiza que un evento sea utilizable como parte del protocolo. Antes de entrar a la tubería, cada `p2p_event` debe declarar `eventId`, `eventType` y una `deviceSequence` entera positiva. Los avisos `p2p_gap` validan por separado su `currentSequence`. Un sobre incompleto, una secuencia fraccionaria, un salto o una reproducción anterior bloquean la sesión y fuerzan reconexión desde el último cursor durable; nunca se ignoran para continuar con un evento posterior.

Los eventos conocidos del plano de control tienen además un contrato semántico propio. Revocaciones y eliminaciones deben referirse al mismo espacio del sobre; cada `p2p.membership.changed` debe declarar exactamente una transición entre revocación, transferencia de propiedad o actualización de permisos; membresías e invitaciones deben incluir identidades y estados coherentes; una aceptación exige el espacio recuperable; claves y snapshots deben relacionar actor, dispositivo, época y revisiones válidas. `P2P_SINCRONIZACIONx` aplica esta barrera antes de encolar y la PWA la repite antes de cualquier efecto local o ACK, de modo que un evento crítico incompleto o ambiguo no pueda convertirse en una omisión permanente.

La PWA conserva además `lastAcceptedStreamSequence`, distinta de `lastProcessedSequence`. La primera cercena la continuidad del transporte dentro de la conexión activa; la segunda solo avanza después de aplicar o conservar de forma durable el evento. Al recibir una brecha, la línea de transporte se mueve a `currentSequence` para admitir los chunks de snapshot que vienen después, mientras el cursor durable permanece sin confirmar hasta que la recuperación demuestra que la réplica vuelve a cubrir el estado autoritativo.

## ACK de transporte y confirmación durable

El cursor SSE y la cobertura de réplica representan hechos distintos. El ACK autoriza a `memoriaBACKEND` a retirar eventos temporales de la cola privada, pero un evento puede haber quedado cifrado y diferido o formar parte de un snapshot todavía incompleto. Por eso el backend no infiere cobertura desde el contenido ACKeado.

Antes de enviar el ACK, el líder multiventana reúne los `spaceId` funcionales del lote y lee sus revisiones confirmadas desde IndexedDB. El request incluye ese mapa como `appliedStateRevisions`; el backend lo valida contra membresía, revisión autoritativa y `replicaRevisionHints` del tramo retirado. Solo ese mapa actualiza `P2P_REPLICASx`. Si la lectura local falla, el ACK continúa para no envenenar la cola y la consulta liviana `/api/p2p/replicas/health` reintenta el reporte. Cuando llega una clave y se reproducen eventos cifrados diferidos, el cliente vuelve a consultar cobertura después de materializarlos.

## Reconciliación segura del plano de control

IndexedDB es la copia canónica funcional. Por ello, una ausencia en `spaces` no constituye autorización para borrar. `memoriaBACKEND` registra revocaciones y abandonos explícitos en un índice temporal acotado y los entrega como `revokedSpaceIds`. `p2p-storage.js` reconcilia tres estados: confirmado por backend, revocado explícitamente —que sí se purga de forma transaccional— y local no confirmado, que se conserva con `authorizationState: "unconfirmed"`.

`p2p-client.js` impide publicar, vaciar outbox, invitar, modificar accesos o intercambiar claves en el tercer estado. `app.js` mantiene la información consultable y comunica el modo de recuperación. Cuando la membresía vuelve a aparecer, la reconciliación elimina la marca y reanuda el flujo normal; cuando llega un tombstone, purga datos y material criptográfico.

## Eventos de control multiventana

Compartir IndexedDB no basta para retirar una vista ya materializada en memoria. Por eso `p2p-client.js` diferencia los eventos funcionales ordinarios de dos señales de control: `space-deleted` y `access-revoked`. La pestaña que confirma un borrado, abandono o revocación publica primero su `bootstrapState` depurado y después la señal específica mediante `P2PTabCoordinator`; el marcador `__p2pTabRelay` evita ecos recursivos.

La pestaña receptora vuelve a sanear por identificador, aun si el mensaje de estado llegó desordenado: elimina el espacio, invitaciones recibidas y enviadas relacionadas, y su watermark de recuperación. `app.js` aplica el estado y, cuando el proyecto retirado estaba seleccionado, cierra todos los diálogos asociados y regresa al panel. Así la indisponibilidad temporal de un bootstrap posterior no deja permisos, formularios o datos visibles obsoletos en otra ventana.

## Ciclo de vida BFCache

`pagehide.persisted` no equivale a cerrar la pestaña: el documento puede regresar con toda su memoria anterior, aunque el navegador haya congelado temporizadores, EventSource y tareas pendientes. Mantener el indicador de líder durante ese intervalo permitiría que el lease venciera, otra ventana asumiera la instalación y la página restaurada continuara creyendo que todavía controla SSE, ACK, snapshots y outbox.

Las solicitudes de estado entre ventanas quedan dirigidas al `tabId` y al término de liderazgo anunciados. Una respuesta con el mismo `requestId` pero emitida por otro término se rechaza y fuerza una nueva reconciliación; así una respuesta atrasada del líder anterior no puede satisfacer una solicitud creada para el líder promovido.

`P2PTabCoordinator` entra por ello en estado `suspended`: libera Web Locks o el lease de `localStorage`, detiene heartbeat y elección y emite la pérdida de liderazgo sin cerrar IndexedDB, claves ni sesión. En `pageshow.persisted` espera la liberación anterior y vuelve a adquirir de forma cercada. Si otro líder continúa activo, solicita su estado y permanece seguidora; solo si obtiene la exclusión activa el flujo existente de bootstrap, outbox y stream. La regresión `tests/p2p-multitab-smoke.mjs` cubre el relevo durante BFCache, la restauración sin doble líder y la recuperación posterior.

## Capas

1. **Interfaz mínima**
   - `index.html`
   - `src/css/app.css`
   - `src/js/app.js`
   - `src/js/i18n.js`
   - `src/js/skeleton-screen.js`
   - `src/js/asset-loader.js`

2. **Instalación PWA**
   - `manifest.webmanifest`
   - launcher PWA en `assets/pwa/` (`any` y `maskable`)
   - favicons en `assets/browser/` y Apple Touch Icons en `assets/apple/`
   - logo interno en `assets/ui/` e iconos de notificación en `assets/notifications/`
   - `sw.js`

3. **Multilenguaje**
   - `textX/app/*.json` para textos visibles
   - `textX/seo/*.json` para SEO
   - `textX/languages.json` generado automáticamente

4. **Autoactualización**
   - `version.json`
   - `src/js/app-metadata.js`
   - `src/js/config.js`
   - `src/js/pwa-update-manager.js`

5. **Hosting y seguridad**
   - `_headers`
   - `vercel.json`
   - `deploy/nginx.conf.sample`
   - `deploy/apache.htaccess.sample`

6. **Sincronización P2P local-first**
   - `src/js/p2p-client.js`: invitaciones, membresías, SSE, outbox y API genérica de entidades.
   - `src/js/p2p-permissions.js`: matriz reutilizable de permisos durables, consciente del perfil del espacio y compartida por la recepción LAN.
   - `src/js/p2p-storage.js`: IndexedDB aislada por cuenta, estado canónico/optimista, snapshots y limpieza transaccional.
   - `src/js/p2p-durability.js`: solicitud de almacenamiento persistente, supervisión de cuota y clasificación del riesgo de desalojo local.
   - `src/js/p2p-crypto.js`: identidad ECDH P-256 por instalación, claves AES-GCM por espacio, sobres de clave por dispositivo, ciphertext diferido y purga criptográfica.
   - `memoriaBACKEND/P2P_ACCESOSx`: eliminación definitiva, revocación y abandono reutilizables.
   - `memoriaBACKEND/P2P_CIFRADOx`: autorización y relay temporal de solicitudes/sobres de clave sin recibir claves privadas ni claves de contenido.
   - Los datos funcionales viven en los dispositivos; Redis conserva autorización, metadatos y tránsito temporal cifrado.

## Difusión completa del estado durable

Las operaciones `entity.put`, `entity.patch`, `entity.delete` y `custom` representan estado compartido reconstruible. Por contrato no aceptan una lista de dispositivos destino: el cliente fuerza la inclusión del emisor y memoriaBACKEND vuelve a resolver todos los dispositivos vigentes de miembros con permiso `read` antes del commit atómico. Así, una interfaz derivada no puede crear réplicas permanentemente divergentes enviando una modificación solo a algunos móviles.

`targetDeviceIds` se reserva para `snapshot.chunk` y `snapshot.complete`. En ese flujo no representa estado selectivo: identifica al único dispositivo que solicitó una reconstrucción y está cercado por `requestId`, fuente autorizada, revisión y vencimiento.

La fuente de un snapshot también tiene una frontera de integridad distinta a la autorización de edición. Un miembro conoce la clave compartida y podría alterar su IndexedDB fuera de la aplicación; como memoriaBACKEND no almacena el documento funcional, no puede comparar ese snapshot contra una copia central. Por eso una cuenta puede reconstruir sus propios dispositivos desde otra réplica con `read`, mientras que una reconstrucción entre cuentas solo puede provenir de un dispositivo del propietario. El propietario es la raíz explícita de confianza para anti-entropía entre participantes. Esa condición se comprueba nuevamente en el commit Redis de cada fragmento y del cierre, usando tanto `ownerUserId` como el rol vigente para cercar transferencias concurrentes. El modo `sinBACKEND` aplica la misma frontera antes de aceptar una solicitud o un fragmento LAN: compara revisiones firmadas, exige una solicitud pendiente dirigida a la sesión exacta y reconstruye únicamente la base confirmada, nunca las capas optimistas del emisor.

## Autorización genérica de entidades

El relay no presupone los nombres de las entidades que tendrá cada producto creado desde la semilla. Para un miembro no propietario, `entity.put`, `entity.patch` y `custom` requieren `add`; `entity.delete` requiere `delete`; los snapshots requieren `read`; y las excepciones funcionales se declaran de forma explícita, como `admin.projection`, que exige `projection`. El permiso heredado `write` se mantiene como equivalencia de compatibilidad, no como requisito oculto para entidades nuevas.

Esta separación permite reemplazar por completo la interfaz administrativa y publicar, por ejemplo, `inventory.item`, `medical.note` o cualquier otra entidad sin modificar `P2P_SINCRONIZACIONx`. La autorización sigue verificándose dentro del commit de publicación en memoriaBACKEND, por lo que alterar u ocultar controles visuales no concede capacidades adicionales.

## Autoridad y rotación de claves

Cada espacio cifrado publica en su metadato de autorización `encryptionAuthorityVersion`, `activeEncryptionKeyId` y `encryptionKeyEpoch`. Esos valores no contienen la clave AES: permiten que todos los dispositivos distingan la rotación vigente. El propietario confirma la primera clave o una rotación mediante `/api/p2p/crypto/key-activate`, usando `expectedKeyId` como cercado. memoriaBACKEND actualiza la autoridad en una única operación Lua, acepta el mismo destino como reintento idempotente y rechaza una expectativa atrasada con HTTP 409.

Cuando una revocación o abandono retira a alguien que ya conocía la clave activa, el mismo commit de acceso marca `encryptionRotationRequired`. Mientras esa marca exista, el relay rechaza operaciones funcionales y snapshots antes de secuenciar o encolar. El propietario debe activar una `keyId` diferente; repetir la clave anterior no se considera idempotencia válida porque conservaría el secreto conocido por el usuario retirado. La PWA realiza esa rotación automáticamente al observar la barrera y mantiene bloqueado únicamente el outbox del proyecto afectado en dispositivos que no son propietarios.

`P2P_CIFRADOx` solo retransmite solicitudes y sobres cuya `keyId` coincida con la autoridad actual; `P2P_SINCRONIZACIONx` aplica la misma condición a operaciones y snapshots nuevos. En el cliente, el registro activo de IndexedDB incluye la época. Un evento con época inferior —o con otra clave para la misma época— se descarta antes de importar, activar o redistribuir material criptográfico. Una época recibida que sea posterior al bootstrap conocido sí puede avanzar la réplica, porque el evento ya fue autorizado por el backend.

La recuperación criptográfica mantiene la misma frontera de confianza que la reconstrucción local: cualquier dispositivo con `read` puede restaurar otro dispositivo registrado de su propia cuenta, aunque esa cuenta no tenga permisos de edición. Para entregar la clave activa a una cuenta diferente, el emisor debe conservar `write`. El backend selecciona únicamente esas fuentes, vuelve a comprobar la regla al recibir el sobre y nunca confía solo en la selección inicial.

Si una rotación ocurre entre el cifrado local y la publicación, `P2P_SINCRONIZACIONx` responde `P2P_KEY_STALE`. El outbox no interpreta ese 409 como rechazo funcional: recupera la operación optimista no cifrada desde IndexedDB, refresca la autoridad, la cifra con la clave vigente y reintenta exactamente en su posición. La operación local solo se revierte ante un rechazo permanente real de permisos o validación.

Para compatibilidad, un espacio heredado sin autoridad puede seguir leyendo su copia local. Al abrirlo, el propietario confirma la clave local y crea la época inicial. Hasta entonces otro participante no puede agregar invitados, ya que el nuevo dispositivo no tendría una clave autoritativa recuperable.

## Aislamiento del outbox por espacio

Cuando una acción funcional necesita varias operaciones durables relacionadas, `publishBatch()` las prepara completamente y usa una sola transacción sobre `entities` y `outbox`. Ningún POST comienza hasta que todas las capas optimistas y todas las entradas del lote existen localmente. Los milisegundos consecutivos de `createdAt`, `batchId` y `batchIndex` conservan el orden durante una reanudación. Ante un rechazo permanente se revierte la operación rechazada y se cancelan las posteriores del mismo lote; una operación anterior ya confirmada no se deshace de forma ficticia, por lo que el resultado parcial queda visible para que la interfaz lo trate explícitamente.

Después del commit remoto, cada evento del lote transporta además `batchSize`. La réplica no aplica ni expone una operación aislada: reúne todos los índices, verifica que `deliverySequence`, `spaceSequence` y `stateRevision` sean contiguos y realiza un único commit IndexedDB sobre `entities`, `outbox` y `meta`. Solo después del commit dispara los eventos de interfaz y adelanta el cursor/ACK. Si el stream se corta, intercala otro evento o queda silenciosamente detenido con un lote incompleto, la tubería se bloquea; un vencimiento cercado libera el fragmento y fuerza reconexión para que el replay vuelva a entregar el lote desde el último cursor durable. Los eventos históricos sin estos metadatos conservan la ruta individual de compatibilidad.

El outbox mantiene el orden observado dentro de cada espacio. Si una operación no puede recifrarse porque la clave o la autoridad de ese proyecto todavía no está disponible, el cliente bloquea únicamente esa línea de operaciones durante el ciclo actual y continúa con otros espacios independientes. Las operaciones posteriores del mismo proyecto no pueden adelantarse a la primera pendiente.

Los errores globales —sesión inválida, desconexión, timeout, límite general o indisponibilidad de `memoriaBACKEND`— conservan el corte completo del lote. Así se evita convertir una caída del servicio en una solicitud fallida por cada proyecto, sin volver a acoplar proyectos sanos a un bloqueo criptográfico local.

## Frontera de sesión y cuenta

`src/js/api.js` enlaza cada solicitud autenticada al token leído al iniciarla. Si el token cambia antes de recibir o interpretar la respuesta, la respuesta se rechaza con `APP_SESSION_CHANGED` y no llega a la capa P2P. `src/js/p2p-client.js` incluye ese token en su `sessionContext`, por lo que callbacks SSE, bootstrap, outbox y snapshots de una sesión anterior dejan de ser válidos inmediatamente.

`src/js/app.js` escucha el evento `storage` para cambios de sesión originados en otra ventana. Antes de mostrar la cuenta nueva detiene el cliente P2P, invalida operaciones visuales pendientes, cierra diálogos y limpia el estado administrativo en memoria. Después consulta `/api/bootstrap` y reinicia la réplica con el usuario canónico. El logout usa comparación del token esperado para no borrar ni cerrar una sesión más reciente creada concurrentemente en otra ventana.

La suscripción Web Push también pertenece a esa frontera. El logout intenta liberar su endpoint en memoriaBACKEND mientras el token anterior sigue vigente y solo después detiene el cliente. Si la red falla o la sesión ya caducó, invalida la suscripción local para que el dispositivo no continúe mostrando avisos de la cuenta cerrada. Una transición concurrente de token cancela ese fallback local y evita enviar `/api/auth/logout` con la credencial nueva. Si fue necesaria la baja local y el permiso continúa concedido, el próximo arranque recrea el endpoint y lo registra para la cuenta autenticada.

El cupo de instalaciones también es una frontera autoritativa, pero no puede resolverse expulsando una copia válida: en un sistema sin base de datos central el dispositivo más antiguo puede contener la única réplica completa. El registro atómico limpia primero referencias cuyo documento venció o es inconsistente; si todas las posiciones siguen vigentes, rechaza con `P2P_DEVICE_LIMIT_REACHED` tanto una identidad nueva como la reactivación de un documento que perdió su índice, y conserva sin cambios las instalaciones existentes. Una renovación ya indexada continúa permitida. Las bajas explícitas o referencias caducadas continúan difundiendo su invalidación entre instancias; memoriaBACKEND cierra sus SSE, revalida la propiedad antes de cada replay o heartbeat y depura suscripciones Web Push residuales.

La identidad criptográfica queda vinculada de forma inmutable al `deviceId`. Registrar de nuevo la misma instalación puede actualizar nombre, plataforma y actividad, pero no reemplazar su clave pública ECDH. Si una restauración o clon del almacenamiento reutiliza el mismo `deviceId` con otra clave privada, memoriaBACKEND devuelve `P2P_DEVICE_IDENTITY_CONFLICT` sin tocar la cola ni el registro vigente. La PWA invalida esa identidad local, genera otra, religa en una transacción el outbox y las operaciones optimistas que todavía señalaban al identificador anterior, y reinicia el bootstrap. Las pestañas de una misma instalación adoptan el identificador ya rotado mediante `localStorage`, mientras el liderazgo evita abrir más de un SSE por instalación. La recuperación queda cercada por generación y token: cerrar sesión o cambiar de cuenta la cancela antes de que pueda reabrir una identidad anterior.

## Ciclo de acceso

`invite()` y `respondToInvitation()` incorporan participantes. `deleteSpace(spaceId)` elimina todo el proyecto y solo puede ejecutarlo el propietario; `revoke(spaceId, userId)` retira a otro participante, `transfer(spaceId, userId)` entrega atómicamente la propiedad a otro miembro y `leave(spaceId)` retira al usuario autenticado. Una eliminación o baja se aplica primero en el plano de autorización, por lo que los dispositivos afectados dejan de publicar, recibir eventos o servir snapshots. Después, SSE/Push o el siguiente bootstrap hacen que la PWA elimine atómicamente el espacio y todos sus datos locales relacionados, incluso registros huérfanos sin metadato de espacio.

Un equipo que permanezca completamente offline conserva físicamente la última copia que ya tenía hasta volver a conectarse. La semilla rota la clave activa al revocar un miembro, por lo que ese equipo no puede descifrar operaciones futuras; ninguna arquitectura puede borrar a distancia una copia ni revocar retroactivamente datos que el dispositivo ya descifró mientras estaba autorizado.


## Aislamiento del Service Worker entre raíz y carpetas

Una instalación en `/contabilidad/` obtiene por diseño un `registration.scope` limitado a esa carpeta. La excepción es una app instalada en `/`: el navegador le concede alcance técnico sobre todo el origen, incluyendo aplicaciones hermanas que todavía no hayan activado su propio worker.

La semilla no usa ese alcance amplio como permiso funcional. `sw.js` comprueba la pertenencia de cada navegación, recurso, mensaje y cliente antes de intervenir. En la raíz solo se consideran propias las rutas declaradas en `rootNavigationPaths`, los archivos del shell y los prefijos de `rootOwnedPathPrefixes`; cualquier solicitud de `/contabilidad/`, `/facturacion/` u otra carpeta queda en manos de la red o de su worker específico. Las difusiones de actualización, limpieza de caché y Push se envían únicamente a ventanas de la misma aplicación, y una notificación nunca enfoca ni navega una app hermana.

Al extender una app raíz con rutas SPA adicionales o nuevas carpetas de assets, esas rutas deben agregarse explícitamente a `rootNavigationPaths` o `rootOwnedPathPrefixes` en `src/js/app-metadata.js`. Esta lista es una frontera de operación y caché; no convierte carpetas del mismo origen en orígenes de seguridad distintos.

## Estrategia de caché

| Tipo de recurso | Estrategia |
|---|---|
| Navegación | network-first con fallback a `index.html` y `offline.html` |
| HTML/CSS/JS/JSON | network-first |
| `sw.js`, `version.json`, `textX/languages.json`, `app-metadata.js` | siempre fresco |
| Imágenes/fuentes/media | stale-while-revalidate |
| APIs privadas | network-only |

## Por qué esta arquitectura es reutilizable

- No depende de Node, framework ni build step.
- Usa rutas relativas.
- Sirve para proyectos estáticos o SPAs.
- Permite reemplazar la UI sin tocar la infraestructura PWA.
- Incluye headers para los hostings más comunes.
- Permite agregar idiomas con solo pegar JSON en `textX/app` y `textX/seo` y regenerar release, sin tocar código; en Render Static Site el `render.yaml` incluido ejecuta esa regeneración durante el build.


## Cargas perceptibles

Toda espera que pueda superar 500 ms debe usar `AppSkeletonScreen` y slots `data-skeleton-slot`. Esta regla evita spinners como patrón principal y mantiene una percepción de carga moderna en móvil, tablet y PC.

## Edición concurrente sin pérdida silenciosa

Las entidades nuevas se publican con `entity.put`. Las ediciones de entidades existentes deben usar `SemillaP2PClient.patch()` con `expected`, que contiene únicamente el valor observado de cada campo que el usuario modificó. El payload se cifra junto con la operación cuando el espacio exige cifrado.

Cada réplica aplica los eventos en el mismo orden canónico. Si un campo ya cambió respecto a `expected`, la política `preserve-remote` conserva el valor remoto y aplica los demás campos no conflictivos. Así dos usuarios pueden modificar campos distintos del mismo registro sin sobrescribirse y un conflicto sobre el mismo campo queda visible para el dispositivo que originó la edición. Este mecanismo no necesita almacenar el documento funcional en memoriaBACKEND.

Las eliminaciones que podrían romper relaciones funcionales pueden declarar `referenceGuards`. Cada guarda indica el `entityType`, la ruta de campo y el valor que no debe existir en otra entidad activa del mismo espacio. La condición viaja cifrada dentro de `entity.delete`; cada réplica la evalúa contra su estado canónico ordenado y convierte la eliminación en un no-op con conflicto `__reference__` si encuentra una referencia.

Las altas que dependen de otra entidad pueden declarar `referenceRequirements`. Cada requisito identifica exactamente el `entityType` y `entityId` que debe seguir activo; si la entidad requerida ya fue eliminada o no existe en el orden canónico, el `put` se convierte en un no-op con conflicto `__reference_required__`. La combinación de guarda al borrar y requisito al crear cierra ambos órdenes posibles de una carrera: si primero se vincula, se conserva la proyección; si primero se elimina, se rechaza el vínculo tardío. La interfaz administrativa aplica esta protección bidireccional entre `admin.projection` y `admin.projection-link` sin exponer el contenido al relay.



## Transferencia de propiedad con continuidad verificable

Como los snapshots entre cuentas solo aceptan como fuente a un dispositivo del propietario, transferir la propiedad a una cuenta atrasada podía convertir una copia incompleta en la única raíz autorizada de recuperación. La transferencia ahora recopila las identidades de dispositivo candidatas del destinatario y, dentro del mismo script Lua que cambia los roles, vuelve a leer la `stateRevision` vigente, cada registro de dispositivo y su reporte temporal de réplica. Si ningún dispositivo de la cuenta destino declara la revisión completa aplicada en IndexedDB, la operación se rechaza sin modificar membresías ni outbox. Una publicación concurrente que gane antes del script eleva la revisión y obliga a sincronizar nuevamente; una que ocurra después ya se entrega al nuevo propietario.
