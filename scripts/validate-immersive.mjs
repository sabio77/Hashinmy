import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getLlmsHomeLabel, getLlmsHubLabel } from './llms-i18n-labels.mjs';

const root = process.cwd();
const assetsOnly = process.argv.includes('--assets-only');
const failures = [];
let REQUIRED_LANGUAGE_COUNT = 0;
const REQUIRED_SCENES = ['intro', 'serviceFamily', 'buildType', 'automationType', 'modernization', 'operation', 'value', 'risk', 'finance', 'timeline', 'summary'];
const PUBLIC_SITE_URL = 'https://hashinmy.com/';
const REQUIRED_UI_KEYS = ['skip', 'stageLabel', 'brandSmall', 'languageLabel', 'languageAria', 'primaryFinance', 'primaryQuote', 'back', 'restart', 'contactLabel', 'contactPlaceholder', 'commentLabel', 'commentPlaceholder', 'submitRoute', 'copySummaryAction', 'formNote', 'contactRequired', 'summaryTitle', 'waitSummary', 'preparingOptions', 'topActionsLabel', 'proofEntryAria', 'proofOpenButton', 'proofTitle', 'proofLead', 'proofCloseAria', 'proofContentAria', 'proofSummaryAria', 'proofSummaryTitle', 'proofTrustLabel', 'proofTrustText', 'proofMethodLabel', 'proofMethodText', 'proofUseCasesLabel', 'proofUseCasesText', 'proofBrandsTitle', 'proofBrandsAria', 'proofLogoPlaceholder', 'proofLogoAltTemplate', 'proofFaqAria', 'proofFaqWhyQuestion', 'proofFaqWhyAnswer', 'proofFaqWhoQuestion', 'proofFaqWhoAnswer', 'proofFaqStartQuestion', 'proofFaqStartAnswer', 'proofBrandsStructuredDescription'];
const REQUIRED_SEO_UI_LABEL_KEYS = ['productsLabel', 'allLabel', 'closeLabel', 'backToProductsLabel', 'viewSolutionLabel', 'classicViewLabel', 'classicViewAriaLabel', 'modernViewLabel', 'modernViewAriaLabel', 'categoryNavLabel', 'simpleLabel', 'whoLabel', 'technicalLabel', 'includesLabel', 'glossaryLabel', 'guideLabel', 'faqLabel', 'detailTitle', 'detailLead', 'scopeCatalogLabel', 'glossarySetLabel'];
const PRIORITY_LANGUAGE_CODES = ['zh', 'hi', 'ar', 'fr', 'bn', 'pt', 'ru', 'id', 'ur', 'de', 'ja', 'sw', 'mr', 'te', 'tr', 'ta', 'vi', 'ko', 'it'];
const MAX_VISIBLE_ENGLISH_MATCHES = 5;
const MAX_VISIBLE_SPANISH_MATCHES = 5;
const MAX_VISIBLE_SPANISH_COGNATE_MATCHES = 14;
const SPANISH_COGNATE_LANGUAGE_CODES = ['en', 'ca', 'fr', 'it', 'pt', 'ro'];
const TECHNICAL_LOCALIZATION_EXCEPTIONS = new Set([
  'Hashinmy', 'HASHINMY', 'AI', 'USD', 'MVP', 'PC', 'App', 'Web', 'RPA', 'BI', 'QA', 'Auto', '360',
  'Build', 'Architecture', 'Email', 'Pause', 'Data', 'Cloud', 'Mobile', 'Local', 'API', 'Excel',
  'WhatsApp', 'CRM', 'Email / WhatsApp', 'Email · WhatsApp', 'backend', 'local', 'desktop/local',
  'iOS/Android/PWA', 'RPA + APIs', 'RPA/API', 'BI/dashboard', 'BI + AI', 'UX/UI', 'UX/UI + product',
  'enterprise roadmap', 'mobile/PWA', 'cloud backend', 'security by design', 'AI governance', 'PWA/mobile', '100%',
  'roadmap'
]);

const LOCALIZED_PUBLIC_KEYS = [
  'meta.title',
  'meta.description',
  'meta.ogTitle',
  'meta.ogDescription',
  'meta.keywords',
  'ui.skip',
  'ui.stageLabel',
  'ui.primaryFinance',
  'ui.primaryQuote',
  'ui.back',
  'ui.restart',
  'ui.contactLabel',
  'ui.contactPlaceholder',
  'ui.submitRoute',
  'ui.copySummaryAction',
  'ui.formNote',
  'ui.summaryTitle',
  'ui.optionFallback',
  'ui.preparingOptions'
];

const LOCALIZED_VISIBLE_TECH_KEYS = [
  'ui.technicalBase',
  'scenes.risk.options.1.tech',
  'scenes.timeline.options.2.tech',
  'recommendation.technicalParts.automatizacion',
  'recommendation.technicalParts.web_global'
];


const SUMMARY_DEPTH_DENSE_CODES = new Set(['zh', 'ja', 'ko', 'th', 'my']);
const MIN_SUMMARY_COPY_UNITS_BY_SCRIPT = { dense: 44, standard: 60 };
const COMMON_SCENE_COPY_PREFIX_LIMIT_AVG = 90;
const COMMON_SCENE_COPY_PREFIX_LIMIT_MAX = 140;

const RAW_BRIEF_UI_KEYS = ['ui.mailOpening', 'ui.summaryTitle', 'ui.copyFailure'];

const RAW_BRIEF_LOCALIZATION_PATTERN = /\bbrief(?:ing)?\b|ብሪፍ|بريف|بریف|برיף|בריף|ब्रिफ|ब्रीफ|ব্ৰিফ|ব্রিফ|બ્રીફ|ਬ੍ਰੀਫ|ବ୍ରିଫ୍|බ්\u200d?රීෆ්|บรีฟ|브리프|ブリーフ|ಬ್ರೀಫ್|ബ്രീഫ്|బ్రీఫ్|ப்ரீஃப்|бриф/iu;
const RAW_BRIEF_ALLOWED_LANGUAGE_CODES = new Set(['es', 'en']);
const RAW_BRIEF_IGNORED_PATHS = new Set(['iso', 'name', 'nativeName', 'htmlLang', 'dir', 'schemaVersion']);
const NATURAL_CONTACT_MIN_UNITS_BY_SCRIPT = { dense: 24, standard: 42 };
const NATURAL_ACTION_MIN_UNITS_BY_SCRIPT = { dense: 18, standard: 32 };
const RAW_ENGLISH_COMMERCIAL_COPY_PATTERN = /\b(?:Security|Automation|financing|quote|quotation|custom software|operational friction|clear rules|direct quote|direct quotation|errors|trend|repeat|feature|automate|protect)\b/iu;
const RAW_ENGLISH_COPY_ALLOWED_LANGUAGE_CODES = new Set(['es', 'en']);
const RAW_ENGLISH_COPY_FIELDS = new Set(['title', 'copy', 'optionQuestion', 'label', 'hint', 'insight']);
const RAW_SPANISH_COMMERCIAL_COPY_PATTERN = /\b(?:cotizar|cotizaci[oó]n|sin financiaci[oó]n|financiaci[oó]n directa|presupuesto directo|solicitud interactiva)\b/iu;
const RAW_ARCHITECTURE_UI_LABEL_PATTERN = /\barchitecture\b/iu;
const RAW_SPANISH_COPY_ALLOWED_LANGUAGE_CODES = new Set(['es']);
const PROOF_SHOWCASE_NATIVE_KEYS = ['proofMethodLabel', 'proofMethodText', 'proofUseCasesLabel', 'proofUseCasesText'];
const PROOF_SHOWCASE_ENGLISH_FALLBACK_PATTERN = /\b(?:Process and trust|How we work|Use cases|Clear examples to identify what a company needs)\b/iu;

function getLocalizationScriptKind(code) {
  return SUMMARY_DEPTH_DENSE_CODES.has(code) ? 'dense' : 'standard';
}

function assertNaturalSubmissionUi(code, bundle, sourceLabel = `textX/${code}.json`) {
  const contactRequired = String(bundle.ui?.contactRequired || '').trim();
  const mailOpening = String(bundle.ui?.mailOpening || '').trim();
  const copyFailure = String(bundle.ui?.copyFailure || '').trim();
  const summaryTitle = String(bundle.ui?.summaryTitle || '').trim();
  const scriptKind = getLocalizationScriptKind(code);
  const minContactUnits = NATURAL_CONTACT_MIN_UNITS_BY_SCRIPT[scriptKind];
  const minActionUnits = NATURAL_ACTION_MIN_UNITS_BY_SCRIPT[scriptKind];
  const contactUnits = countLocalizationUnits(contactRequired);
  const mailUnits = countLocalizationUnits(mailOpening);
  const copyUnits = countLocalizationUnits(copyFailure);
  const summaryUnits = countLocalizationUnits(summaryTitle);
  const hasKeywordContact = /Email\s*\/\s*WhatsApp\.\s*Hashinmy\.?$/iu.test(contactRequired);
  const hasMailKeywordLead = /^Email[.!?。؟።।॥։။]/iu.test(mailOpening);
  const hasRawBrief = code !== 'en' && RAW_BRIEF_UI_KEYS.some((key) => /\bbrief\b/iu.test(String(valueAtPath(bundle, key) || '')));

  assert(
    contactUnits >= minContactUnits && !hasKeywordContact,
    `${sourceLabel} mantiene ui.contactRequired demasiado corto o fragmentado; debe ser una instrucción accionable y natural.`
  );
  assert(
    mailUnits >= minActionUnits && copyUnits >= minActionUnits && !hasMailKeywordLead,
    `${sourceLabel} mantiene textos de envío/copia como palabras clave; deben leerse como frases naturales del idioma.`
  );
  assert(
    !hasRawBrief,
    `${sourceLabel} conserva “brief” sin adaptar en textos visibles de envío o resumen.`
  );
  assert(
    summaryUnits >= (scriptKind === 'dense' ? 8 : 16),
    `${sourceLabel} debe tener ui.summaryTitle localizado y descriptivo.`
  );
}


function isRawBriefLocalizationCandidate(pathName, value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (RAW_BRIEF_IGNORED_PATHS.has(pathName) || pathName.endsWith('.file')) return false;
  return RAW_BRIEF_LOCALIZATION_PATTERN.test(value);
}

function assertNoRawBriefLocalizationLeakage(code, bundle, sourceLabel = `textX/${code}.json`) {
  if (RAW_BRIEF_ALLOWED_LANGUAGE_CODES.has(code)) return;
  const leaked = flattenTextValues(bundle).filter(([pathName, value]) => isRawBriefLocalizationCandidate(pathName, value));

  assert(
    !leaked.length,
    `${sourceLabel} conserva “brief” o transliteraciones de “brief” en textos visibles; debe usar una expresión natural del idioma. Ejemplos: ${leaked.slice(0, 6).map(([pathName]) => pathName).join(', ')}`
  );
}

function assertNaturalFormNote(code, bundle, sourceLabel = `textX/${code}.json`) {
  const formNote = String(bundle.ui?.formNote || '').trim();
  const scriptKind = getLocalizationScriptKind(code);
  const minUnits = scriptKind === 'dense' ? 18 : 42;
  const units = countLocalizationUnits(formNote);
  const fragments = getSentenceFragments(formNote);
  const keywordList = fragments.length >= 3 && fragments.every((fragment) => countLocalizationUnits(fragment) <= 18);

  assert(
    units >= minUnits && !keywordList,
    `${sourceLabel} mantiene ui.formNote demasiado corto o como lista de palabras clave; debe explicar naturalmente que las respuestas quedan guardadas en el navegador hasta enviarlas.`
  );
}

function assertNaturalFormMicrocopy(code, bundle, sourceLabel = `textX/${code}.json`) {
  const commentPlaceholder = String(bundle.ui?.commentPlaceholder || '').trim();
  const copySuccess = String(bundle.ui?.copySuccess || '').trim();
  const scriptKind = getLocalizationScriptKind(code);
  const minCommentUnits = scriptKind === 'dense' ? 20 : 38;
  const minCopyUnits = scriptKind === 'dense' ? 18 : 34;
  const commentFragments = getSentenceFragments(commentPlaceholder);
  const copyFragments = getSentenceFragments(copySuccess);
  const commentKeywordList = commentFragments.length >= 3 && commentFragments.every((fragment) => countLocalizationUnits(fragment) <= (scriptKind === 'dense' ? 10 : 22));
  const copyKeywordList = copyFragments.length >= 3 && copyFragments.every((fragment) => countLocalizationUnits(fragment) <= (scriptKind === 'dense' ? 10 : 22));
  const rawEnglishMicrocopy = /\b(?:specific detail|project summary|optional comment|summary copied|paste it|email sending)\b/iu;

  assert(
    countLocalizationUnits(commentPlaceholder) >= minCommentUnits && !commentKeywordList,
    `${sourceLabel} mantiene ui.commentPlaceholder fragmentado o demasiado corto; debe orientar al usuario con una frase natural del idioma.`
  );
  assert(
    countLocalizationUnits(copySuccess) >= minCopyUnits && !copyKeywordList,
    `${sourceLabel} mantiene ui.copySuccess como lista de palabras clave; debe confirmar la acción con una frase natural del idioma.`
  );
  assert(
    code === 'en' || (!rawEnglishMicrocopy.test(commentPlaceholder) && !rawEnglishMicrocopy.test(copySuccess)),
    `${sourceLabel} conserva microcopy visible del formulario en inglés crudo; debe adaptarse al idioma seleccionado.`
  );
}


