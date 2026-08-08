import { P2P_APPLICATION_STORAGE_SCOPE } from './application-scope.js';

const FIREBASE_APP_MODULE_URL = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
const FIREBASE_AUTH_MODULE_URL = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
let firebaseSdkPromise = null;

function clean(value) {
  return String(value || '').trim();
}

export function normalizeFirebaseWebConfig(input = {}) {
  return {
    apiKey: clean(input.apiKey),
    authDomain: clean(input.authDomain),
    projectId: clean(input.projectId),
    appId: clean(input.appId),
    storageBucket: clean(input.storageBucket),
    messagingSenderId: clean(input.messagingSenderId),
    measurementId: clean(input.measurementId)
  };
}

export function getFirebaseWebConfigError(input = {}) {
  const config = normalizeFirebaseWebConfig(input);
  const missing = [];
  if (!config.apiKey) missing.push('apiKey');
  if (!config.authDomain) missing.push('authDomain');
  if (!config.projectId) missing.push('projectId');
  if (!config.appId) missing.push('appId');
  return missing.length ? `Faltan datos públicos de Firebase: ${missing.join(', ')}` : '';
}

async function loadFirebaseSdk() {
  if (!firebaseSdkPromise) {
    firebaseSdkPromise = Promise.all([
      import(FIREBASE_APP_MODULE_URL),
      import(FIREBASE_AUTH_MODULE_URL)
    ]).then(([appSdk, authSdk]) => ({
      initializeApp: appSdk.initializeApp,
      getApps: appSdk.getApps,
      getAuth: authSdk.getAuth,
      setPersistence: authSdk.setPersistence,
      browserSessionPersistence: authSdk.browserSessionPersistence,
      GoogleAuthProvider: authSdk.GoogleAuthProvider,
      signInWithPopup: authSdk.signInWithPopup,
      signOut: authSdk.signOut
    })).catch((error) => {
      // Permite reintentar después de recuperar la conectividad. La carga del SDK
      // nunca ocurre durante el arranque local-first: solo al usar Google.
      firebaseSdkPromise = null;
      const loadError = new Error('No se pudo cargar el acceso de Google.');
      loadError.code = 'auth/sdk-load-failed';
      loadError.cause = error;
      throw loadError;
    });
  }
  return firebaseSdkPromise;
}

function getFirebaseAppInstance(input = {}, sdk = {}) {
  const config = normalizeFirebaseWebConfig(input);
  const error = getFirebaseWebConfigError(config);
  if (error) throw new Error(error);

  const appName = P2P_APPLICATION_STORAGE_SCOPE === 'root'
    ? 'semilla-appweb'
    : `semilla-appweb-${P2P_APPLICATION_STORAGE_SCOPE}`;
  const existing = sdk.getApps().find((app) => app.name === appName);
  return existing || sdk.initializeApp(config, appName);
}

function publicFirebaseError(error = null) {
  const code = String(error?.code || '');
  if (code === 'auth/popup-closed-by-user') return new Error('Cerraste la ventana de Google antes de completar el acceso.');
  if (code === 'auth/popup-blocked') return new Error('El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo nuevamente.');
  if (code === 'auth/unauthorized-domain') return new Error('Este dominio no está autorizado para iniciar sesión con Google.');
  if (code === 'auth/operation-not-allowed') return new Error('El acceso con Google no está habilitado.');
  if (code === 'auth/network-request-failed' || code === 'auth/sdk-load-failed') {
    return new Error('No se pudo conectar con Google. Comprueba tu conexión e inténtalo nuevamente.');
  }
  return new Error(error?.message || 'No se pudo iniciar sesión con Google.');
}

export async function signInWithGooglePopup(firebaseWebConfig = {}) {
  try {
    const sdk = await loadFirebaseSdk();
    const app = getFirebaseAppInstance(firebaseWebConfig, sdk);
    const auth = sdk.getAuth(app);
    // Firebase también debe respetar el aislamiento por ventana. El token de
    // memoriaBACKEND ya queda fijado por contexto; mantener Firebase en persistencia
    // local volvería a propagar el cambio de cuenta entre dos Chrome abiertos.
    await sdk.setPersistence(auth, sdk.browserSessionPersistence);
    const provider = new sdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await sdk.signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken(true);
    return {
      idToken,
      firebaseUid: result.user.uid,
      email: result.user.email || '',
      name: result.user.displayName || '',
      photoUrl: result.user.photoURL || ''
    };
  } catch (error) {
    throw publicFirebaseError(error);
  }
}

export async function signOutFirebaseSession(firebaseWebConfig = {}) {
  const error = getFirebaseWebConfigError(firebaseWebConfig);
  if (error) return;
  const sdk = await loadFirebaseSdk();
  const app = getFirebaseAppInstance(firebaseWebConfig, sdk);
  await sdk.signOut(sdk.getAuth(app));
}
