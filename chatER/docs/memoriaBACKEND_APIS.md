# ChatER - Documentación de APIs necesarias para memoriaBACKEND

ChatER es un static site pensado para desplegarse en Render.com como frontend estático. El sitio no debe depender de lógica backend local: cualquier proceso que requiera servidor debe exponerse como API de `memoriaBACKEND`. Esta documentación define las APIs necesarias para que la interfaz tipo WhatsApp funcione con autenticación Google/Gmail validada por memoriaBACKEND y comunicación en tiempo real sin polling.

## 1. Configuración esperada del static site

El frontend lee la configuración desde `js/config.js`, cargado antes de `js/app.js`. En Render.com static site se puede reemplazar ese archivo sin recompilar la interfaz:

```js
window.CHATER_CONFIG = {
  // Dominio base de memoriaBACKEND, sin /api/v1.
  MEMORIA_BACKEND_URL: 'https://memoriabackend.example.com',
  MEMORIA_SITE_ID: 'a1',
  MEMORIA_API_PREFIX: '/api/v1',
  // Opcional: si queda vacío, ChatER usa SSE en /api/v1/streme/eventos.
  STREME_REALTIME_URL: '',
  STREME_TRANSPORT: 'auto',
  STREME_CHANNEL: 'chater-general',
  ENABLE_CLIENT_TELEMETRY: true,
  API_TIMEOUT_MS: 15000,
  MEDIA_UPLOAD_TIMEOUT_MS: 60000,
  MESSAGE_MEDIA_PREVIEW_MAX_BYTES: 1500000,
  PUSH_PUBLIC_KEY: ''
};
```

Si `MEMORIA_BACKEND_URL` no está configurada, ChatER funciona en modo demostración local con `localStorage` para no romper la interfaz. Si existe, la interfaz envía `s={MEMORIA_SITE_ID}`, `X-MB-Site`, `X-Hashinmy-Action:webapp` en mutaciones e idempotencia por `X-MB-Idempotency-Key` cuando corresponde. La interfaz intenta hidratar perfil, conversaciones, mensajes, estados y llamadas desde las rutas canónicas de memoriaBACKEND. `STREME_TRANSPORT` puede ser `auto`, `websocket` o `sse`; en `auto`, una URL `ws/wss` explícita usa WebSocket y la integración derivada desde `MEMORIA_BACKEND_URL` usa SSE/EventSource en `/api/v1/streme/eventos`.

`ENABLE_REMOTE_USER_PREFERENCES` permite desactivar por despliegue la sincronización de preferencias privadas con `PREFERENCIASusuarioX` sin tocar el código de la PWA.

`API_TIMEOUT_MS` limita cada llamada JSON hacia memoriaBACKEND para que una API colgada no bloquee la interfaz ni la cola local; `MEDIA_UPLOAD_TIMEOUT_MS` aplica a subidas de archivos hacia URLs firmadas porque los adjuntos necesitan una ventana más amplia. Ambos valores pueden ajustarse por despliegue desde `js/config.js` sin recompilar el static site.

`ENABLE_CLIENT_TELEMETRY` permite registrar errores técnicos del navegador como eventos seguros en `EVENTOSx` mediante `POST /api/v1/eventos/registrar`. Si está desactivado o `MEMORIA_BACKEND_URL` está vacío, ChatER conserva los errores solo en consola/local para no inventar un backend propio.

## 2. Principios de contrato

- Autenticación obligatoria con Google/Gmail mediante `AUTENTICACIONx`, no por OTP local ni número telefónico.
- Tokens compatibles solo temporales de pestaña; la cookie segura de memoriaBACKEND es la sesión principal.
- Todas las respuestas deben incluir `requestId` para auditoría.
- Todas las escrituras deben aceptar `clientMutationId` para idempotencia.
- El tiempo real debe usar `streme` por WebSocket o SSE, sin polling.
- El frontend debe poder operar con estados optimistas y sincronización posterior.

## 3. API de autenticación Google/Gmail con AUTENTICACIONx

ChatER no debe abrir sesión por OTP ni por número telefónico. El acceso a la interfaz protegida usa el bloque `AUTENTICACIONx` de `memoriaBACKEND`, con proveedor Google, correo verificado y dominio Gmail cuando `REQUIRE_GMAIL_DOMAIN` está activo.

Punto débil corregido en la integración del static site: el frontend ya no infiere `google.com` por defecto cuando `AUTENTICACIONx` devuelve solo un correo. Para abrir ChatER, `/auth/check`, `/auth/firebase/session` o el payload del SDK deben incluir evidencia explícita del proveedor Google/Gmail mediante campos como `u.pr`, `provider`, `providerId`, `authProvider`, `signInProvider`, `sign_in_provider` o `firebase.sign_in_provider`. Si memoriaBACKEND no confirma ese proveedor, el static site limpia la sesión local y vuelve al acceso Google/Gmail.

Punto débil corregido en esta iteración: la carga de `login.js` podía quedar bloqueada después de un error de red, CORS o dominio no autorizado porque el navegador conservaba el `<script>` fallido y un segundo intento no garantizaba nuevos eventos `load`/`error`. ChatER ahora elimina cualquier script no cargado antes de reintentar, conecta los manejadores antes de asignar `src` y solo reutiliza el script cuando ya está cargado y corresponde a la URL vigente de `memoriaBACKEND`. Esto preserva la obligación de autenticar ChatER con Google/Gmail mediante `AUTENTICACIONx` sin crear un flujo local alterno.

### GET `/auth/providers?s={siteId}`
Devuelve los proveedores activos publicados por `AUTENTICACIONx`. ChatER lo usa como verificación auxiliar de disponibilidad del login.

### GET `/login.js?s={siteId}`
Script oficial de login para static sites autorizados. Debe cargarse desde el dominio real de `memoriaBACKEND`, no desde el static site. El script abre Google/Firebase y emite eventos compatibles con `window.memoriaBACKEND`.

Parámetros visuales admitidos por ChatER:
```txt
n = nombre de marca visible
c = color de tema
l = logo público opcional
bg = fondo público opcional
next = URL de retorno autorizada
```

### GET `/auth/login?s={siteId}`
Vista HTML oficial de autenticación Google/Gmail. ChatER la usa como respaldo cuando `login.js` no expone un helper directo para abrir el popup o redirección.

### GET `/auth/check?s={siteId}`
Valida la cookie segura emitida por `AUTENTICACIONx` y devuelve la identidad vigente. ChatER la ejecuta al iniciar para no depender de credenciales locales. Si la sesión no existe, fue revocada, responde `ok:0`, devuelve un error de autenticación o no puede confirmarse contra memoriaBACKEND, el static site limpia la sesión local y vuelve a pedir Google/Gmail antes de mostrar la interfaz protegida.

Response mínimo esperado:
```json
{
  "ok": 1,
  "requestId": "uuid",
  "u": {
    "i": "usr_123",
    "e": "usuario@gmail.com",
    "n": "Usuario",
    "pr": "google.com"
  }
}
```

### POST `/auth/firebase/session?s={siteId}`
Crea sesión backend desde un `idToken` validado por Firebase/Google. El backend debe comprobar proveedor `google.com`, correo verificado, dominio autorizado por `revisionDOMINIOS` y cabecera `X-Hashinmy-Action: webapp`.

Request:
```json
{
  "s": "a1",
  "idToken": "firebase-google-id-token",
  "next": "https://sitio-autorizado.onrender.com/",
  "deviceId": "browser-device-id",
  "clientMutationId": "uuid"
}
```

Response mínimo esperado:
```json
{
  "ok": 1,
  "requestId": "uuid",
  "u": {
    "i": "usr_123",
    "e": "usuario@gmail.com",
    "n": "Usuario",
    "pr": "google.com"
  },
  "tk": "token-temporal-opcional",
  "signedSession": "token-temporal-opcional"
}
```

La cookie `HttpOnly/Secure/SameSite=None` es la sesión principal. Si el backend devuelve `tk`, `token` o `signedSession` para compatibilidad cuando el navegador bloquea cookies, ChatER lo conserva solo como credencial temporal de pestaña mediante `sessionStorage` o memoria volátil; no lo persiste en `localStorage`.

### POST `/auth/refresh?s={siteId}`
Renueva una sesión cuando `AUTENTICACIONx` publique refresh compatible. ChatER lo usa solo si existe token temporal de pestaña o cookie válida y envía `clientMutationId`/`X-MB-Idempotency-Key` para mantener el contrato idempotente de mutaciones públicas.

### POST `/auth/logout?s={siteId}`
Revoca la sesión en memoriaBACKEND y limpia credenciales temporales de pestaña, correo local, cursor `streme` y estado de sincronización del usuario. ChatER también envía `clientMutationId`/`X-MB-Idempotency-Key` para que reintentos de cierre no dupliquen efectos.

## 4. API de usuario y perfil

### GET `/api/v1/perfil-usuario?s={siteId}`
Devuelve identidad pública/controlada del usuario final, correo activo, `internalUserId/userId`, preferencias visibles, avatar, descripción, idioma, disponibilidad y permisos que memoriaBACKEND decida exponer. El static site lo usa para confirmar el propietario real después de autenticar y para persistir el `userId` canónico cuando el backend lo publica.

### PATCH `/api/v1/perfil-usuario/{profileId}?s={siteId}`
Actualiza nombre visible, foto de perfil, descripción, idioma, privacidad y disponibilidad cuando memoriaBACKEND publique edición de perfil para el usuario autenticado. Si no existe edición para ese despliegue, ChatER conserva la vista local sin inventar otra ruta.

### GET/POST `/api/v1/preferencias-usuario?s={siteId}`
Guarda preferencias privadas por usuario. ChatER la usa para sincronizar preferencias no críticas que antes vivían solo en `localStorage`, como emojis recientes, estado de notificaciones por dispositivo, modo visual automático, idioma del navegador y metadatos de visualización. El modo local se conserva si `MEMORIA_BACKEND_URL` no está configurado o si `ENABLE_REMOTE_USER_PREFERENCES` se desactiva.

Request de sincronización recomendado:
```json
{
  "userId": "usr_123",
  "userEmail": "usuario@correo.com",
  "theme": "automatic",
  "language": "es-CO",
  "notifications": {
    "permission": "granted",
    "deviceId": "browser-device-id",
    "pushEnabled": true,
    "syncStatus": "synced"
  },
  "view": {
    "recentEmojis": ["😊", "👍"],
    "displayMode": "browser"
  },
  "visualBehavior": {
    "themeMode": "automatic",
    "lightStartsAt": 6,
    "darkStartsAt": 18
  },
  "personalConfig": {
    "source": "chater-static-site",
    "reason": "emoji-recents"
  },
  "clientMutationId": "uuid"
}
```

## 5. API de contactos por correo

El catálogo canónico no usa `/contacts`; el proceso equivalente se cubre con `RELACIONESusuarioX` en `/api/v1/relaciones-usuario`. ChatER crea o actualiza una relación de tipo `contact` como apoyo del nuevo chat, sin bloquear la creación de conversación si esta relación falla temporalmente.

### POST `/api/v1/relaciones-usuario?s={siteId}`
Crea o actualiza una relación/contacto usando correo electrónico.

Request:
```json
{
  "fromUserId": "usr_123",
  "fromUserEmail": "usuario@correo.com",
  "contactEmail": "contacto@correo.com",
  "displayName": "María Gómez",
  "alias": "María Gómez",
  "relationType": "contact",
  "status": "active",
  "metadata": {
    "source": "chater-static-site",
    "conversationId": "chat_123"
  },
  "clientMutationId": "uuid"
}
```

## 6. API de conversaciones

### GET `/api/v1/conversaciones?s={siteId}`
Lista conversaciones del usuario con último mensaje, no leídos, estado y participantes. Esta lectura es obligatoria para que el static site no dependa de conversaciones semilla cuando memoriaBACKEND ya está configurado.

Response mínimo recomendado:
```json
{
  "requestId": "uuid",
  "conversaciones": [
    {
      "id": "chat_123",
      "displayName": "María Gómez",
      "participants": [{ "email": "maria@correo.com", "displayName": "María Gómez" }],
      "status": "En línea",
      "unreadCount": 2,
      "lastMessage": {
        "id": "msg_123",
        "text": "Hola",
        "direction": "incoming",
        "createdAt": "2026-07-02T20:20:00Z"
      }
    }
  ]
}
```

### POST `/api/v1/conversaciones?s={siteId}`
Crea una conversación individual o grupal por correos. ChatER puede sincronizar además `POST /api/v1/relaciones-usuario` para que el contacto quede registrado como relación del usuario.

Request:
```json
{
  "type": "direct",
  "participants": [
    { "userId": "usr_123", "email": "usuario@correo.com", "role": "owner" },
    { "email": "contacto@correo.com", "displayName": "María Gómez", "role": "contact" }
  ],
  "ownerUserId": "usr_123",
  "ownerUserEmail": "usuario@correo.com",
  "contactUserId": "",
  "contactEmail": "contacto@correo.com",
  "displayName": "María Gómez",
  "title": "María Gómez",
  "status": "active",
  "clientMutationId": "uuid"
}
```

### GET `/api/v1/conversaciones/{conversationId}?s={siteId}`
Detalle de conversación cuando memoriaBACKEND lo publique.

### PATCH `/api/v1/conversaciones/{conversationId}?s={siteId}`
Actualiza nombre, silencio, archivado, fijado, fondo o configuración. Debe aceptar `clientMutationId` para idempotencia y, para la lista principal tipo WhatsApp, al menos los campos `archived` y `pinned`.

Request mínimo para archivar o restaurar:
```json
{
  "archived": true,
  "clientMutationId": "uuid"
}
```

Request mínimo para fijar o desfijar:
```json
{
  "pinned": true,
  "clientMutationId": "uuid"
}
```

El backend debe tratar `archived` y `pinned` como parches independientes: si un campo no viene en el request, no debe cambiarse.

### POST `/api/v1/interacciones-mensaje?s={siteId}`
Marca conversación como leída usando `interactionType:"read"`, `conversationId`, `actorUserId/actorUserEmail`, `readAt` y `clientMutationId`.

## 7. API de mensajes

### GET `/api/v1/mensajes?s={siteId}&conversationId={conversationId}&before={cursor}&limit=50`
Carga historial paginado. El frontend debe llamar este endpoint bajo demanda al abrir una conversación si `/api/v1/conversaciones` solo entregó `lastMessage`, y debe fusionar la respuesta por identidad de mensaje para no duplicar mensajes locales optimistas.

### POST `/api/v1/mensajes?s={siteId}`
Envía mensaje de texto o mensaje con adjunto confirmado.

Request de texto:
```json
{
  "conversationId": "chat_123",
  "senderUserId": "usr_123",
  "senderUserEmail": "usuario@correo.com",
  "text": "Hola",
  "status": "sent",
  "clientTime": "2026-07-02T15:20:00-05:00",
  "clientMutationId": "uuid"
}
```

Response:
```json
{
  "requestId": "uuid",
  "mensaje": {
    "id": "msg_123",
    "conversationId": "chat_123",
    "senderUserId": "usr_123",
    "text": "Hola",
    "status": "sent",
    "createdAt": "2026-07-02T20:20:00Z"
  }
}
```

### PATCH `/api/v1/mensajes/{messageId}?s={siteId}`
Edita mensaje si la política lo permite.

### DELETE `/api/v1/mensajes/{messageId}?s={siteId}`
Elimina para mí o para todos si memoriaBACKEND habilita esa acción.

### POST `/api/v1/interacciones-mensaje?s={siteId}`
Agrega reacciones, respuestas, menciones, entregado o leído sin duplicar `MENSAJESx`.

## 8. API `streme` para tiempo real sin polling

`streme` debe mantener comunicación de baja latencia con WebSocket o SSE. El cliente debe soportar ambos transportes para que el static site no quede acoplado a una sola implementación de memoriaBACKEND.

Endpoints recomendados:

- WebSocket: usar `STREME_REALTIME_URL` si el despliegue publica un canal `ws/wss` compatible con `STREMEx`.
- SSE/EventSource canónico: `GET /api/v1/streme/eventos?s={siteId}&canal={channel}&lastEventId={eventId}`.

Eventos servidor → cliente:

```json
{ "type": "message.created", "data": { "chatId": "chat_123", "message": {} } }
{ "type": "message.updated", "data": { "chatId": "chat_123", "message": {} } }
{ "type": "message.deleted", "data": { "chatId": "chat_123", "messageId": "msg_123" } }
{ "type": "typing.started", "data": { "chatId": "chat_123", "userId": "usr_456" } }
{ "type": "typing.stopped", "data": { "chatId": "chat_123", "userId": "usr_456" } }
{ "type": "presence.changed", "data": { "userId": "usr_456", "status": "online" } }
{ "type": "call.incoming", "data": { "callId": "call_123", "chatId": "chat_123", "type": "voice" } }
{ "type": "state.created", "data": { "stateId": "state_123" } }
```

Eventos cliente → servidor por WebSocket:

```json
{ "type": "typing.start", "chatId": "chat_123" }
{ "type": "typing.stop", "chatId": "chat_123" }
{ "type": "presence.heartbeat" }
{ "type": "chat.opened", "chatId": "chat_123" }
```

### POST `/api/v1/streme/eventos`

Canal de publicación para eventos efímeros cuando `streme` está conectado como SSE/EventSource, porque SSE solo permite servidor → cliente. No reemplaza el canal de recepción en tiempo real y no introduce polling.

Request:
```json
{
  "type": "typing.start",
  "chatId": "chat_123",
  "clientMutationId": "uuid",
  "clientTime": "2026-07-02T15:20:00-05:00"
}
```

Requisitos:

- Reconexión con backoff en cliente para WebSocket y SSE.
- Confirmación por `ackId` para eventos críticos cuando el transporte sea bidireccional.
- Reentrega segura por `lastEventId` cuando se reconecta.
- Sin polling para mensajes nuevos.
- Si el transporte es SSE, los eventos cliente → servidor deben publicarse por `POST /api/v1/streme/eventos?s={siteId}` con `clientMutationId`.

## 9. API de presencia y escritura

### POST `/api/v1/senales-efimeras`
Registra señales temporales de escritura usando `signalType:"typing"`, `active`, `conversationId`, `userId/userEmail`, `expiresAt` y `clientMutationId`. ChatER la usa solo para señales efímeras de compositor y conserva `STREMEx` como transporte de avisos en tiempo real.

### POST `/api/v1/presencia-usuario?s={siteId}`
Registra el estado de presencia del usuario autenticado mediante `PRESENCIAusuarioX`, que es el bloque canónico de memoriaBACKEND para online/offline/ausente/ocupado. ChatER envía heartbeat `online` al abrir WebSocket/SSE y un aviso `offline` de mejor esfuerzo al cerrar la pestaña, sin crear rutas locales ni encolar presencia obsoleta.

Request mínimo:
```json
{
  "userId": "usr_123",
  "userEmail": "usuario@correo.com",
  "status": "online",
  "deviceId": "web-device-id",
  "heartbeatAt": "2026-07-03T13:50:00Z",
  "lastSeenAt": "2026-07-03T13:50:00Z",
  "expiresAt": "2026-07-03T13:50:45Z",
  "clientMutationId": "uuid"
}
```

`STREMEx` sigue transportando eventos `presence.changed` hacia otros clientes, pero no reemplaza la escritura de estado en `PRESENCIAusuarioX`.

## 10. API de adjuntos y media

El contrato vigente se apoya únicamente en las APIs publicadas dentro de `APIS de memoriaBACKEND`:

- Imágenes temporales convertibles por el navegador: `ImagenesCloudflareR2x` en `/api/v1/imagenes-r2x`.
- Audio, video, documentos, GIF/SVG y archivos no convertibles: `MEDIAfirmadaX` en `/api/v1/media-firmada`.
- Mensaje con adjunto ya confirmado: `MENSAJESx` en `POST /api/v1/mensajes` con `attachments`/`media`.

### GET `/api/v1/imagenes-r2x/config?s={siteId}&context={context}`

Devuelve la política real de R2x por contexto (`chat-message` o `status-media`). El cliente la consulta antes de convertir una imagen; si R2x aparece deshabilitado, no configurado, no responde como endpoint disponible o falla en la intención por ausencia del bloque, conserva el flujo genérico de `MEDIAfirmadaX` sin bloquear adjuntos ni estados visuales. Los errores de autenticación no hacen fallback: obligan a volver a Google/Gmail.

### POST `/api/v1/imagenes-r2x/intenciones?s={siteId}`

Crea una intención de subida para imagen WebP ya optimizada desde el frontend. Debe recibir `context`, `userId/userEmail`, `filename/fileName`, `mimeType:"image/webp"`, `sizeBytes`, `width`, `height`, `entityType`, `entityId`, `conversationId` cuando aplique y `clientMutationId`.

### POST `/api/v1/imagenes-r2x/{imageId}/confirmar?s={siteId}`

Confirma que el objeto existe en R2, pertenece al usuario/contexto y cumple política de formato y tamaño. ChatER no registra el mensaje o estado como sincronizado hasta que esta confirmación sea aceptada.

### POST `/api/v1/imagenes-r2x/{imageId}/url-descarga?s={siteId}`

Devuelve URL temporal de lectura cuando la confirmación no incluye una URL consumible por la interfaz.

### POST `/api/v1/media-firmada?s={siteId}`

Reserva `mediaId` y entrega `uploadUrl`/`signedUrl` para archivos genéricos. El cliente sube el binario directamente a esa URL firmada y no guarda binarios en `localStorage`.

Request mínimo:
```json
{
  "entityType": "mensaje",
  "entityId": "client-mutation-id",
  "filename": "documento.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 245000,
  "clientMutationId": "uuid"
}
```

### PATCH `/api/v1/media-firmada/{mediaId}?s={siteId}`

Confirma la subida genérica con estado `uploaded`, metadata de archivo y entidad destino. Si la confirmación falla, ChatER no encola un mensaje que apunte a media no finalizada.

### GET `/api/v1/media-firmada/{mediaId}/leer?s={siteId}`

Entrega URL segura de lectura si el backend no la devolvió durante la confirmación.

### POST `/api/v1/mensajes?s={siteId}` con adjunto confirmado

Crea el mensaje de adjunto con `conversationId`, `senderUserId/senderUserEmail`, `attachments`, `media`, `clientTime` y `clientMutationId`. Si esta escritura falla después de confirmar la media, solo se encola la creación del mensaje con el `mediaId`; nunca se encola el binario del navegador.

Regla del proyecto estático: si una imagen esperada no existe en `assets`, la interfaz debe mostrar un placeholder geométrico sin romperse.

## 11. API de estados 24h

Los estados, historias o publicaciones fugaces se sincronizan con `PUBLICACIONESefimerasX`; las visualizaciones se registran con `VISTAScontenidoX`. No se usa ningún contrato heredado de estados cuando `memoriaBACKEND` está configurado.

### GET `/api/v1/publicaciones-efimeras?s={siteId}`

Lista estados visibles del usuario y contactos. El frontend los hidrata al iniciar sesión y conserva los estados locales que aún no existan en el backend.

Para que el botón **Responder por chat** funcione en un static site sin consultar rutas adicionales, cada estado remoto debe incluir al menos uno de estos vínculos de respuesta: `chatId`/`conversationId` cuando ya existe conversación, o `contactEmail`/`owner.email` cuando el cliente debe abrir o crear una conversación por correo.

Response mínimo recomendado:
```json
{
  "requestId": "uuid",
  "publicaciones": [
    {
      "id": "state_123",
      "conversationId": "chat_123",
      "contactEmail": "contacto@correo.com",
      "displayName": "María Gómez",
      "text": "Disponible esta tarde",
      "media": {
        "id": "media_123",
        "url": "https://cdn.example.com/status/media_123.webp",
        "filename": "estado.webp",
        "mimeType": "image/webp",
        "sizeBytes": 120000,
        "kind": "image"
      },
      "expiresAtIso": "2026-07-03T20:20:00Z",
      "viewed": false
    }
  ]
}
```

Si `conversationId` no existe todavía pero sí existe `contactEmail`, ChatER puede crear una conversación local por correo, encolar `POST /api/v1/conversaciones` con `clientMutationId` y dejar listo el composer para responder el estado sin bloquear la interfaz.

`expiresAtIso` debe ser la fecha absoluta recomendada para caducidad real de 24 horas. `expiresAtLabel` solo es texto de apoyo; si el backend no envía fecha absoluta, el cliente puede inferirla desde `createdAt` durante 24 horas, pero no debe depender de una etiqueta fija para ocultar estados vencidos. El cliente conserva compatibilidad con el alias legado `expiresAtAt` para datos creados por iteraciones anteriores, pero memoriaBACKEND nuevo debe preferir `expiresAtIso`.

### POST `/api/v1/publicaciones-efimeras?s={siteId}`

Publica texto o media visible por 24 horas. Para imágenes temporales, ChatER prepara primero `ImagenesCloudflareR2x`; para otros archivos usa `MEDIAfirmadaX`. El payload conserva `authorUserId`, `authorUserEmail`, `visibility`, `expiresAt`, `status` y `clientMutationId`.

Request de texto:
```json
{
  "text": "Disponible esta tarde",
  "visibility": "contacts",
  "expiresAt": "2026-07-04T02:20:00Z",
  "status": "published",
  "clientMutationId": "uuid"
}
```

Request visual después de confirmar la media:
```json
{
  "text": "Nuevo estado visual",
  "mediaId": "media_123",
  "mediaUrl": "https://cdn.example.com/status/media_123.webp",
  "mediaName": "estado.webp",
  "mediaMimeType": "image/webp",
  "mediaSizeBytes": 120000,
  "mediaKind": "image",
  "visibility": "contacts",
  "expiresAt": "2026-07-04T02:20:00Z",
  "clientMutationId": "uuid"
}
```

Regla de cola: si el archivo ya fue confirmado y falla la creación del estado, el frontend puede encolar `POST /api/v1/publicaciones-efimeras` con `mediaId`. Si la subida del archivo falla antes de obtener o confirmar `mediaId`/`imageId`, la interfaz conserva el estado local visual, pero no encola binarios porque un static site no puede reintentar una subida perdida después de cerrar el navegador.

### POST `/api/v1/vistas-contenido?s={siteId}`

Registra visualización de estado con `entityType:"publicacion-efimera"`, `entityId`, `viewerUserId/viewerUserEmail`, `viewedAt`, `dedupeKey` y `clientMutationId`.

### PATCH `/api/v1/publicaciones-efimeras/{stateId}?s={siteId}`

Prepara o solicita la promoción de un estado propio usando el mismo bloque canónico de publicaciones efímeras. Este proceso reemplaza el endpoint heredado de promoción de estados porque `APIS de memoriaBACKEND` sí publica CRUD común sobre `PUBLICACIONESefimerasX` y el proyecto ya sincroniza la promoción como metadata/patch de la publicación.

Request:
```json
{
  "stateId": "state_123",
  "promotionRequested": true,
  "promotionStatus": "requested",
  "promotion": {
    "objective": "increase_status_views",
    "channel": "chater_status",
    "status": "requested"
  },
  "clientMutationId": "uuid"
}
```

## 12. API de llamadas

Las llamadas y programaciones se sincronizan con `SESIONEScomunicacionX` en `/api/v1/sesiones-comunicacion`. La señalización WebRTC puede viajar por `SIGNALINGtiempoRealX` o por eventos `STREMEx` según la disponibilidad del backend, pero el static site no crea rutas propias de llamadas.

### GET `/api/v1/sesiones-comunicacion?s={siteId}`

Historial de llamadas. El frontend lo hidrata al iniciar sesión para que la pestaña Llamadas represente datos reales cuando memoriaBACKEND esté disponible.

### POST `/api/v1/sesiones-comunicacion?s={siteId}`

Crea llamada de voz/video o una llamada programada. Para llamada inmediata usa `status:"started"`; para llamada futura usa `status:"scheduled"` y `scheduledAt`.

Request inmediato:
```json
{
  "conversationId": "chat_123",
  "communicationType": "voice",
  "participants": [{ "email": "usuario@correo.com", "role": "initiator" }],
  "status": "started",
  "direction": "outgoing",
  "startedAt": "2026-07-03T15:30:00.000Z",
  "channel": "chater-conversacion-chat_123",
  "clientMutationId": "uuid"
}
```

Request programado:
```json
{
  "conversationId": "chat_123",
  "communicationType": "video",
  "participants": [{ "email": "usuario@correo.com", "role": "initiator" }],
  "status": "scheduled",
  "direction": "outgoing",
  "scheduledAt": "2026-07-03T15:30:00.000Z",
  "channel": "chater-conversacion-chat_123",
  "clientMutationId": "uuid"
}
```

## 13. API de notificaciones

Las notificaciones son necesarias para que ChatER se comporte como appWEB instalada y no solo como página abierta. El static site debe poder solicitar permiso del navegador, registrar el dispositivo activo por correo electrónico y mantener una cola idempotente si `memoriaBACKEND` no responde. La suscripción push real usa `PUSH_PUBLIC_KEY` como clave pública VAPID opcional desde `js/config.js`; si la clave está vacía, ChatER consulta la API canónica `/api/v1/push/config?s={siteId}` para usar la clave pública publicada por `APInotificacionesPUSHx`.

### GET `/api/v1/push/config?s={siteId}`
Devuelve la configuración pública de `APInotificacionesPUSHx` para el dominio verificado, incluyendo `push.publicKey`/`vapidPublicKey` y los endpoints públicos de suscripción, envío y baja cuando están disponibles. ChatER lo consulta al activar notificaciones si `PUSH_PUBLIC_KEY` no fue definido en `js/config.js`; así el static site puede usar la clave VAPID publicada por `memoriaBACKEND` sin crear backend propio ni exponer secretos.

Response mínimo esperado:
```json
{
  "ok": 1,
  "push": {
    "available": true,
    "configured": true,
    "publicKey": "B...",
    "subscribeEndpoint": "https://memoriabackend.com/api/v1/push/suscripciones",
    "sendEndpoint": "https://memoriabackend.com/api/v1/push/enviar",
    "unsubscribeEndpoint": "https://memoriabackend.com/api/v1/push/suscripciones"
  }
}
```

### POST `/api/v1/push/suscripciones`
Registra navegador o PWA para notificaciones push mediante `APInotificacionesPUSHx`. Debe aceptar registros parciales cuando todavía no exista `pushSubscription`, para que el backend conozca el dispositivo, permiso y modo de instalación.

Request recomendado:
```json
{
  "deviceId": "browser-device-id",
  "clientId": "browser-device-id",
  "platform": "web-pwa",
  "appMode": "static-site-pwa",
  "permission": "granted",
  "displayMode": "standalone",
  "pushEnabled": true,
  "vapidPublicKey": "B...",
  "pushSubscription": {
    "endpoint": "https://push.example/subscription",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  },
  "userAgent": "Mozilla/5.0 ...",
  "locale": "es-CO",
  "clientMutationId": "uuid"
}
```

Response recomendado:
```json
{
  "requestId": "uuid",
  "device": {
    "id": "dev_123",
    "deviceId": "browser-device-id",
    "pushEnabled": true,
    "registeredAt": "2026-07-03T20:20:00Z"
  }
}
```

### DELETE `/api/v1/push/suscripciones?s={siteId}`
Revoca la suscripción del navegador o PWA usando el mismo bloque `APInotificacionesPUSHx` publicado en `APIS de memoriaBACKEND`. ChatER envía `deviceId/clientId`, `endpoint`, `pushSubscription`, usuario autenticado, `active:false`, motivo operativo y `clientMutationId`. Antes de llamar la API intenta `PushSubscription.unsubscribe()` en el navegador; si memoriaBACKEND no responde, guarda la baja como `unregisterDevice` en la cola local idempotente.

Request recomendado:
```json
{
  "deviceId": "browser-device-id",
  "clientId": "browser-device-id",
  "endpoint": "https://push.example/subscription",
  "pushSubscription": {
    "endpoint": "https://push.example/subscription",
    "keys": { "p256dh": "...", "auth": "..." }
  },
  "active": false,
  "reason": "user-disabled-notifications",
  "clientMutationId": "uuid"
}
```

### POST `/api/v1/push/enviar`
Prueba canal de notificaciones. El frontend lo llama desde Herramientas > Notificaciones; si falla, muestra una prueba local con la API `Notification` del navegador para no dejar el botón muerto.

Request mínimo:
```json
{
  "deviceId": "browser-device-id",
  "clientMutationId": "uuid"
}
```

Eventos que pueden producir notificación push cuando la PWA está en segundo plano:

- `message.created` o `streme.message.created` para mensajes entrantes.
- `call.incoming` o `streme.call.incoming` para llamadas de voz o video.
- `state.created` o `streme.state.created` cuando un contacto publica estado.
- `presence.changed` o `streme.presence.changed` para presencia de contactos.
- `sync.failed` cuando una acción local queda pendiente de memoriaBACKEND.

ChatER normaliza el prefijo canónico `streme.` antes de actualizar la interfaz, para aceptar tanto eventos de compatibilidad del proyecto como eventos reales publicados por `STREMEx`.

## 14. API de búsqueda

La búsqueda remota se sincroniza con `BUSQUEDAx`, publicado por `APIS de memoriaBACKEND` con endpoint público ejecutable `GET /api/v1/busqueda/buscar`. ChatER conserva el filtro local inmediato para listas ya cargadas, pero cuando `MEMORIA_BACKEND_URL` está configurado consulta memoriaBACKEND para encontrar mensajes, adjuntos o conversaciones que todavía no estén hidratados en el static site.

### GET `/api/v1/busqueda/buscar?s={siteId}&q={texto}&entityTypes=mensajes,archivos,conversaciones`
Búsqueda federada por adaptadores de memoriaBACKEND. Para búsqueda dentro de una conversación, ChatER envía además `conversationId`, `userId`, `userEmail` y `limit`, y normaliza respuestas con `results`, `resultados`, `busqueda`, `items` o `records`. La ruta heredada `/search` no se usa como contrato ejecutable cuando existe memoriaBACKEND.

## 15. API de herramientas y acciones comerciales

La sincronización ejecutable de las acciones visibles de la pestaña **Herramientas** debe apoyarse en las APIs publicadas dentro de `APIS de memoriaBACKEND`. El catálogo adjunto no expone una ruta pública canónica `/tools/{toolId}/actions`; sí expone `LANDINGTOOLSx` para registrar eventos comerciales de static sites autorizados. Por eso ChatER usa `POST /api/v1/landing-tools/evento?s={siteId}` como contrato de sincronización de acciones comerciales, conservando el estado local como fuente optimista de la interfaz.