const RAW_OPTIONAL_PROJECT_LABEL_PATTERN = /\b(?:optional\s+comment|commentaire\s+facultatif|coment[aá]rio\s+opcional|comentario\s+opcional|optionaler\s+kommentar|opmerking\s+optioneel|optional\s+remark|facultatif|opcional|opzionale|facoltativo|opcjonalny|opțional|valgfri|valfritt|valinnainen|valgfri\s+kommentar|تعليق\s+اختياري|نظر\s+اختیاری|اختياري|اختیاری|वैकल्पिक|ঐচ্ছিক|ऐच्छिक|任意コメント|任意|可选备注|可選備註|선택\s*사항|선택\s*댓글)\b/iu;
const RAW_GENERIC_PROJECT_PLACEHOLDER_PATTERN = /\b(?:route already covers the essentials|the route already covers|specific detail if you want|ajoutez un détail spécifique|parcours contient déjà l[’']essentiel|rota já contém o essencial|detalle específico si quieres|route enthält bereits das wichtigste|المسار يتضمن الأساسيات|مسار.*أساسيات|मार्ग में मुख्य जानकारी|মূল বিষয়গুলো আগে থেকেই|주요 정보가 이미 포함|主要信息|主要情報|essentials)\b/iu;

function assertProjectDescriptionMicrocopy(code, bundle, sourceLabel = `textX/${code}.json`) {
  const commentLabel = String(bundle.ui?.commentLabel || '').replace(/\s+/g, ' ').trim();
  const commentPlaceholder = String(bundle.ui?.commentPlaceholder || '').replace(/\s+/g, ' ').trim();
  const scriptKind = getLocalizationScriptKind(code);
  const minLabelUnits = scriptKind === 'dense' ? 5 : 8;
  const minPlaceholderUnits = scriptKind === 'dense' ? 36 : 82;

  assert(
    countLocalizationUnits(commentLabel) >= minLabelUnits && !RAW_OPTIONAL_PROJECT_LABEL_PATTERN.test(commentLabel),
    `${sourceLabel} debe pedir describir el proyecto; no puede quedarse como “comentario opcional” ni como etiqueta genérica.`
  );
  assert(
    countLocalizationUnits(commentPlaceholder) >= minPlaceholderUnits && !RAW_GENERIC_PROJECT_PLACEHOLDER_PATTERN.test(commentPlaceholder),
    `${sourceLabel} debe orientar sobre proceso, plano/pieza/sistema y detalle técnico; no puede conservar el placeholder genérico anterior.`
  );
}


function assertProofShowcaseNativeCopy(code, bundle, englishBundle, sourceLabel = `textX/${code}.json`) {
  if (code === 'en') return;

  const leaked = PROOF_SHOWCASE_NATIVE_KEYS.filter((key) => {
    const value = String(bundle.ui?.[key] || '').trim();
    const englishValue = String(englishBundle.ui?.[key] || '').trim();
    return !value || value === englishValue || PROOF_SHOWCASE_ENGLISH_FALLBACK_PATTERN.test(value);
  });

  const scriptKind = getLocalizationScriptKind(code);
  const minTextUnits = scriptKind === 'dense' ? 24 : 42;
  const weakNarrative = ['proofMethodText', 'proofUseCasesText'].filter((key) => {
    const value = String(bundle.ui?.[key] || '').trim();
    return countLocalizationUnits(value) < minTextUnits;
  });

  assert(
    !leaked.length,
    `${sourceLabel} conserva textos ingleses genéricos en el panel visible “Nuestra experiencia”; faltan traducciones nativas en: ${leaked.join(', ')}.`
  );
  assert(
    !weakNarrative.length,
    `${sourceLabel} mantiene textos demasiado cortos en el panel visible “Nuestra experiencia”; deben explicar metodología y casos de uso con copy nativo. Ejemplos: ${weakNarrative.join(', ')}.`
  );
}

function flattenSceneCopyValues(bundle) {
  return Object.entries(bundle.scenes || {}).flatMap(([sceneName, scene]) => {
    if (!scene || typeof scene !== 'object') return [];
    const directValues = Object.entries(scene)
      .filter(([key, value]) => RAW_ENGLISH_COPY_FIELDS.has(key) && typeof value === 'string')
      .map(([key, value]) => [`scenes.${sceneName}.${key}`, value]);
    const optionValues = Array.isArray(scene.options)
      ? scene.options.flatMap((option, index) => Object.entries(option || {})
        .filter(([key, value]) => RAW_ENGLISH_COPY_FIELDS.has(key) && typeof value === 'string')
        .map(([key, value]) => [`scenes.${sceneName}.options.${index}.${key}`, value]))
      : [];
    return [...directValues, ...optionValues];
  });
}

function assertNoRawEnglishCommercialCopy(code, bundle, sourceLabel = `textX/${code}.json`) {
  if (RAW_ENGLISH_COPY_ALLOWED_LANGUAGE_CODES.has(code)) return;
  const leaked = flattenSceneCopyValues(bundle)
    .filter(([pathName, value]) => !pathName.endsWith('.tech') && RAW_ENGLISH_COMMERCIAL_COPY_PATTERN.test(value));

  assert(
    !leaked.length,
    `${sourceLabel} conserva términos comerciales crudos en inglés dentro de narrativa visible; deben adaptarse al idioma. Ejemplos: ${leaked.slice(0, 6).map(([pathName]) => pathName).join(', ')}`
  );
}

function flattenPublicCopyValues(bundle) {
  const publicPaths = new Set([
    ...LOCALIZED_PUBLIC_KEYS,
    'ui.languageLabel',
    'ui.languageAria',
    'ui.brandAria',
    'ui.contactRequired',
    'ui.mailOpening',
    'ui.copySuccess',
    'ui.copyFailure',
    'ui.formNote',
    'ui.contactPlaceholder',
    'ui.commentPlaceholder'
  ]);

  const publicValues = [...publicPaths]
    .map((pathName) => [pathName, valueAtPath(bundle, pathName)])
    .filter(([, value]) => typeof value === 'string');

  return [
    ...publicValues,
    ...flattenSceneCopyValues(bundle)
  ];
}

function assertNoRawSpanishCommercialCopy(code, bundle, sourceLabel = `textX/${code}.json`) {
  if (RAW_SPANISH_COPY_ALLOWED_LANGUAGE_CODES.has(code)) return;
  const leaked = flattenPublicCopyValues(bundle)
    .filter(([pathName, value]) => isHumanLocalizationValue(pathName, value) && RAW_SPANISH_COMMERCIAL_COPY_PATTERN.test(value));

  assert(
    !leaked.length,
    `${sourceLabel} conserva términos comerciales crudos en español dentro de textos visibles; deben adaptarse al idioma seleccionado. Ejemplos: ${leaked.slice(0, 6).map(([pathName]) => pathName).join(', ')}`
  );
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readRelative(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function unique(values) {
  return Array.from(new Set(values));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}



function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DOM_I18N_BINDING_KINDS = ['text', 'aria', 'placeholder', 'content'];
const DOM_SEO_I18N_BINDING_KINDS = ['text', 'aria'];

function collectDomBindingPaths(html = '', namespace = 'data-i18n', kinds = DOM_I18N_BINDING_KINDS) {
  const kindPattern = kinds.map(escapeRegExp).join('|');
  const pattern = new RegExp(`\\s${escapeRegExp(namespace)}-(${kindPattern})=(["'])([\\s\\S]*?)\\2`, 'gi');
  const paths = [];
  for (const match of String(html || '').matchAll(pattern)) {
    const pathName = String(match[3] || '').trim();
    if (pathName) paths.push(pathName);
  }
  return unique(paths).sort();
}

function assertDomI18nBindingRuntimeSupport(indexHtml = '', jsText = '') {
  const runtimeBindings = [
    ['data-i18n-text', DOM_I18N_BINDING_KINDS, '[data-i18n-text]'],
    ['data-i18n-aria', DOM_I18N_BINDING_KINDS, '[data-i18n-aria]'],
    ['data-i18n-placeholder', DOM_I18N_BINDING_KINDS, '[data-i18n-placeholder]'],
    ['data-i18n-content', DOM_I18N_BINDING_KINDS, '[data-i18n-content]'],
    ['data-seo-i18n-text', DOM_SEO_I18N_BINDING_KINDS, '[data-seo-i18n-text]'],
    ['data-seo-i18n-aria', DOM_SEO_I18N_BINDING_KINDS, '[data-seo-i18n-aria]']
  ];

  for (const [attributeName, , runtimeSelector] of runtimeBindings) {
    if (indexHtml.includes(attributeName)) {
      assert(
        jsText.includes(`querySelectorAll('${runtimeSelector}')`) || jsText.includes(`querySelectorAll("${runtimeSelector}")`),
        `js/hashinmy-immersive.js debe hidratar ${attributeName}; index.html ya lo usa y no puede depender del texto base en español.`
      );
    }
  }
}

function assertTextBindingCoverage(code, bundle, indexHtml = '', sourceLabel = `textX/${code}.json`) {
  const missingPaths = collectDomBindingPaths(indexHtml, 'data-i18n', DOM_I18N_BINDING_KINDS)
    .filter((pathName) => {
      const value = valueAtPath(bundle, pathName);
      return typeof value !== 'string' || !value.trim();
    });

  assert(
    !missingPaths.length,
    `${sourceLabel} no cubre todos los data-i18n visibles/accesibles de index.html; faltan: ${missingPaths.slice(0, 12).join(', ')}.`
  );
}

function assertSeoBindingCoverage(seoContent, indexHtml = '', sourceLabel = 'textX/seo/{isocode}.json') {
  const bindingPaths = collectDomBindingPaths(indexHtml, 'data-seo-i18n', DOM_SEO_I18N_BINDING_KINDS);
  const missingPaths = [];

  for (const [code, bundle] of Object.entries(seoContent?.languages || {})) {
    for (const pathName of bindingPaths) {
      const value = valueAtPath(bundle, pathName);
      if (typeof value !== 'string' || !value.trim()) missingPaths.push(`${code}.${pathName}`);
    }
  }

  assert(
    !missingPaths.length,
    `${sourceLabel} no cubre todos los data-seo-i18n visibles/accesibles de index.html; faltan: ${missingPaths.slice(0, 12).join(', ')}.`
  );
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


function compactLlmsLine(value = '', maxLength = 260) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const max = Math.max(80, Number(maxLength) || 260);
  if (clean.length <= max) return clean;
  const boundary = clean.slice(0, max).replace(/\s+\S*$/u, '').trim();
  return boundary || clean.slice(0, max).trim();
}

function buildPublicLanguageUrl(code = 'es') {
  const language = String(code || 'es').trim().toLowerCase() || 'es';
  const url = new URL(PUBLIC_SITE_URL);
  url.pathname = `/${encodeURIComponent(language)}/`;
  return url.toString();
}


function collectCanonicalDirectRoutePairs(seoContent = {}, languageManifest = {}) {
  const pairs = [];
  const seen = new Set();
  const languages = Array.isArray(languageManifest?.languages) ? languageManifest.languages : [];

  function remember(destinationPath = '') {
    const destination = normalizeSeoPath(destinationPath);
    if (!destination || destination === '/') return;
    const source = destination.replace(/\/$/u, '');
    if (!source || source === destination || seen.has(source)) return;
    seen.add(source);
    pairs.push({ source, destination });
  }

  languages.forEach((language) => {
    const code = String(language?.code || '').trim().toLowerCase();
    if (code) remember(`/${code}/`);
  });

  Object.values(seoContent?.languages || {}).forEach((bundle) => {
    if (!bundle || typeof bundle !== 'object') return;
    if (bundle.hubUrl) remember(bundle.hubUrl);
    (Array.isArray(bundle.items) ? bundle.items : []).forEach((item) => {
      if (item?.url) remember(item.url);
    });
  });

  return pairs;
}

function assertRenderAccessibleDirectRoutes(renderConfig = '', seoContent = {}, languageManifest = {}, sourceLabel = 'render.yaml') {
  const routePairs = collectCanonicalDirectRoutePairs(seoContent, languageManifest);
  const missing = routePairs.filter(({ source, destination }) => (
    !renderConfig.includes(`source: ${source}`) || !renderConfig.includes(`destination: ${destination}`)
  ));

  assert(
    !missing.length,
    `${sourceLabel} debe redirigir todas las rutas públicas sin barra final a su URL canónica con slash para evitar Not Found al pegar URLs visibles directamente. Faltan: ${missing.slice(0, 12).map(({ source, destination }) => `${source} -> ${destination}`).join(', ')}.`
  );
}

function extractLlmsLanguageSection(llmsText = '', code = '') {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized) return '';
  const lines = String(llmsText || '').split(/\n/u);
  const headingPattern = new RegExp(`^##\\s+.*\\(${escapeRegExp(normalized)}\\)\\s*$`, 'iu');
  const startIndex = lines.findIndex((line) => headingPattern.test(line));
  if (startIndex < 0) return '';
  const nextIndex = lines.findIndex((line, index) => index > startIndex && /^##\s+/u.test(line));
  return lines.slice(startIndex + 1, nextIndex < 0 ? lines.length : nextIndex).join('\n');
}


function assertLlmsDiscoveryCompleteness(llmsText, seoContent, sourceLabel = 'llms.txt') {
  const text = String(llmsText || '');
  const languages = seoContent?.languages || {};
  let expectedUrls = 0;

  const bundles = Object.entries(languages).filter(([, bundle]) => bundle && Array.isArray(bundle.categories) && Array.isArray(bundle.items));
  assert(bundles.length === REQUIRED_LANGUAGE_COUNT, `${sourceLabel} debe incluir exactamente ${REQUIRED_LANGUAGE_COUNT} bundles SEO, uno por cada isocode de textX/languages.json.`);
  assert(Boolean(languages.es && languages.en), `${sourceLabel} debe conservar es.json como fuente final de producción y en.json como equivalente internacional.`);
  assert(!text.includes('## Idiomas principales') && !text.includes('## Hub de productos'), `${sourceLabel} no debe conservar un bloque superior limitado a idiomas principales; el descubrimiento debe ser completo para los ${REQUIRED_LANGUAGE_COUNT} isocode.`);
  assert(!text.includes('## Índice de idiomas publicados') && !text.includes('## Señales de comprensión para IA y buscadores') && !text.includes('## Información base tomada de hashinmy.com') && !text.includes('## Mapa completo de contenido para IA y buscadores'), `${sourceLabel} no debe mantener encabezados globales solo en español; cada bloque de idioma debe publicar su propio contexto localizado.`);
  assertSeoSpanishCanonicalCoverage(languages, sourceLabel);

  for (const [code, bundle] of bundles) {
    const section = extractLlmsLanguageSection(text, code);
    assert(section, `${sourceLabel} debe tener un bloque Markdown propio para el idioma ${code} con encabezado localizado y el isocode entre paréntesis.`);
    assert(section.includes(buildPublicLanguageUrl(code)), `${sourceLabel} debe exponer la entrada pública principal /${code}/ dentro del bloque del idioma.`);
    if (bundle?.hubTitle) assert(section.includes(bundle.hubTitle), `${sourceLabel} debe exponer el título del hub localizado de ${code} dentro del bloque del idioma.`);
    const categories = Array.isArray(bundle?.categories) ? bundle.categories : [];
    const items = Array.isArray(bundle?.items) ? bundle.items : [];
    const homeUrl = buildPublicLanguageUrl(code);
    const hubUrl = buildPublicSeoUrl(bundle?.hubUrl || (code === 'en' ? '/en/products/' : `/${code}/productos/`));
    const homeLabel = getLlmsHomeLabel(code);
    const hubLabel = compactLlmsLine(getLlmsHubLabel(bundle), 96);
    assert(section.includes(hubUrl), `${sourceLabel} debe enlazar el hub SEO en ${code}.`);
    assert(section.includes(`- ${homeLabel}: ${homeUrl}`), `${sourceLabel} debe rotular la entrada principal /${code}/ con el idioma activo: “${homeLabel}”, no con un rótulo español genérico.`);
    assert(section.includes(`- ${hubLabel}: ${hubUrl}`), `${sourceLabel} debe rotular el hub SEO de ${code} con su etiqueta localizada “${hubLabel}”, no como “Hub”.`);
    if (code !== 'es') {
      assert(!section.includes(`- Inicio: ${homeUrl}`), `${sourceLabel} conserva el rótulo español “Inicio” en la sección ${code}; cada bloque del mapa IA debe sentirse nativo.`);
    }
    assert(!section.includes(`- Hub: ${hubUrl}`), `${sourceLabel} conserva el rótulo técnico “Hub” en la sección ${code}; debe usar el nombre localizado del acceso SEO.`);

    for (const category of categories) {
      if ((items || []).some((item) => item.category === category.id)) {
        assert(section.includes(category.label), `${sourceLabel} debe conservar la categoría ${category.label} en ${code}.`);
      }
    }

    for (const item of items) {
      expectedUrls += 1;
      assert(section.includes(buildPublicSeoUrl(item.url)), `${sourceLabel} no expone la URL SEO indexable ${buildPublicSeoUrl(item.url)} para IA/buscadores dentro del bloque ${code}.`);
      assert(section.includes(item.title), `${sourceLabel} no expone el título SEO “${item.title}” para ${code}.`);
    }
  }

  const spanishFaqLabel = languages.es?.uiLabels?.faqLabel || 'Preguntas frecuentes';
  const englishFaqLabel = languages.en?.uiLabels?.faqLabel || 'Frequently asked questions';
  assert(expectedUrls >= REQUIRED_LANGUAGE_COUNT * 39, `${sourceLabel} debe mapear todas las fichas por isocode, no solo una muestra parcial bilingüe.`);
  assert(text.includes(spanishFaqLabel) && text.includes(englishFaqLabel) && text.includes('FAQPage') && text.includes('TechArticle') && text.includes('DefinedTermSet') && text.includes('OfferCatalog'), `${sourceLabel} debe publicar señales estructuradas y etiquetas FAQ/glosario localizadas para rastreadores de IA, no una explicación global solo en español.`);
}


function assertSeoSpanishCanonicalCoverage(languages, sourceLabel = 'textX/seo/{isocode}.json') {
  const spanishBundle = languages?.es || {};
  const spanishItems = Array.isArray(spanishBundle?.items) ? spanishBundle.items : [];
  const spanishCategories = Array.isArray(spanishBundle?.categories) ? spanishBundle.categories : [];
  const spanishHubKeywordCount = Array.isArray(spanishBundle?.hubMetaKeywords) ? spanishBundle.hubMetaKeywords.length : 0;
  const spanishCategoryIds = spanishCategories.map((category) => category?.id).filter(Boolean);
  const spanishItemIds = spanishItems.map((item) => item?.id).filter(Boolean);
  const fieldsToMirror = ['keywords', 'includes', 'terms', 'sections', 'faqs'];
  assert(spanishItems.length, `${sourceLabel} debe tener es.json como catálogo SEO canónico para comparar cobertura multilingüe.`);
  assert(spanishHubKeywordCount, `${sourceLabel} debe tener hubMetaKeywords en es.json para comparar paridad SEO multilingüe.`);

  for (const [code, bundle] of Object.entries(languages || {})) {
    if (code === 'es') continue;
    const localizedHubKeywordCount = Array.isArray(bundle?.hubMetaKeywords) ? bundle.hubMetaKeywords.length : 0;
    const localizedCategories = Array.isArray(bundle?.categories) ? bundle.categories : [];
    const localizedCategoryIds = localizedCategories.map((category) => category?.id).filter(Boolean);
    const localizedItems = Array.isArray(bundle?.items) ? bundle.items : [];
    const localizedItemIds = localizedItems.map((item) => item?.id).filter(Boolean);
    const localizedItemsById = new Map(localizedItems.map((item) => [item?.id, item]));

    assert(
      localizedHubKeywordCount === spanishHubKeywordCount,
      `${sourceLabel} debe mantener hubMetaKeywords como traducción exacta de es.json en ${code}: esperaba ${spanishHubKeywordCount}, encontró ${localizedHubKeywordCount}.`
    );
    assert(
      localizedCategoryIds.length === spanishCategoryIds.length && localizedCategoryIds.every((id, index) => id === spanishCategoryIds[index]),
      `${sourceLabel} debe mantener las mismas categorías canónicas de es.json en ${code}, sin categorías extra ni faltantes.`
    );
    assert(
      localizedItemIds.length === spanishItemIds.length && localizedItemIds.every((id, index) => id === spanishItemIds[index]),
      `${sourceLabel} debe mantener las mismas fichas canónicas de es.json en ${code}, sin fichas extra ni faltantes.`
    );

    for (const spanishItem of spanishItems) {
      const localizedItem = localizedItemsById.get(spanishItem?.id);
      assert(localizedItem, `${sourceLabel} debe traducir la ficha SEO canónica ${spanishItem?.id} en ${code}.`);
      for (const field of fieldsToMirror) {
        const expectedLength = Array.isArray(spanishItem?.[field]) ? spanishItem[field].length : 0;
        const actualLength = Array.isArray(localizedItem?.[field]) ? localizedItem[field].length : 0;
        assert(
          actualLength === expectedLength,
          `${sourceLabel} debe traducir exactamente la cobertura SEO de es.json en ${code}/${spanishItem?.id}.${field}: esperaba ${expectedLength}, encontró ${actualLength}.`
        );
      }
    }
  }
}

function assertSeoContentDepth(seoContent, sourceLabel = 'textX/seo/{isocode}.json') {
  const languages = seoContent?.languages || {};
  const bundles = Object.entries(languages).filter(([, bundle]) => bundle && Array.isArray(bundle.categories) && Array.isArray(bundle.items));
  assert(bundles.length === REQUIRED_LANGUAGE_COUNT, `${sourceLabel} debe incluir exactamente ${REQUIRED_LANGUAGE_COUNT} bundles SEO, uno por cada isocode de textX/languages.json.`);
  assert(Boolean(languages.es && languages.en), `${sourceLabel} debe conservar es.json como fuente final de producción y en.json como equivalente internacional.`);

  for (const [code, bundle] of bundles) {
    const categories = Array.isArray(bundle?.categories) ? bundle.categories : [];
    const items = Array.isArray(bundle?.items) ? bundle.items : [];
    const categoryIds = new Set(categories.map((category) => category.id));
    const ids = items.map((item) => item.id);
    const urls = items.map((item) => item.url);
    const hubKeywords = Array.isArray(bundle?.hubMetaKeywords) ? bundle.hubMetaKeywords : [];
    assert(categories.length >= 6, `${sourceLabel} debe mantener al menos 6 categorías SEO en ${code}.`);
    assert(items.length >= 39, `${sourceLabel} debe mantener al menos 39 fichas SEO indexables en ${code}.`);
    assert(['cotizador-tecnico-aprovechamiento', 'paginas-web-seo', 'chatbots-empresariales', 'nube-respaldo-datos', 'software-para-carpinterias', 'desarrollo-software-colombia-medellin', 'desarrollo-api-empresarial', 'software-seguro-empresas', 'transformacion-digital-empresas'].every((id) => ids.includes(id)), `${sourceLabel} debe conservar las fichas basadas en hashinmy.com para cotizadores, páginas web SEO, chatbots, nube, carpinterías, desarrollo local, API, software seguro y transformación digital en ${code}.`);
    assert(hubKeywords.length >= 20 && hubKeywords.some((keyword) => String(keyword).toLowerCase().includes('hashinmy.com')), `${sourceLabel} debe publicar hubMetaKeywords amplias y explícitas en ${code}, incluyendo hashinmy.com para discovery de buscadores e IA.`);
    assert(ids.length === new Set(ids).size, `${sourceLabel} tiene IDs duplicados en ${code}.`);
    assert(urls.length === new Set(urls).size, `${sourceLabel} tiene URLs duplicadas en ${code}.`);
    assert(normalizeSeoPath(bundle.hubUrl || '/').startsWith(`/${code}/`), `${sourceLabel} debe publicar hubUrl con prefijo /${code}/ para el isocode activo.`);
    assert(urls.every((url) => normalizeSeoPath(url).startsWith(`/${code}/`)), `${sourceLabel} debe publicar todas las URLs de ${code} con prefijo /${code}/.`);
    assert(['productos', 'industrias', 'casos-de-uso', 'formas-de-pago', 'proceso-confianza', 'glosario'].every((id) => categoryIds.has(id)), `${sourceLabel} debe conservar productos, industrias, casos de uso, formas de pago, proceso/confianza y glosario en ${code}.`);
    if (code !== 'en') {
      const rawCategoryLabels = categories
        .filter((category) => SEO_RAW_CATEGORY_CHROME_PATTERN.test(`${category?.label || ''} ${category?.description || ''}`))
        .map((category) => category.id || category.label || 'sin-id');
      assert(!rawCategoryLabels.length, `${sourceLabel} conserva categorías SEO visibles en inglés para ${code}: ${rawCategoryLabels.slice(0, 6).join(', ')}.`);
    }
    const seoUiLabels = bundle?.uiLabels || {};
    const missingSeoUiLabels = REQUIRED_SEO_UI_LABEL_KEYS.filter((key) => !String(seoUiLabels[key] || '').trim());
    assert(!missingSeoUiLabels.length, `${sourceLabel} debe publicar uiLabels completos para la vista clásica, ficha final, ARIA del hub y JSON-LD semántico en ${code}; faltan: ${missingSeoUiLabels.join(', ')}.`);
    assert(bundle.entryLabel === seoUiLabels.productsLabel && bundle.allLabel === seoUiLabels.allLabel && bundle.closeLabel === seoUiLabels.closeLabel && bundle.backLabel === seoUiLabels.backToProductsLabel && bundle.openDetailLabel === seoUiLabels.viewSolutionLabel, `${sourceLabel} debe sincronizar entry/all/close/back/openDetail con uiLabels en ${code} para que Productos y Vista clásica no usen rótulos genéricos.`);
    assert([seoUiLabels.categoryNavLabel, seoUiLabels.scopeCatalogLabel, seoUiLabels.glossarySetLabel].every((value) => String(value || '').includes('Hashinmy')), `${sourceLabel} debe localizar categoryNavLabel/scopeCatalogLabel/glossarySetLabel manteniendo la marca Hashinmy en ${code}.`);
    assertSeoNarrativeLocalized(code, bundle, languages.en, sourceLabel);
    assertSeoDiscoveryLocalized(code, bundle, languages.en, sourceLabel);
    assertSeoTechnicalTermsNative(code, bundle, sourceLabel);
    for (const item of items) {
      assert(categoryIds.has(item.category), `${sourceLabel} referencia una categoría inexistente en ${code}: ${item.id}.`);
      assert(!SEO_AUTOGENERATED_PLACEHOLDER_PATTERN.test(JSON.stringify(item)), `${sourceLabel} conserva narrativa SEO autogenerada o placeholder en ${code}/${item.id}; debe redactarse como contenido final de marca.`);
      assert(String(item.summary || '').length >= 70 && String(item.simple || '').length >= 70 && String(item.technical || '').length >= 70 && String(item.who || '').length >= 70, `${sourceLabel} debe conservar contenido descriptivo suficiente en ${code}/${item.id}.`);
      assert(Array.isArray(item.includes) && item.includes.length >= 4, `${sourceLabel} debe conservar al menos 4 puntos incluidos en ${code}/${item.id}.`);
      assert(Array.isArray(item.terms) && item.terms.length >= 3, `${sourceLabel} debe conservar glosario técnico en ${code}/${item.id}.`);
      assert(Array.isArray(item.sections) && item.sections.length >= 4, `${sourceLabel} debe conservar al menos 4 bloques editoriales SEO en ${code}/${item.id}.`);
      for (const section of item.sections || []) {
        assert(String(section.heading || '').length >= 10 && String(section.body || '').length >= 145, `${sourceLabel} tiene un bloque editorial SEO demasiado corto en ${code}/${item.id}.`);
      }
      assert(Array.isArray(item.faqs) && item.faqs.length >= 3, `${sourceLabel} debe conservar preguntas frecuentes indexables en ${code}/${item.id}.`);
      for (const faq of item.faqs || []) {
        assert(String(faq.question || '').length >= 18 && String(faq.answer || '').length >= 70, `${sourceLabel} tiene FAQ demasiado corta en ${code}/${item.id}.`);
      }
    }
  }
}


const SEO_RAW_CATEGORY_CHROME_PATTERN = /\b(?:Use cases|Process and trust|Products|Industries|Payment options|Glossary)\b/iu;
const SEO_AUTOGENERATED_PLACEHOLDER_PATTERN = /(?:Immersive Hashinmy-Erfahrung|Hashinmy εμπειρία|experiencia inmersiva Hashinmy|ruta con financiación o cotización directa)/iu;

const SEO_RAW_SPANISH_TECHNICAL_TERM_PATTERN = /\b(?:Base de conocimiento|Soporte evolutivo|Escalamiento humano|Permisos|Inventario)\b/iu;

const SEO_RAW_ENGLISH_NARRATIVE_PATTERN = /\b(?:We build|It helps|Companies already|Problem it solves|Plain-language explanation|How Hashinmy builds|Search-friendly terms|Possible full ecosystem|Offer visible on hashinmy\.com|What the company receives|SEO and AI discovery signal|What is Custom software|Who is Custom software|What does Custom software include|Does Hashinmy only create websites|The recommended path is to work in phases|Hashinmy works from Medellín|A company may know it needs technology|Current process map|Priority-based modules|Foundation to grow in phases|the internal part that stores data|the screen used by the client|secure connection between systems)\b/iu;
const SEO_NATIVE_NARRATIVE_FIELDS = ['summary', 'simple', 'technical', 'who'];

function collectSeoNarrativePairs(item = {}) {
  const pairs = [];
  for (const field of SEO_NATIVE_NARRATIVE_FIELDS) {
    if (typeof item?.[field] === 'string') pairs.push([field, item[field]]);
  }
  (Array.isArray(item?.includes) ? item.includes : []).forEach((value, index) => {
    if (typeof value === 'string') pairs.push([`includes.${index}`, value]);
  });
  (Array.isArray(item?.terms) ? item.terms : []).forEach((term, index) => {
    if (typeof term?.meaning === 'string') pairs.push([`terms.${index}.meaning`, term.meaning]);
  });
  (Array.isArray(item?.faqs) ? item.faqs : []).forEach((faq, index) => {
    if (typeof faq?.question === 'string') pairs.push([`faqs.${index}.question`, faq.question]);
    if (typeof faq?.answer === 'string') pairs.push([`faqs.${index}.answer`, faq.answer]);
  });
  (Array.isArray(item?.sections) ? item.sections : []).forEach((section, index) => {
    if (typeof section?.heading === 'string') pairs.push([`sections.${index}.heading`, section.heading]);
    if (typeof section?.body === 'string') pairs.push([`sections.${index}.body`, section.body]);
  });
  return pairs;
}


function assertSeoTechnicalTermsNative(code, bundle, sourceLabel = 'textX/seo/{isocode}.json') {
  if (code === 'es') return;
  const ignoredPath = /(?:^|\.)(?:id|url|hubUrl|siteUrl|slug|code|htmlLang|dir|iso|schemaVersion|updatedAt|category)$/u;
  const leaked = flattenTextValues(bundle).filter(([pathName, value]) => (
    !ignoredPath.test(pathName) && typeof value === 'string' && SEO_RAW_SPANISH_TECHNICAL_TERM_PATTERN.test(value)
  ));

  assert(
    !leaked.length,
    `${sourceLabel} conserva términos técnicos del glosario español en ${code}; deben traducirse usando textX/seo/es.json como base canónica. Ejemplos: ${leaked.slice(0, 8).map(([pathName]) => pathName).join(', ')}`
  );
}

function assertSeoNarrativeLocalized(code, bundle, englishBundle, sourceLabel = 'textX/seo/{isocode}.json') {
  if (code === 'es' || code === 'en') return;
  const englishItemsById = new Map((Array.isArray(englishBundle?.items) ? englishBundle.items : []).map((item) => [item?.id, item]));
  const copied = [];
  const rawEnglish = [];

  for (const item of Array.isArray(bundle?.items) ? bundle.items : []) {
    const englishItem = englishItemsById.get(item?.id) || {};
    const englishPairs = new Map(collectSeoNarrativePairs(englishItem));
    for (const [pathName, value] of collectSeoNarrativePairs(item)) {
      const normalized = String(value || '').trim();
      if (!normalized) continue;
      if (englishPairs.get(pathName) === value) copied.push(`${item.id}.${pathName}`);
      if (SEO_RAW_ENGLISH_NARRATIVE_PATTERN.test(normalized)) rawEnglish.push(`${item.id}.${pathName}`);
    }
  }

  assert(!copied.length, `${sourceLabel} conserva narrativa SEO copiada del inglés en ${code}; ejemplos: ${copied.slice(0, 8).join(', ')}.`);
  assert(!rawEnglish.length, `${sourceLabel} conserva frases narrativas crudas en inglés en ${code}; ejemplos: ${rawEnglish.slice(0, 8).join(', ')}.`);
}


const SEO_RAW_ENGLISH_DISCOVERY_PATTERN = /\b(?:financeable custom software|custom software development|software development|business system|custom business software|software to organize operations|AI for companies|business artificial intelligence|artificial intelligence for companies|artificial intelligence applied to software|business process automation|process automation|web apps PWA|business mobile apps|PC software systems|BI dashboards|ecommerce software|restaurant software|clinic software|logistics software|real estate software|education software|software payment options|software project financing|monthly software maintenance|API integrations|data migration|digital security|cloud software|cloud and data backup|technology glossary for companies|technical quoting and material optimization|technical calculators for carpentry|Google-ready AI-ready websites|CAD software with DXF export|CAD software|CAD development|CAD design automation|construction software|industrial process software|Manufacturing and|Project financing|Direct quote|Artificial intelligence|Digital security|Cloud backup|Technical quoter|Automated ecommerce|AI support|Organized internal operations|Technical diagnosis|Support and evolution|Development in Colombia and Medell[ií]n|Digital transformation for companies|Mobile apps|Web apps|installable PC programs|software for service businesses|inventory, production and reports|customer web portal|lightweight custom ERP|CRM and sales follow-up|API development|safe software|secure business software)\b/iu;
const SEO_DISCOVERY_SKIP_KEYS = new Set(['id', 'url', 'hubUrl', 'siteUrl', 'slug', 'code', 'htmlLang', 'dir', 'iso', 'name', 'nativeName', 'schemaVersion', 'updatedAt', 'category']);
const SEO_DISCOVERY_SKIP_PATH_ENDINGS = ['.term'];
const SEO_DISCOVERY_ALLOWED_SHARED_VALUE_PATTERN = /^(?:API|UX\/UI|CRM|ERP|DXF|CAD|BI|MVP|PWA|WhatsApp|Email|Hashinmy)$/iu;

function collectSeoDiscoveryPairs(source, prefix = '') {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source)) {
    return source.flatMap((item, index) => collectSeoDiscoveryPairs(item, `${prefix}[${index}]`));
  }
  return Object.entries(source).flatMap(([key, value]) => {
    const pathName = prefix ? `${prefix}.${key}` : key;
    if (SEO_DISCOVERY_SKIP_KEYS.has(key) || SEO_DISCOVERY_SKIP_PATH_ENDINGS.some((ending) => pathName.endsWith(ending))) return [];
    if (typeof value === 'string') return [[pathName, value]];
    if (value && typeof value === 'object') return collectSeoDiscoveryPairs(value, pathName);
    return [];
  });
}

function assertSeoDiscoveryLocalized(code, bundle, englishBundle, sourceLabel = 'textX/seo/{isocode}.json') {
  if (code === 'es' || code === 'en') return;
  const englishPairs = new Map(collectSeoDiscoveryPairs(englishBundle));
  const copied = [];
  const rawEnglish = [];

  for (const [pathName, value] of collectSeoDiscoveryPairs(bundle)) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    if (englishPairs.get(pathName) === normalized && !SEO_DISCOVERY_ALLOWED_SHARED_VALUE_PATTERN.test(normalized)) copied.push(pathName);
    if (SEO_RAW_ENGLISH_DISCOVERY_PATTERN.test(normalized)) rawEnglish.push(pathName);
  }

  assert(!copied.length, `${sourceLabel} conserva títulos, metadatos, keywords o textos SEO copiados del inglés en ${code}; ejemplos: ${copied.slice(0, 8).join(', ')}.`);
  assert(!rawEnglish.length, `${sourceLabel} conserva frases SEO/keywords crudas en inglés en ${code}; ejemplos: ${rawEnglish.slice(0, 8).join(', ')}.`);
}

function assertNativeMetaKeywordLocalization(code, bundle, sourceLabel = `textX/${code}.json`) {
  if (code === 'es' || code === 'en') return;
  const keywords = String(bundle?.meta?.keywords || '').trim();
  assert(!SEO_RAW_ENGLISH_DISCOVERY_PATTERN.test(keywords), `${sourceLabel} conserva meta.keywords con frases comerciales/SEO crudas en inglés para ${code}; debe usar términos nativos del idioma activo.`);
}

function valueAtPath(source, dottedPath) {
  return dottedPath.split('.').reduce((node, part) => (
    node && Object.prototype.hasOwnProperty.call(node, part) ? node[part] : undefined
  ), source);
}


function flattenTextValues(source, prefix = '') {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source)) {
    return source.flatMap((item, index) => flattenTextValues(item, `${prefix}[${index}]`));
  }
  return Object.entries(source).flatMap(([key, value]) => {
    const pathName = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') return flattenTextValues(value, pathName);
    return [[pathName, value]];
  });
}

