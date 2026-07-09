// Bloque exclusivo LINKminiaturasx.
// Responsabilidad: detectar links en mensajes, construir la miniatura local y centralizar la apertura segura.

const LINK_PREVIEW_REGEX = /https?:\/\/[^\s<>()]+|www\.[^\s<>()]+/gi;
const TRAILING_LINK_PUNCTUATION = /[),.;:!?]+$/g;

function escapeLinkPreviewHtml(value = '') {
  return String(value || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function cleanRawLinkCandidate(value = '') {
  return String(value || '').trim().replace(TRAILING_LINK_PUNCTUATION, '');
}

export function normalizeLinkPreviewUrl(value = '') {
  const clean = cleanRawLinkCandidate(value);
  if (!clean) return '';
  try {
    const parsed = new URL(clean.startsWith('www.') ? `https://${clean}` : clean);
    if (!/^https?:$/.test(parsed.protocol)) return '';
    parsed.hash = parsed.hash || '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function linkPreviewHostLabel(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || 'enlace';
  } catch {
    return 'enlace';
  }
}

function linkPreviewPathLabel(url = '') {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname || ''}${parsed.search || ''}`.replace(/^\/+/, '').trim();
    if (!path) return 'Página principal';
    return path.length > 86 ? `${path.slice(0, 83)}...` : path;
  } catch {
    return 'Enlace compartido';
  }
}

export function tokenizeTextWithLinkPreviews(text = '') {
  const source = String(text || '');
  if (!source) return [];
  const tokens = [];
  const regex = new RegExp(LINK_PREVIEW_REGEX.source, 'gi');
  let cursor = 0;
  let match;
  while ((match = regex.exec(source))) {
    const rawMatch = String(match[0] || '');
    const visibleRaw = cleanRawLinkCandidate(rawMatch);
    const trailing = rawMatch.slice(visibleRaw.length);
    const start = match.index;
    const end = start + visibleRaw.length;
    if (start > cursor) tokens.push({ type: 'text', value: source.slice(cursor, start) });
    const normalizedUrl = normalizeLinkPreviewUrl(visibleRaw);
    if (normalizedUrl) {
      tokens.push({ type: 'link', value: source.slice(start, end), url: normalizedUrl });
    } else {
      tokens.push({ type: 'text', value: source.slice(start, end) });
    }
    if (trailing) tokens.push({ type: 'text', value: trailing });
    cursor = match.index + rawMatch.length;
  }
  if (cursor < source.length) tokens.push({ type: 'text', value: source.slice(cursor) });
  return tokens;
}

export function extractLinkPreviewItems(text = '') {
  const seen = new Set();
  return tokenizeTextWithLinkPreviews(text)
    .filter((token) => token.type === 'link' && token.url)
    .map((token) => {
      const key = token.url.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      const host = linkPreviewHostLabel(token.url);
      return {
        url: token.url,
        visibleUrl: token.value || token.url,
        host,
        title: host,
        pathLabel: linkPreviewPathLabel(token.url),
        secure: token.url.toLowerCase().startsWith('https://'),
        protocolLabel: token.url.toLowerCase().startsWith('https://') ? 'HTTPS' : 'HTTP',
        thumbText: (host.replace(/[^a-z0-9]/gi, '').slice(0, 1) || 'L').toUpperCase()
      };
    })
    .filter(Boolean);
}

export function extractLinkPreviewUrls(text = '') {
  return extractLinkPreviewItems(text).map((item) => item.url);
}

function renderLinkifiedMessageText(text = '', renderTextSegment = escapeLinkPreviewHtml) {
  return tokenizeTextWithLinkPreviews(text).map((token) => {
    if (token.type !== 'link') return renderTextSegment(token.value || '');
    const label = token.value || token.url;
    return `<a class="ce-link-preview__original" href="${escapeLinkPreviewHtml(token.url)}" target="_blank" rel="noopener noreferrer" data-chat-link-preview-url="${escapeLinkPreviewHtml(token.url)}" data-chat-link-preview-role="original">${escapeLinkPreviewHtml(label)}</a>`;
  }).join('');
}

function renderLinkPreviewCard(item = {}, extraCount = 0) {
  if (!item?.url) return '';
  const secureClass = item.secure ? 'ce-link-preview-card--secure' : 'ce-link-preview-card--warning';
  const protocolText = item.secure ? 'Enlace seguro HTTPS' : 'HTTP: requiere advertencia antes de abrir';
  const extra = extraCount > 0 ? `<span class="ce-link-preview-card__extra">+${Number(extraCount)} ${extraCount === 1 ? 'enlace adicional' : 'enlaces adicionales'}</span>` : '';
  return `<button class="ce-link-preview-card ${secureClass}" type="button" data-chat-link-preview-url="${escapeLinkPreviewHtml(item.url)}" data-chat-link-preview-role="card" aria-label="Abrir ${escapeLinkPreviewHtml(item.host)}">
    <span class="ce-link-preview-card__thumb" aria-hidden="true"><span>${escapeLinkPreviewHtml(item.thumbText)}</span></span>
    <span class="ce-link-preview-card__content">
      <strong>${escapeLinkPreviewHtml(item.title)}</strong>
      <span>${escapeLinkPreviewHtml(item.pathLabel)}</span>
      <em>${escapeLinkPreviewHtml(protocolText)}</em>
      ${extra}
    </span>
  </button>`;
}

export function renderLinkPreviewTextBody(text = '', options = {}) {
  const cleanText = String(text || '').trim();
  if (!cleanText || options.shouldRender === false) return '';
  const items = extractLinkPreviewItems(cleanText);
  const textClass = String(options.textClass || 'ce-msg__text').trim() || 'ce-msg__text';
  const renderTextSegment = typeof options.renderTextSegment === 'function' ? options.renderTextSegment : escapeLinkPreviewHtml;
  const linkifiedText = renderLinkifiedMessageText(cleanText, renderTextSegment);
  if (!items.length) return `<p class="${escapeLinkPreviewHtml(textClass)}">${linkifiedText}</p>`;
  return `<div class="ce-link-preview" data-link-preview-block="LINKminiaturasx">
    <p class="${escapeLinkPreviewHtml(textClass)}">${linkifiedText}</p>
    ${renderLinkPreviewCard(items[0], Math.max(0, items.length - 1))}
  </div>`;
}

export function isUnsafeHttpLinkPreviewUrl(url = '') {
  const cleanUrl = normalizeLinkPreviewUrl(url);
  if (!cleanUrl) return false;
  try {
    return new URL(cleanUrl).protocol === 'http:';
  } catch {
    return false;
  }
}

export function buildUnsafeHttpLinkWarning(url = '') {
  const host = linkPreviewHostLabel(normalizeLinkPreviewUrl(url));
  return `Este enlace usa http:// y tal vez no sea seguro. No compartas contraseñas, códigos ni datos personales si no confías en ${host}. ¿Quieres abrirlo de todos modos?`;
}

function defaultOpenExternalLink(url = '') {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (opened) opened.opener = null;
  return Boolean(opened);
}

export function openLinkPreviewUrl(url = '', options = {}) {
  const cleanUrl = normalizeLinkPreviewUrl(url);
  if (!cleanUrl) return false;
  const confirmFn = typeof options.confirm === 'function' ? options.confirm : (message) => window.confirm(message);
  if (isUnsafeHttpLinkPreviewUrl(cleanUrl) && !confirmFn(buildUnsafeHttpLinkWarning(cleanUrl))) return false;
  const openFn = typeof options.open === 'function' ? options.open : defaultOpenExternalLink;
  return openFn(cleanUrl) !== false;
}
