(function createRuntimeAssetLoader(root) {
  'use strict';

  function noStoreUrl(path) {
    var url = new URL(path, window.location.href);
    url.searchParams.set('__asset', String(Date.now()));
    return url.toString();
  }

  function beginSkeletonFor(target) {
    if (root.AppSkeletonScreen && typeof root.AppSkeletonScreen.begin === 'function') {
      return root.AppSkeletonScreen.begin({
        target: target,
        delayMs: root.AppSkeletonScreen.DEFAULT_DELAY_MS || 500
      });
    }

    return {
      end: function noop() {}
    };
  }

  function createFallback(width, height, label) {
    var fallback = document.createElement('span');
    fallback.className = 'asset-fallback-shape';
    fallback.setAttribute('role', 'img');
    fallback.setAttribute('aria-label', label || 'Logo');
    fallback.style.width = width + 'px';
    fallback.style.height = height + 'px';
    return fallback;
  }

  function resolveImageSlot(slot) {
    var src = slot.getAttribute('data-image-src');
    if (!src) return;

    var width = Number(slot.getAttribute('data-image-width') || 96);
    var height = Number(slot.getAttribute('data-image-height') || width);
    var alt = slot.getAttribute('data-image-alt') || (root.AppI18n && root.AppI18n.t ? root.AppI18n.t('app.logoAlt', 'Logo de la app') : 'Logo de la app');
    var image = new Image(width, height);

    slot.textContent = '';
    slot.style.width = width + 'px';
    slot.style.height = height + 'px';

    image.decoding = 'async';
    image.loading = 'eager';
    image.alt = alt;
    image.width = width;
    image.height = height;
    image.className = 'runtime-logo-image';

    var skeleton = beginSkeletonFor(slot);

    image.addEventListener('load', function showImage() {
      skeleton.end();
      slot.textContent = '';
      slot.appendChild(image);
      slot.dataset.assetState = 'loaded';
    }, { once: true });

    image.addEventListener('error', function showFallback() {
      skeleton.end();
      slot.textContent = '';
      slot.appendChild(createFallback(width, height, alt));
      slot.dataset.assetState = 'fallback';
    }, { once: true });

    image.src = noStoreUrl(src);
  }

  function hydrate(rootNode) {
    var scope = rootNode || document;
    var slots = scope.querySelectorAll('[data-image-src]');
    Array.prototype.forEach.call(slots, resolveImageSlot);
  }

  root.AppAssetLoader = Object.freeze({
    hydrate: hydrate
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function onReady() {
      hydrate(document);
    }, { once: true });
  } else {
    hydrate(document);
  }

  document.addEventListener('app-language-ready', function onLanguageReady() {
    hydrate(document);
  });
})(window);
