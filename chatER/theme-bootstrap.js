// Arranque visual temprano compatible con CSP estricta de producción.
// Mantiene el mismo comportamiento de chatER_viejo: tema claro de 06:00 a 17:59 y oscuro de 18:00 a 05:59.
(function () {
  'use strict';

  var LIGHT_START_HOUR = 6;
  var DARK_START_HOUR = 18;
  var LIGHT_THEME_COLOR = '#f0f2f5';
  var DARK_THEME_COLOR = '#0b141a';

  function getAutomaticTheme(now) {
    var current = now || new Date();
    var hour = current.getHours();
    return hour >= LIGHT_START_HOUR && hour < DARK_START_HOUR ? 'light' : 'dark';
  }

  function updateThemeColor(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute('content', theme === 'light' ? LIGHT_THEME_COLOR : DARK_THEME_COLOR);
  }

  function applyAutomaticTheme() {
    var theme = getAutomaticTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeMode = 'automatic';
    updateThemeColor(theme);
  }

  applyAutomaticTheme();
  window.setInterval(applyAutomaticTheme, 60 * 1000);
}());
