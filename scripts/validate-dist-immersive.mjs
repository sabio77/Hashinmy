import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getLlmsHomeLabel, getLlmsHubLabel } from './llms-i18n-labels.mjs';
import { getConfiguredPublicHost, loadMemoriaBackendProjectConfig } from './memoria-backend-config.mjs';

const root = process.cwd();
const dist = path.join(root, 'dist');
const failures = [];
let REQUIRED_LANGUAGE_COUNT = 0;
const REQUIRED_SCENES = ['intro', 'serviceFamily', 'buildType', 'automationType', 'modernization', 'operation', 'value', 'risk', 'finance', 'timeline', 'summary'];
const MEMORIA_BACKEND_CONFIG = await loadMemoriaBackendProjectConfig(root);
const PUBLIC_SITE_URL = MEMORIA_BACKEND_CONFIG.ORIGEN_PROYECTO;
const PUBLIC_SITE_HOST = getConfiguredPublicHost(MEMORIA_BACKEND_CONFIG);
const REQUIRED_SEO_UI_LABEL_KEYS = ['productsLabel', 'allLabel', 'closeLabel', 'backToProductsLabel', 'viewSolutionLabel', 'classicViewLabel', 'classicViewAriaLabel', 'modernViewLabel', 'modernViewAriaLabel', 'categoryNavLabel', 'simpleLabel', 'whoLabel', 'technicalLabel', 'includesLabel', 'glossaryLabel', 'guideLabel', 'faqLabel', 'detailTitle', 'detailLead', 'scopeCatalogLabel', 'glossarySetLabel'];
const LANGUAGE_PATH_PREFIX = 'l';

const DENSE_SCRIPT_LANGUAGE_CODES = new Set(['zh', 'ja', 'ko', 'th', 'my']);
const INDIC_SCRIPT_LANGUAGE_CODES = new Set(['hi', 'bn', 'mr', 'te', 'ta', 'gu', 'pa', 'kn', 'ml', 'or', 'as', 'ne', 'si']);
const RTL_SCRIPT_LANGUAGE_CODES = new Set(['ar', 'ur', 'fa', 'he']);
const ETHIOPIC_SCRIPT_LANGUAGE_CODES = new Set(['am']);

function getExpectedTextScript(code = 'es') {
  const normalized = String(code || 'es').trim().toLowerCase();
  if (RTL_SCRIPT_LANGUAGE_CODES.has(normalized)) return 'rtl';
  if (DENSE_SCRIPT_LANGUAGE_CODES.has(normalized)) return 'dense';
  if (INDIC_SCRIPT_LANGUAGE_CODES.has(normalized)) return 'indic';
  if (ETHIOPIC_SCRIPT_LANGUAGE_CODES.has(normalized)) return 'ethiopic';
  return 'latin';
}
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
const RAW_STATIC_SPANISH_SEO_PATTERN = /\b(?:software a medida|inteligencia artificial|automatizaci[oó]n|cotizadores t[eé]cnicos|Solicitar diagn[oó]stico|Sistemas adaptados|P[aá]ginas web|exportaci[oó]n DXF|Ver servicios en formato tradicional|Vista cl[aá]sica|Categor[ií]as de productos Hashinmy|Alcance posible de Hashinmy|Glosario sencillo de Hashinmy|P[aá]gina no encontrada)\b/iu;
const DOM_I18N_BINDING_KINDS = ['text', 'aria', 'placeholder', 'content'];
const DOM_SEO_I18N_BINDING_KINDS = ['text', 'aria'];

const LOCALIZED_VISIBLE_TECH_KEYS = [
  'ui.technicalBase',
  'scenes.risk.options.1.tech',
  'scenes.timeline.options.2.tech',
  'recommendation.technicalParts.automatizacion',
  'recommendation.technicalParts.web_global'
];

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

