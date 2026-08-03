import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/js/p2p-client.js'), 'utf8');

const requiredFragments = [
  "async retireDevice(targetDeviceId = '')",
  "'/api/p2p/devices/retire'",
  'currentDeviceId: sessionContext.deviceId',
  "dispatch('p2p:device-retired'",
  "source: 'device-retired'"
];
for (const fragment of requiredFragments) {
  if (!source.includes(fragment)) throw new Error(`Falta el contrato cliente de baja segura: ${fragment}`);
}
if (!/await this\.fenceBootstrapResponses\(sessionContext\)[\s\S]{0,500}apiPost\('\/api\/p2p\/devices\/retire'/.test(source)) {
  throw new Error('La baja no cerca respuestas bootstrap anteriores antes de modificar el estado visible.');
}
if (!/cleanTargetDeviceId === sessionContext\.deviceId[\s\S]{0,250}P2P_DEVICE_RETIREMENT_CURRENT_DEVICE/.test(source)) {
  throw new Error('El cliente permite solicitar la baja del dispositivo actual.');
}

console.log('OK: contrato reutilizable del cliente para baja segura de dispositivos validado.');
