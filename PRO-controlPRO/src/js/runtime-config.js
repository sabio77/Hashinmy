(function exposeRuntimeConfig(root) {
  'use strict';

  // En Render Static Site, tools/generate-release.py reemplaza este valor con
  // APP_BACKEND_URL durante el build. Para desarrollo local se usa localhost:10000.
  root.APP_RUNTIME_CONFIG = Object.freeze({
    backendUrl: '',
    sinBACKEND: false
  });
})(window);