### POST `/api/v1/landing-tools/evento?s={siteId}`

Endpoint idempotente usado por la cola local de ChatER para registrar acciones comerciales visibles sin crear un backend local ni tocar la carpeta `APIS de memoriaBACKEND`. La acción se normaliza como evento de herramienta y conserva el payload original dentro de `metadata.payload` para auditoría o procesamiento posterior en `memoriaBACKEND`.

Request base enviado por ChatER:
```json
{
  "s": "a1",
  "type": "tool_action",
  "eventType": "tool_action",
  "action": "upsertCatalogItem",
  "ctaId": "catalog",
  "toolId": "catalog",
  "path": "/",
  "value": 0,
  "userId": "usuario@correo.com",
  "userEmail": "usuario@correo.com",
  "clientTime": "2026-07-03T10:30:00-05:00",
  "metadata": {
    "source": "chater-static-site",
    "toolId": "catalog",
    "action": "upsertCatalogItem",
    "payload": {
      "item": {
        "name": "Servicio personalizado",
        "price": "Desde $120.000",
        "description": "Instalación a domicilio"
      }
    }
  },
  "clientMutationId": "uuid-estable"
}
```

Headers obligatorios de mutación:

- `Content-Type: application/json`
- `Accept: application/json`
- `X-MB-Site: {siteId}`
- `X-Hashinmy-Action: webapp`
- `X-MB-Idempotency-Key: {clientMutationId}`

Acciones que ChatER puede registrar por esta ruta:

- `business-verified`: solicitud de verificación comercial.
- `catalog`: apertura de catálogo y creación local de productos o servicios.
- `ads-create`: creación local de borradores de campaña.
- `ads-manage`: solicitud de sincronización de campañas.
- `broadcasts`: preparación de difusiones comerciales.
- `orders`: registro local de pedidos asociados a correo.

Reglas de preservación:

- ChatER no reemplaza esta ruta por `/tools/{toolId}/actions`, porque esa ruta no aparece como API oficial en el catálogo adjunto de `memoriaBACKEND`.
- El estado comercial local sigue existiendo para no bloquear la interfaz cuando `MEMORIA_BACKEND_URL` no está configurado o la API falla.
- La cola conserva `businessToolAction` y reintenta con el mismo `clientMutationId`, pero la llamada remota real queda alineada con `LANDINGTOOLSx`.
- Procesos que requieran decisiones humanas, pagos, difusión real o publicación final deben resolverse en `memoriaBACKEND`; el static site solo registra la intención/evento.

## 16. API de seguridad, bloqueo, reportes y privacidad

ChatER debe resolver estos procesos con los bloques canónicos publicados dentro de `APIS de memoriaBACKEND`; no debe volver a rutas heredadas cuando `MEMORIA_BACKEND_URL` está configurado.

### POST `/api/v1/bloqueos-usuario?s={siteId}`
Registra bloqueo o desbloqueo de un contacto mediante `BLOQUEOSusuarioX`. El static site envía usuario autenticado, contacto objetivo, conversación asociada, `status` (`active` o `revoked`), motivo operativo, `clientMutationId` e idempotencia. Si la API falla temporalmente, la operación queda en cola local sin perder el estado visible.

### POST `/api/v1/reportes-moderacion?s={siteId}`
Registra reportes de usuario, conversación o mensaje mediante `REPORTESmoderacionX`. ChatER envía el tipo de entidad reportada, identificadores locales/remotos disponibles, motivo, descripción, evidencia contextual mínima, usuario autenticado, `clientMutationId` e idempotencia. La interfaz no decide sanciones ni bloqueos definitivos; solo sincroniza la intención de moderación para que memoriaBACKEND y soporte humano la procesen.

### POST `/api/v1/privacidad-usuario?s={siteId}`
Actualiza preferencias de visibilidad mediante `PRIVACIDADusuarioX`: perfil, estado, última actividad, campos públicos y campos privados. La lectura puede venir embebida en autenticación/perfil o en futuras respuestas del bloque; mientras tanto ChatER conserva el estado local y reintenta la escritura en la cola si memoriaBACKEND no está disponible.

Rutas heredadas de usuarios, reportes o privacidad no deben usarse como destino principal cuando existe memoriaBACKEND; esos procesos quedan cubiertos por `BLOQUEOSusuarioX`, `REPORTESmoderacionX` y `PRIVACIDADusuarioX`.

## 17. API de auditoría, versiones y telemetría segura

ChatER no debe usar rutas heredadas de telemetría del frontend cuando el catálogo adjunto de memoriaBACKEND publica contratos equivalentes. Para capacidades y versiones usa `VERSIONESapi`; para validar bloques y montajes usa `BLOQUESsincronizadosX`; para errores técnicos generados en el navegador usa `EVENTOSx` como evento estructurado seguro, porque el catálogo adjunto no expone una mutación pública directa de `LOGSx` para static sites.

### GET `/api/v1/versiones/manifest?s={siteId}`
Devuelve capacidades publicadas por `VERSIONESapi`. ChatER lo consulta desde el modal **Estado de memoriaBACKEND** para confirmar que las rutas críticas siguen montadas.

### GET `/api/v1/bloques-sincronizados/validacion?s={siteId}` y GET `/api/v1/bloques-sincronizados/montajes?s={siteId}`
Validan sincronización entre bloques, contratos, versiones y montajes runtime sin leer ni modificar la carpeta `APIS de memoriaBACKEND`.

### POST `/api/v1/eventos/registrar?s={siteId}`
Registra telemetría técnica del static site como evento `client_error` o `unhandled_rejection`. ChatER sanea correos, tokens, URLs con query sensible y stack antes de enviar; no guarda estos errores en cola local para evitar ruido persistente si memoriaBACKEND está caído.

Request mínimo:
```json
{
  "type": "client_error",
  "name": "Error técnico del navegador",
  "category": "frontend-error",
  "path": "/index.html",
  "visitorId": "browser-device-id",
  "sessionId": "browser-device-id",
  "data": {
    "level": "error",
    "message": "mensaje saneado",
    "source": "/js/app.js",
    "line": 120,
    "column": 10,
    "stack": "stack saneado",
    "browser": "user-agent saneado",
    "userId": "usr_123",
    "hasAuthenticatedSession": true,
    "occurredAt": "ISO-8601"
  },
  "clientMutationId": "uuid"
}
```

Rutas heredadas de salud, versión y errores del cliente no deben usarse como destino principal cuando existe memoriaBACKEND.

## 17.1 Cola local de sincronización del static site

Como ChatER se despliega como static site, el navegador debe conservar una cola local mínima para no perder acciones cuando `MEMORIA_BACKEND_URL` está configurado pero memoriaBACKEND está temporalmente caído o sin conexión. Esta cola no reemplaza al backend: solo reintenta escrituras idempotentes cuando la conexión vuelve.

Operaciones que deben quedar en cola con `clientMutationId` estable:

- Crear conversación por correo electrónico: `POST /api/v1/conversaciones`.
- Enviar mensaje de texto: `POST /api/v1/mensajes`.
- Crear mensaje de adjunto ya subido: `POST /api/v1/mensajes`, únicamente cuando existe `mediaId`, `imageId` o URL pública/proxy persistente devuelta por memoriaBACKEND.
- Publicar estado 24h: `POST /api/v1/publicaciones-efimeras`.
- Registrar vista de estado: `POST /api/v1/vistas-contenido`.
- Promocionar estado propio: `PATCH /api/v1/publicaciones-efimeras/{stateId}`.
- Crear llamada de voz, video o programada: `POST /api/v1/sesiones-comunicacion`.
- Registrar dispositivo PWA para notificaciones: `POST /api/v1/push/suscripciones`; si ya existe una operación pendiente del mismo dispositivo, debe reemplazarse por la versión más reciente para no conservar una suscripción push obsoleta.
- Dar de baja el dispositivo PWA de notificaciones: `DELETE /api/v1/push/suscripciones`; se conserva `endpoint`, `pushSubscription`, `deviceId` y `clientMutationId` para que memoriaBACKEND elimine la suscripción aunque el navegador ya la haya cancelado localmente.
- Sincronizar herramientas comerciales visibles: `POST /api/v1/landing-tools/evento?s={siteId}` con `type:"tool_action"`, `toolId`, `action`, `clientMutationId`, `userEmail` y `clientTime`.

Reglas de robustez:

- No se debe hacer polling para mensajes nuevos; la cola solo reintenta escrituras pendientes generadas por el propio cliente.
- Cada operación en cola debe conservar `clientMutationId` para evitar duplicados si se reintenta.
- Si una conversación creada localmente recibe un `chatId` real, las operaciones pendientes que apuntaban al ID local deben actualizarse antes de continuar.
- Los adjuntos seleccionados por el usuario no pueden reintentarse automáticamente desde `localStorage` porque el navegador no conserva el binario del archivo tras cerrar la sesión; debe solicitarse una nueva selección si falla la preparación de subida o la subida binaria. Si la subida ya terminó y existe `mediaId`, sí puede encolarse solo la creación del mensaje media.
- La pantalla de estado de memoriaBACKEND debe mostrar si existen operaciones pendientes y permitir un reintento manual.

## 17.2 Reconciliación de IDs reales de memoriaBACKEND

El punto más sensible del static site es que puede crear conversaciones, mensajes, estados y llamadas de forma optimista antes de recibir la identidad real del backend. Para evitar que una acción posterior use un ID local temporal, toda respuesta exitosa de escritura debe devolver el identificador persistente de la entidad creada o actualizada.

Respuestas aceptadas por el cliente:

```json
{ "chat": { "id": "chat_123" } }
{ "conversation": { "id": "chat_123" } }
{ "message": { "id": "msg_123", "clientMutationId": "uuid" } }
{ "state": { "id": "state_123" } }
{ "call": { "id": "call_123" } }
{ "data": { "id": "entidad_123" } }
```

Reglas obligatorias:

- Si `POST /api/v1/conversaciones` devuelve un ID remoto, el cliente debe reemplazar el `chat-...` local y actualizar llamadas u operaciones pendientes que apuntaban al ID temporal.
- Si `POST /api/v1/mensajes` devuelve un ID remoto, el mensaje optimista debe conservar su `clientMutationId` y sustituir su ID local por el ID real.
- Si `POST /api/v1/publicaciones-efimeras` devuelve un ID remoto, cualquier vista pendiente de ese estado debe apuntar al ID remoto antes de reintentarse.
- Si `POST /api/v1/sesiones-comunicacion` devuelve un ID remoto, el historial local debe quedar asociado al ID real para futuras acciones de llamada.
- Las respuestas `204` o no JSON son válidas solo para operaciones que no necesiten reconciliar identidad; para creaciones nuevas debe preferirse una respuesta JSON con ID.

## 17.3 Aislamiento local por correo electrónico

Como ChatER entra por correo electrónico y no por número telefónico, el static site no puede usar un único `localStorage` global para conversaciones, estados, llamadas, cursor `lastEventId` de `streme` ni cola de sincronización. Cada correo autenticado debe tener un espacio local separado para evitar que una persona vea datos o reintente operaciones pendientes de otra cuenta usada en el mismo navegador.

Reglas obligatorias del cliente:

- La caché de conversaciones, estados y llamadas debe guardarse en una clave derivada del correo activo.
- La cola local de sincronización debe quedar aislada por correo para que `POST /api/v1/conversaciones`, mensajes, estados, vistas y llamadas pendientes no se reproduzcan bajo otra sesión.
- El cursor `lastEventId` de `streme` debe ser por cuenta, porque reutilizar el cursor de otra cuenta puede saltar eventos o pedir reentregas incorrectas.
- Al cerrar sesión se eliminan tokens y cursor de tiempo real de la cuenta activa, pero no se borran automáticamente las conversaciones locales de esa cuenta.
- Al iniciar sesión con otro correo se recargan punteros activos, conversación abierta y estado seleccionado desde el almacenamiento de ese correo.
- La migración desde claves locales antiguas sin correo solo puede adoptarse para la sesión que ya estaba activa al cargar la página; un login nuevo no debe heredar datos globales antiguos.

## 17.4 Guardas de sesión para operaciones asíncronas

El aislamiento por correo no es suficiente si quedan peticiones antiguas en vuelo. Cada lectura inicial, hidratación de historial, reintento de outbox, subida de adjuntos y conexión `streme` debe capturar la identidad de sesión vigente al iniciar y validar que esa identidad siga activa antes de mutar `appState`, `localStorage`, la cola pendiente o la interfaz.

Reglas obligatorias del cliente:

- Cada cambio de sesión debe avanzar un identificador interno de ejecución para invalidar respuestas tardías de la sesión anterior.
- `GET /api/v1/perfil-usuario`, `/api/v1/conversaciones`, `/api/v1/publicaciones-efimeras`, `/api/v1/sesiones-comunicacion` y `GET /api/v1/mensajes` solo pueden fusionar datos si el correo activo y el identificador de ejecución siguen siendo los mismos.
- El reintento de outbox debe leer y escribir la cola del correo capturado al iniciar el reintento, no la cola del correo que pueda estar activo cuando la promesa termine.
- Los eventos `streme` deben descartarse si pertenecen a una conexión abierta bajo una sesión anterior.
- Las operaciones optimistas de mensajes, adjuntos, estados y llamadas pueden seguir mostrando respuesta inmediata, pero sus callbacks remotos no deben renderizar ni reconciliar IDs si el usuario cerró sesión o cambió de correo durante la petición.
- Al limpiar una sesión por cierre, token vencido, rechazo `401/403` o migración desde demo hacia backend real, el cliente debe cerrar WebSocket/SSE `streme`, cancelar reconexiones pendientes y reiniciar el estado efímero de escritura; de lo contrario, una conexión antigua puede bloquear la conexión de la nueva sesión.


## 17.5 Guardas de autenticación previa a sesión

Antes de que exista una sesión activa también puede haber carreras asíncronas: doble clic en entrada, carga tardía de `/login.js`, respuesta tardía de `GET /auth/check`, retorno tardío de `POST /auth/firebase/session` o un segundo intento de acceso con otra cuenta Gmail. El cliente debe tratar cada intento de acceso como una operación identificable e invalidable.

Reglas obligatorias del cliente:

- Cada envío del formulario de acceso debe crear un identificador de intento de autenticación.
- Una respuesta tardía de `/auth/check` o `/auth/firebase/session` solo puede completar sesión si su intento sigue vigente.
- Un evento tardío de `memoriaBACKEND:login` solo puede completar sesión si pertenece al intento Google/Gmail vigente y supera validación de proveedor/correo.
- Al cerrar el modal Google/Gmail, cerrar sesión o completar sesión correctamente, los intentos de autenticación anteriores deben invalidarse.
- Mientras una solicitud de acceso o verificación está en curso, el botón correspondiente debe quedar deshabilitado para evitar duplicados accidentales, pero debe restaurarse si el intento continúa activo y falla.

## 17.6 Ciclo de vida de escritura por conversación

Los eventos de escritura (`typing.start` y `typing.stop`) son efímeros, pero pueden generar una experiencia incorrecta si no quedan ligados a la conversación exacta donde nacieron. El composer del static site puede permanecer visible mientras el usuario cambia rápido entre chats, estados o llamadas; por eso el cliente debe recordar el `chatId` que inició la escritura y cerrar ese estado antes de abrir otro contexto.

Reglas obligatorias del cliente:

- `typing.start` debe emitirse solo para la conversación activa en el momento exacto de escribir.
- El cliente debe guardar el `chatId` asociado al estado local de escritura, no depender únicamente del chat activo actual.
- Al cambiar de conversación o cambiar a Estados/Llamadas, debe emitirse `typing.stop` para el `chatId` anterior antes de renderizar el nuevo contexto.
- Si el usuario escribe en una conversación nueva mientras queda un temporizador anterior pendiente, primero debe cerrarse la escritura anterior y luego emitirse un nuevo `typing.start` para la conversación vigente.
- El temporizador de escritura debe ejecutar `typing.stop` usando el `chatId` capturado, aunque el usuario haya cambiado de chat antes de que termine el intervalo.
- Estos eventos no deben encolarse en `localStorage`, porque son señales efímeras y podrían llegar obsoletas.

## 17.7 Ciclo de vida de paneles transitorios de interfaz

Los paneles flotantes de una interfaz tipo WhatsApp, como emojis, herramientas, perfil, creación de chats o acceso Google/Gmail, no pueden quedar vivos cuando el contexto funcional deja de permitirlos. En un static site esto es especialmente importante porque no hay navegación de página completa que reinicie el DOM; todo depende del estado del cliente.

Reglas obligatorias del cliente:

- El panel de emojis solo puede abrirse si existe una conversación activa, la sección actual es `Chats` y el composer está habilitado.
- Al cambiar de chat, cambiar a `Estados` o `Llamadas`, volver a la lista móvil, iniciar adjuntos, abrir herramientas, abrir perfil, abrir nuevo chat, enviar un mensaje o desactivar el composer, el panel de emojis debe cerrarse.
- Al cerrar o invalidar una sesión se deben cerrar los paneles transitorios, además de cerrar `streme`, cancelar reconexiones y reiniciar escritura.
- Los botones deshabilitados del composer no deben poder ejecutar acciones por llamadas programáticas o eventos tardíos.
- El cierre de paneles visuales no debe borrar conversaciones, estados, llamadas ni colas pendientes; solo limpia estado efímero de interfaz.


## 17.8 Contrato de assets opcionales en static site

El punto débil detectado en esta iteración fue la inconsistencia entre referencias visuales del manifiesto/PWA y los archivos realmente adjuntos. Como las reglas del proyecto no permiten crear imágenes finales dentro del ciclo, ChatER debe cumplir este contrato hasta que los PNG reales se agreguen a `assets`:

- Todo asset visual referenciado por HTML, manifiesto o JavaScript debe tener un `.txt` con el mismo nombre base del PNG esperado.
- El manifiesto solo debe declarar rutas PNG cubiertas por prompt `.txt` y por fallback operativo del service worker cuando el binario aún no exista.
- `service-worker.js` debe interceptar iconos PWA PNG opcionales bajo `assets` y responder con una figura geométrica `image/png` si el archivo real aún no existe; los avatares conservan fallback visual CSS con iniciales cuando su PNG falta.
- Los iconos PWA (`chater-icon-192.png`, `chater-icon-512.png`, `chater-maskable-512.png`, `chater-icon-fallback.png`, `chater-maskable-fallback.png`) quedan registrados como rutas opcionales de caché para que la app instalada no rompa al actualizar.
- Cuando Nova o el equipo de diseño agregue los PNG reales en `assets`, el mismo nombre de archivo reemplaza automáticamente el placeholder sin cambiar código.
- No se deben referenciar nuevas imágenes desde la interfaz si antes no existe su prompt `.txt` correspondiente.

## 18. Prioridad de implementación

1. `/login.js`, `/auth/check`, `/auth/firebase/session`, `/auth/refresh`, `/auth/logout` y `/api/v1/perfil-usuario`, con guardas de intento para respuestas tardías y cierre de acceso Google/Gmail.
2. `/api/v1/conversaciones`, `/api/v1/mensajes`.
3. Reconciliación de IDs reales devueltos por memoriaBACKEND para conversaciones, mensajes, estados y llamadas creadas de forma optimista.
4. Aislamiento local por correo electrónico para caché, outbox y cursor `lastEventId` de `streme`.
5. Guardas de sesión para impedir que respuestas tardías de otra cuenta muten el estado activo.
6. Cola local de sincronización con reintento idempotente para escrituras del static site.
7. `streme` WebSocket/SSE para mensajes, edición, eliminación, escritura, presencia, llamadas y estados, con `POST /api/v1/streme/eventos` cuando el transporte sea SSE.
8. Ciclo de vida de escritura por conversación: `typing.start` y `typing.stop` deben quedar ligados al `chatId` donde nacieron y cerrarse al cambiar de contexto.
9. Ciclo de vida de paneles transitorios: emojis, modales y acciones del composer no deben quedar activos fuera de su contexto funcional.
10. `/api/v1/imagenes-r2x`, `/api/v1/media-firmada` y mensajes con adjuntos en `/api/v1/mensajes`.
11. `/api/v1/publicaciones-efimeras` para estados 24h.
12. `/api/v1/sesiones-comunicacion` y señalización de llamadas.
13. Notificaciones y búsqueda remota con `GET /api/v1/busqueda/buscar`. Privacidad, reportes y auditoría se mantienen locales o documentados hasta confirmar un proceso equivalente específico dentro de `APIS de memoriaBACKEND`.

## 19. Mapa funcional de botones de la interfaz

Para que el static site no tenga botones decorativos, cada acción visible debe mapearse a una lógica local y a una API de `memoriaBACKEND` cuando esté disponible.

| Botón o acción visible | Lógica local obligatoria | API futura relacionada |
|---|---|---|
| Entrar a ChatER | Exige Google/Gmail mediante `AUTENTICACIONx`, carga `login.js`, valida cookie con `/auth/check` y solo acepta correos Gmail/Google verificados cuando la configuración lo requiere | `GET /login.js`, `GET /auth/check`, `POST /auth/firebase/session`, `POST /auth/logout` |
| Perfil | Muestra correo activo, tipo de acceso y modo visual automático | `GET /api/v1/perfil-usuario`, `PATCH /api/v1/perfil-usuario/{id}` cuando memoriaBACKEND lo publique para edición |
| Nuevo chat `+` | Crea o abre conversación por correo electrónico, evita duplicados locales y restaura un chat archivado si el correo ya existía | `POST /api/v1/conversaciones`, `POST /api/v1/relaciones-usuario` si se habilita relación explícita, `PATCH /api/v1/conversaciones/{conversationId}` |
| Archivados | Muestra acceso real en la lista principal, abre chats archivados, permite restaurarlos y conserva mensajes sin depender de números telefónicos | `PATCH /api/v1/conversaciones/{conversationId}` con `archived` |
| Fijar chat | Permite fijar o desfijar la conversación activa, ordenar fijados arriba y reflejar el pin visible como en la referencia móvil | `PATCH /api/v1/conversaciones/{conversationId}` con `pinned` |
| Herramientas `⋮` | Abre acciones reales: modo automático, crear estado, estado de APIs, notificaciones, instalación, actualización, reintento de sincronización pendiente y cierre de sesión | `GET /api/v1/versiones/manifest`, `POST /api/v1/landing-tools/evento`, `POST /auth/logout` |
| Cuenta verificada / Catálogo / Anuncios / Difusiones / Pedidos | Cada fila comercial abre modal, modifica estado local, registra actividad y deja una operación idempotente pendiente cuando memoriaBACKEND está configurado | `POST /api/v1/landing-tools/evento` con `ctaId/toolId` según la herramienta |
| Notificaciones | Solicita permiso del navegador, registra el dispositivo PWA con cola idempotente, muestra estado local y permite prueba local o backend | `POST /api/v1/push/suscripciones`, `POST /api/v1/push/enviar` |
| Chats / Estados / Llamadas | Cambia sección, renderiza listas, desactiva composer cuando no aplica e hidrata datos reales desde memoriaBACKEND al iniciar sesión | `GET /api/v1/conversaciones`, `GET /api/v1/publicaciones-efimeras`, `GET /api/v1/sesiones-comunicacion` |
| Buscar | Filtra localmente conversaciones, estados o llamadas, y en el modal de conversación consulta memoriaBACKEND para mensajes no hidratados | `GET /api/v1/busqueda/buscar` con `q`, `buscar`, `entityTypes`, `conversationId`, `userId` y `userEmail` |
| Enviar mensaje | Inserta mensaje optimista, persiste localmente y, si falla memoriaBACKEND, lo deja en cola idempotente de reintento | `POST /api/v1/mensajes` |
| Emoji | Inserta emoji solo cuando hay chat activo y composer habilitado; el panel se cierra al cambiar de sección, chat, volver en móvil, abrir adjuntos, enviar mensaje o cerrar sesión | `POST /api/v1/senales-efimeras` y eventos `STREMEx` |
| Adjuntar | Abre selector de archivo, crea mensaje optimista de adjunto, solicita URL firmada, sube el binario y registra el mensaje media; si la subida binaria falla, exige nueva selección, y si solo falla el registro del mensaje con `mediaId`, lo deja en cola idempotente | `GET/POST /api/v1/imagenes-r2x`, `POST/PATCH/GET /api/v1/media-firmada`, subida firmada y `POST /api/v1/mensajes` |
| Llamada de voz / video | Registra evento local, agrega entrada al historial e inicia API de llamada | `POST /api/v1/sesiones-comunicacion`, eventos `call.*` por `STREMEx` |
| Llamar / Programar / Teclado en Llamadas | Ofrece accesos rápidos, agenda llamadas futuras y crea o reutiliza conversaciones por correo desde el teclado | `POST /api/v1/sesiones-comunicacion`, `POST /api/v1/conversaciones` |
| Estado 24h | Crea estado local por texto, marca vista, permite responder por chat y preparar promoción | `POST /api/v1/publicaciones-efimeras`, `POST /api/v1/vistas-contenido`, `PATCH /api/v1/publicaciones-efimeras/{stateId}` |
| Historial de llamadas | Abre detalle, permite volver a llamar, programar otra llamada o abrir el chat relacionado | `GET/POST /api/v1/sesiones-comunicacion` |
| Volver en móvil | Cierra el panel de conversación y vuelve a la lista | No requiere backend |

## 20. Punto débil detectado y criterio de cierre funcional

El punto débil más sensible detectado previamente era que, aunque el almacenamiento ya estaba aislado por correo, las operaciones asíncronas podían terminar tarde y mutar la sesión equivocada: una sincronización inicial, hidratación de historial, reintento de outbox, subida de adjunto o evento `streme` iniciado por un correo anterior podía resolver después de cerrar sesión o entrar con otro correo. En un static site conectado a APIs externas, ese desfase puede mezclar conversaciones, reconciliar IDs en la cuenta incorrecta, renderizar estados de otra sesión o publicar eventos de tiempo real bajo una identidad no vigente. Se corrigió incorporando guardas de sesión por ejecución: cada cambio de correo invalida callbacks anteriores; las lecturas iniciales y de historial verifican sesión antes de fusionar datos; el outbox reintenta contra la cola del correo capturado; `streme` descarta mensajes de conexiones antiguas; y los callbacks de mensajes, adjuntos, estados y llamadas no renderizan ni encolan si la sesión cambió durante la petición.

En esta iteración se detectó un punto débil en el ciclo de vida de escritura: `typing.start` y `typing.stop` usaban el estado global de escritura sin conservar de forma explícita el `chatId` donde nació la señal. Si el usuario cambiaba rápido de conversación o pasaba a Estados/Llamadas antes de terminar el temporizador, el siguiente chat podía no emitir `typing.start` o el cierre de escritura podía quedar desalineado. Se corrigió asociando el estado de escritura al `conversationId`, cerrando la señal anterior al cambiar de chat o sección, y haciendo que el temporizador emita `typing.stop` contra el `chatId` capturado.

En esta revisión posterior se detectó otro punto débil de mayor impacto en despliegue real: cuando `MEMORIA_BACKEND_URL` estaba configurado y el endpoint de acceso fallaba, el cliente entraba igualmente en modo local. Ese comportamiento era aceptable solo para demo sin backend, pero en producción podía simular una sesión válida aunque memoriaBACKEND no hubiese autenticado el correo. Se corrigió para que el modo local solo se active cuando no existe URL de backend; si memoriaBACKEND está configurado y falla la validación, el login queda bloqueado con un mensaje de error recuperable. Se preserva la corrección previa de aislamiento local por correo, guardas de sesión y autenticación, hidratación bajo demanda del historial, deduplicación por identidad, `streme` WebSocket/SSE con `lastEventId`, publicación por `POST /api/v1/streme/eventos` cuando aplica, flujo real de adjuntos con `MEDIAfirmadaX` o `ImagenesCloudflareR2x` según el tipo de archivo, cola persistente para escrituras fallidas y ciclo de vida de escritura por conversación.

En esta iteración se detectó un punto débil visual-funcional relacionado con la regla de imágenes opcionales en `assets`: los avatares se cargaban de forma asíncrona y, si el usuario cambiaba rápido de conversación, sección o detalle de llamada mientras el PNG anterior terminaba de cargar, el callback tardío podía insertar una imagen ya obsoleta en el contenedor reutilizado. También estados y llamadas no normalizaban `avatarImage`, aunque las imágenes opcionales ya estaban documentadas para conversaciones. Se corrigió con un token de render por contenedor antes de aceptar `onload`/`onerror`, se extendió `avatarImage` a estados y llamadas, y las listas de estados, llamadas y detalle de llamada usan el mismo mecanismo de fallback geométrico con iniciales.

En esta iteración se detectó un punto débil de validación de sesión en producción: una sesión local guardada durante el modo demo podía sobrevivir cuando luego se configuraba `MEMORIA_BACKEND_URL`, permitiendo abrir la interfaz sin que memoriaBACKEND hubiera devuelto tokens válidos. También se endureció el caso de sesiones vencidas rechazadas por `/auth/check` o por APIs protegidas con `401` o `403`. Se corrigió para que, cuando exista backend configurado, ChatER exija credenciales reales antes de renderizar el chat, limpie la sesión local no verificada y solicite reingreso por correo. Además se robusteció la detección de imágenes opcionales de `assets` aceptando rutas seguras como `avatar.png`, `/assets/avatar.png` o `assets/avatar.png`, normalizando conversaciones heredadas y mostrando la imagen opcional dentro de la vista principal de estados si existe.

En esta revisión se detectó un punto débil derivado del cierre forzado de sesión: `clearSession()` invalidaba tokens, colas y guardas internas, pero no cerraba necesariamente la conexión `streme` ni limpiaba el estado efímero de escritura cuando la sesión se limpiaba por token vencido, rechazo `401/403` o transición desde demo local hacia backend configurado. Aunque los eventos tardíos ya se descartaban por guarda de sesión, el socket o EventSource antiguo podía permanecer vivo y hacer que el siguiente login no conectara tiempo real porque `connectStremeRealtime()` encontraba una conexión previa. Se corrigió cerrando siempre WebSocket/SSE, cancelando reconexiones y reiniciando `typingState` al limpiar la sesión, sin borrar las conversaciones locales aisladas por correo.

En esta iteración se detectó un punto débil de interfaz transitoria: el panel de emojis dependía solo de su propio botón y podía permanecer visible después de cambiar a Estados, Llamadas, otro chat, volver a la lista móvil, abrir adjuntos o cerrar una sesión. Esto no rompía la sintaxis, pero dejaba una acción del composer activa fuera de su contexto real, contradiciendo la regla de que todos los botones tengan lógica relacionada y observable. Se corrigió centralizando el cierre de paneles transitorios, impidiendo abrir emojis cuando el composer está deshabilitado, cerrando el panel al cambiar de contexto y limpiando modales/paneles al invalidar la sesión sin borrar datos persistentes ni colas pendientes.

En esta iteración se detectó un punto débil en la sección Estados: el botón **Responder por chat** dependía casi exclusivamente de coincidencias visuales por nombre o avatar. En producción, un estado remoto puede venir de memoriaBACKEND con `chatId`, `conversationId`, `contactEmail` u objeto `owner`, y dos contactos pueden compartir nombre o iniciales. Se corrigió normalizando el vínculo del estado hacia conversación/correo, conservando esos campos en estado local, buscando primero por `chatId` o correo y creando una conversación local encolada por `POST /api/v1/conversaciones` cuando solo existe el correo. Así el botón de respuesta mantiene lógica observable sin depender de datos semilla ni de coincidencias frágiles de interfaz.

Para evitar regresiones, ChatER debe cumplir simultáneamente estas condiciones antes de considerarse listo:

- El acceso se hace por correo electrónico; nunca se solicita número telefónico.
- El modo demo local solo puede iniciar sesión cuando `MEMORIA_BACKEND_URL` no está configurado; si memoriaBACKEND existe y falla, el frontend no debe conceder una sesión local falsa.
- Una sesión guardada en modo demo no debe abrir el chat cuando luego se configure `MEMORIA_BACKEND_URL`; debe pedirse reingreso con correo y credenciales reales.
- Si `/auth/check` o una API protegida rechaza la sesión con `401` o `403`, el frontend debe limpiar la sesión local y pedir autenticación Google/Gmail nuevamente.
- Las respuestas tardías de login Google/Gmail deben descartarse si el intento ya no está vigente.
- El tema se calcula automáticamente por hora local desde la carga inicial para evitar parpadeo visual.
- La comunicación nueva en tiempo real se canaliza por `streme` con reconexión y `lastEventId`; debe funcionar con WebSocket o SSE/EventSource y no se debe introducir polling para mensajes nuevos.
- Al iniciar sesión con `MEMORIA_BACKEND_URL`, el cliente debe leer `/api/v1/perfil-usuario`, `/api/v1/conversaciones`, `/api/v1/publicaciones-efimeras` y `/api/v1/sesiones-comunicacion` para reemplazar o complementar los datos semilla con datos reales.
- Al abrir una conversación real, el cliente debe hidratar `GET /api/v1/mensajes?conversationId={chatId}` si el historial no fue entregado incrustado en `/api/v1/conversaciones`.
- Los eventos `streme` de creación, edición y eliminación de mensajes deben actualizar la conversación local para evitar desalineación visual y deben deduplicarse con mensajes optimistas por `clientMutationId`.
- Al limpiar o invalidar una sesión debe cerrarse la conexión `streme` activa, cancelarse su reconexión y permitirse que el siguiente correo abra una conexión nueva sin quedar bloqueado por sockets antiguos.
- La señal de escritura debe quedar asociada al `chatId` capturado; cambiar de chat o sección debe cerrar `typing.stop` del contexto anterior antes de permitir un nuevo `typing.start`.
- Los paneles transitorios del composer, especialmente emojis, no deben quedar visibles ni ejecutables cuando el composer se deshabilita, cambia la sección, cambia el chat o se limpia la sesión.
- Toda escritura local que luego dependa de backend debe incluir `clientMutationId`.
- El estado local, la cola pendiente y el cursor `lastEventId` de `streme` deben estar aislados por correo electrónico activo.
- Las escrituras fallidas contra memoriaBACKEND deben quedar en cola local de sincronización de la cuenta activa, sin duplicarse al reintentar y sin mezclarse con otro correo.
- Las respuestas tardías de APIs o eventos `streme` iniciados bajo una sesión anterior deben descartarse antes de persistir, renderizar o reconciliar datos.
- Los adjuntos deben completar preparación, subida firmada y creación de mensaje media; solo puede encolarse el registro final si ya existe `mediaId`, nunca el binario del archivo.
- El panel de estado de memoriaBACKEND debe mostrar operaciones pendientes y permitir reintento manual.
- Los botones visibles deben tener lógica observable aunque `memoriaBACKEND` no esté configurado: crear chat, enviar mensaje, adjuntar, crear estado, marcar estado como visto, responder estado, iniciar llamada, repetir llamada, abrir chat desde llamadas, ver estado de APIs y cerrar sesión.
- Responder un estado debe resolver el chat por `chatId`/`conversationId` o por correo del dueño/contacto; si solo existe correo, debe crear una conversación local y encolar la creación remota antes de permitir el mensaje de respuesta.
- Las imágenes opcionales deben buscarse automáticamente en `assets`; si faltan, la interfaz conserva placeholders geométricos con iniciales o figuras CSS. Los callbacks tardíos de carga de imagen no deben poder reemplazar el avatar de otro chat, estado o llamada.
- Las rutas de imágenes opcionales devueltas por memoriaBACKEND deben normalizarse de forma segura hacia `assets/*.png`, incluyendo datos locales heredados de conversaciones, estados y llamadas.

