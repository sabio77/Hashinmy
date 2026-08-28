import { apiGet, post, getBackendUrl, getSessionToken, setSessionToken, uploadToSignedUrl, withTrafficClientId } from './api.js';
import { signInWithGooglePopup, signOutFirebaseSession, getFirebaseWebConfigError } from './firebase.auth.js';
import {
  extractLinkPreviewUrls,
  linkPreviewHostLabel,
  normalizeLinkPreviewUrl,
  openLinkPreviewUrl,
  renderLinkPreviewTextBody
} from '../../LINKminiaturasx/conexion/index.js';
import {
  extractChatERContactLinks,
  renderChatERSharedContactCards,
  stripChatERContactLinksFromText
} from '../../LINKcontactosCHATERx/conexion/index.js';

const clientIdKey = 'chater_client_id';
const realtimeLeaderStorageKey = 'chater_realtime_leader_v1';
const realtimeBusStorageKey = 'chater_realtime_bus_v1';
const realtimeLastEventPrefix = 'chater_realtime_last_event_v1';
const realtimeTokenCacheKey = 'chater_realtime_token_v1';
const realtimeRetryAfterStorageKey = 'chater_realtime_retry_after_v1';
const realtimeBackoffStorageKey = 'chater_realtime_backoff_v1';
const bootstrapRestoreLeaderStorageKey = 'chater_bootstrap_restore_leader_v1';
const bootstrapRestoreSnapshotStoragePrefix = 'chater_bootstrap_restore_snapshot_v1';
const realtimeTokenRefreshSkewMs = 60 * 1000;
const realtimeChannelName = 'chater_realtime_channel_v1';
const realtimeLeaderLeaseMs = 15000;
const realtimeLeaderRenewMs = 5000;
const realtimeElectionMs = 7000;
const realtimeHiddenReleaseMs = 12000;
const realtimePeerActivityTtlMs = Math.max(realtimeHiddenReleaseMs * 2, realtimeElectionMs * 3);
const realtimeStableConnectionMs = 30000;
const realtimeShortConnectionMs = 10000;
const realtimeBackoffStorageTtlMs = 30 * 60 * 1000;
const realtimeLeadershipSettleMs = 120;
const bootstrapRestoreLeaderLeaseMs = 8000;
const bootstrapRestoreLeaderRenewMs = 2500;
const bootstrapRestorePeerWaitMs = 220;
const bootstrapRestoreLeaderMaxWaitMs = 30000;
const bootstrapRestoreSnapshotFreshMs = 15000;
const bootstrapRestoreSnapshotStorageTtlMs = 3000;
const bootstrapRestoreSnapshotGraceMs = 1000;
const chatListFreshReuseMs = 15 * 1000;
const messageHistoryFreshReuseMs = 30 * 1000;
const typingSignalRefreshMs = 4000;
const typingIdleDelayMs = 1800;
let imageCompressorLoadPromise = null;
const draftStoragePrefix = 'chater_draft_v1';
const draftOriginStorageKey = 'chater_draft_origin_v1';
const draftSaveDelayMs = 7 * 1000;
const draftRemoteSyncMinIntervalMs = 30 * 1000;
const outboxStoragePrefix = 'chater_outbox_v1';
const outboxRetryLeaderStoragePrefix = 'chater_outbox_retry_leader_v1';
const outboxRetryLeaderLeaseMs = 30000;
const outboxRetryLeaderRenewMs = 10000;
const outboxRetryLeadershipSettleMs = 90;
const outboxRetryBaseMs = 2000;
const outboxRetryMaxMs = 5 * 60 * 1000;
const outboxRetryServerMaxMs = 2 * 60 * 60 * 1000;
const deliveryAckQueueStorageKey = 'chater_delivery_ack_queue_v1';
const deliveryAckMaxAttempts = 10;
const deliveryAckMaxAgeMs = 24 * 60 * 60 * 1000;
const deliveryAckBatchDelayMs = 180;
const deliveryAckBatchMaxItems = 40;
const pushRegistrationCacheKey = 'chater_push_registration_v1';
const pushRegistrationRefreshMs = 24 * 60 * 60 * 1000;
const privacyModeKey = 'chater_privacy_mode_v1';
const privacyLockStorageKey = 'chater_privacy_lock_v1';
const privacyLockAutoMs = 5 * 60 * 1000;
const privacyLockHiddenGraceMs = 30 * 1000;
const compactModeKey = 'chater_compact_mode_v1';
const installedStorageKey = 'chater_installed_v1';
const installDismissedStorageKey = 'chater_install_dismissed_v1';
const scrollBottomThresholdPx = 160;
const quickReactions = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];
const reactionRecentStorageKey = 'chater_recent_reactions_v1';
const messageActionRecentStorageKey = 'chater_recent_message_actions_v1';
const recentMessageControlLimit = 3;
const iconInsertStorageKey = 'chater_recent_emojis_v1';
const iconInsertLegacyStorageKey = 'chater_recent_icon_inserts_v1';
const iconInsertMaxRecent = 24;
const permissionDenialStorageKey = 'chater_permission_denials_v1';
const permissionAutoSettingsThreshold = 2;
const allowedReactionEmojis = Object.freeze(['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅']);
const reactionEmojiAliases = Object.freeze({
  like: '👍',
  love: '❤️',
  laugh: '😂',
  surprise: '😮',
  sad: '😢',
  thanks: '🙏',
  important: '🔥',
  confirm: '✅'
});
const iconInsertCategories = [
  { id: 'recientes', title: 'Recientes', icon: '🕘', emojis: [] },
  { id: 'caras', title: 'Caras', icon: '😊', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','🙂','🙃','😉','😊','😇','😍','😘','😜','🤗','🤔','😎','🥳','😬','😢','😭','😡'] },
  { id: 'gestos', title: 'Gestos', icon: '👍', emojis: ['👍','👎','👏','🙌','🙏','🤝','💪','👌','✌️','🤞','👋','🤟','☝️','👇','👉','👈','🫶','🤲'] },
  { id: 'trabajo', title: 'Trabajo', icon: '💼', emojis: ['💼','📌','📎','📝','📅','⏰','✅','☑️','❌','⚠️','🚨','📣','💡','🔎','🔒','🔗','📊','📈','📦','🚀'] },
  { id: 'objetos', title: 'Objetos', icon: '⭐', emojis: ['⭐','🔥','❤️','💚','💙','💜','✨','🎉','🏆','🎯','🎁','📍','📞','📧','💬','🔔','🔕','🌟'] }
];

const ceUiIconPaths = Object.freeze({
  "gallery": "<path d=\"M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v12h16V6H4Zm3 2.5A2.5 2.5 0 1 1 7 13.5a2.5 2.5 0 0 1 0-5ZM4.8 17l4.1-4.1 2.4 2.4 2.7-2.7 5.2 4.4H4.8Z\"/>",
  "camera": "<path d=\"M8.4 4 10 2h4l1.6 2H19a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h3.4ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm6-2h2v2h-2V7Z\"/>",
  "location": "<path d=\"M12 2a7 7 0 0 1 7 7c0 5.2-7 13-7 13S5 14.2 5 9a7 7 0 0 1 7-7Zm0 2a5 5 0 0 0-5 5c0 2.9 3.1 7.7 5 10.3 1.9-2.6 5-7.4 5-10.3a5 5 0 0 0-5-5Zm0 2.5A2.5 2.5 0 1 1 12 11.5a2.5 2.5 0 0 1 0-5Z\"/>",
  "contact": "<path d=\"M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM4 22v-2c0-4 3.6-6 8-6s8 2 8 6v2h-2v-2c0-2.5-2.7-4-6-4s-6 1.5-6 4v2H4Z\"/>",
  "chater": "<path d=\"M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-6l-4.5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v11h7.5v1.55L13.25 16H20V5H4Zm4 3h8v2H8V8Zm0 4h5v2H8v-2Z\"/>",
  "attachment": "<path d=\"M17.7 6.3a4.25 4.25 0 0 0-6.01 0L5.4 12.59a3 3 0 1 0 4.24 4.24l7.07-7.07-1.41-1.41-7.07 7.07a1 1 0 1 1-1.41-1.41l6.29-6.3a2.25 2.25 0 0 1 3.18 3.18l-7.07 7.08A4.75 4.75 0 0 1 2.5 11.25l6.72-6.72 1.42 1.42-6.72 6.71a2.75 2.75 0 0 0 3.89 3.89l7.07-7.07 1.42 1.41-7.08 7.08a4.75 4.75 0 0 1-6.71-6.72l6.72-6.72a6.25 6.25 0 1 1 8.84 8.84l-6.37 6.36-1.41-1.41 6.36-6.36a4.25 4.25 0 0 0 0-6.01Z\"/>",
  "bolt": "<path d=\"M13 2 4 14h6l-1 8 9-12h-6l1-8Z\"/>",
  "spark": "<path d=\"M12 2 9.8 8.8 3 11l6.8 2.2L12 20l2.2-6.8L21 11l-6.8-2.2L12 2Zm7 14-1 3-3 1 3 1 1 3 1-3 3-1-3-1-1-3ZM5 2 4.2 4.2 2 5l2.2.8L5 8l.8-2.2L8 5l-2.2-.8L5 2Z\"/>",
  "sparkles": "<path d=\"M12 2 9.8 8.8 3 11l6.8 2.2L12 20l2.2-6.8L21 11l-6.8-2.2L12 2Zm7 14-1 3-3 1 3 1 1 3 1-3 3-1-3-1-1-3ZM5 2 4.2 4.2 2 5l2.2.8L5 8l.8-2.2L8 5l-2.2-.8L5 2Z\"/>",
  "schedule": "<path d=\"M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2Zm12 8H5v9h14v-9ZM5 6v2h14V6H5Zm8 6h-2v4.2l3.3 2 1-1.6-2.3-1.4V12Z\"/>",
  "poll": "<path d=\"M5 19h14v2H5v-2Zm1-6h3v5H6v-5Zm5-8h3v13h-3V5Zm5 4h3v9h-3V9Z\"/>",
  "mic": "<path d=\"M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm5 8v1a5 5 0 0 1-10 0v-1H5v1a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12v-1h-2Z\"/>",
  "check": "<path d=\"M9.2 16.6 4.9 12.3 3.5 13.7l5.7 5.7L21 7.6 19.6 6.2 9.2 16.6Z\"/>",
  "send": "<path d=\"M3 20.5V3.5L21 12 3 20.5Zm2-3.1L15.85 12 5 6.6v3.8l5.8 1.6L5 13.6v3.8Z\"/>",
  "stop": "<path d=\"M6 6h12v12H6V6Z\"/>",
  "bellOff": "<path d=\"M4.27 3 3 4.27l3.02 3.02A7.86 7.86 0 0 0 5 11v4l-2 2v1h15.73L20.73 20 22 18.73 4.27 3ZM12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-7v-4a7 7 0 0 0-9.9-6.37l9.7 9.7.2.2V15Z\"/>",
  "timer": "<path d=\"M15 1H9v2h6V1Zm-4 11.6V7h2v6.4l3.2 3.2-1.4 1.4L11 14.2v-1.6ZM12 4a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z\"/>",
  "hourglass": "<path d=\"M6 2h12v6.2L14.2 12 18 15.8V22H6v-6.2L9.8 12 6 8.2V2Zm2 2v3.4l4 4 4-4V4H8Zm4 8.6-4 4V20h8v-3.4l-4-4Z\"/>",
  "file": "<path d=\"M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V8h4.5L13 3.5ZM7 12h10v2H7v-2Zm0 4h10v2H7v-2Z\"/>",
  "note": "<path d=\"M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5L14 3.5ZM7 11h10v2H7v-2Zm0 4h10v2H7v-2Zm0 4h6v-2H7v2Z\"/>",
  "star": "<path d=\"m12 2.6 2.9 5.88 6.5.95-4.7 4.58 1.11 6.47L12 17.42l-5.81 3.06 1.11-6.47-4.7-4.58 6.5-.95L12 2.6Z\"/>",
  "starOutline": "<path d=\"m12 6.84 1.56 3.16 3.49.51-2.52 2.46.59 3.47L12 14.8l-3.12 1.64.59-3.47-2.52-2.46 3.49-.51L12 6.84Zm0-4.24L9.1 8.48l-6.5.95 4.7 4.58-1.11 6.47L12 17.42l5.81 3.06-1.11-6.47 4.7-4.58-6.5-.95L12 2.6Z\"/>",
  "pin": "<path d=\"M14 2 22 10l-2 2-1.5-1.5-4.4 4.4.4 3.1-1.4 1.4-4.25-4.25L4 20l-1.4-1.4 4.85-4.85L3.2 9.5l1.4-1.4 3.1.4 4.4-4.4L10 2h4Z\"/>",
  "pinOutline": "<path d=\"m14.1 4.9 5 5-.75.75-1.42-1.42-5.1 5.1.38 2.8-.2.2-5.34-5.34.2-.2 2.8.38 5.1-5.1-1.42-1.42.75-.75Zm.0-2.83-3.58 3.58 1.42 1.42-3.0 3.0-2.8-.38-2.38 2.38 4.25 4.25L3 21l1.4 1.4 4.99-4.99 4.25 4.25 2.38-2.38-.38-2.8 3-3 1.42 1.42 3.58-3.58-9.54-9.54Z\"/>",
  "link": "<path d=\"M3.9 12a5 5 0 0 1 5-5h4v2h-4a3 3 0 0 0 0 6h4v2h-4a5 5 0 0 1-5-5Zm5.1 1v-2h6v2H9Zm2-6h4a5 5 0 0 1 0 10h-4v-2h4a3 3 0 0 0 0-6h-4V7Z\"/>",
  "reminder": "<path d=\"M12 2a8 8 0 1 0 8 8 8 8 0 0 0-8-8Zm1 8.59 3.2 3.2-1.4 1.42L11 11.41V5h2v5.59ZM4 20h16v2H4v-2Z\"/>",
  "edit": "<path d=\"M4 17.25V21h3.75L18.8 9.95l-3.75-3.75L4 17.25ZM20.7 8.05a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z\"/>",
  "copy": "<path d=\"M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z\"/>",
  "more": "<circle cx=\"5\" cy=\"12\" r=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><circle cx=\"19\" cy=\"12\" r=\"2\"/>",
  "share": "<path d=\"M18 16a3 3 0 0 0-2.38 1.18l-6.82-3.41a3.2 3.2 0 0 0 0-3.54l6.82-3.41A3 3 0 1 0 15 5c0 .16.01.31.04.46L8.1 8.93a3 3 0 1 0 0 6.14l6.94 3.47A3 3 0 1 0 18 16Z\"/>",
  "reply": "<path d=\"M10 8V4l-7 7 7 7v-4h5.5c2.5 0 4.5 2 4.5 4.5V20h2v-1.5A6.5 6.5 0 0 0 15.5 12H10V8Z\"/>",
  "forward": "<path d=\"M14 8V4l7 7-7 7v-4H8.5C6 14 4 16 4 18.5V20H2v-1.5A6.5 6.5 0 0 1 8.5 12H14V8Z\"/>",
  "nickname": "<path d=\"M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V5a2 2 0 0 1 2-2h8l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z\"/>",
  "blocked": "<path d=\"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 0 1 5.3 13.98L6.02 6.7A7.97 7.97 0 0 1 12 4ZM4 12c0-1.46.39-2.82 1.08-4l10.92 10.92A8 8 0 0 1 4 12Z\"/>",
  "lock": "<path d=\"M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4V7Zm3 10.73V19h-2v-1.27a2 2 0 1 1 2 0Z\"/>",
  "contactOff": "<path d=\"M4.27 3 3 4.27l4.06 4.06A5.96 5.96 0 0 0 6 11a6 6 0 0 0 9.67 4.75L19.73 19.8 21 18.53 4.27 3ZM12 5a6 6 0 0 1 5.2 8.98L8.02 4.8A5.96 5.96 0 0 1 12 5ZM4 22c0-3.1 4-5 8-5 1.48 0 2.95.26 4.22.78l-1.62 1.62A9.25 9.25 0 0 0 12 19c-3.31 0-6 1.34-6 3H4Z\"/>",
  "checkDouble": "<path d=\"m8.1 16.2-3.3-3.3-1.4 1.4 4.7 4.7 8.5-8.5-1.4-1.4-7.1 7.1Z\"/><path d=\"m13.1 16.2-1.8-1.8-1.4 1.4 3.2 3.2 8.5-8.5-1.4-1.4-7.1 7.1Z\"/>",
  "archive": "<path d=\"M4 4h16l-1 5H5L4 4Zm1 7h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8Zm5 2v2h4v-2h-4Z\"/>",
  "thumb": "<path d=\"M2 21h4V9H2v12Zm20-11a2 2 0 0 0-2-2h-6.31l.95-4.57.03-.32a1 1 0 0 0-.29-.7L13.3 1.33 6.72 7.91A2 2 0 0 0 6 9.33V19a2 2 0 0 0 2 2h8.5a2 2 0 0 0 1.84-1.22l3.02-7.05A2 2 0 0 0 22 12v-2Z\"/>",
  "heart": "<path d=\"M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5A5.45 5.45 0 0 1 7.5 3 5.99 5.99 0 0 1 12 5.09 5.99 5.99 0 0 1 16.5 3 5.45 5.45 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z\"/>",
  "laugh": "<path d=\"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM8 8.5l2 1.5-2 1.5-1-1.5 1-1.5Zm8 0 1 1.5-1 1.5-2-1.5 2-1.5ZM7.2 14h9.6a5 5 0 0 1-9.6 0Z\"/>",
  "surprise": "<path d=\"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM8.5 8.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm7 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4ZM12 14a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z\"/>",
  "hands": "<path d=\"M7 2h2v8H7V2Zm8 0h2v8h-2V2ZM4 8h2v7a3 3 0 0 0 3 3h1v4H8a5 5 0 0 1-5-5V8h1Zm14 0h2v9a5 5 0 0 1-5 5h-2v-4h1a3 3 0 0 0 3-3V8h1Zm-7-4h2v18h-2V4Z\"/>",
  "flame": "<path d=\"M13.5 2.5c.6 3.1-1.6 4.4-3.2 6.1-1.4 1.5-2.3 3.1-1.3 5.1.7-1.8 2-2.9 3.7-4 .2 2.1 2.3 3.2 2.3 5.6A3 3 0 0 1 12 18.4a3.2 3.2 0 0 1-3.2-3.2H7A5 5 0 0 0 12 22a6 6 0 0 0 6-6c0-3.5-2.5-5.6-3.7-7.8-.8-1.4-1-3-.8-5.7Z\"/>",
  "close": "<path d=\"M18.3 5.7 16.9 4.3 12 9.17 7.1 4.3 5.7 5.7 10.59 10.59 5.7 15.48 7.1 16.9 12 12 16.9 16.9 18.3 15.48 13.41 10.59 18.3 5.7Z\"/>",
  "trash": "<path d=\"M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2 .5 8h1.7l-.3-8H9Zm4.1 0-.3 8h1.7l.5-8h-1.9Z\"/>",
  "arrowDown": "<path d=\"M11 4h2v12.17l5.59-5.58L20 12l-8 8-8-8 1.41-1.41L11 16.17V4Z\"/>",
  "arrowRight": "<path d=\"M13 5 20 12l-7 7-1.4-1.4 4.6-4.6H4v-2h12.2l-4.6-4.6L13 5Z\"/>",
  "undo": "<path d=\"M7 7V3L2 8l5 5V9h8a4 4 0 0 1 0 8H9v2h6a6 6 0 0 0 0-12H7Z\"/>"
});

function uiIcon(name, extraClass = '') {
  const cleanName = String(name || '').trim();
  const paths = ceUiIconPaths[cleanName] || ceUiIconPaths.note;
  const className = ['ce-ui-icon', String(extraClass || '').trim()].filter(Boolean).join(' ');
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

function uiIconWithText(name, text = '', extraClass = '') {
  const cleanText = String(text || '').trim();
  return `${uiIcon(name, extraClass)}${cleanText ? `<span>${escapeHtml(cleanText)}</span>` : ''}`;
}

const sendModeConfigs = Object.freeze({
  direct: { id: 'direct', icon: 'check', label: 'Envío directo', title: 'Enviar normalmente' },
  schedule: { id: 'schedule', icon: 'schedule', label: 'Programar mensaje', title: 'Programar este mensaje' },
  silent: { id: 'silent', icon: 'bellOff', label: 'Sin notificación', title: 'Enviar sin notificación push' }
});

function normalizeSendMode(mode = 'direct') {
  const clean = String(mode || '').trim();
  return Object.prototype.hasOwnProperty.call(sendModeConfigs, clean) ? clean : 'direct';
}

function activeSendModeConfig() {
  return sendModeConfigs[normalizeSendMode(state.sendMode)] || sendModeConfigs.direct;
}

const ephemeralOptions = [0, 180, 3600, 24 * 3600, 7 * 24 * 3600];
const smartReplySuggestionLimit = 4;
const contactPreviewRetryDelayMs = 4500;
const contactPreviewMaxAttempts = 3;
const contactPreviewRequestTimeoutMs = 6500;
const contactPreviewBatchMaxItems = 24;
const contactPreviewBatchDelayMs = 35;

function hasInstallDismissedPersisted() {
  try { return localStorage.getItem(installDismissedStorageKey) === '1'; } catch { return false; }
}

const state = {
  config: null,
  user: null,
  contacts: [],
  contactsNextCursor: null,
  contactsHasMore: false,
  contactsLoading: false,
  contactLinkPreviews: new Map(),
  contactLinkPreviewInFlight: new Set(),
  contactLinkPreviewQueue: new Map(),
  contactLinkPreviewBatchTimer: 0,
  contactLinkPreviewRetryTimers: new Map(),
  contactShareModalOpen: false,
  contactShareTargetProfile: null,
  contactShareQuery: '',
  contactSharePage: 0,
  contactShareSending: false,
  chats: [],
  chatsNextCursor: null,
  chatsHasMore: false,
  chatsLoading: false,
  chatListPaginationDirty: false,
  chatListLoadedMode: 'active',
  chatListLoadedAt: 0,
  chatListModeRequests: new Map(),
  labels: [],
  chatLabelsByChatId: new Map(),
  labelsLoading: false,
  labelsLoaded: false,
  labelsModalOpen: false,
  labelsSaving: false,
  blockedContactsOpen: false,
  blockedContacts: [],
  blockedContactsLoading: false,
  blockedContactsLoaded: false,
  blockedContactsNextCursor: null,
  blockedContactsHasMore: false,
  contactNicknameModalOpen: false,
  contactNicknameTarget: null,
  contactNicknameDraft: '',
  contactNicknameSaving: false,
  labelsDraft: '',
  activeLabelFilter: '',
  archivedView: false,
  chatListMode: 'active',
  messagesByChat: new Map(),
  messageHistoryCoverageByChat: new Map(),
  messageHistoryRequestsByChat: new Map(),
  readRequestsByChat: new Map(),
  messageSyncCursorByChat: new Map(),
  messageBaselineLoadedChats: new Set(),
  pinnedMessagesByChat: new Map(),
  deliveryAckInFlight: new Set(),
  deliveryAckRetryTimer: 0,
  deliveryAckRetryAt: 0,
  renderedMessageCountByChat: new Map(),
  renderedActiveChatId: '',
  renderCache: {
    chatListHtml: '',
    contactListHtml: '',
    activeChatHeaderHtml: '',
    messagesHtml: ''
  },
  activeChatId: '',
  eventSource: null,
  realtimeOpeningPromise: null,
  realtimeOpenSeq: 0,
  realtimeReconnectTimer: 0,
  realtimeRetryCount: 0,
  realtimeShortDisconnects: 0,
  realtimeAttemptStartedAt: 0,
  realtimeOpenedAt: 0,
  realtimeConnectedOnce: false,
  realtimeStableTimer: 0,
  realtimeManualClose: false,
  realtimeLeader: false,
  realtimeTabId: '',
  realtimeChannel: null,
  realtimeLeaseTimer: 0,
  realtimeElectionTimer: 0,
  realtimeHiddenTimer: 0,
  realtimePeerActivity: new Map(),
  realtimeCoordinatorReady: false,
  realtimeSeenEventIds: new Set(),
  realtimeResyncPromise: null,
  realtimeRetryBlocked: false,
  realtimeRetryNotBefore: 0,
  bootstrapRestoreWaiter: null,
  realtimePreBootstrapEnvelopes: [],
  bootstrapAppliedAt: 0,
  installPrompt: null,
  installDismissed: hasInstallDismissedPersisted(),
  installRelatedCheckDone: false,
  installRelatedCheckInFlight: false,
  pushDismissed: false,
  pushState: 'idle',
  serviceWorkerRegistration: null,
  typingTimer: 0,
  typingSignalActive: false,
  typingSignalChatId: '',
  typingSignalLastSentAt: 0,
  draftSaveTimer: 0,
  draftSyncTimers: new Map(),
  draftOriginId: '',
  draftInputVersion: 0,
  draftInputMetaByChat: new Map(),
  draftLastClearedAtByChat: new Map(),
  // Evita un HTTP Response /draft/get cada vez que el usuario reabre el mismo chat.
  // La marca solo vive durante la sesión de frontend y se invalida ante cambios SSE
  // o un bootstrap/resync, de modo que nunca sustituye una lectura necesaria.
  draftRemoteLoadedChats: new Set(),
  // Evita volver a crear una HTTP Response /draft/save cuando distintos eventos de
  // ciclo de vida intentan persistir exactamente el mismo borrador ya confirmado.
  // También permite que dos disparadores simultáneos compartan la misma petición.
  draftLastSyncedTextByChat: new Map(),
  // El guardado local conserva su debounce corto, pero las versiones sucesivas del
  // mismo borrador se agrupan antes de cruzar HTTP. Los flush de ciclo de vida
  // siguen siendo inmediatos para no sacrificar recuperación entre dispositivos.
  draftRemoteLastAttemptAtByChat: new Map(),
  draftSyncInFlightByChat: new Map(),
  draftLoadSeq: 0,
  outboxMessages: [],
  outboxSyncing: false,
  outboxRetryTimer: 0,
  scanStream: null,
  scanTimer: 0,
  clientId: '',
  chatSearchQuery: '',
  chatSearchOpen: false,
  chatSearchResults: [],
  chatSearchLoading: false,
  chatSearchNextCursor: null,
  chatSearchHasMore: false,
  starredPanelOpen: false,
  starredMessages: [],
  starredLoading: false,
  starredNextCursor: null,
  starredHasMore: false,
  quickRepliesOpen: false,
  slashCommandsOpen: false,
  iconInsertPanelOpen: false,
  iconInsertCategory: 'recientes',
  quickRepliesLoaded: false,
  quickRepliesLoading: false,
  quickReplies: [],
  highlightedMessageId: '',
  selectedMessageIds: new Set(),
  selectionDeleteModalOpen: false,
  selectionDeleteBusy: false,
  unreadMarkerByChatId: new Map(),
  replyToMessage: null,
  editingMessage: null,
  forwardingMessage: null,
  privacyMode: false,
  privacyLock: {
    enabled: false,
    locked: false,
    mode: 'closed',
    salt: '',
    pinHash: '',
    error: '',
    status: '',
    autoLockTimer: 0,
    hiddenLockTimer: 0,
    lastActivityAt: 0,
    saving: false
  },
  compactMode: false,
  scheduleModalOpen: false,
  scheduledMessages: [],
  scheduledLoadedChatId: '',
  scheduledLoading: false,
  schedulingMessage: false,
  pollModalOpen: false,
  pollCreating: false,
  globalSearchOpen: false,
  globalSearchQuery: '',
  globalSearchResults: [],
  globalSearchLoading: false,
  globalSearchSearchedChats: 0,
  globalSearchNextCursor: null,
  globalSearchHasMore: false,
  globalStarredOpen: false,
  globalStarredMessages: [],
  globalStarredLoading: false,
  globalStarredScannedChats: 0,
  globalStarredNextCursor: null,
  globalStarredHasMore: false,
  globalStarredLoaded: false,
  globalStarredDirty: true,
  draftsOpen: false,
  drafts: [],
  draftsLoading: false,
  linkLibraryOpen: false,
  linkLibraryQuery: '',
  chatBriefOpen: false,
  chatBriefLoading: false,
  chatBriefError: '',
  dateJumpOpen: false,
  dateJumpLoading: false,
  dateJumpSelected: '',
  dateJumpDays: [],
  dateJumpError: '',
  dateJumpChatId: '',
  privateNotesOpen: false,
  privateNotes: [],
  privateNotesLoadedChatId: '',
  privateNotesLoading: false,
  privateNoteSaving: false,
  privateNoteEditingId: '',
  remindersOpen: false,
  reminderMessage: null,
  reminderDraftText: '',
  reminders: [],
  remindersLoadedChatId: '',
  remindersLoading: false,
  reminderSaving: false,
  voiceRecognition: null,
  voiceDictating: false,
  voiceStopRequested: false,
  commandPaletteOpen: false,
  commandPaletteQuery: '',
  commandPaletteActiveIndex: 0,
  scrollBottomVisible: false,
  scrollNewMessages: 0,
  notificationPreferences: { notificationsPaused: false, notificationsPausedUntil: '', updatedAt: '' },
  pendingAttachment: null,
  pendingAttachments: [],
  pendingImagePreviews: [],
  attachmentUploading: false,
  attachmentBatchSending: false,
  attachmentPickerOpen: false,
  attachmentPickerView: 'options',
  sendModeMenuOpen: false,
  sendMode: 'direct',
  audioRecorder: null,
  audioStream: null,
  audioChunks: [],
  audioRecording: false,
  audioSending: false,
  audioStartedAt: 0
};

let scrollBottomUpdateFrame = 0;
let messageSelectionLongPressTimer = 0;
let messageSelectionPointer = null;
let messageSelectionIgnoreClickUntil = 0;
let appNavigationHistoryInitialized = false;
let appNavigationHistoryDepth = 0;
let appNavigationHistoryPrimarySignature = '';
let appNavigationHistorySyncFrame = 0;
let appNavigationHistoryHandlingPop = false;
let appNavigationHistoryReconcilingTo = null;
let appNavigationHistoryObserver = null;
let globalSearchRequestSequence = 0;

const $ = (id) => document.getElementById(id);
const els = {
  appRoot: $('appRoot'), authScreen: $('authScreen'), chatScreen: $('chatScreen'), btnGoogleLogin: $('btnGoogleLogin'), authStatus: $('authStatus'),
  userSummary: $('userSummary'), btnOpenSelfNotes: $('btnOpenSelfNotes'), btnOpenGlobalSearch: $('btnOpenGlobalSearch'), btnOpenGlobalStarred: $('btnOpenGlobalStarred'), btnOpenDrafts: $('btnOpenDrafts'), btnNotificationPause: $('btnNotificationPause'), btnOpenBlockedContacts: $('btnOpenBlockedContacts'), btnPrivacyMode: $('btnPrivacyMode'), btnPrivacyLock: $('btnPrivacyLock'), btnCompactMode: $('btnCompactMode'), btnCommandPalette: $('btnCommandPalette'), btnLogout: $('btnLogout'), installBanner: $('installBanner'), btnInstall: $('btnInstall'), btnInstallLater: $('btnInstallLater'),
  pushBanner: $('pushBanner'), btnEnablePush: $('btnEnablePush'), btnPushLater: $('btnPushLater'),
  addContactForm: $('addContactForm'), contactEmailInput: $('contactEmailInput'), btnToggleHeaderActions: $('btnToggleHeaderActions'), headerActions: $('headerActions'), btnScanQr: $('btnScanQr'), btnShowQr: $('btnShowQr'),
  chatList: $('chatList'), contactList: $('contactList'), chatLabelFilters: $('chatLabelFilters'), tabChats: $('tabChats'), tabUnread: $('tabUnread'), tabArchived: $('tabArchived'), tabContacts: $('tabContacts'),
  activeChatHeader: $('activeChatHeader'), chatSearchArea: $('chatSearchArea'), chatSearchForm: $('chatSearchForm'), chatSearchInput: $('chatSearchInput'), btnClearSearch: $('btnClearSearch'), btnShowStarred: $('btnShowStarred'), chatSearchPanel: $('chatSearchPanel'),
  messages: $('messages'), btnScrollBottom: $('btnScrollBottom'), typingStatus: $('typingStatus'), replyDraft: $('replyDraft'), draftStatus: $('draftStatus'), quickRepliesPanel: $('quickRepliesPanel'), slashCommandsPanel: $('slashCommandsPanel'), iconInsertPickerPanel: $('iconInsertPickerPanel'), btnQuickReplies: $('btnQuickReplies'), btnSmartReplySuggestions: $('btnSmartReplySuggestions'), btnIconInsertPicker: $('btnIconInsertPicker'), btnScheduleMessage: $('btnScheduleMessage'), btnCreatePoll: $('btnCreatePoll'), btnVoiceDictation: $('btnVoiceDictation'), btnSilentSend: $('btnSilentSend'), messageTtlSelect: $('messageTtlSelect'), btnAttachFile: $('btnAttachFile'), fileInput: $('fileInput'), galleryInput: $('galleryInput'), cameraInput: $('cameraInput'), attachmentPickerPanel: $('attachmentPickerPanel'), attachmentPreview: $('attachmentPreview'), messageForm: $('messageForm'), messageInput: $('messageInput'), btnSend: $('btnSend'), btnSendModePrefix: $('btnSendModePrefix'), sendModeMenu: $('sendModeMenu'), btnCycleTtl: $('btnCycleTtl'),
  qrModal: $('qrModal'), qrBox: $('qrBox'), btnCloseQr: $('btnCloseQr'), scanBox: $('scanBox'), qrVideo: $('qrVideo'), scanStatus: $('scanStatus'), manualCodeForm: $('manualCodeForm'), manualCodeInput: $('manualCodeInput'),
  contactShareModal: $('contactShareModal'), contactShareSearch: $('contactShareSearch'), contactShareList: $('contactShareList'), contactSharePageInfo: $('contactSharePageInfo'), btnCloseContactShare: $('btnCloseContactShare'), btnContactSharePrev: $('btnContactSharePrev'), btnContactShareNext: $('btnContactShareNext'),
  forwardModal: $('forwardModal'), forwardPreview: $('forwardPreview'), forwardList: $('forwardList'), btnCloseForward: $('btnCloseForward'),
  scheduleModal: $('scheduleModal'), schedulePreview: $('schedulePreview'), scheduleDateTime: $('scheduleDateTime'), scheduleSilent: $('scheduleSilent'), scheduledList: $('scheduledList'), btnConfirmSchedule: $('btnConfirmSchedule'),
  pollModal: $('pollModal'), pollForm: $('pollForm'), pollQuestionInput: $('pollQuestionInput'), pollOptions: $('pollOptions'), pollPreview: $('pollPreview'), btnConfirmPoll: $('btnConfirmPoll'),
  globalSearchModal: $('globalSearchModal'), globalSearchForm: $('globalSearchForm'), globalSearchInput: $('globalSearchInput'), globalSearchList: $('globalSearchList'), btnCloseGlobalSearch: $('btnCloseGlobalSearch'),
  globalStarredModal: $('globalStarredModal'), globalStarredList: $('globalStarredList'), btnCloseGlobalStarred: $('btnCloseGlobalStarred'), btnRefreshGlobalStarred: $('btnRefreshGlobalStarred'),
  draftsModal: $('draftsModal'), draftsList: $('draftsList'), btnCloseDrafts: $('btnCloseDrafts'),
  linkLibraryModal: $('linkLibraryModal'), linkLibraryInput: $('linkLibraryInput'), linkLibraryList: $('linkLibraryList'), btnCloseLinkLibrary: $('btnCloseLinkLibrary'),
  chatBriefModal: $('chatBriefModal'), chatBriefList: $('chatBriefList'), btnCloseChatBrief: $('btnCloseChatBrief'),
  dateJumpModal: $('dateJumpModal'), dateJumpInput: $('dateJumpInput'), dateJumpList: $('dateJumpList'), btnCloseDateJump: $('btnCloseDateJump'),
  privateNotesModal: $('privateNotesModal'), privateNotesTitle: $('privateNotesTitle'), privateNotesChatName: $('privateNotesChatName'), privateNotesTextarea: $('privateNotesTextarea'), privateNotesList: $('privateNotesList'), btnClosePrivateNotes: $('btnClosePrivateNotes'), btnSavePrivateNote: $('btnSavePrivateNote'), btnCancelPrivateNoteEdit: $('btnCancelPrivateNoteEdit'),
  reminderModal: $('reminderModal'), reminderTitle: $('reminderTitle'), reminderChatName: $('reminderChatName'), reminderPreview: $('reminderPreview'), reminderText: $('reminderText'), reminderDateTime: $('reminderDateTime'), reminderList: $('reminderList'), btnCloseReminders: $('btnCloseReminders'), btnSaveReminder: $('btnSaveReminder'),
  labelsModal: $('labelsModal'), labelsChatName: $('labelsChatName'), chatLabelsInput: $('chatLabelsInput'), labelsPresetList: $('labelsPresetList'), labelsCurrentList: $('labelsCurrentList'), btnCloseLabels: $('btnCloseLabels'), btnSaveLabels: $('btnSaveLabels'),
  blockedContactsModal: $('blockedContactsModal'), blockedContactsList: $('blockedContactsList'), btnCloseBlockedContacts: $('btnCloseBlockedContacts'), btnRefreshBlockedContacts: $('btnRefreshBlockedContacts'),
  privacyLockOverlay: $('privacyLockOverlay'), privacyLockTitle: $('privacyLockTitle'), privacyLockDescription: $('privacyLockDescription'), privacyLockPinInput: $('privacyLockPinInput'), privacyLockConfirmInput: $('privacyLockConfirmInput'), privacyLockConfirmField: $('privacyLockConfirmField'), privacyLockError: $('privacyLockError'), privacyLockStatus: $('privacyLockStatus'), btnClosePrivacyLock: $('btnClosePrivacyLock'), btnPrivacyLockPrimary: $('btnPrivacyLockPrimary'), btnPrivacyLockSecondary: $('btnPrivacyLockSecondary'), btnPrivacyLockDisable: $('btnPrivacyLockDisable'),
  contactNicknameModal: $('contactNicknameModal'), contactNicknameTitle: $('contactNicknameTitle'), contactNicknameSubtitle: $('contactNicknameSubtitle'), contactNicknameInput: $('contactNicknameInput'), btnCloseContactNickname: $('btnCloseContactNickname'), btnSaveContactNickname: $('btnSaveContactNickname'), btnClearContactNickname: $('btnClearContactNickname'),
  commandPalette: $('commandPalette'), commandPaletteInput: $('commandPaletteInput'), commandPaletteList: $('commandPaletteList'), btnCloseCommandPalette: $('btnCloseCommandPalette')
};


function getClientId() {
  try {
    const stored = String(localStorage.getItem(clientIdKey) || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 120);
    // localStorage es la autoridad compartida entre pestañas. Releerlo evita que dos
    // aperturas simultáneas conserven IDs distintos después de una carrera de primer uso.
    if (stored) {
      state.clientId = stored;
      return stored;
    }
    if (state.clientId) {
      localStorage.setItem(clientIdKey, state.clientId);
      return state.clientId;
    }
    const randomPart = window.crypto?.randomUUID?.() || `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    state.clientId = String(randomPart).replace(/[^a-z0-9_-]/gi, '').slice(0, 120) || `client_${Date.now()}`;
    localStorage.setItem(clientIdKey, state.clientId);
    return state.clientId;
  } catch {
    if (state.clientId) return state.clientId;
    const randomPart = window.crypto?.randomUUID?.() || `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    state.clientId = String(randomPart).replace(/[^a-z0-9_-]/gi, '').slice(0, 120) || `client_${Date.now()}`;
    return state.clientId;
  }
}

function getDraftOriginId() {
  if (state.draftOriginId) return state.draftOriginId;
  const createOriginId = () => {
    const randomPart = window.crypto?.randomUUID?.() || `draft_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return String(randomPart).replace(/[^a-z0-9_-]/gi, '').slice(0, 120) || `draft_${Date.now()}`;
  };
  try {
    const existing = sessionStorage.getItem(draftOriginStorageKey) || '';
    if (existing) {
      state.draftOriginId = existing;
      return existing;
    }
    state.draftOriginId = createOriginId();
    sessionStorage.setItem(draftOriginStorageKey, state.draftOriginId);
    return state.draftOriginId;
  } catch {
    state.draftOriginId = createOriginId();
    return state.draftOriginId;
  }
}

function isCurrentDraftOrigin(originId = '') {
  const cleanOriginId = String(originId || '').trim();
  return Boolean(cleanOriginId && cleanOriginId === getDraftOriginId());
}

function escapeHtml(value = '') {
  return String(value || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}


const R2_IMAGE_MAX_BYTES = 200 * 1024;
const MAX_PENDING_IMAGE_ATTACHMENTS = 10;
const R2_GENERIC_FILE_MAX_BYTES = 15 * 1024 * 1024;
const MEDIA_FIRMADA_INLINE_FALLBACK_DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

function formatFileSize(bytes = 0) {
  const value = Math.max(0, Number(bytes || 0));
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function getAttachmentRuntimeConfig() {
  return state.config?.attachments || {};
}

function getInlineMediaFallbackConfig() {
  const attachments = getAttachmentRuntimeConfig();
  const fallback = attachments.mediaFallback || attachments.configuration?.mediaFallback || {};
  const hasAttachmentConfig = Boolean(state.config && state.config.attachments && typeof state.config.attachments === 'object');
  return {
    available: fallback.available === true || fallback.enabled === true,
    optimistic: false,
    provider: String(fallback.provider || 'MEDIAfirmadaX-inline'),
    maxBytes: Math.max(0, Number(fallback.maxBytes || attachments.policy?.fallbackInlineMaxBytes || MEDIA_FIRMADA_INLINE_FALLBACK_DEFAULT_MAX_BYTES) || MEDIA_FIRMADA_INLINE_FALLBACK_DEFAULT_MAX_BYTES)
  };
}

function buildR2MissingConfigurationMessage() {
  const attachments = getAttachmentRuntimeConfig();
  const missing = Array.isArray(attachments.configuration?.missingRequired)
    ? attachments.configuration.missingRequired
    : [];
  const missingLabels = missing
    .map((group) => {
      const aliases = Array.isArray(group.acceptedVariables) ? group.acceptedVariables.slice(0, 4).join(' / ') : '';
      return `${group.label || group.key || 'configuración R2'}${aliases ? ` (${aliases})` : ''}`;
    })
    .filter(Boolean)
    .join('; ');
  return `Cloudflare R2 no está configurado para adjuntos de chatER. Faltan variables en el backend: ${missingLabels || 'endpoint/accountId, Access Key ID, Secret Access Key y bucket'}. En producción los adjuntos requieren R2 firmado para evitar transportar base64 o guardar multimedia en Render/Redis.`;
}

function resolveAttachmentUploadModeBeforeUpload() {
  const attachments = getAttachmentRuntimeConfig();
  if (attachments.r2Configured === true) return 'r2';
  const fallback = getInlineMediaFallbackConfig();
  if (fallback.available && !fallback.optimistic) return 'media-firmada-inline';
  if (fallback.available && fallback.optimistic) return 'r2-then-media-firmada-inline';
  throw new Error(buildR2MissingConfigurationMessage());
}

function isR2NotConfiguredUploadError(error = {}) {
  const code = String(error?.data?.code || error?.code || '').toUpperCase();
  const message = String(error?.message || error?.data?.message || '').toLowerCase();
  return code === 'R2_NOT_CONFIGURED'
    || (message.includes('cloudflare r2') && (message.includes('no está configurado') || message.includes('not configured') || message.includes('sin configurar')));
}

function canUseInlineFallbackForPrepared(prepared = {}) {
  const fallback = getInlineMediaFallbackConfig();
  return Boolean(fallback.available && prepared?.file && Number(prepared.sizeBytes || 0) > 0 && Number(prepared.sizeBytes || 0) <= Number(fallback.maxBytes || 0));
}

function normalizeAttachmentClient(attachment = null) {
  if (!attachment || typeof attachment !== 'object') return null;
  const attachmentId = String(attachment.attachmentId || attachment.id || '').trim();
  const publicUrl = String(attachment.publicUrl || '').trim();
  const readUrl = String(attachment.readUrl || '').trim();
  const signedUrlExpiresAt = String(attachment.signedUrlExpiresAt || '').trim();
  let url = String(attachment.url || publicUrl || readUrl).trim();
  const signedExpiryMs = Date.parse(signedUrlExpiresAt || '');
  if (Number.isFinite(signedExpiryMs) && signedExpiryMs <= Date.now() + 5000 && readUrl && readUrl !== url) url = readUrl;
  if (!attachmentId || !url) return null;
  const kind = String(attachment.kind || attachment.mediaKind || '').trim().toLowerCase() === 'image' ? 'image' : 'file';
  return {
    attachmentId,
    kind,
    fileName: String(attachment.fileName || attachment.filename || (kind === 'image' ? 'imagen.webp' : 'archivo')).trim() || (kind === 'image' ? 'imagen.webp' : 'archivo'),
    mimeType: String(attachment.mimeType || attachment.type || 'application/octet-stream').trim() || 'application/octet-stream',
    sizeBytes: Math.max(0, Number(attachment.sizeBytes || attachment.size || 0) || 0),
    width: Math.max(0, Number(attachment.width || 0) || 0),
    height: Math.max(0, Number(attachment.height || 0) || 0),
    url,
    publicUrl,
    readUrl,
    signedUrlExpiresAt
  };
}

function attachmentFallbackText(attachment = null) {
  const normalized = normalizeAttachmentClient(attachment);
  if (!normalized) return '';
  return normalized.kind === 'image' ? 'Imagen adjunta' : `Archivo adjunto: ${normalized.fileName}`;
}

function pendingComposerAttachments() {
  const normalized = [];
  const seen = new Set();
  const candidates = [
    ...(Array.isArray(state.pendingAttachments) ? state.pendingAttachments : []),
    state.pendingAttachment
  ];
  for (const candidate of candidates) {
    const attachment = normalizeAttachmentClient(candidate);
    if (!attachment || seen.has(attachment.attachmentId)) continue;
    seen.add(attachment.attachmentId);
    normalized.push(attachment);
  }
  return normalized;
}

function hasPendingComposerAttachment() {
  return pendingComposerAttachments().length > 0;
}

function attachmentImageOrientationClass(attachment = null) {
  const width = Number(attachment?.width || 0) || 0;
  const height = Number(attachment?.height || 0) || 0;
  if (width > 0 && height > 0 && width > height) return 'landscape';
  return 'portrait';
}

function syncAttachmentImageOrientationFromElement(image = null) {
  if (!image?.closest) return;
  const attachment = image.closest('.ce-attachment--image');
  if (!attachment) return;
  const width = Number(image.naturalWidth || 0) || 0;
  const height = Number(image.naturalHeight || 0) || 0;
  if (width <= 0 || height <= 0) return;
  const orientation = width > height ? 'landscape' : 'portrait';
  attachment.classList.toggle('ce-attachment--landscape', orientation === 'landscape');
  attachment.classList.toggle('ce-attachment--portrait', orientation === 'portrait');
  attachment.dataset.imageOrientation = orientation;
}

function syncRenderedAttachmentImageOrientations(root = els.messages) {
  root?.querySelectorAll?.('.ce-attachment--image img')?.forEach((image) => {
    const fallbackUrl = String(image.dataset.attachmentFallbackUrl || '').trim();
    if (fallbackUrl && image.dataset.ceAttachmentFallbackBound !== '1') {
      image.dataset.ceAttachmentFallbackBound = '1';
      image.addEventListener('error', () => {
        if (image.dataset.ceAttachmentFallbackUsed === '1') return;
        image.dataset.ceAttachmentFallbackUsed = '1';
        const button = image.closest('[data-open-image-viewer]');
        if (button) button.dataset.imageUrl = fallbackUrl;
        image.src = fallbackUrl;
      });
    }
    const syncAndRefreshLayout = () => {
      syncAttachmentImageOrientationFromElement(image);
      scheduleScrollBottomButtonUpdate();
    };
    if (image.complete && image.naturalWidth && image.naturalHeight) {
      syncAndRefreshLayout();
      return;
    }
    if (image.dataset.ceOrientationBound === '1') return;
    image.dataset.ceOrientationBound = '1';
    image.addEventListener('load', syncAndRefreshLayout, { once: true });
  });
}

function renderMessageAttachment(attachment = null) {
  const normalized = normalizeAttachmentClient(attachment);
  if (!normalized) return '';
  const size = normalized.sizeBytes ? ` · ${formatFileSize(normalized.sizeBytes)}` : '';
  const fallbackUrl = normalized.readUrl && normalized.readUrl !== normalized.url ? normalized.readUrl : '';
  const fallbackAttrs = fallbackUrl
    ? ` data-attachment-fallback-url="${escapeHtml(fallbackUrl)}" data-attachment-signed-expires-at="${escapeHtml(normalized.signedUrlExpiresAt || '')}"`
    : '';
  if (normalized.kind === 'image') {
    const orientation = attachmentImageOrientationClass(normalized);
    const imageLabel = `Ver imagen adjunta ${normalized.fileName}`;
    return `<figure class="ce-attachment ce-attachment--image ce-attachment--${escapeHtml(orientation)}" data-image-orientation="${escapeHtml(orientation)}"><button class="ce-attachment__image-button" type="button" data-open-image-viewer="1" data-image-url="${escapeHtml(normalized.url)}" data-image-alt="${escapeHtml(normalized.fileName)}" aria-label="${escapeHtml(imageLabel)}"><img src="${escapeHtml(normalized.url)}" alt="${escapeHtml(normalized.fileName)}" loading="lazy"${fallbackAttrs} /></button></figure>`;
  }
  return `<a class="ce-attachment ce-attachment--file" href="${escapeHtml(normalized.url)}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(normalized.fileName)}"${fallbackAttrs}><span class="ce-attachment__icon" aria-hidden="true">${uiIcon('attachment')}</span><span><strong>${escapeHtml(normalized.fileName)}</strong><em>${escapeHtml(normalized.mimeType)}${escapeHtml(size)}</em></span></a>`;
}

function shouldRenderMessageTextBody(text = '', attachment = null) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return false;
  const normalized = normalizeAttachmentClient(attachment);
  if (normalized?.kind === 'image' && cleanText === attachmentFallbackText(normalized)) return false;
  return true;
}

function splitTextIntoGraphemes(text = '') {
  const source = String(text || '');
  if (!source) return [];
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source), (part) => part.segment);
    }
  } catch {}
  return Array.from(source);
}

function isEmojiGrapheme(grapheme = '') {
  const source = String(grapheme || '');
  if (!source) return false;
  return /\p{Extended_Pictographic}/u.test(source)
    || /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(source)
    || /(?:[0-9#*]\uFE0F?\u20E3)/u.test(source);
}

function renderEmojiAwareText(text = '') {
  const graphemes = splitTextIntoGraphemes(text);
  return graphemes.map((grapheme) => (isEmojiGrapheme(grapheme)
    ? `<span class="ce-msg-emoji">${escapeHtml(grapheme)}</span>`
    : escapeHtml(grapheme))).join('');
}

function isSingleEmojiMessageText(text = '') {
  const cleanText = String(text || '').trim();
  if (!cleanText) return false;
  const graphemes = splitTextIntoGraphemes(cleanText);
  return graphemes.length === 1 && isEmojiGrapheme(graphemes[0]);
}

function renderMessageTextBody(text = '', attachment = null) {
  const cleanText = String(text || '').trim();
  const shouldRender = shouldRenderMessageTextBody(cleanText, attachment);
  if (!shouldRender) return '';
  const soloEmojiClass = isSingleEmojiMessageText(cleanText) ? ' ce-msg__text--solo-emoji' : '';
  const textClass = `ce-msg__text${soloEmojiClass}`;
  const sharedContactBody = renderSharedContactMessageBody(cleanText, attachment, {
    textClass,
    renderTextSegment: renderEmojiAwareText
  });
  if (sharedContactBody) return sharedContactBody;
  return renderLinkPreviewTextBody(cleanText, {
    shouldRender,
    textClass,
    renderTextSegment: renderEmojiAwareText
  });
}

function pendingImagePreviewItems() {
  return (Array.isArray(state.pendingImagePreviews) ? state.pendingImagePreviews : [])
    .filter((preview) => preview && typeof preview === 'object' && preview.previewId && preview.previewUrl);
}

function revokePendingImagePreview(preview = null) {
  const previewUrl = String(preview?.previewUrl || '');
  if (!previewUrl.startsWith('blob:')) return;
  try { URL.revokeObjectURL(previewUrl); } catch {}
}

function removePendingImagePreviewRecord(previewId = '', attachmentId = '') {
  const cleanPreviewId = String(previewId || '').trim();
  const cleanAttachmentId = String(attachmentId || '').trim();
  state.pendingImagePreviews = (Array.isArray(state.pendingImagePreviews) ? state.pendingImagePreviews : []).filter((preview) => {
    const matches = (cleanPreviewId && preview.previewId === cleanPreviewId)
      || (cleanAttachmentId && preview.attachmentId === cleanAttachmentId);
    if (matches) revokePendingImagePreview(preview);
    return !matches;
  });
}

function clearPendingImagePreviews() {
  for (const preview of pendingImagePreviewItems()) revokePendingImagePreview(preview);
  state.pendingImagePreviews = [];
}

function createPendingImagePreview(file = null) {
  if (!file || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const previewId = `image-preview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    previewId,
    previewUrl: URL.createObjectURL(file),
    fileName: String(file.name || 'imagen').trim() || 'imagen',
    progress: 0,
    status: 'processing',
    attachmentId: ''
  };
}

function clearPendingImagePreview(previewId = '') {
  const cleanPreviewId = String(previewId || '').trim();
  if (!cleanPreviewId) return;
  const preview = pendingImagePreviewItems().find((item) => item.previewId === cleanPreviewId);
  if (!preview) return;
  if (preview.attachmentId) {
    state.pendingAttachments = (Array.isArray(state.pendingAttachments) ? state.pendingAttachments : [])
      .filter((attachment) => normalizeAttachmentClient(attachment)?.attachmentId !== preview.attachmentId);
    if (normalizeAttachmentClient(state.pendingAttachment)?.attachmentId === preview.attachmentId) state.pendingAttachment = null;
  }
  removePendingImagePreviewRecord(cleanPreviewId, '');
  if (!pendingComposerAttachments().length && !pendingImagePreviewItems().length && els.fileInput) els.fileInput.value = '';
  updateAttachmentPreview();
  updateComposerControls();
}

function updateAttachmentPreview() {
  if (!els.attachmentPreview) return;
  const attachments = pendingComposerAttachments();
  const trackedPreviews = pendingImagePreviewItems();
  const trackedAttachmentIds = new Set(trackedPreviews.map((preview) => String(preview.attachmentId || '')).filter(Boolean));
  const fallbackImagePreviews = attachments
    .filter((attachment) => attachment.kind === 'image' && !trackedAttachmentIds.has(attachment.attachmentId))
    .map((attachment) => ({
      previewId: attachment.attachmentId,
      previewUrl: attachment.url,
      fileName: attachment.fileName,
      progress: 100,
      status: 'ready',
      attachmentId: attachment.attachmentId
    }));
  const imagePreviews = [...trackedPreviews, ...fallbackImagePreviews];
  const hasImageGallery = imagePreviews.length > 0;
  els.attachmentPreview.classList.toggle('hidden', !attachments.length && !hasImageGallery && !state.attachmentUploading);
  els.attachmentPreview.classList.toggle('ce-attachment-preview--gallery', hasImageGallery);
  if (hasImageGallery) {
    const gallery = imagePreviews.map((preview) => {
      const progress = Math.max(0, Math.min(100, Math.round(Number(preview.progress || 0))));
      const ready = preview.status === 'ready' || progress >= 100;
      const viewLabel = `Ver ${preview.fileName || 'imagen adjunta'} en pantalla completa`;
      const progressContent = ready
        ? uiIcon('close')
        : `<span class="ce-attachment-preview__progress-label" aria-hidden="true">${progress}%</span>`;
      const removeLabel = ready
        ? `Quitar ${preview.fileName || 'imagen adjunta'}`
        : `${preview.fileName || 'Imagen adjunta'}: ${progress}% procesada`;
      return `<article class="ce-attachment-preview__item${ready ? ' is-ready' : ' is-processing'}" data-image-preview-id="${escapeHtml(preview.previewId)}"><button class="ce-attachment-preview__thumb" type="button" data-open-pending-image-viewer="1" data-image-url="${escapeHtml(preview.previewUrl)}" data-image-alt="${escapeHtml(preview.fileName || 'Imagen adjunta')}" aria-label="${escapeHtml(viewLabel)}"><img src="${escapeHtml(preview.previewUrl)}" alt="${escapeHtml(preview.fileName || 'Imagen adjunta')}" /></button><button class="ce-attachment-preview__remove${ready ? ' is-ready' : ' is-processing'}" type="button" data-clear-image-preview="${escapeHtml(preview.previewId)}" aria-label="${escapeHtml(removeLabel)}" style="--ce-attachment-progress:${progress}%" ${state.attachmentUploading ? 'disabled' : ''}>${progressContent}</button></article>`;
    }).join('');
    els.attachmentPreview.innerHTML = `<div class="ce-attachment-preview__gallery" role="list" aria-label="${imagePreviews.length} ${imagePreviews.length === 1 ? 'imagen adjunta' : 'imágenes adjuntas'}">${gallery}</div>`;
    return;
  }
  if (!attachments.length && state.attachmentUploading) {
    els.attachmentPreview.innerHTML = '<div class="ce-attachment-preview__loading"><span class="ce-attachment-preview__spinner" aria-hidden="true"></span><span><strong>Preparando adjunto...</strong><em>Procesando y preparando la subida segura.</em></span></div>';
    return;
  }
  if (!attachments.length) {
    els.attachmentPreview.innerHTML = '';
    return;
  }
  const attachment = attachments[0];
  const preview = attachment.kind === 'image'
    ? `<button class="ce-attachment-preview__single-image" type="button" data-open-pending-image-viewer="1" data-image-url="${escapeHtml(attachment.url)}" data-image-alt="${escapeHtml(attachment.fileName)}" aria-label="Ver ${escapeHtml(attachment.fileName)} en pantalla completa"><img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(attachment.fileName)}" /></button>`
    : `<span class="ce-attachment-preview__file" aria-hidden="true">${uiIcon('attachment')}</span>`;
  els.attachmentPreview.innerHTML = `${preview}<span><strong>${escapeHtml(attachment.fileName)}</strong><em>${escapeHtml(attachment.kind === 'image' ? 'Imagen WebP comprimida' : 'Archivo listo')}${attachment.sizeBytes ? ` · ${escapeHtml(formatFileSize(attachment.sizeBytes))}` : ''}</em></span><button type="button" data-clear-attachment="${escapeHtml(attachment.attachmentId)}" aria-label="Quitar adjunto">${uiIcon('close')}</button>`;
}

function clearPendingAttachment(attachmentId = '') {
  const cleanId = String(attachmentId || '').trim();
  if (cleanId) {
    state.pendingAttachments = (Array.isArray(state.pendingAttachments) ? state.pendingAttachments : [])
      .filter((attachment) => normalizeAttachmentClient(attachment)?.attachmentId !== cleanId);
    if (normalizeAttachmentClient(state.pendingAttachment)?.attachmentId === cleanId) state.pendingAttachment = null;
    removePendingImagePreviewRecord('', cleanId);
  } else {
    state.pendingAttachment = null;
    state.pendingAttachments = [];
    clearPendingImagePreviews();
    state.attachmentUploading = false;
  }
  if (!pendingComposerAttachments().length && !pendingImagePreviewItems().length && els.fileInput) els.fileInput.value = '';
  updateAttachmentPreview();
  updateComposerControls();
}

const imageViewerState = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragBaseX: 0,
  dragBaseY: 0,
  lastTouchDistance: 0
};

function clampImageViewerScale(value = 1) {
  return Math.max(1, Math.min(5, Number(value || 1)));
}

function applyImageViewerTransform() {
  const image = document.querySelector('#ceImageViewer .ce-image-viewer__image');
  if (!image) return;
  image.style.transform = `translate3d(${imageViewerState.translateX}px, ${imageViewerState.translateY}px, 0) scale(${imageViewerState.scale})`;
  image.classList.toggle('is-zoomed', imageViewerState.scale > 1.01);
}

function resetImageViewerTransform() {
  imageViewerState.scale = 1;
  imageViewerState.translateX = 0;
  imageViewerState.translateY = 0;
  imageViewerState.dragging = false;
  applyImageViewerTransform();
}

function setImageViewerScale(nextScale = 1) {
  const normalizedScale = clampImageViewerScale(nextScale);
  if (normalizedScale <= 1.01) {
    imageViewerState.translateX = 0;
    imageViewerState.translateY = 0;
  }
  imageViewerState.scale = normalizedScale;
  applyImageViewerTransform();
}

function imageViewerTouchDistance(touches = []) {
  if (!touches || touches.length < 2) return 0;
  const first = touches[0];
  const second = touches[1];
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function ensureImageViewer() {
  let viewer = document.getElementById('ceImageViewer');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'ceImageViewer';
    viewer.className = 'ce-image-viewer hidden';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', 'Vista completa de imagen');
    viewer.innerHTML = `
      <button class="ce-image-viewer__close" type="button" data-image-viewer-close="1" aria-label="Cerrar imagen">${uiIcon('close')}</button>
      <div class="ce-image-viewer__stage" data-image-viewer-stage="1">
        <img class="ce-image-viewer__image" alt="" draggable="false" />
      </div>
      <div class="ce-image-viewer__controls" aria-label="Controles de zoom">
        <button type="button" data-image-viewer-zoom="out" aria-label="Alejar">−</button>
        <button type="button" data-image-viewer-zoom="reset" aria-label="Restablecer zoom">100%</button>
        <button type="button" data-image-viewer-zoom="in" aria-label="Acercar">+</button>
      </div>`;
    document.body.appendChild(viewer);
    const stage = viewer.querySelector('[data-image-viewer-stage]');
    const image = viewer.querySelector('.ce-image-viewer__image');
    viewer.addEventListener('click', (event) => {
      if (event.target === viewer || event.target.closest('[data-image-viewer-close]')) closeImageViewer();
    });
    viewer.querySelectorAll('[data-image-viewer-zoom]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const action = button.dataset.imageViewerZoom;
        if (action === 'in') setImageViewerScale(imageViewerState.scale + 0.4);
        else if (action === 'out') setImageViewerScale(imageViewerState.scale - 0.4);
        else resetImageViewerTransform();
      });
    });
    stage?.addEventListener('wheel', (event) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.25 : -0.25;
      setImageViewerScale(imageViewerState.scale + delta);
    }, { passive: false });
    stage?.addEventListener('touchstart', (event) => {
      if (event.touches?.length === 2) imageViewerState.lastTouchDistance = imageViewerTouchDistance(event.touches);
    }, { passive: false });
    stage?.addEventListener('touchmove', (event) => {
      if (event.touches?.length !== 2) return;
      event.preventDefault();
      const nextDistance = imageViewerTouchDistance(event.touches);
      if (imageViewerState.lastTouchDistance > 0 && nextDistance > 0) {
        const delta = (nextDistance - imageViewerState.lastTouchDistance) / 180;
        setImageViewerScale(imageViewerState.scale + delta);
      }
      imageViewerState.lastTouchDistance = nextDistance;
    }, { passive: false });
    stage?.addEventListener('touchend', () => { imageViewerState.lastTouchDistance = 0; });
    image?.addEventListener('dblclick', () => {
      if (imageViewerState.scale > 1.01) resetImageViewerTransform();
      else setImageViewerScale(2.2);
    });
    image?.addEventListener('pointerdown', (event) => {
      if (imageViewerState.scale <= 1.01) return;
      imageViewerState.dragging = true;
      imageViewerState.dragStartX = event.clientX;
      imageViewerState.dragStartY = event.clientY;
      imageViewerState.dragBaseX = imageViewerState.translateX;
      imageViewerState.dragBaseY = imageViewerState.translateY;
      image.setPointerCapture?.(event.pointerId);
    });
    image?.addEventListener('pointermove', (event) => {
      if (!imageViewerState.dragging) return;
      event.preventDefault();
      imageViewerState.translateX = imageViewerState.dragBaseX + event.clientX - imageViewerState.dragStartX;
      imageViewerState.translateY = imageViewerState.dragBaseY + event.clientY - imageViewerState.dragStartY;
      applyImageViewerTransform();
    });
    const stopDrag = () => { imageViewerState.dragging = false; };
    image?.addEventListener('pointerup', stopDrag);
    image?.addEventListener('pointercancel', stopDrag);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !viewer.classList.contains('hidden')) closeImageViewer();
    });
  }
  return { viewer, image: viewer.querySelector('.ce-image-viewer__image') };
}

function openImageViewer(url = '', alt = '') {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return;
  const { viewer, image } = ensureImageViewer();
  if (!image) return;
  image.src = cleanUrl;
  image.alt = String(alt || 'Imagen adjunta');
  resetImageViewerTransform();
  viewer.classList.remove('hidden');
  document.body.classList.add('ce-image-viewer-open');
}

function closeImageViewer() {
  const viewer = document.getElementById('ceImageViewer');
  if (!viewer) return;
  viewer.classList.add('hidden');
  document.body.classList.remove('ce-image-viewer-open');
  resetImageViewerTransform();
}

function readPermissionDenials() {
  try {
    const parsed = JSON.parse(localStorage.getItem(permissionDenialStorageKey) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function permissionDenialCount(name = '') {
  const cleanName = String(name || '').trim();
  if (!cleanName) return 0;
  return Math.max(0, Number(readPermissionDenials()[cleanName] || 0) || 0);
}

function setPermissionDenialCount(name = '', count = 0) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return;
  try {
    const current = readPermissionDenials();
    const safeCount = Math.max(0, Number(count || 0) || 0);
    if (safeCount) current[cleanName] = safeCount;
    else delete current[cleanName];
    if (Object.keys(current).length) localStorage.setItem(permissionDenialStorageKey, JSON.stringify(current));
    else localStorage.removeItem(permissionDenialStorageKey);
  } catch {}
}

function markPermissionDenied(name = '') {
  const next = permissionDenialCount(name) + 1;
  setPermissionDenialCount(name, next);
  return next;
}

async function queryPermissionState(name = '') {
  const cleanName = String(name || '').trim();
  if (!cleanName || !navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: cleanName });
    return String(status?.state || 'unknown');
  } catch {
    return 'unknown';
  }
}

function isPermissionDeniedError(error = null) {
  const name = String(error?.name || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return name === 'NotAllowedError' || name === 'SecurityError' || /permission|permiso|denied|deneg/.test(message);
}

function permissionLabel(name = '') {
  return ({ microphone: 'micrófono', camera: 'cámara', geolocation: 'ubicación', contacts: 'contactos' })[String(name || '').trim()] || 'permiso';
}

function permissionSettingsHelp(name = '') {
  const label = permissionLabel(name);
  return `El permiso de ${label} está bloqueado. Ábrelo desde los permisos del sitio o de la app instalada y vuelve a intentarlo.`;
}

function ensurePermissionRecoveryDialog() {
  let modal = document.getElementById('cePermissionRecoveryModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'cePermissionRecoveryModal';
  modal.className = 'ce-modal ce-permission-recovery hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Permisos de chatER');
  modal.innerHTML = `<div class="ce-modal__card ce-permission-recovery__card">
    <button class="ce-modal__close" type="button" data-permission-dialog-close="1" aria-label="Cerrar">${uiIcon('close')}</button>
    <span class="ce-permission-recovery__icon" aria-hidden="true">${uiIcon('lock')}</span>
    <h2 data-permission-dialog-title>Permiso necesario</h2>
    <p data-permission-dialog-message>Activa el permiso y vuelve a intentarlo.</p>
    <div class="ce-permission-recovery__actions">
      <button class="ce-btn ce-btn--primary" type="button" data-permission-open-settings="1">Abrir configuración</button>
      <button class="ce-link" type="button" data-permission-dialog-close="1">Ahora no</button>
    </div>
  </div>`;
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-permission-dialog-close]')) {
      modal.classList.add('hidden');
      return;
    }
    const settingsButton = event.target.closest('[data-permission-open-settings]');
    if (!settingsButton) return;
    openDevicePermissionSettingsBestEffort(modal.dataset.permissionName || '');
  });
  document.body.appendChild(modal);
  return modal;
}

function openDevicePermissionSettingsBestEffort(name = '') {
  const userAgent = String(navigator.userAgent || '');
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.rel = 'noopener noreferrer';
  if (/Android/i.test(userAgent)) {
    anchor.href = 'intent:#Intent;action=android.settings.APPLICATION_SETTINGS;end';
  } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
    anchor.href = 'app-settings:';
  } else {
    showTemporaryDraftStatus(permissionSettingsHelp(name), 5200);
    return false;
  }
  document.body.appendChild(anchor);
  try {
    anchor.click();
    return true;
  } catch {
    showTemporaryDraftStatus(permissionSettingsHelp(name), 5200);
    return false;
  } finally {
    window.setTimeout(() => anchor.remove(), 0);
  }
}

function showPermissionRecovery(name = '', { autoOpenSettings = false } = {}) {
  const modal = ensurePermissionRecoveryDialog();
  modal.dataset.permissionName = String(name || '');
  const label = permissionLabel(name);
  const title = modal.querySelector('[data-permission-dialog-title]');
  const message = modal.querySelector('[data-permission-dialog-message]');
  if (title) title.textContent = `Activa el ${label}`;
  if (message) message.textContent = permissionSettingsHelp(name);
  modal.classList.remove('hidden');
  if (autoOpenSettings) openDevicePermissionSettingsBestEffort(name);
}

async function acquireMediaStreamWithPermission(name = '', constraints = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error(`Este dispositivo no permite usar el ${permissionLabel(name)} desde chatER.`);
  const currentState = await queryPermissionState(name);
  if (currentState === 'denied') {
    const count = Math.max(permissionAutoSettingsThreshold, markPermissionDenied(name));
    showPermissionRecovery(name, { autoOpenSettings: count >= permissionAutoSettingsThreshold });
    const error = new Error(permissionSettingsHelp(name));
    error.permissionHandled = true;
    throw error;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    setPermissionDenialCount(name, 0);
    return stream;
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      const count = markPermissionDenied(name);
      const deniedNow = (await queryPermissionState(name)) === 'denied';
      showPermissionRecovery(name, { autoOpenSettings: deniedNow || count >= permissionAutoSettingsThreshold });
      const handled = new Error(permissionSettingsHelp(name));
      handled.permissionHandled = true;
      throw handled;
    }
    throw error;
  }
}

function setComposerSharedValue(value = '', status = '') {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean || !els.messageInput) return;
  const existing = String(els.messageInput.value || '').trim();
  els.messageInput.value = existing ? `${existing} ${clean}` : clean;
  scheduleActiveDraftSave();
  updateComposerControls();
  if (status) showTemporaryDraftStatus(status, 3200);
  els.messageInput.focus();
}

function closeAttachmentPicker({ restoreFocus = false } = {}) {
  state.attachmentPickerOpen = false;
  state.attachmentPickerView = 'options';
  renderAttachmentPicker();
  if (restoreFocus) els.messageInput?.focus();
}

function attachmentPickerContactRows() {
  return state.contacts
    .filter((contact) => contact?.userId && contact?.profileCode)
    .slice()
    .sort((a, b) => String(contactDisplayName(a)).localeCompare(String(contactDisplayName(b)), 'es'));
}

function renderAttachmentPicker() {
  if (!els.attachmentPickerPanel) return;
  const canOpen = Boolean(state.attachmentPickerOpen && state.activeChatId && !isChatInteractionBlocked() && !state.editingMessage?.messageId);
  els.btnAttachFile?.setAttribute('aria-expanded', canOpen ? 'true' : 'false');
  if (!canOpen) {
    els.attachmentPickerPanel.classList.add('hidden');
    els.attachmentPickerPanel.innerHTML = '';
    return;
  }
  els.attachmentPickerPanel.classList.remove('hidden');
  if (state.attachmentPickerView === 'chater') {
    const contacts = attachmentPickerContactRows();
    const contactRows = contacts.length
      ? contacts.map((contact) => `<button type="button" class="ce-attachment-picker__contact" data-attachment-chater-contact-id="${escapeHtml(contact.userId)}">${avatar(contact, 'small')}<span><strong>${escapeHtml(contactDisplayName(contact))}</strong><small>${escapeHtml(contactDisplaySubtitle(contact))}</small></span></button>`).join('')
      : '<div class="ce-attachment-picker__empty">No hay contactos ChatER cargados con perfil compartible.</div>';
    const loadMoreContactsButton = state.contactsHasMore
      ? `<button type="button" class="ce-link" data-load-more-attachment-contacts="1"${state.contactsLoading ? ' disabled' : ''}>${state.contactsLoading ? 'Cargando contactos...' : 'Cargar más contactos'}</button>`
      : '';
    els.attachmentPickerPanel.innerHTML = `<div class="ce-attachment-picker__head"><button type="button" class="ce-attachment-picker__back" data-attachment-picker-back="1" aria-label="Volver">${uiIcon('arrowRight')}</button><span><strong>Contacto ChatER</strong><small>Elige un contacto agregado para compartirlo.</small></span></div><div class="ce-attachment-picker__contacts">${contactRows}${loadMoreContactsButton}</div>`;
    return;
  }
  const options = [
    ['gallery', 'gallery', 'Galería celular', 'Selecciona una o varias imágenes'],
    ['camera', 'camera', 'Cámara', 'Toma una foto con permiso de cámara'],
    ['file', 'file', 'Archivo', 'Elige un archivo del dispositivo'],
    ['location', 'location', 'Ubicación', 'Comparte tu ubicación actual'],
    ['device-contact', 'contact', 'Contacto del celular', 'Elige un contacto guardado'],
    ['chater-contact', 'chater', 'Contacto ChatER', 'Comparte un contacto agregado']
  ];
  els.attachmentPickerPanel.innerHTML = `<div class="ce-attachment-picker__head"><span><strong>Adjuntar</strong><small>Elige qué quieres compartir.</small></span><button type="button" class="ce-attachment-picker__close" data-attachment-picker-close="1" aria-label="Cerrar">${uiIcon('close')}</button></div><div class="ce-attachment-picker__grid" role="menu">${options.map(([id, icon, title, subtitle]) => `<button type="button" role="menuitem" class="ce-attachment-picker__option" data-attachment-option="${id}"><span class="ce-attachment-picker__option-icon" aria-hidden="true">${uiIcon(icon)}</span><strong>${title}</strong><small>${subtitle}</small></button>`).join('')}</div>`;
}

function openAttachmentPicker() {
  if (!state.activeChatId || isChatInteractionBlocked() || state.editingMessage?.messageId || state.attachmentUploading || state.attachmentBatchSending) return;
  state.quickRepliesOpen = false;
  state.slashCommandsOpen = false;
  state.iconInsertPanelOpen = false;
  state.sendModeMenuOpen = false;
  state.attachmentPickerOpen = !state.attachmentPickerOpen;
  state.attachmentPickerView = 'options';
  renderQuickRepliesPanel();
  renderSlashCommandsPanel();
  renderIconInsertPickerPanel();
  updateSendModeMenu();
  renderAttachmentPicker();
}

async function openCameraAttachmentFlow() {
  let stream = null;
  try {
    stream = await acquireMediaStreamWithPermission('camera', { video: { facingMode: { ideal: 'environment' } }, audio: false });
  } finally {
    for (const track of stream?.getTracks?.() || []) {
      try { track.stop(); } catch {}
    }
  }
  closeAttachmentPicker();
  els.cameraInput?.click();
}

function geolocationPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('La ubicación no está disponible en este dispositivo.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function shareCurrentLocationFromAttachmentPicker() {
  const stateBefore = await queryPermissionState('geolocation');
  if (stateBefore === 'denied') {
    const count = Math.max(permissionAutoSettingsThreshold, markPermissionDenied('geolocation'));
    showPermissionRecovery('geolocation', { autoOpenSettings: count >= permissionAutoSettingsThreshold });
    return;
  }
  try {
    const position = await geolocationPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
    setPermissionDenialCount('geolocation', 0);
    const latitude = Number(position.coords?.latitude || 0);
    const longitude = Number(position.coords?.longitude || 0);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('No se pudo obtener una ubicación válida.');
    const mapsUrl = `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    closeAttachmentPicker();
    setComposerSharedValue(`📍 ${mapsUrl}`, 'Ubicación lista. Revisa el mensaje y pulsa enviar.');
  } catch (error) {
    if (isPermissionDeniedError(error) || Number(error?.code || 0) === 1) {
      const count = markPermissionDenied('geolocation');
      const deniedNow = (await queryPermissionState('geolocation')) === 'denied';
      showPermissionRecovery('geolocation', { autoOpenSettings: deniedNow || count >= permissionAutoSettingsThreshold });
      return;
    }
    throw error;
  }
}

function firstContactField(contact = {}, field = '') {
  const value = contact?.[field];
  if (Array.isArray(value)) return String(value.find(Boolean) || '').trim();
  return String(value || '').trim();
}

async function shareDeviceContactFromAttachmentPicker() {
  if (!navigator.contacts?.select) {
    closeAttachmentPicker();
    showPermissionRecovery('contacts');
    const message = ensurePermissionRecoveryDialog().querySelector('[data-permission-dialog-message]');
    if (message) message.textContent = 'El selector de contactos del dispositivo no está disponible en este navegador. En Android funciona en navegadores compatibles con Contact Picker.';
    return;
  }
  try {
    const contacts = await navigator.contacts.select(['name', 'email', 'tel'], { multiple: false });
    const contact = Array.isArray(contacts) ? contacts[0] : null;
    if (!contact) return;
    const name = firstContactField(contact, 'name') || 'Contacto';
    const tel = firstContactField(contact, 'tel');
    const email = firstContactField(contact, 'email');
    const parts = [`👤 ${name}`];
    if (tel) parts.push(`Tel: ${tel}`);
    if (email) parts.push(`Email: ${email}`);
    closeAttachmentPicker();
    setComposerSharedValue(parts.join(' · '), 'Contacto del celular listo. Revisa el mensaje y pulsa enviar.');
  } catch (error) {
    if (/AbortError/i.test(String(error?.name || ''))) return;
    if (isPermissionDeniedError(error)) {
      const count = markPermissionDenied('contacts');
      showPermissionRecovery('contacts', { autoOpenSettings: count >= permissionAutoSettingsThreshold });
      return;
    }
    throw error;
  }
}

function shareChatERContactFromAttachmentPicker(userId = '') {
  const contact = state.contacts.find((item) => item?.userId === String(userId || '').trim());
  if (!contact?.profileCode) throw new Error('Este contacto ChatER no tiene un perfil compartible disponible.');
  const shareLink = buildProfileShareLink(contact);
  if (!shareLink) throw new Error('No se pudo preparar el enlace del contacto ChatER.');
  setContactLinkPreview(contact.profileCode, { code: contact.profileCode, status: 'ready', profile: contact, saved: true });
  closeAttachmentPicker();
  setComposerSharedValue(shareLink, 'Contacto ChatER listo. Revisa el mensaje y pulsa enviar.');
}

function handleAttachmentInputFiles(files = [], { imagesOnly = false } = {}) {
  const selected = Array.from(files || []).filter(Boolean);
  if (!selected.length) return Promise.resolve();
  const onlyImages = selected.every((file) => isImageAttachmentFile(file));
  if (imagesOnly && !onlyImages) return Promise.reject(new Error('Selecciona únicamente imágenes.'));
  return onlyImages
    ? uploadImageAttachmentsForActiveChat(selected)
    : (selected.length === 1
      ? uploadAttachmentForActiveChat(selected[0])
      : Promise.reject(new Error('Para archivos que no sean imágenes, adjunta uno a la vez.')));
}

function isAudioRecordingSupported() {
  return Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}

function preferredAudioMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((mime) => {
    try { return window.MediaRecorder?.isTypeSupported?.(mime); } catch { return false; }
  }) || '';
}

function stopAudioStream() {
  if (state.audioStream) {
    for (const track of state.audioStream.getTracks?.() || []) {
      try { track.stop(); } catch {}
    }
  }
  state.audioStream = null;
}

function resetAudioRecorderState({ keepRecording = false } = {}) {
  if (!keepRecording) state.audioRecording = false;
  state.audioRecorder = null;
  state.audioChunks = [];
  state.audioStartedAt = 0;
  stopAudioStream();
  updateComposerControls();
}

async function finalizeAudioRecording() {
  const chunks = Array.isArray(state.audioChunks) ? state.audioChunks.slice() : [];
  const mimeType = state.audioRecorder?.mimeType || preferredAudioMimeType() || 'audio/webm';
  resetAudioRecorderState();
  if (!chunks.length) throw new Error('No se capturó audio. Intenta grabar de nuevo.');
  const blob = new Blob(chunks, { type: mimeType });
  if (!blob.size) throw new Error('La grabación quedó vacía. Intenta grabar de nuevo.');
  const extension = mimeType.includes('mp4') ? 'm4a' : (mimeType.includes('ogg') ? 'ogg' : 'webm');
  const file = new File([blob], `audio-${Date.now()}.${extension}`, { type: mimeType });
  state.audioSending = true;
  updateComposerControls();
  try {
    showTemporaryDraftStatus('Preparando audio para enviar...', 1800);
    await uploadAttachmentForActiveChat(file);
    await sendMessage('', { attachment: state.pendingAttachment, ephemeralSeconds: selectedEphemeralSeconds() });
    clearPendingAttachment();
    showTemporaryDraftStatus('Audio enviado.');
  } finally {
    state.audioSending = false;
    updateComposerControls();
  }
}

async function startAudioRecording() {
  if (!state.activeChatId) throw new Error('Selecciona un chat antes de grabar audio.');
  if (isChatInteractionBlocked()) throw new Error(chatBlockNoticeText() || 'No puedes enviar audio en este chat.');
  if (state.editingMessage?.messageId) throw new Error('Termina la edición antes de grabar audio.');
  if (!isAudioRecordingSupported()) throw new Error('La grabación de audio no está disponible en este navegador.');
  if (state.voiceDictating) stopVoiceDictation({ announce: false });
  let stream = null;
  try {
    stream = await acquireMediaStreamWithPermission('microphone', { audio: true });
    const mimeType = preferredAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    state.audioStream = stream;
    state.audioRecorder = recorder;
    state.audioChunks = [];
    state.audioStartedAt = Date.now();
    state.audioRecording = true;
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) state.audioChunks.push(event.data);
    });
    recorder.addEventListener('stop', () => {
      finalizeAudioRecording().catch((error) => {
        state.audioSending = false;
        resetAudioRecorderState();
        alert(error.message || 'No se pudo enviar el audio grabado.');
      });
    }, { once: true });
    recorder.addEventListener('error', () => {
      state.audioSending = false;
      resetAudioRecorderState();
      alert('No se pudo completar la grabación de audio.');
    }, { once: true });
    recorder.start();
    showTemporaryDraftStatus('Grabando audio. Pulsa el botón cuadrado para enviar.', 2800);
    updateComposerControls();
  } catch (error) {
    for (const track of stream?.getTracks?.() || []) {
      try { track.stop(); } catch {}
    }
    resetAudioRecorderState();
    throw error;
  }
}

function stopAudioRecording() {
  if (!state.audioRecorder || !state.audioRecording) return;
  state.audioSending = true;
  updateComposerControls();
  try {
    if (state.audioRecorder.state === 'recording') state.audioRecorder.stop();
  } catch (error) {
    state.audioSending = false;
    resetAudioRecorderState();
    throw error;
  }
}

function isImageAttachmentFile(file = null) {
  const mime = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return Boolean(file && mime.startsWith('image/') && mime !== 'image/gif' && mime !== 'image/svg+xml' && !name.endsWith('.svg'));
}

function versionedLazyFrontendAssetUrl(relativePath = '') {
  const target = new URL(String(relativePath || ''), import.meta.url);
  const releaseVersion = new URL(import.meta.url).searchParams.get('v');
  if (releaseVersion) target.searchParams.set('v', releaseVersion);
  return target.href;
}

function loadLazyClassicScript(relativePath = '') {
  const src = versionedLazyFrontendAssetUrl(relativePath);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.chaterLazyAsset = src;
    script.addEventListener('load', () => resolve(true), { once: true });
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error('No se pudo cargar el módulo de compresión de imágenes.'));
    }, { once: true });
    document.head.appendChild(script);
  });
}

async function ensureImageWebpCompressor() {
  const existing = window.ChatERImageWebpCompressorLego;
  if (existing?.compress) return existing;
  if (imageCompressorLoadPromise) return imageCompressorLoadPromise;

  imageCompressorLoadPromise = (async () => {
    if (!window.IMAGENwebpCOMPRESIONxBloque?.compress) {
      await loadLazyClassicScript('../../IMAGENwebpCOMPRESIONx/BLOQUE/compresor-webp-core.js');
    }
    if (!window.ChatERImageWebpCompressorLego?.compress) {
      await loadLazyClassicScript('../../IMAGENwebpCOMPRESIONx/conexion/imagen-webp-compresionx.js');
    }
    const compressor = window.ChatERImageWebpCompressorLego;
    if (!compressor?.compress) {
      throw new Error('El bloque IMAGENwebpCOMPRESIONx no está disponible; la imagen no se enviará sin compresión WebP garantizada.');
    }
    return compressor;
  })();

  try {
    return await imageCompressorLoadPromise;
  } catch (error) {
    imageCompressorLoadPromise = null;
    throw error;
  }
}

async function prepareFileForR2(file, onProgress = () => {}, options = {}) {
  if (!file) throw new Error('Selecciona un archivo para adjuntar.');
  if (isImageAttachmentFile(file)) {
    const compressor = await ensureImageWebpCompressor();
    const result = await compressor.compress(file, {
      maxBytes: R2_IMAGE_MAX_BYTES,
      maxDimension: 1600,
      onProgress(progress, stage) {
        const normalizedProgress = Math.max(0, Math.min(100, Number(progress || 0)));
        onProgress(`Comprimiendo imagen WebP ${Math.max(1, Math.round(normalizedProgress))}%`);
        if (typeof options.onImageProgress === 'function') {
          options.onImageProgress(Math.min(82, Math.round(normalizedProgress * 0.82)), stage || 'compressing');
        }
      }
    });
    const compressedFile = result?.file;
    if (!compressedFile || compressedFile.size > R2_IMAGE_MAX_BYTES || compressedFile.type !== 'image/webp') {
      throw new Error('La imagen no quedó en WebP menor o igual a 200 KB.');
    }
    if (compressor.assertReadyForUpload) await compressor.assertReadyForUpload(compressedFile, R2_IMAGE_MAX_BYTES);
    return {
      file: compressedFile,
      kind: 'image',
      fileName: compressedFile.name || 'imagen.webp',
      mimeType: 'image/webp',
      sizeBytes: compressedFile.size,
      width: result.width || 0,
      height: result.height || 0,
      sha256: result.sha256 || '',
      originalFileName: file.name || '',
      originalMimeType: file.type || ''
    };
  }
  const genericMaxBytes = Math.min(R2_GENERIC_FILE_MAX_BYTES, Math.max(1, Number(options.fileMaxBytes || R2_GENERIC_FILE_MAX_BYTES) || R2_GENERIC_FILE_MAX_BYTES));
  if (file.size > genericMaxBytes) {
    throw new Error(`El archivo supera ${formatFileSize(genericMaxBytes)}.`);
  }
  return {
    file,
    kind: 'file',
    fileName: file.name || 'archivo',
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    width: 0,
    height: 0,
    sha256: '',
    originalFileName: file.name || '',
    originalMimeType: file.type || ''
  };
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el adjunto para el respaldo MEDIAfirmadaX.'));
    reader.onload = () => {
      const raw = String(reader.result || '');
      const commaIndex = raw.indexOf(',');
      resolve(commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw);
    };
    reader.readAsDataURL(file);
  });
}

async function createInlineMediaFallbackAttachment(prepared = {}) {
  const fallback = getInlineMediaFallbackConfig();
  if (!fallback.available) throw new Error(buildR2MissingConfigurationMessage());
  if (prepared.sizeBytes > fallback.maxBytes) {
    throw new Error(`Cloudflare R2 no está configurado y el respaldo ${fallback.provider} solo permite adjuntos de hasta ${formatFileSize(fallback.maxBytes)}.`);
  }
  const dataBase64 = await readFileAsBase64(prepared.file);
  return post('/api/chats/attachments/media-firmada-inline', {
    chatId: state.activeChatId,
    kind: prepared.kind,
    fileName: prepared.fileName,
    mimeType: prepared.mimeType,
    sizeBytes: prepared.sizeBytes,
    width: prepared.width,
    height: prepared.height,
    sha256: prepared.sha256,
    originalFileName: prepared.originalFileName,
    originalMimeType: prepared.originalMimeType,
    dataBase64
  });
}

async function createR2AttachmentForPreparedFile(prepared = {}, options = {}) {
  const intent = await post('/api/chats/attachments/intent', {
    chatId: state.activeChatId,
    kind: prepared.kind,
    fileName: prepared.fileName,
    mimeType: prepared.mimeType,
    sizeBytes: prepared.sizeBytes,
    width: prepared.width,
    height: prepared.height,
    sha256: prepared.sha256,
    originalFileName: prepared.originalFileName,
    originalMimeType: prepared.originalMimeType
  });
  const upload = intent.upload || {};
  await uploadToSignedUrl(
    upload.url,
    prepared.file,
    upload.headers || { 'Content-Type': prepared.mimeType },
    {
      onProgress(progress) {
        if (typeof options.onUploadProgress === 'function') options.onUploadProgress(progress);
      }
    }
  );
  if (typeof options.onConfirming === 'function') options.onConfirming();
  const confirmed = await post('/api/chats/attachments/confirm', { attachmentId: intent.attachment?.attachmentId || '' });
  return confirmed.attachment || intent.attachment;
}

async function useInlineFallbackForPreparedAttachment(prepared = {}, statusReason = 'R2 no está configurado') {
  const fallback = getInlineMediaFallbackConfig();
  if (!canUseInlineFallbackForPrepared(prepared)) {
    throw new Error(`${statusReason}; el respaldo ${fallback.provider} solo permite adjuntos de hasta ${formatFileSize(fallback.maxBytes)}. Configura Cloudflare R2 para enviar archivos más grandes.`);
  }
  showTemporaryDraftStatus(`${statusReason}; usando respaldo seguro ${fallback.provider}...`, 1800);
  const created = await createInlineMediaFallbackAttachment(prepared);
  const attachment = normalizeAttachmentClient(created.attachment);
  if (!attachment) throw new Error('El respaldo seguro no devolvió un adjunto válido.');
  showTemporaryDraftStatus(`Adjunto listo para enviar con respaldo ${fallback.provider}.`, 2400);
  return attachment;
}

async function createAttachmentForActiveChat(file, options = {}) {
  if (!state.activeChatId) throw new Error('Selecciona un chat antes de adjuntar archivos.');
  if (isChatInteractionBlocked()) throw new Error(chatBlockNoticeText() || 'No puedes adjuntar archivos en este chat.');
  const reportImageProgress = (progress, stage = '') => {
    if (typeof options.onImageProgress !== 'function') return;
    options.onImageProgress(Math.max(0, Math.min(100, Math.round(Number(progress || 0)))), stage);
  };
  const uploadMode = resolveAttachmentUploadModeBeforeUpload();
  const fallback = getInlineMediaFallbackConfig();
  const prepared = await prepareFileForR2(file, (status) => showTemporaryDraftStatus(status, 1400), {
    fileMaxBytes: uploadMode === 'media-firmada-inline' && fallback.maxBytes ? fallback.maxBytes : R2_GENERIC_FILE_MAX_BYTES,
    onImageProgress: reportImageProgress
  });
  if (prepared.kind === 'image') reportImageProgress(84, 'prepared');
  if (uploadMode === 'media-firmada-inline') {
    reportImageProgress(90, 'uploading');
    const attachment = await useInlineFallbackForPreparedAttachment(prepared, 'R2 no está configurado');
    reportImageProgress(100, 'ready');
    return attachment;
  }
  try {
    showTemporaryDraftStatus('Solicitando subida segura a Cloudflare R2...', 1800);
    reportImageProgress(86, 'intent');
    const attachment = normalizeAttachmentClient(await createR2AttachmentForPreparedFile(prepared, {
      onUploadProgress(progress) {
        const networkProgress = Math.max(0, Math.min(100, Number(progress || 0)));
        reportImageProgress(88 + Math.round(networkProgress * 0.1), 'uploading');
      },
      onConfirming() {
        reportImageProgress(99, 'confirming');
      }
    }));
    if (!attachment) throw new Error('La subida segura no devolvió un adjunto válido.');
    showTemporaryDraftStatus('Adjunto listo para enviar.', 2200);
    reportImageProgress(100, 'ready');
    return attachment;
  } catch (error) {
    if (!isR2NotConfiguredUploadError(error)) throw error;
    reportImageProgress(92, 'fallback');
    const attachment = await useInlineFallbackForPreparedAttachment(prepared, 'Cloudflare R2 no está configurado en este backend');
    reportImageProgress(100, 'ready');
    return attachment;
  }
}

async function uploadAttachmentForActiveChat(file) {
  state.attachmentUploading = true;
  state.pendingAttachment = null;
  state.pendingAttachments = [];
  clearPendingImagePreviews();
  updateAttachmentPreview();
  updateComposerControls();
  try {
    state.pendingAttachment = await createAttachmentForActiveChat(file);
  } finally {
    state.attachmentUploading = false;
    updateAttachmentPreview();
    updateComposerControls();
  }
}

async function uploadImageAttachmentsForActiveChat(files = []) {
  const selectedFiles = Array.from(files || []).filter(Boolean);
  if (!selectedFiles.length) return;
  if (selectedFiles.some((file) => !isImageAttachmentFile(file))) {
    throw new Error('La selección múltiple está disponible solo para imágenes. Para otros archivos, adjunta uno a la vez.');
  }
  if (pendingComposerAttachments().some((attachment) => attachment.kind !== 'image')) clearPendingAttachment();
  const readyImageAttachments = pendingComposerAttachments().filter((attachment) => attachment.kind === 'image');
  const processingPreviewCount = pendingImagePreviewItems().filter((preview) => !preview.attachmentId).length;
  const existingImageCount = readyImageAttachments.length + processingPreviewCount;
  if (existingImageCount + selectedFiles.length > MAX_PENDING_IMAGE_ATTACHMENTS) {
    throw new Error(`Puedes preparar hasta ${MAX_PENDING_IMAGE_ATTACHMENTS} imágenes por envío.`);
  }
  const queue = selectedFiles.map((file) => ({ file, preview: createPendingImagePreview(file) }));
  if (queue.some((item) => !item.preview)) {
    for (const item of queue) if (item.preview) revokePendingImagePreview(item.preview);
    throw new Error('Este navegador no permite crear la vista previa local de la imagen.');
  }
  state.pendingImagePreviews.push(...queue.map((item) => item.preview));
  state.attachmentUploading = true;
  updateAttachmentPreview();
  updateComposerControls();
  const failures = [];
  try {
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      showTemporaryDraftStatus(`Preparando imagen ${index + 1} de ${queue.length}...`, 1600);
      try {
        const attachment = await createAttachmentForActiveChat(item.file, {
          onImageProgress(progress) {
            const current = pendingImagePreviewItems().find((preview) => preview.previewId === item.preview.previewId);
            if (!current) return;
            current.progress = Math.max(Number(current.progress || 0), Math.max(0, Math.min(100, Number(progress || 0))));
            current.status = current.progress >= 100 ? 'ready' : 'processing';
            updateAttachmentPreview();
          }
        });
        const current = pendingImagePreviewItems().find((preview) => preview.previewId === item.preview.previewId);
        if (current) {
          current.attachmentId = attachment.attachmentId;
          current.progress = 100;
          current.status = 'ready';
        }
        state.pendingAttachments.push(attachment);
        updateAttachmentPreview();
      } catch (error) {
        failures.push(error);
        removePendingImagePreviewRecord(item.preview.previewId, '');
        updateAttachmentPreview();
      }
    }
  } finally {
    state.attachmentUploading = false;
    updateAttachmentPreview();
    updateComposerControls();
  }
  if (failures.length) {
    const firstMessage = failures[0]?.message || 'No se pudo preparar una de las imágenes.';
    throw new Error(failures.length === 1 ? firstMessage : `${failures.length} imágenes no se pudieron preparar. ${firstMessage}`);
  }
}

function initials(profile = {}) {
  const source = String(profile.contactName || profile.nickname || profile.displayName || profile.email || 'CE').trim();
  return source.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'CE';
}

function avatarStableKey(profile = {}) {
  return safeStorageKeyPart(profile.userId || profile.email || profile.profileCode || initials(profile) || 'avatar');
}

function avatar(profile = {}, size = 'normal') {
  const stableKey = avatarStableKey(profile);
  if (profile.photoUrl) return `<img class="ce-avatar ce-avatar--${size}" src="${escapeHtml(profile.photoUrl)}" alt="" referrerpolicy="no-referrer" loading="eager" decoding="async" draggable="false" data-avatar-key="${escapeHtml(stableKey)}">`;
  return `<span class="ce-avatar ce-avatar--${size}" aria-hidden="true" data-avatar-key="${escapeHtml(stableKey)}">${escapeHtml(initials(profile))}</span>`;
}

function isSelfChat(chat = {}) {
  const participants = Array.isArray(chat.participants) ? chat.participants : [];
  return chat?.type === 'self' || (participants.length === 1 && participants[0] === state.user?.userId);
}

function notesAvatar(size = 'normal') {
  return `<span class="ce-avatar ce-avatar--${size} ce-avatar--notes" aria-hidden="true">${uiIcon('note', 'ce-avatar__icon')}</span>`;
}

function contactDisplayName(contact = {}) {
  return contact.contactName || contact.nickname || contact.displayName || contact.email || 'Contacto';
}

function contactDisplaySubtitle(contact = {}) {
  const nickname = String(contact.nickname || '').trim();
  const realName = String(contact.displayName || '').trim();
  const email = String(contact.email || '').trim();
  if (nickname && realName && email) return `${realName} · ${email}`;
  if (nickname && realName) return realName;
  return email || realName || 'Contacto chatER';
}

function chatDisplayName(chat = {}) {
  if (isSelfChat(chat)) return 'Notas para mí';
  return contactDisplayName(chat.other || {});
}

function hasChatPresenceBlocked(chat = {}) {
  const status = chat.blockStatus || {};
  return Boolean(chat.isBlocked || chat.isBlockedByMe || chat.hasBlockedMe || status.blocked || status.blockedByMe || status.blockedMe);
}

function canShowChatPresence(chat = {}) {
  if (isSelfChat(chat) || hasChatPresenceBlocked(chat)) return false;
  return Boolean(chat.other?.userId || chat.presence?.otherUserId);
}

function isChatOnline(chat = {}) {
  if (!canShowChatPresence(chat)) return false;
  const presence = chat.presence && typeof chat.presence === 'object' ? chat.presence : {};
  return Boolean(chat.otherOnline || presence.otherOnline || presence.status === 'online');
}

function chatDisplaySubtitle(chat = {}) {
  if (isSelfChat(chat)) return 'Espacio privado para guardar ideas, enlaces y recordatorios.';
  const base = contactDisplaySubtitle(chat.other || {});
  return isChatOnline(chat) ? `${base} · En línea ahora` : base;
}

function chatAvatar(chat = {}, size = 'normal') {
  return isSelfChat(chat) ? notesAvatar(size) : avatar(chat.other || {}, size);
}

function renderPresenceDot(chat = {}) {
  if (!isChatOnline(chat)) return '';
  return '<span class="ce-presence-dot" title="En línea ahora" aria-label="En línea ahora"></span>';
}

function renderChatAvatarWithPresence(chat = {}, size = 'normal', options = {}) {
  const small = size === 'small' ? ' ce-avatar-wrap--small' : '';
  const actionClass = options.profileAction ? ' ce-avatar-wrap--profile-action' : '';
  const actionAttrs = options.profileAction ? ' data-open-chat-profile="1" role="button" tabindex="0" title="Ver foto, correo y QR" aria-label="Ver foto, correo y QR"' : '';
  return `<span class="ce-avatar-wrap${small}${actionClass}"${actionAttrs}>${chatAvatar(chat, size)}${renderPresenceDot(chat)}</span>`;
}

function profileDisplayName(profile = {}) {
  return profile.contactName || profile.nickname || profile.displayName || profile.email || 'Perfil chatER';
}

function profileDisplayEmail(profile = {}) {
  return String(profile.email || '').trim();
}

function renderProfilePhotoForModal(profile = {}) {
  const label = profileDisplayName(profile);
  if (profile.photoUrl) {
    return `<button class="ce-profile-photo ce-profile-photo--interactive" type="button" data-open-profile-image-viewer="1" data-image-url="${escapeHtml(profile.photoUrl)}" data-image-alt="Foto de perfil de ${escapeHtml(label)}" aria-label="Ver foto de perfil de ${escapeHtml(label)} en pantalla completa"><img src="${escapeHtml(profile.photoUrl)}" alt="Foto de perfil de ${escapeHtml(label)}" referrerpolicy="no-referrer" loading="eager" decoding="async" draggable="false"></button>`;
  }
  return `<span class="ce-profile-photo ce-profile-photo--fallback" aria-label="Foto de perfil de ${escapeHtml(label)}">${escapeHtml(initials(profile))}</span>`;
}

function stablePreviewVersion(value = '') {
  const source = String(value || '').trim();
  if (!source) return '';
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pv_${(hash >>> 0).toString(36)}`;
}

const profileShareCacheSchema = 'profile-share-v2';

function profileShareVersionText(value = '', max = 500) {
  return String(value || '')
    .replace(/[\x00-\x1F\x7F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(0, Number(max || 0)));
}

function profileSharePreviewVersion(profileOrCode = {}) {
  if (!profileOrCode || typeof profileOrCode === 'string') return '';
  const source = [
    profileShareCacheSchema,
    profileOrCode.profileCode || '',
    profileShareVersionText(profileOrCode.email || '', 240),
    profileShareVersionText(profileOrCode.displayName || '', 120),
    profileShareVersionText(profileOrCode.photoUrl || '', 600),
    profileOrCode.updatedAt || '',
    String(state.config?.backendPublicUrl || getBackendUrl() || '').trim().replace(/\/+$/, ''),
    String(state.config?.staticSiteUrl || window.location.href || '').trim().replace(/\/+$/, '')
  ].join('|');
  return stablePreviewVersion(source);
}

function buildProfileShareLink(profileOrCode = {}) {
  const code = typeof profileOrCode === 'string' ? profileOrCode : profileOrCode.profileCode;
  const cleanCode = String(code || '').trim();
  if (!cleanCode) return '';
  const url = new URL(`${getBackendUrl()}/p/${encodeURIComponent(cleanCode)}`);
  const previewVersion = profileSharePreviewVersion(profileOrCode);
  if (previewVersion) url.searchParams.set('v', previewVersion);
  return url.toString();
}

function buildProfileQrImageUrl(profileOrCode = {}) {
  const code = typeof profileOrCode === 'string' ? profileOrCode : profileOrCode.profileCode;
  const cleanCode = String(code || '').trim();
  if (!cleanCode) return '';
  const previewVersion = profileSharePreviewVersion(profileOrCode);
  return `${getBackendUrl()}/api/profiles/${encodeURIComponent(cleanCode)}/qr.svg${previewVersion ? `?v=${encodeURIComponent(previewVersion)}` : ''}`;
}

function renderProfileShareControls(profile = {}) {
  const shareLink = buildProfileShareLink(profile);
  const qrSrc = buildProfileQrImageUrl(profile);
  if (!shareLink || !qrSrc) return '';
  return `<div class="ce-profile-share" data-profile-share-root="1">
    <button class="ce-profile-share__toggle" type="button" data-profile-share-toggle="1" aria-expanded="false" aria-label="Compartir perfil" title="Compartir perfil">${uiIcon('share')}</button>
    <div class="ce-profile-share__menu hidden" data-profile-share-menu="1" aria-label="Opciones para compartir perfil">
      <button type="button" data-profile-share-image="${escapeHtml(qrSrc)}">Imagen QR</button>
      <button type="button" data-profile-share-copy="${escapeHtml(shareLink)}">Copiar link</button>
      <button type="button" data-profile-share-contact="${escapeHtml(shareLink)}">Contacto</button>
    </div>
  </div>`;
}

function renderProfileQrForModal(profile = {}) {
  const code = String(profile.profileCode || '').trim();
  if (!code) {
    return '<div class="ce-profile-qr-missing">Este perfil todavía no tiene un QR disponible.</div>';
  }
  const label = profileDisplayName(profile);
  const shareLink = buildProfileShareLink(profile);
  const qrSrc = buildProfileQrImageUrl(profile);
  return `<div class="ce-profile-qr"><img class="ce-profile-qr__image" src="${escapeHtml(qrSrc)}" alt="QR de ${escapeHtml(label)}"><div class="ce-profile-qr__actions"><button class="ce-profile-qr__icon-btn" type="button" data-copy-profile-link="${escapeHtml(shareLink)}" aria-label="Copiar enlace del perfil" title="Copiar enlace">${uiIcon('copy')}</button>${renderProfileShareControls(profile)}</div></div>`;
}

function resolveProfileFromChat(chat = {}) {
  if (isSelfChat(chat)) return state.user || {};
  return chat.other || {};
}

function openProfileCard(profile = {}) {
  const cleanProfile = profile || {};
  state.contactShareTargetProfile = cleanProfile;
  state.contactShareModalOpen = false;
  state.contactShareQuery = '';
  state.contactSharePage = 0;
  const title = profileDisplayName(cleanProfile);
  const email = profileDisplayEmail(cleanProfile);
  els.qrModal.setAttribute('aria-label', `Perfil de ${title}`);
  els.scanBox.classList.add('hidden');
  els.manualCodeForm?.classList.add('hidden');
  stopScan();
  els.qrBox.innerHTML = `
    <article class="ce-profile-card" aria-label="Perfil de ${escapeHtml(title)}">
      ${renderProfilePhotoForModal(cleanProfile)}
      <div class="ce-profile-card__body">
        <strong>${escapeHtml(title)}</strong>
        <span>${email ? escapeHtml(email) : 'Correo no disponible'}</span>
      </div>
      ${renderProfileQrForModal(cleanProfile)}
    </article>`;
  els.qrModal.classList.remove('hidden');
}

function formatMessageTime(value = '') {
  return new Date(value || Date.now()).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatScheduleDateTime(value = '') {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}


function normalizeEphemeralSeconds(value = 0) {
  const seconds = Math.max(0, Number(value || 0));
  return ephemeralOptions.includes(seconds) ? seconds : 0;
}

function selectedEphemeralSeconds() {
  return normalizeEphemeralSeconds(els.messageTtlSelect?.value || 0);
}

function formatEphemeralOption(seconds = 0) {
  const value = normalizeEphemeralSeconds(seconds);
  if (value === 180) return '3 min';
  if (value === 3600) return '1 hora';
  if (value === 24 * 3600) return '24 horas';
  if (value === 7 * 24 * 3600) return '7 días';
  return 'No expira';
}

function formatEphemeralCompactOption(seconds = 0) {
  const value = normalizeEphemeralSeconds(seconds);
  if (value === 180) return '3min';
  if (value === 3600) return '1h';
  if (value === 24 * 3600) return '24h';
  if (value === 7 * 24 * 3600) return '7d';
  return '';
}

function formatEphemeralMessageLabel(message = {}) {
  const seconds = normalizeEphemeralSeconds(message.ephemeralSeconds);
  const expireAt = message.expireAt || message.expiresAt || '';
  if (!seconds && !expireAt) return '';
  const when = expireAt ? formatScheduleDateTime(expireAt) : formatEphemeralOption(seconds);
  return expireAt ? `Temporal · expira ${when}` : `Temporal · expira ${when} después de lectura`;
}

function formatPrivateNoteDateTime(value = '') {
  return formatScheduleDateTime(value || Date.now());
}

function formatReminderDateTime(value = '') {
  return formatScheduleDateTime(value || Date.now());
}

function toDateTimeLocalValue(date = new Date()) {
  const target = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return target.toISOString().slice(0, 16);
}

function scheduleScrollBottomButtonUpdate() {
  if (!els.btnScrollBottom) return;
  const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
  const cancelFrame = window.cancelAnimationFrame || window.clearTimeout;
  if (scrollBottomUpdateFrame) cancelFrame(scrollBottomUpdateFrame);
  scrollBottomUpdateFrame = requestFrame(() => {
    scrollBottomUpdateFrame = 0;
    updateScrollBottomButton();
  });
}

function isLastRenderedMessageVisible() {
  if (!els.messages) return true;
  const candidates = Array.from(els.messages.querySelectorAll('.ce-msg, .ce-chat-empty'));
  const last = candidates.filter((node) => node && node.offsetParent !== null).pop();
  if (!last) return true;
  const containerRect = els.messages.getBoundingClientRect();
  const lastRect = last.getBoundingClientRect();
  const tolerance = 6;
  const hasUsableViewport = containerRect.height > tolerance && lastRect.height > 0;
  if (!hasUsableViewport) return true;
  const lastBottomVisible = lastRect.bottom <= containerRect.bottom + tolerance;
  const lastTopReachedViewport = lastRect.top < containerRect.bottom - tolerance;
  return Boolean(lastBottomVisible && lastTopReachedViewport);
}

function isMessagesNearBottom(threshold = scrollBottomThresholdPx) {
  if (!els.messages) return true;
  if (isLastRenderedMessageVisible()) return true;
  const distance = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight;
  return distance <= threshold;
}

function canConfirmReadInActiveChat() {
  return Boolean(
    state.user
    && state.activeChatId
    && document.visibilityState === 'visible'
    && !document.hidden
    && !state.privacyLock?.locked
  );
}

function updateScrollBottomButton() {
  if (!els.btnScrollBottom) return;
  const hasActiveChat = Boolean(state.activeChatId && activeChat());
  const shouldShow = hasActiveChat && !isMessagesNearBottom();
  const hadPendingNewMessages = Number(state.scrollNewMessages || 0) > 0;
  state.scrollBottomVisible = shouldShow;
  els.btnScrollBottom.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) state.scrollNewMessages = 0;
  if (!shouldShow && hadPendingNewMessages && canConfirmReadInActiveChat()) {
    window.setTimeout(() => markActiveRead().catch(() => null), 0);
  }
  const label = state.scrollNewMessages > 0
    ? `${state.scrollNewMessages} ${state.scrollNewMessages === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}`
    : 'Ir al final';
  els.btnScrollBottom.innerHTML = uiIcon('arrowDown');
  els.btnScrollBottom.setAttribute('aria-label', label === 'Ir al final' ? 'Ir al final de la conversación' : `${label}. Ir al final de la conversación`);
}

function scrollMessagesToBottom({ smooth = true, resetNew = true } = {}) {
  if (!els.messages) return;
  els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  if (resetNew) state.scrollNewMessages = 0;
  updateScrollBottomButton();
  if (resetNew && canConfirmReadInActiveChat()) {
    window.setTimeout(() => markActiveRead().catch(() => null), smooth ? 320 : 0);
  }
}

function compactText(value = '', max = 220) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const safeMax = Math.min(320, Math.max(60, Number(max || 220)));
  return clean.length > safeMax ? `${clean.slice(0, safeMax - 3)}...` : clean;
}

function normalizeClientSearchText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function readPrivacyModePreference() {
  try {
    return localStorage.getItem(privacyModeKey) === '1';
  } catch {
    return false;
  }
}

function applyPrivacyModeClass() {
  document.body.classList.toggle('ce-privacy-mode', Boolean(state.privacyMode));
  els.appRoot?.classList.toggle('ce-app--privacy', Boolean(state.privacyMode));
  if (els.btnPrivacyMode) {
    const label = state.privacyMode ? 'Desactivar modo privacidad' : 'Activar modo privacidad';
    els.btnPrivacyMode.classList.toggle('active', Boolean(state.privacyMode));
    els.btnPrivacyMode.setAttribute('aria-pressed', state.privacyMode ? 'true' : 'false');
    els.btnPrivacyMode.setAttribute('title', label);
    els.btnPrivacyMode.setAttribute('aria-label', label);
  }
}

function setPrivacyMode(enabled = false, { announce = false } = {}) {
  state.privacyMode = Boolean(enabled);
  try {
    localStorage.setItem(privacyModeKey, state.privacyMode ? '1' : '0');
  } catch {}
  applyPrivacyModeClass();
  if (announce) {
    showTemporaryDraftStatus(state.privacyMode
      ? 'Modo privacidad activado: nombres, vistas previas y mensajes se ocultan hasta pasar el cursor o tocar.'
      : 'Modo privacidad desactivado.');
  }
}

function togglePrivacyMode({ announce = true } = {}) {
  setPrivacyMode(!state.privacyMode, { announce });
}

function privacyLockPreferenceKey(userId = state.user?.userId || '') {
  const safeUser = String(userId || 'local')
    .replace(/[^a-z0-9_-]/gi, '')
    .slice(0, 160) || 'local';
  return `${privacyLockStorageKey}:${safeUser}`;
}

function normalizePrivacyPin(value = '') {
  return String(value || '').replace(/\D+/g, '').slice(0, 12);
}

function randomHex(bytes = 16) {
  const array = new Uint8Array(Math.max(8, Math.min(64, Number(bytes || 16))));
  window.crypto?.getRandomValues?.(array);
  return Array.from(array).map((item) => item.toString(16).padStart(2, '0')).join('');
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((item) => item.toString(16).padStart(2, '0')).join('');
}

async function hashPrivacyPin(pin = '', salt = '') {
  const normalizedPin = normalizePrivacyPin(pin);
  if (!normalizedPin || normalizedPin.length < 4) throw new Error('El PIN debe tener mínimo 4 números.');
  if (!window.crypto?.subtle || !window.TextEncoder) throw new Error('Este navegador no permite proteger el PIN localmente.');
  const payload = `${salt}:${state.user?.userId || ''}:${normalizedPin}`;
  const encoded = new TextEncoder().encode(payload);
  return bytesToHex(await window.crypto.subtle.digest('SHA-256', encoded));
}

function readPrivacyLockPreference() {
  if (!state.user?.userId) return { enabled: false, salt: '', pinHash: '' };
  try {
    const parsed = JSON.parse(localStorage.getItem(privacyLockPreferenceKey()) || '{}');
    return {
      enabled: Boolean(parsed.enabled && parsed.salt && parsed.pinHash),
      salt: String(parsed.salt || ''),
      pinHash: String(parsed.pinHash || ''),
      updatedAt: String(parsed.updatedAt || '')
    };
  } catch {
    return { enabled: false, salt: '', pinHash: '' };
  }
}

function persistPrivacyLockPreference(config = {}) {
  if (!state.user?.userId) return;
  if (!config.enabled) {
    try { localStorage.removeItem(privacyLockPreferenceKey()); } catch {}
    return;
  }
  const payload = {
    enabled: true,
    salt: String(config.salt || ''),
    pinHash: String(config.pinHash || ''),
    updatedAt: new Date().toISOString(),
    autoLockMs: privacyLockAutoMs
  };
  localStorage.setItem(privacyLockPreferenceKey(), JSON.stringify(payload));
}

function loadPrivacyLockForCurrentUser({ lockOnRestore = false } = {}) {
  const saved = readPrivacyLockPreference();
  state.privacyLock.enabled = Boolean(saved.enabled);
  state.privacyLock.salt = saved.salt || '';
  state.privacyLock.pinHash = saved.pinHash || '';
  state.privacyLock.error = '';
  state.privacyLock.status = '';
  state.privacyLock.locked = Boolean(lockOnRestore && saved.enabled);
  state.privacyLock.mode = state.privacyLock.locked ? 'unlock' : 'closed';
  resetPrivacyLockActivity();
  renderPrivacyLockOverlay();
}

function updatePrivacyLockButton() {
  if (!els.btnPrivacyLock) return;
  const enabled = Boolean(state.privacyLock.enabled);
  const locked = Boolean(state.privacyLock.locked);
  const label = !enabled
    ? 'Configurar bloqueo por PIN'
    : (locked ? 'Pantalla protegida por PIN' : 'Bloquear pantalla ahora');
  els.btnPrivacyLock.classList.toggle('active', enabled);
  els.btnPrivacyLock.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  els.btnPrivacyLock.setAttribute('title', label);
  els.btnPrivacyLock.setAttribute('aria-label', label);
}

function focusPrivacyLockInput() {
  window.setTimeout(() => {
    els.privacyLockPinInput?.focus();
    els.privacyLockPinInput?.select?.();
  }, 30);
}

function clearPrivacyLockInputs() {
  if (els.privacyLockPinInput) els.privacyLockPinInput.value = '';
  if (els.privacyLockConfirmInput) els.privacyLockConfirmInput.value = '';
}

function renderPrivacyLockOverlay() {
  const mode = state.privacyLock.mode || 'closed';
  const isOpen = mode !== 'closed';
  const isLocked = Boolean(state.privacyLock.locked);
  const isSetup = mode === 'setup';
  const isSettings = mode === 'settings';
  els.privacyLockOverlay?.classList.toggle('hidden', !isOpen);
  document.body.classList.toggle('ce-privacy-locked', Boolean(isLocked));
  updatePrivacyLockButton();
  if (!isOpen) return;

  const title = isLocked ? 'Pantalla protegida' : (isSetup ? 'Crear PIN privado' : 'Bloqueo privado');
  const description = isLocked
    ? 'Ingresa tu PIN local para volver a ver tus conversaciones en este dispositivo.'
    : (isSetup
      ? 'Activa un bloqueo local para ocultar chatER después de inactividad o cuando bloquees la pantalla manualmente.'
      : 'Cambia tu PIN local, bloquea la pantalla ahora o desactiva esta protección en este dispositivo.');
  if (els.privacyLockTitle) els.privacyLockTitle.textContent = title;
  if (els.privacyLockDescription) els.privacyLockDescription.textContent = description;
  if (els.privacyLockConfirmField) els.privacyLockConfirmField.classList.toggle('hidden', isLocked);
  if (els.btnClosePrivacyLock) els.btnClosePrivacyLock.classList.toggle('hidden', isLocked);
  if (els.btnPrivacyLockPrimary) els.btnPrivacyLockPrimary.textContent = isLocked ? 'Desbloquear' : (isSetup ? 'Activar bloqueo' : 'Cambiar PIN');
  if (els.btnPrivacyLockSecondary) {
    els.btnPrivacyLockSecondary.textContent = isLocked ? 'Usar modo privacidad' : (state.privacyLock.enabled ? 'Bloquear ahora' : 'Cancelar');
    els.btnPrivacyLockSecondary.classList.toggle('hidden', false);
  }
  if (els.btnPrivacyLockDisable) els.btnPrivacyLockDisable.classList.toggle('hidden', !isSettings || !state.privacyLock.enabled);
  if (els.privacyLockError) {
    els.privacyLockError.textContent = state.privacyLock.error || '';
    els.privacyLockError.classList.toggle('hidden', !state.privacyLock.error);
  }
  if (els.privacyLockStatus) {
    const status = state.privacyLock.status || (isSettings ? 'El PIN nunca se envía al servidor y solo protege este dispositivo.' : 'Se bloqueará automáticamente tras 5 minutos de inactividad.');
    els.privacyLockStatus.textContent = status;
  }
  if (document.activeElement !== els.privacyLockPinInput && document.activeElement !== els.privacyLockConfirmInput) {
    focusPrivacyLockInput();
  }
}

function openPrivacyLockSettings() {
  if (!state.user) return;
  state.privacyLock.locked = false;
  state.privacyLock.mode = state.privacyLock.enabled ? 'settings' : 'setup';
  state.privacyLock.error = '';
  state.privacyLock.status = '';
  clearPrivacyLockInputs();
  renderPrivacyLockOverlay();
}

function closePrivacyLockSettings() {
  if (state.privacyLock.locked) return;
  state.privacyLock.mode = 'closed';
  state.privacyLock.error = '';
  clearPrivacyLockInputs();
  renderPrivacyLockOverlay();
}

function lockPrivacyScreen({ announce = false } = {}) {
  if (!state.user || !state.privacyLock.enabled || state.privacyLock.locked) return;
  if (state.voiceDictating) stopVoiceDictation({ announce: false });
  sendTyping(false).catch(() => null);
  closeCommandPalette();
  state.privacyLock.locked = true;
  state.privacyLock.mode = 'unlock';
  state.privacyLock.error = '';
  state.privacyLock.status = announce ? 'Tus chats quedaron ocultos en este dispositivo.' : '';
  clearPrivacyLockInputs();
  renderPrivacyLockOverlay();
}

async function unlockPrivacyScreen() {
  const pin = normalizePrivacyPin(els.privacyLockPinInput?.value || '');
  try {
    const hash = await hashPrivacyPin(pin, state.privacyLock.salt || '');
    if (hash !== state.privacyLock.pinHash) throw new Error('PIN incorrecto. Inténtalo nuevamente.');
    state.privacyLock.locked = false;
    state.privacyLock.mode = 'closed';
    state.privacyLock.error = '';
    state.privacyLock.status = '';
    clearPrivacyLockInputs();
    resetPrivacyLockActivity();
    renderPrivacyLockOverlay();
  } catch (error) {
    state.privacyLock.error = error.message || 'No se pudo desbloquear la pantalla.';
    renderPrivacyLockOverlay();
  }
}

async function savePrivacyLockFromOverlay() {
  if (!state.user || state.privacyLock.saving) return;
  const pin = normalizePrivacyPin(els.privacyLockPinInput?.value || '');
  const confirmPin = normalizePrivacyPin(els.privacyLockConfirmInput?.value || '');
  if (pin.length < 4) {
    state.privacyLock.error = 'El PIN debe tener mínimo 4 números.';
    renderPrivacyLockOverlay();
    return;
  }
  if (pin !== confirmPin) {
    state.privacyLock.error = 'Los PIN no coinciden.';
    renderPrivacyLockOverlay();
    return;
  }
  try {
    state.privacyLock.saving = true;
    const salt = randomHex(16);
    const pinHash = await hashPrivacyPin(pin, salt);
    persistPrivacyLockPreference({ enabled: true, salt, pinHash });
    state.privacyLock.enabled = true;
    state.privacyLock.locked = false;
    state.privacyLock.salt = salt;
    state.privacyLock.pinHash = pinHash;
    state.privacyLock.mode = 'closed';
    state.privacyLock.error = '';
    state.privacyLock.status = '';
    clearPrivacyLockInputs();
    resetPrivacyLockActivity();
    renderPrivacyLockOverlay();
    showTemporaryDraftStatus('Bloqueo privado activado en este dispositivo.');
  } catch (error) {
    state.privacyLock.error = error.message || 'No se pudo guardar el PIN.';
    renderPrivacyLockOverlay();
  } finally {
    state.privacyLock.saving = false;
  }
}

function disablePrivacyLock() {
  if (!state.user || !state.privacyLock.enabled) return;
  const ok = window.confirm('¿Desactivar el bloqueo privado en este dispositivo?');
  if (!ok) return;
  persistPrivacyLockPreference({ enabled: false });
  state.privacyLock.enabled = false;
  state.privacyLock.locked = false;
  state.privacyLock.mode = 'closed';
  state.privacyLock.salt = '';
  state.privacyLock.pinHash = '';
  state.privacyLock.error = '';
  clearPrivacyLockInputs();
  if (state.privacyLock.autoLockTimer) window.clearTimeout(state.privacyLock.autoLockTimer);
  state.privacyLock.autoLockTimer = 0;
  renderPrivacyLockOverlay();
  showTemporaryDraftStatus('Bloqueo privado desactivado en este dispositivo.');
}

function resetPrivacyLockActivity() {
  state.privacyLock.lastActivityAt = Date.now();
  if (state.privacyLock.autoLockTimer) window.clearTimeout(state.privacyLock.autoLockTimer);
  state.privacyLock.autoLockTimer = 0;
  if (!state.user || !state.privacyLock.enabled || state.privacyLock.locked) return;
  state.privacyLock.autoLockTimer = window.setTimeout(() => lockPrivacyScreen(), privacyLockAutoMs);
}

function handlePrivacyLockVisibilityChange() {
  if (!state.user || !state.privacyLock.enabled || state.privacyLock.locked) return;
  if (state.privacyLock.hiddenLockTimer) window.clearTimeout(state.privacyLock.hiddenLockTimer);
  state.privacyLock.hiddenLockTimer = 0;
  if (document.hidden) {
    state.privacyLock.hiddenLockTimer = window.setTimeout(() => lockPrivacyScreen(), privacyLockHiddenGraceMs);
    return;
  }
  if (Date.now() - Number(state.privacyLock.lastActivityAt || 0) >= privacyLockHiddenGraceMs) {
    lockPrivacyScreen();
  } else {
    resetPrivacyLockActivity();
  }
}

function runPrivacyLockShortcut() {
  if (!state.user) return;
  if (state.privacyLock.enabled) lockPrivacyScreen({ announce: true });
  else openPrivacyLockSettings();
}

function readCompactModePreference() {
  try {
    return localStorage.getItem(compactModeKey) === '1';
  } catch {
    return false;
  }
}

function applyCompactModeClass() {
  document.body.classList.toggle('ce-compact-mode', Boolean(state.compactMode));
  els.appRoot?.classList.toggle('ce-app--compact', Boolean(state.compactMode));
  if (els.btnCompactMode) {
    const label = state.compactMode ? 'Desactivar modo compacto' : 'Activar modo compacto';
    els.btnCompactMode.classList.toggle('active', Boolean(state.compactMode));
    els.btnCompactMode.setAttribute('aria-pressed', state.compactMode ? 'true' : 'false');
    els.btnCompactMode.setAttribute('title', label);
    els.btnCompactMode.setAttribute('aria-label', label);
  }
}

function setCompactMode(enabled = false, { announce = false } = {}) {
  state.compactMode = Boolean(enabled);
  try {
    localStorage.setItem(compactModeKey, state.compactMode ? '1' : '0');
  } catch {}
  applyCompactModeClass();
  if (announce) {
    showTemporaryDraftStatus(state.compactMode
      ? 'Modo compacto activado: verás más chats y mensajes en la misma pantalla.'
      : 'Modo compacto desactivado.');
  }
}

function toggleCompactMode({ announce = true } = {}) {
  setCompactMode(!state.compactMode, { announce });
}

function normalizeNotificationPreferences(input = {}) {
  const pausedUntilRaw = String(input.notificationsPausedUntil || input.pausedUntil || '').trim();
  const pausedUntilMs = Date.parse(pausedUntilRaw);
  const notificationsPausedUntil = Number.isFinite(pausedUntilMs) && pausedUntilMs > Date.now() ? new Date(pausedUntilMs).toISOString() : '';
  return {
    notificationsPausedUntil,
    notificationsPaused: Boolean(notificationsPausedUntil),
    updatedAt: String(input.updatedAt || '').trim()
  };
}

function isNotificationPauseActive() {
  return Boolean(Date.parse(state.notificationPreferences?.notificationsPausedUntil || '') > Date.now());
}

function notificationPauseUntilLabel() {
  if (!isNotificationPauseActive()) return '';
  return formatScheduleDateTime(state.notificationPreferences.notificationsPausedUntil);
}

function updateNotificationPauseButton() {
  if (!els.btnNotificationPause) return;
  state.notificationPreferences = normalizeNotificationPreferences(state.notificationPreferences || {});
  const paused = isNotificationPauseActive();
  const untilLabel = notificationPauseUntilLabel();
  const label = paused ? `Desactivar No molestar · pausado hasta ${untilLabel}` : 'Activar No molestar por 8 horas';
  els.btnNotificationPause.classList.toggle('active', paused);
  els.btnNotificationPause.setAttribute('aria-pressed', paused ? 'true' : 'false');
  els.btnNotificationPause.setAttribute('title', label);
  els.btnNotificationPause.setAttribute('aria-label', label);
}

async function saveNotificationPause(input = {}) {
  if (!state.user) return null;
  const data = await post('/api/preferences/notifications/save', input);
  state.notificationPreferences = normalizeNotificationPreferences(data.notificationPreferences || {});
  updateNotificationPauseButton();
  if (state.commandPaletteOpen) renderCommandPalette();
  return state.notificationPreferences;
}

async function toggleNotificationPause() {
  if (!state.user) return;
  const paused = isNotificationPauseActive();
  const preferences = await saveNotificationPause(paused ? { notificationsPaused: false } : { pauseHours: 8 });
  if (preferences?.notificationsPaused) {
    showTemporaryDraftStatus(`No molestar activado hasta ${notificationPauseUntilLabel()}. No recibirás notificaciones push durante ese tiempo.`, 5200);
  } else {
    showTemporaryDraftStatus('No molestar desactivado. Volverás a recibir notificaciones push.');
  }
  renderAll();
}
function normalizeChatLabelName(value = '') {
  return String(value || '')
    .replace(/^#+/, '')
    .replace(/[|{}[\]<>`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
}

function normalizeChatLabelList(input = []) {
  const source = Array.isArray(input) ? input : String(input || '').split(/[;,\n]/g);
  const labels = [];
  const seen = new Set();
  for (const item of source) {
    const label = normalizeChatLabelName(item);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length >= 8) break;
  }
  return labels;
}

function normalizeLabelCatalog(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = normalizeChatLabelName(item?.label || item?.name || '');
      if (!label) return null;
      const chatIds = Array.from(new Set((Array.isArray(item.chatIds) ? item.chatIds : [])
        .map((chatId) => String(chatId || '').trim())
        .filter(Boolean)));
      return {
        label,
        count: Math.max(Number(item.count || 0), chatIds.length),
        chatIds,
        createdAt: String(item.createdAt || '').trim(),
        updatedAt: String(item.updatedAt || '').trim()
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
}

function applyLabelCatalog(items = []) {
  const labels = normalizeLabelCatalog(items);
  const byChat = new Map();
  for (const item of labels) {
    for (const chatId of item.chatIds || []) {
      const current = byChat.get(chatId) || [];
      if (!current.some((label) => label.toLowerCase() === item.label.toLowerCase())) current.push(item.label);
      byChat.set(chatId, current);
    }
  }
  for (const [chatId, list] of byChat.entries()) {
    byChat.set(chatId, normalizeChatLabelList(list).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })));
  }
  state.labels = labels;
  state.chatLabelsByChatId = byChat;
  state.labelsLoaded = true;
  if (state.activeLabelFilter && !labels.some((item) => item.label.toLowerCase() === state.activeLabelFilter.toLowerCase())) {
    state.activeLabelFilter = '';
  }
}

function applyChatLabelMemberships(input = {}, { replaceKnown = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  let labels = normalizeLabelCatalog(state.labels || []).map((item) => ({ ...item, chatIds: [...(item.chatIds || [])] }));
  if (replaceKnown) {
    state.chatLabelsByChatId.clear();
    labels = labels.map((item) => ({ ...item, chatIds: [] }));
  }

  for (const [rawChatId, rawLabels] of Object.entries(input)) {
    const chatId = String(rawChatId || '').trim();
    if (!chatId) continue;
    const memberships = normalizeChatLabelList(rawLabels || []);

    labels = labels.map((item) => ({
      ...item,
      chatIds: (item.chatIds || []).filter((knownChatId) => knownChatId !== chatId)
    }));

    if (memberships.length) state.chatLabelsByChatId.set(chatId, memberships);
    else state.chatLabelsByChatId.delete(chatId);

    for (const label of memberships) {
      const lower = label.toLowerCase();
      let index = labels.findIndex((item) => item.label.toLowerCase() === lower);
      if (index < 0) {
        labels.push({ label, count: 1, chatIds: [chatId], createdAt: '', updatedAt: '' });
        continue;
      }
      const item = labels[index];
      const chatIds = Array.from(new Set([...(item.chatIds || []), chatId]));
      labels[index] = { ...item, count: Math.max(Number(item.count || 0), chatIds.length), chatIds };
    }

  }

  state.labels = normalizeLabelCatalog(labels);
}

function applyLabelDelta(data = {}) {
  const chatId = String(data.chatId || '').trim();
  const nextLabels = normalizeChatLabelList(data.labels || []);
  const nextLower = new Set(nextLabels.map((label) => label.toLowerCase()));
  const changes = Array.isArray(data.labelChanges) ? data.labelChanges : [];
  let labels = normalizeLabelCatalog(state.labels || []).map((item) => ({ ...item, chatIds: [...(item.chatIds || [])] }));

  if (chatId) {
    labels = labels.map((item) => {
      const member = nextLower.has(item.label.toLowerCase());
      const chatIds = (item.chatIds || []).filter((id) => id !== chatId);
      if (member) chatIds.push(chatId);
      return { ...item, chatIds: Array.from(new Set(chatIds)) };
    });
    if (nextLabels.length) state.chatLabelsByChatId.set(chatId, [...nextLabels]);
    else state.chatLabelsByChatId.delete(chatId);
  }

  for (const change of changes) {
    const cleanLabel = normalizeChatLabelName(change?.label || '');
    if (!cleanLabel) continue;
    const lower = cleanLabel.toLowerCase();
    const count = Math.max(0, Number(change?.count || 0));
    if (change?.deleted === true || count <= 0) {
      labels = labels.filter((item) => item.label.toLowerCase() !== lower);
      for (const [knownChatId, knownLabels] of state.chatLabelsByChatId.entries()) {
        const filtered = normalizeChatLabelList(knownLabels).filter((label) => label.toLowerCase() !== lower);
        if (filtered.length) state.chatLabelsByChatId.set(knownChatId, filtered);
        else state.chatLabelsByChatId.delete(knownChatId);
      }
      continue;
    }

    let index = labels.findIndex((item) => item.label.toLowerCase() === lower);
    const existing = index >= 0 ? labels[index] : null;
    const chatIds = existing ? [...(existing.chatIds || [])] : [];
    if (chatId) {
      const filtered = chatIds.filter((id) => id !== chatId);
      if (nextLower.has(lower)) filtered.push(chatId);
      chatIds.splice(0, chatIds.length, ...Array.from(new Set(filtered)));
    }
    const nextItem = {
      label: cleanLabel,
      count,
      chatIds,
      createdAt: String(change?.createdAt || existing?.createdAt || '').trim(),
      updatedAt: String(change?.updatedAt || existing?.updatedAt || '').trim()
    };
    if (index >= 0) labels[index] = nextItem;
    else labels.push(nextItem);

    for (const [knownChatId, knownLabels] of state.chatLabelsByChatId.entries()) {
      const normalized = normalizeChatLabelList(knownLabels).map((label) => label.toLowerCase() === lower ? cleanLabel : label);
      state.chatLabelsByChatId.set(knownChatId, normalized);
    }
  }

  state.labels = normalizeLabelCatalog(labels);
  if (state.activeLabelFilter && !state.labels.some((item) => item.label.toLowerCase() === state.activeLabelFilter.toLowerCase())) {
    state.activeLabelFilter = '';
  }
}

function removeLabelFromState(label = '') {
  const cleanLabel = normalizeChatLabelName(label);
  const lower = cleanLabel.toLowerCase();
  if (!cleanLabel) return;
  state.labels = normalizeLabelCatalog(state.labels).filter((item) => item.label.toLowerCase() !== lower);
  for (const [chatId, knownLabels] of state.chatLabelsByChatId.entries()) {
    const filtered = normalizeChatLabelList(knownLabels).filter((item) => item.toLowerCase() !== lower);
    if (filtered.length) state.chatLabelsByChatId.set(chatId, filtered);
    else state.chatLabelsByChatId.delete(chatId);
  }
  if (state.activeLabelFilter?.toLowerCase() === lower) state.activeLabelFilter = '';
}

function getLabelsForChat(chatId = '') {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return [];
  return state.chatLabelsByChatId.get(cleanChatId) || [];
}

function chatHasActiveLabel(chat = {}) {
  const filter = normalizeChatLabelName(state.activeLabelFilter || '');
  if (!filter) return true;
  const label = state.labels.find((item) => item.label.toLowerCase() === filter.toLowerCase());
  if (!label) return true;
  return (label.chatIds || []).includes(chat.chatId);
}

async function loadChatLabels({ force = false } = {}) {
  if (!state.user || state.labelsLoading) return state.labels;
  if (!force && state.labelsLoaded) return state.labels;
  state.labelsLoading = true;
  renderLabelFilters();
  try {
    const data = await post('/api/chats/labels/list', {});
    applyLabelCatalog(data.labels || []);
    renderChats();
    renderActiveChat();
    return state.labels;
  } finally {
    state.labelsLoading = false;
    renderLabelFilters();
  }
}

function closeLabelsModal() {
  state.labelsModalOpen = false;
  state.labelsDraft = '';
  renderLabelsModal();
}

async function openLabelsModal() {
  const chat = activeChat();
  if (!chat?.chatId) return;
  state.labelsModalOpen = true;
  state.labelsDraft = getLabelsForChat(chat.chatId).join(', ');
  renderLabelsModal();
  await loadChatLabels({ force: !state.labelsLoaded }).catch(() => null);
  if (!state.labelsDraft) state.labelsDraft = getLabelsForChat(chat.chatId).join(', ');
  renderLabelsModal();
  window.setTimeout(() => els.chatLabelsInput?.focus(), 0);
}

function addLabelToDraft(label = '') {
  const next = normalizeChatLabelList([...(normalizeChatLabelList(state.labelsDraft)), label]);
  state.labelsDraft = next.join(', ');
  if (els.chatLabelsInput) els.chatLabelsInput.value = state.labelsDraft;
  renderLabelsModal();
}

function removeLabelFromDraft(label = '') {
  const target = normalizeChatLabelName(label).toLowerCase();
  state.labelsDraft = normalizeChatLabelList(state.labelsDraft)
    .filter((item) => item.toLowerCase() !== target)
    .join(', ');
  if (els.chatLabelsInput) els.chatLabelsInput.value = state.labelsDraft;
  renderLabelsModal();
}

function renderLabelFilters() {
  if (!els.chatLabelFilters) return;
  const contactsVisible = els.contactList && !els.contactList.classList.contains('hidden');
  if (!state.user || contactsVisible) {
    els.chatLabelFilters.classList.add('hidden');
    els.chatLabelFilters.innerHTML = '';
    return;
  }
  const labels = normalizeLabelCatalog(state.labels || []);
  if (!labels.length && !state.labelsLoading) {
    els.chatLabelFilters.classList.add('hidden');
    els.chatLabelFilters.innerHTML = '';
    return;
  }
  els.chatLabelFilters.classList.remove('hidden');
  const active = normalizeChatLabelName(state.activeLabelFilter || '');
  const chips = labels.map((item) => {
    const selected = item.label.toLowerCase() === active.toLowerCase();
    return `<button class="ce-label-chip${selected ? ' active' : ''}" type="button" data-label-filter="${escapeHtml(item.label)}" aria-pressed="${selected ? 'true' : 'false'}">#${escapeHtml(item.label)} <span>${Number(item.count || 0)}</span></button>`;
  }).join('');
  const loading = state.labelsLoading ? '<span class="ce-label-filter__loading">Actualizando...</span>' : '';
  els.chatLabelFilters.innerHTML = `<button class="ce-label-chip${active ? '' : ' active'}" type="button" data-label-filter="" aria-pressed="${active ? 'false' : 'true'}">Todos</button>${chips}${loading}`;
}

function renderChatLabelBadges(chat = {}) {
  const labels = getLabelsForChat(chat.chatId).slice(0, 3);
  if (!labels.length) return '';
  return `<div class="ce-row-labels" aria-label="Etiquetas del chat">${labels.map((label) => `<span>#${escapeHtml(label)}</span>`).join('')}</div>`;
}

function renderActiveChatLabelBadges(chat = {}) {
  const labels = getLabelsForChat(chat.chatId);
  if (!labels.length) return '<span>Sin etiquetas</span>';
  return `<div class="ce-chat-labels">${labels.map((label) => `<span>#${escapeHtml(label)}</span>`).join('')}</div>`;
}

function renderLabelsModal() {
  if (!els.labelsModal || !els.labelsPresetList || !els.labelsCurrentList) return;
  els.labelsModal.classList.toggle('hidden', !state.labelsModalOpen);
  if (!state.labelsModalOpen) return;
  const chat = activeChat();
  const current = normalizeChatLabelList(state.labelsDraft);
  const title = chat ? chatDisplayName(chat) : 'chat seleccionado';
  if (els.labelsChatName) els.labelsChatName.textContent = `Organiza “${title}” con hasta 8 etiquetas personales.`;
  if (els.chatLabelsInput && document.activeElement !== els.chatLabelsInput) els.chatLabelsInput.value = state.labelsDraft;
  if (els.btnSaveLabels) els.btnSaveLabels.disabled = state.labelsSaving || !chat?.chatId;
  els.labelsCurrentList.innerHTML = current.length
    ? current.map((label) => `<span class="ce-label-token">#${escapeHtml(label)} <button type="button" data-remove-draft-label="${escapeHtml(label)}" aria-label="Quitar etiqueta ${escapeHtml(label)}">${uiIcon('close')}</button></span>`).join('')
    : '<div class="ce-label-empty">Este chat todavía no tiene etiquetas.</div>';
  const currentLower = new Set(current.map((label) => label.toLowerCase()));
  const presets = (state.labels || []).filter((item) => !currentLower.has(item.label.toLowerCase())).slice(0, 20);
  els.labelsPresetList.innerHTML = state.labelsLoading
    ? '<div class="ce-label-empty">Cargando etiquetas...</div>'
    : (presets.length
      ? presets.map((item) => `<button type="button" class="ce-label-preset" data-add-draft-label="${escapeHtml(item.label)}">#${escapeHtml(item.label)} <span>${Number(item.count || 0)}</span></button>`).join('')
      : '<div class="ce-label-empty">Escribe una nueva etiqueta o guarda la combinación actual.</div>');
}

async function saveLabelsFromModal() {
  const chat = activeChat();
  if (!chat?.chatId || state.labelsSaving) return;
  const labels = normalizeChatLabelList(state.labelsDraft || els.chatLabelsInput?.value || '');
  state.labelsSaving = true;
  renderLabelsModal();
  try {
    const data = await post('/api/chats/labels/save', { chatId: chat.chatId, labels, compactResponse: true });
    if (Array.isArray(data.allLabels)) applyLabelCatalog(data.allLabels);
    else applyLabelDelta(data);
    state.labelsDraft = normalizeChatLabelList(data.labels || labels).join(', ');
    closeLabelsModal();
    showTemporaryDraftStatus(labels.length ? 'Etiquetas guardadas para este chat.' : 'Etiquetas quitadas de este chat.');
    renderAll();
  } finally {
    state.labelsSaving = false;
    renderLabelsModal();
  }
}

async function deleteChatLabel(label = '') {
  const cleanLabel = normalizeChatLabelName(label);
  if (!cleanLabel) return;
  const ok = window.confirm(`¿Eliminar la etiqueta “${cleanLabel}” de todos tus chats?`);
  if (!ok) return;
  const data = await post('/api/chats/labels/delete', { label: cleanLabel, compactResponse: true });
  if (Array.isArray(data.allLabels)) applyLabelCatalog(data.allLabels);
  else removeLabelFromState(data.label || cleanLabel);
  showTemporaryDraftStatus(`Etiqueta “${cleanLabel}” eliminada.`);
  renderAll();
}

function safeStorageKeyPart(value = '') {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 140);
}

function outboxStorageKey() {
  const userId = safeStorageKeyPart(state.user?.userId || '');
  return userId ? `${outboxStoragePrefix}:${userId}` : '';
}

function outboxRetryLeaderStorageKey() {
  const userId = safeStorageKeyPart(state.user?.userId || '');
  return userId ? `${outboxRetryLeaderStoragePrefix}:${userId}` : '';
}

function readOutboxRetryLease() {
  const key = outboxRetryLeaderStorageKey();
  if (!key) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function writeOutboxRetryLease(expiresAt = Date.now() + outboxRetryLeaderLeaseMs) {
  const key = outboxRetryLeaderStorageKey();
  if (!key || !state.user?.userId) return false;
  const lease = {
    owner: getRealtimeTabId(),
    userId: String(state.user.userId),
    expiresAt: Math.max(Date.now() + 1000, Number(expiresAt || 0))
  };
  try { localStorage.setItem(key, JSON.stringify(lease)); } catch { return false; }
  const stored = readOutboxRetryLease();
  return stored?.owner === lease.owner
    && String(stored?.userId || '') === lease.userId
    && Number(stored?.expiresAt || 0) > Date.now();
}

function clearOutboxRetryLeaseIfOwned() {
  const key = outboxRetryLeaderStorageKey();
  if (!key) return;
  const lease = readOutboxRetryLease();
  if (lease?.owner !== getRealtimeTabId()) return;
  try { localStorage.removeItem(key); } catch {}
}

function claimOutboxRetryLeadership() {
  if (!state.user?.userId) return false;
  const now = Date.now();
  const current = readOutboxRetryLease();
  const owned = current?.owner === getRealtimeTabId()
    && String(current?.userId || '') === String(state.user.userId);
  const available = !current
    || Number(current.expiresAt || 0) <= now
    || String(current.userId || '') !== String(state.user.userId);
  if (!owned && !available) return false;
  return writeOutboxRetryLease(now + outboxRetryLeaderLeaseMs);
}

async function settleOutboxRetryLeadership() {
  const jitter = Math.round(Math.random() * outboxRetryLeadershipSettleMs);
  await new Promise((resolve) => window.setTimeout(resolve, outboxRetryLeadershipSettleMs + jitter));
  const lease = readOutboxRetryLease();
  return Boolean(
    lease?.owner === getRealtimeTabId()
    && String(lease?.userId || '') === String(state.user?.userId || '')
    && Number(lease?.expiresAt || 0) > Date.now()
  );
}

function normalizeQueuedMessage(item = {}) {
  const chatId = String(item.chatId || '').trim().slice(0, 140);
  const text = String(item.text || '').trim();
  const clientMessageId = String(item.clientMessageId || item.localId || '').trim().slice(0, 160);
  const attachment = normalizeAttachmentClient(item.attachment || null);
  if (!chatId || (!text && !attachment) || !clientMessageId) return null;
  const status = ['queued', 'sending', 'failed'].includes(item.status) ? item.status : 'queued';
  const createdAt = item.createdAt && !Number.isNaN(Date.parse(item.createdAt)) ? item.createdAt : new Date().toISOString();
  return {
    localId: clientMessageId,
    clientMessageId,
    chatId,
    text: (text || attachmentFallbackText(attachment)).slice(0, 12000),
    attachment,
    replyToMessageId: String(item.replyToMessageId || '').trim().slice(0, 160),
    replyTo: item.replyTo && typeof item.replyTo === 'object' ? item.replyTo : null,
    silent: Boolean(item.silent),
    ephemeralSeconds: normalizeEphemeralSeconds(item.ephemeralSeconds),
    createdAt,
    updatedAt: item.updatedAt && !Number.isNaN(Date.parse(item.updatedAt)) ? item.updatedAt : createdAt,
    status,
    attempts: Math.max(0, Number(item.attempts || 0)),
    retryable: item.retryable !== false,
    nextAttemptAt: Math.max(0, Number(item.nextAttemptAt || 0)),
    lastError: String(item.lastError || '').trim().slice(0, 240)
  };
}

function readOutboxMessages() {
  const key = outboxStorageKey();
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeQueuedMessage)
      .filter(Boolean)
      .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0))
      .slice(-100);
  } catch {
    return [];
  }
}

function persistOutboxMessages(list = state.outboxMessages) {
  const key = outboxStorageKey();
  if (!key) return;
  const normalized = (Array.isArray(list) ? list : [])
    .map(normalizeQueuedMessage)
    .filter(Boolean)
    .slice(-100);
  state.outboxMessages = normalized;
  try {
    if (normalized.length) localStorage.setItem(key, JSON.stringify(normalized));
    else localStorage.removeItem(key);
  } catch {}
}

function loadOutboxState() {
  state.outboxMessages = readOutboxMessages();
}

function getQueuedMessagesForChat(chatId = '') {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return [];
  return state.outboxMessages.filter((item) => item.chatId === cleanChatId);
}

function upsertQueuedMessage(item = {}, { render = true } = {}) {
  const normalized = normalizeQueuedMessage(item);
  if (!normalized) return null;
  const list = state.outboxMessages.filter((queued) => queued.clientMessageId !== normalized.clientMessageId);
  list.push(normalized);
  list.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
  persistOutboxMessages(list);
  if (render) renderAll();
  return normalized;
}

function removeQueuedMessage(clientMessageId = '', { render = true } = {}) {
  const cleanId = String(clientMessageId || '').trim();
  if (!cleanId) return false;
  const before = state.outboxMessages.length;
  persistOutboxMessages(state.outboxMessages.filter((item) => item.clientMessageId !== cleanId));
  if (render && before !== state.outboxMessages.length) renderAll();
  return before !== state.outboxMessages.length;
}

function isRecoverableSendError(error = {}) {
  if (navigator.onLine === false) return true;
  const status = Number(error?.status || 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (status >= 400 && status < 500) return false;
  const message = String(error?.message || '').toLowerCase();
  return !status || /fetch|network|conexi[oó]n|internet|offline|load failed|networkerror/.test(message);
}

function isDefinitiveHttpError(error = {}) {
  const status = Number(error?.status || 0);
  if (!status || [408, 425, 429].includes(status)) return false;
  return status >= 400 && status < 500;
}

function isSessionInvalidatingHttpError(error = {}) {
  // /api/bootstrap responde 401 cuando la sesión ya no existe. Otros estados
  // (incluidos 403/404/429/5xx) pueden ser de política, despliegue, gateway o
  // presupuesto y no deben convertir una falla temporal en un cierre de sesión.
  return Number(error?.status || 0) === 401;
}

function nextOutboxRetryAt(error = {}, attempts = 1) {
  if (navigator.onLine === false) return 0;
  const retryAfter = Math.max(0, Number(error?.retryAfterMs || 0));
  if (retryAfter > 0) return Date.now() + Math.min(outboxRetryServerMaxMs, retryAfter);
  const exponent = Math.min(7, Math.max(0, Number(attempts || 1) - 1));
  const jitter = 0.75 + (Math.random() * 0.5);
  const delay = Math.min(outboxRetryMaxMs, Math.round(outboxRetryBaseMs * (2 ** exponent) * jitter));
  return Date.now() + Math.max(outboxRetryBaseMs, delay);
}

function nextPendingOutboxRetryAt() {
  const now = Date.now();
  return state.outboxMessages
    .filter((item) => item.retryable !== false && Number(item.attempts || 0) < 6)
    .map((item) => Math.max(0, Number(item.nextAttemptAt || 0)))
    .filter((value) => value > now)
    .sort((a, b) => a - b)[0] || 0;
}

function enqueueOutboxMessage({ chatId = '', text = '', clientMessageId = '', replyToMessageId = '', replyTo = null, silent = false, ephemeralSeconds = 0, attachment = null, error = null } = {}) {
  const now = new Date().toISOString();
  const normalizedAttachment = normalizeAttachmentClient(attachment);
  const queued = upsertQueuedMessage({
    chatId,
    text: String(text || '').trim() || attachmentFallbackText(normalizedAttachment),
    clientMessageId,
    localId: clientMessageId,
    replyToMessageId,
    replyTo,
    attachment: normalizeAttachmentClient(attachment),
    silent: Boolean(silent),
    ephemeralSeconds: normalizeEphemeralSeconds(ephemeralSeconds),
    createdAt: now,
    updatedAt: now,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: isRecoverableSendError(error) ? nextOutboxRetryAt(error, 1) : 0,
    lastError: error?.message || ''
  }, { render: false });
  if (!queued) return null;
  showTemporaryDraftStatus('Mensaje guardado en pendientes. Se enviará automáticamente cuando vuelva la conexión.', 4600);
  renderAll();
  return queued;
}

function renderQueuedMessage(queued = {}) {
  const failed = queued.status === 'failed';
  const sending = queued.status === 'sending';
  const retryStopped = failed && queued.retryable === false;
  const queuedAttachment = normalizeAttachmentClient(queued.attachment || null);
  const queuedText = renderMessageTextBody(queued.text, queuedAttachment);
  const statusText = sending
    ? 'Enviando pendiente...'
    : (failed
      ? `${retryStopped ? 'Reintento automático detenido' : 'Pendiente sin enviar'}${queued.lastError ? ` · ${queued.lastError}` : ''}`
      : 'Pendiente · se enviará al recuperar conexión');
  const replyPreview = queued.replyTo?.text
    ? `<button class="ce-reply-preview" type="button" disabled aria-label="Mensaje respondido pendiente"><strong>${uiIcon('reply')} ${escapeHtml(messageSenderLabel(queued.replyTo.senderUserId))}</strong><span>${escapeHtml(compactText(queued.replyTo.text))}</span></button>`
    : '';
  return `<article class="ce-msg mine ce-msg--outbox${failed ? ' is-failed' : ''}${sending ? ' is-sending' : ''}" data-client-message-id="${escapeHtml(queued.clientMessageId)}" data-outbox-id="${escapeHtml(queued.clientMessageId)}">
    <div class="ce-outbox-actions">
      <button type="button" data-outbox-retry="${escapeHtml(queued.clientMessageId)}" ${sending ? 'disabled' : ''}>Enviar ahora</button>
      <button type="button" data-outbox-discard="${escapeHtml(queued.clientMessageId)}" ${sending ? 'disabled' : ''}>Descartar</button>
    </div>
    ${replyPreview}
    ${queued.silent ? `<div class="ce-silent-label" aria-label="Mensaje pendiente silencioso">${uiIcon('bellOff')}<span>Sin notificación</span></div>` : ''}
    ${queued.ephemeralSeconds ? `<div class="ce-ephemeral-label" aria-label="Mensaje pendiente temporal">${escapeHtml(formatEphemeralOption(queued.ephemeralSeconds))} · temporal</div>` : ''}
    ${renderMessageAttachment(queuedAttachment)}
    ${queuedText}
    <span class="ce-msg__meta ce-msg__meta--outbox"><time>${formatMessageTime(queued.createdAt)}</time><span class="ce-msg__receipt" title="${escapeHtml(statusText)}" aria-label="${escapeHtml(statusText)}">${sending ? '<span class="ce-send-dots" aria-hidden="true"><i></i><i></i><i></i></span>' : uiIcon('hourglass')}</span></span>
  </article>`;
}

async function sendQueuedOutboxMessage(queued = {}) {
  const normalized = normalizeQueuedMessage(queued);
  if (!normalized || !state.user) return false;
  const attemptNumber = normalized.attempts + 1;
  upsertQueuedMessage({
    ...normalized,
    status: 'sending',
    attempts: attemptNumber,
    // Si el contexto se congela o muere con el fetch en vuelo, otra pestaña espera
    // al menos la ventana del lease antes de volver a gastar una HTTP Response.
    nextAttemptAt: Date.now() + outboxRetryLeaderLeaseMs,
    updatedAt: new Date().toISOString(),
    lastError: ''
  }, { render: true });
  try {
    const data = await post('/api/chats/send', {
      chatId: normalized.chatId,
      text: normalized.text,
      clientMessageId: normalized.clientMessageId,
      replyToMessageId: normalized.replyToMessageId || '',
      silent: Boolean(normalized.silent),
      ephemeralSeconds: normalizeEphemeralSeconds(normalized.ephemeralSeconds),
      attachment: normalizeAttachmentClient(normalized.attachment),
      draftOriginId: getDraftOriginId(),
      clientId: getClientId()
    });
    if (!shouldWaitForStreamConfirmation(data)) {
      await applySentMessageHttpFallback(data, normalized.clientMessageId);
    }
    return true;
  } catch (error) {
    const recoverable = isRecoverableSendError(error);
    upsertQueuedMessage({
      ...normalized,
      status: 'failed',
      attempts: attemptNumber,
      retryable: recoverable,
      nextAttemptAt: recoverable ? nextOutboxRetryAt(error, attemptNumber) : 0,
      updatedAt: new Date().toISOString(),
      lastError: recoverable ? 'Sin conexión o servidor no disponible' : (error?.message || 'No se pudo enviar')
    }, { render: true });
    scheduleNextOutboxRetry();
    return false;
  }
}

async function retryQueuedOutboxMessages({ chatId = '', silent = false, force = false } = {}) {
  if (!state.user || state.outboxSyncing) return { sent: 0, failed: 0 };
  if (!force && navigator.onLine === false) return { sent: 0, failed: state.outboxMessages.length };
  // localStorage comparte la cola entre pestañas/PWA. Sin un lease compartido,
  // cada contexto puede reintentar el mismo clientMessageId y consumir una HTTP
  // Response aunque el backend deduplique el mensaje. Solo el ganador del lease
  // ejecuta la ráfaga y el resto recibe el resultado mediante el evento storage.
  if (!claimOutboxRetryLeadership()) return { sent: 0, failed: 0, skipped: 'peer-retrying' };
  if (!await settleOutboxRetryLeadership()) return { sent: 0, failed: 0, skipped: 'peer-retrying' };
  loadOutboxState();
  const now = Date.now();
  const targets = state.outboxMessages
    .filter((item) => !chatId || item.chatId === chatId)
    .filter((item) => force || item.retryable !== false)
    .filter((item) => force || item.attempts < 6)
    .filter((item) => force || Number(item.nextAttemptAt || 0) <= now);
  if (!targets.length) {
    clearOutboxRetryLeaseIfOwned();
    scheduleNextOutboxRetry();
    return { sent: 0, failed: 0 };
  }
  state.outboxSyncing = true;
  const renewTimer = window.setInterval(() => {
    const lease = readOutboxRetryLease();
    if (lease?.owner !== getRealtimeTabId()) return;
    writeOutboxRetryLease(Date.now() + outboxRetryLeaderLeaseMs);
  }, outboxRetryLeaderRenewMs);
  let sent = 0;
  let failed = 0;
  try {
    renderAll();
    for (const item of targets) {
      const lease = readOutboxRetryLease();
      if (lease?.owner !== getRealtimeTabId() || Number(lease?.expiresAt || 0) <= Date.now()) break;
      const ok = await sendQueuedOutboxMessage(item);
      if (ok) sent += 1;
      else failed += 1;
      if (!ok && navigator.onLine === false) break;
    }
  } finally {
    window.clearInterval(renewTimer);
    clearOutboxRetryLeaseIfOwned();
    state.outboxSyncing = false;
    renderAll();
  }
  if (!silent) {
    if (sent && !failed) showTemporaryDraftStatus(`${sent} mensaje${sent === 1 ? '' : 's'} pendiente${sent === 1 ? '' : 's'} enviado${sent === 1 ? '' : 's'}.`);
    else if (sent && failed) showTemporaryDraftStatus(`${sent} enviado${sent === 1 ? '' : 's'} y ${failed} pendiente${failed === 1 ? '' : 's'} todavía sin conexión.`);
    else if (failed) showTemporaryDraftStatus('Los mensajes pendientes siguen sin poder enviarse.', 4200);
  }
  return { sent, failed };
}

function scheduleOutboxRetry(delayMs = 900) {
  if (state.outboxRetryTimer) window.clearTimeout(state.outboxRetryTimer);
  state.outboxRetryTimer = window.setTimeout(() => {
    state.outboxRetryTimer = 0;
    if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
    retryQueuedOutboxMessages({ silent: true }).catch(() => null);
  }, Math.max(0, Number(delayMs || 0)));
}

function scheduleNextOutboxRetry() {
  if (!state.user || navigator.onLine === false) return false;
  const retryAt = nextPendingOutboxRetryAt();
  if (!retryAt) return false;
  scheduleOutboxRetry(Math.max(0, retryAt - Date.now()));
  return true;
}

function chatDraftStorageKey(chatId = state.activeChatId) {
  const userId = safeStorageKeyPart(state.user?.userId || '');
  const safeChatId = safeStorageKeyPart(chatId || '');
  return userId && safeChatId ? `${draftStoragePrefix}:${userId}:${safeChatId}` : '';
}

function readDraftPayload(chatId = state.activeChatId) {
  const key = chatDraftStorageKey(chatId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.text === 'string' ? parsed : { text: String(raw || ''), savedAt: 0 };
  } catch {
    return null;
  }
}

function writeDraftPayload(chatId = state.activeChatId, text = '', savedAt = Date.now()) {
  const key = chatDraftStorageKey(chatId);
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify({ text: String(text || ''), savedAt: Number(savedAt || Date.now()) }));
    return true;
  } catch {
    return false;
  }
}

function removeLocalDraftPayload(chatId = state.activeChatId) {
  const key = chatDraftStorageKey(chatId);
  if (!key) return;
  try { localStorage.removeItem(key); } catch {}
}

function remoteDraftSavedMs(draft = {}) {
  return Date.parse(draft?.savedAt || '') || 0;
}

function setDraftStatus(message = '') {
  if (!els.draftStatus) return;
  const clean = String(message || '').trim();
  els.draftStatus.textContent = clean;
  els.draftStatus.classList.toggle('hidden', !clean);
}

function showTemporaryDraftStatus(message = '', ttl = 2200) {
  const clean = String(message || '').trim();
  if (!clean) return;
  setDraftStatus(clean);
  window.setTimeout(() => {
    if (els.draftStatus?.textContent === clean) setDraftStatus('');
  }, Math.max(800, Number(ttl || 2200)));
}

function getDraftInputMeta(chatId = state.activeChatId) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return null;
  return state.draftInputMetaByChat.get(cleanChatId) || null;
}

function rememberDraftInputMeta(chatId = state.activeChatId, text = els.messageInput?.value || '') {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return null;
  const meta = {
    version: Number(state.draftInputVersion || 0),
    editedAt: Date.now(),
    text: String(text || '')
  };
  state.draftInputMetaByChat.set(cleanChatId, meta);
  return meta;
}

function forgetDraftInputMeta(chatId = state.activeChatId) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return;
  state.draftInputMetaByChat.delete(cleanChatId);
}

function markDraftCleared(chatId = state.activeChatId) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return;
  state.draftLastClearedAtByChat.set(cleanChatId, Date.now());
  forgetDraftInputMeta(cleanChatId);
}

function wasDraftClearedAfter(chatId = state.activeChatId, timestamp = 0) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return false;
  return Number(state.draftLastClearedAtByChat.get(cleanChatId) || 0) > Number(timestamp || 0);
}

function isActiveDraftComposerProtected(chatId = state.activeChatId) {
  const cleanChatId = String(chatId || '').trim();
  if (!els.messageInput || !cleanChatId || cleanChatId !== state.activeChatId || state.editingMessage?.messageId) return false;
  const meta = getDraftInputMeta(cleanChatId);
  const localDraftText = String(readDraftPayload(cleanChatId)?.text || '');
  const inputText = String(els.messageInput.value || '');
  const hasPendingDebounce = Boolean(state.draftSaveTimer);
  const hasUnsavedInput = Boolean(meta && inputText !== localDraftText);
  const recentlyTyped = Boolean(meta?.editedAt && Date.now() - Number(meta.editedAt || 0) <= draftSaveDelayMs + 1200);
  const inputHasFocus = document.activeElement === els.messageInput;
  return Boolean(hasPendingDebounce || hasUnsavedInput || recentlyTyped || (inputHasFocus && inputText.trim()));
}

function applyRemoteDraftToActiveInput(chatId = state.activeChatId, text = '', savedAtMs = Date.now(), status = 'Borrador sincronizado desde tu cuenta.') {
  const cleanChatId = String(chatId || '').trim();
  if (!els.messageInput || !cleanChatId || cleanChatId !== state.activeChatId || state.editingMessage?.messageId) return false;
  if (isActiveDraftComposerProtected(cleanChatId)) return false;
  const remoteText = String(text || '');
  if (!remoteText.trim() || remoteText === els.messageInput.value) return false;
  writeDraftPayload(cleanChatId, remoteText, savedAtMs || Date.now());
  els.messageInput.value = remoteText;
  setDraftStatus(status);
  updateComposerControls();
  return true;
}

async function syncDraftToServer(chatId = state.activeChatId, text = '', { announce = false } = {}) {
  const cleanChatId = String(chatId || '').trim();
  if (!state.user || !cleanChatId) return;
  const draftText = String(text || '');
  if (state.draftLastSyncedTextByChat.has(cleanChatId) && state.draftLastSyncedTextByChat.get(cleanChatId) === draftText) {
    state.draftRemoteLoadedChats.add(cleanChatId);
    if (announce && cleanChatId === state.activeChatId && draftText.trim()) setDraftStatus('Borrador guardado y sincronizado.');
    return { ok: true, skipped: 'already-synced' };
  }
  const currentSync = state.draftSyncInFlightByChat.get(cleanChatId);
  if (currentSync?.promise && currentSync.text === draftText) {
    const data = await currentSync.promise;
    if (announce && data && cleanChatId === state.activeChatId && draftText.trim()) setDraftStatus('Borrador guardado y sincronizado.');
    return data;
  }
  const requestStartedAt = Date.now();
  state.draftRemoteLastAttemptAtByChat.set(cleanChatId, requestStartedAt);
  const payload = {
    chatId: cleanChatId,
    text: draftText,
    clientId: getClientId(),
    draftOriginId: getDraftOriginId()
  };
  const promise = (async () => {
    try {
      const data = await post('/api/chats/draft/save', payload);
      state.draftRemoteLoadedChats.add(cleanChatId);
      state.draftLastSyncedTextByChat.set(cleanChatId, draftText);
      if (wasDraftClearedAfter(cleanChatId, requestStartedAt)) return data;
      if (data.draft?.text) writeDraftPayload(cleanChatId, data.draft.text, remoteDraftSavedMs(data.draft) || Date.now());
      else removeLocalDraftPayload(cleanChatId);
      return data;
    } catch {
      if (wasDraftClearedAfter(cleanChatId, requestStartedAt)) return null;
      return null;
    }
  })();
  state.draftSyncInFlightByChat.set(cleanChatId, { text: draftText, promise });
  try {
    const data = await promise;
    if (announce && cleanChatId === state.activeChatId && draftText.trim()) {
      setDraftStatus(data ? 'Borrador guardado y sincronizado.' : 'Borrador guardado en este dispositivo. Se sincronizará cuando haya conexión.');
    }
    return data;
  } finally {
    if (state.draftSyncInFlightByChat.get(cleanChatId)?.promise === promise) state.draftSyncInFlightByChat.delete(cleanChatId);
  }
}

function cancelRemoteDraftSync(chatId = state.activeChatId) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return false;
  const current = state.draftSyncTimers.get(cleanChatId);
  if (!current) return false;
  window.clearTimeout(current);
  state.draftSyncTimers.delete(cleanChatId);
  return true;
}

function scheduleRemoteDraftSync(chatId = state.activeChatId, text = '', { delay = 0, announce = false } = {}) {
  const cleanChatId = String(chatId || '').trim();
  if (!state.user || !cleanChatId) return;
  cancelRemoteDraftSync(cleanChatId);
  const timer = window.setTimeout(() => {
    state.draftSyncTimers.delete(cleanChatId);
    syncDraftToServer(cleanChatId, text, { announce }).catch(() => null);
  }, Math.max(0, Number(delay || 0)));
  state.draftSyncTimers.set(cleanChatId, timer);
}

function scheduleThrottledRemoteDraftSync(chatId = state.activeChatId, text = '', { announce = false } = {}) {
  const cleanChatId = String(chatId || '').trim();
  if (!state.user || !cleanChatId) return 0;
  const lastAttemptAt = Number(state.draftRemoteLastAttemptAtByChat.get(cleanChatId) || 0);
  const elapsed = lastAttemptAt > 0 ? Math.max(0, Date.now() - lastAttemptAt) : draftRemoteSyncMinIntervalMs;
  const delay = Math.max(0, draftRemoteSyncMinIntervalMs - elapsed);
  scheduleRemoteDraftSync(cleanChatId, text, { delay, announce });
  return delay;
}

function cancelActiveDraftSaveTimer() {
  if (!state.draftSaveTimer) return false;
  window.clearTimeout(state.draftSaveTimer);
  state.draftSaveTimer = 0;
  return true;
}

function markActiveDraftInputChanged() {
  state.draftInputVersion = Number(state.draftInputVersion || 0) + 1;
  rememberDraftInputMeta(state.activeChatId, els.messageInput?.value || '');
}

function saveDraftSnapshot(chatId = state.activeChatId, text = '', { announce = false, remoteMode = 'immediate' } = {}) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId || !state.user) return;
  cancelRemoteDraftSync(cleanChatId);
  const draftText = String(text || '');
  if (draftText.trim()) {
    const saved = writeDraftPayload(cleanChatId, draftText, Date.now());
    if (remoteMode === 'throttled') {
      const delay = scheduleThrottledRemoteDraftSync(cleanChatId, draftText, { announce });
      if (announce && saved && delay > 0 && cleanChatId === state.activeChatId) {
        setDraftStatus('Borrador guardado en este dispositivo. Sincronización pendiente.');
      }
    } else {
      syncDraftToServer(cleanChatId, draftText, { announce }).catch(() => null);
    }
    if (announce && !saved && cleanChatId === state.activeChatId) setDraftStatus('No se pudo guardar el borrador en este dispositivo.');
  } else {
    removeLocalDraftPayload(cleanChatId);
    scheduleRemoteDraftSync(cleanChatId, '', { delay: 0 });
    if (cleanChatId === state.activeChatId) setDraftStatus('');
  }
}

function saveActiveDraft({ announce = false } = {}) {
  cancelActiveDraftSaveTimer();
  if (!els.messageInput || !state.user || !state.activeChatId || state.editingMessage?.messageId) return;
  saveDraftSnapshot(state.activeChatId, els.messageInput.value || '', { announce });
}

function scheduleActiveDraftSave() {
  markActiveDraftInputChanged();
  cancelActiveDraftSaveTimer();
  cancelRemoteDraftSync(state.activeChatId);
  if (!els.messageInput || !state.user || !state.activeChatId || state.editingMessage?.messageId) return;
  const chatId = state.activeChatId;
  const textAtLastInput = els.messageInput.value || '';
  state.draftSaveTimer = window.setTimeout(() => {
    state.draftSaveTimer = 0;
    saveDraftSnapshot(chatId, textAtLastInput, { announce: true, remoteMode: 'throttled' });
  }, draftSaveDelayMs);
}

async function loadDraftForChat(chatId = state.activeChatId, { prefetchedDraft = null, usePrefetchedDraft = false } = {}) {
  if (!els.messageInput || state.editingMessage?.messageId) return;
  const cleanChatId = String(chatId || '').trim();
  const loadSeq = Number(state.draftLoadSeq || 0) + 1;
  state.draftLoadSeq = loadSeq;
  const inputVersionAtStart = Number(state.draftInputVersion || 0);
  const localDraft = readDraftPayload(cleanChatId);
  const localText = typeof localDraft?.text === 'string' ? localDraft.text : '';
  els.messageInput.value = localText;
  setDraftStatus(localText.trim() ? 'Borrador recuperado en este chat.' : '');
  if (!state.user || !cleanChatId) return;
  // Una vez que este chat fue sincronizado correctamente, las mutaciones de borrador
  // llegan por SSE. Reabrirlo no necesita otra respuesta HTTP hasta que la marca se
  // invalide por un cambio remoto o un resync de estado.
  if (state.draftRemoteLoadedChats.has(cleanChatId) && !usePrefetchedDraft) return;
  try {
    // La primera página de mensajes puede traer el borrador en el mismo envelope. Así la
    // apertura inicial del chat consume una sola HTTP Response en vez de messages + draft/get.
    const remoteDraft = usePrefetchedDraft
      ? (prefetchedDraft || null)
      : ((await post('/api/chats/draft/get', { chatId: cleanChatId, draftOriginId: getDraftOriginId(), clientId: getClientId() })).draft || null);
    state.draftRemoteLoadedChats.add(cleanChatId);
    state.draftLastSyncedTextByChat.set(cleanChatId, String(remoteDraft?.text || ''));
    if (state.activeChatId !== cleanChatId || state.editingMessage?.messageId || state.draftLoadSeq !== loadSeq) return;
    if (Number(state.draftInputVersion || 0) !== inputVersionAtStart) return;
    const remoteText = typeof remoteDraft?.text === 'string' ? remoteDraft.text : '';
    const remoteMs = remoteDraftSavedMs(remoteDraft);
    const localMs = Number(localDraft?.savedAt || 0);
    if (remoteText.trim() && remoteMs >= localMs && remoteText !== els.messageInput.value) {
      writeDraftPayload(cleanChatId, remoteText, remoteMs || Date.now());
      els.messageInput.value = remoteText;
      setDraftStatus('Borrador sincronizado desde tu cuenta.');
      updateComposerControls();
    }
  } catch {
    // El borrador local sigue disponible aunque la sincronización remota no responda.
    // No marcamos el chat como sincronizado para permitir un reintento futuro útil.
  }
}

function clearDraftForChat(chatId = state.activeChatId) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return;
  if (cleanChatId === state.activeChatId) cancelActiveDraftSaveTimer();
  cancelRemoteDraftSync(cleanChatId);
  markDraftCleared(cleanChatId);
  removeLocalDraftPayload(cleanChatId);
  scheduleRemoteDraftSync(cleanChatId, '', { delay: 0 });
  setDraftStatus('');
}

function closeDraftsModal() {
  state.draftsOpen = false;
  state.draftsLoading = false;
  renderDraftsModal();
}

function renderDraftsModal() {
  if (!els.draftsModal || !els.draftsList) return;
  els.draftsModal.classList.toggle('hidden', !state.draftsOpen);
  if (!state.draftsOpen) return;
  if (state.draftsLoading) {
    els.draftsList.innerHTML = '<div class="ce-drafts-empty">Cargando borradores pendientes...</div>';
    return;
  }
  const drafts = Array.isArray(state.drafts) ? state.drafts : [];
  if (!drafts.length) {
    els.draftsList.innerHTML = '<div class="ce-drafts-empty">No tienes borradores pendientes en este momento.</div>';
    return;
  }
  els.draftsList.innerHTML = drafts.map((draft) => {
    const chat = draft.chat || state.chats.find((item) => item.chatId === draft.chatId) || { chatId: draft.chatId };
    const title = chatDisplayName(chat);
    const subtitle = chatDisplaySubtitle(chat);
    const excerpt = compactText(draft.excerpt || draft.text || '', 220);
    const saved = draft.savedAt ? formatScheduleDateTime(draft.savedAt) : 'Guardado recientemente';
    return `<article class="ce-draft-item" data-draft-item-chat-id="${escapeHtml(draft.chatId)}">
      ${renderChatAvatarWithPresence(chat, 'small')}
      <div class="ce-draft-item__body">
        <strong>${escapeHtml(title)}</strong>
        <em>${escapeHtml(subtitle)}</em>
        <p>${escapeHtml(excerpt || 'Borrador sin vista previa')}</p>
        <span>${escapeHtml(saved)}</span>
      </div>
      <div class="ce-draft-item__actions">
        <button class="ce-btn ce-btn--small" type="button" data-open-draft-chat-id="${escapeHtml(draft.chatId)}">Continuar</button>
        <button class="ce-link" type="button" data-delete-draft-chat-id="${escapeHtml(draft.chatId)}">Descartar</button>
      </div>
    </article>`;
  }).join('');
}

function applyDraftListRealtimeDelta(eventType = '', draft = null, chatId = '', eventMs = Date.now()) {
  if (!state.draftsOpen) return false;
  const cleanChatId = String(draft?.chatId || chatId || '').trim();
  if (!cleanChatId) return false;
  const index = state.drafts.findIndex((item) => String(item?.chatId || '') === cleanChatId);
  const current = index >= 0 ? state.drafts[index] : null;
  const currentMs = remoteDraftSavedMs(current || {});
  const safeEventMs = Math.max(0, Number(eventMs || 0));

  if (eventType === 'chat.draft.deleted') {
    // Un delete retrasado no puede borrar de la lista un borrador más nuevo ya visto.
    if (current && currentMs && safeEventMs && safeEventMs < currentMs) return false;
    if (index >= 0) state.drafts.splice(index, 1);
    renderDraftsModal();
    return index >= 0;
  }

  if (eventType !== 'chat.draft.updated' || !draft || typeof draft !== 'object') return false;
  const remoteMs = remoteDraftSavedMs(draft);
  if (current && currentMs && remoteMs && remoteMs < currentMs) return false;
  const chat = current?.chat || state.chats.find((item) => item.chatId === cleanChatId) || null;
  const next = {
    ...(current || {}),
    ...draft,
    chatId: cleanChatId,
    excerpt: compactText(draft.text || current?.text || '', 180),
    ...(chat ? { chat } : {})
  };
  if (index >= 0) state.drafts[index] = next;
  else state.drafts.unshift(next);
  state.drafts.sort((a, b) => remoteDraftSavedMs(b) - remoteDraftSavedMs(a));
  if (state.drafts.length > 80) state.drafts.length = 80;
  renderDraftsModal();
  return true;
}

async function loadDrafts({ silent = false } = {}) {
  if (!state.user) return [];
  state.draftsLoading = !silent;
  renderDraftsModal();
  try {
    const data = await post('/api/chats/drafts/list', { limit: 80 });
    state.drafts = Array.isArray(data.drafts) ? data.drafts : [];
    // La lista ya entrega el borrador completo: reutilizamos esa respuesta como fuente
    // autoritativa para no pedir /draft/get al abrir uno de los chats listados.
    for (const draft of state.drafts) {
      const cleanChatId = String(draft?.chatId || '').trim();
      if (!cleanChatId) continue;
      const remoteText = String(draft?.text || '');
      const remoteMs = remoteDraftSavedMs(draft);
      const localMs = Number(readDraftPayload(cleanChatId)?.savedAt || 0);
      if (remoteText.trim() && remoteMs >= localMs) {
        writeDraftPayload(cleanChatId, remoteText, remoteMs || Date.now());
        state.draftRemoteLoadedChats.add(cleanChatId);
        state.draftLastSyncedTextByChat.set(cleanChatId, remoteText);
      } else if (remoteMs < localMs) {
        state.draftRemoteLoadedChats.delete(cleanChatId);
        state.draftLastSyncedTextByChat.delete(cleanChatId);
      }
    }
    return state.drafts;
  } finally {
    state.draftsLoading = false;
    renderDraftsModal();
  }
}

async function openDraftsModal() {
  if (!state.user) return;
  saveActiveDraft({ announce: false });
  const activeText = String(els.messageInput?.value || '').trim();
  if (state.activeChatId && activeText && !state.editingMessage?.messageId) {
    await syncDraftToServer(state.activeChatId, activeText, { announce: false }).catch(() => null);
  }
  state.draftsOpen = true;
  renderDraftsModal();
  await loadDrafts();
}

function mergeDraftChatIntoState(chat = {}) {
  if (!chat?.chatId) return;
  state.activeLabelFilter = '';
  state.archivedView = Boolean(chat.isArchived);
  state.chatListMode = chat.isArchived ? 'archived' : 'active';
  const index = state.chats.findIndex((item) => item.chatId === chat.chatId);
  if (index >= 0) state.chats[index] = { ...state.chats[index], ...chat };
  else state.chats.unshift(chat);
  sortChats();
  showChatListMode(state.chatListMode);
}

async function openDraftFromList(chatId = '') {
  let draft = state.drafts.find((item) => item.chatId === chatId) || null;
  const hasKnownChat = Boolean(draft?.chat || state.chats.some((item) => item.chatId === chatId));
  if (draft && !hasKnownChat) {
    // Un delta SSE nuevo puede pertenecer a un chat archivado aún no materializado en
    // esta pestaña. Hidratamos solo bajo acción explícita del usuario, evitando que
    // cada autosalvado remoto vuelva a disparar /api/chats/drafts/list.
    await loadDrafts({ silent: true }).catch(() => null);
    draft = state.drafts.find((item) => item.chatId === chatId) || draft;
  }
  if (draft?.chat) mergeDraftChatIntoState(draft.chat);
  closeDraftsModal();
  await selectChat(chatId);
  const draftText = String(draft?.text || '').trim();
  if (draftText && els.messageInput && !els.messageInput.value.trim()) {
    els.messageInput.value = draftText;
    writeDraftPayload(chatId, draftText, remoteDraftSavedMs(draft) || Date.now());
  }
  updateComposerControls();
  els.messageInput?.focus();
}

async function deleteDraftFromList(chatId = '') {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return;
  await post('/api/chats/draft/delete', { chatId: cleanChatId, draftOriginId: getDraftOriginId(), clientId: getClientId() });
  removeLocalDraftPayload(cleanChatId);
  state.draftRemoteLoadedChats.add(cleanChatId);
  state.draftLastSyncedTextByChat.set(cleanChatId, '');
  state.drafts = state.drafts.filter((draft) => draft.chatId !== cleanChatId);
  if (state.activeChatId === cleanChatId && !state.editingMessage?.messageId) {
    if (els.messageInput) els.messageInput.value = '';
    setDraftStatus('');
    updateComposerControls();
  }
  renderDraftsModal();
}

function isDeletedMessage(message = {}) {
  return Boolean(message?.deletedAt || message?.type === 'deleted');
}

function normalizeChatBlockStatus(chat = {}) {
  const source = chat?.blockStatus && typeof chat.blockStatus === 'object' ? chat.blockStatus : {};
  const targetUserId = String(source.targetUserId || chat?.other?.userId || '').trim();
  const blockedByMe = Boolean(chat?.isBlockedByMe || source.blockedByMe);
  const blockedMe = Boolean(chat?.hasBlockedMe || source.blockedMe);
  return {
    targetUserId,
    blockedByMe,
    blockedMe,
    blocked: Boolean(chat?.isBlocked || source.blocked || blockedByMe || blockedMe),
    blockedAt: String(source.blockedAt || '').trim(),
    blockedMeAt: String(source.blockedMeAt || '').trim()
  };
}

function isChatInteractionBlocked(chat = activeChat()) {
  return Boolean(chat?.chatId && !isSelfChat(chat) && normalizeChatBlockStatus(chat).blocked);
}

function chatBlockNoticeText(chat = activeChat()) {
  const status = normalizeChatBlockStatus(chat || {});
  if (status.blockedByMe && status.blockedMe) return 'Este contacto está bloqueado y tampoco recibe mensajes tuyos por ahora.';
  if (status.blockedByMe) return 'Contacto bloqueado. La conversación se conserva, pero no puedes enviar mensajes hasta desbloquearlo.';
  if (status.blockedMe) return 'Este contacto no recibe tus mensajes en este momento.';
  return '';
}

function ensureChatInteractionAllowed(chat = activeChat()) {
  if (!isChatInteractionBlocked(chat)) return true;
  const message = chatBlockNoticeText(chat) || 'La comunicación con este contacto está pausada.';
  showTemporaryDraftStatus(message, 4200);
  throw new Error(message);
}

function renderChatBlockNotice(chat = activeChat()) {
  const text = chatBlockNoticeText(chat);
  if (!text) return '';
  const canUnblock = normalizeChatBlockStatus(chat).blockedByMe;
  const action = canUnblock ? '<button class="ce-link" type="button" data-block-active-contact="0">Desbloquear contacto</button>' : '';
  return `<div class="ce-block-notice" role="status"><strong>Comunicación pausada</strong><span>${escapeHtml(text)}</span>${action}</div>`;
}

function blockIconSvg(blocked = false) {
  return blocked
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 0 1 5.3 13.98L6.02 6.7A7.97 7.97 0 0 1 12 4ZM4 12c0-1.46.39-2.82 1.08-4l10.92 10.92A8 8 0 0 1 4 12Z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2c1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.96 7.96 0 0 1 12 4Zm0 16a7.96 7.96 0 0 1-4.9-1.69L18.31 7.1A8 8 0 0 1 12 20Z"/></svg>';
}

function normalizeReactionKey(value = '') {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (allowedReactionEmojis.includes(clean)) return clean;
  return reactionEmojiAliases[clean] || '';
}

function getMessageReactions(message = {}) {
  const source = message.reactions && typeof message.reactions === 'object' ? message.reactions : {};
  const normalized = {};
  for (const [rawReaction, users] of Object.entries(source)) {
    const reactionKey = normalizeReactionKey(rawReaction);
    if (!reactionKey || !Array.isArray(users) || !users.length) continue;
    normalized[reactionKey] = Array.from(new Set([...(normalized[reactionKey] || []), ...users.filter(Boolean)]));
  }
  return Object.fromEntries(Object.entries(normalized).filter(([, users]) => Array.isArray(users) && users.length));
}

function userReactionForMessage(message = {}) {
  const reactions = getMessageReactions(message);
  return Object.entries(reactions).find(([, users]) => users.includes(state.user?.userId))?.[0] || '';
}

function reactionDisplayName(reaction = '') {
  return normalizeReactionKey(reaction) || 'reacción';
}

function readRecentControlList(storageKey = '', allowedIds = []) {
  const allowed = new Set((allowedIds || []).filter(Boolean));
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || '').trim()).filter((item, index, list) => item && allowed.has(item) && list.indexOf(item) === index).slice(0, recentMessageControlLimit);
  } catch {
    return [];
  }
}

function rememberRecentControl(storageKey = '', controlId = '', allowedIds = []) {
  const cleanId = String(controlId || '').trim();
  if (!cleanId || !(allowedIds || []).includes(cleanId)) return;
  const next = [cleanId, ...readRecentControlList(storageKey, allowedIds).filter((item) => item !== cleanId)].slice(0, recentMessageControlLimit);
  try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  try {
    window.queueMicrotask?.(() => {
      if (state.activeChatId) renderAll();
    });
  } catch {}
}

function orderControlItemsForCollapsedView(items = [], recentIds = []) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const visibleIds = [];
  for (const id of recentIds) {
    if (byId.has(id) && !visibleIds.includes(id)) visibleIds.push(id);
    if (visibleIds.length >= recentMessageControlLimit) break;
  }
  for (const item of items) {
    if (!visibleIds.includes(item.id)) visibleIds.push(item.id);
    if (visibleIds.length >= recentMessageControlLimit) break;
  }
  return [
    ...visibleIds.map((id) => ({ ...byId.get(id), priority: 'recent' })).filter((item) => item && item.id),
    ...items.filter((item) => !visibleIds.includes(item.id)).map((item) => ({ ...item, priority: 'more' }))
  ];
}

function renderMessageControlsToggle(kind = '', hasMore = false) {
  if (!hasMore) return '';
  const label = kind === 'reactions' ? 'Mostrar más reacciones' : 'Mostrar más acciones';
  return `<button class="ce-control-toggle" type="button" data-message-controls-toggle="${escapeHtml(kind)}" aria-label="${escapeHtml(label)}" aria-expanded="false">${uiIcon('arrowDown')}</button>`;
}

function renderReactionSummary(message = {}) {
  const reactions = getMessageReactions(message);
  const entries = Object.entries(reactions);
  if (!entries.length) return '';
  const activeReaction = userReactionForMessage(message);
  return `<div class="ce-reaction-summary" aria-label="Reacciones del mensaje">${entries.map(([reaction, users]) => {
    const count = Array.from(new Set(users)).length;
    const active = reaction === activeReaction ? ' active' : '';
    const reactionName = reactionDisplayName(reaction);
    const label = reaction === activeReaction ? `Quitar reacción ${reactionName}` : `Reaccionar con ${reactionName}`;
    const countLabel = count > 2 ? `<strong>${count}</strong>` : '';
    return `<button class="ce-reaction-chip${active}" type="button" data-message-id="${escapeHtml(message.messageId || '')}" data-reaction="${escapeHtml(reaction)}" aria-label="${escapeHtml(label)}"><span class="ce-reaction-chip__emoji">${escapeHtml(reaction)}</span>${countLabel}</button>`;
  }).join('')}</div>`;
}

function renderReactionPicker(message = {}) {
  const activeReaction = userReactionForMessage(message);
  const recentReactions = readRecentControlList(reactionRecentStorageKey, quickReactions);
  const reactionItems = orderControlItemsForCollapsedView(quickReactions.map((reaction) => ({
    id: reaction,
    reaction
  })), recentReactions);
  const buttons = reactionItems.map(({ reaction, priority }) => {
    const active = reaction === activeReaction ? ' active' : '';
    const reactionName = reactionDisplayName(reaction);
    const label = reaction === activeReaction ? `Quitar reacción ${reactionName}` : `Reaccionar con ${reactionName}`;
    return `<span class="ce-control-item" data-control-priority="${escapeHtml(priority)}"><button class="ce-reaction-btn${active}" type="button" data-message-id="${escapeHtml(message.messageId || '')}" data-reaction="${escapeHtml(reaction)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeHtml(reaction)}</button></span>`;
  }).join('');
  const hasMore = reactionItems.some((item) => item.priority === 'more');
  return `<div class="ce-reaction-picker ce-control-list" data-control-list="reactions" aria-label="Reaccionar al mensaje">${buttons}${renderMessageControlsToggle('reactions', hasMore)}</div>`;
}

function normalizePollClient(message = {}) {
  const poll = message.poll && typeof message.poll === 'object' ? message.poll : null;
  if (!poll) return null;
  const question = String(poll.question || message.text || '').replace(/^Encuesta:\s*/i, '').trim();
  const options = Array.isArray(poll.options) ? poll.options.map((option) => ({
    optionId: String(option.optionId || option.id || '').trim(),
    text: String(option.text || '').trim()
  })).filter((option) => option.optionId && option.text).slice(0, 6) : [];
  if (!question || options.length < 2) return null;
  const votes = poll.votes && typeof poll.votes === 'object' ? poll.votes : {};
  return { question, options, votes };
}

function pollSelectedOptionId(poll = {}) {
  const userId = state.user?.userId || '';
  if (!userId) return '';
  for (const option of poll.options || []) {
    const voters = Array.isArray(poll.votes?.[option.optionId]) ? poll.votes[option.optionId] : [];
    if (voters.includes(userId)) return option.optionId;
  }
  return '';
}

function renderPollMessage(message = {}) {
  const poll = normalizePollClient(message);
  if (!poll) return `<p class="ce-msg__text">${escapeHtml(message.text || 'Encuesta no disponible')}</p>`;
  const selectedOptionId = pollSelectedOptionId(poll);
  const totalVotes = poll.options.reduce((total, option) => total + new Set(Array.isArray(poll.votes?.[option.optionId]) ? poll.votes[option.optionId] : []).size, 0);
  const optionsHtml = poll.options.map((option) => {
    const count = new Set(Array.isArray(poll.votes?.[option.optionId]) ? poll.votes[option.optionId] : []).size;
    const percent = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
    const selected = option.optionId === selectedOptionId;
    const label = selected ? `Quitar voto de ${option.text}` : `Votar ${option.text}`;
    return `<button class="ce-poll-option${selected ? ' active' : ''}" type="button" data-poll-vote-message-id="${escapeHtml(message.messageId || '')}" data-poll-option-id="${escapeHtml(option.optionId)}" aria-label="${escapeHtml(label)}">
      <span class="ce-poll-option__bar" style="width:${Math.max(0, Math.min(100, percent))}%"></span>
      <span class="ce-poll-option__text">${escapeHtml(option.text)}</span>
      <strong>${count ? `${count} · ${percent}%` : '0'}</strong>
    </button>`;
  }).join('');
  const help = selectedOptionId ? 'Toca tu opción otra vez para quitar el voto.' : 'Elige una opción para votar.';
  return `<section class="ce-poll" aria-label="Encuesta">
    <div class="ce-poll__label">${uiIcon('poll')}<span>Encuesta</span></div>
    <h3>${escapeHtml(poll.question)}</h3>
    <div class="ce-poll__options">${optionsHtml}</div>
    <small>${totalVotes} ${totalVotes === 1 ? 'voto' : 'votos'} · ${help}</small>
  </section>`;
}

function renderStarButton(message = {}) {
  const active = message.isStarred ? ' active' : '';
  const icon = message.isStarred ? uiIcon('star') : uiIcon('starOutline');
  const label = message.isStarred ? 'Quitar de mensajes destacados' : 'Destacar mensaje';
  return `<button class="ce-star-btn${active}" type="button" data-message-action-id="star" data-star-message-id="${escapeHtml(message.messageId || '')}" data-starred="${message.isStarred ? '1' : '0'}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon}</button>`;
}

function renderPinMessageButton(message = {}) {
  const active = message.isPinned ? ' active' : '';
  const icon = message.isPinned ? uiIcon('pin') : uiIcon('pinOutline');
  const label = message.isPinned ? 'Desfijar mensaje de este chat' : 'Fijar mensaje en este chat';
  return `<button class="ce-pin-msg-btn${active}" type="button" data-message-action-id="pin" data-pin-message-id="${escapeHtml(message.messageId || '')}" data-pinned="${message.isPinned ? '1' : '0'}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon}</button>`;
}

function renderReplyButton(message = {}) {
  const label = 'Responder este mensaje';
  return `<button class="ce-reply-btn" type="button" data-message-action-id="reply" data-reply-message-id="${escapeHtml(message.messageId || '')}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${uiIcon('reply')}</button>`;
}

function renderForwardButton(message = {}) {
  const label = 'Reenviar mensaje';
  return `<button class="ce-forward-btn" type="button" data-message-action-id="forward" data-forward-message-id="${escapeHtml(message.messageId || '')}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${uiIcon('forward')}</button>`;
}

function renderMessageLinkButton(message = {}) {
  const label = 'Copiar enlace interno del mensaje';
  return `<button class="ce-link-msg-btn" type="button" data-message-action-id="link" data-copy-message-link-id="${escapeHtml(message.messageId || '')}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${uiIcon('link')}</button>`;
}

function renderCopyButton(message = {}) {
  const label = 'Copiar texto del mensaje';
  return `<button class="ce-copy-btn" type="button" data-message-action-id="copy" data-copy-message-id="${escapeHtml(message.messageId || '')}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${uiIcon('copy')}</button>`;
}

function renderReminderButton(message = {}) {
  const label = 'Crear recordatorio privado de este mensaje';
  return `<button class="ce-reminder-btn" type="button" data-message-action-id="reminder" data-remind-message-id="${escapeHtml(message.messageId || '')}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${uiIcon('reminder')}</button>`;
}

function renderEditButton(message = {}) {
  const label = 'Editar mensaje';
  return `<button class="ce-edit-btn" type="button" data-message-action-id="edit" data-edit-message-id="${escapeHtml(message.messageId || '')}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${uiIcon('edit')}</button>`;
}

function renderDeleteButton(message = {}) {
  const label = 'Eliminar mensaje para todos';
  return `<button class="ce-delete-btn" type="button" data-message-action-id="delete" data-delete-message-id="${escapeHtml(message.messageId || '')}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${uiIcon('trash')}</button>`;
}



function bellIconSvg(muted = false) {
  if (muted) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.27 3 3 4.27l3.02 3.02A7.86 7.86 0 0 0 5 11v4l-2 2v1h15.73L20.73 20 22 18.73 4.27 3ZM12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-7v-4a7 7 0 0 0-9.9-6.37l9.7 9.7.2.2V15Z"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5-6.71V3a2 2 0 0 0-4 0v1.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>';
}

function renderMessageActions(message = {}, mine = false) {
  if (isDeletedMessage(message)) return '';
  const isPoll = message.type === 'poll' || Boolean(message.poll);
  const actionItems = [
    { id: 'reply', html: renderReplyButton(message) },
    { id: 'copy', html: renderCopyButton(message) },
    { id: 'forward', html: renderForwardButton(message) },
    { id: 'star', html: renderStarButton(message) },
    { id: 'pin', html: renderPinMessageButton(message) },
    { id: 'reminder', html: renderReminderButton(message) },
    { id: 'link', html: renderMessageLinkButton(message) },
    ...(mine && !isPoll ? [{ id: 'edit', html: renderEditButton(message) }] : []),
    ...(mine ? [{ id: 'delete', html: renderDeleteButton(message) }] : [])
  ].filter((item) => item.html);
  const actionIds = actionItems.map((item) => item.id);
  const recentActions = readRecentControlList(messageActionRecentStorageKey, actionIds);
  const orderedActions = orderControlItemsForCollapsedView(actionItems, recentActions);
  const actions = orderedActions.map((item) => `<span class="ce-control-item" data-control-priority="${escapeHtml(item.priority)}" data-control-action-id="${escapeHtml(item.id)}">${item.html}</span>`).join('');
  const hasMore = orderedActions.some((item) => item.priority === 'more');
  return `<span class="ce-msg-actions ce-control-list" data-control-list="actions" aria-label="Acciones del mensaje">${actions}${renderMessageControlsToggle('actions', hasMore)}</span>`;
}

function renderMessageBody(message = {}, mine = false) {
  if (isDeletedMessage(message)) {
    const text = message.expirationReason === 'ephemeral_expired' || message.expiredAt ? 'Mensaje temporal expirado' : 'Mensaje eliminado';
    return `<p class="ce-msg__deleted">${escapeHtml(text)}</p>`;
  }
  const forwarded = message.type === 'forwarded' || message.forwardedFrom?.messageId
    ? `<div class="ce-forwarded-label" aria-label="Mensaje reenviado">${uiIcon('forward')}<span>Reenviado</span></div>`
    : '';
  const silent = mine && message.silent
    ? `<div class="ce-silent-label" aria-label="Mensaje enviado sin notificación">${uiIcon('bellOff')}<span>Sin notificación</span></div>`
    : '';
  const ephemeral = message.ephemeralSeconds || message.expireAt
    ? `<div class="ce-ephemeral-label" aria-label="Mensaje temporal">${escapeHtml(formatEphemeralMessageLabel(message))}</div>`
    : '';
  const normalizedAttachment = normalizeAttachmentClient(message.attachment || null);
  const attachment = renderMessageAttachment(normalizedAttachment);
  const textBody = renderMessageTextBody(message.text, normalizedAttachment);
  const body = message.type === 'poll' || message.poll
    ? renderPollMessage(message)
    : `${attachment}${textBody}`;
  return `${forwarded}${silent}${ephemeral}${body}`;
}

function renderUnreadSeparator(marker = {}) {
  const count = Math.max(1, Number(marker.count || 1));
  const label = count === 1 ? '1 mensaje nuevo' : `${count} mensajes nuevos`;
  return `<div class="ce-unread-separator" data-unread-marker-for="${escapeHtml(marker.messageId || '')}" role="separator" aria-label="${escapeHtml(label)}">
    <span></span>
    <button type="button" data-jump-unread-marker="${escapeHtml(marker.messageId || '')}">${escapeHtml(label)}</button>
    <span></span>
  </div>`;
}

function selectUnreadMarkerMessage(messages = [], unreadCount = 0) {
  const safeUnread = Math.min(messages.length, Math.max(0, Number(unreadCount || 0)));
  if (!safeUnread || !messages.length) return null;
  const incoming = messages
    .filter((message) => message?.messageId && message.senderUserId !== state.user?.userId && !isDeletedMessage(message))
    .slice(-safeUnread);
  if (incoming.length) return incoming[0];
  return messages[Math.max(0, messages.length - safeUnread)] || null;
}

function rememberUnreadMarkerForChat(chat = {}, messages = []) {
  const chatId = chat?.chatId || '';
  const unreadCount = Math.max(0, Number(chat?.unread || 0));
  if (!chatId || unreadCount <= 0) {
    if (chatId) state.unreadMarkerByChatId.delete(chatId);
    return null;
  }
  const markerMessage = selectUnreadMarkerMessage(messages, unreadCount);
  if (!markerMessage?.messageId) {
    state.unreadMarkerByChatId.delete(chatId);
    return null;
  }
  const marker = { messageId: markerMessage.messageId, count: unreadCount, createdAt: markerMessage.createdAt || '' };
  state.unreadMarkerByChatId.set(chatId, marker);
  return marker;
}

function jumpToUnreadMarker(messageId = '') {
  const cleanMessageId = String(messageId || state.unreadMarkerByChatId.get(state.activeChatId)?.messageId || '').trim();
  if (!cleanMessageId || !els.messages) return false;
  const markerNode = [...els.messages.querySelectorAll('[data-unread-marker-for]')]
    .find((node) => node.dataset.unreadMarkerFor === cleanMessageId);
  const messageNode = [...els.messages.querySelectorAll('[data-message-id]')]
    .find((node) => node.dataset.messageId === cleanMessageId);
  const target = markerNode || messageNode;
  if (!target) return false;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (messageNode) messageNode.classList.add('is-highlighted');
  state.highlightedMessageId = cleanMessageId;
  window.setTimeout(() => {
    if (messageNode?.isConnected) messageNode.classList.remove('is-highlighted');
    if (state.highlightedMessageId === cleanMessageId) state.highlightedMessageId = '';
  }, 1800);
  return true;
}

function messageReceiptState(message = {}) {
  const recipientCount = Math.max(0, Number(message.recipientCount || 0));
  const readByCount = Math.max(0, Number(message.readByCount || 0));
  const deliveredByCount = Math.max(0, Number(message.deliveredByCount || 0));
  const read = message.receiptStatus === 'read' || (recipientCount > 0 && readByCount >= recipientCount);
  const delivered = read || message.receiptStatus === 'delivered' || (recipientCount > 0 && deliveredByCount >= recipientCount);
  if (read) {
    return {
      status: 'read',
      className: ' is-read',
      symbol: uiIcon('checkDouble'),
      label: `Leído${message.readAt ? ` · ${formatExportDateTime(message.readAt)}` : ''}`
    };
  }
  if (delivered) {
    return {
      status: 'delivered',
      className: ' is-delivered',
      symbol: uiIcon('checkDouble'),
      label: `Entregado al destinatario${message.deliveredAt ? ` · ${formatExportDateTime(message.deliveredAt)}` : ''}`
    };
  }
  return {
    status: 'sent',
    className: '',
    symbol: uiIcon('check'),
    label: `Recibido por el backend${message.backendReceivedAt ? ` · ${formatExportDateTime(message.backendReceivedAt)}` : ''}`
  };
}

function renderMessageReceipt(message = {}, mine = false) {
  if (!mine || isDeletedMessage(message)) return '';
  const recipientCount = Math.max(0, Number(message.recipientCount || 0));
  if (!recipientCount) return '';
  const receipt = messageReceiptState(message);
  return `<span class="ce-msg__receipt${receipt.className}" data-receipt-status="${escapeHtml(receipt.status)}" title="${escapeHtml(receipt.label)}" aria-label="${escapeHtml(receipt.label)}">${receipt.symbol}</span>`;
}

function renderMessageTime(message = {}, mine = false) {
  const edited = message.editedAt && !isDeletedMessage(message) ? ' · editado' : '';
  return `<span class="ce-msg__meta"><time>${formatMessageTime(message.createdAt)}${edited}</time>${renderMessageReceipt(message, mine)}</span>`;
}

function closeOpenMessageControls(exceptMessage = null) {
  if (!els.messages) return;
  els.messages.querySelectorAll('.ce-msg.is-controls-open').forEach((messageEl) => {
    if (exceptMessage && messageEl === exceptMessage) return;
    messageEl.classList.remove('is-controls-open');
    messageEl.querySelectorAll('.ce-control-list.is-expanded').forEach((list) => {
      list.classList.remove('is-expanded');
      list.querySelectorAll('[data-message-controls-toggle]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
    });
  });
}

function openMessageControlsForElement(messageEl = null) {
  if (!messageEl || !els.messages?.contains(messageEl) || !messageEl.classList.contains('ce-msg')) return false;
  closeOpenMessageControls(messageEl);
  messageEl.classList.add('is-controls-open');
  return true;
}

function toggleMessageControlList(toggleButton = null) {
  if (!toggleButton || !els.messages?.contains(toggleButton)) return false;
  const messageEl = toggleButton.closest('.ce-msg');
  const list = toggleButton.closest('.ce-control-list');
  if (!messageEl || !list) return false;
  openMessageControlsForElement(messageEl);
  const expanded = !list.classList.contains('is-expanded');
  list.classList.toggle('is-expanded', expanded);
  toggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  const kind = toggleButton.dataset.messageControlsToggle || '';
  toggleButton.setAttribute('aria-label', expanded
    ? (kind === 'reactions' ? 'Plegar reacciones' : 'Plegar acciones')
    : (kind === 'reactions' ? 'Mostrar más reacciones' : 'Mostrar más acciones'));
  return true;
}

function messageSenderLabel(senderUserId = '') {
  if (senderUserId && senderUserId === state.user?.userId) return 'Tú';
  const other = activeChat()?.other || {};
  if (senderUserId && other.userId === senderUserId) return other.displayName || other.email || 'Contacto';
  return 'Contacto';
}

function renderReplyPreview(message = {}) {
  const reply = message.replyTo;
  if (!reply?.messageId || !reply.text) return '';
  return `<button class="ce-reply-preview" type="button" data-jump-message-id="${escapeHtml(reply.messageId)}" aria-label="Ver mensaje respondido"><strong>${uiIcon('reply')} ${escapeHtml(messageSenderLabel(reply.senderUserId))}</strong><span>${escapeHtml(compactText(reply.text))}</span></button>`;
}

function renderReplyDraft() {
  if (!els.replyDraft) return;
  const editing = state.editingMessage;
  if (state.activeChatId && editing?.messageId) {
    els.replyDraft.classList.remove('hidden');
    els.replyDraft.innerHTML = `
      <button class="ce-reply-draft__content ce-reply-draft__content--edit" type="button" data-edit-focus="1" aria-label="Editar mensaje seleccionado">
        <strong>Editando mensaje</strong>
        <span>${escapeHtml(compactText(editing.text || ''))}</span>
      </button>
      <button class="ce-reply-draft__close" type="button" data-cancel-edit="1" aria-label="Cancelar edición">${uiIcon('close')}</button>`;
    updateComposerControls();
    return;
  }
  const reply = state.replyToMessage;
  if (!state.activeChatId || !reply?.messageId) {
    els.replyDraft.classList.add('hidden');
    els.replyDraft.innerHTML = '';
    updateComposerControls();
    return;
  }
  els.replyDraft.classList.remove('hidden');
  els.replyDraft.innerHTML = `
    <button class="ce-reply-draft__content" type="button" data-jump-message-id="${escapeHtml(reply.messageId)}" aria-label="Ver mensaje que estás respondiendo">
      <strong>Respondiendo a ${escapeHtml(messageSenderLabel(reply.senderUserId))}</strong>
      <span>${escapeHtml(compactText(reply.text || ''))}</span>
    </button>
    <button class="ce-reply-draft__close" type="button" data-cancel-reply="1" aria-label="Cancelar respuesta">${uiIcon('close')}</button>`;
  updateComposerControls();
}


function normalizeSlashCommandName(value = '') {
  return String(value || '').trim().toLowerCase().replace(/^\/+/, '');
}

function parseSlashCommandText(text = '') {
  const raw = String(text || '').trim();
  if (!raw.startsWith('/')) return null;
  const firstSpace = raw.search(/\s/);
  const commandToken = firstSpace === -1 ? raw : raw.slice(0, firstSpace);
  return {
    raw,
    token: commandToken,
    name: normalizeSlashCommandName(commandToken),
    args: firstSpace === -1 ? '' : raw.slice(firstSpace + 1).trim()
  };
}

function parsePollSlashArgs(args = '') {
  const parts = String(args || '').split('|').map((part) => part.trim()).filter(Boolean);
  return { question: parts[0] || '', options: parts.slice(1, 7) };
}

function prefillPollModalFromSlash(args = '') {
  const parsed = parsePollSlashArgs(args);
  openPollModal();
  if (els.pollQuestionInput && parsed.question) els.pollQuestionInput.value = parsed.question;
  const inputs = Array.from(els.pollOptions?.querySelectorAll('input[data-poll-option-input]') || []);
  inputs.forEach((input, index) => {
    input.value = parsed.options[index] || '';
  });
  renderPollModal();
}

async function createPollFromSlashArgs(args = '') {
  const parsed = parsePollSlashArgs(args);
  if (!parsed.question || parsed.options.length < 2) {
    prefillPollModalFromSlash(args);
    showTemporaryDraftStatus('Comando de encuesta abierto. Completa pregunta y mínimo 2 opciones para publicar.', 5200);
    return { clearComposer: false };
  }
  ensureChatInteractionAllowed();
  const chatId = state.activeChatId;
  const clientMessageId = `poll_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  cancelActiveDraftSaveTimer();
  state.pollCreating = true;
  renderPollModal();
  updateComposerControls();
  try {
    const data = await post('/api/chats/poll/create', { chatId, question: parsed.question, options: parsed.options, clientMessageId, draftOriginId: getDraftOriginId(), clientId: getClientId() });
    clearDraftForChat(chatId);
    if (!shouldWaitForStreamConfirmation(data)) {
      upsertChat(data.chat);
      upsertMessage(data.message);
      renderAll();
    }
    showTemporaryDraftStatus('Encuesta publicada desde comando rápido.');
    return { clearComposer: true };
  } finally {
    state.pollCreating = false;
    renderPollModal();
    updateComposerControls();
  }
}

async function savePrivateNoteFromSlash(args = '') {
  const text = String(args || '').trim();
  if (!text) {
    await openPrivateNotesModal();
    showTemporaryDraftStatus('Escribe la nota después de /nota o guárdala desde el panel.', 4200);
    return { clearComposer: false };
  }
  const data = await post('/api/chats/private-notes/save', { chatId: state.activeChatId, text, compactResponse: true });
  applyPrivateNoteUpsert(data.note);
  showTemporaryDraftStatus('Nota privada guardada desde comando rápido.');
  return { clearComposer: true };
}

function getSlashCommandDefinitions() {
  return [
    {
      id: 'help',
      names: ['ayuda', 'help', 'comandos'],
      title: '/ayuda',
      description: 'Muestra comandos rápidos disponibles sin enviar un mensaje.',
      template: '/ayuda',
      enabled: Boolean(state.user),
      run: async () => {
        state.slashCommandsOpen = true;
        renderSlashCommandsPanel({ force: true });
        showTemporaryDraftStatus('Comandos rápidos abiertos. Elige uno o escribe /emoji, /encuesta, /silencio, /nota, /resumen, /fecha o /exportar.', 5600);
        return { clearComposer: false, keepPanelOpen: true };
      }
    },
    {
      id: 'emoji',
      names: ['emoji', 'emojis', 'icono', 'iconos'],
      title: '/emoji',
      description: 'Abre el selector local de emojis para insertarlos en el compositor.',
      template: '/emoji',
      enabled: Boolean(state.activeChatId && !state.editingMessage?.messageId && !isChatInteractionBlocked()),
      run: async () => {
        state.iconInsertPanelOpen = true;
        renderIconInsertPickerPanel();
        showTemporaryDraftStatus('Selector de emojis abierto. Elige uno para insertarlo en tu mensaje.');
        return { clearComposer: true, keepPanelOpen: false };
      }
    },
    {
      id: 'poll',
      names: ['encuesta', 'poll'],
      title: '/encuesta',
      description: 'Publica una encuesta usando: /encuesta Pregunta | Opción 1 | Opción 2.',
      template: '/encuesta ¿Qué opción prefieren? | Opción 1 | Opción 2',
      enabled: Boolean(state.activeChatId && !state.editingMessage?.messageId && !isChatInteractionBlocked()),
      run: (args) => createPollFromSlashArgs(args)
    },
    {
      id: 'silent',
      names: ['silencio', 'silent'],
      title: '/silencio',
      description: 'Envía el texto sin notificación push al destinatario.',
      template: '/silencio Te dejo esta actualización sin interrumpirte.',
      enabled: Boolean(state.activeChatId && !state.editingMessage?.messageId && !isChatInteractionBlocked()),
      run: async (args) => {
        const text = String(args || '').trim();
        if (!text) throw new Error('Escribe el mensaje después de /silencio.');
        await sendMessage(text, { silent: true, ephemeralSeconds: selectedEphemeralSeconds() });
        await sendTyping(false);
        return { clearComposer: true };
      }
    },
    {
      id: 'note',
      names: ['nota', 'note'],
      title: '/nota',
      description: 'Guarda una nota privada del chat visible solo para tu cuenta.',
      template: '/nota Pendiente importante de esta conversación.',
      enabled: Boolean(state.activeChatId && !state.editingMessage?.messageId),
      run: (args) => savePrivateNoteFromSlash(args)
    },
    {
      id: 'brief',
      names: ['resumen', 'brief'],
      title: '/resumen',
      description: 'Abre el resumen local con pendientes, acuerdos y preguntas del chat.',
      template: '/resumen',
      enabled: Boolean(state.activeChatId),
      run: async () => {
        await openChatBrief();
        return { clearComposer: true };
      }
    },
    {
      id: 'fecha',
      names: ['fecha', 'calendario', 'timeline'],
      title: '/fecha',
      description: 'Abre el calendario local del chat para saltar a un día con mensajes.',
      template: '/fecha',
      enabled: Boolean(state.activeChatId),
      run: async () => {
        await openDateJump();
        return { clearComposer: true };
      }
    },
    {
      id: 'export',
      names: ['exportar', 'export'],
      title: '/exportar',
      description: 'Descarga la conversación actual en archivo de texto.',
      template: '/exportar',
      enabled: Boolean(state.activeChatId),
      run: async () => {
        await exportActiveChat();
        return { clearComposer: true };
      }
    }
  ];
}

function findSlashCommand(name = '') {
  const cleanName = normalizeSlashCommandName(name);
  return getSlashCommandDefinitions().find((command) => command.names.includes(cleanName));
}

function getVisibleSlashCommands({ force = false } = {}) {
  const parsed = parseSlashCommandText(els.messageInput?.value || '');
  if (!force && !parsed) return [];
  const query = parsed ? normalizeSlashCommandName(parsed.name) : '';
  const commands = getSlashCommandDefinitions();
  if (!query || (force && ['ayuda', 'help', 'comandos'].includes(query))) return commands;
  return commands.filter((command) => command.names.some((name) => name.includes(query)) || normalizeClientSearchText(`${command.title} ${command.description}`).includes(query));
}

function renderSlashCommandsPanel({ force = false } = {}) {
  if (!els.slashCommandsPanel) return;
  const hasChat = Boolean(state.activeChatId);
  const blocked = isChatInteractionBlocked();
  const shouldOpen = Boolean(force || state.slashCommandsOpen || String(els.messageInput?.value || '').trim().startsWith('/')) && !state.editingMessage?.messageId;
  const commands = shouldOpen ? getVisibleSlashCommands({ force }) : [];
  if (!shouldOpen || !commands.length || !hasChat) {
    els.slashCommandsPanel.classList.add('hidden');
    els.slashCommandsPanel.innerHTML = '';
    return;
  }
  els.slashCommandsPanel.classList.remove('hidden');
  const help = blocked
    ? 'Este chat está bloqueado. Los comandos de escritura permanecen desactivados.'
    : 'Pulsa un comando para insertarlo o escríbelo completo y presiona Enviar.';
  els.slashCommandsPanel.innerHTML = `
    <div class="ce-slash-panel__head"><strong>Comandos rápidos</strong><span>${escapeHtml(help)}</span></div>
    <div class="ce-slash-panel__list">
      ${commands.map((command) => `
        <button class="ce-slash-command" type="button" data-slash-template="${escapeHtml(command.template)}" ${command.enabled ? '' : 'disabled'}>
          <span><strong>${escapeHtml(command.title)}</strong><em>${escapeHtml(command.description)}</em></span>
        </button>`).join('')}
    </div>`;
}

function insertSlashCommandTemplate(template = '') {
  if (!els.messageInput) return;
  if (state.iconInsertPanelOpen) closeIconInsertPicker();
  els.messageInput.value = template;
  state.slashCommandsOpen = true;
  els.messageInput.focus();
  try { els.messageInput.setSelectionRange(els.messageInput.value.length, els.messageInput.value.length); } catch {}
  scheduleActiveDraftSave();
  updateComposerControls();
  renderSlashCommandsPanel({ force: true });
}

async function handleSlashCommandSubmit(text = '') {
  if (state.editingMessage?.messageId) return false;
  const parsed = parseSlashCommandText(text);
  if (!parsed) return false;
  if (!state.activeChatId) return true;
  const command = findSlashCommand(parsed.name);
  if (!command) {
    state.slashCommandsOpen = true;
    renderSlashCommandsPanel({ force: true });
    showTemporaryDraftStatus('Comando no reconocido. Usa /ayuda para ver opciones disponibles.', 4200);
    return true;
  }
  if (!command.enabled) {
    showTemporaryDraftStatus(isChatInteractionBlocked() ? chatBlockNoticeText() : 'Este comando no está disponible en el estado actual del chat.', 4200);
    return true;
  }
  const result = await command.run(parsed.args || '');
  state.slashCommandsOpen = Boolean(result?.keepPanelOpen);
  renderSlashCommandsPanel({ force: state.slashCommandsOpen });
  return { handled: true, clearComposer: result?.clearComposer !== false };
}

function renderSendActionIcon(kind = 'mic') {
  if (kind === 'save') return uiIcon('check');
  if (kind === 'send') return uiIcon('send');
  if (kind === 'stop') return uiIcon('stop');
  if (kind === 'loading') return uiIcon('timer');
  if (kind === 'waitingText') return uiIcon('timer');
  return uiIcon('mic');
}

function updateSendModeMenu() {
  if (!els.sendModeMenu || !els.btnSendModePrefix) return;
  state.sendMode = normalizeSendMode(state.sendMode);
  const config = activeSendModeConfig();
  const shouldOpen = Boolean(state.sendModeMenuOpen && !els.btnSendModePrefix.disabled);
  els.sendModeMenu.classList.toggle('hidden', !shouldOpen);
  els.btnSendModePrefix.innerHTML = uiIcon(config.icon);
  els.btnSendModePrefix.classList.toggle('is-active', config.id !== 'direct');
  els.btnSendModePrefix.setAttribute('title', config.title);
  els.btnSendModePrefix.setAttribute('aria-label', `${config.label}. Abrir opciones de envío`);
  els.btnSendModePrefix.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  els.sendModeMenu.querySelectorAll('[data-send-mode]').forEach((option) => {
    const active = normalizeSendMode(option.dataset.sendMode) === config.id;
    option.classList.toggle('active', active);
    option.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function closeSendModeMenu() {
  state.sendModeMenuOpen = false;
  updateSendModeMenu();
}

function closeComposerTransientPanels({ closeSchedule = true } = {}) {
  state.quickRepliesOpen = false;
  state.slashCommandsOpen = false;
  state.iconInsertPanelOpen = false;
  state.sendModeMenuOpen = false;
  state.attachmentPickerOpen = false;
  state.attachmentPickerView = 'options';
  if (closeSchedule && state.scheduleModalOpen) state.scheduleModalOpen = false;
  if (closeSchedule && state.pollModalOpen) state.pollModalOpen = false;
  renderQuickRepliesPanel();
  renderIconInsertPickerPanel();
  renderSlashCommandsPanel();
  updateSendModeMenu();
  renderAttachmentPicker();
  if (closeSchedule) {
    renderScheduleModal();
    renderPollModal();
  }
}

function shouldRestoreComposerFocusAfterSubmit({ emojiKeyboardWasOpen = false } = {}) {
  if (!els.messageInput) return false;
  if (emojiKeyboardWasOpen) return false;
  if (els.messageForm?.classList.contains('ce-compose--emoji-keyboard')) return false;
  if (document.body?.classList.contains('ce-emoji-keyboard-open')) return false;
  return true;
}

function setSendMode(mode = 'direct', { openConfiguration = false } = {}) {
  const nextMode = normalizeSendMode(mode);
  state.sendMode = nextMode;
  closeSendModeMenu();
  if (nextMode !== 'schedule' && state.scheduleModalOpen) closeScheduleModal();
  updateComposerControls();
  if (nextMode === 'schedule' && openConfiguration) {
    openScheduleModal({ allowEmptyText: true }).catch((error) => alert(error.message || 'No se pudo abrir la programación.'));
  } else {
    showTemporaryDraftStatus(`${activeSendModeConfig().label} activado.`);
    els.messageInput?.focus();
  }
}

function updateComposerControls() {
  if (!els.messageInput || !els.btnSend) return;
  const hasChat = Boolean(state.activeChatId);
  const blocked = isChatInteractionBlocked();
  els.messageInput.placeholder = blocked ? 'Contacto bloqueado' : (state.editingMessage?.messageId ? 'Edita tu mensaje' : 'Escribe un mensaje o /ayuda');
  const hasAttachment = hasPendingComposerAttachment();
  const textLength = String(els.messageInput?.value || '').trim().length;
  const hasAnyText = textLength > 0;
  const hasSendableText = textLength >= 1;
  const hasText = hasSendableText;
  const canRecordAudio = hasChat && !blocked && !state.editingMessage?.messageId && !state.attachmentUploading && !state.attachmentBatchSending && !state.audioSending && !hasAnyText && !hasAttachment;
  const sendIcon = state.audioSending
    ? 'loading'
    : (state.audioRecording
      ? 'stop'
      : (state.editingMessage?.messageId
        ? 'save'
        : ((hasSendableText || hasAttachment) ? 'send' : 'mic')));
  const modeConfig = activeSendModeConfig();
  const sendActionLabel = state.audioRecording
    ? 'Detener y enviar audio'
    : (sendIcon === 'mic'
      ? 'Grabar audio'
      : (state.editingMessage?.messageId
        ? 'Guardar edición'
        : (modeConfig.id === 'schedule' ? 'Programar mensaje' : (modeConfig.id === 'silent' ? 'Enviar sin notificación' : 'Enviar mensaje'))));
  els.btnSend.innerHTML = renderSendActionIcon(sendIcon);
  els.btnSend.classList.toggle('ce-send-circle--mic', sendIcon === 'mic');
  els.btnSend.classList.toggle('ce-send-circle--send', sendIcon === 'send');
  els.btnSend.classList.toggle('ce-send-circle--recording', sendIcon === 'stop');
  els.btnSend.classList.toggle('ce-send-circle--busy', sendIcon === 'loading');
  els.btnSend.classList.toggle('ce-send-circle--waiting-text', sendIcon === 'waitingText');
  els.btnSend.setAttribute('title', sendActionLabel);
  els.btnSend.setAttribute('aria-label', sendActionLabel);
  els.btnSend.disabled = !hasChat || blocked || state.attachmentUploading || state.attachmentBatchSending || state.audioSending || (!state.editingMessage?.messageId && !hasText && !hasAttachment && !canRecordAudio && !state.audioRecording);
  if (els.btnAttachFile) els.btnAttachFile.disabled = !hasChat || blocked || Boolean(state.editingMessage?.messageId) || state.attachmentUploading || state.attachmentBatchSending || state.audioRecording || state.audioSending;
  if (els.btnQuickReplies) els.btnQuickReplies.disabled = !hasChat || blocked || state.audioRecording || state.audioSending;
  if (els.iconInsertPickerPanel && state.audioRecording) {
    state.iconInsertPanelOpen = false;
  }
  if (els.btnIconInsertPicker) {
    const iconInsertDisabled = !hasChat || blocked || Boolean(state.editingMessage?.messageId) || state.audioRecording || state.audioSending;
    els.btnIconInsertPicker.disabled = iconInsertDisabled;
    els.btnIconInsertPicker.setAttribute('title', blocked ? 'Emojis no disponibles con contacto bloqueado' : 'Insertar emoji');
    els.btnIconInsertPicker.setAttribute('aria-label', blocked ? 'Emojis no disponibles con contacto bloqueado' : 'Insertar emoji');
    if (iconInsertDisabled && state.iconInsertPanelOpen) state.iconInsertPanelOpen = false;
  }
  if (els.btnSmartReplySuggestions) {
    const smartReplyCount = buildSmartReplySuggestions().length;
    els.btnSmartReplySuggestions.disabled = !hasChat || blocked || Boolean(state.editingMessage?.messageId) || !smartReplyCount || state.audioRecording || state.audioSending;
    const label = smartReplyCount ? `Sugerir ${smartReplyCount} respuestas inteligentes locales` : 'Sugerencias inteligentes no disponibles todavía';
    els.btnSmartReplySuggestions.setAttribute('title', label);
    els.btnSmartReplySuggestions.setAttribute('aria-label', label);
  }
  if (els.btnScheduleMessage) {
    els.btnScheduleMessage.disabled = !hasChat || blocked || !hasText || Boolean(state.editingMessage?.messageId) || state.schedulingMessage || state.audioRecording || state.audioSending;
  }
  if (els.btnCreatePoll) {
    els.btnCreatePoll.disabled = !hasChat || blocked || Boolean(state.editingMessage?.messageId) || state.pollCreating || state.audioRecording || state.audioSending;
  }
  renderVoiceDictationControl();
  if (els.btnSilentSend) {
    els.btnSilentSend.disabled = !hasChat || blocked || (!hasText && !hasAttachment) || Boolean(state.editingMessage?.messageId) || state.attachmentUploading || state.audioRecording || state.audioSending;
  }
  if (els.btnSendModePrefix) {
    els.btnSendModePrefix.disabled = !hasChat || blocked || Boolean(state.editingMessage?.messageId) || state.audioRecording || state.audioSending;
  }
  if (els.messageTtlSelect) {
    els.messageTtlSelect.disabled = !hasChat || blocked || Boolean(state.editingMessage?.messageId) || state.audioRecording || state.audioSending;
    els.messageTtlSelect.setAttribute('aria-label', `Expiración del mensaje después de lectura: ${formatEphemeralOption(selectedEphemeralSeconds())}`);
  }
  if (els.btnCycleTtl) {
    const ttl = selectedEphemeralSeconds();
    els.btnCycleTtl.disabled = !hasChat || blocked || Boolean(state.editingMessage?.messageId) || state.audioRecording || state.audioSending;
    const compactTtlLabel = formatEphemeralCompactOption(ttl);
    els.btnCycleTtl.innerHTML = ttl ? `${uiIcon('timer')}<span>${escapeHtml(compactTtlLabel)}</span>` : uiIcon('timer');
    els.btnCycleTtl.setAttribute('title', ttl ? `Expira ${formatEphemeralOption(ttl)} después de lectura` : 'Sin expiración. Pulsa para cambiar.');
    els.btnCycleTtl.setAttribute('aria-label', ttl ? `Expira ${formatEphemeralOption(ttl)} después de lectura` : 'Sin expiración. Pulsa para cambiar.');
  }
  updateSendModeMenu();
  if (!hasChat) {
    state.quickRepliesOpen = false;
    state.slashCommandsOpen = false;
    state.iconInsertPanelOpen = false;
    state.sendModeMenuOpen = false;
    renderQuickRepliesPanel();
  }
  renderIconInsertPickerPanel();
  renderSlashCommandsPanel();
}


function isKnownEmojiInsert(value = '') {
  const clean = String(value || '').trim();
  if (!clean) return false;
  return iconInsertCategories.some((category) => Array.isArray(category.emojis) && category.emojis.includes(clean));
}

function readRecentIconInserts() {
  const readList = (key) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed)
        ? parsed.map((emoji) => String(emoji || '').trim()).filter((emoji) => emoji && isKnownEmojiInsert(emoji)).slice(0, iconInsertMaxRecent)
        : [];
    } catch {
      return [];
    }
  };
  return [...new Set([...readList(iconInsertStorageKey), ...readList(iconInsertLegacyStorageKey)])].slice(0, iconInsertMaxRecent);
}

function writeRecentIconInserts(items = []) {
  const clean = [...new Set((Array.isArray(items) ? items : [])
    .map((emoji) => String(emoji || '').trim())
    .filter((emoji) => emoji && isKnownEmojiInsert(emoji)))].slice(0, iconInsertMaxRecent);
  try { localStorage.setItem(iconInsertStorageKey, JSON.stringify(clean)); } catch {}
  return clean;
}

function recordRecentIconInsert(emoji = '') {
  const clean = String(emoji || '').trim();
  if (!clean || !isKnownEmojiInsert(clean)) return [];
  return writeRecentIconInserts([clean, ...readRecentIconInserts().filter((item) => item !== clean)]);
}

function getIconInsertPickerCategories() {
  const recents = readRecentIconInserts();
  return iconInsertCategories.map((category) => category.id === 'recientes'
    ? { ...category, emojis: recents.length ? recents : ['👍', '❤️', '😂', '🙏', '🔥', '✅'] }
    : category);
}

function normalizeIconInsertCategory(categoryId = '') {
  const clean = String(categoryId || '').trim();
  const categories = getIconInsertPickerCategories();
  return categories.some((category) => category.id === clean) ? clean : 'recientes';
}

function syncIconInsertKeyboardClasses(isOpen = false) {
  const open = Boolean(isOpen);
  els.messageForm?.classList.toggle('ce-compose--emoji-keyboard', open);
  document.body?.classList.toggle('ce-emoji-keyboard-open', open);
  scheduleScrollBottomButtonUpdate();
}

function ensureIconInsertPickerKeyboardPlacement() {
  if (!els.messageForm || !els.iconInsertPickerPanel) return;
  const topRow = els.messageForm.querySelector('.ce-compose__top');
  const bottomRow = els.messageForm.querySelector('.ce-compose__bottom');
  const mobileLayout = isMobileChatListPrimaryViewport();

  if (!mobileLayout && topRow) {
    if (els.iconInsertPickerPanel.nextElementSibling !== topRow) {
      els.messageForm.insertBefore(els.iconInsertPickerPanel, topRow);
    }
  } else if (bottomRow) {
    if (els.iconInsertPickerPanel.previousElementSibling !== bottomRow) {
      bottomRow.insertAdjacentElement('afterend', els.iconInsertPickerPanel);
    }
  } else if (els.iconInsertPickerPanel.parentElement !== els.messageForm) {
    els.messageForm.appendChild(els.iconInsertPickerPanel);
  }
  els.iconInsertPickerPanel.classList.add('ce-icon-insert-panel--keyboard');
}

function renderIconInsertPickerPanel() {
  if (!els.iconInsertPickerPanel) return;
  ensureIconInsertPickerKeyboardPlacement();
  const hasChat = Boolean(state.activeChatId);
  const blocked = isChatInteractionBlocked();
  const canUse = hasChat && !blocked && !state.editingMessage?.messageId;
  const keyboardOpen = Boolean(state.iconInsertPanelOpen && canUse);
  syncIconInsertKeyboardClasses(keyboardOpen);
  els.btnIconInsertPicker?.classList.toggle('active', keyboardOpen);
  els.btnIconInsertPicker?.setAttribute('aria-expanded', keyboardOpen ? 'true' : 'false');
  if (!keyboardOpen) {
    els.iconInsertPickerPanel.classList.add('hidden');
    els.iconInsertPickerPanel.innerHTML = '';
    return;
  }
  const categories = getIconInsertPickerCategories();
  const activeCategoryId = normalizeIconInsertCategory(state.iconInsertCategory);
  state.iconInsertCategory = activeCategoryId;
  const activeCategory = categories.find((category) => category.id === activeCategoryId) || categories[0];
  els.iconInsertPickerPanel.classList.remove('hidden');
  els.iconInsertPickerPanel.innerHTML = `
    <div class="ce-icon-insert-tabs" role="tablist" aria-label="Categorías de emojis">
      ${categories.map((category) => `<button class="ce-icon-insert-tab${category.id === activeCategoryId ? ' active' : ''}" type="button" role="tab" title="${escapeHtml(category.title)}" aria-label="${escapeHtml(category.title)}" aria-selected="${category.id === activeCategoryId ? 'true' : 'false'}" data-icon-insert-category="${escapeHtml(category.id)}">${escapeHtml(category.icon)}</button>`).join('')}
    </div>
    <div class="ce-icon-insert-tabs-label" aria-live="polite"><strong>${escapeHtml(activeCategory.icon || '')}</strong><span>${escapeHtml(activeCategory.title)}</span></div>
    <div class="ce-icon-insert-grid" role="list" aria-label="${escapeHtml(activeCategory.title)}">
      ${(activeCategory.emojis || []).map((emoji) => `<button class="ce-icon-insert-item" type="button" role="listitem" data-insert-icon-insert="${escapeHtml(emoji)}" title="Insertar ${escapeHtml(emoji)}" aria-label="Insertar ${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>`).join('')}
    </div>`;
}

function closeIconInsertPicker() {
  state.iconInsertPanelOpen = false;
  renderIconInsertPickerPanel();
}

function toggleIconInsertPicker() {
  if (isChatInteractionBlocked()) {
    showTemporaryDraftStatus(chatBlockNoticeText(), 4200);
    return;
  }
  if (!state.activeChatId || state.editingMessage?.messageId) return;
  state.iconInsertPanelOpen = !state.iconInsertPanelOpen;
  if (state.iconInsertPanelOpen) {
    state.quickRepliesOpen = false;
    state.slashCommandsOpen = false;
    state.sendModeMenuOpen = false;
    state.attachmentPickerOpen = false;
    state.attachmentPickerView = 'options';
    renderAttachmentPicker();
    if (state.scheduleModalOpen) closeScheduleModal();
    if (state.pollModalOpen) closePollModal();
    els.messageInput?.blur();
    renderQuickRepliesPanel();
    renderSlashCommandsPanel();
    updateSendModeMenu();
  }
  renderIconInsertPickerPanel();
}

function insertIconInsertIntoComposer(emoji = '') {
  const clean = String(emoji || '').trim();
  if (!clean || !els.messageInput) return;
  if (isChatInteractionBlocked()) {
    showTemporaryDraftStatus(chatBlockNoticeText(), 4200);
    return;
  }
  const current = String(els.messageInput.value || '');
  const shouldPreserveEmojiKeyboard = Boolean(state.iconInsertPanelOpen);
  const inputIsActive = document.activeElement === els.messageInput;
  const start = inputIsActive && Number.isFinite(els.messageInput.selectionStart) ? els.messageInput.selectionStart : current.length;
  const end = inputIsActive && Number.isFinite(els.messageInput.selectionEnd) ? els.messageInput.selectionEnd : start;
  const before = current.slice(0, start);
  const after = current.slice(end);
  const needsSpaceBefore = before && !/\s$/.test(before);
  const needsSpaceAfter = after && !/^\s/.test(after);
  const insertion = `${needsSpaceBefore ? ' ' : ''}${clean}${needsSpaceAfter ? ' ' : ''}`;
  els.messageInput.value = `${before}${insertion}${after}`.trimStart();
  const nextCursor = Math.max(0, before.length + insertion.length);
  if (!shouldPreserveEmojiKeyboard) {
    els.messageInput.focus();
    try { els.messageInput.setSelectionRange(nextCursor, nextCursor); } catch {}
  } else {
    if (inputIsActive) {
      try { els.messageInput.setSelectionRange(nextCursor, nextCursor); } catch {}
    }
    els.messageInput.blur();
  }
  recordRecentIconInsert(clean);
  scheduleActiveDraftSave();
  updateComposerControls();
  if (state.scheduleModalOpen) renderScheduleModal();
  if (state.quickRepliesOpen) renderQuickRepliesPanel();
  sendTyping(true);
  renderIconInsertPickerPanel();
}

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function isVoiceDictationSupported() {
  return Boolean(getSpeechRecognitionConstructor());
}

function voiceDictationLabel() {
  if (!isVoiceDictationSupported()) return 'Dictado por voz no disponible en este navegador';
  if (state.voiceDictating) return 'Detener dictado por voz';
  return 'Dictar mensaje por voz';
}

function renderVoiceDictationControl() {
  if (!els.btnVoiceDictation) return;
  const supported = isVoiceDictationSupported();
  const blocked = isChatInteractionBlocked();
  const disabled = !supported || !state.activeChatId || Boolean(state.editingMessage?.messageId) || blocked || state.audioRecording || state.audioSending;
  const label = blocked ? 'Dictado por voz no disponible con contacto bloqueado' : voiceDictationLabel();
  els.btnVoiceDictation.disabled = disabled;
  els.btnVoiceDictation.classList.toggle('active', Boolean(state.voiceDictating));
  els.btnVoiceDictation.setAttribute('aria-pressed', state.voiceDictating ? 'true' : 'false');
  els.btnVoiceDictation.setAttribute('title', label);
  els.btnVoiceDictation.setAttribute('aria-label', label);
}

function appendVoiceDictationText(text = '') {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean || !els.messageInput) return;
  const current = String(els.messageInput.value || '');
  const needsSpace = current && !/\s$/.test(current);
  els.messageInput.value = `${current}${needsSpace ? ' ' : ''}${clean}`.trimStart();
  els.messageInput.focus();
  try { els.messageInput.setSelectionRange(els.messageInput.value.length, els.messageInput.value.length); } catch {}
  scheduleActiveDraftSave();
  updateComposerControls();
  if (state.scheduleModalOpen) renderScheduleModal();
  if (state.quickRepliesOpen) renderQuickRepliesPanel();
  sendTyping(true);
}

function stopVoiceDictation({ announce = true } = {}) {
  state.voiceStopRequested = true;
  if (state.voiceRecognition) {
    try { state.voiceRecognition.stop(); } catch {}
  }
  state.voiceRecognition = null;
  state.voiceDictating = false;
  renderVoiceDictationControl();
  if (announce) showTemporaryDraftStatus('Dictado por voz detenido.');
}

function startVoiceDictation() {
  if (!state.activeChatId) return;
  if (isChatInteractionBlocked()) {
    showTemporaryDraftStatus(chatBlockNoticeText(), 4200);
    return;
  }
  if (state.editingMessage?.messageId) {
    showTemporaryDraftStatus('Termina o cancela la edición antes de dictar un mensaje.', 3600);
    return;
  }
  const Recognition = getSpeechRecognitionConstructor();
  if (!Recognition) {
    showTemporaryDraftStatus('Este navegador no permite dictado por voz desde la web. Puedes escribir el mensaje manualmente.', 5200);
    renderVoiceDictationControl();
    return;
  }
  stopVoiceDictation({ announce: false });
  const recognition = new Recognition();
  state.voiceRecognition = recognition;
  state.voiceDictating = true;
  state.voiceStopRequested = false;
  recognition.lang = /^es/i.test(navigator.language || '') ? navigator.language : 'es-CO';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = String(result?.[0]?.transcript || '').trim();
      if (!transcript) continue;
      if (result.isFinal) finalText += `${transcript} `;
      else interimText += `${transcript} `;
    }
    if (finalText.trim()) appendVoiceDictationText(finalText);
    if (interimText.trim()) showTemporaryDraftStatus(`Escuchando: ${compactText(interimText, 90)}`, 1600);
  };
  recognition.onerror = (event) => {
    const code = String(event?.error || '').trim();
    const messages = {
      'not-allowed': 'Permiso de micrófono denegado. Actívalo en el navegador para dictar mensajes.',
      'service-not-allowed': 'El navegador bloqueó el servicio de dictado por voz.',
      'no-speech': 'No detecté voz. Pulsa el micrófono para intentar de nuevo.',
      'audio-capture': 'No encontré un micrófono disponible para dictar.'
    };
    state.voiceStopRequested = true;
    state.voiceDictating = false;
    state.voiceRecognition = null;
    renderVoiceDictationControl();
    showTemporaryDraftStatus(messages[code] || 'No se pudo continuar el dictado por voz.', 5200);
  };
  recognition.onend = () => {
    const requested = state.voiceStopRequested;
    state.voiceRecognition = null;
    state.voiceDictating = false;
    state.voiceStopRequested = false;
    renderVoiceDictationControl();
    if (!requested) showTemporaryDraftStatus('Dictado por voz finalizado. Puedes tocar el micrófono para continuar.', 3600);
  };
  try {
    recognition.start();
    renderVoiceDictationControl();
    showTemporaryDraftStatus('Dictado por voz activo. Habla y el texto aparecerá en el compositor.', 4200);
  } catch {
    state.voiceRecognition = null;
    state.voiceDictating = false;
    renderVoiceDictationControl();
    showTemporaryDraftStatus('No se pudo iniciar el dictado por voz en este momento.', 4200);
  }
}

function toggleVoiceDictation() {
  if (state.voiceDictating) stopVoiceDictation();
  else {
    try { ensureChatInteractionAllowed(); } catch { return; }
    startVoiceDictation();
  }
}

function closeQuickRepliesPanel() {
  state.quickRepliesOpen = false;
  renderQuickRepliesPanel();
}

function getSmartReplySourceMessage() {
  const list = (state.messagesByChat.get(state.activeChatId) || [])
    .filter((message) => !isDeletedMessage(message) && String(message.text || '').trim());
  if (!list.length) return null;
  return [...list].reverse().find((message) => message.senderUserId !== state.user?.userId) || list[list.length - 1] || null;
}

function uniqueSmartReplies(items = []) {
  const used = new Set();
  const replies = [];
  for (const item of items) {
    const clean = compactText(String(item || '').replace(/\s+/g, ' ').trim(), 160);
    if (!clean || clean.length < 2) continue;
    const key = normalizeClientSearchText(clean).replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || used.has(key)) continue;
    used.add(key);
    replies.push(clean);
    if (replies.length >= smartReplySuggestionLimit) break;
  }
  return replies;
}

function buildSmartReplySuggestions() {
  if (!state.activeChatId || state.editingMessage?.messageId) return [];
  const source = getSmartReplySourceMessage();
  if (!source?.text) return [];
  const normalized = normalizeClientSearchText(source.text || '').replace(/[\u0300-\u036f]/g, '');
  const suggestions = [];
  const add = (...items) => suggestions.push(...items);

  if (/\b(gracias|agradezco|mil gracias|thanks|thank you)\b/.test(normalized)) {
    add('Con gusto. Quedo atento.', 'Gracias a ti.', 'Perfecto, seguimos atentos.');
  }
  if (/\b(hora|horario|reunion|reunir|agenda|agendar|cita|mañana|manana|tarde|noche|hoy|fecha|cuando)\b/.test(normalized)) {
    add('Sí, me funciona ese horario.', 'Déjame revisar agenda y te confirmo.', '¿Qué hora te queda mejor?');
  }
  if (/\b(cotizacion|cotizar|precio|costo|valor|propuesta|presupuesto|pago|factura|cliente)\b/.test(normalized)) {
    add('Déjame validar el alcance y te confirmo.', 'Te envío la propuesta revisada.', 'Perfecto, reviso los detalles comerciales.');
  }
  if (/\b(urgente|prioridad|rapido|rápido|importante|hoy|ya|inmediato)\b/.test(normalized)) {
    add('Lo reviso con prioridad.', 'Dame un momento y te respondo.', 'Entendido, lo atiendo primero.');
  }
  if (/\?/.test(source.text || '') || /\b(que|qué|cual|cuál|puedes|podemos|confirmas|revisas|tienes|hay|como|cómo|cuando|cuándo|donde|dónde)\b/.test(normalized)) {
    add('Sí, claro.', 'Lo reviso y te confirmo.', '¿Me compartes un poco más de detalle?');
  }
  if (/\b(listo|ok|okay|vale|perfecto|confirmado|aprobado|de acuerdo)\b/.test(normalized)) {
    add('Perfecto, avanzamos así.', 'Confirmado, muchas gracias.', 'Listo, quedo atento.');
  }
  if (/\b(enviar|mandar|revisar|aprobar|pendiente|tarea|seguimiento|recordar)\b/.test(normalized)) {
    add('Lo dejo en seguimiento.', 'Lo reviso y te aviso.', 'Gracias, lo tengo presente.');
  }

  add('Gracias, lo reviso y te confirmo.', 'De acuerdo.', 'Perfecto, quedo atento.', '¿Me compartes más contexto?');
  return uniqueSmartReplies(suggestions);
}

function insertSmartReplyText(text = '') {
  if (isChatInteractionBlocked()) {
    showTemporaryDraftStatus(chatBlockNoticeText(), 4200);
    return;
  }
  const clean = String(text || '').trim();
  if (!clean || !els.messageInput) return;
  const current = els.messageInput.value.trim();
  els.messageInput.value = current ? `${current} ${clean}` : clean;
  els.messageInput.focus();
  try { els.messageInput.setSelectionRange(els.messageInput.value.length, els.messageInput.value.length); } catch {}
  scheduleActiveDraftSave();
  updateComposerControls();
  if (state.scheduleModalOpen) renderScheduleModal();
  closeQuickRepliesPanel();
  showTemporaryDraftStatus('Sugerencia insertada. Puedes editarla antes de enviar.');
}

function insertSmartReplyByIndex(index = 0) {
  const suggestions = buildSmartReplySuggestions();
  const target = suggestions[Math.max(0, Number(index || 0))];
  insertSmartReplyText(target || '');
}

function openSmartReplySuggestions() {
  if (state.iconInsertPanelOpen) closeIconInsertPicker();
  if (!state.activeChatId) return;
  if (isChatInteractionBlocked()) {
    showTemporaryDraftStatus(chatBlockNoticeText(), 4200);
    return;
  }
  if (state.editingMessage?.messageId) {
    showTemporaryDraftStatus('Termina o cancela la edición antes de insertar una sugerencia.', 3600);
    return;
  }
  const suggestions = buildSmartReplySuggestions();
  if (!suggestions.length) {
    showTemporaryDraftStatus('Todavía no hay suficientes mensajes para sugerir una respuesta.', 3600);
    return;
  }
  state.quickRepliesOpen = true;
  renderQuickRepliesPanel();
}

function renderQuickRepliesPanel() {
  if (!els.quickRepliesPanel) return;
  els.btnQuickReplies?.classList.toggle('active', Boolean(state.quickRepliesOpen));
  els.btnSmartReplySuggestions?.classList.toggle('active', Boolean(state.quickRepliesOpen && buildSmartReplySuggestions().length));
  if (!state.quickRepliesOpen || !state.activeChatId) {
    els.quickRepliesPanel.classList.add('hidden');
    els.quickRepliesPanel.innerHTML = '';
    return;
  }
  els.quickRepliesPanel.classList.remove('hidden');
  const composerText = String(els.messageInput?.value || '').trim();
  if (state.quickRepliesLoading) {
    els.quickRepliesPanel.innerHTML = '<div class="ce-quick-replies__empty">Cargando respuestas rápidas...</div>';
    return;
  }
  const replies = Array.isArray(state.quickReplies) ? state.quickReplies : [];
  const smartSuggestions = buildSmartReplySuggestions();
  const smartHtml = smartSuggestions.length ? `
    <div class="ce-smart-replies" aria-label="Sugerencias inteligentes locales">
      <div class="ce-smart-replies__title"><strong>${uiIcon('spark')}<span>Sugerencias inteligentes</span></strong><span>Generadas en este dispositivo desde el último mensaje relevante.</span></div>
      <div class="ce-smart-replies__list">${smartSuggestions.map((suggestion, index) => `<button class="ce-smart-reply" type="button" data-smart-reply-index="${index}">${escapeHtml(suggestion)}</button>`).join('')}</div>
    </div>` : '';
  const saveDisabled = composerText ? '' : ' disabled';
  const items = replies.length ? replies.map((reply) => `
    <div class="ce-quick-reply" data-quick-reply-row="${escapeHtml(reply.replyId || '')}">
      <button class="ce-quick-reply__insert" type="button" data-quick-reply-insert="${escapeHtml(reply.replyId || '')}" aria-label="Insertar respuesta rápida">
        <strong>${escapeHtml(reply.title || 'Respuesta rápida')}</strong>
        <span>${escapeHtml(compactText(reply.text || '', 150))}</span>
      </button>
      <button class="ce-quick-reply__delete" type="button" data-quick-reply-delete="${escapeHtml(reply.replyId || '')}" title="Eliminar respuesta rápida" aria-label="Eliminar respuesta rápida">${uiIcon('trash')}</button>
    </div>`).join('') : '<div class="ce-quick-replies__empty">Guarda frases frecuentes para responder más rápido en cualquier dispositivo.</div>';
  els.quickRepliesPanel.innerHTML = `
    <div class="ce-quick-replies__head">
      <div><strong>Respuestas rápidas</strong><span>Personales y sincronizadas para tu cuenta</span></div>
      <button class="ce-link" type="button" data-quick-replies-refresh="1">Actualizar</button>
    </div>
    <div class="ce-quick-replies__actions">
      <button class="ce-btn ce-btn--small" type="button" data-quick-reply-save-current="1"${saveDisabled}>Guardar texto actual</button>
      <span>${replies.length}/${40} guardadas</span>
    </div>
    ${smartHtml}
    <div class="ce-quick-replies__list">${items}</div>`;
}

async function loadQuickReplies({ force = false } = {}) {
  if (!state.user) return;
  if (state.quickRepliesLoading) return;
  if (state.quickRepliesLoaded && !force) {
    renderQuickRepliesPanel();
    return;
  }
  state.quickRepliesLoading = true;
  renderQuickRepliesPanel();
  try {
    const data = await post('/api/quick-replies/list', {});
    state.quickReplies = Array.isArray(data.quickReplies) ? data.quickReplies : [];
    state.quickRepliesLoaded = true;
  } finally {
    state.quickRepliesLoading = false;
    renderQuickRepliesPanel();
  }
}

function insertQuickReplyText(replyId = '') {
  const reply = state.quickReplies.find((item) => item.replyId === replyId);
  if (!reply?.text || !els.messageInput) return;
  const current = els.messageInput.value.trim();
  els.messageInput.value = current ? `${current} ${reply.text}` : reply.text;
  els.messageInput.focus();
  try { els.messageInput.setSelectionRange(els.messageInput.value.length, els.messageInput.value.length); } catch {}
  scheduleActiveDraftSave();
  updateComposerControls();
  closeQuickRepliesPanel();
}

function applyQuickReplyUpsert(reply = null) {
  if (!reply?.replyId || !reply?.text) return;
  state.quickReplies = [reply, ...(Array.isArray(state.quickReplies) ? state.quickReplies : []).filter((item) => item?.replyId !== reply.replyId)]
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 40);
}

async function saveCurrentTextAsQuickReply() {
  const text = String(els.messageInput?.value || '').trim();
  if (!text) {
    showTemporaryDraftStatus('Escribe una frase antes de guardarla como respuesta rápida.');
    return;
  }
  const data = await post('/api/quick-replies/save', { text, compactResponse: true });
  if (Array.isArray(data.quickReplies)) state.quickReplies = data.quickReplies;
  else applyQuickReplyUpsert(data.quickReply || null);
  state.quickRepliesLoaded = true;
  showTemporaryDraftStatus('Respuesta rápida guardada para tu cuenta.');
  renderQuickRepliesPanel();
}

async function deleteQuickReply(replyId = '') {
  if (!replyId) return;
  const ok = window.confirm('¿Eliminar esta respuesta rápida?');
  if (!ok) return;
  const data = await post('/api/quick-replies/delete', { replyId, compactResponse: true });
  state.quickReplies = Array.isArray(data.quickReplies) ? data.quickReplies : state.quickReplies.filter((item) => item.replyId !== replyId);
  state.quickRepliesLoaded = true;
  showTemporaryDraftStatus('Respuesta rápida eliminada.');
  renderQuickRepliesPanel();
}

function privateNoteCounter() {
  return `${Array.isArray(state.privateNotes) ? state.privateNotes.length : 0}/80 notas`;
}

function sortPrivateNotesState() {
  state.privateNotes = (Array.isArray(state.privateNotes) ? state.privateNotes : [])
    .filter((note) => note?.noteId)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 80);
}

function applyPrivateNoteUpsert(note = null) {
  if (!note?.noteId) return false;
  const index = state.privateNotes.findIndex((item) => item.noteId === note.noteId);
  if (index >= 0) state.privateNotes[index] = { ...state.privateNotes[index], ...note };
  else state.privateNotes.unshift(note);
  sortPrivateNotesState();
  return true;
}

function applyPrivateNoteDelete(noteId = '') {
  const cleanNoteId = String(noteId || '').trim();
  if (!cleanNoteId) return false;
  const previousLength = state.privateNotes.length;
  state.privateNotes = state.privateNotes.filter((item) => item.noteId !== cleanNoteId);
  return state.privateNotes.length !== previousLength;
}

function resetPrivateNoteEditor() {
  state.privateNoteEditingId = '';
  if (els.privateNotesTextarea) els.privateNotesTextarea.value = '';
  if (els.btnSavePrivateNote) els.btnSavePrivateNote.textContent = 'Guardar nota';
  els.btnCancelPrivateNoteEdit?.classList.add('hidden');
}

function closePrivateNotesModal() {
  state.privateNotesOpen = false;
  resetPrivateNoteEditor();
  renderPrivateNotesModal();
}

function renderPrivateNotesModal() {
  if (!els.privateNotesModal || !els.privateNotesList) return;
  els.privateNotesModal.classList.toggle('hidden', !state.privateNotesOpen);
  if (!state.privateNotesOpen) return;
  const chat = activeChat();
  const title = chat ? chatDisplayName(chat) : 'Chat';
  if (els.privateNotesTitle) els.privateNotesTitle.textContent = 'Notas privadas del chat';
  if (els.privateNotesChatName) els.privateNotesChatName.textContent = `${title} · visibles solo para ti · ${privateNoteCounter()}`;
  if (els.btnSavePrivateNote) {
    els.btnSavePrivateNote.disabled = Boolean(state.privateNoteSaving || state.privateNotesLoading || !state.activeChatId);
    els.btnSavePrivateNote.textContent = state.privateNoteEditingId ? 'Actualizar nota' : 'Guardar nota';
  }
  if (els.btnCancelPrivateNoteEdit) els.btnCancelPrivateNoteEdit.classList.toggle('hidden', !state.privateNoteEditingId);
  if (state.privateNotesLoading) {
    els.privateNotesList.innerHTML = '<div class="ce-private-notes-empty">Cargando notas privadas...</div>';
    return;
  }
  const notes = Array.isArray(state.privateNotes) ? state.privateNotes : [];
  if (!notes.length) {
    els.privateNotesList.innerHTML = '<div class="ce-private-notes-empty">Agrega recordatorios, contexto del cliente, pendientes o datos importantes de esta conversación. Nadie más los verá.</div>';
    return;
  }
  els.privateNotesList.innerHTML = notes.map((note) => `
    <article class="ce-private-note" data-private-note-id="${escapeHtml(note.noteId || '')}">
      <div class="ce-private-note__body">${escapeHtml(note.text || '').replace(/\n/g, '<br>')}</div>
      <div class="ce-private-note__meta">
        <span>${escapeHtml(formatPrivateNoteDateTime(note.updatedAt || note.createdAt))}</span>
        <div>
          <button class="ce-link" type="button" data-edit-private-note="${escapeHtml(note.noteId || '')}">Editar</button>
          <button class="ce-link ce-link--danger" type="button" data-delete-private-note="${escapeHtml(note.noteId || '')}">Eliminar</button>
        </div>
      </div>
    </article>`).join('');
}

async function loadPrivateNotes({ force = false } = {}) {
  if (!state.activeChatId || state.privateNotesLoading) return;
  const requestedChatId = state.activeChatId;
  if (!force && state.privateNotesLoadedChatId === requestedChatId) {
    renderPrivateNotesModal();
    return;
  }
  state.privateNotesLoading = true;
  renderPrivateNotesModal();
  try {
    const data = await post('/api/chats/private-notes/list', { chatId: requestedChatId });
    if (state.activeChatId !== requestedChatId) return;
    state.privateNotes = Array.isArray(data.notes) ? data.notes : [];
    state.privateNotesLoadedChatId = requestedChatId;
  } finally {
    state.privateNotesLoading = false;
    renderPrivateNotesModal();
  }
}

async function openPrivateNotesModal() {
  if (!state.activeChatId) return;
  const requestedChatId = state.activeChatId;
  state.privateNotesOpen = true;
  if (state.privateNotesLoadedChatId !== requestedChatId) state.privateNotes = [];
  resetPrivateNoteEditor();
  renderPrivateNotesModal();
  await loadPrivateNotes();
  window.setTimeout(() => els.privateNotesTextarea?.focus(), 0);
}

function startEditPrivateNote(noteId = '') {
  const note = state.privateNotes.find((item) => item.noteId === noteId);
  if (!note) return;
  state.privateNoteEditingId = note.noteId;
  if (els.privateNotesTextarea) {
    els.privateNotesTextarea.value = note.text || '';
    els.privateNotesTextarea.focus();
    try { els.privateNotesTextarea.setSelectionRange(els.privateNotesTextarea.value.length, els.privateNotesTextarea.value.length); } catch {}
  }
  renderPrivateNotesModal();
}

async function savePrivateNoteFromModal() {
  const text = String(els.privateNotesTextarea?.value || '').trim();
  if (!state.activeChatId || !text) {
    showTemporaryDraftStatus('Escribe una nota privada antes de guardarla.');
    return;
  }
  const wasEditing = Boolean(state.privateNoteEditingId);
  state.privateNoteSaving = true;
  renderPrivateNotesModal();
  try {
    const data = await post('/api/chats/private-notes/save', {
      chatId: state.activeChatId,
      noteId: state.privateNoteEditingId || '',
      text,
      compactResponse: true
    });
    applyPrivateNoteUpsert(data.note);
    state.privateNotesLoadedChatId = state.activeChatId;
    resetPrivateNoteEditor();
    showTemporaryDraftStatus(wasEditing ? 'Nota privada actualizada.' : 'Nota privada guardada para este chat.');
  } finally {
    state.privateNoteSaving = false;
    renderPrivateNotesModal();
  }
}

async function deletePrivateNote(noteId = '') {
  if (!noteId || !state.activeChatId) return;
  const ok = window.confirm('¿Eliminar esta nota privada? Solo se elimina de tu cuenta.');
  if (!ok) return;
  const data = await post('/api/chats/private-notes/delete', { chatId: state.activeChatId, noteId, compactResponse: true });
  applyPrivateNoteDelete(data.noteId || noteId);
  state.privateNotesLoadedChatId = state.activeChatId;
  if (state.privateNoteEditingId === noteId) resetPrivateNoteEditor();
  showTemporaryDraftStatus('Nota privada eliminada.');
  renderPrivateNotesModal();
}


function reminderCounter() {
  const active = (Array.isArray(state.reminders) ? state.reminders : []).filter((item) => item.status === 'scheduled' || item.status === 'due');
  return `${active.length}/120 recordatorios`;
}

function normalizeReminderInputValue() {
  const raw = String(els.reminderDateTime?.value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function defaultReminderText(message = null) {
  if (message?.text) return compactText(message.text, 260);
  const chat = activeChat();
  return chat ? `Revisar chat con ${chatDisplayName(chat)}` : 'Revisar este chat';
}

function setDefaultReminderDateTime() {
  if (!els.reminderDateTime) return;
  const minDate = new Date(Date.now() + 60 * 1000);
  const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
  els.reminderDateTime.min = toDateTimeLocalValue(minDate);
  if (!els.reminderDateTime.value) els.reminderDateTime.value = toDateTimeLocalValue(defaultDate);
}

function closeReminderModal() {
  state.remindersOpen = false;
  state.reminderMessage = null;
  state.reminderDraftText = '';
  renderReminderModal();
}

function renderReminderModal() {
  if (!els.reminderModal || !els.reminderList) return;
  els.reminderModal.classList.toggle('hidden', !state.remindersOpen);
  if (!state.remindersOpen) return;
  const chat = activeChat();
  const title = chat ? chatDisplayName(chat) : 'Chat';
  if (els.reminderTitle) els.reminderTitle.textContent = 'Recordatorios privados';
  if (els.reminderChatName) els.reminderChatName.textContent = `${title} · visibles solo para ti · ${reminderCounter()}`;
  const selected = state.reminderMessage;
  if (els.reminderPreview) {
    els.reminderPreview.innerHTML = selected?.messageId
      ? `<strong>Recordar mensaje</strong><span>${escapeHtml(compactText(selected.text || '', 280))}</span>`
      : '<strong>Recordar este chat</strong><span>Crea un aviso personal para volver a esta conversación cuando lo necesites.</span>';
  }
  if (els.btnSaveReminder) els.btnSaveReminder.disabled = Boolean(state.reminderSaving || state.remindersLoading || !state.activeChatId || !normalizeReminderInputValue());
  if (state.remindersLoading) {
    els.reminderList.innerHTML = '<div class="ce-reminders-empty">Cargando recordatorios...</div>';
    return;
  }
  const reminders = (Array.isArray(state.reminders) ? state.reminders : []).filter((item) => item.status === 'scheduled' || item.status === 'due');
  if (!reminders.length) {
    els.reminderList.innerHTML = '<div class="ce-reminders-empty">No tienes recordatorios activos en este chat.</div>';
    return;
  }
  els.reminderList.innerHTML = reminders.map((item) => {
    const due = item.status === 'due';
    const jump = item.messageId ? `<button class="ce-link" type="button" data-jump-reminder-message-id="${escapeHtml(item.messageId || '')}">Ir al mensaje</button>` : '';
    return `<article class="ce-reminder${due ? ' is-due' : ''}" data-reminder-id="${escapeHtml(item.reminderId || '')}">
      <div class="ce-reminder__body"><strong>${escapeHtml(compactText(item.text || '', 180))}</strong><em>${due ? 'Pendiente ahora' : `Aviso ${escapeHtml(formatReminderDateTime(item.remindFor))}`}</em></div>
      <div class="ce-reminder__actions">${jump}<button class="ce-link" type="button" data-complete-reminder-id="${escapeHtml(item.reminderId || '')}">${due ? 'Completar' : 'Quitar'}</button></div>
    </article>`;
  }).join('');
}

async function loadReminders({ force = false } = {}) {
  if (!state.activeChatId || state.remindersLoading) return;
  if (!force && state.remindersLoadedChatId === state.activeChatId) {
    renderReminderModal();
    return;
  }
  const requestedChatId = state.activeChatId;
  state.remindersLoading = true;
  renderReminderModal();
  try {
    const data = await post('/api/chats/reminders/list', { chatId: requestedChatId, limit: 80 });
    if (state.activeChatId !== requestedChatId) return;
    state.reminders = Array.isArray(data.reminders) ? data.reminders : [];
    state.remindersLoadedChatId = requestedChatId;
  } finally {
    state.remindersLoading = false;
    renderReminderModal();
  }
}

async function openReminderModal(messageId = '') {
  if (!state.activeChatId) return;
  state.remindersOpen = true;
  state.reminderMessage = messageId ? findActiveMessage(messageId) : null;
  state.reminderDraftText = defaultReminderText(state.reminderMessage);
  if (els.reminderText) els.reminderText.value = state.reminderDraftText;
  setDefaultReminderDateTime();
  renderReminderModal();
  await loadReminders();
  window.setTimeout(() => els.reminderDateTime?.focus(), 0);
}

async function openReminderFromChatBrief(messageId = '') {
  if (!state.activeChatId) return;
  const message = findActiveMessage(messageId);
  if (!message?.messageId) throw new Error('No se pudo identificar el pendiente dentro del chat.');
  closeChatBrief();
  state.remindersOpen = true;
  state.reminderMessage = message;
  state.reminderDraftText = `Dar seguimiento: ${compactText(message.text || message.briefText || '', 240)}`;
  if (els.reminderText) els.reminderText.value = state.reminderDraftText;
  if (els.reminderDateTime) els.reminderDateTime.value = '';
  setDefaultReminderDateTime();
  renderReminderModal();
  await loadReminders();
  showTemporaryDraftStatus('Pendiente listo para guardar como recordatorio privado.');
  window.setTimeout(() => els.reminderDateTime?.focus(), 0);
}

async function saveReminderFromModal() {
  if (!state.activeChatId || state.reminderSaving) return;
  const remindAt = normalizeReminderInputValue();
  if (!remindAt) throw new Error('Selecciona una fecha y hora válida.');
  const text = String(els.reminderText?.value || state.reminderDraftText || '').trim() || defaultReminderText(state.reminderMessage);
  state.reminderSaving = true;
  renderReminderModal();
  try {
    const data = await post('/api/chats/reminders/create', {
      chatId: state.activeChatId,
      messageId: state.reminderMessage?.messageId || '',
      text,
      remindAt
    });
    state.reminders = [data.reminder, ...state.reminders.filter((item) => item.reminderId !== data.reminder?.reminderId)].filter(Boolean);
    state.reminders.sort((a, b) => (Date.parse(a.remindFor || '') || 0) - (Date.parse(b.remindFor || '') || 0));
    showTemporaryDraftStatus(`Recordatorio creado para ${formatReminderDateTime(data.reminder?.remindFor)}.`);
    state.reminderMessage = null;
    state.reminderDraftText = defaultReminderText(null);
    if (els.reminderText) els.reminderText.value = state.reminderDraftText;
    if (els.reminderDateTime) els.reminderDateTime.value = '';
    setDefaultReminderDateTime();
  } finally {
    state.reminderSaving = false;
    renderReminderModal();
  }
}

async function completeReminder(reminderId = '') {
  if (!reminderId) return;
  const data = await post('/api/chats/reminders/done', { reminderId });
  state.reminders = state.reminders.filter((item) => item.reminderId !== (data.reminderId || reminderId));
  showTemporaryDraftStatus('Recordatorio completado.');
  renderReminderModal();
}


function focusHighlightedMessage() {
  if (!state.highlightedMessageId) return;
  const target = [...els.messages.querySelectorAll('[data-message-id]')].find((node) => node.dataset.messageId === state.highlightedMessageId);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setStatus(message = '') {
  els.authStatus.textContent = message;
}

function rememberInstalledApp() {
  try { localStorage.setItem(installedStorageKey, '1'); } catch {}
}

function hasStoredInstalledApp() {
  try { return localStorage.getItem(installedStorageKey) === '1'; } catch { return false; }
}

function isStandaloneDisplayMode() {
  const displayModes = ['standalone', 'minimal-ui', 'window-controls-overlay', 'fullscreen'];
  return displayModes.some((mode) => window.matchMedia?.(`(display-mode: ${mode})`)?.matches) || window.navigator.standalone === true;
}

function isInstalled() {
  const standalone = isStandaloneDisplayMode();
  if (standalone) rememberInstalledApp();
  return standalone || hasStoredInstalledApp();
}

function canCheckInstalledRelatedApps() {
  return typeof navigator.getInstalledRelatedApps === 'function';
}

function isInstalledRelatedAppEntry(app = {}) {
  const platform = String(app.platform || '').toLowerCase();
  const url = String(app.url || app.id || '').toLowerCase();
  return platform === 'webapp' || url.includes('/chater/') || url.includes('chater');
}

async function refreshInstalledRelatedAppState() {
  if (isInstalled()) return true;
  if (!canCheckInstalledRelatedApps()) return false;
  const relatedApps = await navigator.getInstalledRelatedApps().catch(() => []);
  const installed = Array.isArray(relatedApps) && relatedApps.some(isInstalledRelatedAppEntry);
  if (installed) rememberInstalledApp();
  return installed;
}

function scheduleInstalledRelatedAppCheck() {
  if (state.installRelatedCheckDone || state.installRelatedCheckInFlight || !canCheckInstalledRelatedApps()) return;
  state.installRelatedCheckInFlight = true;
  refreshInstalledRelatedAppState()
    .then((installed) => {
      state.installRelatedCheckDone = true;
      if (installed) state.installPrompt = null;
    })
    .catch(() => {
      state.installRelatedCheckDone = true;
    })
    .finally(() => {
      state.installRelatedCheckInFlight = false;
      updateInstallBanner();
    });
}

function dismissInstallBanner() {
  state.installDismissed = true;
  try { localStorage.setItem(installDismissedStorageKey, '1'); } catch {}
}

function updateInstallBanner() {
  if (!els.installBanner) return;
  const installed = isInstalled();
  const canVerifyRelatedInstall = canCheckInstalledRelatedApps();
  const shouldVerifyBeforeShowing = Boolean(state.user && state.installPrompt && !state.installDismissed && !installed && canVerifyRelatedInstall && !state.installRelatedCheckDone);
  if (shouldVerifyBeforeShowing || state.installRelatedCheckInFlight) {
    els.installBanner.classList.add('hidden');
    scheduleInstalledRelatedAppCheck();
    return;
  }
  const shouldHide = !state.user || installed || state.installDismissed || !state.installPrompt;
  els.installBanner.classList.toggle('hidden', shouldHide);
}

function hasPushSupport() {
  return Boolean('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
}

function updatePushBanner() {
  if (!els.pushBanner) return;
  const permission = hasPushSupport() ? Notification.permission : 'denied';
  const shouldHide = !state.user || state.pushDismissed || !hasPushSupport() || permission === 'granted' || permission === 'denied' || state.pushState === 'saving';
  els.pushBanner.classList.toggle('hidden', shouldHide);
}

function updateAfterLoginBanners() {
  if (state.user && !isInstalled() && !state.installRelatedCheckDone) {
    scheduleInstalledRelatedAppCheck();
  }
  updateInstallBanner();
  updatePushBanner();
}


function urlBase64ToUint8Array(base64String = '') {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function getAppMode() {
  return isInstalled() ? 'standalone' : 'browser';
}


function requestServiceWorkerDeliveryAckFlush() {
  if (!('serviceWorker' in navigator)) return;
  const message = { type: 'CHAT_ER_FLUSH_DELIVERY_ACKS' };
  navigator.serviceWorker.ready.then((registration) => {
    const targets = [registration?.active, navigator.serviceWorker.controller].filter(Boolean);
    const sent = new Set();
    for (const target of targets) {
      if (sent.has(target)) continue;
      sent.add(target);
      target.postMessage(message);
    }
  }).catch(() => null);
}

async function getReadyServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  if (state.serviceWorkerRegistration) return state.serviceWorkerRegistration;
  state.serviceWorkerRegistration = await navigator.serviceWorker.ready;
  return state.serviceWorkerRegistration;
}

function pushSubscriptionMeta() {
  return {
    clientId: getClientId(),
    platform: navigator.platform || '',
    appMode: getAppMode(),
    language: navigator.language || 'es-CO'
  };
}

async function pushSubscriptionFingerprint(subscription = null, meta = {}) {
  const json = subscription?.toJSON?.() || subscription || {};
  const raw = JSON.stringify({
    userId: String(state.user?.userId || ''),
    clientId: String(meta.clientId || ''),
    endpoint: String(json.endpoint || ''),
    expirationTime: json.expirationTime || null,
    p256dh: String(json.keys?.p256dh || ''),
    auth: String(json.keys?.auth || ''),
    platform: String(meta.platform || ''),
    appMode: String(meta.appMode || ''),
    language: String(meta.language || '')
  });
  try {
    if (crypto?.subtle && typeof TextEncoder !== 'undefined') {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16)}`;
}

function readPushRegistrationCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(pushRegistrationCacheKey) || 'null');
    return cached && typeof cached === 'object' ? cached : null;
  } catch { return null; }
}

function clearPushRegistrationCache() {
  try { localStorage.removeItem(pushRegistrationCacheKey); } catch {}
}

function isPushRegistrationFresh(fingerprint = '') {
  if (!fingerprint || !state.user?.userId) return false;
  const cached = readPushRegistrationCache();
  const registeredAt = Number(cached?.registeredAt || 0);
  return String(cached?.userId || '') === String(state.user.userId)
    && String(cached?.fingerprint || '') === String(fingerprint)
    && registeredAt > 0
    && Date.now() - registeredAt < pushRegistrationRefreshMs;
}

function rememberPushRegistration(fingerprint = '') {
  if (!fingerprint || !state.user?.userId) return false;
  try {
    localStorage.setItem(pushRegistrationCacheKey, JSON.stringify({
      userId: String(state.user.userId),
      fingerprint: String(fingerprint),
      registeredAt: Date.now()
    }));
    return true;
  } catch { return false; }
}

async function registerPushSubscription(subscription = null, { force = false } = {}) {
  if (!subscription?.toJSON) return false;
  const meta = pushSubscriptionMeta();
  const fingerprint = await pushSubscriptionFingerprint(subscription, meta);
  if (!force && isPushRegistrationFresh(fingerprint)) return true;
  await post('/api/push/subscribe', { subscription: subscription.toJSON(), meta });
  rememberPushRegistration(fingerprint);
  return true;
}

function embeddedWebPushConfig() {
  if (!state.config || !Object.prototype.hasOwnProperty.call(state.config, 'webPush')) return null;
  const webPush = state.config.webPush;
  if (!webPush || typeof webPush !== 'object') return null;
  return { enabled: webPush.enabled === true, publicKey: String(webPush.publicKey || '') };
}

async function getWebPushConfig() {
  const embedded = embeddedWebPushConfig();
  if (embedded) return embedded;
  return apiGet('/api/push/public-key');
}

async function enableWebPushNotifications() {
  if (!state.user) return false;
  if (!hasPushSupport()) throw new Error('Este navegador no soporta notificaciones web push.');
  const keyData = await getWebPushConfig();
  if (!keyData.enabled || !keyData.publicKey) throw new Error('El backend todavía no tiene configuradas las claves Web Push.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    state.pushDismissed = true;
    updatePushBanner();
    throw new Error('No se activaron las notificaciones porque el permiso no fue concedido.');
  }
  state.pushState = 'saving';
  updatePushBanner();
  const registration = await getReadyServiceWorkerRegistration();
  if (!registration?.pushManager) throw new Error('No se pudo preparar PushManager.');
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
  });
  await registerPushSubscription(subscription, { force: true });
  state.pushState = 'enabled';
  state.pushDismissed = true;
  updatePushBanner();
  requestServiceWorkerDeliveryAckFlush();
  return true;
}

async function ensureExistingPushSubscriptionRegistered() {
  if (!state.user || !hasPushSupport() || Notification.permission !== 'granted') return false;
  try {
    const registration = await getReadyServiceWorkerRegistration();
    let subscription = await registration?.pushManager?.getSubscription?.();
    if (!subscription) {
      const keyData = await getWebPushConfig();
      if (!keyData.enabled || !keyData.publicKey || !registration?.pushManager) return false;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
      });
    }
    await registerPushSubscription(subscription);
    state.pushState = 'enabled';
    updatePushBanner();
    requestServiceWorkerDeliveryAckFlush();
    return true;
  } catch {
    return false;
  }
}

async function unregisterCurrentPushSubscription() {
  if (!hasPushSupport() || !getSessionToken()) return false;
  try {
    const registration = await getReadyServiceWorkerRegistration();
    const subscription = await registration?.pushManager?.getSubscription?.();
    if (!subscription) return false;
    const endpoint = subscription.endpoint || '';
    await post('/api/push/unsubscribe', { endpoint }).catch(() => null);
    await subscription.unsubscribe().catch(() => null);
    clearPushRegistrationCache();
    state.pushState = 'idle';
    state.pushDismissed = false;
    return true;
  } catch {
    return false;
  }
}

function showAuthenticated() {
  document.body.classList.add('ce-chat-screen-active');
  els.authScreen.classList.add('hidden');
  els.chatScreen.classList.remove('hidden');
  els.userSummary.innerHTML = `${avatar(state.user)}<div><strong>${escapeHtml(state.user.displayName || 'Usuario chatER')}</strong><span>${escapeHtml(state.user.email || '')}</span></div>`;
  renderAll();
  updateAfterLoginBanners();
}

function showGuest() {
  document.body.classList.remove('ce-chat-screen-active');
  els.chatScreen.classList.add('hidden');
  els.authScreen.classList.remove('hidden');
  closeGlobalSearch();
  resetGlobalSearchState();
  closeGlobalStarred();
  state.globalStarredMessages = [];
  state.globalStarredLoading = false;
  state.globalStarredScannedChats = 0;
  state.globalStarredNextCursor = null;
  state.globalStarredHasMore = false;
  state.globalStarredLoaded = false;
  state.globalStarredDirty = true;
  closeCommandPalette();
  state.privacyLock.locked = false;
  state.privacyLock.mode = 'closed';
  renderPrivacyLockOverlay();
  closeRealtime({ releaseLeadership: true });
  stopPresenceRefresh();
  updatePushBanner();
}

async function loadConfig() {
  state.config = await apiGet('/api/config');
  const error = getFirebaseWebConfigError(state.config.firebaseWebConfig || {});
  setStatus(error || 'Listo para iniciar sesión.');
  els.btnGoogleLogin.disabled = Boolean(error);
}

async function loginWithGoogle() {
  try {
    els.btnGoogleLogin.disabled = true;
    setStatus('Abriendo Google...');
    const google = await signInWithGooglePopup(state.config.firebaseWebConfig || {});
    setStatus('Validando sesión...');
    const data = await post('/api/auth/google-login', { idToken: google.idToken });
    clearCachedRealtimeToken();
    setSessionToken(data.sessionToken);
    applyBootstrap(data);
    broadcastRealtime({ type: 'bootstrap-shared', data }, { persistSmall: false });
    showAuthenticated();
    await openRealtime();
    await ensureExistingPushSubscriptionRegistered();
    await consumeAddFromUrl();
    await consumeChatFromUrl();
    scheduleOutboxRetry(1200);
    flushDeliveryAckQueue({ force: true }).catch(() => null);
  } catch (error) {
    setStatus(error.message || 'No se pudo iniciar sesión.');
  } finally {
    els.btnGoogleLogin.disabled = false;
  }
}

function applyBootstrap(data = {}) {
  state.realtimeRetryBlocked = false;
  if (data.clientConfig && typeof data.clientConfig === 'object') {
    state.config = { ok: true, ...(state.config || {}), ...data.clientConfig };
  }
  // Bootstrap inicial o de recuperación redefine la base conocida; la próxima apertura
  // de cada chat puede hacer una única lectura remota de borrador y luego volver a SSE.
  state.draftRemoteLoadedChats.clear();
  state.draftLastSyncedTextByChat.clear();
  state.messageHistoryCoverageByChat.clear();
  state.messageHistoryRequestsByChat.clear();
  state.draftRemoteLastAttemptAtByChat.clear();
  state.user = data.user || null;
  state.globalStarredDirty = true;
  const realtimeCursor = String(data.realtimeCursor || '').trim().slice(0, 180);
  if (realtimeCursor) rememberRealtimeLastEventId(realtimeCursor);
  state.contacts = (Array.isArray(data.contacts) ? data.contacts : []).map((contact) => ({
    ...contact,
    contactName: contact.contactName || contact.nickname || contact.displayName || contact.email || 'Contacto'
  }));
  state.contacts.sort((a, b) => String(contactDisplayName(a)).localeCompare(String(contactDisplayName(b)), 'es'));
  const bootstrapContactsCursor = data.contactsPage?.nextCursor;
  state.contactsNextCursor = bootstrapContactsCursor !== null && bootstrapContactsCursor !== undefined && Number.isFinite(Number(bootstrapContactsCursor))
    ? Number(bootstrapContactsCursor)
    : null;
  state.contactsHasMore = Boolean(data.contactsPage?.hasMore && state.contactsNextCursor !== null);
  state.contactsLoading = false;
  state.chats = Array.isArray(data.chats) ? data.chats : [];
  state.chatsNextCursor = data.chatsPage?.nextCursor ?? null;
  state.chatsHasMore = Boolean(data.chatsPage?.hasMore && state.chatsNextCursor);
  state.chatsLoading = false;
  state.chatListPaginationDirty = false;
  state.chatListLoadedMode = 'active';
  state.chatListLoadedAt = Date.now();
  state.notificationPreferences = normalizeNotificationPreferences(data.notificationPreferences || {});
  loadPrivacyLockForCurrentUser({ lockOnRestore: false });
  applyLabelCatalog(Array.isArray(data.labels) ? data.labels : []);
  if (data.chatLabelsByChatId && typeof data.chatLabelsByChatId === 'object') {
    applyChatLabelMemberships(data.chatLabelsByChatId, { replaceKnown: true });
  }
  state.activeLabelFilter = '';
  loadOutboxState();
  sortChats();
  state.bootstrapAppliedAt = Date.now();
  flushPreBootstrapRealtimeEnvelopes();
}


function normalizeChatListMode(mode = 'active') {
  if (mode === true || mode === 'archived') return 'archived';
  if (mode === 'unread') return 'unread';
  return 'active';
}

function isUnreadChat(chat = {}) {
  return Number(chat.unread || 0) > 0;
}

function unreadChatsCount() {
  return (Array.isArray(state.chats) ? state.chats : []).filter(isUnreadChat).length;
}

async function markAllChatsRead() {
  if (!state.user) return;
  const data = await post('/api/chats/read-all', { includeArchived: true, limit: 250, compactResponse: true });
  const updatedChats = Array.isArray(data.chats) ? data.chats : [];
  const updatedChatIds = new Set([
    ...(Array.isArray(data.chatIds) ? data.chatIds : []),
    ...updatedChats.map((chat) => chat?.chatId)
  ].map((chatId) => String(chatId || '').trim()).filter(Boolean));
  for (const chat of updatedChats) upsertChat(chat);
  if (updatedChatIds.size) {
    state.chats = state.chats.map((chat) => updatedChatIds.has(chat.chatId)
      ? { ...chat, unread: 0 }
      : chat);
  }
  const count = Number(data.updatedCount || updatedChatIds.size || 0);
  if (state.chatListMode === 'unread' && count && state.chatsHasMore) {
    // Marcar leídos invalida el cursor del listado no leído, pero no justifica otra
    // HTTP Response inmediata: la primera página se reconstruye solo si el usuario
    // pide continuar cargando después de aplicar el estado compacto local.
    state.chatListPaginationDirty = true;
  }
  showTemporaryDraftStatus(count
    ? `${count} ${count === 1 ? 'chat retirado' : 'chats retirados'} de no leídos sin enviar confirmación de lectura.`
    : 'No había chats sin leer.');
  renderAll();
}

function showChatListMode(mode = 'active') {
  const normalizedMode = normalizeChatListMode(mode);
  state.chatListMode = normalizedMode;
  state.archivedView = normalizedMode === 'archived';
  els.tabChats?.classList.toggle('active', normalizedMode === 'active');
  els.tabUnread?.classList.toggle('active', normalizedMode === 'unread');
  els.tabArchived?.classList.toggle('active', normalizedMode === 'archived');
  els.tabContacts?.classList.remove('active');
  els.chatList?.classList.remove('hidden');
  els.contactList?.classList.add('hidden');
  renderLabelFilters();
}

function canReuseLoadedChatListMode(mode = 'active') {
  const requestedMode = normalizeChatListMode(mode);
  if (state.chatListPaginationDirty) return false;
  if (normalizeChatListMode(state.chatListMode) !== requestedMode) return false;
  if (normalizeChatListMode(state.chatListLoadedMode) !== requestedMode) return false;
  const loadedAt = Number(state.chatListLoadedAt || 0);
  const recentlyLoaded = loadedAt > 0 && Date.now() - loadedAt <= chatListFreshReuseMs;
  return recentlyLoaded || hasHealthySharedRealtimeLease();
}

async function activateChatListMode(mode = 'active') {
  if (!state.user) return false;
  const requestedMode = normalizeChatListMode(mode);
  if (canReuseLoadedChatListMode(requestedMode)) {
    showChatListMode(requestedMode);
    renderAll();
    return false;
  }
  showChatListMode(requestedMode);
  const existingRequest = state.chatListModeRequests.get(requestedMode);
  if (existingRequest) return existingRequest;
  const request = loadChats({
    includeArchived: requestedMode === 'archived',
    unreadOnly: requestedMode === 'unread',
    mode: requestedMode
  });
  state.chatListModeRequests.set(requestedMode, request);
  try {
    return await request;
  } finally {
    if (state.chatListModeRequests.get(requestedMode) === request) state.chatListModeRequests.delete(requestedMode);
  }
}

async function loadChats({ includeArchived = state.archivedView, unreadOnly = false, mode = '' } = {}) {
  if (!state.user) return false;
  const requestedMode = normalizeChatListMode(mode || (unreadOnly ? 'unread' : (includeArchived ? 'archived' : 'active')));
  const data = await post('/api/chats/list', {
    includeArchived: requestedMode === 'archived',
    unreadOnly: requestedMode === 'unread',
    limit: 80
  });
  state.archivedView = requestedMode === 'archived';
  state.chatListMode = requestedMode;
  state.chatListLoadedMode = requestedMode;
  state.chatListLoadedAt = Date.now();
  state.chats = Array.isArray(data.chats) ? data.chats : [];
  state.chatsNextCursor = data.page?.nextCursor ?? null;
  state.chatsHasMore = Boolean(data.page?.hasMore && state.chatsNextCursor);
  state.chatsLoading = false;
  state.chatListPaginationDirty = false;
  if (data.chatLabelsByChatId && typeof data.chatLabelsByChatId === 'object') {
    applyChatLabelMemberships(data.chatLabelsByChatId, { replaceKnown: true });
  }
  sortChats();
  if (state.activeChatId && requestedMode !== 'unread' && !state.chats.some((chat) => chat.chatId === state.activeChatId)) clearActiveChatState();
  showChatListMode(requestedMode);
  renderAll();
  return true;
}

async function loadMoreChats() {
  if (!state.user || state.chatsLoading) return false;
  const requestedMode = normalizeChatListMode(state.chatListMode);
  // Una mutación local puede invalidar únicamente el cursor de paginación (por ejemplo,
  // archivar un chat fijado). No gastamos otra HTTP Response en el momento de la mutación:
  // reconstruimos la primera página solo si el usuario realmente pide continuar cargando.
  if (state.chatListPaginationDirty) {
    await loadChats({
      includeArchived: requestedMode === 'archived',
      unreadOnly: requestedMode === 'unread',
      mode: requestedMode
    });
    return true;
  }
  if (!state.chatsHasMore || !state.chatsNextCursor) return false;
  state.chatsLoading = true;
  renderChats();
  try {
    const data = await post('/api/chats/list', {
      includeArchived: requestedMode === 'archived',
      unreadOnly: requestedMode === 'unread',
      limit: 80,
      cursor: state.chatsNextCursor
    });
    for (const chat of Array.isArray(data.chats) ? data.chats : []) {
      const index = state.chats.findIndex((item) => item.chatId === chat.chatId);
      if (index >= 0) state.chats[index] = { ...state.chats[index], ...chat };
      else state.chats.push(chat);
    }
    if (data.chatLabelsByChatId && typeof data.chatLabelsByChatId === 'object') {
      applyChatLabelMemberships(data.chatLabelsByChatId);
    }
    state.chatsNextCursor = data.page?.nextCursor ?? null;
    state.chatsHasMore = Boolean(data.page?.hasMore && state.chatsNextCursor);
    sortChats();
    return true;
  } finally {
    state.chatsLoading = false;
    renderChats();
  }
}

async function loadMoreContacts() {
  if (!state.user || state.contactsLoading || !state.contactsHasMore || state.contactsNextCursor === null) return false;
  state.contactsLoading = true;
  renderContacts();
  try {
    const data = await post('/api/contacts/list', { limit: 80, cursor: state.contactsNextCursor });
    for (const contact of Array.isArray(data.contacts) ? data.contacts : []) upsertContact(contact);
    const nextCursorRaw = data.page?.nextCursor;
    state.contactsNextCursor = nextCursorRaw !== null && nextCursorRaw !== undefined && Number.isFinite(Number(nextCursorRaw))
      ? Number(nextCursorRaw)
      : null;
    state.contactsHasMore = Boolean(data.page?.hasMore && state.contactsNextCursor !== null);
    return true;
  } finally {
    state.contactsLoading = false;
    renderContacts();
  }
}

async function bootstrapExistingSession() {
  if (!getSessionToken()) return false;
  let data;
  try {
    data = await getCoordinatedBootstrapForExistingSession();
  } catch (error) {
    finishBootstrapRestoreWaiter(null);
    clearBootstrapRestoreLeaseIfOwned();
    state.realtimePreBootstrapEnvelopes = [];
    if (!isSessionInvalidatingHttpError(error)) throw error;
    clearCachedRealtimeToken();
    clearRealtimeRetryDeferral();
    clearRealtimeReconnectBackoff();
    state.realtimePeerActivity.clear();
    setSessionToken('');
    return false;
  }

  applyBootstrap(data);
  // Reanuncia el bootstrap ya aplicado mientras la concesión sigue viva para cubrir
  // pestañas que iniciaron la espera justo después de la primera difusión del líder.
  broadcastRealtime({ type: 'bootstrap-shared', data }, { persistSmall: false });
  showAuthenticated();
  if (state.privacyLock.enabled) lockPrivacyScreen();

  // El bootstrap autenticado ya validó la sesión. Un fallo posterior al preparar SSE
  // no debe borrar una sesión válida ni forzar login + bootstrap adicionales. Los
  // errores recuperables conservan el liderazgo y usan el backoff coordinado de SSE;
  // los definitivos quedan bloqueados por openRealtime sin degradar el bootstrap.
  try {
    await openRealtime();
  } catch (error) {
    if (!isDefinitiveHttpError(error) && !isRealtimeRetryDeferred()) scheduleRealtimeReconnect();
  }

  await ensureExistingPushSubscriptionRegistered();
  await consumeAddFromUrl();
  await consumeChatFromUrl();
  scheduleOutboxRetry(1200);
  flushDeliveryAckQueue({ force: true }).catch(() => null);
  return true;
}

function getRealtimeTabId() {
  if (state.realtimeTabId) return state.realtimeTabId;
  const key = 'chater_realtime_tab_id_v1';
  try {
    const stored = String(sessionStorage.getItem(key) || '').trim();
    if (stored) return (state.realtimeTabId = stored);
    const created = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(key, created);
    return (state.realtimeTabId = created);
  } catch {
    return (state.realtimeTabId = state.realtimeTabId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
  }
}

function realtimeSessionCoordinationKey(sessionToken = getSessionToken()) {
  const token = String(sessionToken || '').trim();
  if (!token) return '';
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `session_${(hash >>> 0).toString(16)}`;
}

function bootstrapRestoreSnapshotStorageKey(sessionKey = '') {
  const cleanSessionKey = String(sessionKey || '').trim();
  return cleanSessionKey ? `${bootstrapRestoreSnapshotStoragePrefix}:${cleanSessionKey}` : '';
}

function readSharedBootstrapSnapshot(sessionKey = '', { notBefore = 0 } = {}) {
  const key = bootstrapRestoreSnapshotStorageKey(sessionKey);
  if (!key) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (!parsed
      || String(parsed.sessionKey || '') !== String(sessionKey || '')
      || Number(parsed.expiresAt || 0) <= Date.now()
      || !parsed.data
      || typeof parsed.data !== 'object') {
      localStorage.removeItem(key);
      return null;
    }
    if (Number(parsed.publishedAt || 0) < Math.max(0, Number(notBefore || 0))) return null;
    return parsed.data;
  } catch { return null; }
}

function persistSharedBootstrapSnapshot(sessionKey = '', data = null) {
  const key = bootstrapRestoreSnapshotStorageKey(sessionKey);
  if (!key || !data || typeof data !== 'object') return false;
  try {
    const publishedAt = Date.now();
    localStorage.setItem(key, JSON.stringify({
      sessionKey: String(sessionKey),
      publishedAt,
      expiresAt: publishedAt + bootstrapRestoreSnapshotStorageTtlMs,
      data
    }));
    return true;
  } catch {
    return false;
  }
}

function readBootstrapRestoreLease() {
  try {
    const parsed = JSON.parse(localStorage.getItem(bootstrapRestoreLeaderStorageKey) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function writeBootstrapRestoreLease(sessionKey = '', expiresAt = Date.now() + bootstrapRestoreLeaderLeaseMs) {
  const cleanSessionKey = String(sessionKey || '').trim();
  if (!cleanSessionKey) return false;
  const lease = {
    owner: getRealtimeTabId(),
    clientId: getClientId(),
    sessionKey: cleanSessionKey,
    expiresAt
  };
  try { localStorage.setItem(bootstrapRestoreLeaderStorageKey, JSON.stringify(lease)); } catch { return false; }
  const stored = readBootstrapRestoreLease();
  return stored?.owner === lease.owner && stored?.sessionKey === cleanSessionKey;
}

function clearBootstrapRestoreLeaseIfOwned() {
  const lease = readBootstrapRestoreLease();
  if (lease?.owner !== getRealtimeTabId()) return;
  try { localStorage.removeItem(bootstrapRestoreLeaderStorageKey); } catch {}
}

function claimBootstrapRestoreLeadership(sessionKey = '') {
  const cleanSessionKey = String(sessionKey || '').trim();
  if (!cleanSessionKey) return false;
  const now = Date.now();
  const current = readBootstrapRestoreLease();
  const owned = current?.owner === getRealtimeTabId() && current?.sessionKey === cleanSessionKey;
  const available = !current || Number(current.expiresAt || 0) <= now || String(current.sessionKey || '') !== cleanSessionKey;
  if (!owned && !available) return false;
  return writeBootstrapRestoreLease(cleanSessionKey, now + bootstrapRestoreLeaderLeaseMs);
}

async function settleBootstrapRestoreLeadership(sessionKey = '') {
  const jitter = Math.round(Math.random() * realtimeLeadershipSettleMs);
  await new Promise((resolve) => window.setTimeout(resolve, realtimeLeadershipSettleMs + jitter));
  const lease = readBootstrapRestoreLease();
  return Boolean(
    lease?.owner === getRealtimeTabId()
    && String(lease.sessionKey || '') === String(sessionKey || '')
    && Number(lease.expiresAt || 0) > Date.now()
  );
}

function finishBootstrapRestoreWaiter(data = null) {
  const waiter = state.bootstrapRestoreWaiter;
  if (!waiter) return false;
  state.bootstrapRestoreWaiter = null;
  if (waiter.timeout) window.clearTimeout(waiter.timeout);
  if (waiter.poll) window.clearInterval(waiter.poll);
  waiter.resolve(data);
  return true;
}

function waitForSharedBootstrap(sessionKey = '', { timeoutMs = bootstrapRestorePeerWaitMs, followLease = false } = {}) {
  if (!sessionKey) return Promise.resolve(null);
  if (state.bootstrapRestoreWaiter) finishBootstrapRestoreWaiter(null);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const waiter = {
      sessionKey,
      startedAt,
      resolve,
      timeout: window.setTimeout(() => finishBootstrapRestoreWaiter(null), Math.max(50, Number(timeoutMs || 0))),
      poll: window.setInterval(() => {
        const shared = readSharedBootstrapSnapshot(sessionKey, { notBefore: startedAt - bootstrapRestoreSnapshotGraceMs });
        if (shared) {
          finishBootstrapRestoreWaiter(shared);
          return;
        }
        if (!followLease) return;
        const lease = readBootstrapRestoreLease();
        const leaseActive = lease
          && String(lease.sessionKey || '') === sessionKey
          && Number(lease.expiresAt || 0) > Date.now();
        if (!leaseActive || Date.now() - startedAt >= bootstrapRestoreLeaderMaxWaitMs) finishBootstrapRestoreWaiter(null);
      }, 100)
    };
    state.bootstrapRestoreWaiter = waiter;
  });
}

function buildShareableBootstrapSnapshot() {
  if (!state.user?.userId || !getSessionToken() || !state.config) return null;
  if (normalizeChatListMode(state.chatListMode) !== 'active' || state.archivedView) return null;
  const recentlyBootstrapped = Date.now() - Number(state.bootstrapAppliedAt || 0) <= bootstrapRestoreSnapshotFreshMs;
  if (!recentlyBootstrapped && !hasHealthySharedRealtimeLease()) return null;
  return {
    ok: true,
    clientConfig: { ...state.config },
    user: { ...state.user },
    contacts: (Array.isArray(state.contacts) ? state.contacts : []).map((contact) => ({ ...contact })),
    contactsPage: { nextCursor: state.contactsNextCursor, hasMore: Boolean(state.contactsHasMore) },
    chats: (Array.isArray(state.chats) ? state.chats : []).map((chat) => ({ ...chat })),
    chatsPage: { nextCursor: state.chatsNextCursor, hasMore: Boolean(state.chatsHasMore) },
    realtimeCursor: loadRealtimeLastEventId(),
    notificationPreferences: { ...(state.notificationPreferences || {}) },
    labels: (Array.isArray(state.labels) ? state.labels : []).map((label) => ({ ...label }))
  };
}

function flushPreBootstrapRealtimeEnvelopes() {
  if (!state.user?.userId || !state.realtimePreBootstrapEnvelopes.length) return;
  const pending = state.realtimePreBootstrapEnvelopes.splice(0, state.realtimePreBootstrapEnvelopes.length);
  for (const envelope of pending) {
    if (String(envelope?.userId || '') !== String(state.user.userId)) continue;
    applyRealtimeBusEnvelope(envelope);
  }
}

async function getCoordinatedBootstrapForExistingSession() {
  const sessionToken = getSessionToken();
  const sessionKey = realtimeSessionCoordinationKey(sessionToken);
  if (!sessionToken || !sessionKey) throw new Error('La sesión local no está disponible.');
  ensureRealtimeCoordinator();

  // bootstrap-request es un mensaje diminuto y también viaja por el evento storage.
  // Así la coordinación sigue funcionando cuando BroadcastChannel no está disponible.
  const peerWait = waitForSharedBootstrap(sessionKey, { timeoutMs: bootstrapRestorePeerWaitMs });
  broadcastRealtime({ type: 'bootstrap-request' }, { persistSmall: true });
  const sharedFromPeer = await peerWait;
  if (sharedFromPeer) return sharedFromPeer;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (claimBootstrapRestoreLeadership(sessionKey)) {
      if (await settleBootstrapRestoreLeadership(sessionKey)) {
        const renewTimer = window.setInterval(() => {
          const lease = readBootstrapRestoreLease();
          if (lease?.owner !== getRealtimeTabId() || String(lease.sessionKey || '') !== sessionKey) return;
          writeBootstrapRestoreLease(sessionKey);
        }, bootstrapRestoreLeaderRenewMs);
        let completed = false;
        try {
          const data = await post('/api/bootstrap', {});
          completed = true;
          persistSharedBootstrapSnapshot(sessionKey, data);
          broadcastRealtime({ type: 'bootstrap-shared', data }, { persistSmall: false });
          return data;
        } finally {
          window.clearInterval(renewTimer);
          if (completed) window.setTimeout(clearBootstrapRestoreLeaseIfOwned, 750);
          else clearBootstrapRestoreLeaseIfOwned();
        }
      }
      clearBootstrapRestoreLeaseIfOwned();
    }

    const lease = readBootstrapRestoreLease();
    const leaseActive = lease
      && String(lease.sessionKey || '') === sessionKey
      && Number(lease.expiresAt || 0) > Date.now();
    if (leaseActive) {
      const shared = await waitForSharedBootstrap(sessionKey, {
        timeoutMs: bootstrapRestoreLeaderMaxWaitMs,
        followLease: true
      });
      if (shared) return shared;
    }
  }

  // Fallback de disponibilidad: solo se alcanza si el almacenamiento compartido no
  // pudo coordinarse o el líder desapareció repetidamente. Nunca se bloquea el acceso.
  const data = await post('/api/bootstrap', {});
  persistSharedBootstrapSnapshot(sessionKey, data);
  return data;
}

function realtimeLastEventKey() {
  const userId = String(state.user?.userId || '').trim();
  return userId ? `${realtimeLastEventPrefix}:${userId}` : '';
}

function loadRealtimeLastEventId() {
  const key = realtimeLastEventKey();
  if (!key) return '';
  try { return String(localStorage.getItem(key) || '').trim().slice(0, 180); } catch { return ''; }
}

function rememberRealtimeLastEventId(eventId = '') {
  const clean = String(eventId || '').trim().slice(0, 180);
  const key = realtimeLastEventKey();
  if (!clean || !key) return;
  try { localStorage.setItem(key, clean); } catch {}
}

function clearCachedRealtimeToken() {
  try { localStorage.removeItem(realtimeTokenCacheKey); } catch {}
}

function loadCachedRealtimeToken() {
  if (!state.user?.userId || !getSessionToken()) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(realtimeTokenCacheKey) || 'null');
    const token = String(cached?.token || '').trim();
    const expiresAtMs = Date.parse(cached?.expiresAt || '');
    if (!token
      || String(cached?.userId || '') !== String(state.user.userId)
      || String(cached?.clientId || '') !== getClientId()
      || !Number.isFinite(expiresAtMs)
      || expiresAtMs <= Date.now() + realtimeTokenRefreshSkewMs) {
      clearCachedRealtimeToken();
      return null;
    }
    return { realtimeToken: token, expiresAt: new Date(expiresAtMs).toISOString(), fromCache: true };
  } catch {
    clearCachedRealtimeToken();
    return null;
  }
}

function rememberCachedRealtimeToken(tokenData = {}) {
  const token = String(tokenData?.realtimeToken || '').trim();
  const expiresAtMs = Date.parse(tokenData?.expiresAt || '');
  if (!token || !state.user?.userId || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return null;
  const cached = {
    token,
    expiresAt: new Date(expiresAtMs).toISOString(),
    userId: String(state.user.userId),
    clientId: getClientId()
  };
  try { localStorage.setItem(realtimeTokenCacheKey, JSON.stringify(cached)); } catch {}
  return { realtimeToken: cached.token, expiresAt: cached.expiresAt, fromCache: false };
}

async function getRealtimeTokenForStream() {
  const cached = loadCachedRealtimeToken();
  if (cached) return cached;
  const tokenData = await post('/api/realtime/token', { clientId: getClientId() });
  return rememberCachedRealtimeToken(tokenData) || { ...tokenData, fromCache: false };
}

function rememberRealtimeSeenEvent(eventId = '') {
  const clean = String(eventId || '').trim();
  if (!clean) return true;
  if (state.realtimeSeenEventIds.has(clean)) return false;
  state.realtimeSeenEventIds.add(clean);
  if (state.realtimeSeenEventIds.size > 320) {
    const first = state.realtimeSeenEventIds.values().next().value;
    if (first) state.realtimeSeenEventIds.delete(first);
  }
  return true;
}

function readRealtimeLease() {
  try {
    const parsed = JSON.parse(localStorage.getItem(realtimeLeaderStorageKey) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function writeRealtimeLease(expiresAt = Date.now() + realtimeLeaderLeaseMs) {
  const lease = {
    owner: getRealtimeTabId(),
    clientId: getClientId(),
    userId: String(state.user?.userId || ''),
    expiresAt
  };
  try { localStorage.setItem(realtimeLeaderStorageKey, JSON.stringify(lease)); } catch { return false; }
  return readRealtimeLease()?.owner === lease.owner;
}

function clearRealtimeLeaseIfOwned() {
  const lease = readRealtimeLease();
  if (lease?.owner !== getRealtimeTabId()) return;
  try { localStorage.removeItem(realtimeLeaderStorageKey); } catch {}
}

function realtimeRetryNotBefore() {
  let storedUntil = 0;
  try {
    const stored = JSON.parse(localStorage.getItem(realtimeRetryAfterStorageKey) || 'null');
    if (stored && String(stored.userId || '') === String(state.user?.userId || '')) {
      storedUntil = Math.max(0, Number(stored.until || 0));
      if (storedUntil <= Date.now()) localStorage.removeItem(realtimeRetryAfterStorageKey);
    }
  } catch {}
  const until = Math.max(Number(state.realtimeRetryNotBefore || 0), storedUntil);
  if (until <= Date.now()) {
    state.realtimeRetryNotBefore = 0;
    return 0;
  }
  state.realtimeRetryNotBefore = until;
  return until;
}

function isRealtimeRetryDeferred() {
  return realtimeRetryNotBefore() > Date.now();
}

function clearRealtimeRetryDeferral() {
  state.realtimeRetryNotBefore = 0;
  try {
    const stored = JSON.parse(localStorage.getItem(realtimeRetryAfterStorageKey) || 'null');
    if (!stored || String(stored.userId || '') === String(state.user?.userId || '')) {
      localStorage.removeItem(realtimeRetryAfterStorageKey);
    }
  } catch {}
}

function readRealtimeBackoffState() {
  const empty = { retryCount: 0, shortDisconnects: 0, until: 0, updatedAt: 0 };
  if (!state.user?.userId) return empty;
  try {
    const stored = JSON.parse(localStorage.getItem(realtimeBackoffStorageKey) || 'null');
    if (!stored || String(stored.userId || '') !== String(state.user.userId)) return empty;
    const updatedAt = Math.max(0, Number(stored.updatedAt || 0));
    if (!updatedAt || Date.now() - updatedAt > realtimeBackoffStorageTtlMs) {
      localStorage.removeItem(realtimeBackoffStorageKey);
      return empty;
    }
    return {
      retryCount: Math.max(0, Math.min(8, Number(stored.retryCount || 0))),
      shortDisconnects: Math.max(0, Math.min(6, Number(stored.shortDisconnects || 0))),
      until: Math.max(0, Number(stored.until || 0)),
      updatedAt
    };
  } catch { return empty; }
}

function syncRealtimeBackoffState() {
  const shared = readRealtimeBackoffState();
  state.realtimeRetryCount = Math.max(Number(state.realtimeRetryCount || 0), shared.retryCount);
  state.realtimeShortDisconnects = Math.max(Number(state.realtimeShortDisconnects || 0), shared.shortDisconnects);
  return shared;
}

function realtimeBackoffNotBefore() {
  const shared = syncRealtimeBackoffState();
  return shared.until > Date.now() ? shared.until : 0;
}

function persistRealtimeBackoffState({ retryCount, shortDisconnects, until } = {}) {
  if (!state.user?.userId) return 0;
  const shared = readRealtimeBackoffState();
  const resolvedRetryCount = retryCount ?? Math.max(state.realtimeRetryCount, shared.retryCount);
  const resolvedShortDisconnects = shortDisconnects ?? Math.max(state.realtimeShortDisconnects, shared.shortDisconnects);
  const resolvedUntil = until ?? shared.until;
  const payload = {
    userId: String(state.user.userId),
    retryCount: Math.max(0, Math.min(8, Number(resolvedRetryCount || 0))),
    shortDisconnects: Math.max(0, Math.min(6, Number(resolvedShortDisconnects || 0))),
    until: Math.max(0, Number(resolvedUntil || 0)),
    updatedAt: Date.now()
  };
  state.realtimeRetryCount = payload.retryCount;
  state.realtimeShortDisconnects = payload.shortDisconnects;
  try { localStorage.setItem(realtimeBackoffStorageKey, JSON.stringify(payload)); } catch {}
  return payload.until;
}

function clearRealtimeReconnectBackoff() {
  state.realtimeRetryCount = 0;
  state.realtimeShortDisconnects = 0;
  try {
    const stored = JSON.parse(localStorage.getItem(realtimeBackoffStorageKey) || 'null');
    if (!stored || String(stored.userId || '') === String(state.user?.userId || '')) {
      localStorage.removeItem(realtimeBackoffStorageKey);
    }
  } catch {}
}

function deferRealtimeReconnect(retryAfterMs = 0, { announce = true } = {}) {
  if (!state.user?.userId) return 0;
  const safeDelay = Math.max(15000, Math.min(2 * 60 * 60 * 1000, Number(retryAfterMs || 0) || 5 * 60 * 1000));
  const until = Math.max(realtimeRetryNotBefore(), Date.now() + safeDelay);
  state.realtimeRetryNotBefore = until;
  try {
    localStorage.setItem(realtimeRetryAfterStorageKey, JSON.stringify({ userId: String(state.user.userId), until }));
  } catch {}
  if (announce) broadcastRealtime({ type: 'retry-deferred', until }, { persistSmall: true });
  if (state.realtimeLeader) releaseRealtimeLeadership({ closeTransport: true, announce: false });
  else closeRealtime();
  return until;
}

function broadcastRealtime(message = {}, { persistSmall = true } = {}) {
  const envelope = {
    ...message,
    userId: String(state.user?.userId || ''),
    sessionKey: realtimeSessionCoordinationKey(),
    sender: getRealtimeTabId(),
    at: Date.now()
  };
  try { state.realtimeChannel?.postMessage(envelope); } catch {}
  if (persistSmall && message.type !== 'bootstrap' && message.type !== 'bootstrap-shared') {
    try { localStorage.setItem(realtimeBusStorageKey, JSON.stringify(envelope)); } catch {}
  }
}

function noteRealtimePeerActivity(envelope = {}) {
  const sender = String(envelope.sender || '').trim();
  const sessionKey = String(envelope.sessionKey || '').trim();
  if (!sender || sender === getRealtimeTabId() || !sessionKey) return;
  if (envelope.visible !== true) {
    state.realtimePeerActivity.delete(sender);
    return;
  }
  state.realtimePeerActivity.set(sender, {
    sessionKey,
    at: Math.max(0, Number(envelope.at || Date.now()))
  });
}

function announceRealtimeClientActivity(visible = document.visibilityState === 'visible') {
  if (!state.user?.userId || !getSessionToken()) return;
  broadcastRealtime(
    { type: 'client-activity', visible: Boolean(visible) },
    { persistSmall: !state.realtimeChannel }
  );
}

function hasRecentVisibleRealtimePeer() {
  const now = Date.now();
  const sessionKey = realtimeSessionCoordinationKey();
  let hasVisiblePeer = false;
  for (const [sender, activity] of state.realtimePeerActivity.entries()) {
    const stale = !activity
      || activity.sessionKey !== sessionKey
      || now - Number(activity.at || 0) > realtimePeerActivityTtlMs;
    if (stale) {
      state.realtimePeerActivity.delete(sender);
      continue;
    }
    hasVisiblePeer = true;
  }
  return hasVisiblePeer;
}

function armRealtimeHiddenRelease(delay = realtimeHiddenReleaseMs) {
  if (state.realtimeHiddenTimer) window.clearTimeout(state.realtimeHiddenTimer);
  state.realtimeHiddenTimer = window.setTimeout(() => {
    state.realtimeHiddenTimer = 0;
    if (document.visibilityState !== 'hidden' || !state.realtimeLeader) return;
    // Si otra pestaña/PWA de la misma sesión sigue visible, la SSE existente sigue
    // siendo actividad relevante. Mantener al líder oculto evita cerrar y volver a
    // abrir el mismo transporte únicamente por un cambio de pestaña.
    if (hasRecentVisibleRealtimePeer()) {
      armRealtimeHiddenRelease();
      return;
    }
    releaseRealtimeLeadership({ closeTransport: true });
  }, Math.max(250, Number(delay) || realtimeHiddenReleaseMs));
}

function applyRealtimeBusEnvelope(envelope = {}) {
  if (!envelope || envelope.sender === getRealtimeTabId()) return;
  const localSessionKey = realtimeSessionCoordinationKey();
  if (!localSessionKey) return;
  const envelopeSessionKey = String(envelope.sessionKey || '');
  const isBootstrapCoordinationMessage = envelope.type === 'bootstrap-request' || envelope.type === 'bootstrap-shared';
  // Los mensajes nuevos se aíslan por sesión. Para eventos legacy sin sessionKey mantenemos
  // compatibilidad durante un despliegue gradual y, más abajo, exigimos el mismo userId.
  if (envelopeSessionKey && envelopeSessionKey !== localSessionKey) return;
  if (isBootstrapCoordinationMessage && envelopeSessionKey !== localSessionKey) return;

  if (envelope.type === 'bootstrap-request') {
    const snapshot = buildShareableBootstrapSnapshot();
    if (snapshot) {
      persistSharedBootstrapSnapshot(localSessionKey, snapshot);
      broadcastRealtime({ type: 'bootstrap-shared', target: envelope.sender, data: snapshot }, { persistSmall: false });
    }
    return;
  }

  if (envelope.type === 'bootstrap-shared') {
    const waiter = state.bootstrapRestoreWaiter;
    if (!waiter || waiter.sessionKey !== localSessionKey) return;
    if (envelope.target && envelope.target !== getRealtimeTabId()) return;
    finishBootstrapRestoreWaiter(envelope.data || null);
    return;
  }

  if (!state.user?.userId) {
    if (envelope.type === 'event') {
      state.realtimePreBootstrapEnvelopes.push(envelope);
      if (state.realtimePreBootstrapEnvelopes.length > 80) state.realtimePreBootstrapEnvelopes.shift();
    }
    return;
  }
  if (String(envelope.userId || '') !== String(state.user.userId)) return;
  if (envelope.type === 'client-activity') {
    noteRealtimePeerActivity(envelope);
    if (state.realtimeLeader && document.visibilityState === 'hidden' && envelope.visible === true) {
      armRealtimeHiddenRelease();
    }
    return;
  }
  if (envelope.type === 'event') {
    const eventId = String(envelope.eventId || '').trim();
    if (eventId && envelope.payload?.replayable !== false) rememberRealtimeLastEventId(eventId);
    if (!rememberRealtimeSeenEvent(eventId)) return;
    handleRealtimeEvent(envelope.payload || {});
    return;
  }
  if (envelope.type === 'bootstrap' && envelope.data) {
    state.messageBaselineLoadedChats.clear();
    state.messageSyncCursorByChat.clear();
    applyBootstrap(envelope.data);
    return;
  }
  if (envelope.type === 'retry-deferred') {
    const until = Math.max(Date.now(), Number(envelope.until || 0));
    if (until > Date.now()) deferRealtimeReconnect(until - Date.now(), { announce: false });
    return;
  }
  if (envelope.type === 'retry-blocked') {
    state.realtimeRetryBlocked = true;
    if (state.realtimeLeader) releaseRealtimeLeadership({ closeTransport: true, announce: false });
    else closeRealtime();
    return;
  }
  if (envelope.type === 'leader-release') scheduleRealtimeElection(40);
}

function ensureRealtimeCoordinator() {
  if (state.realtimeCoordinatorReady) return;
  state.realtimeCoordinatorReady = true;
  getRealtimeTabId();
  if ('BroadcastChannel' in window) {
    try {
      state.realtimeChannel = new BroadcastChannel(realtimeChannelName);
      state.realtimeChannel.addEventListener('message', (event) => applyRealtimeBusEnvelope(event.data || {}));
    } catch { state.realtimeChannel = null; }
  }
  window.addEventListener('storage', (event) => {
    if (event.key === realtimeBusStorageKey && event.newValue) {
      try { applyRealtimeBusEnvelope(JSON.parse(event.newValue)); } catch {}
      return;
    }
    if (event.key === realtimeBackoffStorageKey && state.user) {
      if (!event.newValue) {
        state.realtimeRetryCount = 0;
        state.realtimeShortDisconnects = 0;
        return;
      }
      syncRealtimeBackoffState();
      const until = realtimeBackoffNotBefore();
      if (until > Date.now() && state.realtimeLeader && !state.realtimeReconnectTimer) {
        closeRealtime({ releaseLeadership: false });
        armRealtimeReconnect(until - Date.now());
      }
      return;
    }
    if (state.user && event.key === outboxStorageKey()) {
      loadOutboxState();
      renderAll();
      scheduleNextOutboxRetry();
      return;
    }
    if (state.user && event.key === outboxRetryLeaderStorageKey() && !event.newValue && state.outboxMessages.length) {
      scheduleNextOutboxRetry();
      return;
    }
    if (event.key?.startsWith(`${bootstrapRestoreSnapshotStoragePrefix}:`) && state.bootstrapRestoreWaiter) {
      const waiter = state.bootstrapRestoreWaiter;
      const shared = readSharedBootstrapSnapshot(waiter.sessionKey, {
        notBefore: Number(waiter.startedAt || 0) - bootstrapRestoreSnapshotGraceMs
      });
      if (shared) finishBootstrapRestoreWaiter(shared);
      return;
    }
    if (event.key === realtimeLeaderStorageKey && state.user && document.visibilityState === 'visible') {
      const lease = readRealtimeLease();
      if (!lease || Number(lease.expiresAt || 0) <= Date.now()) scheduleRealtimeElection(80);
    }
  });
  state.realtimeElectionTimer = window.setInterval(() => {
    if (state.user && getSessionToken() && document.visibilityState === 'visible' && navigator.onLine !== false) {
      announceRealtimeClientActivity(true);
    }
    if (!state.user || !getSessionToken() || state.realtimeRetryBlocked || isRealtimeRetryDeferred() || document.visibilityState !== 'visible' || navigator.onLine === false) return;
    if (state.realtimeLeader) {
      const lease = readRealtimeLease();
      if (lease?.owner !== getRealtimeTabId()) releaseRealtimeLeadership({ closeTransport: true, announce: false });
      return;
    }
    const lease = readRealtimeLease();
    if (!lease || Number(lease.expiresAt || 0) <= Date.now() || String(lease.userId || '') !== String(state.user.userId)) {
      openRealtime().catch(() => scheduleRealtimeReconnect());
    }
  }, realtimeElectionMs);
  if (state.user && getSessionToken() && document.visibilityState === 'visible' && navigator.onLine !== false) {
    announceRealtimeClientActivity(true);
  }
}

function renewRealtimeLeadership() {
  if (!state.realtimeLeader) return;
  // La visibilidad no invalida el lease por sí sola: el handler de visibilitychange
  // conserva una breve gracia y libera el stream con realtimeHiddenTimer si la app
  // sigue oculta. Cerrar aquí en cada tick de 5 s anulaba esa gracia y convertía
  // cambios breves de pestaña/app en una nueva HTTP Response SSE al regresar.
  if (!state.user || !getSessionToken() || state.realtimeRetryBlocked || isRealtimeRetryDeferred() || navigator.onLine === false) {
    releaseRealtimeLeadership({ closeTransport: true });
    return;
  }
  if (!writeRealtimeLease()) {
    releaseRealtimeLeadership({ closeTransport: true, announce: false });
    return;
  }
  broadcastRealtime({ type: 'leader-heartbeat' }, { persistSmall: false });
}

function claimRealtimeLeadership() {
  ensureRealtimeCoordinator();
  if (!state.user || !getSessionToken() || state.realtimeRetryBlocked || isRealtimeRetryDeferred() || document.visibilityState !== 'visible' || navigator.onLine === false) return false;
  const now = Date.now();
  const current = readRealtimeLease();
  const owned = current?.owner === getRealtimeTabId();
  const available = !current || Number(current.expiresAt || 0) <= now || String(current.userId || '') !== String(state.user.userId);
  if (!owned && !available) return false;
  if (!writeRealtimeLease(now + realtimeLeaderLeaseMs)) return false;
  state.realtimeLeader = true;
  if (state.realtimeLeaseTimer) window.clearInterval(state.realtimeLeaseTimer);
  state.realtimeLeaseTimer = window.setInterval(renewRealtimeLeadership, realtimeLeaderRenewMs);
  return true;
}

function releaseRealtimeLeadership({ closeTransport = true, announce = true } = {}) {
  const wasLeader = state.realtimeLeader || readRealtimeLease()?.owner === getRealtimeTabId();
  if (state.realtimeLeaseTimer) window.clearInterval(state.realtimeLeaseTimer);
  state.realtimeLeaseTimer = 0;
  state.realtimeLeader = false;
  clearRealtimeLeaseIfOwned();
  if (closeTransport) closeRealtime({ releaseLeadership: false });
  if (wasLeader && announce) broadcastRealtime({ type: 'leader-release' });
}

function scheduleRealtimeElection(delay = 100) {
  window.setTimeout(() => {
    if (!state.user || !getSessionToken() || state.realtimeRetryBlocked || isRealtimeRetryDeferred() || document.visibilityState !== 'visible' || navigator.onLine === false) return;
    openRealtime().catch(() => scheduleRealtimeReconnect());
  }, Math.max(20, Number(delay) || 100));
}

async function settleRealtimeLeadership() {
  const jitter = Math.round(Math.random() * realtimeLeadershipSettleMs);
  await new Promise((resolve) => window.setTimeout(resolve, realtimeLeadershipSettleMs + jitter));
  const lease = readRealtimeLease();
  const ownsSettledLease = Boolean(
    state.realtimeLeader
    && lease?.owner === getRealtimeTabId()
    && String(lease?.userId || '') === String(state.user?.userId || '')
    && String(lease?.clientId || '') === getClientId()
    && Number(lease?.expiresAt || 0) > Date.now()
  );
  if (!ownsSettledLease && state.realtimeLeader) {
    releaseRealtimeLeadership({ closeTransport: true, announce: false });
  }
  return ownsSettledLease;
}

function closeRealtime({ releaseLeadership = false } = {}) {
  state.realtimeManualClose = true;
  state.realtimeOpenSeq += 1;
  if (state.realtimeReconnectTimer) window.clearTimeout(state.realtimeReconnectTimer);
  if (state.realtimeStableTimer) window.clearTimeout(state.realtimeStableTimer);
  state.realtimeReconnectTimer = 0;
  state.realtimeStableTimer = 0;
  if (state.eventSource) state.eventSource.close();
  state.eventSource = null;
  state.realtimeAttemptStartedAt = 0;
  state.realtimeOpenedAt = 0;
  if (releaseLeadership) releaseRealtimeLeadership({ closeTransport: false });
}

function isRealtimeStreamUsable() {
  return Boolean(state.eventSource && state.eventSource.readyState !== EventSource.CLOSED);
}

function hasHealthySharedRealtimeLease() {
  if (!state.user?.userId || state.realtimeRetryBlocked || isRealtimeRetryDeferred() || navigator.onLine === false) return false;
  const lease = readRealtimeLease();
  if (!lease
    || Number(lease.expiresAt || 0) <= Date.now()
    || String(lease.userId || '') !== String(state.user.userId)) return false;
  if (lease.owner !== getRealtimeTabId()) return true;
  return Boolean(state.eventSource && state.eventSource.readyState === EventSource.OPEN && state.realtimeOpenedAt > 0);
}

async function resyncRealtimeStateOnce() {
  if (state.realtimeResyncPromise) return state.realtimeResyncPromise;
  const promise = (async () => {
    state.messageBaselineLoadedChats.clear();
    state.messageSyncCursorByChat.clear();
    const data = await post('/api/bootstrap', {});
    applyBootstrap(data);
    broadcastRealtime({ type: 'bootstrap', data }, { persistSmall: false });
    return data;
  })();
  state.realtimeResyncPromise = promise;
  try { return await promise; }
  finally { if (state.realtimeResyncPromise === promise) state.realtimeResyncPromise = null; }
}

async function openRealtime() {
  ensureRealtimeCoordinator();
  if (state.realtimeRetryBlocked || isRealtimeRetryDeferred()) return null;
  if (!claimRealtimeLeadership()) return null;
  const sharedBackoffUntil = realtimeBackoffNotBefore();
  if (sharedBackoffUntil > Date.now()) {
    armRealtimeReconnect(sharedBackoffUntil - Date.now());
    return null;
  }
  if (state.realtimeOpeningPromise) return state.realtimeOpeningPromise;
  if (isRealtimeStreamUsable()) return state.eventSource;
  const openSeq = state.realtimeOpenSeq + 1;
  state.realtimeOpenSeq = openSeq;
  const opening = (async () => {
    if (state.realtimeReconnectTimer) window.clearTimeout(state.realtimeReconnectTimer);
    state.realtimeReconnectTimer = 0;
    state.realtimeManualClose = false;
    if (state.eventSource) state.eventSource.close();
    state.eventSource = null;
    // localStorage no ofrece compare-and-swap. Una breve ventana de asentamiento hace
    // que, ante aperturas simultáneas, solo el dueño final del lease llegue a gastar
    // la HTTP Response de /api/realtime/token y la posterior respuesta SSE.
    if (!await settleRealtimeLeadership()) return null;
    if (state.realtimeManualClose || openSeq !== state.realtimeOpenSeq || !getSessionToken() || !state.realtimeLeader) return null;
    let tokenData;
    try {
      tokenData = await getRealtimeTokenForStream();
    } catch (error) {
      const retryAfterMs = Math.max(0, Number(error?.retryAfterMs || 0));
      if (retryAfterMs > 0) {
        // Si el breaker/rate-limit ya indicó cuándo volver, respétalo también antes
        // de abrir EventSource para no gastar respuestas de token durante la ventana.
        deferRealtimeReconnect(retryAfterMs, { announce: true });
      } else if (isDefinitiveHttpError(error)) {
        state.realtimeRetryBlocked = true;
        broadcastRealtime({ type: 'retry-blocked' });
        releaseRealtimeLeadership({ closeTransport: true, announce: false });
      }
      throw error;
    }
    if (state.realtimeManualClose || openSeq !== state.realtimeOpenSeq || !getSessionToken() || !state.realtimeLeader) return null;
    const token = encodeURIComponent(tokenData.realtimeToken || '');
    if (!token) throw new Error('No se pudo preparar la sincronización en tiempo real.');
    const lastEventId = loadRealtimeLastEventId();
    const resume = lastEventId ? `&lastEventId=${encodeURIComponent(lastEventId)}` : '';
    const reconnect = state.realtimeConnectedOnce ? '&reconnect=1' : '';
    state.realtimeAttemptStartedAt = Date.now();
    const source = new EventSource(withTrafficClientId(`${getBackendUrl()}/api/realtime/stream?realtimeToken=${token}${resume}${reconnect}`));
    let streamReady = false;
    source.addEventListener('chater_ready', () => {
      if (state.eventSource !== source) return;
      streamReady = true;
      state.realtimeRetryBlocked = false;
      clearRealtimeRetryDeferral();
      state.realtimeOpenedAt = Date.now();
      state.realtimeConnectedOnce = true;
      if (state.realtimeStableTimer) window.clearTimeout(state.realtimeStableTimer);
      state.realtimeStableTimer = window.setTimeout(() => {
        if (state.eventSource !== source || source.readyState === EventSource.CLOSED) return;
        clearRealtimeReconnectBackoff();
      }, realtimeStableConnectionMs);
    });
    source.addEventListener('chater_event', (event) => {
      if (state.eventSource !== source) return;
      try {
        const payload = JSON.parse(event.data || '{}');
        const eventId = String(event.lastEventId || payload.eventId || '').trim();
        if (eventId && payload.replayable !== false) rememberRealtimeLastEventId(eventId);
        if (!rememberRealtimeSeenEvent(eventId)) return;
        handleRealtimeEvent(payload);
        broadcastRealtime({ type: 'event', eventId, payload });
      } catch {}
    });
    source.addEventListener('chater_control', (event) => {
      if (state.eventSource !== source) return;
      try {
        const control = JSON.parse(event.data || '{}');
        if (control.type === 'resync_required') resyncRealtimeStateOnce().catch(() => null);
        if (control.type === 'retry_later') {
          deferRealtimeReconnect(control.retryAfterMs, { announce: true });
        }
        if (control.type === 'realtime_token_invalid') {
          // Solo el backend puede afirmar que el capability dejó de ser válido. Los
          // fallos de red/gateway antes de `chater_ready` conservan el token vigente y
          // evitan gastar una HTTP Response extra pidiendo /api/realtime/token.
          clearCachedRealtimeToken();
          if (state.eventSource === source) {
            source.close();
            state.eventSource = null;
          }
          if (!state.realtimeManualClose && getSessionToken() && state.realtimeLeader && !isRealtimeRetryDeferred()) {
            scheduleRealtimeReconnect();
          }
        }
      } catch {}
    });
    source.onerror = () => {
      if (state.eventSource !== source) return;
      // Un error previo a `chater_ready` también puede ser una caída de red o gateway.
      // No invalidamos el capability por inferencia: el backend envía
      // `realtime_token_invalid` cuando la causa sí es definitiva.
      // Una caída antes de chater_ready también consumió (o intentó consumir) una
      // HTTP Response SSE. Medimos desde que se creó EventSource para que fallos de
      // handshake/gateway muy cortos aumenten la penalización y no formen tormentas.
      const durationAnchor = state.realtimeOpenedAt || state.realtimeAttemptStartedAt;
      const duration = durationAnchor ? Date.now() - durationAnchor : 0;
      if (duration > 0 && duration < realtimeShortConnectionMs) state.realtimeShortDisconnects = Math.min(6, state.realtimeShortDisconnects + 1);
      if (state.realtimeManualClose || !getSessionToken() || !state.realtimeLeader || isRealtimeRetryDeferred()) {
        closeRealtime();
        return;
      }
      scheduleRealtimeReconnect();
    };
    if (state.realtimeManualClose || openSeq !== state.realtimeOpenSeq || !getSessionToken() || !state.realtimeLeader) {
      source.close();
      return null;
    }
    state.eventSource = source;
    return source;
  })();
  state.realtimeOpeningPromise = opening;
  try {
    return await opening;
  } finally {
    if (state.realtimeOpeningPromise === opening) state.realtimeOpeningPromise = null;
  }
}

function armRealtimeReconnect(delayMs = 0) {
  if (!state.realtimeLeader || state.realtimeReconnectTimer || !getSessionToken() || state.realtimeRetryBlocked || isRealtimeRetryDeferred()) return false;
  const delay = Math.max(50, Number(delayMs || 0));
  state.realtimeReconnectTimer = window.setTimeout(async () => {
    state.realtimeReconnectTimer = 0;
    if (!getSessionToken() || !state.user || !state.realtimeLeader || isRealtimeRetryDeferred() || document.visibilityState !== 'visible' || navigator.onLine === false) return;
    try {
      await openRealtime();
    } catch {
      scheduleRealtimeReconnect();
    }
  }, delay);
  return true;
}

function scheduleRealtimeReconnect() {
  if (!state.realtimeLeader || state.realtimeReconnectTimer || !getSessionToken() || state.realtimeRetryBlocked || isRealtimeRetryDeferred()) return;
  if (state.eventSource) state.eventSource.close();
  state.eventSource = null;
  state.realtimeAttemptStartedAt = 0;
  state.realtimeOpenedAt = 0;
  if (state.realtimeStableTimer) window.clearTimeout(state.realtimeStableTimer);
  state.realtimeStableTimer = 0;
  const shared = syncRealtimeBackoffState();
  const retryCount = Math.max(Number(state.realtimeRetryCount || 0), Number(shared.retryCount || 0));
  const shortDisconnects = Math.max(Number(state.realtimeShortDisconnects || 0), Number(shared.shortDisconnects || 0));
  const penalty = Math.min(4, shortDisconnects);
  const exponent = Math.min(6, retryCount + penalty);
  const base = Math.min(60000, 1800 * (2 ** exponent));
  const jitter = 0.7 + (Math.random() * 0.6);
  const delay = Math.round(base * jitter);
  const until = Math.max(Number(shared.until || 0), Date.now() + delay);
  persistRealtimeBackoffState({
    retryCount: Math.min(8, retryCount + 1),
    shortDisconnects,
    until
  });
  armRealtimeReconnect(until - Date.now());
}

function sortChats() {
  state.chats.sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
}

function clearActiveChatState() {
  stopPresenceRefresh();
  if (state.voiceDictating) stopVoiceDictation({ announce: false });
  const previousChatId = state.activeChatId;
  if (state.typingTimer) window.clearTimeout(state.typingTimer);
  state.typingTimer = 0;
  if (previousChatId) sendTyping(false, { chatId: previousChatId }).catch(() => null);
  state.activeChatId = '';
  state.replyToMessage = null;
  state.editingMessage = null;
  state.forwardingMessage = null;
  state.scheduleModalOpen = false;
  state.scheduledMessages = [];
  state.scheduledLoadedChatId = '';
  state.scheduledLoading = false;
  state.schedulingMessage = false;
  state.highlightedMessageId = '';
  state.selectedMessageIds = new Set();
  state.selectionDeleteModalOpen = false;
  state.selectionDeleteBusy = false;
  state.starredPanelOpen = false;
  state.starredMessages = [];
  state.starredNextCursor = null;
  state.starredHasMore = false;
  state.chatSearchQuery = '';
  state.chatSearchOpen = false;
  state.chatSearchResults = [];
  state.chatSearchNextCursor = null;
  state.chatSearchHasMore = false;
  state.quickRepliesOpen = false;
  closeLinkLibrary();
  closeContactNicknameModal();
  closeCommandPalette();
  if (els.chatSearchInput) els.chatSearchInput.value = '';
  setCachedHtml('messagesHtml', els.messages, '');
}


function removeChat(chatId = '') {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return;
  state.chats = state.chats.filter((item) => item.chatId !== cleanChatId);
  state.pinnedMessagesByChat.delete(cleanChatId);
  state.messageHistoryCoverageByChat.delete(cleanChatId);
  state.messageHistoryRequestsByChat.delete(cleanChatId);
  if (state.activeChatId === cleanChatId) clearActiveChatState();
}

function upsertChat(chat = {}) {
  if (!chat.chatId) return;
  const belongsInCurrentView = state.chatListMode === 'unread'
    ? true
    : Boolean(chat.isArchived) === Boolean(state.archivedView);
  if (!belongsInCurrentView) {
    removeChat(chat.chatId);
    return;
  }
  const index = state.chats.findIndex((item) => item.chatId === chat.chatId);
  if (index >= 0) state.chats[index] = { ...state.chats[index], ...chat };
  else state.chats.unshift(chat);
  sortChats();
}

function stopPresenceRefresh() {
  // La presencia de chatER se actualiza exclusivamente por el stream SSE.
}

function applyChatPresence(chatId = '', presence = {}) {
  const cleanChatId = String(chatId || presence.chatId || '').trim();
  if (!cleanChatId || !presence || typeof presence !== 'object') return false;
  const index = state.chats.findIndex((item) => item.chatId === cleanChatId);
  if (index < 0) return false;
  const current = state.chats[index];
  const currentPresence = current.presence && typeof current.presence === 'object' ? current.presence : {};
  const nextPresence = { ...currentPresence, ...presence };
  const currentOnline = Boolean(current.otherOnline || currentPresence.otherOnline || currentPresence.status === 'online');
  const nextOnline = Boolean(nextPresence.otherOnline || nextPresence.status === 'online');
  const visualChanged = currentOnline !== nextOnline || String(currentPresence.status || '') !== String(nextPresence.status || '');
  state.chats[index] = {
    ...current,
    presence: nextPresence,
    otherOnline: nextOnline
  };
  return visualChanged;
}

function upsertContact(contact = {}) {
  if (!contact.userId) return;
  const normalized = {
    ...contact,
    contactName: contact.contactName || contact.nickname || contact.displayName || contact.email || 'Contacto'
  };
  const index = state.contacts.findIndex((item) => item.userId === normalized.userId);
  if (index >= 0) state.contacts[index] = { ...state.contacts[index], ...normalized };
  else state.contacts.push(normalized);
  state.contacts.sort((a, b) => String(contactDisplayName(a)).localeCompare(String(contactDisplayName(b)), 'es'));
}

function applyContactToChats(contact = {}) {
  if (!contact?.userId) return;
  let changed = false;
  state.chats = state.chats.map((chat) => {
    const other = chat.other || {};
    if (other.userId !== contact.userId) return chat;
    changed = true;
    return {
      ...chat,
      other: {
        ...other,
        nickname: contact.nickname || '',
        contactName: contact.contactName || contact.nickname || other.displayName || other.email || 'Contacto'
      }
    };
  });
  if (changed) sortChats();
}

function applyUpdatedContact(contact = {}) {
  if (!contact?.userId) return;
  upsertContact(contact);
  applyContactToChats(contact);
}

function getContactByUserId(userId = '') {
  const cleanUserId = String(userId || '').trim();
  if (!cleanUserId) return null;
  return state.contacts.find((contact) => contact.userId === cleanUserId) || null;
}

function contactPreviewKey(code = '') {
  return String(code || '').trim().toLowerCase();
}

function isSelfProfile(profile = {}) {
  return Boolean(profile?.userId && state.user?.userId && profile.userId === state.user.userId);
}

function isContactSavedProfile(profile = {}) {
  if (!profile?.userId) return false;
  if (isSelfProfile(profile)) return true;
  return Boolean(getContactByUserId(profile.userId));
}

function cancelContactPreviewRetry(key = '') {
  const cleanKey = contactPreviewKey(key);
  const timer = cleanKey ? state.contactLinkPreviewRetryTimers.get(cleanKey) : null;
  if (timer) window.clearTimeout(timer);
  if (cleanKey) state.contactLinkPreviewRetryTimers.delete(cleanKey);
}

function scheduleContactPreviewRetry(key = '', delayMs = contactPreviewRetryDelayMs) {
  const cleanKey = contactPreviewKey(key);
  if (!cleanKey || state.contactLinkPreviewRetryTimers.has(cleanKey)) return;
  const safeDelay = Math.max(800, Number(delayMs) || contactPreviewRetryDelayMs);
  const timer = window.setTimeout(() => {
    state.contactLinkPreviewRetryTimers.delete(cleanKey);
    if (state.user) renderAll();
  }, safeDelay);
  state.contactLinkPreviewRetryTimers.set(cleanKey, timer);
}

function setContactLinkPreview(code = '', preview = {}) {
  const key = contactPreviewKey(code || preview.code || preview.profile?.profileCode || '');
  if (!key) return;
  const status = preview.status || 'ready';
  if (status !== 'loading' || !preview.retryable) cancelContactPreviewRetry(key);
  state.contactLinkPreviews.set(key, {
    code: code || preview.code || preview.profile?.profileCode || '',
    status,
    profile: preview.profile || null,
    saved: Boolean(preview.saved || (preview.profile && isContactSavedProfile(preview.profile))),
    retryable: Boolean(preview.retryable),
    retryableExhausted: Boolean(preview.retryableExhausted),
    attempts: Math.max(0, Number(preview.attempts || 0)),
    nextRetryAt: Math.max(0, Number(preview.nextRetryAt || 0)),
    updatedAt: new Date().toISOString()
  });
}

function shouldRetryContactLinkPreview(preview = {}) {
  return Boolean(
    preview?.status === 'loading'
    && preview.retryable
    && Number(preview.attempts || 0) < contactPreviewMaxAttempts
    && Date.now() >= Number(preview.nextRetryAt || 0)
  );
}

function localContactPreviewForCode(code = '') {
  const cleanCode = String(code || '').trim();
  if (!cleanCode) return null;
  if (state.user?.profileCode === cleanCode) {
    return { code: cleanCode, status: 'ready', profile: state.user, saved: true };
  }
  const contact = state.contacts.find((item) => item.profileCode === cleanCode);
  if (contact) return { code: cleanCode, status: 'ready', profile: contact, saved: true };
  return null;
}

function snapshotContactLinkPreviews(candidates = []) {
  const map = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = contactPreviewKey(candidate.code);
    if (!key) continue;
    map.set(key, state.contactLinkPreviews.get(key) || localContactPreviewForCode(candidate.code) || { code: candidate.code, status: 'loading' });
  }
  return map;
}

async function postContactPreviewWithTimeout(body = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), contactPreviewRequestTimeoutMs)
    : null;
  try {
    return await post('/api/contacts/preview-code', body || {}, { signal: controller?.signal });
  } catch (error) {
    if (/AbortError/i.test(error?.name || '')) {
      const timeoutError = new Error('La vista previa del contacto tardó demasiado.');
      timeoutError.status = 0;
      timeoutError.retryable = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

async function postContactPreviewBatchWithTimeout(items = []) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), contactPreviewRequestTimeoutMs)
    : null;
  try {
    return await post('/api/contacts/preview-code/batch', { items }, { signal: controller?.signal });
  } catch (error) {
    if (/AbortError/i.test(error?.name || '')) {
      const timeoutError = new Error('Las vistas previas de contactos tardaron demasiado.');
      timeoutError.status = 0;
      timeoutError.retryable = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

function applyContactPreviewFailure(candidate = {}, previousAttempts = 0, error = null) {
  const key = contactPreviewKey(candidate.code);
  if (!key) return;
  const retryable = !error?.status || error.status >= 500 || navigator.onLine === false;
  const attempts = Math.max(0, Number(previousAttempts || 0)) + 1;
  const shouldKeepTrying = retryable && attempts < contactPreviewMaxAttempts;
  const retryDelay = contactPreviewRetryDelayMs * attempts;
  setContactLinkPreview(candidate.code, {
    code: candidate.code,
    status: shouldKeepTrying ? 'loading' : 'missing',
    profile: null,
    saved: false,
    retryable: shouldKeepTrying,
    retryableExhausted: retryable && !shouldKeepTrying,
    attempts,
    nextRetryAt: shouldKeepTrying ? Date.now() + retryDelay : 0
  });
  if (shouldKeepTrying) scheduleContactPreviewRetry(key, retryDelay);
}

function scheduleContactPreviewBatchFlush(delayMs = contactPreviewBatchDelayMs) {
  if (state.contactLinkPreviewBatchTimer || !state.contactLinkPreviewQueue.size || !state.user) return;
  state.contactLinkPreviewBatchTimer = window.setTimeout(() => {
    state.contactLinkPreviewBatchTimer = 0;
    flushContactPreviewBatch().catch(() => null);
  }, Math.max(0, Number(delayMs) || contactPreviewBatchDelayMs));
}

async function flushContactPreviewBatch() {
  if (!state.user || !state.contactLinkPreviewQueue.size) return;
  const queuedEntries = Array.from(state.contactLinkPreviewQueue.entries()).slice(0, contactPreviewBatchMaxItems);
  const batch = [];
  for (const [key, queued] of queuedEntries) {
    state.contactLinkPreviewQueue.delete(key);
    if (!queued?.candidate || state.contactLinkPreviewInFlight.has(key)) continue;
    state.contactLinkPreviewInFlight.add(key);
    batch.push({ key, ...queued });
  }
  if (!batch.length) {
    scheduleContactPreviewBatchFlush();
    return;
  }

  try {
    const data = await postContactPreviewBatchWithTimeout(batch.map(({ candidate }) => ({
      code: candidate.code,
      link: candidate.url || candidate.visible || ''
    })));
    const byCode = new Map((Array.isArray(data.previews) ? data.previews : []).map((preview) => [contactPreviewKey(preview.code), preview]));
    for (const item of batch) {
      const preview = byCode.get(item.key);
      if (preview?.status === 'ready' && preview?.profile?.userId) {
        setContactLinkPreview(item.candidate.code, {
          code: preview.code || item.candidate.code,
          status: 'ready',
          profile: preview.profile || preview.contact || null,
          saved: Boolean(preview.saved)
        });
        continue;
      }
      if (preview?.status === 'missing') {
        setContactLinkPreview(item.candidate.code, { code: item.candidate.code, status: 'missing', profile: null, saved: false });
        continue;
      }
      applyContactPreviewFailure(item.candidate, item.previousAttempts, { status: 503 });
    }
  } catch (error) {
    for (const item of batch) applyContactPreviewFailure(item.candidate, item.previousAttempts, error);
  } finally {
    for (const item of batch) state.contactLinkPreviewInFlight.delete(item.key);
    renderAll();
    if (state.contactLinkPreviewQueue.size) scheduleContactPreviewBatchFlush();
  }
}

function queueChatERContactPreviewLoads(candidates = []) {
  if (!state.user) return;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = contactPreviewKey(candidate.code);
    if (!key || state.contactLinkPreviewInFlight.has(key) || state.contactLinkPreviewQueue.has(key)) continue;
    const localPreview = localContactPreviewForCode(candidate.code);
    if (localPreview) {
      setContactLinkPreview(candidate.code, localPreview);
      continue;
    }
    const existingPreview = state.contactLinkPreviews.get(key);
    if (existingPreview && !shouldRetryContactLinkPreview(existingPreview)) continue;
    const previousAttempts = Math.max(0, Number(existingPreview?.attempts || 0));
    cancelContactPreviewRetry(key);
    state.contactLinkPreviewQueue.set(key, { candidate, previousAttempts });
  }
  scheduleContactPreviewBatchFlush();
}

async function saveSharedContactFromCode(code = '') {
  const cleanCode = String(code || '').trim();
  if (!cleanCode) throw new Error('El enlace de contacto no está disponible.');
  const data = await post('/api/contacts/add-code', { code: cleanCode });
  upsertContact(data.contact);
  upsertChat(data.chat);
  setContactLinkPreview(cleanCode, { code: data.contact?.profileCode || cleanCode, status: 'ready', profile: data.contact, saved: true });
  renderAll();
  showTemporaryDraftStatus('Contacto guardado. Puedes escribirle desde la tarjeta o desde tu lista de contactos.');
}

async function openSharedContactChat(userId = '', code = '') {
  const cleanUserId = String(userId || '').trim();
  if (cleanUserId) {
    await openContactChat(cleanUserId);
    return;
  }
  const cleanCode = String(code || '').trim();
  if (!cleanCode) throw new Error('No se pudo identificar el contacto compartido.');
  await addContactByCode(cleanCode);
}

function renderSharedContactMessageBody(text = '', attachment = null, options = {}) {
  const cleanText = String(text || '').trim();
  const candidates = extractChatERContactLinks(cleanText);
  if (!candidates.length) return null;
  queueChatERContactPreviewLoads(candidates);
  const textWithoutContactLinks = stripChatERContactLinksFromText(cleanText);
  const textHtml = textWithoutContactLinks
    ? renderLinkPreviewTextBody(textWithoutContactLinks, {
      shouldRender: true,
      textClass: options.textClass || 'ce-msg__text',
      renderTextSegment: options.renderTextSegment || renderEmojiAwareText
    })
    : '';
  const cardsHtml = renderChatERSharedContactCards(candidates, snapshotContactLinkPreviews(candidates), {
    isContactSaved: isContactSavedProfile,
    isSelfProfile
  });
  return `<div class="ce-shared-contact-message" data-contact-preview-block="LINKcontactosCHATERx">${textHtml}${cardsHtml}</div>`;
}

function resetRetryableContactLinkPreviews() {
  let changed = false;
  for (const [key, preview] of state.contactLinkPreviews.entries()) {
    if ((preview?.status === 'loading' && preview?.retryable) || preview?.retryableExhausted) {
      cancelContactPreviewRetry(key);
      state.contactLinkPreviews.delete(key);
      changed = true;
    }
  }
  if (changed) renderAll();
}

function upsertMessage(message = {}) {
  if (!message.messageId || !message.chatId) return;
  const list = state.messagesByChat.get(message.chatId) || [];
  const index = list.findIndex((msg) => msg.messageId === message.messageId);
  if (index >= 0) list[index] = { ...list[index], ...message };
  else list.push(message);
  state.messagesByChat.set(message.chatId, list);
}

function shouldAcknowledgeDelivery(message = {}) {
  return Boolean(
    state.user?.userId
    && message?.messageId
    && message?.chatId
    && message.senderUserId
    && message.senderUserId !== state.user.userId
    && !isDeletedMessage(message)
  );
}

function deliveryAckQueueStorageForCurrentUser() {
  return state.user?.userId ? `${deliveryAckQueueStorageKey}:${state.user.userId}` : deliveryAckQueueStorageKey;
}

function readDeliveryAckQueue() {
  try {
    const now = Date.now();
    const parsed = JSON.parse(localStorage.getItem(deliveryAckQueueStorageForCurrentUser()) || '[]');
    return (Array.isArray(parsed) ? parsed : [])
      .map((item) => ({
        chatId: String(item.chatId || '').trim(),
        messageId: String(item.messageId || '').trim(),
        senderUserId: String(item.senderUserId || '').trim(),
        createdAt: String(item.createdAt || '').trim(),
        firstQueuedAt: Number(item.firstQueuedAt || Date.now()),
        lastAttemptAt: Number(item.lastAttemptAt || 0),
        nextAttemptAt: Number(item.nextAttemptAt || 0),
        attempts: Math.max(0, Number(item.attempts || 0))
      }))
      .filter((item) => item.chatId
        && item.messageId
        && item.attempts < deliveryAckMaxAttempts
        && now - item.firstQueuedAt <= deliveryAckMaxAgeMs)
      .slice(-250);
  } catch {
    return [];
  }
}

function writeDeliveryAckQueue(items = []) {
  const normalized = (Array.isArray(items) ? items : [])
    .filter((item) => item?.chatId && item?.messageId)
    .slice(-250);
  try {
    if (normalized.length) localStorage.setItem(deliveryAckQueueStorageForCurrentUser(), JSON.stringify(normalized));
    else localStorage.removeItem(deliveryAckQueueStorageForCurrentUser());
  } catch {}
}

function deliveryAckQueueKey(chatId = '', messageId = '') {
  return `${String(chatId || '').trim()}:${String(messageId || '').trim()}`;
}

function removeDeliveryAckFromQueue(chatId = '', messageId = '') {
  const key = deliveryAckQueueKey(chatId, messageId);
  const remaining = readDeliveryAckQueue().filter((item) => deliveryAckQueueKey(item.chatId, item.messageId) !== key);
  writeDeliveryAckQueue(remaining);
}

function queueDeliveryAck(message = {}, { attempted = false } = {}) {
  if (!shouldAcknowledgeDelivery(message)) return false;
  const key = deliveryAckQueueKey(message.chatId, message.messageId);
  const now = Date.now();
  const queue = readDeliveryAckQueue();
  const index = queue.findIndex((item) => deliveryAckQueueKey(item.chatId, item.messageId) === key);
  const previous = index >= 0 ? queue[index] : null;
  const firstQueuedAt = Number(previous?.firstQueuedAt || now);
  const attempts = attempted ? Number(previous?.attempts || 0) + 1 : Number(previous?.attempts || 0);
  if (attempts >= deliveryAckMaxAttempts || now - firstQueuedAt > deliveryAckMaxAgeMs) {
    removeDeliveryAckFromQueue(message.chatId, message.messageId);
    return false;
  }
  const delay = attempted ? Math.min(5 * 60 * 1000, 1000 * (2 ** Math.min(8, attempts))) : 0;
  const next = {
    chatId: String(message.chatId || '').trim(),
    messageId: String(message.messageId || '').trim(),
    senderUserId: String(message.senderUserId || '').trim(),
    createdAt: String(message.createdAt || '').trim(),
    firstQueuedAt,
    lastAttemptAt: attempted ? now : Number(previous?.lastAttemptAt || 0),
    // Un replay SSE o un evento repetido no puede adelantar el backoff ya ganado.
    nextAttemptAt: attempted
      ? now + delay
      : previous
        ? Math.max(now, Number(previous.nextAttemptAt || now))
        : now,
    attempts
  };
  if (index >= 0) queue[index] = next;
  else queue.push(next);
  writeDeliveryAckQueue(queue);
  return true;
}

function scheduleDeliveryAckRetry(delayMs = 4000) {
  const delay = Math.max(100, Number(delayMs || 4000));
  const targetAt = Date.now() + delay;
  if (state.deliveryAckRetryTimer && Number(state.deliveryAckRetryAt || 0) > 0 && Number(state.deliveryAckRetryAt) <= targetAt) return;
  if (state.deliveryAckRetryTimer) window.clearTimeout(state.deliveryAckRetryTimer);
  state.deliveryAckRetryAt = targetAt;
  state.deliveryAckRetryTimer = window.setTimeout(() => {
    state.deliveryAckRetryTimer = 0;
    state.deliveryAckRetryAt = 0;
    flushDeliveryAckQueue().catch(() => null);
  }, Math.max(100, targetAt - Date.now()));
}

async function acknowledgeMessageDelivered(message = {}) {
  if (!shouldAcknowledgeDelivery(message)) return false;
  const key = deliveryAckQueueKey(message.chatId, message.messageId);
  if (state.deliveryAckInFlight.has(key)) return false;
  if (!queueDeliveryAck(message)) return false;
  // Las confirmaciones recibidas por SSE se agrupan durante una ventana mínima.
  // Así una ráfaga de mensajes consume una sola HTTP Response en lugar de una por mensaje.
  scheduleDeliveryAckRetry(deliveryAckBatchDelayMs);
  return true;
}

function deliveryAckResultKey(item = {}) {
  return deliveryAckQueueKey(item.chatId, item.messageId);
}

function deliveryAckMessageFromQueueItem(item = {}) {
  return {
    chatId: item.chatId,
    messageId: item.messageId,
    senderUserId: item.senderUserId || 'pending',
    createdAt: item.createdAt || ''
  };
}

function scheduleNextDeliveryAckFlush() {
  const pending = readDeliveryAckQueue();
  if (!pending.length) return;
  const now = Date.now();
  const nextAttemptAt = pending.reduce((earliest, item) => {
    const candidate = Math.max(now, Number(item.nextAttemptAt || 0));
    return !earliest || candidate < earliest ? candidate : earliest;
  }, 0);
  scheduleDeliveryAckRetry(Math.max(100, nextAttemptAt - now));
}

async function flushDeliveryAckQueue({ force = false } = {}) {
  if (!state.user || !getSessionToken()) return false;
  if (navigator.onLine === false && !force) return false;
  const now = Date.now();
  const queue = readDeliveryAckQueue();
  const due = queue
    .filter((item) => !state.deliveryAckInFlight.has(deliveryAckResultKey(item)))
    .filter((item) => Number(item.nextAttemptAt || 0) <= now || (force && Number(item.attempts || 0) === 0))
    .slice(0, deliveryAckBatchMaxItems);
  if (!due.length) {
    scheduleNextDeliveryAckFlush();
    return false;
  }

  const keys = due.map(deliveryAckResultKey);
  for (const key of keys) state.deliveryAckInFlight.add(key);
  try {
    const data = await post('/api/chats/delivery/batch', {
      deliveries: due.map((item) => ({ chatId: item.chatId, messageId: item.messageId }))
    });
    const results = Array.isArray(data.results) ? data.results : [];
    const byKey = new Map(results.map((item) => [deliveryAckResultKey(item), item]));
    for (const item of due) {
      const result = byKey.get(deliveryAckResultKey(item));
      if (result && (result.confirmed === true || result.final === true)) {
        removeDeliveryAckFromQueue(item.chatId, item.messageId);
        continue;
      }
      queueDeliveryAck(deliveryAckMessageFromQueueItem(item), { attempted: true });
    }
  } catch (error) {
    for (const item of due) {
      if (isDefinitiveHttpError(error)) removeDeliveryAckFromQueue(item.chatId, item.messageId);
      else queueDeliveryAck(deliveryAckMessageFromQueueItem(item), { attempted: true });
    }
  } finally {
    for (const key of keys) state.deliveryAckInFlight.delete(key);
  }

  scheduleNextDeliveryAckFlush();
  return true;
}

function acknowledgeMessagesDelivered(messages = []) {
  const candidates = (Array.isArray(messages) ? messages : []).filter(shouldAcknowledgeDelivery);
  for (const message of candidates) queueDeliveryAck(message);
  if (candidates.length) scheduleDeliveryAckRetry(deliveryAckBatchDelayMs);
}

function renderChatSearchVisibility() {
  const open = Boolean(state.activeChatId && state.chatSearchOpen);
  els.chatSearchArea?.classList.toggle('hidden', !open);
  if (els.chatSearchInput) els.chatSearchInput.disabled = !open;
  if (els.btnShowStarred) els.btnShowStarred.disabled = !open;
  const toggleButton = els.activeChatHeader?.querySelector('[data-toggle-chat-search]');
  if (toggleButton) {
    toggleButton.classList.toggle('active', open);
    toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggleButton.setAttribute('aria-label', open ? 'Ocultar búsqueda en este chat' : 'Buscar en este chat');
    toggleButton.setAttribute('title', open ? 'Ocultar búsqueda en este chat' : 'Buscar en este chat');
  }
}

function setChatSearchOpen(open = false, { focus = false } = {}) {
  state.chatSearchOpen = Boolean(open && state.activeChatId);
  renderChatSearchVisibility();
  if (state.chatSearchOpen && focus && els.chatSearchInput) {
    window.requestAnimationFrame(() => {
      els.chatSearchInput?.focus();
      els.chatSearchInput?.select();
    });
  }
}

function toggleChatSearch({ focus = true } = {}) {
  if (!state.activeChatId) throw new Error('Selecciona un chat antes de buscar mensajes.');
  setChatSearchOpen(!state.chatSearchOpen, { focus });
}

function resetChatSearch({ keepInput = false } = {}) {
  state.chatSearchQuery = '';
  state.chatSearchResults = [];
  state.chatSearchLoading = false;
  state.chatSearchNextCursor = null;
  state.chatSearchHasMore = false;
  state.starredPanelOpen = false;
  state.starredMessages = [];
  state.starredLoading = false;
  state.starredNextCursor = null;
  state.starredHasMore = false;
  state.highlightedMessageId = '';
  if (!keepInput && els.chatSearchInput) els.chatSearchInput.value = '';
  renderSearchPanel();
}

function renderSearchPanel() {
  if (!els.chatSearchPanel) return;
  const query = state.chatSearchQuery || els.chatSearchInput?.value?.trim() || '';
  els.btnShowStarred?.classList.toggle('active', Boolean(state.starredPanelOpen));
  if (state.starredPanelOpen) {
    if (!state.activeChatId) {
      els.chatSearchPanel.classList.add('hidden');
      els.chatSearchPanel.innerHTML = '';
      return;
    }
    els.chatSearchPanel.classList.remove('hidden');
    if (state.starredLoading) {
      els.chatSearchPanel.innerHTML = '<div class="ce-search-empty">Cargando mensajes destacados...</div>';
      return;
    }
    if (!state.starredMessages.length) {
      els.chatSearchPanel.innerHTML = '<div class="ce-search-empty">Aún no tienes mensajes destacados en este chat.</div>';
      return;
    }
    const count = state.starredMessages.length;
    els.chatSearchPanel.innerHTML = `
      <div class="ce-search-summary">${count} ${count === 1 ? 'destacado' : 'destacados'} · privados para tu cuenta</div>
      <div class="ce-search-results">
        ${state.starredMessages.map((msg) => {
          const mine = msg.senderUserId === state.user?.userId;
          return `<button class="ce-search-result" type="button" data-search-message-id="${escapeHtml(msg.messageId)}">
            <strong>${uiIcon('star')}<span>${mine ? 'Tú' : 'Contacto'} · ${formatMessageTime(msg.createdAt)}</span></strong>
            <span>${escapeHtml(msg.excerpt || msg.text || '')}</span>
          </button>`;
        }).join('')}
      </div>
      ${state.starredHasMore ? '<button class="ce-link" type="button" data-starred-load-more="1">Cargar más destacados</button>' : ''}`;
    return;
  }
  if (!state.activeChatId || (!query && !state.chatSearchLoading)) {
    els.chatSearchPanel.classList.add('hidden');
    els.chatSearchPanel.innerHTML = '';
    return;
  }
  els.chatSearchPanel.classList.remove('hidden');
  if (state.chatSearchLoading) {
    els.chatSearchPanel.innerHTML = '<div class="ce-search-empty">Buscando mensajes...</div>';
    return;
  }
  if (!state.chatSearchResults.length) {
    els.chatSearchPanel.innerHTML = `<div class="ce-search-empty">No encontramos mensajes con “${escapeHtml(query)}”.</div>`;
    return;
  }
  const count = state.chatSearchResults.length;
  els.chatSearchPanel.innerHTML = `
    <div class="ce-search-summary">${count} ${count === 1 ? 'resultado' : 'resultados'} · más recientes primero</div>
    <div class="ce-search-results">
      ${state.chatSearchResults.map((msg) => {
        const mine = msg.senderUserId === state.user?.userId;
        return `<button class="ce-search-result" type="button" data-search-message-id="${escapeHtml(msg.messageId)}">
          <strong>${mine ? 'Tú' : 'Contacto'} · ${formatMessageTime(msg.createdAt)}</strong>
          <span>${escapeHtml(msg.excerpt || msg.text || '')}</span>
        </button>`;
      }).join('')}
    </div>
    ${state.chatSearchHasMore ? '<button class="ce-link" type="button" data-search-load-more="1">Cargar más resultados</button>' : ''}`;
}

async function searchActiveChat(query = '', { append = false } = {}) {
  const cleanQuery = String(query || '').trim();
  const sameQuery = cleanQuery === state.chatSearchQuery;
  setChatSearchOpen(true);
  state.starredPanelOpen = false;
  if (!state.activeChatId || cleanQuery.length < 2) {
    state.chatSearchQuery = cleanQuery;
    state.chatSearchResults = [];
    state.chatSearchNextCursor = null;
    state.chatSearchHasMore = false;
    renderSearchPanel();
    return;
  }
  const shouldAppend = Boolean(append && sameQuery && state.chatSearchHasMore && state.chatSearchNextCursor !== null);
  state.chatSearchLoading = true;
  state.chatSearchQuery = cleanQuery;
  if (!shouldAppend) {
    state.chatSearchResults = [];
    state.chatSearchNextCursor = null;
    state.chatSearchHasMore = false;
  }
  renderSearchPanel();
  try {
    const data = await post('/api/chats/search', {
      chatId: state.activeChatId,
      query: cleanQuery,
      limit: 30,
      cursor: shouldAppend ? state.chatSearchNextCursor : null
    });
    const incoming = Array.isArray(data.matches) ? data.matches : [];
    state.chatSearchQuery = data.query || cleanQuery;
    state.chatSearchResults = shouldAppend
      ? Array.from(new Map([...state.chatSearchResults, ...incoming].map((message) => [message.messageId, message])).values())
      : incoming;
    state.chatSearchNextCursor = data.page?.nextCursor ?? null;
    state.chatSearchHasMore = Boolean(data.page?.hasMore && state.chatSearchNextCursor !== null);
  } catch (error) {
    if (!shouldAppend) state.chatSearchResults = [];
    state.chatSearchQuery = cleanQuery;
    els.chatSearchPanel.classList.remove('hidden');
    els.chatSearchPanel.innerHTML = `<div class="ce-search-empty">${escapeHtml(error.message || 'No se pudo buscar en este chat.')}</div>`;
    return;
  } finally {
    state.chatSearchLoading = false;
  }
  renderSearchPanel();
}

async function loadStarredMessages({ append = false } = {}) {
  if (!state.activeChatId) return;
  const shouldAppend = Boolean(append && state.starredHasMore && state.starredNextCursor !== null);
  setChatSearchOpen(true);
  state.starredPanelOpen = true;
  state.starredLoading = true;
  if (!shouldAppend) {
    state.starredMessages = [];
    state.starredNextCursor = null;
    state.starredHasMore = false;
  }
  state.chatSearchQuery = '';
  if (els.chatSearchInput) els.chatSearchInput.value = '';
  renderSearchPanel();
  try {
    const data = await post('/api/chats/starred', {
      chatId: state.activeChatId,
      limit: 40,
      cursor: shouldAppend ? state.starredNextCursor : null
    });
    const incoming = Array.isArray(data.messages) ? data.messages : [];
    state.starredMessages = shouldAppend
      ? Array.from(new Map([...state.starredMessages, ...incoming].map((message) => [message.messageId, message])).values())
      : incoming;
    state.starredNextCursor = data.page?.nextCursor ?? null;
    state.starredHasMore = Boolean(data.page?.hasMore && state.starredNextCursor !== null);
  } catch (error) {
    if (!shouldAppend) state.starredMessages = [];
    els.chatSearchPanel.classList.remove('hidden');
    els.chatSearchPanel.innerHTML = `<div class="ce-search-empty">${escapeHtml(error.message || 'No se pudieron cargar los mensajes destacados.')}</div>`;
    return;
  } finally {
    state.starredLoading = false;
  }
  renderSearchPanel();
}

function syncStarredPanelMessage(message = {}) {
  if (!message?.messageId) return;
  const index = state.starredMessages.findIndex((item) => item.messageId === message.messageId);
  if (message.isStarred) {
    if (index >= 0) state.starredMessages[index] = { ...state.starredMessages[index], ...message };
    else state.starredMessages.unshift(message);
  } else if (index >= 0) {
    state.starredMessages.splice(index, 1);
  }
}

async function setMessageStar(messageId = '', starred = true) {
  if (!state.activeChatId || !messageId) return;
  const data = await post('/api/chats/star', { chatId: state.activeChatId, messageId, starred });
  upsertMessage(data.message);
  syncStarredPanelMessage(data.message);
  syncGlobalStarredMessage(data.message);
  renderAll();
}

async function setMessagePinned(messageId = '', pinned = true) {
  if (!state.activeChatId || !messageId) return;
  const data = await post('/api/chats/message-pin', { chatId: state.activeChatId, messageId, pinned });
  if (data.chat) upsertChat(data.chat);
  if (data.pinned && data.message?.messageId) cachePinnedMessagesForChat(state.activeChatId, [data.message]);
  syncPinnedStateForChat(state.activeChatId, data.pinnedMessageIds || data.chat?.pinnedMessageIds || []);
  upsertMessage(data.message);
  renderAll();
  showTemporaryDraftStatus(data.pinned ? 'Mensaje fijado en este chat.' : 'Mensaje desfijado.');
}

function invalidateMessageHistoryCoverage(chatId = '') {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return;
  state.messageHistoryCoverageByChat.delete(cleanChatId);
}

function canReuseMessageHistory(chatId = '', maxMessages = 500) {
  const cleanChatId = String(chatId || '').trim();
  const coverage = cleanChatId ? state.messageHistoryCoverageByChat.get(cleanChatId) : null;
  const cached = cleanChatId ? state.messagesByChat.get(cleanChatId) : null;
  if (!coverage || !Array.isArray(cached)) return false;
  const safeMax = Math.min(500, Math.max(1, Number(maxMessages || 500)));
  const hasCoverage = Boolean(coverage.complete) || Number(coverage.maxMessages || 0) >= safeMax;
  if (!hasCoverage) return false;
  const loadedAt = Number(coverage.loadedAt || 0);
  const recentlyLoaded = loadedAt > 0 && Date.now() - loadedAt <= messageHistoryFreshReuseMs;
  return recentlyLoaded || hasHealthySharedRealtimeLease();
}

async function loadMessageHistoryPages(chatId = '', { maxMessages = 500, pageSize = 120 } = {}) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return [];
  const safeMax = Math.min(500, Math.max(1, Number(maxMessages || 500)));
  const safePageSize = Math.min(120, Math.max(20, Number(pageSize || 120)));
  if (canReuseMessageHistory(cleanChatId, safeMax)) {
    return (state.messagesByChat.get(cleanChatId) || []).slice(-safeMax);
  }

  const existingRequest = state.messageHistoryRequestsByChat.get(cleanChatId);
  if (existingRequest) {
    const loaded = await existingRequest.promise;
    if (Number(existingRequest.maxMessages || 0) >= safeMax || canReuseMessageHistory(cleanChatId, safeMax)) {
      return (state.messagesByChat.get(cleanChatId) || loaded || []).slice(-safeMax);
    }
  }

  const request = (async () => {
    let cursor = 0;
    let messages = [];
    let complete = false;
    const maxPages = Math.ceil(safeMax / safePageSize) + 1;
    for (let pageIndex = 0; pageIndex < maxPages && messages.length < safeMax; pageIndex += 1) {
      const data = await post('/api/chats/messages', {
        chatId: cleanChatId,
        limit: Math.min(safePageSize, safeMax - messages.length),
        cursor
      });
      const batch = Array.isArray(data.messages) ? data.messages : [];
      if (batch.length) messages = [...batch, ...messages];
      const nextCursor = Number(data.page?.nextCursor);
      const hasMore = Boolean(data.page?.hasMore);
      if (!hasMore) {
        complete = true;
        break;
      }
      if (!Number.isFinite(nextCursor) || nextCursor <= cursor) break;
      cursor = nextCursor;
    }
    const loaded = messages.slice(-safeMax);
    state.messagesByChat.set(cleanChatId, loaded);
    state.messageHistoryCoverageByChat.set(cleanChatId, {
      loadedAt: Date.now(),
      maxMessages: loaded.length,
      complete
    });
    return loaded;
  })();

  state.messageHistoryRequestsByChat.set(cleanChatId, { maxMessages: safeMax, promise: request });
  try {
    return await request;
  } finally {
    if (state.messageHistoryRequestsByChat.get(cleanChatId)?.promise === request) {
      state.messageHistoryRequestsByChat.delete(cleanChatId);
    }
  }
}

async function openSearchResult(messageId = '') {
  if (!state.activeChatId || !messageId) return;
  state.highlightedMessageId = messageId;
  const currentMessages = state.messagesByChat.get(state.activeChatId) || [];
  if (!currentMessages.some((msg) => msg.messageId === messageId)) {
    const messages = await loadMessageHistoryPages(state.activeChatId, { maxMessages: 500 });
    state.messagesByChat.set(state.activeChatId, messages);
  }
  renderAll();
  window.setTimeout(focusHighlightedMessage, 30);
}

function syncReadReceiptsFromReadEvent(payload = {}, data = {}) {
  const chatId = String(payload.chatId || data.chat?.chatId || '').trim();
  const readerUserId = String(data.readerUserId || payload.actorUserId || '').trim();
  const readAt = String(data.readAt || '').trim();
  if (!chatId || !readerUserId || readerUserId === state.user?.userId || !readAt) return false;
  const readMs = Date.parse(readAt) || 0;
  if (!readMs) return false;
  const list = state.messagesByChat.get(chatId) || [];
  if (!list.length) return false;
  let changed = false;
  const updated = list.map((message) => {
    if (message.senderUserId !== state.user?.userId || isDeletedMessage(message)) return message;
    const createdMs = Date.parse(message.createdAt || '') || 0;
    if (!createdMs || readMs < createdMs) return message;
    const recipientCount = Math.max(1, Number(message.recipientCount || 1));
    const deliveredByCount = Math.min(recipientCount, Math.max(Number(message.deliveredByCount || 0), 1));
    const readByCount = Math.min(recipientCount, Math.max(Number(message.readByCount || 0), 1));
    const next = {
      ...message,
      recipientCount,
      deliveredByCount,
      deliveredAt: message.deliveredAt || message.backendReceivedAt || message.createdAt || '',
      readByCount,
      receiptStatus: readByCount >= recipientCount ? 'read' : 'delivered',
      readAt: readByCount >= recipientCount ? readAt : (message.readAt || '')
    };
    changed = changed
      || next.receiptStatus !== message.receiptStatus
      || next.deliveredByCount !== message.deliveredByCount
      || next.readByCount !== message.readByCount
      || next.readAt !== message.readAt;
    return next;
  });
  if (changed) state.messagesByChat.set(chatId, updated);
  return changed;
}

function syncExpiringMessagesFromReadEvent(data = {}) {
  const currentUserId = state.user?.userId || '';
  const scopedMessages = currentUserId && Array.isArray(data.expiringMessagesByUserId?.[currentUserId])
    ? data.expiringMessagesByUserId[currentUserId]
    : null;
  const messages = scopedMessages || (Array.isArray(data.expiringMessages) ? data.expiringMessages : []);
  let changed = false;
  for (const message of messages) {
    if (!message?.messageId || !message?.chatId) continue;
    upsertMessage(message);
    syncStarredPanelMessage(message);
    syncGlobalStarredMessage(message);
    changed = true;
  }
  return changed;
}

function applyRealtimeSnapshot(data = {}) {
  const previousActiveChatId = state.activeChatId;
  if (data.user) state.user = data.user;
  if (Array.isArray(data.contacts)) {
    state.contacts = data.contacts.map((contact) => ({
      ...contact,
      contactName: contact.contactName || contact.nickname || contact.displayName || contact.email || 'Contacto'
    }));
    state.contacts.sort((a, b) => String(contactDisplayName(a)).localeCompare(String(contactDisplayName(b)), 'es'));
  }
  if (Array.isArray(data.chats)) {
    state.chats = data.chats;
    sortChats();
    if (previousActiveChatId && !state.chats.some((chat) => chat.chatId === previousActiveChatId)) clearActiveChatState();
    else state.activeChatId = previousActiveChatId;
  }
  if (data.notificationPreferences) state.notificationPreferences = normalizeNotificationPreferences(data.notificationPreferences || {});
  renderAll();
}

function handleRealtimeEvent(payload = {}) {
  const data = payload.data || {};
  if (payload.eventType === 'stream.snapshot') {
    applyRealtimeSnapshot(data);
    return;
  }
  const currentUserId = state.user?.userId || '';
  const chatForThisUser = data.chatByUserId?.[currentUserId] || data.chat;
  const messageForThisUser = data.messageByUserId?.[currentUserId] || data.message;
  let shouldRender = false;
  if (chatForThisUser) {
    upsertChat(chatForThisUser);
    if (Array.isArray(chatForThisUser.pinnedMessageIds)) syncPinnedStateForChat(chatForThisUser.chatId, chatForThisUser.pinnedMessageIds);
    shouldRender = true;
  }
  if (data.contact && payload.recipientUserIds?.includes?.(state.user?.userId)) {
    applyUpdatedContact(data.contact);
    shouldRender = true;
  }
  if (messageForThisUser) {
    if (messageForThisUser.clientMessageId) removeQueuedMessage(messageForThisUser.clientMessageId, { render: false });
    upsertMessage(messageForThisUser);
    if (messageForThisUser.isPinned) cachePinnedMessagesForChat(messageForThisUser.chatId, [messageForThisUser]);
    // Solo la pestaña líder posee el transporte SSE real. Las pestañas seguidoras
    // reciben este mismo evento por BroadcastChannel/localStorage y no deben crear
    // otra HTTP Response de confirmación para el mismo mensaje.
    if (state.realtimeLeader) acknowledgeMessageDelivered(messageForThisUser).catch(() => null);
    if (state.replyToMessage?.messageId === messageForThisUser.messageId) {
      state.replyToMessage = isDeletedMessage(messageForThisUser) ? null : { ...state.replyToMessage, ...messageForThisUser };
    }
    if (state.editingMessage?.messageId === messageForThisUser.messageId) {
      if (isDeletedMessage(messageForThisUser)) {
        state.editingMessage = null;
        loadDraftForChat(state.activeChatId);
      } else {
        state.editingMessage = { ...state.editingMessage, ...messageForThisUser };
      }
    }
    shouldRender = true;
  }
  if (data.scheduledMessage?.scheduledId) {
    if (['message.scheduled.cancelled', 'message.scheduled.sent'].includes(payload.eventType)) {
      state.scheduledMessages = state.scheduledMessages.filter((item) => item.scheduledId !== data.scheduledMessage.scheduledId);
    } else {
      const index = state.scheduledMessages.findIndex((item) => item.scheduledId === data.scheduledMessage.scheduledId);
      if (index >= 0) state.scheduledMessages[index] = { ...state.scheduledMessages[index], ...data.scheduledMessage };
      else state.scheduledMessages.unshift(data.scheduledMessage);
    }
    shouldRender = true;
  }
  const isOwnDraftRealtimeEvent = isCurrentDraftOrigin(data.sourceDraftOriginId || data.draftOriginId || '');
  const realtimeDraftChatId = String(data.draft?.chatId || data.chatId || payload.chatId || '').trim();
  const realtimeDraftEventMs = Date.parse(payload.createdAt || '') || Date.now();
  if (!isOwnDraftRealtimeEvent && (payload.eventType === 'chat.draft.updated' || payload.eventType === 'chat.draft.deleted')) {
    // El SSE ya transporta el delta autoritativo del borrador. Mantener el panel con
    // ese mismo delta evita convertir cada autosalvado de otra pestaña en una nueva
    // HTTP Response /api/chats/drafts/list.
    applyDraftListRealtimeDelta(payload.eventType, data.draft || null, realtimeDraftChatId, realtimeDraftEventMs);
  }
  if (payload.eventType === 'chat.draft.updated' && !isOwnDraftRealtimeEvent && realtimeDraftChatId) {
    const remoteText = String(data.draft?.text || '');
    const remoteMs = remoteDraftSavedMs(data.draft || {});
    const localMs = Number(readDraftPayload(realtimeDraftChatId)?.savedAt || 0);
    if (realtimeDraftChatId === state.activeChatId && !state.editingMessage?.messageId) {
      if (remoteText.trim() && remoteMs >= localMs && els.messageInput && remoteText !== els.messageInput.value && !isActiveDraftComposerProtected(state.activeChatId)) {
        applyRemoteDraftToActiveInput(state.activeChatId, remoteText, remoteMs || Date.now(), 'Borrador sincronizado desde tu cuenta.');
        state.draftRemoteLoadedChats.add(realtimeDraftChatId);
        state.draftLastSyncedTextByChat.set(realtimeDraftChatId, remoteText);
      } else if (isActiveDraftComposerProtected(state.activeChatId) || remoteMs < localMs) {
        // Hay una edición local más nueva/en curso: no la sobrescribimos y permitimos
        // una única reconciliación HTTP futura si SSE no logra resolver el conflicto.
        state.draftRemoteLoadedChats.delete(realtimeDraftChatId);
        if (remoteMs < localMs) state.draftLastSyncedTextByChat.delete(realtimeDraftChatId);
      } else {
        if (remoteText.trim() && remoteMs >= localMs) writeDraftPayload(realtimeDraftChatId, remoteText, remoteMs || Date.now());
        state.draftRemoteLoadedChats.add(realtimeDraftChatId);
        if (remoteMs >= localMs) state.draftLastSyncedTextByChat.set(realtimeDraftChatId, remoteText);
      }
    } else if (remoteText.trim() && remoteMs >= localMs) {
      // El evento SSE ya contiene el borrador completo. Actualizar la caché local evita
      // una respuesta /draft/get cuando el usuario abra posteriormente este chat.
      writeDraftPayload(realtimeDraftChatId, remoteText, remoteMs || Date.now());
      state.draftRemoteLoadedChats.add(realtimeDraftChatId);
      state.draftLastSyncedTextByChat.set(realtimeDraftChatId, remoteText);
    } else {
      state.draftRemoteLoadedChats.delete(realtimeDraftChatId);
      if (remoteMs < localMs) state.draftLastSyncedTextByChat.delete(realtimeDraftChatId);
    }
  }
  if (payload.eventType === 'chat.draft.deleted' && !isOwnDraftRealtimeEvent && realtimeDraftChatId) {
    const localDraft = readDraftPayload(realtimeDraftChatId);
    const localMs = Number(localDraft?.savedAt || 0);
    if (realtimeDraftChatId === state.activeChatId && !state.editingMessage?.messageId) {
      if (localDraft?.text && localDraft.text === els.messageInput?.value && !isActiveDraftComposerProtected(state.activeChatId) && realtimeDraftEventMs >= localMs) {
        removeLocalDraftPayload(state.activeChatId);
        els.messageInput.value = '';
        setDraftStatus('');
        updateComposerControls();
        state.draftRemoteLoadedChats.add(realtimeDraftChatId);
        state.draftLastSyncedTextByChat.set(realtimeDraftChatId, '');
      } else if (!localDraft?.text && !isActiveDraftComposerProtected(state.activeChatId)) {
        state.draftRemoteLoadedChats.add(realtimeDraftChatId);
        state.draftLastSyncedTextByChat.set(realtimeDraftChatId, '');
      } else {
        state.draftRemoteLoadedChats.delete(realtimeDraftChatId);
      }
    } else if (!localDraft?.text || realtimeDraftEventMs >= localMs) {
      removeLocalDraftPayload(realtimeDraftChatId);
      state.draftRemoteLoadedChats.add(realtimeDraftChatId);
      state.draftLastSyncedTextByChat.set(realtimeDraftChatId, '');
    } else {
      state.draftRemoteLoadedChats.delete(realtimeDraftChatId);
    }
  }
  if ((payload.eventType === 'chat.privateNote.updated' || payload.eventType === 'chat.privateNote.deleted') && (data.chatId || payload.chatId) === state.activeChatId) {
    if (payload.eventType === 'chat.privateNote.deleted') applyPrivateNoteDelete(data.noteId || data.note?.noteId || '');
    else applyPrivateNoteUpsert(data.note);
    renderPrivateNotesModal();
  }
  if (payload.eventType === 'contact.block.updated' && data.targetUserId) {
    applyBlockStatusForTargetUser(data.targetUserId, data.blockStatus || {});
    applyBlockedContactDelta({ targetUserId: data.targetUserId, blocked: Boolean(data.blocked), blockedContact: data.blockedContact || null });
    if (state.voiceDictating && isChatInteractionBlocked()) stopVoiceDictation({ announce: false });
    if (state.blockedContactsOpen) renderBlockedContactsModal();
    shouldRender = true;
  }
  if (data.reminder?.reminderId) {
    if (['chat.reminder.completed'].includes(payload.eventType)) {
      state.reminders = state.reminders.filter((item) => item.reminderId !== data.reminder.reminderId);
    } else {
      const index = state.reminders.findIndex((item) => item.reminderId === data.reminder.reminderId);
      if (index >= 0) state.reminders[index] = { ...state.reminders[index], ...data.reminder };
      else state.reminders.unshift(data.reminder);
      state.reminders.sort((a, b) => (Date.parse(a.remindFor || '') || 0) - (Date.parse(b.remindFor || '') || 0));
    }
    if (payload.eventType === 'chat.reminder.due') showTemporaryDraftStatus(`Recordatorio: ${compactText(data.reminder.text || '', 140)}`, 5200);
    renderReminderModal();
  }
  if (payload.eventType === 'chat.labels.updated' || payload.eventType === 'chat.labels.deleted') {
    if (Array.isArray(data.allLabels)) applyLabelCatalog(data.allLabels);
    else if (payload.eventType === 'chat.labels.updated') applyLabelDelta(data);
    else removeLabelFromState(data.label || '');
    if (payload.eventType === 'chat.labels.updated' && data.chatId === state.activeChatId && state.labelsModalOpen) {
      state.labelsDraft = normalizeChatLabelList(data.labels || []).join(', ');
      renderLabelsModal();
    }
    shouldRender = true;
  }
  if (payload.eventType === 'message.hidden' && Array.isArray(data.messageIds) && (data.chatId || payload.chatId)) {
    const hiddenChatId = data.chatId || payload.chatId;
    const hiddenIds = new Set(data.messageIds.filter(Boolean));
    state.messagesByChat.set(hiddenChatId, (state.messagesByChat.get(hiddenChatId) || []).filter((message) => !hiddenIds.has(message.messageId)));
    invalidateMessageHistoryCoverage(hiddenChatId);
    const cachedPinned = (state.pinnedMessagesByChat.get(hiddenChatId) || []).filter((message) => !hiddenIds.has(message?.messageId));
    if (cachedPinned.length) state.pinnedMessagesByChat.set(hiddenChatId, cachedPinned);
    else state.pinnedMessagesByChat.delete(hiddenChatId);
    if (hiddenChatId === state.activeChatId) {
      for (const messageId of hiddenIds) state.selectedMessageIds?.delete?.(messageId);
      pruneMessageSelection();
    }
    state.starredMessages = state.starredMessages.filter((message) => !hiddenIds.has(message.messageId));
    state.globalStarredMessages = state.globalStarredMessages.filter((item) => !(item.chat?.chatId === hiddenChatId && hiddenIds.has(item.message?.messageId)));
    shouldRender = true;
  }
  if ((['message.star.updated', 'message.deleted', 'message.expired'].includes(payload.eventType)) && messageForThisUser) {
    syncStarredPanelMessage(messageForThisUser);
    syncGlobalStarredMessage(messageForThisUser);
  }
  if (payload.eventType === 'presence.updated' && data.chatId && data.presence) {
    shouldRender = applyChatPresence(data.chatId, data.presence) || shouldRender;
  }
  if (payload.eventType === 'chat.read') {
    shouldRender = syncReadReceiptsFromReadEvent(payload, data) || shouldRender;
    shouldRender = syncExpiringMessagesFromReadEvent(data) || shouldRender;
  }
  if (payload.eventType === 'chat.unread.cleared') {
    shouldRender = syncExpiringMessagesFromReadEvent(data) || shouldRender;
  }
  if (payload.eventType === 'chat.typing' && data.userId !== state.user?.userId && payload.chatId === state.activeChatId) {
    els.typingStatus.textContent = data.isTyping ? 'Escribiendo...' : '';
    if (data.isTyping) window.setTimeout(() => { els.typingStatus.textContent = ''; }, 5200);
  }
  if (shouldRender) renderAll();
  if (canConfirmReadInActiveChat() && messageForThisUser?.chatId === state.activeChatId) {
    const mine = messageForThisUser.senderUserId === state.user?.userId;
    if (mine || isMessagesNearBottom()) markActiveRead();
  }
}

function stableRenderNodeKeys(node = null) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return [];
  const element = node;
  const keys = [];
  if (element.dataset?.messageId) keys.push(`message:${element.dataset.messageId}`);
  if (element.dataset?.clientMessageId) keys.push(`client-message:${element.dataset.clientMessageId}`);
  if (element.dataset?.outboxId) keys.push(`outbox:${element.dataset.outboxId}`);
  if (element.dataset?.chatId) keys.push(`chat:${element.dataset.chatId}`);
  if (element.dataset?.contactId) keys.push(`contact:${element.dataset.contactId}`);
  if (element.dataset?.unreadMarkerFor) keys.push(`unread:${element.dataset.unreadMarkerFor}`);
  if (element.dataset?.avatarKey) keys.push(`avatar:${element.dataset.avatarKey}`);
  if (element.classList?.contains('ce-chat__identity')) keys.push('active-chat-identity');
  if (element.classList?.contains('ce-chat__tools')) keys.push('active-chat-tools');
  if (element.classList?.contains('ce-pinned-strip')) keys.push('active-pinned-strip');
  if (element.classList?.contains('ce-block-notice')) keys.push('active-block-notice');
  if (element.classList?.contains('ce-chat-empty')) keys.push('active-chat-empty');
  if (element.classList?.contains('ce-empty-title')) keys.push('active-empty-title');
  return keys.filter(Boolean);
}

function stableRenderNodeKey(node = null) {
  return stableRenderNodeKeys(node)[0] || '';
}

function shareStableRenderKey(current = null, next = null) {
  const currentKeys = stableRenderNodeKeys(current);
  const nextKeys = stableRenderNodeKeys(next);
  if (!currentKeys.length || !nextKeys.length) return true;
  const currentSet = new Set(currentKeys);
  return nextKeys.some((key) => currentSet.has(key));
}

function canPatchRenderNode(current = null, next = null) {
  if (!current || !next || current.nodeType !== next.nodeType) return false;
  if (current.nodeType !== Node.ELEMENT_NODE) return true;
  if (current.tagName !== next.tagName) return false;
  return shareStableRenderKey(current, next);
}

function normalizeRenderUrl(value = '') {
  try {
    return new URL(String(value || ''), document.baseURI).href;
  } catch {
    return String(value || '');
  }
}

function syncRenderAttributes(current = null, next = null) {
  if (!current || !next || current.nodeType !== Node.ELEMENT_NODE || next.nodeType !== Node.ELEMENT_NODE) return;
  for (const attr of Array.from(current.attributes)) {
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  }
  for (const attr of Array.from(next.attributes)) {
    if (current.tagName === 'IMG' && attr.name === 'src' && normalizeRenderUrl(current.getAttribute('src')) === normalizeRenderUrl(attr.value)) continue;
    if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  }
}

function patchRenderNode(current = null, next = null) {
  if (!canPatchRenderNode(current, next)) {
    const replacement = next.cloneNode(true);
    current?.replaceWith(replacement);
    return replacement;
  }
  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return current;
  }
  syncRenderAttributes(current, next);
  patchRenderChildren(current, Array.from(next.childNodes));
  return current;
}

function findReusableRenderChild(nextChild = null, keyedCurrent = new Map(), cursor = null, used = new Set()) {
  for (const key of stableRenderNodeKeys(nextChild)) {
    const candidate = keyedCurrent.get(key);
    if (candidate && !used.has(candidate) && canPatchRenderNode(candidate, nextChild)) return candidate;
  }
  if (cursor && !used.has(cursor) && canPatchRenderNode(cursor, nextChild)) return cursor;
  return null;
}

function patchRenderChildren(parent = null, nextChildren = []) {
  if (!parent) return;
  const keyedCurrent = new Map();
  for (const child of Array.from(parent.childNodes)) {
    for (const key of stableRenderNodeKeys(child)) {
      if (key && !keyedCurrent.has(key)) keyedCurrent.set(key, child);
    }
  }
  const used = new Set();
  let cursor = parent.firstChild;
  for (const nextChild of nextChildren) {
    while (cursor && used.has(cursor)) cursor = cursor.nextSibling;
    const currentChild = findReusableRenderChild(nextChild, keyedCurrent, cursor, used);
    const referenceNode = cursor && !used.has(cursor) ? cursor : null;
    const patched = currentChild ? patchRenderNode(currentChild, nextChild) : nextChild.cloneNode(true);
    if (!currentChild) parent.insertBefore(patched, referenceNode);
    else if (patched !== referenceNode) parent.insertBefore(patched, referenceNode);
    used.add(patched);
    if (patched === cursor) cursor = cursor.nextSibling;
  }
  for (const child of Array.from(parent.childNodes)) {
    if (!used.has(child)) child.remove();
  }
}

function setCachedHtml(cacheKey = '', element = null, html = '') {
  if (!element) return false;
  const value = String(html || '');
  if (state.renderCache?.[cacheKey] === value) return false;
  const template = document.createElement('template');
  template.innerHTML = value;
  patchRenderChildren(element, Array.from(template.content.childNodes));
  if (state.renderCache) state.renderCache[cacheKey] = value;
  return true;
}

function renderAll() {
  renderChats();
  renderContacts();
  renderLabelFilters();
  renderActiveChat();
  renderSearchPanel();
  renderReplyDraft();
  renderQuickRepliesPanel();
  renderIconInsertPickerPanel();
  renderForwardModal();
  renderContactShareModal();
  renderScheduleModal();
  renderGlobalSearchModal();
  renderGlobalStarredModal();
  renderDraftsModal();
  renderLinkLibraryModal();
  renderChatBriefModal();
  renderDateJumpModal();
  renderCommandPalette();
  renderContactNicknameModal();
  renderPrivacyLockOverlay();
  updateNotificationPauseButton();
  updateResponsiveShellState();
  scheduleAppNavigationHistorySync();
}


function isMobileChatListPrimaryViewport() {
  return Boolean(window.matchMedia?.('(max-width: 620px)')?.matches || window.innerWidth <= 620);
}

function updateResponsiveShellState() {
  const hasActiveChat = Boolean(state.activeChatId && activeChat());
  els.chatScreen?.classList.toggle('ce-shell--chat-open', hasActiveChat);
  els.appRoot?.classList.toggle('ce-app--chat-open', hasActiveChat);
  document.body.classList.toggle('ce-mobile-chat-open', hasActiveChat);
}

function closeResponsiveChatPane() {
  if (!state.activeChatId) return;
  saveActiveDraft({ announce: false });
  clearActiveChatState();
  renderAll();
  window.requestAnimationFrame?.(() => {
    const activeRow = els.chatList?.querySelector('[data-chat-id]');
    activeRow?.focus?.();
  });
}

function isAppNavigationElementOpen(element = null) {
  return Boolean(element && !element.classList.contains('hidden'));
}

function currentAppNavigationLayers() {
  if (!state.user || !els.chatScreen || els.chatScreen.classList.contains('hidden')) return [];
  const layers = [];
  const contactsVisible = isAppNavigationElementOpen(els.contactList) && els.chatList?.classList.contains('hidden');
  const nonPrimaryList = contactsVisible
    || state.chatListMode !== 'active'
    || Boolean(state.archivedView)
    || Boolean(normalizeChatLabelName(state.activeLabelFilter || ''));
  if (nonPrimaryList) layers.push('list-mode');
  if (state.activeChatId && activeChat()) layers.push('chat');
  if (state.chatSearchOpen) layers.push('chat-search');
  if (state.starredPanelOpen) layers.push('chat-starred');
  if (isMessageSelectionActive()) layers.push('message-selection');
  if (els.messages?.querySelector('.ce-msg.is-controls-open')) layers.push('message-controls');
  if (state.quickRepliesOpen) layers.push('quick-replies');
  if (state.slashCommandsOpen) layers.push('slash-commands');
  if (state.iconInsertPanelOpen) layers.push('emoji-picker');
  if (state.attachmentPickerOpen) layers.push('attachment-picker');
  if (state.attachmentPickerOpen && state.attachmentPickerView === 'chater') layers.push('attachment-picker-chater');
  if (state.sendModeMenuOpen) layers.push('send-mode');
  if (state.selectionDeleteModalOpen) layers.push('selection-delete');
  if (state.forwardingMessage?.messageId) layers.push('forward');
  if (state.scheduleModalOpen) layers.push('schedule');
  if (state.pollModalOpen) layers.push('poll');
  if (state.privateNotesOpen) layers.push('private-notes');
  if (state.remindersOpen) layers.push('reminders');
  if (state.labelsModalOpen) layers.push('labels');
  if (state.blockedContactsOpen) layers.push('blocked-contacts');
  if (state.contactNicknameModalOpen) layers.push('contact-nickname');
  if (state.globalSearchOpen) layers.push('global-search');
  if (state.globalStarredOpen) layers.push('global-starred');
  if (state.draftsOpen) layers.push('drafts');
  if (state.linkLibraryOpen) layers.push('link-library');
  if (state.chatBriefOpen) layers.push('chat-brief');
  if (state.dateJumpOpen) layers.push('date-jump');
  if (state.commandPaletteOpen) layers.push('command-palette');
  if (state.privacyLock.mode !== 'closed' && !state.privacyLock.locked) layers.push('privacy-settings');
  if (isAppNavigationElementOpen(els.qrModal)) layers.push('qr');
  if (state.contactShareModalOpen) layers.push('contact-share');
  const imageViewer = document.getElementById('ceImageViewer');
  if (isAppNavigationElementOpen(imageViewer)) layers.push('image-viewer');
  return layers;
}

function closeTopAppNavigationLayer(layer = '') {
  switch (layer) {
    case 'image-viewer':
      closeImageViewer();
      break;
    case 'contact-share':
      closeContactShareModal();
      break;
    case 'qr':
      closeQrModal();
      break;
    case 'privacy-settings':
      closePrivacyLockSettings();
      break;
    case 'command-palette':
      closeCommandPalette();
      break;
    case 'date-jump':
      closeDateJump();
      break;
    case 'chat-brief':
      closeChatBrief();
      break;
    case 'link-library':
      closeLinkLibrary();
      break;
    case 'drafts':
      closeDraftsModal();
      break;
    case 'global-starred':
      closeGlobalStarred();
      break;
    case 'global-search':
      closeGlobalSearch();
      break;
    case 'contact-nickname':
      closeContactNicknameModal();
      break;
    case 'blocked-contacts':
      closeBlockedContactsModal();
      break;
    case 'labels':
      closeLabelsModal();
      break;
    case 'reminders':
      closeReminderModal();
      break;
    case 'private-notes':
      closePrivateNotesModal();
      break;
    case 'poll':
      closePollModal();
      break;
    case 'schedule':
      closeScheduleModal();
      break;
    case 'forward':
      closeForwardModal();
      break;
    case 'selection-delete':
      closeSelectionDeleteModal();
      break;
    case 'send-mode':
      closeSendModeMenu();
      break;
    case 'attachment-picker-chater':
      state.attachmentPickerView = 'options';
      renderAttachmentPicker();
      break;
    case 'attachment-picker':
      closeAttachmentPicker();
      break;
    case 'emoji-picker':
      closeIconInsertPicker();
      break;
    case 'slash-commands':
      state.slashCommandsOpen = false;
      renderSlashCommandsPanel();
      break;
    case 'quick-replies':
      closeQuickRepliesPanel();
      break;
    case 'message-controls':
      closeOpenMessageControls();
      break;
    case 'message-selection':
      clearMessageSelection();
      break;
    case 'chat-starred':
      state.starredPanelOpen = false;
      state.starredMessages = [];
      state.starredLoading = false;
      renderSearchPanel();
      break;
    case 'chat-search':
      setChatSearchOpen(false);
      break;
    case 'chat':
      closeResponsiveChatPane();
      break;
    case 'list-mode':
      state.activeLabelFilter = '';
      showChatListMode('active');
      renderAll();
      loadChats({ includeArchived: false, unreadOnly: false, mode: 'active' }).catch(() => null);
      break;
    default:
      break;
  }
}

function captureAppNavigationPrimaryView() {
  const contactsVisible = isAppNavigationElementOpen(els.contactList) && els.chatList?.classList.contains('hidden');
  const listMode = contactsVisible ? 'contacts' : normalizeChatListMode(state.chatListMode);
  return {
    listMode,
    activeLabelFilter: normalizeChatLabelName(state.activeLabelFilter || ''),
    activeChatId: String(state.activeChatId || '').trim()
  };
}

function appNavigationPrimarySignature(view = captureAppNavigationPrimaryView()) {
  return JSON.stringify({
    listMode: String(view?.listMode || 'active'),
    activeLabelFilter: normalizeChatLabelName(view?.activeLabelFilter || ''),
    activeChatId: String(view?.activeChatId || '').trim()
  });
}

function buildAppNavigationHistoryState(depth = currentAppNavigationLayers().length, view = captureAppNavigationPrimaryView()) {
  const currentState = history.state && typeof history.state === 'object' ? history.state : {};
  return {
    ...currentState,
    __ceAppNavigation: true,
    ceNavigationDepth: Math.max(0, Number(depth) || 0),
    ceNavigationPrimaryView: view,
    ceNavigationPrimarySignature: appNavigationPrimarySignature(view)
  };
}

async function restoreAppNavigationPrimaryView(view = null) {
  if (!view || typeof view !== 'object' || !state.user) return;
  const currentView = captureAppNavigationPrimaryView();
  const desiredChatId = String(view.activeChatId || '').trim();
  const desiredFilter = normalizeChatLabelName(view.activeLabelFilter || '');
  const desiredListMode = String(view.listMode || 'active') === 'contacts'
    ? 'contacts'
    : normalizeChatListMode(view.listMode || 'active');
  const listModeChanged = String(currentView.listMode || 'active') !== desiredListMode;

  state.activeLabelFilter = desiredFilter;
  if (desiredListMode === 'contacts') {
    showContactsTab();
  } else {
    showChatListMode(desiredListMode);
    if (listModeChanged) {
      await loadChats({
        includeArchived: desiredListMode === 'archived',
        unreadOnly: desiredListMode === 'unread',
        mode: desiredListMode
      }).catch(() => null);
      showChatListMode(desiredListMode);
    }
  }

  if (desiredChatId) {
    if (state.activeChatId !== desiredChatId) {
      if (!state.chats.some((chat) => chat.chatId === desiredChatId)) {
        await loadChats({
          includeArchived: desiredListMode === 'archived',
          unreadOnly: desiredListMode === 'unread',
          mode: desiredListMode === 'contacts' ? 'active' : desiredListMode
        }).catch(() => null);
        if (desiredListMode === 'contacts') showContactsTab();
      }
      if (state.chats.some((chat) => chat.chatId === desiredChatId)) {
        await selectChat(desiredChatId).catch(() => null);
      }
    }
  } else if (state.activeChatId) {
    closeResponsiveChatPane();
  }

  if (!desiredChatId) {
    renderAll();
    if (desiredListMode === 'contacts') showContactsTab();
    else showChatListMode(desiredListMode);
  }
}

function scheduleAppNavigationHistorySync() {
  if (!appNavigationHistoryInitialized || appNavigationHistoryHandlingPop || appNavigationHistoryReconcilingTo != null) return;
  if (appNavigationHistorySyncFrame) return;
  appNavigationHistorySyncFrame = 1;
  const run = () => {
    appNavigationHistorySyncFrame = 0;
    syncAppNavigationHistory();
  };
  if (typeof window.queueMicrotask === 'function') window.queueMicrotask(run);
  else Promise.resolve().then(run);
}

function syncAppNavigationHistory() {
  if (!appNavigationHistoryInitialized || appNavigationHistoryHandlingPop || appNavigationHistoryReconcilingTo != null) return;
  const targetDepth = currentAppNavigationLayers().length;
  const targetView = captureAppNavigationPrimaryView();
  const targetPrimarySignature = appNavigationPrimarySignature(targetView);

  if (targetDepth === 0 && appNavigationHistoryDepth === 0) {
    const currentManaged = Boolean(history.state?.__ceAppNavigation);
    const currentDepth = Math.max(0, Number(history.state?.ceNavigationDepth) || 0);
    const currentSignature = String(history.state?.ceNavigationPrimarySignature || '');
    if (!currentManaged || currentDepth !== 0 || currentSignature !== targetPrimarySignature) {
      history.replaceState(buildAppNavigationHistoryState(0, targetView), '', window.location.href);
    }
    appNavigationHistoryDepth = 0;
    appNavigationHistoryPrimarySignature = targetPrimarySignature;
    return;
  }

  if (targetDepth > appNavigationHistoryDepth) {
    for (let depth = appNavigationHistoryDepth + 1; depth <= targetDepth; depth += 1) {
      history.pushState(buildAppNavigationHistoryState(depth, targetView), '', window.location.href);
    }
    appNavigationHistoryDepth = targetDepth;
    appNavigationHistoryPrimarySignature = targetPrimarySignature;
    return;
  }

  if (targetDepth < appNavigationHistoryDepth) {
    appNavigationHistoryReconcilingTo = targetDepth;
    appNavigationHistoryDepth = targetDepth;
    appNavigationHistoryPrimarySignature = targetPrimarySignature;
    history.back();
    return;
  }

  if (targetPrimarySignature !== appNavigationHistoryPrimarySignature) {
    history.pushState(buildAppNavigationHistoryState(targetDepth, targetView), '', window.location.href);
    appNavigationHistoryPrimarySignature = targetPrimarySignature;
  }
}

async function handleAppNavigationPopState(event) {
  if (!appNavigationHistoryInitialized) return;
  const managed = Boolean(event.state?.__ceAppNavigation);
  const targetDepth = managed ? Math.max(0, Number(event.state?.ceNavigationDepth) || 0) : 0;
  const targetView = managed && event.state?.ceNavigationPrimaryView && typeof event.state.ceNavigationPrimaryView === 'object'
    ? event.state.ceNavigationPrimaryView
    : null;
  const targetPrimarySignature = managed
    ? String(event.state?.ceNavigationPrimarySignature || appNavigationPrimarySignature(targetView || captureAppNavigationPrimaryView()))
    : '';

  if (appNavigationHistoryReconcilingTo != null) {
    const desiredDepth = appNavigationHistoryReconcilingTo;
    if (managed && targetDepth > desiredDepth) {
      history.back();
      return;
    }
    appNavigationHistoryDepth = targetDepth;
    appNavigationHistoryPrimarySignature = targetPrimarySignature || appNavigationPrimarySignature();
    appNavigationHistoryReconcilingTo = null;
    scheduleAppNavigationHistorySync();
    return;
  }

  if (!managed) {
    appNavigationHistoryDepth = 0;
    appNavigationHistoryPrimarySignature = '';
    return;
  }

  appNavigationHistoryHandlingPop = true;
  appNavigationHistoryDepth = targetDepth;
  appNavigationHistoryPrimarySignature = targetPrimarySignature;
  try {
    let layers = currentAppNavigationLayers();
    let guard = 40;
    while (layers.length > targetDepth && guard > 0) {
      closeTopAppNavigationLayer(layers[layers.length - 1]);
      const nextLayers = currentAppNavigationLayers();
      if (nextLayers.length >= layers.length) break;
      layers = nextLayers;
      guard -= 1;
    }
    await restoreAppNavigationPrimaryView(targetView);
  } finally {
    appNavigationHistoryHandlingPop = false;
  }
  scheduleAppNavigationHistorySync();
}

function installAppNavigationHistory() {
  if (appNavigationHistoryInitialized) return;
  const view = captureAppNavigationPrimaryView();
  appNavigationHistoryPrimarySignature = appNavigationPrimarySignature(view);
  history.replaceState(buildAppNavigationHistoryState(0, view), '', window.location.href);
  appNavigationHistoryDepth = 0;
  appNavigationHistoryInitialized = true;
  window.addEventListener('popstate', (event) => {
    handleAppNavigationPopState(event).catch(() => null);
  });
  if ('MutationObserver' in window && document.body) {
    appNavigationHistoryObserver = new MutationObserver(() => scheduleAppNavigationHistorySync());
    appNavigationHistoryObserver.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }
  scheduleAppNavigationHistorySync();
}

function getVisibleChats() {
  const list = Array.isArray(state.chats) ? state.chats : [];
  const modeList = state.chatListMode === 'unread' ? list.filter(isUnreadChat) : list;
  return modeList.filter(chatHasActiveLabel);
}

function renderChats() {
  const visibleChats = getVisibleChats();
  if (!visibleChats.length) {
    const activeFilter = normalizeChatLabelName(state.activeLabelFilter || '');
    if (state.chatsHasMore) {
      const loadMoreOnly = `<div class="ce-list-toolbar" role="status"><span>No hay coincidencias en esta página.</span><button class="ce-link" type="button" data-load-more-chats="1"${state.chatsLoading ? ' disabled' : ''}>${state.chatsLoading ? 'Cargando chats...' : 'Cargar más chats'}</button></div>`;
      setCachedHtml('chatListHtml', els.chatList, loadMoreOnly);
      return;
    }
    const emptyText = activeFilter
      ? `No hay chats con la etiqueta #${activeFilter} en esta bandeja.`
      : (state.chatListMode === 'unread'
        ? 'No tienes chats sin leer por ahora.'
        : (state.archivedView
          ? 'No tienes chats archivados.'
          : 'Agrega un contacto por correo o QR para iniciar tu primer chat.'));
    setCachedHtml('chatListHtml', els.chatList, `<div class="ce-empty">${escapeHtml(emptyText)}</div>`);
    return;
  }
  sortChats();
  const activeFilter = normalizeChatLabelName(state.activeLabelFilter || '');
  const unreadToolbar = state.chatListMode === 'unread'
    ? `<div class="ce-list-toolbar" role="group" aria-label="Acciones de no leídos"><span>${visibleChats.length} ${visibleChats.length === 1 ? 'chat pendiente' : 'chats pendientes'}</span><button class="ce-link" type="button" data-mark-all-read="1">Quitar de no leídos</button></div>`
    : '';
  const labelToolbar = activeFilter
    ? `<div class="ce-list-toolbar ce-list-toolbar--label" role="status"><span>Filtro activo: #${escapeHtml(activeFilter)}</span><button class="ce-link" type="button" data-clear-label-filter="1">Quitar filtro</button></div>`
    : '';
  const chatListHtml = `${labelToolbar}${unreadToolbar}${getVisibleChats().map((chat) => {
    const title = chatDisplayName(chat);
    const subtitle = chatDisplaySubtitle(chat);
    const queuedCount = getQueuedMessagesForChat(chat.chatId).length;
    const last = queuedCount
      ? `Pendiente de envío: ${queuedCount} mensaje${queuedCount === 1 ? '' : 's'}`
      : (isDeletedMessage(chat.lastMessage) ? 'Mensaje eliminado' : (chat.lastMessage?.text || (isSelfChat(chat) ? 'Guarda aquí notas privadas.' : 'Chat abierto')));
    const active = chat.chatId === state.activeChatId ? ' active' : '';
    const pinned = chat.isPinned ? ' is-pinned' : '';
    const unread = Number(chat.unread || 0) > 0 ? `<span class="ce-badge">${chat.unread}</span>` : '';
    const muted = chat.isMuted ? `<span class="ce-muted-pill" title="Chat silenciado" aria-label="Chat silenciado">${uiIcon('bellOff')}</span>` : '';
    const outbox = queuedCount ? `<span class="ce-outbox-pill" title="${queuedCount} mensaje pendiente de envío" aria-label="${queuedCount} mensaje pendiente de envío">${uiIcon('hourglass')}<span>${queuedCount}</span></span>` : '';
    const archived = chat.isArchived ? '<span class="ce-archived-pill" title="Chat archivado" aria-label="Chat archivado">Archivado</span>' : '';
    const blockedStatus = normalizeChatBlockStatus(chat);
    const blocked = blockedStatus.blocked ? '<span class="ce-blocked-pill" title="Comunicación pausada" aria-label="Comunicación pausada">Bloqueado</span>' : '';
    const pinLabel = chat.isPinned ? 'Desfijar chat' : 'Fijar chat arriba';
    const pinIcon = chat.isPinned ? uiIcon('pin') : uiIcon('pinOutline');
    const archiveLabel = chat.isArchived ? 'Restaurar chat' : 'Archivar chat';
    const archiveIcon = chat.isArchived ? uiIcon('undo') : uiIcon('archive');
    const pinButton = chat.isArchived ? '' : `<button class="ce-chat-pin${chat.isPinned ? ' active' : ''}" type="button" data-pin-chat-id="${escapeHtml(chat.chatId)}" data-pinned="${chat.isPinned ? '1' : '0'}" title="${escapeHtml(pinLabel)}" aria-label="${escapeHtml(pinLabel)}">${pinIcon}</button>`;
    const archiveButton = `<button class="ce-chat-archive${chat.isArchived ? ' active' : ''}" type="button" data-archive-chat-id="${escapeHtml(chat.chatId)}" data-archived="${chat.isArchived ? '1' : '0'}" title="${escapeHtml(archiveLabel)}" aria-label="${escapeHtml(archiveLabel)}">${archiveIcon}</button>`;
    return `<div class="ce-row ce-row--chat${active}${pinned}${chat.isMuted ? ' is-muted' : ''}${chat.isArchived ? ' is-archived' : ''}${blockedStatus.blocked ? ' is-blocked' : ''}${isChatOnline(chat) ? ' is-online' : ''}" data-chat-id="${escapeHtml(chat.chatId)}" role="button" tabindex="0" aria-label="Abrir ${escapeHtml(title)}">${renderChatAvatarWithPresence(chat, 'small', { profileAction: true })}<span class="ce-row__body"><strong>${escapeHtml(title)}</strong><em title="${escapeHtml(subtitle)}">${escapeHtml(last)}</em>${renderChatLabelBadges(chat)}</span><span class="ce-row__meta">${archived}${blocked}${muted}${outbox}${unread}${pinButton}${archiveButton}</span></div>`;
  }).join('')}${state.chatsHasMore ? `<div class="ce-list-toolbar" role="status"><span>Mostrando ${visibleChats.length} chats</span><button class="ce-link" type="button" data-load-more-chats="1"${state.chatsLoading ? ' disabled' : ''}>${state.chatsLoading ? 'Cargando chats...' : 'Cargar más chats'}</button></div>` : ''}`;
  setCachedHtml('chatListHtml', els.chatList, chatListHtml);
}

function renderContacts() {
  if (!state.contacts.length && !state.contactsHasMore) {
    setCachedHtml('contactListHtml', els.contactList, '<div class="ce-empty">Todavía no tienes contactos guardados.</div>');
    return;
  }
  const rows = state.contacts.map((contact) => {
    const title = contactDisplayName(contact);
    const subtitle = contactDisplaySubtitle(contact);
    const hasNickname = Boolean(String(contact.nickname || '').trim());
    const nicknameLabel = hasNickname ? 'Editar apodo privado' : 'Agregar apodo privado';
    return `<div class="ce-row ce-row--contact${hasNickname ? ' has-nickname' : ''}" data-contact-id="${escapeHtml(contact.userId)}" role="button" tabindex="0" aria-label="Abrir chat con ${escapeHtml(title)}">${avatar(contact, 'small')}<span class="ce-row__body"><strong>${escapeHtml(title)}</strong><em>${escapeHtml(subtitle)}</em></span><span class="ce-row__meta"><button class="ce-contact-alias-btn" type="button" data-edit-contact-nickname="${escapeHtml(contact.userId)}" title="${escapeHtml(nicknameLabel)}" aria-label="${escapeHtml(nicknameLabel)}">${uiIcon('nickname')}</button></span></div>`;
  }).join('');
  const loadMore = state.contactsHasMore
    ? `<div class="ce-list-toolbar" role="status"><span>Mostrando ${state.contacts.length} contactos</span><button class="ce-link" type="button" data-load-more-contacts="1"${state.contactsLoading ? ' disabled' : ''}>${state.contactsLoading ? 'Cargando contactos...' : 'Cargar más contactos'}</button></div>`
    : '';
  setCachedHtml('contactListHtml', els.contactList, `${rows}${loadMore}`);
}

function activeChat() {
  return state.chats.find((chat) => chat.chatId === state.activeChatId) || null;
}

function findActiveMessage(messageId = '') {
  const cleanMessageId = String(messageId || '').trim();
  if (!state.activeChatId || !cleanMessageId) return null;
  const list = state.messagesByChat.get(state.activeChatId) || [];
  return list.find((message) => message.messageId === cleanMessageId) || null;
}

function cachePinnedMessagesForChat(chatId = '', messages = []) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return;
  const existing = state.pinnedMessagesByChat.get(cleanChatId) || [];
  const byId = new Map(existing.filter((message) => message?.messageId).map((message) => [message.messageId, message]));
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message?.messageId || isDeletedMessage(message)) continue;
    byId.set(message.messageId, { ...(byId.get(message.messageId) || {}), ...message });
  }
  const cached = Array.from(byId.values()).slice(-12);
  if (cached.length) state.pinnedMessagesByChat.set(cleanChatId, cached);
  else state.pinnedMessagesByChat.delete(cleanChatId);
}

function syncPinnedStateForChat(chatId = '', pinnedMessageIds = []) {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) return;
  const pinned = new Set((Array.isArray(pinnedMessageIds) ? pinnedMessageIds : []).filter(Boolean));
  const cached = (state.pinnedMessagesByChat.get(cleanChatId) || [])
    .filter((message) => pinned.has(message?.messageId) && !isDeletedMessage(message));
  if (cached.length) state.pinnedMessagesByChat.set(cleanChatId, cached);
  else state.pinnedMessagesByChat.delete(cleanChatId);

  const list = state.messagesByChat.get(cleanChatId) || [];
  if (!list.length) return;
  let changed = false;
  const updated = list.map((message) => {
    const isPinned = pinned.has(message.messageId) && !isDeletedMessage(message);
    if (Boolean(message.isPinned) === isPinned) return message;
    changed = true;
    return { ...message, isPinned };
  });
  if (changed) state.messagesByChat.set(cleanChatId, updated);
}

async function ensurePinnedMessagesLoaded(chat = {}, messages = []) {
  const chatId = String(chat?.chatId || '').trim();
  const ids = Array.from(new Set((Array.isArray(chat?.pinnedMessageIds) ? chat.pinnedMessageIds : []).filter(Boolean))).slice(0, 3);
  if (!chatId || !ids.length) {
    if (chatId) state.pinnedMessagesByChat.delete(chatId);
    return [];
  }
  const wanted = new Set(ids);
  const recentPinned = (Array.isArray(messages) ? messages : [])
    .filter((message) => wanted.has(message?.messageId) && !isDeletedMessage(message));
  cachePinnedMessagesForChat(chatId, recentPinned);
  syncPinnedStateForChat(chatId, ids);

  const cachedIds = new Set((state.pinnedMessagesByChat.get(chatId) || []).map((message) => message?.messageId).filter(Boolean));
  const missingIds = ids.filter((messageId) => !cachedIds.has(messageId));
  if (!missingIds.length) return state.pinnedMessagesByChat.get(chatId) || [];

  const data = await post('/api/chats/messages/by-ids', { chatId, messageIds: missingIds });
  cachePinnedMessagesForChat(chatId, Array.isArray(data.messages) ? data.messages : []);
  syncPinnedStateForChat(chatId, ids);
  return state.pinnedMessagesByChat.get(chatId) || [];
}

function getPinnedMessagesForChat(chat = {}, messages = []) {
  const ids = Array.isArray(chat.pinnedMessageIds) ? chat.pinnedMessageIds.filter(Boolean) : [];
  const cached = state.pinnedMessagesByChat.get(String(chat.chatId || '').trim()) || [];
  const byId = new Map(cached.filter((message) => message?.messageId).map((message) => [message.messageId, message]));
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.messageId) byId.set(message.messageId, message);
  }
  const ordered = ids.map((messageId) => byId.get(messageId)).filter((message) => message && !isDeletedMessage(message));
  const extra = [...cached, ...(messages || [])].filter((message) => message?.isPinned && !ids.includes(message.messageId) && !isDeletedMessage(message));
  const uniqueExtra = Array.from(new Map(extra.map((message) => [message.messageId, message])).values());
  return [...ordered, ...uniqueExtra].slice(0, 3);
}

function renderPinnedMessagesStrip(chat = {}, messages = []) {
  const pinned = getPinnedMessagesForChat(chat, messages);
  if (!pinned.length) return '';
  return `<div class="ce-pinned-strip" aria-label="Mensajes fijados en este chat">
    <strong>${uiIcon('pin')}<span>Fijados</span></strong>
    <div class="ce-pinned-strip__items">
      ${pinned.map((message) => `
        <span class="ce-pinned-strip__item">
          <button type="button" data-jump-message-id="${escapeHtml(message.messageId || '')}" title="Ir al mensaje fijado">${escapeHtml(compactText(message.text || '', 120))}</button>
          <button class="ce-pinned-strip__remove" type="button" data-unpin-message-id="${escapeHtml(message.messageId || '')}" title="Desfijar mensaje" aria-label="Desfijar mensaje">${uiIcon('close')}</button>
        </span>`).join('')}
    </div>
  </div>`;
}

function activeSelectedMessageIds() {
  if (!(state.selectedMessageIds instanceof Set)) state.selectedMessageIds = new Set();
  return [...state.selectedMessageIds].filter(Boolean);
}

function selectedMessagesForActiveChat() {
  const selected = new Set(activeSelectedMessageIds());
  return (state.messagesByChat.get(state.activeChatId) || [])
    .filter((message) => message?.messageId && selected.has(message.messageId) && !isDeletedMessage(message));
}

function isMessageSelectionActive() {
  return activeSelectedMessageIds().length > 0;
}

function pruneMessageSelection() {
  if (!(state.selectedMessageIds instanceof Set) || !state.selectedMessageIds.size) return 0;
  const available = new Set((state.messagesByChat.get(state.activeChatId) || [])
    .filter((message) => message?.messageId && !isDeletedMessage(message))
    .map((message) => message.messageId));
  for (const messageId of [...state.selectedMessageIds]) {
    if (!available.has(messageId)) state.selectedMessageIds.delete(messageId);
  }
  if (!state.selectedMessageIds.size) {
    state.selectionDeleteModalOpen = false;
    state.selectionDeleteBusy = false;
  }
  return state.selectedMessageIds.size;
}

function clearMessageSelection({ render = true } = {}) {
  state.selectedMessageIds = new Set();
  state.selectionDeleteModalOpen = false;
  state.selectionDeleteBusy = false;
  renderSelectionDeleteModal();
  if (render) renderAll();
}

function toggleMessageSelection(messageId = '', { forceSelected = false } = {}) {
  const message = findActiveMessage(messageId);
  if (!message || isDeletedMessage(message)) return;
  if (!(state.selectedMessageIds instanceof Set)) state.selectedMessageIds = new Set();
  if (forceSelected) state.selectedMessageIds.add(message.messageId);
  else if (state.selectedMessageIds.has(message.messageId)) state.selectedMessageIds.delete(message.messageId);
  else state.selectedMessageIds.add(message.messageId);
  state.selectionDeleteModalOpen = false;
  closeOpenMessageControls();
  renderAll();
}

function copyTextForSelectedMessage(message = {}) {
  const attachment = normalizeAttachmentClient(message.attachment || null);
  if (attachment?.kind === 'image') return 'imagen';
  if (attachment && String(attachment.mimeType || '').toLowerCase().startsWith('audio/')) return 'audio';
  if (attachment && !String(message.text || '').trim()) return 'archivo';
  return String(message.text || '').trim() || (attachment ? 'archivo' : '');
}

async function copySelectedMessages() {
  const messages = selectedMessagesForActiveChat();
  if (!messages.length) return clearMessageSelection();
  const value = messages.map(copyTextForSelectedMessage).filter(Boolean).join('\n');
  if (!value) return;
  await copyTextToClipboard(value);
  clearMessageSelection();
  showTemporaryDraftStatus(messages.length === 1 ? 'Mensaje copiado al portapapeles.' : `${messages.length} mensajes copiados al portapapeles.`);
}

function canDeleteSelectionForEveryone() {
  const messages = selectedMessagesForActiveChat();
  return Boolean(messages.length && messages.every((message) => message.senderUserId === state.user?.userId));
}

function ensureSelectionDeleteModal() {
  let modal = document.getElementById('ceSelectionDeleteModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'ceSelectionDeleteModal';
  modal.className = 'ce-modal ce-selection-delete-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Eliminar mensajes seleccionados');
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-close-selection-delete]')) {
      closeSelectionDeleteModal();
      return;
    }
    const option = event.target.closest('[data-delete-selected-scope]');
    if (!option || option.disabled) return;
    deleteSelectedMessages(option.dataset.deleteSelectedScope || 'me').catch((error) => alert(error.message || 'No se pudieron eliminar los mensajes seleccionados.'));
  });
  document.body.appendChild(modal);
  return modal;
}

function renderSelectionDeleteModal() {
  const modal = ensureSelectionDeleteModal();
  const messages = selectedMessagesForActiveChat();
  if (!state.selectionDeleteModalOpen || !messages.length) {
    modal.classList.add('hidden');
    modal.innerHTML = '';
    return;
  }
  const canEveryone = canDeleteSelectionForEveryone();
  const busy = Boolean(state.selectionDeleteBusy);
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="ce-modal__card ce-selection-delete-card">
    <button class="ce-modal__close" type="button" data-close-selection-delete="1" aria-label="Cerrar">${uiIcon('close')}</button>
    <div class="ce-selection-delete-card__head"><strong>Eliminar ${messages.length === 1 ? 'mensaje' : `${messages.length} mensajes`}</strong><span>Elige dónde quieres eliminar ${messages.length === 1 ? 'este mensaje' : 'estos mensajes'}.</span></div>
    <div class="ce-selection-delete-options">
      <button type="button" data-delete-selected-scope="me" ${busy ? 'disabled' : ''}><span class="ce-selection-delete-option__icon">${uiIcon('trash')}</span><strong>Para mí</strong><small>Se elimina solo de tu chat.</small></button>
      <button type="button" data-delete-selected-scope="everyone" ${busy || !canEveryone ? 'disabled' : ''}><span class="ce-selection-delete-option__icon">${uiIcon('trash')}</span><strong>Para todos</strong><small>${canEveryone ? 'Se elimina para todos los participantes.' : 'Disponible solo si todos los seleccionados fueron enviados por ti.'}</small></button>
    </div>
  </div>`;
}

function openSelectionDeleteModal() {
  if (!selectedMessagesForActiveChat().length) return;
  state.selectionDeleteModalOpen = true;
  state.selectionDeleteBusy = false;
  renderSelectionDeleteModal();
}

function closeSelectionDeleteModal() {
  state.selectionDeleteModalOpen = false;
  state.selectionDeleteBusy = false;
  renderSelectionDeleteModal();
}

async function deleteSelectedMessages(scope = 'me') {
  const messages = selectedMessagesForActiveChat();
  if (!messages.length || !state.activeChatId) return;
  const normalizedScope = scope === 'everyone' ? 'everyone' : 'me';
  if (normalizedScope === 'everyone' && !canDeleteSelectionForEveryone()) {
    throw new Error('Para todos solo está disponible cuando todos los mensajes seleccionados fueron enviados por ti.');
  }
  state.selectionDeleteBusy = true;
  renderSelectionDeleteModal();
  try {
    const messageIds = messages.map((message) => message.messageId);
    const data = await post('/api/chats/delete', { chatId: state.activeChatId, messageIds, scope: normalizedScope });
    if (data.chat?.chatId) upsertChat(data.chat);
    if (normalizedScope === 'me') {
      const hidden = new Set(Array.isArray(data.messageIds) ? data.messageIds : messageIds);
      state.messagesByChat.set(state.activeChatId, (state.messagesByChat.get(state.activeChatId) || []).filter((message) => !hidden.has(message.messageId)));
      invalidateMessageHistoryCoverage(state.activeChatId);
      state.starredMessages = state.starredMessages.filter((message) => !hidden.has(message.messageId));
      state.globalStarredMessages = state.globalStarredMessages.filter((item) => !(item.chat?.chatId === state.activeChatId && hidden.has(item.message?.messageId)));
    } else {
      for (const message of Array.isArray(data.messages) ? data.messages : []) upsertMessage(message);
    }
    const count = messageIds.length;
    clearMessageSelection({ render: false });
    renderAll();
    showTemporaryDraftStatus(normalizedScope === 'me'
      ? `${count} ${count === 1 ? 'mensaje eliminado' : 'mensajes eliminados'} para ti.`
      : `${count} ${count === 1 ? 'mensaje eliminado' : 'mensajes eliminados'} para todos.`);
  } finally {
    state.selectionDeleteBusy = false;
    renderSelectionDeleteModal();
  }
}

function cancelMessageSelectionLongPress() {
  if (messageSelectionLongPressTimer) window.clearTimeout(messageSelectionLongPressTimer);
  messageSelectionLongPressTimer = 0;
  messageSelectionPointer = null;
}

function bindMessageLongPressSelection() {
  if (!els.messages) return;
  els.messages.addEventListener('pointerdown', (event) => {
    if (event.button != null && event.button !== 0) return;
    if (isMessageSelectionActive()) return;
    if (event.target.closest('button, a, input, textarea, select, [role="button"]')) return;
    const messageEl = event.target.closest('.ce-msg[data-message-id]');
    if (!messageEl || !els.messages.contains(messageEl) || messageEl.classList.contains('is-deleted')) return;
    cancelMessageSelectionLongPress();
    messageSelectionPointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, messageId: messageEl.dataset.messageId || '' };
    messageSelectionLongPressTimer = window.setTimeout(() => {
      const pointer = messageSelectionPointer;
      messageSelectionLongPressTimer = 0;
      if (!pointer?.messageId) return;
      messageSelectionIgnoreClickUntil = Date.now() + 650;
      toggleMessageSelection(pointer.messageId, { forceSelected: true });
      try { navigator.vibrate?.(18); } catch {}
    }, 480);
  }, { passive: true });
  els.messages.addEventListener('pointermove', (event) => {
    const pointer = messageSelectionPointer;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) cancelMessageSelectionLongPress();
  }, { passive: true });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => els.messages.addEventListener(eventName, cancelMessageSelectionLongPress, { passive: true }));
  els.messages.addEventListener('contextmenu', (event) => {
    const messageEl = event.target.closest('.ce-msg[data-message-id]');
    if (messageEl && (isMessageSelectionActive() || Date.now() < messageSelectionIgnoreClickUntil)) event.preventDefault();
  });
}

async function copyMessageText(messageId = '') {
  const message = findActiveMessage(messageId);
  if (!message || isDeletedMessage(message)) return;
  await copyTextToClipboard(message.text || '');
  showTemporaryDraftStatus('Mensaje copiado al portapapeles.');
}

function buildMessageDeepLink(messageId = '') {
  const cleanMessageId = String(messageId || '').trim();
  if (!state.activeChatId || !cleanMessageId) return '';
  const url = new URL(window.location.href);
  url.searchParams.set('chat', state.activeChatId);
  url.searchParams.set('message', cleanMessageId);
  url.hash = '';
  return url.toString();
}

async function copyMessageLink(messageId = '') {
  const message = findActiveMessage(messageId);
  if (!message || isDeletedMessage(message)) return;
  const link = buildMessageDeepLink(message.messageId);
  await copyTextToClipboard(link);
  showTemporaryDraftStatus('Enlace interno del mensaje copiado.');
}

function formatExportDateTime(value = '') {
  const date = new Date(value || Date.now());
  return date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function safeExportFilePart(value = '') {
  return String(value || 'chat')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'chat';
}

function buildChatExportText(chat = {}, messages = []) {
  const contactName = chatDisplayName(chat);
  const lines = [
    `Exportación de chatER`,
    `Chat con: ${contactName}`,
    `Cuenta: ${state.user?.displayName || state.user?.email || 'Usuario chatER'}`,
    `Generado: ${formatExportDateTime(Date.now())}`,
    `Mensajes exportados: ${messages.length}`,
    ''.padEnd(42, '-')
  ];
  for (const message of messages) {
    const sender = message.senderUserId === state.user?.userId ? 'Tú' : contactName;
    const date = formatExportDateTime(message.createdAt);
    const body = isDeletedMessage(message) ? 'Mensaje eliminado' : String(message.text || '');
    const forwarded = message.type === 'forwarded' || message.forwardedFrom?.messageId ? ' (reenviado)' : '';
    const silent = message.silent ? ' (silencioso)' : '';
    lines.push(`[${date}] ${sender}${forwarded}${silent}:`);
    if (message.replyTo?.text) {
      const replySender = message.replyTo.senderUserId === state.user?.userId ? 'Tú' : contactName;
      lines.push(`  Respuesta a ${replySender}: ${compactText(message.replyTo.text, 160)}`);
    }
    lines.push(body || '(sin texto)', '');
  }
  return `${lines.join('\n')}\n`;
}

function downloadTextFile(filename = 'chater-export.txt', content = '') {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportActiveChat() {
  const chat = activeChat();
  if (!chat?.chatId) return;
  showTemporaryDraftStatus('Preparando exportación del chat...', 1400);
  const messages = await loadMessageHistoryPages(chat.chatId, { maxMessages: 500 });
  state.messagesByChat.set(chat.chatId, messages);
  const contactName = chatDisplayName(chat);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `chater-${safeExportFilePart(contactName)}-${stamp}.txt`;
  downloadTextFile(filename, buildChatExportText(chat, messages));
  showTemporaryDraftStatus('Chat exportado en archivo de texto.');
  renderAll();
}

function renderActiveChat() {
  const chat = activeChat();
  if (!chat) {
    state.selectedMessageIds = new Set();
    state.selectionDeleteModalOpen = false;
    renderSelectionDeleteModal();
    setCachedHtml('activeChatHeaderHtml', els.activeChatHeader, '<div class="ce-empty-title">Selecciona un chat</div>');
    state.chatSearchOpen = false;
    renderChatSearchVisibility();
    setCachedHtml('messagesHtml', els.messages, '<div class="ce-chat-empty">Tus conversaciones aparecerán aquí.</div>');
    els.messageInput.disabled = true;
    els.btnSend.disabled = true;
    state.replyToMessage = null;
    state.editingMessage = null;
    state.forwardingMessage = null;
    state.privateNotesOpen = false;
    state.privateNotes = [];
    state.privateNotesLoadedChatId = '';
    state.linkLibraryOpen = false;
    state.chatBriefOpen = false;
    state.chatBriefLoading = false;
    state.chatBriefError = '';
    state.dateJumpOpen = false;
    state.dateJumpLoading = false;
    state.dateJumpSelected = '';
    state.dateJumpDays = [];
    state.dateJumpError = '';
    state.dateJumpChatId = '';
    resetPrivateNoteEditor();
    state.remindersOpen = false;
    state.reminderMessage = null;
    state.reminders = [];
    setDraftStatus('');
    state.quickRepliesOpen = false;
    renderReplyDraft();
    renderQuickRepliesPanel();
    state.slashCommandsOpen = false;
    renderSlashCommandsPanel();
    state.renderedActiveChatId = '';
    state.scrollNewMessages = 0;
    updateComposerControls();
    updateScrollBottomButton();
    return;
  }
  const title = chatDisplayName(chat);
  const subtitle = chatDisplaySubtitle(chat);
  const muteLabel = chat.isMuted ? 'Activar notificaciones de este chat' : 'Silenciar notificaciones de este chat';
  const muteButtonHtml = isSelfChat(chat) ? '' : `
      <button class="ce-icon-btn ce-icon-btn--mute${chat.isMuted ? ' active' : ''}" type="button" data-mute-active-chat="${chat.isMuted ? '0' : '1'}" title="${escapeHtml(muteLabel)}" aria-label="${escapeHtml(muteLabel)}">
        ${bellIconSvg(Boolean(chat.isMuted))}
      </button>`;
  const blockStatus = normalizeChatBlockStatus(chat);
  const blockLabel = blockStatus.blockedByMe ? 'Desbloquear contacto' : 'Bloquear contacto';
  const blockButtonHtml = isSelfChat(chat) ? '' : `
      <button class="ce-icon-btn ce-icon-btn--block${blockStatus.blockedByMe ? ' active' : ''}" type="button" data-block-active-contact="${blockStatus.blockedByMe ? '0' : '1'}" title="${escapeHtml(blockLabel)}" aria-label="${escapeHtml(blockLabel)}">
        ${blockIconSvg(Boolean(blockStatus.blockedByMe))}
      </button>`;
  const nicknameLabel = chat.other?.nickname ? 'Editar apodo privado del contacto' : 'Agregar apodo privado al contacto';
  const nicknameButtonHtml = isSelfChat(chat) ? '' : `
      <button class="ce-icon-btn ce-icon-btn--nickname${chat.other?.nickname ? ' active' : ''}" type="button" data-edit-active-contact-nickname="1" title="${escapeHtml(nicknameLabel)}" aria-label="${escapeHtml(nicknameLabel)}">${uiIcon('nickname')}</button>`;
  pruneMessageSelection();
  const selectedCount = activeSelectedMessageIds().length;
  const searchOpen = Boolean(state.activeChatId && state.chatSearchOpen);
  const activeChatHeaderHtml = selectedCount ? `
    <button class="ce-icon-btn ce-mobile-back" type="button" data-clear-message-selection="1" title="Cancelar selección" aria-label="Cancelar selección">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.58-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z"/></svg>
    </button>
    <div class="ce-chat__identity ce-chat__identity--selection"><div><strong>${selectedCount} ${selectedCount === 1 ? 'seleccionado' : 'seleccionados'}</strong><span>Toca otros mensajes para agregarlos o quitarlos</span></div></div>
    <div class="ce-header-actions ce-chat-tools ce-selection-toolbar" aria-label="Acciones de selección">
      <button class="ce-icon-btn ce-selection-copy" type="button" data-copy-selected-messages="1" title="Copiar selección" aria-label="Copiar mensajes seleccionados">${uiIcon('copy')}</button>
      <button class="ce-icon-btn ce-selection-delete" type="button" data-delete-selected-messages="1" title="Eliminar selección" aria-label="Eliminar mensajes seleccionados">${uiIcon('trash')}</button>
    </div>` : `
    <button class="ce-icon-btn ce-mobile-back" type="button" data-close-mobile-chat="1" title="Volver a conversaciones" aria-label="Volver a conversaciones">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.58-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z"/></svg>
    </button>
    <div class="ce-chat__identity">${renderChatAvatarWithPresence(chat)}<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span>${renderActiveChatLabelBadges(chat)}</div></div>
    <div class="ce-header-actions ce-chat-tools">${muteButtonHtml}${blockButtonHtml}${nicknameButtonHtml}
      <button class="ce-icon-btn ce-icon-btn--chat-search${searchOpen ? ' active' : ''}" type="button" data-toggle-chat-search="1" title="${searchOpen ? 'Ocultar búsqueda en este chat' : 'Buscar en este chat'}" aria-label="${searchOpen ? 'Ocultar búsqueda en este chat' : 'Buscar en este chat'}" aria-expanded="${searchOpen ? 'true' : 'false'}" aria-controls="chatSearchArea">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 0 1 5.16 10.45l4.44 4.45-1.41 1.41-4.45-4.44A6.5 6.5 0 1 1 10.5 4Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/></svg>
      </button>
      <button class="ce-icon-btn ce-icon-btn--labels" type="button" data-open-labels="1" title="Etiquetas del chat" aria-label="Editar etiquetas del chat">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V5a2 2 0 0 1 2-2h8l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>
      </button>
      <button class="ce-icon-btn ce-icon-btn--archive${chat.isArchived ? ' active' : ''}" type="button" data-archive-active-chat="${chat.isArchived ? '0' : '1'}" title="${escapeHtml(chat.isArchived ? 'Restaurar chat' : 'Archivar chat')}" aria-label="${escapeHtml(chat.isArchived ? 'Restaurar chat' : 'Archivar chat')}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16l-1 5H5L4 4Zm1 7h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8Zm5 2v2h4v-2h-4Z"/></svg>
      </button>
      <button class="ce-icon-btn" type="button" data-share-active-chat="1" title="Copiar enlace interno del chat" aria-label="Copiar enlace interno del chat">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.3 3.3 0 0 0 0-1.39l7.05-4.11A2.99 2.99 0 1 0 15 5c0 .23.03.45.08.66L8.03 9.77a3 3 0 1 0 0 4.46l7.12 4.18c-.04.18-.06.38-.06.58a2.91 2.91 0 1 0 2.91-2.91Z"/></svg>
      </button>
      <button class="ce-icon-btn ce-icon-btn--brief" type="button" data-open-chat-brief="1" title="Resumen del chat" aria-label="Abrir resumen del chat">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11.5L21 7.5V21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm10 1.7V9h4.3L15 4.7ZM7 11h10V9H7v2Zm0 4h10v-2H7v2Zm0 4h6v-2H7v2Zm10-3.8 1.3.8-.4-1.5 1.2-1h-1.5L17 12l-.6 1.5h-1.5l1.2 1-.4 1.5 1.3-.8Z"/></svg>
      </button>
      <button class="ce-icon-btn ce-icon-btn--date-jump" type="button" data-open-date-jump="1" title="Ir a fecha en este chat" aria-label="Ir a fecha en este chat">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2Zm12 8H5v9h14v-9ZM5 6v2h14V6H5Zm3 6h3v3H8v-3Zm5 0h3v3h-3v-3Z"/></svg>
      </button>
      <button class="ce-icon-btn ce-icon-btn--links" type="button" data-open-link-library="1" title="Enlaces compartidos" aria-label="Abrir enlaces compartidos del chat">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.9 12a5 5 0 0 1 5-5h4v2h-4a3 3 0 0 0 0 6h4v2h-4a5 5 0 0 1-5-5Zm5.1 1v-2h6v2H9Zm2-6h4a5 5 0 0 1 0 10h-4v-2h4a3 3 0 0 0 0-6h-4V7Z"/></svg>
      </button>
      <button class="ce-icon-btn" type="button" data-unread-active-chat="1" title="Marcar como no leído" aria-label="Marcar como no leído">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 3.2V17h16V8.2l-7.4 5.1a1 1 0 0 1-1.2 0L4 8.2ZM5.4 7 12 11.56 18.6 7H5.4Z"/></svg>
      </button>
      <button class="ce-icon-btn ce-icon-btn--reminders" type="button" data-open-reminders="1" title="Recordatorios privados del chat" aria-label="Abrir recordatorios privados del chat">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a8 8 0 1 0 8 8 8 8 0 0 0-8-8Zm1 8.59 3.2 3.2-1.4 1.42L11 11.41V5h2v5.59ZM4 20h16v2H4v-2Z"/></svg>
      </button>
      <button class="ce-icon-btn ce-icon-btn--private-notes" type="button" data-open-private-notes="1" title="Notas privadas del chat" aria-label="Abrir notas privadas del chat">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11.5L21 7.5V21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm10 1.7V9h4.3L15 4.7ZM7 12h10v-2H7v2Zm0 4h10v-2H7v2Zm0 4h7v-2H7v2Z"/></svg>
      </button>
      <button class="ce-icon-btn" type="button" data-export-active-chat="1" title="Exportar chat" aria-label="Exportar chat">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2ZM13 4h-2v8.17L7.41 8.59 6 10l6 6 6-6-1.41-1.41L13 12.17V4Z"/></svg>
      </button>
    </div>`;
  setCachedHtml('activeChatHeaderHtml', els.activeChatHeader, activeChatHeaderHtml);
  renderChatSearchVisibility();
  const messages = state.messagesByChat.get(chat.chatId) || [];
  const selectedMessageIds = new Set(activeSelectedMessageIds());
  els.messages?.classList.toggle('ce-message-selection-mode', selectedMessageIds.size > 0);
  renderSelectionDeleteModal();
  const queuedMessages = getQueuedMessagesForChat(chat.chatId);
  const sameRenderedChat = state.renderedActiveChatId === chat.chatId;
  const wasNearBottom = !sameRenderedChat || isMessagesNearBottom();
  const previousScrollHeight = els.messages?.scrollHeight || 0;
  const previousScrollTop = els.messages?.scrollTop || 0;
  const previousRenderedCount = Number(state.renderedMessageCountByChat.get(chat.chatId) || 0);
  const nextRenderedCount = messages.length + queuedMessages.length;
  const grewWhileAway = sameRenderedChat && !wasNearBottom && nextRenderedCount > previousRenderedCount;
  const unreadMarker = state.unreadMarkerByChatId.get(chat.chatId) || null;
  const storedMessageHtml = messages.map((msg) => {
    const mine = msg.senderUserId === state.user?.userId;
    const highlighted = msg.messageId === state.highlightedMessageId ? ' is-highlighted' : '';
    const pinned = msg.isPinned && !isDeletedMessage(msg) ? ' is-pinned-message' : '';
    const selected = selectedMessageIds.has(msg.messageId) ? ' is-selected' : '';
    const unreadSeparator = unreadMarker?.messageId && msg.messageId === unreadMarker.messageId ? renderUnreadSeparator(unreadMarker) : '';
    const clientMessageAttr = msg.clientMessageId ? ` data-client-message-id="${escapeHtml(msg.clientMessageId)}"` : '';
    return `${unreadSeparator}<article class="ce-msg ${mine ? 'mine' : 'theirs'}${isDeletedMessage(msg) ? ' is-deleted' : ''}${highlighted}${pinned}${selected}" data-message-id="${escapeHtml(msg.messageId || '')}"${clientMessageAttr}>${renderMessageActions(msg, mine)}${renderReplyPreview(msg)}${renderMessageBody(msg, mine)}${renderMessageTime(msg, mine)}${isDeletedMessage(msg) ? '' : `${renderReactionSummary(msg)}${renderReactionPicker(msg)}`}</article>`;
  }).join('');
  const queuedMessageHtml = queuedMessages.map(renderQueuedMessage).join('');
  const emptyText = isChatInteractionBlocked(chat) ? 'La conversación se mantiene disponible para consulta.' : 'Envía el primer mensaje.';
  const messageHtml = `${storedMessageHtml}${queuedMessageHtml}` || `<div class="ce-chat-empty">${escapeHtml(emptyText)}</div>`;
  const activeMessagesHtml = `${renderChatBlockNotice(chat)}${renderPinnedMessagesStrip(chat, messages)}${messageHtml}`;
  const messagesChanged = setCachedHtml('messagesHtml', els.messages, activeMessagesHtml);
  syncRenderedAttachmentImageOrientations(els.messages);
  state.renderedActiveChatId = chat.chatId;
  state.renderedMessageCountByChat.set(chat.chatId, nextRenderedCount);
  if (!messagesChanged && sameRenderedChat && !state.highlightedMessageId && !unreadMarker?.messageId) {
    updateScrollBottomButton();
  } else if (state.highlightedMessageId) {
    window.setTimeout(() => {
      focusHighlightedMessage();
      updateScrollBottomButton();
    }, 0);
  } else if (unreadMarker?.messageId && !sameRenderedChat) {
    window.setTimeout(() => {
      jumpToUnreadMarker(unreadMarker.messageId);
      updateScrollBottomButton();
    }, 0);
  } else if (!sameRenderedChat || wasNearBottom) {
    scrollMessagesToBottom({ smooth: false, resetNew: true });
  } else {
    els.messages.scrollTop = Math.max(0, els.messages.scrollHeight - previousScrollHeight + previousScrollTop);
    if (grewWhileAway) state.scrollNewMessages += nextRenderedCount - previousRenderedCount;
    updateScrollBottomButton();
  }
  els.messageInput.disabled = isChatInteractionBlocked(chat);
  updateComposerControls();
}

async function selectChat(chatId) {
  const previousChatId = state.activeChatId;
  const changedChat = previousChatId !== chatId;
  if (changedChat) {
    saveActiveDraft({ announce: false });
    if (state.voiceDictating) stopVoiceDictation({ announce: false });
    if (state.typingTimer) window.clearTimeout(state.typingTimer);
    state.typingTimer = 0;
    if (previousChatId) sendTyping(false, { chatId: previousChatId }).catch(() => null);
  }
  state.activeChatId = chatId;
  if (changedChat) {
    state.replyToMessage = null;
    state.editingMessage = null;
    state.selectedMessageIds = new Set();
    state.selectionDeleteModalOpen = false;
    state.forwardingMessage = null;
    state.scheduleModalOpen = false;
    state.scheduledMessages = [];
    state.scheduledLoadedChatId = '';
    state.quickRepliesOpen = false;
    state.slashCommandsOpen = false;
    state.privateNotesOpen = false;
    state.privateNotes = [];
    state.privateNotesLoadedChatId = '';
    state.linkLibraryOpen = false;
    state.chatBriefOpen = false;
    state.chatBriefLoading = false;
    state.chatBriefError = '';
    resetPrivateNoteEditor();
    state.remindersOpen = false;
    state.reminderMessage = null;
    state.reminders = [];
    state.remindersLoadedChatId = '';
    state.chatSearchOpen = false;
    resetChatSearch();
    renderAll();
  }
  const chatBeforeRead = activeChat();
  const cachedMessages = state.messagesByChat.get(chatId) || [];
  const syncCursor = String(state.messageSyncCursorByChat.get(chatId) || '').trim();
  const canReuseRealtimeCache = state.messageBaselineLoadedChats.has(chatId)
    && state.messagesByChat.has(chatId)
    && hasHealthySharedRealtimeLease();

  let incomingMessages = [];
  let messages = cachedMessages;
  let prefetchedDraft = null;
  let hasPrefetchedDraft = false;
  if (!canReuseRealtimeCache) {
    const shouldIncludeDraft = !state.draftRemoteLoadedChats.has(chatId);
    const data = await post('/api/chats/messages', {
      chatId,
      limit: 80,
      ...(syncCursor ? { afterMessageId: syncCursor } : {}),
      ...(shouldIncludeDraft ? { includeDraft: true } : {})
    });
    if (shouldIncludeDraft && Object.prototype.hasOwnProperty.call(data, 'draft')) {
      prefetchedDraft = data.draft || null;
      hasPrefetchedDraft = true;
    }
    incomingMessages = Array.isArray(data.messages) ? data.messages : [];
    const resetRequired = !syncCursor || Boolean(data.page?.resetRequired);
    if (resetRequired) {
      invalidateMessageHistoryCoverage(chatId);
      messages = incomingMessages;
    } else {
      messages = cachedMessages.slice();
      const positions = new Map(messages.map((message, index) => [message?.messageId, index]).filter(([messageId]) => Boolean(messageId)));
      for (const message of incomingMessages) {
        if (!message?.messageId) continue;
        const index = positions.get(message.messageId);
        if (Number.isInteger(index)) messages[index] = { ...messages[index], ...message };
        else {
          positions.set(message.messageId, messages.length);
          messages.push(message);
        }
      }
    }
    const nextSyncCursor = String(data.page?.syncCursor || '').trim();
    if (nextSyncCursor) state.messageSyncCursorByChat.set(chatId, nextSyncCursor);
    else if (resetRequired) state.messageSyncCursorByChat.delete(chatId);
    state.messageBaselineLoadedChats.add(chatId);
  }

  await ensurePinnedMessagesLoaded(activeChat(), messages).catch(() => null);
  rememberUnreadMarkerForChat(chatBeforeRead, messages);
  state.messagesByChat.set(chatId, messages);
  acknowledgeMessagesDelivered(incomingMessages);
  renderAll();
  loadDraftForChat(chatId, hasPrefetchedDraft ? { prefetchedDraft, usePrefetchedDraft: true } : undefined);
  updateComposerControls();
  await markActiveRead();
}

async function markActiveRead() {
  if (!canConfirmReadInActiveChat()) return false;
  const chat = activeChat();
  if (!chat || Number(chat.unread || 0) <= 0) return false;
  const chatId = String(state.activeChatId || '').trim();
  if (!chatId) return false;

  // Scroll, selección de chat y eventos SSE pueden coincidir antes de que la primera
  // confirmación actualice `unread`. Compartir la misma promesa evita gastar varias
  // HTTP Responses para la misma lectura sin retrasar ni omitir la confirmación real.
  const existingRequest = state.readRequestsByChat.get(chatId);
  if (existingRequest) return existingRequest;

  let request = null;
  request = (async () => {
    try {
      const data = await post('/api/chats/read', { chatId });
      upsertChat(data.chat);
      renderChats();
      return true;
    } catch {
      return false;
    } finally {
      if (state.readRequestsByChat.get(chatId) === request) state.readRequestsByChat.delete(chatId);
    }
  })();
  state.readRequestsByChat.set(chatId, request);
  return request;
}

async function addContactByEmail(email) {
  const data = await post('/api/contacts/add-email', { email });
  upsertContact(data.contact);
  upsertChat(data.chat);
  await selectChat(data.chat.chatId);
}

async function addContactByCode(code) {
  const maybeEmail = String(code || '').trim();
  if (/^.+@.+\..+$/.test(maybeEmail) && !maybeEmail.includes('http')) return addContactByEmail(maybeEmail);
  const data = await post('/api/contacts/add-code', { code });
  upsertContact(data.contact);
  upsertChat(data.chat);
  await selectChat(data.chat.chatId);
}

async function openContactChat(userId) {
  const data = await post('/api/chats/open', { userId });
  upsertChat(data.chat);
  await selectChat(data.chat.chatId);
}

async function openSelfNotesChat() {
  const data = await post('/api/chats/self', {});
  upsertChat(data.chat);
  if (state.archivedView && data.chat?.isArchived === false) await loadChats({ includeArchived: false });
  await selectChat(data.chat.chatId);
  showTemporaryDraftStatus('Notas para mí abierto. Todo lo que guardes aquí queda en tu cuenta.');
}

async function applySentMessageHttpFallback(data = {}, clientMessageId = '') {
  if (!data?.message?.messageId) return false;
  removeQueuedMessage(clientMessageId || data.message.clientMessageId || '', { render: false });
  upsertChat(data.chat);
  upsertMessage(data.message);
  if (state.archivedView && data.chat?.isArchived === false) {
    await loadChats({ includeArchived: false });
    return true;
  }
  renderAll();
  return true;
}

function shouldWaitForStreamConfirmation(data = {}) {
  return Boolean(!data?.deduplicated && data?.realtimeDelivery?.ok === true && isRealtimeStreamUsable());
}

function shouldSendMessageStreamOnly() {
  return Boolean(isRealtimeStreamUsable() && navigator.onLine !== false);
}

async function sendMessage(text, { silent = false, ephemeralSeconds = selectedEphemeralSeconds(), attachment = state.pendingAttachment } = {}) {
  if (!state.activeChatId) return;
  if (isChatInteractionBlocked()) {
    showTemporaryDraftStatus(chatBlockNoticeText(), 4800);
    throw new Error(chatBlockNoticeText() || 'No puedes enviar mensajes en este chat.');
  }
  const chatId = state.activeChatId;
  const clientMessageId = `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const replyToMessageId = state.replyToMessage?.messageId || '';
  const replyTo = state.replyToMessage ? { ...state.replyToMessage } : null;
  const normalizedAttachment = normalizeAttachmentClient(attachment);
  const messageText = String(text || '').trim() || attachmentFallbackText(normalizedAttachment);
  closeComposerTransientPanels();
  cancelActiveDraftSaveTimer();
  const streamOnly = shouldSendMessageStreamOnly();
  const queued = streamOnly ? null : upsertQueuedMessage({
    chatId,
    text: messageText,
    clientMessageId,
    localId: clientMessageId,
    replyToMessageId,
    replyTo,
    attachment: normalizeAttachmentClient(attachment),
    silent: Boolean(silent),
    ephemeralSeconds: normalizeEphemeralSeconds(ephemeralSeconds),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'sending',
    attempts: 1,
    lastError: ''
  }, { render: true });
  try {
    const data = await post('/api/chats/send', { chatId, text: messageText, clientMessageId, replyToMessageId, silent: Boolean(silent), ephemeralSeconds: normalizeEphemeralSeconds(ephemeralSeconds), attachment: normalizedAttachment, draftOriginId: getDraftOriginId(), clientId: getClientId() });
    clearDraftForChat(chatId);
    state.replyToMessage = null;
    if (normalizedAttachment && state.pendingAttachment?.attachmentId === normalizedAttachment.attachmentId) clearPendingAttachment();
    if (!shouldWaitForStreamConfirmation(data)) {
      await applySentMessageHttpFallback(data, clientMessageId);
    }
    if (silent || normalizeEphemeralSeconds(ephemeralSeconds)) {
      const parts = [];
      if (silent) parts.push('sin notificación push');
      if (normalizeEphemeralSeconds(ephemeralSeconds)) parts.push(`temporal por ${formatEphemeralOption(ephemeralSeconds)}`);
      showTemporaryDraftStatus(`Mensaje enviado ${parts.join(' y ')}.`);
    }
  } catch (error) {
    if (!isRecoverableSendError(error)) {
      removeQueuedMessage(clientMessageId, { render: true });
      throw error;
    }
    clearDraftForChat(chatId);
    state.replyToMessage = null;
    upsertQueuedMessage({
      ...(queued || { chatId, text: messageText, clientMessageId, replyToMessageId, replyTo, attachment: normalizedAttachment, silent: Boolean(silent), ephemeralSeconds: normalizeEphemeralSeconds(ephemeralSeconds), createdAt: new Date().toISOString(), attempts: 0 }),
      status: 'failed',
      attempts: Math.max(1, Number(queued?.attempts || 1)),
      retryable: true,
      nextAttemptAt: nextOutboxRetryAt(error, Math.max(1, Number(queued?.attempts || 1))),
      updatedAt: new Date().toISOString(),
      lastError: error?.message || 'Sin conexión o servidor no disponible'
    }, { render: true });
    scheduleNextOutboxRetry();
    showTemporaryDraftStatus('Mensaje guardado en pendientes. Se enviará automáticamente cuando vuelva la conexión.', 4600);
    sendTyping(false).catch(() => null);
  }
}

async function sendComposerMessageWithPendingAttachments(text, { silent = false, ephemeralSeconds = selectedEphemeralSeconds() } = {}) {
  const attachments = pendingComposerAttachments();
  if (attachments.length <= 1) {
    const attachment = attachments[0] || null;
    await sendMessage(text, { silent, ephemeralSeconds, attachment });
    if (attachment) clearPendingAttachment(attachment.attachmentId);
    return;
  }
  let textConsumed = false;
  state.attachmentBatchSending = true;
  updateComposerControls();
  try {
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      try {
        await sendMessage(index === 0 ? text : '', { silent, ephemeralSeconds, attachment });
        if (index === 0 && String(text || '').trim()) textConsumed = true;
        clearPendingAttachment(attachment.attachmentId);
      } catch (error) {
        if (textConsumed && error && typeof error === 'object') error.composerTextAlreadySent = true;
        throw error;
      }
    }
  } finally {
    state.attachmentBatchSending = false;
    updateComposerControls();
  }
}

async function sendSilentCurrentMessage() {
  if (!state.activeChatId || state.editingMessage?.messageId) return;
  const text = String(els.messageInput?.value || '').trim();
  if (state.voiceDictating) stopVoiceDictation({ announce: false });
  if (!text && !hasPendingComposerAttachment()) {
    els.messageInput?.focus();
    return;
  }
  els.btnSilentSend && (els.btnSilentSend.disabled = true);
  try {
    await sendComposerMessageWithPendingAttachments(text, { silent: true, ephemeralSeconds: selectedEphemeralSeconds() });
    if (els.messageInput) els.messageInput.value = '';
    clearPendingAttachment();
    await sendTyping(false);
  } finally {
    updateComposerControls();
    els.messageInput?.focus();
  }
}

async function editActiveMessage(text) {
  if (!state.activeChatId || !state.editingMessage?.messageId) return;
  const data = await post('/api/chats/edit', { chatId: state.activeChatId, messageId: state.editingMessage.messageId, text });
  state.editingMessage = null;
  loadDraftForChat(state.activeChatId);
  upsertChat(data.chat);
  upsertMessage(data.message);
  syncStarredPanelMessage(data.message);
  renderAll();
}

async function deleteMessageForEveryone(messageId = '') {
  if (!state.activeChatId || !messageId) return;
  const ok = window.confirm('¿Eliminar este mensaje para todos? Esta acción no se puede deshacer.');
  if (!ok) return;
  const data = await post('/api/chats/delete', { chatId: state.activeChatId, messageId });
  if (state.replyToMessage?.messageId === messageId) state.replyToMessage = null;
  if (state.editingMessage?.messageId === messageId) {
    state.editingMessage = null;
    loadDraftForChat(state.activeChatId);
  }
  upsertChat(data.chat);
  upsertMessage(data.message);
  syncStarredPanelMessage(data.message);
  renderAll();
}

function startReplyToMessage(messageId = '') {
  if (!state.activeChatId || !messageId) return;
  const list = state.messagesByChat.get(state.activeChatId) || [];
  const message = list.find((item) => item.messageId === messageId);
  if (!message || isDeletedMessage(message)) return;
  state.replyToMessage = message;
  state.editingMessage = null;
  saveActiveDraft({ announce: false });
  renderReplyDraft();
  els.messageInput?.focus();
}

function startEditMessage(messageId = '') {
  if (!state.activeChatId || !messageId) return;
  const list = state.messagesByChat.get(state.activeChatId) || [];
  const message = list.find((item) => item.messageId === messageId);
  if (!message || isDeletedMessage(message) || message.senderUserId !== state.user?.userId) return;
  saveActiveDraft({ announce: false });
  state.editingMessage = message;
  state.replyToMessage = null;
  setDraftStatus('');
  els.messageInput.value = message.text || '';
  renderReplyDraft();
  els.messageInput?.focus();
  try { els.messageInput.setSelectionRange(els.messageInput.value.length, els.messageInput.value.length); } catch {}
}

function availableForwardChats() {
  return state.chats.filter((chat) => chat.chatId && chat.chatId !== state.activeChatId && !chat.isArchived && !isChatInteractionBlocked(chat));
}

function contactShareRecentScore(contact = {}) {
  const chat = state.chats.find((item) => item?.other?.userId === contact.userId && !isSelfChat(item));
  const raw = chat?.lastMessage?.createdAt || chat?.updatedAt || chat?.createdAt || contact.updatedAt || contact.addedAt || '';
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function contactShareFilteredContacts() {
  const query = String(state.contactShareQuery || '').trim().toLowerCase();
  const targetProfile = state.contactShareTargetProfile || {};
  return state.contacts
    .filter((contact) => contact.userId && contact.userId !== targetProfile.userId)
    .filter((contact) => {
      if (!query) return true;
      return [contactDisplayName(contact), contactDisplaySubtitle(contact), contact.email, contact.displayName, contact.nickname]
        .some((value) => String(value || '').toLowerCase().includes(query));
    })
    .sort((a, b) => {
      const byRecent = contactShareRecentScore(b) - contactShareRecentScore(a);
      if (byRecent) return byRecent;
      return String(contactDisplayName(a)).localeCompare(String(contactDisplayName(b)), 'es');
    });
}

function renderContactShareModal() {
  if (!els.contactShareModal || !els.contactShareList) return;
  if (!state.contactShareModalOpen || !state.contactShareTargetProfile?.profileCode) {
    els.contactShareModal.classList.add('hidden');
    if (els.contactShareList) els.contactShareList.innerHTML = '';
    if (els.contactSharePageInfo) els.contactSharePageInfo.textContent = 'Página 1';
    return;
  }
  els.contactShareModal.classList.remove('hidden');
  if (els.contactShareSearch && els.contactShareSearch.value !== state.contactShareQuery) els.contactShareSearch.value = state.contactShareQuery;
  const contacts = contactShareFilteredContacts();
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(contacts.length / pageSize));
  state.contactSharePage = Math.min(Math.max(0, Number(state.contactSharePage || 0)), totalPages - 1);
  const start = state.contactSharePage * pageSize;
  const pageContacts = contacts.slice(start, start + pageSize);
  const shareRows = contacts.length
    ? pageContacts.map((contact) => {
      const title = contactDisplayName(contact);
      const subtitle = contactDisplaySubtitle(contact);
      const disabled = state.contactShareSending ? ' disabled' : '';
      return `<button class="ce-contact-share-target" type="button" data-contact-share-target-id="${escapeHtml(contact.userId)}"${disabled} aria-label="Enviar contacto a ${escapeHtml(title)}">${avatar(contact, 'small')}<span><strong>${escapeHtml(title)}</strong><em>${escapeHtml(subtitle)}</em></span></button>`;
    }).join('')
    : '<div class="ce-contact-share-empty">No hay contactos disponibles entre los cargados. Cambia la búsqueda o carga más contactos.</div>';
  const loadMoreShareContacts = state.contactsHasMore
    ? `<button class="ce-link" type="button" data-load-more-share-contacts="1"${state.contactsLoading || state.contactShareSending ? ' disabled' : ''}>${state.contactsLoading ? 'Cargando contactos...' : 'Cargar más contactos'}</button>`
    : '';
  els.contactShareList.innerHTML = `${shareRows}${loadMoreShareContacts}`;
  if (els.contactSharePageInfo) els.contactSharePageInfo.textContent = `${state.contactSharePage + 1} de ${totalPages}`;
  if (els.btnContactSharePrev) els.btnContactSharePrev.disabled = state.contactSharePage <= 0 || state.contactShareSending;
  if (els.btnContactShareNext) els.btnContactShareNext.disabled = state.contactSharePage >= totalPages - 1 || state.contactShareSending;
}

function openContactShareModal(profile = state.contactShareTargetProfile || {}) {
  if (!profile?.profileCode) throw new Error('Este perfil todavía no tiene un enlace de contacto disponible.');
  state.contactShareTargetProfile = profile;
  state.contactShareModalOpen = true;
  state.contactShareQuery = '';
  state.contactSharePage = 0;
  renderContactShareModal();
  window.setTimeout(() => els.contactShareSearch?.focus(), 0);
}

function closeContactShareModal() {
  state.contactShareModalOpen = false;
  state.contactShareQuery = '';
  state.contactSharePage = 0;
  state.contactShareSending = false;
  renderContactShareModal();
}

async function sendProfileShareToContact(targetUserId = '') {
  const recipientId = String(targetUserId || '').trim();
  const targetProfile = state.contactShareTargetProfile || {};
  const shareLink = buildProfileShareLink(targetProfile);
  if (!recipientId) throw new Error('Selecciona un contacto para enviar la tarjeta.');
  if (!shareLink) throw new Error('Este perfil todavía no tiene un enlace disponible.');
  if (targetProfile.profileCode) {
    setContactLinkPreview(targetProfile.profileCode, {
      code: targetProfile.profileCode,
      status: 'ready',
      profile: targetProfile,
      saved: isContactSavedProfile(targetProfile)
    });
  }
  state.contactShareSending = true;
  renderContactShareModal();
  try {
    await openContactChat(recipientId);
    await sendMessage(shareLink, { silent: false, ephemeralSeconds: selectedEphemeralSeconds(), attachment: null });
    closeContactShareModal();
    closeQrModal();
    showTemporaryDraftStatus('Contacto enviado por chatER como tarjeta compacta.');
  } finally {
    state.contactShareSending = false;
    renderContactShareModal();
  }
}

function renderForwardModal() {
  if (!els.forwardModal || !els.forwardList || !els.forwardPreview) return;
  const message = state.forwardingMessage;
  if (!message?.messageId) {
    els.forwardModal.classList.add('hidden');
    els.forwardPreview.innerHTML = '';
    els.forwardList.innerHTML = '';
    return;
  }
  const preview = compactText(message.text || '', 260);
  els.forwardPreview.innerHTML = `<strong>Mensaje seleccionado</strong><span>${escapeHtml(preview)}</span>`;
  const chats = availableForwardChats();
  if (!chats.length) {
    els.forwardList.innerHTML = '<div class="ce-forward-empty">No hay otro chat disponible para reenviar. Agrega o abre un contacto primero.</div>';
    return;
  }
  els.forwardList.innerHTML = chats.map((chat) => {
    const other = chat.other || {};
    const label = other.displayName || other.email || 'Contacto';
    const last = isDeletedMessage(chat.lastMessage) ? 'Mensaje eliminado' : (chat.lastMessage?.text || 'Chat abierto');
    return `<button class="ce-forward-target" type="button" data-forward-target-chat-id="${escapeHtml(chat.chatId)}" aria-label="Reenviar a ${escapeHtml(label)}">${avatar(other, 'small')}<span><strong>${escapeHtml(label)}</strong><em>${escapeHtml(compactText(last, 96))}</em></span></button>`;
  }).join('');
}

function openForwardMessage(messageId = '') {
  if (!state.activeChatId || !messageId) return;
  const message = findActiveMessage(messageId);
  if (!message || isDeletedMessage(message)) return;
  state.forwardingMessage = { ...message, sourceChatId: state.activeChatId };
  renderForwardModal();
  els.forwardModal?.classList.remove('hidden');
}

function closeForwardModal() {
  state.forwardingMessage = null;
  renderForwardModal();
}


function readPollOptionsFromModal() {
  return Array.from(els.pollOptions?.querySelectorAll('input[data-poll-option-input]') || [])
    .map((input) => String(input.value || '').trim())
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 6);
}

function renderPollModal() {
  if (!els.pollModal) return;
  els.pollModal.classList.toggle('hidden', !state.pollModalOpen);
  if (!state.pollModalOpen) return;
  const question = String(els.pollQuestionInput?.value || '').trim();
  const options = readPollOptionsFromModal();
  if (els.pollPreview) {
    els.pollPreview.innerHTML = question
      ? `<strong>${escapeHtml(question)}</strong><span>${options.length} ${options.length === 1 ? 'opción preparada' : 'opciones preparadas'}</span>`
      : '<strong>Pregunta de la encuesta</strong><span>Las personas del chat podrán votar una sola opción y cambiar su voto.</span>';
  }
  if (els.btnConfirmPoll) els.btnConfirmPoll.disabled = !state.activeChatId || isChatInteractionBlocked() || state.pollCreating || !question || options.length < 2;
}

function openPollModal() {
  if (!state.activeChatId || state.editingMessage?.messageId) return;
  if (isChatInteractionBlocked()) {
    showTemporaryDraftStatus(chatBlockNoticeText(), 4200);
    return;
  }
  closeComposerTransientPanels();
  state.pollModalOpen = true;
  if (els.pollQuestionInput && !els.pollQuestionInput.value) els.pollQuestionInput.value = '';
  renderPollModal();
  window.setTimeout(() => els.pollQuestionInput?.focus(), 0);
}

function closePollModal() {
  state.pollModalOpen = false;
  renderPollModal();
}

async function createPollFromModal() {
  if (!state.activeChatId || state.pollCreating) return;
  ensureChatInteractionAllowed();
  const question = String(els.pollQuestionInput?.value || '').trim();
  const options = readPollOptionsFromModal();
  if (!question) throw new Error('Escribe la pregunta de la encuesta.');
  if (options.length < 2) throw new Error('Agrega al menos 2 opciones diferentes.');
  const chatId = state.activeChatId;
  const clientMessageId = `poll_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  cancelActiveDraftSaveTimer();
  state.pollCreating = true;
  renderPollModal();
  updateComposerControls();
  try {
    const data = await post('/api/chats/poll/create', { chatId, question, options, clientMessageId, draftOriginId: getDraftOriginId(), clientId: getClientId() });
    clearDraftForChat(chatId);
    if (!shouldWaitForStreamConfirmation(data)) {
      upsertChat(data.chat);
      upsertMessage(data.message);
      renderAll();
    }
    closePollModal();
    if (els.pollForm) els.pollForm.reset();
    showTemporaryDraftStatus('Encuesta publicada en el chat.');
  } finally {
    state.pollCreating = false;
    renderPollModal();
    updateComposerControls();
  }
}

async function setPollVote(messageId = '', optionId = '') {
  if (!state.activeChatId || !messageId || !optionId) return;
  ensureChatInteractionAllowed();
  const data = await post('/api/chats/poll/vote', { chatId: state.activeChatId, messageId, optionId });
  upsertChat(data.chat);
  upsertMessage(data.message);
  renderAll();
}

function normalizeScheduleInputValue() {
  const raw = String(els.scheduleDateTime?.value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function renderScheduleModal() {
  if (!els.scheduleModal || !els.schedulePreview || !els.scheduledList) return;
  els.scheduleModal.classList.toggle('hidden', !state.scheduleModalOpen);
  if (!state.scheduleModalOpen) return;
  const text = String(els.messageInput?.value || '').trim();
  const selectedTtl = selectedEphemeralSeconds();
  const ttlNotice = selectedTtl ? `<em>Temporal: expira ${escapeHtml(formatEphemeralOption(selectedTtl))} después de que el contacto lo lea.</em>` : '';
  els.schedulePreview.innerHTML = text
    ? `<strong>Mensaje listo para programar</strong><span>${escapeHtml(compactText(text, 280))}</span>${ttlNotice}`
    : '<strong>Escribe un mensaje</strong><span>El texto del compositor aparecerá aquí antes de programarlo.</span>';
  if (els.btnConfirmSchedule) els.btnConfirmSchedule.disabled = !text || !state.activeChatId || isChatInteractionBlocked() || state.schedulingMessage;
  if (state.scheduledLoading) {
    els.scheduledList.innerHTML = '<div class="ce-scheduled-empty">Cargando mensajes programados...</div>';
    return;
  }
  const items = Array.isArray(state.scheduledMessages) ? state.scheduledMessages : [];
  const pending = items.filter((item) => item.status === 'scheduled' || item.status === 'failed');
  if (!pending.length) {
    els.scheduledList.innerHTML = '<div class="ce-scheduled-empty">No tienes mensajes programados en este chat.</div>';
    return;
  }
  els.scheduledList.innerHTML = `
    <div class="ce-scheduled-title">Programados en este chat</div>
    ${pending.map((item) => {
      const failed = item.status === 'failed';
      const silent = item.silent ? ' · sin notificación' : '';
      const ephemeral = item.ephemeralSeconds ? ` · temporal ${escapeHtml(formatEphemeralOption(item.ephemeralSeconds))}` : '';
      const status = failed ? `No enviado · ${escapeHtml(item.lastError || 'Revisa y programa uno nuevo')}${silent}${ephemeral}` : `Se enviará ${escapeHtml(formatScheduleDateTime(item.scheduledFor))}${silent}${ephemeral}`;
      const cancelLabel = item.status === 'scheduled' ? 'Cancelar' : 'Quitar';
      const cancel = ['scheduled', 'failed'].includes(item.status) ? `<button class="ce-link" type="button" data-cancel-scheduled-id="${escapeHtml(item.scheduledId || '')}">${cancelLabel}</button>` : '';
      return `<div class="ce-scheduled-item${failed ? ' is-failed' : ''}"><span><strong>${escapeHtml(compactText(item.text || '', 160))}</strong><em>${status}</em></span>${cancel}</div>`;
    }).join('')}`;
}

async function loadScheduledMessages({ force = false } = {}) {
  if (!state.activeChatId || state.scheduledLoading) return;
  if (!force && state.scheduledLoadedChatId === state.activeChatId) {
    renderScheduleModal();
    return;
  }
  const requestedChatId = state.activeChatId;
  state.scheduledLoading = true;
  renderScheduleModal();
  try {
    const data = await post('/api/chats/scheduled/list', { chatId: requestedChatId, limit: 80 });
    if (state.activeChatId !== requestedChatId) return;
    state.scheduledMessages = Array.isArray(data.scheduledMessages) ? data.scheduledMessages : [];
    state.scheduledLoadedChatId = requestedChatId;
  } finally {
    state.scheduledLoading = false;
    renderScheduleModal();
  }
}

async function openScheduleModal({ allowEmptyText = true } = {}) {
  if (!state.activeChatId || state.editingMessage?.messageId) return;
  if (isChatInteractionBlocked()) {
    showTemporaryDraftStatus(chatBlockNoticeText(), 4200);
    return;
  }
  closeComposerTransientPanels();
  const text = String(els.messageInput?.value || '').trim();
  if (!text && !allowEmptyText) {
    els.messageInput?.focus();
    return;
  }
  state.scheduleModalOpen = true;
  const minDate = new Date(Date.now() + 60 * 1000);
  const defaultDate = new Date(Date.now() + 10 * 60 * 1000);
  if (els.scheduleDateTime) {
    els.scheduleDateTime.min = toDateTimeLocalValue(minDate);
    if (!els.scheduleDateTime.value) els.scheduleDateTime.value = toDateTimeLocalValue(defaultDate);
  }
  renderScheduleModal();
  await loadScheduledMessages().catch((error) => {
    els.scheduledList.innerHTML = `<div class="ce-scheduled-empty">${escapeHtml(error.message || 'No se pudieron cargar los mensajes programados.')}</div>`;
  });
}

function closeScheduleModal() {
  state.scheduleModalOpen = false;
  renderScheduleModal();
}

async function scheduleCurrentMessage() {
  if (!state.activeChatId || state.schedulingMessage) return;
  ensureChatInteractionAllowed();
  const text = String(els.messageInput?.value || '').trim();
  if (!text) throw new Error('Escribe un mensaje antes de programarlo.');
  const scheduledFor = normalizeScheduleInputValue();
  if (!scheduledFor) throw new Error('Selecciona una fecha y hora válida.');
  closeComposerTransientPanels({ closeSchedule: false });
  const clientMessageId = `scheduled_client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const replyToMessageId = state.replyToMessage?.messageId || '';
  const silent = Boolean(els.scheduleSilent?.checked);
  const ephemeralSeconds = selectedEphemeralSeconds();
  cancelActiveDraftSaveTimer();
  state.schedulingMessage = true;
  renderScheduleModal();
  updateComposerControls();
  try {
    const data = await post('/api/chats/scheduled/create', { chatId: state.activeChatId, text, scheduledFor, clientMessageId, replyToMessageId, silent, ephemeralSeconds, draftOriginId: getDraftOriginId(), clientId: getClientId() });
    state.scheduledMessages = [data.scheduledMessage, ...state.scheduledMessages.filter((item) => item.scheduledId !== data.scheduledMessage?.scheduledId)].filter(Boolean);
    clearDraftForChat(state.activeChatId);
    state.replyToMessage = null;
    if (els.messageInput) els.messageInput.value = '';
    closeScheduleModal();
    showTemporaryDraftStatus(`Mensaje programado para ${formatScheduleDateTime(data.scheduledMessage?.scheduledFor)}${silent ? ' sin notificación push' : ''}${ephemeralSeconds ? ` · temporal ${formatEphemeralOption(ephemeralSeconds)}` : ''}.`);
  } finally {
    state.schedulingMessage = false;
    renderReplyDraft();
    renderScheduleModal();
    updateComposerControls();
  }
}

async function cancelScheduledMessage(scheduledId = '') {
  if (!scheduledId) return;
  const data = await post('/api/chats/scheduled/cancel', { scheduledId });
  state.scheduledMessages = state.scheduledMessages.filter((item) => item.scheduledId !== data.scheduledMessage?.scheduledId);
  renderScheduleModal();
  showTemporaryDraftStatus('Mensaje programado cancelado.');
}

async function forwardMessageToChat(targetChatId = '') {
  const source = state.forwardingMessage;
  if (!source?.messageId || !source.sourceChatId || !targetChatId) return;
  const targetChat = state.chats.find((chat) => chat.chatId === targetChatId);
  if (isChatInteractionBlocked(targetChat)) {
    showTemporaryDraftStatus(chatBlockNoticeText(targetChat), 4200);
    throw new Error(chatBlockNoticeText(targetChat) || 'No puedes reenviar mensajes a un contacto bloqueado.');
  }
  const clientMessageId = `forward_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const data = await post('/api/chats/forward', {
    sourceChatId: source.sourceChatId,
    messageId: source.messageId,
    targetChatId,
    clientMessageId
  });
  upsertChat(data.chat);
  upsertMessage(data.message);
  closeForwardModal();
  renderAll();
  showTemporaryDraftStatus('Mensaje reenviado.');
}

async function jumpToMessage(messageId = '') {
  if (!messageId) return;
  await openSearchResult(messageId);
}

async function setMessageReaction(messageId = '', reaction = '') {
  if (!state.activeChatId || !messageId) return;
  ensureChatInteractionAllowed();
  const data = await post('/api/chats/reaction', { chatId: state.activeChatId, messageId, reaction });
  upsertChat(data.chat);
  upsertMessage(data.message);
  renderAll();
}

async function setChatPinned(chatId = '', pinned = true) {
  if (!chatId) return;
  const data = await post('/api/chats/pin', { chatId, pinned });
  upsertChat(data.chat);
  renderChats();
}

async function setActiveChatMuted(muted = true) {
  if (!state.activeChatId) return;
  const data = await post('/api/chats/mute', { chatId: state.activeChatId, muted });
  upsertChat(data.chat);
  renderAll();
  showTemporaryDraftStatus(data.muted ? 'Notificaciones silenciadas en este chat.' : 'Notificaciones activadas en este chat.');
}

function applyBlockStatusForTargetUser(targetUserId = '', blockStatus = {}) {
  const cleanTarget = String(targetUserId || blockStatus?.targetUserId || '').trim();
  if (!cleanTarget) return false;
  let changed = false;
  state.chats = state.chats.map((chat) => {
    if (chat?.other?.userId !== cleanTarget) return chat;
    changed = true;
    const normalized = {
      ...normalizeChatBlockStatus({ ...chat, blockStatus }),
      ...blockStatus,
      targetUserId: cleanTarget
    };
    return {
      ...chat,
      blockStatus: normalized,
      isBlockedByMe: Boolean(normalized.blockedByMe),
      hasBlockedMe: Boolean(normalized.blockedMe),
      isBlocked: Boolean(normalized.blocked || normalized.blockedByMe || normalized.blockedMe)
    };
  });
  if (changed) sortChats();
  return changed;
}

function sortBlockedContactsState() {
  state.blockedContacts = (Array.isArray(state.blockedContacts) ? state.blockedContacts : [])
    .filter((item) => item?.targetUserId)
    .sort((a, b) => String(b.blockedAt || '').localeCompare(String(a.blockedAt || '')));
}

function applyBlockedContactDelta({ targetUserId = '', blocked = false, blockedContact = null } = {}) {
  if (!state.blockedContactsLoaded) return;
  const cleanTarget = String(targetUserId || blockedContact?.targetUserId || '').trim();
  if (!cleanTarget) return;
  const existingIndex = state.blockedContacts.findIndex((item) => item?.targetUserId === cleanTarget);
  if (!blocked) {
    if (existingIndex >= 0) {
      state.blockedContacts.splice(existingIndex, 1);
      if (state.blockedContactsHasMore && Number.isFinite(Number(state.blockedContactsNextCursor))) {
        state.blockedContactsNextCursor = Math.max(0, Number(state.blockedContactsNextCursor) - 1);
      }
    }
    return;
  }
  if (!blockedContact?.targetUserId) {
    state.blockedContactsLoaded = false;
    return;
  }
  if (existingIndex >= 0) state.blockedContacts[existingIndex] = blockedContact;
  else {
    state.blockedContacts.push(blockedContact);
    if (state.blockedContactsHasMore && Number.isFinite(Number(state.blockedContactsNextCursor))) {
      state.blockedContactsNextCursor = Number(state.blockedContactsNextCursor) + 1;
    }
  }
  sortBlockedContactsState();
}

async function setActiveContactBlocked(blocked = true) {
  const chat = activeChat();
  if (!chat?.chatId || isSelfChat(chat)) return;
  const targetUserId = chat.other?.userId || normalizeChatBlockStatus(chat).targetUserId;
  if (!targetUserId) throw new Error('No se pudo identificar el contacto.');
  if (blocked) {
    const ok = window.confirm('¿Bloquear este contacto? No podrá recibir tus mensajes desde esta conversación hasta que lo desbloquees.');
    if (!ok) return;
  }
  const data = await post('/api/contacts/block', { targetUserId, blocked: Boolean(blocked) });
  applyBlockStatusForTargetUser(targetUserId, data.blockStatus || {});
  applyBlockedContactDelta({ targetUserId, blocked: Boolean(blocked), blockedContact: data.blockedContact || null });
  if (blocked && state.voiceDictating) stopVoiceDictation({ announce: false });
  if (blocked) state.quickRepliesOpen = false;
  renderAll();
  showTemporaryDraftStatus(blocked ? 'Contacto bloqueado. Puedes desbloquearlo desde el encabezado del chat.' : 'Contacto desbloqueado. Ya puedes enviar mensajes.');
}


function blockedContactTitle(item = {}) {
  const profile = item.profile || {};
  return profile.displayName || profile.email || 'Contacto bloqueado';
}

function blockedContactSubtitle(item = {}) {
  const profile = item.profile || {};
  if (profile.email) return profile.email;
  return item.targetUserId ? `ID: ${compactText(item.targetUserId, 36)}` : 'Perfil no disponible';
}

async function loadBlockedContacts({ silent = false, force = false, append = false } = {}) {
  if (!state.user) return [];
  if (state.blockedContactsLoading) return state.blockedContacts;
  if (!force && !append && state.blockedContactsLoaded) {
    renderBlockedContactsModal();
    return state.blockedContacts;
  }
  if (append && !state.blockedContactsHasMore) return state.blockedContacts;
  state.blockedContactsLoading = true;
  if (!silent) renderBlockedContactsModal();
  try {
    const cursor = append ? state.blockedContactsNextCursor : null;
    const data = await post('/api/contacts/blocks/list', { limit: 30, cursor });
    const incoming = Array.isArray(data.blockedContacts) ? data.blockedContacts : [];
    if (append) {
      const byId = new Map(state.blockedContacts.map((item) => [item?.targetUserId, item]).filter(([id]) => id));
      for (const item of incoming) if (item?.targetUserId) byId.set(item.targetUserId, item);
      state.blockedContacts = Array.from(byId.values());
    } else {
      state.blockedContacts = incoming;
    }
    sortBlockedContactsState();
    state.blockedContactsLoaded = true;
    state.blockedContactsNextCursor = data.page?.nextCursor ?? null;
    state.blockedContactsHasMore = Boolean(data.page?.hasMore);
    return state.blockedContacts;
  } finally {
    state.blockedContactsLoading = false;
    renderBlockedContactsModal();
  }
}

function openBlockedContactsModal() {
  if (!state.user) throw new Error('Inicia sesión para revisar tus contactos bloqueados.');
  state.blockedContactsOpen = true;
  renderBlockedContactsModal();
  loadBlockedContacts({ silent: true }).catch((error) => {
    state.blockedContactsLoading = false;
    renderBlockedContactsModal(error);
  });
}

function closeBlockedContactsModal() {
  state.blockedContactsOpen = false;
  renderBlockedContactsModal();
}

function renderBlockedContactsModal(error = null) {
  if (!els.blockedContactsModal || !els.blockedContactsList) return;
  els.blockedContactsModal.classList.toggle('hidden', !state.blockedContactsOpen);
  if (!state.blockedContactsOpen) return;
  if (state.blockedContactsLoading) {
    els.blockedContactsList.innerHTML = '<div class="ce-blocked-contacts-empty">Cargando contactos bloqueados...</div>';
    return;
  }
  if (error) {
    els.blockedContactsList.innerHTML = `<div class="ce-blocked-contacts-empty">${escapeHtml(error.message || 'No se pudieron cargar los contactos bloqueados.')}</div>`;
    return;
  }
  if (!state.blockedContacts.length) {
    els.blockedContactsList.innerHTML = '<div class="ce-blocked-contacts-empty">No tienes contactos bloqueados. Cuando bloquees a alguien, aparecerá aquí para que puedas gestionarlo sin buscar el chat.</div>';
    return;
  }
  const itemsHtml = state.blockedContacts.map((item) => {
    const title = blockedContactTitle(item);
    const subtitle = blockedContactSubtitle(item);
    const date = item.blockedAt ? `Bloqueado el ${formatScheduleDateTime(item.blockedAt)}` : 'Bloqueo activo';
    return `<article class="ce-blocked-contact">
      ${item.profile ? avatar(item.profile, 'small') : `<span class="ce-avatar ce-avatar--small" aria-hidden="true">${uiIcon('contactOff', 'ce-avatar__icon')}</span>`}
      <div class="ce-blocked-contact__body">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
        <em>${escapeHtml(date)}</em>
      </div>
      <button class="ce-link" type="button" data-unblock-contact-id="${escapeHtml(item.targetUserId || '')}">Desbloquear</button>
    </article>`;
  }).join('');
  const moreHtml = state.blockedContactsHasMore
    ? '<button class="ce-link" type="button" data-blocked-load-more="1">Cargar más contactos bloqueados</button>'
    : '';
  els.blockedContactsList.innerHTML = `${itemsHtml}${moreHtml}`;
}

async function unblockContactFromModal(targetUserId = '') {
  const cleanTarget = String(targetUserId || '').trim();
  if (!cleanTarget) throw new Error('No se pudo identificar el contacto bloqueado.');
  const ok = window.confirm('¿Desbloquear este contacto? Podrás volver a enviarle mensajes si la otra persona no te ha bloqueado.');
  if (!ok) return;
  const data = await post('/api/contacts/block', { targetUserId: cleanTarget, blocked: false });
  applyBlockStatusForTargetUser(cleanTarget, data.blockStatus || {});
  applyBlockedContactDelta({ targetUserId: cleanTarget, blocked: false });
  renderAll();
  renderBlockedContactsModal();
  showTemporaryDraftStatus('Contacto desbloqueado desde la lista de bloqueados.');
}

function resolveNicknameTarget(targetUserId = '') {
  const cleanTarget = String(targetUserId || '').trim();
  if (!cleanTarget) return null;
  const contact = getContactByUserId(cleanTarget);
  if (contact) return { ...contact };
  const chat = activeChat();
  if (chat?.other?.userId === cleanTarget) return { ...chat.other };
  return null;
}

function renderContactNicknameModal() {
  if (!els.contactNicknameModal) return;
  els.contactNicknameModal.classList.toggle('hidden', !state.contactNicknameModalOpen);
  if (!state.contactNicknameModalOpen) return;
  const target = state.contactNicknameTarget || {};
  const canonicalName = target.displayName || target.email || 'Contacto';
  if (els.contactNicknameTitle) els.contactNicknameTitle.textContent = `Apodo privado para ${contactDisplayName(target)}`;
  if (els.contactNicknameSubtitle) {
    els.contactNicknameSubtitle.textContent = `Solo tú verás este nombre. El perfil real seguirá siendo ${canonicalName}${target.email ? ` · ${target.email}` : ''}.`;
  }
  if (els.contactNicknameInput && document.activeElement !== els.contactNicknameInput) els.contactNicknameInput.value = state.contactNicknameDraft;
  if (els.btnSaveContactNickname) els.btnSaveContactNickname.disabled = state.contactNicknameSaving || !target.userId;
  if (els.btnClearContactNickname) els.btnClearContactNickname.disabled = state.contactNicknameSaving || !target.userId || !String(target.nickname || state.contactNicknameDraft || '').trim();
}

function openContactNicknameModal(targetUserId = '') {
  const target = resolveNicknameTarget(targetUserId);
  if (!target?.userId) {
    showTemporaryDraftStatus('No se pudo abrir el editor de apodo para este contacto.', 4200);
    return;
  }
  state.contactNicknameTarget = target;
  state.contactNicknameDraft = String(target.nickname || '').trim();
  state.contactNicknameModalOpen = true;
  renderContactNicknameModal();
  window.setTimeout(() => els.contactNicknameInput?.focus(), 60);
}

function openActiveContactNicknameModal() {
  const chat = activeChat();
  const targetUserId = chat?.other?.userId || '';
  if (!targetUserId || isSelfChat(chat)) return;
  openContactNicknameModal(targetUserId);
}

function closeContactNicknameModal() {
  state.contactNicknameModalOpen = false;
  state.contactNicknameTarget = null;
  state.contactNicknameDraft = '';
  state.contactNicknameSaving = false;
  renderContactNicknameModal();
}

async function saveContactNicknameFromModal({ clear = false } = {}) {
  const target = state.contactNicknameTarget || {};
  if (!target.userId || state.contactNicknameSaving) return;
  state.contactNicknameSaving = true;
  renderContactNicknameModal();
  try {
    const nickname = clear ? '' : String(els.contactNicknameInput?.value || state.contactNicknameDraft || '').trim();
    const data = await post('/api/contacts/nickname', { targetUserId: target.userId, nickname });
    applyUpdatedContact(data.contact || { ...target, nickname, contactName: nickname || target.displayName || target.email || 'Contacto' });
    closeContactNicknameModal();
    renderAll();
    showTemporaryDraftStatus(nickname ? 'Apodo privado guardado.' : 'Apodo privado eliminado.');
  } catch (error) {
    alert(error.message || 'No se pudo guardar el apodo privado.');
  } finally {
    state.contactNicknameSaving = false;
    renderContactNicknameModal();
  }
}

async function markActiveChatUnread() {
  if (!state.activeChatId) return;
  const data = await post('/api/chats/unread', { chatId: state.activeChatId });
  upsertChat(data.chat);
  renderAll();
  showTemporaryDraftStatus('Chat marcado como no leído.');
}

async function setChatArchived(chatId = '', archived = true) {
  if (!chatId) return;
  const previousChat = state.chats.find((item) => item.chatId === chatId) || null;
  const data = await post('/api/chats/archive', { chatId, archived });
  // La mutación ya devuelve el chat hidratado y también se replica por SSE. Aplicarla
  // localmente evita una segunda HTTP Response inmediata a /api/chats/list.
  upsertChat(data.chat);
  if (state.chatListMode === 'active' && state.chatsHasMore && archived && previousChat?.isPinned) {
    // Al salir un fijado cambia el offset del tramo pinned. Diferimos la reparación del
    // cursor hasta que el usuario pulse "Cargar más", sin arriesgar saltos ni duplicados.
    state.chatListPaginationDirty = true;
  }
  renderAll();
  showTemporaryDraftStatus(data.archived ? 'Chat archivado. Puedes verlo en Archivados.' : 'Chat restaurado a la lista principal.');
}

async function sendTyping(isTyping, options = {}) {
  const chatId = String(options.chatId || state.activeChatId || '').trim();
  if (!chatId || (isTyping && chatId === state.activeChatId && isChatInteractionBlocked())) return false;

  const now = Date.now();
  if (isTyping) {
    const sameActiveSignal = state.typingSignalActive && state.typingSignalChatId === chatId;
    if (sameActiveSignal && now - state.typingSignalLastSentAt < typingSignalRefreshMs) return false;
    state.typingSignalActive = true;
    state.typingSignalChatId = chatId;
    state.typingSignalLastSentAt = now;
  } else {
    if (!state.typingSignalActive || state.typingSignalChatId !== chatId) return false;
    state.typingSignalActive = false;
    state.typingSignalChatId = '';
    state.typingSignalLastSentAt = 0;
  }

  try {
    await post('/api/chats/typing', { chatId, isTyping });
    return true;
  } catch {
    // Si falló el alta, habilitamos un nuevo intento en la siguiente actividad.
    // El cierre no se reintenta agresivamente: el receptor ya expira el indicador localmente.
    if (isTyping && state.typingSignalActive && state.typingSignalChatId === chatId && state.typingSignalLastSentAt === now) {
      state.typingSignalActive = false;
      state.typingSignalChatId = '';
      state.typingSignalLastSentAt = 0;
    }
    return false;
  }
}

function openOwnQr() {
  openProfileCard(state.user || {});
}

async function openScanQr() {
  els.qrModal.setAttribute('aria-label', 'Escanear QR de contacto');
  els.qrBox.innerHTML = '';
  els.scanStatus.textContent = 'Apunta la cámara al código QR.';
  els.scanBox.classList.remove('hidden');
  els.manualCodeForm?.classList.remove('hidden');
  els.qrModal.classList.remove('hidden');
  await startScan();
}

function closeQrModal() {
  stopScan();
  els.qrModal.classList.add('hidden');
  els.manualCodeInput.value = '';
}

async function startScan() {
  if (!('BarcodeDetector' in window)) {
    els.scanStatus.textContent = 'Este navegador no permite escanear QR directamente. Pega el código o enlace abajo.';
    return;
  }
  try {
    state.scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    els.qrVideo.srcObject = state.scanStream;
    await els.qrVideo.play();
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const tick = async () => {
      if (!state.scanStream) return;
      try {
        const codes = await detector.detect(els.qrVideo);
        const value = codes?.[0]?.rawValue || '';
        if (value) {
          els.scanStatus.textContent = 'QR detectado. Agregando contacto...';
          await addContactByCode(value);
          closeQrModal();
          return;
        }
      } catch {}
      state.scanTimer = window.setTimeout(tick, 700);
    };
    tick();
  } catch {
    els.scanStatus.textContent = 'No se pudo abrir la cámara. Pega el código o enlace abajo.';
  }
}

function stopScan() {
  if (state.scanTimer) window.clearTimeout(state.scanTimer);
  state.scanTimer = 0;
  if (state.scanStream) state.scanStream.getTracks().forEach((track) => track.stop());
  state.scanStream = null;
  if (els.qrVideo) els.qrVideo.srcObject = null;
}

async function consumeAddFromUrl() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('add');
  if (!code || !state.user) return;
  try {
    await addContactByCode(code);
    url.searchParams.delete('add');
    window.history.replaceState(history.state && typeof history.state === 'object' ? history.state : {}, '', url.toString());
  } catch (error) {
    alert(error.message || 'No se pudo agregar el contacto del QR.');
  }
}

async function consumeChatFromUrl() {
  const url = new URL(window.location.href);
  const chatId = url.searchParams.get('chat');
  const messageId = url.searchParams.get('message');
  if (!chatId || !state.user) return;
  if (isMobileChatListPrimaryViewport()) {
    url.searchParams.delete('chat');
    url.searchParams.delete('message');
    window.history.replaceState(history.state && typeof history.state === 'object' ? history.state : {}, '', url.toString());
    renderAll();
    return;
  }
  if (state.chats.some((chat) => chat.chatId === chatId)) {
    await selectChat(chatId).catch(() => null);
    if (messageId) await openSearchResult(messageId).catch(() => null);
    url.searchParams.delete('chat');
    url.searchParams.delete('message');
    window.history.replaceState(history.state && typeof history.state === 'object' ? history.state : {}, '', url.toString());
  }
}

function buildActiveChatDeepLink() {
  if (!state.activeChatId) return '';
  const url = new URL(window.location.href);
  url.searchParams.set('chat', state.activeChatId);
  url.searchParams.delete('message');
  url.hash = '';
  return url.toString();
}

async function copyTextToClipboard(text = '') {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('No hay texto disponible para copiar.');
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(clean);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = clean;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('No se pudo copiar automáticamente.');
  return true;
}

async function copyActiveChatLink() {
  const link = buildActiveChatDeepLink();
  if (!link) throw new Error('Selecciona un chat antes de copiar su enlace.');
  await copyTextToClipboard(link);
  showTemporaryDraftStatus('Enlace interno del chat copiado. Solo funciona en cuentas con acceso a esta conversación.');
}

async function copyProfileShareLink(link = '') {
  const cleanLink = String(link || '').trim();
  if (!cleanLink) throw new Error('Este perfil todavía no tiene un enlace disponible.');
  await copyTextToClipboard(cleanLink);
  showTemporaryDraftStatus('Enlace del perfil copiado. Al pegarlo en WhatsApp mostrará la vista previa de ChatER.');
}

async function shareProfileQrImage(profile = state.contactShareTargetProfile || {}) {
  const qrUrl = buildProfileQrImageUrl(profile);
  const shareLink = buildProfileShareLink(profile);
  if (!qrUrl || !shareLink) throw new Error('Este perfil todavía no tiene un QR compartible.');
  const title = `QR de ${profileDisplayName(profile)} en chatER`;
  const text = `Agrega este contacto en chatER: ${profileDisplayName(profile)}`;
  try {
    const response = await fetch(qrUrl, { method: 'GET' });
    if (!response.ok) throw new Error('No se pudo preparar la imagen QR.');
    const blob = await response.blob();
    const fileName = `chater-${String(profile.profileCode || 'qr').replace(/[^a-z0-9_-]/gi, '')}.svg`;
    const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: blob.type || 'image/svg+xml' }) : null;
    if (file && navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ title, text, url: shareLink, files: [file] });
      showTemporaryDraftStatus('QR compartido como imagen.');
      return;
    }
    if (navigator.share) {
      await navigator.share({ title, text, url: shareLink });
      showTemporaryDraftStatus('Enlace del QR enviado con el menú de compartir.');
      return;
    }
  } catch (error) {
    if (/AbortError/i.test(error?.name || error?.message || '')) return;
  }
  await copyTextToClipboard(shareLink);
  showTemporaryDraftStatus('Tu dispositivo no permite compartir la imagen QR aquí. Copiamos el enlace del perfil.');
}


function normalizeLinkCandidate(value = '') {
  return normalizeLinkPreviewUrl(value);
}

function linkHostLabel(url = '') {
  return linkPreviewHostLabel(url);
}

function extractLinksFromText(text = '') {
  return extractLinkPreviewUrls(text);
}

function getActiveChatLinks() {
  const chat = activeChat();
  if (!chat?.chatId) return [];
  const messages = state.messagesByChat.get(chat.chatId) || [];
  const links = [];
  const seen = new Set();
  for (const message of messages.slice().reverse()) {
    if (!message?.messageId || isDeletedMessage(message)) continue;
    for (const url of extractLinksFromText(message.text || '')) {
      const dedupeKey = `${url}|${message.messageId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      links.push({
        url,
        host: linkHostLabel(url),
        messageId: message.messageId,
        messageText: message.text || '',
        createdAt: message.createdAt || '',
        senderUserId: message.senderUserId || ''
      });
    }
  }
  return links;
}

function closeLinkLibrary() {
  state.linkLibraryOpen = false;
  state.linkLibraryQuery = '';
  if (els.linkLibraryInput) els.linkLibraryInput.value = '';
  renderLinkLibraryModal();
}

function openLinkLibrary(initialQuery = '') {
  if (!state.activeChatId) throw new Error('Selecciona un chat para ver sus enlaces.');
  state.linkLibraryOpen = true;
  state.linkLibraryQuery = String(initialQuery || '').trim();
  if (els.linkLibraryInput) els.linkLibraryInput.value = state.linkLibraryQuery;
  renderLinkLibraryModal();
  window.setTimeout(() => {
    els.linkLibraryInput?.focus();
    els.linkLibraryInput?.select();
  }, 0);
}

function renderLinkLibraryModal() {
  if (!els.linkLibraryModal || !els.linkLibraryList) return;
  els.linkLibraryModal.classList.toggle('hidden', !state.linkLibraryOpen);
  if (!state.linkLibraryOpen) return;
  const chat = activeChat();
  if (!chat?.chatId) {
    els.linkLibraryList.innerHTML = '<div class="ce-link-library-empty">Selecciona un chat para revisar sus enlaces compartidos.</div>';
    return;
  }
  const query = normalizeClientSearchText(state.linkLibraryQuery || els.linkLibraryInput?.value || '');
  const allLinks = getActiveChatLinks();
  const filteredLinks = query
    ? allLinks.filter((item) => normalizeClientSearchText(`${item.url} ${item.host} ${item.messageText}`).includes(query))
    : allLinks;
  if (!allLinks.length) {
    els.linkLibraryList.innerHTML = '<div class="ce-link-library-empty">Este chat todavía no tiene enlaces. Cuando alguien comparta una URL aparecerá aquí automáticamente.</div>';
    return;
  }
  if (!filteredLinks.length) {
    els.linkLibraryList.innerHTML = '<div class="ce-link-library-empty">No hay enlaces que coincidan con ese filtro.</div>';
    return;
  }
  els.linkLibraryList.innerHTML = `
    <div class="ce-link-library-summary">${filteredLinks.length} de ${allLinks.length} ${allLinks.length === 1 ? 'enlace compartido' : 'enlaces compartidos'}</div>
    ${filteredLinks.map((item) => {
      const mine = item.senderUserId === state.user?.userId;
      return `<article class="ce-link-library-item">
        <div class="ce-link-library-item__main">
          <strong>${escapeHtml(item.host)}</strong>
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>
          <span>${escapeHtml(mine ? 'Tú' : chatDisplayName(chat))} · ${escapeHtml(formatScheduleDateTime(item.createdAt || Date.now()))}</span>
          <p>${escapeHtml(compactText(item.messageText || item.url, 160))}</p>
        </div>
        <div class="ce-link-library-item__actions">
          <button class="ce-link" type="button" data-copy-link-url="${escapeHtml(item.url)}">Copiar</button>
          <button class="ce-link" type="button" data-jump-link-message-id="${escapeHtml(item.messageId || '')}">Ver mensaje</button>
        </div>
      </article>`;
    }).join('')}`;
}

async function copySharedLink(url = '') {
  const cleanUrl = normalizeLinkCandidate(url);
  if (!cleanUrl) return;
  await copyTextToClipboard(cleanUrl);
  showTemporaryDraftStatus('Enlace copiado al portapapeles.');
}

const chatBriefStopWords = new Set('para como pero porque sobre entre desde hasta este esta esto estos estas aquel aquella aquellos aquellas que quien quienes cual cuales cuando donde todo toda todos todas con sin por los las del una unos unas mas menos muy bien solo cada aqui ahi alli hay fue eran eres soy somos sera seria sido tiene tienen tengo hacer hace hizo hice dice dijo puede pueden podemos nuestro nuestra tus sus mis le les se me te mi tu su al el la lo de a en y o u es un no si ya ok vale gracias favor hola buen buenas dias tarde noche'.split(' '));
const chatBriefPendingPattern = /\b(pendiente|pendientes|tarea|hacer|enviar|revisar|confirmar|pagar|llamar|responder|cotizar|aprobar|urgente|seguimiento|recordar|recordatorio|necesito|necesitamos|debo|debemos|falta|faltan|mañana|hoy|fecha|reunión|reunion|propuesta|entrega)\b/i;
const chatBriefDecisionPattern = /\b(aprobado|aprobada|confirmado|confirmada|listo|lista|queda|quedamos|decidido|decidida|aceptado|aceptada|autorizado|autorizada|de acuerdo|perfecto|correcto|cerrado|resuelto|hecho)\b/i;
const chatBriefQuestionPattern = /\?|\b(qué|que|cuál|cual|cuándo|cuando|dónde|donde|cómo|como|por qué|porque|quién|quien|puedes|podemos|confirmas|revisas|tienes|hay)\b/i;

function chatBriefMessageText(message = {}) {
  if (!message || isDeletedMessage(message)) return '';
  const poll = normalizePollClient(message);
  if (poll) return `Encuesta: ${poll.question}. Opciones: ${(poll.options || []).map((option) => option.text).join(', ')}`;
  return String(message.text || '').replace(/\s+/g, ' ').trim();
}

function chatBriefVisibleMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.messageId && !isDeletedMessage(message))
    .map((message) => ({ ...message, briefText: chatBriefMessageText(message) }))
    .filter((message) => message.briefText);
}

function chatBriefSenderLabel(message = {}, chat = {}) {
  return message.senderUserId === state.user?.userId ? 'Tú' : chatDisplayName(chat);
}

function chatBriefKeywordList(messages = []) {
  const counts = new Map();
  for (const message of messages.slice(-90)) {
    const words = normalizeClientSearchText(message.briefText || '')
      .split(/[^a-z0-9áéíóúñü]+/i)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && word.length <= 18 && !chatBriefStopWords.has(word) && !/^\d+$/.test(word));
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([word]) => word);
}

function chatBriefPickItems(messages = [], pattern, limit = 5) {
  const items = [];
  const seen = new Set();
  for (const message of messages.slice().reverse()) {
    const text = message.briefText || '';
    if (!pattern.test(text)) continue;
    const key = normalizeClientSearchText(text).slice(0, 140);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(message);
    if (items.length >= limit) break;
  }
  return items;
}

function buildChatBriefAnalysis(chat = {}, rawMessages = []) {
  const messages = chatBriefVisibleMessages(rawMessages);
  const mineCount = messages.filter((message) => message.senderUserId === state.user?.userId).length;
  const receivedCount = messages.length - mineCount;
  const linkCount = messages.reduce((total, message) => total + extractLinksFromText(message.briefText || '').length, 0);
  const pollsCount = messages.filter((message) => normalizePollClient(message)).length;
  const first = messages[0];
  const last = messages[messages.length - 1];
  return {
    messages,
    stats: {
      total: messages.length,
      mineCount,
      receivedCount,
      linkCount,
      pollsCount,
      fromLabel: first?.createdAt ? formatScheduleDateTime(first.createdAt) : 'Sin fecha inicial',
      toLabel: last?.createdAt ? formatScheduleDateTime(last.createdAt) : 'Sin fecha final'
    },
    keywords: chatBriefKeywordList(messages),
    pending: chatBriefPickItems(messages, chatBriefPendingPattern, 6),
    questions: chatBriefPickItems(messages, chatBriefQuestionPattern, 5),
    decisions: chatBriefPickItems(messages, chatBriefDecisionPattern, 5),
    recent: messages.slice(-5).reverse()
  };
}

function buildChatBriefText(chat = {}, rawMessages = []) {
  const brief = buildChatBriefAnalysis(chat, rawMessages);
  const lines = [
    `Resumen del chat · chatER`,
    `Chat: ${chatDisplayName(chat)}`,
    `Generado: ${formatExportDateTime(Date.now())}`,
    `Rango: ${brief.stats.fromLabel} hasta ${brief.stats.toLabel}`,
    `Mensajes analizados: ${brief.stats.total} · Tú: ${brief.stats.mineCount} · Contacto: ${brief.stats.receivedCount} · Enlaces: ${brief.stats.linkCount} · Encuestas: ${brief.stats.pollsCount}`,
    `Temas frecuentes: ${brief.keywords.length ? brief.keywords.join(', ') : 'sin temas suficientes'}`,
    ''.padEnd(42, '-')
  ];
  const appendSection = (title, items, emptyText) => {
    lines.push('', title);
    if (!items.length) {
      lines.push(`- ${emptyText}`);
      return;
    }
    for (const message of items) {
      lines.push(`- [${formatExportDateTime(message.createdAt)}] ${chatBriefSenderLabel(message, chat)}: ${compactText(message.briefText, 190)}`);
    }
  };
  appendSection('Pendientes detectados', brief.pending, 'No se detectaron pendientes claros en los mensajes cargados.');
  appendSection('Preguntas recientes', brief.questions, 'No se detectaron preguntas recientes.');
  appendSection('Acuerdos o decisiones detectadas', brief.decisions, 'No se detectaron acuerdos explícitos.');
  appendSection('Últimos mensajes relevantes', brief.recent, 'No hay mensajes para mostrar.');
  return `${lines.join('\n')}\n`;
}

function localDateInputKey(value = '') {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateJumpLabel(dateKey = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return 'Sin fecha';
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function buildDateJumpTimeline(messages = []) {
  const days = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message?.messageId || !message.createdAt) continue;
    const dateKey = localDateInputKey(message.createdAt);
    if (!dateKey) continue;
    const current = days.get(dateKey) || {
      dateKey,
      count: 0,
      firstMessageId: message.messageId,
      firstMessageAt: message.createdAt,
      lastMessageId: message.messageId,
      lastMessageAt: message.createdAt,
      preview: ''
    };
    current.count += 1;
    current.lastMessageId = message.messageId;
    current.lastMessageAt = message.createdAt;
    if (!current.preview && !isDeletedMessage(message)) current.preview = compactText(chatBriefMessageText(message) || message.text || '', 120);
    days.set(dateKey, current);
  }
  return [...days.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function closeDateJump() {
  state.dateJumpOpen = false;
  state.dateJumpLoading = false;
  state.dateJumpError = '';
  renderDateJumpModal();
}

async function loadDateJumpTimeline() {
  const chat = activeChat();
  if (!chat?.chatId) return;
  const chatId = chat.chatId;
  state.dateJumpLoading = true;
  state.dateJumpError = '';
  renderDateJumpModal();
  try {
    const messages = await loadMessageHistoryPages(chatId, { maxMessages: 500 });
    if (state.activeChatId !== chatId || state.dateJumpChatId !== chatId) return;
    state.messagesByChat.set(chatId, messages);
    state.dateJumpDays = buildDateJumpTimeline(messages);
    if (!state.dateJumpSelected && state.dateJumpDays.length) state.dateJumpSelected = state.dateJumpDays[0].dateKey;
  } catch {
    if (state.activeChatId !== chatId || state.dateJumpChatId !== chatId) return;
    const cached = state.messagesByChat.get(chatId) || [];
    state.dateJumpDays = buildDateJumpTimeline(cached);
    state.dateJumpError = 'No se pudo actualizar desde el servidor. Se muestra la línea de tiempo cargada en este dispositivo.';
  } finally {
    if (state.activeChatId === chatId && state.dateJumpChatId === chatId) {
      state.dateJumpLoading = false;
      renderDateJumpModal();
    }
  }
}

async function openDateJump() {
  const chat = activeChat();
  if (!chat?.chatId) throw new Error('Selecciona un chat para buscar por fecha.');
  if (state.dateJumpChatId !== chat.chatId) {
    state.dateJumpSelected = '';
    state.dateJumpDays = [];
    state.dateJumpError = '';
    state.dateJumpChatId = chat.chatId;
  }
  state.dateJumpOpen = true;
  state.dateJumpError = '';
  const messages = state.messagesByChat.get(chat.chatId) || [];
  state.dateJumpDays = buildDateJumpTimeline(messages);
  state.dateJumpSelected = state.dateJumpSelected || localDateInputKey(messages[messages.length - 1]?.createdAt || Date.now());
  renderDateJumpModal();
  window.setTimeout(() => {
    els.dateJumpInput?.focus();
    els.dateJumpInput?.select();
  }, 0);
  await loadDateJumpTimeline();
}

async function jumpToDateKey(dateKey = '') {
  const cleanDateKey = String(dateKey || state.dateJumpSelected || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDateKey)) {
    showTemporaryDraftStatus('Selecciona una fecha válida para saltar dentro del chat.', 3600);
    return;
  }
  const targetDay = state.dateJumpDays.find((item) => item.dateKey === cleanDateKey);
  if (!targetDay?.firstMessageId) {
    showTemporaryDraftStatus('No hay mensajes guardados para esa fecha en los últimos 500 mensajes cargados.', 4200);
    return;
  }
  closeDateJump();
  await jumpToMessage(targetDay.firstMessageId);
  showTemporaryDraftStatus(`Saltaste al primer mensaje del ${formatDateJumpLabel(cleanDateKey)}.`, 4200);
}

function renderDateJumpModal() {
  if (!els.dateJumpModal || !els.dateJumpList) return;
  els.dateJumpModal.classList.toggle('hidden', !state.dateJumpOpen);
  if (!state.dateJumpOpen) return;
  const chat = activeChat();
  if (els.dateJumpInput) els.dateJumpInput.value = state.dateJumpSelected || '';
  if (!chat?.chatId) {
    els.dateJumpList.innerHTML = '<div class="ce-date-jump-empty">Selecciona un chat para revisar su calendario de mensajes.</div>';
    return;
  }
  if (state.dateJumpLoading) {
    els.dateJumpList.innerHTML = '<div class="ce-date-jump-empty">Actualizando calendario del chat...</div>';
    return;
  }
  if (!state.dateJumpDays.length) {
    els.dateJumpList.innerHTML = `<div class="ce-date-jump-empty">${escapeHtml(state.dateJumpError || 'Este chat todavía no tiene mensajes para navegar por fecha.')}</div>`;
    return;
  }
  const selected = state.dateJumpSelected || state.dateJumpDays[0]?.dateKey || '';
  els.dateJumpList.innerHTML = `
    ${state.dateJumpError ? `<div class="ce-date-jump-warning">${escapeHtml(state.dateJumpError)}</div>` : ''}
    <div class="ce-date-jump-summary">${state.dateJumpDays.length} ${state.dateJumpDays.length === 1 ? 'día con mensajes' : 'días con mensajes'} disponibles en los últimos 500 mensajes.</div>
    <div class="ce-date-jump-actions">
      <button class="ce-btn ce-btn--primary ce-btn--small" type="button" data-jump-selected-date="1">Ir a la fecha seleccionada</button>
      <button class="ce-link" type="button" data-refresh-date-jump="1">Actualizar</button>
    </div>
    <div class="ce-date-jump-days">
      ${state.dateJumpDays.map((day) => {
        const isSelected = day.dateKey === selected;
        return `<button class="ce-date-jump-day${isSelected ? ' active' : ''}" type="button" data-date-jump-day="${escapeHtml(day.dateKey)}" aria-pressed="${isSelected ? 'true' : 'false'}">
          <span><strong>${escapeHtml(formatDateJumpLabel(day.dateKey))}</strong><em>${escapeHtml(formatScheduleDateTime(day.firstMessageAt || Date.now()))} ${uiIcon('arrowRight')} ${escapeHtml(formatScheduleDateTime(day.lastMessageAt || Date.now()))}</em></span>
          <b>${day.count}</b>
          <small>${escapeHtml(day.preview || 'Sin vista previa disponible')}</small>
        </button>`;
      }).join('')}
    </div>`;
}

function closeChatBrief() {
  state.chatBriefOpen = false;
  state.chatBriefLoading = false;
  state.chatBriefError = '';
  renderChatBriefModal();
}

async function openChatBrief() {
  const chat = activeChat();
  if (!chat?.chatId) throw new Error('Selecciona un chat para generar el resumen.');
  state.chatBriefOpen = true;
  state.chatBriefLoading = true;
  state.chatBriefError = '';
  renderChatBriefModal();
  try {
    const messages = await loadMessageHistoryPages(chat.chatId, { maxMessages: 500 });
    state.messagesByChat.set(chat.chatId, messages);
  } catch {
    state.chatBriefError = 'No se pudo actualizar desde el servidor. Se muestra el resumen con los mensajes ya cargados en este dispositivo.';
  } finally {
    state.chatBriefLoading = false;
    renderAll();
  }
}

function renderChatBriefItems(title = '', items = [], chat = {}, emptyText = '', options = {}) {
  const allowReminder = Boolean(options.allowReminder);
  const body = items.length ? items.map((message) => {
    const reminderButton = allowReminder && message.messageId
      ? `<button class="ce-link ce-chat-brief-reminder" type="button" data-reminder-from-brief-message-id="${escapeHtml(message.messageId || '')}">Crear recordatorio</button>`
      : '';
    return `<article class="ce-chat-brief-item">
      <div><strong>${escapeHtml(chatBriefSenderLabel(message, chat))}</strong><span>${escapeHtml(formatScheduleDateTime(message.createdAt || Date.now()))}</span></div>
      <p>${escapeHtml(compactText(message.briefText || '', 210))}</p>
      <div class="ce-chat-brief-item__actions">
        <button class="ce-link" type="button" data-jump-brief-message-id="${escapeHtml(message.messageId || '')}">Ver mensaje</button>
        ${reminderButton}
      </div>
    </article>`;
  }).join('') : `<div class="ce-chat-brief-empty">${escapeHtml(emptyText)}</div>`;
  return `<section class="ce-chat-brief-section"><h3>${escapeHtml(title)}</h3>${body}</section>`;
}

function renderChatBriefModal() {
  if (!els.chatBriefModal || !els.chatBriefList) return;
  els.chatBriefModal.classList.toggle('hidden', !state.chatBriefOpen);
  if (!state.chatBriefOpen) return;
  const chat = activeChat();
  if (!chat?.chatId) {
    els.chatBriefList.innerHTML = '<div class="ce-chat-brief-empty">Selecciona un chat para generar su resumen.</div>';
    return;
  }
  if (state.chatBriefLoading) {
    els.chatBriefList.innerHTML = '<div class="ce-chat-brief-empty">Preparando resumen ejecutivo del chat...</div>';
    return;
  }
  const messages = state.messagesByChat.get(chat.chatId) || [];
  const brief = buildChatBriefAnalysis(chat, messages);
  const warning = state.chatBriefError ? `<div class="ce-chat-brief-warning">${escapeHtml(state.chatBriefError)}</div>` : '';
  if (!brief.stats.total) {
    els.chatBriefList.innerHTML = `${warning}<div class="ce-chat-brief-empty">Aún no hay mensajes suficientes para crear un resumen útil.</div>`;
    return;
  }
  const topics = brief.keywords.length ? brief.keywords.map((word) => `<span>${escapeHtml(word)}</span>`).join('') : '<em>Sin temas repetidos todavía.</em>';
  els.chatBriefList.innerHTML = `${warning}
    <div class="ce-chat-brief-stats" role="list" aria-label="Indicadores del resumen">
      <span role="listitem"><strong>${brief.stats.total}</strong><em>mensajes</em></span>
      <span role="listitem"><strong>${brief.stats.mineCount}</strong><em>tuyos</em></span>
      <span role="listitem"><strong>${brief.stats.receivedCount}</strong><em>del contacto</em></span>
      <span role="listitem"><strong>${brief.stats.linkCount}</strong><em>enlaces</em></span>
      <span role="listitem"><strong>${brief.stats.pollsCount}</strong><em>encuestas</em></span>
    </div>
    <div class="ce-chat-brief-range"><span>${escapeHtml(brief.stats.fromLabel)}</span>${uiIcon('arrowRight')}<span>${escapeHtml(brief.stats.toLabel)}</span></div>
    <div class="ce-chat-brief-topics" aria-label="Temas frecuentes">${topics}</div>
    <div class="ce-chat-brief-actions"><button class="ce-btn ce-btn--small" type="button" data-copy-chat-brief="1">Copiar resumen</button></div>
    ${renderChatBriefItems('Pendientes detectados', brief.pending, chat, 'No se detectaron pendientes claros en los mensajes cargados.', { allowReminder: true })}
    ${renderChatBriefItems('Preguntas recientes', brief.questions, chat, 'No se detectaron preguntas recientes.')}
    ${renderChatBriefItems('Acuerdos o decisiones', brief.decisions, chat, 'No se detectaron acuerdos explícitos.')}
    ${renderChatBriefItems('Últimos mensajes relevantes', brief.recent, chat, 'No hay mensajes recientes para mostrar.')}`;
}

async function copyChatBriefToClipboard() {
  const chat = activeChat();
  if (!chat?.chatId) return;
  const messages = state.messagesByChat.get(chat.chatId) || [];
  await copyTextToClipboard(buildChatBriefText(chat, messages));
  showTemporaryDraftStatus('Resumen del chat copiado al portapapeles.');
}


function resetGlobalSearchState({ keepQuery = false } = {}) {
  if (!keepQuery) state.globalSearchQuery = '';
  state.globalSearchResults = [];
  state.globalSearchLoading = false;
  state.globalSearchSearchedChats = 0;
  state.globalSearchNextCursor = null;
  state.globalSearchHasMore = false;
  if (!keepQuery && els.globalSearchInput) els.globalSearchInput.value = '';
}

function openGlobalSearch(initialQuery = '') {
  if (!state.user) return;
  state.globalSearchOpen = true;
  if (initialQuery) {
    state.globalSearchQuery = String(initialQuery || '').trim();
    if (els.globalSearchInput) els.globalSearchInput.value = state.globalSearchQuery;
  }
  renderGlobalSearchModal();
  window.setTimeout(() => {
    els.globalSearchInput?.focus();
    els.globalSearchInput?.select();
  }, 0);
}

function closeGlobalSearch() {
  state.globalSearchOpen = false;
  renderGlobalSearchModal();
}

function globalSearchChatTitle(chat = {}) {
  if (!chat?.chatId) return 'Chat';
  if (chat.type === 'self') return 'Notas para mí';
  return contactDisplayName(chat.other || {});
}

function renderGlobalSearchModal() {
  if (!els.globalSearchModal || !els.globalSearchList) return;
  els.globalSearchModal.classList.toggle('hidden', !state.globalSearchOpen);
  if (!state.globalSearchOpen) return;
  const query = state.globalSearchQuery || String(els.globalSearchInput?.value || '').trim();
  const results = Array.isArray(state.globalSearchResults) ? state.globalSearchResults : [];
  if (state.globalSearchLoading && !results.length) {
    els.globalSearchList.innerHTML = '<div class="ce-global-search-empty">Buscando en tus conversaciones...</div>';
    return;
  }
  if (!query) {
    els.globalSearchList.innerHTML = '<div class="ce-global-search-empty">Escribe una palabra o frase para buscar en chats activos y archivados.</div>';
    return;
  }
  if (query.length < 2) {
    els.globalSearchList.innerHTML = '<div class="ce-global-search-empty">Escribe al menos 2 caracteres para iniciar la búsqueda.</div>';
    return;
  }
  const loadMore = state.globalSearchHasMore
    ? `<button class="ce-link" type="button" data-global-search-load-more="1"${state.globalSearchLoading ? ' disabled' : ''}>${state.globalSearchLoading ? 'Cargando más...' : 'Cargar más resultados'}</button>`
    : '';
  if (!results.length) {
    els.globalSearchList.innerHTML = state.globalSearchHasMore
      ? `<div class="ce-global-search-empty">Todavía no hay coincidencias en los chats revisados.</div>${loadMore}`
      : `<div class="ce-global-search-empty">No encontramos mensajes con “${escapeHtml(query)}”.</div>`;
    return;
  }
  els.globalSearchList.innerHTML = `
    <div class="ce-global-search-summary">${results.length} ${results.length === 1 ? 'resultado' : 'resultados'} · ${state.globalSearchSearchedChats || 'tus'} chats revisados</div>
    ${results.map((item) => {
      const chat = item.chat || {};
      const message = item.message || {};
      const mine = message.senderUserId === state.user?.userId;
      const archived = chat.isArchived ? '<small>Archivado</small>' : '';
      return `<button class="ce-global-search-result" type="button" data-global-search-chat-id="${escapeHtml(chat.chatId || '')}" data-global-search-message-id="${escapeHtml(message.messageId || '')}">
        <span class="ce-global-search-result__head"><strong>${escapeHtml(globalSearchChatTitle(chat))}</strong>${archived}<em>${escapeHtml(formatMessageTime(message.createdAt))}</em></span>
        <span class="ce-global-search-result__body"><b>${mine ? 'Tú' : 'Contacto'}:</b> ${escapeHtml(message.excerpt || message.text || '')}</span>
      </button>`;
    }).join('')}
    ${loadMore}`;
}

async function searchAllChats(query = '', { append = false } = {}) {
  const cleanQuery = String(query || '').trim();
  if (!append) {
    state.globalSearchQuery = cleanQuery;
    state.globalSearchResults = [];
    state.globalSearchSearchedChats = 0;
    state.globalSearchNextCursor = null;
    state.globalSearchHasMore = false;
  }
  if (cleanQuery.length < 2) {
    state.globalSearchLoading = false;
    renderGlobalSearchModal();
    return;
  }
  if (append && (!state.globalSearchHasMore || !state.globalSearchNextCursor)) return;

  const requestSequence = ++globalSearchRequestSequence;
  const cursor = append ? state.globalSearchNextCursor : null;
  state.globalSearchLoading = true;
  renderGlobalSearchModal();
  try {
    const data = await post('/api/chats/search-all', { query: cleanQuery, limit: 40, cursor, includeArchived: true });
    if (requestSequence !== globalSearchRequestSequence || state.globalSearchQuery !== cleanQuery) return;
    const incoming = Array.isArray(data.matches) ? data.matches : [];
    const merged = append ? [...state.globalSearchResults, ...incoming] : incoming;
    state.globalSearchQuery = data.query || cleanQuery;
    state.globalSearchResults = Array.from(new Map(merged.map((item) => [
      `${item.chat?.chatId || ''}:${item.message?.messageId || ''}`,
      item
    ])).values()).sort((a, b) => (Date.parse(b.message?.createdAt || 0) || 0) - (Date.parse(a.message?.createdAt || 0) || 0));
    state.globalSearchSearchedChats = Number(data.searchedChats || 0);
    state.globalSearchNextCursor = data.page?.nextCursor || null;
    state.globalSearchHasMore = Boolean(data.page?.hasMore && state.globalSearchNextCursor);
    for (const item of incoming) {
      if (item.chat?.chatId) upsertChat(item.chat);
      if (item.message?.messageId) upsertMessage(item.message);
    }
  } catch (error) {
    if (requestSequence !== globalSearchRequestSequence) return;
    if (append && state.globalSearchResults.length) {
      showTemporaryDraftStatus(error.message || 'No se pudieron cargar más resultados.', 3200);
    } else {
      state.globalSearchResults = [];
      state.globalSearchSearchedChats = 0;
      state.globalSearchNextCursor = null;
      state.globalSearchHasMore = false;
      els.globalSearchList.innerHTML = `<div class="ce-global-search-empty">${escapeHtml(error.message || 'No se pudo completar la búsqueda global.')}</div>`;
      return;
    }
  } finally {
    if (requestSequence === globalSearchRequestSequence) state.globalSearchLoading = false;
  }
  if (requestSequence === globalSearchRequestSequence) renderGlobalSearchModal();
}

async function openGlobalSearchResult(chatId = '', messageId = '') {
  if (!chatId) return;
  closeGlobalSearch();
  if (!state.chats.some((chat) => chat.chatId === chatId)) await loadChats({ includeArchived: false }).catch(() => null);
  if (!state.chats.some((chat) => chat.chatId === chatId)) await loadChats({ includeArchived: true }).catch(() => null);
  if (!state.chats.some((chat) => chat.chatId === chatId)) throw new Error('No se pudo abrir el chat del resultado.');
  await selectChat(chatId);
  if (messageId) await jumpToMessage(messageId);
}

function closeGlobalStarred() {
  state.globalStarredOpen = false;
  renderGlobalStarredModal();
}

function renderGlobalStarredModal() {
  if (!els.globalStarredModal || !els.globalStarredList) return;
  els.globalStarredModal.classList.toggle('hidden', !state.globalStarredOpen);
  if (!state.globalStarredOpen) return;
  const items = Array.isArray(state.globalStarredMessages) ? state.globalStarredMessages : [];
  if (state.globalStarredLoading && !items.length) {
    els.globalStarredList.innerHTML = '<div class="ce-global-starred-empty">Cargando tus mensajes destacados...</div>';
    return;
  }
  const loadMore = state.globalStarredHasMore
    ? `<button class="ce-link" type="button" data-global-starred-load-more="1"${state.globalStarredLoading ? ' disabled' : ''}>${state.globalStarredLoading ? 'Cargando más...' : 'Cargar más destacados'}</button>`
    : '';
  if (!items.length) {
    els.globalStarredList.innerHTML = state.globalStarredHasMore
      ? `<div class="ce-global-starred-empty">No aparecieron destacados en los chats revisados hasta ahora.</div>${loadMore}`
      : '<div class="ce-global-starred-empty">Aún no tienes mensajes destacados. Usa la acción Destacar en cualquier mensaje para guardarlo aquí.</div>';
    return;
  }
  els.globalStarredList.innerHTML = `
    <div class="ce-global-starred-summary">${items.length} ${items.length === 1 ? 'destacado' : 'destacados'} · ${state.globalStarredScannedChats || 'tus'} chats revisados</div>
    ${items.map((item) => {
      const chat = item.chat || {};
      const message = item.message || {};
      const mine = message.senderUserId === state.user?.userId;
      const archived = chat.isArchived ? '<small>Archivado</small>' : '';
      return `<article class="ce-global-starred-item">
        <button class="ce-global-starred-item__main" type="button" data-global-starred-chat-id="${escapeHtml(chat.chatId || '')}" data-global-starred-message-id="${escapeHtml(message.messageId || '')}">
          <span class="ce-global-starred-item__head"><strong>${uiIcon('star')}<span>${escapeHtml(globalSearchChatTitle(chat))}</span></strong>${archived}<em>${escapeHtml(formatMessageTime(message.createdAt))}</em></span>
          <span class="ce-global-starred-item__body"><b>${mine ? 'Tú' : 'Contacto'}:</b> ${escapeHtml(message.excerpt || message.text || 'Mensaje destacado')}</span>
        </button>
        <button class="ce-link" type="button" data-global-starred-unstar-chat-id="${escapeHtml(chat.chatId || '')}" data-global-starred-unstar-message-id="${escapeHtml(message.messageId || '')}">Quitar</button>
      </article>`;
    }).join('')}
    ${loadMore}`;
}

async function loadGlobalStarredMessages({ silent = false, force = false, append = false } = {}) {
  if (!state.user) return [];
  if (append && (!state.globalStarredHasMore || !state.globalStarredNextCursor)) return state.globalStarredMessages;
  if (!append) {
    if (!force && state.globalStarredLoaded && !state.globalStarredDirty) return state.globalStarredMessages;
  }
  if (force || (!append && state.globalStarredDirty)) {
    state.globalStarredNextCursor = null;
    state.globalStarredHasMore = false;
    if (force) {
      state.globalStarredMessages = [];
      state.globalStarredScannedChats = 0;
    }
  }
  state.globalStarredLoading = !silent || append;
  renderGlobalStarredModal();
  try {
    const cursor = append ? state.globalStarredNextCursor : null;
    const data = await post('/api/chats/starred/all', { limit: 40, cursor, includeArchived: true });
    const incoming = Array.isArray(data.messages) ? data.messages : [];
    const merged = append ? [...state.globalStarredMessages, ...incoming] : incoming;
    state.globalStarredMessages = Array.from(new Map(merged.map((item) => [
      `${item.chat?.chatId || ''}:${item.message?.messageId || ''}`,
      item
    ])).values()).sort((a, b) => (Date.parse(b.message?.createdAt || 0) || 0) - (Date.parse(a.message?.createdAt || 0) || 0));
    state.globalStarredScannedChats = Number(data.searchedChats || data.scannedChats || 0);
    state.globalStarredNextCursor = data.page?.nextCursor || null;
    state.globalStarredHasMore = Boolean(data.page?.hasMore && state.globalStarredNextCursor);
    state.globalStarredLoaded = true;
    state.globalStarredDirty = false;
    for (const item of incoming) {
      if (item.chat?.chatId) upsertChat(item.chat);
      if (item.message?.messageId) upsertMessage(item.message);
    }
    return state.globalStarredMessages;
  } finally {
    state.globalStarredLoading = false;
    renderGlobalStarredModal();
  }
}

async function openGlobalStarred() {
  if (!state.user) return;
  state.globalStarredOpen = true;
  renderGlobalStarredModal();
  await loadGlobalStarredMessages();
}

async function openGlobalStarredResult(chatId = '', messageId = '') {
  if (!chatId) return;
  closeGlobalStarred();
  if (!state.chats.some((chat) => chat.chatId === chatId)) await loadChats({ includeArchived: false }).catch(() => null);
  if (!state.chats.some((chat) => chat.chatId === chatId)) await loadChats({ includeArchived: true }).catch(() => null);
  if (!state.chats.some((chat) => chat.chatId === chatId)) throw new Error('No se pudo abrir el chat del destacado.');
  await selectChat(chatId);
  if (messageId) await jumpToMessage(messageId);
}

function syncGlobalStarredMessage(message = {}) {
  if (!message?.messageId || !message?.chatId || !state.globalStarredLoaded) return;
  const index = state.globalStarredMessages.findIndex((item) => item.message?.messageId === message.messageId && item.chat?.chatId === message.chatId);
  if (!message.isStarred || isDeletedMessage(message)) {
    if (index >= 0) state.globalStarredMessages.splice(index, 1);
    return;
  }
  const chat = state.chats.find((item) => item.chatId === message.chatId) || { chatId: message.chatId };
  const nextItem = { chat, message: { ...message, excerpt: compactText(message.text || '', 180) } };
  if (index >= 0) state.globalStarredMessages[index] = { ...state.globalStarredMessages[index], ...nextItem };
  else state.globalStarredMessages.unshift(nextItem);
  state.globalStarredMessages.sort((a, b) => (Date.parse(b.message?.createdAt || 0) || 0) - (Date.parse(a.message?.createdAt || 0) || 0));
}

async function removeGlobalStarredMessage(chatId = '', messageId = '') {
  const cleanChatId = String(chatId || '').trim();
  const cleanMessageId = String(messageId || '').trim();
  if (!cleanChatId || !cleanMessageId) return;
  const previousActiveChatId = state.activeChatId;
  const data = await post('/api/chats/star', { chatId: cleanChatId, messageId: cleanMessageId, starred: false });
  if (data.message?.messageId) {
    upsertMessage(data.message);
    syncStarredPanelMessage(data.message);
    syncGlobalStarredMessage(data.message);
  } else {
    state.globalStarredMessages = state.globalStarredMessages.filter((item) => !(item.chat?.chatId === cleanChatId && item.message?.messageId === cleanMessageId));
  }
  if (previousActiveChatId === cleanChatId) renderAll();
  else renderGlobalStarredModal();
  showTemporaryDraftStatus('Mensaje quitado de destacados.');
}

function focusChatSearchInput() {
  if (!state.activeChatId) throw new Error('Selecciona un chat antes de buscar mensajes.');
  setChatSearchOpen(true, { focus: true });
}

function showContactsTab() {
  els.tabContacts?.classList.add('active');
  els.tabChats?.classList.remove('active');
  els.tabUnread?.classList.remove('active');
  els.tabArchived?.classList.remove('active');
  els.contactList?.classList.remove('hidden');
  els.chatList?.classList.add('hidden');
  els.chatLabelFilters?.classList.add('hidden');
}



function cycleMessageTtl() {
  if (!els.messageTtlSelect) return;
  if (isChatInteractionBlocked()) {
    showTemporaryDraftStatus(chatBlockNoticeText(), 4200);
    return;
  }
  const current = selectedEphemeralSeconds();
  const currentIndex = ephemeralOptions.indexOf(current);
  const next = ephemeralOptions[(currentIndex + 1) % ephemeralOptions.length] || 0;
  els.messageTtlSelect.value = String(next);
  updateComposerControls();
  renderScheduleModal();
  showTemporaryDraftStatus(next ? `Mensajes temporales activados: expiran en ${formatEphemeralOption(next)} después de lectura.` : 'Mensajes temporales desactivados.');
}

function getCommandPaletteCommands() {
  const chat = activeChat();
  const composerText = String(els.messageInput?.value || '').trim();
  const hasChat = Boolean(chat?.chatId);
  const blocked = isChatInteractionBlocked(chat);
  const canSchedule = hasChat && !blocked && composerText && !state.editingMessage?.messageId && !state.schedulingMessage;
  const unreadCount = unreadChatsCount();
  return [
    {
      id: 'privacy-mode',
      title: state.privacyMode ? 'Desactivar modo privacidad' : 'Activar modo privacidad',
      description: 'Oculta nombres, vistas previas y mensajes cuando usas chatER en espacios compartidos.',
      shortcut: 'Ctrl/Cmd + Shift + P',
      enabled: Boolean(state.user),
      run: () => togglePrivacyMode({ announce: true })
    },
    {
      id: 'privacy-lock',
      title: state.privacyLock.enabled ? 'Bloquear pantalla ahora' : 'Configurar bloqueo por PIN',
      description: state.privacyLock.enabled
        ? 'Oculta toda la pantalla de chatER hasta ingresar tu PIN local en este dispositivo.'
        : 'Agrega un bloqueo local por PIN para proteger tus conversaciones en equipos compartidos.',
      shortcut: 'Ctrl/Cmd + Alt + P',
      enabled: Boolean(state.user),
      run: () => runPrivacyLockShortcut()
    },
    {
      id: 'compact-mode',
      title: state.compactMode ? 'Desactivar modo compacto' : 'Activar modo compacto',
      description: 'Ajusta la interfaz para ver más chats y mensajes en pantalla sin perder acciones importantes.',
      shortcut: 'Ctrl/Cmd + Alt + C',
      enabled: Boolean(state.user),
      run: () => toggleCompactMode({ announce: true })
    },
    {
      id: 'notification-pause',
      title: isNotificationPauseActive() ? 'Desactivar No molestar' : 'Activar No molestar por 8 horas',
      description: isNotificationPauseActive()
        ? `Las notificaciones push están pausadas hasta ${notificationPauseUntilLabel()}.`
        : 'Pausa todas las notificaciones push sin silenciar chats uno por uno.',
      shortcut: 'No molestar',
      enabled: Boolean(state.user),
      run: () => toggleNotificationPause()
    },
    {
      id: 'self-notes',
      title: 'Abrir Notas para mí',
      description: 'Crea o abre tu chat privado para guardar ideas, enlaces, tareas y mensajes reenviados.',
      shortcut: 'Ctrl/Cmd + Shift + N',
      enabled: Boolean(state.user),
      run: () => openSelfNotesChat()
    },
    {
      id: 'search-chat',
      title: 'Buscar en este chat',
      description: 'Encuentra mensajes dentro de la conversación activa.',
      shortcut: 'Ctrl/Cmd + K · buscar',
      enabled: hasChat,
      run: () => focusChatSearchInput()
    },
    {
      id: 'link-library',
      title: 'Ver enlaces compartidos',
      description: 'Abre una biblioteca con las URLs detectadas en el chat activo para copiarlas o volver al mensaje original.',
      shortcut: 'Ctrl/Cmd + Alt + L',
      enabled: hasChat,
      run: () => openLinkLibrary()
    },
    {
      id: 'chat-brief',
      title: 'Generar resumen del chat',
      description: 'Crea una vista ejecutiva local con pendientes, preguntas, acuerdos, temas frecuentes y últimos mensajes.',
      shortcut: 'Ctrl/Cmd + Alt + B',
      enabled: hasChat,
      run: () => openChatBrief()
    },
    {
      id: 'scroll-bottom',
      title: 'Ir al final del chat',
      description: 'Vuelve al último mensaje sin perder mensajes nuevos cuando estabas leyendo arriba.',
      shortcut: 'Ctrl/Cmd + End',
      enabled: hasChat,
      run: () => scrollMessagesToBottom({ smooth: true, resetNew: true })
    },
    {
      id: 'search-all-chats',
      title: 'Buscar en todos los chats',
      description: 'Encuentra mensajes en conversaciones activas y archivadas sin abrir chat por chat.',
      shortcut: 'Ctrl/Cmd + Shift + F',
      enabled: Boolean(state.user),
      run: () => openGlobalSearch()
    },
    {
      id: 'starred-inbox',
      title: 'Abrir bandeja de destacados',
      description: 'Reúne mensajes destacados en todos tus chats, incluidos archivados.',
      shortcut: 'Ctrl/Cmd + Alt + S',
      enabled: Boolean(state.user),
      run: () => openGlobalStarred()
    },
    {
      id: 'drafts-inbox',
      title: 'Abrir borradores pendientes',
      description: 'Continúa mensajes guardados sin revisar chat por chat.',
      shortcut: 'Ctrl/Cmd + Alt + D',
      enabled: Boolean(state.user),
      run: () => openDraftsModal()
    },
    {
      id: 'starred-chat',
      title: 'Ver mensajes destacados',
      description: 'Abre los destacados privados de este chat.',
      shortcut: 'Destacados',
      enabled: hasChat,
      run: () => loadStarredMessages()
    },
    {
      id: 'quick-replies',
      title: 'Abrir respuestas rápidas',
      description: 'Inserta o guarda textos frecuentes para responder más rápido.',
      shortcut: 'Rápidas',
      enabled: hasChat,
      run: async () => {
        state.quickRepliesOpen = true;
        renderQuickRepliesPanel();
        await loadQuickReplies();
      }
    },
    {
      id: 'smart-replies',
      title: 'Sugerir respuestas inteligentes',
      description: 'Propone respuestas breves generadas localmente desde el contexto reciente del chat.',
      shortcut: 'Ctrl/Cmd + Shift + G',
      enabled: hasChat && !blocked && !state.editingMessage?.messageId && Boolean(buildSmartReplySuggestions().length),
      run: () => openSmartReplySuggestions()
    },
    {
      id: 'private-notes',
      title: 'Abrir notas privadas del chat',
      description: 'Guarda contexto, pendientes o datos sensibles visibles solo para tu cuenta.',
      shortcut: 'Ctrl/Cmd + Shift + L',
      enabled: hasChat,
      run: () => openPrivateNotesModal()
    },
    {
      id: 'chat-labels',
      title: 'Editar etiquetas del chat',
      description: 'Agrupa conversaciones por cliente, proyecto, prioridad o cualquier categoría personal.',
      shortcut: 'Ctrl/Cmd + Shift + T',
      enabled: hasChat,
      run: () => openLabelsModal()
    },
    {
      id: 'contact-nickname',
      title: chat?.other?.nickname ? 'Editar apodo privado' : 'Agregar apodo privado',
      description: 'Personaliza cómo ves el nombre de este contacto sin cambiar su perfil ni avisarle a la otra persona.',
      shortcut: 'Ctrl/Cmd + Shift + Y',
      enabled: hasChat && !isSelfChat(chat),
      run: () => openActiveContactNicknameModal()
    },
    {
      id: 'chat-reminders',
      title: 'Abrir recordatorios del chat',
      description: 'Crea avisos privados para volver a una conversación o mensaje importante.',
      shortcut: 'Ctrl/Cmd + Shift + R',
      enabled: hasChat,
      run: () => openReminderModal()
    },
    {
      id: 'create-poll',
      title: 'Crear encuesta',
      description: 'Publica una pregunta con opciones votables para tomar decisiones rápidas en el chat.',
      shortcut: 'Encuesta',
      enabled: hasChat && !blocked && !state.editingMessage?.messageId,
      run: () => openPollModal()
    },
    {
      id: 'voice-dictation',
      title: state.voiceDictating ? 'Detener dictado por voz' : 'Dictar mensaje por voz',
      description: isVoiceDictationSupported() ? 'Convierte tu voz en texto dentro del compositor sin enviar audio al chat.' : 'El dictado por voz no está disponible en este navegador.',
      shortcut: 'Ctrl/Cmd + Shift + D',
      enabled: hasChat && !blocked && !state.editingMessage?.messageId && isVoiceDictationSupported(),
      run: () => toggleVoiceDictation()
    },
    {
      id: 'cycle-ephemeral',
      title: 'Cambiar expiración del mensaje',
      description: `Alterna mensajes normales o temporales. Estado actual: ${formatEphemeralOption(selectedEphemeralSeconds())}.`,
      shortcut: 'Temporal',
      enabled: hasChat && !blocked && !state.editingMessage?.messageId,
      run: () => cycleMessageTtl()
    },
    {
      id: 'icon-insert-picker',
      title: 'Insertar emoji',
      description: 'Abre un selector local de emojis y los inserta en el compositor.',
      shortcut: 'Ctrl/Cmd + Shift + E',
      enabled: hasChat && !blocked && !state.editingMessage?.messageId,
      run: () => toggleIconInsertPicker()
    },
    {
      id: 'schedule-message',
      title: 'Programar mensaje escrito',
      description: 'Envía el texto del compositor en una fecha futura.',
      shortcut: 'Ctrl/Cmd + Shift + S',
      enabled: Boolean(canSchedule),
      run: () => openScheduleModal()
    },
    {
      id: 'silent-send',
      title: 'Enviar sin notificación',
      description: 'Entrega el texto del compositor en el chat, pero no dispara notificación push al destinatario.',
      shortcut: 'Ctrl/Cmd + Shift + Enter',
      enabled: Boolean(canSchedule),
      run: () => sendSilentCurrentMessage()
    },
    {
      id: 'retry-outbox',
      title: 'Enviar pendientes',
      description: 'Reintenta mensajes guardados localmente cuando la conexión falló.',
      shortcut: 'Pendientes',
      enabled: Boolean(state.user && state.outboxMessages.length),
      run: () => retryQueuedOutboxMessages({ chatId: state.activeChatId || '', force: true })
    },
    {
      id: 'date-jump',
      title: 'Ir a fecha en este chat',
      description: 'Abre una línea de tiempo por día para saltar al primer mensaje de una fecha específica.',
      shortcut: 'Ctrl/Cmd + Alt + J',
      enabled: hasChat,
      run: () => openDateJump()
    },
    {
      id: 'copy-chat-link',
      title: 'Copiar enlace interno del chat',
      description: 'Guarda un enlace privado para volver a esta conversación.',
      shortcut: 'Enlace',
      enabled: hasChat,
      run: () => copyActiveChatLink()
    },
    {
      id: 'mark-chat-unread',
      title: 'Marcar chat como no leído',
      description: 'Deja una señal visual para volver a esta conversación más tarde.',
      shortcut: 'Ctrl/Cmd + Shift + U',
      enabled: hasChat,
      run: () => markActiveChatUnread()
    },
    {
      id: 'mark-all-read',
      title: 'Quitar todos de no leídos',
      description: unreadCount ? `Limpia ${unreadCount} ${unreadCount === 1 ? 'conversación pendiente' : 'conversaciones pendientes'} sin abrirlas ni activar checks azules.` : 'Limpia la bandeja de pendientes sin enviar confirmaciones de lectura.',
      shortcut: 'No leídos',
      enabled: Boolean(state.user),
      run: () => markAllChatsRead()
    },
    {
      id: 'export-chat',
      title: 'Exportar chat en texto',
      description: 'Descarga hasta los últimos 500 mensajes de este chat.',
      shortcut: 'Ctrl/Cmd + E',
      enabled: hasChat,
      run: () => exportActiveChat()
    },
    {
      id: 'toggle-mute',
      title: chat?.isMuted ? 'Activar notificaciones del chat' : 'Silenciar notificaciones del chat',
      description: chat?.isMuted ? 'Vuelve a recibir avisos push de esta conversación.' : 'Evita avisos push de esta conversación sin archivar el chat.',
      shortcut: 'Ctrl/Cmd + Shift + M',
      enabled: hasChat && !isSelfChat(chat),
      run: () => setActiveChatMuted(!chat?.isMuted)
    },
    {
      id: 'blocked-contacts',
      title: 'Gestionar contactos bloqueados',
      description: 'Revisa tu lista privada de bloqueados y desbloquea contactos sin buscar la conversación.',
      shortcut: 'Bloqueados',
      enabled: Boolean(state.user),
      run: () => openBlockedContactsModal()
    },
    {
      id: 'toggle-block',
      title: normalizeChatBlockStatus(chat).blockedByMe ? 'Desbloquear contacto' : 'Bloquear contacto',
      description: normalizeChatBlockStatus(chat).blockedByMe
        ? 'Restaura el envío de mensajes hacia este contacto.'
        : 'Pausa la comunicación con este contacto sin borrar la conversación ni tus notas.',
      shortcut: 'Ctrl/Cmd + Shift + B',
      enabled: hasChat && !isSelfChat(chat),
      run: () => setActiveContactBlocked(!normalizeChatBlockStatus(chat).blockedByMe)
    },
    {
      id: 'toggle-archive',
      title: chat?.isArchived ? 'Restaurar chat' : 'Archivar chat',
      description: chat?.isArchived ? 'Devuelve esta conversación a la bandeja principal.' : 'Limpia tu bandeja sin borrar la conversación.',
      shortcut: 'Ctrl/Cmd + Shift + A',
      enabled: hasChat,
      run: () => setChatArchived(chat.chatId, !chat?.isArchived)
    },
    {
      id: 'show-main-chats',
      title: 'Abrir bandeja principal',
      description: 'Muestra los chats activos y oculta archivados.',
      shortcut: 'Chats',
      enabled: Boolean(state.user),
      run: () => loadChats({ includeArchived: false })
    },
    {
      id: 'show-unread-chats',
      title: 'Abrir no leídos',
      description: 'Muestra conversaciones activas o archivadas que todavía requieren respuesta.',
      shortcut: 'No leídos',
      enabled: Boolean(state.user),
      run: () => loadChats({ unreadOnly: true })
    },
    {
      id: 'show-archived-chats',
      title: 'Abrir archivados',
      description: 'Revisa conversaciones guardadas fuera de la bandeja principal.',
      shortcut: 'Archivados',
      enabled: Boolean(state.user),
      run: () => loadChats({ includeArchived: true })
    },
    {
      id: 'show-contacts',
      title: 'Abrir contactos',
      description: 'Consulta tus contactos guardados y abre conversaciones.',
      shortcut: 'Contactos',
      enabled: Boolean(state.user),
      run: () => showContactsTab()
    },
    {
      id: 'show-my-qr',
      title: 'Mostrar mi QR',
      description: 'Comparte tu código para que otros te agreguen.',
      shortcut: 'QR',
      enabled: Boolean(state.user),
      run: () => openOwnQr()
    },
    {
      id: 'scan-qr',
      title: 'Escanear QR o pegar código',
      description: 'Agrega contactos por cámara, enlace o código manual.',
      shortcut: 'Escanear',
      enabled: Boolean(state.user),
      run: () => openScanQr()
    }
  ];
}

function getFilteredCommandPaletteCommands() {
  const query = normalizeClientSearchText(state.commandPaletteQuery || els.commandPaletteInput?.value || '');
  const commands = getCommandPaletteCommands();
  if (!query) return commands;
  return commands.filter((command) => normalizeClientSearchText(`${command.title} ${command.description} ${command.shortcut}`).includes(query));
}

function renderCommandPalette() {
  if (!els.commandPalette || !els.commandPaletteList) return;
  els.commandPalette.classList.toggle('hidden', !state.commandPaletteOpen);
  if (!state.commandPaletteOpen) return;
  const commands = getFilteredCommandPaletteCommands();
  const activeCount = commands.filter((command) => command.enabled).length;
  if (!commands.length) {
    els.commandPaletteList.innerHTML = '<div class="ce-command-empty">No encontramos acciones con ese texto.</div>';
    return;
  }
  if (state.commandPaletteActiveIndex >= activeCount) state.commandPaletteActiveIndex = Math.max(0, activeCount - 1);
  let enabledIndex = -1;
  els.commandPaletteList.innerHTML = commands.map((command) => {
    const enabled = Boolean(command.enabled);
    if (enabled) enabledIndex += 1;
    const active = enabled && enabledIndex === state.commandPaletteActiveIndex;
    return `<button class="ce-command-item${active ? ' active' : ''}" type="button" data-command-id="${escapeHtml(command.id)}" ${enabled ? '' : 'disabled'}>
      <span><strong>${escapeHtml(command.title)}</strong><em>${escapeHtml(command.description)}</em></span>
      <kbd>${escapeHtml(command.shortcut || '')}</kbd>
    </button>`;
  }).join('');
}

function openCommandPalette(initialQuery = '') {
  if (!state.user) return;
  state.commandPaletteOpen = true;
  state.commandPaletteQuery = String(initialQuery || '');
  state.commandPaletteActiveIndex = 0;
  if (els.commandPaletteInput) els.commandPaletteInput.value = state.commandPaletteQuery;
  renderCommandPalette();
  window.setTimeout(() => {
    els.commandPaletteInput?.focus();
    els.commandPaletteInput?.select();
  }, 0);
}

function closeCommandPalette() {
  state.commandPaletteOpen = false;
  state.commandPaletteQuery = '';
  state.commandPaletteActiveIndex = 0;
  if (els.commandPaletteInput) els.commandPaletteInput.value = '';
  renderCommandPalette();
}

async function runCommandPaletteAction(commandId = '') {
  const command = getCommandPaletteCommands().find((item) => item.id === commandId);
  if (!command || !command.enabled) return;
  closeCommandPalette();
  await command.run();
  renderAll();
}

function runActiveCommandPaletteAction() {
  const enabled = getFilteredCommandPaletteCommands().filter((command) => command.enabled);
  const command = enabled[Math.max(0, Math.min(state.commandPaletteActiveIndex, enabled.length - 1))];
  if (!command) return;
  runCommandPaletteAction(command.id).catch((error) => alert(error.message || 'No se pudo ejecutar la acción.'));
}

function moveCommandPaletteSelection(delta = 0) {
  const enabledCount = getFilteredCommandPaletteCommands().filter((command) => command.enabled).length;
  if (!enabledCount) return;
  state.commandPaletteActiveIndex = (state.commandPaletteActiveIndex + delta + enabledCount) % enabledCount;
  renderCommandPalette();
}

function isTypingInEditableField(event) {
  const target = event?.target;
  if (!target) return false;
  const tagName = String(target.tagName || '').toLowerCase();
  return target.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
}

function setMobileFoldState(container, toggle, expanded) {
  if (!container || !toggle) return;
  const open = Boolean(expanded);
  container.classList.toggle('is-mobile-expanded', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  const action = open ? 'Ocultar' : 'Mostrar';
  const target = 'acciones de cuenta';
  toggle.setAttribute('aria-label', `${action} ${target}`);
  toggle.setAttribute('title', `${action} ${target}`);
}

function toggleMobileFold(container, toggle) {
  if (!container || !toggle) return;
  setMobileFoldState(container, toggle, !container.classList.contains('is-mobile-expanded'));
}

function bindEvents() {
  window.addEventListener('beforeunload', () => saveActiveDraft({ announce: false }));
  window.addEventListener('resize', () => updateResponsiveShellState(), { passive: true });
  els.btnToggleHeaderActions?.addEventListener('click', (event) => {
    event.preventDefault();
    toggleMobileFold(els.headerActions, els.btnToggleHeaderActions);
  });
  ['pointerdown', 'touchstart', 'focusin'].forEach((eventName) => {
    document.addEventListener(eventName, () => resetPrivacyLockActivity(), { passive: true });
  });
  document.addEventListener('visibilitychange', handlePrivacyLockVisibilityChange);
  window.addEventListener('keydown', (event) => {
    if (!state.privacyLock.locked) resetPrivacyLockActivity();
    const key = String(event.key || '').toLowerCase();
    const platformAction = event.ctrlKey || event.metaKey;
    if (state.privacyLock.locked) return;
    if (key === 'escape') {
      if (state.globalSearchOpen) closeGlobalSearch();
      if (state.globalStarredOpen) closeGlobalStarred();
      if (state.draftsOpen) closeDraftsModal();
      if (state.linkLibraryOpen) closeLinkLibrary();
      if (state.chatBriefOpen) closeChatBrief();
      if (state.dateJumpOpen) closeDateJump();
      if (state.commandPaletteOpen) closeCommandPalette();
      if (state.iconInsertPanelOpen) closeIconInsertPicker();
      if (state.forwardingMessage?.messageId) closeForwardModal();
      if (state.scheduleModalOpen) closeScheduleModal();
      if (state.pollModalOpen) closePollModal();
      if (state.privateNotesOpen) closePrivateNotesModal();
      if (state.remindersOpen) closeReminderModal();
      if (state.labelsModalOpen) closeLabelsModal();
      if (state.blockedContactsOpen) closeBlockedContactsModal();
      if (state.contactNicknameModalOpen) closeContactNicknameModal();
      return;
    }
    if (!state.user) return;
    if (platformAction && event.shiftKey && key === 'p') {
      event.preventDefault();
      togglePrivacyMode({ announce: true });
      if (state.commandPaletteOpen) renderCommandPalette();
      return;
    }
    if (platformAction && event.altKey && key === 'p') {
      event.preventDefault();
      runPrivacyLockShortcut();
      return;
    }
    if (platformAction && event.altKey && key === 'c') {
      event.preventDefault();
      toggleCompactMode({ announce: true });
      if (state.commandPaletteOpen) renderCommandPalette();
      return;
    }
    if (platformAction && event.altKey && key === 'l' && state.activeChatId) {
      event.preventDefault();
      openLinkLibrary();
      return;
    }
    if (platformAction && event.altKey && key === 'b' && state.activeChatId) {
      event.preventDefault();
      openChatBrief().catch((error) => alert(error.message || 'No se pudo abrir el resumen del chat.'));
      return;
    }
    if (platformAction && event.altKey && key === 'j' && state.activeChatId) {
      event.preventDefault();
      openDateJump().catch((error) => alert(error.message || 'No se pudo abrir el calendario del chat.'));
      return;
    }
    if (platformAction && event.altKey && key === 'x') {
      event.preventDefault();
      openBlockedContactsModal();
      return;
    }
    if (platformAction && event.altKey && key === 'd') {
      event.preventDefault();
      openDraftsModal().catch((error) => alert(error.message || 'No se pudieron abrir los borradores.'));
      return;
    }
    if (platformAction && event.altKey && key === 's') {
      event.preventDefault();
      openGlobalStarred().catch((error) => alert(error.message || 'No se pudieron abrir los destacados.'));
      return;
    }
    if (platformAction && event.shiftKey && key === 'f') {
      event.preventDefault();
      openGlobalSearch();
      return;
    }
    if (platformAction && key === 'k') {
      event.preventDefault();
      openCommandPalette();
      return;
    }
    if (platformAction && key === 'end' && state.activeChatId) {
      event.preventDefault();
      scrollMessagesToBottom({ smooth: true, resetNew: true });
      return;
    }
    if (platformAction && event.shiftKey && key === 'n') {
      event.preventDefault();
      openSelfNotesChat().catch((error) => alert(error.message || 'No se pudo abrir Notas para mí.'));
      return;
    }
    if (platformAction && !event.shiftKey && key === 'e' && state.activeChatId) {
      event.preventDefault();
      exportActiveChat().catch((error) => alert(error.message || 'No se pudo exportar el chat.'));
      return;
    }
    if (platformAction && event.shiftKey && key === 'enter' && state.activeChatId) {
      event.preventDefault();
      sendSilentCurrentMessage().catch((error) => alert(error.message || 'No se pudo enviar sin notificación.'));
      return;
    }
    if (platformAction && event.shiftKey && key === 'd') {
      event.preventDefault();
      toggleVoiceDictation();
      return;
    }
    if (platformAction && event.shiftKey && key === 'e' && state.activeChatId) {
      event.preventDefault();
      toggleIconInsertPicker();
      return;
    }
    if (platformAction && event.shiftKey && key === 'g' && state.activeChatId) {
      event.preventDefault();
      openSmartReplySuggestions();
      return;
    }
    if (platformAction && event.shiftKey && key === 's') {
      event.preventDefault();
      openScheduleModal().catch((error) => alert(error.message || 'No se pudo abrir la programación.'));
      return;
    }
    if (platformAction && event.shiftKey && key === 'l' && state.activeChatId) {
      event.preventDefault();
      openPrivateNotesModal().catch((error) => alert(error.message || 'No se pudieron abrir las notas privadas.'));
      return;
    }
    if (platformAction && event.shiftKey && key === 'r' && state.activeChatId) {
      event.preventDefault();
      openReminderModal().catch((error) => alert(error.message || 'No se pudieron abrir los recordatorios.'));
      return;
    }
    if (platformAction && event.shiftKey && key === 't' && state.activeChatId) {
      event.preventDefault();
      openLabelsModal().catch((error) => alert(error.message || 'No se pudieron abrir las etiquetas.'));
      return;
    }
    if (platformAction && event.shiftKey && key === 'y' && state.activeChatId) {
      event.preventDefault();
      openActiveContactNicknameModal();
      return;
    }
    if (platformAction && event.shiftKey && key === 'm' && state.activeChatId) {
      event.preventDefault();
      const chat = activeChat();
      if (!isSelfChat(chat)) setActiveChatMuted(!chat?.isMuted).catch((error) => alert(error.message || 'No se pudo actualizar el silencio del chat.'));
      return;
    }
    if (platformAction && event.shiftKey && key === 'b' && state.activeChatId) {
      event.preventDefault();
      const chat = activeChat();
      if (!isSelfChat(chat)) setActiveContactBlocked(!normalizeChatBlockStatus(chat).blockedByMe).catch((error) => alert(error.message || 'No se pudo actualizar el bloqueo del contacto.'));
      return;
    }
    if (platformAction && event.shiftKey && key === 'u' && state.activeChatId) {
      event.preventDefault();
      markActiveChatUnread().catch((error) => alert(error.message || 'No se pudo marcar el chat como no leído.'));
      return;
    }
    if (platformAction && event.shiftKey && key === 'a' && state.activeChatId) {
      event.preventDefault();
      const chat = activeChat();
      setChatArchived(state.activeChatId, !chat?.isArchived).catch((error) => alert(error.message || 'No se pudo actualizar el archivo del chat.'));
      return;
    }
    if (key === '?' && !isTypingInEditableField(event)) {
      event.preventDefault();
      openCommandPalette();
    }
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    updateInstallBanner();
  });
  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    state.installRelatedCheckDone = true;
    rememberInstalledApp();
    dismissInstallBanner();
    updateAfterLoginBanners();
  });
  const standaloneDisplayQuery = window.matchMedia?.('(display-mode: standalone)');
  const handleStandaloneDisplayChange = () => {
    if (isInstalled()) {
      state.installPrompt = null;
      state.installRelatedCheckDone = true;
    }
    updateAfterLoginBanners();
  };
  standaloneDisplayQuery?.addEventListener?.('change', handleStandaloneDisplayChange);
  standaloneDisplayQuery?.addListener?.(handleStandaloneDisplayChange);
  const mobileChatViewportQuery = window.matchMedia?.('(max-width: 620px)');
  const handleMobileChatViewportChange = () => {
    if (state.user) updateResponsiveShellState();
    if (state.iconInsertPanelOpen) ensureIconInsertPickerKeyboardPlacement();
    scheduleScrollBottomButtonUpdate();
  };
  mobileChatViewportQuery?.addEventListener?.('change', handleMobileChatViewportChange);
  mobileChatViewportQuery?.addListener?.(handleMobileChatViewportChange);
  window.addEventListener('resize', handleMobileChatViewportChange, { passive: true });
  window.addEventListener('online', () => {
    if (state.user) {
      if (document.visibilityState === 'visible') announceRealtimeClientActivity(true);
      scheduleRealtimeElection(80);
      resetRetryableContactLinkPreviews();
      retryQueuedOutboxMessages({ silent: true }).catch(() => null);
      flushDeliveryAckQueue({ force: true }).catch(() => null);
    }
  });
  window.addEventListener('offline', () => {
    announceRealtimeClientActivity(false);
    if (state.realtimeLeader) releaseRealtimeLeadership({ closeTransport: true });
    else closeRealtime();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveActiveDraft({ announce: false });
      announceRealtimeClientActivity(false);
      armRealtimeHiddenRelease();
    }
    if (document.visibilityState === 'visible' && state.user) {
      if (state.realtimeHiddenTimer) window.clearTimeout(state.realtimeHiddenTimer);
      state.realtimeHiddenTimer = 0;
      announceRealtimeClientActivity(true);
      scheduleRealtimeElection(60);
      scheduleOutboxRetry(1400);
      flushDeliveryAckQueue({ force: true }).catch(() => null);
      requestServiceWorkerDeliveryAckFlush();
    }
  });
  window.addEventListener('pagehide', () => {
    announceRealtimeClientActivity(false);
    if (state.realtimeLeader) releaseRealtimeLeadership({ closeTransport: true });
  });
  els.messages?.addEventListener('scroll', () => scheduleScrollBottomButtonUpdate(), { passive: true });
  els.messages?.addEventListener('load', (event) => {
    const image = event.target?.closest?.('.ce-attachment--image img');
    if (image) {
      syncAttachmentImageOrientationFromElement(image);
      scheduleScrollBottomButtonUpdate();
    }
  }, true);
  els.btnScrollBottom?.addEventListener('click', () => scrollMessagesToBottom({ smooth: true, resetNew: true }));

  els.btnGoogleLogin.addEventListener('click', loginWithGoogle);
  els.userSummary?.addEventListener('click', () => {
    if (state.user) openProfileCard(state.user);
  });
  els.btnLogout.addEventListener('click', async () => {
    saveActiveDraft({ announce: false });
    if (state.voiceDictating) stopVoiceDictation({ announce: false });
    stopPresenceRefresh();
    clearOutboxRetryLeaseIfOwned();
    await unregisterCurrentPushSubscription().catch(() => null);
    await post('/api/auth/logout', {}).catch(() => null);
    await signOutFirebaseSession(state.config.firebaseWebConfig || {}).catch(() => null);
    clearCachedRealtimeToken();
    clearRealtimeRetryDeferral();
    clearRealtimeReconnectBackoff();
    state.realtimePeerActivity.clear();
    setSessionToken('');
    state.user = null;
    state.realtimeConnectedOnce = false;
    state.contacts = [];
    state.contactsNextCursor = null;
    state.contactsHasMore = false;
    state.contactsLoading = false;
    for (const timer of state.contactLinkPreviewRetryTimers.values()) window.clearTimeout(timer);
    state.contactLinkPreviewRetryTimers.clear();
    if (state.contactLinkPreviewBatchTimer) window.clearTimeout(state.contactLinkPreviewBatchTimer);
    state.contactLinkPreviewBatchTimer = 0;
    state.contactLinkPreviewQueue.clear();
    state.contactLinkPreviews.clear();
    state.contactLinkPreviewInFlight.clear();
    state.contactShareModalOpen = false;
    state.contactShareTargetProfile = null;
    state.contactShareQuery = '';
    state.contactSharePage = 0;
    state.contactShareSending = false;
    state.chats = [];
    state.chatsNextCursor = null;
    state.chatsHasMore = false;
    state.chatsLoading = false;
    state.chatListLoadedMode = 'active';
    state.chatListLoadedAt = 0;
    state.chatListModeRequests.clear();
    state.labels = [];
    state.chatLabelsByChatId = new Map();
    state.labelsLoaded = false;
    state.activeLabelFilter = '';
    state.labelsModalOpen = false;
    state.slashCommandsOpen = false;
    closeIconInsertPicker();
    state.draftsOpen = false;
    state.drafts = [];
    state.draftsLoading = false;
    state.globalStarredOpen = false;
    state.globalStarredMessages = [];
    state.globalStarredLoading = false;
    state.globalStarredScannedChats = 0;
    state.globalStarredNextCursor = null;
    state.globalStarredHasMore = false;
    state.globalStarredLoaded = false;
    state.globalStarredDirty = true;
    state.blockedContactsOpen = false;
    state.blockedContacts = [];
    state.blockedContactsLoaded = false;
    state.blockedContactsNextCursor = null;
    state.blockedContactsHasMore = false;
    state.labelsDraft = '';
    state.archivedView = false;
    state.messagesByChat.clear();
    state.messageHistoryCoverageByChat.clear();
    state.messageHistoryRequestsByChat.clear();
    state.messageSyncCursorByChat.clear();
    state.messageBaselineLoadedChats.clear();
    state.draftRemoteLoadedChats.clear();
    state.draftLastSyncedTextByChat.clear();
    state.draftRemoteLastAttemptAtByChat.clear();
    state.draftSyncInFlightByChat.clear();
    state.pinnedMessagesByChat.clear();
    state.renderedMessageCountByChat.clear();
    state.renderedActiveChatId = '';
    state.scrollNewMessages = 0;
    state.outboxMessages = [];
    state.outboxSyncing = false;
    state.notificationPreferences = normalizeNotificationPreferences({});
    if (state.outboxRetryTimer) window.clearTimeout(state.outboxRetryTimer);
    state.outboxRetryTimer = 0;
    if (state.deliveryAckRetryTimer) window.clearTimeout(state.deliveryAckRetryTimer);
    state.deliveryAckRetryTimer = 0;
    state.deliveryAckRetryAt = 0;
    state.activeChatId = '';
    state.replyToMessage = null;
    state.editingMessage = null;
    state.forwardingMessage = null;
    state.scheduleModalOpen = false;
    state.scheduledMessages = [];
    state.scheduledLoadedChatId = '';
    state.scheduledLoading = false;
    state.schedulingMessage = false;
    closePollModal();
    state.pollCreating = false;
    state.quickRepliesOpen = false;
    state.quickRepliesLoaded = false;
    state.quickReplies = [];
    closeGlobalSearch();
    resetGlobalSearchState();
    closeGlobalStarred();
    closeLinkLibrary();
    closeChatBrief();
    closePrivateNotesModal();
    state.privateNotes = [];
    state.privateNotesLoadedChatId = '';
    closeReminderModal();
    state.reminders = [];
    state.remindersLoadedChatId = '';
    closeLabelsModal();
    closeCommandPalette();
    state.privacyLock.locked = false;
    state.privacyLock.mode = 'closed';
    state.privacyLock.enabled = false;
    state.privacyLock.salt = '';
    state.privacyLock.pinHash = '';
    renderPrivacyLockOverlay();
    resetChatSearch();
    showGuest();
  });
  els.btnInstall.addEventListener('click', async () => {
    if (state.installPrompt) {
      state.installPrompt.prompt();
      const choice = await state.installPrompt.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') rememberInstalledApp();
      state.installPrompt = null;
    } else {
      alert('Usa el menú del navegador y elige “Instalar app” o “Agregar a pantalla de inicio”.');
    }
    updateInstallBanner();
  });
  els.btnInstallLater.addEventListener('click', () => {
    dismissInstallBanner();
    updateInstallBanner();
  });
  els.btnEnablePush.addEventListener('click', async () => {
    try {
      await enableWebPushNotifications();
    } catch (error) {
      alert(error.message || 'No se pudieron activar las notificaciones.');
    } finally {
      state.pushState = state.pushState === 'saving' ? 'idle' : state.pushState;
      updatePushBanner();
    }
  });
  els.btnPushLater.addEventListener('click', () => {
    state.pushDismissed = true;
    updatePushBanner();
  });
  els.btnOpenSelfNotes?.addEventListener('click', () => {
    openSelfNotesChat().catch((error) => alert(error.message || 'No se pudo abrir Notas para mí.'));
  });
  els.btnOpenGlobalSearch?.addEventListener('click', () => openGlobalSearch());
  els.btnOpenGlobalStarred?.addEventListener('click', () => openGlobalStarred().catch((error) => alert(error.message || 'No se pudieron abrir los destacados.')));
  els.btnNotificationPause?.addEventListener('click', () => {
    toggleNotificationPause().catch((error) => alert(error.message || 'No se pudo actualizar No molestar.'));
  });
  els.btnOpenBlockedContacts?.addEventListener('click', () => openBlockedContactsModal());
  els.btnCommandPalette?.addEventListener('click', () => openCommandPalette());
  els.btnOpenDrafts?.addEventListener('click', () => openDraftsModal().catch((error) => alert(error.message || 'No se pudieron abrir los borradores.')));
  els.btnPrivacyMode?.addEventListener('click', () => {
    togglePrivacyMode({ announce: true });
    if (state.commandPaletteOpen) renderCommandPalette();
  });
  els.btnPrivacyLock?.addEventListener('click', () => runPrivacyLockShortcut());
  els.btnClosePrivacyLock?.addEventListener('click', closePrivacyLockSettings);
  els.btnPrivacyLockPrimary?.addEventListener('click', () => {
    if (state.privacyLock.locked) unlockPrivacyScreen();
    else savePrivacyLockFromOverlay();
  });
  els.btnPrivacyLockSecondary?.addEventListener('click', () => {
    if (state.privacyLock.locked) {
      togglePrivacyMode({ announce: true });
      return;
    }
    if (state.privacyLock.enabled) lockPrivacyScreen({ announce: true });
    else closePrivacyLockSettings();
  });
  els.btnPrivacyLockDisable?.addEventListener('click', disablePrivacyLock);
  els.privacyLockOverlay?.addEventListener('click', (event) => {
    if (event.target === els.privacyLockOverlay && !state.privacyLock.locked) closePrivacyLockSettings();
  });
  [els.privacyLockPinInput, els.privacyLockConfirmInput].forEach((input) => {
    input?.addEventListener('input', () => {
      input.value = normalizePrivacyPin(input.value || '');
      state.privacyLock.error = '';
      renderPrivacyLockOverlay();
    });
    input?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (state.privacyLock.locked) unlockPrivacyScreen();
      else savePrivacyLockFromOverlay();
    });
  });
  els.btnCompactMode?.addEventListener('click', () => {
    toggleCompactMode({ announce: true });
    if (state.commandPaletteOpen) renderCommandPalette();
  });
  els.btnCloseGlobalSearch?.addEventListener('click', closeGlobalSearch);
  els.globalSearchModal?.addEventListener('click', (event) => { if (event.target === els.globalSearchModal) closeGlobalSearch(); });
  els.globalSearchForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await searchAllChats(els.globalSearchInput?.value || '').catch((error) => alert(error.message || 'No se pudo buscar en todos los chats.'));
  });
  els.globalSearchInput?.addEventListener('input', () => {
    state.globalSearchQuery = String(els.globalSearchInput.value || '').trim();
    if (!state.globalSearchQuery) resetGlobalSearchState({ keepQuery: true });
    renderGlobalSearchModal();
  });
  els.globalSearchList?.addEventListener('click', (event) => {
    const loadMore = event.target.closest('[data-global-search-load-more]');
    if (loadMore && els.globalSearchList.contains(loadMore)) {
      searchAllChats(state.globalSearchQuery, { append: true }).catch((error) => alert(error.message || 'No se pudieron cargar más resultados.'));
      return;
    }
    const row = event.target.closest('[data-global-search-chat-id]');
    if (!row || !els.globalSearchList.contains(row)) return;
    openGlobalSearchResult(row.dataset.globalSearchChatId || '', row.dataset.globalSearchMessageId || '').catch((error) => alert(error.message || 'No se pudo abrir el resultado.'));
  });
  els.btnCloseGlobalStarred?.addEventListener('click', closeGlobalStarred);
  els.btnRefreshGlobalStarred?.addEventListener('click', () => loadGlobalStarredMessages({ force: true }).catch((error) => alert(error.message || 'No se pudieron actualizar los destacados.')));
  els.globalStarredModal?.addEventListener('click', (event) => {
    if (event.target === els.globalStarredModal) {
      closeGlobalStarred();
      return;
    }
    const loadMore = event.target.closest('[data-global-starred-load-more]');
    if (loadMore && els.globalStarredModal.contains(loadMore)) {
      loadGlobalStarredMessages({ append: true }).catch((error) => alert(error.message || 'No se pudieron cargar más destacados.'));
      return;
    }
    const unstar = event.target.closest('[data-global-starred-unstar-message-id]');
    if (unstar && els.globalStarredModal.contains(unstar)) {
      event.preventDefault();
      removeGlobalStarredMessage(unstar.dataset.globalStarredUnstarChatId || '', unstar.dataset.globalStarredUnstarMessageId || '').catch((error) => alert(error.message || 'No se pudo quitar el destacado.'));
      return;
    }
    const row = event.target.closest('[data-global-starred-chat-id]');
    if (!row || !els.globalStarredModal.contains(row)) return;
    openGlobalStarredResult(row.dataset.globalStarredChatId || '', row.dataset.globalStarredMessageId || '').catch((error) => alert(error.message || 'No se pudo abrir el destacado.'));
  });
  els.btnCloseDrafts?.addEventListener('click', closeDraftsModal);
  els.draftsModal?.addEventListener('click', (event) => {
    if (event.target === els.draftsModal) {
      closeDraftsModal();
      return;
    }
    const openButton = event.target.closest('[data-open-draft-chat-id]');
    if (openButton && els.draftsModal.contains(openButton)) {
      event.preventDefault();
      openDraftFromList(openButton.dataset.openDraftChatId || '').catch((error) => alert(error.message || 'No se pudo abrir el borrador.'));
      return;
    }
    const deleteButton = event.target.closest('[data-delete-draft-chat-id]');
    if (deleteButton && els.draftsModal.contains(deleteButton)) {
      event.preventDefault();
      deleteDraftFromList(deleteButton.dataset.deleteDraftChatId || '').catch((error) => alert(error.message || 'No se pudo descartar el borrador.'));
    }
  });
  els.btnCloseLinkLibrary?.addEventListener('click', closeLinkLibrary);
  els.linkLibraryModal?.addEventListener('click', (event) => {
    if (event.target === els.linkLibraryModal) {
      closeLinkLibrary();
      return;
    }
    const copyButton = event.target.closest('[data-copy-link-url]');
    if (copyButton && els.linkLibraryModal.contains(copyButton)) {
      event.preventDefault();
      copySharedLink(copyButton.dataset.copyLinkUrl || '').catch((error) => alert(error.message || 'No se pudo copiar el enlace.'));
      return;
    }
    const jumpButton = event.target.closest('[data-jump-link-message-id]');
    if (jumpButton && els.linkLibraryModal.contains(jumpButton)) {
      event.preventDefault();
      const messageId = jumpButton.dataset.jumpLinkMessageId || '';
      closeLinkLibrary();
      jumpToMessage(messageId).catch((error) => alert(error.message || 'No se pudo abrir el mensaje del enlace.'));
    }
  });
  els.linkLibraryInput?.addEventListener('input', () => {
    state.linkLibraryQuery = String(els.linkLibraryInput.value || '').trim();
    renderLinkLibraryModal();
  });
  els.btnCloseChatBrief?.addEventListener('click', closeChatBrief);
  els.chatBriefModal?.addEventListener('click', (event) => {
    if (event.target === els.chatBriefModal) {
      closeChatBrief();
      return;
    }
    const copyButton = event.target.closest('[data-copy-chat-brief]');
    if (copyButton && els.chatBriefModal.contains(copyButton)) {
      event.preventDefault();
      copyChatBriefToClipboard().catch((error) => alert(error.message || 'No se pudo copiar el resumen.'));
      return;
    }
    const reminderButton = event.target.closest('[data-reminder-from-brief-message-id]');
    if (reminderButton && els.chatBriefModal.contains(reminderButton)) {
      event.preventDefault();
      openReminderFromChatBrief(reminderButton.dataset.reminderFromBriefMessageId || '').catch((error) => alert(error.message || 'No se pudo preparar el recordatorio.'));
      return;
    }
    const jumpButton = event.target.closest('[data-jump-brief-message-id]');
    if (jumpButton && els.chatBriefModal.contains(jumpButton)) {
      event.preventDefault();
      const messageId = jumpButton.dataset.jumpBriefMessageId || '';
      closeChatBrief();
      jumpToMessage(messageId).catch((error) => alert(error.message || 'No se pudo abrir el mensaje del resumen.'));
    }
  });
  els.btnCloseDateJump?.addEventListener('click', closeDateJump);
  els.dateJumpModal?.addEventListener('click', (event) => {
    if (event.target === els.dateJumpModal) {
      closeDateJump();
      return;
    }
    const refreshButton = event.target.closest('[data-refresh-date-jump]');
    if (refreshButton && els.dateJumpModal.contains(refreshButton)) {
      event.preventDefault();
      loadDateJumpTimeline().catch((error) => alert(error.message || 'No se pudo actualizar el calendario del chat.'));
      return;
    }
    const selectedButton = event.target.closest('[data-jump-selected-date]');
    if (selectedButton && els.dateJumpModal.contains(selectedButton)) {
      event.preventDefault();
      jumpToDateKey(state.dateJumpSelected).catch((error) => alert(error.message || 'No se pudo saltar a la fecha seleccionada.'));
      return;
    }
    const dayButton = event.target.closest('[data-date-jump-day]');
    if (dayButton && els.dateJumpModal.contains(dayButton)) {
      event.preventDefault();
      state.dateJumpSelected = dayButton.dataset.dateJumpDay || '';
      renderDateJumpModal();
      jumpToDateKey(state.dateJumpSelected).catch((error) => alert(error.message || 'No se pudo abrir esa fecha.'));
    }
  });
  els.dateJumpInput?.addEventListener('input', () => {
    state.dateJumpSelected = String(els.dateJumpInput.value || '').trim();
    renderDateJumpModal();
  });
  els.dateJumpInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      jumpToDateKey(state.dateJumpSelected).catch((error) => alert(error.message || 'No se pudo saltar a esa fecha.'));
    }
  });
  els.btnCloseCommandPalette?.addEventListener('click', closeCommandPalette);
  els.commandPalette?.addEventListener('click', (event) => {
    if (event.target === els.commandPalette) {
      closeCommandPalette();
      return;
    }
    const commandButton = event.target.closest('[data-command-id]');
    if (!commandButton || !els.commandPalette.contains(commandButton)) return;
    event.preventDefault();
    runCommandPaletteAction(commandButton.dataset.commandId || '').catch((error) => alert(error.message || 'No se pudo ejecutar la acción.'));
  });
  els.commandPaletteInput?.addEventListener('input', () => {
    state.commandPaletteQuery = els.commandPaletteInput.value || '';
    state.commandPaletteActiveIndex = 0;
    renderCommandPalette();
  });
  els.commandPaletteInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveCommandPaletteSelection(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveCommandPaletteSelection(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runActiveCommandPaletteAction();
    }
  });
  els.btnQuickReplies?.addEventListener('click', async () => {
    if (!state.activeChatId) return;
    if (isChatInteractionBlocked()) {
      showTemporaryDraftStatus(chatBlockNoticeText(), 4200);
      return;
    }
    state.quickRepliesOpen = !state.quickRepliesOpen;
    if (state.quickRepliesOpen && state.iconInsertPanelOpen) closeIconInsertPicker();
    renderQuickRepliesPanel();
    if (state.quickRepliesOpen) {
      await loadQuickReplies().catch((error) => {
        state.quickRepliesOpen = false;
        renderQuickRepliesPanel();
        alert(error.message || 'No se pudieron cargar las respuestas rápidas.');
      });
    }
  });
  els.btnSmartReplySuggestions?.addEventListener('click', () => openSmartReplySuggestions());
  els.btnIconInsertPicker?.addEventListener('click', () => toggleIconInsertPicker());
  els.iconInsertPickerPanel?.addEventListener('click', (event) => {
    const categoryButton = event.target.closest('[data-icon-insert-category]');
    if (categoryButton && els.iconInsertPickerPanel.contains(categoryButton)) {
      event.preventDefault();
      state.iconInsertCategory = normalizeIconInsertCategory(categoryButton.dataset.iconInsertCategory || 'recientes');
      renderIconInsertPickerPanel();
      return;
    }
    const iconInsertButton = event.target.closest('[data-insert-icon-insert]');
    if (iconInsertButton && els.iconInsertPickerPanel.contains(iconInsertButton)) {
      event.preventDefault();
      insertIconInsertIntoComposer(iconInsertButton.dataset.insertIconInsert || '');
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!state.quickRepliesOpen && !state.slashCommandsOpen && !state.iconInsertPanelOpen && !state.sendModeMenuOpen) return;
    const target = event.target;
    if (state.quickRepliesOpen && !els.quickRepliesPanel?.contains(target) && !els.btnQuickReplies?.contains(target) && !els.btnSmartReplySuggestions?.contains(target)) {
      state.quickRepliesOpen = false;
      renderQuickRepliesPanel();
    }
    if (state.slashCommandsOpen && !els.slashCommandsPanel?.contains(target) && target !== els.messageInput) {
      state.slashCommandsOpen = false;
      renderSlashCommandsPanel();
    }
    if (state.iconInsertPanelOpen && !els.iconInsertPickerPanel?.contains(target) && !els.btnIconInsertPicker?.contains(target)) {
      closeIconInsertPicker();
    }
    if (state.sendModeMenuOpen && !els.sendModeMenu?.contains(target) && !els.btnSendModePrefix?.contains(target)) {
      closeSendModeMenu();
    }
  }, { passive: true });
  els.quickRepliesPanel?.addEventListener('click', (event) => {
    const smartReplyButton = event.target.closest('[data-smart-reply-index]');
    if (smartReplyButton && els.quickRepliesPanel.contains(smartReplyButton)) {
      event.preventDefault();
      insertSmartReplyByIndex(smartReplyButton.dataset.smartReplyIndex || '0');
      return;
    }
    const saveButton = event.target.closest('[data-quick-reply-save-current]');
    if (saveButton && els.quickRepliesPanel.contains(saveButton)) {
      event.preventDefault();
      saveCurrentTextAsQuickReply().catch((error) => alert(error.message || 'No se pudo guardar la respuesta rápida.'));
      return;
    }
    const refreshButton = event.target.closest('[data-quick-replies-refresh]');
    if (refreshButton && els.quickRepliesPanel.contains(refreshButton)) {
      event.preventDefault();
      loadQuickReplies({ force: true }).catch((error) => alert(error.message || 'No se pudieron actualizar las respuestas rápidas.'));
      return;
    }
    const deleteButton = event.target.closest('[data-quick-reply-delete]');
    if (deleteButton && els.quickRepliesPanel.contains(deleteButton)) {
      event.preventDefault();
      deleteQuickReply(deleteButton.dataset.quickReplyDelete || '').catch((error) => alert(error.message || 'No se pudo eliminar la respuesta rápida.'));
      return;
    }
    const insertButton = event.target.closest('[data-quick-reply-insert]');
    if (insertButton && els.quickRepliesPanel.contains(insertButton)) {
      event.preventDefault();
      insertQuickReplyText(insertButton.dataset.quickReplyInsert || '');
    }
  });
  els.slashCommandsPanel?.addEventListener('click', (event) => {
    const templateButton = event.target.closest('[data-slash-template]');
    if (!templateButton || !els.slashCommandsPanel.contains(templateButton)) return;
    event.preventDefault();
    insertSlashCommandTemplate(templateButton.dataset.slashTemplate || '');
  });
  els.chatLabelFilters?.addEventListener('click', (event) => {
    const filterButton = event.target.closest('[data-label-filter]');
    if (!filterButton || !els.chatLabelFilters.contains(filterButton)) return;
    event.preventDefault();
    state.activeLabelFilter = normalizeChatLabelName(filterButton.dataset.labelFilter || '');
    renderAll();
  });
  els.activeChatHeader?.addEventListener('click', (event) => {
    const clearSelectionButton = event.target.closest('[data-clear-message-selection]');
    if (clearSelectionButton && els.activeChatHeader.contains(clearSelectionButton)) {
      event.preventDefault();
      clearMessageSelection();
      return;
    }
    const copySelectionButton = event.target.closest('[data-copy-selected-messages]');
    if (copySelectionButton && els.activeChatHeader.contains(copySelectionButton)) {
      event.preventDefault();
      copySelectedMessages().catch((error) => alert(error.message || 'No se pudieron copiar los mensajes seleccionados.'));
      return;
    }
    const deleteSelectionButton = event.target.closest('[data-delete-selected-messages]');
    if (deleteSelectionButton && els.activeChatHeader.contains(deleteSelectionButton)) {
      event.preventDefault();
      openSelectionDeleteModal();
      return;
    }
    const chatSearchButton = event.target.closest('[data-toggle-chat-search]');
    if (chatSearchButton && els.activeChatHeader.contains(chatSearchButton)) {
      event.preventDefault();
      toggleChatSearch({ focus: true });
      return;
    }
    const mobileBackButton = event.target.closest('[data-close-mobile-chat]');
    if (mobileBackButton && els.activeChatHeader.contains(mobileBackButton)) {
      event.preventDefault();
      closeResponsiveChatPane();
      return;
    }
    const nicknameButton = event.target.closest('[data-edit-active-contact-nickname]');
    if (nicknameButton && els.activeChatHeader.contains(nicknameButton)) {
      event.preventDefault();
      openActiveContactNicknameModal();
      return;
    }
    const labelButton = event.target.closest('[data-open-labels]');
    if (labelButton && els.activeChatHeader.contains(labelButton)) {
      event.preventDefault();
      openLabelsModal().catch((error) => alert(error.message || 'No se pudieron abrir las etiquetas.'));
      return;
    }
    const muteButton = event.target.closest('[data-mute-active-chat]');
    if (muteButton && els.activeChatHeader.contains(muteButton)) {
      event.preventDefault();
      setActiveChatMuted(muteButton.dataset.muteActiveChat === '1').catch((error) => alert(error.message || 'No se pudo actualizar el silencio del chat.'));
      return;
    }
    const blockButton = event.target.closest('[data-block-active-contact]');
    if (blockButton && els.activeChatHeader.contains(blockButton)) {
      event.preventDefault();
      setActiveContactBlocked(blockButton.dataset.blockActiveContact === '1').catch((error) => alert(error.message || 'No se pudo actualizar el bloqueo del contacto.'));
      return;
    }
    const archiveButton = event.target.closest('[data-archive-active-chat]');
    if (archiveButton && els.activeChatHeader.contains(archiveButton)) {
      event.preventDefault();
      setChatArchived(state.activeChatId, archiveButton.dataset.archiveActiveChat === '1').catch((error) => alert(error.message || 'No se pudo actualizar el archivo del chat.'));
      return;
    }
    const shareButton = event.target.closest('[data-share-active-chat]');
    if (shareButton && els.activeChatHeader.contains(shareButton)) {
      event.preventDefault();
      copyActiveChatLink().catch((error) => alert(error.message || 'No se pudo copiar el enlace del chat.'));
      return;
    }
    const briefButton = event.target.closest('[data-open-chat-brief]');
    if (briefButton && els.activeChatHeader.contains(briefButton)) {
      event.preventDefault();
      openChatBrief().catch((error) => alert(error.message || 'No se pudo abrir el resumen del chat.'));
      return;
    }
    const dateJumpButton = event.target.closest('[data-open-date-jump]');
    if (dateJumpButton && els.activeChatHeader.contains(dateJumpButton)) {
      event.preventDefault();
      openDateJump().catch((error) => alert(error.message || 'No se pudo abrir el calendario del chat.'));
      return;
    }
    const linkLibraryButton = event.target.closest('[data-open-link-library]');
    if (linkLibraryButton && els.activeChatHeader.contains(linkLibraryButton)) {
      event.preventDefault();
      openLinkLibrary();
      return;
    }
    const unreadButton = event.target.closest('[data-unread-active-chat]');
    if (unreadButton && els.activeChatHeader.contains(unreadButton)) {
      event.preventDefault();
      markActiveChatUnread().catch((error) => alert(error.message || 'No se pudo marcar el chat como no leído.'));
      return;
    }
    const reminderButton = event.target.closest('[data-open-reminders]');
    if (reminderButton && els.activeChatHeader.contains(reminderButton)) {
      event.preventDefault();
      openReminderModal().catch((error) => alert(error.message || 'No se pudieron abrir los recordatorios.'));
      return;
    }
    const privateNotesButton = event.target.closest('[data-open-private-notes]');
    if (privateNotesButton && els.activeChatHeader.contains(privateNotesButton)) {
      event.preventDefault();
      openPrivateNotesModal().catch((error) => alert(error.message || 'No se pudieron abrir las notas privadas.'));
      return;
    }
    const exportButton = event.target.closest('[data-export-active-chat]');
    if (!exportButton || !els.activeChatHeader.contains(exportButton)) return;
    event.preventDefault();
    exportActiveChat().catch((error) => alert(error.message || 'No se pudo exportar el chat.'));
  });
  els.btnCloseContactShare?.addEventListener('click', closeContactShareModal);
  els.contactShareModal?.addEventListener('click', (event) => {
    if (event.target === els.contactShareModal) {
      closeContactShareModal();
      return;
    }
    const loadMoreButton = event.target.closest('[data-load-more-share-contacts]');
    if (loadMoreButton && els.contactShareModal.contains(loadMoreButton)) {
      event.preventDefault();
      loadMoreContacts()
        .then(() => renderContactShareModal())
        .catch((error) => alert(error.message || 'No se pudieron cargar más contactos.'));
      return;
    }
    const targetButton = event.target.closest('[data-contact-share-target-id]');
    if (!targetButton || !els.contactShareModal.contains(targetButton)) return;
    event.preventDefault();
    sendProfileShareToContact(targetButton.dataset.contactShareTargetId || '').catch((error) => alert(error.message || 'No se pudo enviar el contacto por chatER.'));
  });
  els.contactShareSearch?.addEventListener('input', () => {
    state.contactShareQuery = String(els.contactShareSearch.value || '');
    state.contactSharePage = 0;
    renderContactShareModal();
  });
  els.btnContactSharePrev?.addEventListener('click', () => {
    state.contactSharePage = Math.max(0, Number(state.contactSharePage || 0) - 1);
    renderContactShareModal();
  });
  els.btnContactShareNext?.addEventListener('click', () => {
    state.contactSharePage = Number(state.contactSharePage || 0) + 1;
    renderContactShareModal();
  });
  els.btnCloseForward?.addEventListener('click', closeForwardModal);
  els.forwardModal?.addEventListener('click', (event) => {
    if (event.target === els.forwardModal) {
      closeForwardModal();
      return;
    }
    const targetButton = event.target.closest('[data-forward-target-chat-id]');
    if (!targetButton || !els.forwardModal.contains(targetButton)) return;
    event.preventDefault();
    forwardMessageToChat(targetButton.dataset.forwardTargetChatId || '').catch((error) => alert(error.message || 'No se pudo reenviar el mensaje.'));
  });
  els.btnCloseReminders?.addEventListener('click', closeReminderModal);
  els.reminderModal?.addEventListener('click', (event) => {
    if (event.target === els.reminderModal) {
      closeReminderModal();
      return;
    }
    const jumpButton = event.target.closest('[data-jump-reminder-message-id]');
    if (jumpButton && els.reminderModal.contains(jumpButton)) {
      event.preventDefault();
      jumpToMessage(jumpButton.dataset.jumpReminderMessageId || '').catch((error) => alert(error.message || 'No se pudo abrir el mensaje del recordatorio.'));
      return;
    }
    const completeButton = event.target.closest('[data-complete-reminder-id]');
    if (completeButton && els.reminderModal.contains(completeButton)) {
      event.preventDefault();
      completeReminder(completeButton.dataset.completeReminderId || '').catch((error) => alert(error.message || 'No se pudo completar el recordatorio.'));
    }
  });
  els.reminderDateTime?.addEventListener('input', renderReminderModal);
  els.reminderText?.addEventListener('input', () => {
    state.reminderDraftText = String(els.reminderText.value || '');
    renderReminderModal();
  });
  els.btnSaveReminder?.addEventListener('click', () => {
    saveReminderFromModal().catch((error) => alert(error.message || 'No se pudo crear el recordatorio.'));
  });
  els.btnCloseLabels?.addEventListener('click', closeLabelsModal);
  els.labelsModal?.addEventListener('click', (event) => {
    if (event.target === els.labelsModal) {
      closeLabelsModal();
      return;
    }
    const addLabel = event.target.closest('[data-add-draft-label]');
    if (addLabel && els.labelsModal.contains(addLabel)) {
      event.preventDefault();
      addLabelToDraft(addLabel.dataset.addDraftLabel || '');
      return;
    }
    const removeLabel = event.target.closest('[data-remove-draft-label]');
    if (removeLabel && els.labelsModal.contains(removeLabel)) {
      event.preventDefault();
      removeLabelFromDraft(removeLabel.dataset.removeDraftLabel || '');
      return;
    }
    const deleteLabelButton = event.target.closest('[data-delete-chat-label]');
    if (deleteLabelButton && els.labelsModal.contains(deleteLabelButton)) {
      event.preventDefault();
      deleteChatLabel(deleteLabelButton.dataset.deleteChatLabel || '').catch((error) => alert(error.message || 'No se pudo eliminar la etiqueta.'));
    }
  });
  els.chatLabelsInput?.addEventListener('input', () => {
    state.labelsDraft = els.chatLabelsInput.value || '';
    renderLabelsModal();
  });
  els.chatLabelsInput?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveLabelsFromModal().catch((error) => alert(error.message || 'No se pudieron guardar las etiquetas.'));
    }
  });
  els.btnSaveLabels?.addEventListener('click', () => {
    saveLabelsFromModal().catch((error) => alert(error.message || 'No se pudieron guardar las etiquetas.'));
  });
  els.btnCloseBlockedContacts?.addEventListener('click', closeBlockedContactsModal);
  els.btnRefreshBlockedContacts?.addEventListener('click', () => {
    loadBlockedContacts({ silent: false, force: true }).catch((error) => alert(error.message || 'No se pudieron actualizar los contactos bloqueados.'));
  });
  els.blockedContactsModal?.addEventListener('click', (event) => {
    if (event.target === els.blockedContactsModal) closeBlockedContactsModal();
  });
  els.blockedContactsList?.addEventListener('click', (event) => {
    const loadMoreButton = event.target.closest('[data-blocked-load-more]');
    if (loadMoreButton && els.blockedContactsList.contains(loadMoreButton)) {
      event.preventDefault();
      loadBlockedContacts({ silent: false, append: true }).catch((error) => alert(error.message || 'No se pudieron cargar más contactos bloqueados.'));
      return;
    }
    const unblockButton = event.target.closest('[data-unblock-contact-id]');
    if (unblockButton && els.blockedContactsList.contains(unblockButton)) {
      event.preventDefault();
      unblockContactFromModal(unblockButton.dataset.unblockContactId || '').catch((error) => alert(error.message || 'No se pudo desbloquear el contacto.'));
    }
  });

  els.btnCloseContactNickname?.addEventListener('click', closeContactNicknameModal);
  els.contactNicknameModal?.addEventListener('click', (event) => {
    if (event.target === els.contactNicknameModal) closeContactNicknameModal();
  });
  els.contactNicknameInput?.addEventListener('input', () => {
    state.contactNicknameDraft = String(els.contactNicknameInput.value || '').trim();
    renderContactNicknameModal();
  });
  els.contactNicknameInput?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveContactNicknameFromModal().catch((error) => alert(error.message || 'No se pudo guardar el apodo privado.'));
    }
  });
  els.btnSaveContactNickname?.addEventListener('click', () => {
    saveContactNicknameFromModal().catch((error) => alert(error.message || 'No se pudo guardar el apodo privado.'));
  });
  els.btnClearContactNickname?.addEventListener('click', () => {
    saveContactNicknameFromModal({ clear: true }).catch((error) => alert(error.message || 'No se pudo eliminar el apodo privado.'));
  });

  els.btnClosePrivateNotes?.addEventListener('click', closePrivateNotesModal);
  els.privateNotesModal?.addEventListener('click', (event) => {
    if (event.target === els.privateNotesModal) {
      closePrivateNotesModal();
      return;
    }
    const edit = event.target.closest('[data-edit-private-note]');
    if (edit && els.privateNotesModal.contains(edit)) {
      event.preventDefault();
      startEditPrivateNote(edit.dataset.editPrivateNote || '');
      return;
    }
    const del = event.target.closest('[data-delete-private-note]');
    if (del && els.privateNotesModal.contains(del)) {
      event.preventDefault();
      deletePrivateNote(del.dataset.deletePrivateNote || '').catch((error) => alert(error.message || 'No se pudo eliminar la nota privada.'));
    }
  });
  els.btnSavePrivateNote?.addEventListener('click', () => {
    savePrivateNoteFromModal().catch((error) => alert(error.message || 'No se pudo guardar la nota privada.'));
  });
  els.btnCancelPrivateNoteEdit?.addEventListener('click', () => {
    resetPrivateNoteEditor();
    renderPrivateNotesModal();
  });
  els.btnScheduleMessage?.addEventListener('click', () => {
    setSendMode('schedule', { openConfiguration: true });
  });
  els.btnSilentSend?.addEventListener('click', () => {
    sendSilentCurrentMessage().catch((error) => alert(error.message || 'No se pudo enviar sin notificación.'));
  });
  els.btnSendModePrefix?.addEventListener('click', (event) => {
    event.preventDefault();
    const nextOpen = !state.sendModeMenuOpen;
    if (nextOpen) {
      state.quickRepliesOpen = false;
      state.slashCommandsOpen = false;
      state.iconInsertPanelOpen = false;
      state.attachmentPickerOpen = false;
      state.attachmentPickerView = 'options';
      renderAttachmentPicker();
      if (state.scheduleModalOpen) closeScheduleModal();
      if (state.pollModalOpen) closePollModal();
      renderQuickRepliesPanel();
      renderSlashCommandsPanel();
      renderIconInsertPickerPanel();
    }
    state.sendModeMenuOpen = nextOpen;
    updateSendModeMenu();
  });
  els.sendModeMenu?.addEventListener('click', (event) => {
    const option = event.target.closest('[data-send-mode]');
    if (!option || !els.sendModeMenu.contains(option)) return;
    event.preventDefault();
    const mode = option.dataset.sendMode || 'direct';
    setSendMode(mode, { openConfiguration: mode === 'schedule' });
  });
  els.btnCycleTtl?.addEventListener('click', (event) => {
    event.preventDefault();
    cycleMessageTtl();
  });
  document.addEventListener('click', (event) => {
    if (!state.sendModeMenuOpen) return;
    if (els.sendModeMenu?.contains(event.target) || els.btnSendModePrefix?.contains(event.target)) return;
    closeSendModeMenu();
  });
  els.btnAttachFile?.addEventListener('click', (event) => {
    event.preventDefault();
    if (state.attachmentUploading || state.attachmentBatchSending) return;
    openAttachmentPicker();
  });
  els.attachmentPickerPanel?.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-attachment-picker-close]');
    if (closeButton) {
      event.preventDefault();
      closeAttachmentPicker({ restoreFocus: true });
      return;
    }
    const backButton = event.target.closest('[data-attachment-picker-back]');
    if (backButton) {
      event.preventDefault();
      state.attachmentPickerView = 'options';
      renderAttachmentPicker();
      return;
    }
    const loadMoreContactsButton = event.target.closest('[data-load-more-attachment-contacts]');
    if (loadMoreContactsButton) {
      event.preventDefault();
      loadMoreContacts()
        .then(() => renderAttachmentPicker())
        .catch((error) => alert(error.message || 'No se pudieron cargar más contactos.'));
      return;
    }
    const chaterContact = event.target.closest('[data-attachment-chater-contact-id]');
    if (chaterContact) {
      event.preventDefault();
      try { shareChatERContactFromAttachmentPicker(chaterContact.dataset.attachmentChaterContactId || ''); }
      catch (error) { alert(error.message || 'No se pudo compartir el contacto ChatER.'); }
      return;
    }
    const option = event.target.closest('[data-attachment-option]');
    if (!option) return;
    event.preventDefault();
    const action = option.dataset.attachmentOption || '';
    if (action === 'gallery') { closeAttachmentPicker(); els.galleryInput?.click(); return; }
    if (action === 'file') { closeAttachmentPicker(); els.fileInput?.click(); return; }
    if (action === 'chater-contact') { state.attachmentPickerView = 'chater'; renderAttachmentPicker(); return; }
    if (action === 'camera') { openCameraAttachmentFlow().catch((error) => { if (!error?.permissionHandled) alert(error.message || 'No se pudo abrir la cámara.'); }); return; }
    if (action === 'location') { shareCurrentLocationFromAttachmentPicker().catch((error) => alert(error.message || 'No se pudo obtener la ubicación.')); return; }
    if (action === 'device-contact') { shareDeviceContactFromAttachmentPicker().catch((error) => alert(error.message || 'No se pudo abrir el contacto del celular.')); }
  });
  const bindAttachmentInput = (input, options = {}) => {
    input?.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.value = '';
      handleAttachmentInputFiles(files, options).catch((error) => {
        if (!files.every((file) => isImageAttachmentFile(file))) clearPendingAttachment();
        alert(error.message || 'No se pudo adjuntar el archivo.');
      });
    });
  };
  bindAttachmentInput(els.galleryInput, { imagesOnly: true });
  bindAttachmentInput(els.cameraInput, { imagesOnly: true });
  bindAttachmentInput(els.fileInput, { imagesOnly: false });
  document.addEventListener('click', (event) => {
    if (!state.attachmentPickerOpen) return;
    if (els.attachmentPickerPanel?.contains(event.target) || els.btnAttachFile?.contains(event.target)) return;
    closeAttachmentPicker();
  });
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a.ce-attachment--file[data-attachment-fallback-url]');
    if (!link) return;
    const expiresAt = Date.parse(link.dataset.attachmentSignedExpiresAt || '');
    if (!Number.isFinite(expiresAt) || expiresAt > Date.now() + 5000) return;
    const fallbackUrl = String(link.dataset.attachmentFallbackUrl || '').trim();
    if (fallbackUrl) link.href = fallbackUrl;
  });
  els.attachmentPreview?.addEventListener('click', (event) => {
    const imageButton = event.target.closest('[data-open-pending-image-viewer]');
    if (imageButton && els.attachmentPreview.contains(imageButton)) {
      event.preventDefault();
      openImageViewer(imageButton.dataset.imageUrl || '', imageButton.dataset.imageAlt || 'Imagen adjunta');
      return;
    }
    const imagePreviewClear = event.target.closest('[data-clear-image-preview]');
    if (imagePreviewClear && els.attachmentPreview.contains(imagePreviewClear)) {
      event.preventDefault();
      clearPendingImagePreview(imagePreviewClear.dataset.clearImagePreview || '');
      els.messageInput?.focus();
      return;
    }
    const clearAllButton = event.target.closest('[data-clear-all-attachments]');
    if (clearAllButton && els.attachmentPreview.contains(clearAllButton)) {
      event.preventDefault();
      clearPendingAttachment();
      els.messageInput?.focus();
      return;
    }
    const clearButton = event.target.closest('[data-clear-attachment]');
    if (!clearButton || !els.attachmentPreview.contains(clearButton)) return;
    event.preventDefault();
    clearPendingAttachment(clearButton.dataset.clearAttachment || '');
    els.messageInput?.focus();
  });
  els.btnCreatePoll?.addEventListener('click', () => openPollModal());
  els.btnVoiceDictation?.addEventListener('click', () => toggleVoiceDictation());
  els.pollModal?.addEventListener('click', (event) => { if (event.target === els.pollModal) closePollModal(); });
  els.pollForm?.addEventListener('input', renderPollModal);
  els.pollForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    createPollFromModal().catch((error) => alert(error.message || 'No se pudo publicar la encuesta.'));
  });
  els.scheduleSilent?.addEventListener('change', renderScheduleModal);
  els.scheduleModal?.addEventListener('click', (event) => {
    if (event.target === els.scheduleModal) {
      closeScheduleModal();
      return;
    }
    const cancel = event.target.closest('[data-cancel-scheduled-id]');
    if (!cancel || !els.scheduleModal.contains(cancel)) return;
    event.preventDefault();
    cancelScheduledMessage(cancel.dataset.cancelScheduledId || '').catch((error) => alert(error.message || 'No se pudo cancelar el mensaje programado.'));
  });
  els.scheduleDateTime?.addEventListener('input', renderScheduleModal);
  els.messageTtlSelect?.addEventListener('change', () => { updateComposerControls(); renderScheduleModal(); });
  els.btnConfirmSchedule?.addEventListener('click', () => {
    scheduleCurrentMessage().catch((error) => alert(error.message || 'No se pudo programar el mensaje.'));
  });
  els.addContactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = els.contactEmailInput.value.trim();
    if (!email) {
      els.contactEmailInput?.focus?.();
      return;
    }
    await addContactByEmail(email).catch((error) => alert(error.message));
    els.contactEmailInput.value = '';
  });
  els.chatList.addEventListener('click', (event) => {
    const loadMoreButton = event.target.closest('[data-load-more-chats]');
    if (loadMoreButton && els.chatList.contains(loadMoreButton)) {
      event.preventDefault();
      event.stopPropagation();
      loadMoreChats().catch((error) => alert(error.message || 'No se pudieron cargar más chats.'));
      return;
    }
    const profileButton = event.target.closest('[data-open-chat-profile]');
    if (profileButton && els.chatList.contains(profileButton)) {
      event.preventDefault();
      event.stopPropagation();
      const row = profileButton.closest('[data-chat-id]');
      const chat = state.chats.find((item) => item.chatId === row?.dataset?.chatId);
      openProfileCard(resolveProfileFromChat(chat || {}));
      return;
    }
    const clearLabelFilterButton = event.target.closest('[data-clear-label-filter]');
    if (clearLabelFilterButton && els.chatList.contains(clearLabelFilterButton)) {
      event.preventDefault();
      event.stopPropagation();
      state.activeLabelFilter = '';
      renderAll();
      return;
    }
    const markAllButton = event.target.closest('[data-mark-all-read]');
    if (markAllButton && els.chatList.contains(markAllButton)) {
      event.preventDefault();
      event.stopPropagation();
      markAllChatsRead().catch((error) => alert(error.message || 'No se pudieron marcar los chats como leídos.'));
      return;
    }
    const pinButton = event.target.closest('[data-pin-chat-id]');
    if (pinButton && els.chatList.contains(pinButton)) {
      event.preventDefault();
      event.stopPropagation();
      const nextState = pinButton.dataset.pinned !== '1';
      setChatPinned(pinButton.dataset.pinChatId || '', nextState).catch((error) => alert(error.message || 'No se pudo actualizar el chat fijado.'));
      return;
    }
    const archiveButton = event.target.closest('[data-archive-chat-id]');
    if (archiveButton && els.chatList.contains(archiveButton)) {
      event.preventDefault();
      event.stopPropagation();
      const nextState = archiveButton.dataset.archived !== '1';
      setChatArchived(archiveButton.dataset.archiveChatId || '', nextState).catch((error) => alert(error.message || 'No se pudo actualizar el archivo del chat.'));
      return;
    }
    const row = event.target.closest('[data-chat-id]');
    if (row) selectChat(row.dataset.chatId).catch((error) => alert(error.message));
  });
  els.chatList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const profileButton = event.target.closest('[data-open-chat-profile]');
    if (profileButton && els.chatList.contains(profileButton)) {
      event.preventDefault();
      event.stopPropagation();
      const row = profileButton.closest('[data-chat-id]');
      const chat = state.chats.find((item) => item.chatId === row?.dataset?.chatId);
      openProfileCard(resolveProfileFromChat(chat || {}));
      return;
    }
    const row = event.target.closest('[data-chat-id]');
    if (!row || event.target.closest('[data-pin-chat-id]') || event.target.closest('[data-archive-chat-id]') || event.target.closest('[data-mark-all-read]') || event.target.closest('[data-clear-label-filter]')) return;
    event.preventDefault();
    selectChat(row.dataset.chatId).catch((error) => alert(error.message));
  });
  els.contactList.addEventListener('click', (event) => {
    const loadMoreButton = event.target.closest('[data-load-more-contacts]');
    if (loadMoreButton && els.contactList.contains(loadMoreButton)) {
      event.preventDefault();
      loadMoreContacts().catch((error) => alert(error.message || 'No se pudieron cargar más contactos.'));
      return;
    }
    const nicknameButton = event.target.closest('[data-edit-contact-nickname]');
    if (nicknameButton && els.contactList.contains(nicknameButton)) {
      event.preventDefault();
      event.stopPropagation();
      openContactNicknameModal(nicknameButton.dataset.editContactNickname || '');
      return;
    }
    const row = event.target.closest('[data-contact-id]');
    if (row) openContactChat(row.dataset.contactId).catch((error) => alert(error.message));
  });
  els.contactList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-contact-id]');
    if (!row || event.target.closest('[data-edit-contact-nickname]')) return;
    event.preventDefault();
    openContactChat(row.dataset.contactId).catch((error) => alert(error.message));
  });
  els.chatSearchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await searchActiveChat(els.chatSearchInput.value);
  });
  els.btnShowStarred?.addEventListener('click', async () => {
    if (state.starredPanelOpen) {
      state.starredPanelOpen = false;
      renderSearchPanel();
      return;
    }
    await loadStarredMessages().catch((error) => alert(error.message || 'No se pudieron abrir los destacados.'));
  });
  els.btnClearSearch.addEventListener('click', () => resetChatSearch());
  els.chatSearchPanel.addEventListener('click', (event) => {
    const searchMore = event.target.closest('[data-search-load-more]');
    if (searchMore) {
      searchActiveChat(state.chatSearchQuery, { append: true }).catch((error) => alert(error.message || 'No se pudieron cargar más resultados.'));
      return;
    }
    const starredMore = event.target.closest('[data-starred-load-more]');
    if (starredMore) {
      loadStarredMessages({ append: true }).catch((error) => alert(error.message || 'No se pudieron cargar más destacados.'));
      return;
    }
    const row = event.target.closest('[data-search-message-id]');
    if (row) openSearchResult(row.dataset.searchMessageId).catch((error) => alert(error.message || 'No se pudo abrir el resultado.'));
  });
  els.chatSearchInput.addEventListener('input', () => {
    if (!els.chatSearchInput.value.trim()) resetChatSearch({ keepInput: true });
  });
  document.addEventListener('click', (event) => {
    if (!state.chatSearchOpen) return;
    const target = event.target;
    if (els.chatSearchArea?.contains(target)) return;
    if (target?.closest?.('[data-toggle-chat-search]')) return;
    setChatSearchOpen(false);
  });
  els.replyDraft?.addEventListener('click', (event) => {
    const cancelEdit = event.target.closest('[data-cancel-edit]');
    if (cancelEdit) {
      state.editingMessage = null;
      loadDraftForChat(state.activeChatId);
      renderReplyDraft();
      els.messageInput?.focus();
      return;
    }
    const editFocus = event.target.closest('[data-edit-focus]');
    if (editFocus) {
      els.messageInput?.focus();
      return;
    }
    const cancel = event.target.closest('[data-cancel-reply]');
    if (cancel) {
      state.replyToMessage = null;
      renderReplyDraft();
      els.messageInput?.focus();
      return;
    }
    const jump = event.target.closest('[data-jump-message-id]');
    if (jump) jumpToMessage(jump.dataset.jumpMessageId || '').catch((error) => alert(error.message || 'No se pudo abrir el mensaje respondido.'));
  });
  bindMessageLongPressSelection();
  els.messages.addEventListener('click', (event) => {
    const selectionMessageEl = event.target.closest('.ce-msg[data-message-id]');
    if (selectionMessageEl && els.messages.contains(selectionMessageEl) && (isMessageSelectionActive() || Date.now() < messageSelectionIgnoreClickUntil)) {
      event.preventDefault();
      event.stopPropagation();
      if (Date.now() < messageSelectionIgnoreClickUntil) {
        messageSelectionIgnoreClickUntil = 0;
        return;
      }
      toggleMessageSelection(selectionMessageEl.dataset.messageId || '');
      return;
    }
    const sharedContactSaveButton = event.target.closest('[data-chater-contact-save-code]');
    if (sharedContactSaveButton && els.messages.contains(sharedContactSaveButton)) {
      event.preventDefault();
      event.stopPropagation();
      saveSharedContactFromCode(sharedContactSaveButton.dataset.chaterContactSaveCode || '').catch((error) => alert(error.message || 'No se pudo guardar el contacto compartido.'));
      closeOpenMessageControls();
      return;
    }
    const sharedContactWriteButton = event.target.closest('[data-chater-contact-write-user-id], [data-chater-contact-write-code]');
    if (sharedContactWriteButton && els.messages.contains(sharedContactWriteButton)) {
      event.preventDefault();
      event.stopPropagation();
      openSharedContactChat(sharedContactWriteButton.dataset.chaterContactWriteUserId || '', sharedContactWriteButton.dataset.chaterContactWriteCode || '').catch((error) => alert(error.message || 'No se pudo abrir el chat del contacto compartido.'));
      closeOpenMessageControls();
      return;
    }
    const linkPreviewButton = event.target.closest('[data-chat-link-preview-url]');
    if (linkPreviewButton && els.messages.contains(linkPreviewButton)) {
      event.preventDefault();
      event.stopPropagation();
      openLinkPreviewUrl(linkPreviewButton.dataset.chatLinkPreviewUrl || linkPreviewButton.getAttribute('href') || '', {
        confirm: (message) => window.confirm(message),
        open: (url) => {
          const opened = window.open(url, '_blank', 'noopener,noreferrer');
          if (opened) opened.opener = null;
          return Boolean(opened);
        }
      });
      closeOpenMessageControls();
      return;
    }
    const imageViewerButton = event.target.closest('[data-open-image-viewer]');
    if (imageViewerButton && els.messages.contains(imageViewerButton)) {
      event.preventDefault();
      event.stopPropagation();
      openImageViewer(imageViewerButton.dataset.imageUrl || '', imageViewerButton.dataset.imageAlt || 'Imagen adjunta');
      closeOpenMessageControls();
      return;
    }
    const messageEl = event.target.closest('.ce-msg');
    if (messageEl && els.messages.contains(messageEl)) {
      openMessageControlsForElement(messageEl);
    } else {
      closeOpenMessageControls();
    }
    const controlsToggle = event.target.closest('[data-message-controls-toggle]');
    if (controlsToggle && els.messages.contains(controlsToggle)) {
      event.preventDefault();
      event.stopPropagation();
      toggleMessageControlList(controlsToggle);
      return;
    }
    const blockButton = event.target.closest('[data-block-active-contact]');
    if (blockButton && els.messages.contains(blockButton)) {
      event.preventDefault();
      setActiveContactBlocked(blockButton.dataset.blockActiveContact === '1').catch((error) => alert(error.message || 'No se pudo actualizar el bloqueo del contacto.'));
      return;
    }
    const unreadMarkerButton = event.target.closest('[data-jump-unread-marker]');
    if (unreadMarkerButton && els.messages.contains(unreadMarkerButton)) {
      event.preventDefault();
      jumpToUnreadMarker(unreadMarkerButton.dataset.jumpUnreadMarker || '');
      return;
    }
    const jumpButton = event.target.closest('[data-jump-message-id]');
    if (jumpButton && els.messages.contains(jumpButton)) {
      event.preventDefault();
      jumpToMessage(jumpButton.dataset.jumpMessageId || '').catch((error) => alert(error.message || 'No se pudo abrir el mensaje respondido.'));
      return;
    }
    const replyButton = event.target.closest('[data-reply-message-id]');
    if (replyButton && els.messages.contains(replyButton)) {
      event.preventDefault();
      rememberRecentControl(messageActionRecentStorageKey, 'reply', ['star', 'pin', 'reply', 'forward', 'reminder', 'link', 'copy', 'edit', 'delete']);
      startReplyToMessage(replyButton.dataset.replyMessageId || '');
      return;
    }
    const forwardButton = event.target.closest('[data-forward-message-id]');
    if (forwardButton && els.messages.contains(forwardButton)) {
      event.preventDefault();
      rememberRecentControl(messageActionRecentStorageKey, 'forward', ['star', 'pin', 'reply', 'forward', 'reminder', 'link', 'copy', 'edit', 'delete']);
      openForwardMessage(forwardButton.dataset.forwardMessageId || '');
      return;
    }
    const editButton = event.target.closest('[data-edit-message-id]');
    if (editButton && els.messages.contains(editButton)) {
      event.preventDefault();
      rememberRecentControl(messageActionRecentStorageKey, 'edit', ['star', 'pin', 'reply', 'forward', 'reminder', 'link', 'copy', 'edit', 'delete']);
      startEditMessage(editButton.dataset.editMessageId || '');
      return;
    }
    const deleteButton = event.target.closest('[data-delete-message-id]');
    if (deleteButton && els.messages.contains(deleteButton)) {
      event.preventDefault();
      rememberRecentControl(messageActionRecentStorageKey, 'delete', ['star', 'pin', 'reply', 'forward', 'reminder', 'link', 'copy', 'edit', 'delete']);
      deleteMessageForEveryone(deleteButton.dataset.deleteMessageId || '').catch((error) => alert(error.message || 'No se pudo eliminar el mensaje.'));
      return;
    }
    const unpinButton = event.target.closest('[data-unpin-message-id]');
    if (unpinButton && els.messages.contains(unpinButton)) {
      event.preventDefault();
      setMessagePinned(unpinButton.dataset.unpinMessageId || '', false).catch((error) => alert(error.message || 'No se pudo desfijar el mensaje.'));
      return;
    }
    const pinButton = event.target.closest('[data-pin-message-id]');
    if (pinButton && els.messages.contains(pinButton)) {
      event.preventDefault();
      const nextState = pinButton.dataset.pinned !== '1';
      rememberRecentControl(messageActionRecentStorageKey, 'pin', ['star', 'pin', 'reply', 'forward', 'reminder', 'link', 'copy', 'edit', 'delete']);
      setMessagePinned(pinButton.dataset.pinMessageId || '', nextState).catch((error) => alert(error.message || 'No se pudo actualizar el mensaje fijado.'));
      return;
    }
    const starButton = event.target.closest('[data-star-message-id]');
    if (starButton && els.messages.contains(starButton)) {
      event.preventDefault();
      const nextState = starButton.dataset.starred !== '1';
      rememberRecentControl(messageActionRecentStorageKey, 'star', ['star', 'pin', 'reply', 'forward', 'reminder', 'link', 'copy', 'edit', 'delete']);
      setMessageStar(starButton.dataset.starMessageId || '', nextState).catch((error) => alert(error.message || 'No se pudo actualizar el destacado.'));
      return;
    }
    const remindButton = event.target.closest('[data-remind-message-id]');
    if (remindButton && els.messages.contains(remindButton)) {
      event.preventDefault();
      rememberRecentControl(messageActionRecentStorageKey, 'reminder', ['star', 'pin', 'reply', 'forward', 'reminder', 'link', 'copy', 'edit', 'delete']);
      openReminderModal(remindButton.dataset.remindMessageId || '').catch((error) => alert(error.message || 'No se pudo crear el recordatorio.'));
      return;
    }
    const messageLinkButton = event.target.closest('[data-copy-message-link-id]');
    if (messageLinkButton && els.messages.contains(messageLinkButton)) {
      event.preventDefault();
      rememberRecentControl(messageActionRecentStorageKey, 'link', ['star', 'pin', 'reply', 'forward', 'reminder', 'link', 'copy', 'edit', 'delete']);
      copyMessageLink(messageLinkButton.dataset.copyMessageLinkId || '').catch((error) => alert(error.message || 'No se pudo copiar el enlace del mensaje.'));
      return;
    }
    const copyButton = event.target.closest('[data-copy-message-id]');
    if (copyButton && els.messages.contains(copyButton)) {
      event.preventDefault();
      rememberRecentControl(messageActionRecentStorageKey, 'copy', ['star', 'pin', 'reply', 'forward', 'reminder', 'link', 'copy', 'edit', 'delete']);
      copyMessageText(copyButton.dataset.copyMessageId || '').catch((error) => alert(error.message || 'No se pudo copiar el mensaje.'));
      return;
    }
    const outboxRetryButton = event.target.closest('[data-outbox-retry]');
    if (outboxRetryButton && els.messages.contains(outboxRetryButton)) {
      event.preventDefault();
      const queued = state.outboxMessages.find((item) => item.clientMessageId === (outboxRetryButton.dataset.outboxRetry || ''));
      if (queued) sendQueuedOutboxMessage(queued).catch((error) => alert(error.message || 'No se pudo reenviar el mensaje pendiente.'));
      return;
    }
    const outboxDiscardButton = event.target.closest('[data-outbox-discard]');
    if (outboxDiscardButton && els.messages.contains(outboxDiscardButton)) {
      event.preventDefault();
      const ok = window.confirm('¿Descartar este mensaje pendiente? Esta acción no lo enviará.');
      if (ok) {
        removeQueuedMessage(outboxDiscardButton.dataset.outboxDiscard || '');
        showTemporaryDraftStatus('Mensaje pendiente descartado.');
      }
      return;
    }
    const pollVoteButton = event.target.closest('[data-poll-vote-message-id][data-poll-option-id]');
    if (pollVoteButton && els.messages.contains(pollVoteButton)) {
      event.preventDefault();
      setPollVote(pollVoteButton.dataset.pollVoteMessageId || '', pollVoteButton.dataset.pollOptionId || '').catch((error) => alert(error.message || 'No se pudo registrar el voto.'));
      return;
    }
    const reactionButton = event.target.closest('[data-reaction][data-message-id]');
    if (!reactionButton || !els.messages.contains(reactionButton)) return;
    event.preventDefault();
    rememberRecentControl(reactionRecentStorageKey, normalizeReactionKey(reactionButton.dataset.reaction || ''), quickReactions);
    setMessageReaction(reactionButton.dataset.messageId || '', reactionButton.dataset.reaction || '').catch((error) => alert(error.message || 'No se pudo guardar la reacción.'));
  });
  document.addEventListener('click', (event) => {
    if (!els.messages || els.messages.contains(event.target)) return;
    closeOpenMessageControls();
  });
  els.tabChats.addEventListener('click', () => {
    activateChatListMode('active').catch((error) => alert(error.message || 'No se pudieron cargar los chats.'));
  });
  els.tabUnread?.addEventListener('click', () => {
    activateChatListMode('unread').catch((error) => alert(error.message || 'No se pudieron cargar los chats no leídos.'));
  });
  els.tabArchived?.addEventListener('click', () => {
    activateChatListMode('archived').catch((error) => alert(error.message || 'No se pudieron cargar los chats archivados.'));
  });
  els.tabContacts.addEventListener('click', showContactsTab);
  els.messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.attachmentBatchSending) return;
    const emojiKeyboardWasOpen = Boolean(state.iconInsertPanelOpen || els.messageForm?.classList.contains('ce-compose--emoji-keyboard') || document.body?.classList.contains('ce-emoji-keyboard-open'));
    const text = els.messageInput.value.trim();
    const hasAttachment = hasPendingComposerAttachment();
    if (state.voiceDictating) stopVoiceDictation({ announce: false });
    if (!text && !hasAttachment && !state.editingMessage?.messageId) {
      closeComposerTransientPanels();
      try {
        if (state.audioRecording) stopAudioRecording();
        else await startAudioRecording();
      } catch (error) {
        state.audioSending = false;
        resetAudioRecorderState();
        if (!error?.permissionHandled) alert(error.message || 'No se pudo iniciar la grabación de audio.');
      } finally {
        updateComposerControls();
      }
      return;
    }
    if (!text && !hasAttachment) return;
    closeComposerTransientPanels();
    els.btnSend.disabled = true;
    try {
      const slashResult = text ? await handleSlashCommandSubmit(text) : null;
      if (slashResult) {
        if (slashResult.clearComposer) {
          els.messageInput.value = '';
          clearDraftForChat(state.activeChatId);
        }
        await sendTyping(false);
        return;
      }
      const wasEditing = Boolean(state.editingMessage?.messageId);
      if (wasEditing) await editActiveMessage(text);
      else if (normalizeSendMode(state.sendMode) === 'schedule') {
        if (hasAttachment) throw new Error('La programación de mensajes solo está disponible para texto. Quita el adjunto o cambia a envío directo.');
        await scheduleCurrentMessage();
      } else {
        const silent = normalizeSendMode(state.sendMode) === 'silent';
        await sendComposerMessageWithPendingAttachments(text, { silent });
        els.messageInput.value = '';
        clearPendingAttachment();
      }
      await sendTyping(false);
    } catch (error) {
      els.messageInput.value = error?.composerTextAlreadySent ? '' : text;
      const fallback = state.editingMessage?.messageId
        ? 'No se pudo guardar la edición. Tu texto se conservó para reintentar.'
        : 'No se pudo enviar el mensaje. Tu texto se conservó para reintentar.';
      alert(error.message || fallback);
    } finally {
      updateComposerControls();
      if (shouldRestoreComposerFocusAfterSubmit({ emojiKeyboardWasOpen })) {
        els.messageInput.focus();
      }
    }
  });
  els.messageInput.addEventListener('focus', () => {
    if (state.iconInsertPanelOpen) closeIconInsertPicker();
  });
  els.messageInput.addEventListener('input', () => {
    scheduleActiveDraftSave();
    updateComposerControls();
    if (state.scheduleModalOpen) renderScheduleModal();
    if (state.quickRepliesOpen) renderQuickRepliesPanel();
    if (state.iconInsertPanelOpen) renderIconInsertPickerPanel();
    renderSlashCommandsPanel();
    sendTyping(true);
    if (state.typingTimer) window.clearTimeout(state.typingTimer);
    state.typingTimer = window.setTimeout(() => sendTyping(false), typingIdleDelayMs);
  });
  els.messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.iconInsertPanelOpen) {
      closeIconInsertPicker();
      return;
    }
    if (event.key === 'Escape' && state.slashCommandsOpen) {
      state.slashCommandsOpen = false;
      renderSlashCommandsPanel();
      return;
    }
    if (event.key === 'Escape' && state.editingMessage) {
      state.editingMessage = null;
      loadDraftForChat(state.activeChatId);
      renderReplyDraft();
      return;
    }
    if (event.key === 'Escape' && state.replyToMessage) {
      state.replyToMessage = null;
      renderReplyDraft();
    }
  });
  els.btnShowQr.addEventListener('click', openOwnQr);
  els.btnScanQr.addEventListener('click', openScanQr);
  els.btnCloseQr.addEventListener('click', closeQrModal);
  els.qrModal.addEventListener('click', (event) => {
    if (event.target === els.qrModal) {
      closeQrModal();
      return;
    }
    const profileImageButton = event.target.closest('[data-open-profile-image-viewer]');
    if (profileImageButton && els.qrModal.contains(profileImageButton)) {
      event.preventDefault();
      openImageViewer(profileImageButton.dataset.imageUrl || '', profileImageButton.dataset.imageAlt || 'Foto de perfil');
      return;
    }
    const shareToggle = event.target.closest('[data-profile-share-toggle]');
    if (shareToggle && els.qrModal.contains(shareToggle)) {
      event.preventDefault();
      const root = shareToggle.closest('[data-profile-share-root]');
      const menu = root?.querySelector?.('[data-profile-share-menu]');
      const open = menu?.classList.contains('hidden');
      menu?.classList.toggle('hidden', !open);
      shareToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    const shareImageButton = event.target.closest('[data-profile-share-image]');
    if (shareImageButton && els.qrModal.contains(shareImageButton)) {
      event.preventDefault();
      shareProfileQrImage(state.contactShareTargetProfile || state.user || {}).catch((error) => alert(error.message || 'No se pudo compartir la imagen QR.'));
      return;
    }
    const shareCopyButton = event.target.closest('[data-profile-share-copy]');
    if (shareCopyButton && els.qrModal.contains(shareCopyButton)) {
      event.preventDefault();
      copyProfileShareLink(shareCopyButton.dataset.profileShareCopy || '').catch((error) => alert(error.message || 'No se pudo copiar el enlace del perfil.'));
      return;
    }
    const shareContactButton = event.target.closest('[data-profile-share-contact]');
    if (shareContactButton && els.qrModal.contains(shareContactButton)) {
      event.preventDefault();
      openContactShareModal(state.contactShareTargetProfile || state.user || {});
      return;
    }
    const copyProfileButton = event.target.closest('[data-copy-profile-link]');
    if (copyProfileButton && els.qrModal.contains(copyProfileButton)) {
      event.preventDefault();
      copyProfileShareLink(copyProfileButton.dataset.copyProfileLink || '').catch((error) => alert(error.message || 'No se pudo copiar el enlace del perfil.'));
    }
  });
  els.manualCodeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = els.manualCodeInput.value.trim();
    if (!value) return;
    await addContactByCode(value).then(closeQrModal).catch((error) => alert(error.message));
  });
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const expectedScope = new URL('./', window.location.href).href;
      const candidate = await navigator.serviceWorker.getRegistration(expectedScope).catch(() => null);
      // Una navegación dentro del scope ya participa en el ciclo estándar de actualización
      // del Service Worker. Reutilizar el registro exacto evita volver a solicitar sw.js
      // desde JavaScript en cada arranque; solo registramos cuando todavía no existe.
      const existingRegistration = candidate?.scope === expectedScope ? candidate : null;
      const registration = existingRegistration
        || await navigator.serviceWorker.register('./sw.js', { scope: './' });
      state.serviceWorkerRegistration = registration;
      requestServiceWorkerDeliveryAckFlush();
    } catch {}
  }
}

async function init() {
  getClientId();
  setPrivacyMode(readPrivacyModePreference(), { announce: false });
  setCompactMode(readCompactModePreference(), { announce: false });
  ensureIconInsertPickerKeyboardPlacement();
  bindEvents();
  installAppNavigationHistory();
  await registerServiceWorker();
  try {
    if (getSessionToken()) {
      const restored = await bootstrapExistingSession();
      if (restored) {
        // El bootstrap moderno ya contiene la configuración pública necesaria.
        // Solo consultamos /api/config como compatibilidad con un backend anterior
        // durante un despliegue escalonado, evitando una HTTP Response en el flujo normal.
        if (!state.config) await loadConfig();
        return;
      }
    }
    await loadConfig();
    showGuest();
  } catch (error) {
    setStatus(error.message || 'No se pudo conectar con chatER.');
    showGuest();
  }
}

init();
