import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, '../src/js/firebase-auth.js');
const source = await fs.readFile(sourcePath, 'utf8');

if (/^\s*import\s+[^;]+\s+from\s+['"]https:\/\//m.test(source)) {
  throw new Error('firebase-auth.js todavía exige descargar Firebase durante la evaluación inicial del módulo.');
}
if (!source.includes('import(FIREBASE_APP_MODULE_URL)') || !source.includes('import(FIREBASE_AUTH_MODULE_URL)')) {
  throw new Error('Firebase no quedó limitado a una carga diferida activada por el flujo de autenticación.');
}
if (!source.includes('firebaseSdkPromise = null')) {
  throw new Error('Una falla de red dejaría bloqueada permanentemente la carga diferida de Firebase.');
}
if (!source.includes("loadError.code = 'auth/sdk-load-failed'")) {
  throw new Error('La carga diferida no distingue una falla remota de un error interno de programación.');
}

const evaluableSource = source.replace(
  /^import\s+\{\s*P2P_APPLICATION_STORAGE_SCOPE\s*\}\s+from\s+['"]\.\/application-scope\.js['"];?\s*/m,
  "const P2P_APPLICATION_STORAGE_SCOPE = 'root';\n"
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(evaluableSource).toString('base64')}`;
const authModule = await import(moduleUrl);

const missing = authModule.getFirebaseWebConfigError({ apiKey: 'x' });
if (!missing.includes('authDomain') || !missing.includes('projectId') || !missing.includes('appId')) {
  throw new Error('La validación pública de Firebase dejó de funcionar al desacoplar el SDK remoto.');
}
if (authModule.getFirebaseWebConfigError({ apiKey: 'x', authDomain: 'x', projectId: 'x', appId: 'x' })) {
  throw new Error('Una configuración Firebase completa fue rechazada después de la carga diferida.');
}

console.log('OK: la app puede evaluar su módulo de autenticación sin red; Firebase se descarga solo al usar Google y una falla permite reintento.');