En esta iteración se detectó un punto débil específico del acceso Google/Gmail en producción: si `login.js` de `AUTENTICACIONx` fallaba una vez por red, CORS, dominio no autorizado o despliegue transitorio, el `<script>` quedaba en el DOM sin estado cargado y los siguientes intentos podían no disparar eventos nuevos. Eso podía dejar el formulario de acceso sin una ruta recuperable aunque memoriaBACKEND volviera a estar disponible. Se corrigió reemplazando el nodo fallido en cada reintento, asignando manejadores antes de `src`, validando que la URL cargada sea la vigente y actualizando la versión del static site para que Render/PWA refresquen el shell.

## 21. Revisión de punto débil: instalación PWA y actualización del static site

En esta iteración se identificó como punto débil principal el ciclo de instalación y actualización de ChatER como appWEB. La interfaz ya funcionaba como static site con sesión por correo, tema automático, comunicación prevista con memoriaBACKEND y botones principales conectados, pero no tenía manifiesto PWA, service worker, registro de actualización ni navegación móvil inferior alineada con las pantallas de referencia del ZIP `interface`. Sin esos módulos, el sitio podía verse como web móvil, pero no quedaba preparado para instalarse ni autoactualizarse cuando Render.com publicara cambios.

Cambios funcionales incorporados:

- `manifest.json` declara a ChatER como aplicación instalable con `display: standalone`, `start_url`, `scope`, colores de tema y referencias a iconos futuros dentro de `assets`.
- `service-worker.js` cachea el shell estático, usa estrategia network-first para navegación, stale-while-revalidate para módulos locales y elimina caches antiguos al activar una versión nueva.
- `js/pwa.js` registra el service worker, captura el evento de instalación, busca actualizaciones al enfocar la app y muestra un aviso cuando existe una versión lista para aplicar.
- La interfaz agrega un aviso de actualización con acción **Actualizar ahora** sin obligar al usuario a desinstalar ni reinstalar la app.
- El panel **Herramientas** incluye acciones para instalar y actualizar ChatER, conservando textos de producción.
- En móvil se agregó navegación inferior para **Chats**, **Llamadas**, **Novedades** y **Herramientas**, más cercana a las referencias visuales de la carpeta `interface`.
- Se corrigieron reglas CSS débiles que podían afectar la renderización visual: una llave extra en estilos de botones y una regla duplicada de `.state-avatar.viewed`.

Este ciclo no agrega una API obligatoria nueva a memoriaBACKEND para la instalación PWA, porque el service worker y el manifiesto pertenecen al static site. Para operación productiva, la validación de versión y contrato debe apoyarse en `GET /api/v1/versiones/manifest` y `GET /api/v1/bloques-sincronizados/validacion`; los errores técnicos del navegador deben reportarse mediante `POST /api/v1/eventos/registrar` cuando `memoriaBACKEND` esté configurado, sin reactivar endpoints heredados de versión ni de errores del cliente.

Reglas adicionales de validación para considerar ChatER listo:

- El static site debe exponer `manifest.json`, `service-worker.js`, `js/pwa.js`, `css/styles.css`, `js/config.js` y `js/app.js` desde el mismo origen de Render.com.
- El service worker no debe interceptar APIs externas de memoriaBACKEND ni conexiones `streme`; solo debe cachear recursos GET del mismo origen del static site.
- Al publicar una nueva versión, el service worker debe activar un cache con nombre nuevo, eliminar caches antiguos y permitir recarga controlada desde el banner de actualización.
- La navegación inferior móvil no debe aparecer dentro de una conversación abierta, para no competir con el composer de mensajes.
- La sección **Herramientas** debe mantener acciones observables para modo automático, crear estado, estado memoriaBACKEND, notificaciones, instalación, actualización y cierre de sesión.
- Como no se crean imágenes reales dentro del proyecto, los iconos PWA referenciados por el manifiesto quedan cubiertos por prompts `.txt` en `assets`; cuando se agreguen los PNG reales con esos nombres, el manifiesto los reconocerá automáticamente.

## 22. Revisión de punto débil: Herramientas como sección real y CSS de estado API

En esta iteración se identificó como punto débil principal la sección **Herramientas** frente a las referencias visuales del ZIP `interface`. La navegación inferior móvil ya mostraba cuatro entradas, pero **Herramientas** funcionaba como modal superpuesto y no como pantalla principal persistente. Esto se alejaba de la referencia donde Herramientas es una vista de primer nivel con métricas, acciones y navegación inferior activa.

Cambios funcionales incorporados:

- **Herramientas** ahora es una sección real de `activeSection`, accesible desde la navegación inferior móvil y desde el botón superior de herramientas.
- La lista principal de herramientas muestra métricas de conversaciones, estados y operaciones pendientes, manteniendo una estructura visual similar a la pantalla de referencia.
- Las acciones de herramientas quedaron reutilizadas desde una única lógica (`handleToolAction`) para evitar divergencias entre vista principal, panel de escritorio y modal heredado.
- El panel derecho de escritorio muestra resumen de memoriaBACKEND, estado PWA y modo visual automático en tarjetas funcionales.
- Se preservó y dejó explícita la validación del bloque CSS de `.api-status-grid`, evitando que futuras ediciones introduzcan selectores anidados accidentalmente dentro de una declaración.
- Se incrementó la versión del service worker para que el static site instalado pueda detectar y aplicar esta actualización sin reinstalar la app.

Reglas adicionales de validación:

- La sección **Herramientas** debe ser navegable sin abrir un modal obligatorio en móvil.
- La navegación inferior debe marcar **Herramientas** como sección activa con `aria-current="page"`.
- Las acciones **Crear estado**, **Estado memoriaBACKEND**, **Instalar app**, **Actualizar app**, **Modo automático** y **Cerrar sesión** deben ejecutar la misma lógica desde cualquier entrada visual.
- El CSS de `.api-status-grid` debe permanecer válido y no contener selectores anidados accidentalmente dentro de una declaración.
- Cuando se modifiquen módulos cacheados por el service worker, `CHATER_SW_VERSION` debe cambiar para forzar una nueva cache y permitir actualización controlada.

## 23. Revisión de punto débil: acciones móviles principales e iconos PWA opcionales

En esta iteración se identificó como punto débil principal la distancia entre la experiencia móvil de ChatER y las pantallas del ZIP `interface`: la navegación inferior ya existía, pero las acciones principales de cada sección seguían dependiendo demasiado del encabezado o de modales secundarios. En las referencias móviles, cada área expone acciones rápidas visibles, por ejemplo crear chat, crear estado o iniciar llamada. También se detectó un riesgo PWA: el manifiesto apunta a iconos futuros dentro de `assets`, pero el proyecto no debe crear imágenes reales; si esos PNG no existen, algunos navegadores pueden intentar resolverlos durante la instalación.

Cambios funcionales incorporados:

- Se agregó una acción flotante móvil contextual que cambia según la sección activa: **Nuevo chat**, **Crear estado**, **Nueva llamada** o **Estado memoriaBACKEND**.
- Se añadieron botones superiores de cámara/estado y búsqueda por sección. La búsqueda enfoca el campo existente y el botón de cámara ejecuta una acción relacionada con la sección, sin dejar botones decorativos sin lógica.
- Se creó un flujo de **Nueva llamada** desde la sección Llamadas para seleccionar una conversación existente e iniciar llamada de voz o video usando la misma lógica auditada de `startCall`.
- Se mantuvo el botón de nuevo chat en escritorio y se trasladó la acción principal móvil al botón flotante para parecerse más a la referencia visual sin perder funcionalidad.
- Se actualizó el service worker para entregar una figura geométrica PNG cuando se solicita un PNG opcional dentro de `assets` y el archivo real todavía no existe. Esto mantiene operativa la instalación y los accesos directos mientras solo existan prompts `.txt`.
- Se quitó la declaración rígida `type: image/png` del manifiesto para permitir que el navegador acepte la respuesta geométrica de fallback hasta que se agreguen los PNG reales.
- Se incrementó la versión del service worker para que el static site instalado detecte esta mejora y pueda actualizarse sin reinstalación.

Reglas adicionales de validación:

- Ninguna acción visible de encabezado, navegación inferior o botón flotante debe quedar sin evento relacionado.
- En móvil, el botón flotante debe ocultarse al abrir una conversación para no competir con el composer.
- En Llamadas, iniciar una nueva llamada desde la acción flotante debe pedir primero la conversación objetivo y reutilizar `startCall`.
- En Estados, cámara/acción flotante deben abrir la publicación de estado de 24 horas.
- En Chats, la acción flotante debe abrir creación de chat por correo electrónico, no por número telefónico.
- Si un PNG opcional de `assets` no existe, el service worker debe responder con una figura geométrica; si el PNG real existe, debe servirse el archivo real y quedar cacheado.
- Cuando se agreguen los iconos PNG reales con los nombres documentados en `assets/*.txt`, el manifiesto los reconocerá automáticamente sin cambiar rutas.

## 24. Revisión de punto débil: aislamiento del service worker frente a APIs y `streme`

En esta iteración se identificó como punto débil principal el límite entre la PWA instalada y las APIs de `memoriaBACKEND`. El service worker cacheaba recursos GET del mismo origen y eso era correcto para el shell estático, pero podía interceptar accidentalmente endpoints de backend si en producción Render.com o un proxy publicaban `memoriaBACKEND` bajo el mismo dominio del static site. Ese caso era especialmente sensible para `streme` por SSE/EventSource, porque una petición `text/event-stream` nunca debe pasar por una estrategia de cache.

Cambios funcionales incorporados:

- `service-worker.js` ahora deja pasar sin interceptar rutas runtime de backend cuando estén bajo el mismo origen, incluyendo prefijos canónicos de `memoriaBACKEND` y prefijos heredados solo como exclusión defensiva de cache.
- Las peticiones con encabezado `Accept: text/event-stream` quedan excluidas del cache para proteger `streme` en modo SSE y mantener la comunicación en tiempo real sin polling.
- Se conservó la estrategia `networkFirst` para navegación del static site y el fallback geométrico para PNG opcionales dentro de `assets`.
- Se endureció `staleWhileRevalidate` para que, cuando no exista cache y falle la red, no responda con `null`; ahora devuelve fallback de `index.html` o un error de red válido.
- Se incrementó `CHATER_SW_VERSION` para que la app instalada detecte este cambio y lo aplique sin desinstalar.

Reglas adicionales de validación:

- El service worker solo debe cachear el shell estático, módulos locales y assets del frontend; no debe cachear ni responder APIs runtime de `memoriaBACKEND`.
- `streme` por WebSocket o SSE debe conectarse directo a red. En SSE, cualquier `GET` con `Accept: text/event-stream` debe quedar fuera del cache.
- Si `memoriaBACKEND` se sirve en otro dominio, el service worker no debe interceptarlo por la restricción de origen existente.
- Si `memoriaBACKEND` se sirve en el mismo dominio mediante proxy, las rutas documentadas deben quedar fuera del service worker para evitar datos obsoletos, respuestas `index.html` en endpoints JSON o bloqueo del canal realtime.
- La instalación PWA y el fallback de imágenes opcionales deben seguir funcionando porque las rutas `assets/*.png` continúan gestionadas por el service worker.


## 25. Revisión de punto débil: actualización inmediata del shell instalado

En esta iteración se identificó como punto débil principal la actualización de una app instalada cuando Render.com publica cambios en archivos estáticos pero no necesariamente cambia el contrato de memoriaBACKEND. La versión anterior registraba service worker, borraba caches antiguos y revisaba actualizaciones, pero los módulos del shell (`index.html`, `manifest.json`, `css/styles.css`, `js/config.js`, `js/app.js` y `js/pwa.js`) todavía podían servirse con una estrategia `stale-while-revalidate`. Eso permitía que el primer arranque posterior a un despliegue mostrara temporalmente una versión anterior hasta una segunda carga, lo cual no cumple completamente la intención de que la app instalada se autoactualice sin reinstalar.

Cambios funcionales incorporados:

- Los archivos críticos del shell ahora usan estrategia `networkFirst` con `cache: 'reload'`. Si hay conexión, la app instalada intenta usar inmediatamente la versión publicada en Render.com; si no hay conexión, usa la copia cacheada.
- El service worker agregó el mensaje interno `REFRESH_APP_SHELL` para refrescar explícitamente la cache de `APP_SHELL` sin tocar APIs runtime, `streme` ni adjuntos.
- El botón **Actualizar ahora** conserva la activación de un service worker nuevo con `SKIP_WAITING`, pero si no hay worker pendiente también puede refrescar la cache estática actual y recargar la ventana controlada.
- La acción **Actualizar app** del panel Herramientas fuerza una revisión del service worker y, si no hay worker nuevo, refresca el shell cacheado para traer cambios de HTML/CSS/JS publicados en el mismo service worker.
- Se mantiene la exclusión de rutas de memoriaBACKEND y `text/event-stream`, evitando que la mejora de actualización cachee respuestas de API o bloquee el tiempo real sin polling.
- Se incrementó `CHATER_SW_VERSION` para que las instalaciones existentes detecten esta revisión y puedan aplicarla sin desinstalar.

Reglas adicionales de validación:

- `APP_SHELL` debe mantenerse limitado a recursos estáticos del frontend; no debe incluir rutas de memoriaBACKEND ni recursos generados por usuario.
- Los archivos `index.html`, `manifest.json`, `css/styles.css`, `js/config.js`, `js/app.js` y `js/pwa.js` deben intentar red primero para reducir al mínimo la ventana de versión obsoleta.
- El fallback offline de navegación debe seguir respondiendo con `index.html`, pero los recursos CSS/JS no deben recibir HTML como fallback si nunca fueron cacheados.
- La actualización manual debe funcionar aunque el archivo `service-worker.js` no haya cambiado entre dos despliegues estáticos, porque puede refrescar la cache del shell activo.
- El flujo de actualización no debe interceptar rutas runtime de backend ni peticiones SSE con `Accept: text/event-stream`; solo debe cachear recursos estáticos del shell.

## 26. Revisión de punto débil: detección automática de versión publicada

En esta iteración se identificó como punto débil principal que la actualización instalada dependía de una acción manual, del foco de la ventana o de que el navegador detectara cambios en `service-worker.js`. Eso dejaba una brecha cuando Render.com publicaba cambios de `index.html`, CSS o JavaScript con el mismo service worker activo: la app podía actualizarse, pero no necesariamente lo hacía de forma suficientemente inmediata para una PWA usada como aplicación móvil.

Cambios funcionales incorporados:

- Se agregó `app-version.json` como manifiesto liviano de versión del static site. Este archivo pertenece al frontend, no a memoriaBACKEND, y permite detectar cambios publicados aunque el service worker no cambie.
- `js/pwa.js` ahora vigila la versión publicada con `fetch(..., { cache: 'no-store' })`, al registrar el service worker, al recuperar foco, al volver a estar visible, al reconectar a internet, al usar **Actualizar app** y en un intervalo corto de seguridad.
- Si `app-version.json` cambia, la PWA refresca la cache del shell estático y recarga la ventana controlada sin pedir reinstalación.
- `service-worker.js` incluyó `app-version.json` dentro de `APP_SHELL` y cambió `CHATER_SW_VERSION` para que las instalaciones existentes reciban esta mejora.
- La pantalla de estado de memoriaBACKEND muestra también el estado de la app instalada y la versión publicada conocida.
- En móvil se ajustó el cromado visual por sección para parecerse más a las referencias de `interface`: **Novedades**, **Llamadas** y **Herramientas** aparecen como pantallas principales, sin avatar de perfil obligatorio ni buscador visible permanente; el botón de búsqueda sigue siendo funcional y revela el campo cuando el usuario lo necesita.

Reglas adicionales de validación:

- `app-version.json` debe cambiar en cada despliegue funcional para que la app instalada pueda detectar la publicación sin depender solo del hash interno del service worker.
- La verificación de versión no sustituye a `streme` ni introduce polling de mensajes; solo revisa metadatos estáticos de la PWA.
- La actualización automática debe limitarse a recursos del shell (`APP_SHELL`) y continuar excluyendo rutas runtime de memoriaBACKEND, `streme` y `text/event-stream`.
- El buscador móvil de secciones secundarias debe ocultarse por defecto para coincidir con la referencia visual, pero debe seguir abriéndose desde el botón de búsqueda.
- La navegación inferior y el botón flotante contextual deben conservar lógica real y no convertirse en elementos decorativos.

## 27. Revisión de punto débil: sección Llamadas demasiado pasiva frente a la referencia visual

En esta iteración se identificó como punto débil principal que la sección **Llamadas** ya mostraba historial y permitía repetir llamadas desde un detalle, pero todavía era más pasiva que la referencia visual: no tenía una cabecera funcional con acciones rápidas como **Llamar**, **Programar** y **Teclado**, ni accesos directos a contactos recientes. Eso dejaba parte de la interfaz parecida a un listado administrativo y no a una app móvil tipo WhatsApp, además de reducir la trazabilidad de botones visibles en el área de llamadas.

Cambios funcionales incorporados:

- La sección **Llamadas** ahora renderiza un hub superior con botones reales **Llamar**, **Programar** y **Teclado**.
- **Llamar** reutiliza el selector existente de conversaciones y la lógica auditada de `startCall`, conservando historial local, mensaje de sistema, cola idempotente y sincronización por `POST /api/v1/sesiones-comunicacion`.
- **Programar** abre un formulario con conversación, tipo de llamada y fecha/hora; crea una entrada local `scheduled`, registra un mensaje de sistema y sincroniza con `POST /api/v1/sesiones-comunicacion` usando `scheduledAt`, o deja la operación en cola si memoriaBACKEND falla.
- **Teclado** respeta que ChatER usa correo electrónico, no teléfono: solicita un correo válido, reutiliza o crea la conversación local correspondiente, encola `POST /api/v1/conversaciones` si hace falta y luego inicia la llamada.
- El historial de llamadas agrega etiqueta **Recientes**, diferencia llamadas programadas y permite desde el detalle llamar ahora, programar otra llamada o abrir el chat relacionado.
- La normalización de llamadas remotas reconoce `scheduledAt`, `startsAt`, `startTime`, `status: scheduled`, correo del contacto y avatar opcional para que `SESIONEScomunicacionX` pueda hidratar tanto llamadas normales como programadas.
- Se añadieron estilos responsive para que los accesos rápidos se parezcan más a las capturas móviles dentro de `interface`, sin imágenes obligatorias y manteniendo placeholders geométricos.

Reglas adicionales de validación:

- Ningún botón visible dentro de la cabecera de llamadas debe ser decorativo: todos deben abrir una acción local observable.
- El teclado de llamadas debe aceptar correos electrónicos y nunca pedir número telefónico.
- Programar una llamada debe funcionar en modo local y en modo backend con cola idempotente si falla `POST /api/v1/sesiones-comunicacion`.
- Las llamadas programadas deben poder repetirse como llamada inmediata y conservar acceso al chat relacionado.
- Los accesos directos a contactos recientes deben derivarse de conversaciones o llamadas existentes, sin depender de datos externos ni imágenes obligatorias.

## 28. Revisión de punto débil: Estados sin promoción funcional ni jerarquía visual completa

En esta iteración se identificó como punto débil principal la sección **Novedades/Estados** frente a la referencia visual del ZIP `interface`. La pantalla ya permitía crear estados, ver estados recientes y responder por chat, pero todavía faltaba una jerarquía móvil más cercana a la referencia: encabezado interno **Estados**, acción **Añadir estado**, botón visible **Promocionar tu estado** y etiqueta **Recientes** antes del listado. Además, el botón de promoción no existía como acción funcional, por lo que quedaba una capacidad importante de la pantalla de estados sin contrato de API ni cola local.

Cambios funcionales incorporados:

- La lista de estados ahora muestra encabezado **Estados**, fila **Añadir estado**, texto de expiración **Desaparece después de 24 horas**, botón **Promocionar tu estado** y bloque **Recientes** antes de los estados existentes.
- **Promocionar tu estado** abre un flujo real: si no hay estados, invita a crear uno; si hay estado activo, prepara una promoción local y la sincroniza con memoriaBACKEND cuando esté configurado.
- La promoción de estado queda alineada con `PATCH /api/v1/publicaciones-efimeras/{stateId}` como actualización del bloque `PUBLICACIONESefimerasX`, sin conservar el endpoint heredado de promoción de estados como contrato vigente.
- La promoción usa `clientMutationId`, se guarda en el estado local, actualiza la interfaz y queda en la cola idempotente como `promoteState` si la API falla.
- La reconciliación de estados remotos conserva `promotionRequested`, `promotionStatus` y `promotionId` cuando memoriaBACKEND los devuelve.
- Se añadieron estilos específicos para el botón de promoción, la jerarquía **Estados/Recientes** y el resumen de promoción sin requerir imágenes reales.
- Se incrementó `app-version.json` y `CHATER_SW_VERSION` para que la PWA instalada detecte esta mejora y la aplique sin reinstalación.

Reglas adicionales de validación:

- El botón **Promocionar tu estado** no debe ser decorativo; debe abrir modal y registrar una acción local observable.
- En modo demo local, la promoción debe quedar registrada sin bloquear la interfaz.
- En modo memoriaBACKEND, la promoción debe usar `PATCH /api/v1/publicaciones-efimeras/{stateId}` y encolarse si falla.
- La lista de Estados debe conservar la acción de crear estado y el listado de recientes sin depender de imágenes obligatorias.
- La actualización de versión debe acompañar cualquier cambio en HTML, CSS, JS o service worker cacheado.

## 29. Revisión de punto débil: fallback offline demasiado amplio para recursos estáticos

En esta iteración se identificó como punto débil principal una regresión parcial dentro del service worker: aunque la navegación offline debía seguir usando `index.html`, la estrategia genérica `staleWhileRevalidate` todavía podía devolver `index.html` cuando fallaba un recurso estático no navegacional sin copia cacheada. Ese comportamiento es peligroso en una PWA instalada porque un archivo `.json`, `.txt`, `.css`, `.js` u otro recurso del static site podría recibir HTML como respuesta, ocultando el fallo real y dificultando la autoactualización confiable.

Cambios funcionales incorporados:

- `service-worker.js` mantiene el fallback de `index.html` solo para navegación real controlada por `networkFirst(request, './index.html')`.
- `staleWhileRevalidate` ya no devuelve `index.html` para recursos estáticos no navegacionales cuando no hay red ni cache.
- Se agregó `createStaticResourceMissResponse(request)` para responder con `504` explícito y `Cache-Control: no-store` cuando un recurso estático no navegacional no está disponible offline.
- Si el recurso esperado es JSON o la petición acepta JSON, el fallback de error devuelve JSON estructurado; en otros casos devuelve texto plano, evitando contaminar consumidores de CSS/JS/JSON con HTML.
- Se preservó intacto el fallback geométrico especializado para imágenes opcionales `assets/*.png`, de modo que los avatares e iconos documentados siguen funcionando aunque no existan imágenes reales.
- Se incrementaron `CHATER_SW_VERSION` y `app-version.json` para que la app instalada detecte la corrección y la aplique sin reinstalación.

Reglas adicionales de validación:

- Solo las navegaciones deben recibir `index.html` como fallback offline.
- Los recursos CSS, JS, JSON, TXT o documentos estáticos no cacheados no deben recibir HTML cuando falla la red.
- Las imágenes opcionales dentro de `assets/*.png` deben conservar su fallback geométrico automático.
- Las rutas runtime de memoriaBACKEND y `streme` deben seguir fuera de la cache del service worker.
- Cada cambio funcional del shell debe actualizar `app-version.json` para sostener la autoactualización de la PWA instalada.

## 30. Revisión de punto débil: lectura local sin confirmación remota

En esta iteración se identificó como punto débil principal que abrir una conversación limpiaba el contador de no leídos solo en la interfaz local, pero no confirmaba esa lectura contra memoriaBACKEND. En una app estática conectada a APIs, eso podía hacer que el contrato remoto de conversaciones volviera a hidratar la conversación con el mismo contador remoto, que otros dispositivos no recibieran el estado leído y que la acción visible de abrir un chat no tuviera una escritura equivalente hacia el backend.

Cambios funcionales incorporados:

- Se agregó el cliente `markConversationRead()` para `POST /api/v1/interacciones-mensaje` con `interactionType: read`, `readAt` y `clientMutationId` idempotente.
- Al abrir una conversación con mensajes no leídos, ChatER ahora marca lectura localmente y sincroniza esa lectura con memoriaBACKEND cuando está configurado.
- Si memoriaBACKEND falla, la lectura queda en la cola local como `markChatRead` para reintentarse sin bloquear la interfaz.
- La cola de sincronización puede reproducir `markChatRead` y actualizar el estado local `lastReadSyncStatus`, `lastReadAt` y `readSyncedAt` cuando la API responde.
- Si llega un mensaje entrante por `streme` mientras la conversación está abierta, el cliente envía un recibo remoto forzado para que el backend no vuelva a contar como no leído algo que el usuario ya está viendo.
- Las conversaciones heredadas normalizan metadatos de lectura sin perder mensajes, estados, llamadas ni colas anteriores.
- Se incrementó `app-version.json` y `CHATER_SW_VERSION` para que la PWA instalada detecte esta corrección y actualice el shell sin reinstalación.

Reglas adicionales de validación:

- Abrir un chat no debe limitarse a limpiar el contador visual; debe sincronizar `POST /api/v1/interacciones-mensaje` cuando exista backend.
- La lectura debe funcionar en modo demo local sin exigir red y en modo backend con cola idempotente si la API falla.
- Un recibo de lectura no debe mezclarse entre correos: debe pasar por las mismas guardas de sesión y almacenamiento aislado ya existentes.
- Los mensajes recibidos por `streme` en una conversación abierta deben quedar confirmados como leídos sin polling.
- La actualización de versión debe acompañar cualquier cambio del shell cacheado.


## 31. Revisión de punto débil: lista principal sin Archivados funcionales

En esta iteración se identificó como punto débil principal que la pantalla principal de chats todavía no reproducía una pieza visible importante de las referencias del ZIP `interface`: la fila **Archivados** de la lista de conversaciones. El proyecto ya tenía documentación heredada de actualización de conversaciones para archivar o configurar chats, pero la interfaz no ofrecía un acceso real a conversaciones archivadas ni una acción local observable para archivar/restaurar desde el static site.

Cambios funcionales incorporados:

- La lista principal de **Chats** ahora muestra una fila **Archivados** con contador, coherente con la referencia visual móvil.
- Las conversaciones activas se filtran fuera de archivados; las archivadas se conservan en el estado local con todos sus mensajes y metadatos.
- El botón nuevo de la cabecera del chat permite archivar la conversación activa y cambia a acción de restauración cuando se abre un chat archivado.
- La fila **Archivados** abre un modal funcional con las conversaciones archivadas, acciones **Abrir** y **Restaurar**, y estado vacío de producción si aún no hay chats archivados.
- Al crear un chat con un correo que ya existe pero está archivado, ChatER lo restaura y lo abre en vez de duplicarlo.
- En modo memoriaBACKEND, archivar/restaurar usa `PATCH /api/v1/conversaciones/{conversationId}` con `archived` y `clientMutationId`; si falla, la acción queda en cola idempotente como `updateConversation`.
- La normalización de conversaciones locales y remotas reconoce `archived`, `isArchived`, `archiveSyncStatus` y `archiveSyncedAt` sin perder lógica previa de mensajes, lectura, estados, llamadas, adjuntos, `streme` ni sesión por correo.
- Se corrigió el incremento duplicado del contador interno de guardas de sesión para evitar saltos innecesarios en `activeSessionRuntimeId` sin cambiar el comportamiento de seguridad existente.
- Se incrementó `app-version.json` y `CHATER_SW_VERSION` para que la PWA instalada detecte esta mejora y la aplique sin reinstalación.

Reglas adicionales de validación:

- La fila **Archivados** no debe ser decorativa: debe abrir un panel real con acciones de abrir/restaurar.
- Archivar debe sacar el chat de la lista principal sin borrar mensajes ni estado local.
- Restaurar debe devolver el chat a la lista principal y abrirlo cuando la acción se ejecute desde el modal.
- En modo backend, el cambio de archivado debe usar `PATCH /api/v1/conversaciones/{conversationId}` y encolarse si memoriaBACKEND no responde.
- La acción de crear chat no debe duplicar una conversación archivada con el mismo correo; debe restaurarla y abrirla.
- La interfaz debe seguir funcionando sin imágenes reales: los avatares opcionales continúan usando placeholders geométricos.


## 32. Revisión de punto débil: chats fijados visibles pero sin lógica real

En esta iteración se identificó como punto débil principal otra pieza visible de la pantalla principal en el ZIP `interface`: los chats fijados aparecen con indicador de pin y prioridad superior dentro de la lista, pero el static site todavía no ofrecía una acción funcional para fijar o desfijar conversaciones ni un contrato local/remote asociado. Esto dejaba una diferencia importante frente a la interfaz tipo WhatsApp y convertía una señal visual esperada en una lógica inexistente.

Cambios funcionales incorporados:

- La lista de chats ahora ordena primero las conversaciones fijadas y muestra un indicador visible de pin en la columna de hora/metadatos.
- Se agregó un botón real en la cabecera de conversación para **Fijar** o **Desfijar** el chat activo, sin afectar archivar, llamadas, adjuntos, estados ni mensajes.
- El estado local reconoce `pinned`, `isPinned`, `pinSyncStatus` y `pinSyncedAt`, preservando conversaciones heredadas y respuestas remotas de memoriaBACKEND.
- En modo memoriaBACKEND, fijar/desfijar usa `PATCH /api/v1/conversaciones/{conversationId}` con `pinned` y `clientMutationId`; si falla, queda en la cola idempotente como `updateConversation`.
- Las conversaciones archivadas conservan su indicador de fijado en el modal de Archivados, pero siguen fuera de la lista principal hasta restaurarse.
- La documentación de APIs ahora declara explícitamente `pinned` dentro de `PATCH /api/v1/conversaciones/{conversationId}` y en la matriz de botones funcionales.
- Se incrementó `app-version.json` y `CHATER_SW_VERSION` para que la PWA instalada detecte esta mejora y actualice el shell sin reinstalación.

Reglas adicionales de validación:

- El pin no debe ser decorativo: debe cambiar estado local, ordenar la lista y sincronizar con memoriaBACKEND cuando exista backend.
- Fijar una conversación no debe sacarla de Archivados ni restaurarla automáticamente; archivado y fijado son estados independientes.
- Desfijar debe conservar mensajes, no leídos, colas pendientes, historial, llamadas, estados y datos de adjuntos.
- La acción debe funcionar en modo demo local sin exigir red y en modo backend con cola idempotente si la API falla.
- La actualización de versión debe acompañar cualquier cambio del shell cacheado.

## 33. Revisión de punto débil: navegación móvil sin indicadores de actividad

En esta iteración se identificó como punto débil principal una diferencia funcional frente a las referencias móviles del ZIP `interface`: la barra inferior y las pestañas de sección permitían cambiar entre Chats, Llamadas, Novedades y Herramientas, pero no mostraban indicadores de actividad. En una appWEB instalada en móvil, eso ocultaba información crítica como mensajes sin leer, estados nuevos, llamadas perdidas o sincronizaciones pendientes con memoriaBACKEND, haciendo que la navegación pareciera decorativa aunque las acciones internas existieran.

Cambios funcionales incorporados:

- La navegación inferior ahora muestra contadores dinámicos por sección cuando existe actividad pendiente.
- Las pestañas superiores de escritorio/tablet también reciben el mismo resumen para no dejar la mejora limitada a móvil.
- **Chats** cuenta mensajes no leídos de conversaciones visibles, sin mezclar conversaciones archivadas.
- **Novedades** cuenta estados no vistos que no pertenecen al usuario actual.
- **Llamadas** cuenta llamadas perdidas detectadas por `status: "missed"` o por previsualización compatible con datos locales heredados.
- **Herramientas** cuenta operaciones pendientes en la cola local de sincronización de memoriaBACKEND, respetando el aislamiento por correo.
- Los badges actualizan `aria-label` con la cantidad y el tipo de actividad para que la mejora sea accesible y no solo visual.
- No se modificó la lógica de mensajes, estados, llamadas, archivado, fijado, `streme`, outbox ni PWA; la mejora consume estado existente y se renderiza desde el ciclo normal de navegación.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` para que la app instalada detecte la mejora y actualice el shell sin reinstalación.

Reglas adicionales de validación:

- Un botón de navegación no debe ocultar actividad pendiente de su sección cuando la información ya existe localmente.
- Los contadores deben desaparecer cuando no haya actividad y no deben crear estado nuevo ni llamadas de backend por sí mismos.
- La cuenta de Herramientas debe usar la cola de la cuenta activa para evitar mezclar operaciones entre correos.
- La mejora debe funcionar en modo demo local y en modo memoriaBACKEND sin introducir polling.

## 34. Revisión de punto débil: PWA móvil sin protección completa de safe-area

En esta iteración se identificó como punto débil principal que la interfaz ya usaba `env(safe-area-inset-bottom)` en varias zonas móviles, pero el documento no declaraba `viewport-fit=cover` y el shell instalado no aplicaba una estrategia completa para notch, barra de estado translúcida, laterales curvos y home indicator. En una appWEB instalada en móviles, ese detalle puede hacer que la cabecera, la barra inferior o el compositor queden demasiado cerca de áreas del sistema aunque la lógica del chat funcione.

Cambios funcionales incorporados:

- `index.html` ahora declara `viewport-fit=cover` en el meta viewport para que los `safe-area-inset-*` sean efectivos en navegadores móviles compatibles.
- `css/styles.css` centraliza `--safe-top`, `--safe-right`, `--safe-bottom` y `--safe-left` como variables del shell.
- En móvil, `.sidebar-header` y `.chat-header` aumentan su altura y padding superior con `--safe-top`, evitando que títulos, botones y avatar queden bajo la barra de estado en modo standalone.
- `.app-shell`, `.bottom-navigation` y `.message-form` respetan `--safe-left` y `--safe-right`, reforzando tablets, pantallas curvas y orientaciones con bordes seguros sin alterar la experiencia de escritorio.
- Se reemplazaron los usos directos de `env(safe-area-inset-bottom)` por `--safe-bottom` para mantener una regla consistente y fácil de auditar.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` para que la app instalada detecte esta mejora del shell móvil y la aplique sin desinstalar.

