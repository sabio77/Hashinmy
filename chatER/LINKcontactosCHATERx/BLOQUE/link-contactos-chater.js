// Bloque exclusivo LINKcontactosCHATERx.
// Responsabilidad: detectar enlaces de contactos chatER, ocultar el link QR en el mensaje
// y construir tarjetas compactas de contacto con acciones seguras de guardar/escribir.

const CHATER_CONTACT_CANDIDATE_REGEX = /chater:[^\s<>()]+|https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|cer_[a-z0-9_-]{8,80}/gi;
const CHATER_PROFILE_CODE_REGEX = /^cer_[a-z0-9_-]{8,80}$/i;
const TRAILING_CONTACT_LINK_PUNCTUATION = /[),.;:!?]+$/g;

function escapeContactHtml(value = '') {
  return String(value || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function cleanContactCandidate(value = '') {
  return String(value || '').trim().replace(TRAILING_CONTACT_LINK_PUNCTUATION, '');
}

function normalizeContactUrlCandidate(value = '') {
  const clean = cleanContactCandidate(value);
  if (!clean) return '';
  if (/^chater:/i.test(clean)) return clean;
  if (CHATER_PROFILE_CODE_REGEX.test(clean)) return clean;
  try {
    const parsed = new URL(clean.startsWith('www.') ? `https://${clean}` : clean);
    if (!/^https?:$/.test(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function extractChatERContactCode(value = '') {
  const raw = cleanContactCandidate(value);
  if (!raw) return '';
  const withoutScheme = raw.replace(/^chater:/i, '').trim();
  if (CHATER_PROFILE_CODE_REGEX.test(withoutScheme)) return withoutScheme;
  try {
    const parsed = new URL(withoutScheme.startsWith('www.') ? `https://${withoutScheme}` : withoutScheme);
    const queryCode = parsed.searchParams.get('add') || parsed.searchParams.get('code') || parsed.searchParams.get('profileCode');
    if (queryCode && CHATER_PROFILE_CODE_REGEX.test(queryCode.trim())) return queryCode.trim();

    const parts = parsed.pathname.split('/').map((part) => decodeURIComponent(part || '').trim()).filter(Boolean);
    const markerIndex = parts.findIndex((part) => /^(p|perfil|profile|profiles)$/i.test(part));
    if (markerIndex >= 0 && parts[markerIndex + 1] && CHATER_PROFILE_CODE_REGEX.test(parts[markerIndex + 1])) return parts[markerIndex + 1];

    const apiProfileIndex = parts.findIndex((part, index) => /^profiles$/i.test(part) && /^api$/i.test(parts[index - 1] || ''));
    if (apiProfileIndex >= 0 && parts[apiProfileIndex + 1] && CHATER_PROFILE_CODE_REGEX.test(parts[apiProfileIndex + 1])) return parts[apiProfileIndex + 1];

    const codeLike = parts.find((part) => CHATER_PROFILE_CODE_REGEX.test(part));
    return codeLike || '';
  } catch {
    return CHATER_PROFILE_CODE_REGEX.test(withoutScheme) ? withoutScheme : '';
  }
}

export function tokenizeTextWithChatERContactLinks(text = '') {
  const source = String(text || '');
  if (!source) return [];
  const tokens = [];
  const regex = new RegExp(CHATER_CONTACT_CANDIDATE_REGEX.source, 'gi');
  let cursor = 0;
  let match;
  while ((match = regex.exec(source))) {
    const rawMatch = String(match[0] || '');
    const visibleRaw = cleanContactCandidate(rawMatch);
    const trailing = rawMatch.slice(visibleRaw.length);
    const start = match.index;
    const end = start + visibleRaw.length;
    if (start > cursor) tokens.push({ type: 'text', value: source.slice(cursor, start) });
    const code = extractChatERContactCode(visibleRaw);
    const normalized = normalizeContactUrlCandidate(visibleRaw);
    if (code && normalized) {
      tokens.push({ type: 'contact-link', value: source.slice(start, end), code, url: normalized });
    } else {
      tokens.push({ type: 'text', value: source.slice(start, end) });
    }
    if (trailing) tokens.push({ type: 'text', value: trailing });
    cursor = match.index + rawMatch.length;
  }
  if (cursor < source.length) tokens.push({ type: 'text', value: source.slice(cursor) });
  return tokens;
}

export function extractChatERContactLinks(text = '') {
  const seen = new Set();
  return tokenizeTextWithChatERContactLinks(text)
    .filter((token) => token.type === 'contact-link' && token.code)
    .map((token) => {
      const key = token.code.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        code: token.code,
        url: token.url,
        visible: token.value || token.url || token.code
      };
    })
    .filter(Boolean);
}

export function stripChatERContactLinksFromText(text = '') {
  return tokenizeTextWithChatERContactLinks(text)
    .filter((token) => token.type !== 'contact-link')
    .map((token) => token.value || '')
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function profileDisplayName(profile = {}) {
  return profile.contactName || profile.nickname || profile.displayName || profile.email || 'Contacto chatER';
}

function profileEmail(profile = {}) {
  return String(profile.email || '').trim();
}

function profileInitials(profile = {}) {
  const source = String(profileDisplayName(profile) || 'CE').trim();
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CE';
}

function renderSharedContactAvatar(profile = {}, status = 'loading') {
  const label = profileDisplayName(profile);
  if (profile.photoUrl && status === 'ready') {
    return `<span class="ce-shared-contact-card__avatar"><img src="${escapeContactHtml(profile.photoUrl)}" alt="Foto de perfil de ${escapeContactHtml(label)}" referrerpolicy="no-referrer" loading="lazy" decoding="async" draggable="false"></span>`;
  }
  const fallback = status === 'missing' ? '?' : profileInitials(profile);
  return `<span class="ce-shared-contact-card__avatar ce-shared-contact-card__avatar--fallback" aria-hidden="true">${escapeContactHtml(fallback)}</span>`;
}

function renderSharedContactCard(candidate = {}, preview = {}, options = {}) {
  const status = preview?.status || 'loading';
  const profile = preview?.profile || {};
  const ready = status === 'ready' && Boolean(profile.userId);
  const missing = status === 'missing';
  const saved = Boolean(preview?.saved || (ready && typeof options.isContactSaved === 'function' && options.isContactSaved(profile)));
  const self = Boolean(ready && typeof options.isSelfProfile === 'function' && options.isSelfProfile(profile));
  const code = candidate.code || preview?.code || profile.profileCode || '';
  const title = ready ? profileDisplayName(profile) : (missing ? 'Contacto no disponible' : 'Verificando contacto chatER');
  const email = ready ? profileEmail(profile) : (missing ? 'El enlace no corresponde a un perfil activo.' : 'Validando perfil compartido...');
  const stateText = self ? 'Este es tu perfil' : (saved ? 'Contacto guardado' : (ready ? 'Contacto compartido' : (missing ? 'No se puede guardar' : 'Buscando perfil')));
  const saveDisabled = !ready || saved || self;
  const writeDisabled = !ready || self;
  const saveLabel = self ? 'Tu perfil' : (saved ? 'Guardado' : 'Guardar');
  const writeLabel = self ? 'Abrir perfil' : 'Escribir';
  const readyAttrs = ready
    ? ` data-chater-contact-user-id="${escapeContactHtml(profile.userId || '')}" data-chater-contact-code="${escapeContactHtml(code)}"`
    : ` data-chater-contact-code="${escapeContactHtml(code)}"`;

  return `<article class="ce-shared-contact-card ce-shared-contact-card--${escapeContactHtml(status)}" data-link-preview-block="LINKcontactosCHATERx"${readyAttrs} aria-label="Contacto compartido ${escapeContactHtml(title)}">
    ${renderSharedContactAvatar(profile, status)}
    <span class="ce-shared-contact-card__body">
      <strong>${escapeContactHtml(title)}</strong>
      <span>${escapeContactHtml(email)}</span>
      <em>${escapeContactHtml(stateText)}</em>
    </span>
    <span class="ce-shared-contact-card__actions">
      <button type="button" data-chater-contact-save-code="${escapeContactHtml(code)}"${saveDisabled ? ' disabled' : ''}>${escapeContactHtml(saveLabel)}</button>
      <button type="button" data-chater-contact-write-user-id="${escapeContactHtml(profile.userId || '')}" data-chater-contact-write-code="${escapeContactHtml(code)}"${writeDisabled ? ' disabled' : ''}>${escapeContactHtml(writeLabel)}</button>
    </span>
  </article>`;
}

export function renderChatERSharedContactCards(candidates = [], previewByCode = {}, options = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return '';
  const lookup = previewByCode instanceof Map
    ? (code) => previewByCode.get(String(code || '').toLowerCase())
    : (code) => previewByCode?.[String(code || '').toLowerCase()] || previewByCode?.[String(code || '')];
  return `<div class="ce-shared-contact-stack">${list.map((candidate) => {
    const preview = lookup(candidate.code) || { status: 'loading', code: candidate.code };
    return renderSharedContactCard(candidate, preview, options);
  }).join('')}</div>`;
}
