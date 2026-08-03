import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canRetireDevice,
  compactDeviceId,
  normalizeDeviceList,
  normalizeDeviceRecord
} from '../src/js/device-management.js';

const currentId = 'dev_current_1234567890';
const devices = normalizeDeviceList([
  { deviceId: 'dev_old', name: 'Tablet', lastSeenAt: '2026-07-01T10:00:00Z' },
  { deviceId: currentId, name: 'Teléfono', lastSeenAt: '2026-07-01T09:00:00Z' },
  { deviceId: 'dev_recent', name: 'Portátil', lastSeenAt: '2026-07-02T10:00:00Z' },
  { deviceId: 'dev_recent', name: 'Portátil actualizado', lastSeenAt: '2026-07-03T10:00:00Z' },
  { deviceId: '', name: 'Inválido' }
], currentId);

assert.equal(devices.length, 3, 'La lista visible debe descartar identificadores inválidos y duplicados.');
assert.equal(devices[0].deviceId, currentId, 'El dispositivo actual debe aparecer primero aunque no sea el más reciente.');
assert.equal(devices[1].deviceId, 'dev_recent', 'Las demás instalaciones deben ordenarse por actividad reciente.');
assert.equal(devices[1].name, 'Portátil actualizado', 'Debe conservarse la versión más reciente de un registro duplicado.');
assert.equal(normalizeDeviceRecord({ deviceId: currentId }, currentId)?.current, true, 'La identidad actual debe quedar marcada explícitamente.');
assert.equal(canRetireDevice(devices[0], currentId, devices.length, true), false, 'La interfaz nunca debe permitir retirar la instalación actual.');
assert.equal(canRetireDevice(devices[1], currentId, devices.length, true), true, 'Una instalación remota puede retirarse cuando existe otra copia registrada.');
assert.equal(canRetireDevice(devices[1], currentId, 1, true), false, 'La interfaz no debe ofrecer una baja sin alternativa registrada.');
assert.equal(canRetireDevice(devices[1], currentId, devices.length, false), false, 'La interfaz no debe habilitar una baja si el dispositivo actual falta del estado autoritativo.');
assert.equal(compactDeviceId(currentId), 'dev_cu…567890', 'El identificador visible debe ser compacto y conservar ambos extremos.');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(appSource, /semillaP2P\.retireDevice\(device\.deviceId\)/, 'La confirmación visual debe usar la baja segura existente del cliente.');
assert.match(appSource, /canRetireDevice\(device, currentDeviceId, devices\.length, currentDeviceRegistered\)/, 'La acción debe permanecer cercada contra el dispositivo actual o una lista sin alternativa.');
assert.match(appSource, /dataset\.deviceRetirable/, 'El cambio de estado ocupado no debe reactivar acciones previamente invalidadas.');
assert.match(html, /id="devices-dialog"/, 'La semilla debe exponer el administrador de dispositivos como interfaz de producción.');
assert.match(html, /id="device-confirm-panel"/, 'La baja destructiva debe exigir confirmación explícita.');

console.log('OK: gestión visible de dispositivos, identificación de la instalación actual, confirmación y baja segura conectada al contrato P2P.');