function flattenTextKeys(source) {
  return flattenTextValues(source).map(([pathName]) => pathName).sort();
}

function assertNoEmptyTextStrings(code, bundle, sourceLabel = `textX/${code}.json`) {
  const emptyPaths = flattenTextValues(bundle)
    .filter(([pathName, value]) => (
      !['schemaVersion'].includes(pathName)
      && typeof value === 'string'
      && !value.trim()
    ))
    .map(([pathName]) => pathName);

  assert(
    !emptyPaths.length,
    `${sourceLabel} conserva textos vacíos sin traducción efectiva: ${emptyPaths.slice(0, 12).join(', ')}.`
  );
}

function assertBundleParity(code, bundle, spanishBundle) {
  const baseKeys = new Set(flattenTextKeys(spanishBundle));
  const bundleKeys = new Set(flattenTextKeys(bundle));
  const missing = [...baseKeys].filter((key) => !bundleKeys.has(key));
  const extra = [...bundleKeys].filter((key) => !baseKeys.has(key));

  assert(!missing.length, `${code}.json perdió ${missing.length} rutas frente a es.json. Ejemplos: ${missing.slice(0, 6).join(', ')}`);
  assert(!extra.length, `${code}.json agrega ${extra.length} rutas que no existen en es.json. Ejemplos: ${extra.slice(0, 6).join(', ')}`);

  for (const sceneName of REQUIRED_SCENES) {
    const expectedOptions = spanishBundle.scenes?.[sceneName]?.options?.length || 0;
    const actualOptions = bundle.scenes?.[sceneName]?.options?.length || 0;
    assert(actualOptions === expectedOptions, `${code}.json scenes.${sceneName}.options debe mantener ${expectedOptions} opciones como es.json; encontró ${actualOptions}.`);
  }

  assert((bundle.services?.length || 0) === (spanishBundle.services?.length || 0), `${code}.json debe mantener la misma cantidad de servicios que es.json.`);
}

function isHumanLocalizationValue(pathName, value) {
  if (typeof value !== 'string' || value.trim().length < 3) return false;
  if (['iso', 'name', 'nativeName', 'htmlLang', 'dir', 'schemaVersion'].includes(pathName)) return false;
  if (pathName.endsWith('.value') || pathName.endsWith('.file')) return false;
  if (pathName.includes('.tech') || pathName.includes('.symbol') || pathName.includes('.short') || pathName.includes('.core')) return false;
  if (TECHNICAL_LOCALIZATION_EXCEPTIONS.has(value)) return false;
  if (/^[A-Z0-9 /+.-]+$/.test(value)) return false;
  return true;
}

function assertLowEnglishLeakage(code, bundle, englishBundle) {
  if (code === 'en') return;
  const englishValues = new Map(flattenTextValues(englishBundle));
  const repeated = flattenTextValues(bundle).filter(([pathName, value]) => (
    isHumanLocalizationValue(pathName, value)
    && englishValues.get(pathName) === value
  ));
  assert(
    repeated.length <= MAX_VISIBLE_ENGLISH_MATCHES,
    `${code}.json conserva ${repeated.length} textos visibles iguales al inglés; máximo permitido ${MAX_VISIBLE_ENGLISH_MATCHES}. Ejemplos: ${repeated.slice(0, 5).map(([pathName]) => pathName).join(', ')}`
  );
}


function assertLowSpanishLeakage(code, bundle, spanishBundle) {
  if (code === 'es') return;
  const spanishValues = new Map(flattenTextValues(spanishBundle));
  const repeated = flattenTextValues(bundle).filter(([pathName, value]) => (
    isHumanLocalizationValue(pathName, value)
    && spanishValues.get(pathName) === value
  ));
  const maxAllowed = SPANISH_COGNATE_LANGUAGE_CODES.includes(code)
    ? MAX_VISIBLE_SPANISH_COGNATE_MATCHES
    : MAX_VISIBLE_SPANISH_MATCHES;
  assert(
    repeated.length <= maxAllowed,
    `${code}.json conserva ${repeated.length} textos visibles iguales al español; máximo permitido ${maxAllowed}. Ejemplos: ${repeated.slice(0, 5).map(([pathName]) => pathName).join(', ')}`
  );
}


