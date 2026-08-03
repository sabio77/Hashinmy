(function createAppI18n(root) {
  'use strict';

  var DEFAULT_FALLBACK_LANGUAGE = 'es';
  var TEXT_MANIFEST_URL = './textX/languages.json';
  var STORAGE_KEY = String(root.APP_SEED_METADATA && root.APP_SEED_METADATA.cacheNamespace || 'semilla-appweb-pwa') + ':language';
  var REQUIRED_NAMESPACES = ['app', 'seo'];
  var fallbackManifest = {
    schemaVersion: 1,
    fallbackLanguage: DEFAULT_FALLBACK_LANGUAGE,
    namespaces: REQUIRED_NAMESPACES,
    languages: [
      {
        code: 'es',
        name: 'Spanish',
        nativeName: 'Español',
        dir: 'ltr',
        app: './textX/app/es.json',
        seo: './textX/seo/es.json'
      },
      {
        code: 'en',
        name: 'English',
        nativeName: 'English',
        dir: 'ltr',
        app: './textX/app/en.json',
        seo: './textX/seo/en.json'
      },
      {
        code: 'ar',
        htmlLang: 'ar',
        name: 'Arabic',
        nativeName: 'العربية',
        dir: 'rtl',
        app: './textX/app/ar.json',
        seo: './textX/seo/ar.json'
      }
    ]
  };

  var state = {
    manifest: fallbackManifest,
    language: DEFAULT_FALLBACK_LANGUAGE,
    fallbackLanguage: DEFAULT_FALLBACK_LANGUAGE,
    appText: {},
    seoText: {},
    fallbackAppText: {},
    fallbackSeoText: {},
    ready: false
  };

  function beginSkeletonScreen(target) {
    if (root.AppSkeletonScreen && typeof root.AppSkeletonScreen.begin === 'function') {
      return root.AppSkeletonScreen.begin({
        target: target || document.querySelector('.hello-card'),
        delayMs: root.AppSkeletonScreen.DEFAULT_DELAY_MS || 500
      });
    }

    return {
      end: function noop() {}
    };
  }

  function noStoreUrl(path) {
    var url = new URL(path, window.location.href);
    url.searchParams.set('__i18n', String(Date.now()));
    return url.toString();
  }

  async function fetchJson(path) {
    var response = await fetch(noStoreUrl(path), {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json,text/plain,*/*',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error('No se pudo cargar JSON: ' + path);
    }

    return response.json();
  }

  function uniqueLanguages(languages) {
    var seen = Object.create(null);
    return (Array.isArray(languages) ? languages : []).filter(function keepLanguage(language) {
      if (!language || !language.code || seen[language.code]) return false;
      seen[language.code] = true;
      return Boolean(language.app && language.seo);
    });
  }

  async function loadManifest() {
    try {
      var manifest = await fetchJson(TEXT_MANIFEST_URL);
      var languages = uniqueLanguages(manifest.languages);

      if (!languages.length) {
        throw new Error('textX/languages.json no contiene idiomas válidos.');
      }

      state.manifest = Object.assign({}, manifest, { languages: languages });
      state.fallbackLanguage = manifest.fallbackLanguage || DEFAULT_FALLBACK_LANGUAGE;
    } catch (error) {
      console.warn('[I18N] Usando manifiesto local de respaldo:', error);
      state.manifest = fallbackManifest;
      state.fallbackLanguage = DEFAULT_FALLBACK_LANGUAGE;
    }
  }

  function getLanguageByCode(code) {
    var languages = state.manifest.languages || [];
    for (var index = 0; index < languages.length; index += 1) {
      if (languages[index].code === code) return languages[index];
    }
    return null;
  }

  function getAvailableLanguages() {
    return (state.manifest.languages || []).slice();
  }

  function getBrowserLanguageCandidates() {
    var candidates = [];
    var urlLanguage = new URL(window.location.href).searchParams.get('lang');
    var storedLanguage = localStorage.getItem(STORAGE_KEY);

    if (urlLanguage) candidates.push(urlLanguage);
    if (storedLanguage) candidates.push(storedLanguage);

    if (Array.isArray(navigator.languages)) {
      candidates = candidates.concat(navigator.languages);
    }

    if (navigator.language) candidates.push(navigator.language);
    candidates.push(state.fallbackLanguage || DEFAULT_FALLBACK_LANGUAGE);

    return candidates.map(function normalizeCandidate(candidate) {
      return String(candidate || '').toLowerCase();
    }).filter(Boolean);
  }

  function resolveLanguage() {
    var languages = getAvailableLanguages();
    var availableCodes = languages.map(function toCode(language) {
      return language.code.toLowerCase();
    });
    var candidates = getBrowserLanguageCandidates();

    for (var cIndex = 0; cIndex < candidates.length; cIndex += 1) {
      var candidate = candidates[cIndex];
      var exactIndex = availableCodes.indexOf(candidate);
      if (exactIndex !== -1) return languages[exactIndex].code;

      var baseCode = candidate.split('-')[0];
      var baseIndex = availableCodes.indexOf(baseCode);
      if (baseIndex !== -1) return languages[baseIndex].code;
    }

    return state.fallbackLanguage || DEFAULT_FALLBACK_LANGUAGE;
  }

  function deepMerge(base, override) {
    var output = Array.isArray(base) ? base.slice() : Object.assign({}, base || {});
    Object.keys(override || {}).forEach(function mergeKey(key) {
      var value = override[key];
      var previous = output[key];

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        output[key] = deepMerge(previous && typeof previous === 'object' ? previous : {}, value);
      } else {
        output[key] = value;
      }
    });
    return output;
  }

  async function loadLanguageBundle(code) {
    var language = getLanguageByCode(code) || getLanguageByCode(state.fallbackLanguage) || getAvailableLanguages()[0];
    if (!language) {
      throw new Error('No hay idiomas disponibles en textX.');
    }

    var fallbackLanguage = getLanguageByCode(state.fallbackLanguage) || language;
    var fallbackApp = await fetchJson(fallbackLanguage.app);
    var fallbackSeo = await fetchJson(fallbackLanguage.seo);

    var app = fallbackApp;
    var seo = fallbackSeo;

    if (language.code !== fallbackLanguage.code) {
      try {
        app = deepMerge(fallbackApp, await fetchJson(language.app));
        seo = deepMerge(fallbackSeo, await fetchJson(language.seo));
      } catch (error) {
        console.warn('[I18N] Idioma incompleto; se usa respaldo:', error);
        language = fallbackLanguage;
      }
    }

    state.language = language.code;
    state.appText = app;
    state.seoText = seo;
    state.fallbackAppText = fallbackApp;
    state.fallbackSeoText = fallbackSeo;
    state.ready = true;

    return language.code;
  }

  function getPath(source, path) {
    return String(path || '').split('.').reduce(function walk(current, part) {
      if (!current || typeof current !== 'object') return undefined;
      return current[part];
    }, source);
  }

  function t(path, fallback) {
    var value = getPath(state.appText, path);
    if (value === undefined) value = getPath(state.seoText, path);
    if (value === undefined) value = getPath(state.fallbackAppText, path);
    if (value === undefined) value = getPath(state.fallbackSeoText, path);
    return value === undefined ? fallback || '' : String(value);
  }

  function applyDocumentLanguage() {
    var appMeta = state.appText.meta || {};
    var seoMeta = state.seoText.meta || {};
    var manifestLanguage = getLanguageByCode(state.language) || {};
    var languageCode = manifestLanguage.htmlLang || appMeta.languageCode || seoMeta.languageCode || state.language;
    var dir = manifestLanguage.dir || appMeta.dir || seoMeta.dir || 'ltr';

    document.documentElement.lang = languageCode;
    document.documentElement.dir = dir;
  }

  function setMeta(name, content) {
    if (!content) return;

    var selector = 'meta[name="' + name + '"]';
    var meta = document.head.querySelector(selector);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  }

  function applySeo() {
    var title = t('seo.title', 'Semilla App Web');
    var description = t('seo.description', 'Semilla robusta de app web instalable y autoactualizable.');
    var applicationName = t('seo.applicationName', 'Semilla App');
    var appleTitle = t('seo.appleMobileWebAppTitle', applicationName);

    document.title = title;
    setMeta('description', description);
    setMeta('application-name', applicationName);
    setMeta('apple-mobile-web-app-title', appleTitle);
  }

  function applyTextNodes(rootNode) {
    var scope = rootNode || document;
    var textNodes = scope.querySelectorAll('[data-i18n]');

    Array.prototype.forEach.call(textNodes, function applyText(node) {
      var key = node.getAttribute('data-i18n');
      var value = t(key, node.textContent);
      node.textContent = value;
    });

    var attrNodes = scope.querySelectorAll('[data-i18n-attr]');
    Array.prototype.forEach.call(attrNodes, function applyAttributes(node) {
      var definitions = String(node.getAttribute('data-i18n-attr') || '').split(';');
      definitions.forEach(function applyDefinition(definition) {
        var parts = definition.split(':');
        var attr = parts[0] && parts[0].trim();
        var key = parts[1] && parts[1].trim();
        if (!attr || !key) return;
        node.setAttribute(attr, t(key, node.getAttribute(attr) || ''));
      });
    });
  }

  function populateLanguageSelector() {
    var selector = document.querySelector('[data-language-selector]');
    if (!selector) return;

    selector.innerHTML = '';
    selector.setAttribute('aria-label', t('language.selectorLabel', 'Idioma'));
    selector.setAttribute('title', t('language.selectorTitle', 'Cambiar idioma de la app'));

    getAvailableLanguages().forEach(function appendOption(language) {
      var option = document.createElement('option');
      option.value = language.code;
      option.textContent = language.nativeName || language.name || language.code;
      option.selected = language.code === state.language;
      selector.appendChild(option);
    });

    selector.addEventListener('change', function changeLanguage() {
      setLanguage(selector.value);
    }, { once: true });
  }

  function applyAll(rootNode) {
    applyDocumentLanguage();
    applySeo();
    applyTextNodes(rootNode || document);
    populateLanguageSelector();

    document.dispatchEvent(new CustomEvent('app-language-ready', {
      detail: {
        language: state.language,
        languages: getAvailableLanguages()
      }
    }));
  }

  async function setLanguage(code) {
    var skeleton = beginSkeletonScreen(document.querySelector('.hello-card'));

    try {
      var targetCode = getLanguageByCode(code) ? code : state.fallbackLanguage;
      localStorage.setItem(STORAGE_KEY, targetCode);
      await loadLanguageBundle(targetCode);
      applyAll(document);
      return state.language;
    } finally {
      skeleton.end();
    }
  }

  async function start() {
    var skeleton = beginSkeletonScreen(document.querySelector('.hello-card'));

    try {
      await loadManifest();
      await loadLanguageBundle(resolveLanguage());
      applyAll(document);
    } finally {
      skeleton.end();
    }
  }

  root.AppI18n = Object.freeze({
    start: start,
    setLanguage: setLanguage,
    t: t,
    apply: applyAll,
    get language() {
      return state.language;
    },
    get ready() {
      return state.ready;
    },
    get availableLanguages() {
      return getAvailableLanguages();
    },
    get manifest() {
      return state.manifest;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(window);
