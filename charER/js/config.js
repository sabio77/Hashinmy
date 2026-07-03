// Configuración editable para despliegues static site en Render.com.
// Este archivo puede reemplazarse en producción sin recompilar el frontend.
window.CHATER_CONFIG = window.CHATER_CONFIG || {
  // Dominio base de memoriaBACKEND, sin /api/v1. Ejemplo: https://memoriabackend.example.com
  MEMORIA_BACKEND_URL: '',
  // Site ID autorizado en memoriaBACKEND. Se envía como ?s= y como X-MB-Site.
  MEMORIA_SITE_ID: 'a1',
  // Prefijo canónico de APIs versionadas de memoriaBACKEND.
  MEMORIA_API_PREFIX: '/api/v1',
  // Opcional. Si queda vacío, ChatER abre SSE en /api/v1/streme/eventos.
  // Si defines una URL manual, ChatER agregará s, canal y clientId cuando falten.
  STREME_REALTIME_URL: '',
  STREME_TRANSPORT: 'auto',
  STREME_CHANNEL: 'chater-general',
  // Registra apertura real del static site en /api/v1/visitas/apertura cuando memoriaBACKEND está configurado.
  ENABLE_STATIC_VISIT_TRACKING: true,
  // Sincroniza preferencias privadas del usuario en /api/v1/preferencias-usuario sin depender solo de localStorage.
  ENABLE_REMOTE_USER_PREFERENCES: true,
  API_TIMEOUT_MS: 15000,
  MEDIA_UPLOAD_TIMEOUT_MS: 60000,
  // Imágenes de chat/estado se optimizan a WebP temporal y usan /api/v1/imagenes-r2x.
  ENABLE_R2X_IMAGE_UPLOADS: true,
  TEMP_IMAGE_R2X_MAX_BYTES: 256000,
  MESSAGE_MEDIA_PREVIEW_MAX_BYTES: 1500000,
  // Clave pública VAPID opcional. Si queda vacía, ChatER consulta /api/v1/push/config en memoriaBACKEND.
  PUSH_PUBLIC_KEY: ''
};