Reglas adicionales de validación:

- La mejora no debe cambiar la arquitectura static site ni introducir dependencias backend nuevas.
- En navegadores sin safe-area, las variables deben resolver a `0px` y mantener el layout actual.
- En PWA instalada, cabecera, navegación inferior, banner de actualización, panel de emojis y compositor deben evitar áreas del sistema.
- La actualización de versión debe acompañar cualquier cambio cacheado del shell para sostener la autoactualización.



## 35. Revisión de punto débil: estados 24h visuales sin carga real de imagen/video

En esta iteración se identificó como punto débil principal que la sección **Novedades/Estados** ya tenía estructura, lista, contador, promoción y botón de cámara, pero la creación de estados seguía limitada a texto. Frente a las referencias del ZIP `interface`, especialmente la pantalla de estados 24h, eso dejaba incompleta una parte central de la experiencia tipo WhatsApp: publicar una historia visual desde móvil sin que el botón de cámara fuera solo un acceso decorativo.

Cambios funcionales incorporados:

- El modal **Crear estado** ahora permite agregar una imagen o video además del texto del estado.
- La interfaz genera una vista previa vertical 9:16 dentro del modal cuando el archivo es liviano, y muestra una tarjeta geométrica con nombre/tamaño si no conviene guardar la previsualización en `localStorage`.
- Los estados locales conservan metadatos visuales (`mediaName`, `mediaMimeType`, `mediaSizeBytes`, `mediaKind`, `mediaPreviewDataUrl`, `mediaSyncStatus`) sin afectar estados antiguos solo de texto.
- El panel de estado ahora renderiza imagen/video cuando existe `mediaPreviewDataUrl` o `mediaUrl`, y conserva un fallback geométrico cuando el archivo no está disponible.
- En modo memoriaBACKEND, el flujo visual usa `ImagenesCloudflareR2x` (`POST /api/v1/imagenes-r2x/intenciones` + confirmación) cuando el recurso es imagen WebP optimizada, o `MEDIAfirmadaX` (`POST /api/v1/media-firmada/solicitar`) para media genérica; después publica `POST /api/v1/publicaciones-efimeras` con `mediaId`/metadatos.
- Si el archivo ya subió pero falla `POST /api/v1/publicaciones-efimeras`, la operación queda en la cola idempotente `createState`; si falla la subida antes de obtener `mediaId`/`imageId`, el estado queda local y avisa que debe reintentarse porque el static site no puede persistir el binario para otra sesión.
- `GET /api/v1/publicaciones-efimeras` reconoce estados remotos con `media`, `mediaUrl`, `mediaName`, `mediaMimeType`, `mediaSizeBytes` y `mediaKind` para hidratar historias visuales reales.
- La documentación de `POST /api/v1/publicaciones-efimeras` ahora especifica contratos separados para estado de texto y estado visual.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` para que la PWA instalada detecte la mejora y actualice el shell sin reinstalación.

Reglas adicionales de validación:

- El botón de cámara/crear estado no debe limitarse a texto cuando la referencia visual espera estados tipo historia.
- La mejora debe funcionar sin backend como demo local y con backend mediante `ImagenesCloudflareR2x`/`MEDIAfirmadaX` + `PUBLICACIONESefimerasX`.
- No se deben agregar imágenes binarias al proyecto; los archivos visuales de estado son seleccionados por el usuario en tiempo de ejecución.
- Un archivo pesado no debe romper `localStorage`: se conserva metadato y fallback visual.
- Las rutas y lógica existentes de chats, llamadas, archivados, fijados, lectura, `streme`, outbox y PWA deben mantenerse sin regresión.


## 36. Revisión de punto débil: iconos PWA referenciados pero ausentes

En esta iteración se identificó como punto débil principal una regresión potencial de instalación: el manifiesto PWA apuntaba únicamente a iconos PNG (`assets/chater-icon-192.png`, `assets/chater-icon-512.png` y `assets/chater-maskable-512.png`) que, por regla del proyecto, todavía no existen como imágenes binarias dentro del ZIP. Aunque esos PNG están cubiertos por sus `.txt` de prompt y el service worker puede devolver una figura geométrica cuando ya controla la página, la primera evaluación de instalación del navegador puede leer el `manifest.json` antes de que el service worker intercepte esos recursos. En ese caso, la appWEB podía fallar como instalable aunque la interfaz, el chat y la autoactualización funcionaran.

Cambios funcionales incorporados:

- Se agregaron `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` como figuras geométricas provisionales dentro de `assets`, sin crear PNG finales ni reemplazar los prompts existentes.
- `manifest.json` ahora declara primero los iconos PNG disponibles y conserva después las rutas PNG esperadas para que, cuando se agreguen las imágenes reales a `assets`, el proyecto siga reconociendo esos recursos.
- El acceso directo del manifiesto usa el fallback PNG disponible y mantiene la referencia PNG de 192 px como opción cuando exista.
- `index.html` declara un favicon PNG disponible para evitar depender únicamente de un PNG ausente en el primer render.
- `service-worker.js` precachea los PNG de fallback y se incrementó `CHATER_SW_VERSION` junto con `app-version.json` para que la PWA instalada reciba el cambio sin reinstalar.

Reglas adicionales de validación:

- El manifiesto no debe depender exclusivamente de imágenes PNG inexistentes para que el navegador considere instalable la appWEB.
- No se deben agregar PNG binarios mientras el proyecto solo tenga prompts; los PNG reales siguen documentados por sus `.txt` homónimos.
- La interfaz debe seguir mostrando placeholders geométricos cuando falten imágenes opcionales y debe usar automáticamente los PNG reales cuando se agreguen en `assets`.
- La actualización de versión debe acompañar cualquier cambio cacheado del shell para sostener la autoactualización.


## 37. Revisión de punto débil: fallback PWA documentado pero no incluido físicamente

En esta iteración se identificó como punto débil principal una regresión de empaquetado: la documentación, `index.html`, `manifest.json` y `service-worker.js` ya esperaban los archivos `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png`, pero el ZIP funcional no los incluía. Esto hacía que `cache.addAll(APP_SHELL)` pudiera fallar durante la instalación del service worker en Render y que la primera evaluación del manifiesto siguiera dependiendo de recursos ausentes.

Cambios funcionales incorporados:

- Se incorporaron físicamente `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` como placeholders geométricos livianos, sin crear PNG finales ni reemplazar los `.txt` de prompts existentes.
- Los PNG sirven como recurso real para `index.html`, `manifest.json` y el precache del service worker, evitando que la instalación falle por archivos obligatorios inexistentes.
- Los PNG reales (`chater-icon-192.png`, `chater-icon-512.png`, `chater-maskable-512.png`) siguen sin agregarse como binarios y permanecen cubiertos por sus `.txt` homónimos para que, cuando existan en `assets`, el proyecto los reconozca automáticamente.
- Se incrementó `CHATER_SW_VERSION` y `app-version.json` para que la PWA instalada detecte esta corrección del shell estático y actualice sin reinstalación.

Reglas adicionales de validación:

- Todo recurso listado en `APP_SHELL` debe existir físicamente en el ZIP o ser retirado del precache obligatorio.
- El manifiesto no debe depender solo de PNG ausentes para que ChatER sea instalable como appWEB.
- Los placeholders PNG no sustituyen la regla de prompts de imágenes finales; únicamente evitan una rotura técnica del modo instalable mientras las imágenes reales no existan.
- La actualización de versión debe acompañar cualquier cambio de recursos cacheados por el service worker.

## 38. Revisión de punto débil: service worker bloqueado por assets opcionales no adjuntos

En esta iteración se identificó como punto débil principal que el service worker seguía tratando iconos de `assets` como parte obligatoria de `APP_SHELL`. En el ZIP funcional esos recursos pueden no venir adjuntos porque las imágenes finales se cubren con prompts `.txt` y placeholders geométricos. Si un asset opcional no existe físicamente, `cache.addAll(APP_SHELL)` rechaza la instalación completa del service worker; eso rompe la característica más importante de appWEB móvil: instalación, cache offline y autoactualización sin reinstalar.

Cambios funcionales incorporados:

- `service-worker.js` ahora separa el shell obligatorio real (`index.html`, `manifest.json`, `app-version.json`, CSS y JS) de los assets opcionales de iconos.
- Los assets opcionales de `assets` ya no bloquean `install`; se precachean como placeholders geométricos generados por el propio service worker cuando el archivo real no está disponible.
- La detección de fallback ya no cubre solo `.png`; también cubre `.png`, `.png`, `.png`, `.png` y `.png` dentro de `assets`, manteniendo la regla de que la interfaz no se rompa si una imagen esperada aún no existe.
- `REFRESH_APP_SHELL` refresca los módulos obligatorios y vuelve a preparar fallbacks opcionales sin fallar por archivos de imagen ausentes.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` para que la PWA instalada detecte la corrección y actualice el cache sin desinstalar.

Reglas adicionales de validación:

- Ningún asset opcional cubierto por prompt debe pertenecer al precache obligatorio si su ausencia puede impedir instalar el service worker.
- Las imágenes reales futuras en `assets` deben seguir teniendo prioridad: si existen y responden correctamente, el service worker las cachea y deja de usar el fallback para esa URL.
- La solución no debe crear imágenes finales ni modificar los prompts `.txt`; solo garantiza una figura geométrica operativa mientras los binarios reales no existan.
- La lógica de chats, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático y navegación móvil no debe cambiar por esta corrección.

## 39. Revisión de punto débil: fallbacks PWA reales no priorizados al existir el asset

En esta iteración se identificó como punto débil principal que el proyecto ya separaba los assets opcionales del precache obligatorio, pero el paquete funcional aún no garantizaba dos condiciones críticas para una appWEB instalable: los iconos PNG de fallback referenciados por `index.html` y `manifest.json` debían existir físicamente en `assets`, y el service worker debía intentar cachear primero el asset real antes de fabricar un fallback geométrico. Sin eso, la primera evaluación de instalación podía seguir encontrando recursos ausentes y, cuando en el futuro se agregaran PNG reales a `assets`, el cache opcional podía guardar una figura provisional antes de reconocer la imagen publicada.

Cambios funcionales incorporados:

- Se agregaron físicamente `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` como placeholders geométricos livianos usados por `index.html` y `manifest.json` en la primera carga.
- No se agregaron PNG finales; los PNG esperados siguen cubiertos por sus `.txt` homónimos y podrán reemplazar automáticamente el fallback cuando se publiquen en `assets`.
- `cacheOptionalAssetFallbacks()` ahora intenta descargar el recurso real con `cache: 'reload'` antes de generar la figura geométrica.
- Si el asset real existe en Render, el service worker lo guarda en cache; si no existe, crea la respuesta PNG geométrica para que la instalación, el modo offline y la autoactualización no fallen.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` para que una PWA instalada detecte este cambio del shell estático y lo aplique sin reinstalar.

Reglas adicionales de validación:

- Ningún recurso referenciado por el favicon o por el manifiesto debe depender exclusivamente de un archivo omitido del ZIP funcional.
- Los assets reales dentro de `assets` tienen prioridad sobre los placeholders geométricos.
- Los placeholders PNG son recursos técnicos provisionales; no sustituyen los prompts `.txt` de los PNG finales ni introducen imágenes finales nuevas.
- La lógica de chats, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático y navegación móvil no debe cambiar por esta corrección.


## 40. Revisión de punto débil: manifiesto PWA apuntando a PNG omitidos del ZIP

En esta iteración se identificó como punto débil principal una inconsistencia de empaquetado: `index.html` y `manifest.json` ya referenciaban `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png`, pero esos recursos aparecían como contenido omitido en `estructura_del_proyecto.json` y no estaban físicamente dentro del ZIP recibido. En un static site de Render.com esto puede romper la primera evaluación de instalación de la appWEB porque el navegador consulta el manifiesto y sus iconos antes de que el service worker pueda fabricar respuestas geométricas para recursos opcionales.

Cambios funcionales incorporados:

- Se agregaron físicamente `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` como placeholders geométricos livianos dentro de `assets`.
- No se agregaron PNG finales ni se sustituyeron los prompts `.txt` existentes; los PNG reales (`chater-icon-192.png`, `chater-icon-512.png`, `chater-maskable-512.png`) siguen cubiertos por sus archivos de prompt y serán reconocidos automáticamente cuando existan en `assets`.
- Se incrementaron `CHATER_SW_VERSION` y `app-version.json` para que una PWA instalada detecte la corrección del shell estático y refresque los recursos sin reinstalar.
- Se mantiene la prioridad del asset real dentro del service worker: si el recurso existe en Render, se cachea el archivo publicado; si no existe, se usa una figura geométrica operativa.

Reglas adicionales de validación:

- Todo recurso referenciado por `index.html` o por `manifest.json` para instalación inicial debe existir físicamente o tener una ruta de fallback efectiva desde la primera carga.
- Los placeholders PNG son recursos técnicos temporales para evitar roturas de instalación, no imágenes finales del producto.
- La lógica de chats, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático y navegación móvil no se modifica por esta corrección.

## 41. Revisión de punto débil: empaquetado físico de iconos PNG de respaldo

En esta iteración se validó que el ZIP recibido seguía teniendo una inconsistencia crítica de empaquetado: `index.html`, `manifest.json`, `service-worker.js` y la documentación ya referenciaban `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png`, pero esos archivos no estaban físicamente adjuntos. En un static site de Render, esa ausencia puede afectar la primera evaluación del manifiesto PWA antes de que el service worker controle la página.

Cambios funcionales incorporados:

- Se agregaron físicamente `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` dentro de `assets` como figuras geométricas temporales de respaldo.
- No se crearon PNG finales ni se reemplazaron los prompts `.txt` existentes para `chater-icon-192.png`, `chater-icon-512.png` y `chater-maskable-512.png`.
- Se mantuvo la prioridad de assets reales: cuando los PNG reales se publiquen en `assets`, el proyecto los seguirá reconociendo automáticamente.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` para que la appWEB instalada detecte el cambio del shell estático y actualice sin reinstalación.

Reglas adicionales de validación:

- Los recursos referenciados como fallback por el manifiesto y el favicon deben estar disponibles desde la primera carga.
- Los PNG agregados son placeholders técnicos para estabilidad de instalación, no imágenes finales del producto.
- La lógica de chats, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático y navegación móvil no se modifica por esta corrección.

## 42. Revisión de punto débil: recursos PNG declarados pero omitidos físicamente

En esta iteración se identificó como punto débil principal que el ZIP recibido seguía declarando `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` en `estructura_del_proyecto.json` como archivos existentes, pero ambos venían con `attachedInZip: false`. Al mismo tiempo, `index.html`, `manifest.json` y `service-worker.js` ya dependían de esas rutas para evitar que la instalación PWA inicial quedara atada a PNG finales todavía no adjuntos.

Cambios funcionales incorporados:

- Se agregaron físicamente `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` dentro de `assets` como figuras geométricas temporales de respaldo.
- No se crearon PNG finales ni se modificaron los prompts `.txt` existentes; los PNG reales siguen cubiertos por sus prompts homónimos y tendrán prioridad cuando se publiquen en `assets`.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` a `2026-07-02-pwa-png-fallbacks-packaged-10` para que una app instalada detecte el nuevo paquete estático y pueda actualizar cache sin reinstalación.
- La corrección se limita al empaquetado físico y versionado de PWA; no cambia la lógica de chats, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático ni navegación móvil.

Reglas adicionales de validación:

- Todo recurso PNG referenciado por `index.html`, `manifest.json` o `service-worker.js` debe venir físicamente adjunto si forma parte del arranque visual o de instalación.
- Los PNG de respaldo son placeholders técnicos para estabilidad; no sustituyen los PNG finales ni las reglas de prompts de imagen.
- El service worker debe seguir priorizando el asset real publicado antes de usar cualquier placeholder geométrico.

## 43. Revisión de punto débil: corrección física verificable de fallbacks PWA

En esta iteración se volvió a validar el paquete recibido y el punto débil crítico seguía siendo de empaquetado, no de lógica de chat: `index.html`, `manifest.json` y `service-worker.js` dependían de `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png`, pero el ZIP no los contenía físicamente. Aunque el service worker puede fabricar placeholders para assets opcionales después de controlar la página, la primera lectura del manifiesto PWA en un static site de Render puede ocurrir antes de esa interceptación, dejando la instalación móvil atada a recursos inexistentes.

Cambios funcionales incorporados:

- Se agregaron físicamente `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` dentro de `assets` como figuras geométricas técnicas de respaldo para el arranque PWA.
- No se crearon PNG finales ni se modificaron los prompts `.txt` existentes; `chater-icon-192.png`, `chater-icon-512.png` y `chater-maskable-512.png` siguen cubiertos por sus prompts homónimos y tendrán prioridad cuando se publiquen realmente en `assets`.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` a `2026-07-02-pwa-png-fallbacks-packaged-11` para que una instalación existente detecte el nuevo paquete estático y actualice su cache sin desinstalar.
- La lógica de conversaciones, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático y navegación móvil quedó intacta.

Reglas adicionales de validación:

- Todo PNG referenciado por el manifiesto o por el favicon debe estar físicamente disponible desde la primera carga.
- Los PNG agregados son placeholders técnicos de estabilidad PWA, no imágenes finales de producto.
- El service worker debe seguir intentando usar primero cualquier asset real publicado antes de responder con un placeholder geométrico.
- Los módulos no relacionados no deben cambiar por esta corrección de empaquetado.

## 44. Revisión de punto débil: fallbacks PNG realmente adjuntos en el paquete afectado

En esta iteración se validó nuevamente el ZIP recibido contra `estructura_del_proyecto.json` y el punto débil principal seguía siendo verificable: `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` estaban declarados por `index.html`, `manifest.json`, `service-worker.js` y la documentación, pero no venían físicamente dentro del ZIP adjunto. Esa brecha podía afectar la primera evaluación del manifiesto PWA en Render.com antes de que el service worker pudiera responder con placeholders generados.

Cambios funcionales incorporados:

- Se añadieron físicamente `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` dentro de `assets` como figuras geométricas técnicas de respaldo para instalación PWA.
- No se crearon PNG finales ni se modificaron los prompts `.txt` existentes; los PNG reales siguen cubiertos por `chater-icon-192.txt`, `chater-icon-512.txt` y `chater-maskable-512.txt`.
- Se incrementaron `CHATER_SW_VERSION` y `app-version.json` a `2026-07-02-pwa-png-fallbacks-packaged-12` para que una instalación existente pueda detectar el paquete actualizado y refrescar cache sin reinstalar.
- La lógica de conversaciones, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático y navegación móvil no fue modificada.

Reglas adicionales de validación:

- Todo PNG referenciado directamente por el manifiesto o por el favicon debe estar físicamente disponible en el paquete que Nova aplique.
- Los PNG agregados son placeholders técnicos de estabilidad PWA, no reemplazan las imágenes PNG finales ni los prompts de imagen.
- El service worker debe continuar priorizando cualquier asset real publicado en `assets` antes de usar una respuesta geométrica generada.
- El ZIP de salida debe incluir únicamente estos módulos afectados y nuevos para no tocar lógica no relacionada.

## 45. Revisión de punto débil: instalación inicial PWA sin icono físico garantizado

En esta iteración se volvió a auditar el paquete recibido como static site de Render.com. El punto débil principal seguía en la frontera entre la regla de no adjuntar PNG finales y la instalación móvil: `index.html` y `manifest.json` referenciaban iconos PNG cubiertos por prompts `.txt`, pero no existía un recurso físico garantizado para la primera evaluación del navegador. El service worker ya podía fabricar placeholders geométricos después de controlar la página, pero la lectura inicial del favicon/manifiesto puede ocurrir antes de esa interceptación.

Cambios funcionales incorporados:

- Se añadieron físicamente `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` como figuras geométricas técnicas de respaldo dentro de `assets`.
- No se crearon PNG finales ni se modificaron los prompts `.txt`; `chater-icon-192.png`, `chater-icon-512.png` y `chater-maskable-512.png` siguen cubiertos por sus prompts y tendrán prioridad cuando existan realmente en `assets`.
- `index.html` usa el PNG físico como favicon inicial y conserva la ruta PNG como icono alterno para cuando el asset final sea publicado.
- `manifest.json` declara primero los PNG físicos disponibles y mantiene después los PNG esperados para compatibilidad futura.
- `service-worker.js` precachea los PNG reales como parte del shell obligatorio y sigue generando placeholders para PNG/avatares opcionales si faltan.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` a `2026-07-02-pwa-png-fallbacks-packaged-14` para que una app instalada refresque el shell sin desinstalación.

Reglas adicionales de validación:

- La instalación móvil no debe depender exclusivamente de PNG finales omitidos por regla del proyecto.
- Los PNG agregados son placeholders geométricos técnicos para estabilidad PWA; no reemplazan los PNG finales ni los prompts de imagen.
- Los módulos de conversación, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático y navegación móvil no se modifican por esta corrección.

## 46. Revisión de punto débil: shell PWA bloqueado por PNG omitidos del ZIP

En esta iteración se identificó que el punto débil real ya no era la ausencia de lógica de chat, sino una regresión de empaquetado del modo instalable: `index.html`, `manifest.json` y `service-worker.js` seguían referenciando `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png`, pero el ZIP recibido no contenía esos archivos físicamente. Como `service-worker.js` los incluía en `APP_SHELL`, `cache.addAll(APP_SHELL)` podía rechazar toda la instalación del service worker en Render.com. Eso rompía instalación, modo offline y autoactualización, que son requisitos centrales de la appWEB móvil.

Cambios funcionales incorporados:

- `service-worker.js` ahora mantiene en `APP_SHELL` únicamente archivos físicos del ZIP funcional: raíz, `index.html`, `manifest.json`, `app-version.json`, CSS y JS.
- Los iconos y avatares que dependen de imágenes futuras dentro de `assets` quedan tratados como assets opcionales; si el PNG real existe, se cachea, y si no existe, el service worker responde con una figura geométrica PNG generada dinámicamente.
- `manifest.json` dejó de declarar PNG omitidos y conserva únicamente las rutas PNG cubiertas por sus prompts `.txt`, con `type: image/png` explícito para los iconos instalables.
- `index.html` dejó de depender de un favicon PNG no adjunto y usa la ruta PNG esperada, que queda cubierta por fallback geométrico cuando el service worker controla la app.
- Se incrementaron `CHATER_SW_VERSION` y `app-version.json` a `2026-07-02-pwa-no-missing-png-shell-15` para que una instalación existente detecte la corrección y refresque el cache sin desinstalar.

Reglas adicionales de validación:

- Ningún archivo que pueda venir omitido por la regla de imágenes debe estar dentro del precache obligatorio del service worker.
- La ausencia de iconos PNG finales no debe impedir instalar el service worker ni actualizar el static site.
- Los PNG reales futuros dentro de `assets` deben tener prioridad automática sobre el placeholder geométrico.
- La lógica de conversaciones, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático y navegación móvil no se modifica por esta corrección.


## 47. Revisión de punto débil: llamadas a memoriaBACKEND sin límite de espera

En esta iteración se identificó como punto débil principal la frontera entre el static site y las APIs externas de `memoriaBACKEND`: aunque la interfaz ya tenía cola local, estados optimistas y reintentos, una petición `fetch` colgada podía quedar esperando indefinidamente. En una appWEB móvil instalada eso puede hacer que acciones como iniciar sesión, sincronizar mensajes, crear estados, registrar llamadas o subir adjuntos parezcan congeladas cuando el backend, la red móvil o una URL firmada no responde.

Cambios funcionales incorporados:

- `js/config.js` ahora expone `API_TIMEOUT_MS` y `MEDIA_UPLOAD_TIMEOUT_MS` como parámetros editables por despliegue en Render.com.
- `js/app.js` valida esos valores con fallback seguro y usa un `fetchWithTimeout` basado en `AbortController` para cortar llamadas a `memoriaBACKEND` que superen el tiempo máximo configurado.
- Las respuestas HTTP no exitosas ahora intentan leer el cuerpo de error JSON/texto para mostrar una causa útil sin perder `status` ni `payload` técnico.
- Las subidas de adjuntos a URLs firmadas también tienen timeout independiente y conservan la lógica existente de reintento manual o cola local cuando ya existe `mediaId`.
- El modal de estado de memoriaBACKEND muestra el tiempo máximo activo para API y adjuntos, dejando visible la configuración real del static site.
- Se incrementan `app-version.json` y `CHATER_SW_VERSION` para que una PWA ya instalada detecte el nuevo shell y se actualice sin reinstalar.

Reglas adicionales de validación:

- Ninguna llamada JSON de memoriaBACKEND debe quedar bloqueando indefinidamente la interfaz.
- Los adjuntos necesitan una ventana de espera mayor que las llamadas JSON normales, pero también deben fallar de forma controlada.
- La cola local de sincronización debe seguir funcionando: un timeout se trata como fallo recuperable y no como éxito silencioso.
- La lógica de conversaciones, estados, llamadas, herramientas, `streme`, autenticación Google/Gmail, tema automático, PWA e imágenes opcionales se preserva.


## 48. Revisión de punto débil: versión publicada marcada antes de confirmar actualización

En esta iteración se identificó como punto débil principal el flujo de autoactualización de la appWEB instalada. `js/pwa.js` guardaba en `localStorage` la nueva versión de `app-version.json` antes de confirmar que el service worker hubiera activado la actualización o que `REFRESH_APP_SHELL` hubiese refrescado correctamente todos los archivos obligatorios. Si la red móvil fallaba, Render.com entregaba un recurso incompleto o el service worker respondía tarde, ChatER podía considerar aplicada una versión que todavía no estaba realmente en cache, dejando la app instalada sin nuevos reintentos automáticos para esa misma versión.

Cambios funcionales incorporados:

- `js/pwa.js` ahora recuerda la versión publicada solo después de activar un worker pendiente o después de recibir una confirmación completa del refresco del shell estático.
- Si `REFRESH_APP_SHELL` falla o informa archivos obligatorios sin refrescar, la versión anterior se conserva para que el verificador automático vuelva a intentarlo en el siguiente intervalo, foco, conexión o solicitud manual.
- `requestAppShellRefresh()` normaliza respuestas parciales y trata cualquier fallo de archivos obligatorios como actualización incompleta, evitando recargas engañosas.
- `service-worker.js` ahora responde a `REFRESH_APP_SHELL` con `ok: false` cuando uno o más archivos reales del shell obligatorio no pudieron actualizarse.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` a `2026-07-02-pwa-update-confirmed-17` para que una instalación existente detecte y aplique la corrección.

Reglas adicionales de validación:

- Una versión publicada no debe marcarse como aplicada si el shell obligatorio no fue actualizado de forma verificable.
- Un fallo temporal de red o cache debe conservar capacidad de reintento automático sin exigir desinstalar la app.
- La actualización manual debe informar fallo recuperable en vez de recargar una cache parcial.
- La lógica de conversaciones, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático, adjuntos e imágenes opcionales se preserva.


## 49. Revisión de punto débil: versión recordada antes de `controllerchange`

En esta iteración se identificó como punto débil principal que el flujo de autoactualización todavía podía recordar una versión publicada en `localStorage` justo después de enviar `SKIP_WAITING` a un service worker en espera. Ese envío no garantiza por sí solo que el nuevo worker haya tomado control de la ventana: si la activación se retrasa, falla o el navegador interrumpe el proceso, ChatER podía dejar de reintentar esa misma versión aunque el shell instalado siguiera viejo.

Cambios funcionales incorporados:

- `js/pwa.js` ahora guarda una versión pendiente de confirmación cuando existe un service worker en espera, pero no la marca como aplicada inmediatamente.
- La versión pendiente solo se persiste cuando el navegador emite `controllerchange`, que confirma que el nuevo service worker tomó control de la appWEB.
- El botón manual de actualización intenta leer `app-version.json` antes de activar el worker en espera; si no puede leerlo, no marca ninguna versión como aplicada y deja que el siguiente arranque o verificación automática reintente.
- El refresco directo del shell mediante `REFRESH_APP_SHELL` conserva la regla anterior: solo recuerda la versión si el service worker confirma que todos los archivos obligatorios se actualizaron correctamente.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` a `2026-07-02-pwa-controllerchange-confirmed-18` para que una PWA instalada detecte esta corrección del shell estático y actualice sin reinstalar.

Reglas adicionales de validación:

- Enviar `SKIP_WAITING` no debe considerarse una confirmación suficiente de actualización aplicada.
- `controllerchange` es el punto seguro para recordar la versión cuando la actualización depende de un worker en espera.
- Si no ocurre `controllerchange`, la versión anterior debe permanecer en almacenamiento local para sostener reintentos automáticos.
- La lógica de conversaciones, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático, adjuntos e imágenes opcionales se preserva.

## 50. Revisión de punto débil: instalación inicial dependiente de PNG ausentes

En esta iteración se identificó como punto débil principal una brecha entre la regla de imágenes y el requisito de appWEB instalable. `index.html` y `manifest.json` seguían apuntando a `assets/chater-icon-192.png`, `assets/chater-icon-512.png` y `assets/chater-maskable-512.png`, pero esos PNG no vienen como binarios porque están cubiertos por prompts `.txt`. El service worker ya podía generar un fallback geométrico cuando controla la página, pero la primera evaluación del manifiesto PWA puede ocurrir antes de esa interceptación. En ese caso, el navegador podía encontrar iconos ausentes y degradar instalación, acceso desde pantalla principal o actualización inicial.

Cambios funcionales incorporados:

- Se agregaron físicamente `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` como figuras geométricas técnicas de respaldo dentro de `assets`.
- `index.html` usa `assets/chater-icon-fallback.png` para favicon y `apple-touch-icon`, evitando una referencia inicial a un PNG no adjunto.
- `manifest.json` usa los PNG geométricos físicos para la instalación inicial y los accesos directos, sin crear PNG finales ni reemplazar los prompts `.txt` existentes.
- `service-worker.js` incluye esos PNG físicos en el shell obligatorio y conserva los PNG finales futuros como assets opcionales: si más adelante se publican los PNG reales en `assets`, el service worker los descarga y cachea antes de fabricar un placeholder.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` a `2026-07-02-pwa-first-load-png-icons-19` para que una PWA instalada detecte el cambio y refresque cache sin reinstalar.

Reglas adicionales de validación:

- Ningún recurso necesario para la primera lectura de instalación debe depender exclusivamente de una imagen final omitida por la regla de prompts.
- Los PNG agregados son placeholders técnicos geométricos, no imágenes finales del producto ni reemplazo de los PNG cubiertos por prompts.
- Los PNG reales futuros siguen teniendo prioridad automática cuando existan físicamente en `assets`.
- La lógica de conversaciones, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático, adjuntos y navegación móvil se preserva sin cambios funcionales.

## 51. Revisión de punto débil: PNG técnicos declarados pero no empaquetados

En esta iteración se volvió a validar el ZIP recibido contra los módulos reales adjuntos. El punto débil principal seguía siendo de empaquetado PWA: `index.html`, `manifest.json` y `service-worker.js` dependían de `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png`, pero esos archivos no estaban físicamente dentro del paquete. Como ambos recursos forman parte de la primera lectura del manifiesto y del `APP_SHELL`, su ausencia puede impedir instalación, cache offline y autoactualización confiable en un static site de Render.com.

Cambios funcionales incorporados:

- Se agregaron `assets/chater-icon-fallback.png` y `assets/chater-maskable-fallback.png` como figuras geométricas técnicas de respaldo, livianas y sin crear PNG finales.
- Se agregaron `assets/chater-icon-fallback.txt` y `assets/chater-maskable-fallback.txt` para que esos recursos PNG también queden documentados con prompt dentro de `assets`.
- Los PNG finales (`chater-icon-192.png`, `chater-icon-512.png` y `chater-maskable-512.png`) siguen sin agregarse como binarios y continúan cubiertos por sus `.txt` homónimos.
- Se incrementaron `app-version.json` y `CHATER_SW_VERSION` a `2026-07-02-pwa-png-assets-packaged-20` para forzar que una PWA instalada vuelva a evaluar el shell estático y pueda cachear los recursos ahora presentes.

Validación aplicada:

- `APP_SHELL` ya no apunta a recursos ausentes dentro del ZIP parcial generado.
- Los PNG agregados no sustituyen las imágenes finales; solo evitan la rotura técnica de instalación inicial mientras faltan los PNG reales.
- Se preserva la lógica existente de chats, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático, adjuntos y navegación móvil.

## 52. Revisión de punto débil: APP_SHELL dependía de PNG opcionales no adjuntos

En esta iteración se identificó como punto débil principal una regresión entre la regla de imágenes opcionales y el modo instalable. El ZIP recibido seguía sin traer físicamente `assets/chater-icon-fallback.png` ni `assets/chater-maskable-fallback.png`, porque el usuario puede aportar esos PNG después y ya existen prompts `.txt` dentro de `assets`. Sin embargo, `service-worker.js` los mantenía dentro de `APP_SHELL`, por lo que `cache.addAll(APP_SHELL)` podía rechazar toda la instalación del service worker al encontrar un recurso ausente.

