import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getLlmsHomeLabel, getLlmsHubLabel } from './llms-i18n-labels.mjs';
import { getConfiguredPublicHost, loadMemoriaBackendProjectConfig } from './memoria-backend-config.mjs';

const root = process.cwd();
const dist = path.join(root, 'dist');
const MEMORIA_BACKEND_CONFIG = await loadMemoriaBackendProjectConfig(root);
const PUBLIC_SITE_URL = MEMORIA_BACKEND_CONFIG.ORIGEN_PROYECTO;
const PUBLIC_SITE_HOST = getConfiguredPublicHost(MEMORIA_BACKEND_CONFIG);
const LANGUAGE_PATH_PREFIX = 'l';
const SEO_MODERN_ROUTE_QUERY = 'seo';
const REQUIRED_SEO_UI_LABEL_KEYS = ['productsLabel', 'allLabel', 'closeLabel', 'backToProductsLabel', 'viewSolutionLabel', 'classicViewLabel', 'classicViewAriaLabel', 'modernViewLabel', 'modernViewAriaLabel', 'categoryNavLabel', 'simpleLabel', 'whoLabel', 'technicalLabel', 'includesLabel', 'glossaryLabel', 'guideLabel', 'faqLabel', 'detailTitle', 'detailLead', 'scopeCatalogLabel', 'glossarySetLabel'];
const SITEMAP_LASTMOD = new Date().toISOString().slice(0, 10);
const SITEMAP_PRIORITY = {
  home: '1.00',
  languageHome: '0.72',
  seoHub: '0.95',
  seoItem: '0.90'
};
const SEO_FINAL_VISIBLE_LIMITS = {
  quick: 720,
  include: 220,
  term: 260,
  sectionHeading: 120,
  sectionBody: 1800,
  faqQuestion: 220,
  faqAnswer: 900,
  sections: 8,
  faqs: 8,
  terms: 10,
  includes: 12
};


const STATIC_BRAND_HOME_SCHEMA_SERVICE_MAP = [
  ['software-a-medida', 'service-custom-software'],
  ['ia-para-empresas', 'service-ai-automation'],
  ['automatizacion-procesos', 'service-business-automation'],
  ['financiacion-proyecto', 'service-financed-development'],
  ['diagnostico-tecnico', 'service-business-diagnosis'],
  ['chatbots-empresariales', 'service-web-seo-chatbots'],
  ['cotizador-tecnico-aprovechamiento', 'service-technical-quoter']
];


const DENSE_SCRIPT_LANGUAGE_CODES = new Set(['zh', 'ja', 'ko', 'th', 'my']);
const INDIC_SCRIPT_LANGUAGE_CODES = new Set(['hi', 'bn', 'mr', 'te', 'ta', 'gu', 'pa', 'kn', 'ml', 'or', 'as', 'ne', 'si']);
const RTL_SCRIPT_LANGUAGE_CODES = new Set(['ar', 'ur', 'fa', 'he']);
const ETHIOPIC_SCRIPT_LANGUAGE_CODES = new Set(['am']);

function getLanguageTextScript(code = 'es') {
  const normalized = String(code || 'es').trim().toLowerCase();
  if (RTL_SCRIPT_LANGUAGE_CODES.has(normalized)) return 'rtl';
  if (DENSE_SCRIPT_LANGUAGE_CODES.has(normalized)) return 'dense';
  if (INDIC_SCRIPT_LANGUAGE_CODES.has(normalized)) return 'indic';
  if (ETHIOPIC_SCRIPT_LANGUAGE_CODES.has(normalized)) return 'ethiopic';
  return 'latin';
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeLanguageCatalogEntry(entry = {}, fallbackCode = '') {
  const code = String(entry.code || entry.iso || fallbackCode || '').trim().toLowerCase();
  const name = String(entry.name || code.toUpperCase()).trim();
  const nativeName = String(entry.nativeName || entry.name || code.toUpperCase()).trim();
  const htmlLang = String(entry.htmlLang || code).trim();
  const dir = String(entry.dir || 'ltr').trim().toLowerCase() === 'rtl' ? 'rtl' : 'ltr';
  if (!code) return null;
  return { code, name, nativeName, htmlLang, dir };
}

function sortLanguageCatalog(catalog = []) {
  const preferred = new Map(['es', 'en'].map((code, index) => [code, index]));
  return (Array.isArray(catalog) ? catalog : [])
    .filter(Boolean)
    .sort((a, b) => {
      const orderA = preferred.has(a.code) ? preferred.get(a.code) : 1000;
      const orderB = preferred.has(b.code) ? preferred.get(b.code) : 1000;
      return orderA === orderB ? a.code.localeCompare(b.code) : orderA - orderB;
    });
}

async function readAvailableTextLanguageCatalog() {
  const textRoot = path.join(root, 'textX');
  const entries = await readdir(textRoot, { withFileTypes: true });
  const catalog = [];
  const seen = new Set();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'languages.json') continue;
    const code = path.basename(entry.name, '.json').trim().toLowerCase();
    if (!code || seen.has(code)) continue;
    try {
      const bundle = JSON.parse(await readFile(path.join(textRoot, entry.name), 'utf8'));
      const normalized = normalizeLanguageCatalogEntry(bundle, code);
      if (!normalized) continue;
      seen.add(normalized.code);
      catalog.push(normalized);
    } catch {}
  }

  return sortLanguageCatalog(catalog);
}

async function readAvailableSeoLanguageCodes() {
  const seoRoot = path.join(root, 'textX', 'seo');
  const entries = await readdir(seoRoot, { withFileTypes: true });
  return new Set(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.basename(entry.name, '.json').trim().toLowerCase())
    .filter(Boolean));
}

const PROOF_CLIENT_LOGOS_RELATIVE_DIR = path.join('assets', 'clientes');
const PROOF_CLIENT_LOGOS_DIR = path.join(root, PROOF_CLIENT_LOGOS_RELATIVE_DIR);
const PROOF_CLIENT_LOGOS_MANIFEST = 'clientes-manifest.json';
const PROOF_LOGO_IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.tif', '.tiff', '.webp']);

const PROOF_LOGO_DISPLAY_WORD_OVERRIDES = new Map([
  ['ai', 'AI'], ['ia', 'IA'], ['cad', 'CAD'], ['dxf', 'DXF'], ['seo', 'SEO'], ['pc', 'PC'], ['pwa', 'PWA'],
  ['crm', 'CRM'], ['erp', 'ERP'], ['ux', 'UX'], ['ui', 'UI'], ['3d', '3D'], ['vx', 'VX'], ['max', 'MAX'],
  ['mapsx', 'MapsX'], ['maxpunz', 'Maxpunz'], ['xzone', 'Xzone'], ['clean', 'Clean'], ['robots', 'Robots'],
  ['colombia', 'Colombia'], ['griferias', 'Griferías'], ['design', 'Design'], ['international', 'International'],
  ['industries', 'Industries'], ['marketplace', 'Marketplace']
]);

function formatProofLogoDisplayWord(word = '') {
  const rawWord = String(word || '').trim();
  if (!rawWord) return '';
  if (rawWord === '&') return rawWord;

  const normalizedKey = rawWord.toLowerCase();
  if (PROOF_LOGO_DISPLAY_WORD_OVERRIDES.has(normalizedKey)) return PROOF_LOGO_DISPLAY_WORD_OVERRIDES.get(normalizedKey);
  if (/^[A-Z0-9&]{2,6}$/u.test(rawWord)) return rawWord;

  return `${rawWord.charAt(0).toLocaleUpperCase('es')}${rawWord.slice(1).toLocaleLowerCase('es')}`;
}

function formatProofLogoDisplayName(value = '') {
  const rawSource = getProofLogoNameFromFileSource(value);
  const cleaned = rawSource
    .replace(/^[\s._-]*(?:logo|logos|cliente|clientes|client|clients|customer|customers|brand|brands|marca|marcas)[\s._-]+/iu, '')
    .replace(/[_]+/gu, ' ')
    .replace(/[-]+/gu, ' ')
    .replace(/\s*&\s*/gu, ' & ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!cleaned) return '';
  return cleaned.split(' ').map(formatProofLogoDisplayWord).filter(Boolean).join(' ').trim();
}

function getProofLogoNameFromFileSource(fileName = '') {
  return String(fileName || '').replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '').trim();
}

function getProofLogoNameFromFile(fileName = '', fallback = '') {
  return formatProofLogoDisplayName(fallback) || formatProofLogoDisplayName(fileName) || 'Experiencia Hashinmy';
}

function getProofLogoSlug(name = '', index = 0) {
  const raw = String(name || `cliente-${index + 1}`).trim().toLowerCase();
  let normalized = raw;
  try {
    normalized = raw.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch {}
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `cliente-${index + 1}`;
}

function buildProofLogoPublicUrl(fileName = '') {
  try {
    return new URL(`${PROOF_CLIENT_LOGOS_RELATIVE_DIR.replaceAll(path.sep, '/')}/${encodeURIComponent(fileName)}`, PUBLIC_SITE_URL).toString();
  } catch {
    return `${PUBLIC_SITE_URL}${PROOF_CLIENT_LOGOS_RELATIVE_DIR.replaceAll(path.sep, '/')}/${encodeURIComponent(fileName)}`;
  }
}

function buildProofLogoResourcePath(fileName = '', resourcePrefix = './') {
  const safePrefix = String(resourcePrefix || './');
  return `${safePrefix}${PROOF_CLIENT_LOGOS_RELATIVE_DIR.replaceAll(path.sep, '/')}/${encodeURIComponent(fileName)}`;
}

function normalizeProofClientLogoFileName(fileName = '') {
  const normalized = String(fileName || '').replace(/\\/g, '/').split('/').pop().trim();
  if (!normalized || normalized === PROOF_CLIENT_LOGOS_MANIFEST) return '';
  return PROOF_LOGO_IMAGE_EXTENSIONS.has(path.extname(normalized).toLowerCase()) ? normalized : '';
}

function normalizeProofClientLogoList(files = []) {
  const seen = new Set();
  return (Array.isArray(files) ? files : [])
    .map(normalizeProofClientLogoFileName)
    .filter((fileName) => {
      const key = fileName.toLowerCase();
      if (!fileName || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .map((fileName) => ({ name: getProofLogoNameFromFile(fileName), file: fileName }));
}

async function readProofClientLogosFromProjectStructure() {
  try {
    const structure = JSON.parse(await readFile(path.join(root, 'estructura_del_proyecto.json'), 'utf8'));
    const files = Array.isArray(structure?.files) ? structure.files : [];
    return normalizeProofClientLogoList(files
      .map((entry) => String(entry?.path || '').replace(/\\/g, '/').trim())
      .filter((relativePath) => relativePath.startsWith(`${PROOF_CLIENT_LOGOS_RELATIVE_DIR.replaceAll(path.sep, '/')}/`)));
  } catch {
    return [];
  }
}

async function discoverProofClientLogos() {
  let fileSystemLogos = [];
  try {
    const entries = await readdir(PROOF_CLIENT_LOGOS_DIR, { withFileTypes: true });
    fileSystemLogos = normalizeProofClientLogoList(entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name));
  } catch {
    fileSystemLogos = [];
  }

  const structureLogos = await readProofClientLogosFromProjectStructure();
  return normalizeProofClientLogoList([...fileSystemLogos, ...structureLogos].map((logo) => logo.file));
}

async function writeProofClientLogosManifest(targetRoot = root) {
  const logos = await discoverProofClientLogos();
  const manifest = {
    schemaVersion: 1,
    source: PROOF_CLIENT_LOGOS_RELATIVE_DIR.replaceAll(path.sep, '/'),
    generatedAt: new Date().toISOString(),
    logos
  };
  const manifestPath = path.join(targetRoot, PROOF_CLIENT_LOGOS_RELATIVE_DIR, PROOF_CLIENT_LOGOS_MANIFEST);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return logos;
}

async function readProofClientLogosManifestFromRoot() {
  try {
    const manifest = JSON.parse(await readFile(path.join(root, PROOF_CLIENT_LOGOS_RELATIVE_DIR, PROOF_CLIENT_LOGOS_MANIFEST), 'utf8'));
    return Array.isArray(manifest?.logos) ? manifest.logos : [];
  } catch {
    return [];
  }
}

function renderStaticProofLogoItems(logos = [], resourcePrefix = './', bundle = {}) {
  const safeLogos = Array.isArray(logos) ? logos : [];
  const placeholderLabel = valueAtPath(bundle, 'ui.proofLogoPlaceholder') || 'Experiencia Hashinmy';
  const logoAltTemplate = valueAtPath(bundle, 'ui.proofLogoAltTemplate') || 'Logo de {name}';
  if (!safeLogos.length) {
    return `
                <li class="hm-proof-logo hm-proof-logo--placeholder is-logo-missing" data-proof-logo-placeholder>
                  <figure>
                    <span class="hm-proof-logo__frame">
                      <span class="hm-proof-logo__fallback" aria-hidden="true"><span>HM</span></span>
                    </span>
                    <figcaption data-i18n-text="ui.proofLogoPlaceholder">${htmlTextEscape(placeholderLabel)}</figcaption>
                  </figure>
                </li>`;
  }

  return safeLogos.map((logo) => {
    const fileName = String(logo?.file || '').trim();
    const name = getProofLogoNameFromFile(fileName, logo?.name);
    const src = buildProofLogoResourcePath(fileName, resourcePrefix);
    const initials = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 3).map((word) => word[0]).join('').toUpperCase() || 'HM';
    return `
                <li class="hm-proof-logo" data-proof-logo>
                  <figure>
                    <span class="hm-proof-logo__frame">
                      <img src="${htmlAttributeEscape(src)}" alt="${htmlAttributeEscape(formatStaticTemplate(logoAltTemplate, { name }))}" width="320" height="220" loading="lazy" decoding="async" data-proof-logo-image />
                      <span class="hm-proof-logo__fallback" aria-hidden="true"><span>${htmlTextEscape(initials)}</span></span>
                    </span>
                    <figcaption>${htmlTextEscape(name)}</figcaption>
                  </figure>
                </li>`;
  }).join('');
}

function hydrateStaticProofLogosFallback(html, proofLogos = [], resourcePrefix = './', bundle = {}) {
  let output = String(html || '').replace(/<ul class="hm-home-proof__logos"[^>]*data-proof-logo-list[^>]*>[\s\S]*?<\/ul>/i, (tag) => {
    const open = tag.match(/^<ul[^>]*>/i)?.[0] || '<ul class="hm-home-proof__logos" id="hmProofLogoList" data-proof-logo-list>';
    return `${open}${renderStaticProofLogoItems(proofLogos, resourcePrefix, bundle)}
              </ul>`;
  });

  output = output.replace(/<script\s+type=["']application\/ld\+json["']\s+id=["']hmStructuredData["'][^>]*>\s*([\s\S]*?)\s*<\/script>/i, (full, rawJson) => {
    try {
      const payload = JSON.parse(rawJson);
      const graph = Array.isArray(payload?.['@graph']) ? payload['@graph'] : [];
      const mentions = proofLogos.map((logo, index) => ({ '@id': `${PUBLIC_SITE_URL}#related-${getProofLogoSlug(logo?.name || logo?.file, index)}` }));
      graph.forEach((node) => {
        if (node?.['@id'] === `${PUBLIC_SITE_URL}#webpage`) node.mentions = mentions;
        if (node?.['@id'] === `${PUBLIC_SITE_URL}#experience-logos`) {
          node.itemListElement = proofLogos.map((logo, index) => {
            const fileName = String(logo?.file || '').trim();
            const name = getProofLogoNameFromFile(fileName, logo?.name);
            const publicUrl = buildProofLogoPublicUrl(fileName);
            return {
              '@type': 'ListItem',
              position: index + 1,
              name,
              item: {
                '@id': `${PUBLIC_SITE_URL}#related-${getProofLogoSlug(name, index)}`,
                '@type': 'Organization',
                name,
                logo: publicUrl,
                image: publicUrl
              }
            };
          });
          node.description = valueAtPath(bundle, 'ui.proofBrandsStructuredDescription') || 'Listado SEO actualizado automáticamente desde las imágenes disponibles en assets/clientes.';
        }
      });
      const json = JSON.stringify(payload, null, 6).replace(/<\//g, '<\/');
      return `<script type="application/ld+json" id="hmStructuredData">
${json}
  </script>`;
    } catch {
      return full;
    }
  });

  return output;
}


function xmlEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}


function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function htmlTextEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function htmlAttributeEscape(value = '') {
  return xmlEscape(value);
}

function valueAtPath(source, dottedPath) {
  return String(dottedPath || '').split('.').reduce((node, part) => (
    node && Object.prototype.hasOwnProperty.call(node, part) ? node[part] : undefined
  ), source);
}

function formatStaticTemplate(template = '', replacements = {}) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(replacements, key) ? String(replacements[key] ?? '') : match
  ));
}

