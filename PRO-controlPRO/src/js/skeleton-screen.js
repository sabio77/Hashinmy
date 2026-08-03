(function createSkeletonScreen(root) {
  'use strict';

  var DEFAULT_DELAY_MS = 500;
  var activeCount = 0;

  function normalizeDelay(delayMs) {
    var value = Number(delayMs);
    if (!Number.isFinite(value) || value < 0) return DEFAULT_DELAY_MS;
    return value;
  }

  function getTarget(options) {
    if (options && options.target && options.target.nodeType === 1) return options.target;
    if (options && typeof options.selector === 'string') {
      return document.querySelector(options.selector);
    }
    return document.documentElement;
  }

  function setGlobalState(active) {
    activeCount = Math.max(0, activeCount + (active ? 1 : -1));
    document.documentElement.dataset.skeletonscreen = activeCount > 0 ? 'active' : 'idle';
  }

  function begin(options) {
    var settings = options || {};
    var target = getTarget(settings);
    var delayMs = normalizeDelay(settings.delayMs);
    var visible = false;
    var completed = false;
    var previousBusy = target ? target.getAttribute('aria-busy') : null;

    function show() {
      if (completed || visible || !target) return;
      visible = true;
      target.classList.add('is-skeletonscreen-active');
      target.setAttribute('aria-busy', 'true');
      setGlobalState(true);
    }

    var timer = root.setTimeout(show, delayMs);

    return Object.freeze({
      end: function end() {
        if (completed) return;
        completed = true;
        root.clearTimeout(timer);

        if (!visible || !target) return;
        target.classList.remove('is-skeletonscreen-active');
        if (previousBusy === null) {
          target.removeAttribute('aria-busy');
        } else {
          target.setAttribute('aria-busy', previousBusy);
        }
        setGlobalState(false);
      }
    });
  }

  function track(promise, options) {
    var skeleton = begin(options);
    return Promise.resolve(promise).finally(function finishSkeleton() {
      skeleton.end();
    });
  }

  function decorateAsync(fn, options) {
    if (typeof fn !== 'function') {
      throw new TypeError('AppSkeletonScreen.decorateAsync necesita una función.');
    }

    return function skeletonDecoratedAsync() {
      return track(fn.apply(this, arguments), options);
    };
  }

  root.AppSkeletonScreen = Object.freeze({
    DEFAULT_DELAY_MS: DEFAULT_DELAY_MS,
    begin: begin,
    track: track,
    decorateAsync: decorateAsync
  });
})(window);