function countLocalizationUnits(value = '') {
  return Array.from(String(value || '').replace(/\s+/g, '')).length;
}


function getSentenceFragments(value = '') {
  return String(value || '')
    .split(/[.!?;；。؟۔።।॥։။]+/u)
    .map((fragment) => fragment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function assertSummaryCommercialDepth(code, bundle) {
  const copy = String(bundle.scenes?.summary?.copy || '').trim();
  const normalizedLength = countLocalizationUnits(copy);
  const minUnits = SUMMARY_DEPTH_DENSE_CODES.has(code)
    ? MIN_SUMMARY_COPY_UNITS_BY_SCRIPT.dense
    : MIN_SUMMARY_COPY_UNITS_BY_SCRIPT.standard;
  const sentenceLikeBreaks = (copy.match(/[.!?;；。؟۔።।॥։။]\s*/gu) || []).length;
  const fragments = getSentenceFragments(copy);
  const isDenseSummaryLanguage = SUMMARY_DEPTH_DENSE_CODES.has(code);
  const keywordFragmentUnits = isDenseSummaryLanguage ? 8 : 18;
  const openingFragmentUnits = isDenseSummaryLanguage ? 12 : 26;
  const keywordFragments = fragments.filter((fragment) => countLocalizationUnits(fragment) < keywordFragmentUnits);
  const startsWithKeywordFragment = fragments.length >= 2 && countLocalizationUnits(fragments[0]) < openingFragmentUnits && countLocalizationUnits(fragments[1]) < openingFragmentUnits;

  assert(
    normalizedLength >= minUnits && sentenceLikeBreaks >= 1,
    `textX/${code}.json mantiene el copy de cierre demasiado corto o poco comercial: ${normalizedLength} unidades, mínimo ${minUnits}.`
  );
  assert(
    !startsWithKeywordFragment && keywordFragments.length <= 1,
    `textX/${code}.json mantiene el cierre fragmentado como lista de palabras clave; debe ser una frase comercial natural.`
  );
}

function assertPriorityNarrativeDepth(code, bundle) {
  if (!PRIORITY_LANGUAGE_CODES.includes(code)) return;
  const denseNarrativeCodes = new Set(['zh', 'ja', 'ko']);
  const isDense = denseNarrativeCodes.has(code);
  const copies = REQUIRED_SCENES
    .map((sceneName) => bundle.scenes?.[sceneName]?.copy || '')
    .filter((value) => String(value || '').trim());
  const lengths = copies.map(countLocalizationUnits);
  const averageLength = lengths.reduce((sum, value) => sum + value, 0) / Math.max(1, lengths.length);
  const minCopyLength = isDense ? 24 : 50;
  const minAverageLength = isDense ? 38 : 80;
  const shortScenes = REQUIRED_SCENES.filter((sceneName) => {
    const copy = bundle.scenes?.[sceneName]?.copy || '';
    return countLocalizationUnits(copy) < minCopyLength;
  });
  const compressedScenes = REQUIRED_SCENES.filter((sceneName) => {
    const copy = String(bundle.scenes?.[sceneName]?.copy || '');
    const bulletSeparators = (copy.match(/·/g) || []).length;
    return bulletSeparators >= 2 && countLocalizationUnits(copy) < (isDense ? 52 : 120);
  });

  assert(!shortScenes.length, `${code}.json mantiene copy demasiado breve en escenas prioritarias: ${shortScenes.slice(0, 5).join(', ')}.`);
  assert(averageLength >= minAverageLength, `${code}.json tiene narrativa localizada demasiado comprimida: promedio ${averageLength.toFixed(1)}, mínimo ${minAverageLength}.`);
  assert(!compressedScenes.length, `${code}.json conserva narrativa tipo keyword con separadores en: ${compressedScenes.slice(0, 5).join(', ')}.`);
}


function assertNoKeywordOnlySceneCopy(code, bundle) {
  const keywordOnlyScenes = REQUIRED_SCENES.filter((sceneName) => {
    const copy = String(bundle.scenes?.[sceneName]?.copy || '');
    const bulletSeparators = (copy.match(/·/g) || []).length;
    return bulletSeparators >= 1;
  });

  assert(
    !keywordOnlyScenes.length,
    `${code}.json conserva narrativa de escenas con separadores tipo keyword en: ${keywordOnlyScenes.slice(0, 6).join(', ')}. El copy debe leerse como texto comercial natural.`
  );
}



function commonPrefixLength(left = '', right = '') {
  const leftText = String(left || '');
  const rightText = String(right || '');
  const maxLength = Math.min(leftText.length, rightText.length);
  let index = 0;
  while (index < maxLength && leftText[index] === rightText[index]) index += 1;
  return index;
}

function assertNoTemplatedSceneCopyOpening(code, bundle) {
  const decisionSceneCopies = REQUIRED_SCENES
    .filter((sceneName) => sceneName !== 'summary')
    .map((sceneName) => String(bundle.scenes?.[sceneName]?.copy || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const commonPrefixes = [];
  for (let leftIndex = 0; leftIndex < decisionSceneCopies.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < decisionSceneCopies.length; rightIndex += 1) {
      commonPrefixes.push(commonPrefixLength(decisionSceneCopies[leftIndex], decisionSceneCopies[rightIndex]));
    }
  }

  const averagePrefix = commonPrefixes.reduce((sum, value) => sum + value, 0) / Math.max(1, commonPrefixes.length);
  const maxPrefix = Math.max(0, ...commonPrefixes);

  assert(
    averagePrefix <= COMMON_SCENE_COPY_PREFIX_LIMIT_AVG && maxPrefix <= COMMON_SCENE_COPY_PREFIX_LIMIT_MAX,
    `textX/${code}.json conserva una apertura casi idéntica entre escenas: promedio ${averagePrefix.toFixed(1)}, máximo ${maxPrefix}. Cada escena debe iniciar con foco propio del flujo, no con una plantilla repetida.`
  );
}

function assertDistinctDecisionSceneCopy(code, bundle) {
  const decisionSceneCopies = REQUIRED_SCENES
    .filter((sceneName) => sceneName !== 'summary')
    .map((sceneName) => String(bundle.scenes?.[sceneName]?.copy || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const uniqueCopies = new Set(decisionSceneCopies);

  assert(
    uniqueCopies.size >= 6,
    `textX/${code}.json reutiliza demasiado el mismo copy entre escenas de decisión: ${uniqueCopies.size} textos únicos. Cada idioma debe mantener narrativa adaptada por escena.`
  );
}


function countLocalizedKeywordSeparators(value = '') {
  return (String(value || '').match(/[،؛၊·]+/gu) || []).length;
}

function getLocalizedSentenceFragments(value = '') {
  return String(value || '')
    .split(/[.!?;；。؟۔።।॥։။،؛，、၊·]+/u)
    .map((fragment) => fragment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function assertNoCompressedKeywordLead(code, bundle) {
  const compressedScenes = REQUIRED_SCENES.filter((sceneName) => {
    if (sceneName === 'summary') return false;

    const copy = String(bundle.scenes?.[sceneName]?.copy || '').trim();
    const brandIndex = copy.indexOf('Hashinmy');
    if (brandIndex <= 0) return false;

    const lead = copy.slice(0, brandIndex).trim();
    if (lead.length >= 210) return false;

    const localizedKeywordSeparators = countLocalizedKeywordSeparators(lead);
    const fragments = getLocalizedSentenceFragments(lead);
    const startsWithLowercase = /^\p{Ll}/u.test(lead);
    const shortFragmentLimit = code === 'my' ? 48 : 34;
    const hasStackedKeywordFragments = fragments.length >= 3
      && fragments.slice(0, 3).every((fragment) => countLocalizationUnits(fragment) <= shortFragmentLimit);

    return startsWithLowercase || (localizedKeywordSeparators >= 3 && hasStackedKeywordFragments);
  });

  assert(
    !compressedScenes.length,
    `${code}.json conserva inicio de copy tipo lista de palabras clave antes de la narrativa comercial en: ${compressedScenes.slice(0, 6).join(', ')}. Debe leerse como una frase natural del idioma, incluyendo idiomas con puntuación no latina.`
  );
}

function assertNaturalOptionInsights(code, bundle, sourceLabel = `textX/${code}.json`) {
  const weakInsights = [];
  const scriptKind = getLocalizationScriptKind(code);
  const minInsightUnits = scriptKind === 'dense' ? 16 : 30;
  const shortFragmentLimit = scriptKind === 'dense' ? 12 : 24;

  REQUIRED_SCENES.forEach((sceneName) => {
    const options = bundle.scenes?.[sceneName]?.options;
    if (!Array.isArray(options)) return;

    options.forEach((option, index) => {
      const insight = String(option?.insight || '').replace(/\s+/g, ' ').trim();
      const fragments = getSentenceFragments(insight);
      const units = countLocalizationUnits(insight);
      const compressedFragments = fragments.length >= 3
        && fragments.every((fragment) => countLocalizationUnits(fragment) <= shortFragmentLimit);
      const hasRawBulletSeparator = /·/.test(insight);

      if (!insight || units < minInsightUnits || compressedFragments || hasRawBulletSeparator) {
        weakInsights.push(`scenes.${sceneName}.options.${index}.insight`);
      }
    });
  });

  assert(
    !weakInsights.length,
    `${sourceLabel} conserva insights de opciones como listas de palabras clave o textos demasiado cortos; deben leerse como microcopy natural del idioma. Ejemplos: ${weakInsights.slice(0, 8).join(', ')}`
  );
}

function assertNaturalSceneInsights(code, bundle, sourceLabel = `textX/${code}.json`) {
  const weakInsights = [];
  const scriptKind = getLocalizationScriptKind(code);
  const minInsightUnits = scriptKind === 'dense' ? 18 : 34;
  const shortFragmentLimit = scriptKind === 'dense' ? 12 : 24;

  REQUIRED_SCENES.forEach((sceneName) => {
    const insight = String(bundle.scenes?.[sceneName]?.insight || '').replace(/\s+/g, ' ').trim();
    const fragments = getSentenceFragments(insight);
    const units = countLocalizationUnits(insight);
    const compressedFragments = fragments.length >= 3
      && fragments.every((fragment) => countLocalizationUnits(fragment) <= shortFragmentLimit);
    const hasRawBulletSeparator = /·/.test(insight);

    if (!insight || units < minInsightUnits || compressedFragments || hasRawBulletSeparator) {
      weakInsights.push(`scenes.${sceneName}.insight`);
    }
  });

  assert(
    !weakInsights.length,
    `${sourceLabel} conserva insights de escenas vacíos, demasiado cortos o como listas de palabras clave; cada escena debe sostener la narrativa estratégica de Hashinmy. Ejemplos: ${weakInsights.slice(0, 8).join(', ')}`
  );
}

function assertVisibleTechnicalLocalization(code, bundle, englishBundle) {
  if (code === 'en' || code === 'es') return;

  const notLocalized = LOCALIZED_VISIBLE_TECH_KEYS.filter((key) => {
    const value = valueAtPath(bundle, key);
    const englishValue = valueAtPath(englishBundle, key);
    return typeof value !== 'string' || !value.trim() || value === englishValue;
  });

  const technicalBase = String(bundle.ui?.technicalBase || '').trim();
  if (RAW_ARCHITECTURE_UI_LABEL_PATTERN.test(technicalBase)) {
    notLocalized.push('ui.technicalBase');
  }

  assert(
    !notLocalized.length,
    `${code}.json mantiene textos técnicos visibles sin adaptar: ${notLocalized.join(', ')}.`
  );
}

const STRICT_VISUAL_LOCALIZATION_LANGUAGE_CODES = new Set(['fil', 'bn', 'mr', 'ta', 'te']);
const RAW_VISUAL_BUILD_PATTERN = /^Build$/u;
const RAW_STRICT_VISUAL_TERM_PATTERN = /\b(?:route|proposal|Operation|seguridad|ruta)\b/iu;
const RAW_VISUAL_TERM_IGNORED_PATHS = new Set(['iso', 'name', 'nativeName', 'htmlLang', 'dir', 'schemaVersion']);

function assertNoRawVisualLocalizationLeakage(code, bundle, sourceLabel = `textX/${code}.json`) {
  if (code === 'en' || code === 'es') return;

  const rawVisualLabels = ['sceneAssets.buildType.symbol', 'scenes.buildType.core']
    .filter((pathName) => RAW_VISUAL_BUILD_PATTERN.test(String(valueAtPath(bundle, pathName) || '').trim()));

  const rawPriorityTerms = STRICT_VISUAL_LOCALIZATION_LANGUAGE_CODES.has(code)
    ? flattenTextValues(bundle).filter(([pathName, value]) => (
      !RAW_VISUAL_TERM_IGNORED_PATHS.has(pathName)
      && !pathName.endsWith('.value')
      && !pathName.endsWith('.tech')
      && !pathName.endsWith('.file')
      && typeof value === 'string'
      && RAW_STRICT_VISUAL_TERM_PATTERN.test(value)
    )).map(([pathName]) => pathName)
    : [];

  assert(
    !rawVisualLabels.length && !rawPriorityTerms.length,
    `${sourceLabel} conserva términos visuales crudos sin adaptar al idioma seleccionado: ${[...rawVisualLabels, ...rawPriorityTerms].slice(0, 10).join(', ')}.`
  );
}


function assertPriorityLanguageQuality(code, bundle, englishBundle) {
  if (!PRIORITY_LANGUAGE_CODES.includes(code)) return;
  for (const key of LOCALIZED_PUBLIC_KEYS) {
    const value = valueAtPath(bundle, key);
    const englishValue = valueAtPath(englishBundle, key);
    assert(typeof value === 'string' && value.trim().length > 0, `${code}.json debe tener ${key} localizado.`);
    assert(value !== englishValue, `${code}.json mantiene ${key} igual al inglés; debe estar adaptado al idioma seleccionado.`);
  }
}



function jsSingleQuoted(value = '') {
  return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function assertProfessionalFallbackLanguageCatalog(jsText, languages, sourceLabel = 'JS') {
  assert(
    jsText.includes('const fallbackLanguageCatalogItems = [')
      && jsText.includes('const supportedLanguageCodes = fallbackLanguageCatalogItems.map(({ code }) => code);')
      && jsText.includes('return fallbackLanguageCatalogItems.map((language) => ({ ...language }));')
      && jsText.includes('state.languageCatalog.length ? state.languageCatalog : fallbackLanguageCatalog()'),
    `${sourceLabel} debe mantener un catálogo fallback profesional con nombres nativos, htmlLang y dir, no solo códigos ISO.`
  );

  assert(
    jsText.includes('const DEFAULT_LANGUAGE_CACHE_LIMIT = 50;')
      && jsText.includes('function buildNormalizedLanguageCatalog')
      && jsText.includes('function isCompleteLanguageCatalog')
      && jsText.includes('function getDetectedLanguageCodesFromProjectStructure')
      && jsText.includes('function loadDetectedLanguageCatalogFromProjectStructure')
      && jsText.includes('PROJECT_STRUCTURE_PATH')
      && jsText.includes("const validDirections = new Set(['ltr', 'rtl']);")
      && jsText.includes('hasCompleteMetadata')
      && jsText.includes('catálogo dinámico de idiomas vacío'),
    `${sourceLabel} debe detectar el catálogo de idiomas desde textX y textX/seo, validar name/nativeName/htmlLang/dir y degradar a español sin romper ejecución.`
  );

  const missingFallbackLanguages = (Array.isArray(languages) ? languages : []).filter((language) => !(
    jsText.includes(`code: ${jsSingleQuoted(language.code)}`)
      && jsText.includes(`nativeName: ${jsSingleQuoted(language.nativeName)}`)
      && jsText.includes(`htmlLang: ${jsSingleQuoted(language.htmlLang || language.code)}`)
      && jsText.includes(`dir: ${jsSingleQuoted(language.dir || 'ltr')}`)
  )).map((language) => language.code);

  assert(
    !missingFallbackLanguages.length,
    `${sourceLabel} no replica en fallback los metadatos profesionales de idiomas: ${missingFallbackLanguages.slice(0, 10).join(', ')}.`
  );
}



function assertAtomicChoiceTransition(jsText, sourceLabel = 'JS') {
  const handlerMatch = String(jsText || '').match(/function handleOptionClick\(event\) \{[\s\S]*?\n  \}\n\n  async function writeClipboardText/);
  assert(handlerMatch, `${sourceLabel} debe conservar handleOptionClick antes de writeClipboardText.`);

  const handler = handlerMatch[0];
  const nextSceneIndex = handler.indexOf('const nextScene = resolveNextScene(choice);');
  const recordChoiceIndex = handler.indexOf('recordChoice(choice, Number(button.dataset.choiceIndex));');
  const gotoSceneIndex = handler.indexOf('gotoScene(nextScene, true, previousSnapshot);');
  const transitionCalls = handler.match(/gotoScene\(/g) || [];

  assert(
    nextSceneIndex >= 0 && recordChoiceIndex > nextSceneIndex && gotoSceneIndex > recordChoiceIndex,
    `${sourceLabel} debe resolver la escena destino una sola vez antes de mutar respuestas/auditoría; así el flujo no cambia por side effects de recordChoice.`
  );
  assert(
    transitionCalls.length === 1 && !handler.includes('gotoScene(resolveNextScene(choice), true, previousSnapshot)'),
    `${sourceLabel} debe ejecutar una sola transición por selección de opción y reutilizar nextScene para evitar dobles saltos o cambios de ruta por mutaciones intermedias.`
  );
}

function extractWebpReferences(jsText) {
  const references = [...jsText.matchAll(/file:\s*['"]([^'"]+\.webp)['"]/g)].map((match) => match[1]);
  return unique(references);
}


function assertProofLogoDisplayNames(manifest, jsText, buildScript, sourceLabel = 'assets/clientes/clientes-manifest.json') {
  const logos = Array.isArray(manifest?.logos) ? manifest.logos : [];
  const rawNamePattern = /(^|[\s._-])(?:logo|logos|cliente|clientes|client|clients|customer|customers|brand|brands|marca|marcas)[\s._-]+|_/iu;
  const invalidNames = logos
    .map((logo) => String(logo?.name || '').trim())
    .filter((name) => !name || rawNamePattern.test(name));

  assert(
    !invalidNames.length,
    `${sourceLabel} debe guardar captions de logos como nombres comerciales limpios, sin prefijos técnicos ni guiones bajos visibles: ${invalidNames.slice(0, 8).join(', ')}`
  );

  assert(
    jsText.includes('function formatProofLogoDisplayName')
      && jsText.includes('PROOF_LOGO_DISPLAY_WORD_OVERRIDES')
      && buildScript.includes('function formatProofLogoDisplayName')
      && buildScript.includes('PROOF_LOGO_DISPLAY_WORD_OVERRIDES'),
    'Los logos de Nuestra Experiencia deben normalizar nombres derivados de archivo a captions comerciales antes de renderizar y antes de generar el manifiesto.'
  );
}

async function readJson(relativePath) {
  return JSON.parse(await readRelative(relativePath));
}

function normalizeLanguageCatalogEntry(entry = {}, fallbackCode = '') {
  const code = String(entry.code || entry.iso || fallbackCode || '').trim().toLowerCase();
  if (!code) return null;
  const dir = String(entry.dir || 'ltr').trim().toLowerCase() === 'rtl' ? 'rtl' : 'ltr';
  return {
    code,
    name: String(entry.name || code.toUpperCase()).trim(),
    nativeName: String(entry.nativeName || entry.name || code.toUpperCase()).trim(),
    htmlLang: String(entry.htmlLang || code).trim(),
    dir
  };
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

async function readDetectedLanguageManifest() {
  const textRoot = path.join(root, 'textX');
  const seoRoot = path.join(root, 'textX', 'seo');
  const textEntries = await readdir(textRoot, { withFileTypes: true });
  const seoEntries = await readdir(seoRoot, { withFileTypes: true });
  const seoCodes = new Set(seoEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.basename(entry.name, '.json').trim().toLowerCase())
    .filter(Boolean));
  const languages = [];
  const seen = new Set();

  for (const entry of textEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'languages.json') continue;
    const code = path.basename(entry.name, '.json').trim().toLowerCase();
    if (!code || !seoCodes.has(code) || seen.has(code)) continue;
    const bundle = await readJson(`textX/${entry.name}`);
    const normalized = normalizeLanguageCatalogEntry(bundle, code);
    if (!normalized) continue;
    seen.add(normalized.code);
    languages.push(normalized);
  }

  return { defaultLanguage: 'es', languages: sortLanguageCatalog(languages) };
}

async function readSeoContentFromTextX() {
  const manifest = await readDetectedLanguageManifest();
  const allowedCodes = new Set(manifest.languages.map((language) => language.code));
  const seoRoot = path.join(root, 'textX', 'seo');
  const entries = await readdir(seoRoot, { withFileTypes: true });
  const languages = {};
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const code = path.basename(entry.name, '.json').trim().toLowerCase();
    if (!code || !allowedCodes.has(code)) continue;
    const bundle = await readJson(`textX/seo/${entry.name}`);
    languages[bundle.code || code] = { ...bundle, code: bundle.code || code };
  }
  return { schemaVersion: 1, siteUrl: PUBLIC_SITE_URL, languages };
}


function assertLanguageManifestMetadata(languages, sourceLabel = 'textX/languages.json') {
  const validDirections = new Set(['ltr', 'rtl']);
  const incomplete = (Array.isArray(languages) ? languages : []).filter((language) => !(
    language?.code
    && language?.name
    && language?.nativeName
    && language?.htmlLang
    && validDirections.has(language?.dir)
  ));

  assert(
    !incomplete.length,
    `${sourceLabel} debe declarar code, name, nativeName, htmlLang y dir válido para cada idioma; incompletos: ${incomplete.slice(0, 8).map((language) => language?.code || '(sin código)').join(', ')}`
  );
}

function assertBundleSchema(code, bundle) {
  assert(bundle.iso === code, `${code}.json debe declarar iso=${code}.`);
  assert(bundle.name && bundle.nativeName && bundle.htmlLang && bundle.dir, `${code}.json debe declarar name, nativeName, htmlLang y dir.`);
  assert(bundle.meta?.title && bundle.meta?.description && bundle.meta?.applicationName && bundle.meta?.keywords, `${code}.json debe incluir meta.title, meta.description, meta.keywords y meta.applicationName.`);
  for (const key of REQUIRED_UI_KEYS) {
    assert(bundle.ui?.[key], `${code}.json debe incluir ui.${key}.`);
  }
  for (const sceneName of REQUIRED_SCENES) {
    const scene = bundle.scenes?.[sceneName];
    assert(scene, `${code}.json debe incluir scenes.${sceneName}.`);
    assert(scene?.title !== undefined && scene?.copy !== undefined && scene?.progress !== undefined, `${code}.json scenes.${sceneName} debe incluir title, copy y progress.`);
    assert(Array.isArray(scene?.options), `${code}.json scenes.${sceneName}.options debe ser arreglo.`);
    assert(scene.options.length <= 3, `${code}.json scenes.${sceneName} supera 3 opciones.`);
    for (const option of scene.options) {
      assert(option.label && (option.hint || option.tech), `${code}.json scenes.${sceneName} tiene una opción sin label/hint.`);
    }
  }
  assert(Array.isArray(bundle.services) && bundle.services.length >= 6, `${code}.json debe incluir servicios localizados.`);
  assert(bundle.labels?.serviceFamily && bundle.valueLabels?.financiamiento_100, `${code}.json debe incluir labels y valueLabels.`);
  assert(bundle.recommendation?.defaults && bundle.recommendation?.technicalParts && bundle.recommendation?.nextSteps, `${code}.json debe incluir textos de recomendación.`);
}


function assertFirstSceneSpanishParity(code, bundle, spanishBundle, sourceLabel = `textX/${code}.json`) {
  const intro = bundle.scenes?.intro || {};
  const spanishIntro = spanishBundle.scenes?.intro || {};
  const introMetrics = bundle.metricsByScene?.intro;
  const introAsset = bundle.sceneAssets?.intro || {};
  const assetLabel = String(introAsset.label || '').trim();
  const financingLeakPattern = /\b(?:financ(?:e|ing|iamiento|iaci[oó]n|iamento|iamento|iation|ier|ière|ierung|iar|iară)?|funding|funded|loan|credit|cr[eé]dito|quote|quotation|cotizaci[oó]n)\b|تمويل|تأمین\s*مالی|מימון|वित्त|अर्थ|অর্থায়ন|বিত্তায়ন|ફાઇનાન્સિંગ|ਫਾਇਨੈਂਸਿੰਗ|ଅର୍ଥଯୋଗାଣ|මුල්‍යකරණය|ငွေကြေးထောက်ပံ့မှု|การจัดไฟแนนซ์|資金計画|자금|融资|融資|фінансування|финансирование|financiamento|finançament|financement|finansiering|rahoitus|finansman|pembiayaan|pagpopondo|ufadhili|tài trợ/iu;

  assert(intro?.title && intro?.copy && intro?.optionQuestion && intro?.insight, `${sourceLabel} debe mantener todos los textos narrativos de la primera escena localizados.`);
  assert(Array.isArray(intro.options) && intro.options.length === spanishIntro.options?.length, `${sourceLabel} debe conservar la misma cantidad de opciones que textX/es.json en la primera escena.`);
  assert(introAsset.symbol === spanishBundle.sceneAssets?.intro?.symbol, `${sourceLabel} debe conservar el símbolo visual de la primera escena sincronizado con español.`);
  assert(assetLabel && !assetLabel.includes('·') && !financingLeakPattern.test(assetLabel), `${sourceLabel} sceneAssets.intro.label debe decir solo “capital protegido” adaptado al idioma, sin añadir financiación ni modalidad.`);
  assert(Array.isArray(introMetrics) && introMetrics.length === 3 && introMetrics.every((item) => Array.isArray(item) && item.length === 2 && item.every((value) => String(value || '').trim())), `${sourceLabel} metricsByScene.intro debe conservar exactamente tres métricas equivalentes a Web/a medida, IA/automatización y PC/móvil.`);
}


function assertIntroDiagnosticDecision(code, bundle, sourceLabel = `textX/${code}.json`) {
  const intro = bundle.scenes?.intro || {};
  const options = Array.isArray(intro.options) ? intro.options : [];
  const firstOption = options[0] || {};
  const scriptKind = getLocalizationScriptKind(code);
  const minInsightUnits = scriptKind === 'dense' ? 34 : 72;

  assert(
    options.length === 3,
    `${sourceLabel} debe abrir la experiencia con tres entradas: diagnóstico operativo, financiación 100% y cotización directa.`
  );
  assert(
    firstOption.label && firstOption.hint && firstOption.tech && firstOption.insight && countLocalizationUnits(firstOption.insight) >= minInsightUnits,
    `${sourceLabel} debe mantener una primera opción de diagnóstico operativo con label, hint, tech e insight narrativo suficientemente claro.`
  );

  if (code === 'es') {
    assert(
      /diagn[oó]stico\s+operativo/iu.test(firstOption.label) && /tiempo,\s*dinero\s+o\s+informaci[oó]n/iu.test(firstOption.hint),
      `${sourceLabel} debe usar español como base: la primera opción debe ser “Diagnóstico operativo” y explicar pérdidas de tiempo, dinero o información.`
    );
    assert(
      /financiaci[oó]n\s+100%/iu.test(options[1]?.label || '') && /cotizaci[oó]n\s+directa/iu.test(options[2]?.label || ''),
      `${sourceLabel} debe ordenar la primera escena como diagnóstico, financiación 100% y cotización directa.`
    );
  }
}


function assertNoRawSpanishSeoTermLeakage(code, seoBundle, sourceLabel = `textX/seo/${code}.json`) {
  if (code === 'es') return;
  const rawSpanishTermPattern = /\b(?:Arquitectura por fases|Asistente contextual|Automatización inteligente|Sincronización|Operación offline|Instalador|Diseño paramétrico|Automatización CAD|Alcance financiable|Capital protegido|Valor temprano|Conciliación|Autenticación|Autorización|Analítica|Auditoría|Conversión|Geolocalización|Criterio de aceptación|Iteración|Despliegue|Motor de cálculo|Orden de producción|Diagnóstico|Digitalización|Automatización|Escalabilidad|Validación|Notificación|Recordatorio automático|Módulo)\b/iu;
  const leaks = [];
  (seoBundle.items || []).forEach((item, itemIndex) => {
    (item.terms || []).forEach((term, termIndex) => {
      const visibleTerm = String(term?.term || '').trim();
      if (rawSpanishTermPattern.test(visibleTerm)) {
        leaks.push(`items[${itemIndex}].terms[${termIndex}].term=${visibleTerm}`);
      }
    });
  });
  assert(!leaks.length, `${sourceLabel} conserva términos SEO visibles en español sin sincronizar: ${leaks.slice(0, 12).join(', ')}`);
}

function assertBundleCatalogMetadata(code, bundle, languages, sourceLabel = `textX/${code}.json`) {
  const catalogLanguage = (Array.isArray(languages) ? languages : []).find((language) => language.code === code);
  assert(catalogLanguage, `${sourceLabel} debe existir también en textX/languages.json.`);
  if (!catalogLanguage) return;

  const fields = ['name', 'nativeName', 'htmlLang', 'dir'];
  const mismatches = fields.filter((field) => String(bundle?.[field] || '').trim() !== String(catalogLanguage?.[field] || '').trim());
  assert(
    !mismatches.length,
    `${sourceLabel} debe mantener metadatos name/nativeName/htmlLang/dir idénticos al catálogo central; diferencias: ${mismatches.join(', ')}`
  );
}

const indexHtml = await readRelative('index.html');
const cssText = await readRelative('css/hashinmy-immersive.css');
const classicCssText = await readRelative('css/hashinmy-classic.css');
const jsText = await readRelative('js/hashinmy-immersive.js');
const buildScript = await readRelative('scripts/build-immersive.mjs');
const renderConfig = await readRelative('render.yaml');
const detectedLanguageManifest = await readDetectedLanguageManifest();
REQUIRED_LANGUAGE_COUNT = detectedLanguageManifest.languages.length;
const seoContent = await readSeoContentFromTextX();
const llmsText = await readRelative('llms.txt');
try {
  new Function(jsText);
} catch (error) {
  failures.push(`js/hashinmy-immersive.js no supera validación sintáctica: ${error.message}`);
}

assertAtomicChoiceTransition(jsText, 'js/hashinmy-immersive.js');

assert(
  jsText.includes(`intro: {
      options: [
        { next: 'serviceFamily', sets: [{ key: 'financing', value: 'contacto_directo' }] },
        { next: 'serviceFamily', sets: [{ key: 'financing', value: 'financiamiento_100' }], priority: 'high' },
        { next: 'serviceFamily', sets: [{ key: 'financing', value: 'sin_financiacion' }] }`),
  'La escena inicial debe mantener diagnóstico, financiación y cotización, pero solo la financiación 100% debe llevar priority high sin romper el avance a serviceFamily.'
);

assert(jsText.includes('function getSeoUiLabel') && jsText.includes("getSeoUiLabel('classicViewLabel'") && jsText.includes("getSeoUiLabel('modernViewLabel'") && jsText.includes("getSeoUiLabel('detailLead'") && jsText.includes("getSeoUiLabel('scopeCatalogLabel'") && jsText.includes("getSeoUiLabel('glossarySetLabel'") && jsText.includes("getSeoUiLabel('categoryNavLabel'") && jsText.includes('function applyLocalizedSeoDomText') && jsText.includes('data-seo-i18n-text') && jsText.includes('data-seo-i18n-aria'), 'js/hashinmy-immersive.js debe resolver rótulos SEO clásicos/modernos, ARIA del hub y nombres semánticos JSON-LD desde textX/seo/{isocode}.json y no con fallback genérico por idioma.');
assert(!/hm-seo-detail__terms[\s\S]*?<dt>\$\{escapeHtml\(glossaryLabel\)\}<\/dt>\s*<dt>\$\{escapeHtml\(glossaryLabel\)\}<\/dt>/.test(jsText), 'La ficha SEO runtime no debe duplicar el título del glosario técnico.');

const webpReferences = extractWebpReferences(jsText);
assert(webpReferences.length >= 7, 'La experiencia debe referenciar varias escenas visuales .webp con fallback.');
for (const asset of webpReferences) {
  const promptPath = path.join(root, 'assets', `${asset}.txt`);
  if (!(await exists(promptPath))) {
    failures.push(`Falta prompt visual para assets/${asset}.txt`);
    continue;
  }
  const prompt = await readFile(promptPath, 'utf8');
  assert(prompt.includes(`Formato final: ${asset}`), `El prompt ${asset}.txt debe declarar su formato final.`);
  assert(prompt.includes('retícula 12x8') && prompt.includes('eje diagonal principal'), `El prompt ${asset}.txt debe mantener la regla matemática visual común.`);
  assert(prompt.length >= 1500, `El prompt ${asset}.txt debe ser suficientemente detallado para una escena premium coordinada.`);
}

if (!assetsOnly) {
  assert(indexHtml.includes('data-i18n-text="ui.skip"') && indexHtml.includes('data-i18n-aria="ui.stageLabel"'), 'index.html debe consumir textos estáticos desde textX mediante data-i18n.');
  assert(indexHtml.includes('<html lang="es" dir="ltr" data-language="es" data-text-script="latin"'), 'index.html debe declarar lang/dir/data-language/data-text-script desde el primer byte para que CSS i18n y responsive actúen antes del runtime.');
  assert(indexHtml.includes('hm-transition-pulse" data-i18n-text="meta.applicationName"') && indexHtml.includes('<strong data-i18n-text="meta.applicationName"></strong>') && indexHtml.includes('property="og:site_name" content="Hashinmy" data-i18n-content="meta.applicationName"'), 'La marca visible, la transición y el site_name deben tomar el nombre público desde textX/meta.applicationName, no desde texto hardcodeado.');
  assert(indexHtml.includes('meta name="keywords" data-i18n-content="meta.keywords" content=""') && jsText.includes("t('meta.keywords', '')"), 'Los meta keywords base deben salir de textX/meta.keywords por idioma y conservar fallback runtime localizado si el SEO bundle aún no está disponible.');
  assert(indexHtml.includes('hmLanguageSelect') && indexHtml.includes('data-i18n-aria="ui.languageAria"'), 'La escena inicial debe conservar selector de idioma conectado a i18n.');
  assert(!indexHtml.includes('Bienvenido a HASHINMY') && !indexHtml.includes('Financiar YA') && !indexHtml.includes('Saltar a la pregunta actual'), 'index.html no debe conservar textos visibles de UI hardcodeados.');
  assert(indexHtml.includes('aria-live="polite"') && indexHtml.includes('aria-busy="false"'), 'La experiencia debe mantener señales ARIA de transición y estado.');
  assert(indexHtml.includes('dataset.theme') && indexHtml.includes('timezoneToCountry[timeZone] || localeRegion'), 'index.html debe aplicar tema automático antes de cargar CSS.');
  assert(indexHtml.includes('data-logo-mark') && indexHtml.includes('hashinmy-logo-emblem.png'), 'index.html debe mantener marca Hashinmy con fallback y favicon.');
  assert(indexHtml.includes('rel="canonical"'), 'index.html debe mantener canonical base para SEO.');
  assert(indexHtml.includes('type="text/plain" title="Hashinmy llms.txt" href="https://hashinmy.com/llms.txt"'), 'index.html debe exponer llms.txt desde el head como señal directa para rastreadores de IA.');
  assertLlmsDiscoveryCompleteness(llmsText, seoContent, 'llms.txt');
  assert(buildScript.includes('function buildLlmsTxtFromSeoContent') && buildScript.includes('async function writeLlmsTxt') && buildScript.includes('writeLlmsTxt(seoContent)'), 'El build debe regenerar dist/llms.txt desde textX/seo/{isocode}.json para que el mapa de IA no quede desactualizado cuando se agreguen fichas.');
  assert(buildScript.includes('hydrateStaticSeoFallback') && buildScript.includes('readSpanishTextBundle') && buildScript.includes('data-hashinmy-hreflang="static"'), 'El build debe hidratar metadatos SEO/hreflang estáticos desde textX/es.json para crawlers y previews sin depender de JS.');
  assert(buildScript.includes('function hydrateStaticDomTextFallback') && buildScript.includes('data-i18n-text') && buildScript.includes('data-i18n-aria') && buildScript.includes('hydrateStaticHtmlFallback'), 'El build debe hidratar también textos visibles/ARIA/placeholders desde textX/es.json para que dist/index.html no dependa de JS para el primer contenido o crawlers básicos.');
  assert(buildScript.includes('function getLanguageTextScript') && buildScript.includes("data-text-script") && buildScript.includes("data-language"), 'El build debe escribir data-language/data-text-script estáticos por idioma para que las reglas CSS de RTL, alfabetos densos e indic se apliquen antes de ejecutar JS.');
  assert(indexHtml.includes('hmContact') && indexHtml.includes('textarea'), 'El cierre debe permitir contacto y comentario opcional.');
  assert(indexHtml.includes('id="hmContact" hidden novalidate') && indexHtml.includes('aria-describedby="hmFormNote"'), 'El formulario de cierre debe desactivar validación nativa y asociar el campo de contacto al estado localizado para que ningún mensaje visible salga del navegador fuera de textX.');
  assert(indexHtml.includes('data-action="copy-summary"') && indexHtml.includes('data-i18n-text="ui.copySummaryAction"'), 'El cierre debe ofrecer copia localizada del resumen para no depender únicamente de mailto.');
  assert(indexHtml.includes('hmSceneBackdrop') && indexHtml.includes('hmInteractionWait'), 'Debe existir fondo de escena completo y espera narrativa antes de opciones.');
  assert(indexHtml.includes('hmTransitionSystem') && indexHtml.includes('hm-transition-blade'), 'Debe existir sistema de transición cinematográfica entre escenas.');

  assert(renderConfig.includes('path: /textX/*') && renderConfig.includes('no-store, no-cache, must-revalidate, max-age=0') && renderConfig.includes('path: /textX/*.json') && renderConfig.includes('application/json; charset=utf-8'), 'render.yaml debe entregar textX/*.json sin caché persistente y con charset JSON para que los cambios de textos por idioma se publiquen inmediatamente y sin caracteres corruptos.');
  const legacyRedirectPairs = [
    ['/software-a-la-medida-colombia.html', '/es/productos/software-a-medida/'],
    ['/desarrollo-software-colombia.html', '/es/productos/desarrollo-software-colombia-medellin/'],
    ['/desarrollo-software-medellin.html', '/es/productos/desarrollo-software-colombia-medellin/'],
    ['/software-para-carpinterias.html', '/es/industrias/software-para-carpinterias/'],
    ['/cotizador-tecnico-aprovechamiento-material.html', '/es/productos/cotizador-tecnico-aprovechamiento/'],
    ['/paginas-web-seo-colombia.html', '/es/productos/paginas-web-seo/'],
    ['/chatbots-empresariales-colombia.html', '/es/productos/chatbots-empresariales/'],
    ['/implementacion-ia-empresas-colombia.html', '/es/productos/ia-para-empresas/'],
    ['/software-empresarial-colombia.html', '/es/productos/desarrollo-software-colombia-medellin/'],
    ['/automatizacion-procesos-empresariales-colombia.html', '/es/productos/automatizacion-procesos/'],
    ['/desarrollo-aplicaciones-web-colombia.html', '/es/productos/aplicaciones-web-pwa/'],
    ['/desarrollo-aplicaciones-moviles-colombia.html', '/es/productos/apps-moviles/'],
    ['/desarrollo-api-colombia.html', '/es/productos/desarrollo-api/'],
    ['/software-seguro-empresas-colombia.html', '/es/productos/software-seguro-para-empresas/'],
    ['/transformacion-digital-empresas-colombia.html', '/es/productos/transformacion-digital/']
  ];
  for (const [source, destination] of legacyRedirectPairs) {
    assert(renderConfig.includes(`source: ${source}`) && renderConfig.includes(`destination: ${destination}`), `render.yaml debe redirigir ${source} hacia ${destination} con 301 para preservar autoridad SEO vieja.`);
  }
  assert(renderConfig.includes('routes:') && renderConfig.includes('type: redirect'), 'render.yaml debe declarar rutas de redirect para Render y no dejar URLs .html antiguas como páginas duplicadas.');
  assertRenderAccessibleDirectRoutes(renderConfig, seoContent, detectedLanguageManifest);
  assert(renderConfig.includes('path: /404.html') && renderConfig.includes('X-Robots-Tag') && renderConfig.includes('noindex, nofollow, noarchive'), 'render.yaml debe enviar X-Robots-Tag noindex para 404.html.');

  assert(buildScript.includes('async function markStatic404Noindex') && buildScript.includes('noindex, nofollow, noarchive') && buildScript.includes("await markStatic404Noindex('404.html', spanishTextBundle, staticLanguages, seoContent)"), 'El build debe marcar dist/404.html con meta robots noindex y metadatos propios de error.');

  assert(await exists(path.join(root, 'textX', 'seo', 'es.json')) && await exists(path.join(root, 'textX', 'seo', 'en.json')), 'Los textos SEO deben vivir en textX/seo con un JSON por isocode.');
  assert(classicCssText.includes('hm-classic-seo-page') && classicCssText.includes('.hm-seo-static-page__category-list') && !classicCssText.includes('.hm-stage { width: 100vw'), 'Debe existir css/hashinmy-classic.css como hoja clásica independiente para páginas largas de productos.');
  assertSeoContentDepth(seoContent);
  assertSeoBindingCoverage(seoContent, indexHtml);
  assert(indexHtml.includes('id="hmSeoHub"') && indexHtml.includes('<a class="hm-seo-entry" id="hmSeoHubButton"') && indexHtml.includes('href="/es/productos/"') && indexHtml.includes('data-action="seo-hub"'), 'index.html debe conservar el textbutton limpio como enlace rastreable hacia /es/productos/ y abrir el hub SEO de productos con JS.');
  assert(seoContent.languages?.es?.openDetailLabel === 'Ver solución' && seoContent.languages?.en?.openDetailLabel === 'View solution' && jsText.includes('hm-seo-card__cta') && cssText.includes('.hm-seo-card__cta'), 'El hub de Productos debe mostrar CTA visible “Ver solución” en cada tarjeta, no solo enlaces silenciosos.');
  assert(indexHtml.includes('id="hmSeoClassicLink"') && indexHtml.includes('Vista clásica') && indexHtml.includes('href="/es/productos/"') && indexHtml.includes('data-action="seo-classic-toggle"') && jsText.includes('function syncSeoClassicLink') && jsText.includes("getSeoUiLabel('modernViewLabel'") && jsText.includes('function renderSeoClassicContent') && jsText.includes('data-seo-classic-category') && jsText.includes("closest('[data-seo-classic-category]')") && jsText.includes('seoClassicView') && jsText.includes('ensureSeoClassicStylesheet') && jsText.includes('function syncSeoClassicStylesheetState') && jsText.includes('stylesheet.disabled = !isClassic') && classicCssText.includes('body.hm-seo-classic-view') && classicCssText.includes('.hm-seo-hub--classic') && classicCssText.includes('.hm-seo-static-page--hub') && classicCssText.includes('.hm-seo-static-page__category-list'), 'La ventana Productos debe alternar Vista clásica/Vista Moderna, renderizar todo el hub como landing page y concentrar los estilos de esa vista en css/hashinmy-classic.css.');

  assert(jsText.includes('async function exitImmersiveMode') && jsText.includes('state.fullscreenRequested = false') && jsText.includes('function syncSeoFullscreenMode') && jsText.includes('if (state.seoClassicView) return;') && jsText.includes('const shouldKeepClassicFlow = state.seoClassicView && String(action || \'\').startsWith(\'seo-\')') && jsText.includes('if (nextClassicView) exitImmersiveMode();') && jsText.includes('syncSeoFullscreenMode(state.seoClassicView);'), 'La vista clásica de Productos debe salir de pantalla completa al activarse, no debe reactivar pantalla completa al navegar dentro de la landing y debe volver a solicitar pantalla completa al regresar a Vista Moderna.');
  assert(indexHtml.includes('id="hmProofOpenButton"') && indexHtml.includes('Nuestra Experiencia') && indexHtml.includes('id="hmProofWindow"') && indexHtml.includes('id="hmHomeProofContent"') && indexHtml.includes('data-proof-logo-list') && indexHtml.includes('assets/clientes') && indexHtml.includes('Metodología:') && indexHtml.includes('FAQ rápido') && indexHtml.includes('Casos de uso:') && cssText.includes('.hm-home-proof') && cssText.includes('.hm-home-proof__faq'), 'La portada debe reemplazar la prueba social atravesada por el textbutton Nuestra Experiencia y concentrar hm-home-proof en una ventana única.');
  assert(indexHtml.includes('data-i18n-text="ui.proofOpenButton"') && indexHtml.includes('data-i18n-text="ui.proofLead"') && indexHtml.includes('data-i18n-text="ui.proofTrustText"') && indexHtml.includes('data-i18n-text="ui.proofFaqStartAnswer"') && indexHtml.includes('data-i18n-aria="ui.proofContentAria"'), 'La ventana Nuestra Experiencia debe consumir todos sus textos visibles y accesibles desde textX/{isocode}.json.');
  assert(jsText.includes("t('ui.proofLogoAltTemplate'") && jsText.includes('function syncProofLogoLocalizedText') && jsText.includes("t('ui.proofBrandsStructuredDescription'"), 'Los logos y JSON-LD de Nuestra Experiencia deben localizar alt, fallback y descripción estructurada desde textX.');
  assert(jsText.includes('PROOF_LOGO_MANIFEST_PATH') && jsText.includes('assets/clientes/') && jsText.includes('function loadProofLogos') && jsText.includes('function normalizeProofLogoEntry') && jsText.includes('function renderProofLogos') && jsText.includes('getProofLogoNameFromFile') && cssText.includes('.hm-home-proof__brands') && cssText.includes('overflow-y: auto'), 'Los logos de experiencia deben detectarse desde assets/clientes mediante manifiesto, usar el nombre del archivo sin extensión como caption y mantener scroll interno en hm-home-proof__brands.');
  assert(cssText.includes('Corrección antidesborde real: logos de clientes y hm-seo-card') && cssText.includes('grid-template-columns: repeat(auto-fit, minmax(min(100%, 128px), 1fr));') && cssText.includes('grid-template-columns: repeat(auto-fit, minmax(min(100%, 238px), 1fr));') && cssText.includes('overflow: hidden !important;') && cssText.includes('overflow-wrap: anywhere;'), 'Los logos de clientes y las hm-seo-card deben estar contenidos por grillas auto-fit, sin overflow visible que permita salirse del contenedor o montarse entre tarjetas.');
  assert(buildScript.includes('function discoverProofClientLogos') && buildScript.includes('clientes-manifest.json') && buildScript.includes('PROOF_LOGO_IMAGE_EXTENSIONS') && buildScript.includes('hydrateStaticProofLogosFallback'), 'El build debe generar el manifiesto SEO de logos detectando automáticamente formatos de imagen dentro de assets/clientes.');
  assertProofLogoDisplayNames(await readJson('assets/clientes/clientes-manifest.json'), jsText, buildScript);
  assert(!indexHtml.includes('./assets/logo_clean_MAX.jpg') && !jsText.includes("{ name: 'CleanMAX', file: 'logo_clean_MAX.jpg' }"), 'La sección Nuestra Experiencia no debe depender de logos manuales en assets raíz; debe usar assets/clientes.');
  assert(indexHtml.includes('\"@type\": \"OfferCatalog\"') && indexHtml.includes('https://hashinmy.com/#offer-catalog') && indexHtml.includes('https://hashinmy.com/#service-custom-software') && indexHtml.includes('https://hashinmy.com/#service-ai-automation') && indexHtml.includes('https://hashinmy.com/#service-web-seo-chatbots') && indexHtml.includes('https://hashinmy.com/#service-technical-quoter'), 'La home debe publicar OfferCatalog y servicios principales en JSON-LD para que la portada también comunique productos, no solo las fichas internas.');
  assert(indexHtml.includes('https://hashinmy.com/#service-financed-development') && indexHtml.includes('Tecnología empresarial a la medida financiada al 100%') && !indexHtml.includes('Software a medida, IA, CAD DXF, nube, PC, SEO'), 'La home debe posicionar el JSON-LD desde la promesa madre de ingeniería digital financiada al 100%, no desde el catálogo viejo centrado en CAD/SEO/cotizadores.');
  assert(jsText.includes('function buildBrandOrganizationStructuredData') && jsText.includes('function buildBrandOfferCatalogStructuredData') && jsText.includes('function buildHomeFaqStructuredData') && jsText.includes('service-financed-development'), 'El JSON-LD generado en runtime debe conservar organización enriquecida, OfferCatalog estratégico, FAQ de portada y financiación del 100% después de cambiar idioma o vista.');
  assert(buildScript.includes('function buildStaticBrandKnowsAbout') && buildScript.includes('function buildStaticBrandOfferCatalogJsonLd') && buildScript.includes('service-financed-development'), 'El build estático debe generar JSON-LD de marca desde textX/textX/seo con financiación 100% y alcance estratégico localizado.');
  assert(indexHtml.includes('\"@type\": \"FAQPage\"') && indexHtml.includes('https://hashinmy.com/#faq') && indexHtml.includes('¿Por qué contratar a Hashinmy?') && indexHtml.includes('¿Para quién es?') && indexHtml.includes('¿Cómo empiezo?'), 'La home debe mantener FAQPage estructurado alineado con el FAQ rápido visible.');
  assert(indexHtml.includes('\"@type\": \"BreadcrumbList\"') && indexHtml.includes('https://hashinmy.com/#breadcrumb') && indexHtml.includes('\"name\": \"Inicio\"'), 'La home debe mantener BreadcrumbList estructurado aunque sea la ruta raíz.');

  assert(indexHtml.includes('id="hmSeoHubCategories" role="tablist"') && jsText.includes('role="tab"') && jsText.includes('aria-selected') && jsText.includes("setAttribute('role', 'tabpanel')"), 'Las categorías SEO deben comportarse como pestañas reales con tablist/tab/tabpanel, no solo como botones visuales.');
  assert(jsText.includes('function handleSeoCategoryKeydown') && jsText.includes('ArrowRight') && jsText.includes('Home') && jsText.includes('End') && jsText.includes("setAttribute('aria-orientation', 'horizontal')") && jsText.includes("addEventListener('keydown', handleSeoCategoryKeydown)"), 'Las pestañas SEO deben responder con teclado (flechas, Home y End) para sentirse como pestañas reales y no como botones aislados.');
  assert(jsText.includes('function getSeoBundleKeywords') && buildScript.includes('function buildSeoBundleKeywords') && buildScript.includes('const pageKeywords = Array.isArray(item?.keywords) ? item.keywords : buildSeoBundleKeywords(bundle);'), 'El hub SEO debe generar keywords agregadas desde categorías, títulos, términos y fichas, no quedarse con una lista genérica en páginas de categoría.');
  assert(indexHtml.includes('id="hmTopActions"') && indexHtml.indexOf('id="hmSeoHubButton"') < indexHtml.indexOf('id="hmLanguageSelectorWrap"'), 'index.html debe agrupar el acceso Productos a la izquierda real del selector de idioma, sin depender de una posición aproximada.');
  assert(!indexHtml.includes('data-hm-label-es') && !indexHtml.includes('data-hm-label-en'), 'index.html no debe mantener rótulos SEO limitados a español/inglés; el botón Productos debe hidratarse desde textX/seo en los 50 idiomas.');
  assert(indexHtml.includes('data-seo-i18n-text="entryLabel"') && indexHtml.includes('data-seo-i18n-aria="closeLabel"') && indexHtml.includes('data-seo-i18n-aria="uiLabels.categoryNavLabel"') && indexHtml.includes('data-seo-i18n-text="uiLabels.classicViewLabel"'), 'index.html debe marcar el chrome SEO con data-seo-i18n para que cada texto estático tenga fuente traducible en textX/seo.');
  assert(buildScript.includes('function hydrateStaticSeoChromeFallback') && buildScript.includes('categoryNavLabel') && buildScript.includes('hmSeoHubClose') && buildScript.includes('hmSeoHubCategories'), 'El build debe hidratar el chrome estático del hub SEO (cerrar, navegación de categorías y enlaces) desde textX/seo por isocode, no dejar ARIA en español.');
  assert(buildScript.includes("hydrateStaticHtmlFallback(templateHtml, textBundle, languages, bundle?.code || 'es', '/', proofLogos, seoContent)"), 'El build de páginas SEO estáticas debe pasar seoContent al hidratador global para que el chrome del hub (cerrar, categorías y vista clásica) salga en el idioma activo y no caiga al fallback español.');
  assert(buildScript.includes("'llms.txt'") && (buildScript.includes('filter((card) => card.category === category.id)') || buildScript.includes('category.items.map((card) => buildSeoStaticLandingItem')) && buildScript.includes('itemListElement: (bundle?.items || []).map') && buildScript.includes("upsertHtmlAttribute(updated, 'href', href)") && buildScript.includes('getStaticSeoEntryBundle(activeCode, seoContent)') && buildScript.includes('seoContent?.languages?.[requestedCode]') && buildScript.includes('await writeLocalizedEntryPage(language, staticLanguages, seoContent)'), 'El build debe copiar llms.txt, publicar todas las fichas SEO en HTML/JSON-LD, mantenerlas clasificadas y preservar un enlace crawlable al hub correcto por idioma desde textX/seo/{isocode}.json sin depender de JS.');
  assert(buildScript.includes("'@type': 'FAQPage'") && buildScript.includes("'@type': 'BreadcrumbList'") && buildScript.includes('hm-seo-static-page__faq') && buildScript.includes('function createSeoVisibleContentModel'), 'El build debe generar FAQ visible, datos estructurados Breadcrumb/FAQ y una capa de limpieza visual para evitar duplicaciones en cada ficha SEO indexable.');
  assert(buildScript.includes("'@type': 'WebSite'") && buildScript.includes("'@type': 'TechArticle'") && buildScript.includes("'@type': 'DefinedTermSet'") && buildScript.includes("mainEntity: { '@id': primaryEntityId }") && buildScript.includes('getSeoPrimaryEntityType'), 'El build debe reforzar cada ficha SEO con WebSite persistente, CollectionPage/WebPage, entidad principal, guía técnica, glosario definido y tipos diferenciados para servicios/glosario.');
  assert(jsText.includes('getSeoItems().map((item, index)') && !jsText.includes('getSeoItems().slice(0, 12)'), 'El runtime debe exponer todas las fichas SEO del hub en datos estructurados, no solo las primeras 12.');
  assert(jsText.includes('function getSeoItemFaqs') && jsText.includes("'@type': 'FAQPage'") && jsText.includes('hm-seo-detail__faq'), 'El runtime debe mostrar preguntas frecuentes compactas y sincronizar FAQPage en cada URL de ficha.');
  assert(jsText.includes("'@type': 'WebSite'") && jsText.includes("'@type': 'TechArticle'") && jsText.includes("'@type': 'DefinedTermSet'") && jsText.includes("'@type': activeItem ? 'WebPage' : 'CollectionPage'") && jsText.includes('function getSeoPrimaryEntityType'), 'El runtime no debe degradar el JSON-LD generado: debe mantener WebSite, página/colección, entidad principal, guía técnica y glosario definido al abrir fichas con JS.');
  assert(jsText.includes('SEO_FINAL_VISIBLE_LIMITS') && jsText.includes('quick: 720') && jsText.includes('sectionBody: 1800') && jsText.includes('faqAnswer: 900') && jsText.includes('sections: 8') && jsText.includes('faqs: 8') && jsText.includes('function compactSeoVisibleText') && jsText.includes('slice(0, limits.faqs);'), 'El runtime debe limpiar y presupuestar textos repetidos antes de renderizar el detalle final, conservando FAQ útil ampliada con frases completas, sin duplicar ni recortar la ficha final con scroll interno.');
  assert(!jsText.includes('…') && !buildScript.includes('…'), 'El compactador SEO de runtime/build no debe generar puntos suspensivos en fichas finales; debe escoger frases completas o cortes de palabra limpios para mantener lectura final sin truncamiento visual.');
  assert(jsText.includes('class="hm-seo-detail__hero"') && jsText.includes('Ficha técnica Hashinmy') && jsText.includes('panel blanco final') && jsText.includes('const backText = `← ${String(backLabel).replace') && jsText.includes('state.seoActiveId ? elements.seoHubDetail'), 'El detalle runtime debe poner título/resumen dentro de hm-seo-detail__final, mantener el encabezado superior genérico para no duplicar contenido y abrir enfocando la flecha de regreso.');
  assert(jsText.includes('hm-seo-detail__final') && jsText.includes('hm-seo-detail__quick') && jsText.includes('hm-seo-detail__guide') && !jsText.includes('hm-seo-detail__grid') && !jsText.includes('hm-seo-detail__sections'), 'El detalle runtime debe mostrar una ficha final continua, no una colección de cards internas al abrir una URL SEO.');
  assert(jsText.includes('const detailMode = Boolean(state.seoActiveId)') && jsText.includes("setAttribute('aria-hidden', String(detailMode))") && jsText.includes('elements.seoHubCards.inert = detailMode') && jsText.includes("elements.seoHubCards.innerHTML = ''") && jsText.includes('elements.seoHubCategories.inert = detailMode') && jsText.includes("document.body.dataset.seoHub = state.seoClassicView ? 'classic' : state.seoActiveId ? 'detail' : 'index'"), 'Al abrir una hm-seo-card, el runtime debe ocultar todas las cards también para accesibilidad/foco, preservar la vista clásica cuando corresponda y sincronizar el modo del layout.');
  assert(cssText.includes('scroll-snap-type: x proximity') && cssText.includes('scroll-snap-align: start') && cssText.includes('overflow-x: auto') && cssText.includes('grid-template-columns: repeat(3, minmax(0, 1fr));') && !cssText.includes('flex-basis: 100%;'), 'El índice SEO debe mantener pestañas horizontales responsive y una grilla compacta de 3 columnas en móvil para que muchas hm-seo-card no se desborden ni queden inaccesibles antes del detalle final.');
  assert(cssText.includes('Ajuste definitivo: cada hm-seo-card crece por contenido') && cssText.includes('grid-auto-rows: max-content !important;') && cssText.includes('height: auto !important;') && cssText.includes('min-height: auto !important;') && cssText.includes('-webkit-line-clamp: unset;'), 'Las hm-seo-card deben adaptar su altura al contenido, no truncar textos ni colapsar, y mantener altura homogénea por fila mediante CSS Grid.');
  assert(cssText.includes('body[data-seo-hub="detail"] .hm-seo-hub__surface') && cssText.includes('grid-template-rows: auto minmax(0, 1fr);') && cssText.includes('body[data-seo-hub="detail"] .hm-seo-hub__cards') && cssText.includes('body[data-seo-hub="detail"] .hm-seo-card') && cssText.includes('.hm-seo-hub__cards[aria-hidden="true"]'), 'El CSS debe forzar que en modo detalle desaparezcan todas las hm-seo-card y que el detalle use el espacio principal del contenedor.');
  assert(buildScript.includes('hm-seo-static-page__back') && buildScript.includes('const backText = `← ${String(backLabel).replace'), 'El build estático debe publicar una flecha de regreso al hub en cada ficha SEO profunda.');
  assert(buildScript.includes('SITEMAP_PRIORITY') && buildScript.includes('<lastmod>') && buildScript.includes('<changefreq>') && buildScript.includes('<priority>'), 'El build debe enriquecer sitemap.xml con lastmod, changefreq y priority para reforzar rastreo SEO e IA de hashinmy.com.');
  assert(buildScript.includes('hm-seo-static-page__final') && buildScript.includes('hm-seo-static-page__hero') && buildScript.includes('hm-seo-static-page__quick') && !buildScript.includes('<article><h2>'), 'El build estático debe renderizar cada ficha profunda como información final continua, con título/resumen dentro del contenedor final y sin volver a crear cards internas.');
  assert(buildScript.includes('function demoteImmersiveIntroHeadingForSeoPage') && buildScript.includes('data-seo-demoted-heading'), 'El build estático debe degradar el H1 inmersivo de portada dentro de páginas SEO profundas para que cada URL de producto tenga un único H1 limpio y propio.');
  assert(llmsText.includes('https://hashinmy.com/es/productos/software-para-ecommerce/') && llmsText.includes('https://hashinmy.com/en/products/security-privacy/') && llmsText.includes('https://hashinmy.com/es/productos/cotizador-tecnico-aprovechamiento/') && llmsText.includes('https://hashinmy.com/en/products/business-chatbots/'), 'llms.txt debe mantener un mapa bilingüe de URLs SEO para buscadores e IA.');

  assert(cssText.includes('overflow: hidden') && cssText.includes('overscroll-behavior: none'), 'La página debe bloquear scroll tradicional del documento.');
  assert(cssText.includes('width: 100vw') && cssText.includes('min-width: 100vw') && cssText.includes('aspect-ratio: auto'), 'La composición debe aprovechar todo el ancho del navegador.');
  assert(cssText.includes('hm-ambient__diagonal') && cssText.includes('hm-scene-art'), 'Debe conservar lenguaje visual diagonal, premium e inmersivo.');
  assert(cssText.includes('.hm-language') && cssText.includes('body:not([data-scene="intro"]) .hm-language'), 'El selector de idioma debe verse solo en la escena inicial.');
  assert(cssText.includes('.hm-top-actions') && cssText.includes('body:not([data-scene="intro"]) .hm-top-actions') && cssText.includes('.hm-language {') && cssText.includes('position: static;'), 'El botón Productos y el selector de idioma deben compartir un grupo responsive para evitar solapes y mantener el botón a la izquierda real de la card de idioma.');
  assert(!cssText.includes('Preparando opciones') && !cssText.includes('.hm-interaction-wait::after'), 'La espera narrativa no debe tener textos visibles hardcodeados en CSS; debe salir de textX.');
  assert(cssText.includes('body[data-scene="summary"] .hm-card') && cssText.includes('overflow-y: auto'), 'El cierre debe ubicarse dentro de pantalla.');
  assert(!cssText.includes(`.hm-seo-detail__terms,
  .hm-seo-detail__faq {
    display: none;`), 'El detalle SEO no debe ocultar glosario ni FAQ en móvil; debe conservar información visible y compacta.');
  assert(cssText.includes('.hm-seo-detail__terms dt,') && cssText.includes('grid-column: 1 / -1;') && !cssText.includes(`.hm-seo-detail__faq dd span {
  -webkit-line-clamp: 2;`), 'El detalle SEO debe mostrar FAQ y términos como bloques completos compactos, sin truncar respuestas con line-clamp.');
  assert(cssText.includes('.hm-seo-detail__final') && cssText.includes('.hm-seo-detail__hero') && classicCssText.includes('.hm-seo-static-page__final') && classicCssText.includes('.hm-seo-static-page__hero') && !cssText.includes('.hm-seo-detail__grid') && !cssText.includes('.hm-seo-detail__sections'), 'El CSS SEO debe proteger una lectura final continua; el detalle moderno vive en hashinmy-immersive.css y la landing/vista clásica en hashinmy-classic.css.');
  assert(cssText.includes('body[data-seo-hub="detail"] .hm-seo-detail__final') && cssText.includes('background: #fff') && cssText.includes('overflow-y: auto') && cssText.includes('scrollbar-gutter: stable both-edges'), 'hm-seo-detail__final debe activar scroll interno solo en modo detalle, usar fondo blanco y permitir lectura completa sin desbordar el layout.');
  assert(jsText.includes('function syncSeoHubFit') && jsText.includes('hm-seo-fit-compact') && jsText.includes('scheduleSeoHubFitCheck') && cssText.includes('.hm-seo-fit-compact .hm-seo-hub__surface') && cssText.includes('.hm-seo-fit-ultra .hm-seo-hub__intro p'), 'El hub SEO debe medir riesgo de desborde y activar compactación específica para que pestañas, cards y detalle final no se corten ni se aplasten.');
  assert(buildScript.includes('SEO_FINAL_VISIBLE_LIMITS') && buildScript.includes('quick: 720') && buildScript.includes('sectionBody: 1800') && buildScript.includes('faqAnswer: 900') && buildScript.includes('sections: 8') && buildScript.includes('faqs: 8') && buildScript.includes('function compactSeoVisibleText') && buildScript.includes('visibleContent.quick.simple'), 'El build estático debe usar el mismo presupuesto visual del detalle SEO para publicar fichas profundas completas con frases completas, con ficha amplia, fondo blanco y scroll interno cuando el contenido lo necesita.');
  assert(cssText.includes('body[data-scene="summary"] .hm-contact__summary:not([hidden])') && cssText.includes('display: grid !important'), 'El cierre debe mostrar el brief comercial localizado antes del contacto.');
  assert(cssText.includes('Auditoría de cierre multilingüe') && cssText.includes('body[data-scene="summary"] .hm-summary-item strong') && cssText.includes('text-overflow: clip') && cssText.includes('line-break: anywhere'), 'El cierre debe permitir que valores largos del resumen se ajusten por idioma sin truncarse.');
  assert(cssText.includes('prefers-reduced-motion: reduce'), 'Debe respetar usuarios con reducción de movimiento.');
  assert(cssText.includes('@media (max-aspect-ratio: 4 / 3)') && cssText.includes('@media (max-width: 640px)'), 'Debe conservar reglas responsive para tablet y móvil.');
  assert(cssText.includes('html[data-language="zh"] .hm-typed-word') && cssText.includes('line-break: loose') && cssText.includes('word-break: keep-all'), 'El CSS debe proteger idiomas sin espacios contra desbordes del efecto de escritura.');
  assert(cssText.includes('html[dir="rtl"] body,') && cssText.includes('html[dir="rtl"] .hm-stage') && cssText.includes('direction: ltr;') && cssText.includes('unicode-bidi: plaintext'), 'El CSS debe mantener la estructura visual LTR en idiomas RTL y aplicar RTL solo al texto localizado.');
  assert(cssText.includes('body[data-text-density="compact"] .hm-question') && cssText.includes('body[data-text-density="ultra"] .hm-option span') && cssText.includes('data-text-density="ultra"'), 'El CSS debe adaptar densidad textual compact/ultra para traducciones largas sin cambiar la estructura visual.');
  assert(cssText.includes('Auditoría responsive premium') && cssText.includes('body[data-scene="intro"] .hm-card-decision-flow') && cssText.includes('overflow-y: auto') && cssText.includes('overscroll-behavior: contain') && cssText.includes('@media (max-width: 420px), (max-height: 620px)'), 'La primera escena debe tener un contenedor de desborde interno para móviles e idiomas largos sin activar scroll global ni cambiar la estructura visual.');

  assert(jsText.includes('APP_BASE_URL') && jsText.includes("const TEXT_BASE_PATH = appUrl('textX/');") && jsText.includes("const ASSET_BASE = appUrl('assets/');"), 'El JS debe resolver textX/assets desde la raíz real del script para que las entradas localizadas /l/<idioma>/ no busquen recursos dentro de subcarpetas.');
  assert(buildScript.includes('LANGUAGE_PATH_PREFIX') && buildScript.includes('function writeLocalizedEntryPage') && buildScript.includes('function hydrateStaticInitialSceneFallback') && buildScript.includes('getLocalizedEntryPath'), 'El build debe generar entradas HTML estáticas por idioma con SEO, fallback inicial y rutas de recursos correctas, no solo URLs con query que sirven HTML español.');
  assert(jsText.includes('loadLanguageCatalog') && jsText.includes('loadTextBundle') && jsText.includes('applyLocalizedDomText'), 'El JS debe cargar manifest, bundles de idioma y aplicar textos al DOM.');
  assert(jsText.includes("t('ui.preparingOptions')"), 'El JS debe tomar la espera de opciones desde textX/ui.preparingOptions.');
  assert(jsText.includes('supportedLanguageCodes') && (jsText.match(/code:\s*['"][a-z]{2,3}['"]/g) || []).length >= REQUIRED_LANGUAGE_COUNT, 'El selector debe soportar 50 códigos de idioma como fallback offline.');
  assert(jsText.includes('function setLanguageCatalog') && jsText.includes('languageCodes = new Set(state.languageCatalog.map'), 'textX/languages.json debe ser la fuente runtime del selector de idioma.');
  assert(!jsText.includes('.filter((language) => language && languageCodes.has(language.code))'), 'El manifest de idiomas no debe filtrarse por una whitelist duplicada en JS.');
  assert(!jsText.includes('introTranslations') && !jsText.includes('Bienvenido a HASHINMY') && !jsText.includes('Financiación 100%'), 'El JS no debe conservar traducciones/UI comercial embebida.');
  assert(jsText.includes('MAX_OPTIONS_PER_SCENE = 3') && jsText.includes('slice(0, MAX_OPTIONS_PER_SCENE)'), 'Debe existir límite funcional de máximo 3 opciones por escena.');
  assert(jsText.includes('MAILTO_MAX_SAFE_LENGTH') && jsText.includes('function writeClipboardText') && jsText.includes('submit-mailto-too-long-copy'), 'El envío debe tener respaldo de portapapeles cuando el mailto sea demasiado largo para navegadores móviles o clientes de correo.');
  assert(jsText.includes('function showLocalizedContactRequired') && jsText.includes("t('ui.contactRequired')") && jsText.includes("addEventListener('invalid'") && jsText.includes("event.preventDefault()") && jsText.includes("aria-invalid"), 'La validación del contacto debe usar exclusivamente ui.contactRequired desde textX, incluso si el navegador dispara invalid antes del submit.');
  assert(jsText.includes('OPTION_REVEAL_DELAY_MS = 3000') && jsText.includes('function startSceneNarrative') && jsText.includes('function scheduleInteractionsAfterNarrativeComplete') && jsText.includes('minimumInteractionDelay - elapsed') && jsText.includes('typeLine(elements.insight, insightText, TYPE_INSIGHT_SPEED_MS, token, scheduleInteractionsAfterNarrativeComplete)'), 'El texto debe escribirse primero y revelar opciones solo cuando termina la narrativa localizada, respetando mínimo 3 segundos.');
  assert(jsText.includes('OPTION_TEXT_REVEAL_DELAY_AFTER_ARRIVAL_MS = 177') && jsText.includes('function getOptionEnterTransitionMs'), 'El texto de opciones debe esperar 177 ms después de que las cards lleguen a su lugar.');
  assert(jsText.includes('requestFullscreen') && jsText.includes('requestImmersiveMode'), 'Debe intentar modo inmersivo/pantalla completa cuando el navegador lo permita.');
  assert(jsText.includes('preserveResponsiveOrientation') && !jsText.includes("screen.orientation.lock('landscape')") && !jsText.includes('screen.orientation.lock("landscape")'), 'La web debe respetar orientación responsive real en móvil/tablet y no forzar landscape.');
  assert(jsText.includes('buildSummaryText') && jsText.includes('mailto:'), 'El brief final debe generarse y enviarse sin backend obligatorio.');
  assert(jsText.includes('function renderSummary') && jsText.includes('hm-summary-item') && jsText.includes('elements.summary.hidden = !summaryItems.length'), 'El cierre debe renderizar un resumen visible desde textos localizados, no dejar el contenedor vacío.');
  assert(jsText.includes('function getLocalizedAuditEntry') && jsText.includes('function getLocalizedAuditChoice') && jsText.includes('recordChoice(choice, Number(button.dataset.choiceIndex))'), 'El historial y resumen deben relocalizar decisiones guardadas al idioma activo, sin mezclar textos de otro idioma.');
  assert(jsText.includes('data-priority="${escapeHtml(choice.priority || \'\')}"') && !jsText.includes('data-priority="${choice.priority || \'\'}"'), 'Las opciones generadas desde textX deben escapar data-priority en el runtime para evitar inyección de atributos al editar JSON de idiomas.');
  assert(jsText.includes("await loadTextBundle('es')") && jsText.includes('deepMerge(spanishBundle, bundle)'), 'Los idiomas deben tener fallback robusto al español sin romper la ruta.');
  assert(jsText.includes('TEXT_BUNDLE_CACHE_PREFIX') && jsText.includes('function readCachedTextBundle') && jsText.includes('function writeCachedTextBundle') && jsText.includes('usando caché local validada'), 'El runtime debe conservar caché local validada de bundles textX para no perder el idioma elegido ante fallos transitorios de red/CDN.');
  assert(jsText.includes('LANGUAGE_CATALOG_CACHE_KEY') && jsText.includes('function readCachedLanguageCatalog') && jsText.includes('function writeCachedLanguageCatalog') && jsText.includes('usando caché local validada del catálogo de idiomas') && jsText.includes('loadDetectedLanguageCatalogFromProjectStructure') && jsText.includes('textX/languages.json no declara idiomas usables'), 'JS debe conservar caché local validada y priorizar el catálogo dinámico detectado desde textX/textX/seo para no degradar el selector ante despliegues parciales.');
  assert(jsText.includes('function loadLanguageCatalogManifest') && jsText.includes("manifest?.source !== 'detected-from-textX-and-textX-seo'") && jsText.includes('function buildLanguageCatalogFromDetectedCodes') && jsText.includes('function filterLanguageCatalogByAvailableBundles') && jsText.includes('function loadDetectedLanguageCatalogFromAvailableBundles') && jsText.includes('const bundleProbeCatalog = await loadDetectedLanguageCatalogFromAvailableBundles(detectedCandidateCatalog);') && jsText.includes('mergeLanguageCatalogCandidates(bundleProbeCatalog, directoryListingCatalog, detectedCatalog, manifestCatalog, environmentProbeCatalog)') && jsText.includes('function getEnvironmentLanguageProbeCodes') && jsText.includes('function getRequestedLanguageCandidateCodesFromUrl') && jsText.includes('const environmentCatalog = buildLanguageCatalogFromCodes(getEnvironmentLanguageProbeCodes());') && jsText.includes('const detectedCatalog = await loadDetectedLanguageCatalogFromProjectStructure(metadataSources);'), 'El selector debe tomar la intersección real textX + textX/seo como fuente del listado, aceptar manifest/cache solo como candidatos verificados y probar tanto el idioma pedido como todos los candidatos conocidos para detectar JSON recién pegados aunque textX/languages.json o estructura_del_proyecto.json estén desactualizados.');

  assert(jsText.includes('function getLanguageFileCodesFromDirectoryListingHtml') && jsText.includes('function loadDetectedLanguageCatalogFromDirectoryListings') && jsText.includes('fetchDirectoryListingLanguageCodes(TEXT_BASE_PATH)') && jsText.includes('fetchDirectoryListingLanguageCodes(SEO_BASE_PATH)') && jsText.includes('const directoryListingCatalog = await loadDetectedLanguageCatalogFromDirectoryListings(metadataSources);') && jsText.includes('mergeLanguageCatalogCandidates(bundleProbeCatalog, directoryListingCatalog, detectedCatalog, manifestCatalog, environmentProbeCatalog)'), 'El selector debe intentar leer listados reales de textX y textX/seo como respaldo tipo assets/clientes, para detectar JSON pegados aunque languages.json o estructura_del_proyecto.json todavía estén desactualizados.');

  assert(jsText.includes('function verifyJsonFileAvailableForLanguageCatalogProbe') && jsText.includes("method: 'HEAD'") && jsText.includes("Range: 'bytes=0-0'") && jsText.includes('cancelProbeResponseBody') && jsText.includes('await verifyJsonFileAvailableForLanguageCatalogProbe(`${SEO_BASE_PATH}${encodeURIComponent(code)}.json`);'), 'El selector debe verificar textX/seo/{idioma}.json con prueba liviana HEAD/Range, sin descargar todos los SEO completos durante la detección automática de idiomas en la escena uno.');

  assert(jsText.includes('function addJsonRetryParam') && jsText.includes('hmTextRetry') && jsText.includes('red sin caché forzada') && jsText.includes('function buildJsonFetchAttempts') && jsText.includes("cache: 'no-store'") && jsText.includes("cache: 'reload'") && jsText.includes("cache: 'default'") && jsText.includes('JSON_FETCH_TIMEOUT_MS') && jsText.includes('AbortController') && jsText.includes("error?.name === 'AbortError'") && jsText.includes('Intentos:'), 'JS debe reintentar la carga de JSON de textX con timeout abortable, recarga, cache-busting y caché HTTP antes de caer a caché local/fallback, evitando pantallas vacías por fallos transitorios, CDN viejo o conexiones colgadas.');
  assert(jsText.includes('const MAX_STORED_TEXT_BUNDLES = DEFAULT_LANGUAGE_CACHE_LIMIT;') && jsText.includes('index.slice(MAX_STORED_TEXT_BUNDLES).forEach'), 'El runtime debe conservar caché local suficiente para bundles de textX detectados, evitando degradación de idiomas ya seleccionados ante fallos temporales de red.');
  assert(jsText.includes('function assertUsableTextBundle') && jsText.includes('function buildTextBundleDiagnostics') && jsText.includes('__resolvedLanguage'), 'El runtime debe validar bundles textX y corregir el idioma resuelto si usa fallback.');
  assert(jsText.includes('function assertLanguageMetadataConsistency') && jsText.includes('getCatalogMetadataForBundle') && jsText.includes('metadatos inconsistentes'), 'El runtime debe rechazar JSON de textX con iso/name/nativeName/htmlLang/dir inconsistentes antes de pintar o cachear un idioma.');
  assert(jsText.includes('function assertCompleteTextBundle') && jsText.includes('flattenBundlePaths') && jsText.includes('no mantiene paridad completa con es.json'), 'El runtime debe bloquear bundles textX parciales para evitar escenas mezcladas entre español y otro idioma tras editar JSON.');
  assert(jsText.includes('function assertCompleteSeoBundle') && jsText.includes('flattenSeoBundlePaths') && jsText.includes('REQUIRED_SEO_UI_LABEL_KEYS') && jsText.includes('textX/seo/es.json debe existir') && jsText.includes('return content[getSeoLanguage(language)] || null;'), 'JS debe validar paridad completa de textX/seo contra es.json y no caer a contenido SEO español cuando un idioma SEO queda parcial.');
  assert(buildScript.includes('function assertCompleteSeoContent') && buildScript.includes('function assertCompleteSeoBundle') && buildScript.includes('flattenSeoBundlePaths') && buildScript.includes('textX/seo debe incluir un bundle por cada idioma detectado') && buildScript.includes('No se pudo construir contenido SEO multilingüe completo'), 'El build debe fallar si textX/seo no tiene los bundles detectados completos y sincronizados antes de emitir HTML estático, sitemap o llms.txt.');
  assert(buildScript.includes('async function writeLanguageCatalogManifest') && buildScript.includes("path.join(dist, 'textX', 'languages.json')") && buildScript.includes('detected-from-textX-and-textX-seo') && buildScript.includes('await writeLanguageCatalogManifest(staticLanguages);'), 'El build debe emitir dist/textX/languages.json desde la intersección real de textX y textX/seo para que el selector funcione aunque estructura_del_proyecto.json falte o esté desactualizado.');
  assert(jsText.includes('function loadSpanishReferenceBundle') && jsText.includes('textX/es.json no estuvo disponible para validar paridad') && jsText.includes('se intentará usar el bundle autónomo validado') && jsText.includes('const spanishBundle = await loadSpanishReferenceBundle(normalized);'), 'El runtime debe poder cargar un idioma no español como bundle autónomo validado si textX/es.json falla temporalmente, sin degradar automáticamente los 50 idiomas por una dependencia central.');
  assert(jsText.includes('function detectPreferredLanguage') && jsText.includes('const code = resolveKnownLanguageCode(language);') && jsText.includes('if (code) return code;') && !jsText.includes('const code = normalizeLanguageCode(language);\n      if (languageCodes.has(code)) return code;'), 'El autodetector de idioma debe probar todos los locales del navegador y no caer a español por el primer locale no soportado.');
  assert(jsText.includes('function getRequestedLanguageFromUrl') && jsText.includes('url.searchParams.get(\'lang\')') && jsText.includes('url.searchParams.get(\'idioma\')'), 'El idioma inicial debe poder preseleccionarse desde URL sin romper almacenamiento local.');
  assert(jsText.includes('function syncLocalizedSeoLinks') && jsText.includes('hreflang') && jsText.includes('buildPublicLanguageUrl'), 'El idioma activo debe sincronizar canonical/hreflang para la versión pública global.');
  assert(jsText.includes('link[data-hashinmy-hreflang="runtime"], link[data-hashinmy-hreflang="static"'), 'El runtime debe reemplazar los hreflang estáticos del build para evitar duplicados cuando JS ya controla el idioma activo.');
  assert(jsText.includes('languageRequestToken') && jsText.includes('function setLanguageSelectorBusy') && jsText.includes('const requestToken = ++state.languageRequestToken') && jsText.includes('if (!applied) return'), 'El selector de idioma debe protegerse contra cambios rápidos para que siempre gane la última selección del usuario.');
  assert(jsText.includes('LANGUAGE_URL_KEYS') && jsText.includes('LANGUAGE_PATH_PREFIX') && jsText.includes('function setLocalizedUrlPath') && jsText.includes('function syncShareableLanguageUrl') && jsText.includes('history.replaceState') && jsText.includes('resolveKnownLanguageCode(hashValue)'), 'Al cambiar idioma, la URL debe quedar sincronizada con una ruta estática /l/<idioma>/ para que la selección sobreviva a recargas, enlaces compartidos, crawlers y navegadores sin localStorage.');
  assert(jsText.includes('lang="${escapeHtml(language.htmlLang || language.code)}"') && jsText.includes('dir="${optionDir}"') && jsText.includes('elements.languageSelect.lang = activeLanguage.htmlLang'), 'El selector debe declarar lang/dir por opción y por idioma activo para accesibilidad real en alfabetos mixtos y RTL.');
  assert(jsText.includes('function getActiveLanguageDomAttributes') && jsText.includes('function localizedMarkupAttributes') && jsText.includes('function syncRuntimeLanguageContainers') && jsText.includes("elements.experience = $('#hmExperience')") && jsText.includes('syncRuntimeLanguageContainers();'), 'El runtime debe propagar lang/dir al contenedor principal y a bloques dinámicos para que todas las escenas mantengan el idioma seleccionado, incluso con textos renderizados por JS.');
  assert(jsText.includes('const textAttrs = localizedMarkupAttributes();') && jsText.includes('class="hm-option"') && jsText.includes('aria-label="${escapeHtml(choice.label)}') && jsText.includes('${textAttrs}>') && jsText.includes('class="hm-summary-item"${textAttrs}'), 'Las opciones, chips, métricas y resumen generados desde textX deben emitir lang/dir propios para accesibilidad y mezcla segura de alfabetos.');
  assert(cssText.includes('unicode-bidi: plaintext') && cssText.includes('html[dir="rtl"] .hm-option') && cssText.includes('text-align: start'), 'El CSS debe aislar bidireccionalmente textos dinámicos localizados para evitar reordenamientos visuales en árabe, persa, urdu y hebreo con términos técnicos latinos.');
  assert(jsText.includes('function readStoredRoutePayload') && jsText.includes('function readStoredRouteLanguage') && jsText.includes('language: state.language') && jsText.includes('routeLanguage || (stored ? normalizeLanguageCode(stored) : detectPreferredLanguage())'), 'El idioma elegido debe persistir también dentro de la ruta guardada para que todas las escenas restauradas conserven el idioma seleccionado.');
  assert(jsText.includes('function syncStoredRouteLanguage') && jsText.includes('syncStoredRouteLanguage();') && jsText.includes('parsed.version !== 6') && jsText.includes('parsed.language === state.language'), 'El idioma seleccionado debe actualizar también la ruta v6 ya guardada sin sobrescribir escena/respuestas, evitando que una recarga restaure un idioma anterior.');
  assert(jsText.includes('htmlLang: languageConfig.htmlLang') && jsText.includes("dir: languageConfig.dir || 'ltr'"), 'Los eventos hashinmy:route:update deben exponer idioma/htmlLang/dir para auditar que la navegación real mantiene el idioma activo.');
  assert(jsText.includes('Intl.Segmenter') && jsText.includes("granularity: 'grapheme'") && jsText.includes('segmentTextForTyping'), 'El efecto de escritura debe segmentar por grafemas y palabras para idiomas CJK/Thai/Birmano/Índicos.');
  assert(jsText.includes('function getLocalizedTextDensity') && jsText.includes('function getSummaryDensityUnits') && jsText.includes('function getInterfaceDensityUnits') && jsText.includes('function getServiceRailDensityUnits') && jsText.includes('summaryDensityUnits * 0.42') && jsText.includes('interfaceDensityUnits >= 310') && jsText.includes('document.body.dataset.textDensity') && jsText.includes("['zh', 'ja', 'ko', 'th', 'my']"), 'El runtime debe calcular densidad textual por escena/idioma incluyendo cierre, microcopy de formulario, CTA y riel de servicios para conservar responsive con traducciones largas.');
  assert(jsText.includes('function getLanguageTextScript') && jsText.includes('document.documentElement.dataset.textScript') && jsText.includes('indicScriptLanguageCodes') && jsText.includes('ethiopicScriptLanguageCodes'), 'El runtime debe clasificar escrituras densas, índicas y etiópicas para ajustar el layout sin cambiar la estructura visual.');
  assert(cssText.includes('html[data-text-script="indic"] .hm-question') && cssText.includes('html[data-text-script="ethiopic"] .hm-question') && cssText.includes('text-rendering: optimizeLegibility'), 'El CSS debe incluir perfiles visuales específicos para idiomas índicos y etiópicos.');
  assert(jsText.includes('function syncResponsiveFit') && jsText.includes("scheduleResponsiveFitCheck('options-ready')") && jsText.includes("document.body.classList.toggle('hm-viewport-cramped'") && jsText.includes('RESPONSIVE_FIT_CHECK_DELAYS_MS'), 'El runtime debe medir viewport/contenido tras render y activar un modo compacto cuando textos traducidos o pantallas pequeñas amenacen con cortar contenido.');
  assert(cssText.includes('body.hm-viewport-cramped:not([data-scene="intro"]):not([data-scene="summary"]) .hm-decision-zone') && cssText.includes('overscroll-behavior: contain') && cssText.includes('body.hm-viewport-cramped[data-scene="summary"] .hm-card'), 'El CSS debe tener un modo hm-viewport-cramped para compactar escenas no intro/resumen, mantener scroll interno y evitar cortes en traducciones largas.');

  const manifest = detectedLanguageManifest;
  assert(manifest.defaultLanguage === 'es', 'El catálogo dinámico debe conservar español como idioma principal.');
  assert(Array.isArray(manifest.languages) && manifest.languages.length === REQUIRED_LANGUAGE_COUNT && REQUIRED_LANGUAGE_COUNT > 0, 'El catálogo dinámico debe incluir solo idiomas presentes en textX y textX/seo.');
  const codes = unique(manifest.languages.map((language) => language.code));
  assert(codes.length === REQUIRED_LANGUAGE_COUNT, 'El catálogo dinámico debe tener códigos únicos exactos.');
  assert(codes.includes('es') && codes.includes('en'), 'El catálogo dinámico debe incluir es/en cuando ambos bundles existen en textX y textX/seo.');
  assertLanguageManifestMetadata(manifest.languages, 'catálogo dinámico textX + textX/seo');
  assertDomI18nBindingRuntimeSupport(indexHtml, jsText);
  assertProfessionalFallbackLanguageCatalog(jsText, manifest.languages, 'js/hashinmy-immersive.js');

  const textFiles = (await readdir(path.join(root, 'textX'))).filter((file) => file.endsWith('.json') && file !== 'languages.json');
  assert(codes.every((code) => textFiles.includes(`${code}.json`)), 'Cada idioma detectado debe existir como textX/{isocode}.json.');
  const spanishBundle = await readJson('textX/es.json');
  const englishBundle = await readJson('textX/en.json');
  assert(spanishBundle.ui?.primaryFinance === 'Solicitar diagnóstico' && spanishBundle.ui?.primaryQuote === 'Cotizar mi sistema' && spanishBundle.ui?.submitRoute === 'Enviar a Hashinmy', 'textX/es.json debe usar CTAs directos y cierre explícito: Solicitar diagnóstico, Cotizar mi sistema y Enviar a Hashinmy.');
  assert(englishBundle.ui?.primaryFinance === 'Request diagnosis' && englishBundle.ui?.primaryQuote === 'Quote my system' && englishBundle.ui?.submitRoute === 'Send to Hashinmy', 'textX/en.json debe mantener CTAs internacionales equivalentes y cierre explícito para conversión.');
  for (const code of codes.slice(0, REQUIRED_LANGUAGE_COUNT)) {
    assert(await exists(path.join(root, 'textX', `${code}.json`)), `Falta textX/${code}.json`);
    if (await exists(path.join(root, 'textX', `${code}.json`))) {
      const bundle = await readJson(`textX/${code}.json`);
      assertBundleSchema(code, bundle);
      assertNoRawSpanishSeoTermLeakage(code, await readJson(`textX/seo/${code}.json`));
      assertBundleCatalogMetadata(code, bundle, manifest.languages);
      assertBundleParity(code, bundle, spanishBundle);
      assertFirstSceneSpanishParity(code, bundle, spanishBundle);
      assertIntroDiagnosticDecision(code, bundle);
      assertNoEmptyTextStrings(code, bundle);
      assertTextBindingCoverage(code, bundle, indexHtml);
      assertPriorityLanguageQuality(code, bundle, englishBundle);
      assertNaturalSubmissionUi(code, bundle);
      assertNaturalFormNote(code, bundle);
      assertNaturalFormMicrocopy(code, bundle);
      assertProofShowcaseNativeCopy(code, bundle, englishBundle);
      assertProjectDescriptionMicrocopy(code, bundle);
      assertNaturalOptionInsights(code, bundle);
      assertNaturalSceneInsights(code, bundle);
      assertNoRawBriefLocalizationLeakage(code, bundle);
      assertNoRawEnglishCommercialCopy(code, bundle);
      assertNativeMetaKeywordLocalization(code, bundle);
      assertNoRawSpanishCommercialCopy(code, bundle);
      assertVisibleTechnicalLocalization(code, bundle, englishBundle);
      assertNoRawVisualLocalizationLeakage(code, bundle);
      assertPriorityNarrativeDepth(code, bundle);
      assertSummaryCommercialDepth(code, bundle);
      assertNoKeywordOnlySceneCopy(code, bundle);
      assertDistinctDecisionSceneCopy(code, bundle);
      assertNoTemplatedSceneCopyOpening(code, bundle);
      assertNoCompressedKeywordLead(code, bundle);
      assertLowEnglishLeakage(code, bundle, englishBundle);
      assertLowSpanishLeakage(code, bundle, spanishBundle);
    }
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Experiencia inmersiva validada: ${webpReferences.length} escenas visuales, catálogo dinámico textX/textX/seo con ${REQUIRED_LANGUAGE_COUNT} idiomas y ruta comercial responsive.`);
