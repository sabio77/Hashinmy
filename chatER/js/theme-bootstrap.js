// Bootstrap visual temprano compatible con CSP estricta de producción.
// Debe cargarse antes de css/styles.css para evitar parpadeos de tema sin usar scripts inline.
(function () {
  'use strict';

  var hour = new Date().getHours();
  var isLight = hour >= 6 && hour < 18;
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  document.documentElement.dataset.themeMode = 'automatic';
}());