Cambios funcionales incorporados:

- `APP_SHELL` ahora contiene únicamente archivos obligatorios que sí vienen en el ZIP funcional: HTML, manifiesto, versión, CSS y JavaScript.
- Los PNG técnicos de icono (`chater-icon-fallback.png` y `chater-maskable-fallback.png`) pasan a la lista de assets opcionales junto con PNG futuros y avatares.
- Si un PNG, PNG o avatar existe físicamente en `assets`, el service worker prioriza el recurso real publicado; si no existe, responde con un placeholder geométrico cacheable para mantener la app operativa.
- `manifest.json` conserva rutas de icono compatibles con la futura entrega de PNG reales, pero se elimina una entrada duplicada para evitar ruido en la evaluación PWA.
- Se incrementan `app-version.json` y `CHATER_SW_VERSION` a `2026-07-03-pwa-optional-png-shell-21` para que una instalación existente vuelva a refrescar el shell sin desinstalar.

Reglas adicionales de validación:

- Ningún archivo que pueda faltar por la regla de prompts de imagen debe bloquear `install` del service worker.
- Los assets opcionales deben funcionar en tres estados: archivo real publicado, archivo ausente con placeholder geométrico, y actualización posterior cuando el usuario agregue el archivo real.
- La corrección no modifica la lógica de conversaciones, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático ni navegación móvil.


## 53. Revisión de punto débil: panel de emojis demasiado básico frente a la referencia visual

En esta iteración se identificó como punto débil principal que el panel de emojis existía, pero era solo una cuadrícula pequeña de símbolos. Esa solución cumplía la inserción básica, pero no representaba la referencia visual suministrada en `interface_panel_emogis.png`, donde el panel funciona como una bandeja inferior móvil con búsqueda, modos de contenido, categorías, recientes y acciones rápidas. Para una appWEB tipo WhatsApp instalable, ese panel debía comportarse como una herramienta real del composer y no como un selector decorativo.

Mejora aplicada:

- `js/app.js` incorpora modos funcionales de **Emojis**, **GIF** y **Stickers** desde el mismo panel del composer.
- Se agregan categorías de emojis, historial local de recientes aislado por correo y búsqueda dentro del panel con alias en español para que términos como risa, amor, alerta o adjunto devuelvan resultados útiles.
- Los botones de modo, categoría, emoji, GIF rápido y sticker rápido tienen lógica observable: cambian de vista o insertan contenido en el mensaje activo.
- El historial de emojis recientes se guarda en `localStorage` con clave scoped por correo para no mezclar preferencias entre cuentas.
- El panel se renderiza al abrirse para reflejar recientes actuales y se mantiene cerrado cuando el composer no está disponible.
- `css/styles.css` transforma el panel en una bandeja inferior con estructura similar a la referencia móvil, manteniendo compatibilidad con PC, tablet y móvil.

Criterio de validación nuevo:

- Abrir el botón de emojis debe mostrar búsqueda, selector de modo y categorías.
- Tocar un emoji debe insertarlo en el campo de mensaje y guardarlo como reciente.
- Cambiar a GIF o Stickers debe mostrar tarjetas accionables, no controles muertos.
- La búsqueda debe filtrar el contenido activo sin romper el composer.
- La mejora no debe introducir polling ni depender de imágenes reales en `assets`.

## 54. Revisión de punto débil: compositor de conversación incompleto frente a la referencia móvil

En esta iteración se identificó como punto débil principal que la pantalla de conversación ya tenía mensajes, emojis y adjuntos, pero el compositor seguía más cerca de un formulario web tradicional que de la referencia `interface_chat_conversacion.png`: faltaban accesos directos funcionales de cámara/galería, acciones rápidas y nota de voz, y el botón de envío permanecía visible aunque el campo estuviera vacío. Esto hacía que una parte central de la appWEB móvil no se comportara como una experiencia tipo WhatsApp instalable.

Mejora aplicada:

- `index.html` reorganiza el compositor como una barra móvil: emoji, campo `Mensaje`, adjuntar, cámara/galería, acciones rápidas, micrófono y envío contextual.
- `js/app.js` agrega selector de cámara/galería con `capture=environment`, reutilizando el flujo real de adjuntos con `ImagenesCloudflareR2x` o `MEDIAfirmadaX` y `POST /api/v1/mensajes` cuando memoriaBACKEND esté configurado.
- Se agrega grabación de nota de voz con `MediaRecorder`: tocar el micrófono inicia la grabación, tocar de nuevo la detiene, genera un archivo `audio/webm` y lo envía por el mismo flujo de media. Si el navegador o permisos no lo permiten, la interfaz muestra un aviso de producción sin romper el chat.
- Se agrega un panel de acciones rápidas con textos editables antes de enviar: saludo, pedir detalles, confirmar recibido, compartir correo y solicitar ubicación. Cada botón inserta texto en el composer activo y respeta el chat seleccionado.
- El botón de enviar ahora es contextual: aparece cuando hay texto y el micrófono queda disponible cuando el campo está vacío, imitando el patrón visual de la referencia.
- `css/styles.css` ajusta el layout del composer para PC, tablet y móvil, con estados visuales para grabación de voz y acciones rápidas sin depender de imágenes reales.

Criterio de validación nuevo:

- Con un chat activo, Adjuntar debe abrir selector general de archivos y reutilizar la lógica de media existente.
- Cámara debe abrir selector de imagen/video con preferencia por cámara trasera en móviles compatibles.
- Acciones rápidas debe abrir un modal funcional y cada acción debe insertar texto editable en el mensaje.
- Micrófono debe iniciar/detener grabación cuando el navegador lo permita y enviar el audio como adjunto; si no hay permiso o soporte, debe mostrar error recuperable.
- Enviar debe aparecer solo cuando el campo tenga texto, sin eliminar la posibilidad de enviar por submit/Enter.
- La mejora no debe introducir polling, no debe depender de imágenes reales en `assets` y debe preservar chats, estados, llamadas, herramientas, cola local, `streme`, tema automático y PWA.

## 55. Revisión de punto débil: appWEB instalada sin control funcional de notificaciones

En esta iteración se identificó como punto débil principal que ChatER ya cubría instalación PWA, autoactualización, `streme` sin polling, chats, estados, llamadas, adjuntos y compositor móvil, pero la app instalada no tenía un control visible para activar o probar notificaciones. Para un chat tipo WhatsApp usado desde móvil, PC o tablet, esta ausencia hacía que la sección Herramientas no cubriera una capacidad esencial de appWEB: recibir avisos de mensajes, llamadas y estados cuando la interfaz no está en primer plano.

Mejora aplicada:

- `js/config.js` agrega `PUSH_PUBLIC_KEY` como clave pública VAPID opcional, editable en Render.com sin recompilar el static site.
- `js/app.js` agrega la acción **Notificaciones** dentro de Herramientas, con estado real del permiso del navegador, capacidad PushManager, registro local y modo memoriaBACKEND.
- El botón **Activar notificaciones** solicita permiso con la API `Notification`, intenta usar `navigator.serviceWorker.ready`, crea suscripción push cuando existe `PUSH_PUBLIC_KEY` y registra el dispositivo en `POST /api/v1/push/suscripciones`.
- Si `memoriaBACKEND` está configurado pero no responde, el registro del dispositivo queda en la cola local idempotente aislada por correo mediante la nueva operación `registerDevice`, reemplazando cualquier registro pendiente anterior del mismo dispositivo para evitar suscripciones push obsoletas.
- El botón **Enviar prueba** llama `POST /api/v1/push/enviar` cuando el backend está disponible y, si falla o está en modo demo, muestra una prueba local recuperable para evitar botones decorativos.
- El modal de Perfil y el modal de estado de memoriaBACKEND ahora muestran el estado de notificaciones para que el usuario entienda si el dispositivo está activo, bloqueado o pendiente de sincronización.
- `service-worker.js` agrega handlers `push` y `notificationclick` para mostrar avisos en segundo plano y reenfocar la app en el chat, estado o llamada relacionada cuando la notificación trae esos identificadores.
- `service-worker.js` y `app-version.json` suben a `2026-07-03-notifications-tool-reference-24` para que una PWA instalada detecte la mejora y refresque el shell.

Criterio de validación nuevo:

- Herramientas debe tener una fila visible y funcional de **Notificaciones**.
- Activar notificaciones no debe romper navegadores sin `Notification`, sin `PushManager`, sin service worker listo o sin `PUSH_PUBLIC_KEY`; debe dar mensajes de producción y guardar estado local.
- Una notificación push recibida por el service worker debe mostrar un aviso seguro, limitar texto, rechazar URLs externas y al hacer clic debe abrir o enfocar ChatER.
- Con backend configurado, `POST /api/v1/push/suscripciones` debe ejecutarse o quedar en cola idempotente aislada por correo Gmail validado si falla.
- La prueba debe usar `POST /api/v1/push/enviar` y conservar fallback local para no depender de un backend disponible durante la revisión del static site.
- La mejora no debe introducir polling, no debe depender de imágenes reales en `assets` y debe preservar chats, estados, llamadas, herramientas, cola local, `streme`, tema automático, adjuntos, emojis, compositor móvil y PWA.

## 56. Revisión de punto débil: estados 24h sin caducidad local real

En esta iteración se identificó como punto débil principal que la sección **Estados** ya permitía crear publicaciones visuales y documentaba la visibilidad por 24 horas, pero el cliente estático seguía tratando `expiresAt` principalmente como una etiqueta visual. Si memoriaBACKEND aún no estaba conectado, un estado local podía quedarse visible indefinidamente, contradiciendo la referencia de estados de 24 horas y generando diferencias entre la app instalada y el contrato esperado del backend.

Mejora aplicada:

- `js/app.js` incorpora una duración local explícita de 24 horas para estados (`STATE_VISIBLE_HOURS`) y guarda `expiresAtIso` absoluto al crear un estado nuevo, conservando `expiresAtAt` solo como alias legado.
- Los estados semilla de demostración ahora tienen `createdAt` y `expiresAtIso`, además del alias `expiresAtAt`, por lo que la lista inicial refleja tiempos restantes reales como `24 h`, `18 h` o `12 h` sin depender de datos antiguos persistidos.
- La normalización de estados locales y remotos reconoce variantes de expiración de memoriaBACKEND como `expiresAtIso`, `expiresAtAt`, `expiryAt`, `expireAt`, `endsAt` o `expiresAt` cuando son fechas válidas, priorizando el nombre canónico `expiresAtIso`.
- La lista de Estados, el panel de detalle, los indicadores de actividad y las métricas de Herramientas filtran estados vencidos antes de renderizar.
- Se agregó limpieza periódica local cada minuto para retirar estados expirados mientras la app está abierta, sin introducir polling de mensajes ni consultas repetitivas a memoriaBACKEND.
- Si no existe una fecha de expiración válida en datos heredados, el cliente conserva el estado para no borrar información histórica por inferencia insegura; al guardar nuevos estados sí queda cubierta la regla de 24 horas.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-local-state-expiry-25` para que una PWA instalada refresque el shell y aplique la corrección sin desinstalar.

Criterio de validación nuevo:

- Crear un estado desde el static site debe asignar una expiración absoluta de 24 horas.
- La lista de Estados no debe mostrar estados cuyo `expiresAtIso`, alias `expiresAtAt` o fecha equivalente ya venció.
- El panel de estado debe mostrar tiempo restante relativo, no una etiqueta fija desconectada del vencimiento real.
- La limpieza local debe ejecutarse sin afectar conversaciones, llamadas, cola pendiente, `streme`, notificaciones, adjuntos, compositor móvil, PWA ni tema automático.
- La corrección no debe introducir polling de chats; solo actualiza el estado local de expiración visual.

## 57. Revisión de punto débil: referencias de iconos fuera de la regla PNG

En esta iteración se identificó como punto débil principal una regresión de cumplimiento de assets: el paquete seguía usando rutas de iconos de respaldo con un formato distinto a PNG en `index.html`, `manifest.json`, `service-worker.js`, notificaciones locales y prompts de `assets`. Eso chocaba directamente con la regla del proyecto: todas las imágenes de la appWEB deben resolverse como PNG, deben tener prompt `.txt` en `assets` y no deben depender de otros formatos.

Cambios aplicados:

- `index.html` ahora declara favicon y `apple-touch-icon` como `assets/chater-icon-192.png` con `type="image/png"`.
- `manifest.json` queda limitado a iconos PNG: `chater-icon-192.png`, `chater-icon-512.png` y `chater-maskable-512.png`.
- `service-worker.js` deja de aceptar otros formatos de imagen como fallback de proyecto y genera una respuesta `image/png` geométrica cacheable para iconos PWA ausentes, sin crear archivos binarios dentro de `assets`.
- Las notificaciones de `js/app.js` usan `assets/chater-icon-192.png` y `assets/chater-maskable-512.png`.
- Los prompts `assets/chater-icon-fallback.txt` y `assets/chater-maskable-fallback.txt` fueron corregidos para describir recursos `.png` opcionales.

Criterio de preservación:

- No se crearon imágenes binarias.
- Los PNG reales siguen cubiertos por prompts `.txt` y serán reconocidos automáticamente cuando el usuario los agregue en `assets`.
- Los avatares mantienen el fallback visual de la interfaz con figuras geométricas e iniciales si sus PNG no existen, en vez de depender del fallback PWA genérico.
- El cambio se limita al cumplimiento de imágenes PNG, instalación PWA y notificaciones; no altera la lógica de chats, estados, llamadas, herramientas, sesión, cola local ni streme.

Nota de consolidación de assets: cualquier mención histórica a placeholders físicos queda superada por el contrato vigente de esta iteración. El paquete no debe crear PNG binarios de diseño; debe conservar prompts `.txt`, rutas PNG y fallback geométrico generado por código cuando el binario aún no exista.

## 57. Revisión de punto débil: nombre canónico de expiración de estados

En esta iteración se identificó como punto débil que el contrato de estados 24h usaba el campo `expiresAtAt` como fecha absoluta. Aunque el cliente lo reconocía de forma consistente, el nombre era ambiguo y podía inducir errores en memoriaBACKEND, pruebas de contrato o integraciones futuras.

Mejora aplicada:

- `js/app.js` ahora usa `expiresAtIso` como campo canónico para nuevos estados locales, estados semilla y normalización remota.
- Se conserva `expiresAtAt` como alias legado en lectura y escritura local para no romper estados ya persistidos en `localStorage` ni respuestas antiguas de memoriaBACKEND.
- La resolución de caducidad prioriza `expiresAtIso` y solo después revisa `expiresAtAt`, `expiryAt`, `expireAt`, `endsAt` o `expiresAt`.
- La documentación de `GET/POST /api/v1/publicaciones-efimeras` pasa a recomendar `expiresAtIso`, dejando explícita la compatibilidad con `expiresAtAt` únicamente como transición.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-state-expiry-canonical-27` para que una PWA instalada detecte la corrección del shell estático sin reinstalación.

Criterio de validación nuevo:

- memoriaBACKEND nuevo debe emitir `expiresAtIso` como fecha absoluta de expiración de estados.
- El frontend debe seguir leyendo estados antiguos que lleguen con `expiresAtAt`.
- La limpieza local de 24 horas no debe cambiar su comportamiento visual ni eliminar estados sin una fecha válida.
- La corrección no debe afectar chats, llamadas, adjuntos, emojis, notificaciones, `streme`, PWA, tema automático ni la cola idempotente.

## 58. Revisión de punto débil: identidad visual del encabezado sin logo PNG opcional

En esta iteración se identificó como punto débil principal una brecha visual frente a las imágenes de referencia de `interface`: el encabezado principal y la tarjeta de acceso dependían únicamente de texto o iniciales, pero la referencia muestra una identidad visual de marca junto al nombre **ChatER**. Además, ese recurso no estaba cubierto por la regla de imágenes PNG con prompt dentro de `assets`, por lo que agregarlo después podía quedar sin contrato claro o sin fallback.

Mejora aplicada:

- `index.html` incorpora contenedores de logo de marca en la tarjeta de acceso por correo y en el encabezado principal de la appWEB.
- `assets/chater-logo.txt` documenta el recurso esperado `assets/chater-logo.png` con prompt JSON detallado, tamaño recomendado, uso, restricciones y fallback funcional.
- `js/app.js` agrega `renderBrandLogos()` para intentar cargar automáticamente `assets/chater-logo.png` cuando exista físicamente y conservar una figura geométrica con letras **CE** cuando no exista.
- `css/styles.css` agrega el fallback geométrico de marca sin SVG ni imágenes binarias, con forma de escudo/cristal compatible con modo claro, modo oscuro y encabezado móvil.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-brand-logo-png-prompt-28` para que una PWA instalada detecte el cambio y actualice el shell sin reinstalar.

Criterio de validación nuevo:

- El logo principal debe estar cubierto por prompt `.txt` dentro de `assets` y debe resolverse como PNG cuando el usuario agregue `assets/chater-logo.png`.
- La interfaz no debe romperse si el PNG aún no existe; debe mostrar fallback geométrico de producción.
- No se deben crear imágenes binarias ni usar SVG.
- La corrección no debe alterar chats, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático, PWA, notificaciones, adjuntos ni expiración de estados 24h.

## 59. Revisión de punto débil: service worker no excluía todas las APIs documentadas

En esta iteración se identificó como punto débil principal una brecha entre la documentación de APIs necesarias de `memoriaBACKEND` y la frontera de cache del service worker. El archivo `service-worker.js` ya dejaba pasar rutas críticas de backend, pero no cubría todos los prefijos runtime documentados. Si en producción Render.com o un proxy publicaban memoriaBACKEND bajo el mismo origen del static site sin prefijo canónico, algunas consultas GET podían caer en la estrategia de cache estática y devolver respuestas obsoletas o respuestas 504 de recurso estático, en vez de llegar siempre al backend. Si en producción Render.com o un proxy publicaban memoriaBACKEND bajo el mismo origen del static site sin prefijo `/api`, algunas consultas GET podían caer en la estrategia de cache estática y devolver respuestas obsoletas o respuestas 504 de recurso estático, en vez de llegar siempre al backend.

Mejora aplicada:

- `service-worker.js` amplía `backendPrefixes` para excluir prefijos runtime adicionales cuando compartan origen con la appWEB, manteniéndolos como exclusión defensiva de cache y no como APIs que el static site deba consumir.
- La regla existente que excluye peticiones `Accept: text/event-stream` se conserva para proteger `streme` en modo SSE.
- Los métodos no GET continúan sin ser interceptados, pero ahora las lecturas runtime documentadas también quedan fuera del cache aunque usen el mismo dominio.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-runtime-api-prefixes-29` para que una PWA ya instalada detecte el nuevo shell y actualice sin reinstalar.

Criterio de validación nuevo:

- Ninguna API documentada de memoriaBACKEND debe depender del cache del static site cuando esté bajo el mismo origen.
- El service worker debe limitarse a recursos estáticos de ChatER y a los PNG opcionales de `assets` con fallback geométrico.
- La mejora no cambia la lógica de chats, estados, llamadas, herramientas, cola local, `streme`, autenticación Google/Gmail, tema automático, PWA, notificaciones, adjuntos, emojis ni assets PNG opcionales.

## 60. Revisión de punto débil: encabezado de conversación sin menú contextual funcional

En esta iteración se identificó como punto débil principal una diferencia directa frente a las referencias de `interface_chat_conversacion.jpg`: el encabezado de una conversación ya tenía regreso, avatar, llamadas, fijado y archivado, pero no tenía el menú contextual de tres puntos visible y funcional que concentra acciones secundarias del chat. Eso dejaba la interfaz menos parecida al patrón tipo WhatsApp y obligaba a exponer acciones de administración como botones sueltos, sin un punto único de opciones de conversación.

Mejora aplicada:

- `index.html` agrega el botón `conversationMenuButton` con icono `⋮` dentro del encabezado de conversación.
- `js/app.js` conecta ese botón con un modal de **Opciones de conversación** y lo habilita o deshabilita según exista una conversación activa.
- El menú permite abrir **Información del chat**, **Buscar en conversación**, **Fijar/Desfijar** y **Archivar/Restaurar** usando la lógica existente de conversación para no duplicar procesos.
- La búsqueda funciona sobre el historial local ya cargado, muestra resultados de mensajes o adjuntos, enfoca el mensaje encontrado en la conversación y no introduce polling ni llamadas repetitivas a memoriaBACKEND.
- La información del chat muestra correo, estado, mensajes locales, no leídos, fijado, estado de hidratación y último mensaje con textos de producción.
- Las acciones de fijar y archivar reutilizan `setConversationPinned` y `setConversationArchived`, por lo que conservan idempotencia, cola local, parches hacia `PATCH /api/v1/conversaciones/{conversationId}` y sincronización posterior.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-conversation-overflow-menu-30` para que la PWA instalada detecte y aplique el nuevo shell sin reinstalar.

Criterio de validación nuevo:

- El encabezado de conversación debe tener un botón de tres puntos funcional como en la referencia móvil.
- El menú no debe abrirse sin chat activo y no debe romper el modo estados, llamadas o herramientas.
- Buscar en conversación debe operar sobre mensajes locales cargados sin polling y debe llevar visualmente al mensaje seleccionado cuando siga cargado en pantalla.
- Fijar, desfijar, archivar y restaurar desde el menú deben preservar la misma lógica ya existente de sincronización con memoriaBACKEND.
- La mejora no debe afectar autenticación Google/Gmail, tema automático, `streme`, PWA, notificaciones, adjuntos, emojis, estados 24h, llamadas, herramientas, assets PNG opcionales ni cola idempotente.

## 61. Revisión de punto débil: búsqueda de chats no iniciaba conversaciones por correo

En esta iteración se identificó como punto débil principal una inconsistencia funcional en la lista principal de chats: el campo de búsqueda comunicaba una intención de **buscar o iniciar un chat**, pero cuando el usuario escribía un correo electrónico válido sin resultados solo veía un estado vacío genérico y debía usar el botón `+`. Esto dejaba incompleta la regla de acceso por correo electrónico y hacía que el buscador móvil fuera menos útil que una app de mensajería instalada.

Mejora aplicada:

- `js/app.js` agrega validación local de correo mediante `isValidEmailAddress()` reutilizando la normalización de identidad existente.
- La lista de chats ahora muestra una acción directa **Crear chat con correo@dominio.com** cuando la búsqueda no devuelve resultados y el texto escrito es un correo válido.
- La nueva acción reutiliza `getOrCreateConversationByEmail()` para no duplicar procesos de creación, mantener el aislamiento por correo y conservar la cola idempotente `POST /api/v1/conversaciones` cuando memoriaBACKEND está configurado.
- Si el correo pertenece a un chat archivado, la acción lo restaura con la lógica existente de `setConversationArchived()` antes de abrirlo, preservando `PATCH /api/v1/conversaciones/{conversationId}` y la sincronización posterior.
- Para búsquedas que no son correo válido, el estado vacío ofrece **Nuevo chat por correo** y abre el modal existente de creación, sin inventar otro flujo.
- `css/styles.css` añade espaciado de producción para las acciones del estado vacío sin alterar el layout general de listas, estados, llamadas o herramientas.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-search-email-start-chat-31` para que una PWA instalada detecte el cambio y actualice el shell sin reinstalar.

Criterio de validación nuevo:

- El buscador de la lista principal debe poder iniciar una conversación cuando recibe un correo válido sin resultados.
- La creación desde búsqueda debe reutilizar la lógica existente de conversación local y cola hacia memoriaBACKEND.
- Los chats archivados encontrados por correo deben poder restaurarse y abrirse sin perder mensajes.
- La mejora no debe afectar autenticación Google/Gmail, tema automático, `streme`, PWA, notificaciones, adjuntos, emojis, estados 24h, llamadas, herramientas, assets PNG opcionales ni el menú contextual de conversación.


## 62. Revisión de punto débil: accesos directos PWA y notificaciones abrían siempre la vista por defecto

En esta iteración se identificó como punto débil principal una brecha de comportamiento de appWEB instalada: ChatER ya tenía PWA, actualización automática, notificaciones, navegación inferior y secciones tipo WhatsApp, pero al abrir la app desde un acceso directo, hash, query o notificación con destino específico no existía un enrutamiento interno de arranque. En la práctica, una apertura como `#calls`, `#states`, `#tools`, `?chatId=...`, `#chat=...`, `#state=...` o `#call=...` podía terminar en la lista de chats por defecto, aunque el static site y el service worker hubieran abierto la URL correcta.

Mejora aplicada:

- `js/app.js` agrega un parser de enlaces profundos compatible con hash y query, sin backend local y sin polling.
- El arranque de sesión aplica el enlace profundo antes de renderizar la vista por defecto, por lo que la app instalada puede abrir directamente llamadas, novedades, herramientas, un chat, un estado o una llamada local disponible.
- Se agrega manejo de `hashchange` para que los accesos internos o externos cambien de sección mientras la app sigue abierta.
- El click de notificaciones reutiliza el nuevo enrutamiento cuando llega una URL objetivo; conserva primero la lógica específica por `chatId`, `stateId` o `callId` enviada en `data`.
- `manifest.json` incorpora accesos directos instalables para **Llamadas**, **Novedades** y **Herramientas**, además del acceso existente a **Chats**.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-deep-link-launch-routing-32` para que una PWA instalada detecte el cambio y actualice el shell sin reinstalar.

Criterio de validación nuevo:

- La appWEB instalada no debe quedar siempre en la lista de chats cuando se abre desde un acceso directo o URL con destino específico.
- Los destinos soportados deben ser `chats`, `calls`, `states`, `tools`, `chat/chatId`, `state/stateId` y `call/callId`, usando hash o query.
- Si el destino local no existe todavía, la interfaz debe degradar a la sección correcta con un aviso recuperable, sin romper sesión ni borrar datos.
- La mejora no debe afectar autenticación Google/Gmail, tema automático, `streme`, PWA, notificaciones push, adjuntos, emojis, estados 24h, llamadas, herramientas, assets PNG opcionales, cola idempotente ni el menú contextual de conversación.

## 63. Revisión de punto débil: adjuntos de conversación sin previsualización visual real

En esta iteración se identificó como punto débil principal una brecha directa frente a `interface_chat_conversacion.jpg` y `interface_panel_emogis.jpg`: los botones de adjuntar, cámara/galería y nota de voz ya ejecutaban lógica funcional, pero el resultado dentro de la conversación se veía como una ficha genérica de archivo. Eso hacía que una foto, video o audio enviado no se comportara visualmente como una app de chat tipo WhatsApp, aunque el flujo de subida hacia memoriaBACKEND existiera.

Mejora aplicada:

- `js/app.js` ahora renderiza adjuntos de mensaje como previsualizaciones reales cuando el mensaje tiene `mediaPreviewDataUrl` local o `mediaUrl` remoto.
- Las imágenes se muestran dentro de la burbuja con carga diferida y fallback geométrico si la fuente aún no existe o falla.
- Los videos y audios usan controles nativos del navegador, manteniendo un fallback visual cuando no pueden cargarse.
- `sendMediaAttachment()` genera una previsualización local limitada por `MESSAGE_MEDIA_PREVIEW_MAX_BYTES` antes de guardar el mensaje, para que cámara, galería, adjuntos y notas de voz tengan respuesta visual inmediata en modo demo local y en modo memoriaBACKEND.
- `persistState()` conserva el estado completo cuando el navegador lo permite y degrada a una versión compacta sin `mediaPreviewDataUrl` si el almacenamiento local se queda sin cuota, evitando que una imagen o audio grande rompa el chat.
- La normalización de mensajes remotos conserva `mediaUrl`, `mediaKind`, `mediaName`, `mediaSizeBytes`, `mediaPreviewDataUrl` y `mediaSyncStatus`, de forma que las respuestas de memoriaBACKEND y los eventos `streme` no pierdan la información visual del adjunto.
- `css/styles.css` incorpora estilos de burbuja multimedia, fallback geométrico, captions de estado y controles responsive sin SVG ni imágenes binarias nuevas.
- `js/config.js` expone `MESSAGE_MEDIA_PREVIEW_MAX_BYTES` para ajustar el peso máximo de previsualización local sin recompilar el static site.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-message-media-previews-33` para que la PWA instalada detecte y aplique el nuevo shell sin reinstalar.

Criterio de validación nuevo:

- Al usar el botón de adjuntar o cámara con una imagen pequeña, la conversación debe mostrar una burbuja visual con la imagen y no solo un chip de archivo.
- Al grabar una nota de voz, la conversación debe mostrar una burbuja de audio con controles cuando el navegador lo permita.
- Los mensajes de media recibidos desde memoriaBACKEND o `streme` deben conservar `mediaUrl` y metadatos para renderizarse visualmente.
- Si la fuente de media no está disponible, la app debe mostrar un fallback geométrico funcional y textos de producción.
- La mejora no debe crear archivos PNG binarios, no debe usar SVG, no debe introducir polling y no debe afectar autenticación Google/Gmail, tema automático, PWA, notificaciones, estados 24h, llamadas, herramientas, navegación profunda, cola idempotente ni aislamiento por correo.

## 64. Revisión de punto débil: Herramientas no representaba la referencia comercial móvil

En esta iteración se identificó como punto débil principal que la sección **Herramientas** ya tenía controles técnicos de PWA, APIs, tema, notificaciones y sesión, pero no reflejaba suficientemente la pantalla de referencia `interface herramientas.jpg`, donde la experiencia muestra métricas de rendimiento y herramientas comerciales tipo app móvil. El resultado anterior era funcional para administración técnica, pero dejaba incompleta una parte visible de la interfaz solicitada y concentraba acciones de negocio fuera del patrón visual esperado.

Mejora aplicada:

- `js/app.js` agrega un estado local `business` aislado por correo dentro del mismo estado persistente de ChatER, con métricas, verificación, catálogo, campañas, difusiones, pedidos y actividad reciente.
- La sección **Herramientas** ahora muestra **Rendimiento de los últimos 7 días** con tarjetas de conversaciones iniciadas, visualizaciones de catálogo y visualizaciones de estado.
- Se agrega el bloque **Haz crecer tu empresa** con filas funcionales: **Cuenta verificada**, **Catálogo**, **Anuncios publicitarios**, **Administra anuncios**, **Difusiones comerciales** y **Pedidos**.
- Cada fila abre un modal con lógica real y textos de producción: solicitar verificación, crear productos/servicios, crear campañas, sincronizar campañas, preparar difusiones y registrar pedidos por correo.
- Las acciones comerciales se guardan localmente, se reflejan inmediatamente en la interfaz y, cuando `MEMORIA_BACKEND_URL` está configurado, quedan en cola idempotente como `businessToolAction` para sincronizar con `POST /tools/{toolId}/actions`.
- Se conserva el bloque **Administración de ChatER** para no perder la lógica existente de tema automático, estados, APIs, instalación PWA, notificaciones, actualización y cierre de sesión.
- `css/styles.css` agrega agrupación visual de herramientas, tarjetas de métricas más cercanas a la referencia móvil, listas de resumen y formularios de negocio responsive sin SVG ni imágenes binarias nuevas.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-business-tools-reference-34` para que la PWA instalada detecte y aplique el nuevo shell sin reinstalar.

Contrato adicional sugerido para memoriaBACKEND:

- `POST /tools/business-verified/actions` para solicitudes de verificación y estado de revisión humana.
- `POST /tools/catalog/actions` para crear, actualizar o sincronizar productos/servicios del catálogo.
- `POST /tools/ads-create/actions` para crear borradores de campañas y validar cumplimiento.
- `POST /tools/ads-manage/actions` para sincronizar campañas y métricas.
- `POST /tools/broadcasts/actions` para preparar o enviar difusiones con consentimiento y límites antiabuso.
- `POST /tools/orders/actions` para registrar pedidos, estados, pagos y notificaciones.

Criterio de validación nuevo:

- La pestaña **Herramientas** debe parecerse más a la referencia móvil mostrando métricas, encabezado comercial y filas de crecimiento empresarial.
- Ninguna fila comercial debe ser decorativa: todas deben abrir una acción, modificar estado local o preparar sincronización con memoriaBACKEND.
- Las acciones de negocio deben funcionar en modo demo local y en modo memoriaBACKEND sin introducir polling.
- La lógica técnica existente de herramientas no debe desaparecer ni cambiar de comportamiento.
- La mejora no debe afectar autenticación Google/Gmail, tema automático, `streme`, PWA, notificaciones, adjuntos, emojis, estados 24h, llamadas, navegación profunda, cola idempotente ni assets PNG opcionales.


## 65. Revisión de punto débil: contrato de herramientas comerciales incompleto frente a la interfaz real

En esta iteración se identificó como punto débil principal que la interfaz ya había convertido **Herramientas** en una sección móvil comercial funcional, pero la documentación de `memoriaBACKEND` seguía describiendo solo un endpoint genérico `POST /tools/{toolId}/execute`. Eso dejaba una brecha de integración: las filas reales **Cuenta verificada**, **Catálogo**, **Anuncios publicitarios**, **Administra anuncios**, **Difusiones comerciales** y **Pedidos** encolan acciones como `businessToolAction` y las sincronizan con `POST /tools/{toolId}/actions`, pero el contrato público no definía payloads, `toolId` permitidos, deduplicación, métricas ni endpoints opcionales por proceso.

Mejora aplicada:

- `docs/memoriaBACKEND_APIS.md` ahora documenta el contrato canónico `POST /tools/{toolId}/actions` usado por la cola idempotente real del frontend.
- Se agregan `GET /tools/business/metrics?window=7d` y `GET /tools/business/summary` para hidratar métricas y estado comercial en producción.
- Se definen los `toolId` iniciales: `business-verified`, `catalog`, `ads-create`, `ads-manage`, `broadcasts` y `orders`.
- Se especifican reglas de backend para deduplicación por `clientMutationId`, auditoría, permisos por correo autenticado, revisión de anuncios/difusiones y reconciliación de IDs reales.
- La cola local documentada incluye ahora las acciones comerciales visibles, evitando que la interfaz y memoriaBACKEND evolucionen con contratos distintos.
- El mapa funcional de botones queda alineado con las acciones comerciales ya presentes en la appWEB.
- `service-worker.js` amplía la exclusión de rutas API de negocio para que futuros endpoints same-origin como `/business/...`, `/catalog/...`, `/ads/...`, `/broadcasts/...` u `/orders/...` no sean cacheados como recursos estáticos.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-business-tools-api-contract-35` para que el paquete actualizado sea rastreable y la PWA instalada pueda detectar el cambio.

