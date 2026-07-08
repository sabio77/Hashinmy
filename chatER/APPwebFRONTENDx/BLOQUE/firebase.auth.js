import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

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
  return missing.length ? `Faltan datos de Firebase para iniciar sesión: ${missing.join(', ')}` : '';
}

function getFirebaseAppInstance(input = {}) {
  const config = normalizeFirebaseWebConfig(input);
  const error = getFirebaseWebConfigError(config);
  if (error) throw new Error(error);
  const existing = getApps().find((app) => app.name === 'chater-web');
  if (existing) return existing;
  return initializeApp(config, 'chater-web');
}

export async function signInWithGooglePopup(firebaseWebConfig = {}) {
  const app = getFirebaseAppInstance(firebaseWebConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken(true);
    return {
      idToken,
      firebaseUid: result.user.uid,
      email: result.user.email || '',
      name: result.user.displayName || '',
      photoUrl: result.user.photoURL || ''
    };
  } catch (error) {
    const code = String(error?.code || '');
    if (code === 'auth/popup-closed-by-user') throw new Error('Cerraste la ventana de Google antes de completar el inicio de sesión.');
    if (code === 'auth/popup-blocked') throw new Error('El navegador bloqueó la ventana emergente de Google. Permite popups e inténtalo de nuevo.');
    if (code === 'auth/unauthorized-domain') throw new Error('Este dominio no está autorizado para iniciar sesión con Google.');
    if (code === 'auth/operation-not-allowed') throw new Error('El acceso con Google no está habilitado.');
    throw new Error(error?.message || 'No se pudo iniciar sesión con Google.');
  }
}

export async function signOutFirebaseSession(firebaseWebConfig = {}) {
  const app = getFirebaseAppInstance(firebaseWebConfig);
  const auth = getAuth(app);
  await signOut(auth);
}