function readDataAttribute(attributes = '', attributeName) {
  const pattern = new RegExp(`\\s${escapeRegExp(attributeName)}=([\"'])([\\s\\S]*?)\\1`, 'i');
  const match = String(attributes || '').match(pattern);
  return match ? match[2] : '';
}

function removeHtmlAttribute(attributes = '', name = '') {
  const escapedName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(attributes || '').replace(new RegExp(`\\s+${escapedName}=(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'i'), '');
}

function upsertHtmlAttribute(attributes = '', attributeName, value = '') {
  const escapedValue = htmlAttributeEscape(value);
  const rawAttributes = String(attributes || '');
  const hasSelfClosingMarker = /\s\/\s*$/.test(rawAttributes);
  const safeAttributes = hasSelfClosingMarker ? rawAttributes.replace(/\s\/\s*$/, '') : rawAttributes;
  const pattern = new RegExp(`(\\s${escapeRegExp(attributeName)}=)([\"'])([\\s\\S]*?)(\\2)`, 'i');

  const updated = pattern.test(safeAttributes)
    ? safeAttributes.replace(pattern, (_match, prefix) => `${prefix}"${escapedValue}"`)
    : `${safeAttributes} ${attributeName}="${escapedValue}"`;

  return hasSelfClosingMarker ? `${updated} /` : updated;
}

function hydrateStaticDomTextFallback(html, bundle) {
  if (!bundle || typeof bundle !== 'object') return html;

  let output = String(html || '');

  output = output.replace(/<([a-z][\w:-]*)([^>]*\sdata-i18n-text=(["'])([\s\S]*?)\3[^>]*)>([^<]*)<\/\1>/gi, (full, tagName, attributes) => {
    const textPath = readDataAttribute(attributes, 'data-i18n-text');
    const value = valueAtPath(bundle, textPath);
    if (value === undefined || value === null) return full;
    return `<${tagName}${attributes}>${htmlTextEscape(value)}</${tagName}>`;
  });

  output = output.replace(/<([a-z][\w:-]*)([^>]*\sdata-i18n-aria=(["'])([\s\S]*?)\3[^>]*)>/gi, (full, tagName, attributes) => {
    const textPath = readDataAttribute(attributes, 'data-i18n-aria');
    const value = valueAtPath(bundle, textPath);
    if (value === undefined || value === null || String(value).trim() === '') return full;
    return `<${tagName}${upsertHtmlAttribute(attributes, 'aria-label', value)}>`;
  });

  output = output.replace(/<([a-z][\w:-]*)([^>]*\sdata-i18n-placeholder=(["'])([\s\S]*?)\3[^>]*)>/gi, (full, tagName, attributes) => {
    const textPath = readDataAttribute(attributes, 'data-i18n-placeholder');
    const value = valueAtPath(bundle, textPath);
    if (value === undefined || value === null) return full;
    return `<${tagName}${upsertHtmlAttribute(attributes, 'placeholder', value)}>`;
  });

  output = output.replace(/<([a-z][\w:-]*)([^>]*\sdata-i18n-content=(["'])([\s\S]*?)\3[^>]*)>/gi, (full, tagName, attributes) => {
    const textPath = readDataAttribute(attributes, 'data-i18n-content');
    const value = valueAtPath(bundle, textPath);
    if (value === undefined || value === null) return full;
    return `<${tagName}${upsertHtmlAttribute(attributes, 'content', value)}>`;
  });

  return output;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function readSpanishTextBundle() {
  try {
    return await readJson('textX/es.json');
  } catch {
    return {};
  }
}

function setMetaContent(html, attributeName, attributeValue, content) {
  const escapedAttributeName = escapeRegExp(attributeName);
  const escapedAttributeValue = escapeRegExp(attributeValue);
  const pattern = new RegExp(`<meta\\s+[^>]*${escapedAttributeName}=["']${escapedAttributeValue}["'][^>]*>`, 'i');
  const escapedContent = htmlAttributeEscape(content);

  return html.replace(pattern, (tag) => {
    if (/\scontent=["'][^"']*["']/i.test(tag)) {
      return tag.replace(/\scontent=["'][^"']*["']/i, ` content="${escapedContent}"`);
    }
    return tag.replace(/\s*\/?>$/, (ending) => ` content="${escapedContent}"${ending}`);
  });
}

function setCanonicalHref(html, href) {
  return html.replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i, (tag) => {
    if (/\shref=["'][^"']*["']/i.test(tag)) {
      return tag.replace(/\shref=["'][^"']*["']/i, ` href="${htmlAttributeEscape(href)}"`);
    }
    return tag.replace(/\s*\/?>$/, (ending) => ` href="${htmlAttributeEscape(href)}"${ending}`);
  });
}

function buildStaticAlternateLinks(languages) {
  const seen = new Set();
  const alternates = [
    { htmlLang: 'x-default', href: PUBLIC_SITE_URL },
    ...(Array.isArray(languages) ? languages : []).map((language) => ({
      htmlLang: language.htmlLang || language.code,
      href: buildPublicLanguageUrl(language.code)
    }))
  ].filter((alternate) => {
    const key = `${alternate.htmlLang}|${alternate.href}`;
    if (!alternate.htmlLang || !alternate.href || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return alternates
    .map((alternate) => `<link rel="alternate" hreflang="${htmlAttributeEscape(alternate.htmlLang)}" href="${htmlAttributeEscape(alternate.href)}" data-hashinmy-hreflang="static" />`)
    .join('\n  ');
}

function setHtmlLocale(html, bundle) {
  const iso = String(bundle?.iso || 'es').trim().toLowerCase() || 'es';
  const htmlLang = bundle?.htmlLang || iso;
  const dir = bundle?.dir === 'rtl' ? 'rtl' : 'ltr';
  const textScript = getLanguageTextScript(iso);

  return html.replace(/<html([^>]*)>/i, (full, attributes = '') => {
    let updated = upsertHtmlAttribute(attributes, 'lang', htmlLang);
    updated = upsertHtmlAttribute(updated, 'dir', dir);
    updated = upsertHtmlAttribute(updated, 'data-language', iso);
    updated = upsertHtmlAttribute(updated, 'data-text-script', textScript);
    return `<html${updated}>`;
  });
}

function escapeInlineJsonForScript(value) {
  return JSON.stringify(value || {})
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function shouldHydrateRuntimeTextBundle(relativePath = '') {
  const normalized = String(relativePath || 'index.html').replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized === 'index.html' || normalized === '404.html' || /^[^/]+\/index\.html$/u.test(normalized);
}

function hydrateStaticRuntimeTextBundle(html, bundle, activeCode = 'es', relativePath = '') {
  if (!shouldHydrateRuntimeTextBundle(relativePath) || !bundle || typeof bundle !== 'object') return html;
  const safeCode = htmlAttributeEscape(activeCode || bundle.iso || 'es');
  const payload = escapeInlineJsonForScript(bundle);
  const script = `<script type="application/json" id="hmInitialTextBundle" data-language="${safeCode}">${payload}</script>`;

  if (String(html || '').includes('id="hmInitialTextBundle"')) {
    return String(html || '').replace(/<script\s+type=["']application\/json["']\s+id=["']hmInitialTextBundle["'][\s\S]*?<\/script>/i, script);
  }

  if (String(html || '').includes('<script type="application/ld+json" id="hmStructuredData">')) {
    return String(html || '').replace('<script type="application/ld+json" id="hmStructuredData">', `${script}
  <script type="application/ld+json" id="hmStructuredData">`);
  }

  return String(html || '').replace('</head>', `  ${script}
</head>`);
}

function hydrateStaticInitialSceneFallback(html, bundle, languages, activeCode = 'es') {
  const intro = bundle?.scenes?.intro || {};
  const introOptions = Array.isArray(intro.options) ? intro.options : [];
  const progress = intro.progress || '';
  const languageOptions = (Array.isArray(languages) ? languages : []).map((language) => {
    const selected = language.code === activeCode ? ' selected' : '';
    const optionDir = language.dir === 'rtl' ? 'rtl' : 'ltr';
    const label = language.nativeName || language.name || language.code;
    const title = language.name && language.nativeName && language.name !== language.nativeName
      ? `${language.name} · ${language.nativeName}`
      : label;
    return `<option value="${htmlAttributeEscape(language.code)}" lang="${htmlAttributeEscape(language.htmlLang || language.code)}" dir="${optionDir}" title="${htmlAttributeEscape(title)}"${selected}>${htmlTextEscape(label)}</option>`;
  }).join('');
  const staticOptions = introOptions.map((option, index) => `
              <button class="hm-option" type="button" data-choice-index="${index}" data-priority="${htmlAttributeEscape(option.priority || '')}" aria-disabled="true" tabindex="-1" aria-label="${htmlAttributeEscape(`${option.label || ''}${option.hint ? `. ${option.hint}` : ''}`)}">
                <strong>${htmlTextEscape(option.label || '')}</strong>
                <span>${htmlTextEscape(option.hint || option.tech || '')}</span>
              </button>`).join('');

  let output = String(html || '');
  output = output.replace(/<span id="hmProgressText">[\s\S]*?<\/span>/i, `<span id="hmProgressText">${htmlTextEscape(progress)}</span>`);
  output = output.replace(/<select id="hmLanguageSelect"([^>]*)>[\s\S]*?<\/select>/i, `<select id="hmLanguageSelect"$1>${languageOptions}</select>`);
  output = output.replace(/<h1 class="hm-question hm-intro-title" id="hmQuestion"([^>]*)>[\s\S]*?<\/h1>/i, `<h1 class="hm-question hm-intro-title" id="hmQuestion"$1>${htmlTextEscape(intro.title || '')}</h1>`);
  output = output.replace(/<p class="hm-copy hm-copy--intro-signature" id="hmCopy">[\s\S]*?<\/p>/i, `<p class="hm-copy hm-copy--intro-signature" id="hmCopy">${htmlTextEscape(intro.copy || '')}</p>`);
  output = output.replace(/<p class="hm-option-question" id="hmOptionQuestion" hidden>[\s\S]*?<\/p>/i, `<p class="hm-option-question" id="hmOptionQuestion" hidden>${htmlTextEscape(intro.optionQuestion || '')}</p>`);
  output = output.replace(/<p class="hm-interaction-wait" id="hmInteractionWait" aria-live="polite">[\s\S]*?<\/p>/i, `<p class="hm-interaction-wait" id="hmInteractionWait" aria-live="polite">${htmlTextEscape(bundle?.ui?.preparingOptions || '')}</p>`);
  output = output.replace(/<div class="hm-options" id="hmOptions" role="list" hidden>[\s\S]*?<\/div>/i, `<div class="hm-options" id="hmOptions" role="list" hidden>${staticOptions}
          </div>`);
  return output;
}

function buildStaticEntryKeywords(seoBundle = null, textBundle = null) {
  const candidates = [
    ...(Array.isArray(seoBundle?.hubMetaKeywords) ? seoBundle.hubMetaKeywords : []),
    ...(Array.isArray(seoBundle?.categories) ? seoBundle.categories.map((category) => category?.label || category?.name || category?.id) : []),
    ...(Array.isArray(textBundle?.services) ? textBundle.services.map((service) => service?.label || service?.title || service?.tech) : [])
  ];
  const seen = new Set();
  return candidates
    .map((value) => String(value || '').trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 32)
    .join(', ');
}

function hydrateStaticSeoFallback(html, bundle, languages, activeCode = 'es', seoContent = null) {
  const meta = bundle?.meta || {};
  const title = meta.title || 'Hashinmy';
  const seoBundle = getStaticSeoEntryBundle(activeCode, seoContent);
  let output = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlTextEscape(title)}</title>`);

  output = setHtmlLocale(output, bundle);
  output = setMetaContent(output, 'name', 'description', meta.description || '');
  output = setMetaContent(output, 'property', 'og:title', meta.ogTitle || title);
  output = setMetaContent(output, 'property', 'og:description', meta.ogDescription || meta.description || '');
  output = setMetaContent(output, 'name', 'apple-mobile-web-app-title', meta.appleTitle || 'Hashinmy');
  output = setMetaContent(output, 'name', 'application-name', meta.applicationName || 'Hashinmy');
  output = setMetaContent(output, 'name', 'author', meta.author || 'Hashinmy');
  output = setMetaContent(output, 'name', 'keywords', buildStaticEntryKeywords(seoBundle, bundle));
  output = setCanonicalHref(output, buildPublicLanguageUrl(activeCode));
  output = output.replace(/\n?\s*<link\s+[^>]*data-hashinmy-hreflang=["']static["'][^>]*>\s*/gi, '\n');

  const alternateLinks = buildStaticAlternateLinks(languages);
  return alternateLinks ? output.replace(/<\/head>/i, `  ${alternateLinks}\n</head>`) : output;
}

function rewriteEntryResourcePaths(html, prefix = './') {
  if (prefix === './') return html;
  const safePrefix = String(prefix || './');
  return String(html || '')
    .replaceAll('href="./assets/', `href="${safePrefix}assets/`)
    .replaceAll('href="./css/', `href="${safePrefix}css/`)
    .replaceAll('src="./js/', `src="${safePrefix}js/`)
    .replaceAll('data-logo-src="./assets/', `data-logo-src="${safePrefix}assets/`);
}

function getStaticSeoEntryBundle(activeCode = 'es', seoContent = null) {
  const requestedCode = String(activeCode || 'es').trim().toLowerCase() || 'es';
  const localizedBundle = seoContent?.languages?.[requestedCode];
  if (localizedBundle && typeof localizedBundle === 'object') return localizedBundle;

  const fallbackCode = requestedCode === 'en' ? 'en' : 'es';
  return {
    code: fallbackCode,
    entryLabel: fallbackCode === 'en' ? 'Products' : 'Productos',
    hubUrl: fallbackCode === 'en' ? '/en/products/' : '/es/productos/',
    uiLabels: {
      productsLabel: fallbackCode === 'en' ? 'Products' : 'Productos',
      closeLabel: fallbackCode === 'en' ? 'Close' : 'Cerrar',
      categoryNavLabel: fallbackCode === 'en' ? 'Hashinmy product categories' : 'Categorías de productos Hashinmy',
      classicViewLabel: fallbackCode === 'en' ? 'Classic view' : 'Vista clásica',
      classicViewAriaLabel: fallbackCode === 'en' ? 'View products as a classic landing page' : 'Ver productos como landing page clásica',
      modernViewLabel: fallbackCode === 'en' ? 'Modern view' : 'Vista Moderna',
      modernViewAriaLabel: fallbackCode === 'en' ? 'Return to the modern product view' : 'Volver a la vista moderna de productos',
      scopeCatalogLabel: fallbackCode === 'en' ? 'Possible Hashinmy scope' : 'Alcance posible de Hashinmy',
      glossarySetLabel: fallbackCode === 'en' ? 'Plain Hashinmy glossary' : 'Glosario sencillo de Hashinmy'
    }
  };
}

function getSeoUiLabel(bundle, key = '', esValue = '', enValue = '') {
  const localized = bundle?.uiLabels?.[key];
  if (typeof localized === 'string' && localized.trim()) return localized.trim();
  if (bundle?.code === 'en') return enValue || esValue;
  if (bundle?.code === 'es') return esValue;
  return enValue || esValue;
}

function getStaticEntryPageUrl(activeCode = 'es', relativePath = '') {
  const normalizedPath = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedPath || normalizedPath === 'index.html') return PUBLIC_SITE_URL;
  if (normalizedPath === '404.html') return new URL('/404.html', PUBLIC_SITE_URL).toString();
  return buildPublicLanguageUrl(activeCode);
}

function buildStaticProofBrandsJsonLd(proofLogos = [], bundle = {}) {
  return {
    '@type': 'ItemList',
    '@id': `${PUBLIC_SITE_URL}#experience-logos`,
    name: valueAtPath(bundle, 'ui.proofBrandsTitle') || 'Hashinmy',
    description: valueAtPath(bundle, 'ui.proofBrandsStructuredDescription') || valueAtPath(bundle, 'meta.description') || 'Hashinmy',
    itemListElement: (Array.isArray(proofLogos) ? proofLogos : []).map((logo, index) => {
      const fileName = String(logo?.file || '').trim();
      const name = getProofLogoNameFromFile(fileName, logo?.name);
      const publicUrl = buildProofLogoPublicUrl(fileName);
      return {
        '@type': 'ListItem',
        position: index + 1,
        name,
        item: {
          '@id': `${PUBLIC_SITE_URL}#related-${getProofLogoSlug(name, index)}`,
          '@type': 'Organization',
          name,
          logo: publicUrl,
          image: publicUrl
        }
      };
    })
  };
}

function buildStaticEntryBreadcrumbJsonLd(pageUrl, seoBundle = {}, bundle = {}) {
  const isRootHome = normalizeSeoPath(new URL(pageUrl, PUBLIC_SITE_URL).pathname) === '/';
  const homeName = bundle?.iso === 'es' ? 'Inicio' : (bundle?.meta?.applicationName || 'Hashinmy');
  const itemListElement = [
    {
      '@type': 'ListItem',
      position: 1,
      name: homeName,
      item: PUBLIC_SITE_URL
    }
  ];

  if (!isRootHome) {
    itemListElement.push({
      '@type': 'ListItem',
      position: 2,
      name: bundle?.meta?.applicationName || 'Hashinmy',
      item: pageUrl
    });
  }

  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement
  };
}

function buildStaticEntryFaqJsonLd(pageUrl, bundle = {}) {
  const faqs = [
    [valueAtPath(bundle, 'ui.proofFaqWhyQuestion'), valueAtPath(bundle, 'ui.proofFaqWhyAnswer')],
    [valueAtPath(bundle, 'ui.proofFaqWhoQuestion'), valueAtPath(bundle, 'ui.proofFaqWhoAnswer')],
    [valueAtPath(bundle, 'ui.proofFaqStartQuestion'), valueAtPath(bundle, 'ui.proofFaqStartAnswer')]
  ].filter(([question, answer]) => question && answer);

  if (!faqs.length) return null;

  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: faqs.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer
      }
    }))
  };
}

function buildStaticEntryItemListJsonLd(pageUrl, seoBundle = {}) {
  const items = Array.isArray(seoBundle?.items) ? seoBundle.items : [];
  return {
    '@type': 'ItemList',
    '@id': `${pageUrl}#itemlist`,
    name: seoBundle?.hubTitle || seoBundle?.entryLabel || 'Hashinmy',
    description: seoBundle?.hubLead || seoBundle?.hubMetaDescription || undefined,
    itemListElement: items.slice(0, 24).map((item, index) => {
      const itemUrl = buildPublicSeoUrl(item?.url || seoBundle?.hubUrl || '/es/productos/');
      return {
        '@type': 'ListItem',
        position: index + 1,
        name: item?.title || item?.label || `Hashinmy ${index + 1}`,
        url: itemUrl,
        item: {
          '@type': getSeoPrimaryEntityType(item),
          '@id': getSeoPrimaryEntityId(item, itemUrl),
          name: item?.title || item?.label || `Hashinmy ${index + 1}`,
          description: item?.summary || item?.metaDescription || seoBundle?.hubMetaDescription || '',
          url: itemUrl
        }
      };
    })
  };
}


function findSeoItemById(seoBundle = {}, id = '') {
  return (Array.isArray(seoBundle?.items) ? seoBundle.items : []).find((item) => item?.id === id) || null;
}

function compactStaticStructuredText(value = '', maxLength = 320) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const max = Math.max(40, Number(maxLength) || 320);
  if (clean.length <= max) return clean;
  const firstSentence = clean.split(/(?<=[.!?¿?])\s+/u).find((sentence) => sentence.length <= max && sentence.length >= 42) || clean;
  const trimmed = firstSentence.slice(0, max).replace(/\s+\S*$/u, '').trim();
  return trimmed || firstSentence.slice(0, max).trim();
}

function normalizeStaticStructuredSignature(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9α-ωа-я一-龥가-힣ぁ-んァ-ン]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStaticStructuredList(values = [], limit = 24) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => compactStaticStructuredText(value, 150))
    .filter((value) => {
      const key = normalizeStaticStructuredSignature(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Number(limit) || 24));
}

function getStaticBrandStructuredDescription(seoBundle = {}, bundle = {}) {
  const meta = bundle?.meta || {};
  return compactStaticStructuredText(
    meta.description || meta.ogDescription || seoBundle?.hubLead || seoBundle?.hubMetaDescription || 'Hashinmy',
    520
  );
}

function getStaticBrandStructuredSlogan(seoBundle = {}, bundle = {}) {
  const meta = bundle?.meta || {};
  return compactStaticStructuredText(
    meta.ogTitle || meta.title || seoBundle?.hubTitle || getStaticBrandStructuredDescription(seoBundle, bundle),
    180
  );
}

function buildStaticBrandKnowsAbout(seoBundle = {}, bundle = {}) {
  const services = Array.isArray(bundle?.services) ? bundle.services : [];
  const mappedItems = STATIC_BRAND_HOME_SCHEMA_SERVICE_MAP.map(([itemId]) => findSeoItemById(seoBundle, itemId)).filter(Boolean);
  const keywords = Array.isArray(bundle?.meta?.keywords)
    ? bundle.meta.keywords
    : String(bundle?.meta?.keywords || '').split(',').map((entry) => entry.trim()).filter(Boolean);

  return uniqueStaticStructuredList([
    seoBundle?.hubTitle,
    seoBundle?.hubLead,
    valueAtPath(bundle, 'valueLabels.financiamiento_100'),
    valueAtPath(bundle, 'valueLabels.modernizacion_operativa'),
    valueAtPath(bundle, 'valueLabels.automatizacion_ia'),
    valueAtPath(bundle, 'valueLabels.software_online'),
    ...services.map((service) => service?.label),
    ...mappedItems.flatMap((item) => [
      item?.title,
      item?.eyebrow,
      item?.summary,
      ...(Array.isArray(item?.keywords) ? item.keywords : []),
      ...(Array.isArray(item?.terms) ? item.terms.map((entry) => entry?.term) : [])
    ]),
    ...keywords
  ], 26);
}

function buildStaticBrandOfferCatalogJsonLd(seoBundle = {}, bundle = {}) {
  const fallbackServices = Array.isArray(bundle?.services) ? bundle.services : [];
  const offers = STATIC_BRAND_HOME_SCHEMA_SERVICE_MAP.map(([itemId, schemaId], index) => {
    const item = findSeoItemById(seoBundle, itemId);
    const fallback = fallbackServices[index] || {};
    const name = item?.title || fallback.label || `Hashinmy ${index + 1}`;
    const description = item?.metaDescription || item?.summary || item?.simple || fallback.tech || name;
    return {
      '@type': 'Offer',
      position: index + 1,
      itemOffered: {
        '@type': 'Service',
        '@id': `${PUBLIC_SITE_URL}#${schemaId}`,
        name,
        serviceType: item?.eyebrow || item?.category || fallback.tech || name,
        description,
        provider: { '@id': `${PUBLIC_SITE_URL}#organization` },
        areaServed: 'Global'
      }
    };
  });

  return {
    '@type': 'OfferCatalog',
    '@id': `${PUBLIC_SITE_URL}#offer-catalog`,
    name: seoBundle?.hubTitle || seoBundle?.entryLabel || bundle?.meta?.applicationName || 'Hashinmy',
    description: seoBundle?.hubLead || getStaticBrandStructuredDescription(seoBundle, bundle),
    itemListElement: offers
  };
}

function buildStaticEntryOfferCatalogJsonLd(seoBundle = {}, bundle = {}) {
  return buildStaticBrandOfferCatalogJsonLd(seoBundle, bundle);
}


function buildStaticEntryJsonLd({ pageUrl, bundle = {}, languages = [], activeCode = 'es', proofLogos = [], seoContent = null, noindex = false }) {
  const meta = bundle?.meta || {};
  const seoBundle = getStaticSeoEntryBundle(activeCode, seoContent);
  const htmlLang = bundle?.htmlLang || bundle?.iso || activeCode || 'es';
  const title = noindex ? `404 | ${meta.applicationName || 'Hashinmy'}` : (meta.title || 'Hashinmy');
  const description = meta.description || meta.ogDescription || seoBundle?.hubMetaDescription || '';
  const languageList = (Array.isArray(languages) && languages.length ? languages : [bundle])
    .map((language) => language?.htmlLang || language?.code || language?.iso)
    .filter(Boolean);
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${PUBLIC_SITE_URL}#organization`,
      name: 'Hashinmy',
      url: PUBLIC_SITE_URL,
      logo: `${PUBLIC_SITE_URL}assets/hashinmy-logo-emblem.png`,
      description: getStaticBrandStructuredDescription(seoBundle, bundle),
      slogan: getStaticBrandStructuredSlogan(seoBundle, bundle),
      areaServed: 'Global',
      knowsAbout: buildStaticBrandKnowsAbout(seoBundle, bundle),
      sameAs: []
    },
    {
      '@type': 'WebSite',
      '@id': `${PUBLIC_SITE_URL}#website`,
      name: meta.applicationName || 'Hashinmy',
      url: PUBLIC_SITE_URL,
      publisher: { '@id': `${PUBLIC_SITE_URL}#organization` },
      inLanguage: languageList
    },
    {
      '@type': noindex ? 'WebPage' : 'CollectionPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: title,
      description,
      isPartOf: { '@id': `${PUBLIC_SITE_URL}#website` },
      publisher: { '@id': `${PUBLIC_SITE_URL}#organization` },
      inLanguage: htmlLang,
      breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
      mainEntity: noindex ? { '@id': `${PUBLIC_SITE_URL}#organization` } : { '@id': `${pageUrl}#itemlist` },
      mentions: (Array.isArray(proofLogos) ? proofLogos : []).map((logo, index) => ({ '@id': `${PUBLIC_SITE_URL}#related-${getProofLogoSlug(logo?.name || logo?.file, index)}` }))
    },
    buildStaticEntryBreadcrumbJsonLd(pageUrl, seoBundle, bundle),
    buildStaticProofBrandsJsonLd(proofLogos, bundle)
  ];

  const faq = buildStaticEntryFaqJsonLd(pageUrl, bundle);
  if (faq) graph.push(faq);
  if (!noindex) {
    graph.push(buildStaticEntryOfferCatalogJsonLd(seoBundle, bundle));
    graph.push(buildStaticEntryItemListJsonLd(pageUrl, seoBundle));
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

function hydrateStaticEntryStructuredData(html, bundle, languages, activeCode = 'es', resourcePrefix = './', proofLogos = [], seoContent = null, relativePath = '') {
  const pageUrl = getStaticEntryPageUrl(activeCode, relativePath);
  const noindex = String(relativePath || '').replace(/\\/g, '/').endsWith('404.html');
  return setJsonLd(html, buildStaticEntryJsonLd({ pageUrl, bundle, languages, activeCode, proofLogos, seoContent, noindex }));
}

function hydrateStaticHtmlFallback(html, bundle, languages, activeCode = 'es', resourcePrefix = './', proofLogos = [], seoContent = null, relativePath = '') {
  const localizedHtml = hydrateStaticProofLogosFallback(
    rewriteEntryResourcePaths(
      hydrateStaticSeoChromeFallback(
        hydrateStaticSeoEntryButton(
          hydrateStaticInitialSceneFallback(
            hydrateStaticDomTextFallback(hydrateStaticSeoFallback(html, bundle, languages, activeCode, seoContent), bundle),
            bundle,
            languages,
            activeCode
          ),
          getStaticSeoEntryBundle(activeCode, seoContent)
        ),
        getStaticSeoEntryBundle(activeCode, seoContent)
      ),
      resourcePrefix
    ),
    proofLogos,
    resourcePrefix,
    bundle
  );

  return hydrateStaticRuntimeTextBundle(
    hydrateStaticEntryStructuredData(localizedHtml, bundle, languages, activeCode, resourcePrefix, proofLogos, seoContent, relativePath),
    bundle,
    activeCode,
    relativePath
  );
}

async function hydrateStaticHtmlFile(relativePath, bundle, languages, activeCode = 'es', resourcePrefix = './', seoContent = null) {
  const filePath = path.join(dist, relativePath);
  if (!(await exists(filePath))) return;
  const html = await readFile(filePath, 'utf8');
  const proofLogos = await readProofClientLogosManifestFromRoot();
  await writeFile(filePath, hydrateStaticHtmlFallback(html, bundle, languages, activeCode, resourcePrefix, proofLogos, seoContent, relativePath), 'utf8');
}

async function markStatic404Noindex(relativePath = '404.html', bundle = null, languages = [], seoContent = null) {
  const filePath = path.join(dist, relativePath);
  if (!(await exists(filePath))) return;

  const activeCode = String(bundle?.iso || bundle?.code || 'es').trim().toLowerCase() || 'es';
  const meta = bundle?.meta || {};
  const pageTitle = `404 | ${meta.applicationName || 'Hashinmy'}`;
  const pageDescription = meta.description || meta.ogDescription || 'Hashinmy';
  const seoBundle = getStaticSeoEntryBundle(activeCode, seoContent);
  const proofLogos = await readProofClientLogosManifestFromRoot();
  let html = await readFile(filePath, 'utf8');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlTextEscape(pageTitle)}</title>`);
  html = setCanonicalHref(html, new URL('/404.html', PUBLIC_SITE_URL).toString());
  html = setMetaContent(html, 'name', 'robots', 'noindex, nofollow, noarchive');
  html = setMetaContent(html, 'name', 'description', pageDescription);
  html = setMetaContent(html, 'property', 'og:title', pageTitle);
  html = setMetaContent(html, 'property', 'og:description', meta.ogDescription || pageDescription);
  html = setMetaContent(html, 'name', 'twitter:title', pageTitle);
  html = setMetaContent(html, 'name', 'twitter:description', meta.ogDescription || pageDescription);
  html = setMetaContent(html, 'name', 'keywords', buildStaticEntryKeywords(seoBundle, bundle));
  html = hydrateStaticEntryStructuredData(html, bundle, languages, activeCode, '/', proofLogos, seoContent, relativePath);
  await writeFile(filePath, html, 'utf8');
}

function getLocalizedEntryPath(code = 'es') {
  const language = String(code || 'es').trim().toLowerCase() || 'es';
  return `${language}/index.html`;
}

async function writeLocalizedEntryPage(language, languages, seoContent = null) {
  const code = String(language?.code || '').trim().toLowerCase();
  if (!code) return;
  const bundle = await readJson(`textX/${code}.json`);
  const relativePath = getLocalizedEntryPath(code);
  const filePath = path.join(dist, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await cp(path.join(root, 'index.html'), filePath, { force: true });
  await hydrateStaticHtmlFile(relativePath, bundle, languages, code, '../', seoContent);
}

function buildPublicLanguageUrl(code = 'es') {
  const language = String(code || 'es').trim().toLowerCase() || 'es';
  const url = new URL(PUBLIC_SITE_URL);
  url.pathname = `/${encodeURIComponent(language)}/`;
  return url.toString();
}



function markdownEscape(value = '') {
  return String(value || '').replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function compactLlmsLine(value = '', maxLength = 260) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const max = Math.max(80, Number(maxLength) || 260);
  if (clean.length <= max) return clean;
  const boundary = clean.slice(0, max).replace(/\s+\S*$/u, '').trim();
  return boundary || clean.slice(0, max).trim();
}

function buildLlmsLanguageDiscoveryLines(catalog = [], languages = {}) {
  return (Array.isArray(catalog) ? catalog : [])
    .map((language) => {
      const code = String(language?.code || '').trim().toLowerCase();
      const bundle = languages?.[code];
      if (!code || !bundle) return '';
      const nativeName = language?.nativeName || language?.name || code;
      const hubTitle = compactLlmsLine(bundle.hubTitle || bundle.entryLabel || 'Hashinmy');
      const hubLead = compactLlmsLine(bundle.hubLead || bundle.hubMetaDescription || '', 320);
      const homeUrl = buildPublicLanguageUrl(code);
      const hubUrl = buildPublicSeoUrl(bundle.hubUrl || `/${code}/productos/`);
      return `- ${markdownEscape(nativeName)} (${code}): ${homeUrl} · ${hubUrl} · ${markdownEscape(hubTitle)}${hubLead ? ` — ${markdownEscape(hubLead)}` : ''}`;
    })
    .filter(Boolean);
}

function getLlmsSeoUiLabel(bundle = {}, key = '', fallback = '') {
  const value = bundle?.uiLabels?.[key] || bundle?.[key] || fallback;
  return compactLlmsLine(value || fallback || 'Hashinmy', 220);
}

function buildLlmsLocalizedSignalsLine(bundle = {}) {
  const simpleLabel = getLlmsSeoUiLabel(bundle, 'simpleLabel', bundle?.categories?.[0]?.label || bundle?.hubTitle || 'Hashinmy');
  const technicalLabel = getLlmsSeoUiLabel(bundle, 'technicalLabel', bundle?.uiLabels?.detailTitle || bundle?.hubTitle || 'Hashinmy');
  const faqLabel = getLlmsSeoUiLabel(bundle, 'faqLabel', bundle?.categories?.find((category) => category?.id === 'faq')?.label || bundle?.hubTitle || 'Hashinmy');
  const glossaryLabel = getLlmsSeoUiLabel(bundle, 'glossaryLabel', bundle?.categories?.find((category) => category?.id === 'glossary')?.label || bundle?.hubTitle || 'Hashinmy');
  const guideLabel = getLlmsSeoUiLabel(bundle, 'guideLabel', bundle?.hubTitle || 'Hashinmy');
  return `${markdownEscape(simpleLabel)}. ${markdownEscape(technicalLabel)}. ${markdownEscape(faqLabel)}: FAQPage. ${markdownEscape(glossaryLabel)}: DefinedTermSet. ${markdownEscape(guideLabel)}: TechArticle. Service. BreadcrumbList. OfferCatalog.`;
}

function buildLlmsLocalizedOverviewLine(bundle = {}) {
  return compactLlmsLine(
    bundle?.hubLead
    || bundle?.hubMetaDescription
    || bundle?.metaDescription
    || bundle?.hubTitle
    || 'Hashinmy',
    420
  );
}

async function buildLlmsTxtFromSeoContent(seoContent) {
  const languages = seoContent?.languages || {};
  const catalog = await readLanguageCatalog();
  const languageLabels = Object.fromEntries(catalog.map((language) => [language.code, language.nativeName || language.name || language.code]));
  const orderedCodes = [
    ...catalog.map((language) => language.code),
    ...Object.keys(languages)
  ];
  const seenCodes = new Set();
  const lines = ['# Hashinmy'];

  for (const code of orderedCodes.map((entry) => String(entry || '').trim().toLowerCase()).filter((entry) => entry && !seenCodes.has(entry) && seenCodes.add(entry))) {
    const bundle = languages[code];
    if (!bundle || !Array.isArray(bundle.categories) || !Array.isArray(bundle.items)) continue;

    const nativeLabel = languageLabels[code] || bundle?.nativeName || bundle?.htmlLang || code;
    const homeUrl = buildPublicLanguageUrl(code);
    const hubUrl = buildPublicSeoUrl(bundle.hubUrl || `/${code}/productos/`);
    const homeLabel = getLlmsHomeLabel(code);
    const hubLabel = compactLlmsLine(getLlmsHubLabel(bundle), 96);
    const overviewLine = buildLlmsLocalizedOverviewLine(bundle);
    const detailTitle = getLlmsSeoUiLabel(bundle, 'detailTitle', bundle.hubTitle || hubLabel);
    const detailLead = getLlmsSeoUiLabel(bundle, 'detailLead', bundle.hubLead || bundle.hubMetaDescription || bundle.hubTitle || hubLabel);
    const scopeTitle = getLlmsSeoUiLabel(bundle, 'scopeCatalogLabel', bundle.hubTitle || hubLabel);

    lines.push(
      '',
      `## ${markdownEscape(nativeLabel)} (${code})`,
      '',
      `> ${markdownEscape(overviewLine)}`,
      '',
      `- ${markdownEscape(homeLabel)}: ${homeUrl}`,
      `- ${markdownEscape(hubLabel)}: ${hubUrl}`,
      `- ${markdownEscape(bundle.hubTitle || hubLabel)}: ${markdownEscape(compactLlmsLine(bundle.hubLead || bundle.hubMetaDescription || overviewLine, 360))}`,
      '',
      `### ${markdownEscape(detailTitle)}`,
      markdownEscape(detailLead),
      buildLlmsLocalizedSignalsLine(bundle),
      '',
      `### ${markdownEscape(scopeTitle)}`
    );

    for (const category of bundle.categories) {
      const items = bundle.items.filter((item) => item.category === category.id);
      if (!items.length) continue;
      lines.push('', `#### ${markdownEscape(category.label || category.id)}`);
      if (category.description) lines.push(markdownEscape(category.description));
      for (const item of items) {
        const url = buildPublicSeoUrl(item.url);
        const summary = String(item.summary || item.metaDescription || '').replace(/\s+/g, ' ').trim();
        lines.push(`- [${markdownEscape(item.title || item.id)}](${url}): ${markdownEscape(summary)}`);
      }
    }

    lines.push(
      '',
      `- Sitemap: ${new URL('/sitemap.xml', PUBLIC_SITE_URL).toString()}`,
      `- Robots: ${new URL('/robots.txt', PUBLIC_SITE_URL).toString()}`,
      `- ${PUBLIC_SITE_HOST}`,
      '- Hashinmy'
    );
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

async function writeLlmsTxt(seoContent) {
  if (!seoContent) return;
  await writeFile(path.join(dist, 'llms.txt'), await buildLlmsTxtFromSeoContent(seoContent), 'utf8');
}

function isValidSeoBundle(bundle) {
  return bundle
    && typeof bundle === 'object'
    && Array.isArray(bundle.categories)
    && Array.isArray(bundle.items)
    && bundle.items.every((item) => item && item.id && item.url && item.title && item.summary);
}

function flattenSeoBundlePaths(source, prefix = '') {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source)) {
    return source.flatMap((item, index) => flattenSeoBundlePaths(item, prefix ? `${prefix}.${index}` : String(index)));
  }

  return Object.entries(source).flatMap(([key, value]) => {
    const pathName = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object'
      ? flattenSeoBundlePaths(value, pathName)
      : [pathName];
  });
}

function seoBundleIds(bundle = {}, collection = 'items') {
  return (Array.isArray(bundle?.[collection]) ? bundle[collection] : [])
    .map((entry) => String(entry?.id || '').trim())
    .filter(Boolean);
}

function assertCompleteSeoBundle(code, bundle, spanishBundle) {
  const normalized = String(code || '').trim().toLowerCase();
  if (!isValidSeoBundle(bundle)) {
    throw new Error(`textX/seo/${normalized}.json no tiene categorías, fichas SEO o campos mínimos válidos.`);
  }

  const missingLabels = REQUIRED_SEO_UI_LABEL_KEYS.filter((key) => !String(bundle?.uiLabels?.[key] || '').trim());
  if (missingLabels.length) {
    throw new Error(`textX/seo/${normalized}.json no traduce todos los rótulos uiLabels: ${missingLabels.slice(0, 8).join(', ')}`);
  }

  if (!spanishBundle || normalized === 'es') return true;

  const spanishPaths = new Set(flattenSeoBundlePaths(spanishBundle));
  const bundlePaths = new Set(flattenSeoBundlePaths(bundle));
  const missingPaths = [...spanishPaths].filter((pathName) => !bundlePaths.has(pathName));
  const extraPaths = [...bundlePaths].filter((pathName) => !spanishPaths.has(pathName));
  if (missingPaths.length || extraPaths.length) {
    throw new Error(`textX/seo/${normalized}.json no mantiene paridad completa con textX/seo/es.json: ${[
      missingPaths.length ? `faltan ${missingPaths.slice(0, 8).join(', ')}` : '',
      extraPaths.length ? `sobran ${extraPaths.slice(0, 8).join(', ')}` : ''
    ].filter(Boolean).join(' | ')}`);
  }

  const spanishCategoryIds = seoBundleIds(spanishBundle, 'categories');
  const bundleCategoryIds = seoBundleIds(bundle, 'categories');
  const spanishItemIds = seoBundleIds(spanishBundle, 'items');
  const bundleItemIds = seoBundleIds(bundle, 'items');
  const sameCategories = spanishCategoryIds.length === bundleCategoryIds.length
    && spanishCategoryIds.every((id, index) => id === bundleCategoryIds[index]);
  const sameItems = spanishItemIds.length === bundleItemIds.length
    && spanishItemIds.every((id, index) => id === bundleItemIds[index]);

  if (!sameCategories || !sameItems) {
    throw new Error(`textX/seo/${normalized}.json debe traducir las mismas categorías y fichas canónicas de textX/seo/es.json, en el mismo orden.`);
  }

  return true;
}

function assertCompleteSeoContent(seoContent, languageCatalog = []) {
  const languages = seoContent?.languages || {};
  const expectedCodes = (Array.isArray(languageCatalog) ? languageCatalog : [])
    .map((language) => String(language?.code || '').trim().toLowerCase())
    .filter(Boolean);
  const spanishBundle = languages.es;

  if (!expectedCodes.length) {
    throw new Error('No se detectaron idiomas compartidos entre textX y textX/seo.');
  }

  if (!isValidSeoBundle(spanishBundle)) {
    throw new Error('textX/seo/es.json debe existir y funcionar como catálogo SEO canónico.');
  }

  const missingCodes = expectedCodes.filter((code) => !languages[code]);
  if (missingCodes.length) {
    throw new Error(`textX/seo debe incluir un bundle por cada idioma detectado; faltan: ${missingCodes.slice(0, 12).join(', ')}.`);
  }

  for (const code of expectedCodes) {
    assertCompleteSeoBundle(code, languages[code], spanishBundle);
  }

  return seoContent;
}

async function readSeoContent() {
  try {
    const languageCatalog = await readLanguageCatalog();
    const expectedCodes = new Set(languageCatalog.map((language) => language.code));
    const seoRoot = path.join(root, 'textX', 'seo');
    const entries = await readdir(seoRoot, { withFileTypes: true });
    const languages = {};

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const code = path.basename(entry.name, '.json').trim().toLowerCase();
      if (!code || !expectedCodes.has(code)) continue;
      const bundle = JSON.parse(await readFile(path.join(seoRoot, entry.name), 'utf8'));
      if (bundle && typeof bundle === 'object') languages[bundle.code || code] = { ...bundle, code: bundle.code || code };
    }

    if (!Object.keys(languages).length) return null;

    const seoContent = { schemaVersion: 1, siteUrl: PUBLIC_SITE_URL, updatedAt: SITEMAP_LASTMOD, languages };
    return assertCompleteSeoContent(seoContent, languageCatalog);
  } catch (error) {
    throw new Error(`No se pudo construir contenido SEO multilingüe completo: ${error.message || error}`);
  }
}

function normalizeSeoPath(pathname = '/') {
  let normalized = `/${String(pathname || '/').split('?')[0].split('#')[0].replace(/^\/+/, '')}`;
  normalized = normalized.replace(/\/index\.html$/i, '/');
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function buildPublicSeoUrl(pathname = '/') {
  const url = new URL(PUBLIC_SITE_URL);
  url.pathname = normalizeSeoPath(pathname);
  return url.toString();
}

function buildSeoModernEntryHref(pathname = '/') {
  return `/?seo=${encodeURIComponent(normalizeSeoPath(pathname))}`;
}

function getSeoClassicAnchorId(id = '') {
  const raw = String(id || '').trim();
  let normalized = raw;
  try {
    normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {}
  const slug = normalized.replace(/[^a-z0-9_-]+/giu, '-').replace(/^-+|-+$/g, '').slice(0, 72);
  return `hmSeoClassicCategory-${slug || 'grupo'}`;
}

function seoDistEntryPath(pathname = '/') {
  const normalized = normalizeSeoPath(pathname).replace(/^\//, '').replace(/\/$/, '');
  return normalized ? `${normalized}/index.html` : 'index.html';
}

function getSeoBundles(seoContent, languageCatalog = []) {
  const languages = seoContent?.languages || {};
  const orderedCodes = [
    ...(Array.isArray(languageCatalog) ? languageCatalog.map((language) => language.code) : []),
    'es',
    'en',
    ...Object.keys(languages)
  ];
  const seen = new Set();
  return orderedCodes
    .map((code) => String(code || '').trim().toLowerCase())
    .filter((code) => code && !seen.has(code) && seen.add(code))
    .map((code) => languages[code])
    .filter((bundle) => bundle && Array.isArray(bundle.items));
}

function buildSeoBundleKeywords(bundle) {
  const values = [
    ...(Array.isArray(bundle?.hubMetaKeywords) ? bundle.hubMetaKeywords : []),
    bundle?.hubTitle,
    ...(Array.isArray(bundle?.categories) ? bundle.categories.flatMap((category) => [category.label, category.description]) : []),
    ...(Array.isArray(bundle?.items) ? bundle.items.map((item) => item.title) : []),
    ...(Array.isArray(bundle?.items) ? bundle.items.flatMap((item) => [
      item.eyebrow,
      item.category,
      ...(Array.isArray(item.keywords) ? item.keywords : []),
      ...(Array.isArray(item.terms) ? item.terms.map((entry) => entry?.term) : [])
    ]) : [])
  ];
  const seen = new Set();
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      const key = normalizeSeoVisibleSignature(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 96);
}

function getSeoBundle(seoContent, code = 'es') {
  const languages = seoContent?.languages || {};
  return languages[code] || languages.es || null;
}

function findSeoItem(seoContent, code, id) {
  const bundle = getSeoBundle(seoContent, code);
  return (bundle?.items || []).find((item) => item.id === id) || null;
}

function buildSeoAlternateLinks(entries = []) {
  return entries
    .filter((entry) => entry?.href && entry?.hreflang)
    .map((entry) => `<link rel="alternate" hreflang="${htmlAttributeEscape(entry.hreflang)}" href="${htmlAttributeEscape(entry.href)}" data-hashinmy-hreflang="static" />`)
    .join('\n  ');
}

function getSeoItemFaqs(item, limit = 4) {
  if (!item || !Array.isArray(item.faqs)) return [];
  return item.faqs
    .filter((entry) => entry?.question && entry?.answer)
    .slice(0, limit);
}

function getSeoItemSections(item, limit = 4) {
  if (!item || !Array.isArray(item.sections)) return [];
  return item.sections
    .filter((entry) => entry?.heading && entry?.body)
    .slice(0, limit);
}

function normalizeSeoVisibleSignature(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  let normalized = raw;
  try {
    normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {}
  return normalized
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N}¿?¡!]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSeoVisibleSentences(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function getSeoVisibleTokens(signature = '') {
  return new Set(String(signature || '').split(' ').filter((token) => token.length > 3));
}

function getSeoVisibleSimilarity(left = '', right = '') {
  const leftTokens = getSeoVisibleTokens(left);
  const rightTokens = getSeoVisibleTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1;
  });
  return intersection / Math.min(leftTokens.size, rightTokens.size);
}

function createSeoVisibleUniquenessGuard(seedValues = []) {
  const signatures = [];
  const addSignature = (value) => {
    const signature = normalizeSeoVisibleSignature(value);
    if (signature && !signatures.includes(signature)) signatures.push(signature);
    return signature;
  };

  seedValues.forEach(addSignature);

  return {
    add: addSignature,
    isRepeated(value = '') {
      const signature = normalizeSeoVisibleSignature(value);
      if (!signature) return true;
      return signatures.some((seen) => (
        signature === seen
        || (signature.length > 28 && seen.length > 28 && (signature.includes(seen) || seen.includes(signature)))
        || getSeoVisibleSimilarity(signature, seen) >= 0.82
      ));
    }
  };
}

function pruneSeoVisibleText(value = '', guard) {
  if (!guard) return String(value || '').trim();
  const uniqueSentences = splitSeoVisibleSentences(value).filter((sentence) => {
    if (guard.isRepeated(sentence)) return false;
    guard.add(sentence);
    return true;
  });
  return uniqueSentences.join(' ').trim();
}

function compactSeoVisibleText(value = '', maxLength = 160) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const max = Math.max(32, Number(maxLength) || 160);
  if (clean.length <= max) return clean;

  const sentences = splitSeoVisibleSentences(clean);
  const completeSentence = sentences.find((entry) => entry.length <= max && entry.length >= Math.min(48, max));
  if (completeSentence) return completeSentence;

  const firstSentence = sentences[0] || clean;
  if (firstSentence.length <= max) return firstSentence;

  const trimmed = firstSentence.slice(0, max).replace(/\s+\S*$/u, '').trim();
  return trimmed || firstSentence.slice(0, max).trim();
}

function uniqueSeoVisibleEntries(entries = [], getKey = (entry) => entry) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const key = normalizeSeoVisibleSignature(getKey(entry));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createSeoVisibleContentModel(item) {
  const limits = SEO_FINAL_VISIBLE_LIMITS;
  const quick = {
    simple: compactSeoVisibleText(item?.simple, limits.quick),
    who: compactSeoVisibleText(item?.who, limits.quick),
    technical: compactSeoVisibleText(item?.technical, limits.quick)
  };
  const includes = uniqueSeoVisibleEntries(item?.includes || [])
    .slice(0, limits.includes)
    .map((entry) => compactSeoVisibleText(entry, limits.include));
  const terms = uniqueSeoVisibleEntries(item?.terms || [], (entry) => `${entry?.term || ''} ${entry?.meaning || ''}`)
    .slice(0, limits.terms)
    .filter((entry) => entry?.term && entry?.meaning)
    .map((entry) => ({
      term: compactSeoVisibleText(entry.term, limits.term),
      meaning: compactSeoVisibleText(entry.meaning, limits.term)
    }));
  const seedValues = [
    item?.summary,
    item?.simple,
    item?.who,
    item?.technical,
    ...includes,
    ...terms.flatMap((entry) => [entry.term, entry.meaning, `${entry.term}: ${entry.meaning}`])
  ];
  const guard = createSeoVisibleUniquenessGuard(seedValues);
  const sections = getSeoItemSections(item, limits.sections)
    .map((section) => ({
      heading: compactSeoVisibleText(section.heading, limits.sectionHeading),
      body: compactSeoVisibleText(pruneSeoVisibleText(section.body, guard), limits.sectionBody)
    }))
    .filter((section) => section.heading && section.body)
    .slice(0, limits.sections);
  const faqs = getSeoItemFaqs(item, limits.faqs)
    .map((entry) => ({
      question: compactSeoVisibleText(entry.question, limits.faqQuestion),
      answer: compactSeoVisibleText(pruneSeoVisibleText(entry.answer, guard), limits.faqAnswer)
    }))
    .filter((entry) => entry.question && entry.answer)
    .slice(0, limits.faqs);

  return { quick, includes, terms, sections, faqs };
}

function buildStaticModernViewHref(pagePath = '/') {
  const normalizedPath = normalizeSeoPath(pagePath || '/');
  return `/?${SEO_MODERN_ROUTE_QUERY}=${encodeURIComponent(normalizedPath)}`;
}

function hydrateStaticSeoEntryButton(html, seoBundle, { classicPage = false, pagePath = '' } = {}) {
  const label = seoBundle?.entryLabel || getSeoUiLabel(seoBundle, 'productsLabel', 'Productos', 'Products');
  const href = normalizeSeoPath(seoBundle?.hubUrl || (seoBundle?.code === 'en' ? '/en/products/' : '/es/productos/'));
  const classicLabel = classicPage
    ? getSeoUiLabel(seoBundle, 'modernViewLabel', 'Vista Moderna', 'Modern view')
    : getSeoUiLabel(seoBundle, 'classicViewLabel', 'Vista clásica', 'Classic view');
  const classicAriaLabel = classicPage
    ? getSeoUiLabel(seoBundle, 'modernViewAriaLabel', 'Volver a la vista moderna de productos', 'Return to the modern product view')
    : getSeoUiLabel(seoBundle, 'classicViewAriaLabel', 'Ver productos como landing page clásica', 'View products as a classic landing page');
  const classicHref = classicPage ? buildStaticModernViewHref(pagePath || href) : href;
  let output = String(html || '').replace(/<a([^>]*id=["']hmSeoHubButton["'][^>]*)>[\s\S]*?<\/a>/i, (_full, attributes) => {
    let updated = upsertHtmlAttribute(attributes, 'aria-label', label);
    updated = upsertHtmlAttribute(updated, 'aria-expanded', 'false');
    updated = upsertHtmlAttribute(updated, 'href', href);
    return `<a${updated}>${htmlTextEscape(label)}</a>`;
  });
  output = output.replace(/<a([^>]*id=["']hmSeoClassicLink["'][^>]*)>[\s\S]*?<\/a>/i, (_full, attributes) => {
    let updated = upsertHtmlAttribute(attributes, 'aria-label', classicAriaLabel);
    updated = upsertHtmlAttribute(updated, 'href', classicHref);
    updated = upsertHtmlAttribute(updated, 'aria-pressed', classicPage ? 'true' : 'false');
    updated = upsertHtmlAttribute(updated, 'data-seo-i18n-text', classicPage ? 'uiLabels.modernViewLabel' : 'uiLabels.classicViewLabel');
    updated = upsertHtmlAttribute(updated, 'data-seo-i18n-aria', classicPage ? 'uiLabels.modernViewAriaLabel' : 'uiLabels.classicViewAriaLabel');
    if (!classicPage) updated = upsertHtmlAttribute(updated, 'data-action', 'seo-classic-toggle');
    else updated = removeHtmlAttribute(updated, 'data-action');
    return `<a${updated}>${htmlTextEscape(classicLabel)}</a>`;
  });
  return output;
}


function hydrateStaticSeoChromeFallback(html, seoBundle) {
  const closeLabel = seoBundle?.closeLabel || getSeoUiLabel(seoBundle, 'closeLabel', 'Cerrar', 'Close');
  const categoryNavLabel = getSeoUiLabel(seoBundle, 'categoryNavLabel', 'Categorías de productos Hashinmy', 'Hashinmy product categories');
  let output = String(html || '').replace(/<button([^>]*id=["']hmSeoHubClose["'][^>]*)>/i, (_full, attributes) => {
    return `<button${upsertHtmlAttribute(attributes, 'aria-label', closeLabel)}>`;
  });
  output = output.replace(/<nav([^>]*id=["']hmSeoHubCategories["'][^>]*)>/i, (_full, attributes) => {
    return `<nav${upsertHtmlAttribute(attributes, 'aria-label', categoryNavLabel)}>`;
  });
  return output;
}

function demoteImmersiveIntroHeadingForSeoPage(html) {
  return String(html || '').replace(/<h1([^>]*)>([\s\S]*?)<\/h1>/gi, (full, attributes = '', content = '') => {
    const hasQuestionId = /\sid=["']hmQuestion["']/i.test(attributes);
    const hasIntroQuestionClass = /\sclass=[\"'][^\"']*\bhm-question\b[^\"']*\bhm-intro-title\b[^\"']*[\"']/i.test(attributes);
    if (!hasQuestionId || !hasIntroQuestionClass) return full;
    const updated = upsertHtmlAttribute(attributes, 'data-seo-demoted-heading', 'true');
    return `<p${updated}>${content}</p>`;
  });
}


function addHtmlClassAttribute(attributes = '', className = '') {
  const current = readDataAttribute(attributes, 'class');
  const classes = new Set(String(current || '').split(/\s+/).filter(Boolean));
  if (className) classes.add(className);
  return upsertHtmlAttribute(attributes, 'class', [...classes].join(' '));
}

function applyClassicSeoShell(html) {
  return String(html || '')
    .replace(/<link\s+rel=["']stylesheet["']\s+href=["'][^"']*hashinmy-immersive\.css["']\s*\/>/i, '<link rel="stylesheet" href="/css/hashinmy-classic.css" />')
    .replace(/\n?\s*<script\s+src=["'][^"']*js\/hashinmy-immersive\.js["'][^>]*><\/script>\s*/i, '\n')
    .replace(/<body([^>]*)>/i, (_full, attributes = '') => `<body${addHtmlClassAttribute(attributes, 'hm-classic-seo-page')}>`);
}

function buildSeoStaticCategoryGroups(bundle) {
  const categories = Array.isArray(bundle?.categories) ? bundle.categories : [];
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  const categoryIds = new Set(categories.map((category) => String(category?.id || '').trim()).filter(Boolean));
  const groups = categories
    .map((category) => {
      const categoryId = String(category?.id || '').trim();
      const categoryItems = items.filter((item) => String(item?.category || '').trim() === categoryId);
      return {
        id: categoryId || 'seo-classic-category',
        label: category?.label || getSeoUiLabel(bundle, 'productsLabel', 'Productos', 'Products'),
        description: category?.description || '',
        items: categoryItems
      };
    })
    .filter((group) => group.items.length);

  const orphanItems = items.filter((item) => !categoryIds.has(String(item?.category || '').trim()));
  if (orphanItems.length) {
    groups.push({
      id: 'seo-classic-all-products',
      label: getSeoUiLabel(bundle, 'allLabel', 'Todas las soluciones', 'All solutions'),
      description: bundle?.hubLead || '',
      items: orphanItems
    });
  }

  return groups;
}

function buildSeoStaticCategoryJumpNav(groups = [], bundle = {}) {
  const visibleGroups = groups.filter((group) => group?.items?.length);
  if (!visibleGroups.length) return '';
  const navLabel = getSeoUiLabel(bundle, 'categoryNavLabel', 'Categorías de productos Hashinmy', 'Hashinmy product categories');
  return `
      <nav class="hm-seo-static-page__jumpnav" aria-label="${htmlAttributeEscape(navLabel)}">
        ${visibleGroups.map((group) => {
          const count = group.items.length;
          const label = String(group.label || '').trim();
          const groupId = String(group.id || '').trim();
          const href = `#${getSeoClassicAnchorId(groupId)}`;
          return `<a href="${htmlAttributeEscape(href)}" data-seo-classic-category="${htmlAttributeEscape(groupId)}" aria-label="${htmlAttributeEscape(`${label}: ${count}`)}"><span>${htmlTextEscape(label)}</span><small>${htmlTextEscape(count)}</small></a>`;
        }).join('')}
      </nav>`;
}

function buildSeoStaticModernToggle(page = {}) {
  const href = String(page.modernHref || '').trim();
  if (!href) return '';
  const label = page.modernLabel || 'Vista Moderna';
  const ariaLabel = page.modernAriaLabel || label;
  return `<a class="hm-seo-static-page__modern-toggle" href="${htmlAttributeEscape(href)}" aria-label="${htmlAttributeEscape(ariaLabel)}">${htmlTextEscape(label)}</a>`;
}

function buildSeoStaticLandingItem(card, labels = {}) {
  if (!card) return '';
  const visibleContent = createSeoVisibleContentModel(card);
  const { quick, sections, faqs, includes, terms } = visibleContent;
  const url = card.url || '#';
  const itemId = String(card.id || '').trim();
  const solutionId = itemId ? `hmSeoClassicSolution-${htmlAttributeEscape(itemId)}` : '';
  const includeTags = includes.map((entry) => `<span>${htmlTextEscape(entry)}</span>`).join('');
  const guideItems = sections
    .map((entry) => `<li><strong>${htmlTextEscape(entry.heading)}:</strong> ${htmlTextEscape(entry.body)}</li>`)
    .join('');
  const termItems = terms
    .map((entry) => `<dd><b>${htmlTextEscape(entry.term)}:</b> ${htmlTextEscape(entry.meaning)}</dd>`)
    .join('');
  const faqItems = faqs
    .map((entry) => `<dd><b>${htmlTextEscape(entry.question)}</b><span>${htmlTextEscape(entry.answer)}</span></dd>`)
    .join('');

  return `
            <article class="hm-seo-static-page__solution"${solutionId ? ` id="${solutionId}"` : ''}>
              <header class="hm-seo-static-page__solution-header">
                ${card.eyebrow ? `<span class="hm-seo-static-page__eyebrow">${htmlTextEscape(card.eyebrow)}</span>` : ''}
                <h3><a href="${htmlAttributeEscape(url)}">${htmlTextEscape(card.title || '')}</a></h3>
                <p class="hm-seo-static-page__solution-summary">${htmlTextEscape(card.summary || '')}</p>
              </header>

              <div class="hm-seo-static-page__quick hm-seo-static-page__quick--landing">
                <p><strong>${htmlTextEscape(labels.simpleLabel || 'En simple')}:</strong> ${htmlTextEscape(quick.simple || card.simple || '')}</p>
                <p><strong>${htmlTextEscape(labels.whoLabel || 'Para quién')}:</strong> ${htmlTextEscape(quick.who || card.who || '')}</p>
                <p><strong>${htmlTextEscape(labels.technicalLabel || 'Base técnica')}:</strong> ${htmlTextEscape(quick.technical || card.technical || '')}</p>
              </div>
              ${includeTags ? `<div class="hm-seo-static-page__line"><strong>${htmlTextEscape(labels.includesLabel || 'Incluye')}:</strong> ${includeTags}</div>` : ''}
              ${guideItems ? `<div class="hm-seo-static-page__guide"><h4>${htmlTextEscape(labels.guideLabel || 'Guía completa')}</h4><ol>${guideItems}</ol></div>` : ''}
              ${termItems ? `<dl class="hm-seo-static-page__terms"><dt>${htmlTextEscape(labels.glossaryLabel || 'Palabras técnicas')}</dt>${termItems}</dl>` : ''}
              ${faqItems ? `<dl class="hm-seo-static-page__faq"><dt>${htmlTextEscape(labels.faqLabel || 'Preguntas frecuentes')}</dt>${faqItems}</dl>` : ''}
              <p class="hm-seo-static-page__solution-action"><a class="hm-seo-static-page__cta" href="${htmlAttributeEscape(url)}">${htmlTextEscape(labels.detailLabel || 'Ver solución')}</a></p>
            </article>`;
}

function buildSeoStaticSection(bundle, page = {}) {
  const item = page.item || null;
  const isHub = !item;
  const title = item?.title || bundle?.hubTitle || 'Hashinmy';
  const lead = item?.summary || bundle?.hubLead || '';
  if (isHub) {
    const classicLabels = {
      detailLabel: bundle?.openDetailLabel || getSeoUiLabel(bundle, 'viewSolutionLabel', 'Ver solución', 'View solution'),
      simpleLabel: page.simpleLabel || getSeoUiLabel(bundle, 'simpleLabel', 'En simple', 'In simple words'),
      whoLabel: page.whoLabel || getSeoUiLabel(bundle, 'whoLabel', 'Para quién', 'Who it helps'),
      technicalLabel: page.technicalLabel || getSeoUiLabel(bundle, 'technicalLabel', 'Base técnica', 'Technical base'),
      includesLabel: page.includesLabel || getSeoUiLabel(bundle, 'includesLabel', 'Incluye', 'Includes'),
      glossaryLabel: page.glossaryLabel || getSeoUiLabel(bundle, 'glossaryLabel', 'Palabras técnicas', 'Technical words'),
      guideLabel: page.guideLabel || getSeoUiLabel(bundle, 'guideLabel', 'Guía completa', 'Complete guide'),
      faqLabel: page.faqLabel || getSeoUiLabel(bundle, 'faqLabel', 'Preguntas frecuentes', 'Frequently asked questions')
    };
    const classicGroups = buildSeoStaticCategoryGroups(bundle);
    const jumpNav = buildSeoStaticCategoryJumpNav(classicGroups, bundle);
    const modernToggle = buildSeoStaticModernToggle(page);
    const groupedCategories = classicGroups.map((category) => {
      const cards = category.items.map((card) => buildSeoStaticLandingItem(card, classicLabels)).join('');
      if (!cards) return '';
      const anchorId = getSeoClassicAnchorId(category.id);
      return `
        <article class="hm-seo-static-page__category" id="${htmlAttributeEscape(anchorId)}">
          <h2>${htmlTextEscape(category.label || '')}</h2>
          <p>${htmlTextEscape(category.description || '')}</p>
          <div class="hm-seo-static-page__category-list hm-seo-static-page__category-list--landing">${cards}
          </div>
        </article>`;
    }).join('');

    return `
    <section class="hm-seo-static-page" lang="${htmlAttributeEscape(bundle?.htmlLang || bundle?.code || 'es')}" dir="${htmlAttributeEscape(bundle?.dir || 'ltr')}" aria-label="${htmlAttributeEscape(title)}">
      ${modernToggle}
      <header>
        <h1>${htmlTextEscape(title)}</h1>
        <p>${htmlTextEscape(lead)}</p>
      </header>
      ${jumpNav}
      <div class="hm-seo-static-page__categories">${groupedCategories}
      </div>
    </section>`;
  }

  const visibleContent = createSeoVisibleContentModel(item);
  const includes = visibleContent.includes.map((entry) => `<span>${htmlTextEscape(entry)}</span>`).join('');
  const terms = visibleContent.terms.map((entry) => `<dd><b>${htmlTextEscape(entry.term)}:</b> ${htmlTextEscape(entry.meaning)}</dd>`).join('');
  const backHref = normalizeSeoPath(bundle?.hubUrl || '/es/productos/');
  const backLabel = page.backLabel || (bundle?.code === 'en' ? 'Back to products' : 'Volver a productos');
  const backText = `← ${String(backLabel).replace(/^←\s*/u, '')}`;
  const guideLabel = page.guideLabel || getSeoUiLabel(bundle, 'guideLabel', 'Guía completa', 'Complete guide');
  const sections = visibleContent.sections
    .map((entry) => `<li><strong>${htmlTextEscape(entry.heading)}:</strong> ${htmlTextEscape(entry.body)}</li>`)
    .join('');
  const faqs = visibleContent.faqs
    .map((entry) => `<dd><b>${htmlTextEscape(entry.question)}</b><span>${htmlTextEscape(entry.answer)}</span></dd>`)
    .join('');
  return `
    <section class="hm-seo-static-page hm-seo-static-page--detail" lang="${htmlAttributeEscape(bundle?.htmlLang || bundle?.code || 'es')}" dir="${htmlAttributeEscape(bundle?.dir || 'ltr')}" aria-label="${htmlAttributeEscape(title)}">
      ${buildSeoStaticModernToggle(page)}
      <article class="hm-seo-static-page__final">
        <a class="hm-seo-static-page__back" href="${htmlAttributeEscape(backHref)}">${htmlTextEscape(backText)}</a>
        <header class="hm-seo-static-page__hero">
          <span>${htmlTextEscape(item?.eyebrow || bundle?.entryLabel || 'Hashinmy')}</span>
          <h1>${htmlTextEscape(title)}</h1>
          <p>${htmlTextEscape(lead)}</p>
        </header>

        <div class="hm-seo-static-page__quick">
          <p><strong>${htmlTextEscape(page.simpleLabel || 'En simple')}:</strong> ${htmlTextEscape(visibleContent.quick.simple || '')}</p>
          <p><strong>${htmlTextEscape(page.whoLabel || 'Para quién')}:</strong> ${htmlTextEscape(visibleContent.quick.who || '')}</p>
          <p><strong>${htmlTextEscape(page.technicalLabel || 'Base técnica')}:</strong> ${htmlTextEscape(visibleContent.quick.technical || '')}</p>
        </div>
        ${includes ? `<div class="hm-seo-static-page__line"><strong>${htmlTextEscape(page.includesLabel || 'Incluye')}:</strong> ${includes}</div>` : ''}
        ${sections ? `<div class="hm-seo-static-page__guide"><h2>${htmlTextEscape(guideLabel)}</h2><ol>${sections}</ol></div>` : ''}
        ${terms ? `<dl class="hm-seo-static-page__terms"><dt>${htmlTextEscape(page.glossaryLabel || 'Palabras técnicas')}</dt>${terms}</dl>` : ''}
        ${faqs ? `<dl class="hm-seo-static-page__faq"><dt>${htmlTextEscape(page.faqLabel || 'Preguntas frecuentes')}</dt>${faqs}</dl>` : ''}
      </article>
    </section>`;
}

function setJsonLd(html, payload) {
  const json = JSON.stringify(payload, null, 2).replace(/<\//g, '<\\/');
  return String(html || '').replace(/<script\s+type=["']application\/ld\+json["']\s+id=["']hmStructuredData["'][^>]*>[\s\S]*?<\/script>/i, `<script type="application/ld+json" id="hmStructuredData">\n${json}\n  </script>`);
}

function normalizeSeoSchemaSlug(value = '') {
  const rawValue = String(value || '').trim().toLowerCase();
  let normalizedValue = rawValue;
  try {
    normalizedValue = rawValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {}
  return normalizedValue.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'concepto';
}

function seoLocalizedBuildText(bundle, esValue = '', enValue = '') {
  return bundle?.code === 'en' ? (enValue || esValue) : esValue;
}

function getSeoPrimaryEntityType(item) {
  return item?.category === 'glosario' ? 'DefinedTerm' : 'Service';
}

function getSeoPrimaryEntityId(item, pageUrl) {
  return getSeoPrimaryEntityType(item) === 'DefinedTerm' ? `${pageUrl}#defined-term` : `${pageUrl}#service`;
}

function getSeoDefinedTerms(item, pageUrl) {
  if (!item || !Array.isArray(item.terms)) return [];
  return item.terms
    .filter((entry) => entry?.term && entry?.meaning)
    .slice(0, SEO_FINAL_VISIBLE_LIMITS.terms)
    .map((entry, index) => ({
      '@type': 'DefinedTerm',
      '@id': `${pageUrl}#term-${normalizeSeoSchemaSlug(entry.term || index)}`,
      name: entry.term,
      description: entry.meaning,
      inDefinedTermSet: { '@id': `${pageUrl}#glossary` }
    }));
}

function buildSeoArticleBody(item) {
  if (!item) return '';
  return [
    item.summary,
    item.simple,
    item.who,
    item.technical,
    ...(getSeoItemSections(item, SEO_FINAL_VISIBLE_LIMITS.sections).map((entry) => `${entry.heading}: ${entry.body}`)),
    ...(getSeoItemFaqs(item, SEO_FINAL_VISIBLE_LIMITS.faqs).map((entry) => `${entry.question}: ${entry.answer}`))
  ].filter(Boolean).join(' ');
}

function buildSeoPrimaryEntity(item, pageUrl, bundle, definedTerms = []) {
  const primaryEntityId = getSeoPrimaryEntityId(item, pageUrl);
  const termRefs = definedTerms.map((entry) => ({ '@id': entry['@id'] }));
  const keywords = Array.isArray(item?.keywords) ? item.keywords.join(', ') : undefined;

  if (getSeoPrimaryEntityType(item) === 'DefinedTerm') {
    return {
      '@type': 'DefinedTerm',
      '@id': primaryEntityId,
      name: item.title,
      description: item.metaDescription || item.summary,
      termCode: item.technical || item.simple || undefined,
      inLanguage: bundle?.htmlLang || bundle?.code || 'es',
      url: pageUrl,
      keywords,
      isPartOf: { '@id': `${pageUrl}#guide` },
      mentions: termRefs.length ? termRefs : undefined
    };
  }

  return {
    '@type': 'Service',
    '@id': primaryEntityId,
    name: item.title,
    serviceType: item.eyebrow || 'Hashinmy service',
    category: item.category || undefined,
    description: item.metaDescription || item.summary,
    provider: { '@id': `${PUBLIC_SITE_URL}#organization` },
    url: pageUrl,
    areaServed: 'Global',
    audience: item.who ? { '@type': 'BusinessAudience', audienceType: item.who } : undefined,
    keywords,
    about: termRefs.length ? termRefs : undefined,
    hasOfferCatalog: Array.isArray(item.includes) && item.includes.length ? {
      '@type': 'OfferCatalog',
      name: getSeoUiLabel(bundle, 'scopeCatalogLabel', 'Alcance posible de Hashinmy', 'Possible Hashinmy scope'),
      itemListElement: item.includes.slice(0, SEO_FINAL_VISIBLE_LIMITS.includes).map((entry, index) => ({
        '@type': 'Offer',
        position: index + 1,
        itemOffered: {
          '@type': 'Service',
          name: entry
        }
      }))
    } : undefined
  };
}

function buildSeoGuideEntity(item, pageUrl, bundle, definedTerms = []) {
  const sectionNames = getSeoItemSections(item, SEO_FINAL_VISIBLE_LIMITS.sections).map((entry) => entry.heading).filter(Boolean);
  return {
    '@type': 'TechArticle',
    '@id': `${pageUrl}#guide`,
    headline: item.title,
    description: item.metaDescription || item.summary,
    abstract: item.simple || item.summary,
    articleSection: sectionNames.length ? sectionNames : undefined,
    articleBody: buildSeoArticleBody(item),
    keywords: Array.isArray(item.keywords) ? item.keywords.join(', ') : undefined,
    inLanguage: bundle?.htmlLang || bundle?.code || 'es',
    publisher: { '@id': `${PUBLIC_SITE_URL}#organization` },
    mainEntityOfPage: { '@id': `${pageUrl}#webpage` },
    about: [{ '@id': getSeoPrimaryEntityId(item, pageUrl) }, ...definedTerms.map((entry) => ({ '@id': entry['@id'] }))]
  };
}

function buildSeoGlossaryGraph(item, pageUrl, bundle, definedTerms = []) {
  if (!definedTerms.length) return [];
  return [
    {
      '@type': 'DefinedTermSet',
      '@id': `${pageUrl}#glossary`,
      name: getSeoUiLabel(bundle, 'glossarySetLabel', 'Glosario sencillo de Hashinmy', 'Plain Hashinmy glossary'),
      inLanguage: bundle?.htmlLang || bundle?.code || 'es',
      hasDefinedTerm: definedTerms.map((entry) => ({ '@id': entry['@id'] }))
    },
    ...definedTerms
  ];
}

function buildSeoJsonLd({ pageUrl, title, description, bundle, item }) {
  const hubName = bundle?.entryLabel || getSeoUiLabel(bundle, 'productsLabel', 'Productos', 'Products');
  const breadcrumbItems = [
    { name: 'Hashinmy', item: PUBLIC_SITE_URL },
    { name: hubName, item: buildPublicSeoUrl(bundle?.hubUrl || '/es/productos/') }
  ];
  if (item) breadcrumbItems.push({ name: item.title, item: pageUrl });

  const definedTerms = item ? getSeoDefinedTerms(item, pageUrl) : [];
  const primaryEntityId = item ? getSeoPrimaryEntityId(item, pageUrl) : `${pageUrl}#itemlist`;

  const graph = [
    {
      '@type': 'Organization',
      '@id': `${PUBLIC_SITE_URL}#organization`,
      name: 'Hashinmy',
      url: PUBLIC_SITE_URL,
      logo: `${PUBLIC_SITE_URL}assets/hashinmy-logo-emblem.png`
    },
    {
      '@type': 'WebSite',
      '@id': `${PUBLIC_SITE_URL}#website`,
      name: 'Hashinmy',
      url: PUBLIC_SITE_URL,
      publisher: { '@id': `${PUBLIC_SITE_URL}#organization` },
      inLanguage: [bundle?.htmlLang || bundle?.code || 'es']
    },
    {
      '@type': item ? 'WebPage' : 'CollectionPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: title,
      description,
      isPartOf: { '@id': `${PUBLIC_SITE_URL}#website` },
      publisher: { '@id': `${PUBLIC_SITE_URL}#organization` },
      inLanguage: bundle?.htmlLang || bundle?.code || 'es',
      breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
      mainEntity: { '@id': primaryEntityId }
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumb`,
      itemListElement: breadcrumbItems.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: entry.name,
        item: entry.item
      }))
    }
  ];

  if (item) {
    graph.push(buildSeoPrimaryEntity(item, pageUrl, bundle, definedTerms));
    graph.push(buildSeoGuideEntity(item, pageUrl, bundle, definedTerms));
    graph.push(...buildSeoGlossaryGraph(item, pageUrl, bundle, definedTerms));

    const faqs = getSeoItemFaqs(item, SEO_FINAL_VISIBLE_LIMITS.faqs);
    if (faqs.length) {
      graph.push({
        '@type': 'FAQPage',
        '@id': `${pageUrl}#faq`,
        mainEntity: faqs.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: entry.answer
          }
        }))
      });
    }
  } else {
    graph.push({
      '@type': 'ItemList',
      '@id': `${pageUrl}#itemlist`,
      name: bundle?.hubTitle || 'Hashinmy products',
      itemListElement: (bundle?.items || []).map((entry, index) => {
        const itemUrl = buildPublicSeoUrl(entry.url);
        return {
          '@type': 'ListItem',
          position: index + 1,
          name: entry.title,
          url: itemUrl,
          item: {
            '@type': getSeoPrimaryEntityType(entry),
            '@id': getSeoPrimaryEntityId(entry, itemUrl),
            name: entry.title,
            description: entry.summary,
            url: itemUrl
          }
        };
      })
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

async function buildSeoPageHtml({ templateHtml, textBundle, languages, bundle, item = null, alternates = [] }) {
  const pagePath = item?.url || bundle?.hubUrl || '/es/productos/';
  const pageUrl = buildPublicSeoUrl(pagePath);
  const title = item?.metaTitle || bundle?.hubMetaTitle || textBundle?.meta?.title || 'Hashinmy';
  const description = item?.metaDescription || bundle?.hubMetaDescription || textBundle?.meta?.description || '';
  const staticSection = buildSeoStaticSection(bundle, {
    item,
    simpleLabel: getSeoUiLabel(bundle, 'simpleLabel', 'En simple', 'In simple words'),
    whoLabel: getSeoUiLabel(bundle, 'whoLabel', 'Para quién', 'Who it helps'),
    technicalLabel: getSeoUiLabel(bundle, 'technicalLabel', 'Base técnica', 'Technical base'),
    includesLabel: getSeoUiLabel(bundle, 'includesLabel', 'Incluye', 'Includes'),
    glossaryLabel: getSeoUiLabel(bundle, 'glossaryLabel', 'Palabras técnicas', 'Technical words'),
    faqLabel: getSeoUiLabel(bundle, 'faqLabel', 'Preguntas frecuentes', 'Frequently asked questions'),
    backLabel: bundle?.backLabel || getSeoUiLabel(bundle, 'backToProductsLabel', 'Volver a productos', 'Back to products'),
    modernLabel: getSeoUiLabel(bundle, 'modernViewLabel', 'Vista Moderna', 'Modern view'),
    modernAriaLabel: getSeoUiLabel(bundle, 'modernViewAriaLabel', 'Volver a la vista moderna de productos', 'Return to the modern product view'),
    modernHref: buildSeoModernEntryHref(pagePath),
  });

  const proofLogos = await readProofClientLogosManifestFromRoot();
  let output = hydrateStaticSeoEntryButton(
    hydrateStaticHtmlFallback(templateHtml, textBundle, languages, bundle?.code || 'es', '/', proofLogos, seoContent),
    bundle,
    { classicPage: true, pagePath }
  );
  output = demoteImmersiveIntroHeadingForSeoPage(output);
  output = output.replace(/\n?\s*<link\s+[^>]*data-hashinmy-hreflang=["']static["'][^>]*>\s*/gi, '\n');
  const alternateLinks = buildSeoAlternateLinks(alternates);
  if (alternateLinks) output = output.replace(/<\/head>/i, `  ${alternateLinks}\n</head>`);
  output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlTextEscape(title)}</title>`);
  output = setCanonicalHref(output, pageUrl);
  output = setMetaContent(output, 'name', 'description', description);
  output = setMetaContent(output, 'property', 'og:title', item?.title || title);
  output = setMetaContent(output, 'property', 'og:description', description);
  output = setMetaContent(output, 'property', 'og:url', pageUrl);
  output = setMetaContent(output, 'name', 'twitter:title', item?.title || title);
  output = setMetaContent(output, 'name', 'twitter:description', description);
  const pageKeywords = Array.isArray(item?.keywords) ? item.keywords : buildSeoBundleKeywords(bundle);
  output = setMetaContent(output, 'name', 'keywords', pageKeywords.join(', '));
  output = setJsonLd(output, buildSeoJsonLd({ pageUrl, title, description, bundle, item }));
  output = output.replace(/<\/main>/i, `${staticSection}\n  </main>`);
  output = applyClassicSeoShell(output);
  return output;
}

function buildSeoGroups(seoContent, languageCatalog = []) {
  const bundles = getSeoBundles(seoContent, languageCatalog);
  if (!bundles.length) return [];

  const groups = [{
    type: 'hub',
    entries: bundles
      .filter((bundle) => bundle?.hubUrl)
      .map((bundle) => ({ code: bundle.code || 'es', htmlLang: bundle.htmlLang || bundle.code || 'es', url: bundle.hubUrl }))
  }];

  const ids = new Set(bundles.flatMap((bundle) => (bundle.items || []).map((item) => item.id)).filter(Boolean));
  for (const id of ids) {
    const entries = bundles
      .map((bundle) => {
        const item = (bundle.items || []).find((candidate) => candidate.id === id);
        return item ? { code: bundle.code || 'es', htmlLang: bundle.htmlLang || bundle.code || 'es', url: item.url, item } : null;
      })
      .filter(Boolean);
    if (entries.length) groups.push({ type: 'item', id, entries });
  }

  return groups.map((group) => {
    const fallback = group.entries.find((entry) => entry.code === 'es') || group.entries[0];
    const alternates = [
      { hreflang: 'x-default', href: buildPublicSeoUrl(fallback.url) },
      ...group.entries.map((entry) => ({ hreflang: entry.htmlLang || entry.code, href: buildPublicSeoUrl(entry.url) }))
    ];
    return { ...group, alternates };
  });
}

async function writeSeoStaticPages(seoContent, languages) {
  if (!seoContent) return;
  const templateHtml = await readFile(path.join(root, 'index.html'), 'utf8');
  const groups = buildSeoGroups(seoContent, languages);

  for (const group of groups) {
    for (const entry of group.entries) {
      const bundle = getSeoBundle(seoContent, entry.code);
      const textBundle = await readJson(`textX/${entry.code}.json`);
      const html = await buildSeoPageHtml({
        templateHtml,
        textBundle,
        languages,
        bundle,
        item: entry.item || null,
        alternates: group.alternates
      });
      const relativePath = seoDistEntryPath(entry.url);
      const filePath = path.join(dist, relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, html, 'utf8');
    }
  }
}

async function readLanguageCatalog() {
  try {
    const textCatalog = await readAvailableTextLanguageCatalog();
    const seoCodes = await readAvailableSeoLanguageCodes();
    return sortLanguageCatalog(textCatalog.filter((language) => seoCodes.has(language.code)));
  } catch {
    return [];
  }
}

async function writeLanguageCatalogManifest(languages = [], targetRoot = dist) {
  const manifest = {
    schemaVersion: 1,
    defaultLanguage: 'es',
    generatedAt: new Date().toISOString(),
    source: 'detected-from-textX-and-textX-seo',
    languages: sortLanguageCatalog(languages)
  };

  if (targetRoot === dist) {
    await mkdir(path.join(dist, 'textX'), { recursive: true });
    await writeFile(path.join(dist, 'textX', 'languages.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return;
  }

  await mkdir(path.join(targetRoot, 'textX'), { recursive: true });
  await writeFile(path.join(targetRoot, 'textX', 'languages.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function buildSitemapUrlXml({ href, alternates = [], changefreq = 'weekly', priority = '0.80', lastmod = SITEMAP_LASTMOD }) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(href)}</loc>`,
    `    <lastmod>${xmlEscape(lastmod)}</lastmod>`,
    `    <changefreq>${xmlEscape(changefreq)}</changefreq>`,
    `    <priority>${xmlEscape(priority)}</priority>`,
    ...alternates.map((alternate) => `    <xhtml:link rel="alternate" hreflang="${xmlEscape(alternate.hreflang)}" href="${xmlEscape(alternate.href)}" />`),
    '  </url>'
  ].join('\n');
}

async function writeInternationalSitemap() {
  const languages = await readLanguageCatalog();
  const seoContent = await readSeoContent();
  const homeAlternates = [
    { code: 'x-default', htmlLang: 'x-default', href: PUBLIC_SITE_URL },
    ...languages.map((language) => ({
      code: language.code,
      htmlLang: language.htmlLang || language.code,
      href: buildPublicLanguageUrl(language.code)
    }))
  ];
  const homeAlternateLinks = homeAlternates.map((alternate) => ({ hreflang: alternate.htmlLang, href: alternate.href }));
  const homeUrls = [
    {
      href: PUBLIC_SITE_URL,
      alternates: homeAlternateLinks,
      changefreq: 'weekly',
      priority: SITEMAP_PRIORITY.home
    },
    ...languages.filter((language) => language.code !== 'es').map((language) => ({
      href: buildPublicLanguageUrl(language.code),
      alternates: homeAlternateLinks,
      changefreq: 'monthly',
      priority: SITEMAP_PRIORITY.languageHome
    }))
  ];

  const seoUrls = buildSeoGroups(seoContent, languages).flatMap((group) => group.entries.map((entry) => ({
    href: buildPublicSeoUrl(entry.url),
    alternates: group.alternates,
    changefreq: 'weekly',
    priority: group.type === 'hub' ? SITEMAP_PRIORITY.seoHub : SITEMAP_PRIORITY.seoItem
  })));

  const urls = [...homeUrls, ...seoUrls];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls.map(buildSitemapUrlXml),
    '</urlset>',
    ''
  ].join('\n');

  await writeFile(path.join(dist, 'sitemap.xml'), xml, 'utf8');
}

async function copyIfExists(relativePath) {
  const source = path.join(root, relativePath);
  if (!(await exists(source))) return;
  await cp(source, path.join(dist, relativePath), { recursive: true, force: true });
}

async function ensureDir(relativePath) {
  await mkdir(path.join(dist, relativePath), { recursive: true });
}

async function writeDistProjectStructureManifest() {
  const directories = [];
  const files = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(dist, fullPath).replaceAll(path.sep, '/');
      if (entry.isDirectory()) {
        directories.push({ path: relativePath, name: entry.name, parent: path.dirname(relativePath).replace(/^\.$/u, '') });
        await walk(fullPath);
      } else if (entry.isFile()) {
        const stats = await stat(fullPath);
        files.push({ path: relativePath, name: entry.name, directory: path.dirname(relativePath).replace(/^\.$/u, ''), sizeBytes: stats.size });
      }
    }
  }

  await walk(dist);
  const manifestPath = 'estructura_del_proyecto.json';
  const existingIndex = files.findIndex((file) => file.path === manifestPath);
  const manifest = {
    type: 'nova_project_structure_manifest',
    version: 1,
    fileName: manifestPath,
    generatedAt: new Date().toISOString(),
    sourceRootName: 'dist',
    scope: 'static_dist_build',
    partialZip: false,
    counts: {
      directories: directories.length,
      files: existingIndex >= 0 ? files.length : files.length + 1,
      complete: true
    },
    directories: directories.sort((a, b) => a.path.localeCompare(b.path)),
    files: files.sort((a, b) => a.path.localeCompare(b.path))
  };
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  if (existingIndex >= 0) {
    manifest.files[existingIndex].sizeBytes = Buffer.byteLength(content, 'utf8');
  } else {
    manifest.files.push({ path: manifestPath, name: manifestPath, directory: '', sizeBytes: Buffer.byteLength(content, 'utf8') });
    manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  }
  manifest.counts.files = manifest.files.length;
  await writeFile(path.join(dist, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

await rm(dist, { recursive: true, force: true });
await ensureDir('.');
await writeProofClientLogosManifest(root);
const sourceLanguageCatalog = await readLanguageCatalog();
await writeLanguageCatalogManifest(sourceLanguageCatalog, root);

for (const item of ['index.html', 'css', 'js', 'assets', 'textX', 'robots.txt', 'llms.txt', 'sitemap.xml', 'render.yaml']) {
  await copyIfExists(item);
}

if (!(await exists(path.join(dist, 'robots.txt')))) {
  await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${PUBLIC_SITE_URL}sitemap.xml\n`, 'utf8');
}

await writeInternationalSitemap();

await cp(path.join(root, 'index.html'), path.join(dist, '404.html'), { force: true });

const staticLanguages = await readLanguageCatalog();
await writeLanguageCatalogManifest(staticLanguages);
const spanishTextBundle = await readSpanishTextBundle();
const seoContent = await readSeoContent();
await hydrateStaticHtmlFile('index.html', spanishTextBundle, staticLanguages, 'es', './', seoContent);
// La página 404 puede servirse conservando una URL profunda (/en/algo o /ruta/no-existente).
// Usa recursos absolutos de raíz para evitar que CSS/JS/logo se resuelvan contra la ruta fallida.
await hydrateStaticHtmlFile('404.html', spanishTextBundle, staticLanguages, 'es', '/', seoContent);
await markStatic404Noindex('404.html', spanishTextBundle, staticLanguages, seoContent);

for (const language of staticLanguages) {
  await writeLocalizedEntryPage(language, staticLanguages, seoContent);
}

await writeSeoStaticPages(seoContent, staticLanguages);
await writeLlmsTxt(seoContent);
await writeInternationalSitemap();
await writeDistProjectStructureManifest();

const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else files.push(path.relative(dist, full).replaceAll(path.sep, '/'));
  }
}
await walk(dist);

console.log(`Build inmersivo generado en dist con ${files.length} archivos.`);