Criterio de validación nuevo:

- Toda herramienta comercial visible debe tener contrato de API documentado y compatible con la cola local actual.
- La documentación debe distinguir entre el endpoint canónico conectado al static site y los endpoints directos opcionales que memoriaBACKEND podría separar por proceso.
- Las rutas de API futuras de negocio no deben quedar bajo estrategia de cache estática del service worker si se sirven desde el mismo origen.
- La mejora no debe cambiar la lógica de autenticación Google/Gmail, tema automático, `streme`, PWA, notificaciones, adjuntos, emojis, estados 24h, llamadas, navegación profunda, assets PNG opcionales ni botones existentes.

## 66. Revisión de punto débil: encabezado móvil de conversación saturado

En esta iteración se identificó como punto débil principal una diferencia visual y funcional frente a `interface_chat_conversacion.jpg`: el encabezado móvil de una conversación estaba mostrando al mismo tiempo llamadas, fijar, archivar y el menú de tres puntos. Aunque todos los botones funcionaban, en pantallas móviles estrechas esa acumulación podía comprimir el nombre del contacto y alejar la interfaz del patrón de la referencia, donde las acciones secundarias quedan concentradas en el menú contextual.

Mejora aplicada:

- `css/styles.css` ajusta el encabezado de conversación en móvil para conservar visibles las acciones principales de llamada de voz, videollamada y menú de tres puntos.
- En móvil, los botones directos de fijar y archivar dejan de ocupar espacio en el encabezado porque esas mismas acciones ya están disponibles y conectadas dentro de **Opciones de conversación**.
- Se redujo el tamaño de los botones del encabezado móvil y se controló el espacio de acciones para que el nombre y estado del contacto mantengan truncado correcto sin romper el layout.
- La lógica existente de fijar, desfijar, archivar y restaurar no se elimina; sigue disponible por menú contextual y se mantiene visible en escritorio.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-mobile-conversation-header-actions-36` para que una PWA instalada detecte el CSS actualizado y pueda autoactualizarse sin reinstalación.

Criterio de validación nuevo:

- El encabezado móvil de conversación debe parecerse más a la referencia: regreso, avatar, datos del contacto, llamada de voz, videollamada y menú contextual.
- Las acciones secundarias no deben desaparecer: fijar/desfijar y archivar/restaurar deben seguir funcionando desde el menú de tres puntos.
- En escritorio se conservan los botones directos porque hay espacio suficiente y no degradan la experiencia.
- La mejora no debe alterar autenticación Google/Gmail, tema automático, `streme`, PWA, notificaciones, adjuntos, emojis, estados 24h, llamadas, herramientas comerciales, navegación profunda, cola idempotente ni assets PNG opcionales.



## 67. Revisión de punto débil: botón de tres puntos sin menú contextual por sección

En esta iteración se identificó como punto débil principal que el botón de tres puntos de la cabecera principal estaba funcionando como acceso directo a **Herramientas**, pero en las referencias móviles de `interface principal lista de chats.jpg`, `interface estados imagenes 24h.jpg`, `interface llamadas.jpg` y `interface herramientas.jpg` ese icono representa un menú contextual de la sección visible. Aunque el botón anterior no estaba roto, reducía la similitud con el patrón tipo WhatsApp y obligaba a depender de la barra inferior para llegar a opciones secundarias.

Cambios aplicados:
- El botón `toolsButton` ahora abre un menú contextual modal con acciones distintas según la sección activa: chats, novedades, llamadas o herramientas.
- En **Chats** el menú permite crear chat por correo, abrir archivados, crear estado, abrir perfil, herramientas, estado de memoriaBACKEND y cerrar sesión.
- En **Novedades** el menú permite añadir estado, promocionar el estado activo, abrir perfil, herramientas, estado de memoriaBACKEND y cerrar sesión.
- En **Llamadas** el menú permite iniciar llamada, programar llamada, abrir teclado por correo, abrir perfil, herramientas, estado de memoriaBACKEND y cerrar sesión.
- En **Herramientas** el menú permite instalar la app, actualizarla, configurar notificaciones, abrir perfil, revisar APIs y cerrar sesión.
- Se preservó la navegación inferior hacia Herramientas y todas las funciones existentes; solo se corrigió el comportamiento del botón superior para que sea contextual.
- Se agregaron estilos mínimos para que las acciones del menú usen el mismo lenguaje visual de las filas de herramientas sin modificar el resto de la interfaz.
- Se actualizó `app-version.json` y `CHATER_SW_VERSION` para que la PWA instalada detecte la nueva versión del static site.

Validación funcional:
- El botón de tres puntos conserva accesibilidad mediante `aria-label` y `title` de menú de opciones.
- Las acciones nuevas reutilizan funciones existentes (`openNewChatModal`, `openArchivedChatsModal`, `openCreateStatusModal`, `openPromoteStatusModal`, `openCallStarterModal`, `openScheduleCallModal`, `openCallKeypadModal`, `openProfileModal`, `handleToolAction` y `selectSection`) para evitar duplicar lógica.
- No se añadieron imágenes, no se introdujo ningún formato vectorial prohibido y se mantiene la regla de assets PNG opcionales con prompts `.txt`.
- Canon actual de assets: el ZIP funcional puede venir sin binarios PNG finales; los nombres PNG referenciados tienen prompt `.txt` en `assets` y el fallback visual se resuelve con figuras geométricas CSS o respuestas generadas por el service worker cuando aplica.
- La modificación es incremental y no altera la lógica de `streme`, autenticación Google/Gmail, PWA, estados 24h, llamadas ni adjuntos.

Estado:
- Avance parcial robusto. La interfaz queda más alineada con las capturas móviles, pero la frase `YA ESTA LISTO` no se emite porque se entrega ZIP con módulos afectados y Nova debe volver a ejecutar la validación completa sobre el proyecto actualizado.

## 68. Revisión de punto débil: estados visuales podían saturar `localStorage`

En esta iteración se identificó como punto débil principal el almacenamiento local de estados visuales de 24 horas. La interfaz ya permitía crear estados con imagen o video y conservar una previsualización local para funcionar sin backend, pero el mecanismo compacto solo retiraba `mediaPreviewDataUrl` de mensajes de chat. Si el usuario creaba varios estados visuales, el JSON persistido podía superar la cuota del navegador en móvil y provocar que `localStorage.setItem` fallara también durante el guardado compacto.

Cambios aplicados:

- `js/app.js` ahora compacta también los estados de 24 horas eliminando `state.mediaPreviewDataUrl` cuando el almacenamiento completo excede la cuota.
- Se separó la compactación en helpers (`compactConversationForPersistence`, `compactMessageForPersistence` y `compactStateForPersistence`) para no duplicar lógica ni alterar el estado en memoria que está usando la interfaz.
- Se agregó un guardado de emergencia si incluso el estado compacto falla: conserva conversaciones, estados, llamadas y actividad comercial reducida, sin previsualizaciones pesadas, para evitar que una app instalada quede bloqueada por almacenamiento lleno.
- Los estados visuales compactados siguen renderizando un fallback geométrico con nombre/tipo de archivo cuando ya no existe una previsualización local, y si memoriaBACKEND devuelve `mediaUrl` o el PNG real existe, la visualización real mantiene prioridad.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-status-media-storage-38` para que una PWA instalada detecte el cambio y refresque el shell sin reinstalación.

Validación funcional:

- No se agregaron imágenes binarias, SVG ni rutas fuera de `assets`.
- No se modificó la lógica de autenticación Google/Gmail, `streme`, llamadas, herramientas comerciales, archivados, fijados, emojis, service worker de APIs runtime ni contratos de memoriaBACKEND.
- La mejora afecta solo persistencia local y actualización de versión; el estado visible en memoria se conserva mientras la sesión está abierta.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 69. Revisión de punto débil: arranque bloqueable por almacenamiento persistente restringido

En esta iteración se identificó como punto débil principal la dependencia directa de `localStorage` durante el arranque y durante procesos de sesión, cola, tokens, dispositivo, notificaciones, emojis, `streme` y control de versión PWA. Aunque ya existían compactaciones para evitar saturación por multimedia, varios accesos de lectura o escritura podían lanzar excepciones cuando el navegador móvil ejecuta la app instalada en modo privado, con almacenamiento restringido, políticas corporativas, perfil bloqueado o cuota denegada antes de que ChatER pudiera renderizar la interfaz.

Cambios aplicados:

- `js/app.js` incorpora una capa segura de almacenamiento con fallback temporal en memoria para lecturas, escrituras y eliminaciones.
- El arranque por correo ya no depende de que `localStorage.getItem()` esté disponible; si el almacenamiento persistente falla, la interfaz puede abrir sesión demo o pedir autenticación real sin romper el shell estático.
- Las escrituras críticas de estado conservan el comportamiento anterior de lanzar error controlado para que `persistState()` siga intentando estado completo, compacto y de emergencia cuando la cuota falla.
- Tokens, sesión, dispositivo, cola de outbox, preferencias efímeras de emojis, estado de notificaciones y `lastEventId` de `streme` usan la misma protección sin mezclar correos ni alterar la idempotencia ya existente.
- `js/pwa.js` agrega una capa equivalente para recordar la versión publicada sin bloquear instalación ni actualización cuando el almacenamiento persistente no está disponible.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-storage-guard-fallback-39` para que una PWA instalada pueda detectar el cambio y refrescar el shell sin reinstalación.

Validación funcional:

- No se agregaron imágenes binarias, SVG ni rutas fuera de `assets`.
- No se modificó la interfaz visual, el flujo de autenticación Google/Gmail, `streme`, APIs documentadas, estados 24h, llamadas, adjuntos, emojis, herramientas comerciales, navegación profunda ni prompts de PNG.
- La mejora solo endurece la base de almacenamiento para que el static site siga funcionando en móviles donde la persistencia local esté bloqueada o falle.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.


## 70. Revisión de punto débil: contrato de prompts PNG incompleto para avatar genérico

En esta iteración se identificó como punto débil principal una inconsistencia de cumplimiento en la regla de imágenes: la documentación y la normalización segura de assets aceptan rutas como `assets/avatar.png` para un avatar genérico entregado por memoriaBACKEND o por datos heredados, pero el ZIP no incluía el prompt `.txt` homónimo dentro de `assets`. Aunque la interfaz podía seguir funcionando gracias al placeholder circular con iniciales, esa ausencia dejaba un recurso PNG posible sin su contrato visual documentado.

Cambio aplicado:

- Se agregó `assets/avatar.txt` como prompt JSON detallado para `assets/avatar.png`, cubriendo el avatar genérico opcional sin crear imagen binaria.
- Se preservan los prompts específicos existentes (`avatar-carlos.png`, `avatar-familia.png`, `avatar-equipo-trabajo.png`, `avatar-soporte.png`) y los prompts de iconos/logo PWA.
- No se agregaron PNG reales, SVG, WebP, JPG ni rutas fuera de `assets`.
- No se modificó la lógica de chats, estados, llamadas, herramientas, autenticación Google/Gmail, `streme`, PWA, service worker, cola idempotente, tema automático ni compositor móvil.
- No se incrementó `app-version.json` porque no cambió el shell cacheado ni código ejecutable; el ajuste cubre documentación/contrato de assets para futuras imágenes del usuario.

Validación funcional:

- Toda ruta PNG referenciada de forma directa por HTML, manifiesto, JavaScript, service worker o documentación queda cubierta por un `.txt` homónimo en `assets`.
- Si `assets/avatar.png` no existe, ChatER mantiene el fallback visual con iniciales.
- Si el usuario agrega `assets/avatar.png` más adelante, la normalización existente lo acepta automáticamente como PNG seguro dentro de `assets`.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.


## 53. Revisión de punto débil: sincronización real con APIs canónicas de memoriaBACKEND

En esta iteración se identificó como punto débil principal que el static site ya tenía capa de sincronización, cola local, estados optimistas y documentación de memoriaBACKEND, pero el cliente seguía usando rutas heredadas propias de chats, estados, llamadas, dispositivos, media, notificaciones y realtime. Ese contrato no coincidía con el catálogo canónico adjunto en `APIS de memoriaBACKEND/apis.txt`, donde las APIs equivalentes están montadas principalmente bajo `/api/v1` y requieren aislamiento por `siteId`, cabecera `X-MB-Site`, cabecera `X-Hashinmy-Action:webapp` en mutaciones e idempotencia explícita.

### Cambios aplicados

- `js/app.js` mantiene la lógica local existente, pero cambia los procesos equivalentes al contrato de `APIS de memoriaBACKEND`: autenticación Google/Gmail mediante `AUTENTICACIONx`, perfil, conversaciones, mensajes, lectura de mensajes, señales efímeras, media firmada, publicaciones efímeras, vistas de contenido, sesiones de comunicación, STREMEx y push.
- Los procesos que sí tienen equivalencia validada en `APIS de memoriaBACKEND` quedan documentados con sus rutas canónicas; promoción de estado usa `PATCH /api/v1/publicaciones-efimeras/{stateId}` y acciones comerciales usan `POST /api/v1/landing-tools/evento`, evitando conservar rutas heredadas cuando existe bloque equivalente.
- El cliente agrega `s={siteId}` a las URLs, `X-MB-Site`, `X-Hashinmy-Action:webapp` en mutaciones y `X-MB-Idempotency-Key` cuando existe `clientMutationId`.
- `STREME_REALTIME_URL` ahora es opcional: si no se configura, el static site deriva SSE desde `/api/v1/streme/eventos` y escucha eventos nombrados `streme-event`, `streme-message`, `streme-ready` y `streme-heartbeat`.
- `js/config.js` expone `MEMORIA_SITE_ID`, `MEMORIA_API_PREFIX` y `STREME_CHANNEL` sin obligar a recompilar el static site de Render.com.
- `service-worker.js` y `app-version.json` cambian de versión para evitar que una PWA instalada mantenga en cache el contrato anterior.

### Mapa de procesos sincronizados

| Proceso del static site | API canónica usada |
|---|---|
| Iniciar acceso Google/Gmail | `GET /auth/login?s={siteId}` + `GET /login.js?s={siteId}` |
| Crear sesión desde Google/Firebase | `POST /auth/firebase/session?s={siteId}` |
| Refrescar/cerrar sesión | `POST /auth/refresh`, `POST /auth/logout` |
| Perfil | `GET /api/v1/perfil-usuario?s={siteId}` |
| Conversaciones | `GET/POST/PATCH /api/v1/conversaciones?s={siteId}` |
| Mensajes | `GET/POST /api/v1/mensajes?s={siteId}` |
| Marcar leído | `POST /api/v1/interacciones-mensaje?s={siteId}` |
| Escribiendo efímero | `POST /api/v1/senales-efimeras?s={siteId}` |
| Presencia online/offline | `POST /api/v1/presencia-usuario?s={siteId}` |
| Adjuntos/media genérica | `POST /api/v1/media-firmada?s={siteId}` + `PATCH /api/v1/media-firmada/{mediaId}?s={siteId}` + `GET /api/v1/media-firmada/{mediaId}/leer?s={siteId}` |
| Estados | `GET/POST /api/v1/publicaciones-efimeras?s={siteId}` |
| Vistas de estados | `POST /api/v1/vistas-contenido?s={siteId}` |
| Llamadas y programación | `GET/POST /api/v1/sesiones-comunicacion?s={siteId}` |
| Realtime | `GET/POST /api/v1/streme/eventos?s={siteId}` |
| Push del dispositivo | `POST /api/v1/push/suscripciones?s={siteId}` |
| Prueba de push | `POST /api/v1/push/enviar?s={siteId}` |

### Criterios que deben mantenerse

- No modificar ningún archivo dentro de `APIS de memoriaBACKEND`.
- No eliminar la cola local ni el modo demostración: siguen siendo fallback cuando el backend no está configurado o falla.
- Mantener el proyecto como static site de Render.com: `MEMORIA_BACKEND_URL` apunta al backend externo y el service worker no cachea rutas runtime de memoriaBACKEND.
- Cualquier futura sustitución de API debe compararse primero contra `APIS de memoriaBACKEND/apis.txt`; si no existe un proceso equivalente, debe conservarse la API actual.

## 54. Revisión de punto débil: imágenes temporales WebP con ImagenesCloudflareR2x

En esta iteración se identificó como punto débil principal que ChatER ya usaba el contrato canónico `/api/v1/media-firmada` para adjuntos y estados, pero `APIS de memoriaBACKEND/apis.txt` ahora define un bloque más específico para el mismo proceso cuando el recurso es una imagen temporal optimizable desde navegador: `ImagenesCloudflareR2x`, montado en `/api/v1/imagenes-r2x`. Mantener todas las imágenes en `MEDIAfirmadaX` funcionaba como fallback genérico, pero desaprovechaba la política cerrada de memoriaBACKEND para imágenes WebP económicas en Cloudflare R2, con límite de 250 KB, confirmación de objeto real y URL de lectura controlada.

### Cambios aplicados

- `js/app.js` conserva `MEDIAfirmadaX` para audio, video, documentos, GIF/SVG no convertibles y cualquier archivo sin API más específica.
- Las imágenes de adjuntos de chat y estados visuales ahora se convierten en el navegador a WebP temporal antes de contactar el backend.
- El flujo equivalente usa `POST /api/v1/imagenes-r2x/intenciones`, subida directa a la URL firmada devuelta, `POST /api/v1/imagenes-r2x/{imageId}/confirmar` y, cuando hace falta, `POST /api/v1/imagenes-r2x/{imageId}/url-descarga`.
- Se mantiene `s={siteId}`, `X-MB-Site`, `X-Hashinmy-Action:webapp`, `X-MB-Idempotency-Key`, `credentials: include` y la cola idempotente ya existente para crear el mensaje cuando la subida fue confirmada pero falla el registro del mensaje.
- `js/config.js` expone `ENABLE_R2X_IMAGE_UPLOADS` y `TEMP_IMAGE_R2X_MAX_BYTES` para despliegues static site en Render.com sin recompilar.
- `app-version.json` cambia de versión para evitar que una PWA instalada use la estrategia anterior cacheada.

### Mapa actualizado de adjuntos

| Tipo de recurso | API usada |
|---|---|
| Imagen PNG/JPG/WebP/BMP convertible desde navegador | `POST /api/v1/imagenes-r2x/intenciones` + confirmar + URL de lectura |
| Audio, video, documentos y archivos no convertibles | `POST /api/v1/media-firmada` |
| GIF/SVG | Se conserva en `MEDIAfirmadaX` para no romper animación ni vectorialidad |

### Criterios que deben mantenerse

- No modificar ningún archivo dentro de `APIS de memoriaBACKEND`.
- No obligar a un backend local: Render.com sigue sirviendo un static site y `MEMORIA_BACKEND_URL` apunta al backend externo.
- No eliminar la lógica de subida genérica porque `memoriaBACKEND` no cubre todos los tipos con `ImagenesCloudflareR2x`.
- No encolar binarios en localStorage; la cola solo conserva operaciones con `mediaId` ya reservado/confirmado.

## 71. Revisión de punto débil: respuestas canónicas de memoriaBACKEND con alias en español

En esta iteración se identificó como punto débil principal que el cliente ya llamaba las rutas canónicas de `APIS de memoriaBACKEND`, pero la normalización de respuestas seguía esperando principalmente colecciones y entidades con nombres heredados en inglés (`conversations`, `messages`, `states`, `calls`, `message`, `conversation`, `state`, `call`). El catálogo adjunto de `memoriaBACKEND` usa bloques y rutas en español como `CONVERSACIONESx`, `MENSAJESx`, `PUBLICACIONESefimerasX` y `SESIONEScomunicacionX`, por lo que un backend que devolviera formas válidas como `data.conversaciones`, `data.mensajes`, `data.publicaciones`, `data.sesiones`, `data.mensaje` o `data.conversacion` podía sincronizar correctamente a nivel HTTP pero no hidratar la interfaz local.

Cambios aplicados:

- `js/app.js` incorpora aliases de colección para conversaciones, mensajes, estados/publicaciones efímeras y llamadas/sesiones de comunicación.
- La extracción de colecciones ahora revisa contenedores comunes (`data`, `result`, `payload`, `body`, `response`) y acepta `items`/`records` sin perder compatibilidad con respuestas existentes.
- La extracción de entidades creadas o actualizadas ahora acepta aliases en español para `conversacion`, `mensaje`, `estado`, `publicacion`, `sesion`, `llamada`, `promocion`, `imagen`, `subida`, `archivo` y `descarga`.
- Las consultas iniciales a perfil, conversaciones, estados y llamadas agregan `userId`/`participantUserId` además de correo, porque `APIS de memoriaBACKEND` documenta filtros comunes por `userId` y algunos bloques pueden resolver identidad por ese campo.
- Se preservan las rutas ya adaptadas a memoriaBACKEND, la cola local, el modo demo, STREME, R2x, media firmada, push, service worker e interfaz visual.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-response-aliases-43` para que una PWA instalada refresque `js/app.js` y no conserve la normalización anterior en cache.

Validación funcional:

- Si memoriaBACKEND responde `data.conversaciones`, ChatER lo mapea a `conversations` y conserva la hidratación de chats.
- Si memoriaBACKEND responde `data.mensajes`, ChatER lo mapea a `messages` y conserva historial paginado.
- Si memoriaBACKEND responde `data.publicaciones`/`data.estados`, ChatER lo mapea a `states` y mantiene estados de 24 horas.
- Si memoriaBACKEND responde `data.sesiones`/`data.llamadas`, ChatER lo mapea a `calls` y mantiene historial/programación.
- Si una mutación devuelve `data.mensaje`, `data.conversacion`, `data.publicacion` o `data.sesion`, la reconciliación de IDs optimistas sigue funcionando.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 72. Revisión de punto débil: estado de APIs sin verificación de manifiesto real

En esta iteración se identificó como punto débil principal que el proyecto ya consumía rutas canónicas de `APIS de memoriaBACKEND`, pero el panel **Estado memoriaBACKEND** seguía mostrando solo datos derivados de la configuración local del static site. Eso podía indicar “API configurada” aunque el backend publicado no expusiera todavía todos los bloques necesarios para ChatER o aunque el despliegue tuviera un manifiesto incompleto.

Cambios aplicados:

- `js/app.js` agrega `apiClient.getApiManifest()` usando la API canónica `GET /api/v1/versiones/manifest?s={siteId}` con `mountOnly=1`, sin crear backend local ni tocar `APIS de memoriaBACKEND`.
- El modal **Estado memoriaBACKEND** ahora consulta el manifiesto real cuando `MEMORIA_BACKEND_URL` está configurado y resume cuántas capacidades críticas aparecen publicadas.
- La validación revisa procesos equivalentes ya usados por el static site: autenticación, perfil, conversaciones, mensajes, interacciones, señales efímeras, presencia, `streme`, media firmada, imágenes R2x, estados, vistas, sesiones de comunicación y push.
- La consulta queda cacheada por unos minutos para no saturar memoriaBACKEND al abrir repetidamente el modal, pero el usuario puede forzar una nueva verificación con el botón **Verificar APIs**.
- Si memoriaBACKEND responde con un manifiesto válido pero sin detalle suficiente de bloques, la UI no bloquea la app ni inventa errores: informa que recibió manifiesto sin detalle verificable.
- El texto de notificaciones se sincroniza con la ruta real `POST /api/v1/push/suscripciones`, eliminando una referencia visual heredada al endpoint antiguo de dispositivos.
- `css/styles.css` agrega soporte visual para el resumen amplio del manifiesto dentro del grid de estado.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-api-manifest-status-44` para que la PWA instalada refresque `js/app.js`, `css/styles.css` y el service worker.

Validación funcional:

- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.
- La integración usa una API existente del catálogo adjunto (`VERSIONESapi`) y mantiene el proyecto como static site de Render.com.
- El modo demo local sigue funcionando sin llamadas remotas cuando `MEMORIA_BACKEND_URL` está vacío.
- La verificación del manifiesto es informativa y no rompe login, `streme`, cola idempotente, conversaciones, estados, llamadas, adjuntos, notificaciones ni herramientas.
- El service worker sigue excluyendo `/api` y `/auth`, por lo que esta consulta al manifiesto no queda cacheada como recurso estático.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 73. Revisión de punto débil: cierre completo de MEDIAfirmadaX para adjuntos no R2x

En esta iteración se identificó como punto débil principal que el static site ya reservaba adjuntos genéricos con `POST /api/v1/media-firmada`, pero no completaba el contrato canónico documentado en `APIS de memoriaBACKEND/apis.txt`: después de subir el binario a la URL firmada faltaba confirmar el recurso con `PATCH /api/v1/media-firmada/{mediaId}` y pedir la URL segura de lectura con `GET /api/v1/media-firmada/{mediaId}/leer` cuando el backend no devolvía `readUrl` en la confirmación. En producción eso podía dejar audio, video, documentos, GIF o SVG subidos en storage pero sin estado confirmado, sin URL de lectura inmediata o con mensajes en cola apuntando a media todavía no finalizada.

Cambios aplicados:

- `js/app.js` agrega `apiClient.confirmMediaUpload()` sobre `PATCH /api/v1/media-firmada/{mediaId}?s={siteId}` con `X-MB-Site`, `X-Hashinmy-Action:webapp`, `X-MB-Idempotency-Key`, metadata de archivo, entidad destino y estado `uploaded`.
- `js/app.js` agrega `apiClient.getMediaReadUrl()` sobre `GET /api/v1/media-firmada/{mediaId}/leer?s={siteId}` para obtener una URL segura de lectura si la confirmación no la incluye.
- El flujo genérico de adjuntos de chat conserva `POST /api/v1/media-firmada`, realiza la subida directa existente, confirma el `mediaId`, pide URL de lectura cuando falta y solo encola la creación del mensaje si la media quedó confirmada.
- El flujo genérico de estados visuales aplica la misma finalización de `MEDIAfirmadaX` antes de construir el payload de `POST /api/v1/publicaciones-efimeras`.
- `ImagenesCloudflareR2x` no se altera: las imágenes convertibles siguen usando intención, subida R2, confirmación R2x y URL de descarga R2x.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-mediafirmada-confirm-read-45` para forzar refresco de la PWA instalada.

Mapa actualizado de media:

| Tipo de recurso | API usada |
|---|---|
| Imagen convertible desde navegador | `POST /api/v1/imagenes-r2x/intenciones` + subida R2 + `POST /api/v1/imagenes-r2x/{imageId}/confirmar` + `POST /api/v1/imagenes-r2x/{imageId}/url-descarga` si hace falta |
| Audio, video, documentos, GIF/SVG y archivos no convertibles | `POST /api/v1/media-firmada` + subida directa + `PATCH /api/v1/media-firmada/{mediaId}` + `GET /api/v1/media-firmada/{mediaId}/leer` si hace falta |

Validación funcional:

- La cola local no guarda binarios; solo conserva operaciones con `mediaId` confirmado cuando el mensaje o estado no pudo registrarse después de finalizar la media.
- Si memoriaBACKEND no devuelve `publicUrl`/`readUrl` inmediatamente, ChatER intenta la lectura canónica `/leer` sin romper la operación si el backend confirma la media pero decide entregar la URL en otro momento.
- Si la confirmación de `MEDIAfirmadaX` falla, ChatER no encola un mensaje que apunte a media no confirmada; muestra reintento manual para evitar registros huérfanos.
- El proyecto sigue siendo static site de Render.com: no se crea backend local, no se intercepta storage desde el service worker y `MEMORIA_BACKEND_URL` sigue apuntando al backend externo.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 74. Revisión de punto débil: política R2x fija en el frontend

En esta iteración se identificó como punto débil principal que ChatER ya usaba `ImagenesCloudflareR2x` para imágenes temporales WebP, pero seguía usando en el cliente un límite local fijo para convertir la imagen antes de contactar memoriaBACKEND. El catálogo canónico adjunto en `APIS de memoriaBACKEND/apis.txt` expone `GET /api/v1/imagenes-r2x/config?s={siteId}&context=...` para publicar la política real por contexto, incluyendo disponibilidad del bloque, tamaño máximo y parámetros seguros. Sin consultar esa API, un despliegue podía quedar desalineado si memoriaBACKEND reducía el límite por contexto o si R2x no estaba configurado para el dominio.

Cambios aplicados:

- `js/app.js` agrega `apiClient.getR2xImageConfig(context)` contra `/api/v1/imagenes-r2x/config`.
- El flujo R2x ahora carga y cachea la política por contexto (`chat-message` y `status-media`) antes de convertir la imagen a WebP.
- La conversión usa el `maxBytes` y la dimensión máxima publicados por memoriaBACKEND, con fallback local seguro si la lectura de configuración no está disponible.
- Si la política indica que R2x está deshabilitado o no configurado, ChatER conserva la funcionalidad usando `MEDIAfirmadaX` como respaldo canónico, sin volver a rutas heredadas ni modificar `APIS de memoriaBACKEND`.
- Se preservan confirmación R2x, URL de descarga, confirmación `MEDIAfirmadaX`, lectura `/leer`, cola local, estados, adjuntos y experiencia de static site en Render.com.

Validación de cierre de esta iteración:

- La carpeta `APIS de memoriaBACKEND` no fue modificada.
- Las APIs canónicas ya usadas por el proyecto se mantienen bajo `/api/v1` o `/auth` según el catálogo adjunto.
- La promoción de estados ya no conserva el endpoint heredado; queda resuelta como `PATCH /api/v1/publicaciones-efimeras/{stateId}` porque el catálogo real adjunto sí publica CRUD común sobre `PUBLICACIONESefimerasX`.
- El proyecto sigue siendo static site de Render.com y no incorpora backend local.

## 75. Revisión de punto débil: versión publicada y cache PWA desalineados

En esta iteración se identificó como punto débil principal que `app-version.json` ya declaraba la integración vigente de `ImagenesCloudflareR2x` con la política remota de memoriaBACKEND, pero `service-worker.js` conservaba `CHATER_SW_VERSION` en la versión anterior de `MEDIAfirmadaX`. En una PWA instalada, esa desalineación podía impedir que el navegador invalidara el cache del shell y siguiera sirviendo un `js/app.js` anterior, aunque el ZIP ya incluyera la adaptación nueva a `/api/v1/imagenes-r2x/config`.

Cambios aplicados:

- `service-worker.js` actualiza `CHATER_SW_VERSION` a `2026-07-03-memoriabackend-sw-cache-alignment-47`.
- `app-version.json` queda en la misma versión publicada para que la verificación visual de actualización y el cache del service worker apunten al mismo ciclo.
- No se modifica ninguna ruta de API, flujo de autenticación, cola local, `STREMEx`, `MEDIAfirmadaX`, `ImagenesCloudflareR2x`, interfaz visual ni archivo dentro de `APIS de memoriaBACKEND`.
- Se mantiene el proyecto como static site de Render.com: el service worker continúa excluyendo rutas runtime como `/api`, `/auth`, `/streme`, `/media`, `/push` y equivalentes para no cachear respuestas de memoriaBACKEND.

Validación funcional:

- Una instalación PWA existente debe detectar un nombre de cache nuevo y descargar el shell actualizado sin reinstalar.
- La integración vigente con `/api/v1/imagenes-r2x/config`, confirmación R2x, confirmación `MEDIAfirmadaX` y lectura `/api/v1/media-firmada/{mediaId}/leer` no queda bloqueada por un service worker con cache anterior.
- La carpeta `APIS de memoriaBACKEND` permanece intacta.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.


## 76. Revisión de punto débil: acciones comerciales usando ruta no publicada en memoriaBACKEND

En esta iteración se identificó como punto débil principal que la cola idempotente de herramientas comerciales ya preservaba el estado local, pero todavía intentaba sincronizar `businessToolAction` contra `/tools/{toolId}/actions`. Esa ruta no aparece como API oficial en el catálogo adjunto `APIS de memoriaBACKEND/apis.txt`. En cambio, el catálogo sí publica `LANDINGTOOLSx` con `POST /api/v1/landing-tools/evento?s={siteId}` para registrar eventos y acciones comerciales de static sites autorizados.

Cambios aplicados:

