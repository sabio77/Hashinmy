(() => {
  'use strict';

  const STORAGE_KEY = 'hashinmy_immersive_route_v6';
  const LANGUAGE_STORAGE_KEY = 'hashinmy_immersive_language_v1';
  const LEGACY_STORAGE_KEYS = ['hashinmy_immersive_route_v5', 'hashinmy_immersive_route_v4', 'hashinmy_immersive_route_v3', 'hashinmy_immersive_route_v2', 'hashinmy_immersive_route_v1'];
  const CONTACT_EMAIL = 'sales@hashinmy.com';
  const MAILTO_MAX_SAFE_LENGTH = 1800;
  const MEMORIA_BACKEND_SITE_ID = 'a1';
  const MEMORIA_BACKEND_BASE_URL = 'https://mapsx.app';
  const MEMORIA_BACKEND_API_BASE_URL = `${MEMORIA_BACKEND_BASE_URL}/api/v1`;
  const MEMORIA_BACKEND_SDK_URL = `${MEMORIA_BACKEND_BASE_URL}/sdk/memoria.js?s=${encodeURIComponent(MEMORIA_BACKEND_SITE_ID)}`;
  const MEMORIA_BACKEND_COMMERCIAL_SDK_TIMEOUT_MS = 5200;
  const MEMORIA_BACKEND_VISIT_OPENING_SDK_TIMEOUT_MS = 2600;
  const MEMORIA_BACKEND_VISIT_OPENING_API_TIMEOUT_MS = 3200;
  const INITIAL_LANGUAGE_DEFAULT_CODE = 'en';
  const MEMORIA_BACKEND_COMMERCIAL_REQUEST_TIMEOUT_MS = 18000;
  const COMMERCIAL_FLOW_IDEMPOTENCY_PREFIX = 'hashinmy-web-cotizacion';
  const COMMERCIAL_LOADING_MESSAGE = 'Enviando tu solicitud a Hashinmy...';
  const COMMERCIAL_SUCCESS_MESSAGE = '¡Solicitud recibida! Revisaremos tu información y te enviaremos la cotización al correo indicado. Si tenemos alguna duda, nos pondremos en contacto contigo por WhatsApp.';
  const COMMERCIAL_ERROR_MESSAGE = 'No pudimos confirmar la recepción automática de la solicitud. Para no perder tu ruta, puedes comunicarte directamente por WhatsApp con el resumen ya preparado.';
  const COMMERCIAL_WHATSAPP_LABEL = 'Enviar por WhatsApp';
  const COMMERCIAL_WHATSAPP_ALIAS = 'principal';
  const MEMORIA_BACKEND_SUBMISSION_FIELD_LABELS = Object.freeze([
    'Necesidad',
    'Proyecto elegido',
    'Uso esperado',
    'Valor buscado',
    'Financiación',
    'Ritmo',
    'Base técnica sugerida',
    'Contacto'
  ]);
  const MAX_OPTIONS_PER_SCENE = 3;
  const PUBLIC_SITE_URL = 'https://hashinmy.com/';
  const LANGUAGE_PATH_PREFIX = 'l';
  const APP_BASE_URL = (() => {
    try {
      const scriptUrl = new URL(document.currentScript?.src || './js/hashinmy-immersive.js', window.location.href);
      return new URL('../', scriptUrl).href;
    } catch {
      return './';
    }
  })();
  function appUrl(relativePath) {
    try {
      return new URL(String(relativePath || '').replace(/^\.\//, ''), APP_BASE_URL).toString();
    } catch {
      return String(relativePath || '');
    }
  }
  const ASSET_BASE = appUrl('assets/');
  const PROOF_LOGO_DIRECTORY = 'assets/clientes/';
  const PROOF_LOGO_MANIFEST_PATH = appUrl(`${PROOF_LOGO_DIRECTORY}clientes-manifest.json`);
  const PROJECT_STRUCTURE_PATH = appUrl('estructura_del_proyecto.json');
  const PROOF_LOGO_IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp']);
  const PROOF_LOGO_DISPLAY_WORD_OVERRIDES = new Map([
    ['ai', 'AI'], ['ia', 'IA'], ['cad', 'CAD'], ['dxf', 'DXF'], ['seo', 'SEO'], ['pc', 'PC'], ['pwa', 'PWA'],
    ['crm', 'CRM'], ['erp', 'ERP'], ['ux', 'UX'], ['ui', 'UI'], ['3d', '3D'], ['vx', 'VX'], ['max', 'MAX'],
    ['mapsx', 'MapsX'], ['maxpunz', 'Maxpunz'], ['xzone', 'Xzone'], ['clean', 'Clean'], ['robots', 'Robots'],
    ['colombia', 'Colombia'], ['griferias', 'Griferías'], ['design', 'Design'], ['international', 'International'],
    ['industries', 'Industries'], ['marketplace', 'Marketplace']
  ]);
  const PROOF_LOGO_PLACEHOLDER_NAME = 'Experiencia Hashinmy';
  const TYPE_TITLE_SPEED_MS = 12;
  const TYPE_COPY_SPEED_MS = 9;
  const TYPE_INSIGHT_SPEED_MS = 8;
  const OPTION_REVEAL_DELAY_MS = 3000;
  const OPTION_TEXT_REVEAL_DELAY_AFTER_ARRIVAL_MS = 177;
  const REDUCED_MOTION_REVEAL_DELAY_MS = 320;
  const SCENE_TRANSITION_MS = 680;
  const REDUCED_MOTION_TRANSITION_MS = 90;
  const JSON_FETCH_TIMEOUT_MS = 6500;
  const LANGUAGE_CATALOG_PROBE_TIMEOUT_MS = 2600;
  const LANGUAGE_CATALOG_PROBE_CONCURRENCY = 6;
  const LANGUAGE_CATALOG_BACKGROUND_REFRESH_DELAY_MS = 220;
  const RESPONSIVE_FIT_CHECK_DELAYS_MS = [0, 140, 420, 920];
  const CRAMPED_VIEWPORT_HEIGHT_PX = 640;
  const CRAMPED_VIEWPORT_WIDTH_PX = 430;
  const INITIAL_LOADER_CONFIRM_DELAY_MS = 100;
  const INITIAL_LOADER_EXIT_DURATION_MS = 460;
  const INITIAL_SCENE_IMAGE_READY_TIMEOUT_MS = 480;
  const POST_INITIAL_BOOT_DELAY_MS = 90;
  const INITIAL_CRITICAL_SCENE_NAME = 'intro';

  let paisORIGEN = '';
  // No eliminar: paisORIGEN inicia en blanco y se alimenta con la API oficial de aperturas de memoriaBACKEND
  // para conocer el país desde donde se abre la web antes de mostrar mensajes locales.
  const LOCAL_ORIGIN_COUNTRY_CODE = 'CO';
  const LOCAL_ORIGIN_LANGUAGE_CODE = 'es';
  const LOCAL_ORIGIN_COPY_PREFIXES = [
    'Medellín y Colombia son nuestro origen',
    'Medellín and Colombia are our origin'
  ];


  const SEO_BASE_PATH = appUrl('textX/seo/');
  const SEO_CLASSIC_STYLESHEET_ID = 'hmSeoClassicStylesheet';
  const SEO_CLASSIC_STYLESHEET_PATH = appUrl('css/hashinmy-classic.css');
  const SEO_MODERN_ROUTE_QUERY = 'seo';
  const SEO_VIEW_QUERY = 'vista';
  const SEO_CLASSIC_VIEW_VALUE = 'clasica';
  let seoSupportedLanguages = new Set(['es', 'en']);
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

  const TEXT_BASE_PATH = appUrl('textX/');
  const TEXT_LANGUAGE_MANIFEST_FILE = 'languages.json';
  const TEXT_LANGUAGE_FILE_EXTENSION = '.json';
  const TEXT_SCHEMA_VERSION = 1;
  const DEFAULT_LANGUAGE_CACHE_LIMIT = 50;
  const REQUIRED_SEO_UI_LABEL_KEYS = ['productsLabel', 'allLabel', 'closeLabel', 'backToProductsLabel', 'viewSolutionLabel', 'classicViewLabel', 'classicViewAriaLabel', 'modernViewLabel', 'modernViewAriaLabel', 'categoryNavLabel', 'simpleLabel', 'whoLabel', 'technicalLabel', 'includesLabel', 'glossaryLabel', 'guideLabel', 'faqLabel', 'detailTitle', 'detailLead', 'scopeCatalogLabel', 'glossarySetLabel'];
  const LANGUAGE_URL_KEYS = ['lang', 'idioma', 'locale'];
  const TEXT_BUNDLE_CACHE_PREFIX = 'hashinmy_immersive_text_bundle_v1:';
  const TEXT_BUNDLE_CACHE_INDEX_KEY = 'hashinmy_immersive_text_bundle_index_v1';
  const LANGUAGE_CATALOG_CACHE_KEY = 'hashinmy_immersive_language_catalog_v1';
  const MAX_STORED_TEXT_BUNDLES = DEFAULT_LANGUAGE_CACHE_LIMIT;
  const CRITICAL_TEXT_PATHS = [
    'meta.title',
    'meta.description',
    'meta.applicationName',
    'ui.languageLabel',
    'ui.languageAria',
    'ui.primaryFinance',
    'ui.primaryQuote',
    'ui.preparingOptions',
    'ui.summaryTitle',
    'ui.submitRoute',
    'scenes.intro.insight',
    'scenes.serviceFamily.insight',
    'scenes.buildType.insight',
    'scenes.automationType.insight',
    'scenes.modernization.insight',
    'scenes.operation.insight',
    'scenes.value.insight',
    'scenes.risk.insight',
    'scenes.finance.insight',
    'scenes.timeline.insight',
    'scenes.summary.insight'
  ];
  const REQUIRED_TEXT_SCENES = ['intro', 'serviceFamily', 'buildType', 'automationType', 'modernization', 'operation', 'value', 'risk', 'finance', 'timeline', 'summary'];
  const fallbackLanguageCatalogItems = [
    { code: 'es', name: 'Spanish', nativeName: 'Español', htmlLang: 'es', dir: 'ltr' },
    { code: 'en', name: 'English', nativeName: 'English', htmlLang: 'en', dir: 'ltr' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', htmlLang: 'zh', dir: 'ltr' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', htmlLang: 'hi', dir: 'ltr' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', htmlLang: 'ar', dir: 'rtl' },
    { code: 'fr', name: 'French', nativeName: 'Français', htmlLang: 'fr', dir: 'ltr' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', htmlLang: 'bn', dir: 'ltr' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', htmlLang: 'pt', dir: 'ltr' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', htmlLang: 'ru', dir: 'ltr' },
    { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', htmlLang: 'id', dir: 'ltr' },
    { code: 'ur', name: 'Urdu', nativeName: 'اردو', htmlLang: 'ur', dir: 'rtl' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', htmlLang: 'de', dir: 'ltr' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', htmlLang: 'ja', dir: 'ltr' },
    { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', htmlLang: 'sw', dir: 'ltr' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी', htmlLang: 'mr', dir: 'ltr' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', htmlLang: 'te', dir: 'ltr' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', htmlLang: 'tr', dir: 'ltr' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', htmlLang: 'ta', dir: 'ltr' },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', htmlLang: 'vi', dir: 'ltr' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', htmlLang: 'ko', dir: 'ltr' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', htmlLang: 'it', dir: 'ltr' },
    { code: 'fa', name: 'Persian', nativeName: 'فارسی', htmlLang: 'fa', dir: 'rtl' },
    { code: 'pl', name: 'Polish', nativeName: 'Polski', htmlLang: 'pl', dir: 'ltr' },
    { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', htmlLang: 'uk', dir: 'ltr' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', htmlLang: 'nl', dir: 'ltr' },
    { code: 'th', name: 'Thai', nativeName: 'ไทย', htmlLang: 'th', dir: 'ltr' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', htmlLang: 'gu', dir: 'ltr' },
    { code: 'ro', name: 'Romanian', nativeName: 'Română', htmlLang: 'ro', dir: 'ltr' },
    { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', htmlLang: 'ms', dir: 'ltr' },
    { code: 'ha', name: 'Hausa', nativeName: 'Hausa', htmlLang: 'ha', dir: 'ltr' },
    { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', htmlLang: 'pa', dir: 'ltr' },
    { code: 'fil', name: 'Filipino', nativeName: 'Filipino', htmlLang: 'fil', dir: 'ltr' },
    { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa', htmlLang: 'jv', dir: 'ltr' },
    { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', htmlLang: 'am', dir: 'ltr' },
    { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ', htmlLang: 'my', dir: 'ltr' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', htmlLang: 'kn', dir: 'ltr' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', htmlLang: 'ml', dir: 'ltr' },
    { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', htmlLang: 'or', dir: 'ltr' },
    { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', htmlLang: 'as', dir: 'ltr' },
    { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', htmlLang: 'ne', dir: 'ltr' },
    { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', htmlLang: 'si', dir: 'ltr' },
    { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', htmlLang: 'el', dir: 'ltr' },
    { code: 'cs', name: 'Czech', nativeName: 'Čeština', htmlLang: 'cs', dir: 'ltr' },
    { code: 'sv', name: 'Swedish', nativeName: 'Svenska', htmlLang: 'sv', dir: 'ltr' },
    { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', htmlLang: 'hu', dir: 'ltr' },
    { code: 'he', name: 'Hebrew', nativeName: 'עברית', htmlLang: 'he', dir: 'rtl' },
    { code: 'da', name: 'Danish', nativeName: 'Dansk', htmlLang: 'da', dir: 'ltr' },
    { code: 'fi', name: 'Finnish', nativeName: 'Suomi', htmlLang: 'fi', dir: 'ltr' },
    { code: 'no', name: 'Norwegian', nativeName: 'Norsk', htmlLang: 'no', dir: 'ltr' },
    { code: 'ca', name: 'Catalan', nativeName: 'Català', htmlLang: 'ca', dir: 'ltr' }
  ];
  const supportedLanguageCodes = fallbackLanguageCatalogItems.map(({ code }) => code);

  let languageCodes = new Set(supportedLanguageCodes);
  const languageAliases = { nb: 'no', nn: 'no', iw: 'he', jw: 'jv', tl: 'fil', in: 'id' };

  function normalizeLanguageCandidateCode(value = '') {
    const raw = String(value || '').trim().toLowerCase().replaceAll('_', '-');
    if (!raw) return '';
    const clean = raw
      .split(/[?#]/u)[0]
      .replace(/[^a-z0-9-]/gu, '')
      .replace(/-{2,}/gu, '-')
      .replace(/^-+|-+$/gu, '');
    if (!clean) return '';
    return languageAliases[clean] || clean;
  }

  function isValidLanguageCandidateCode(value = '') {
    const code = normalizeLanguageCandidateCode(value);
    return /^[a-z0-9]{2,8}(?:-[a-z0-9]{2,8}){0,3}$/u.test(code);
  }

  function getPrimaryLanguageCandidateCode(value = '') {
    const code = normalizeLanguageCandidateCode(value);
    if (!code) return '';
    const primary = code.split('-')[0];
    return languageAliases[primary] || primary;
  }

  const denseScriptLanguageCodes = new Set(['zh', 'ja', 'ko', 'th', 'my']);
  const indicScriptLanguageCodes = new Set(['hi', 'bn', 'mr', 'te', 'ta', 'gu', 'pa', 'kn', 'ml', 'or', 'as', 'ne', 'si']);
  const rtlScriptLanguageCodes = new Set(['ar', 'ur', 'fa', 'he']);
  const ethiopicScriptLanguageCodes = new Set(['am']);

  function normalizeCatalogLanguage(language) {
    if (!language || typeof language !== 'object') return null;
    const code = normalizeLanguageCandidateCode(language.code || language.iso || '');
    const name = String(language.name || '').trim();
    const nativeName = String(language.nativeName || '').trim();
    const htmlLang = String(language.htmlLang || code).trim();
    const dir = String(language.dir || '').trim().toLowerCase();
    const validDirections = new Set(['ltr', 'rtl']);

    if (!code || !name || !nativeName || !htmlLang || !validDirections.has(dir)) return null;

    return { code, name, nativeName, htmlLang, dir };
  }

  function fallbackLanguageCatalog() {
    return fallbackLanguageCatalogItems.map((language) => ({ ...language }));
  }

  function buildNormalizedLanguageCatalog(languages) {
    const catalog = [];
    const seen = new Set();

    (Array.isArray(languages) ? languages : []).forEach((language) => {
      const normalized = normalizeCatalogLanguage(language);
      if (!normalized || seen.has(normalized.code)) return;
      seen.add(normalized.code);
      catalog.push(normalized);
    });

    return catalog;
  }

  function isCompleteLanguageCatalog(catalog) {
    if (!Array.isArray(catalog) || !catalog.length) return false;
    const validDirections = new Set(['ltr', 'rtl']);
    const seen = new Set(catalog.map((language) => language.code));
    const hasCompleteMetadata = catalog.every((language) => (
      language.name
      && language.nativeName
      && language.htmlLang
      && validDirections.has(language.dir)
    ));
    return hasCompleteMetadata && seen.size === catalog.length;
  }

  function getFallbackLanguageMetadata(code = '') {
    const normalized = normalizeLanguageCandidateCode(code);
    const known = fallbackLanguageCatalogItems.find((language) => language.code === normalized);
    if (known) return { ...known };
    const safeCode = normalized || 'es';
    return {
      code: safeCode,
      name: safeCode.toUpperCase(),
      nativeName: safeCode.toUpperCase(),
      htmlLang: safeCode,
      dir: rtlScriptLanguageCodes.has(safeCode) ? 'rtl' : 'ltr'
    };
  }

  function sortDetectedLanguageCodes(codes = []) {
    const preferredOrder = new Map(fallbackLanguageCatalogItems.map((language, index) => [language.code, index]));
    const seen = new Set();
    return (Array.isArray(codes) ? codes : [])
      .map(normalizeLanguageCandidateCode)
      .filter((code) => isValidLanguageCandidateCode(code) && !seen.has(code) && seen.add(code))
      .sort((a, b) => {
        const orderA = preferredOrder.has(a) ? preferredOrder.get(a) : Number.MAX_SAFE_INTEGER;
        const orderB = preferredOrder.has(b) ? preferredOrder.get(b) : Number.MAX_SAFE_INTEGER;
        return orderA === orderB ? a.localeCompare(b) : orderA - orderB;
      });
  }

  function buildLanguageCatalogFromCodes(codes = []) {
    return buildNormalizedLanguageCatalog(sortDetectedLanguageCodes(codes).map(getFallbackLanguageMetadata));
  }

  function buildLanguageCatalogFromDetectedCodes(codes = [], metadataSources = []) {
    const metadataMaps = (Array.isArray(metadataSources) ? metadataSources : [])
      .map((source) => new Map(buildNormalizedLanguageCatalog(source).map((language) => [language.code, language])));

    return buildNormalizedLanguageCatalog(sortDetectedLanguageCodes(codes).map((code) => {
      const fallback = getFallbackLanguageMetadata(code);
      const metadata = metadataMaps.reduce((match, sourceMap) => match || sourceMap.get(code), null);
      return { ...fallback, ...(metadata || {}), code };
    }));
  }

  async function filterLanguageCatalogByAvailableBundles(catalog = []) {
    const normalizedCatalog = buildNormalizedLanguageCatalog(catalog);
    if (!normalizedCatalog.length) return [];

    const checks = await mapLanguageCatalogWithConcurrency(normalizedCatalog, async (language) => {
      const code = language.code;
      try {
        await verifyJsonFileAvailableForLanguageCatalogProbe(`${TEXT_BASE_PATH}${encodeURIComponent(code)}.json`);
        await verifyJsonFileAvailableForLanguageCatalogProbe(`${SEO_BASE_PATH}${encodeURIComponent(code)}.json`);
        return language;
      } catch (error) {
        console.warn(`Hashinmy: idioma ${code} omitido porque no existe completo en textX y textX/seo.`, error);
        return null;
      }
    });

    return buildNormalizedLanguageCatalog(checks.filter(Boolean));
  }

  function mergeLanguageCatalogCandidates(...catalogs) {
    const merged = [];
    const seen = new Set();

    catalogs.forEach((catalog) => {
      buildNormalizedLanguageCatalog(catalog).forEach((language) => {
        if (!language?.code || seen.has(language.code)) return;
        seen.add(language.code);
        merged.push(language);
      });
    });

    return buildNormalizedLanguageCatalog(merged);
  }

  async function mapLanguageCatalogWithConcurrency(items = [], mapper, concurrency = LANGUAGE_CATALOG_PROBE_CONCURRENCY) {
    const list = Array.isArray(items) ? items : [];
    const results = new Array(list.length);
    const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, list.length || 1));
    let nextIndex = 0;

    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (nextIndex < list.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(list[currentIndex], currentIndex);
      }
    }));

    return results;
  }

  async function fetchLanguageCatalogProbeResponse(relativeUrl, options = {}) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = 0;

    try {
      const fetchOptions = controller
        ? { cache: 'no-store', ...options, signal: controller.signal }
        : { cache: 'no-store', ...options };

      if (controller) {
        timeoutId = window.setTimeout(() => controller.abort(), LANGUAGE_CATALOG_PROBE_TIMEOUT_MS);
      }

      return await fetch(relativeUrl, fetchOptions);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  async function fetchJsonForLanguageCatalogProbe(relativeUrl) {
    const response = await fetchLanguageCatalogProbeResponse(relativeUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function cancelProbeResponseBody(response) {
    try {
      response?.body?.cancel?.();
    } catch {}
  }

  function isProbablyJsonFileProbeResponse(response) {
    if (!response || !(response.ok || response.status === 206)) return false;
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    return !contentType.includes('text/html');
  }

  async function verifyJsonFileAvailableForLanguageCatalogProbe(relativeUrl) {
    let lastError = null;

    try {
      const headResponse = await fetchLanguageCatalogProbeResponse(relativeUrl, { method: 'HEAD' });
      if (isProbablyJsonFileProbeResponse(headResponse)) return true;
      lastError = new Error(`HEAD HTTP ${headResponse.status}`);
    } catch (error) {
      lastError = error;
    }

    try {
      const getResponse = await fetchLanguageCatalogProbeResponse(relativeUrl, {
        headers: { Range: 'bytes=0-0' }
      });
      const isJsonFile = isProbablyJsonFileProbeResponse(getResponse);
      cancelProbeResponseBody(getResponse);
      if (isJsonFile) return true;
      lastError = new Error(`GET HTTP ${getResponse.status}`);
    } catch (error) {
      lastError = error;
    }

    throw lastError || new Error('JSON no disponible');
  }

  async function probeLanguageCatalogByAvailableBundles(catalog = []) {
    const normalizedCatalog = buildNormalizedLanguageCatalog(catalog);
    if (!normalizedCatalog.length) return [];

    const checks = await mapLanguageCatalogWithConcurrency(normalizedCatalog, async (language) => {
      const code = language.code;
      const textBundleUrl = `${TEXT_BASE_PATH}${encodeURIComponent(code)}.json`;
      const seoBundleUrl = `${SEO_BASE_PATH}${encodeURIComponent(code)}.json`;
      try {
        await verifyJsonFileAvailableForLanguageCatalogProbe(textBundleUrl);
        await verifyJsonFileAvailableForLanguageCatalogProbe(seoBundleUrl);

        let textBundle = null;
        try {
          textBundle = await fetchJsonForLanguageCatalogProbe(textBundleUrl);
        } catch (error) {
          console.warn(`Hashinmy: idioma ${code} detectado por archivo, pero sin metadatos legibles en textX/${code}.json; se conserva metadata del catálogo.`, error);
        }

        return normalizeCatalogLanguage({
          ...language,
          code,
          name: textBundle?.name || language.name,
          nativeName: textBundle?.nativeName || language.nativeName,
          htmlLang: textBundle?.htmlLang || language.htmlLang,
          dir: textBundle?.dir || language.dir
        });
      } catch {
        return null;
      }
    });

    return buildNormalizedLanguageCatalog(checks.filter(Boolean));
  }

  function getDetectedLanguageCodesFromProjectStructure(projectStructure) {
    const files = Array.isArray(projectStructure?.files) ? projectStructure.files : [];
    const textCodes = new Set();
    const seoCodes = new Set();

    files.forEach((entry) => {
      const relativePath = String(entry?.path || entry?.file || '').replace(/\\/g, '/').trim();
      const textMatch = relativePath.match(new RegExp(`^textX/([^/]+)\\${TEXT_LANGUAGE_FILE_EXTENSION}$`, 'i'));
      if (textMatch && textMatch[1].toLowerCase() !== TEXT_LANGUAGE_MANIFEST_FILE.replace(/\.json$/i, '')) {
        const code = normalizeLanguageCandidateCode(textMatch[1]);
        if (isValidLanguageCandidateCode(code)) textCodes.add(code);
      }
      const seoMatch = relativePath.match(new RegExp(`^textX/seo/([^/]+)\\${TEXT_LANGUAGE_FILE_EXTENSION}$`, 'i'));
      if (seoMatch) {
        const code = normalizeLanguageCandidateCode(seoMatch[1]);
        if (isValidLanguageCandidateCode(code)) seoCodes.add(code);
      }
    });

    return sortDetectedLanguageCodes([...textCodes].filter((code) => seoCodes.has(code)));
  }

  async function loadDetectedLanguageCatalogFromProjectStructure(metadataSources = []) {
    try {
      const projectStructure = await fetchJson(PROJECT_STRUCTURE_PATH);
      const detectedCodes = getDetectedLanguageCodesFromProjectStructure(projectStructure);
      return buildLanguageCatalogFromDetectedCodes(detectedCodes, metadataSources);
    } catch (error) {
      console.warn('Hashinmy: no se pudo detectar idiomas desde estructura_del_proyecto.json.', error);
      return [];
    }
  }

  function getLanguageFileCodesFromDirectoryListingHtml(html = '', baseUrl = TEXT_BASE_PATH, { includeManifest = false } = {}) {
    const source = String(html || '');
    const codes = new Set();
    const collectHref = (href = '') => {
      const rawHref = String(href || '').trim();
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('?')) return;

      let fileName = '';
      try {
        const url = new URL(rawHref, baseUrl);
        fileName = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
      } catch {
        fileName = decodeURIComponent(rawHref.split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || rawHref);
      }

      const jsonMatch = fileName.match(/^([^/.][^/]*)\.json$/iu);
      if (!jsonMatch) return;
      if (!includeManifest && fileName.toLowerCase() === TEXT_LANGUAGE_MANIFEST_FILE.toLowerCase()) return;

      const code = normalizeLanguageCandidateCode(jsonMatch[1]);
      if (isValidLanguageCandidateCode(code)) codes.add(code);
    };

    try {
      const parser = typeof DOMParser === 'function' ? new DOMParser() : null;
      const doc = parser ? parser.parseFromString(source, 'text/html') : null;
      doc?.querySelectorAll?.('a[href]')?.forEach((anchor) => collectHref(anchor.getAttribute('href') || ''));
    } catch {}

    if (!codes.size) {
      source.replace(/href=["']([^"']+\.json(?:[?#][^"']*)?)["']/giu, (match, href) => {
        collectHref(href);
        return match;
      });
    }

    return sortDetectedLanguageCodes([...codes]);
  }

  async function fetchDirectoryListingLanguageCodes(directoryUrl, options = {}) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = 0;

    try {
      const fetchOptions = controller
        ? { cache: 'no-store', signal: controller.signal }
        : { cache: 'no-store' };

      if (controller) {
        timeoutId = window.setTimeout(() => controller.abort(), LANGUAGE_CATALOG_PROBE_TIMEOUT_MS);
      }

      const response = await fetch(directoryUrl, fetchOptions);
      if (!response.ok) return [];
      const html = await response.text();
      return getLanguageFileCodesFromDirectoryListingHtml(html, directoryUrl, options);
    } catch {
      return [];
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  async function loadDetectedLanguageCatalogFromDirectoryListings(metadataSources = []) {
    try {
      const [textCodes, seoCodes] = await Promise.all([
        fetchDirectoryListingLanguageCodes(TEXT_BASE_PATH),
        fetchDirectoryListingLanguageCodes(SEO_BASE_PATH)
      ]);
      const seoCodeSet = new Set(seoCodes);
      const detectedCodes = sortDetectedLanguageCodes(textCodes.filter((code) => seoCodeSet.has(code)));
      if (!detectedCodes.length) return [];

      const listingCatalog = buildLanguageCatalogFromDetectedCodes(detectedCodes, metadataSources);
      return probeLanguageCatalogByAvailableBundles(listingCatalog);
    } catch (error) {
      console.warn('Hashinmy: no se pudo detectar idiomas desde listados reales de textX y textX/seo.', error);
      return [];
    }
  }

  async function loadDetectedLanguageCatalogFromAvailableBundles(candidateCatalog = []) {
    const candidates = mergeLanguageCatalogCandidates(candidateCatalog, fallbackLanguageCatalog());
    if (!isCompleteLanguageCatalog(candidates)) return [];

    try {
      return await probeLanguageCatalogByAvailableBundles(candidates);
    } catch (error) {
      console.warn('Hashinmy: no se pudo detectar idiomas probando textX/{idioma}.json y textX/seo/{idioma}.json.', error);
      return [];
    }
  }

  function setLanguageCatalog(languages) {
    const catalog = buildNormalizedLanguageCatalog(languages);

    if (!isCompleteLanguageCatalog(catalog)) {
      console.warn('Hashinmy: catálogo dinámico de idiomas vacío; usando español como respaldo seguro.');
      state.languageCatalog = buildLanguageCatalogFromCodes(['es']);
    } else {
      state.languageCatalog = catalog;
    }

    languageCodes = new Set(state.languageCatalog.map((language) => language.code));
    seoSupportedLanguages = new Set(state.languageCatalog.map((language) => language.code));
    if (!languageCodes.has(state.language)) state.language = languageCodes.has('es') ? 'es' : state.languageCatalog[0]?.code || 'es';
  }

  function getLanguageCatalogSignature(catalog = []) {
    return buildNormalizedLanguageCatalog(catalog)
      .map((language) => [language.code, language.name, language.nativeName, language.htmlLang, language.dir].join('|'))
      .join('||');
  }

  function applyVerifiedLanguageCatalog(catalog = [], { syncDom = false } = {}) {
    const normalizedCatalog = buildNormalizedLanguageCatalog(catalog);
    if (!isCompleteLanguageCatalog(normalizedCatalog)) return false;

    const previousSignature = getLanguageCatalogSignature(state.languageCatalog);
    setLanguageCatalog(normalizedCatalog);
    const nextSignature = getLanguageCatalogSignature(state.languageCatalog);
    writeCachedLanguageCatalog(state.languageCatalog);

    if (previousSignature !== nextSignature) {
      state.seoContent = null;
      state.seoContentPromise = null;
      if (syncDom) {
        syncLanguageSelector();
        syncLocalizedSeoLinks();
        if (state.seoHubOpen) {
          loadSeoContent().then(() => renderSeoHub()).catch((error) => {
            console.warn('Hashinmy: no se pudo refrescar SEO tras detectar idiomas nuevos.', error);
          });
        }
      }
    }

    return true;
  }

  function readCachedLanguageCatalog() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LANGUAGE_CATALOG_CACHE_KEY) || 'null');
      const catalog = buildNormalizedLanguageCatalog(parsed?.languages);

      if (!parsed || parsed.schemaVersion !== TEXT_SCHEMA_VERSION || !isCompleteLanguageCatalog(catalog)) {
        if (parsed) localStorage.removeItem(LANGUAGE_CATALOG_CACHE_KEY);
        return null;
      }

      return catalog;
    } catch (error) {
      try { localStorage.removeItem(LANGUAGE_CATALOG_CACHE_KEY); } catch {}
      console.warn('Hashinmy: caché de catálogo de idiomas descartada.', error);
      return null;
    }
  }

  function writeCachedLanguageCatalog(languages) {
    const catalog = buildNormalizedLanguageCatalog(languages);
    if (!isCompleteLanguageCatalog(catalog)) return;

    try {
      localStorage.setItem(LANGUAGE_CATALOG_CACHE_KEY, JSON.stringify({
        schemaVersion: TEXT_SCHEMA_VERSION,
        cachedAt: new Date().toISOString(),
        languages: catalog
      }));
    } catch (error) {
      console.warn('Hashinmy: no se pudo guardar caché de catálogo de idiomas.', error);
    }
  }

  const sceneAssets = {
    intro: { file: 'hm-scene-01-financing-command.webp' },
    serviceFamily: { file: 'hm-scene-02-service-atlas.webp' },
    buildType: { file: 'hm-scene-03-build-lab.webp' },
    automationType: { file: 'hm-scene-04-intelligence-core.webp' },
    modernization: { file: 'hm-scene-05-operation-cloud.webp' },
    operation: { file: 'hm-scene-05-operation-cloud.webp' },
    value: { file: 'hm-scene-04-intelligence-core.webp' },
    risk: { file: 'hm-scene-08-security-gate.webp' },
    finance: { file: 'hm-scene-06-finance-route.webp' },
    timeline: { file: 'hm-scene-07-roadmap-brief.webp' },
    summary: { file: 'hm-scene-07-roadmap-brief.webp' }
  };

  const baseScenes = {
    intro: {
      options: [
        { next: 'serviceFamily', sets: [{ key: 'financing', value: 'contacto_directo' }] },
        { next: 'serviceFamily', sets: [{ key: 'financing', value: 'financiamiento_100' }], priority: 'high' },
        { next: 'serviceFamily', sets: [{ key: 'financing', value: 'sin_financiacion' }] }
      ]
    },
    serviceFamily: {
      options: [
        { next: 'buildType', key: 'serviceFamily', value: 'producto_digital', priority: 'high' },
        { next: 'automationType', key: 'serviceFamily', value: 'automatizacion_ia' },
        { next: 'modernization', key: 'serviceFamily', value: 'modernizacion_operativa' }
      ]
    },
    buildType: {
      options: [
        { next: 'operation', key: 'service', value: 'software_online', priority: 'high' },
        { next: 'operation', key: 'service', value: 'app_movil' },
        { next: 'operation', key: 'service', value: 'software_pc' }
      ]
    },
    automationType: {
      options: [
        { next: 'operation', sets: [{ key: 'service', value: 'automatizacion' }, { key: 'value', value: 'automation' }], priority: 'high' },
        { next: 'operation', sets: [{ key: 'service', value: 'ia' }, { key: 'value', value: 'ai' }] },
        { next: 'operation', sets: [{ key: 'service', value: 'software_online' }, { key: 'value', value: 'analytics' }] }
      ]
    },
    modernization: {
      options: [
        { next: 'operation', sets: [{ key: 'service', value: 'modernizacion' }, { key: 'value', value: 'workflow' }], priority: 'high' },
        { next: 'operation', sets: [{ key: 'service', value: 'automatizacion' }, { key: 'value', value: 'automation' }] },
        { next: 'operation', sets: [{ key: 'service', value: 'software_online' }, { key: 'value', value: 'experience' }] }
      ]
    },
    operation: {
      options: [
        { next: 'value', key: 'operation', value: 'web_global', priority: 'high' },
        { next: 'value', key: 'operation', value: 'mobile_first' },
        { next: 'value', key: 'operation', value: 'pc_local' }
      ]
    },
    value: {
      options: [
        { next: 'risk', key: 'value', value: 'workflow' },
        { next: 'risk', key: 'value', value: 'automation', priority: 'high' },
        { next: 'risk', key: 'value', value: 'analytics_ai' }
      ]
    },
    risk: {
      options: [
        { next: 'finance', key: 'risk', value: 'roles_permisos' },
        { next: 'finance', key: 'risk', value: 'datos_sensibles', priority: 'high' },
        { next: 'finance', key: 'risk', value: 'ia_controlada' }
      ]
    },
    finance: {
      options: [
        { next: 'timeline', key: 'financing', value: 'financiamiento_100', priority: 'high' },
        { next: 'timeline', key: 'financing', value: 'fases' },
        { next: 'summary', key: 'financing', value: 'contacto_directo' }
      ]
    },
    timeline: {
      options: [
        { next: 'summary', key: 'timeline', value: 'mvp_rapido' },
        { next: 'summary', key: 'timeline', value: '1_3_meses', priority: 'high' },
        { next: 'summary', key: 'timeline', value: 'enterprise' }
      ]
    },
    summary: { options: [] }
  };

  const answerOrder = ['serviceFamily', 'service', 'operation', 'value', 'risk', 'financing', 'timeline'];

  const state = {
    scene: 'intro',
    history: [],
    answers: {},
    audit: [],
    locked: false,
    optionsReady: false,
    typingToken: 0,
    narrativeTimers: [],
    fullscreenRequested: false,
    pendingFinance: false,
    optionExitPending: false,
    optionTransitionToken: 0,
    activeImageUrl: '',
    lastPayload: null,
    responsiveFitTimers: [],
    seoFitTimers: [],
    language: 'es',
    languageCatalog: [],
    languageRequestToken: 0,
    languageCatalogRefreshPromise: null,
    text: null,
    textCache: new Map(),
    seoContent: null,
    seoContentPromise: null,
    seoHubOpen: false,
    seoClassicView: false,
    seoActiveId: '',
    seoActiveCategory: '',
    proofWindowOpen: false,
    proofLogos: [],
    memoriaBackendSdkLoadPromise: null,
    memoriaBackendVisitOpening: null
  };

  const elements = {};
  const loadedImages = new Map();
  const resolvedSceneImageUrls = new Map();
  const preloadingSceneImages = new Map();

  function $(selector) {
    return document.querySelector(selector);
  }

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function readStoredRoutePayload() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && parsed.version === 6 ? parsed : null;
    } catch {
      return null;
    }
  }

  function readStoredRouteLanguage() {
    const storedRoute = readStoredRoutePayload();
    return storedRoute?.language ? normalizeLanguageCode(storedRoute.language) : '';
  }

  function readStorage() {
    const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
    let stored = null;

    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (key !== STORAGE_KEY) {
          try { localStorage.removeItem(key); } catch {}
          continue;
        }
        if (parsed && typeof parsed === 'object' && parsed.version === 6) {
          stored = parsed;
          break;
        }
      } catch {
        stored = null;
      }
    }

    if (!stored) return;

    const storedAnswers = stored.answers && typeof stored.answers === 'object' ? stored.answers : {};
    const hiddenRoutePurposeKey = ['in', 'tent'].join('');
    const { [hiddenRoutePurposeKey]: _discardedRoutePurpose, ...visibleAnswers } = storedAnswers;
    state.answers = visibleAnswers;
    state.audit = Array.isArray(stored.audit)
      ? stored.audit.slice(-60).map((item) => ({
        ...item,
        assignments: Array.isArray(item.assignments)
          ? item.assignments.filter(({ key }) => key !== hiddenRoutePurposeKey)
          : []
      }))
      : [];
    state.history = [];
    if (stored.scene && baseScenes[stored.scene]) state.scene = stored.scene;
  }

  function writeStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 6,
        scene: state.scene,
        language: state.language,
        answers: state.answers,
        audit: state.audit,
        updatedAt: new Date().toISOString()
      }));
    } catch {}
  }

  function clearStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    LEGACY_STORAGE_KEYS.forEach((key) => {
      try { localStorage.removeItem(key); } catch {}
    });
  }

  function resolveKnownLanguageCode(value) {
    const exact = normalizeLanguageCandidateCode(value);
    if (!exact) return '';
    if (languageCodes.has(exact)) return exact;
    const primary = getPrimaryLanguageCandidateCode(exact);
    const aliased = languageAliases[primary] || languageAliases[exact];
    if (aliased && languageCodes.has(aliased)) return aliased;
    return primary && languageCodes.has(primary) ? primary : '';
  }

  function normalizeLanguageCode(value) {
    return resolveKnownLanguageCode(value) || 'es';
  }

  function getDefaultInitialLanguage() {
    if (languageCodes.has(INITIAL_LANGUAGE_DEFAULT_CODE)) return INITIAL_LANGUAGE_DEFAULT_CODE;
    if (languageCodes.has('en')) return 'en';
    return state.languageCatalog[0]?.code || INITIAL_LANGUAGE_DEFAULT_CODE;
  }

  function detectBrowserLanguage() {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const language of languages) {
      const code = resolveKnownLanguageCode(language);
      if (code) return code;
    }
    return '';
  }

  function detectPreferredLanguage() {
    return detectBrowserLanguage() || getDefaultInitialLanguage();
  }

  function currentText() {
    return state.text && typeof state.text === 'object' ? state.text : {};
  }

  function getByPath(source, path, fallback = '') {
    if (!source || !path) return fallback;
    const value = String(path).split('.').reduce((node, part) => (
      node && Object.prototype.hasOwnProperty.call(node, part) ? node[part] : undefined
    ), source);
    return value === undefined || value === null ? fallback : value;
  }

  function flattenBundlePaths(source, prefix = '') {
    if (!source || typeof source !== 'object') return [];
    if (Array.isArray(source)) {
      return source.flatMap((item, index) => flattenBundlePaths(item, prefix ? `${prefix}.${index}` : String(index)));
    }

    return Object.entries(source).flatMap(([key, value]) => {
      const pathName = prefix ? `${prefix}.${key}` : key;
      return value && typeof value === 'object'
        ? flattenBundlePaths(value, pathName)
        : [pathName];
    });
  }

  function assertCompleteTextBundle(code, bundle, spanishBundle) {
    if (code === 'es') return true;
    const basePaths = new Set(flattenBundlePaths(spanishBundle));
    const bundlePaths = new Set(flattenBundlePaths(bundle));
    const missingPaths = [...basePaths].filter((pathName) => !bundlePaths.has(pathName));
    const extraPaths = [...bundlePaths].filter((pathName) => !basePaths.has(pathName));

    if (missingPaths.length || extraPaths.length) {
      throw new Error(`textX/${code}.json no mantiene paridad completa con es.json: ${[
        missingPaths.length ? `faltan ${missingPaths.slice(0, 8).join(', ')}` : '',
        extraPaths.length ? `sobran ${extraPaths.slice(0, 8).join(', ')}` : ''
      ].filter(Boolean).join(' | ')}`);
    }

    return true;
  }

  function t(path, fallback = '') {
    return getByPath(currentText(), path, fallback);
  }

  function formatLocalizedTemplate(template = '', replacements = {}) {
    return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(replacements, key) ? String(replacements[key] ?? '') : match
    ));
  }

  function getProofLogoAlt(name = '') {
    const safeName = String(name || PROOF_LOGO_PLACEHOLDER_NAME).trim() || PROOF_LOGO_PLACEHOLDER_NAME;
    return formatLocalizedTemplate(t('ui.proofLogoAltTemplate', 'Logo de {name}'), { name: safeName });
  }

  function normalizePaisOrigen(value = paisORIGEN) {
    return String(value || '').trim().toUpperCase();
  }

  function shouldShowLocalOriginCopy() {
    return normalizePaisOrigen() === LOCAL_ORIGIN_COUNTRY_CODE && normalizeLanguageCode(state.language) === LOCAL_ORIGIN_LANGUAGE_CODE;
  }

  function applyLocalOriginVisibilityToIntroCopy(copy = '') {
    const safeCopy = String(copy || '');
    if (shouldShowLocalOriginCopy()) return safeCopy;

    return safeCopy
      .split('\n')
      .filter((line) => {
        const normalizedLine = line.trim();
        return !LOCAL_ORIGIN_COPY_PREFIXES.some((prefix) => normalizedLine.startsWith(prefix));
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function deepMerge(base, override) {
    if (Array.isArray(base) || Array.isArray(override)) return override === undefined ? base : override;
    if (!base || typeof base !== 'object') return override === undefined ? base : override;
    const output = { ...base };
    Object.entries(override || {}).forEach(([key, value]) => {
      output[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? deepMerge(output[key], value)
        : value;
    });
    return output;
  }

  function getTextBundleCacheKey(code) {
    return `${TEXT_BUNDLE_CACHE_PREFIX}${normalizeLanguageCode(code)}`;
  }

  function readStoredTextBundleIndex() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TEXT_BUNDLE_CACHE_INDEX_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((code) => languageCodes.has(code)) : [];
    } catch {
      return [];
    }
  }

  function writeStoredTextBundleIndex(index) {
    try {
      localStorage.setItem(TEXT_BUNDLE_CACHE_INDEX_KEY, JSON.stringify(index));
    } catch {}
  }

  function rememberTextBundleCacheKey(code) {
    const normalized = normalizeLanguageCode(code);
    const index = [normalized, ...readStoredTextBundleIndex().filter((item) => item !== normalized)];
    const retained = index.slice(0, MAX_STORED_TEXT_BUNDLES);
    index.slice(MAX_STORED_TEXT_BUNDLES).forEach((staleCode) => {
      try { localStorage.removeItem(getTextBundleCacheKey(staleCode)); } catch {}
    });
    writeStoredTextBundleIndex(retained);
  }

  function readCachedTextBundle(code) {
    const normalized = normalizeLanguageCode(code);
    try {
      const raw = localStorage.getItem(getTextBundleCacheKey(normalized));
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const bundle = parsed?.bundle && typeof parsed.bundle === 'object' ? parsed.bundle : null;
      if (!bundle || parsed.schemaVersion !== TEXT_SCHEMA_VERSION || normalizeLanguageCode(parsed.code) !== normalized) {
        localStorage.removeItem(getTextBundleCacheKey(normalized));
        return null;
      }

      assertUsableTextBundle(normalized, bundle);
      rememberTextBundleCacheKey(normalized);
      return markResolvedTextBundle(bundle, normalized);
    } catch (error) {
      try { localStorage.removeItem(getTextBundleCacheKey(normalized)); } catch {}
      console.warn(`Hashinmy: caché de idioma descartada para ${normalized}.`, error);
      return null;
    }
  }

  function writeCachedTextBundle(code, bundle) {
    const normalized = normalizeLanguageCode(code);
    if (!bundle || typeof bundle !== 'object') return;

    try {
      localStorage.setItem(getTextBundleCacheKey(normalized), JSON.stringify({
        code: normalized,
        schemaVersion: TEXT_SCHEMA_VERSION,
        cachedAt: new Date().toISOString(),
        bundle
      }));
      rememberTextBundleCacheKey(normalized);
    } catch (error) {
      console.warn(`Hashinmy: no se pudo guardar caché de idioma para ${normalized}.`, error);
    }
  }

  function addJsonRetryParam(relativeUrl, paramName = 'hmTextRetry') {
    try {
      const url = new URL(relativeUrl, window.location.href);
      url.searchParams.set(paramName, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      return url.toString();
    } catch {
      const separator = String(relativeUrl || '').includes('?') ? '&' : '?';
      return `${relativeUrl}${separator}${paramName}=${Date.now()}`;
    }
  }

  function buildJsonFetchAttempts(relativeUrl) {
    return [
      { url: relativeUrl, options: { cache: 'no-store' }, label: 'red directa' },
      { url: relativeUrl, options: { cache: 'reload' }, label: 'recarga controlada' },
      { url: addJsonRetryParam(relativeUrl), options: { cache: 'no-store' }, label: 'red sin caché forzada' },
      { url: relativeUrl, options: { cache: 'default' }, label: 'caché HTTP segura' }
    ];
  }

  async function fetchJson(relativeUrl) {
    const errors = [];

    for (const attempt of buildJsonFetchAttempts(relativeUrl)) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      let timeoutId = 0;

      try {
        const options = controller
          ? { ...attempt.options, signal: controller.signal }
          : attempt.options;

        if (controller) {
          timeoutId = window.setTimeout(() => controller.abort(), JSON_FETCH_TIMEOUT_MS);
        }

        const response = await fetch(attempt.url, options);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      } catch (error) {
        const reason = error?.name === 'AbortError'
          ? `timeout ${JSON_FETCH_TIMEOUT_MS}ms`
          : (error.message || error);
        errors.push(`${attempt.label}: ${reason}`);
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    }

    throw new Error(`No se pudo cargar ${relativeUrl}. Intentos: ${errors.join(' | ')}`);
  }

  function isMemoriaBackendSdkReady() {
    return typeof window.memoriaBACKEND === 'object' && window.memoriaBACKEND !== null;
  }

  function getMemoriaBackendSdkScript() {
    return document.querySelector('script[data-hm-memoria-backend-sdk="true"]');
  }

  function waitForMemoriaBackendSdkReady(timeoutMs = MEMORIA_BACKEND_COMMERCIAL_SDK_TIMEOUT_MS) {
    if (isMemoriaBackendSdkReady()) return Promise.resolve(true);

    return new Promise((resolve) => {
      let settled = false;
      const script = getMemoriaBackendSdkScript();
      const finish = (ready) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timerId);
        window.removeEventListener('memoriaBACKEND:sdk-ready', handleReady);
        script?.removeEventListener('load', handleReady);
        script?.removeEventListener('error', handleError);
        resolve(Boolean(ready && isMemoriaBackendSdkReady()));
      };
      const handleReady = () => {
        if (isMemoriaBackendSdkReady()) finish(true);
      };
      const handleError = () => finish(false);
      const timerId = window.setTimeout(() => finish(false), timeoutMs);

      window.addEventListener('memoriaBACKEND:sdk-ready', handleReady, { once: true });
      script?.addEventListener('load', handleReady, { once: true });
      script?.addEventListener('error', handleError, { once: true });
      handleReady();
    });
  }

  function loadMemoriaBackendSdk({ waitForReady = false, timeoutMs = MEMORIA_BACKEND_COMMERCIAL_SDK_TIMEOUT_MS } = {}) {
    if (!state.memoriaBackendSdkLoadPromise) {
      const existingScript = getMemoriaBackendSdkScript();
      if (!existingScript && document.head) {
        const script = document.createElement('script');
        script.src = MEMORIA_BACKEND_SDK_URL;
        script.async = true;
        script.defer = true;
        script.dataset.hmMemoriaBackendSdk = 'true';
        script.addEventListener('error', () => {
          console.warn('Hashinmy: memoriaBACKEND no se pudo cargar; se usarán rutas de respaldo cuando aplique.');
        }, { once: true });
        document.head.appendChild(script);
      }

      state.memoriaBackendSdkLoadPromise = waitForMemoriaBackendSdkReady(timeoutMs);
    }

    return waitForReady ? waitForMemoriaBackendSdkReady(timeoutMs) : state.memoriaBackendSdkLoadPromise;
  }

  function withMemoriaBackendVisitOpeningTimeout(promise, timeoutMs = MEMORIA_BACKEND_VISIT_OPENING_API_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timerId = window.setTimeout(() => reject(new Error('La API de visitas/apertura no respondió dentro del tiempo seguro')), timeoutMs);
      Promise.resolve(promise)
        .then((value) => {
          window.clearTimeout(timerId);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timerId);
          reject(error);
        });
    });
  }

  function getVisitApiPayloadContext() {
    let timezone = '';
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}

    const languages = Array.from(navigator.languages || []).filter(Boolean).slice(0, 8);
    const language = navigator.language || languages[0] || '';

    return {
      s: MEMORIA_BACKEND_SITE_ID,
      siteId: MEMORIA_BACKEND_SITE_ID,
      path: window.location.pathname || '/',
      url: window.location.href,
      href: window.location.href,
      hrefPath: window.location.pathname + window.location.search + window.location.hash,
      referrer: document.referrer || '',
      title: document.title || '',
      timezone,
      timeZone: timezone,
      tz: timezone,
      language,
      lang: language,
      languages,
      navigatorLanguage: language,
      navigatorLanguages: languages,
      visibilityState: document.visibilityState || '',
      webdriver: navigator.webdriver === true,
      screen: {
        width: Number(window.screen?.width || 0),
        height: Number(window.screen?.height || 0),
        pixelRatio: Number(window.devicePixelRatio || 1)
      }
    };
  }

  function getVisitOpeningPayloadSources(payload) {
    const sources = [];
    const push = (value) => {
      if (value && typeof value === 'object' && !sources.includes(value)) sources.push(value);
    };

    push(payload);
    ['visit', 'visita', 'geo', 'data', 'visitor', 'visitante', 'localization', 'localizacion', 'locale', 'request', 'context'].forEach((key) => {
      push(payload?.[key]);
    });

    return sources;
  }

  function readFirstStringByKeys(source, keys = []) {
    if (!source || typeof source !== 'object') return '';
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (value && typeof value === 'object') {
        const nested = readFirstStringByKeys(value, keys);
        if (nested) return nested;
      }
    }
    return '';
  }

  function normalizeCountryCandidateCode(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const localeCountry = raw.match(/^[a-z]{2,8}-([a-z]{2})\b/iu)?.[1];
    if (localeCountry) return localeCountry.toUpperCase();
    const exact = raw.match(/^[a-z]{2}$/iu)?.[0];
    return exact ? exact.toUpperCase() : '';
  }

  function extractVisitOpeningContext(payload) {
    const sources = getVisitOpeningPayloadSources(payload);
    const languageKeys = ['idioma', 'language', 'lang', 'locale', 'languageCode', 'languageIso', 'idiomaIso', 'idiomaISO', 'idiomaCode', 'idiomaCodigo', 'l'];
    const countryKeys = ['isocode', 'isoCode', 'iso_code', 'pais', 'país', 'country', 'countryCode', 'country_code', 'countryIso', 'isoPais', 'paisIso', 'p'];
    let language = '';
    let countryCode = '';

    for (const source of sources) {
      if (!language) language = resolveKnownLanguageCode(readFirstStringByKeys(source, languageKeys));
      if (!countryCode) countryCode = normalizeCountryCandidateCode(readFirstStringByKeys(source, countryKeys));
      if (!countryCode) countryCode = normalizeCountryCandidateCode(readFirstStringByKeys(source, languageKeys));
      if (language && countryCode) break;
    }

    return language || countryCode ? { language, countryCode, raw: payload } : null;
  }

  function getMemoriaBackendVisitOpeningSdkFunction() {
    const api = window.memoriaBACKEND;
    if (!api || typeof api !== 'object') return null;
    return [
      api.registrarAperturaStatica,
      api.detectarPaisEIdioma,
      api.registerStaticOpen
    ].find((candidate) => typeof candidate === 'function') || null;
  }

  async function requestVisitOpeningApiThroughSdk() {
    const sdkReady = await loadMemoriaBackendSdk({ waitForReady: true, timeoutMs: MEMORIA_BACKEND_VISIT_OPENING_SDK_TIMEOUT_MS });
    const api = window.memoriaBACKEND;
    const visitFunction = sdkReady ? getMemoriaBackendVisitOpeningSdkFunction() : null;
    if (!visitFunction) return extractVisitOpeningContext(window.memoriaBACKENDVisit || null);

    const context = getVisitApiPayloadContext();
    const response = await withMemoriaBackendVisitOpeningTimeout(
      visitFunction.call(api, context, { siteId: MEMORIA_BACKEND_SITE_ID }),
      MEMORIA_BACKEND_VISIT_OPENING_API_TIMEOUT_MS
    );
    return extractVisitOpeningContext(response);
  }

  async function requestVisitOpeningApiDirectly() {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = 0;

    try {
      const url = new URL(`${MEMORIA_BACKEND_API_BASE_URL}/visitas/apertura`);
      const context = getVisitApiPayloadContext();
      url.searchParams.set('s', MEMORIA_BACKEND_SITE_ID);

      const options = {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-MB-Site': MEMORIA_BACKEND_SITE_ID,
          'X-Hashinmy-Action': 'webapp'
        },
        body: JSON.stringify(context)
      };
      if (controller) {
        options.signal = controller.signal;
        timeoutId = window.setTimeout(() => controller.abort(), MEMORIA_BACKEND_VISIT_OPENING_API_TIMEOUT_MS);
      }

      const response = await fetch(url.toString(), options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return extractVisitOpeningContext(await response.json());
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }


  function applyVisitOpeningContext(context) {
    if (!context) return;
    state.memoriaBackendVisitOpening = context;
    if (context.countryCode) {
      paisORIGEN = context.countryCode;
      document.documentElement.dataset.visitCountry = context.countryCode;
    }
    if (context.language) {
      document.documentElement.dataset.visitLanguage = context.language;
    }
  }

  async function resolveLanguageFromMemoriaBackendVisitOpening() {
    try {
      const context = await requestVisitOpeningApiThroughSdk();
      if (context?.language) {
        applyVisitOpeningContext(context);
        return context.language;
      }
      if (context?.countryCode) applyVisitOpeningContext(context);
    } catch (error) {
      console.warn('Hashinmy: la API de visitas/apertura desde SDK no pudo resolver idioma inicial.', error);
    }

    try {
      const context = await requestVisitOpeningApiDirectly();
      if (context?.language) {
        applyVisitOpeningContext(context);
        return context.language;
      }
      if (context?.countryCode) applyVisitOpeningContext(context);
    } catch (error) {
      console.warn('Hashinmy: /visitas/apertura directo no pudo resolver idioma inicial.', error);
    }

    return '';
  }


  function getSeoLanguage(code = state.language) {
    const normalized = normalizeLanguageCode(code);
    return seoSupportedLanguages.has(normalized) ? normalized : 'es';
  }

  function normalizeSeoPath(pathname = '/') {
    let normalized = `/${String(pathname || '/').split('?')[0].split('#')[0].replace(/^\/+/, '')}`;
    normalized = normalized.replace(/\/index\.html$/i, '/');
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  function normalizeSeoUrlPath(url = '/') {
    try {
      return normalizeSeoPath(new URL(url, PUBLIC_SITE_URL).pathname);
    } catch {
      return normalizeSeoPath(url);
    }
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
    const normalized = normalizeLanguageCode(code);
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

  function buildSeoBundlePath(code = 'es') {
    return `${SEO_BASE_PATH}${encodeURIComponent(getSeoLanguage(code))}.json`;
  }

  async function loadSeoContent() {
    if (state.seoContent) return state.seoContent;
    if (state.seoContentPromise) return state.seoContentPromise;

    const catalog = state.languageCatalog.length ? state.languageCatalog : buildLanguageCatalogFromCodes(['es']);
    const requestedSeoLanguages = sortDetectedLanguageCodes(catalog.map((language) => language.code).filter(Boolean));

    state.seoContentPromise = Promise.all(requestedSeoLanguages.map(async (code) => {
      try {
        const bundle = await fetchJson(buildSeoBundlePath(code));
        return [code, bundle];
      } catch (error) {
        console.warn(`Hashinmy: no se pudo cargar textX/seo/${code}.json.`, error);
        return [code, null];
      }
    }))
      .then((entries) => {
        const loadedLanguages = Object.fromEntries(entries.filter(([, bundle]) => bundle && typeof bundle === 'object'));
        const spanishBundle = loadedLanguages.es;
        if (!isValidSeoBundle(spanishBundle)) {
          throw new Error('textX/seo/es.json debe existir y funcionar como catálogo SEO canónico de producción.');
        }

        const languages = {};
        const validCodes = [];
        for (const code of requestedSeoLanguages) {
          const bundle = loadedLanguages[code];
          if (!bundle) continue;

          try {
            assertCompleteSeoBundle(code, bundle, spanishBundle);
            languages[code] = { ...bundle, code: bundle.code || code };
            validCodes.push(code);
          } catch (error) {
            console.warn(`Hashinmy: textX/seo/${code}.json omitido por validación.`, error);
          }
        }

        if (!Object.keys(languages).length) {
          throw new Error('textX/seo no tiene bundles válidos para los idiomas detectados.');
        }

        const filteredCatalog = state.languageCatalog.filter((language) => validCodes.includes(language.code));
        if (filteredCatalog.length && filteredCatalog.length !== state.languageCatalog.length) setLanguageCatalog(filteredCatalog);

        state.seoContent = {
          schemaVersion: 1,
          siteUrl: PUBLIC_SITE_URL,
          languages
        };
        return state.seoContent;
      })
      .catch((error) => {
        console.warn('Hashinmy: no se pudo cargar el contenido SEO de productos desde textX/seo.', error);
        state.seoContent = null;
        return null;
      })
      .finally(() => {
        state.seoContentPromise = null;
      });

    return state.seoContentPromise;
  }

  function getSeoBundle(language = getSeoLanguage()) {
    const content = state.seoContent?.languages || {};
    return content[getSeoLanguage(language)] || null;
  }

  function getSeoBundles() {
    const languages = state.seoContent?.languages || {};
    const catalog = state.languageCatalog.length ? state.languageCatalog : fallbackLanguageCatalog();
    const orderedCodes = [
      ...catalog.map((language) => language.code),
      ...Object.keys(languages)
    ];
    const seen = new Set();
    return orderedCodes
      .map((code) => getSeoLanguage(code))
      .filter((code) => code && !seen.has(code) && seen.add(code))
      .map((code) => languages[code])
      .filter(Boolean);
  }

  function getSeoItems(language = getSeoLanguage()) {
    const bundle = getSeoBundle(language);
    return Array.isArray(bundle?.items) ? bundle.items : [];
  }

  function getSeoBundleKeywords(bundle = getSeoBundle()) {
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

  function getSeoItemById(id, language = getSeoLanguage()) {
    const wanted = String(id || '').trim();
    if (!wanted) return null;
    return getSeoItems(language).find((item) => item.id === wanted) || null;
  }

  function normalizeSeoRouteQueryPath(value = '') {
    const rawValue = String(value || '').trim();
    if (!rawValue || /^[a-z][a-z0-9+.-]*:/iu.test(rawValue) || rawValue.startsWith('//')) return '';
    const [pathPart] = rawValue.split(/[?#]/u);
    return normalizeSeoPath(pathPart || '/');
  }

  function getSeoRouteLookupPathFromLocation() {
    try {
      const url = new URL(window.location.href);
      const routedPath = normalizeSeoRouteQueryPath(url.searchParams.get(SEO_MODERN_ROUTE_QUERY));
      return routedPath || url.pathname || window.location.pathname;
    } catch {
      return window.location.pathname;
    }
  }

  function isSeoClassicViewRequestedFromLocation() {
    try {
      const url = new URL(window.location.href);
      return String(url.searchParams.get(SEO_VIEW_QUERY) || '').trim().toLowerCase() === SEO_CLASSIC_VIEW_VALUE;
    } catch {
      return false;
    }
  }

  function getSeoClassicStylesheet() {
    return document.getElementById(SEO_CLASSIC_STYLESHEET_ID);
  }

  function ensureSeoClassicStylesheet() {
    const existing = getSeoClassicStylesheet();
    if (existing) return existing;
    const stylesheet = document.createElement('link');
    stylesheet.id = SEO_CLASSIC_STYLESHEET_ID;
    stylesheet.rel = 'stylesheet';
    stylesheet.href = SEO_CLASSIC_STYLESHEET_PATH;
    stylesheet.dataset.hashinmyClassicCss = 'true';
    stylesheet.disabled = true;
    document.head.append(stylesheet);
    return stylesheet;
  }

  function syncSeoClassicStylesheetState(isClassic = false) {
    const stylesheet = isClassic ? ensureSeoClassicStylesheet() : getSeoClassicStylesheet();
    if (!stylesheet) return;
    stylesheet.disabled = !isClassic;
    stylesheet.dataset.hashinmyClassicCssActive = isClassic ? 'true' : 'false';
  }

  function syncSeoClassicViewChrome() {
    const isClassic = Boolean(state.seoClassicView && state.seoHubOpen);
    syncSeoClassicStylesheetState(isClassic);
    document.documentElement.classList.toggle('hm-seo-classic-view-root', isClassic);
    document.body.classList.toggle('hm-seo-classic-view', isClassic);
    if (elements.seoHub) {
      elements.seoHub.classList.toggle('hm-seo-hub--classic', isClassic);
      elements.seoHub.dataset.seoView = isClassic ? 'classic' : 'modern';
      elements.seoHub.setAttribute('role', isClassic ? 'region' : 'dialog');
      if (isClassic) elements.seoHub.removeAttribute('aria-modal');
      else elements.seoHub.setAttribute('aria-modal', 'true');
    }
    if (elements.seoHubClose) {
      elements.seoHubClose.hidden = isClassic;
      elements.seoHubClose.setAttribute('aria-hidden', String(isClassic));
      try { elements.seoHubClose.inert = isClassic; } catch {}
    }
    if (isClassic) {
      clearSeoHubFitTimers();
      document.body.classList.remove('hm-seo-fit-compact', 'hm-seo-fit-ultra');
      delete document.body.dataset.seoFit;
      delete document.body.dataset.seoFitSource;
    }
  }

  function findSeoItemAcrossLanguages(id) {
    const wanted = String(id || '').trim();
    if (!wanted) return null;
    for (const bundle of getSeoBundles()) {
      const item = (bundle.items || []).find((candidate) => candidate.id === wanted);
      if (item) return { language: bundle.code || 'es', bundle, item };
    }
    return null;
  }

  function findSeoRouteByPath(pathname = window.location.pathname) {
    const normalizedPath = normalizeSeoPath(pathname);
    for (const bundle of getSeoBundles()) {
      const language = getSeoLanguage(bundle.code);
      if (normalizeSeoPath(bundle.hubUrl || '/') === normalizedPath) {
        return { type: 'hub', language, bundle, item: null };
      }
      const item = (bundle.items || []).find((candidate) => normalizeSeoUrlPath(candidate.url) === normalizedPath);
      if (item) return { type: 'item', language, bundle, item };
    }
    return null;
  }

  function buildSeoPublicUrl(path = '/') {
    try {
      return new URL(normalizeSeoPath(path), PUBLIC_SITE_URL).toString();
    } catch {
      return `${PUBLIC_SITE_URL.replace(/\/$/, '')}${normalizeSeoPath(path)}`;
    }
  }

  function getSeoHubPath(language = getSeoLanguage()) {
    return normalizeSeoPath(getSeoBundle(language)?.hubUrl || `/${getSeoLanguage(language)}/products/`);
  }

  function getSeoActiveItem() {
    return state.seoHubOpen && state.seoActiveId ? getSeoItemById(state.seoActiveId) : null;
  }

  function getSeoAlternateItems(id = state.seoActiveId) {
    const wanted = String(id || '').trim();
    if (!wanted) return [];
    return getSeoBundles()
      .map((bundle) => {
        const item = (bundle.items || []).find((candidate) => candidate.id === wanted);
        return item ? { language: getSeoLanguage(bundle.code), bundle, item } : null;
      })
      .filter(Boolean);
  }

  function getSeoCanonicalHref() {
    const activeItem = getSeoActiveItem();
    if (activeItem) return buildSeoPublicUrl(activeItem.url);
    if (state.seoHubOpen) return buildSeoPublicUrl(getSeoHubPath());
    return '';
  }

  function getSeoAlternateLinks() {
    if (!state.seoHubOpen) return null;

    if (state.seoActiveId) {
      const alternates = getSeoAlternateItems();
      if (!alternates.length) return null;
      const fallback = alternates.find((entry) => entry.language === 'es') || alternates[0];
      return [
        { hreflang: 'x-default', href: buildSeoPublicUrl(fallback.item.url) },
        ...alternates.map(({ language, bundle, item }) => ({
          hreflang: bundle.htmlLang || language,
          href: buildSeoPublicUrl(item.url)
        }))
      ];
    }

    const bundles = getSeoBundles();
    const fallback = bundles.find((bundle) => getSeoLanguage(bundle.code) === 'es') || bundles[0];
    return [
      { hreflang: 'x-default', href: buildSeoPublicUrl(fallback?.hubUrl || '/es/productos/') },
      ...bundles.map((bundle) => ({
        hreflang: bundle.htmlLang || getSeoLanguage(bundle.code),
        href: buildSeoPublicUrl(bundle.hubUrl || getSeoHubPath(bundle.code))
      }))
    ];
  }

  function setMetaContentBySelector(selector, content = '') {
    const node = document.querySelector(selector);
    if (node) node.setAttribute('content', String(content || ''));
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

  function buildSeoBreadcrumbList(pageUrl, activeItem, bundle) {
    const hubName = bundle?.entryLabel || getSeoUiLabel('productsLabel', 'Productos', 'Products');
    const items = [
      { name: 'Hashinmy', item: PUBLIC_SITE_URL },
      { name: hubName, item: buildSeoPublicUrl(getSeoHubPath()) }
    ];

    if (activeItem) {
      items.push({ name: activeItem.title, item: pageUrl });
    }

    return {
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumb`,
      itemListElement: items.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: entry.name,
        item: entry.item
      }))
    };
  }

  function normalizeSeoSchemaSlug(value = '') {
    const rawValue = String(value || '').trim().toLowerCase();
    let normalizedValue = rawValue;
    try {
      normalizedValue = rawValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch {}
    return normalizedValue.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'concepto';
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
        inLanguage: bundle?.htmlLang || getSeoLanguage(),
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
      provider: { '@id': 'https://hashinmy.com/#organization' },
      url: pageUrl,
      areaServed: 'Global',
      audience: item.who ? { '@type': 'BusinessAudience', audienceType: item.who } : undefined,
      keywords,
      about: termRefs.length ? termRefs : undefined,
      hasOfferCatalog: Array.isArray(item.includes) && item.includes.length ? {
        '@type': 'OfferCatalog',
        name: getSeoUiLabel('scopeCatalogLabel', 'Alcance posible de Hashinmy', 'Possible Hashinmy scope'),
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
      inLanguage: bundle?.htmlLang || getSeoLanguage(),
      publisher: { '@id': 'https://hashinmy.com/#organization' },
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
        name: getSeoUiLabel('glossarySetLabel', 'Glosario sencillo de Hashinmy', 'Plain Hashinmy glossary'),
        inLanguage: bundle?.htmlLang || getSeoLanguage(),
        hasDefinedTerm: definedTerms.map((entry) => ({ '@id': entry['@id'] }))
      },
      ...definedTerms
    ];
  }

  function getProofLogoFileName(file = '') {
    return String(file || '')
      .split('?')[0]
      .split('#')[0]
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      .trim();
  }

  function getProofLogoExtension(file = '') {
    const fileName = getProofLogoFileName(file);
    const match = fileName.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
  }

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
    const rawSource = getProofLogoFileName(value).replace(/\.[^.]+$/, '').trim() || String(value || '').trim();
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

  function getProofLogoNameFromFile(file = '', fallback = '') {
    return formatProofLogoDisplayName(fallback) || formatProofLogoDisplayName(file) || PROOF_LOGO_PLACEHOLDER_NAME;
  }

  function normalizeProofLogoEntry(entry, index = 0) {
    const file = typeof entry === 'string' ? entry : entry?.file || entry?.src || entry?.path || '';
    const fileName = getProofLogoFileName(file);
    const extension = getProofLogoExtension(fileName);

    if (!fileName || !PROOF_LOGO_IMAGE_EXTENSIONS.has(extension)) return null;

    const name = getProofLogoNameFromFile(fileName, entry?.name || '');
    return {
      name,
      file: fileName,
      src: buildProofLogoSrc(fileName),
      extension
    };
  }

  function normalizeProofLogoList(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const seen = new Set();
    return list
      .map((entry, index) => normalizeProofLogoEntry(entry, index))
      .filter((entry) => {
        if (!entry || seen.has(entry.file.toLowerCase())) return false;
        seen.add(entry.file.toLowerCase());
        return true;
      });
  }

  function getProofLogoEntriesFromProjectStructure(projectStructure) {
    const files = Array.isArray(projectStructure?.files) ? projectStructure.files : [];
    return files
      .map((entry) => {
        const relativePath = String(entry?.path || entry?.file || '').replace(/\\/g, '/').trim();
        const fileName = getProofLogoFileName(relativePath);
        const extension = getProofLogoExtension(fileName);
        if (!relativePath.startsWith(PROOF_LOGO_DIRECTORY) || !fileName || fileName === 'clientes-manifest.json' || !PROOF_LOGO_IMAGE_EXTENSIONS.has(extension)) return null;
        return {
          name: getProofLogoNameFromFile(fileName),
          file: fileName
        };
      })
      .filter(Boolean);
  }

  async function loadProofLogosFromProjectStructure() {
    try {
      const response = await fetch(PROJECT_STRUCTURE_PATH, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const projectStructure = await response.json();
      return normalizeProofLogoList(getProofLogoEntriesFromProjectStructure(projectStructure));
    } catch {
      return [];
    }
  }

  function buildProofLogoSrc(file = '') {
    const fileName = getProofLogoFileName(file);
    const encodedFileName = fileName.split('/').map((part) => encodeURIComponent(part)).join('/');
    return appUrl(`${PROOF_LOGO_DIRECTORY}${encodedFileName}`);
  }

  function getProofLogos() {
    return Array.isArray(state.proofLogos) ? state.proofLogos : [];
  }

  function getProofLogoInitials(name = '') {
    const cleaned = String(name || PROOF_LOGO_PLACEHOLDER_NAME)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (!words.length) return 'HM';
    const initials = words.length === 1
      ? words[0].slice(0, 3)
      : words.slice(0, 3).map((word) => word[0]).join('');
    return initials.toUpperCase();
  }

  function getProofBrandSlug(brand, index = 0) {
    const base = String(brand?.name || `brand-${index + 1}`)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || `brand-${index + 1}`;
    return base;
  }

  function getProofLogoPublicUrl(brand) {
    const fileName = getProofLogoFileName(brand?.file || brand?.src || '');
    if (!fileName) return '';
    try {
      return new URL(`${PROOF_LOGO_DIRECTORY}${encodeURIComponent(fileName)}`, PUBLIC_SITE_URL).toString();
    } catch {
      return `${PUBLIC_SITE_URL}${PROOF_LOGO_DIRECTORY}${encodeURIComponent(fileName)}`;
    }
  }

  function getProofBrandEntityId(brand, index = 0) {
    return `${PUBLIC_SITE_URL}#related-${getProofBrandSlug(brand, index)}`;
  }

  function getProofBrandMentions() {
    return getProofLogos().map((brand, index) => ({ '@id': getProofBrandEntityId(brand, index) }));
  }

  function buildProofBrandsStructuredData() {
    return {
      '@type': 'ItemList',
      '@id': `${PUBLIC_SITE_URL}#experience-logos`,
      name: t('ui.proofBrandsTitle', seoLocalizedText('Marcas, proyectos y empresas relacionadas con el trabajo de Hashinmy', 'Brands, projects and companies related to Hashinmy work')),
      description: t('ui.proofBrandsStructuredDescription', seoLocalizedText('Listado SEO actualizado automáticamente desde las imágenes disponibles en assets/clientes.', 'SEO list updated automatically from available images in assets/clientes.')),
      itemListElement: getProofLogos().map((brand, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: brand.name,
        item: {
          '@type': 'Organization',
          '@id': getProofBrandEntityId(brand, index),
          name: brand.name,
          logo: getProofLogoPublicUrl(brand),
          image: getProofLogoPublicUrl(brand)
        }
      }))
    };
  }

  const BRAND_HOME_SCHEMA_SERVICE_MAP = [
    ['software-a-medida', 'service-custom-software'],
    ['ia-para-empresas', 'service-ai-automation'],
    ['automatizacion-procesos', 'service-business-automation'],
    ['financiacion-proyecto', 'service-financed-development'],
    ['diagnostico-tecnico', 'service-business-diagnosis'],
    ['chatbots-empresariales', 'service-web-seo-chatbots'],
    ['cotizador-tecnico-aprovechamiento', 'service-technical-quoter']
  ];

  function getSeoItemById(id = '', bundle = getSeoBundle()) {
    const targetId = String(id || '').trim();
    if (!targetId) return null;
    return (Array.isArray(bundle?.items) ? bundle.items : []).find((item) => item?.id === targetId) || null;
  }

  function uniqueStructuredTextList(values = [], limit = 24) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => compactSeoVisibleText(value, 140))
      .filter((value) => {
        const key = normalizeSeoVisibleSignature(value);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, Math.max(1, Number(limit) || 24));
  }

  function getBrandStructuredDescription(bundle = getSeoBundle()) {
    return compactSeoVisibleText(
      t('meta.description', '') || t('meta.ogDescription', '') || bundle?.hubLead || bundle?.hubMetaDescription || 'Hashinmy',
      520
    );
  }

  function getBrandStructuredSlogan(bundle = getSeoBundle()) {
    return compactSeoVisibleText(
      t('meta.ogTitle', '') || t('meta.title', '') || bundle?.hubTitle || getBrandStructuredDescription(bundle),
      180
    );
  }

  function getBrandKnowsAboutTerms(bundle = getSeoBundle()) {
    const textBundle = currentText();
    const services = Array.isArray(textBundle?.services) ? textBundle.services : [];
    const mappedItems = BRAND_HOME_SCHEMA_SERVICE_MAP.map(([itemId]) => getSeoItemById(itemId, bundle)).filter(Boolean);
    const keywords = String(t('meta.keywords', '') || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    return uniqueStructuredTextList([
      bundle?.hubTitle,
      bundle?.hubLead,
      t('valueLabels.financiamiento_100', ''),
      t('valueLabels.modernizacion_operativa', ''),
      t('valueLabels.automatizacion_ia', ''),
      t('valueLabels.software_online', ''),
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

  function buildBrandOrganizationStructuredData(bundle = getSeoBundle()) {
    return {
      '@type': 'Organization',
      '@id': 'https://hashinmy.com/#organization',
      name: 'Hashinmy',
      url: 'https://hashinmy.com/',
      logo: 'https://hashinmy.com/assets/hashinmy-logo-emblem.png',
      description: getBrandStructuredDescription(bundle),
      slogan: getBrandStructuredSlogan(bundle),
      areaServed: 'Global',
      knowsAbout: getBrandKnowsAboutTerms(bundle),
      sameAs: []
    };
  }

  function buildBrandOfferCatalogStructuredData(bundle = getSeoBundle()) {
    const textBundle = currentText();
    const fallbackServices = Array.isArray(textBundle?.services) ? textBundle.services : [];
    return {
      '@type': 'OfferCatalog',
      '@id': 'https://hashinmy.com/#offer-catalog',
      name: bundle?.hubTitle || t('meta.ogTitle', 'Hashinmy'),
      description: bundle?.hubLead || getBrandStructuredDescription(bundle),
      itemListElement: BRAND_HOME_SCHEMA_SERVICE_MAP.map(([itemId, schemaId], index) => {
        const item = getSeoItemById(itemId, bundle);
        const fallback = fallbackServices[index] || {};
        const name = item?.title || fallback.label || `Hashinmy ${index + 1}`;
        const description = item?.metaDescription || item?.summary || item?.simple || fallback.tech || name;
        return {
          '@type': 'Offer',
          position: index + 1,
          itemOffered: {
            '@type': 'Service',
            '@id': `https://hashinmy.com/#${schemaId}`,
            name,
            serviceType: item?.eyebrow || item?.category || fallback.tech || name,
            description,
            provider: { '@id': 'https://hashinmy.com/#organization' },
            areaServed: 'Global'
          }
        };
      })
    };
  }

  function buildHomeSeoItemListStructuredData(pageUrl, bundle = getSeoBundle()) {
    const items = getSeoItems().map((item, index) => {
      const itemUrl = buildSeoPublicUrl(item.url);
      return {
        '@type': 'ListItem',
        position: index + 1,
        name: item.title,
        url: itemUrl,
        item: {
          '@type': getSeoPrimaryEntityType(item),
          '@id': getSeoPrimaryEntityId(item, itemUrl),
          name: item.title,
          description: item.summary,
          url: itemUrl
        }
      };
    });

    return {
      '@type': 'ItemList',
      '@id': `${pageUrl}#itemlist`,
      name: bundle?.hubTitle || 'Hashinmy',
      description: bundle?.hubLead || getBrandStructuredDescription(bundle),
      itemListElement: items
    };
  }

  function buildHomeFaqStructuredData(pageUrl) {
    const faqs = [
      [t('ui.proofFaqWhyQuestion', ''), t('ui.proofFaqWhyAnswer', '')],
      [t('ui.proofFaqWhoQuestion', ''), t('ui.proofFaqWhoAnswer', '')],
      [t('ui.proofFaqStartQuestion', ''), t('ui.proofFaqStartAnswer', '')]
    ].filter(([question, answer]) => String(question || '').trim() && String(answer || '').trim());

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

  function syncSeoStructuredData() {
    const node = document.getElementById('hmStructuredData');
    if (!node) return;

    const activeItem = getSeoActiveItem();
    const bundle = getSeoBundle();
    const pageUrl = activeItem ? buildSeoPublicUrl(activeItem.url) : state.seoHubOpen ? buildSeoPublicUrl(getSeoHubPath()) : buildPublicLanguageUrl(state.language);
    const pageTitle = activeItem?.metaTitle || bundle?.hubMetaTitle || t('meta.title', 'Hashinmy');
    const pageDescription = activeItem?.metaDescription || bundle?.hubMetaDescription || t('meta.description', '');
    const definedTerms = activeItem ? getSeoDefinedTerms(activeItem, pageUrl) : [];
    const primaryEntityId = activeItem ? getSeoPrimaryEntityId(activeItem, pageUrl) : `${pageUrl}#itemlist`;
    const faqs = getSeoItemFaqs(activeItem, SEO_FINAL_VISIBLE_LIMITS.faqs);

    const graph = [
      buildBrandOrganizationStructuredData(bundle),
      {
        '@type': 'WebSite',
        '@id': 'https://hashinmy.com/#website',
        name: 'Hashinmy',
        url: 'https://hashinmy.com/',
        publisher: { '@id': 'https://hashinmy.com/#organization' },
        inLanguage: getSeoBundles().map((seoBundle) => seoBundle.htmlLang || seoBundle.code || 'es')
      },
      {
        '@type': activeItem ? 'WebPage' : 'CollectionPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: pageTitle,
        description: pageDescription,
        isPartOf: { '@id': 'https://hashinmy.com/#website' },
        publisher: { '@id': 'https://hashinmy.com/#organization' },
        inLanguage: bundle?.htmlLang || getSeoLanguage(),
        breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
        mainEntity: { '@id': primaryEntityId },
        mentions: getProofBrandMentions()
      }
    ];

    graph.push(buildSeoBreadcrumbList(pageUrl, activeItem, bundle));
    graph.push(buildProofBrandsStructuredData());

    if (activeItem) {
      graph.push(buildSeoPrimaryEntity(activeItem, pageUrl, bundle, definedTerms));
      graph.push(buildSeoGuideEntity(activeItem, pageUrl, bundle, definedTerms));
      graph.push(...buildSeoGlossaryGraph(activeItem, pageUrl, bundle, definedTerms));

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
      const homeItemList = buildHomeSeoItemListStructuredData(pageUrl, bundle);
      if (homeItemList.itemListElement.length) graph.push(homeItemList);
      graph.push(buildBrandOfferCatalogStructuredData(bundle));
      const homeFaq = buildHomeFaqStructuredData(pageUrl);
      if (homeFaq) graph.push(homeFaq);
    }

    try {
      node.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
    } catch {}
  }

  function syncSeoDocumentMeta() {
    const bundle = getSeoBundle();
    const activeItem = getSeoActiveItem();
    const seoTitle = activeItem?.metaTitle || (state.seoHubOpen ? bundle?.hubMetaTitle : '') || t('meta.title', 'Hashinmy') || 'Hashinmy';
    const seoDescription = activeItem?.metaDescription || (state.seoHubOpen ? bundle?.hubMetaDescription : '') || t('meta.description', '');
    const seoUrl = getSeoCanonicalHref() || buildPublicLanguageUrl(state.language);
    const keywords = activeItem?.keywords || getSeoBundleKeywords(bundle);
    const keywordContent = Array.isArray(keywords) && keywords.length
      ? keywords.join(', ')
      : String(keywords || t('meta.keywords', '') || '');

    document.title = seoTitle;
    setMetaContentBySelector('meta[name="description"]', seoDescription);
    setMetaContentBySelector('meta[property="og:title"]', activeItem?.title || seoTitle);
    setMetaContentBySelector('meta[property="og:description"]', seoDescription);
    setMetaContentBySelector('meta[property="og:url"]', seoUrl);
    setMetaContentBySelector('meta[name="twitter:title"]', activeItem?.title || seoTitle);
    setMetaContentBySelector('meta[name="twitter:description"]', seoDescription);
    setMetaContentBySelector('meta[name="keywords"]', keywordContent);
    syncSeoStructuredData();
  }

  function seoLocalizedText(esValue = '', enValue = '') {
    const code = getSeoLanguage();
    if (code === 'en') return enValue || esValue;
    if (code === 'es') return esValue;
    return '';
  }

  function getSeoUiLabel(key = '', esValue = '', enValue = '') {
    const bundle = getSeoBundle();
    const localized = bundle?.uiLabels?.[key];
    if (typeof localized === 'string' && localized.trim()) return localized.trim();
    return seoLocalizedText(esValue, enValue);
  }

  function getSeoBundleValue(pathName = '', bundle = getSeoBundle()) {
    return String(pathName || '').split('.').reduce((node, part) => (
      node && Object.prototype.hasOwnProperty.call(node, part) ? node[part] : undefined
    ), bundle);
  }

  function applyLocalizedSeoDomText(bundle = getSeoBundle()) {
    if (!bundle) return;

    document.querySelectorAll('[data-seo-i18n-text]').forEach((node) => {
      const value = getSeoBundleValue(node.dataset.seoI18nText, bundle);
      if (typeof value === 'string' && value.trim()) node.textContent = value;
    });

    document.querySelectorAll('[data-seo-i18n-aria]').forEach((node) => {
      const value = getSeoBundleValue(node.dataset.seoI18nAria, bundle);
      if (typeof value === 'string' && value.trim()) node.setAttribute('aria-label', value);
    });
  }

  function syncSeoEntryButton() {
    if (!elements.seoHubButton) return;
    const bundle = getSeoBundle();
    if (!bundle) {
      elements.seoHubButton.hidden = true;
      elements.seoHubButton.setAttribute('aria-hidden', 'true');
      try { elements.seoHubButton.inert = true; } catch {}
      syncSeoClassicLink();
      return;
    }

    const label = bundle.entryLabel || getSeoUiLabel('productsLabel', 'Productos', 'Products');
    const href = getSeoHubPath();
    elements.seoHubButton.hidden = false;
    elements.seoHubButton.removeAttribute('aria-hidden');
    try { elements.seoHubButton.inert = false; } catch {}
    elements.seoHubButton.textContent = label;
    elements.seoHubButton.setAttribute('aria-label', label);
    elements.seoHubButton.setAttribute('aria-expanded', String(state.seoHubOpen));
    elements.seoHubButton.setAttribute('href', href);
    syncSeoClassicLink();
  }

  function syncSeoClassicLink() {
    if (!elements.seoClassicLink) return;
    const bundle = getSeoBundle();
    if (!bundle || !state.seoHubOpen) {
      elements.seoClassicLink.hidden = true;
      elements.seoClassicLink.setAttribute('aria-hidden', 'true');
      try { elements.seoClassicLink.inert = true; } catch {}
      return;
    }

    const href = state.seoClassicView ? getSeoModernRoutePathForState() : getSeoClassicLandingRoutePath();
    const label = state.seoClassicView
      ? getSeoUiLabel('modernViewLabel', 'Vista Moderna', 'Modern view')
      : getSeoUiLabel('classicViewLabel', 'Vista clásica', 'Classic view');
    const ariaLabel = state.seoClassicView
      ? getSeoUiLabel('modernViewAriaLabel', 'Volver a la vista moderna de productos', 'Return to the modern product view')
      : getSeoUiLabel('classicViewAriaLabel', 'Ver productos como landing page clásica', 'View products as a classic landing page');
    elements.seoClassicLink.hidden = false;
    elements.seoClassicLink.removeAttribute('aria-hidden');
    try { elements.seoClassicLink.inert = false; } catch {}
    elements.seoClassicLink.textContent = label;
    elements.seoClassicLink.setAttribute('aria-label', ariaLabel);
    elements.seoClassicLink.setAttribute('href', href);
    elements.seoClassicLink.setAttribute('aria-pressed', String(Boolean(state.seoClassicView)));
  }


  function getSeoClassicCardCategoryGroups(bundle) {
    const categories = Array.isArray(bundle?.categories) ? bundle.categories : [];
    const items = Array.isArray(bundle?.items) ? bundle.items : [];
    const categoryIds = new Set(categories.map((category) => String(category?.id || '').trim()).filter(Boolean));
    const groups = categories
      .map((category) => {
        const categoryId = String(category?.id || '').trim();
        const categoryItems = items.filter((item) => String(item?.category || '').trim() === categoryId);
        return {
          id: categoryId || 'seo-classic-category',
          label: category?.label || getSeoUiLabel('productsLabel', 'Productos', 'Products'),
          description: category?.description || '',
          items: categoryItems
        };
      })
      .filter((group) => group.items.length);

    const orphanItems = items.filter((item) => !categoryIds.has(String(item?.category || '').trim()));
    if (orphanItems.length) {
      groups.push({
        id: 'seo-classic-all-products',
        label: getSeoUiLabel('allLabel', 'Todas las soluciones', 'All solutions'),
        description: bundle?.hubLead || '',
        items: orphanItems
      });
    }

    return groups;
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

  function renderSeoClassicCategoryJumpNav(groups = []) {
    const visibleGroups = groups.filter((group) => group?.items?.length);
    if (!visibleGroups.length) return '';
    const navLabel = getSeoUiLabel('categoryNavLabel', 'Categorías de productos Hashinmy', 'Hashinmy product categories');
    const activeCategory = String(state.seoActiveCategory || '').trim();
    return `
          <nav class="hm-seo-static-page__jumpnav" aria-label="${escapeHtml(navLabel)}">
            ${visibleGroups.map((group) => {
              const count = group.items.length;
              const label = String(group.label || '').trim();
              const groupId = String(group.id || '').trim();
              const isCurrent = Boolean(activeCategory && groupId === activeCategory);
              const href = `#${getSeoClassicAnchorId(groupId)}`;
              const currentAttributes = isCurrent ? ' class="is-current" aria-current="true"' : '';
              return `<a${currentAttributes} href="${escapeHtml(href)}" data-seo-classic-category="${escapeHtml(groupId)}" aria-label="${escapeHtml(`${label}: ${count}`)}"><span>${escapeHtml(label)}</span><small>${escapeHtml(count)}</small></a>`;
            }).join('')}
          </nav>`;
  }

  function scheduleSeoClassicScroll({ preferCategory = false } = {}) {
    if (!state.seoClassicView || !elements.seoHub) return;

    window.requestAnimationFrame(() => {
      if (!state.seoClassicView || !elements.seoHub || elements.seoHub.hidden) return;
      const activeCategoryId = String(state.seoActiveCategory || '').trim();
      const targetId = preferCategory && !state.seoActiveId && activeCategoryId ? getSeoClassicAnchorId(activeCategoryId) : '';
      const target = targetId ? document.getElementById(targetId) : null;

      if (target && elements.seoHub.contains(target)) {
        target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
        return;
      }

      try {
        elements.seoHub.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        elements.seoHub.scrollTop = 0;
        elements.seoHub.scrollLeft = 0;
      }
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    });
  }

  function renderSeoClassicLandingItem(card, labels = {}) {
    if (!card) return '';
    const visibleContent = createSeoVisibleContentModel(card);
    const { quick, sections, faqs, includes, terms } = visibleContent;
    const detailLabel = labels.detailLabel || getSeoUiLabel('viewSolutionLabel', 'Ver solución', 'View solution');
    const simpleLabel = labels.simpleLabel || getSeoUiLabel('simpleLabel', 'En simple', 'In simple words');
    const whoLabel = labels.whoLabel || getSeoUiLabel('whoLabel', 'Para quién', 'Who it helps');
    const technicalLabel = labels.technicalLabel || getSeoUiLabel('technicalLabel', 'Base técnica', 'Technical base');
    const includesLabel = labels.includesLabel || getSeoUiLabel('includesLabel', 'Incluye', 'Includes');
    const glossaryLabel = labels.glossaryLabel || getSeoUiLabel('glossaryLabel', 'Palabras técnicas', 'Technical words');
    const guideLabel = labels.guideLabel || getSeoUiLabel('guideLabel', 'Guía completa', 'Complete guide');
    const faqLabel = labels.faqLabel || getSeoUiLabel('faqLabel', 'Preguntas frecuentes', 'Frequently asked questions');
    const itemId = String(card.id || '').trim();
    const solutionId = itemId ? `hmSeoClassicSolution-${escapeHtml(itemId)}` : '';
    const url = card.url || '#';

    return `
            <article class="hm-seo-static-page__solution"${solutionId ? ` id="${solutionId}"` : ''}>
              <header class="hm-seo-static-page__solution-header">
                ${card.eyebrow ? `<span class="hm-seo-static-page__eyebrow">${escapeHtml(card.eyebrow)}</span>` : ''}
                <h3><a href="${escapeHtml(url)}" data-seo-card-id="${escapeHtml(itemId)}">${escapeHtml(card.title || '')}</a></h3>
                <p class="hm-seo-static-page__solution-summary">${escapeHtml(card.summary || '')}</p>
              </header>

              <div class="hm-seo-static-page__quick hm-seo-static-page__quick--landing">
                <p><strong>${escapeHtml(simpleLabel)}:</strong> ${escapeHtml(quick.simple || card.simple || '')}</p>
                <p><strong>${escapeHtml(whoLabel)}:</strong> ${escapeHtml(quick.who || card.who || '')}</p>
                <p><strong>${escapeHtml(technicalLabel)}:</strong> ${escapeHtml(quick.technical || card.technical || '')}</p>
              </div>
              ${includes.length ? `<div class="hm-seo-static-page__line"><strong>${escapeHtml(includesLabel)}:</strong> ${includes.map((entry) => `<span>${escapeHtml(entry)}</span>`).join('')}</div>` : ''}
              ${sections.length ? `<div class="hm-seo-static-page__guide"><h4>${escapeHtml(guideLabel)}</h4><ol>${sections.map((section) => `<li><strong>${escapeHtml(section.heading)}:</strong> ${escapeHtml(section.body)}</li>`).join('')}</ol></div>` : ''}
              ${terms.length ? `<dl class="hm-seo-static-page__terms"><dt>${escapeHtml(glossaryLabel)}</dt>${terms.map((entry) => `<dd><b>${escapeHtml(entry.term)}:</b> ${escapeHtml(entry.meaning)}</dd>`).join('')}</dl>` : ''}
              ${faqs.length ? `<dl class="hm-seo-static-page__faq"><dt>${escapeHtml(faqLabel)}</dt>${faqs.map((entry) => `<dd><b>${escapeHtml(entry.question)}</b><span>${escapeHtml(entry.answer)}</span></dd>`).join('')}</dl>` : ''}
              <p class="hm-seo-static-page__solution-action"><a class="hm-seo-static-page__cta" href="${escapeHtml(url)}" data-seo-card-id="${escapeHtml(itemId)}">${escapeHtml(detailLabel)}</a></p>
            </article>`;
  }

  function renderSeoClassicContent(bundle) {
    if (!elements.seoHubDetail) return;
    const item = state.seoActiveId ? getSeoItemById(state.seoActiveId) : null;
    const title = item?.title || bundle?.hubTitle || bundle?.entryLabel || 'Hashinmy';
    const lead = item?.summary || bundle?.hubLead || '';
    const detailLabel = bundle?.openDetailLabel || getSeoUiLabel('viewSolutionLabel', 'Ver solución', 'View solution');
    const simpleLabel = getSeoUiLabel('simpleLabel', 'En simple', 'In simple words');
    const whoLabel = getSeoUiLabel('whoLabel', 'Para quién', 'Who it helps');
    const technicalLabel = getSeoUiLabel('technicalLabel', 'Base técnica', 'Technical base');
    const includesLabel = getSeoUiLabel('includesLabel', 'Incluye', 'Includes');
    const glossaryLabel = getSeoUiLabel('glossaryLabel', 'Palabras técnicas', 'Technical words');
    const guideLabel = getSeoUiLabel('guideLabel', 'Guía completa', 'Complete guide');
    const faqLabel = getSeoUiLabel('faqLabel', 'Preguntas frecuentes', 'Frequently asked questions');

    elements.seoHubDetail.hidden = false;
    elements.seoHubDetail.removeAttribute('aria-hidden');
    try { elements.seoHubDetail.inert = false; } catch {}
    elements.seoHubDetail.setAttribute('aria-label', title);

    if (!item) {
      const classicLabels = { detailLabel, simpleLabel, whoLabel, technicalLabel, includesLabel, glossaryLabel, guideLabel, faqLabel };
      const classicGroups = getSeoClassicCardCategoryGroups(bundle);
      const jumpNav = renderSeoClassicCategoryJumpNav(classicGroups);
      const groupedCategories = classicGroups.map((group) => {
        const cards = group.items.map((card) => renderSeoClassicLandingItem(card, classicLabels)).join('');
        const anchorId = getSeoClassicAnchorId(group.id);
        const isActiveClassicCategory = String(group.id || '').trim() === String(state.seoActiveCategory || '').trim();
        return `
          <article class="hm-seo-static-page__category${isActiveClassicCategory ? ' is-active' : ''}" id="${escapeHtml(anchorId)}">
            <h2>${escapeHtml(group.label || '')}</h2>
            ${group.description ? `<p>${escapeHtml(group.description)}</p>` : ''}
            <div class="hm-seo-static-page__category-list hm-seo-static-page__category-list--landing">${cards}
            </div>
          </article>`;
      }).join('');

      elements.seoHubDetail.innerHTML = `
        <section class="hm-seo-static-page hm-seo-static-page--hub" lang="${escapeHtml(bundle?.htmlLang || getSeoLanguage())}" dir="${escapeHtml(bundle?.dir || 'ltr')}" aria-label="${escapeHtml(title)}">
          <header>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(lead)}</p>
          </header>
          ${jumpNav}
          <div class="hm-seo-static-page__categories">${groupedCategories}
          </div>
        </section>`;
      return;
    }

    const backLabel = bundle?.backLabel || getSeoUiLabel('backToProductsLabel', 'Volver a productos', 'Back to products');
    const backText = `← ${String(backLabel).replace(/^←\s*/u, '')}`;
    const visibleContent = createSeoVisibleContentModel(item);
    const { quick, sections, faqs, includes, terms } = visibleContent;
    elements.seoHubDetail.innerHTML = `
      <section class="hm-seo-static-page hm-seo-static-page--detail" lang="${escapeHtml(bundle?.htmlLang || getSeoLanguage())}" dir="${escapeHtml(bundle?.dir || 'ltr')}" aria-label="${escapeHtml(title)}">
        <article class="hm-seo-static-page__final">
          <button class="hm-seo-static-page__back" type="button" data-action="seo-back" aria-label="${escapeHtml(backLabel)}">${escapeHtml(backText)}</button>
          <header class="hm-seo-static-page__hero">
            <span>${escapeHtml(item.eyebrow || bundle?.entryLabel || 'Hashinmy')}</span>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(lead)}</p>
          </header>

          <div class="hm-seo-static-page__quick">
            <p><strong>${escapeHtml(simpleLabel)}:</strong> ${escapeHtml(quick.simple || '')}</p>
            <p><strong>${escapeHtml(whoLabel)}:</strong> ${escapeHtml(quick.who || '')}</p>
            <p><strong>${escapeHtml(technicalLabel)}:</strong> ${escapeHtml(quick.technical || '')}</p>
          </div>
          ${includes.length ? `<div class="hm-seo-static-page__line"><strong>${escapeHtml(includesLabel)}:</strong> ${includes.map((entry) => `<span>${escapeHtml(entry)}</span>`).join('')}</div>` : ''}
          ${sections.length ? `<div class="hm-seo-static-page__guide"><h2>${escapeHtml(guideLabel)}</h2><ol>${sections.map((section) => `<li><strong>${escapeHtml(section.heading)}:</strong> ${escapeHtml(section.body)}</li>`).join('')}</ol></div>` : ''}
          ${terms.length ? `<dl class="hm-seo-static-page__terms"><dt>${escapeHtml(glossaryLabel)}</dt>${terms.map((entry) => `<dd><b>${escapeHtml(entry.term)}:</b> ${escapeHtml(entry.meaning)}</dd>`).join('')}</dl>` : ''}
          ${faqs.length ? `<dl class="hm-seo-static-page__faq"><dt>${escapeHtml(faqLabel)}</dt>${faqs.map((entry) => `<dd><b>${escapeHtml(entry.question)}</b><span>${escapeHtml(entry.answer)}</span></dd>`).join('')}</dl>` : ''}
        </article>
      </section>`;
  }

  function renderSeoCategories(bundle) {
    if (!elements.seoHubCategories) return;
    const detailMode = Boolean(state.seoActiveId);
    if (state.seoClassicView) {
      elements.seoHubCategories.hidden = true;
      elements.seoHubCategories.setAttribute('aria-hidden', 'true');
      try { elements.seoHubCategories.inert = true; } catch {}
      elements.seoHubCategories.innerHTML = '';
      return;
    }
    const categories = Array.isArray(bundle?.categories) ? bundle.categories : [];
    const activeCategory = state.seoActiveCategory || categories[0]?.id || '';
    elements.seoHubCategories.hidden = detailMode;
    elements.seoHubCategories.setAttribute('aria-hidden', String(detailMode));
    try { elements.seoHubCategories.inert = detailMode; } catch {}
    elements.seoHubCategories.setAttribute('role', 'tablist');
    elements.seoHubCategories.setAttribute('aria-orientation', 'horizontal');
    elements.seoHubCategories.setAttribute('aria-label', getSeoUiLabel('categoryNavLabel', 'Categorías de productos Hashinmy', 'Hashinmy product categories'));
    elements.seoHubCategories.innerHTML = categories.map((category) => {
      const isActive = category.id === activeCategory;
      return `
        <button class="hm-seo-category${isActive ? ' is-active' : ''}" id="hmSeoTab-${escapeHtml(category.id)}" type="button" role="tab" data-seo-category="${escapeHtml(category.id)}" aria-selected="${isActive ? 'true' : 'false'}" aria-controls="hmSeoHubCards" tabindex="${isActive ? '0' : '-1'}">
          <strong>${escapeHtml(category.label)}</strong>
          <span>${escapeHtml(category.description || '')}</span>
        </button>
      `;
    }).join('');
  }

  function renderSeoCards(bundle) {
    if (!elements.seoHubCards) return;
    const categories = Array.isArray(bundle?.categories) ? bundle.categories : [];
    const activeCategory = state.seoActiveCategory || categories[0]?.id || '';
    const detailMode = Boolean(state.seoActiveId);
    if (state.seoClassicView) {
      elements.seoHubCards.hidden = true;
      elements.seoHubCards.setAttribute('aria-hidden', 'true');
      try { elements.seoHubCards.inert = true; } catch {}
      elements.seoHubCards.innerHTML = '';
      return;
    }
    const items = (Array.isArray(bundle?.items) ? bundle.items : []).filter((item) => item.category === activeCategory);
    const detailLabel = bundle?.openDetailLabel || getSeoUiLabel('viewSolutionLabel', 'Abrir ficha completa', 'Open full page');

    elements.seoHubCards.setAttribute('aria-label', bundle?.cardsLabel || 'Hashinmy');
    elements.seoHubCards.setAttribute('role', 'tabpanel');
    elements.seoHubCards.setAttribute('aria-live', 'polite');
    const activeTabId = activeCategory ? `hmSeoTab-${activeCategory}` : '';
    if (activeTabId) elements.seoHubCards.setAttribute('aria-labelledby', activeTabId);
    elements.seoHubCards.hidden = detailMode;
    elements.seoHubCards.setAttribute('aria-hidden', String(detailMode));
    try { elements.seoHubCards.inert = detailMode; } catch {}
    if (detailMode) {
      elements.seoHubCards.innerHTML = '';
      return;
    }
    elements.seoHubCards.innerHTML = items.map((item) => `
      <a class="hm-seo-card" href="${escapeHtml(item.url)}" data-seo-card-id="${escapeHtml(item.id)}" role="listitem" aria-label="${escapeHtml(`${detailLabel}: ${item.title}`)}">
        <span class="hm-seo-card__eyebrow">${escapeHtml(item.eyebrow || '')}</span>
        <div class="hm-seo-card__copy">
          <strong>${escapeHtml(item.title || '')}</strong><br />
          <span>${escapeHtml(item.summary || '')}</span><br />
          <small>${escapeHtml(item.technical || '')}</small>
          <em class="hm-seo-card__cta">${escapeHtml(detailLabel)}</em>
        </div>
      </a>
    `).join('');
  }

  function renderSeoDetail(bundle) {
    if (!elements.seoHubDetail) return;
    if (state.seoClassicView) {
      renderSeoClassicContent(bundle);
      return;
    }
    const item = state.seoActiveId ? getSeoItemById(state.seoActiveId) : null;
    elements.seoHubDetail.hidden = !item;
    if (!item) {
      elements.seoHubDetail.innerHTML = '';
      return;
    }

    const backLabel = bundle?.backLabel || getSeoUiLabel('backToProductsLabel', 'Volver a productos', 'Back to products');
    const backText = `← ${String(backLabel).replace(/^←\s*/u, '')}`;
    const simpleLabel = getSeoUiLabel('simpleLabel', 'En simple', 'In simple words');
    const whoLabel = getSeoUiLabel('whoLabel', 'Para quién', 'Who it helps');
    const technicalLabel = getSeoUiLabel('technicalLabel', 'Base técnica', 'Technical base');
    const includesLabel = getSeoUiLabel('includesLabel', 'Incluye', 'Includes');
    const glossaryLabel = getSeoUiLabel('glossaryLabel', 'Palabras técnicas', 'Technical words');
    const guideLabel = getSeoUiLabel('guideLabel', 'Guía completa', 'Complete guide');
    const faqLabel = getSeoUiLabel('faqLabel', 'Preguntas frecuentes', 'Frequently asked questions');
    const visibleContent = createSeoVisibleContentModel(item);
    const { quick, sections, faqs, includes, terms } = visibleContent;

    elements.seoHubDetail.setAttribute('aria-label', bundle?.detailLabel || item.title);
    elements.seoHubDetail.innerHTML = `
      <button class="hm-seo-detail__back" type="button" data-action="seo-back" aria-label="${escapeHtml(backLabel)}">${escapeHtml(backText)}</button>
      <article class="hm-seo-detail__final" aria-label="${escapeHtml(item.title)}">
        <header class="hm-seo-detail__hero">
          <span>${escapeHtml(item.eyebrow || bundle?.entryLabel || 'Hashinmy')}</span>
          <h3>${escapeHtml(item.title || '')}</h3>
          <p>${escapeHtml(item.summary || '')}</p>
        </header>

        <div class="hm-seo-detail__quick">
          <p><strong>${escapeHtml(simpleLabel)}:</strong> ${escapeHtml(quick.simple || '')}</p>
          <p><strong>${escapeHtml(whoLabel)}:</strong> ${escapeHtml(quick.who || '')}</p>
          <p><strong>${escapeHtml(technicalLabel)}:</strong> ${escapeHtml(quick.technical || '')}</p>
        </div>

        ${includes.length ? `<div class="hm-seo-detail__line hm-seo-detail__line--includes"><strong>${escapeHtml(includesLabel)}:</strong> ${includes.map((entry) => `<span>${escapeHtml(entry)}</span>`).join('')}</div>` : ''}

        ${sections.length ? `<div class="hm-seo-detail__guide" aria-label="${escapeHtml(guideLabel)}">
          <h3>${escapeHtml(guideLabel)}</h3>
          <ol>
            ${sections.map((section) => `<li><strong>${escapeHtml(section.heading)}:</strong> ${escapeHtml(section.body)}</li>`).join('')}
          </ol>
        </div>` : ''}

        ${terms.length ? `<dl class="hm-seo-detail__terms">
          <dt>${escapeHtml(glossaryLabel)}</dt>
          ${terms.map((entry) => `<dd><b>${escapeHtml(entry.term)}:</b> ${escapeHtml(entry.meaning)}</dd>`).join('')}
        </dl>` : ''}

        ${faqs.length ? `<dl class="hm-seo-detail__faq">
          <dt>${escapeHtml(faqLabel)}</dt>
          ${faqs.map((entry) => `<dd><b>${escapeHtml(entry.question)}</b><span>${escapeHtml(entry.answer)}</span></dd>`).join('')}
        </dl>` : ''}
      </article>
    `;
  }

  function renderSeoHub() {
    if (!elements.seoHub) return;
    const bundle = getSeoBundle();
    syncSeoEntryButton();

    if (!bundle) {
      elements.seoHub.hidden = true;
      return;
    }

    const categories = Array.isArray(bundle.categories) ? bundle.categories : [];
    if (!state.seoActiveCategory || !categories.some((category) => category.id === state.seoActiveCategory)) {
      state.seoActiveCategory = categories[0]?.id || '';
    }

    const activeItem = state.seoActiveId ? getSeoItemById(state.seoActiveId) : null;
    if (state.seoActiveId && !activeItem) state.seoActiveId = '';
    if (activeItem?.category) state.seoActiveCategory = activeItem.category;

    elements.seoHub.hidden = !state.seoHubOpen;
    if (state.seoHubOpen) {
      document.body.dataset.seoHub = state.seoClassicView ? 'classic' : state.seoActiveId ? 'detail' : 'index';
    } else {
      delete document.body.dataset.seoHub;
    }
    syncSeoClassicViewChrome();
    elements.seoHub.setAttribute('lang', bundle.htmlLang || getSeoLanguage());
    elements.seoHub.setAttribute('dir', bundle.dir || 'ltr');
    if (elements.seoHubTitle) elements.seoHubTitle.textContent = activeItem ? getSeoUiLabel('detailTitle', 'Ficha técnica Hashinmy', 'Hashinmy technical page') : (bundle.hubTitle || 'Hashinmy');
    if (elements.seoHubLead) elements.seoHubLead.textContent = activeItem ? getSeoUiLabel('detailLead', 'La información completa de esta solución está dentro del panel blanco final, sin cards internas ni textos duplicados.', 'The full information for this solution is inside the final white panel, without internal cards or duplicated copy.') : (bundle.hubLead || '');
    if (elements.seoHubClose) elements.seoHubClose.setAttribute('aria-label', bundle.closeLabel || getSeoUiLabel('closeLabel', 'Cerrar', 'Close'));
    applyLocalizedSeoDomText(bundle);
    syncSeoClassicLink();

    renderSeoCategories(bundle);
    renderSeoCards(bundle);
    renderSeoDetail(bundle);
    scheduleSeoHubFitCheck('seo-render');
  }

  function selectSeoCategory(categoryId, { replaceHistory = true, focusTab = false } = {}) {
    const bundle = getSeoBundle();
    const categories = Array.isArray(bundle?.categories) ? bundle.categories : [];
    const requested = String(categoryId || '').trim();
    const nextCategory = categories.find((category) => category.id === requested) || categories[0];
    if (!nextCategory) return false;

    state.seoActiveId = '';
    state.seoActiveCategory = nextCategory.id;
    document.body.dataset.seoHub = state.seoClassicView ? 'classic' : 'index';
    renderSeoHub();
    syncLocalizedSeoLinks();
    scheduleSeoClassicScroll({ preferCategory: true });
    syncSeoRouteUrl({ replace: replaceHistory });

    if (focusTab) {
      window.setTimeout(() => {
        elements.seoHubCategories
          ?.querySelector(`[data-seo-category="${window.CSS?.escape ? CSS.escape(nextCategory.id) : nextCategory.id.replace(/\"/g, '\\"')}"]`)
          ?.focus({ preventScroll: true });
      }, 0);
    }

    return true;
  }

  function getAdjacentSeoCategoryId(currentId, step = 1) {
    const categories = Array.isArray(getSeoBundle()?.categories) ? getSeoBundle().categories : [];
    if (!categories.length) return '';
    const currentIndex = Math.max(0, categories.findIndex((category) => category.id === currentId));
    const nextIndex = (currentIndex + step + categories.length) % categories.length;
    return categories[nextIndex]?.id || categories[0].id;
  }

  function handleSeoCategoryKeydown(event) {
    const currentTab = event.target.closest('[data-seo-category]');
    if (!currentTab || !elements.seoHubCategories?.contains(currentTab)) return;

    const keyActions = {
      ArrowRight: () => getAdjacentSeoCategoryId(currentTab.dataset.seoCategory, document.dir === 'rtl' ? -1 : 1),
      ArrowDown: () => getAdjacentSeoCategoryId(currentTab.dataset.seoCategory, 1),
      ArrowLeft: () => getAdjacentSeoCategoryId(currentTab.dataset.seoCategory, document.dir === 'rtl' ? 1 : -1),
      ArrowUp: () => getAdjacentSeoCategoryId(currentTab.dataset.seoCategory, -1),
      Home: () => getSeoBundle()?.categories?.[0]?.id || '',
      End: () => getSeoBundle()?.categories?.at(-1)?.id || ''
    };

    const resolver = keyActions[event.key];
    if (!resolver) return;
    const nextCategoryId = resolver();
    if (!nextCategoryId) return;
    event.preventDefault();
    selectSeoCategory(nextCategoryId, { replaceHistory: true, focusTab: true });
  }

  function getSeoRoutePathForState() {
    const item = getSeoActiveItem();
    if (item) return normalizeSeoPath(item.url);
    return getSeoHubPath();
  }

  function getSeoModernRoutePathForState() {
    return `/?${SEO_MODERN_ROUTE_QUERY}=${encodeURIComponent(getSeoRoutePathForState())}`;
  }

  function getSeoClassicLandingRoutePath() {
    return `${getSeoHubPath()}?${SEO_VIEW_QUERY}=${encodeURIComponent(SEO_CLASSIC_VIEW_VALUE)}`;
  }

  function syncSeoRouteUrl({ replace = false } = {}) {
    if (!state.seoHubOpen || !window.history) return;
    const path = getSeoRoutePathForState();
    try {
      const url = new URL(window.location.href);
      url.pathname = path;
      url.search = '';
      if (state.seoClassicView) url.searchParams.set(SEO_VIEW_QUERY, SEO_CLASSIC_VIEW_VALUE);
      url.hash = '';
      const payload = { ...(window.history.state || {}), hmSeoHub: true, hmSeoItem: state.seoActiveId || '', hmSeoLanguage: getSeoLanguage(), hmSeoClassicView: Boolean(state.seoClassicView) };
      if (replace) window.history.replaceState(payload, '', url);
      else window.history.pushState(payload, '', url);
    } catch {}
  }

  async function openSeoHub({ itemId = '', categoryId = '', pushHistory = true, replaceHistory = false, classicView = false, preferClassicCategory = false } = {}) {
    if (state.proofWindowOpen) closeProofWindow({ focusReturn: false });
    await loadSeoContent();
    const bundle = getSeoBundle();
    if (!bundle) return false;

    const requestedItem = itemId ? getSeoItemById(itemId) : null;
    state.seoHubOpen = true;
    state.seoClassicView = Boolean(classicView);
    state.seoActiveId = requestedItem ? requestedItem.id : '';
    state.seoActiveCategory = requestedItem?.category || categoryId || state.seoActiveCategory || bundle.categories?.[0]?.id || '';
    document.body.classList.add('hm-seo-is-open');
    document.body.dataset.seoHub = state.seoClassicView ? 'classic' : state.seoActiveId ? 'detail' : 'index';
    syncSeoClassicViewChrome();
    syncSeoFullscreenMode(state.seoClassicView);
    renderSeoHub();
    syncLocalizedSeoLinks();
    scheduleSeoClassicScroll({ preferCategory: Boolean(preferClassicCategory && !state.seoActiveId && state.seoActiveCategory) });
    if (pushHistory) syncSeoRouteUrl({ replace: replaceHistory });
    window.setTimeout(() => {
      const focusTarget = state.seoClassicView
        ? (state.seoActiveId ? elements.seoHubDetail?.querySelector('[data-action="seo-back"]') : elements.seoClassicLink)
        : (state.seoActiveId ? elements.seoHubDetail?.querySelector('[data-action="seo-back"]') : elements.seoHubClose);
      focusTarget?.focus({ preventScroll: true });
    }, 0);
    return true;
  }

  function closeSeoHub({ pushHistory = true } = {}) {
    if (!state.seoHubOpen) return;
    state.seoHubOpen = false;
    state.seoClassicView = false;
    state.seoActiveId = '';
    document.body.classList.remove('hm-seo-is-open', 'hm-seo-classic-view');
    delete document.body.dataset.seoHub;
    if (elements.seoHub) {
      elements.seoHub.hidden = true;
      elements.seoHub.classList.remove('hm-seo-hub--classic');
      elements.seoHub.dataset.seoView = 'modern';
    }
    syncSeoClassicViewChrome();
    syncSeoFullscreenMode(false);
    clearSeoHubFitTimers();
    document.body.classList.remove('hm-seo-fit-compact', 'hm-seo-fit-ultra');
    delete document.body.dataset.seoFit;
    delete document.body.dataset.seoFitSource;
    syncSeoEntryButton();
    syncLocalizedSeoLinks();
    if (pushHistory && window.history) {
      try {
        const url = new URL(window.location.href);
        setLocalizedUrlPath(url, state.language);
        url.search = '';
        url.hash = '';
        window.history.pushState({ ...(window.history.state || {}), hmSeoHub: false }, '', url);
      } catch {}
    }
  }

  async function applySeoRouteFromLocation({ replaceHistory = true } = {}) {
    await loadSeoContent();
    const route = findSeoRouteByPath(getSeoRouteLookupPathFromLocation());
    if (!route) {
      if (state.seoHubOpen) closeSeoHub({ pushHistory: false });
      return false;
    }

    if (route.language && route.language !== state.language) {
      const requestToken = ++state.languageRequestToken;
      try { await applyLanguage(route.language, requestToken); } catch {}
    }

    const requestedClassicView = isSeoClassicViewRequestedFromLocation();
    await openSeoHub({
      itemId: requestedClassicView ? '' : route.item?.id || '',
      categoryId: route.item?.category || route.bundle?.categories?.[0]?.id || '',
      pushHistory: false,
      replaceHistory,
      classicView: requestedClassicView
    });
    return true;
  }

  function getCatalogMetadataForBundle(code) {
    const normalized = normalizeLanguageCode(code);
    return state.languageCatalog.find((language) => language.code === normalized)
      || fallbackLanguageCatalogItems.find((language) => language.code === normalized)
      || null;
  }

  function normalizeBundleMetadataValue(value) {
    return String(value || '').trim();
  }

  function buildTextBundleDiagnostics(code, bundle) {
    const normalized = normalizeLanguageCode(code);
    const catalogLanguage = getCatalogMetadataForBundle(normalized);
    const validDirections = new Set(['ltr', 'rtl']);
    const expectedDir = normalizeBundleMetadataValue(catalogLanguage?.dir || 'ltr').toLowerCase();
    const metadataErrors = [];

    if (!bundle || typeof bundle !== 'object') {
      metadataErrors.push('bundle vacío o inválido');
    } else {
      const bundleIso = normalizeBundleMetadataValue(bundle.iso).toLowerCase();
      const bundleName = normalizeBundleMetadataValue(bundle.name);
      const bundleNativeName = normalizeBundleMetadataValue(bundle.nativeName);
      const bundleHtmlLang = normalizeBundleMetadataValue(bundle.htmlLang);
      const bundleDir = normalizeBundleMetadataValue(bundle.dir).toLowerCase();

      if (bundleIso !== normalized) metadataErrors.push(`iso=${bundleIso || '(vacío)'}`);
      if (!bundleName) metadataErrors.push('name vacío');
      if (!bundleNativeName) metadataErrors.push('nativeName vacío');
      if (!bundleHtmlLang) metadataErrors.push('htmlLang vacío');
      if (!validDirections.has(bundleDir)) metadataErrors.push(`dir=${bundleDir || '(vacío)'}`);
      if (catalogLanguage) {
        if (bundleName !== catalogLanguage.name) metadataErrors.push(`name no coincide con catálogo`);
        if (bundleNativeName !== catalogLanguage.nativeName) metadataErrors.push(`nativeName no coincide con catálogo`);
        if (bundleHtmlLang !== catalogLanguage.htmlLang) metadataErrors.push(`htmlLang no coincide con catálogo`);
        if (bundleDir !== expectedDir) metadataErrors.push(`dir no coincide con catálogo`);
      }
    }

    const missingPaths = CRITICAL_TEXT_PATHS.filter((path) => !String(getByPath(bundle, path, '')).trim());
    const incompleteScenes = REQUIRED_TEXT_SCENES.filter((sceneName) => {
      const blueprint = baseScenes[sceneName] || {};
      const scene = bundle?.scenes?.[sceneName];
      const options = Array.isArray(scene?.options) ? scene.options : [];
      const expectedOptions = Array.isArray(blueprint.options) ? blueprint.options.length : 0;
      const hasSceneCopy = scene && typeof scene === 'object' && scene.title !== undefined && scene.copy !== undefined && scene.progress !== undefined;
      const hasOptionCopy = options.length >= expectedOptions && options.slice(0, expectedOptions).every((option) => option?.label && (option.hint || option.tech));
      return !hasSceneCopy || !hasOptionCopy;
    });

    return {
      code: normalized,
      metadataErrors,
      missingPaths,
      incompleteScenes,
      usable: metadataErrors.length === 0 && missingPaths.length === 0 && incompleteScenes.length === 0
    };
  }

  function assertLanguageMetadataConsistency(code, bundle) {
    const diagnostics = buildTextBundleDiagnostics(code, bundle);
    if (diagnostics.metadataErrors.length) {
      throw new Error(`textX/${diagnostics.code}.json tiene metadatos inconsistentes: ${diagnostics.metadataErrors.join(', ')}`);
    }
    return diagnostics;
  }

  function assertUsableTextBundle(code, bundle) {
    const diagnostics = assertLanguageMetadataConsistency(code, bundle);
    if (!diagnostics.usable) {
      throw new Error(`textX/${diagnostics.code}.json incompleto: ${[
        diagnostics.missingPaths.length ? `rutas ${diagnostics.missingPaths.join(', ')}` : '',
        diagnostics.incompleteScenes.length ? `escenas ${diagnostics.incompleteScenes.join(', ')}` : ''
      ].filter(Boolean).join(' | ')}`);
    }
    return diagnostics;
  }

  function markResolvedTextBundle(bundle, code) {
    if (bundle && typeof bundle === 'object') {
      try {
        Object.defineProperty(bundle, '__resolvedLanguage', { value: code, enumerable: false, configurable: true });
      } catch {}
    }
    return bundle;
  }

  function getResolvedTextBundleLanguage(bundle, requestedCode) {
    const resolved = bundle?.__resolvedLanguage || bundle?.iso || requestedCode || 'es';
    return normalizeLanguageCode(resolved);
  }

  function getRequestedLanguageFromUrl() {
    try {
      const url = new URL(window.location.href);
      const fromQuery = url.searchParams.get('lang') || url.searchParams.get('idioma') || url.searchParams.get('locale');
      if (fromQuery) return fromQuery;

      const pathSegments = url.pathname.split('/').filter(Boolean);
      const markerIndex = pathSegments.indexOf(LANGUAGE_PATH_PREFIX);
      if (markerIndex >= 0 && pathSegments[markerIndex + 1]) {
        const pathLanguage = resolveKnownLanguageCode(pathSegments[markerIndex + 1]);
        if (pathLanguage) return pathLanguage;
      }

      const firstSegmentLanguage = resolveKnownLanguageCode(pathSegments[0]);
      if (firstSegmentLanguage) return firstSegmentLanguage;

      const hashValue = String(url.hash || '').replace(/^#/, '');
      if (!hashValue) return '';
      const hashParams = new URLSearchParams(hashValue.includes('=') ? hashValue : `lang=${hashValue}`);
      return hashParams.get('lang') || hashParams.get('idioma') || hashParams.get('locale') || '';
    } catch {
      return '';
    }
  }

  function setLocalizedUrlPath(url, code = state.language) {
    const language = normalizeLanguageCode(code) || 'es';
    url.pathname = `/${encodeURIComponent(language)}/`;
    return url;
  }

  function collectLanguageCandidateCodes(output, value = '') {
    const exact = normalizeLanguageCandidateCode(value);
    if (isValidLanguageCandidateCode(exact)) output.push(exact);
    const primary = getPrimaryLanguageCandidateCode(exact);
    if (primary && primary !== exact && isValidLanguageCandidateCode(primary)) output.push(primary);
  }

  function getRequestedLanguageCandidateCodesFromUrl() {
    const candidates = [];
    try {
      const url = new URL(window.location.href);
      LANGUAGE_URL_KEYS.forEach((key) => collectLanguageCandidateCodes(candidates, url.searchParams.get(key) || ''));

      const pathSegments = url.pathname.split('/').filter(Boolean);
      const markerIndex = pathSegments.indexOf(LANGUAGE_PATH_PREFIX);
      if (markerIndex >= 0 && pathSegments[markerIndex + 1]) collectLanguageCandidateCodes(candidates, pathSegments[markerIndex + 1]);
      collectLanguageCandidateCodes(candidates, pathSegments[0] || '');

      const hashValue = String(url.hash || '').replace(/^#/, '');
      if (hashValue) {
        if (hashValue.includes('=')) {
          const hashParams = new URLSearchParams(hashValue);
          LANGUAGE_URL_KEYS.forEach((key) => collectLanguageCandidateCodes(candidates, hashParams.get(key) || ''));
        } else {
          collectLanguageCandidateCodes(candidates, hashValue);
        }
      }
    } catch {}
    return sortDetectedLanguageCodes(candidates);
  }

  function getEnvironmentLanguageProbeCodes() {
    const candidates = [];
    getRequestedLanguageCandidateCodesFromUrl().forEach((code) => collectLanguageCandidateCodes(candidates, code));

    try {
      const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) || '';
      collectLanguageCandidateCodes(candidates, storedLanguage);
    } catch {}

    try {
      const storedRoute = readStoredRoutePayload();
      collectLanguageCandidateCodes(candidates, storedRoute?.language || '');
    } catch {}

    (navigator.languages?.length ? navigator.languages : [navigator.language]).forEach((language) => collectLanguageCandidateCodes(candidates, language));
    collectLanguageCandidateCodes(candidates, document.documentElement?.lang || '');

    return sortDetectedLanguageCodes(candidates);
  }

  async function loadLanguageCatalogManifest() {
    try {
      const manifest = await fetchJson(`${TEXT_BASE_PATH}${TEXT_LANGUAGE_MANIFEST_FILE}`);
      const catalog = buildNormalizedLanguageCatalog(manifest.languages);
      if (!isCompleteLanguageCatalog(catalog)) throw new Error('textX/languages.json no declara idiomas usables.');
      if (manifest?.source !== 'detected-from-textX-and-textX-seo') {
        console.warn('Hashinmy: textX/languages.json no fue generado desde la intersección real textX + textX/seo; se usará solo como candidato y será verificado contra archivos reales.');
      }
      return catalog;
    } catch (error) {
      console.warn('Hashinmy: no se pudo cargar textX/languages.json; se intentará detectar desde estructura_del_proyecto.json.', error);
      return [];
    }
  }

  async function refreshLanguageCatalogFromAvailableBundles(seedCatalog = []) {
    if (state.languageCatalogRefreshPromise) return state.languageCatalogRefreshPromise;

    state.languageCatalogRefreshPromise = loadDetectedLanguageCatalogFromAvailableBundles(mergeLanguageCatalogCandidates(
      seedCatalog,
      state.languageCatalog,
      fallbackLanguageCatalog()
    ))
      .then((refreshedCatalog) => {
        if (isCompleteLanguageCatalog(refreshedCatalog)) {
          applyVerifiedLanguageCatalog(refreshedCatalog, { syncDom: true });
        }
        return refreshedCatalog;
      })
      .catch((error) => {
        console.warn('Hashinmy: no se pudo refrescar la detección automática de idiomas desde textX/textX/seo.', error);
        return [];
      })
      .finally(() => {
        state.languageCatalogRefreshPromise = null;
      });

    return state.languageCatalogRefreshPromise;
  }

  function scheduleLanguageCatalogRefresh(seedCatalog = []) {
    if (state.languageCatalogRefreshPromise) return state.languageCatalogRefreshPromise;
    state.languageCatalogRefreshPromise = new Promise((resolve) => {
      window.setTimeout(resolve, LANGUAGE_CATALOG_BACKGROUND_REFRESH_DELAY_MS);
    })
      .then(() => {
        state.languageCatalogRefreshPromise = null;
        return refreshLanguageCatalogFromAvailableBundles(seedCatalog);
      })
      .catch((error) => {
        console.warn('Hashinmy: no se pudo programar el refresco automático de idiomas.', error);
        state.languageCatalogRefreshPromise = null;
        return [];
      });
    return state.languageCatalogRefreshPromise;
  }

  async function loadLanguageCatalog() {
    const manifestCatalog = await loadLanguageCatalogManifest();
    const cachedCatalog = readCachedLanguageCatalog();
    const environmentCatalog = buildLanguageCatalogFromCodes(getEnvironmentLanguageProbeCodes());
    const metadataSources = [manifestCatalog, cachedCatalog, environmentCatalog, fallbackLanguageCatalog()].filter(isCompleteLanguageCatalog);
    const detectedCatalog = await loadDetectedLanguageCatalogFromProjectStructure(metadataSources);
    const directoryListingCatalog = await loadDetectedLanguageCatalogFromDirectoryListings(metadataSources);
    const detectedCandidateCatalog = mergeLanguageCatalogCandidates(directoryListingCatalog, detectedCatalog, ...metadataSources);

    const environmentProbeCatalog = isCompleteLanguageCatalog(environmentCatalog)
      ? await probeLanguageCatalogByAvailableBundles(environmentCatalog)
      : [];

    const bundleProbeCatalog = await loadDetectedLanguageCatalogFromAvailableBundles(detectedCandidateCatalog);
    const manifestDetectedCatalog = mergeLanguageCatalogCandidates(bundleProbeCatalog, directoryListingCatalog, detectedCatalog, manifestCatalog, environmentProbeCatalog);

    const quickCandidateCatalog = mergeLanguageCatalogCandidates(manifestDetectedCatalog, cachedCatalog);
    const quickVerifiedCatalog = await filterLanguageCatalogByAvailableBundles(quickCandidateCatalog);
    if (isCompleteLanguageCatalog(quickVerifiedCatalog)) {
      applyVerifiedLanguageCatalog(quickVerifiedCatalog);
      scheduleLanguageCatalogRefresh(detectedCandidateCatalog);
      return;
    }


    if (isCompleteLanguageCatalog(manifestDetectedCatalog)) {
      applyVerifiedLanguageCatalog(manifestDetectedCatalog);
      return;
    }

    if (isCompleteLanguageCatalog(bundleProbeCatalog)) {
      applyVerifiedLanguageCatalog(bundleProbeCatalog);
      return;
    }

    if (isCompleteLanguageCatalog(detectedCatalog)) {
      const verifiedDetectedCatalog = await filterLanguageCatalogByAvailableBundles(detectedCatalog);
      if (isCompleteLanguageCatalog(verifiedDetectedCatalog)) {
        applyVerifiedLanguageCatalog(verifiedDetectedCatalog);
        scheduleLanguageCatalogRefresh(detectedCandidateCatalog);
        return;
      }
    }

    if (isCompleteLanguageCatalog(manifestCatalog)) {
      const verifiedManifestCatalog = await filterLanguageCatalogByAvailableBundles(manifestCatalog);
      if (isCompleteLanguageCatalog(verifiedManifestCatalog)) {
        applyVerifiedLanguageCatalog(verifiedManifestCatalog);
        scheduleLanguageCatalogRefresh(detectedCandidateCatalog);
        return;
      }
    }

    const probedCatalog = await probeLanguageCatalogByAvailableBundles(mergeLanguageCatalogCandidates(
      environmentCatalog,
      cachedCatalog
    ));

    if (isCompleteLanguageCatalog(probedCatalog)) {
      applyVerifiedLanguageCatalog(probedCatalog);
      scheduleLanguageCatalogRefresh(detectedCandidateCatalog);
      return;
    }

    if (cachedCatalog) {
      const verifiedCachedCatalog = await filterLanguageCatalogByAvailableBundles(cachedCatalog);
      if (isCompleteLanguageCatalog(verifiedCachedCatalog)) {
        console.warn('Hashinmy: usando caché local validada del catálogo de idiomas.');
        applyVerifiedLanguageCatalog(verifiedCachedCatalog);
        scheduleLanguageCatalogRefresh(detectedCandidateCatalog);
        return;
      }
    }

    console.warn('Hashinmy: no se pudo cargar catálogo dinámico de idiomas.');
    setLanguageCatalog(buildLanguageCatalogFromCodes(['es']));
    scheduleLanguageCatalogRefresh(detectedCandidateCatalog);
  }


  async function loadSpanishReferenceBundle(requestingCode) {
    if (requestingCode === 'es') return null;

    try {
      return await loadTextBundle('es');
    } catch (error) {
      console.warn(`Hashinmy: textX/es.json no estuvo disponible para validar paridad de ${requestingCode}; se intentará usar el bundle autónomo validado.`, error);
      return null;
    }
  }

  async function loadTextBundle(code) {
    const normalized = normalizeLanguageCode(code);
    if (state.textCache?.has(normalized)) return state.textCache.get(normalized);

    try {
      const bundle = await fetchJson(`${TEXT_BASE_PATH}${normalized}.json`);
      if (bundle.schemaVersion && bundle.schemaVersion !== TEXT_SCHEMA_VERSION) {
        console.warn(`Hashinmy: versión de textos inesperada para ${normalized}.`);
      }

      const spanishBundle = await loadSpanishReferenceBundle(normalized);
      if (spanishBundle) assertCompleteTextBundle(normalized, bundle, spanishBundle);
      const merged = spanishBundle ? deepMerge(spanishBundle, bundle) : bundle;
      assertUsableTextBundle(normalized, merged);
      markResolvedTextBundle(merged, normalized);
      state.textCache.set(normalized, merged);
      writeCachedTextBundle(normalized, merged);
      return merged;
    } catch (error) {
      state.textCache.delete(normalized);

      const cachedBundle = readCachedTextBundle(normalized);
      if (cachedBundle) {
        console.warn(`Hashinmy: usando caché local validada para ${normalized}.`, error);
        state.textCache.set(normalized, cachedBundle);
        return cachedBundle;
      }

      if (normalized !== 'es') {
        console.warn(`Hashinmy: fallback a español para ${normalized}.`, error);
        return loadTextBundle('es');
      }
      throw error;
    }
  }

  async function applyLanguage(nextLanguage, requestToken = state.languageRequestToken) {
    const requested = normalizeLanguageCode(nextLanguage);
    const bundle = await loadTextBundle(requested);
    if (requestToken !== state.languageRequestToken) return false;

    const resolvedLanguage = getResolvedTextBundleLanguage(bundle, requested);
    state.language = resolvedLanguage;
    state.text = bundle;
    writeLanguage();
    syncStoredRouteLanguage();
    syncDocumentLanguage();
    syncLocalizedSeoLinks();
    return true;
  }

  function clonePlainData(source) {
    try {
      return JSON.parse(JSON.stringify(source || {}));
    } catch {
      return {};
    }
  }

  function decodeInlineTextPayload(node) {
    const rawPayload = String(node?.textContent || '').trim();
    if (node?.dataset?.encoding !== 'base64') return rawPayload;

    const binary = window.atob(rawPayload);
    if (typeof TextDecoder === 'function') {
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    }

    return decodeURIComponent(Array.from(binary, (character) => (
      `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`
    )).join(''));
  }

  function readInlineInitialTextBundle() {
    const node = document.getElementById('hmInitialTextBundle');
    if (!node) return null;

    try {
      const bundle = JSON.parse(decodeInlineTextPayload(node) || '{}');
      if (!bundle || typeof bundle !== 'object') return null;
      const inlineLanguage = normalizeLanguageCode(node.dataset.language || bundle.iso || bundle.htmlLang || 'es');
      return markResolvedTextBundle(clonePlainData(bundle), inlineLanguage);
    } catch (error) {
      console.warn('Hashinmy: no se pudo leer el paquete de arranque rápido.', error);
      return null;
    }
  }

  function getFastInitialTextBundle(preferredLanguage = state.language) {
    const preferred = normalizeLanguageCode(preferredLanguage);
    const preferredCachedBundle = readCachedTextBundle(preferred);
    if (preferredCachedBundle) return preferredCachedBundle;

    const inlineBundle = readInlineInitialTextBundle();
    if (inlineBundle) {
      const inlineLanguage = getResolvedTextBundleLanguage(inlineBundle, inlineBundle.iso || inlineBundle.htmlLang || 'es');
      if (inlineLanguage === preferred) return inlineBundle;
    }

    return null;
  }

  function seedInitialCriticalText(preferredLanguage = state.language) {
    const requestedLanguage = normalizeLanguageCode(preferredLanguage);
    const bundle = getFastInitialTextBundle(requestedLanguage);
    if (!bundle) return { requestedLanguage, resolvedLanguage: state.language, seeded: false };

    const resolvedLanguage = getResolvedTextBundleLanguage(bundle, requestedLanguage);
    state.language = resolvedLanguage;
    state.text = bundle;
    syncDocumentLanguage();
    return { requestedLanguage, resolvedLanguage, seeded: true };
  }

  async function hydrateInitialLanguageAfterOpen(requestedLanguage, requestToken) {
    try {
      const applied = await applyLanguage(requestedLanguage, requestToken);
      if (!applied || requestToken !== state.languageRequestToken) return false;

      render();
      publishRouteUpdate('initial-language-hydrated');
      return true;
    } catch (error) {
      if (requestToken === state.languageRequestToken) {
        console.warn(`Hashinmy: se mantuvo el texto inicial rápido mientras se reintenta el idioma ${requestedLanguage}.`, error);
      }
      return false;
    }
  }

  function getLanguageConfig(code = state.language) {
    return state.languageCatalog.find((language) => language.code === code)
      || state.languageCatalog[0]
      || { code: 'es', name: 'Spanish', nativeName: 'Español', htmlLang: 'es', dir: 'ltr' };
  }

  function getLanguageTextScript(code = state.language) {
    const normalized = normalizeLanguageCode(code);
    if (rtlScriptLanguageCodes.has(normalized)) return 'rtl';
    if (denseScriptLanguageCodes.has(normalized)) return 'dense';
    if (indicScriptLanguageCodes.has(normalized)) return 'indic';
    if (ethiopicScriptLanguageCodes.has(normalized)) return 'ethiopic';
    return 'latin';
  }

  function getActiveLanguageDomAttributes(code = state.language) {
    const language = getLanguageConfig(code);
    return {
      lang: language.htmlLang || normalizeLanguageCode(code),
      dir: language.dir === 'rtl' ? 'rtl' : 'ltr'
    };
  }

  function localizedMarkupAttributes(code = state.language) {
    const { lang, dir } = getActiveLanguageDomAttributes(code);
    return ` lang="${escapeHtml(lang)}" dir="${escapeHtml(dir)}"`;
  }

  function syncRuntimeLanguageContainers() {
    const { lang, dir } = getActiveLanguageDomAttributes();
    [
      elements.experience,
      elements.stage,
      elements.card,
      elements.decisionZone,
      elements.options,
      elements.contact,
      elements.summary,
      elements.path,
      elements.metrics,
      elements.serviceRail,
      elements.choiceOrbit,
      elements.seoHub,
      elements.seoHubCards,
      elements.seoHubDetail,
      elements.proofWindow,
      elements.proofLogoList
    ].filter(Boolean).forEach((node) => {
      node.setAttribute('lang', lang);
      node.setAttribute('dir', dir);
    });
  }

  async function readLanguage() {
    const requested = getRequestedLanguageFromUrl();
    if (requested) {
      state.language = normalizeLanguageCode(requested);
      document.documentElement.dataset.initialLanguageSource = 'url';
      return state.language;
    }

    const apiLanguage = await resolveLanguageFromMemoriaBackendVisitOpening();
    if (apiLanguage) {
      state.language = apiLanguage;
      document.documentElement.dataset.initialLanguageSource = 'memoriaBACKEND';
      return state.language;
    }

    const browserLanguage = detectBrowserLanguage();
    state.language = browserLanguage || getDefaultInitialLanguage();
    document.documentElement.dataset.initialLanguageSource = browserLanguage ? 'browser' : 'default-en';
    return state.language;
  }

  function writeLanguage() {
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, state.language); } catch {}
  }

  function syncStoredRouteLanguage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 6) return;
      if (parsed.language === state.language) return;

      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...parsed,
        language: state.language,
        updatedAt: new Date().toISOString()
      }));
    } catch {}
  }

  function syncShareableLanguageUrl(code = state.language) {
    if (!window.history?.replaceState) return;

    try {
      const language = normalizeLanguageCode(code);
      const url = new URL(window.location.href);
      LANGUAGE_URL_KEYS.forEach((key) => url.searchParams.delete(key));
      setLocalizedUrlPath(url, language);

      const hashValue = String(url.hash || '').replace(/^#/, '');
      if (hashValue.includes('=')) {
        const hashParams = new URLSearchParams(hashValue);
        let removedLanguageHash = false;
        LANGUAGE_URL_KEYS.forEach((key) => {
          if (hashParams.has(key)) {
            hashParams.delete(key);
            removedLanguageHash = true;
          }
        });
        if (removedLanguageHash) {
          const nextHash = hashParams.toString();
          url.hash = nextHash ? `#${nextHash}` : '';
        }
      } else if (resolveKnownLanguageCode(hashValue)) {
        url.hash = '';
      }

      window.history.replaceState(window.history.state, '', url);
    } catch {}
  }



  function buildPublicLanguageUrl(code = state.language) {
    const language = normalizeLanguageCode(code);
    try {
      const url = new URL(PUBLIC_SITE_URL);
      return setLocalizedUrlPath(url, language).toString();
    } catch {
      return `${PUBLIC_SITE_URL.replace(/\/$/, '')}/${encodeURIComponent(language || 'es')}/`;
    }
  }

  function syncLocalizedSeoLinks() {
    const canonical = document.querySelector('link[rel="canonical"]');
    const canonicalHref = getSeoCanonicalHref() || buildPublicLanguageUrl(state.language);
    if (canonical) canonical.setAttribute('href', canonicalHref);

    const head = document.head;
    if (!head) return;
    head.querySelectorAll('link[data-hashinmy-hreflang="runtime"], link[data-hashinmy-hreflang="static"]').forEach((node) => node.remove());

    const seoAlternates = getSeoAlternateLinks();
    const catalog = state.languageCatalog.length ? state.languageCatalog : fallbackLanguageCatalog();
    const alternates = seoAlternates || [
      { hreflang: 'x-default', href: PUBLIC_SITE_URL },
      ...catalog.map((language) => ({
        hreflang: language.htmlLang || language.code,
        href: buildPublicLanguageUrl(language.code)
      }))
    ];

    alternates.forEach(({ hreflang, href }) => {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = hreflang;
      link.href = href;
      link.dataset.hashinmyHreflang = 'runtime';
      head.appendChild(link);
    });

    syncSeoDocumentMeta();
  }

  function syncDocumentLanguage() {
    const language = getLanguageConfig();
    document.documentElement.lang = language.htmlLang;
    document.documentElement.dir = language.dir || 'ltr';
    document.documentElement.dataset.language = language.code;
    document.documentElement.dataset.textScript = getLanguageTextScript(language.code);
  }

  function getLocalizedScene(sceneName = state.scene) {
    const blueprint = baseScenes[sceneName] || baseScenes.intro;
    const textScene = currentText().scenes?.[sceneName] || currentText().scenes?.intro || {};
    const textOptions = Array.isArray(textScene.options) ? textScene.options : [];

    const localizedScene = {
      ...textScene,
      options: (blueprint.options || []).map((choice, index) => ({
        ...choice,
        ...(textOptions[index] || {})
      }))
    };

    if (sceneName === 'intro') {
      localizedScene.copy = applyLocalOriginVisibilityToIntroCopy(localizedScene.copy);
    }

    return localizedScene;
  }

  function getScene() {
    return getLocalizedScene(state.scene);
  }

  function getSceneOptions(scene) {
    return Array.isArray(scene.options) ? scene.options.slice(0, MAX_OPTIONS_PER_SCENE) : [];
  }

  function countReadableUnits(value = '') {
    return splitGraphemes(String(value || '').replace(/\s+/g, ' ').trim()).length;
  }

  function getSummaryDensityUnits() {
    if (state.scene !== 'summary') return 0;
    const recommendation = buildRecommendation();
    const summaryLabels = [
      'ui.summaryTitle',
      'ui.projectChosen',
      'ui.expectedUse',
      'ui.wantedValue',
      'ui.prioritySecurity',
      isQuoteMode() ? 'ui.paymentMode' : 'ui.financing',
      'ui.pace',
      'ui.technicalBase',
      'ui.suggestedControls',
      'ui.nextStep',
      'ui.registeredInteractions'
    ].map((pathName) => t(pathName));

    return countReadableUnits([
      ...summaryLabels,
      ...Object.values(recommendation || {}),
      ...state.audit.map(auditLine)
    ].filter(Boolean).join(' '));
  }

  function getInterfaceDensityUnits() {
    return countReadableUnits([
      t('ui.languageLabel'),
      t('ui.primaryFinance'),
      t('ui.primaryQuote'),
      t('ui.contactLabel'),
      t('ui.commentLabel'),
      t('ui.submitRoute'),
      t('ui.copySummaryAction'),
      t('ui.formNote')
    ].filter(Boolean).join(' '));
  }

  function getServiceRailDensityUnits() {
    return getServices().reduce((maxLength, service) => Math.max(
      maxLength,
      countReadableUnits(`${service?.short || ''} ${service?.label || ''}`)
    ), 0);
  }

  function getLocalizedTextDensity(scene) {
    const options = getSceneOptions(scene);
    const longestOption = options.reduce((maxLength, option) => {
      const optionText = `${option?.label || ''} ${option?.hint || option?.tech || ''}`;
      return Math.max(maxLength, countReadableUnits(optionText));
    }, 0);
    const titleLength = countReadableUnits(scene?.title || '');
    const copyLength = countReadableUnits(scene?.copy || '');
    const questionLength = countReadableUnits(scene?.optionQuestion || '');
    const summaryDensityUnits = getSummaryDensityUnits();
    const interfaceDensityUnits = getInterfaceDensityUnits();
    const serviceRailDensityUnits = getServiceRailDensityUnits();
    const textScript = getLanguageTextScript(state.language);
    const scriptFactor = textScript === 'dense' ? 1.35 : textScript === 'indic' ? 0.92 : textScript === 'ethiopic' ? 0.96 : 1;
    const densityScore = Math.max(
      titleLength * 2.1,
      copyLength * 0.38,
      longestOption * 1.7,
      questionLength * 1.45,
      summaryDensityUnits * 0.42,
      interfaceDensityUnits * 0.82,
      serviceRailDensityUnits * 1.35
    ) / scriptFactor;

    if (densityScore >= 205 || longestOption >= 126 || copyLength >= 720 || summaryDensityUnits >= 760 || interfaceDensityUnits >= 310) return 'ultra';
    if (densityScore >= 152 || longestOption >= 98 || copyLength >= 520 || summaryDensityUnits >= 560 || interfaceDensityUnits >= 230) return 'compact';
    return 'normal';
  }

  function applyLocalizedTextDensity(scene) {
    const density = getLocalizedTextDensity(scene);
    document.body.dataset.textDensity = density;
    document.body.classList.toggle('hm-text-density-compact', density === 'compact' || density === 'ultra');
    document.body.classList.toggle('hm-text-density-ultra', density === 'ultra');
  }

  function isQuoteMode() {
    return state.answers.financing === 'sin_financiacion';
  }

  function getPrimaryCtaText() {
    return isQuoteMode() ? t('ui.primaryQuote') : t('ui.primaryFinance');
  }

  function resolveNextScene(choice) {
    const requestedNext = choice?.next || 'summary';
    if (requestedNext === 'finance' && isQuoteMode()) return 'timeline';
    return requestedNext;
  }

  function getOptionQuestionText(scene) {
    return scene.optionQuestion || scene.title || t('ui.optionFallback');
  }

  function getVisibleAnswerEntries() {
    return answerOrder
      .filter((key) => state.answers[key])
      .map((key) => [key, state.answers[key]]);
  }

  function getLabels() {
    return currentText().labels || {};
  }

  function getValueLabels() {
    return currentText().valueLabels || {};
  }

  function answerLabel(key, value) {
    return getValueLabels()[value] || value || key;
  }

  function getChoiceAssignments(choice) {
    if (Array.isArray(choice.sets) && choice.sets.length) {
      return choice.sets.filter((item) => item && item.key && item.value);
    }
    return choice?.key ? [{ key: choice.key, value: choice.value }] : [];
  }

  function normalizeAssignments(assignments) {
    return (Array.isArray(assignments) ? assignments : [])
      .filter((item) => item && item.key && item.value)
      .map(({ key, value }) => `${key}:${value}`)
      .sort();
  }

  function sameAssignments(leftAssignments, rightAssignments) {
    const left = normalizeAssignments(leftAssignments);
    const right = normalizeAssignments(rightAssignments);
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
  }

  function getLocalizedAuditChoice(item) {
    if (!item || !item.step || !baseScenes[item.step]) return null;
    const scene = getLocalizedScene(item.step);
    const options = getSceneOptions(scene);
    const auditAssignments = Array.isArray(item.assignments) ? item.assignments : [];

    if (Number.isInteger(item.choiceIndex)) {
      const indexedChoice = options[item.choiceIndex];
      if (indexedChoice && sameAssignments(getChoiceAssignments(indexedChoice), auditAssignments)) {
        return indexedChoice;
      }
    }

    return options.find((choice) => sameAssignments(getChoiceAssignments(choice), auditAssignments)) || null;
  }

  function getLocalizedAuditFallback(item) {
    const assignments = Array.isArray(item?.assignments) ? item.assignments : [];
    const financingAssignment = assignments.find(({ key }) => key === 'financing');
    if (!financingAssignment || assignments.length !== 1) return item || {};

    const directQuote = financingAssignment.value === 'sin_financiacion';
    const financed = financingAssignment.value === 'financiamiento_100';
    if (!directQuote && !financed) return item || {};

    return {
      ...(item || {}),
      label: directQuote ? t('ui.primaryQuote') : t('ui.primaryFinance'),
      tech: directQuote ? t('ui.directQuoteTech') : t('ui.financeTech'),
      insight: directQuote ? t('ui.directQuoteAudit') : t('ui.financeAudit')
    };
  }

  function getLocalizedAuditEntry(item) {
    const localizedChoice = getLocalizedAuditChoice(item);
    if (localizedChoice) {
      return {
        ...(item || {}),
        label: localizedChoice.label || item?.label || '',
        tech: localizedChoice.tech || item?.tech || '',
        insight: localizedChoice.insight || item?.insight || ''
      };
    }
    return getLocalizedAuditFallback(item);
  }

  function cloneAnswers() {
    return { ...state.answers };
  }

  function cloneAudit() {
    return state.audit.map((item) => ({
      ...item,
      assignments: Array.isArray(item.assignments) ? item.assignments.map((entry) => ({ ...entry })) : []
    }));
  }

  function snapshotState() {
    return {
      scene: state.scene,
      answers: cloneAnswers(),
      audit: cloneAudit()
    };
  }

  function restoreSnapshot(snapshot) {
    if (typeof snapshot === 'string') {
      state.scene = baseScenes[snapshot] ? snapshot : 'intro';
      return;
    }

    if (!snapshot || typeof snapshot !== 'object') return;
    state.scene = baseScenes[snapshot.scene] ? snapshot.scene : 'intro';
    state.answers = snapshot.answers && typeof snapshot.answers === 'object' ? { ...snapshot.answers } : {};
    state.audit = Array.isArray(snapshot.audit) ? snapshot.audit.slice(-60) : [];
  }

  function setBusy(isBusy) {
    state.locked = isBusy;
    elements.stage?.classList.toggle('is-changing', isBusy);
    document.body.dataset.transitioning = isBusy ? 'true' : 'false';
    if (elements.stage) elements.stage.setAttribute('aria-busy', String(isBusy));
  }

  function setOptionControlsEnabled(isEnabled) {
    if (!elements.options) return;
    elements.options.querySelectorAll('[data-choice-index]').forEach((button) => {
      button.tabIndex = isEnabled ? 0 : -1;
      button.setAttribute('aria-disabled', String(!isEnabled));
    });
  }


  function shouldReduceMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  }

  function getSceneTransitionMs() {
    return shouldReduceMotion() ? REDUCED_MOTION_TRANSITION_MS : SCENE_TRANSITION_MS;
  }

  function cssTimeToMs(rawValue, fallbackMs) {
    const value = String(rawValue || '').trim();
    if (!value) return fallbackMs;

    const numericValue = Number.parseFloat(value);
    if (!Number.isFinite(numericValue)) return fallbackMs;
    if (value.endsWith('ms')) return numericValue;
    if (value.endsWith('s')) return numericValue * 1000;
    return numericValue;
  }

  function getOptionExitTransitionMs(optionCount = MAX_OPTIONS_PER_SCENE) {
    if (shouldReduceMotion()) return REDUCED_MOTION_TRANSITION_MS;

    const stageStyles = window.getComputedStyle(elements.stage || document.documentElement);
    const exitDuration = cssTimeToMs(stageStyles.getPropertyValue('--hm-option-exit-duration'), 520);
    const exitStagger = cssTimeToMs(stageStyles.getPropertyValue('--hm-option-exit-stagger'), 55);
    const visibleOptions = Math.max(1, Math.min(optionCount || 1, MAX_OPTIONS_PER_SCENE));
    const exitSafetyGap = 120;

    return Math.ceil(exitDuration + (visibleOptions - 1) * exitStagger + exitSafetyGap);
  }

  function getOptionEnterTransitionMs(optionCount = MAX_OPTIONS_PER_SCENE) {
    if (shouldReduceMotion()) return REDUCED_MOTION_TRANSITION_MS;

    const stageStyles = window.getComputedStyle(elements.stage || document.documentElement);
    const enterDuration = cssTimeToMs(stageStyles.getPropertyValue('--hm-option-enter-duration'), 720);
    const enterStagger = cssTimeToMs(stageStyles.getPropertyValue('--hm-option-stagger'), 100);
    const visibleOptions = Math.max(1, Math.min(optionCount || 1, MAX_OPTIONS_PER_SCENE));
    const enterSafetyGap = 0;

    return Math.ceil(enterDuration + (visibleOptions - 1) * enterStagger + enterSafetyGap);
  }

  function clearNarrativeTimers() {
    state.narrativeTimers.forEach((timerId) => window.clearTimeout(timerId));
    state.narrativeTimers = [];
  }

  function markNarrativeBooting() {
    document.body.classList.remove('hm-narrative-ready');
  }

  function markNarrativeReady(sceneName, token) {
    window.requestAnimationFrame(() => {
      if (token === state.typingToken && state.scene === sceneName) {
        document.body.classList.add('hm-narrative-ready');
      }
    });
  }

  function primeNarrativeLine(node, text = '') {
    if (!node) return;
    node.textContent = '';
    node.setAttribute('aria-label', String(text || ''));
    node.classList.add('hm-typing-line');
    node.classList.remove('is-complete');
    node.classList.toggle('hm-intro-title', isIntroTitleLine(node));
  }

  function scheduleNarrative(callback, delay) {
    const timerId = window.setTimeout(() => {
      state.narrativeTimers = state.narrativeTimers.filter((id) => id !== timerId);
      callback();
    }, delay);
    state.narrativeTimers.push(timerId);
    return timerId;
  }

  function isIntroTitleLine(node) {
    return node === elements.question && state.scene === 'intro';
  }

  function getCurrentTypingLocale() {
    return getLanguageConfig()?.htmlLang || state.language || document.documentElement.lang || 'es';
  }

  function splitGraphemes(text) {
    const safeText = String(text || '');
    const locale = getCurrentTypingLocale();

    try {
      if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        return Array.from(new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(safeText), ({ segment }) => segment);
      }
    } catch {}

    return Array.from(safeText).reduce((clusters, character) => {
      let isCombiningMark = false;
      try { isCombiningMark = /\p{Mark}/u.test(character); } catch {}
      if (isCombiningMark && clusters.length) {
        clusters[clusters.length - 1] += character;
      } else {
        clusters.push(character);
      }
      return clusters;
    }, []);
  }

  function splitLongSegmentForWrapping(segment) {
    if (/^\s+$/.test(segment)) return [segment];
    const graphemes = splitGraphemes(segment);
    if (graphemes.length <= 14) return [segment];

    const chunks = [];
    for (let index = 0; index < graphemes.length; index += 8) {
      chunks.push(graphemes.slice(index, index + 8).join(''));
    }
    return chunks;
  }

  function segmentTextForTyping(text) {
    const safeText = String(text || '');
    const locale = getCurrentTypingLocale();

    try {
      if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        return Array.from(new Intl.Segmenter(locale, { granularity: 'word' }).segment(safeText), ({ segment }) => segment)
          .flatMap(splitLongSegmentForWrapping)
          .filter((segment) => segment !== '');
      }
    } catch {}

    return (safeText.match(/\S+|\s+/g) || []).flatMap(splitLongSegmentForWrapping);
  }

  function appendTypewriterText(parent, text, characters) {
    const tokens = segmentTextForTyping(text);

    tokens.forEach((token) => {
      if (/^\s+$/.test(token)) {
        parent.append(document.createTextNode(token));
        return;
      }

      const word = document.createElement('span');
      word.className = 'hm-typed-word';
      splitGraphemes(token).forEach((character) => {
        const span = document.createElement('span');
        span.className = 'hm-typed-char';
        span.textContent = character;
        word.append(span);
        characters.push(span);
      });
      parent.append(word);
    });
  }

  function buildTypewriterFragment(text) {
    const fragment = document.createDocumentFragment();
    const characters = [];
    appendTypewriterText(fragment, text, characters);
    return { fragment, characters };
  }

  function buildIntroTitleFragment(text) {
    const fragment = document.createDocumentFragment();
    const rawText = String(text || '');
    const brandMatch = rawText.match(/HASHINMY/i);
    if (!brandMatch) return buildTypewriterFragment(rawText);

    const characters = [];
    const beforeBrand = rawText.slice(0, brandMatch.index).trim();
    const brand = rawText.slice(brandMatch.index, brandMatch.index + brandMatch[0].length).trim();
    const afterBrand = rawText.slice(brandMatch.index + brandMatch[0].length).trim();

    if (beforeBrand) {
      const lead = document.createElement('span');
      lead.className = 'hm-intro-title__lead';
      appendTypewriterText(lead, beforeBrand, characters);
      fragment.append(lead);
    }

    const brandNode = document.createElement('span');
    brandNode.className = 'hm-intro-title__brand';
    appendTypewriterText(brandNode, brand, characters);
    fragment.append(brandNode);

    if (afterBrand) {
      const lead = document.createElement('span');
      lead.className = 'hm-intro-title__lead hm-intro-title__lead--after';
      appendTypewriterText(lead, afterBrand, characters);
      fragment.append(lead);
    }

    return { fragment, characters };
  }

  function typeLine(node, text, speed, token, onComplete) {
    if (!node) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const safeText = String(text || '');
    const useIntroTitle = isIntroTitleLine(node);
    node.hidden = false;
    node.classList.add('hm-typing-line');
    node.classList.toggle('hm-intro-title', useIntroTitle);
    node.classList.remove('is-complete');
    node.setAttribute('aria-label', safeText);

    if (shouldReduceMotion()) {
      if (useIntroTitle) {
        const { fragment, characters } = buildIntroTitleFragment(safeText);
        characters.forEach((character) => character.classList.add('is-visible'));
        node.replaceChildren(fragment);
      } else {
        node.textContent = safeText;
      }
      node.classList.add('is-complete');
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const { fragment, characters } = useIntroTitle ? buildIntroTitleFragment(safeText) : buildTypewriterFragment(safeText);
    node.replaceChildren(fragment);

    let index = 0;
    function tick() {
      if (token !== state.typingToken) return;
      if (index < characters.length) {
        characters[index].classList.add('is-visible');
        index += 1;
        scheduleNarrative(tick, speed);
        return;
      }
      node.classList.add('is-complete');
      if (typeof onComplete === 'function') onComplete();
    }
    tick();
  }

  function getInsightText(scene) {
    const lastAudit = getLocalizedAuditEntry(state.audit[state.audit.length - 1]);
    return lastAudit?.insight || scene.insight || '';
  }

  function prepareInteractiveReveal(sceneName) {
    state.optionsReady = false;
    state.optionExitPending = false;
    document.body.dataset.optionsReady = 'false';

    elements.options?.classList.remove('is-ready', 'is-exiting', 'is-contour-ready');
    if (elements.options) {
      elements.options.hidden = true;
      elements.options.setAttribute('aria-hidden', 'true');
      setOptionControlsEnabled(false);
    }

    if (elements.optionQuestion) {
      elements.optionQuestion.hidden = true;
      elements.optionQuestion.classList.remove('is-ready');
    }

    elements.contact?.classList.remove('is-ready');
    if (elements.contact) elements.contact.hidden = true;

    if (elements.interactionWait) {
      elements.interactionWait.hidden = false;
      elements.interactionWait.textContent = sceneName === 'summary' ? t('ui.waitSummary') : t('ui.preparingOptions');
    }
  }

  function revealInteractions(sceneName, token) {
    if (token !== state.typingToken || state.scene !== sceneName) return;

    if (sceneName === 'summary') {
      state.optionsReady = true;
      document.body.dataset.optionsReady = 'true';
      if (elements.interactionWait) elements.interactionWait.hidden = true;
      if (elements.optionQuestion) elements.optionQuestion.hidden = true;
      renderSummary();
      elements.options.hidden = true;
      elements.options.setAttribute('aria-hidden', 'true');
      setOptionControlsEnabled(false);
      elements.contact.hidden = false;
      window.requestAnimationFrame(() => {
        elements.contact.classList.add('is-ready');
        scheduleResponsiveFitCheck('summary-ready');
      });
      return;
    }

    const scene = getScene();
    state.optionsReady = false;
    document.body.dataset.optionsReady = 'false';
    if (elements.interactionWait) elements.interactionWait.hidden = true;
    if (elements.optionQuestion) {
      elements.optionQuestion.textContent = getOptionQuestionText(scene);
      elements.optionQuestion.hidden = false;
      elements.optionQuestion.classList.remove('is-ready');
    }

    elements.contact.hidden = true;
    elements.options.hidden = false;
    elements.options.setAttribute('aria-hidden', 'true');
    setOptionControlsEnabled(false);
    elements.options.classList.remove('is-ready', 'is-exiting');

    window.requestAnimationFrame(() => {
      if (token !== state.typingToken || state.scene !== sceneName) return;
      elements.options.classList.add('is-contour-ready');
      if (elements.optionQuestion) elements.optionQuestion.classList.add('is-ready');

      const arrivalDelay = getOptionEnterTransitionMs(getSceneOptions(scene).length) + OPTION_TEXT_REVEAL_DELAY_AFTER_ARRIVAL_MS;
      scheduleNarrative(() => {
        if (token !== state.typingToken || state.scene !== sceneName || state.optionExitPending) return;
        state.optionsReady = true;
        document.body.dataset.optionsReady = 'true';
        elements.options.classList.remove('is-contour-ready');
        elements.options.setAttribute('aria-hidden', 'false');
        setOptionControlsEnabled(true);
        elements.options.classList.add('is-ready');
        scheduleResponsiveFitCheck('options-ready');
      }, arrivalDelay);
    });
  }

  function startSceneNarrative(scene) {
    clearNarrativeTimers();
    const token = ++state.typingToken;
    const sceneName = state.scene;
    const insightText = getInsightText(scene);
    const narrativeStartedAt = Date.now();
    const minimumInteractionDelay = shouldReduceMotion() ? REDUCED_MOTION_REVEAL_DELAY_MS : OPTION_REVEAL_DELAY_MS;

    function scheduleInteractionsAfterNarrativeComplete() {
      if (token !== state.typingToken || state.scene !== sceneName) return;
      const elapsed = Date.now() - narrativeStartedAt;
      const remainingDelay = Math.max(0, minimumInteractionDelay - elapsed);
      scheduleNarrative(() => revealInteractions(sceneName, token), remainingDelay);
    }

    markNarrativeBooting();
    prepareInteractiveReveal(sceneName);
    elements.insight.hidden = !insightText;
    primeNarrativeLine(elements.question, scene.title);
    primeNarrativeLine(elements.copy, scene.copy);
    if (insightText) primeNarrativeLine(elements.insight, insightText);
    markNarrativeReady(sceneName, token);

    typeLine(elements.question, scene.title, TYPE_TITLE_SPEED_MS, token, () => {
      typeLine(elements.copy, scene.copy, TYPE_COPY_SPEED_MS, token, () => {
        if (insightText) {
          typeLine(elements.insight, insightText, TYPE_INSIGHT_SPEED_MS, token, scheduleInteractionsAfterNarrativeComplete);
        } else {
          elements.insight.hidden = true;
          scheduleInteractionsAfterNarrativeComplete();
        }
      });
    });
  }

  function getImmersiveFullscreenElement() {
    return document.fullscreenElement
      || document.webkitFullscreenElement
      || document.msFullscreenElement
      || null;
  }

  async function exitImmersiveMode() {
    state.fullscreenRequested = false;

    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen();
        return true;
      }
      if (document.webkitFullscreenElement && typeof document.webkitExitFullscreen === 'function') {
        await document.webkitExitFullscreen();
        return true;
      }
      if (document.msFullscreenElement && typeof document.msExitFullscreen === 'function') {
        await document.msExitFullscreen();
        return true;
      }
    } catch {
      // Algunos navegadores bloquean la salida si el estado interno aún se está sincronizando; la vista clásica igualmente queda en layout web normal.
    }

    return false;
  }

  function syncSeoFullscreenMode(isClassic = Boolean(state.seoClassicView)) {
    if (isClassic) {
      exitImmersiveMode();
      return;
    }

    requestImmersiveMode().then(preserveResponsiveOrientation);
  }

  async function requestImmersiveMode() {
    if (state.seoClassicView) return;
    if (state.fullscreenRequested && getImmersiveFullscreenElement()) return;
    const fullscreenTarget = elements.stage || document.documentElement;
    state.fullscreenRequested = true;

    try {
      if (getImmersiveFullscreenElement()) return;
      if (typeof fullscreenTarget.requestFullscreen === 'function') {
        await fullscreenTarget.requestFullscreen({ navigationUI: 'hide' });
      } else if (typeof fullscreenTarget.webkitRequestFullscreen === 'function') {
        await fullscreenTarget.webkitRequestFullscreen();
      } else if (typeof fullscreenTarget.msRequestFullscreen === 'function') {
        await fullscreenTarget.msRequestFullscreen();
      }
    } catch {
      // Los navegadores suelen exigir gesto del usuario; la experiencia ya ocupa todo el viewport y reintenta en la primera interacción.
    }
  }

  async function preserveResponsiveOrientation() {
    try {
      if (screen.orientation?.unlock && (document.fullscreenElement || document.webkitFullscreenElement)) {
        screen.orientation.unlock();
      }
    } catch {}
  }

  function publishRouteUpdate(source = 'render') {
    const languageConfig = getLanguageConfig();
    const detail = {
      source,
      scene: state.scene,
      language: state.language,
      htmlLang: languageConfig.htmlLang,
      dir: languageConfig.dir || 'ltr',
      textScript: getLanguageTextScript(languageConfig.code),
      answers: cloneAnswers(),
      audit: cloneAudit(),
      recommendation: buildRecommendation(),
      updatedAt: new Date().toISOString()
    };
    state.lastPayload = detail;
    try {
      window.dispatchEvent(new CustomEvent('hashinmy:route:update', { detail }));
    } catch {}
  }

  function recordChoice(choice, choiceIndex = null) {
    const assignments = getChoiceAssignments(choice);
    if (!choice || !assignments.length) return;

    assignments.forEach(({ key, value }) => {
      state.answers[key] = value;
    });

    const auditEntry = {
      step: state.scene,
      label: choice.label,
      tech: choice.tech || '',
      insight: choice.insight || '',
      assignments,
      at: new Date().toISOString()
    };
    if (Number.isInteger(choiceIndex)) auditEntry.choiceIndex = choiceIndex;

    state.audit.push(auditEntry);
    state.audit = state.audit.slice(-60);
    writeStorage();
    publishRouteUpdate('choice');
  }

  function gotoScene(nextScene, pushHistory = true, historySnapshot = null) {
    if (!baseScenes[nextScene] || state.locked) return;
    state.optionTransitionToken += 1;
    state.optionExitPending = false;

    const snapshot = historySnapshot || snapshotState();
    if (pushHistory && state.scene !== nextScene) state.history.push(snapshot);
    document.body.dataset.transitionDirection = 'forward';
    setBusy(true);
    preloadSceneImageWindow(nextScene);

    window.setTimeout(() => {
      state.scene = nextScene;
      writeStorage();
      render();
      publishRouteUpdate('scene-change');
      setBusy(false);
      scheduleNarrative(() => { delete document.body.dataset.transitionDirection; }, 260);
    }, getSceneTransitionMs());
  }

  function goBack() {
    if (state.proofWindowOpen) {
      closeProofWindow({ focusReturn: true });
      return;
    }
    if (state.seoHubOpen) {
      closeSeoHub({ pushHistory: true });
      return;
    }
    if (state.locked || !state.history.length) return;
    state.optionTransitionToken += 1;
    state.optionExitPending = false;
    const previous = state.history.pop();
    document.body.dataset.transitionDirection = 'back';
    setBusy(true);
    const previousSceneName = typeof previous === 'string' ? previous : previous?.scene;
    if (baseScenes[previousSceneName]) preloadSceneImageWindow(previousSceneName);

    window.setTimeout(() => {
      restoreSnapshot(previous);
      writeStorage();
      render();
      publishRouteUpdate('back');
      setBusy(false);
      scheduleNarrative(() => { delete document.body.dataset.transitionDirection; }, 260);
    }, getSceneTransitionMs());
  }

  function restart() {
    if (state.proofWindowOpen) closeProofWindow({ focusReturn: false });
    if (state.seoHubOpen) closeSeoHub({ pushHistory: false });
    state.optionTransitionToken += 1;
    state.optionExitPending = false;
    state.scene = 'intro';
    state.history = [];
    state.answers = {};
    state.audit = [];
    clearStorage();
    preloadSceneImageWindow('intro');
    render();
    publishRouteUpdate('restart');
  }

  function financeNow() {
    requestImmersiveMode().then(preserveResponsiveOrientation);
    if (state.locked) {
      if (!state.pendingFinance) {
        state.pendingFinance = true;
        window.setTimeout(() => {
          state.pendingFinance = false;
          financeNow();
        }, 300);
      }
      return;
    }
    const previousSnapshot = snapshotState();
    const quoteMode = isQuoteMode();
    recordChoice({
      label: getPrimaryCtaText(),
      tech: quoteMode ? t('ui.directQuoteTech') : t('ui.financeTech'),
      insight: quoteMode ? t('ui.directQuoteAudit') : t('ui.financeAudit'),
      sets: [
        { key: 'financing', value: quoteMode ? 'sin_financiacion' : 'financiamiento_100' }
      ]
    });
    gotoScene('summary', true, previousSnapshot);
  }

  function applyLocalizedDomText() {
    document.title = t('meta.title', 'Hashinmy') || 'Hashinmy';

    document.querySelectorAll('[data-i18n-text]').forEach((node) => {
      node.textContent = t(node.dataset.i18nText);
    });

    document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
      const value = t(node.dataset.i18nAria);
      if (value) node.setAttribute('aria-label', value);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
    });

    document.querySelectorAll('[data-i18n-content]').forEach((node) => {
      node.setAttribute('content', t(node.dataset.i18nContent));
    });

    syncProofLogoLocalizedText();
  }

  function applyFinancingModeUI() {
    const ctaText = getPrimaryCtaText();
    if (elements.primaryCta) {
      elements.primaryCta.textContent = ctaText;
      elements.primaryCta.setAttribute('aria-label', ctaText);
      elements.primaryCta.hidden = state.scene === 'intro';
    }
    document.body.dataset.financeMode = isQuoteMode() ? 'quote' : 'finance';
  }

  function getServices() {
    return Array.isArray(currentText().services) ? currentText().services : [];
  }

  function getMetricsByScene(sceneName) {
    return currentText().metricsByScene?.[sceneName] || currentText().metricsByScene?.intro || [];
  }

  function getSceneAsset(sceneName) {
    const baseAsset = sceneAssets[sceneName] || sceneAssets.intro;
    const localizedAsset = currentText().sceneAssets?.[sceneName] || currentText().sceneAssets?.intro || {};
    return { ...baseAsset, ...localizedAsset };
  }

  function renderServiceRail() {
    const selectedService = state.answers.service;
    const textAttrs = localizedMarkupAttributes();
    elements.serviceRail.innerHTML = getServices().map((service) => `
      <span class="hm-service-pill${selectedService === service.value ? ' is-active' : ''}">
        <span class="hm-service-pill__icon"></span>
        <span class="hm-service-pill__text"${textAttrs}>${escapeHtml(service.short || service.label || service.value)}</span>
      </span>
    `).join('');
  }

  function renderMetrics(sceneName) {
    const metrics = getMetricsByScene(sceneName);
    const textAttrs = localizedMarkupAttributes();
    elements.metrics.innerHTML = metrics.map(([value, label]) => `
      <span class="hm-metric"><span${textAttrs}><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></span></span>
    `).join('');
  }

  function renderPath() {
    const entries = getVisibleAnswerEntries();
    const labels = getLabels();
    const textAttrs = localizedMarkupAttributes();
    const pathLabel = `<span class="hm-chip hm-chip--path-label"${textAttrs}>${escapeHtml(t('ui.pathLabel'))}</span>`;
    if (!entries.length) {
      elements.path.innerHTML = `${pathLabel}<span class="hm-chip"${textAttrs}>${escapeHtml(t('ui.pathEmpty'))}</span>`;
      return;
    }

    const decisionChips = entries.map(([key, value]) => `
      <span class="hm-chip"${textAttrs}>${escapeHtml(labels[key] || key)}: ${escapeHtml(answerLabel(key, value))}</span>
    `).join('');
    elements.path.innerHTML = `${pathLabel}${decisionChips}`;
  }

  function renderInsight(scene) {
    const text = getInsightText(scene);
    elements.insight.textContent = text;
    elements.insight.hidden = !text;
  }

  function renderOptions(scene) {
    if (state.scene === 'summary') {
      elements.options.innerHTML = '';
      return;
    }

    const textAttrs = localizedMarkupAttributes();
    elements.options.innerHTML = getSceneOptions(scene).map((choice, index) => `
      <button class="hm-option" type="button" data-choice-index="${index}" data-priority="${escapeHtml(choice.priority || '')}" aria-disabled="true" tabindex="-1" aria-label="${escapeHtml(choice.label)}${choice.hint ? `. ${escapeHtml(choice.hint)}` : ''}"${textAttrs}>
        <strong>${escapeHtml(choice.label)}</strong>
        <span>${escapeHtml(choice.hint || choice.tech || '')}</span>
      </button>
    `).join('');
  }

  function setSceneImageSource(url) {
    if (elements.sceneArtImage && elements.sceneArtImage.getAttribute('src') !== url) {
      elements.sceneArtImage.src = url;
    }
    if (elements.sceneBackdropImage && elements.sceneBackdropImage.getAttribute('src') !== url) {
      elements.sceneBackdropImage.src = url;
    }
  }

  function clearSceneImageSource() {
    if (elements.sceneArtImage) elements.sceneArtImage.removeAttribute('src');
    if (elements.sceneBackdropImage) elements.sceneBackdropImage.removeAttribute('src');
  }

  function buildSceneAssetUrl(file, forceRefresh = false) {
    const baseUrl = `${ASSET_BASE}${file}`;
    if (!forceRefresh || window.location.protocol === 'file:') return baseUrl;
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}hmAssetRetry=${Date.now()}`;
  }

  function rememberResolvedSceneImage(file, url) {
    if (!file || !url) return;
    const baseUrl = buildSceneAssetUrl(file);
    loadedImages.set(baseUrl, true);
    resolvedSceneImageUrls.set(baseUrl, url);
  }

  function rememberMissingSceneImage(file) {
    if (!file) return;
    loadedImages.set(buildSceneAssetUrl(file), false);
  }

  function hydrateInitialSceneImageState() {
    const initialAsset = sceneAssets[INITIAL_CRITICAL_SCENE_NAME] || sceneAssets.intro;
    const initialFile = initialAsset?.file;
    if (!initialFile) return;

    [elements.sceneBackdropImage, elements.sceneArtImage].filter(Boolean).forEach((image) => {
      const src = image.currentSrc || image.getAttribute('src') || '';
      if (!src) return;

      if (image.complete) {
        if (image.naturalWidth > 0) {
          rememberResolvedSceneImage(initialFile, src);
        } else {
          rememberMissingSceneImage(initialFile);
        }
        return;
      }

      image.addEventListener('load', () => {
        rememberResolvedSceneImage(initialFile, image.currentSrc || src);
      }, { once: true });
      image.addEventListener('error', () => {
        rememberMissingSceneImage(initialFile);
      }, { once: true });
    });
  }

  function applySceneImage(url) {
    setSceneImageSource(url);
    elements.sceneArt?.style.setProperty('--hm-scene-image', `url("${url}")`);
    elements.sceneArt?.classList.add('is-image-ready');
    elements.sceneBackdrop?.style.setProperty('--hm-backdrop-image', `url("${url}")`);
    elements.sceneBackdrop?.classList.add('is-image-ready');
    state.activeImageUrl = url;
  }

  function preloadSceneImage(sceneName) {
    const asset = getSceneAsset(sceneName);
    const file = asset?.file;
    if (!file) return Promise.resolve(false);

    const baseUrl = buildSceneAssetUrl(file);
    if (loadedImages.get(baseUrl) === true) return Promise.resolve(true);
    if (preloadingSceneImages.has(baseUrl)) return preloadingSceneImages.get(baseUrl);

    const preloadPromise = new Promise((resolve) => {
      const probe = new Image();
      probe.decoding = 'async';
      probe.loading = 'eager';
      probe.addEventListener('load', () => {
        loadedImages.set(baseUrl, true);
        resolvedSceneImageUrls.set(baseUrl, baseUrl);
        resolve(true);
      }, { once: true });
      probe.addEventListener('error', () => {
        loadedImages.set(baseUrl, false);
        resolve(false);
      }, { once: true });
      probe.src = baseUrl;
    }).finally(() => {
      preloadingSceneImages.delete(baseUrl);
    });

    preloadingSceneImages.set(baseUrl, preloadPromise);
    return preloadPromise;
  }

  function getPreviousSceneName() {
    const lastSnapshot = state.history[state.history.length - 1];
    if (typeof lastSnapshot === 'string') return baseScenes[lastSnapshot] ? lastSnapshot : '';
    return baseScenes[lastSnapshot?.scene] ? lastSnapshot.scene : '';
  }

  function getNextSceneNames(sceneName = state.scene) {
    const scene = getLocalizedScene(sceneName);
    return getSceneOptions(scene)
      .map((choice) => resolveNextScene(choice))
      .filter((nextScene) => baseScenes[nextScene]);
  }

  function getSceneImagePreloadWindow(sceneName = state.scene) {
    return Array.from(new Set([
      'intro',
      getPreviousSceneName(),
      sceneName,
      ...getNextSceneNames(sceneName)
    ].filter((name) => baseScenes[name])));
  }

  function getInitialSceneImagePreloadWindow(sceneName = state.scene) {
    return Array.from(new Set([
      INITIAL_CRITICAL_SCENE_NAME,
      sceneName
    ].filter((name) => baseScenes[name])));
  }

  function isInitialPageOpenForSecondaryScenePreloads() {
    return document.documentElement.dataset.appReady === 'true'
      || elements.pageLoader?.dataset.state === 'closing'
      || elements.pageLoader?.dataset.state === 'done';
  }

  function preloadSceneImageWindow(sceneName = state.scene, { includeSecondaryScenes = isInitialPageOpenForSecondaryScenePreloads() } = {}) {
    const sceneNames = includeSecondaryScenes
      ? getSceneImagePreloadWindow(sceneName)
      : getInitialSceneImagePreloadWindow(sceneName);

    sceneNames.forEach((name) => {
      preloadSceneImage(name).catch(() => {});
    });
  }

  function updateSceneArt(sceneName) {
    const asset = getSceneAsset(sceneName);
    const baseUrl = buildSceneAssetUrl(asset.file);
    const shouldRetryWithFreshUrl = loadedImages.get(baseUrl) === false;
    const url = buildSceneAssetUrl(asset.file, shouldRetryWithFreshUrl);

    elements.sceneArtLabel.textContent = asset.label || 'Hashinmy';
    elements.sceneArt.dataset.symbol = asset.symbol || 'H';
    elements.sceneArt.style.removeProperty('--hm-scene-image');
    elements.sceneArt.classList.remove('is-image-ready');

    if (elements.sceneBackdrop) {
      elements.sceneBackdropLabel.textContent = asset.label || 'Hashinmy';
      elements.sceneBackdrop.dataset.symbol = asset.symbol || 'H';
      elements.sceneBackdrop.style.removeProperty('--hm-backdrop-image');
      elements.sceneBackdrop.classList.remove('is-image-ready');
    }
    clearSceneImageSource();

    if (loadedImages.get(baseUrl) === true) {
      applySceneImage(resolvedSceneImageUrls.get(baseUrl) || baseUrl);
      preloadSceneImageWindow(sceneName);
      return;
    }

    const activePreload = preloadingSceneImages.get(baseUrl);
    if (activePreload) {
      activePreload.then((loaded) => {
        if (loaded && getSceneAsset(state.scene).file === asset.file) {
          applySceneImage(resolvedSceneImageUrls.get(baseUrl) || baseUrl);
        }
      }).finally(() => preloadSceneImageWindow(sceneName));
      return;
    }

    const probe = new Image();
    probe.decoding = 'async';
    probe.addEventListener('load', () => {
      loadedImages.set(baseUrl, true);
      resolvedSceneImageUrls.set(baseUrl, url);
      if (getSceneAsset(state.scene).file === asset.file) {
        applySceneImage(url);
      }
    }, { once: true });
    probe.addEventListener('error', () => {
      loadedImages.set(baseUrl, false);
      clearSceneImageSource();
    }, { once: true });
    probe.src = url;
    preloadSceneImageWindow(sceneName);
  }

  function renderChoiceOrbit(scene) {
    const options = getSceneOptions(scene);
    const textAttrs = localizedMarkupAttributes();
    const activeLabels = state.scene === 'summary'
      ? getVisibleAnswerEntries().slice(-3).map(([key, value]) => answerLabel(key, value))
      : options.map((choice) => choice.label);

    elements.choiceOrbit.innerHTML = activeLabels.map((label, index) => `
      <span class="hm-orbit-node hm-orbit-node--${index + 1}"${textAttrs}>${escapeHtml(label)}</span>
    `).join('');
  }

  function getRecommendationText() {
    return currentText().recommendation || {};
  }

  function buildRecommendation() {
    const answers = state.answers;
    const valueLabels = getValueLabels();
    const recommendationText = getRecommendationText();
    const defaults = recommendationText.defaults || {};
    const technicalMap = recommendationText.technicalParts || {};
    const controlMap = recommendationText.controlParts || {};
    const nextSteps = recommendationText.nextSteps || {};

    const service = valueLabels[answers.service] || defaults.service || '';
    const operation = valueLabels[answers.operation] || defaults.operation || '';
    const value = valueLabels[answers.value] || defaults.value || '';
    const risk = valueLabels[answers.risk] || defaults.risk || '';
    const financing = valueLabels[answers.financing] || defaults.financing || '';
    const timeline = valueLabels[answers.timeline] || defaults.timeline || '';

    const technicalKeys = [answers.service, answers.operation, answers.value, answers.risk].filter(Boolean);
    const technicalParts = technicalKeys.map((key) => technicalMap[key]).filter(Boolean);
    const technical = technicalParts.length ? Array.from(new Set(technicalParts)).join(' + ') : (defaults.technical || '');

    const controlParts = Array.isArray(recommendationText.controlBase) ? [...recommendationText.controlBase] : [];
    [answers.operation, answers.service, answers.value, answers.risk, answers.financing].forEach((key) => {
      if (key && controlMap[key]) controlParts.push(controlMap[key]);
    });
    const control = Array.from(new Set(controlParts)).join(' + ');
    const nextStep = !answers.service
      ? nextSteps.noService
      : answers.timeline === 'mvp_rapido'
        ? nextSteps.mvp
        : answers.timeline === 'enterprise'
          ? nextSteps.enterprise
          : nextSteps.default;

    return { service, operation, value, risk, financing, timeline, technical, control, nextStep };
  }

  function auditLine(item) {
    const localizedItem = getLocalizedAuditEntry(item);
    const labels = getLabels();
    const assignments = Array.isArray(localizedItem.assignments) ? localizedItem.assignments : [];
    const assignmentText = assignments
      .map(({ key, value }) => `${labels[key] || key}: ${answerLabel(key, value)}`)
      .join(' | ');
    const visibleLabel = localizedItem.label || t('ui.interactionFallback');
    return `- ${visibleLabel}${assignmentText ? ` — ${assignmentText}` : ''}${localizedItem.tech ? ` (${localizedItem.tech})` : ''}`;
  }

  function getClientEmail() {
    return elements.contactInfo?.value.trim() || '';
  }

  function getClientPhone() {
    return elements.contactPhone?.value.trim() || '';
  }

  function getClientName(email = getClientEmail()) {
    const localName = String(email || '').split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return localName || 'Cliente Hashinmy';
  }

  function buildContactSummaryLine(email = getClientEmail(), phone = getClientPhone()) {
    return [
      email ? `Correo electrónico: ${email}` : '',
      phone ? `WhatsApp: ${phone}` : ''
    ].filter(Boolean).join(' | ');
  }

  function buildMemoriaBackendSubmissionEntries(email = getClientEmail(), phone = getClientPhone()) {
    const recommendation = buildRecommendation();
    const comment = elements.comment?.value.trim() || '';
    const contact = buildContactSummaryLine(email, phone);
    const valuesByLabel = {
      Necesidad: comment,
      'Proyecto elegido': recommendation.service,
      'Uso esperado': recommendation.operation,
      'Valor buscado': recommendation.value,
      'Financiación': recommendation.financing,
      Ritmo: recommendation.timeline,
      'Base técnica sugerida': recommendation.technical,
      Contacto: contact
    };

    return MEMORIA_BACKEND_SUBMISSION_FIELD_LABELS.map((label) => [label, valuesByLabel[label] || '']);
  }

  function buildMemoriaBackendSubmissionText(email = getClientEmail(), phone = getClientPhone()) {
    return buildMemoriaBackendSubmissionEntries(email, phone)
      .map(([label, value]) => `${label}: ${String(value || '').trim()}`)
      .join('\n');
  }

  function buildCommercialOptionsPayload(email = getClientEmail(), phone = getClientPhone()) {
    return buildMemoriaBackendSubmissionEntries(email, phone).reduce((payload, [label, value]) => {
      payload[label] = String(value || '').trim();
      return payload;
    }, {});
  }

  function buildMemoriaBackendStrictPayload(email = getClientEmail(), phone = getClientPhone()) {
    const textoCliente = buildMemoriaBackendSubmissionText(email, phone);
    return {
      textoCliente,
      opcionesSeleccionadas: buildCommercialOptionsPayload(email, phone)
    };
  }

  function buildSummaryText(includeContact = true) {
    const recommendation = buildRecommendation();
    const email = getClientEmail();
    const phone = getClientPhone();
    const contact = buildContactSummaryLine(email, phone);
    const comment = elements.comment?.value.trim() || '';
    const auditLines = state.audit.map(auditLine);
    const paymentLine = isQuoteMode()
      ? `${t('ui.paymentMode')}: ${recommendation.financing}`
      : `${t('ui.financing')}: ${recommendation.financing}`;

    return [
      t('ui.summaryTitle'),
      '',
      `${t('ui.projectChosen')}: ${recommendation.service}`,
      `${t('ui.expectedUse')}: ${recommendation.operation}`,
      `${t('ui.wantedValue')}: ${recommendation.value}`,
      `${t('ui.prioritySecurity')}: ${recommendation.risk}`,
      paymentLine,
      `${t('ui.pace')}: ${recommendation.timeline}`,
      `${t('ui.technicalBase')}: ${recommendation.technical}`,
      `${t('ui.suggestedControls')}: ${recommendation.control}`,
      `${t('ui.nextStep')}: ${recommendation.nextStep}`,
      includeContact && contact ? `${t('ui.contact')}: ${contact}` : '',
      comment ? `${t('ui.additionalComment')}: ${comment}` : '',
      '',
      `${t('ui.registeredInteractions')}:`,
      auditLines.length ? auditLines.join('\n') : `- ${t('ui.directRouteRequested')}`
    ].filter(Boolean).join('\n');
  }

  function resetContactValidationState() {
    [elements.contactInfo, elements.contactPhone].forEach((input) => {
      if (!input) return;
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
    });
  }

  function showLocalizedContactRequired(targetInput = null) {
    const input = targetInput || (!getClientEmail() ? elements.contactInfo : elements.contactPhone) || elements.contactInfo;
    if (!input) return;
    const message = t('ui.contactRequired');
    input.setCustomValidity(message);
    input.setAttribute('aria-invalid', 'true');
    if (elements.formNote) elements.formNote.textContent = message;
    input.reportValidity();
  }

  function renderSummary() {
    if (!elements.summary) return;

    const textAttrs = localizedMarkupAttributes();
    const recommendation = buildRecommendation();
    const summaryItems = [
      [t('ui.projectChosen'), recommendation.service],
      [t('ui.expectedUse'), recommendation.operation],
      [t('ui.wantedValue'), recommendation.value],
      [t('ui.prioritySecurity'), recommendation.risk],
      [isQuoteMode() ? t('ui.paymentMode') : t('ui.financing'), recommendation.financing],
      [t('ui.pace'), recommendation.timeline],
      [t('ui.technicalBase'), recommendation.technical],
      [t('ui.nextStep'), recommendation.nextStep]
    ].filter(([, value]) => String(value || '').trim());

    elements.summary.hidden = !summaryItems.length;
    elements.summary.innerHTML = summaryItems.map(([label, value]) => `
      <article class="hm-summary-item"${textAttrs}>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </article>
    `).join('');
  }

  function renderContact(sceneName) {
    const isSummary = sceneName === 'summary';
    elements.contact.classList.remove('is-ready');
    elements.options.classList.remove('is-ready', 'is-exiting', 'is-contour-ready');
    resetContactResultState();
    elements.contact.hidden = true;
    elements.options.hidden = true;
    elements.options.setAttribute('aria-hidden', 'true');
    setOptionControlsEnabled(false);
    if (isSummary) renderSummary();
  }

  function syncLanguageSelector() {
    if (!elements.languageSelect) return;
    const languages = state.languageCatalog.length ? state.languageCatalog : fallbackLanguageCatalog();
    const activeLanguage = getLanguageConfig(state.language);

    elements.languageSelect.innerHTML = languages.map((language) => {
      const optionLabel = language.nativeName || language.name || language.code;
      const optionTitle = language.name && language.nativeName && language.name !== language.nativeName
        ? `${language.name} · ${language.nativeName}`
        : optionLabel;
      const optionDir = language.dir === 'rtl' ? 'rtl' : 'ltr';
      return `
      <option value="${escapeHtml(language.code)}" lang="${escapeHtml(language.htmlLang || language.code)}" dir="${optionDir}" title="${escapeHtml(optionTitle)}">${escapeHtml(optionLabel)}</option>`;
    }).join('');
    elements.languageSelect.value = state.language;
    elements.languageSelect.lang = activeLanguage.htmlLang || state.language;
    elements.languageSelect.dir = activeLanguage.dir || 'ltr';
    if (elements.languageWrap) {
      elements.languageWrap.lang = activeLanguage.htmlLang || state.language;
      elements.languageWrap.dir = activeLanguage.dir || 'ltr';
      elements.languageWrap.hidden = state.scene !== 'intro';
    }
  }

  function setLanguageSelectorBusy(isBusy) {
    if (!elements.languageSelect) return;
    elements.languageSelect.setAttribute('aria-busy', String(isBusy));
    elements.languageSelect.dataset.loading = isBusy ? 'true' : 'false';
  }

  async function handleLanguageChange(event) {
    const nextLanguage = normalizeLanguageCode(event.target.value);
    if (nextLanguage === state.language) return;

    const requestToken = ++state.languageRequestToken;
    setLanguageSelectorBusy(true);

    try {
      const applied = await applyLanguage(nextLanguage, requestToken);
      if (!applied) return;
      render();
      if (state.seoHubOpen) {
        if (state.seoActiveId && !getSeoItemById(state.seoActiveId)) state.seoActiveId = '';
        renderSeoHub();
        syncSeoRouteUrl({ replace: true });
      } else {
        syncShareableLanguageUrl(state.language);
      }
      publishRouteUpdate('language-change');
    } catch (error) {
      if (requestToken !== state.languageRequestToken) return;
      console.error(`Hashinmy: no se pudo aplicar el idioma ${nextLanguage}.`, error);
      syncLanguageSelector();
      if (elements.formNote) elements.formNote.textContent = t('ui.formNote');
    } finally {
      if (requestToken === state.languageRequestToken) setLanguageSelectorBusy(false);
    }
  }

  function updateProgress(sceneName) {
    const order = ['intro', 'serviceFamily', 'buildType', 'automationType', 'modernization', 'operation', 'value', 'risk', 'finance', 'timeline', 'summary'];
    const index = Math.max(0, order.indexOf(sceneName));
    const percent = Math.round((index / (order.length - 1)) * 100);
    elements.progressFill.style.width = `${percent}%`;
    elements.progressText.textContent = getScene().progress || '';
  }

  function render() {
    const scene = getScene();
    document.body.dataset.scene = state.scene;
    applyLocalizedTextDensity(scene);
    syncDocumentLanguage();
    syncRuntimeLanguageContainers();
    applyLocalizedDomText();
    syncLanguageSelector();
    syncSeoEntryButton();
    applyLocalizedSeoDomText();
    if (state.seoHubOpen) renderSeoHub();
    syncLocalizedSeoLinks();
    applyFinancingModeUI();
    const sceneAsset = getSceneAsset(state.scene);
    elements.sceneSymbol.textContent = sceneAsset.symbol || 'Hashinmy';
    elements.productCore.textContent = scene.core || 'Hashinmy';
    elements.backButton.disabled = !state.history.length;

    updateProgress(state.scene);
    preloadSceneImageWindow(state.scene);
    updateSceneArt(state.scene);
    renderServiceRail();
    renderMetrics(state.scene);
    renderPath();
    renderInsight(scene);
    renderOptions(scene);
    renderChoiceOrbit(scene);
    renderContact(state.scene);
    startSceneNarrative(scene);
    scheduleResponsiveFitCheck('render');
  }

  function handleOptionClick(event) {
    requestImmersiveMode().then(preserveResponsiveOrientation);
    const button = event.target.closest('[data-choice-index]');
    if (!button || state.locked || state.optionExitPending || !state.optionsReady) return;
    const scene = getScene();
    const choice = getSceneOptions(scene)[Number(button.dataset.choiceIndex)];
    if (!choice) return;

    const previousSnapshot = snapshotState();
    const exitToken = ++state.optionTransitionToken;
    state.optionExitPending = true;
    state.optionsReady = false;
    document.body.dataset.optionsReady = 'false';
    button.classList.add('is-selected');
    elements.options.classList.remove('is-ready');
    elements.options.classList.add('is-exiting');
    elements.options.setAttribute('aria-hidden', 'true');
    setOptionControlsEnabled(false);

    const exitDelay = getOptionExitTransitionMs(getSceneOptions(scene).length);
    window.setTimeout(() => {
      if (exitToken !== state.optionTransitionToken) return;
      state.optionExitPending = false;
      const nextScene = resolveNextScene(choice);
      recordChoice(choice, Number(button.dataset.choiceIndex));
      gotoScene(nextScene, true, previousSnapshot);
    }, exitDelay);
  }

  async function writeClipboardText(text) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function copySummary() {
    const text = buildSummaryText(false);
    const copied = await writeClipboardText(text);
    elements.formNote.textContent = copied ? t('ui.copySuccess') : t('ui.copyFailure');
    publishRouteUpdate(copied ? 'copy-summary' : 'copy-summary-failed');
  }

  function setCommercialStatusDialog(mode = 'loading', message = COMMERCIAL_LOADING_MESSAGE) {
    if (!elements.commercialStatus) return;
    elements.commercialStatus.hidden = false;
    elements.commercialStatus.classList.toggle('is-success', mode === 'success');
    elements.commercialStatus.classList.toggle('is-loading', mode !== 'success');
    if (elements.commercialStatusMessage) elements.commercialStatusMessage.textContent = message;
    if (elements.commercialProgress) elements.commercialProgress.hidden = mode === 'success';
    if (elements.commercialCheck) elements.commercialCheck.hidden = mode !== 'success';
  }

  function closeCommercialStatusDialog() {
    if (!elements.commercialStatus) return;
    elements.commercialStatus.hidden = true;
    elements.commercialStatus.classList.remove('is-success', 'is-loading');
  }

  function setContactSubmitPending(isPending) {
    if (elements.contactSubmit) elements.contactSubmit.disabled = Boolean(isPending);
    if (elements.contact) elements.contact.setAttribute('aria-busy', isPending ? 'true' : 'false');
  }

  function getMemoriaBackendCommercialHelper() {
    if (typeof window.memoriaBACKEND?.flujoComercialCotizacion === 'function') {
      return window.memoriaBACKEND.flujoComercialCotizacion.bind(window.memoriaBACKEND);
    }

    if (typeof window.memoriaBACKEND?.enviarFormulario === 'function') {
      return (payload) => window.memoriaBACKEND.enviarFormulario('cotizacion_hashinmy', {
        mensaje: payload?.textoCliente || '',
        opcionesSeleccionadas: payload?.opcionesSeleccionadas || {}
      }, {
        lead: true,
        notify: true,
        email: true,
        alias: 'principal',
        idempotencyKey: payload?.idempotencyKey
      });
    }

    return null;
  }

  function waitForMemoriaBackendCommercialHelper() {
    const helper = getMemoriaBackendCommercialHelper();
    if (helper) return Promise.resolve(helper);

    loadMemoriaBackendSdkAfterFirstRender();

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (nextHelper) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timerId);
        window.removeEventListener('memoriaBACKEND:sdk-ready', handleReady);
        resolve(nextHelper);
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener('memoriaBACKEND:sdk-ready', handleReady);
        reject(new Error('memoriaBACKEND SDK no disponible'));
      };
      const handleReady = () => {
        const readyHelper = getMemoriaBackendCommercialHelper();
        if (readyHelper) finish(readyHelper);
      };
      const timerId = window.setTimeout(fail, MEMORIA_BACKEND_COMMERCIAL_SDK_TIMEOUT_MS);
      window.addEventListener('memoriaBACKEND:sdk-ready', handleReady, { once: true });
      handleReady();
    });
  }

  function createCommercialIdempotencyKey(email, phone) {
    const randomPart = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const contactPart = `${email || 'sin-correo'}-${phone || 'sin-whatsapp'}`
      .toLowerCase()
      .replace(/[^a-z0-9_.:-]+/g, '-')
      .slice(0, 64);
    return `${COMMERCIAL_FLOW_IDEMPOTENCY_PREFIX}:${contactPart}:${randomPart}`.slice(0, 160);
  }

  function withCommercialRequestTimeout(promise) {
    return new Promise((resolve, reject) => {
      const timerId = window.setTimeout(() => reject(new Error('memoriaBACKEND no respondió dentro del tiempo seguro')), MEMORIA_BACKEND_COMMERCIAL_REQUEST_TIMEOUT_MS);
      Promise.resolve(promise)
        .then((value) => {
          window.clearTimeout(timerId);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timerId);
          reject(error);
        });
    });
  }

  function isCommercialSubmissionConfirmed(response) {
    if (!response || response.ok === 0 || response.ok === false) return false;
    if (response.quote?.id) return true;
    if (response.submission?.id) return true;
    if (response.lead?.id || response.leadId) return true;
    if (response.ownerNotification?.id || response.operation?.id) return true;
    return response.ok === 1 || response.ok === true;
  }

  async function submitCommercialFlowWithSdk({ body, email, phone }) {
    const helper = await waitForMemoriaBackendCommercialHelper();
    const idempotencyKey = createCommercialIdempotencyKey(email, phone);
    const response = await withCommercialRequestTimeout(helper({
      ...buildMemoriaBackendStrictPayload(email, phone),
      textoCliente: body,
      idempotencyKey
    }));

    if (!isCommercialSubmissionConfirmed(response)) {
      throw new Error(response?.err || 'Hashinmy no confirmó la recepción de la solicitud');
    }

    return response;
  }

  function buildSelectedOptionsText() {
    const lines = state.audit.map(auditLine).filter(Boolean);
    if (lines.length) return lines.map((line) => line.replace(/^[-•]\s*/u, '').trim()).join('; ');

    const labels = getLabels();
    const entries = getVisibleAnswerEntries().map(([key, value]) => `${labels[key] || key}: ${answerLabel(key, value)}`);
    return entries.length ? entries.join('; ') : t('ui.directRouteRequested');
  }

  function buildWhatsappFallbackMessage() {
    return buildMemoriaBackendSubmissionText();
  }

  function getWhatsappShareFallbackUrl(message) {
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  async function resolveWhatsappFallbackUrl(message, idempotencyKey) {
    const fallbackUrl = getWhatsappShareFallbackUrl(message);
    try {
      if (typeof window.memoriaBACKEND?.crearAccionWhatsapp !== 'function') return fallbackUrl;
      const response = await withCommercialRequestTimeout(window.memoriaBACKEND.crearAccionWhatsapp({
        alias: COMMERCIAL_WHATSAPP_ALIAS,
        message
      }, {
        idempotencyKey
      }));
      return response?.action?.url || fallbackUrl;
    } catch (error) {
      console.warn('Hashinmy: no se pudo resolver WhatsApp por alias de memoriaBACKEND; se usa enlace universal.', error);
      return fallbackUrl;
    }
  }

  function ensureContactResultContainer() {
    if (!elements.contact) return null;
    let result = elements.contact.querySelector('[data-commercial-result]');
    if (result) return result;

    result = document.createElement('section');
    result.className = 'hm-contact-result';
    result.dataset.commercialResult = 'true';
    result.setAttribute('role', 'status');
    result.setAttribute('aria-live', 'polite');
    elements.contact.appendChild(result);
    return result;
  }

  function resetContactResultState() {
    if (!elements.contact) return;
    delete elements.contact.dataset.submitResult;
    const result = elements.contact.querySelector('[data-commercial-result]');
    if (result) {
      result.hidden = true;
      result.innerHTML = '';
    }
  }

  function setContactResultState(mode, { title, message, whatsappUrl = '', whatsappLabel = COMMERCIAL_WHATSAPP_LABEL } = {}) {
    const result = ensureContactResultContainer();
    if (!elements.contact || !result) return;

    elements.contact.dataset.submitResult = mode;
    result.hidden = false;
    const safeTitle = escapeHtml(title || (mode === 'success' ? 'Solicitud enviada con éxito' : 'No se pudo enviar la solicitud'));
    const safeMessage = escapeHtml(message || '');
    const button = mode === 'error' && whatsappUrl
      ? `<a class="hm-button hm-button--primary hm-contact-result__whatsapp" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(whatsappLabel)}</a>`
      : '';

    result.innerHTML = `
      <div class="hm-contact-result__icon" aria-hidden="true">${mode === 'success' ? '✓' : '!'}</div>
      <strong>${safeTitle}</strong>
      <p>${safeMessage}</p>
      ${button}
    `;
  }

  async function openMailFallback(body, subject) {
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    if (mailto.length > MAILTO_MAX_SAFE_LENGTH) {
      const copied = await writeClipboardText(body);
      if (elements.formNote) elements.formNote.textContent = copied ? t('ui.copySuccess') : t('ui.mailOpening');
      publishRouteUpdate(copied ? 'submit-mailto-too-long-copy' : 'submit-mailto-too-long-copy-failed');
      if (!copied) window.location.href = mailto;
      return;
    }

    if (elements.formNote) elements.formNote.textContent = t('ui.mailOpening');
    publishRouteUpdate('submit-mailto');
    window.location.href = mailto;
  }

  async function sendRequest(event) {
    event.preventDefault();
    const email = getClientEmail();
    const phone = getClientPhone();
    const emailHasFormatError = Boolean(elements.contactInfo?.validity?.typeMismatch);
    if (!email || emailHasFormatError || !phone) {
      showLocalizedContactRequired((!email || emailHasFormatError) ? elements.contactInfo : elements.contactPhone);
      return;
    }

    resetContactValidationState();
    const body = buildMemoriaBackendSubmissionText(email, phone);
    setContactSubmitPending(true);
    setCommercialStatusDialog('loading', COMMERCIAL_LOADING_MESSAGE);

    try {
      await submitCommercialFlowWithSdk({ body, email, phone });
      closeCommercialStatusDialog();
      setContactResultState('success', {
        title: 'Solicitud enviada con éxito',
        message: 'Hashinmy confirmó que recibió tu solicitud con éxito. Revisaremos la información seleccionada y continuaremos el contacto por los datos suministrados.'
      });
      if (elements.formNote) elements.formNote.textContent = COMMERCIAL_SUCCESS_MESSAGE;
      publishRouteUpdate('submit-memoriabackend-flujo-comercial-confirmado');
    } catch (error) {
      console.warn('Hashinmy: memoriaBACKEND no confirmó la solicitud; se activa contacto directo por WhatsApp.', error);
      closeCommercialStatusDialog();
      const whatsappMessage = buildWhatsappFallbackMessage();
      const whatsappUrl = await resolveWhatsappFallbackUrl(whatsappMessage, createCommercialIdempotencyKey(email, phone));
      setContactResultState('error', {
        title: 'No se pudo confirmar el envío automático',
        message: COMMERCIAL_ERROR_MESSAGE,
        whatsappUrl
      });
      if (elements.formNote) elements.formNote.textContent = COMMERCIAL_ERROR_MESSAGE;
      publishRouteUpdate('submit-memoriabackend-error-whatsapp-fallback');
    } finally {
      setContactSubmitPending(false);
    }
  }

  function handleActionClick(event) {
    const seoCard = event.target.closest('[data-seo-card-id]');
    if (seoCard) {
      event.preventDefault();
      if (!state.seoClassicView) requestImmersiveMode().then(preserveResponsiveOrientation);
      openSeoHub({ itemId: seoCard.dataset.seoCardId, pushHistory: true, classicView: state.seoClassicView });
      return;
    }

    const seoCategory = event.target.closest('[data-seo-category]');
    if (seoCategory) {
      event.preventDefault();
      selectSeoCategory(seoCategory.dataset.seoCategory || state.seoActiveCategory, { replaceHistory: true, focusTab: false });
      return;
    }

    const seoClassicCategory = event.target.closest('[data-seo-classic-category]');
    if (seoClassicCategory && state.seoClassicView) {
      event.preventDefault();
      const selected = seoClassicCategory.dataset.seoClassicCategory || state.seoActiveCategory;
      selectSeoCategory(selected, { replaceHistory: true, focusTab: false });
      return;
    }

    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    event.preventDefault();
    const action = actionElement.dataset.action;
    if (action === 'seo-classic-toggle') {
      const nextClassicView = !state.seoClassicView;
      if (nextClassicView) exitImmersiveMode();
      else requestImmersiveMode().then(preserveResponsiveOrientation);
      openSeoHub({
        itemId: nextClassicView ? '' : state.seoActiveId,
        categoryId: state.seoActiveCategory,
        pushHistory: true,
        classicView: nextClassicView,
        preferClassicCategory: nextClassicView
      });
      return;
    }

    const shouldKeepClassicFlow = state.seoClassicView && String(action || '').startsWith('seo-');
    if (!shouldKeepClassicFlow) requestImmersiveMode().then(preserveResponsiveOrientation);
    if (action === 'finance-now') financeNow();
    if (action === 'back') goBack();
    if (action === 'restart') restart();
    if (action === 'copy-summary') copySummary();
    if (action === 'proof-open') openProofWindow();
    if (action === 'proof-close') closeProofWindow({ focusReturn: true });
    if (action === 'seo-hub') {
      openSeoHub({ pushHistory: true }).then((opened) => {
        if (!opened && actionElement.href) window.location.href = actionElement.href;
      });
      return;
    }
    if (action === 'seo-close') closeSeoHub({ pushHistory: true });
    if (action === 'seo-back') openSeoHub({ categoryId: state.seoActiveCategory, pushHistory: true, classicView: state.seoClassicView, preferClassicCategory: state.seoClassicView });
  }

  function bindElements() {
    elements.pageLoader = $('#hmPageLoader');
    elements.experience = $('#hmExperience');
    elements.stage = $('.hm-stage');
    elements.languageWrap = $('#hmLanguageSelectorWrap');
    elements.languageSelect = $('#hmLanguageSelect');
    elements.question = $('#hmQuestion');
    elements.copy = $('#hmCopy');
    elements.insight = $('#hmInsight');
    elements.path = $('#hmPath');
    elements.card = $('.hm-card');
    elements.decisionZone = $('.hm-decision-zone');
    elements.interactionWait = $('#hmInteractionWait');
    elements.optionQuestion = $('#hmOptionQuestion');
    elements.options = $('#hmOptions');
    elements.contact = $('#hmContact');
    elements.summary = $('#hmSummary');
    elements.contactInfo = $('#hmContactInfo');
    elements.contactPhone = $('#hmContactPhone');
    elements.contactSubmit = elements.contact?.querySelector('button[type="submit"]');
    elements.comment = $('#hmComment');
    elements.formNote = $('#hmFormNote');
    elements.commercialStatus = $('#hmCommercialStatus');
    elements.commercialProgress = $('#hmCommercialProgress');
    elements.commercialCheck = $('#hmCommercialCheck');
    elements.commercialStatusMessage = $('#hmCommercialStatusMessage');
    elements.serviceRail = $('#hmServiceRail');
    elements.metrics = $('#hmMetrics');
    elements.sceneSymbol = $('#hmSceneSymbol');
    elements.productCore = $('#hmProductCore');
    elements.progressFill = $('#hmProgressFill');
    elements.progressText = $('#hmProgressText');
    elements.backButton = $('#hmBackButton');
    elements.primaryCta = $('#hmPrimaryCta');
    elements.sceneArt = $('#hmSceneArt');
    elements.sceneArtImage = $('#hmSceneArtImage');
    elements.sceneArtLabel = $('#hmSceneArtLabel');
    elements.sceneBackdrop = $('#hmSceneBackdrop');
    elements.sceneBackdropImage = $('#hmSceneBackdropImage');
    elements.sceneBackdropLabel = $('#hmSceneBackdropLabel');
    elements.choiceOrbit = $('#hmChoiceOrbit');
    elements.seoHubButton = $('#hmSeoHubButton');
    elements.seoHub = $('#hmSeoHub');
    elements.seoHubSurface = $('.hm-seo-hub__surface');
    elements.seoHubTitle = $('#hmSeoHubTitle');
    elements.seoHubLead = $('#hmSeoHubLead');
    elements.seoHubCategories = $('#hmSeoHubCategories');
    elements.seoHubCards = $('#hmSeoHubCards');
    elements.seoHubDetail = $('#hmSeoHubDetail');
    elements.seoClassicLink = $('#hmSeoClassicLink');
    elements.seoHubClose = $('#hmSeoHubClose');
    elements.proofOpenButton = $('#hmProofOpenButton');
    elements.proofWindow = $('#hmProofWindow');
    elements.proofClose = $('#hmProofClose');
    elements.proofLogoList = $('#hmProofLogoList');
  }

  function createProofLogoCard(logo) {
    const item = document.createElement('li');
    item.className = 'hm-proof-logo';
    item.dataset.proofLogo = 'true';
    item.dataset.proofLogoName = logo.name;

    const figure = document.createElement('figure');
    const frame = document.createElement('span');
    frame.className = 'hm-proof-logo__frame';

    const image = document.createElement('img');
    image.src = logo.src;
    image.alt = getProofLogoAlt(logo.name);
    image.width = 320;
    image.height = 220;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.dataset.proofLogoImage = 'true';

    const fallback = document.createElement('span');
    fallback.className = 'hm-proof-logo__fallback';
    fallback.setAttribute('aria-hidden', 'true');
    const initials = document.createElement('span');
    initials.textContent = getProofLogoInitials(logo.name);
    fallback.append(initials);

    const caption = document.createElement('figcaption');
    caption.textContent = logo.name;

    frame.append(image, fallback);
    figure.append(frame, caption);
    item.append(figure);
    return item;
  }

  function createProofLogoPlaceholderCard() {
    const item = document.createElement('li');
    item.className = 'hm-proof-logo hm-proof-logo--placeholder is-logo-missing';
    item.dataset.proofLogoPlaceholder = 'true';

    const figure = document.createElement('figure');
    const frame = document.createElement('span');
    frame.className = 'hm-proof-logo__frame';

    const fallback = document.createElement('span');
    fallback.className = 'hm-proof-logo__fallback';
    fallback.setAttribute('aria-hidden', 'true');
    const initials = document.createElement('span');
    initials.textContent = 'HM';
    fallback.append(initials);

    const caption = document.createElement('figcaption');
    caption.textContent = t('ui.proofLogoPlaceholder', PROOF_LOGO_PLACEHOLDER_NAME);

    frame.append(fallback);
    figure.append(frame, caption);
    item.append(figure);
    return item;
  }

  function renderProofLogos() {
    if (!elements.proofLogoList) return;
    const logos = getProofLogos();
    elements.proofLogoList.replaceChildren(...(logos.length ? logos.map(createProofLogoCard) : [createProofLogoPlaceholderCard()]));
    hydrateProofLogos();
  }

  function syncProofLogoLocalizedText() {
    document.querySelectorAll('[data-proof-logo]').forEach((card) => {
      const name = String(card?.dataset?.proofLogoName || card?.querySelector?.('figcaption')?.textContent || '').trim();
      const image = card?.querySelector?.('[data-proof-logo-image]');
      if (image && name) image.alt = getProofLogoAlt(name);
    });

    document.querySelectorAll('[data-proof-logo-placeholder] figcaption').forEach((caption) => {
      caption.textContent = t('ui.proofLogoPlaceholder', PROOF_LOGO_PLACEHOLDER_NAME);
    });
  }

  async function loadProofLogos() {
    let manifestError = null;
    try {
      const response = await fetch(PROOF_LOGO_MANIFEST_PATH, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      const entries = Array.isArray(manifest?.logos) ? manifest.logos : Array.isArray(manifest?.items) ? manifest.items : [];
      state.proofLogos = normalizeProofLogoList(entries);
    } catch (error) {
      manifestError = error;
      state.proofLogos = [];
    }

    if (!state.proofLogos.length) {
      state.proofLogos = await loadProofLogosFromProjectStructure();
    }

    if (!state.proofLogos.length && manifestError) {
      console.warn('Hashinmy: no se pudieron detectar logos de assets/clientes; se mantiene fallback geométrico.', manifestError);
    }

    renderProofLogos();
    syncSeoStructuredData();
  }

  function hydrateProofLogos() {
    document.querySelectorAll('[data-proof-logo]').forEach((card) => {
      const image = card?.querySelector?.('[data-proof-logo-image]');
      if (!card || !image || card.dataset.proofHydrated === 'true') return;
      card.dataset.proofHydrated = 'true';

      const markLoaded = () => {
        card.classList.remove('is-logo-missing');
        card.classList.add('is-logo-loaded');
      };
      const markMissing = () => {
        card.classList.remove('is-logo-loaded');
        card.classList.add('is-logo-missing');
      };

      image.addEventListener('load', markLoaded, { once: true });
      image.addEventListener('error', markMissing, { once: true });

      if (image.complete) {
        if (image.naturalWidth > 0) markLoaded();
        else markMissing();
      }
    });
  }

  function syncProofWindowButton() {
    if (!elements.proofOpenButton) return;
    elements.proofOpenButton.setAttribute('aria-expanded', String(state.proofWindowOpen));
  }

  function openProofWindow() {
    if (!elements.proofWindow) return;
    if (state.seoHubOpen) closeSeoHub({ pushHistory: false });
    state.proofWindowOpen = true;
    elements.proofWindow.hidden = false;
    document.body.classList.add('hm-proof-is-open');
    syncProofWindowButton();
    hydrateProofLogos();
    window.setTimeout(() => {
      elements.proofClose?.focus({ preventScroll: true });
    }, 0);
  }

  function closeProofWindow({ focusReturn = true } = {}) {
    if (!state.proofWindowOpen) return;
    state.proofWindowOpen = false;
    if (elements.proofWindow) elements.proofWindow.hidden = true;
    document.body.classList.remove('hm-proof-is-open');
    syncProofWindowButton();
    if (focusReturn) {
      window.setTimeout(() => {
        elements.proofOpenButton?.focus({ preventScroll: true });
      }, 0);
    }
  }

  function hydrateBrandLogo() {
    const marks = document.querySelectorAll('[data-logo-mark], [data-intro-logo]');
    marks.forEach((mark) => {
      const source = mark?.dataset.logoSrc;
      if (!mark || !source || mark.querySelector('img')) return;

      const logo = new Image();
      logo.alt = '';
      logo.decoding = 'async';
      logo.loading = 'eager';
      logo.addEventListener('load', () => {
        mark.classList.add('has-logo-image');
        mark.appendChild(logo);
      }, { once: true });
      logo.addEventListener('error', () => {
        mark.classList.add('is-logo-fallback');
      }, { once: true });
      logo.src = source;
    });
  }

  function clearSeoHubFitTimers() {
    state.seoFitTimers.forEach((timerId) => window.clearTimeout(timerId));
    state.seoFitTimers = [];
  }

  function hasSeoUncontainedOverflow(node, severe = false) {
    if (!node) return false;
    const tolerance = severe ? 1.06 : 1;
    const extra = severe ? 2 : 2;
    try {
      const styles = window.getComputedStyle(node);
      const allowsVerticalScroll = /^(auto|scroll|overlay)$/i.test(styles.overflowY || '');
      const allowsHorizontalScroll = /^(auto|scroll|overlay)$/i.test(styles.overflowX || '');
      const hasVerticalOverflow = node.scrollHeight > node.clientHeight * tolerance + extra;
      const hasHorizontalOverflow = node.scrollWidth > node.clientWidth * (severe ? 1.03 : 1) + extra;
      return (hasVerticalOverflow && !allowsVerticalScroll) || (hasHorizontalOverflow && !allowsHorizontalScroll);
    } catch {
      return false;
    }
  }

  function syncSeoHubFit(source = 'seo-measure') {
    if (!document.body) return;
    if (!state.seoHubOpen || !elements.seoHub || elements.seoHub.hidden || state.seoClassicView) {
      document.body.classList.remove('hm-seo-fit-compact', 'hm-seo-fit-ultra');
      delete document.body.dataset.seoFit;
      delete document.body.dataset.seoFitSource;
      return;
    }

    const surface = elements.seoHubSurface || elements.seoHub.querySelector('.hm-seo-hub__surface');
    const { width, height } = getViewportMetrics();
    const measuredNodes = [surface, elements.seoHubCategories, elements.seoHubCards, elements.seoHubDetail].filter((node) => node && !node.hidden);
    let overflowRisk = width <= 920 || height <= 620;
    let severeRisk = width <= 540 || height <= 500;

    try {
      overflowRisk = overflowRisk || measuredNodes.some((node) => hasSeoUncontainedOverflow(node, false));
      severeRisk = severeRisk || measuredNodes.some((node) => hasSeoUncontainedOverflow(node, true));
    } catch {}

    document.body.classList.toggle('hm-seo-fit-compact', overflowRisk || severeRisk);
    document.body.classList.toggle('hm-seo-fit-ultra', severeRisk);
    document.body.dataset.seoFit = severeRisk ? 'ultra' : overflowRisk ? 'compact' : 'normal';
    document.body.dataset.seoFitSource = source;
  }

  function scheduleSeoHubFitCheck(source = 'seo-render') {
    clearSeoHubFitTimers();
    [0, 120, 360].forEach((delay) => {
      const timerId = window.setTimeout(() => {
        state.seoFitTimers = state.seoFitTimers.filter((id) => id !== timerId);
        syncSeoHubFit(source);
      }, delay);
      state.seoFitTimers.push(timerId);
    });
  }

  function getViewportMetrics() {
    const viewport = window.visualViewport;
    const width = Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0);
    const height = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
    return { width, height };
  }

  function clearResponsiveFitTimers() {
    state.responsiveFitTimers.forEach((timerId) => window.clearTimeout(timerId));
    state.responsiveFitTimers = [];
  }

  function syncResponsiveFit(source = 'measure') {
    if (!elements.stage || !document.body) return;

    const { width, height } = getViewportMetrics();
    const crampedByViewport = (height > 0 && height <= CRAMPED_VIEWPORT_HEIGHT_PX) || (width > 0 && width <= CRAMPED_VIEWPORT_WIDTH_PX);
    let overflowRisk = false;

    try {
      const stageRect = elements.stage.getBoundingClientRect();
      const readableTop = stageRect.top + Math.max(58, height * 0.085);
      const readableBottom = stageRect.bottom - Math.max(58, height * 0.085);
      const visibleBlocks = [elements.card, elements.decisionZone, elements.contact]
        .filter((node) => node && !node.hidden && node.getClientRects().length);
      const blockRects = visibleBlocks.map((node) => node.getBoundingClientRect());

      overflowRisk = blockRects.some((rect) => (
        rect.height > 0
        && (rect.top < readableTop - 18 || rect.bottom > readableBottom + 18)
      ));

      const interactiveHeight = blockRects.reduce((total, rect) => total + Math.max(0, rect.height), 0);
      if (!overflowRisk && width <= 700 && height > 0 && interactiveHeight > height * 1.08) {
        overflowRisk = true;
      }
    } catch {}

    const shouldCompact = crampedByViewport || overflowRisk;
    document.body.classList.toggle('hm-viewport-cramped', shouldCompact);
    document.body.dataset.viewportFit = overflowRisk ? 'risk' : crampedByViewport ? 'compact' : 'normal';
    document.body.dataset.viewportFitSource = source;
  }

  function scheduleResponsiveFitCheck(source = 'render') {
    clearResponsiveFitTimers();
    RESPONSIVE_FIT_CHECK_DELAYS_MS.forEach((delay) => {
      const timerId = window.setTimeout(() => {
        state.responsiveFitTimers = state.responsiveFitTimers.filter((id) => id !== timerId);
        syncResponsiveFit(source);
      }, delay);
      state.responsiveFitTimers.push(timerId);
    });
  }

  function setViewportHeightVariable() {
    const setValue = () => {
      const { height: viewportHeight } = getViewportMetrics();
      if (viewportHeight > 0) document.documentElement.style.setProperty('--hm-real-vh', `${viewportHeight}px`);
    };
    const refreshViewport = () => {
      setValue();
      scheduleResponsiveFitCheck('viewport');
      if (state.seoHubOpen) scheduleSeoHubFitCheck('viewport');
    };
    setValue();
    window.addEventListener('resize', refreshViewport, { passive: true });
    window.addEventListener('orientationchange', refreshViewport, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', refreshViewport, { passive: true });
      window.visualViewport.addEventListener('scroll', refreshViewport, { passive: true });
    }
  }

  function isRootOrLanguageHomePath(pathname = '/') {
    const normalized = normalizeSeoPath(pathname || '/');
    if (normalized === '/') return true;

    const catalog = state.languageCatalog.length ? state.languageCatalog : fallbackLanguageCatalog();
    return catalog.some((language) => {
      const code = normalizeLanguageCode(language.code);
      return normalized === `/${code}/` || normalized === `/${LANGUAGE_PATH_PREFIX}/${code}/`;
    });
  }

  function hasSeoRouteQueryRequest() {
    try {
      const url = new URL(window.location.href);
      return Boolean(normalizeSeoRouteQueryPath(url.searchParams.get(SEO_MODERN_ROUTE_QUERY)));
    } catch {
      return false;
    }
  }

  function shouldResolveInitialSeoRoute(pathname = getSeoRouteLookupPathFromLocation()) {
    return hasSeoRouteQueryRequest() || !isRootOrLanguageHomePath(pathname);
  }

  function warmSeoContentAfterFirstRender() {
    window.setTimeout(() => {
      loadSeoContent()
        .then(() => {
          syncLocalizedSeoLinks();
          syncSeoStructuredData();
          if (state.seoHubOpen) renderSeoHub();
        })
        .catch((error) => console.warn('Hashinmy: no se pudo precargar SEO después del primer render.', error));
    }, POST_INITIAL_BOOT_DELAY_MS);
  }

  function resolveWithTimeout(promise, timeoutMs, fallbackValue = false) {
    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(fallbackValue);
      }, timeoutMs);

      Promise.resolve(promise)
        .then((value) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve(value);
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve(fallbackValue);
        });
    });
  }

  function getAllSceneNames() {
    return Object.keys(baseScenes).filter((sceneName) => baseScenes[sceneName]);
  }

  function preloadInitialSceneImageForFastOpen(sceneName = state.scene, criticalScenePreloadPromise = null) {
    const initialSceneName = baseScenes[sceneName] ? sceneName : INITIAL_CRITICAL_SCENE_NAME;
    const criticalScenePromise = criticalScenePreloadPromise || preloadSceneImage(INITIAL_CRITICAL_SCENE_NAME);
    const activeScenePromise = initialSceneName === INITIAL_CRITICAL_SCENE_NAME
      ? criticalScenePromise
      : preloadSceneImage(initialSceneName);

    if (initialSceneName !== INITIAL_CRITICAL_SCENE_NAME) {
      criticalScenePromise.catch(() => {});
    }

    return resolveWithTimeout(
      activeScenePromise,
      INITIAL_SCENE_IMAGE_READY_TIMEOUT_MS,
      false
    );
  }

  function runAfterInitialPageOpen(callback, initialSceneReadyPromise = Promise.resolve(false), delayMs = POST_INITIAL_BOOT_DELAY_MS) {
    Promise.resolve(initialSceneReadyPromise)
      .catch(() => false)
      .finally(() => {
        window.setTimeout(callback, INITIAL_LOADER_CONFIRM_DELAY_MS + INITIAL_LOADER_EXIT_DURATION_MS + delayMs);
      });
  }

  function preloadRemainingSceneImagesAfterOpen(sceneName = state.scene) {
    const priorityScenes = getSceneImagePreloadWindow(sceneName);
    priorityScenes.forEach((name) => preloadSceneImage(name).catch(() => {}));

    const loadRest = () => {
      getAllSceneNames()
        .filter((name) => !priorityScenes.includes(name))
        .forEach((name) => preloadSceneImage(name).catch(() => {}));
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(loadRest, { timeout: 1600 });
    } else {
      window.setTimeout(loadRest, 220);
    }
  }

  function seedFastLanguageCatalog() {
    const cachedCatalog = readCachedLanguageCatalog();
    const initialCatalog = mergeLanguageCatalogCandidates(cachedCatalog, fallbackLanguageCatalog());
    setLanguageCatalog(isCompleteLanguageCatalog(initialCatalog) ? initialCatalog : buildLanguageCatalogFromCodes(['es']));
  }

  function bindRuntimeEvents() {
    requestImmersiveMode().then(preserveResponsiveOrientation);
    document.addEventListener('pointerdown', () => requestImmersiveMode().then(preserveResponsiveOrientation), { once: true, passive: true });
    document.addEventListener('keydown', () => requestImmersiveMode().then(preserveResponsiveOrientation), { once: true });
    elements.options.addEventListener('click', handleOptionClick);
    elements.contact.addEventListener('submit', sendRequest);
    elements.languageSelect?.addEventListener('change', handleLanguageChange);
    elements.seoHubCategories?.addEventListener('keydown', handleSeoCategoryKeydown);
    [elements.contactInfo, elements.contactPhone].forEach((input) => {
      input?.addEventListener('input', () => {
        resetContactValidationState();
        elements.formNote.textContent = t('ui.formNote');
      });
      input?.addEventListener('invalid', (event) => {
        event.preventDefault();
        showLocalizedContactRequired(input);
      });
    });
    document.addEventListener('click', handleActionClick);
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (state.proofWindowOpen) closeProofWindow({ focusReturn: true });
      else if (state.seoHubOpen) closeSeoHub({ pushHistory: true });
      else goBack();
    });
    window.addEventListener('popstate', () => {
      applySeoRouteFromLocation({ replaceHistory: false });
    });
  }

  function loadMemoriaBackendSdkAfterFirstRender() {
    loadMemoriaBackendSdk({ waitForReady: false });
  }

  function startPostInitialBoot({ initialSeoLookupPath = '', shouldOpenInitialSeoRoute = false, initialSceneReadyPromise = Promise.resolve(false), requestedInitialLanguage = state.language, initialLanguageRequestToken = state.languageRequestToken } = {}) {
    runAfterInitialPageOpen(() => {
      preloadRemainingSceneImagesAfterOpen(state.scene);
    }, initialSceneReadyPromise, 0);

    runAfterInitialPageOpen(() => {
      hydrateInitialLanguageAfterOpen(requestedInitialLanguage, initialLanguageRequestToken);
    }, initialSceneReadyPromise, 0);

    runAfterInitialPageOpen(() => {
      loadMemoriaBackendSdkAfterFirstRender();
    }, initialSceneReadyPromise);

    runAfterInitialPageOpen(() => {
      loadProofLogos().catch((error) => {
        console.warn('Hashinmy: no se pudieron cargar logos después del primer render.', error);
      });
    }, initialSceneReadyPromise);

    runAfterInitialPageOpen(() => {
      loadLanguageCatalog()
        .then(() => {
          syncLanguageSelector();
          syncLocalizedSeoLinks();
          if (state.seoHubOpen) renderSeoHub();
        })
        .catch((error) => console.warn('Hashinmy: no se pudo refrescar catálogo de idiomas después del primer render.', error));
    }, initialSceneReadyPromise);

    if (shouldOpenInitialSeoRoute) {
      runAfterInitialPageOpen(async () => {
        try {
          await loadSeoContent();
          const initialSeoRoute = findSeoRouteByPath(initialSeoLookupPath);
          if (!initialSeoRoute) {
            warmSeoContentAfterFirstRender();
            return;
          }

          if (initialSeoRoute.language && normalizeLanguageCode(initialSeoRoute.language) !== state.language) {
            const seoLanguageRequestToken = ++state.languageRequestToken;
            state.language = normalizeLanguageCode(initialSeoRoute.language);
            await applyLanguage(state.language, seoLanguageRequestToken);
            render();
          }

          const initialClassicView = isSeoClassicViewRequestedFromLocation();
          await openSeoHub({
            itemId: initialClassicView ? '' : initialSeoRoute.item?.id || '',
            categoryId: initialSeoRoute.item?.category || initialSeoRoute.bundle?.categories?.[0]?.id || '',
            pushHistory: false,
            replaceHistory: true,
            classicView: initialClassicView
          });
        } catch (error) {
          console.warn('Hashinmy: no se pudo resolver la ruta SEO inicial después del primer render.', error);
          warmSeoContentAfterFirstRender();
        }
      }, initialSceneReadyPromise);
    } else {
      runAfterInitialPageOpen(() => {
        warmSeoContentAfterFirstRender();
      }, initialSceneReadyPromise);
    }
  }

  function validateSceneMap() {
    Object.entries(baseScenes).forEach(([name, scene]) => {
      const options = getSceneOptions(scene);
      if (Array.isArray(scene.options) && scene.options.length > MAX_OPTIONS_PER_SCENE) {
        console.warn(`Hashinmy: la escena ${name} supera ${MAX_OPTIONS_PER_SCENE} opciones. Se renderizan solo las primeras.`);
      }
      options.forEach((choice) => {
        if (choice.next && !baseScenes[choice.next]) {
          console.warn(`Hashinmy: una opción apunta a una escena inexistente: ${choice.next}`);
        }
      });
    });
  }

  function finishInitialPageLoader(reason = 'ready') {
    const pageLoader = elements.pageLoader || $('#hmPageLoader');
    if (!pageLoader || pageLoader.dataset.state === 'done' || pageLoader.dataset.state === 'closing') return;

    pageLoader.dataset.state = 'closing';
    pageLoader.dataset.readyReason = reason;
    document.documentElement.dataset.appReady = 'true';
    if (elements.experience) elements.experience.setAttribute('aria-busy', 'false');

    window.setTimeout(() => {
      pageLoader.hidden = true;
      pageLoader.dataset.state = 'done';
      document.body?.classList.add('hm-page-ready');
    }, INITIAL_LOADER_EXIT_DURATION_MS);
  }

  function scheduleInitialPageLoaderRelease(reason = 'ready') {
    window.setTimeout(() => finishInitialPageLoader(reason), INITIAL_LOADER_CONFIRM_DELAY_MS);
  }

  async function init() {
    bindElements();
    renderProofLogos();
    validateSceneMap();
    setViewportHeightVariable();
    hydrateBrandLogo();
    hydrateProofLogos();
    hydrateInitialSceneImageState();
    syncProofWindowButton();
    seedFastLanguageCatalog();
    await readLanguage();

    const initialLanguageRequestToken = ++state.languageRequestToken;
    const initialTextSeed = seedInitialCriticalText(state.language);
    const { requestedLanguage: requestedInitialLanguage } = initialTextSeed;
    const criticalScenePreloadPromise = preloadSceneImage(INITIAL_CRITICAL_SCENE_NAME).catch(() => false);
    const initialSeoLookupPath = getSeoRouteLookupPathFromLocation();
    const shouldOpenInitialSeoRoute = shouldResolveInitialSeoRoute(initialSeoLookupPath);

    if (!initialTextSeed.seeded) {
      await applyLanguage(requestedInitialLanguage, initialLanguageRequestToken);
    }

    readStorage();

    const initialSceneReadyPromise = preloadInitialSceneImageForFastOpen(state.scene, criticalScenePreloadPromise);
    render();
    bindRuntimeEvents();
    publishRouteUpdate('init');

    initialSceneReadyPromise.finally(() => {
      scheduleInitialPageLoaderRelease('initial-scene-ready');
    });
    startPostInitialBoot({
      initialSeoLookupPath,
      shouldOpenInitialSeoRoute,
      initialSceneReadyPromise,
      requestedInitialLanguage,
      initialLanguageRequestToken
    });
  }

  function runInit() {
    init().catch((error) => {
      console.error('Hashinmy: la experiencia principal no pudo completar la inicialización.', error);
      scheduleInitialPageLoaderRelease('init-error');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit, { once: true });
  } else {
    runInit();
  }
})();