function assertNoRawEnglishCommercialCopy(code, bundle, sourceLabel = `dist/textX/${code}.json`) {
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

function assertNoRawSpanishCommercialCopy(code, bundle, sourceLabel = `dist/textX/${code}.json`) {
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

function assert(condition, message) {
  if (!condition) failures.push(message);
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

function buildStaticModernViewHref(pathname = '/') {
  return `/?seo=${encodeURIComponent(normalizeSeoPath(pathname || '/'))}`;
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


function assertLlmsDiscoveryCompleteness(llmsText, seoContent, sourceLabel = 'dist/llms.txt') {
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

function assertSeoContentDepth(seoContent, sourceLabel = 'dist/textX/seo/{isocode}.json') {
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

function seoDistEntryPath(pathname = '/') {
  const normalized = `/${String(pathname || '/').split('?')[0].split('#')[0].replace(/^\/+/, '')}`.replace(/\/index\.html$/i, '/');
  const clean = (normalized.endsWith('/') ? normalized : `${normalized}/`).replace(/^\//, '').replace(/\/$/, '');
  return clean ? `${clean}/index.html` : 'index.html';
}

function htmlTextEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function htmlAttributeEscape(value = '') {
  return htmlTextEscape(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function stripHtmlTags(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractH1Texts(html = '') {
  return [...String(html || '').matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => stripHtmlTags(match[1]));
}

function extractStaticSeoPageText(html = '') {
  const match = String(html || '').match(/<section\b[^>]*class=["'][^"']*hm-seo-static-page[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
  return stripHtmlTags(match?.[0] || '');
}

function countTextOccurrences(source = '', needle = '') {
  const target = String(needle || '').trim();
  if (!target) return 0;
  return String(source || '').split(target).length - 1;
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasHydratedDataText(html, textPath, expectedText) {
  const pattern = new RegExp(`data-i18n-text=[\"']${escapeRegExp(textPath)}[\"'][^>]*>${escapeRegExp(htmlTextEscape(expectedText))}<`, 'i');
  return pattern.test(html);
}


function collectDomBindingPaths(html = '', namespace = 'data-i18n', kinds = DOM_I18N_BINDING_KINDS) {
  const kindPattern = kinds.map(escapeRegExp).join('|');
  const pattern = new RegExp(`\\s${escapeRegExp(namespace)}-(${kindPattern})=(["'])([\\s\\S]*?)\\2`, 'gi');
  const paths = [];
  for (const match of String(html || '').matchAll(pattern)) {
    const pathName = String(match[3] || '').trim();
    if (pathName) paths.push(pathName);
  }
  return Array.from(new Set(paths)).sort();
}

function hasHydratedTextBinding(html = '', dataAttribute = 'data-i18n-text', textPath = '', expectedText = '') {
  const pattern = new RegExp(`<([a-z][\\w:-]*)\\b(?=[^>]*\\s${escapeRegExp(dataAttribute)}=["']${escapeRegExp(textPath)}["'])[^>]*>${escapeRegExp(htmlTextEscape(expectedText))}<\\/\\1>`, 'i');
  return pattern.test(String(html || ''));
}

function hasHydratedAttributeBinding(html = '', dataAttribute = 'data-i18n-aria', textPath = '', htmlAttributeName = 'aria-label', expectedText = '') {
  const pattern = new RegExp(`<[a-z][\\w:-]*\\b(?=[^>]*\\s${escapeRegExp(dataAttribute)}=["']${escapeRegExp(textPath)}["'])(?=[^>]*\\s${escapeRegExp(htmlAttributeName)}=["']${escapeRegExp(htmlAttributeEscape(expectedText))}["'])[^>]*>`, 'i');
  return pattern.test(String(html || ''));
}

function assertHydratedDomBindings(html = '', bundle = {}, sourceLabel = 'dist/{isocode}/index.html') {
  const textFailures = collectDomBindingPaths(html, 'data-i18n', ['text']).filter((pathName) => {
    const value = valueAtPath(bundle, pathName);
    return typeof value !== 'string' || !value.trim() || !hasHydratedTextBinding(html, 'data-i18n-text', pathName, value);
  });

  const attributeChecks = [
    ['aria', 'data-i18n-aria', 'aria-label'],
    ['placeholder', 'data-i18n-placeholder', 'placeholder'],
    ['content', 'data-i18n-content', 'content']
  ];
  const attributeFailures = attributeChecks.flatMap(([kind, dataAttribute, htmlAttributeName]) => collectDomBindingPaths(html, 'data-i18n', [kind]).filter((pathName) => {
    const value = valueAtPath(bundle, pathName);
    return typeof value !== 'string' || !value.trim() || !hasHydratedAttributeBinding(html, dataAttribute, pathName, htmlAttributeName, value);
  }).map((pathName) => `${htmlAttributeName}:${pathName}`));

  assert(
    !textFailures.length && !attributeFailures.length,
    `${sourceLabel} no hidrata todos los data-i18n desde textX antes de JS; fallos: ${[...textFailures, ...attributeFailures].slice(0, 12).join(', ')}.`
  );
}

function assertHydratedSeoDomBindings(html = '', seoBundle = {}, sourceLabel = 'dist/{isocode}/index.html') {
  const textFailures = collectDomBindingPaths(html, 'data-seo-i18n', ['text']).filter((pathName) => {
    const value = valueAtPath(seoBundle, pathName);
    return typeof value !== 'string' || !value.trim() || !hasHydratedTextBinding(html, 'data-seo-i18n-text', pathName, value);
  });
  const ariaFailures = collectDomBindingPaths(html, 'data-seo-i18n', ['aria']).filter((pathName) => {
    const value = valueAtPath(seoBundle, pathName);
    return typeof value !== 'string' || !value.trim() || !hasHydratedAttributeBinding(html, 'data-seo-i18n-aria', pathName, 'aria-label', value);
  });

  assert(
    !textFailures.length && !ariaFailures.length,
    `${sourceLabel} no hidrata todos los data-seo-i18n desde textX/seo antes de JS; fallos: ${[...textFailures, ...ariaFailures].slice(0, 12).join(', ')}.`
  );
}


function getLocalizedEntryPath(code = 'es') {
  const language = String(code || 'es').trim().toLowerCase() || 'es';
  return `${language}/index.html`;
}

function buildExpectedLocalizedHref(code = 'es') {
  const language = String(code || 'es').trim().toLowerCase() || 'es';
  const url = new URL(PUBLIC_SITE_URL);
  url.pathname = `/${encodeURIComponent(language)}/`;
  return url.toString();
}

function hasSelectedLanguageOption(html, language) {
  const code = escapeRegExp(language.code);
  const optionPattern = new RegExp(`<option[^>]*value=["']${code}["'][^>]*>`, 'i');
  const match = String(html || '').match(optionPattern);
  return Boolean(match && /\sselected(?:\s|>)/i.test(match[0]));
}

function extractElementById(html = '', id = '') {
  const safeId = escapeRegExp(id);
  const pattern = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*\\sid=["']${safeId}["'][^>]*>[\\s\\S]*?<\\/\\1>`, 'i');
  return String(html || '').match(pattern)?.[0] || '';
}

function htmlIncludesAttribute(elementHtml = '', attributeName = '', expectedValue = '') {
  const pattern = new RegExp(`\\s${escapeRegExp(attributeName)}=(["'])${escapeRegExp(htmlAttributeEscape(expectedValue))}\\1`, 'i');
  return pattern.test(String(elementHtml || ''));
}

function extractMetaContent(html = '', name = '') {
  const safeName = escapeRegExp(name);
  const pattern = new RegExp(`<meta\\s+[^>]*name=["']${safeName}["'][^>]*content=(["'])([\\s\\S]*?)\\1[^>]*>`, 'i');
  return String(html || '').match(pattern)?.[2] || '';
}

function extractStructuredJsonLd(html = '') {
  const match = String(html || '').match(/<script\s+type=["']application\/ld\+json["']\s+id=["']hmStructuredData["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function assertStaticSeoMetadataLocalized(code, bundle, html, sourceLabel, seoBundle = null) {
  const keywords = extractMetaContent(html, 'keywords');
  const expectedKeywords = Array.isArray(seoBundle?.hubMetaKeywords) ? seoBundle.hubMetaKeywords.filter(Boolean) : [];
  if (expectedKeywords.length) {
    const missingKeywords = expectedKeywords.slice(0, 3).filter((keyword) => !keywords.includes(keyword));
    assert(!missingKeywords.length, `${sourceLabel} debe hidratar meta keywords desde textX/seo/${code}.json; faltan: ${missingKeywords.join(', ')}.`);
  }

  const payload = extractStructuredJsonLd(html);
  assert(payload && Array.isArray(payload['@graph']), `${sourceLabel} debe publicar JSON-LD válido en hmStructuredData antes de ejecutar JS.`);
  if (!payload || !Array.isArray(payload['@graph'])) return;

  const structuredText = JSON.stringify(payload);
  assert(structuredText.includes(bundle.meta.description) || structuredText.includes(bundle.meta.ogDescription), `${sourceLabel} debe usar descripción localizada de textX/${code}.json dentro del JSON-LD estático.`);
  if (seoBundle?.hubTitle) assert(structuredText.includes(seoBundle.hubTitle), `${sourceLabel} debe incluir el hub SEO localizado de textX/seo/${code}.json dentro del JSON-LD estático.`);
  assert(structuredText.includes('#offer-catalog') && structuredText.includes('#itemlist') && structuredText.includes('#experience-logos'), `${sourceLabel} debe conservar OfferCatalog, ItemList y experiencia en JSON-LD localizado.`);
  assert(structuredText.includes('#service-financed-development') && structuredText.includes('knowsAbout') && !structuredText.includes('Software a medida, IA, CAD DXF, nube, PC, SEO'), `${sourceLabel} debe publicar JSON-LD de marca con financiación 100%, knowsAbout estratégico y sin el slogan viejo centrado en CAD/SEO.`);

  if (code !== 'es') {
    assert(!RAW_STATIC_SPANISH_SEO_PATTERN.test(keywords), `${sourceLabel} conserva meta keywords en español para ${code}: ${keywords.slice(0, 120)}.`);
    assert(!RAW_STATIC_SPANISH_SEO_PATTERN.test(structuredText), `${sourceLabel} conserva JSON-LD estático en español para ${code}; debe salir localizado desde textX y textX/seo antes de JS.`);
  }
}

function assertStaticLocalizedEntryPage(code, bundle, language, html, sourceLabel, seoBundle = null) {
  const resourcePrefix = '../';
  assert(html.includes(`${resourcePrefix}css/hashinmy-immersive.css`) && html.includes(`${resourcePrefix}js/hashinmy-immersive.js`), `${sourceLabel} debe apuntar a recursos raíz con prefijo ${resourcePrefix} para no buscar css/js dentro de la ruta localizada.`);
  assert(html.includes(`${resourcePrefix}assets/hashinmy-logo-emblem.png`), `${sourceLabel} debe resolver íconos y logo desde assets con prefijo ${resourcePrefix}.`);
  assert(html.includes(`<title>${htmlTextEscape(bundle.meta.title)}</title>`), `${sourceLabel} debe publicar title estático desde textX/${code}.json.`);
  assert(html.includes(`content="${htmlAttributeEscape(bundle.meta.description)}"`), `${sourceLabel} debe publicar description estática desde textX/${code}.json.`);
  assert(html.includes(`content="${htmlAttributeEscape(bundle.meta.ogTitle)}"`) && html.includes(`content="${htmlAttributeEscape(bundle.meta.ogDescription)}"`), `${sourceLabel} debe publicar OG title/description localizados antes de ejecutar JS.`);
  assert(html.includes(`rel="canonical" href="${buildExpectedLocalizedHref(code)}"`), `${sourceLabel} debe tener canonical localizado en ${buildExpectedLocalizedHref(code)}.`);
  assert(html.includes(`lang="${htmlAttributeEscape(bundle.htmlLang)}"`) && html.includes(`dir="${htmlAttributeEscape(bundle.dir)}"`) && html.includes(`data-language="${htmlAttributeEscape(code)}"`) && html.includes(`data-text-script="${htmlAttributeEscape(getExpectedTextScript(code))}"`), `${sourceLabel} debe declarar lang/dir/data-language/data-text-script del idioma antes de ejecutar JS para que CSS i18n y responsive actúen desde el primer render.`);
  assert(html.includes(htmlTextEscape(bundle.scenes.intro.title)) && html.includes(htmlTextEscape(bundle.scenes.intro.copy)), `${sourceLabel} debe hidratar título y copy inicial desde textX/${code}.json para primer render sin JS.`);
  assert(hasHydratedDataText(html, 'ui.skip', bundle.ui.skip) && hasHydratedDataText(html, 'ui.primaryFinance', bundle.ui.primaryFinance) && hasHydratedDataText(html, 'ui.submitRoute', bundle.ui.submitRoute), `${sourceLabel} debe hidratar textos visibles de UI desde textX/${code}.json conservando data-i18n para runtime.`);
  assertHydratedDomBindings(html, bundle, sourceLabel);
  assert(html.includes(`placeholder="${htmlAttributeEscape(bundle.ui.contactPlaceholder)}"`), `${sourceLabel} debe hidratar placeholders desde textX/${code}.json para formularios sin JS.`);
  assert(hasSelectedLanguageOption(html, language), `${sourceLabel} debe dejar seleccionado el idioma ${code} en el HTML estático inicial.`);
  assert((html.match(/data-hashinmy-hreflang="static"/g) || []).length >= REQUIRED_LANGUAGE_COUNT + 1 && html.includes('hreflang="x-default"'), `${sourceLabel} debe conservar alternates hreflang estáticos para los idiomas detectados y x-default.`);
  assertStaticSeoMetadataLocalized(code, bundle, html, sourceLabel, seoBundle);

  if (seoBundle && typeof seoBundle === 'object') {
    const expectedSeoHref = normalizeSeoPath(seoBundle.hubUrl || `/${code}/products/`);
    const expectedSeoLabel = String(seoBundle.entryLabel || seoBundle.uiLabels?.productsLabel || '').trim();
    const expectedClassicLabel = String(seoBundle.uiLabels?.classicViewLabel || '').trim();
    const expectedClassicAriaLabel = String(seoBundle.uiLabels?.classicViewAriaLabel || '').trim();
    const seoEntry = extractElementById(html, 'hmSeoHubButton');
    const classicEntry = extractElementById(html, 'hmSeoClassicLink');

    assert(
      Boolean(expectedSeoLabel)
        && htmlIncludesAttribute(seoEntry, 'href', expectedSeoHref)
        && htmlIncludesAttribute(seoEntry, 'aria-label', expectedSeoLabel)
        && seoEntry.includes(`>${htmlTextEscape(expectedSeoLabel)}</a>`),
      `${sourceLabel} debe hidratar el enlace Productos desde textX/seo/${code}.json hacia ${expectedSeoHref}, sin depender de JS ni caer en español.`
    );
    assert(
      Boolean(expectedClassicLabel && expectedClassicAriaLabel)
        && htmlIncludesAttribute(classicEntry, 'href', expectedSeoHref)
        && htmlIncludesAttribute(classicEntry, 'aria-label', expectedClassicAriaLabel)
        && classicEntry.includes(`>${htmlTextEscape(expectedClassicLabel)}</a>`),
      `${sourceLabel} debe hidratar Vista clásica desde textX/seo/${code}.json, incluyendo texto visible, aria-label y URL localizados.`
    );
    if (code !== 'es') {
      assert(!htmlIncludesAttribute(seoEntry, 'href', '/es/productos/') && !htmlIncludesAttribute(classicEntry, 'href', '/es/productos/'), `${sourceLabel} no debe conservar enlaces estáticos a /es/productos/ cuando el idioma activo es ${code}.`);
      assert(!seoEntry.includes('>Productos</a>') && !classicEntry.includes('>Vista clásica</a>'), `${sourceLabel} no debe conservar rótulos españoles en los accesos SEO estáticos del idioma ${code}.`);
    }
    assertStaticSeoChromeLocalized(code, seoBundle, html, sourceLabel);
    assertHydratedSeoDomBindings(html, seoBundle, sourceLabel);
  }
}


function assertStaticSeoChromeLocalized(code, seoBundle, html, sourceLabel, { classicPage = false, pagePath = '' } = {}) {
  if (!seoBundle || typeof seoBundle !== 'object') return;

  const expectedSeoHref = normalizeSeoPath(seoBundle.hubUrl || `/${code}/products/`);
  const expectedSeoLabel = String(seoBundle.entryLabel || seoBundle.uiLabels?.productsLabel || '').trim();
  const expectedCloseLabel = String(seoBundle.closeLabel || seoBundle.uiLabels?.closeLabel || '').trim();
  const expectedCategoryNavLabel = String(seoBundle.uiLabels?.categoryNavLabel || '').trim();
  const expectedClassicLabel = String((classicPage ? seoBundle.uiLabels?.modernViewLabel : seoBundle.uiLabels?.classicViewLabel) || '').trim();
  const expectedClassicAriaLabel = String((classicPage ? seoBundle.uiLabels?.modernViewAriaLabel : seoBundle.uiLabels?.classicViewAriaLabel) || '').trim();
  const expectedClassicHref = classicPage ? buildStaticModernViewHref(pagePath || expectedSeoHref) : expectedSeoHref;
  const seoEntry = extractElementById(html, 'hmSeoHubButton');
  const classicEntry = extractElementById(html, 'hmSeoClassicLink');
  const closeButton = extractElementById(html, 'hmSeoHubClose');
  const categoryNav = extractElementById(html, 'hmSeoHubCategories');

  assert(
    Boolean(expectedSeoLabel)
      && htmlIncludesAttribute(seoEntry, 'href', expectedSeoHref)
      && htmlIncludesAttribute(seoEntry, 'aria-label', expectedSeoLabel)
      && seoEntry.includes(`>${htmlTextEscape(expectedSeoLabel)}</a>`),
    `${sourceLabel} debe hidratar el acceso Productos desde textX/seo/${code}.json, incluyendo texto, aria-label y href localizados.`
  );
  assert(
    Boolean(expectedClassicLabel && expectedClassicAriaLabel)
      && htmlIncludesAttribute(classicEntry, 'href', expectedClassicHref)
      && htmlIncludesAttribute(classicEntry, 'aria-label', expectedClassicAriaLabel)
      && htmlIncludesAttribute(classicEntry, 'aria-pressed', classicPage ? 'true' : 'false')
      && classicEntry.includes(`>${htmlTextEscape(expectedClassicLabel)}</a>`)
      && (classicPage ? !classicEntry.includes('data-action=') : classicEntry.includes('data-action="seo-classic-toggle"')),
    `${sourceLabel} debe hidratar el acceso ${classicPage ? 'Vista Moderna' : 'Vista clásica'} desde textX/seo/${code}.json, incluyendo texto, aria-label y href localizados.`
  );
  assert(
    Boolean(expectedCloseLabel) && htmlIncludesAttribute(closeButton, 'aria-label', expectedCloseLabel),
    `${sourceLabel} debe hidratar el botón cerrar del hub SEO desde textX/seo/${code}.json y no conservar el fallback español.`
  );
  assert(
    Boolean(expectedCategoryNavLabel) && htmlIncludesAttribute(categoryNav, 'aria-label', expectedCategoryNavLabel),
    `${sourceLabel} debe hidratar la navegación de categorías del hub SEO desde textX/seo/${code}.json y no conservar el fallback español.`
  );

  if (code !== 'es') {
    const chromeText = [seoEntry, classicEntry, closeButton, categoryNav].join(' ');
    assert(!RAW_STATIC_SPANISH_SEO_PATTERN.test(chromeText), `${sourceLabel} conserva chrome SEO estático en español para ${code}; debe salir localizado antes de ejecutar JS.`);
    assert(!htmlIncludesAttribute(seoEntry, 'href', '/es/productos/') && !htmlIncludesAttribute(classicEntry, 'href', '/es/productos/'), `${sourceLabel} no debe conservar enlaces estáticos a /es/productos/ cuando el idioma activo es ${code}.`);
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

function assertNoEmptyTextStrings(code, bundle, sourceLabel = `dist/textX/${code}.json`) {
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
    `dist/textX/${code}.json mantiene el copy de cierre demasiado corto o poco comercial: ${normalizedLength} unidades, mínimo ${minUnits}.`
  );
  assert(
    !startsWithKeywordFragment && keywordFragments.length <= 1,
    `dist/textX/${code}.json mantiene el cierre fragmentado como lista de palabras clave; debe ser una frase comercial natural.`
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
    `dist/textX/${code}.json conserva narrativa de escenas con separadores tipo keyword en: ${keywordOnlyScenes.slice(0, 6).join(', ')}. El copy debe leerse como texto comercial natural.`
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
    `dist/textX/${code}.json reutiliza demasiado el mismo copy entre escenas de decisión: ${uniqueCopies.size} textos únicos. Cada idioma debe mantener narrativa adaptada por escena.`
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

function assertVisibleTechnicalLocalization(code, bundle, englishBundle, sourceLabel = `dist/textX/${code}.json`) {
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
    `${sourceLabel} mantiene textos técnicos visibles sin adaptar: ${notLocalized.join(', ')}.`
  );
}

const STRICT_VISUAL_LOCALIZATION_LANGUAGE_CODES = new Set(['fil', 'bn', 'mr', 'ta', 'te']);
const RAW_VISUAL_BUILD_PATTERN = /^Build$/u;
const RAW_STRICT_VISUAL_TERM_PATTERN = /\b(?:route|proposal|Operation|seguridad|ruta)\b/iu;
const RAW_VISUAL_TERM_IGNORED_PATHS = new Set(['iso', 'name', 'nativeName', 'htmlLang', 'dir', 'schemaVersion']);

function assertNoRawVisualLocalizationLeakage(code, bundle, sourceLabel = `dist/textX/${code}.json`) {
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
    assert(typeof value === 'string' && value.trim().length > 0, `dist/textX/${code}.json debe tener ${key} localizado.`);
    assert(value !== englishValue, `dist/textX/${code}.json mantiene ${key} igual al inglés; debe estar adaptado al idioma seleccionado.`);
  }
}



function assertLanguageManifestMetadata(languages, sourceLabel = 'dist/textX/languages.json') {
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


function assertFirstSceneSpanishParity(code, bundle, spanishBundle, sourceLabel = `dist/textX/${code}.json`) {
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


function assertIntroDiagnosticDecision(code, bundle, sourceLabel = `dist/textX/${code}.json`) {
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

function assertBundleCatalogMetadata(code, bundle, languages, sourceLabel = `dist/textX/${code}.json`) {
  const catalogLanguage = (Array.isArray(languages) ? languages : []).find((language) => language.code === code);
  assert(catalogLanguage, `${sourceLabel} debe existir también en dist/textX/languages.json.`);
  if (!catalogLanguage) return;

  const fields = ['name', 'nativeName', 'htmlLang', 'dir'];
  const mismatches = fields.filter((field) => String(bundle?.[field] || '').trim() !== String(catalogLanguage?.[field] || '').trim());
  assert(
    !mismatches.length,
    `${sourceLabel} debe mantener metadatos name/nativeName/htmlLang/dir idénticos al catálogo central; diferencias: ${mismatches.join(', ')}`
  );
}

async function readDist(relativePath) {
  return readFile(path.join(dist, relativePath), 'utf8');
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
    `${sourceLabel} debe rechazar catálogos parciales de textX/textX/seo y manifests sin name/nativeName/htmlLang/dir, degradando a español sin romper ejecución.`
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
  return JSON.parse(await readDist(relativePath));
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
  const textRoot = path.join(dist, 'textX');
  const seoRoot = path.join(dist, 'textX', 'seo');
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

async function readSeoContentFromTextX(manifest = null) {
  const detectedManifest = manifest || await readDetectedLanguageManifest();
  const allowedCodes = new Set((detectedManifest.languages || []).map((language) => language.code));
  const seoRoot = path.join(dist, 'textX', 'seo');
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

const required = [
  'index.html',
  '404.html',
  'css/hashinmy-immersive.css',
  'css/hashinmy-classic.css',
  'js/hashinmy-immersive.js',
  'estructura_del_proyecto.json',
  'textX/languages.json',
  'textX/es.json',
  'textX/en.json',
  'textX/seo/es.json',
  'textX/seo/en.json',
  'robots.txt',
  'llms.txt',
  'sitemap.xml',
  'render.yaml'
];

for (const file of required) {
  assert(await exists(path.join(dist, file)), `Falta dist/${file}`);
}

if (!failures.length) {
  const indexHtml = await readDist('index.html');
  const englishIndexHtml = await readDist('en/index.html');
  const cssText = await readDist('css/hashinmy-immersive.css');
  const classicCssText = await readDist('css/hashinmy-classic.css');
  const jsText = await readDist('js/hashinmy-immersive.js');
  const buildScript = await readFile(path.join(root, 'scripts', 'build-immersive.mjs'), 'utf8');
  try {
    new Function(jsText);
  } catch (error) {
    failures.push(`dist/js/hashinmy-immersive.js no supera validación sintáctica: ${error.message}`);
  }
  assertAtomicChoiceTransition(jsText, 'dist/js/hashinmy-immersive.js');

assert(
  jsText.includes(`intro: {
      options: [
        { next: 'serviceFamily', sets: [{ key: 'financing', value: 'contacto_directo' }] },
        { next: 'serviceFamily', sets: [{ key: 'financing', value: 'financiamiento_100' }], priority: 'high' },
        { next: 'serviceFamily', sets: [{ key: 'financing', value: 'sin_financiacion' }] }`),
  'La escena inicial debe mantener diagnóstico, financiación y cotización, pero solo la financiación 100% debe llevar priority high sin romper el avance a serviceFamily.'
);

  const manifest = await readDetectedLanguageManifest();
  REQUIRED_LANGUAGE_COUNT = manifest.languages.length;
  const detectedLanguageCodes = new Set(manifest.languages.map((language) => language.code));
  const textFiles = (await readdir(path.join(dist, 'textX'))).filter((file) => file.endsWith('.json') && file !== 'languages.json');
  const englishBundle = await readJson('textX/en.json');
  const spanishBundle = await readJson('textX/es.json');
  const sitemapXml = await readDist('sitemap.xml');
  const robotsTxt = await readDist('robots.txt');
  const llmsText = await readDist('llms.txt');
  const seoContent = await readSeoContentFromTextX(manifest);
  const distProjectStructure = await readJson('estructura_del_proyecto.json');

  const renderConfig = await readDist('render.yaml');

  assert(renderConfig.includes('path: /textX/*') && renderConfig.includes('no-store, no-cache, must-revalidate, max-age=0') && renderConfig.includes('path: /textX/*.json') && renderConfig.includes('application/json; charset=utf-8'), 'dist/render.yaml debe proteger textX/*.json contra caché persistente y declarar charset JSON para publicar cambios de idioma sin rezagos ni corrupción de caracteres.');
  assert(renderConfig.includes('path: /llms.txt') && renderConfig.includes('text/plain; charset=utf-8'), 'dist/render.yaml debe declarar llms.txt como texto plano para descubrimiento por IA.');
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
  assertRenderAccessibleDirectRoutes(renderConfig, seoContent, manifest, 'dist/render.yaml');
  assert(renderConfig.includes('path: /404.html') && renderConfig.includes('X-Robots-Tag') && renderConfig.includes('noindex, nofollow, noarchive'), 'render.yaml debe enviar X-Robots-Tag noindex para 404.html.');
  assert(spanishBundle.ui?.primaryFinance === 'Solicitar diagnóstico' && spanishBundle.ui?.primaryQuote === 'Cotizar mi sistema' && spanishBundle.ui?.submitRoute === 'Enviar a Hashinmy', 'textX/es.json debe usar CTAs directos y cierre explícito: Solicitar diagnóstico, Cotizar mi sistema y Enviar a Hashinmy.');
  assert(englishBundle.ui?.primaryFinance === 'Request diagnosis' && englishBundle.ui?.primaryQuote === 'Quote my system' && englishBundle.ui?.submitRoute === 'Send to Hashinmy', 'textX/en.json debe mantener CTAs internacionales equivalentes y cierre explícito para conversión.');
  assert(seoContent.languages?.es?.openDetailLabel === 'Ver solución' && seoContent.languages?.en?.openDetailLabel === 'View solution' && jsText.includes('hm-seo-card__cta') && cssText.includes('.hm-seo-card__cta'), 'El hub de Productos debe mostrar CTA visible “Ver solución” en cada tarjeta, no solo enlaces silenciosos.');
  assert(indexHtml.includes('id="hmSeoClassicLink"') && indexHtml.includes('Vista clásica') && indexHtml.includes('data-action="seo-classic-toggle"') && jsText.includes('function syncSeoClassicLink') && jsText.includes("getSeoUiLabel('modernViewLabel'") && jsText.includes('function renderSeoClassicContent') && jsText.includes('function renderSeoClassicCategoryJumpNav') && jsText.includes('data-seo-classic-category') && jsText.includes("closest('[data-seo-classic-category]')") && jsText.includes('seoClassicView') && jsText.includes('function syncSeoClassicStylesheetState') && jsText.includes('stylesheet.disabled = !isClassic') && buildScript.includes('function buildSeoStaticCategoryJumpNav') && buildScript.includes('function buildSeoStaticModernToggle') && classicCssText.includes('body.hm-seo-classic-view') && classicCssText.includes('.hm-seo-hub--classic') && classicCssText.includes('.hm-seo-static-page--hub') && classicCssText.includes('.hm-seo-static-page__jumpnav') && classicCssText.includes('.hm-seo-static-page__modern-toggle'), 'dist debe conservar el alternador Vista clásica/Vista Moderna, el índice tipo landing de categorías y sus estilos en hashinmy-classic.css.');

  assert(jsText.includes('async function exitImmersiveMode') && jsText.includes('state.fullscreenRequested = false') && jsText.includes('function syncSeoFullscreenMode') && jsText.includes('if (state.seoClassicView) return;') && jsText.includes('const shouldKeepClassicFlow = state.seoClassicView && String(action || \'\').startsWith(\'seo-\')') && jsText.includes('if (nextClassicView) exitImmersiveMode();') && jsText.includes('syncSeoFullscreenMode(state.seoClassicView);'), 'La vista clásica de Productos debe salir de pantalla completa al activarse, no debe reactivar pantalla completa al navegar dentro de la landing y debe volver a solicitar pantalla completa al regresar a Vista Moderna.');
  assert(indexHtml.includes('id="hmProofOpenButton"') && indexHtml.includes('Nuestra Experiencia') && indexHtml.includes('id="hmProofWindow"') && indexHtml.includes('id="hmHomeProofContent"') && indexHtml.includes('data-proof-logo-list') && indexHtml.includes('assets/clientes') && indexHtml.includes('Metodología:') && indexHtml.includes('FAQ rápido') && indexHtml.includes('Casos de uso:') && cssText.includes('.hm-home-proof') && cssText.includes('.hm-home-proof__faq'), 'La portada debe reemplazar la prueba social atravesada por el textbutton Nuestra Experiencia y concentrar hm-home-proof en una ventana única.');
  assert(indexHtml.includes('data-i18n-text="ui.proofOpenButton"') && indexHtml.includes('data-i18n-text="ui.proofLead"') && indexHtml.includes('data-i18n-text="ui.proofTrustText"') && indexHtml.includes('data-i18n-text="ui.proofFaqStartAnswer"') && indexHtml.includes('data-i18n-aria="ui.proofContentAria"'), 'La ventana Nuestra Experiencia debe consumir todos sus textos visibles y accesibles desde textX/{isocode}.json.');
  assert(jsText.includes("t('ui.proofLogoAltTemplate'") && jsText.includes('function syncProofLogoLocalizedText') && jsText.includes("t('ui.proofBrandsStructuredDescription'"), 'Los logos y JSON-LD de Nuestra Experiencia deben localizar alt, fallback y descripción estructurada desde textX.');
  assert(jsText.includes('PROOF_LOGO_MANIFEST_PATH') && jsText.includes('assets/clientes/') && jsText.includes('function loadProofLogos') && jsText.includes('function normalizeProofLogoEntry') && jsText.includes('function renderProofLogos') && jsText.includes('getProofLogoNameFromFile') && cssText.includes('.hm-home-proof__brands') && cssText.includes('overflow-y: auto'), 'Los logos de experiencia deben detectarse desde assets/clientes mediante manifiesto, usar el nombre del archivo sin extensión como caption y mantener scroll interno en hm-home-proof__brands.');
  assert(cssText.includes('Corrección antidesborde real: logos de clientes y hm-seo-card') && cssText.includes('grid-template-columns: repeat(auto-fit, minmax(min(100%, 128px), 1fr));') && cssText.includes('grid-template-columns: repeat(auto-fit, minmax(min(100%, 238px), 1fr));') && cssText.includes('overflow: hidden !important;') && cssText.includes('overflow-wrap: anywhere;'), 'Los logos de clientes y las hm-seo-card deben estar contenidos por grillas auto-fit, sin overflow visible que permita salirse del contenedor o montarse entre tarjetas.');
  assert(buildScript.includes('function discoverProofClientLogos') && buildScript.includes('clientes-manifest.json') && buildScript.includes('PROOF_LOGO_IMAGE_EXTENSIONS') && buildScript.includes('hydrateStaticProofLogosFallback'), 'El build debe generar el manifiesto SEO de logos detectando automáticamente formatos de imagen dentro de assets/clientes.');
  assertProofLogoDisplayNames(await readJson('assets/clientes/clientes-manifest.json'), jsText, buildScript, 'dist/assets/clientes/clientes-manifest.json');
  assert(!indexHtml.includes('./assets/logo_clean_MAX.jpg') && !jsText.includes("{ name: 'CleanMAX', file: 'logo_clean_MAX.jpg' }"), 'La sección Nuestra Experiencia no debe depender de logos manuales en assets raíz; debe usar assets/clientes.');
  assert(indexHtml.includes('\"@type\": \"OfferCatalog\"') && indexHtml.includes(`${PUBLIC_SITE_URL}#offer-catalog`) && indexHtml.includes(`${PUBLIC_SITE_URL}#service-custom-software`) && indexHtml.includes(`${PUBLIC_SITE_URL}#service-ai-automation`) && indexHtml.includes(`${PUBLIC_SITE_URL}#service-web-seo-chatbots`) && indexHtml.includes(`${PUBLIC_SITE_URL}#service-technical-quoter`), 'La home debe publicar OfferCatalog y servicios principales en JSON-LD para que la portada también comunique productos, no solo las fichas internas.');
  assert(indexHtml.includes(`${PUBLIC_SITE_URL}#service-financed-development`) && indexHtml.includes('Tecnología empresarial a la medida financiada al 100%') && !indexHtml.includes('Software a medida, IA, CAD DXF, nube, PC, SEO'), 'dist debe posicionar el JSON-LD de la home desde la promesa madre de ingeniería digital financiada al 100%, no desde el catálogo viejo centrado en CAD/SEO/cotizadores.');
  assert(jsText.includes('function buildBrandOrganizationStructuredData') && jsText.includes('function buildBrandOfferCatalogStructuredData') && jsText.includes('function buildHomeFaqStructuredData') && jsText.includes('service-financed-development'), 'El runtime en dist debe preservar organización enriquecida, OfferCatalog estratégico, FAQ de portada y financiación del 100% después de cambiar idioma o vista.');
  assert(buildScript.includes('function buildStaticBrandKnowsAbout') && buildScript.includes('function buildStaticBrandOfferCatalogJsonLd') && buildScript.includes('service-financed-development'), 'El build usado por dist debe generar JSON-LD de marca desde textX/textX/seo con financiación 100% y alcance estratégico localizado.');
  assert(indexHtml.includes('\"@type\": \"FAQPage\"') && indexHtml.includes(`${PUBLIC_SITE_URL}#faq`) && indexHtml.includes(spanishBundle.ui.proofFaqWhyQuestion) && indexHtml.includes(spanishBundle.ui.proofFaqWhoQuestion) && indexHtml.includes(spanishBundle.ui.proofFaqStartQuestion), 'La home debe mantener FAQPage estructurado alineado con el FAQ rápido visible y localizado desde textX/es.json.');
  assert(indexHtml.includes('\"@type\": \"BreadcrumbList\"') && indexHtml.includes(`${PUBLIC_SITE_URL}#breadcrumb`) && indexHtml.includes('\"name\": \"Inicio\"'), 'La home debe mantener BreadcrumbList estructurado aunque sea la ruta raíz.');

  assertSeoContentDepth(seoContent);
  assert(buildScript.includes("hydrateStaticHtmlFallback(templateHtml, textBundle, languages, bundle?.code || 'es', '/', proofLogos, seoContent)"), 'El build de páginas SEO estáticas debe pasar seoContent al hidratador global para que el chrome del hub (cerrar, categorías y vista clásica) salga en el idioma activo y no caiga al fallback español.');
  assertLlmsDiscoveryCompleteness(llmsText, seoContent, 'dist/llms.txt');
  assert(llmsText.includes(seoContent.languages?.es?.uiLabels?.faqLabel || 'Preguntas frecuentes') && llmsText.includes(seoContent.languages?.en?.uiLabels?.faqLabel || 'Frequently asked questions') && llmsText.includes('FAQPage'), 'dist/llms.txt debe explicar con etiquetas localizadas que las fichas incluyen FAQPage y datos estructurados para IA/buscadores.');
  for (const bundle of Object.values(seoContent.languages || {})) {
    const hubEntryPath = seoDistEntryPath(bundle.hubUrl);
    assert(await exists(path.join(dist, hubEntryPath)), `Falta página estática SEO en dist/${hubEntryPath}.`);
    const hubHtml = await readDist(hubEntryPath);
    assertStaticSeoChromeLocalized(bundle.code || 'es', bundle, hubHtml, `dist/${hubEntryPath}`, { classicPage: true, pagePath: bundle.hubUrl });
    const hubH1Texts = extractH1Texts(hubHtml);
    assert(hubH1Texts.length === 1 && hubH1Texts[0] === bundle.hubTitle, `dist/${hubEntryPath} debe publicar un único H1 del hub SEO, no el H1 de la portada inmersiva.`);
    assert(hubHtml.includes('hm-seo-static-page__jumpnav') && hubHtml.includes('hm-seo-static-page__modern-toggle') && hubHtml.includes('/?seo='), `dist/${hubEntryPath} debe mostrar navegación de landing para todas las categorías/pestañas y un enlace visible Vista Moderna en la página clásica.`);
    for (const item of bundle.items || []) {
      const entryPath = seoDistEntryPath(item.url);
      assert(await exists(path.join(dist, entryPath)), `Falta página estática SEO en dist/${entryPath}.`);
      const entryHtml = await readDist(entryPath);
      assertStaticSeoChromeLocalized(bundle.code || 'es', bundle, entryHtml, `dist/${entryPath}`, { classicPage: true, pagePath: item.url });
      const h1Texts = extractH1Texts(entryHtml);
      const entryStaticText = extractStaticSeoPageText(entryHtml);
      assert(h1Texts.length === 1 && h1Texts[0] === item.title, `dist/${entryPath} debe publicar un único H1 con el título propio de la ficha SEO.`);
      assert(entryHtml.includes('hm-seo-static-page__modern-toggle') && entryHtml.includes('/?seo='), `dist/${entryPath} debe conservar enlace visible Vista Moderna para regresar desde la ficha clásica al hub moderno.`);
      const requiredVisibleSeoLabels = ['simpleLabel', 'whoLabel', 'technicalLabel', 'includesLabel', 'glossaryLabel', 'guideLabel', 'faqLabel'].filter((key) => String(bundle.uiLabels?.[key] || '').trim());
      const missingVisibleSeoLabels = requiredVisibleSeoLabels.filter((key) => !entryHtml.includes(bundle.uiLabels[key]));
      assert(!missingVisibleSeoLabels.length, `dist/${entryPath} debe renderizar rótulos localizados de uiLabels en la ficha clásica; faltan: ${missingVisibleSeoLabels.join(', ')}.`);
      assert(!entryStaticText.includes('…'), `dist/${entryPath} no debe publicar fichas SEO finales con puntos suspensivos; debe usar frases completas compactas para IA, Google y lectura con scroll interno limpio.`);
    }
  }
  assert(sitemapXml.includes('/es/productos/software-para-ecommerce/') && sitemapXml.includes('/en/products/security-privacy/') && sitemapXml.includes('/es/productos/cotizador-tecnico-aprovechamiento/') && sitemapXml.includes('/en/products/business-chatbots/') && sitemapXml.includes('/es/industrias/software-para-carpinterias/') && sitemapXml.includes('hreflang="x-default"'), 'dist/sitemap.xml debe incluir las nuevas fichas SEO bilingües y alternates.');
  assert(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemapXml) && sitemapXml.includes('<changefreq>weekly</changefreq>') && sitemapXml.includes('<priority>0.95</priority>') && sitemapXml.includes('<priority>0.90</priority>'), 'dist/sitemap.xml debe publicar señales de frescura, frecuencia y prioridad para URLs SEO del hub y fichas profundas.');
  const seoSampleHtml = await readDist('es/productos/software-a-medida/index.html');
  const seoSampleEnHtml = await readDist('en/products/custom-software/index.html');
  assert(seoSampleHtml.includes('Preguntas frecuentes') && seoSampleHtml.includes('FAQPage') && seoSampleHtml.includes('BreadcrumbList'), 'La ficha SEO española debe publicar FAQ visible y JSON-LD FAQ/Breadcrumb.');
  assert(seoSampleEnHtml.includes('Frequently asked questions') && seoSampleEnHtml.includes('FAQPage') && seoSampleEnHtml.includes('BreadcrumbList'), 'La ficha SEO inglesa debe publicar FAQ visible y JSON-LD FAQ/Breadcrumb.');
  assert(seoSampleHtml.includes('hm-seo-static-page__final') && seoSampleHtml.includes('hm-seo-static-page__hero') && seoSampleHtml.includes('hm-seo-static-page__quick') && seoSampleHtml.includes('hm-seo-static-page__guide') && !seoSampleHtml.includes('<article><h2>'), 'La ficha SEO española debe mostrar información final continua, con título/resumen dentro del contenedor blanco y no cards internas anidadas.');
  assert(seoSampleEnHtml.includes('hm-seo-static-page__final') && seoSampleEnHtml.includes('hm-seo-static-page__hero') && seoSampleEnHtml.includes('hm-seo-static-page__quick') && seoSampleEnHtml.includes('hm-seo-static-page__guide') && !seoSampleEnHtml.includes('<article><h2>'), 'La ficha SEO inglesa debe mostrar información final continua, con título/resumen dentro del contenedor blanco y no cards internas anidadas.');
  const seoSampleVisibleText = extractStaticSeoPageText(seoSampleHtml);
  const seoSampleEnVisibleText = extractStaticSeoPageText(seoSampleEnHtml);
  assert(countTextOccurrences(seoSampleVisibleText, 'Sirve para ordenar procesos, conectar equipos, reducir errores y convertir tareas repetidas en flujos claros.') === 1 && countTextOccurrences(seoSampleVisibleText, 'Arquitectura web, base de datos, backend, frontend, API, roles, auditoría y panel administrativo.') === 1, 'La ficha SEO española debe evitar duplicar dentro del contenido visible final el beneficio simple y la base técnica ya mostrados.');
  assert(countTextOccurrences(seoSampleEnVisibleText, 'It helps organize processes, connect teams, reduce errors and turn repeated tasks into clear flows.') === 1 && countTextOccurrences(seoSampleEnVisibleText, 'Web architecture, database, backend, frontend, API, roles, audit trail and admin panel.') === 1, 'La ficha SEO inglesa debe evitar duplicar dentro del contenido visible final el beneficio simple y la base técnica ya mostrados.');
  assert(seoSampleHtml.includes('class="hm-seo-static-page__back" href="/es/productos/">← Volver a productos</a>') && seoSampleHtml.indexOf('hm-seo-static-page__back') > seoSampleHtml.indexOf('hm-seo-static-page__final') && seoSampleEnHtml.includes('class="hm-seo-static-page__back" href="/en/products/">← Back to products</a>') && seoSampleEnHtml.indexOf('hm-seo-static-page__back') > seoSampleEnHtml.indexOf('hm-seo-static-page__final'), 'Las fichas SEO estáticas deben ofrecer flecha de regreso dentro del panel final de su idioma sin depender del runtime.');
  assert(extractH1Texts(seoSampleHtml).length === 1 && extractH1Texts(seoSampleHtml)[0] === 'Software a medida' && seoSampleHtml.includes('data-seo-demoted-heading="true"'), 'La ficha SEO española debe tener un único H1 propio; el H1 inmersivo de portada debe quedar degradado para evitar duplicidad semántica.');
  assert(extractH1Texts(seoSampleEnHtml).length === 1 && extractH1Texts(seoSampleEnHtml)[0] === 'Custom software' && seoSampleEnHtml.includes('data-seo-demoted-heading="true"'), 'La ficha SEO inglesa debe tener un único H1 propio; el H1 inmersivo de portada debe quedar degradado para evitar duplicidad semántica.');
  assert(seoSampleHtml.includes('WebSite') && seoSampleHtml.includes('TechArticle') && seoSampleHtml.includes('DefinedTermSet') && seoSampleHtml.includes('OfferCatalog') && seoSampleHtml.includes('mainEntity'), 'La ficha SEO española debe conservar JSON-LD enriquecido para IA: WebSite, entidad principal, guía técnica, glosario y catálogo de alcance.');
  assert(seoSampleEnHtml.includes('WebSite') && seoSampleEnHtml.includes('TechArticle') && seoSampleEnHtml.includes('DefinedTermSet') && seoSampleEnHtml.includes('OfferCatalog') && seoSampleEnHtml.includes('mainEntity'), 'La ficha SEO inglesa debe conservar JSON-LD enriquecido para IA: WebSite, entidad principal, guía técnica, glosario y catálogo de alcance.');
  assert(indexHtml.includes('./css/hashinmy-immersive.css'), 'dist/index.html debe apuntar al CSS inmersivo.');
  assert(indexHtml.includes('./js/hashinmy-immersive.js'), 'dist/index.html debe apuntar al JS inmersivo.');
  assert(indexHtml.includes('<html lang="es" dir="ltr" data-language="es" data-text-script="latin"'), 'dist/index.html debe salir con atributos de idioma y perfil tipográfico estáticos para activar CSS i18n antes del runtime.');
  assert(indexHtml.includes('rel="canonical"'), 'dist/index.html debe conservar canonical base para SEO.');
  assert(indexHtml.includes(`type="text/plain" title="Hashinmy llms.txt" href="${PUBLIC_SITE_URL}llms.txt"`), 'dist/index.html debe exponer llms.txt desde el head como señal directa para rastreadores de IA.');
  assert(indexHtml.includes(`<title>${spanishBundle.meta.title}</title>`) && indexHtml.includes(`content="${spanishBundle.meta.description}"`), 'dist/index.html debe salir del build con title y description españoles hidratados desde textX/es.json para SEO sin JS.');
  assert(indexHtml.includes(`content="${spanishBundle.meta.ogTitle}"`) && indexHtml.includes(`content="${spanishBundle.meta.ogDescription}"`), 'dist/index.html debe publicar OG title/description estáticos desde textX/es.json para previews sociales sin JS.');
  assert((indexHtml.match(/data-hashinmy-hreflang="static"/g) || []).length >= REQUIRED_LANGUAGE_COUNT + 1 && indexHtml.includes('hreflang="x-default"') && indexHtml.includes('/en/'), 'dist/index.html debe incluir hreflang estáticos del build para los idiomas detectados y x-default usando entradas HTML localizadas, no solo query params con HTML español.');
  assert(indexHtml.includes('data-i18n-text="ui.skip"') && indexHtml.includes('hmLanguageSelect'), 'dist/index.html debe consumir textos desde textX y conservar selector de idioma.');
  assert(indexHtml.includes('id="hmTopActions"') && indexHtml.includes('<a class="hm-seo-entry" id="hmSeoHubButton"') && indexHtml.includes('href="/es/productos/"') && indexHtml.indexOf('id="hmSeoHubButton"') < indexHtml.indexOf('id="hmLanguageSelectorWrap"'), 'dist/index.html debe mantener el acceso Productos como enlace crawlable agrupado a la izquierda real del selector de idioma.');
  assert(!indexHtml.includes('data-hm-label-es') && !indexHtml.includes('data-hm-label-en'), 'dist/index.html no debe publicar rótulos SEO limitados a español/inglés; debe salir hidratado desde textX/seo por isocode.');
  assert(indexHtml.includes('data-seo-i18n-text="entryLabel"') && indexHtml.includes('data-seo-i18n-aria="closeLabel"') && indexHtml.includes('data-seo-i18n-aria="uiLabels.categoryNavLabel"') && indexHtml.includes('data-seo-i18n-text="uiLabels.classicViewLabel"'), 'dist/index.html debe conservar los marcadores data-seo-i18n para que el runtime pueda rehidratar el chrome SEO al cambiar a cualquiera de los 50 idiomas.');
  assert(indexHtml.includes('id="hmSeoHubCategories"') && indexHtml.includes('aria-label="Categorías de productos Hashinmy"') && englishIndexHtml.includes('id="hmSeoHubCategories"') && englishIndexHtml.includes('aria-label="Hashinmy product categories"'), 'dist debe hidratar el ARIA del navegador de categorías SEO desde textX/seo en cada idioma.');
  assert(indexHtml.includes('id="hmSeoHubCategories" role="tablist"') && jsText.includes('role="tab"') && jsText.includes('aria-selected') && jsText.includes("setAttribute('role', 'tabpanel')"), 'dist debe conservar categorías SEO como pestañas reales con tablist/tab/tabpanel.');
  assert(jsText.includes('function handleSeoCategoryKeydown') && jsText.includes('ArrowRight') && jsText.includes('Home') && jsText.includes('End') && jsText.includes("setAttribute('aria-orientation', 'horizontal')") && jsText.includes("addEventListener('keydown', handleSeoCategoryKeydown)"), 'dist debe conservar navegación real de pestañas SEO con teclado, flechas, Home y End.');
  assert(jsText.includes('function getSeoBundleKeywords'), 'dist debe conservar keywords agregadas para el hub SEO desde categorías, títulos, términos y fichas.');
  assert(jsText.includes('function getSeoUiLabel') && jsText.includes("getSeoUiLabel('classicViewLabel'") && jsText.includes("getSeoUiLabel('modernViewLabel'") && jsText.includes("getSeoUiLabel('detailLead'") && jsText.includes("getSeoUiLabel('scopeCatalogLabel'") && jsText.includes("getSeoUiLabel('glossarySetLabel'") && jsText.includes("getSeoUiLabel('categoryNavLabel'") && jsText.includes('function applyLocalizedSeoDomText') && jsText.includes('data-seo-i18n-text') && jsText.includes('data-seo-i18n-aria'), 'dist JS debe resolver rótulos de Vista clásica/Vista Moderna, ficha final, ARIA del hub y JSON-LD semántico desde textX/seo/{isocode}.json.');
  assert(!/hm-seo-detail__terms[\s\S]*?<dt>\$\{escapeHtml\(glossaryLabel\)\}<\/dt>\s*<dt>\$\{escapeHtml\(glossaryLabel\)\}<\/dt>/.test(jsText), 'dist JS no debe duplicar el título del glosario técnico en la ficha runtime.');
  assert(!jsText.includes('…'), 'dist JS no debe poder generar puntos suspensivos en fichas SEO finales; el contenido debe verse como información final limpia sin truncamiento visual.');
  const hubHtml = await readDist('es/productos/index.html');
  const hubHtmlLower = hubHtml.toLowerCase();
  assert(hubHtmlLower.includes('software para ecommerce') && hubHtmlLower.includes('inteligencia artificial') && hubHtmlLower.includes('formas de pago'), 'dist/es/productos/index.html debe publicar meta keywords del hub enriquecidas desde el contenido SEO, no solo una lista genérica.');
  assert(englishIndexHtml.includes('<a class="hm-seo-entry" id="hmSeoHubButton"') && englishIndexHtml.includes('href="/en/products/"') && englishIndexHtml.includes('>Products</a>'), 'dist/en/index.html debe publicar el enlace Products hacia /en/products/ sin depender de JS.');
  assert(hasHydratedDataText(indexHtml, 'ui.skip', spanishBundle.ui.skip) && hasHydratedDataText(indexHtml, 'ui.primaryFinance', spanishBundle.ui.primaryFinance) && hasHydratedDataText(indexHtml, 'ui.submitRoute', spanishBundle.ui.submitRoute), 'dist/index.html debe traer textos visibles españoles hidratados desde textX/es.json para primer render sin JS, manteniendo los atributos data-i18n para runtime multilingüe.');
  assert(indexHtml.includes(htmlTextEscape(spanishBundle.scenes.intro.title)) && indexHtml.includes(htmlTextEscape(spanishBundle.scenes.intro.copy)) && indexHtml.includes(`<option value="es" lang="es" dir="ltr"`) && indexHtml.includes(`selected>${htmlTextEscape(spanishBundle.nativeName)}</option>`), 'dist/index.html debe hidratar la primera escena y el selector desde textX/es.json/languages.json para primer render sin JS.');
  assert(indexHtml.includes('hm-transition-pulse" data-i18n-text="meta.applicationName"') && indexHtml.includes(`data-i18n-text="meta.applicationName">${htmlTextEscape(spanishBundle.meta.applicationName)}</`) && indexHtml.includes(`property="og:site_name" content="${htmlTextEscape(spanishBundle.meta.applicationName)}" data-i18n-content="meta.applicationName"`), 'dist/index.html debe mantener la marca visible y el site_name conectados a textX/meta.applicationName con fallback estático español.');
  assert(indexHtml.includes('data-i18n-text="ui.primaryFinance"') && indexHtml.includes('data-i18n-text="ui.submitRoute"') && indexHtml.includes('data-i18n-text="ui.copySummaryAction"'), 'dist/index.html debe conservar los textos visibles de acciones ligados a data-i18n aunque estén hidratados estáticamente desde textX/es.json.');
  assert(indexHtml.includes('id="hmContact" hidden novalidate') && indexHtml.includes('aria-describedby="hmFormNote"'), 'dist/index.html debe impedir mensajes nativos no localizados en el formulario y asociar el contacto al estado visible traducido desde textX.');
  assert(cssText.includes('overflow: hidden') && cssText.includes('.hm-stage') && cssText.includes('width: 100vw'), 'dist CSS debe conservar pantalla completa sin scroll.');
  assert(cssText.includes('body[data-seo-hub="detail"] .hm-seo-detail__final') && cssText.includes('background: #fff') && cssText.includes('overflow-y: auto') && cssText.includes('scrollbar-gutter: stable both-edges'), 'dist CSS debe publicar hm-seo-detail__final con fondo blanco y scroll interno solo en modo detalle.');
  assert(cssText.includes('.hm-top-actions') && cssText.includes('body:not([data-scene="intro"]) .hm-top-actions') && cssText.includes('.hm-language {') && cssText.includes('position: static;'), 'dist CSS debe mantener Productos e idioma en un grupo responsive sin posición aproximada ni solapes.');
  assert(cssText.includes('@media (max-aspect-ratio: 4 / 3)') && cssText.includes('@media (max-width: 640px)'), 'dist CSS debe conservar responsive para tablet/móvil.');
  assert(!cssText.includes('Preparando opciones') && !cssText.includes('.hm-interaction-wait::after'), 'dist CSS no debe tener textos visibles hardcodeados para la espera narrativa.');
  assert(cssText.includes('body[data-scene="summary"] .hm-contact__summary:not([hidden])') && cssText.includes('display: grid !important'), 'dist CSS debe mostrar el brief comercial localizado del cierre.');
  assert(!cssText.includes(`.hm-seo-detail__terms,
  .hm-seo-detail__faq {
    display: none;`), 'dist CSS no debe ocultar glosario ni FAQ del detalle SEO en móvil; debe conservar información visible y compacta.');
  assert(cssText.includes('.hm-seo-detail__terms dt,') && cssText.includes('grid-column: 1 / -1;') && !cssText.includes(`.hm-seo-detail__faq dd span {
  -webkit-line-clamp: 2;`), 'dist CSS debe mostrar FAQ y términos del detalle SEO como bloques completos compactos, sin truncar respuestas con line-clamp.');
  assert(jsText.includes('class="hm-seo-detail__hero"') && jsText.includes('Ficha técnica Hashinmy') && jsText.includes('panel blanco final') && jsText.includes('const backText = `← ${String(backLabel).replace') && jsText.includes('state.seoActiveId ? elements.seoHubDetail'), 'dist JS debe poner título/resumen dentro del detalle SEO final, mantener encabezado externo genérico sin duplicar y enfocar la flecha de regreso al abrir una ficha.');
  assert(jsText.includes('hm-seo-detail__final') && jsText.includes('hm-seo-detail__hero') && jsText.includes('hm-seo-detail__quick') && jsText.includes('hm-seo-detail__guide') && !jsText.includes('hm-seo-detail__grid') && !cssText.includes('.hm-seo-detail__grid'), 'dist debe conservar el detalle SEO como una ficha final continua con encabezado dentro del panel, no como cards internas.');
  assert(jsText.includes('const detailMode = Boolean(state.seoActiveId)') && jsText.includes("setAttribute('aria-hidden', String(detailMode))") && jsText.includes('elements.seoHubCards.inert = detailMode') && jsText.includes("elements.seoHubCards.innerHTML = ''") && jsText.includes('elements.seoHubCategories.inert = detailMode') && jsText.includes("document.body.dataset.seoHub = state.seoClassicView ? 'classic' : state.seoActiveId ? 'detail' : 'index'"), 'dist JS debe ocultar todas las hm-seo-card al abrir un detalle, bloquear foco accidental, conservar la vista clásica y sincronizar el modo visual.');
  assert(cssText.includes('scroll-snap-type: x proximity') && cssText.includes('scroll-snap-align: start') && cssText.includes('overflow-x: auto') && cssText.includes('grid-template-columns: repeat(3, minmax(0, 1fr));') && !cssText.includes('flex-basis: 100%;'), 'El índice SEO debe mantener pestañas horizontales responsive y una grilla compacta de 3 columnas en móvil para que muchas hm-seo-card no se desborden ni queden inaccesibles antes del detalle final.');
  assert(cssText.includes('Ajuste definitivo: cada hm-seo-card crece por contenido') && cssText.includes('grid-auto-rows: max-content !important;') && cssText.includes('height: auto !important;') && cssText.includes('min-height: auto !important;') && cssText.includes('-webkit-line-clamp: unset;'), 'Las hm-seo-card deben adaptar su altura al contenido, no truncar textos ni colapsar, y mantener altura homogénea por fila mediante CSS Grid.');
  assert(cssText.includes('body[data-seo-hub="detail"] .hm-seo-hub__surface') && cssText.includes('grid-template-rows: auto minmax(0, 1fr);') && cssText.includes('body[data-seo-hub="detail"] .hm-seo-hub__cards') && cssText.includes('body[data-seo-hub="detail"] .hm-seo-card') && cssText.includes('.hm-seo-hub__cards[aria-hidden="true"]'), 'dist CSS debe forzar que en modo detalle no quede visible ninguna hm-seo-card y que el detalle use la fila principal del contenedor.');
  assert(jsText.includes('function syncSeoHubFit') && jsText.includes('hm-seo-fit-compact') && jsText.includes('scheduleSeoHubFitCheck') && cssText.includes('.hm-seo-fit-compact .hm-seo-hub__surface') && cssText.includes('.hm-seo-fit-ultra .hm-seo-hub__intro p'), 'dist debe conservar medición y compactación específica del hub SEO para evitar desbordes en tabs, cards y detalle final.');
  assert(cssText.includes('Auditoría de cierre multilingüe') && cssText.includes('body[data-scene="summary"] .hm-summary-item strong') && cssText.includes('text-overflow: clip') && cssText.includes('line-break: anywhere'), 'dist CSS debe permitir que valores largos del resumen se ajusten por idioma sin truncarse.');
  assert(cssText.includes('html[data-language="zh"] .hm-typed-word') && cssText.includes('line-break: loose') && cssText.includes('word-break: keep-all'), 'dist CSS debe proteger idiomas sin espacios contra desbordes del efecto de escritura.');
  assert(cssText.includes('html[dir="rtl"] body,') && cssText.includes('html[dir="rtl"] .hm-stage') && cssText.includes('direction: ltr;') && cssText.includes('unicode-bidi: plaintext'), 'dist CSS debe preservar la estructura visual en idiomas RTL y aplicar RTL solo al texto localizado.');
  assert(cssText.includes('body[data-text-density="compact"] .hm-question') && cssText.includes('body[data-text-density="ultra"] .hm-option span') && cssText.includes('data-text-density="ultra"'), 'dist CSS debe adaptar densidad textual compact/ultra para traducciones largas sin cambiar la estructura visual.');
  assert(jsText.includes('APP_BASE_URL') && jsText.includes("const TEXT_BASE_PATH = appUrl('textX/');") && jsText.includes('loadTextBundle') && jsText.includes('applyLocalizedDomText'), 'dist JS debe cargar textos desde textX resolviendo la raíz real del script para entradas /<isocode>/.');
  assert(jsText.includes("t('ui.preparingOptions')"), 'dist JS debe tomar la espera de opciones desde textX/ui.preparingOptions.');
  assert(jsText.includes('MAX_OPTIONS_PER_SCENE = 3') && jsText.includes('buildSummaryText'), 'dist JS debe conservar ruta comercial y resumen.');
  assert(jsText.includes('MAILTO_MAX_SAFE_LENGTH') && jsText.includes('function writeClipboardText') && jsText.includes('submit-mailto-too-long-copy'), 'dist JS debe respaldar envíos largos con copia al portapapeles para no perder leads cuando mailto supere límites de clientes móviles.');
  assert(jsText.includes('function renderSummary') && jsText.includes('hm-summary-item') && jsText.includes('elements.summary.hidden = !summaryItems.length'), 'dist JS debe renderizar el resumen visible del cierre.');
  assert(jsText.includes('function getLocalizedAuditEntry') && jsText.includes('function getLocalizedAuditChoice') && jsText.includes('recordChoice(choice, Number(button.dataset.choiceIndex))'), 'dist JS debe relocalizar el historial al idioma activo para evitar resúmenes con textos mezclados.');
  assert(jsText.includes('data-priority="${escapeHtml(choice.priority || \'\')}"') && !jsText.includes('data-priority="${choice.priority || \'\'}"'), 'dist JS debe escapar data-priority al renderizar opciones desde textX para evitar inyección de atributos al editar JSON de idiomas.');
  assert(jsText.includes('OPTION_REVEAL_DELAY_MS = 3000') && jsText.includes('requestImmersiveMode') && jsText.includes('--hm-backdrop-image') && jsText.includes('function scheduleInteractionsAfterNarrativeComplete') && jsText.includes('minimumInteractionDelay - elapsed'), 'dist JS debe conservar narrativa progresiva, modo inmersivo, fondo sincronizado y revelar interacciones solo después de terminar la narrativa localizada.');
  assert(jsText.includes('preserveResponsiveOrientation') && !jsText.includes("screen.orientation.lock('landscape')") && !jsText.includes('screen.orientation.lock("landscape")'), 'dist JS debe respetar orientación responsive real en móvil/tablet y no forzar landscape.');
  assert(jsText.includes('Intl.Segmenter') && jsText.includes("granularity: 'grapheme'") && jsText.includes('segmentTextForTyping'), 'dist JS debe segmentar texto por grafemas y palabras para idiomas CJK/Thai/Birmano/Índicos.');
  assert(jsText.includes('function getLocalizedTextDensity') && jsText.includes('function getSummaryDensityUnits') && jsText.includes('function getInterfaceDensityUnits') && jsText.includes('function getServiceRailDensityUnits') && jsText.includes('summaryDensityUnits * 0.42') && jsText.includes('interfaceDensityUnits >= 310') && jsText.includes('document.body.dataset.textDensity') && jsText.includes("['zh', 'ja', 'ko', 'th', 'my']"), 'dist JS debe calcular densidad textual por escena/idioma incluyendo cierre, microcopy de formulario, CTA y riel de servicios para conservar responsive con traducciones largas.');
  assert(jsText.includes('function getLanguageTextScript') && jsText.includes('document.documentElement.dataset.textScript') && jsText.includes('indicScriptLanguageCodes') && jsText.includes('ethiopicScriptLanguageCodes'), 'dist JS debe clasificar escrituras densas, índicas y etiópicas para ajustar el layout sin cambiar la estructura visual.');
  assert(cssText.includes('html[data-text-script="indic"] .hm-question') && cssText.includes('html[data-text-script="ethiopic"] .hm-question') && cssText.includes('text-rendering: optimizeLegibility'), 'dist CSS debe incluir perfiles visuales específicos para idiomas índicos y etiópicos.');
  assert(jsText.includes('function syncResponsiveFit') && jsText.includes("scheduleResponsiveFitCheck('options-ready')") && jsText.includes("document.body.classList.toggle('hm-viewport-cramped'") && jsText.includes('RESPONSIVE_FIT_CHECK_DELAYS_MS'), 'dist JS debe medir viewport/contenido tras render y activar un modo compacto cuando textos traducidos o pantallas pequeñas amenacen con cortar contenido.');
  assert(cssText.includes('body.hm-viewport-cramped:not([data-scene="intro"]):not([data-scene="summary"]) .hm-decision-zone') && cssText.includes('overscroll-behavior: contain') && cssText.includes('body.hm-viewport-cramped[data-scene="summary"] .hm-card'), 'dist CSS debe tener un modo hm-viewport-cramped para compactar escenas no intro/resumen, mantener scroll interno y evitar cortes en traducciones largas.');
  assert(jsText.includes('function setLanguageCatalog') && jsText.includes('languageCodes = new Set(state.languageCatalog.map') && !jsText.includes('.filter((language) => language && languageCodes.has(language.code))'), 'dist JS debe tomar textX/languages.json como fuente runtime del selector sin whitelist duplicada.');
  assert(jsText.includes('function assertUsableTextBundle') && jsText.includes('function buildTextBundleDiagnostics') && jsText.includes('__resolvedLanguage'), 'dist JS debe validar bundles textX y corregir el idioma resuelto si usa fallback.');
  assert(jsText.includes('function assertLanguageMetadataConsistency') && jsText.includes('getCatalogMetadataForBundle') && jsText.includes('metadatos inconsistentes'), 'dist JS debe rechazar JSON de textX con iso/name/nativeName/htmlLang/dir inconsistentes antes de pintar o cachear un idioma.');
  assert(jsText.includes('function assertCompleteTextBundle') && jsText.includes('flattenBundlePaths') && jsText.includes('no mantiene paridad completa con es.json'), 'dist JS debe bloquear bundles textX parciales para evitar escenas mezcladas entre español y otro idioma tras editar JSON.');
  assert(jsText.includes('function assertCompleteSeoBundle') && jsText.includes('flattenSeoBundlePaths') && jsText.includes('REQUIRED_SEO_UI_LABEL_KEYS') && jsText.includes('textX/seo/es.json debe existir') && jsText.includes('return content[getSeoLanguage(language)] || null;'), 'dist JS debe validar paridad completa de textX/seo contra es.json y no caer a contenido SEO español cuando un idioma SEO queda parcial.');
  assert(buildScript.includes('function assertCompleteSeoContent') && buildScript.includes('function assertCompleteSeoBundle') && buildScript.includes('flattenSeoBundlePaths') && buildScript.includes('textX/seo debe incluir un bundle por cada idioma detectado') && buildScript.includes('No se pudo construir contenido SEO multilingüe completo'), 'dist build copiado debe fallar si textX/seo no tiene los bundles detectados completos y sincronizados antes de emitir HTML estático, sitemap o llms.txt.');
  assert(buildScript.includes('async function writeLanguageCatalogManifest') && buildScript.includes("path.join(dist, 'textX', 'languages.json')") && buildScript.includes('detected-from-textX-and-textX-seo') && buildScript.includes('await writeLanguageCatalogManifest(staticLanguages);'), 'dist build copiado debe emitir dist/textX/languages.json desde la intersección real de textX y textX/seo para blindar el selector ante manifest de Nova faltante o desactualizado.');
  assert(jsText.includes('function loadSpanishReferenceBundle') && jsText.includes('textX/es.json no estuvo disponible para validar paridad') && jsText.includes('se intentará usar el bundle autónomo validado') && jsText.includes('const spanishBundle = await loadSpanishReferenceBundle(normalized);'), 'dist JS debe poder cargar un idioma no español como bundle autónomo validado si textX/es.json falla temporalmente, sin degradar automáticamente los 50 idiomas por una dependencia central.');
  assert(jsText.includes('function detectPreferredLanguage') && jsText.includes('const code = resolveKnownLanguageCode(language);') && jsText.includes('if (code) return code;') && !jsText.includes('const code = normalizeLanguageCode(language);\n      if (languageCodes.has(code)) return code;'), 'El autodetector de idioma debe probar todos los locales del navegador y no caer a español por el primer locale no soportado.');
  assert(jsText.includes('function getRequestedLanguageFromUrl') && jsText.includes('url.searchParams.get(\'lang\')') && jsText.includes('url.searchParams.get(\'idioma\')'), 'dist JS debe permitir preseleccionar idioma inicial desde URL.');
  assert(jsText.includes('function syncLocalizedSeoLinks') && jsText.includes('hreflang') && jsText.includes('buildPublicLanguageUrl'), 'dist JS debe sincronizar canonical/hreflang con el idioma activo para SEO internacional.');
  assert(jsText.includes('SEO_FINAL_VISIBLE_LIMITS') && jsText.includes('quick: 720') && jsText.includes('sectionBody: 1800') && jsText.includes('faqAnswer: 900') && jsText.includes('sections: 8') && jsText.includes('faqs: 8') && jsText.includes('function compactSeoVisibleText') && jsText.includes('slice(0, limits.faqs);'), 'dist JS debe limpiar y presupuestar textos repetidos antes de renderizar FAQ visibles, manteniendo frases completas compactas sin duplicar ni cortar visualmente el detalle.');
  assert(jsText.includes("'@type': 'WebSite'") && jsText.includes("'@type': 'TechArticle'") && jsText.includes("'@type': 'DefinedTermSet'") && jsText.includes("'@type': activeItem ? 'WebPage' : 'CollectionPage'") && jsText.includes('function getSeoPrimaryEntityType'), 'dist JS debe mantener JSON-LD enriquecido al abrir/cambiar fichas: WebSite, CollectionPage/WebPage, entidad principal, guía técnica y glosario definido.');
  assert(jsText.includes('link[data-hashinmy-hreflang="runtime"], link[data-hashinmy-hreflang="static"'), 'dist JS debe reemplazar hreflang estáticos del build cuando el runtime toma control del idioma activo.');
  assert(jsText.includes('languageRequestToken') && jsText.includes('function setLanguageSelectorBusy') && jsText.includes('const requestToken = ++state.languageRequestToken') && jsText.includes('if (!applied) return'), 'dist JS debe impedir carreras al cambiar idioma rápidamente para que la última selección sea la única aplicada.');
  assert(jsText.includes('LANGUAGE_URL_KEYS') && jsText.includes('LANGUAGE_PATH_PREFIX') && jsText.includes('function setLocalizedUrlPath') && jsText.includes('function syncShareableLanguageUrl') && jsText.includes('history.replaceState') && jsText.includes('resolveKnownLanguageCode(hashValue)'), 'dist JS debe sincronizar la URL con /<isocode>/ al cambiar idioma para recargas, enlaces compartidos y crawlers sin depender solo de localStorage.');
  assert(jsText.includes('lang="${escapeHtml(language.htmlLang || language.code)}"') && jsText.includes('dir="${optionDir}"') && jsText.includes('elements.languageSelect.lang = activeLanguage.htmlLang'), 'dist JS debe declarar lang/dir en el selector de idioma para accesibilidad en alfabetos mixtos y RTL.');
  assert(jsText.includes('function getActiveLanguageDomAttributes') && jsText.includes('function localizedMarkupAttributes') && jsText.includes('function syncRuntimeLanguageContainers') && jsText.includes("elements.experience = $('#hmExperience')") && jsText.includes('syncRuntimeLanguageContainers();'), 'dist JS debe propagar lang/dir al contenedor principal y a bloques dinámicos para que todas las escenas mantengan el idioma seleccionado, incluso con textos renderizados por JS.');
  assert(jsText.includes('const textAttrs = localizedMarkupAttributes();') && jsText.includes('class="hm-option"') && jsText.includes('aria-label="${escapeHtml(choice.label)}') && jsText.includes('${textAttrs}>') && jsText.includes('class="hm-summary-item"${textAttrs}'), 'dist JS debe emitir lang/dir en opciones, chips, métricas y resumen generados desde textX para accesibilidad y mezcla segura de alfabetos.');
  assert(cssText.includes('unicode-bidi: plaintext') && cssText.includes('html[dir="rtl"] .hm-option') && cssText.includes('text-align: start'), 'dist CSS debe aislar bidireccionalmente textos dinámicos localizados para evitar reordenamientos visuales en árabe, persa, urdu y hebreo con términos técnicos latinos.');
  assert(jsText.includes('function readStoredRoutePayload') && jsText.includes('function readStoredRouteLanguage') && jsText.includes('language: state.language') && jsText.includes('routeLanguage || (stored ? normalizeLanguageCode(stored) : detectPreferredLanguage())'), 'El idioma elegido debe persistir también dentro de la ruta guardada para que todas las escenas restauradas conserven el idioma seleccionado.');
  assert(jsText.includes('function syncStoredRouteLanguage') && jsText.includes('syncStoredRouteLanguage();') && jsText.includes('parsed.version !== 6') && jsText.includes('parsed.language === state.language'), 'El idioma seleccionado debe actualizar también la ruta v6 ya guardada sin sobrescribir escena/respuestas, evitando que una recarga restaure un idioma anterior.');
  assert(jsText.includes('htmlLang: languageConfig.htmlLang') && jsText.includes("dir: languageConfig.dir || 'ltr'"), 'Los eventos hashinmy:route:update deben exponer idioma/htmlLang/dir para auditar que la navegación real mantiene el idioma activo.');
  assert(jsText.includes('TEXT_BUNDLE_CACHE_PREFIX') && jsText.includes('function readCachedTextBundle') && jsText.includes('function writeCachedTextBundle') && jsText.includes('usando caché local validada'), 'dist JS debe conservar caché local validada de bundles textX para no perder el idioma elegido ante fallos transitorios de red/CDN.');
  assert(jsText.includes('function showLocalizedContactRequired') && jsText.includes("t('ui.contactRequired')") && jsText.includes("addEventListener('invalid'") && jsText.includes("event.preventDefault()") && jsText.includes("aria-invalid"), 'dist JS debe mostrar la validación del contacto únicamente desde ui.contactRequired de textX, sin mensajes nativos fuera del idioma seleccionado.');
  assert(jsText.includes('LANGUAGE_CATALOG_CACHE_KEY') && jsText.includes('function readCachedLanguageCatalog') && jsText.includes('function writeCachedLanguageCatalog') && jsText.includes('usando caché local validada del catálogo de idiomas') && jsText.includes('loadDetectedLanguageCatalogFromProjectStructure') && jsText.includes('textX/languages.json no declara idiomas usables'), 'dist JS debe conservar caché local validada y priorizar el catálogo dinámico detectado desde textX/textX/seo para no degradar el selector ante despliegues parciales.');
  assert(jsText.includes('function loadLanguageCatalogManifest') && jsText.includes("manifest?.source !== 'detected-from-textX-and-textX-seo'") && jsText.includes('function buildLanguageCatalogFromDetectedCodes') && jsText.includes('function filterLanguageCatalogByAvailableBundles') && jsText.includes('function getEnvironmentLanguageProbeCodes') && jsText.includes('function getRequestedLanguageCandidateCodesFromUrl') && jsText.includes('const environmentCatalog = buildLanguageCatalogFromCodes(getEnvironmentLanguageProbeCodes());') && jsText.includes('const detectedCatalog = await loadDetectedLanguageCatalogFromProjectStructure(metadataSources);'), 'dist JS debe tomar la intersección real textX + textX/seo como fuente del listado, aceptar manifest/cache solo como candidatos verificados y probar el idioma pedido por URL/navegador para detectar JSON recién pegados.');

  assert(jsText.includes('function verifyJsonFileAvailableForLanguageCatalogProbe') && jsText.includes("method: 'HEAD'") && jsText.includes("Range: 'bytes=0-0'") && jsText.includes('cancelProbeResponseBody') && jsText.includes('await verifyJsonFileAvailableForLanguageCatalogProbe(`${SEO_BASE_PATH}${encodeURIComponent(code)}.json`);'), 'El selector debe verificar textX/seo/{idioma}.json con prueba liviana HEAD/Range, sin descargar todos los SEO completos durante la detección automática de idiomas en la escena uno.');

  assert(jsText.includes('function addJsonRetryParam') && jsText.includes('hmTextRetry') && jsText.includes('red sin caché forzada') && jsText.includes('function buildJsonFetchAttempts') && jsText.includes("cache: 'no-store'") && jsText.includes("cache: 'reload'") && jsText.includes("cache: 'default'") && jsText.includes('JSON_FETCH_TIMEOUT_MS') && jsText.includes('AbortController') && jsText.includes("error?.name === 'AbortError'") && jsText.includes('Intentos:'), 'dist JS debe reintentar la carga de JSON de textX con timeout abortable, recarga, cache-busting y caché HTTP antes de caer a caché local/fallback, evitando pantallas vacías por fallos transitorios, CDN viejo o conexiones colgadas.');
  assert(!jsText.includes('introTranslations') && !jsText.includes('Bienvenido a HASHINMY'), 'dist JS no debe conservar traducciones embebidas antiguas.');
  const runtimeLanguageManifest = await readJson('textX/languages.json');
  const runtimeLanguageCodes = new Set((runtimeLanguageManifest.languages || []).map((language) => language.code));
  assert(runtimeLanguageManifest.schemaVersion === 1 && runtimeLanguageManifest.defaultLanguage === 'es' && runtimeLanguageManifest.source === 'detected-from-textX-and-textX-seo', 'dist/textX/languages.json debe declarar schemaVersion, defaultLanguage=es y fuente dinámica textX + textX/seo.');
  assert(Array.isArray(manifest.languages) && manifest.languages.length === REQUIRED_LANGUAGE_COUNT && REQUIRED_LANGUAGE_COUNT > 0, 'dist debe detectar dinámicamente solo idiomas presentes tanto en textX como en textX/seo.');
  assert(runtimeLanguageManifest.languages.length === manifest.languages.length && [...detectedLanguageCodes].every((code) => runtimeLanguageCodes.has(code)), 'dist/textX/languages.json debe coincidir exactamente con la intersección real publicada en dist/textX y dist/textX/seo.');
  assert(detectedLanguageCodes.has('es') && detectedLanguageCodes.has('en'), 'dist debe incluir es/en cuando ambos bundles existen en textX y textX/seo.');
  assertLanguageManifestMetadata(manifest.languages, 'intersección real dist textX + textX/seo');
  assertLanguageManifestMetadata(runtimeLanguageManifest.languages, 'dist/textX/languages.json');
  const structureFiles = Array.isArray(distProjectStructure.files) ? distProjectStructure.files.map((file) => String(file?.path || file?.file || '').replace(/\\/g, '/')) : [];
  assert([...detectedLanguageCodes].every((code) => structureFiles.includes(`textX/${code}.json`) && structureFiles.includes(`textX/seo/${code}.json`)), 'dist/estructura_del_proyecto.json debe publicar la intersección real textX + textX/seo para que el selector runtime detecte idiomas sin textX/languages.json.');
  assert([...detectedLanguageCodes].every((code) => textFiles.includes(`${code}.json`)), 'dist/textX debe contener todos los bundles de idioma detectados dinámicamente.');
  assertProfessionalFallbackLanguageCatalog(jsText, manifest.languages, 'dist/js/hashinmy-immersive.js');
  assert(sitemapXml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"') && sitemapXml.includes('hreflang="x-default"'), 'dist/sitemap.xml debe incluir alternates hreflang/x-default para despliegue internacional.');
  assert(robotsTxt.includes(`Sitemap: ${PUBLIC_SITE_URL}sitemap.xml`), 'dist/robots.txt debe apuntar al sitemap absoluto de hashinmy.com para rastreadores y asistentes de IA.');
  const localizedSitemapLanguages = new Set((sitemapXml.match(new RegExp(`${PUBLIC_SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z]{2,3}/`, 'g')) || []).map((entry) => entry.replace(PUBLIC_SITE_URL, '').replace('/', '')));
  assert(localizedSitemapLanguages.size >= REQUIRED_LANGUAGE_COUNT && localizedSitemapLanguages.has('es') && localizedSitemapLanguages.has('en') && !sitemapXml.includes('?lang='), 'dist/sitemap.xml debe publicar URLs localizadas como /<isocode>/ para cada idioma detectado, sin query params.');

  const notLocalized404Html = await readDist('404.html');
  assert(notLocalized404Html.includes('/css/hashinmy-immersive.css') && notLocalized404Html.includes('/js/hashinmy-immersive.js') && notLocalized404Html.includes('/assets/hashinmy-logo-emblem.png'), 'dist/404.html debe usar recursos absolutos de raíz para no romper CSS/JS/logo cuando el host sirve 404 manteniendo una URL profunda.');
  assert(!notLocalized404Html.includes('./css/hashinmy-immersive.css') && !notLocalized404Html.includes('./js/hashinmy-immersive.js'), 'dist/404.html no debe conservar recursos relativos que se resuelvan contra rutas fallidas.');
  assert(notLocalized404Html.includes('name="robots"') && notLocalized404Html.includes('noindex, nofollow, noarchive') && notLocalized404Html.includes('<title>404 | Hashinmy</title>'), 'dist/404.html debe quedar marcado como noindex y publicar metadatos propios sin depender de una frase fija solo en español.');

  for (const language of manifest.languages.slice(0, REQUIRED_LANGUAGE_COUNT)) {
    assert(await exists(path.join(dist, 'textX', `${language.code}.json`)), `Falta dist/textX/${language.code}.json`);
    if (await exists(path.join(dist, 'textX', `${language.code}.json`))) {
      const bundle = await readJson(`textX/${language.code}.json`);
      const entryPath = getLocalizedEntryPath(language.code);
      assert(await exists(path.join(dist, entryPath)), `Falta dist/${entryPath} como entrada HTML estática localizada para ${language.code}.`);
      if (await exists(path.join(dist, entryPath))) {
        const entryHtml = await readDist(entryPath);
        assertStaticLocalizedEntryPage(language.code, bundle, language, entryHtml, `dist/${entryPath}`, seoContent.languages?.[language.code]);
        if (language.code !== 'es' && bundle.scenes?.intro?.title !== spanishBundle.scenes?.intro?.title) {
          assert(!entryHtml.includes(htmlTextEscape(spanishBundle.scenes.intro.title)), `dist/${entryPath} no debe conservar el título español en la entrada localizada ${language.code}.`);
        }
      }
      assert(bundle.iso === language.code, `dist/textX/${language.code}.json debe declarar iso correcto.`);
      assert(bundle.name && bundle.nativeName && bundle.htmlLang && bundle.dir, `dist/textX/${language.code}.json debe declarar name/nativeName/htmlLang/dir.`);
      assertNoRawSpanishSeoTermLeakage(language.code, await readJson(`textX/seo/${language.code}.json`), `dist/textX/seo/${language.code}.json`);
      assertBundleCatalogMetadata(language.code, bundle, manifest.languages);
      assert(bundle.ui?.languageLabel && bundle.ui?.primaryFinance && bundle.ui?.primaryQuote && bundle.ui?.preparingOptions, `${language.code}.json debe tener textos UI clave, incluida la espera de opciones.`);
      assertBundleParity(language.code, bundle, spanishBundle);
      assertFirstSceneSpanishParity(language.code, bundle, spanishBundle, `dist/textX/${language.code}.json`);
      assertIntroDiagnosticDecision(language.code, bundle, `dist/textX/${language.code}.json`);
      assertNoEmptyTextStrings(language.code, bundle, `dist/textX/${language.code}.json`);
      assertPriorityLanguageQuality(language.code, bundle, englishBundle);
      assertNaturalSubmissionUi(language.code, bundle, `dist/textX/${language.code}.json`);
      assertNaturalFormNote(language.code, bundle, `dist/textX/${language.code}.json`);
      assertNaturalFormMicrocopy(language.code, bundle, `dist/textX/${language.code}.json`);
      assertProofShowcaseNativeCopy(language.code, bundle, englishBundle, `dist/textX/${language.code}.json`);
      assertNaturalOptionInsights(language.code, bundle, `dist/textX/${language.code}.json`);
      assertNoRawBriefLocalizationLeakage(language.code, bundle, `dist/textX/${language.code}.json`);
      assertNoRawEnglishCommercialCopy(language.code, bundle, `dist/textX/${language.code}.json`);
      assertNativeMetaKeywordLocalization(language.code, bundle, `dist/textX/${language.code}.json`);
      assertNoRawSpanishCommercialCopy(language.code, bundle, `dist/textX/${language.code}.json`);
      assertVisibleTechnicalLocalization(language.code, bundle, englishBundle, `dist/textX/${language.code}.json`);
      assertNoRawVisualLocalizationLeakage(language.code, bundle, `dist/textX/${language.code}.json`);
      assertPriorityNarrativeDepth(language.code, bundle);
      assertSummaryCommercialDepth(language.code, bundle);
      assertNoKeywordOnlySceneCopy(language.code, bundle);
      assertDistinctDecisionSceneCopy(language.code, bundle);
      assertNoTemplatedSceneCopyOpening(language.code, bundle);
      assertNoCompressedKeywordLead(language.code, bundle);
      assertLowEnglishLeakage(language.code, bundle, englishBundle);
      assertLowSpanishLeakage(language.code, bundle, spanishBundle);
      for (const sceneName of REQUIRED_SCENES) {
        assert(bundle.scenes?.[sceneName]?.title !== undefined, `${language.code}.json debe incluir scenes.${sceneName}.title.`);
        assert(Array.isArray(bundle.scenes?.[sceneName]?.options), `${language.code}.json debe incluir options para ${sceneName}.`);
        assert(bundle.scenes[sceneName].options.length <= 3, `${language.code}.json supera 3 opciones en ${sceneName}.`);
      }
    }
  }

  const webpRefs = [...jsText.matchAll(/file:\s*['"]([^'"]+\.webp)['"]/g)].map((match) => match[1]);
  for (const asset of new Set(webpRefs)) {
    assert(await exists(path.join(dist, 'assets', `${asset}.txt`)), `Falta prompt copiado en dist/assets/${asset}.txt`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Dist inmersivo validado correctamente con catálogo dinámico textX/textX/seo de ${REQUIRED_LANGUAGE_COUNT} idiomas y responsive preservado.`);