- `js/app.js` cambia únicamente el proceso remoto de acciones comerciales: `apiClient.syncBusinessToolAction()` ahora usa `POST /api/v1/landing-tools/evento?s={siteId}`.
- Se preserva la cola local `businessToolAction`, el estado optimista, los modales comerciales y los payloads originales dentro de `metadata.payload`.
- La mutación conserva `X-MB-Site`, `X-Hashinmy-Action:webapp`, `X-MB-Idempotency-Key`, `clientMutationId`, `credentials: include` y `s={siteId}`.
- El panel de manifiesto agrega la capacidad crítica `LANDINGTOOLSx` para que el static site pueda detectar si el backend publicado cubre la sincronización comercial.
- Se actualiza el texto visual que antes apuntaba a `/tools/business-verified/actions` para mostrar la ruta real `/api/v1/landing-tools/evento`.
- `docs/memoriaBACKEND_APIS.md` deja de documentar `/tools/{toolId}/actions` como contrato ejecutable principal y lo reemplaza por el contrato canónico de `LANDINGTOOLSx`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-landing-tools-actions-48` para que una PWA instalada invalide el cache anterior de `js/app.js`.

Validación funcional:

- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.
- La promoción de estado ya no debe tratarse como ruta sin equivalencia: el contrato vigente la resuelve como `PATCH /api/v1/publicaciones-efimeras/{stateId}` dentro de `PUBLICACIONESefimerasX`.
- Las demás APIs ya adaptadas a `/api/v1` y `/auth` se preservan sin cambios.
- El proyecto sigue siendo static site de Render.com y no incorpora backend local.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 77. Revisión de punto débil: `userId` canónico de memoriaBACKEND no persistido en el static site

En esta iteración se identificó como punto débil principal que ChatER ya enviaba `userEmail` y rutas canónicas de `APIS de memoriaBACKEND`, pero `getCurrentUserIdentifier()` seguía usando el correo como `userId` efectivo cuando el backend sí podía devolver un identificador interno en autenticación o perfil. El catálogo adjunto documenta bloques que filtran o validan propietario por `userId` (`PERFILusuarioX`, `PUBLICACIONESefimerasX`, `VISTAScontenidoX`, `SESIONEScomunicacionX`, `APInotificacionesPUSHx`, `ImagenesCloudflareR2x`), por lo que enviar el correo como `userId` podía funcionar en modo tolerante, pero fallar en un backend que exija coincidencia estricta entre sesión y propietario.

Cambios aplicados:

- `js/app.js` agrega almacenamiento local aislado para `chater.session.userId` sin modificar la carpeta `APIS de memoriaBACKEND`.
- `persistAuthTokens()` ahora extrae y conserva el ID interno devuelto por respuestas de Google/Firebase, refresh, sesión o perfil cuando aparece como `internalUserId`, `userId`, `uid`, `sub` o `id` dentro de `user`, `profile`, `perfil`, `session`, `auth` o `data`.
- `syncInitialDataFromBackend()` consulta primero `GET /api/v1/perfil-usuario`, persiste el `userId` real cuando existe y después carga conversaciones, estados y llamadas con ese propietario canónico disponible en la misma sincronización.
- `getCurrentUserIdentifier()` usa primero el `userId` canónico de memoriaBACKEND y conserva el correo como fallback local cuando el backend no lo entrega.
- `clearAuthTokens()` elimina el `userId` junto con tokens y cursor `streme`, evitando que una cuenta reutilice el propietario interno de otra sesión.
- Se actualizan `app-version.json` y `CHATER_SW_VERSION` a `2026-07-03-memoriabackend-userid-ownership-49` para que una PWA instalada descargue el cliente corregido.

Validación funcional:

- Las APIs existentes siguen recibiendo `userEmail` para compatibilidad, pero las operaciones con propietario (`R2x`, estados, vistas, llamadas, push, señales y eventos) ahora pueden enviar el `userId` real cuando memoriaBACKEND lo publica.
- Si memoriaBACKEND no entrega un identificador interno, el static site conserva el comportamiento anterior por correo y no rompe el modo demo local.
- No se cambia ninguna ruta de API ni se reemplaza un proceso sin equivalencia validada.
- La carpeta `APIS de memoriaBACKEND` permanece intacta.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 78. Revisión de punto débil: documentación ejecutable conservaba rutas heredadas de estados, media, llamadas y push

En esta iteración se identificó como punto débil principal que el runtime de `js/app.js` ya estaba sincronizado con rutas canónicas de `APIS de memoriaBACKEND`, incluida la promoción de estados mediante `PATCH /api/v1/publicaciones-efimeras/{stateId}`, pero la documentación ejecutable inicial todavía mantenía contratos heredados de estados, promoción, media, llamadas, dispositivos y pruebas de notificaciones. Esa desincronización podía hacer que Nova o una IA integradora volviera a comparar contra APIs antiguas y reintrodujera rutas que no corresponden al catálogo canónico adjunto.

Cambios aplicados:

- `docs/memoriaBACKEND_APIS.md` actualiza el contrato vigente de media para reflejar `ImagenesCloudflareR2x`, `MEDIAfirmadaX` y creación de mensajes con adjunto en `POST /api/v1/mensajes`.
- La sección de estados 24h queda alineada con `GET/POST/PATCH /api/v1/publicaciones-efimeras` y `POST /api/v1/vistas-contenido`, eliminando el endpoint heredado de promoción de estados como contrato vigente.
- La sección de llamadas queda alineada con `GET/POST /api/v1/sesiones-comunicacion`.
- La cola local, prioridades y mapa de botones ahora apuntan a rutas canónicas `/api/v1` o `/auth` y dejan las rutas heredadas solo como historial de iteraciones anteriores.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND` ni se cambió lógica runtime no relacionada.

Validación funcional:

- `js/app.js`, `service-worker.js`, `js/pwa.js` y `js/config.js` conservan sintaxis válida.
- La integración de promoción de estado ya presente en runtime no se altera: sigue usando `PATCH /api/v1/publicaciones-efimeras/{stateId}`.
- El proyecto sigue siendo static site de Render.com y no incorpora backend local.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora documental y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 79. Revisión de punto débil: contactos por correo no usaban RELACIONESusuarioX

En esta iteración se identificó como punto débil principal que el flujo **Nuevo chat por correo** ya creaba conversaciones con `CONVERSACIONESx`, pero todavía trataba el contacto como dato implícito dentro de la conversación. El catálogo adjunto sí publica un proceso equivalente para contactos/vínculos en `RELACIONESusuarioX` (`/api/v1/relaciones-usuario`), por lo que memoriaBACKEND podía no recibir una relación reutilizable para futuras búsquedas, privacidad, favoritos, bloqueos o metadatos de contacto.

Cambios aplicados:

- `js/app.js` agrega `apiClient.upsertUserRelation()` contra `POST /api/v1/relaciones-usuario?s={siteId}`.
- Al crear un chat por correo, ChatER sincroniza una relación `relationType:"contact"` con `fromUserId`, `fromUserEmail`, `contactEmail`, `displayName`, `alias`, metadata de conversación e idempotencia.
- Si la conversación se creó pero la relación falla, se encola `upsertUserRelation` sin bloquear el chat ni perder la operación principal.
- Cuando una conversación pendiente se reintenta desde la cola, el éxito de `POST /api/v1/conversaciones` dispara también la sincronización de `RELACIONESusuarioX`.
- `docs/memoriaBACKEND_APIS.md` actualiza el contrato vigente para reemplazar `/contacts` por `/api/v1/relaciones-usuario`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-relaciones-contactos-51` para que una PWA instalada descargue el cliente corregido.

Validación funcional:

- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.
- La conversación sigue siendo la operación principal; la relación se sincroniza como apoyo idempotente y no rompe el modo demo local.
- El proyecto sigue siendo static site de Render.com y no incorpora backend local.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 80. Revisión de punto débil: adjuntos remotos de MENSAJESx no se rehidrataban desde memoriaBACKEND

En esta iteración se identificó como punto débil principal que ChatER ya enviaba mensajes con archivos a `POST /api/v1/mensajes` usando `attachments`, pero al leer historial, conversaciones embebidas o eventos remotos el normalizador dependía principalmente de campos directos como `media`, `file` o `mediaUrl`. Si memoriaBACKEND respondía con estructuras canónicas o equivalentes como `attachments[]`, `adjuntos[]`, `archivos[]`, `files[]`, `mediaItems[]` o solo `mediaIds[]`, el mensaje podía sincronizarse correctamente en el backend y aun así perder nombre, tamaño, tipo, URL o `mediaId` al volver a pintarse en el static site.

Cambios aplicados:

- `js/app.js` agrega helpers de normalización para leer de forma segura el primer objeto de media/adjunto desde estructuras directas, anidadas o arreglos compatibles con memoriaBACKEND.
- `normalizeMessageFromApi()` ahora preserva `mediaId`, `mediaProvider`, nombre, tamaño, MIME, URL y tipo de media cuando llegan desde `attachments[]`, `adjuntos[]`, `archivos[]`, `files[]`, `mediaItems[]`, `mediaIds[]` o campos heredados equivalentes.
- `updateExistingMessageFromRealtime()` conserva `mediaId` y `mediaProvider` al fusionar mensajes locales con confirmaciones remotas o eventos de `STREMEx`, evitando que la reconciliación borre referencias de adjuntos.
- `normalizeStateFromApi()` aplica la misma lectura defensiva para estados de `PUBLICACIONESefimerasX`, de modo que `mediaIds[]` o media anidada no se pierdan al hidratar estados remotos.
- La vista de estados muestra fallback visual cuando existe `mediaId` aunque aún no exista una URL firmada, manteniendo una experiencia estable hasta que `MEDIAfirmadaX` o `ImagenesCloudflareR2x` entregue la URL consumible.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-attachments-normalizer-52` para que una PWA instalada invalide el cache anterior de `js/app.js`.

Validación funcional:

- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.
- El envío de adjuntos existente se preserva; la mejora actúa sobre la rehidratación y reconciliación remota, que era el punto débil detectado.
- Las rutas canónicas `/api/v1/mensajes`, `/api/v1/publicaciones-efimeras`, `MEDIAfirmadaX`, `ImagenesCloudflareR2x` y `STREMEx` permanecen sincronizadas sin agregar backend local.
- El proyecto sigue siendo static site de Render.com y no incorpora dependencias de servidor.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 81. Revisión de punto débil: SESIONEScomunicacionX recibía llamadas sin participante destino

En esta iteración se identificó como punto débil principal que ChatER ya usaba la ruta canónica `POST /api/v1/sesiones-comunicacion` para crear o programar llamadas, pero el payload enviaba únicamente al usuario iniciador dentro de `participants`. El catálogo adjunto de `APIS de memoriaBACKEND/apis.txt` define `SESIONEScomunicacionX` como sesión viva de comunicación con `participants`, `conversationId`, `communicationType`, `status`, `startedAt/scheduledAt`, `channel` y metadata; por eso una llamada sin el contacto destino podía quedar registrada como sesión incompleta aunque la ruta fuera correcta.

Cambios aplicados:

- `js/app.js` agrega normalización de participantes de conversación desde estructuras remotas (`participants`, `participantList`, `members`) y conserva esa información en el estado local.
- `normalizeConversationFromApi()` ahora selecciona como contacto visible al participante que no corresponde al correo de la sesión actual cuando memoriaBACKEND devuelve participantes completos.
- `apiClient.createCall()` y `apiClient.scheduleCall()` siguen usando `POST /api/v1/sesiones-comunicacion`, pero ahora construyen `participants` con iniciador y contacto destino, incluyendo `initiatorUserId`, `initiatorUserEmail`, `targetUserId`, `targetUserEmail` y metadata de correos participantes cuando están disponibles.
- Si una conversación antigua no trae `participants`, ChatER usa el correo/nombre ya existentes de la conversación como fallback, sin romper chats locales ni modo demo.
- No se modifica ninguna ruta de API ni ningún archivo dentro de `APIS de memoriaBACKEND`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-sesiones-participantes-53` para que una PWA instalada descargue el cliente corregido.

Validación funcional:

- El proyecto sigue siendo static site de Render.com y no incorpora backend local.
- La mejora se limita al contrato de `SESIONEScomunicacionX`; no altera `STREMEx`, mensajes, estados, adjuntos, push, herramientas comerciales ni la cola idempotente fuera del payload de llamadas.
- La lógica existente de llamadas optimistas se preserva; la sincronización remota ahora entrega a memoriaBACKEND una sesión con propietario y destinatario cuando el dato está disponible.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 82. Revisión de punto débil: presencia enviada solo por STREMEx

En esta iteración se identificó como punto débil principal que ChatER ya publicaba heartbeats de presencia por `STREMEx`, pero el catálogo canónico de `APIS de memoriaBACKEND` separa responsabilidades: `STREMEx` transporta eventos en tiempo real y `PRESENCIAusuarioX` en `/api/v1/presencia-usuario` es el bloque dueño del estado online/offline/ausente/ocupado. Mantener la presencia solo como evento efímero podía dejar al backend sin registro durable de `lastSeenAt`, `deviceId`, expiración y disponibilidad por usuario.

Cambios aplicados:

- `js/app.js` agrega `apiClient.updatePresence()` contra `POST /api/v1/presencia-usuario?s={siteId}` con `userId`, `userEmail`, `deviceId`, `status`, `heartbeatAt`, `lastSeenAt`, `expiresAt`, `metadata` e idempotencia.
- Los heartbeats al abrir WebSocket/SSE ahora llaman `sendPresenceHeartbeat('online')`, que conserva el evento `STREMEx` existente y además sincroniza `PRESENCIAusuarioX` de forma no bloqueante.
- El cierre de pestaña llama `sendPresenceHeartbeat('offline', { force:true, keepalive:true })` como mejor esfuerzo, sin encolar presencia para evitar estados obsoletos al reconectar.
- El modal de estado ahora valida también la capacidad `PRESENCIAusuarioX` en el manifiesto `/api/v1/versiones/manifest`.
- `docs/memoriaBACKEND_APIS.md` documenta el contrato de presencia y actualiza el mapa de procesos sincronizados.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-presencia-usuario-54` para que la PWA instalada refresque el shell afectado.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.
- Se preservó la lógica existente de autenticación Google/Gmail, conversaciones, mensajes, estados, llamadas, adjuntos, herramientas comerciales, notificaciones, cola local, R2x, MEDIAfirmadaX, STREMEx y service worker.

## 83. Revisión de punto débil: validación de bloques sincronizados no consumida desde el static site

En esta iteración se identificó como punto débil principal que ChatER ya consultaba `GET /api/v1/versiones/manifest` para confirmar capacidades publicadas, pero no consumía la regleta nueva `BLOQUESsincronizadosX` descrita en `APIS de memoriaBACKEND/apis.txt`. Esa regleta existe precisamente para detectar desincronización entre bloques, carpetas `conexion`/`BLOQUE`, `VERSIONESapi` y montajes reales de `server.js`; por lo tanto, depender solo del manifiesto de versiones dejaba sin verificar el control de gobernanza que memoriaBACKEND publica para static sites.

Cambios aplicados:

- `js/app.js` agrega `apiClient.getBlocksSyncValidation()` contra `GET /api/v1/bloques-sincronizados/validacion?s={siteId}`.
- `js/app.js` agrega `apiClient.getBlocksSyncMounts()` contra `GET /api/v1/bloques-sincronizados/montajes?s={siteId}` para cubrir la validación runtime de montajes añadida en el catálogo adjunto.
- El modal **Estado de memoriaBACKEND** ahora muestra una sección independiente de **Bloques sincronizados**, con cache temporal, reintento manual y lectura conjunta de validación + montajes.
- El botón visual de verificación pasa a **Verificar APIs y bloques** para reflejar que ahora se auditan tanto `/api/v1/versiones/manifest` como `BLOQUESsincronizadosX`.
- La matriz de capacidades críticas agrega `BLOQUESsincronizadosX` como señal esperada del backend publicado.
- La lectura es defensiva: si memoriaBACKEND responde con alertas estructuradas (`missingMounts`, duplicados, inválidos, errores o validaciones falsas), la UI las muestra sin bloquear el modo local ni inventar rutas alternativas.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- Las rutas runtime nuevas siguen usando `MEMORIA_BACKEND_URL`, `s={siteId}`, `X-MB-Site`, credenciales y el prefijo `/api/v1` existente; no se crea backend local.
- Se preservó la lógica existente de autenticación, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `STREMEx`, notificaciones, herramientas comerciales, cola idempotente y PWA.
- El proyecto sigue siendo static site de Render.com y únicamente se apoya en las APIs de memoriaBACKEND cuando están configuradas.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 84. Revisión de punto débil: URL manual de STREMEx sin scope del sitio

En esta iteración se identificó como punto débil principal que ChatER ya derivaba correctamente SSE desde `MEMORIA_BACKEND_URL` con `s={siteId}`, pero cuando `STREME_REALTIME_URL` se configuraba manualmente el cliente respetaba esa URL sin garantizar los parámetros mínimos exigidos por `STREMEx`. En `EventSource` no se pueden enviar headers personalizados como `X-MB-Site`, por lo que una URL manual sin `s` podía ser rechazada por memoriaBACKEND o quedar fuera del dominio/site autorizado aunque las demás APIs sí estuvieran correctamente scoped.

Cambios aplicados:

- `js/app.js` agrega `applyStremeUrlScopeParams()` para completar `s`, `canal` y `clientId` cuando falten en la URL efectiva de STREMEx.
- `buildStremeUrl()` aplica esos parámetros tanto para SSE/EventSource como para WebSocket antes de agregar token y `lastEventId`, preservando cualquier `s`, `canal`, `channel`, `clientId` o `clienteId` que ya venga explícito en la URL configurada.
- `js/config.js` documenta que una URL manual de `STREME_REALTIME_URL` no necesita traer esos parámetros porque el static site los agrega de forma defensiva.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-streme-url-scope-56` para que una PWA instalada descargue el cliente corregido.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- Se preservó la lógica existente de autenticación, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, notificaciones, herramientas comerciales, cola idempotente y PWA.
- El proyecto sigue siendo static site de Render.com y únicamente se apoya en las APIs de memoriaBACKEND cuando están configuradas.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 85. Revisión de punto débil: búsqueda local sin BUSQUEDAx

En esta iteración se identificó como punto débil principal que ChatER ya estaba sincronizado con los bloques canónicos de conversación, mensajes, estados, llamadas, media, push, STREMEx, presencia y gobernanza, pero la búsqueda seguía limitada al historial local cargado y la documentación ejecutable todavía conservaba la ruta heredada `/search`. El catálogo adjunto `APIS de memoriaBACKEND/apis.txt` sí publica un proceso equivalente en `BUSQUEDAx`; su montaje base es `/api/v1/busqueda` y la ruta pública ejecutable de búsqueda queda corregida en esta documentación como `/api/v1/busqueda/buscar`, por lo que mantener la búsqueda solo local podía ocultar mensajes o adjuntos existentes en memoriaBACKEND que aún no estuvieran hidratados en la PWA.

Cambios aplicados:

- `js/app.js` agrega `apiClient.searchContent()` contra `GET /api/v1/busqueda/buscar?s={siteId}`, preservando `MEMORIA_BACKEND_URL`, `MEMORIA_SITE_ID`, `credentials: include`, `X-MB-Site`, `userId` y `userEmail`.
- El modal **Buscar en conversación** conserva las coincidencias locales inmediatas, pero cuando memoriaBACKEND está configurado consulta `BUSQUEDAx` con `q`, `entityTypes=mensajes,archivos`, `conversationId` y `limit`.
- Las respuestas remotas se normalizan desde `searchResults`, `results`, `resultados`, `busqueda`, `items` o `records`, y se filtran por la conversación activa para evitar mezclar resultados de otro chat si el backend ignora el filtro.
- Al abrir una coincidencia remota que no estaba en memoria local, ChatER la incorpora defensivamente a la conversación actual, persiste el estado y la enfoca sin romper la hidratación normal de `MENSAJESx`.
- La matriz de capacidades críticas del modal **Estado memoriaBACKEND** agrega `BUSQUEDAx`, de modo que `/api/v1/versiones/manifest` también confirme la disponibilidad de búsqueda federada.
- `docs/memoriaBACKEND_APIS.md` reemplaza el contrato vigente `/search` por `GET /api/v1/busqueda/buscar`, manteniendo las rutas heredadas solo como historial de iteraciones antiguas.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-busquedax-search-58` para que una PWA instalada refresque el cliente y no conserve la búsqueda solo local.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de búsqueda; se preserva la lógica existente de autenticación, conversaciones, mensajes, estados, llamadas, adjuntos, `R2x`, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, notificaciones, herramientas comerciales, cola local y PWA.
- El proyecto sigue siendo static site de Render.com y únicamente se apoya en las APIs de memoriaBACKEND cuando están configuradas.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 86. Revisión de punto débil: BUSQUEDAx apuntaba al montaje base y no a la ruta pública de búsqueda

En esta iteración se identificó como punto débil principal que la integración anterior de búsqueda remota ya había reemplazado la ruta heredada `/search`, pero quedó llamando `GET /api/v1/busqueda` como si el montaje base fuera el endpoint ejecutable. El catálogo adjunto `APIS de memoriaBACKEND/apis.txt` describe `BUSQUEDAx` como bloque base en `/api/v1/busqueda`, pero su tabla pública precisa que la búsqueda autorizada para static sites se ejecuta en `GET /api/v1/busqueda/buscar` con parámetros `s/siteId`, `q` o `buscar`, `limit/limite` y filtros de contexto. Mantener el montaje base podía producir 404, devolver solo metadata del bloque o no ejecutar la búsqueda federada real.

Cambios aplicados:

- `js/app.js` cambia únicamente `apiClient.searchContent()` para consultar `GET /api/v1/busqueda/buscar?s={siteId}`.
- El payload de búsqueda conserva `q`, `query`, `userId`, `userEmail`, `entityTypes`, `conversationId`, `cursor` y `limit`, por lo que se preserva la normalización existente de resultados y el filtrado defensivo por conversación.
- El texto del modal **Buscar en conversación** muestra la ruta pública correcta `/api/v1/busqueda/buscar`.
- La matriz de capacidades críticas acepta tanto el bloque `BUSQUEDAx` como `/api/v1/busqueda/buscar`, sin perder compatibilidad con manifiestos que solo reporten el montaje base `/api/v1/busqueda`.
- `docs/memoriaBACKEND_APIS.md` actualiza el contrato vigente de búsqueda para que Nova no vuelva a integrar el montaje base como endpoint ejecutable.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-busquedax-route-59` para invalidar el cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de búsqueda remota; se preserva la lógica existente de autenticación, conversaciones, mensajes, estados, llamadas, adjuntos, `R2x`, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, notificaciones, herramientas comerciales, cola local y PWA.
- El proyecto sigue siendo static site de Render.com y únicamente se apoya en las APIs de memoriaBACKEND cuando están configuradas.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 87. Revisión de punto débil: creación de conversación sin identidad canónica del propietario

En esta iteración se identificó como punto débil principal que ChatER ya cargaba y persistía el `userId` real devuelto por `PERFILusuarioX`, pero la creación de conversaciones seguía enviando `participants` solo con correos. El catálogo de `CONVERSACIONESx` permite participantes con identidad de usuario y el resto del proyecto ya normaliza `userId/internalUserId`; por eso, cuando memoriaBACKEND conoce el propietario, no enviar ese identificador podía crear una conversación válida pero menos reconciliable con presencia, relaciones, llamadas y mensajes.

Cambios aplicados:

- `js/app.js` agrega `buildConversationCreateParticipants()` para construir participantes normalizados con correo, rol y `userId` solo cuando memoriaBACKEND ya entregó un identificador canónico.
- `apiClient.createConversation()` mantiene `POST /api/v1/conversaciones`, pero ahora incluye `ownerUserId`, `ownerUserEmail`, `contactUserId` cuando exista, `contactEmail` normalizado y participantes enriquecidos.
- No se fuerza `userId` con el correo cuando el backend todavía no lo conoce; si no existe API o identificador canónico, se conserva el contrato actual por correo.
- `docs/memoriaBACKEND_APIS.md` actualiza el ejemplo vigente de creación de conversación para reflejar el identificador canónico del propietario sin exigirlo al contacto.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-conversaciones-owner-id-60` para invalidar el cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de creación de conversación; se preserva la lógica existente de autenticación, relaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, notificaciones, herramientas comerciales, búsqueda remota, cola local y PWA.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 88. Revisión de punto débil: cache PWA no invalidaba la sincronización vigente con memoriaBACKEND

En esta iteración se identificó como punto débil principal que el runtime del static site ya contenía adaptaciones acumuladas hacia APIs canónicas de `APIS de memoriaBACKEND`, pero `app-version.json` y `CHATER_SW_VERSION` permanecían en `2026-07-03-memoriabackend-conversaciones-owner-id-60`. Esa desalineación podía impedir que una PWA instalada en Render.com descargara el `js/app.js` actualizado con rutas y normalizaciones posteriores, aunque el ZIP ya incluyera esas mejoras.

Cambios aplicados:

- `app-version.json` sube a `2026-07-03-memoriabackend-cache-version-alignment-61` con una descripción explícita de alineación de cache para las integraciones actuales con memoriaBACKEND.
- `service-worker.js` actualiza `CHATER_SW_VERSION` al mismo identificador para crear una cache nueva y evitar que una instalación existente conserve un shell anterior.
- No se modifica ningún archivo dentro de `APIS de memoriaBACKEND`.
- No se cambia ninguna ruta de API, payload funcional, UI, assets ni lógica de negocio; el cambio se limita a que el static site instalado pueda recibir la sincronización ya presente.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json` y `CHATER_SW_VERSION` quedan alineados en `2026-07-03-memoriabackend-cache-version-alignment-61`.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 89. Revisión de punto débil: apertura del static site sin VISITASstaticSITEx

En esta iteración se identificó como punto débil principal que ChatER ya usaba rutas canónicas para autenticación, conversaciones, mensajes, estados, llamadas, media, push, búsqueda, presencia, STREMEx y gobernanza, pero la apertura real del static site seguía sin apoyarse en la API pública de visitas que sí existe en `APIS de memoriaBACKEND`. El catálogo adjunto indica que el proceso de “API de visitas”, país, idioma o ISO debe usar `VISITASstaticSITEx` mediante `POST /api/v1/visitas/apertura?s={siteId}`; no registrar esa apertura dejaba fuera una señal básica de static site autorizado y obligaba a depender solo de eventos comerciales o acciones posteriores.

Cambios aplicados:

- `js/app.js` agrega `apiClient.registerStaticVisit()` contra `POST /api/v1/visitas/apertura?s={siteId}` con `path`, `url`, `referrer`, `title`, datos seguros del cliente, `pageLoadId`, `deviceId`, `idempotencyKey` y `clientMutationId`.
- La apertura se registra una sola vez por carga real cuando `MEMORIA_BACKEND_URL` está configurada; en modo demo local no genera escrituras falsas ni modifica el flujo offline.
- El registro es no bloqueante y no se encola: si VISITASstaticSITEx falla, la interfaz conserva login, chats, estados, llamadas y sincronización normal.
- El modal **Estado de memoriaBACKEND** muestra el estado de la visita y la matriz de capacidades críticas ahora valida también `VISITASstaticSITEx` y `/api/v1/visitas/apertura`.
- `js/config.js` agrega `ENABLE_STATIC_VISIT_TRACKING` para permitir desactivar este apoyo por despliegue sin recompilar el static site.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-visitas-apertura-62` para que una PWA instalada descargue el cliente corregido.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de visitas/apertura del static site; se preserva la lógica existente de autenticación, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, notificaciones, herramientas comerciales, búsqueda remota, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 90. Revisión de punto débil: IDs optimistas y cursor streme sin sincronización canónica

En esta iteración se identificó como punto débil principal que ChatER ya preservaba IDs locales optimistas para conversaciones, mensajes, estados y llamadas, y también guardaba el `lastEventId` recibido por `STREMEx`; sin embargo, esos datos no se comunicaban a las APIs canónicas que sí existen en `APIS de memoriaBACKEND`. El catálogo adjunto indica que el reintento optimista debe registrar el mapeo temporal/real en `RECONCILIACIONidsX` y actualizar el cursor en `CURSOResincronizacionX`, por lo que mantener esa información solo en el cliente podía producir duplicados, reintentos menos auditables o resincronizaciones incompletas después de reconexiones.

Cambios aplicados:

- `js/app.js` agrega `apiClient.recordIdReconciliation()` contra `POST /api/v1/reconciliacion-ids` para registrar mapeos de `temporaryId/localId` hacia `realId/remoteId` cuando memoriaBACKEND confirma una conversación, mensaje, publicación efímera o sesión de llamada.
- `js/app.js` agrega `apiClient.updateSyncCursor()` contra `POST /api/v1/cursor-sincronizacion` para confirmar el último cursor/evento recibido desde `STREMEx` por SSE, payload normalizado o evento de control.
- La reconciliación de IDs es no bloqueante: si falla, se guarda una operación `recordIdReconciliation` en la cola local con clave deduplicada para reintentar sin duplicar eventos.
- La actualización de cursor usa debounce corto y cola local `updateSyncCursor` con reemplazo por dispositivo para conservar solo el cursor vigente cuando el backend esté temporalmente indisponible.
- `replayBackendOperation()` ahora reproduce de forma controlada las operaciones encoladas de reconciliación y cursor sin alterar la cola existente de conversaciones, mensajes, estados, llamadas ni lecturas.
- El modal **Estado de memoriaBACKEND** muestra el estado del cursor de sincronización y la matriz de capacidades críticas valida `CURSOResincronizacionX`, `/api/v1/cursor-sincronizacion`, `RECONCILIACIONidsX` y `/api/v1/reconciliacion-ids`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-reconciliacion-cursor-63` para invalidar el cache PWA anterior y asegurar que el static site instalado cargue esta sincronización.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de reconciliación de IDs y cursor de sincronización; se preserva la lógica existente de autenticación, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, notificaciones, herramientas comerciales, búsqueda remota, visitas del static site, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 91. Revisión de punto débil: preferencias privadas solo locales sin PREFERENCIASusuarioX

En esta iteración se identificó como punto débil principal que ChatER ya sincronizaba identidad, conversaciones, mensajes, estados, llamadas, media, push, visitas, búsqueda, reconciliación y cursor, pero algunas preferencias privadas del usuario seguían quedando únicamente en `localStorage`: emojis recientes, estado de notificaciones por dispositivo, idioma visible y comportamiento visual automático. El catálogo adjunto `APIS de memoriaBACKEND/apis.txt` sí publica un proceso equivalente para ese dominio en `PREFERENCIASusuarioX` (`/api/v1/preferencias-usuario`), por lo que mantener esas preferencias solo locales podía perder continuidad entre navegadores o reinstalaciones de la PWA.

Cambios aplicados:

- `js/app.js` agrega `apiClient.getUserPreferences()` contra `GET /api/v1/preferencias-usuario?s={siteId}` y `apiClient.saveUserPreferences()` contra `POST /api/v1/preferencias-usuario?s={siteId}`.
- La sincronización inicial lee preferencias remotas junto con `PERFILusuarioX`; si memoriaBACKEND devuelve emojis recientes, ChatER los fusiona defensivamente con los locales sin borrar preferencias del navegador.
- Cuando cambian emojis recientes o estado de notificaciones, ChatER programa una escritura con debounce hacia `PREFERENCIASusuarioX`, usando `userId`, `userEmail`, `theme`, `language`, `notifications`, `view`, `visualBehavior`, `personalConfig` y `clientMutationId`.
- Si la API falla, se conserva el comportamiento local y se encola una operación `saveUserPreferences` reemplazable por dispositivo para reintentar sin duplicar registros obsoletos.
- El modal **Estado de memoriaBACKEND** muestra el estado de preferencias de usuario y la matriz de capacidades críticas valida `PREFERENCIASusuarioX` y `/api/v1/preferencias-usuario`.
- `js/config.js` agrega `ENABLE_REMOTE_USER_PREFERENCES` para poder desactivar esta sincronización por despliegue sin recompilar el static site.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-preferencias-usuario-64` para invalidar el cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de preferencias privadas; se preserva la lógica existente de autenticación, perfil, relaciones, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 92. Revisión de punto débil: llamadas iniciadas sin SIGNALINGtiempoRealX

En esta iteración se identificó como punto débil principal que ChatER ya creaba sesiones de llamada en `SESIONEScomunicacionX` (`/api/v1/sesiones-comunicacion`) y recibía eventos `call.incoming` por `STREMEx`, pero al iniciar una llamada de voz o video desde el static site no registraba la señal inicial en el bloque canónico que sí existe en el catálogo adjunto: `SIGNALINGtiempoRealX` (`/api/v1/signaling-tiempo-real`). Mantener la llamada solo como sesión dejaba incompleto el proceso equivalente de comunicación viva, porque memoriaBACKEND no recibía una intención de señalización trazable con `sessionId`, emisor, receptor, `signalType`, estado e idempotencia.

Cambios aplicados:

- `js/app.js` agrega `apiClient.sendCallSignal()` contra `POST /api/v1/signaling-tiempo-real?s={siteId}` con `sessionId/callId`, `conversationId/chatId`, `fromUserId/fromUserEmail`, `toUserId/toUserEmail`, `signalType`, `status`, `communicationType`, `payload`, metadata e `clientMutationId` idempotente.
- Después de sincronizar una llamada inmediata en `SESIONEScomunicacionX`, ChatER publica una invitación `call.incoming` por `STREMEx` y registra en paralelo la señal `invite` en `SIGNALINGtiempoRealX` sin bloquear la interfaz si la señalización efímera falla.
- El reintento de cola `createCall` conserva el mismo comportamiento: cuando una llamada pendiente logra crearse en memoriaBACKEND, también dispara la señal `invite` y el evento realtime con datos normalizados de participantes.
- La matriz del modal **Estado de memoriaBACKEND** valida ahora `SIGNALINGtiempoRealX` y `/api/v1/signaling-tiempo-real`, además de `SESIONEScomunicacionX`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-signaling-tiempo-real-65` para invalidar el cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de señalización de llamadas; se preserva la lógica existente de autenticación, perfil, preferencias, relaciones, conversaciones, mensajes, estados, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 93. Revisión de punto débil: señalización de llamada sin reintento idempotente

En esta iteración se identificó como punto débil principal que ChatER ya creaba sesiones de llamada en `SESIONEScomunicacionX` y registraba una señal inicial `invite` en `SIGNALINGtiempoRealX`, pero esa segunda escritura era paralela y no quedaba en la cola local si fallaba después de que la sesión ya hubiera sido creada. En una red móvil real, eso podía dejar una llamada persistida en `/api/v1/sesiones-comunicacion` sin la señal trazable correspondiente en `/api/v1/signaling-tiempo-real`, debilitando el proceso equivalente de comunicación viva publicado por `APIS de memoriaBACKEND`.

Cambios aplicados:

- `js/app.js` agrega soporte de replay para operaciones `sendCallSignal` dentro de la cola idempotente local.
- `publishCallInviteThroughMemoria()` ahora construye un `signalPayload` estable para `SIGNALINGtiempoRealX` y, si `apiClient.sendCallSignal()` falla, encola la misma señal con `dedupeKey` determinística `call-signal:{callId}:invite:{clientMutationId}`.
- El reintento conserva `sessionId`, `callId`, `conversationId`, emisor, receptor, `signalType: invite`, `communicationType`, payload de llamada, metadata y `clientMutationId`, sin duplicar llamadas ni alterar la sesión ya creada.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-signaling-outbox-66` para invalidar la cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de señalización de llamadas; se preserva la lógica existente de autenticación, perfil, preferencias, relaciones, conversaciones, mensajes, estados, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 94. Revisión de punto débil: invitación realtime de llamada sin reintento STREMEx

En esta iteración se identificó como punto débil principal que ChatER ya creaba la sesión de llamada en `SESIONEScomunicacionX` y ya dejaba en cola la señal `invite` de `SIGNALINGtiempoRealX` si esa escritura fallaba, pero el evento realtime `call.incoming` publicado por `STREMEx` seguía dependiendo de una publicación paralela sin reintento. En una red móvil real podía quedar una llamada persistida y una señalización recuperable, pero sin el evento realtime de invitación en `/api/v1/streme/eventos`, debilitando la entrega inmediata del proceso equivalente de comunicación viva documentado en `APIS de memoriaBACKEND`.

Cambios aplicados:

