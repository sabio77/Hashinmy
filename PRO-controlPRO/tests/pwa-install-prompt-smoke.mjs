import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'src/js/pwa-install-prompt.js'), 'utf8');

class MockElement {
  constructor() {
    this.listeners = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.textContent = '';
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  emit(type, event = {}) {
    return this.listeners.get(type)?.(event);
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }

  setAttribute(name) {
    if (name === 'open') this.open = true;
  }

  removeAttribute(name) {
    if (name === 'open') this.open = false;
  }
}

function createRuntime({ standalone = false, userAgent = 'Chrome' } = {}) {
  const dialog = new MockElement();
  const closeButton = new MockElement();
  const installButton = new MockElement();
  const statusNode = new MockElement();
  statusNode.hidden = true;

  const elements = {
    'pwa-install-dialog': dialog,
    'pwa-install-close': closeButton,
    'pwa-install-button': installButton,
    'pwa-install-status': statusNode,
  };

  const windowListeners = new Map();
  const documentListeners = new Map();
  const mediaListeners = new Map();
  let applyCalls = 0;
  const mediaQuery = {
    matches: standalone,
    addEventListener(type, handler) {
      mediaListeners.set(type, handler);
    },
  };

  const document = {
    readyState: 'complete',
    referrer: '',
    getElementById(id) {
      return elements[id] || null;
    },
    addEventListener(type, handler) {
      documentListeners.set(type, handler);
    },
  };

  const window = {
    document,
    navigator: { standalone: false, userAgent },
    matchMedia() {
      return mediaQuery;
    },
    addEventListener(type, handler) {
      windowListeners.set(type, handler);
    },
    AppI18n: {
      t(key, fallback) {
        return fallback || key;
      },
      apply() {
        applyCalls += 1;
      },
    },
  };

  const context = vm.createContext({ window, document, console, Promise, Object, Boolean, String });
  vm.runInContext(SOURCE, context, { filename: 'pwa-install-prompt.js' });

  return {
    window,
    dialog,
    closeButton,
    installButton,
    statusNode,
    windowListeners,
    documentListeners,
    mediaListeners,
    get applyCalls() {
      return applyCalls;
    },
  };
}

{
  const runtime = createRuntime();
  assert.equal(runtime.dialog.open, true, 'La presentación debe abrir al cargar si la app no está instalada.');

  runtime.documentListeners.get('app-language-ready')?.();
  assert.equal(runtime.applyCalls, 0, 'El evento de idioma no debe redisparar el aplicador global ni crear recursión.');

  runtime.closeButton.emit('click');
  assert.equal(runtime.dialog.open, false, 'El botón X debe cerrar la presentación durante la sesión actual.');

  let prevented = false;
  let prompted = false;
  runtime.windowListeners.get('beforeinstallprompt')({
    preventDefault() {
      prevented = true;
    },
    async prompt() {
      prompted = true;
    },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });

  assert.equal(prevented, true, 'Debe conservar el evento beforeinstallprompt para el botón propio.');
  assert.equal(runtime.dialog.open, false, 'La disponibilidad tardía del instalador no debe ignorar el cierre explícito del usuario.');

  runtime.window.PWAInstallPrompt.open();
  assert.equal(runtime.dialog.open, true, 'Una acción explícita de la interfaz debe poder volver a abrir la presentación.');
  await runtime.installButton.emit('click');
  assert.equal(prompted, true, 'El botón Instalar debe invocar el instalador nativo.');
  assert.equal(runtime.dialog.open, false, 'La presentación debe cerrarse cuando la instalación fue aceptada.');
}

{
  const runtime = createRuntime();
  let prevented = false;
  runtime.dialog.emit('cancel', {
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true, 'Escape debe pasar por el cierre controlado de la presentación.');
  assert.equal(runtime.dialog.open, false, 'Escape debe cerrar la presentación.');

  runtime.windowListeners.get('beforeinstallprompt')({
    preventDefault() {},
    async prompt() {},
    userChoice: Promise.resolve({ outcome: 'dismissed' }),
  });
  assert.equal(runtime.dialog.open, false, 'Escape también debe impedir reaperturas automáticas durante la sesión actual.');
}

{
  const runtime = createRuntime({ standalone: true });
  assert.equal(runtime.dialog.open, false, 'No debe mostrarse en modo standalone.');
}

{
  const runtime = createRuntime({ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit Safari' });
  await runtime.installButton.emit('click');
  assert.match(runtime.statusNode.textContent, /Compartir|pantalla de inicio/i, 'Sin prompt nativo debe mostrar instrucciones instalables para iOS.');
  assert.equal(runtime.dialog.open, true, 'Las instrucciones manuales deben mantenerse visibles.');
}

console.log('OK: presentación de instalación PWA validada.');