- `js/app.js` agrega `publishDurableStremeEvent()` para publicar eventos importantes mediante `POST /api/v1/streme/eventos?s={siteId}` con `clientMutationId` estable.
- `publishCallInviteThroughMemoria()` ahora usa esa publicación durable para `call.incoming`; si falla, encola una operación `publishStremeEvent` con `dedupeKey` determinística `streme-call:{callId}:incoming:{clientMutationId}`.
- `replayBackendOperation()` reproduce operaciones `publishStremeEvent` sin duplicar llamadas, mensajes, estados ni señales de presencia/escritura.
- La cola durable se limita a la invitación realtime de llamada; `typing`, presencia y eventos efímeros siguen sin encolarse para evitar estados obsoletos.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-streme-call-invite-outbox-67` para invalidar la cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de publicación realtime de invitación de llamada; se preserva la lógica existente de autenticación, perfil, preferencias, relaciones, conversaciones, mensajes, estados, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx` efímero, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.


## 95. Revisión de punto débil: credencial Google/Gmail persistida fuera del contrato AUTENTICACIONx

En esta iteración se identificó como punto débil principal que ChatER ya exigía Google/Gmail mediante `AUTENTICACIONx`, cargaba `/login.js`, validaba `/auth/check` y creaba sesión con `/auth/firebase/session`, pero el token compatible `tk`/`signedSession` que memoriaBACKEND puede devolver cuando el navegador bloquea cookies se conservaba en `localStorage`. Eso debilitaba el contrato de seguridad publicado por `APIS de memoriaBACKEND`, donde la cookie `HttpOnly/Secure/SameSite=None` es la sesión principal y cualquier bearer compatible debe vivir solo como credencial temporal de pestaña.

Cambios aplicados:

- `js/app.js` agrega almacenamiento temporal de autenticación por pestaña con `sessionStorage` y fallback volátil en memoria cuando `sessionStorage` no esté disponible.
- `getAccessToken()`, `getRefreshToken()`, `persistAuthTokens()`, `markBackendSessionVerified()` e `isBackendSessionRecentlyVerified()` dejan de depender de `localStorage` para credenciales o marcas de sesión backend.
- `persistAuthTokens()` limpia tokens legados de `localStorage` si una versión anterior los dejó persistidos, conservando la sesión real en cookie segura y el token compatible solo como dato temporal de pestaña.
- `clearAuthTokens()` limpia credenciales temporales actuales y también remueve credenciales legadas persistidas para evitar rehidratación insegura entre cierres del navegador.
- El modal de estado de memoriaBACKEND ahora muestra “Token Google/Gmail temporal de pestaña” cuando el token compatible está activo.
- `docs/memoriaBACKEND_APIS.md` actualiza el contrato vigente de autenticación para reemplazar OTP por Google/Gmail con `AUTENTICACIONx` y documentar la regla de no persistir `tk`/`signedSession` en `localStorage`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-google-gmail-auth-69` para invalidar la cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de autenticación Google/Gmail; se preserva la lógica existente de perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 96. Revisión de punto débil: sesión local podía abrir ChatER si /auth/check fallaba sin 401 explícito

En esta iteración se identificó como punto débil principal que ChatER ya exigía Google/Gmail con `AUTENTICACIONx` y verificaba `/auth/check`, pero el arranque todavía podía terminar en `renderShell()` si existía un correo recordado localmente y memoriaBACKEND respondía una falla de sesión sin estado HTTP 401/403 explícito, por ejemplo `ok:0` con `err: login_requerido`. Eso era una regresión crítica para el requisito de autenticación Google/Gmail, porque un static site nunca debe tomar `localStorage` como prueba suficiente para abrir `chatER`.

Cambios aplicados:

- `bootstrapGoogleGmailSession()` ahora solo muestra la interfaz protegida si `restoreGoogleGmailSessionFromBackend()` devuelve una sesión validada por memoriaBACKEND.
- Si `/auth/check` no confirma sesión vigente, ChatER limpia sesión local y vuelve al acceso Google/Gmail aunque exista un correo recordado.
- `restoreGoogleGmailSessionFromBackend()` limpia sesión cuando recibe `ok:0`, payload inválido o error de autenticación, evitando que el correo local sobreviva como bypass.
- `isBackendAuthError()` ahora reconoce errores por código/mensaje (`login_requerido`, sesión inválida, token expirado, credencial revocada, no autorizado) además de HTTP 401/403.
- `refreshSession()` y `logout()` agregan `clientMutationId` e `X-MB-Idempotency-Key` para alinearse con el contrato de mutaciones de `AUTENTICACIONx`.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de autenticación Google/Gmail; se preserva la lógica existente de perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, adjuntos, `ImagenesCloudflareR2x`, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 97. Revisión de punto débil: fallback R2x incompleto cuando la API específica no está disponible

En esta iteración también se identificó que ChatER ya consultaba `GET /api/v1/imagenes-r2x/config` y usaba `ImagenesCloudflareR2x` para imágenes temporales WebP, pero si el endpoint de configuración o intención no estaba disponible en un despliegue de memoriaBACKEND, el cliente podía continuar con política local habilitada y fallar el adjunto antes de volver al proceso genérico existente. Eso contradecía la regla del ciclo: si memoriaBACKEND no tiene una API para ese proceso específico, se conserva la API actual del proyecto.

Cambios aplicados:

- `loadR2xImagePolicy()` ahora trata la ausencia/fallo recuperable de `/api/v1/imagenes-r2x/config` como bloque no disponible y usa `MEDIAfirmadaX` como respaldo canónico.
- `prepareR2xTemporaryImageForBackend()` convierte errores recuperables de intención, endpoint no encontrado, R2 no configurado o bloque deshabilitado en `R2X_POLICY_UNAVAILABLE`, que los flujos de adjuntos y estados ya capturan para continuar con `MEDIAfirmadaX`.
- Los errores de autenticación siguen sin fallback para no permitir subir media sin sesión Google/Gmail válida.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-google-gmail-auth-71` para invalidar cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- La mejora se limita al proceso equivalente de imágenes temporales y media firmada; se preserva la lógica existente de autenticación, perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.


## 98. Revisión de punto débil: idToken Google/Firebase y respuestas tardías de AUTENTICACIONx

En esta iteración se identificó como punto débil principal que ChatER ya exigía Google/Gmail con `AUTENTICACIONx`, cargaba `/login.js` y tenía declarado el método `apiClient.createFirebaseSession()` contra `POST /auth/firebase/session`, pero el flujo real de eventos del SDK todavía validaba principalmente con `/auth/check`. Si `login.js` entregaba un `idToken`, `id_token`, `firebaseIdToken`, `googleIdToken`, `tokenId` o `credential` sin haber dejado cookie activa todavía, el static site podía fallar la creación de sesión backend aunque `APIS de memoriaBACKEND` sí publica el proceso equivalente oficial para intercambiar ese token por sesión segura.

Cambios aplicados:

- `js/app.js` agrega `extractGoogleFirebaseIdTokenFromPayload()` para detectar tokens Google/Firebase en payloads directos o anidados devueltos por `login.js`, SDK o evento `memoriaBACKEND:login`.
- `verifyGoogleGmailPayloadAgainstBackend()` ahora usa `POST /auth/firebase/session?s={siteId}` cuando existe `idToken`/`credential` y conserva `/auth/check` como validación de cookie o bearer compatible cuando no hay token Firebase/Google explícito.
- El intercambio por `/auth/firebase/session` mantiene `next`, `clientMutationId`, `X-MB-Site`, `s={siteId}`, `X-Hashinmy-Action:webapp` e idempotencia mediante el cliente HTTP existente.
- Se agregó `activeGoogleLoginAttemptGuard` para que `restoreGoogleGmailSessionFromBackend()`, `startGoogleGmailLogin()` y el evento `memoriaBACKEND:login` solo completen sesión si el intento Google/Gmail vigente no fue cancelado, reemplazado por otro intento o invalidado por cierre de sesión/modal.
- Los eventos tardíos de `/login.js`, `/auth/check` o `/auth/firebase/session` ya no pueden abrir ChatER después de que el usuario cerró el acceso, inició otro intento o la sesión fue limpiada.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-firebase-session-guard-73` para invalidar cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json` y `manifest.json` validados como JSON correcto.
- La mejora se limita al proceso equivalente de autenticación Google/Gmail con `AUTENTICACIONx`; se preserva la lógica existente de perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, `ImagenesCloudflareR2x`, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 99. Revisión de punto débil: evidencia de proveedor Google/Gmail podía heredarse del payload local del SDK

En esta iteración se identificó como punto débil principal que ChatER ya usaba `AUTENTICACIONx`, `/auth/check` y `/auth/firebase/session`, pero al normalizar la respuesta verificada todavía podía conservar `authProvider` desde el payload local entregado por `login.js` o por el SDK si la respuesta backend no devolvía proveedor. Eso era demasiado permisivo para el requisito de acceso Google/Gmail: el static site puede usar el payload local para obtener un `idToken` candidato, pero la evidencia final de proveedor debe venir exclusivamente de memoriaBACKEND después de validar la sesión.

Cambios aplicados:

- `js/app.js` ahora calcula `backendProviderEvidence` desde la respuesta real de `/auth/check` o `/auth/firebase/session`.
- `verifyGoogleGmailPayloadAgainstBackend()` deja de aceptar `candidatePayload.authProvider` o `candidatePayload.user.provider` como confirmación suficiente de proveedor.
- El token candidato del SDK se conserva solo como credencial de intercambio/compatibilidad; no sustituye la confirmación de `AUTENTICACIONx`.
- Si memoriaBACKEND devuelve correo pero no confirma proveedor Google/Gmail, `validateGoogleGmailAuthPayload()` mantiene el bloqueo y vuelve al acceso seguro.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-auth-provider-backend-evidence-74` para invalidar la cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json` y `manifest.json` validados como JSON correcto.
- La mejora se limita al proceso equivalente de autenticación Google/Gmail con `AUTENTICACIONx`; se preserva la lógica existente de perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, `ImagenesCloudflareR2x`, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 100. Revisión de punto débil: restauración de sesión perdía `authProvider` canónico

En esta iteración se identificó como punto débil principal que ChatER ya exigía Google/Gmail con `AUTENTICACIONx` y validaba el proveedor contra memoriaBACKEND, pero la restauración automática mediante `apiClient.checkAuth()` normalizaba el payload antes de validarlo. Si `/auth/check` devolvía la evidencia de proveedor únicamente como `authProvider`, `signInProvider`, `sign_in_provider`, `firebase.sign_in_provider` o variantes anidadas equivalentes, `normalizeAuthPayload()` podía sobrescribir esa evidencia con una cadena vacía y bloquear una sesión backend válida. Ese bloqueo no abría ChatER sin autenticación, pero sí debilitaba la compatibilidad real con el contrato documentado en `APIS de memoriaBACKEND` para `AUTENTICACIONx`.

Cambios aplicados:

- `js/app.js` amplía `normalizeAuthPayload()` para conservar evidencia de proveedor desde `authProvider`, `provider`, `providerId`, `signInProvider`, `sign_in_provider`, `u.pr`, `firebase.sign_in_provider` y `claims.firebase.sign_in_provider` en payloads directos o anidados.
- La restauración por `GET /auth/check` queda alineada con la validación estricta ya existente: sigue exigiendo proveedor Google/Gmail confirmado por memoriaBACKEND, pero ya no descarta nombres de campo canónicos del propio backend.
- No se reduce la seguridad del acceso: el payload local del SDK sigue sin sustituir la confirmación backend dentro de `verifyGoogleGmailPayloadAgainstBackend()`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-auth-provider-normalize-75` para invalidar cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json` y `manifest.json` validados como JSON correcto.
- La mejora se limita al proceso equivalente de autenticación Google/Gmail con `AUTENTICACIONx`; se preserva la lógica existente de perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, `ImagenesCloudflareR2x`, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.


## 101. Revisión de punto débil: privacidad, bloqueo y reportes seguían como rutas heredadas

En esta iteración se identificó como punto débil principal que ChatER ya estaba sincronizado con los bloques canónicos de autenticación Google/Gmail, perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, media, presencia, señalización, búsqueda, visitas, reconciliación y gobernanza, pero el proceso de seguridad de usuario todavía quedaba documentado con rutas heredadas (`/users/{userId}/block`, `/reports` y `/privacy/settings`) y no tenía acciones funcionales conectadas al static site. El catálogo adjunto `APIS de memoriaBACKEND/apis.txt` sí publica procesos equivalentes para esos casos: `BLOQUEOSusuarioX`, `REPORTESmoderacionX` y `PRIVACIDADusuarioX`.

Cambios aplicados:

- `js/app.js` agrega métodos canónicos en `apiClient` para `POST /api/v1/privacidad-usuario`, `POST /api/v1/bloqueos-usuario` y `POST /api/v1/reportes-moderacion`, siempre con `s={siteId}`, `X-MB-Site`, `clientMutationId` e idempotencia.
- El modal de perfil ahora muestra el estado de privacidad y permite configurar visibilidad de perfil, estado y última actividad sin depender de endpoints heredados.
- El menú de conversación ahora permite bloquear/desbloquear el contacto y reportar la conversación; ambas operaciones sincronizan con memoriaBACKEND y quedan en cola local si el backend falla temporalmente.
- Una conversación bloqueada deshabilita el compositor y muestra texto de producción para evitar enviar mensajes mientras el bloqueo esté activo.
- `normalizeLoadedState()` y `normalizeConversationFromApi()` preservan campos de privacidad, bloqueo y reporte para no perder estado entre recargas o respuestas parciales del backend.
- La documentación ejecutable corrige el bloque 16 para reemplazar las rutas heredadas por `BLOQUEOSusuarioX`, `REPORTESmoderacionX` y `PRIVACIDADusuarioX`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-privacy-block-report-76` para invalidar la cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json` y `manifest.json` validados como JSON correcto.
- La mejora se limita a procesos equivalentes publicados por memoriaBACKEND para privacidad, bloqueo de usuario y reportes de moderación; se preserva la lógica existente de autenticación Google/Gmail, perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 102. Revisión de punto débil: baja de notificaciones push quedaba solo local

En esta iteración se identificó como punto débil principal que ChatER ya consultaba `/api/v1/push/config`, registraba el dispositivo con `POST /api/v1/push/suscripciones` y enviaba pruebas con `/api/v1/push/enviar`, pero la pantalla de notificaciones no ofrecía una baja real del dispositivo frente a memoriaBACKEND. El catálogo adjunto `APIS de memoriaBACKEND/apis.txt` sí publica el proceso equivalente dentro de `APInotificacionesPUSHx`: `DELETE /api/v1/push/suscripciones` con `endpoint` de la suscripción y cabecera `X-Hashinmy-Action:webapp`.

Cambios aplicados:

- `js/app.js` agrega `apiClient.unregisterDevice()` contra `DELETE /api/v1/push/suscripciones`, enviando `deviceId`, `clientId`, `endpoint`, `pushSubscription`, `active:false`, usuario autenticado, `clientMutationId`, `s={siteId}`, `X-MB-Site`, `X-Hashinmy-Action:webapp` e idempotencia.
- El modal **Notificaciones** agrega la acción **Desactivar en este dispositivo** con texto de producción.
- `deactivateNotificationsForDevice()` intenta cancelar la `PushSubscription` local del navegador y luego sincroniza la baja con memoriaBACKEND; si el backend falla, encola `unregisterDevice` sin reactivar notificaciones localmente.
- La cola local ahora reintenta `unregisterDevice` y marca la baja como sincronizada cuando memoriaBACKEND responde.
- El estado local de notificaciones distingue `pending_revoke`, `revoked` y `revoked_local`, y se mantiene sincronizable con preferencias de usuario sin conservar tokens obsoletos.
- La documentación del contrato de notificaciones reemplaza la ruta imprecisa `DELETE /api/v1/push/suscripciones/{deviceId}` por el contrato real `DELETE /api/v1/push/suscripciones` publicado en `APIS de memoriaBACKEND`.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-push-unsubscribe-77` para invalidar cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json` y `manifest.json` validados como JSON correcto.
- La mejora se limita al proceso equivalente de notificaciones push publicado por memoriaBACKEND; se preserva la lógica existente de autenticación Google/Gmail, perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 103. Revisión de punto débil: errores del navegador seguían apuntando a rutas heredadas

En esta iteración se identificó como punto débil principal que la documentación vigente aún mencionaba endpoints heredados de errores del cliente, versión y salud como referencias de auditoría/salud, mientras el catálogo adjunto `APIS de memoriaBACKEND/apis.txt` publica capacidades canónicas para static sites en `VERSIONESapi`, `BLOQUESsincronizadosX`, `EVENTOSx` y `LOGSx`. Como `LOGSx` no expone una mutación pública directa para que el navegador escriba errores, el proceso equivalente más seguro para errores frontend es `EVENTOSx` mediante `POST /api/v1/eventos/registrar`.

Cambios aplicados:

- `js/config.js` agrega `ENABLE_CLIENT_TELEMETRY` para activar o desactivar por despliegue la telemetría técnica sin recompilar el static site.
- `js/app.js` agrega `apiClient.registerClientTelemetry()` contra `POST /api/v1/eventos/registrar?s={siteId}`, con `X-MB-Site`, `X-Hashinmy-Action:webapp`, `X-MB-Idempotency-Key` y `clientMutationId`.
- `js/app.js` registra listeners de `window.error` y `window.unhandledrejection` para enviar eventos `client_error` y `unhandled_rejection` únicamente cuando `MEMORIA_BACKEND_URL` está configurado.
- Antes de enviar telemetría, ChatER sanea correos, tokens, parámetros sensibles, URLs y stack, limita la longitud del payload y aplica throttling local para evitar ruido o bucles de reporte.
- La telemetría de errores no queda en cola local: si memoriaBACKEND está caído, se descarta silenciosamente para no llenar el almacenamiento con errores de observabilidad.
- `docs/memoriaBACKEND_APIS.md` reemplaza la referencia ejecutable heredada de errores del cliente por el contrato canónico `EVENTOSx` y mantiene `VERSIONESapi`/`BLOQUESsincronizadosX` para salud de contratos.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-client-telemetry-eventos-78` para invalidar la cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json` y `manifest.json` validados como JSON correcto.
- La mejora se limita al proceso equivalente de telemetría técnica de frontend con `EVENTOSx`; se preserva la lógica existente de autenticación Google/Gmail, perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 104. Revisión de punto débil: mutaciones protegidas podían quedar en cola con sesión Google/Gmail vencida

En esta iteración se identificó como punto débil principal que ChatER ya exigía autenticación Google/Gmail con `AUTENTICACIONx`, validaba `/auth/check` y limpiaba sesiones inválidas durante el arranque, pero una API protegida de memoriaBACKEND podía responder `401`, `403` u `ok:0` por sesión vencida durante una acción posterior del usuario. En ese escenario, algunos flujos optimistas podían tratar el fallo como caída temporal del backend y dejar mensajes, conversaciones, estados, media, push o acciones de sincronización en cola local. Eso no era suficientemente estricto para producción: si memoriaBACKEND rechaza credenciales, el static site debe bloquear la sesión y pedir reingreso con Google/Gmail, no seguir acumulando mutaciones bajo una identidad no aceptada.

Cambios aplicados:

- `js/app.js` agrega `isProtectedChatERMemoriaApiPath()` para distinguir APIs protegidas de ChatER frente a APIs públicas de observabilidad, visitas, manifiestos o herramientas de static site.
- `apiClient.request()` ahora intercepta errores HTTP y payloads `ok:0` de memoriaBACKEND antes de propagarlos. Si el error corresponde a autenticación y la ruta pertenece a un proceso protegido, ejecuta cierre local seguro, invalida la sesión activa y renderiza el acceso Google/Gmail.
- Si una petición protegida recibe `401` e intenta renovar con `/auth/refresh`, un fallo de refresh también invalida la sesión capturada antes de que la mutación pueda quedarse en cola como si fuera un problema transitorio.
- El comportamiento se limita a rutas protegidas como perfil, preferencias, conversaciones, mensajes, relaciones, privacidad, bloqueos, reportes, presencia, media, estados, llamadas, señalización, push, reconciliación, cursor, búsqueda y `streme` de conversación. No afecta visitas públicas, telemetría técnica, manifiestos, validación de bloques ni eventos comerciales de static site.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-auth-failure-guard-79` para invalidar la cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json`, `manifest.json` y `estructura_del_proyecto.json` validados como JSON correcto.
- La mejora se limita al control de sesión vencida en APIs protegidas de memoriaBACKEND; se preserva la lógica existente de autenticación Google/Gmail, perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.

## 105. Revisión de punto débil: cola local podía aceptar operaciones sin propietario autenticado

En esta iteración se identificó como punto débil principal que ChatER ya limpiaba la sesión cuando una API protegida de memoriaBACKEND respondía un error de autenticación, pero algunos flujos asíncronos sin guarda local directa —por ejemplo publicaciones durables de `STREMEx` o señales de `SIGNALINGtiempoRealX` asociadas a llamadas— podían ejecutar su `catch` después de esa limpieza e intentar encolar la operación pendiente. Aunque la sesión ya no quedaba abierta, la cola podía terminar escrita bajo una identidad vacía o no propietaria. Eso era incompatible con el requisito de Google/Gmail: toda mutación protegida pendiente debe quedar asociada a una cuenta Gmail vigente validada por memoriaBACKEND o no debe encolarse.

Cambios aplicados:

- `js/app.js` refuerza `enqueueBackendOperation()` como punto común de seguridad de la cola local.
- La cola ahora normaliza el propietario con `getSessionEmail()` y, si `REQUIRE_GOOGLE_GMAIL_AUTH` está activo, rechaza cualquier encolado cuando no existe una sesión Google/Gmail vigente.
- Las operaciones nuevas guardan `ownerEmail` dentro del registro pendiente para auditoría local y para evitar ambigüedad entre cuentas usadas en el mismo navegador.
- Las actualizaciones de operaciones existentes y las nuevas persistencias pasan explícitamente el correo propietario a `persistBackendOutbox()`, preservando el aislamiento por cuenta ya implementado.
- Se preserva el modo sin backend: si `MEMORIA_BACKEND_URL` está vacío, no se crea cola remota, como antes.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-outbox-session-owner-80` para invalidar la cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json`, `manifest.json` y `estructura_del_proyecto.json` validados como JSON correcto.
- La mejora se limita al aislamiento propietario de la cola local para mutaciones protegidas; se preserva la lógica existente de autenticación Google/Gmail, perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, adjuntos, R2x, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir `YA ESTA LISTO`.


## 106. Revisión de punto débil: documentación ejecutable aún conservaba referencias heredadas de autenticación y push

En esta iteración se identificó como punto débil principal que el runtime de ChatER ya usaba `AUTENTICACIONx` con Google/Gmail y `APInotificacionesPUSHx`, pero algunas secciones históricas de esta documentación seguían describiendo como criterio operativo rutas o procesos heredados de acceso, dispositivos, notificaciones, versión y errores del cliente. Aunque `js/app.js` ya no dependía de esas rutas como contrato principal, mantenerlas en la documentación ejecutable podía guiar una siguiente iteración a reintroducir APIs antiguas contra la regla de sincronizar primero con `APIS de memoriaBACKEND`.

Cambios aplicados:

- `docs/memoriaBACKEND_APIS.md` reemplaza el mapa operativo de acceso OTP por el flujo vigente `GET /auth/login`, `GET /login.js`, `GET /auth/check` y `POST /auth/firebase/session` de `AUTENTICACIONx`.
- La sección de notificaciones deja de recomendar endpoints heredados de dispositivos y pruebas; ahora apunta a `POST /api/v1/push/suscripciones` y `POST /api/v1/push/enviar`, que son las rutas canónicas publicadas por memoriaBACKEND.
- La sección PWA deja de recomendar endpoints heredados de versión y errores del cliente como endpoints productivos; para versión/contratos usa `VERSIONESapi` y `BLOQUESsincronizadosX`, y para errores técnicos usa `EVENTOSx` mediante `POST /api/v1/eventos/registrar`.
- Las menciones de preservación de “login/autenticación por correo” se normalizan a “autenticación Google/Gmail”, sin cambiar la lógica funcional de la app ni tocar la carpeta `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json`, `manifest.json` y `estructura_del_proyecto.json` validados como JSON correcto.
- Se verificó que las rutas usadas por `apiClient.request()` existen en `APIS de memoriaBACKEND/apis v475.txt` y no se detectaron llamadas activas a endpoints heredados de dispositivos, notificaciones, errores, versión, chats, estados, llamadas, media ni realtime.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta limpieza documental y vuelva a ejecutar la validación completa antes de emitir la frase final.

## 107. Revisión de punto débil: referencias históricas a rutas heredadas seguían dentro de la documentación ejecutable

En esta iteración se identificó como punto débil principal que el runtime de ChatER ya estaba sincronizado con las APIs canónicas publicadas en `APIS de memoriaBACKEND`, pero algunas secciones históricas de esta documentación todavía describían acciones vigentes usando rutas heredadas de llamadas, chats, lectura, estados, promoción, media y realtime. Aunque esas rutas no aparecían como llamadas activas en `js/app.js`, conservarlas como criterios operativos podía inducir a una siguiente iteración a reintroducir contratos que ya fueron reemplazados por memoriaBACKEND.

Cambios aplicados:

- `docs/memoriaBACKEND_APIS.md` consolida las referencias ejecutables de llamadas hacia `SESIONEScomunicacionX` mediante `GET/POST /api/v1/sesiones-comunicacion`.
- La lectura de conversaciones queda descrita con `INTERACCIONESmensajeX` mediante `POST /api/v1/interacciones-mensaje`, no con contratos heredados de lectura de chat.
- Los estados 24h y su promoción quedan descritos con `PUBLICACIONESefimerasX`: `GET/POST/PATCH /api/v1/publicaciones-efimeras`.
- Los adjuntos y estados visuales quedan descritos con `ImagenesCloudflareR2x` para imágenes WebP temporales optimizadas y `MEDIAfirmadaX` para media genérica, antes de crear mensajes o publicaciones en `/api/v1/mensajes` o `/api/v1/publicaciones-efimeras`.
- La publicación realtime queda descrita con `POST /api/v1/streme/eventos`, preservando SSE/WebSocket del static site y sin introducir polling.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json`, `manifest.json` y `estructura_del_proyecto.json` validados como JSON correcto.
- Se verificó que no hay llamadas activas en `js/app.js`, `index.html`, `js/config.js`, `js/pwa.js` ni `manifest.json` hacia endpoints heredados de dispositivos, notificaciones, errores, versión, chats, estados, llamadas, media o realtime.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta limpieza documental y vuelva a ejecutar la validación completa antes de emitir la frase final.

## 108. Revisión de punto débil: historial documental todavía podía reintroducir contratos heredados

En esta iteración se identificó como punto débil principal que el runtime ya consumía las rutas canónicas de `APIS de memoriaBACKEND`, pero el historial ejecutable de esta documentación todavía conservaba nombres literales de endpoints heredados dentro de secciones antiguas. Aunque muchas menciones eran explicativas o de negación, en un ciclo automático podían ser interpretadas como contratos todavía válidos y provocar una regresión hacia rutas que memoriaBACKEND ya reemplazó.

Cambios aplicados:

- `docs/memoriaBACKEND_APIS.md` normaliza las secciones históricas para hablar de contratos heredados por categoría, sin dejarlos como rutas operativas copiables.
- Las acciones de archivar, restaurar y fijar conversaciones quedan documentadas únicamente contra `PATCH /api/v1/conversaciones/{conversationId}`.
- La promoción de estados queda documentada únicamente contra `PATCH /api/v1/publicaciones-efimeras/{stateId}`.
- La lectura de conversaciones queda documentada únicamente contra `POST /api/v1/interacciones-mensaje`.
- Las notificaciones, telemetría, versión, bloques, media y realtime quedan referenciadas por sus bloques canónicos: `APInotificacionesPUSHx`, `EVENTOSx`, `VERSIONESapi`, `BLOQUESsincronizadosX`, `MEDIAfirmadaX`, `ImagenesCloudflareR2x` y `STREMEx`.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json`, `manifest.json` y `estructura_del_proyecto.json` validados como JSON correcto.
- Se verificó que las rutas activas de `apiClient.request()` existen en `APIS de memoriaBACKEND/apis v475.txt`.
- La corrección es documental y no altera lógica runtime, assets, service worker, autenticación Google/Gmail, cola local, PWA, `STREMEx`, notificaciones, adjuntos, estados ni conversaciones.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta limpieza documental y vuelva a ejecutar la validación completa antes de emitir la frase final.

## 109. Revisión de punto débil: evento oficial de login.js ignorado cuando no había sesión local previa

En esta iteración se identificó como punto débil principal que ChatER ya exigía Google/Gmail mediante `AUTENTICACIONx`, cargaba `/login.js`, validaba `/auth/check` y podía crear sesión con `POST /auth/firebase/session`, pero el listener local de `memoriaBACKEND:login` descartaba el evento cuando no existía todavía un correo guardado en la sesión local. Eso podía romper el flujo oficial de `login.js` después de una redirección o en navegadores donde la cookie segura no queda disponible y el script entrega el token compatible `tk`/`idToken` por evento.

Cambios aplicados:

- `js/app.js` conserva la protección contra intentos Google/Gmail obsoletos mediante `activeGoogleLoginAttemptGuard`, pero ya no descarta un evento oficial de `login.js` solo porque todavía no exista correo local.
- El evento `memoriaBACKEND:login` ahora siempre pasa por `verifyGoogleGmailPayloadAgainstBackend()`, que valida contra `AUTENTICACIONx` usando `POST /auth/firebase/session` cuando llega un token Google/Firebase o `GET /auth/check` cuando debe confirmarse cookie/bearer compatible.
- ChatER sigue sin aceptar identidad local como prueba de acceso: `completeAuthenticatedSession()` mantiene la validación estricta de proveedor Google/Gmail, correo Gmail permitido y confirmación real de memoriaBACKEND antes de mostrar la interfaz.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-login-event-bridge-82` para invalidar la cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json`, `manifest.json` y `estructura_del_proyecto.json` validados como JSON correcto.
- Se verificó que las rutas activas de `apiClient.request()` existen en `APIS de memoriaBACKEND/apis v475.txt` y que la corrección se limita al puente de autenticación Google/Gmail con `AUTENTICACIONx`.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir la frase final.

## 110. Revisión de punto débil: autenticación Google/Gmail todavía era desactivable por configuración

En esta iteración se identificó como punto débil principal que ChatER ya integraba `AUTENTICACIONx`, `/login.js`, `/auth/check` y `POST /auth/firebase/session`, pero el runtime aún evaluaba `REQUIRE_GOOGLE_GMAIL_AUTH !== false`. Eso permitía que un despliegue estático modificara `js/config.js` y abriera la interfaz protegida sin la validación Google/Gmail exigida por la solicitud.

Cambios aplicados:

- `js/app.js` endurece `shouldRequireGoogleGmailAuth()` para devolver siempre `true`; la autenticación Google/Gmail queda como requisito duro de producto antes de renderizar `chatER`.
- `js/config.js` conserva la bandera histórica solo como compatibilidad documental, pero aclara que el runtime ya no permite usarla como bypass.
- `app-version.json` y `CHATER_SW_VERSION` suben a `2026-07-03-memoriabackend-auth-required-non-optional-83` para invalidar la cache PWA anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json`, `manifest.json` y `estructura_del_proyecto.json` validados como JSON correcto.
- La mejora se limita al requisito obligatorio de autenticación Google/Gmail; se preserva la integración existente con perfil, preferencias, relaciones, conversaciones, mensajes, estados, llamadas, adjuntos, `ImagenesCloudflareR2x`, `MEDIAfirmadaX`, `PRESENCIAusuarioX`, `BLOQUESsincronizadosX`, `STREMEx`, `SIGNALINGtiempoRealX`, notificaciones push, herramientas comerciales, búsqueda remota, visitas del static site, reconciliación de IDs, cursor de sincronización, cola local, PWA e imágenes opcionales.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta mejora y vuelva a ejecutar la validación completa antes de emitir la frase final.

## 111. Revisión de punto débil: el service worker aún reconocía prefijos heredados como backend runtime

En esta iteración se identificó como punto débil principal que el runtime de `js/app.js` ya usa las APIs canónicas publicadas dentro de `APIS de memoriaBACKEND`, pero `service-worker.js` todavía conservaba una lista amplia de prefijos heredados para omitir cache (`/chats`, `/messages`, `/states`, `/calls`, `/media`, `/devices`, `/notifications`, `/search`, `/users`, `/reports`, `/privacy`, `/client-errors`, `/version`, entre otros). Aunque esa lista no ejecutaba llamadas directas, mantenía contratos antiguos dentro de la política runtime de la PWA y podía inducir futuras iteraciones a tratar rutas reemplazadas como APIs vigentes.

Cambios aplicados:

- `service-worker.js` reduce `isRuntimeBackendRequest()` a los montajes canónicos necesarios para un static site sincronizado con memoriaBACKEND: `/api/v1`, `/auth`, `/login.js` y `/sdk`.
- Se mantiene el bypass de cache para SSE mediante `Accept: text/event-stream`, preservando `STREMEx` sin polling.
- Se eliminan de la política runtime de cache los prefijos heredados de chats, mensajes, estados, llamadas, media, dispositivos, notificaciones, búsqueda, usuarios, reportes, privacidad, errores de cliente y versión.
- `CHATER_SW_VERSION` y `app-version.json` suben a `2026-07-03-memoriabackend-sw-canonical-runtime-prefixes-84` para que una PWA instalada refresque el service worker anterior.
- No se modificó ningún archivo dentro de `APIS de memoriaBACKEND`.

Validación funcional:

- `node --check js/app.js` ejecutado correctamente.
- `node --check js/config.js` ejecutado correctamente.
- `node --check js/pwa.js` ejecutado correctamente.
- `node --check service-worker.js` ejecutado correctamente.
- `app-version.json`, `manifest.json` y `estructura_del_proyecto.json` validados como JSON correcto.
- Se verificó que las rutas activas de `apiClient.request()` existen en `APIS de memoriaBACKEND/apis v475.txt` y que `service-worker.js` ya no mantiene prefijos heredados como contratos runtime cacheables o excluidos.

Estado:
- Avance parcial robusto. Se entrega ZIP con módulos afectados para que Nova aplique esta limpieza de cache runtime y vuelva a ejecutar la validación completa antes de emitir la frase final.
