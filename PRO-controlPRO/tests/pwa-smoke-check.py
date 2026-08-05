#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    "index.html",
    "offline.html",
    "manifest.webmanifest",
    "sw.js",
    "version.json",
    "textX/languages.json",
    "textX/app/es.json",
    "textX/app/en.json",
    "textX/seo/es.json",
    "textX/seo/en.json",
    "src/js/app-metadata.js",
    "src/js/runtime-config.js",
    "src/js/config.js",
    "src/js/application-scope.js",
    "src/js/api.js",
    "src/js/firebase-auth.js",
    "src/js/p2p-storage.js",
    "src/js/p2p-durability.js",
    "src/js/p2p-crypto.js",
    "src/js/p2p-tab-coordinator.js",
    "src/js/p2p-client.js",
    "src/js/p2p-permissions.js",
    "src/js/p2p-invitation-intent.js",
    "src/js/project-domain.js",
    "src/js/skeleton-screen.js",
    "src/js/i18n.js",
    "src/js/asset-loader.js",
    "src/js/pwa-install-prompt.js",
    "src/js/pwa-update-manager.js",
    "src/js/app.js",
    "src/css/app.css",
    "tests/application-scope-smoke.mjs",
    "tests/pwa-request-isolation-smoke.mjs",
    "tests/pwa-install-prompt-smoke.mjs",
    "tests/p2p-local-state-smoke.mjs",
    "tests/p2p-batch-intent-smoke.mjs",
    "tests/p2p-replication-contract-smoke.mjs",
    "tests/p2p-replica-batch-atomicity-smoke.mjs",
    "tests/p2p-durability-smoke.mjs",
    "tests/p2p-storage-lifecycle-smoke.mjs",
    "tests/p2p-crypto-smoke.mjs",
    "tests/P2P_sin_capability-smoke.mjs",
    "tests/P2P_sin_local-transport-smoke.mjs",
    "tests/P2P_sin_local-recovery-smoke.mjs",
    "tests/p2p-multitab-smoke.mjs",
    "tests/session-isolation-smoke.mjs",
    "tests/p2p-invitation-intent-smoke.mjs",
    "tests/p2p-control-mutation-atomicity-smoke.mjs",
    "tests/p2p-retry-after-smoke.mjs",
    "tests/project-domain-smoke.mjs",
    "tests/p2p-trash-lifecycle-smoke.mjs",
    "_headers",
]

REQUIRED_PROMPTS = [
    "assets/icons/icon-192.png.txt",
    "assets/icons/icon-512.png.txt",
    "assets/icons/maskable-192.png.txt",
    "assets/icons/maskable-512.png.txt",
    "assets/icons/logo.png.txt",
]

JAVASCRIPT_FILES = [
    "src/js/app-metadata.js",
    "src/js/runtime-config.js",
    "src/js/config.js",
    "src/js/application-scope.js",
    "src/js/api.js",
    "src/js/firebase-auth.js",
    "src/js/p2p-storage.js",
    "src/js/p2p-durability.js",
    "src/js/p2p-crypto.js",
    "src/js/p2p-tab-coordinator.js",
    "src/js/p2p-client.js",
    "src/js/p2p-permissions.js",
    "src/js/p2p-invitation-intent.js",
    "src/js/project-domain.js",
    "src/js/skeleton-screen.js",
    "src/js/i18n.js",
    "src/js/asset-loader.js",
    "src/js/pwa-install-prompt.js",
    "src/js/pwa-update-manager.js",
    "src/js/app.js",
    "sw.js",
]

POLLING_FORBIDDEN_PATTERNS = [
    r"\bsetInterval\s*\(",
    r"\bperiodicUpdateChecksEnabled\s*:\s*true\b",
    r"\bupdateCheckIntervalMs\s*:\s*(?!0\b)\d+",
]


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(relative: str) -> Dict[str, Any]:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def flatten_keys(payload: Dict[str, Any], prefix: str = "") -> List[str]:
    keys: List[str] = []
    for key, value in payload.items():
        current = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            keys.extend(flatten_keys(value, current))
        else:
            keys.append(current)
    return sorted(keys)


def assert_same_keys(reference_file: str, candidate_file: str) -> None:
    reference = read_json(reference_file)
    candidate = read_json(candidate_file)
    reference_keys = flatten_keys(reference)
    candidate_keys = flatten_keys(candidate)
    if reference_keys != candidate_keys:
        missing = sorted(set(reference_keys) - set(candidate_keys))
        extra = sorted(set(candidate_keys) - set(reference_keys))
        fail(f"Keys i18n incompatibles en {candidate_file}. Faltan={missing}. Sobran={extra}.")


def textx_language_pairs() -> Set[str]:
    app_codes = {path.stem for path in (ROOT / "textX" / "app").glob("*.json")}
    seo_codes = {path.stem for path in (ROOT / "textX" / "seo").glob("*.json")}
    return app_codes & seo_codes


def public_path_exists(public_path: str) -> bool:
    relative = public_path[2:] if public_path.startswith("./") else public_path.lstrip("/")
    return (ROOT / relative).exists()


def assert_javascript_syntax() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite validación sintáctica JS.", file=sys.stderr)
        return

    for relative in JAVASCRIPT_FILES:
        source = (ROOT / relative).read_text(encoding="utf-8")
        is_module = bool(re.search(r"^\s*(?:import|export)\s", source, flags=re.MULTILINE))
        if is_module:
            result = subprocess.run(
                [node, "--input-type=module", "--check"],
                input=source,
                text=True,
                capture_output=True,
            )
        else:
            result = subprocess.run([node, "--check", str(ROOT / relative)], text=True, capture_output=True)
        if result.returncode != 0:
            fail(f"Error de sintaxis en {relative}: {result.stderr.strip() or result.stdout.strip()}")




def assert_replication_contract() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba del fan-out P2P durable.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "p2p-replication-contract-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló el contrato de réplica completa P2P: {result.stderr.strip() or result.stdout.strip()}")

def assert_replica_batch_atomicity() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de atomicidad del lote en réplicas.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "p2p-replica-batch-atomicity-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló la atomicidad del lote remoto en réplicas P2P: {result.stderr.strip() or result.stdout.strip()}")


def assert_application_scope() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de aislamiento por aplicación.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "application-scope-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló el aislamiento por dominio y aplicación: {result.stderr.strip() or result.stdout.strip()}")


def assert_install_prompt() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de presentación de instalación PWA.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "pwa-install-prompt-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló la presentación de instalación PWA: {result.stderr.strip() or result.stdout.strip()}")

def assert_service_worker_request_isolation() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de alcance efectivo del Service Worker.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "pwa-request-isolation-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló el aislamiento de solicitudes entre Service Workers: {result.stderr.strip() or result.stdout.strip()}")


def assert_local_state_reconciliation() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba del reducer local P2P.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "p2p-local-state-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló la reconciliación local P2P: {result.stderr.strip() or result.stdout.strip()}")


def assert_trash_lifecycle() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de papelera P2P.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "p2p-trash-lifecycle-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló el ciclo de vida de papelera P2P: {result.stderr.strip() or result.stdout.strip()}")


def assert_storage_durability() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de durabilidad local.", file=sys.stderr)
        return
    for test_name in ["p2p-durability-smoke.mjs", "p2p-storage-lifecycle-smoke.mjs"]:
        result = subprocess.run(
            [node, str(ROOT / "tests" / test_name)],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        if result.returncode != 0:
            fail(f"Falló la protección del almacenamiento local ({test_name}): {result.stderr.strip() or result.stdout.strip()}")


def assert_crypto_roundtrip() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba criptográfica P2P.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "p2p-crypto-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló el cifrado P2P cliente a cliente: {result.stderr.strip() or result.stdout.strip()}")


def assert_local_capability_authentication() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de capacidades offline firmadas.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "P2P_sin_capability-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló la autenticación del canal P2P_sin_: {result.stderr.strip() or result.stdout.strip()}")


def assert_local_network_recovery() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de recuperación por red local.", file=sys.stderr)
        return
    for test_name in ["P2P_sin_local-transport-smoke.mjs", "P2P_sin_local-recovery-smoke.mjs"]:
        result = subprocess.run(
            [node, str(ROOT / "tests" / test_name)],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        if result.returncode != 0:
            fail(f"Falló la recuperación directa P2P_sin_ ({test_name}): {result.stderr.strip() or result.stdout.strip()}")


def assert_multitab_coordination() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba multiventana P2P.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "p2p-multitab-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló la coordinación multiventana P2P: {result.stderr.strip() or result.stdout.strip()}")


def assert_session_isolation() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de aislamiento de sesión.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "session-isolation-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló el aislamiento de sesión entre ventanas: {result.stderr.strip() or result.stdout.strip()}")


def assert_project_domain() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba del dominio administrativo.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "project-domain-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló el dominio administrativo: {result.stderr.strip() or result.stdout.strip()}")


def assert_invitation_notification_intent() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba del enlace Push de invitaciones.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "p2p-invitation-intent-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló el enlace Push de invitaciones: {result.stderr.strip() or result.stdout.strip()}")


def assert_control_mutation_atomicity() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de atomicidad del control incremental.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "p2p-control-mutation-atomicity-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló la atomicidad incremental de proyecto e invitación: {result.stderr.strip() or result.stdout.strip()}")


def assert_retry_after_recovery() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba de recuperación por Retry-After.", file=sys.stderr)
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "p2p-retry-after-smoke.mjs")],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"Falló la recuperación P2P dirigida por Retry-After: {result.stderr.strip() or result.stdout.strip()}")


def assert_snapshot_request_liveness() -> None:
    node = shutil.which("node")
    if not node:
        print("ADVERTENCIA: node no está disponible; se omite prueba dinámica de recuperación P2P.", file=sys.stderr)
        return

    with tempfile.TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)
        js_root = tmp_root / "src" / "js"
        js_root.mkdir(parents=True)
        shutil.copy2(ROOT / "src" / "js" / "p2p-client.js", js_root / "p2p-client.js")
        shutil.copy2(ROOT / "src" / "js" / "p2p-permissions.js", js_root / "p2p-permissions.js")
        shutil.copy2(ROOT / "src" / "js" / "application-scope.js", js_root / "application-scope.js")
        shutil.copy2(ROOT / "src" / "js" / "p2p-invitation-intent.js", js_root / "p2p-invitation-intent.js")
        (js_root / "p2p-crypto.js").write_text(
            """
export const setP2PCryptoContext=async()=>{};
export const closeP2PCryptoContext=()=>{};
export const ensureDeviceEncryptionIdentity=async()=>({publicKey:null});
export const ensureDeviceSigningIdentity=async()=>({publicKey:null});
export const signP2PLocalPayload=async()=>'';
export const verifyP2PLocalSignature=async()=>true;
export const verifyP2PLocalCapability=async(_authority,capability)=>capability?.payload || ({memberships:[]});
export const getActiveSpaceKey=async()=>globalThis.__activeSpaceKey || null;
export const hasSpaceKey=async()=>Boolean(globalThis.__activeSpaceKey);
export const ensureSpaceKey=async()=>globalThis.__activeSpaceKey || ({keyId:'key_test',keyEpoch:1});
export const activateSpaceKey=async(_spaceId,keyId,options={})=>({keyId,keyEpoch:Number(options.keyEpoch || 0)});
export const createSpaceKeyEnvelope=async()=>({});
export const createSpaceKeyEnvelopes=async()=>[];
export const importSpaceKeyEnvelope=async()=>({imported:true});
export const isRejectedKeyEnvelopeError=()=>false;
export const createRejectedEncryptedPayloadError=(message='',reason='invalid_payload')=>Object.assign(new Error(message),{code:'P2P_ENCRYPTED_PAYLOAD_REJECTED',reason,remotePayloadRejected:true,retryable:false});
export const isRejectedEncryptedPayloadError=()=>false;
export const encryptOperationForTransport=async(_spaceId,operation)=>({
  ...operation,
  encrypted:true,
  encryptionVersion:1,
  keyId:String(globalThis.__activeSpaceKey?.keyId || 'key_refreshed'),
  payload:{__p2pEncrypted:true,ciphertext:'test'}
});
export const decryptOperationEvent=async(event)=>event;
export const encryptSnapshotEntities=async(_spaceId,entities)=>({entities,keyId:''});
export const deferEncryptedEvent=async()=>({});
export const listDeferredEncryptedEvents=async()=>[];
export const removeDeferredEncryptedEvent=async()=>true;
export const purgeSpaceCrypto=async()=>true;
""".strip(),
            encoding="utf-8",
        )
        shutil.copy2(ROOT / "src" / "js" / "p2p-tab-coordinator.js", js_root / "p2p-tab-coordinator.js")
        (js_root / "api.js").write_text(
            "export const apiGet=async()=>({}); "
            "export const apiPost=async(...args)=>globalThis.__apiPost ? globalThis.__apiPost(...args) : ({}); "
            "export const getBackendUrl=()=>\"http://localhost\"; export const getSessionToken=()=>\"session\"; export const isSessionChangedError=()=>false;",
            encoding="utf-8",
        )
        (js_root / "p2p-storage.js").write_text(
            """
export const getMeta=async()=>0;
export const setMeta=async(key,value)=>{globalThis.__savedMeta={key,value};};
export const setP2PStorageUser=async()=>{};
export const configureP2PStorageLimits=()=>({});
export const saveSpaces=async()=>{};
export const replaceSpaces=async()=>{};
export const replaceBootstrapControlState=async(spaces,invitations)=>({spaces,invitations,removedSpaceIds:[],preservedSpaceIds:[],purged:{}});
export const saveControlStateAtomically=async({spaces=[],invitations=[]}={})=>({spaces,invitations});
export const purgeLocalSpace=async(spaceId)=>({spaceId,purged:true,entities:1,outbox:1,snapshots:1});
export const listSpaces=async()=>[];
export const saveInvitations=async()=>{};
export const replaceInvitations=async()=>{};
export const listInvitations=async()=>[];
export const getEntity=async()=>globalThis.__entity || null;
export const listEntities=async()=>globalThis.__entities || [];
export const applyP2PEvent=async(event)=>{globalThis.__applyCalls=(globalThis.__applyCalls || 0)+1; const operationId=event?.operation?.operationId; if(operationId){globalThis.__outbox=(globalThis.__outbox || []).filter((item)=>item.operationId!==operationId);} return {applied:true,outboxConfirmed:Boolean(operationId)};};
export const applyP2PEventBatch=async(events)=>{globalThis.__applyBatchCalls=(globalThis.__applyBatchCalls || 0)+1; const results=[]; for(const event of events || []){const operationId=event?.operation?.operationId; if(operationId){globalThis.__outbox=(globalThis.__outbox || []).filter((item)=>item.operationId!==operationId);} results.push({applied:true,outboxConfirmed:Boolean(operationId)});} return {applied:true,atomic:true,count:results.length,results};};
export const listStateRevisions=async()=>globalThis.__stateRevisions || {};
export const enqueueOutbox=async(item)=>{globalThis.__outbox=[...(globalThis.__outbox || []).filter((entry)=>entry.operationId!==item.operationId), item];};
export const enqueueOutboxBatch=async(items)=>{for(const item of items || []){globalThis.__outbox=[...(globalThis.__outbox || []).filter((entry)=>entry.operationId!==item.operationId), item];} return {count:(items || []).length,operationIds:(items || []).map((item)=>item.operationId)};};
export const enqueueOptimisticOperation=async(item)=>{globalThis.__outbox=[...(globalThis.__outbox || []).filter((entry)=>entry.operationId!==item.operationId), item]; return {applied:true};};
export const enqueueOptimisticOperationBatch=async(entries)=>{for(const entry of entries || []){const item=entry?.item || {}; globalThis.__outbox=[...(globalThis.__outbox || []).filter((candidate)=>candidate.operationId!==item.operationId), item];} return {count:(entries || []).length,results:(entries || []).map(()=>({applied:true}))};};
export const listOutbox=async()=>globalThis.__outbox || [];
export const rebindLocalDeviceId=async(previousDeviceId,nextDeviceId)=>{globalThis.__outbox=(globalThis.__outbox || []).map((item)=>String(item?.request?.deviceId || '')===String(previousDeviceId || '')?{...item,request:{...(item.request || {}),deviceId:nextDeviceId}}:item); return {outbox:0,entities:0};};
export const removeOutbox=async(operationId)=>{globalThis.__outbox=(globalThis.__outbox || []).filter((item)=>item.operationId!==operationId);};
export const rejectOutboxOperation=async(item,error)=>{globalThis.__outbox=(globalThis.__outbox || []).filter((entry)=>entry.operationId!==item.operationId); globalThis.__rejectCalls=(globalThis.__rejectCalls || 0)+1; return {reverted:true, entity:null, status:Number(error?.status || 0), message:String(error?.message || '')};};
export const rejectOutboxOperationBatch=async(items,error)=>{const rollbacks=[]; for(const item of items || []){globalThis.__outbox=(globalThis.__outbox || []).filter((entry)=>entry.operationId!==item.operationId); globalThis.__rejectCalls=(globalThis.__rejectCalls || 0)+1; rollbacks.push({reverted:true,entity:null,operationId:item.operationId,status:Number(error?.status || 0),message:String(error?.message || '')});} return {count:rollbacks.length,rollbacks};};
export const getRecoveryRequirements=async()=>globalThis.__recoveryRequirements || {};
export const updateRecoveryRequirements=async({required={},retainSpaceIds=null}={})=>{const retained=new Set(Array.isArray(retainSpaceIds)?retainSpaceIds:[]); const current=globalThis.__recoveryRequirements || {}; const next={}; for(const [spaceId,revision] of Object.entries(current)){if(!Array.isArray(retainSpaceIds)||retained.has(spaceId)) next[spaceId]=Number(revision || 0);} for(const [spaceId,revision] of Object.entries(required || {})){next[spaceId]=Math.max(Number(next[spaceId] || 0),Number(revision || 0));} globalThis.__recoveryRequirements=next; return next;};
export const resolveRecoveryRequirement=async(spaceId,sourceStateRevision)=>{const next={...(globalThis.__recoveryRequirements || {})}; if(Number(sourceStateRevision || 0)>=Number(next[spaceId] || 0)) delete next[spaceId]; globalThis.__recoveryRequirements=next; return next;};
""".strip(),
            encoding="utf-8",
        )
        (tmp_root / "package.json").write_text('{"type":"module"}', encoding="utf-8")
        script = tmp_root / "snapshot-liveness.mjs"
        script.write_text(
            """
import { webcrypto } from 'node:crypto';

const dispatched = [];
class TestCustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail || {}; }
}
globalThis.CustomEvent = TestCustomEvent;
globalThis.window = {
  crypto: webcrypto,
  localStorage: { getItem: () => '', setItem: () => {}, removeItem: () => {} },
  location: { hostname: 'localhost' },
  matchMedia: () => ({ matches: false }),
  dispatchEvent: (event) => { dispatched.push(event); return true; },
  setTimeout,
  clearTimeout,
  addEventListener: () => {},
  removeEventListener: () => {},
  atob: (value) => Buffer.from(value, 'base64').toString('binary')
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { onLine: true, language: 'es-CO', platform: 'Test', userAgentData: { platform: 'Test' } }
});
globalThis.EventSource = class EventSource { static CLOSED = 2; };

const { SemillaP2PClient } = await import('./src/js/p2p-client.js');
const client = new SemillaP2PClient();
client.started = true;
client.manualClose = false;
client.deviceId = 'dev_source_000001';
client.lastProcessedSequence = 6;
client.lastAcceptedStreamSequence = 6;
let acknowledged = 0;
client.scheduleAck = (sequence) => { acknowledged = sequence; };
client.sendSnapshot = async () => {
  const error = new Error('Concesión vencida');
  error.status = 403;
  throw error;
};

await client.handleEvent({
  eventId: 'evt_snapshot_expired',
  eventType: 'p2p.snapshot.request',
  deviceSequence: 7,
  spaceId: 'space_1',
  actorUserId: 'user_target_000001',
  sourceDeviceId: 'dev_target_000001',
  data: {
    requestId: 'snapshot_old',
    requestDeviceId: 'dev_target_000001',
    requestUserId: 'user_target_000001',
    spaceId: 'space_1',
    localStateRevision: 1,
    currentStateRevision: 2
  }
});
if (acknowledged !== 7) throw new Error('La solicitud fallida no avanzó el ACK del stream.');
if (!dispatched.some((event) => event.type === 'p2p:snapshot-source-error')) {
  throw new Error('No se aisló el error de la fuente de snapshot.');
}

client.sendSnapshot = SemillaP2PClient.prototype.sendSnapshot.bind(client);
const skipped = await client.sendSnapshot({
  data: {
    requestId: 'snapshot_expired',
    requestDeviceId: 'dev_target_000001',
    spaceId: 'space_1',
    expiresAt: new Date(Date.now() - 5000).toISOString()
  }
});
if (skipped !== false) throw new Error('La solicitud vencida no fue descartada antes de construir el snapshot.');

const safeRequest = {
  data: {
    requestId: 'snapshot_safe',
    requestDeviceId: 'dev_target_000001',
    spaceId: 'space_1',
    expiresAt: new Date(Date.now() + 60000).toISOString()
  }
};
let publishCalls = 0;
const publishedOperations = [];
client.publish = async (_spaceId, operation) => {
  publishCalls += 1;
  publishedOperations.push(operation);
  return { ok: true };
};
client.flushOutbox = async () => ({ sent: 0, pending: 1 });
globalThis.__outbox = [{ operationId: 'op_pending', spaceId: 'space_1' }];
globalThis.__entities = [{
  entityType: 'note', entityId: '1', value: { text: 'sin confirmar' },
  stateRevision: 4, spaceSequence: 4, optimistic: true
}];
const blockedByPending = await client.sendSnapshot(safeRequest);
if (blockedByPending !== false || publishCalls !== 0) {
  throw new Error('Una réplica con outbox pendiente intentó publicar un snapshot no confirmado.');
}

globalThis.__outbox = [];
const blockedByOptimistic = await client.sendSnapshot(safeRequest);
if (blockedByOptimistic !== false || publishCalls !== 0) {
  throw new Error('Una entidad optimista huérfana fue incluida en un snapshot.');
}

globalThis.__entities = [{
  entityType: 'note', entityId: '1', value: { text: 'confirmado' },
  stateRevision: 5, spaceSequence: 5, optimistic: false
}];
globalThis.__stateRevisions = { space_1: 5 };
globalThis.__recoveryRequirements = { space_1: 5 };
const blockedByRecovery = await client.sendSnapshot({
  data: { ...safeRequest.data, requestId: 'snapshot_source_recovering', currentStateRevision: 5 }
});
if (blockedByRecovery !== false || publishCalls !== 0) {
  throw new Error('Una réplica con recuperación incompleta fue usada como fuente de snapshot.');
}
globalThis.__recoveryRequirements = {};
const sent = await client.sendSnapshot({
  data: { ...safeRequest.data, currentStateRevision: 5 }
});
if (sent !== true || publishCalls !== 2) {
  throw new Error('Una réplica confirmada no pudo publicar chunk y cierre de snapshot.');
}
if (!publishedOperations.slice(-2).every((operation) => operation?.payload?.sourceStateRevision === 5)) {
  throw new Error('El snapshot con entidades no conservó la revisión autoritativa del espacio.');
}

globalThis.__entities = [];
globalThis.__stateRevisions = { space_1: 6 };
const sentEmpty = await client.sendSnapshot({
  data: { ...safeRequest.data, requestId: 'snapshot_empty_authoritative', currentStateRevision: 6 }
});
if (sentEmpty !== true || publishCalls !== 4) {
  throw new Error('Una réplica vacía confirmada no pudo publicar un snapshot autoritativo.');
}
if (!publishedOperations.slice(-2).every((operation) => operation?.payload?.sourceStateRevision === 6)) {
  throw new Error('El snapshot vacío perdió la revisión del espacio y no podría propagar eliminaciones completas.');
}
if (!dispatched.some((event) => event.type === 'p2p:snapshot-source-deferred')) {
  throw new Error('No se informó que el snapshot fue diferido por cambios locales pendientes.');
}

client.flushOutbox = SemillaP2PClient.prototype.flushOutbox.bind(client);
globalThis.__outbox = [{
  operationId: 'op_forbidden',
  spaceId: 'space_1',
  request: { spaceId: 'space_1', operation: { operationId: 'op_forbidden', type: 'entity.patch', entityType: 'note', entityId: '1', payload: { patch: { forbidden: true } } } }
}];
globalThis.__rejectCalls = 0;
globalThis.__apiPost = async () => {
  const error = new Error('Permiso revocado');
  error.status = 403;
  throw error;
};
const rejectedFlush = await client.flushOutbox();
if (rejectedFlush.rejected !== 1 || rejectedFlush.pending !== 0 || globalThis.__rejectCalls !== 1) {
  throw new Error('Una operación offline rechazada de forma permanente no fue revertida y retirada atómicamente.');
}
if (!dispatched.some((event) => event.type === 'p2p:operation-reverted')) {
  throw new Error('La interfaz no recibió el evento de reversión de la operación rechazada.');
}

globalThis.__outbox = [{ operationId: 'op_auth', spaceId: 'space_1', request: { spaceId: 'space_1', operation: { operationId: 'op_auth', type: 'entity.put', entityType: 'note', entityId: '1', payload: { value: {} } } } }];
globalThis.__apiPost = async () => {
  const error = new Error('Sesión vencida');
  error.status = 401;
  throw error;
};
const authFlush = await client.flushOutbox();
if (authFlush.rejected !== 0 || authFlush.pending !== 1 || globalThis.__outbox.length !== 1) {
  throw new Error('Una sesión vencida eliminó una operación offline que debía conservarse para reintento.');
}
globalThis.__apiPost = null;

globalThis.__activeSpaceKey = { keyId: 'key_refreshed', keyEpoch: 2 };
client.bootstrapState = {
  spaces: [{
    spaceId: 'space_key_rotated',
    encryptionVersion: 1,
    activeEncryptionKeyId: 'key_previous',
    encryptionKeyEpoch: 1,
    members: []
  }]
};
client.refreshBootstrap = async () => {
  client.bootstrapState.spaces[0] = {
    ...client.bootstrapState.spaces[0],
    activeEncryptionKeyId: 'key_refreshed',
    encryptionKeyEpoch: 2
  };
  return client.bootstrapState;
};
client.ensureCurrentSpaceKey = async () => globalThis.__activeSpaceKey;
const pendingPlainOperation = {
  operationId: 'op_key_rotated',
  type: 'entity.patch',
  entityType: 'note',
  entityId: '1',
  payload: { patch: { preserved: true } },
  clientCreatedAt: new Date().toISOString()
};
globalThis.__outbox = [{
  operationId: pendingPlainOperation.operationId,
  spaceId: 'space_key_rotated',
  plainOperation: pendingPlainOperation,
  request: {
    deviceId: 'dev_source_000001',
    spaceId: 'space_key_rotated',
    includeSourceDevice: false,
    operation: { ...pendingPlainOperation, encrypted: true, encryptionVersion: 1, keyId: 'key_previous', payload: { __p2pEncrypted: true } }
  }
}];
let rotatedPublishCalls = 0;
globalThis.__apiPost = async (_path, request) => {
  rotatedPublishCalls += 1;
  if (rotatedPublishCalls === 1) {
    const error = new Error('Clave anterior');
    error.status = 409;
    error.code = 'P2P_KEY_STALE';
    throw error;
  }
  if (request?.operation?.keyId !== 'key_refreshed') throw new Error('La operación pendiente no fue cifrada con la clave autoritativa nueva.');
  return { deliveredToDevices: 1, sourceDeviceQueued: false, event: null };
};
const rotatedFlush = await client.flushOutbox();
if (rotatedFlush.sent !== 1
  || rotatedFlush.rejected !== 0
  || rotatedFlush.pending !== 0
  || rotatedPublishCalls !== 2
  || globalThis.__rejectCalls !== 1) {
  throw new Error('Una rotación concurrente revirtió o dejó bloqueada una edición local recuperable.');
}
if (!dispatched.some((event) => event.type === 'p2p:outbox-key-refreshed')) {
  throw new Error('No se informó la recodificación de la operación pendiente tras una rotación de clave.');
}
globalThis.__activeSpaceKey = null;
globalThis.__apiPost = null;

client.publish = SemillaP2PClient.prototype.publish.bind(client);
client.user = { userId: 'usr_source' };
client.bootstrapState = {
  spaces: [{ spaceId: 'space_1', members: [{ userId: 'usr_source', permissions: ['read', 'write'] }] }],
  stateRevisions: { space_1: 7 }
};
globalThis.__recoveryRequirements = {};
await client.syncRecoveryRequirements({ localStateRevisions: { space_1: 7 } });
if (client.snapshotRecoveryRequired || Object.keys(globalThis.__recoveryRequirements || {}).length) {
  throw new Error('Una réplica con la misma revisión creó un watermark de recuperación artificial.');
}
await client.syncRecoveryRequirements({ localStateRevisions: { space_1: 6 } });
if (!client.snapshotRecoveryRequired || globalThis.__recoveryRequirements?.space_1 !== 7) {
  throw new Error('Una diferencia real de revisión no conservó su watermark de recuperación.');
}
globalThis.__recoveryRequirements = {};
client.recoveryRequirements = {};
client.snapshotRecoveryRequired = false;
globalThis.__outbox = [];
globalThis.__applyCalls = 0;
let postedRequest = null;
globalThis.__apiPost = async (_path, request) => {
  postedRequest = request;
  return {
    deliveredToDevices: 1,
    sourceDeviceQueued: true,
    event: {
      eventId: 'evt_ordered_source',
      eventType: 'p2p.operation',
      deviceSequence: 8,
      spaceSequence: 9,
      stateRevision: 9,
      spaceId: 'space_1',
      actorUserId: 'usr_source',
      sourceDeviceId: 'dev_source_000001',
      operation: request.operation,
      createdAt: new Date().toISOString()
    }
  };
};
const orderedPublish = await client.patch('space_1', 'note', '1', { ordered: true });
if (!orderedPublish.event || postedRequest?.includeSourceDevice !== true || globalThis.__outbox.length !== 1 || globalThis.__applyCalls !== 0) {
  throw new Error('La publicación local no esperó la confirmación ordenada del propio stream.');
}
await client.handleEvent(orderedPublish.event);
if (globalThis.__outbox.length !== 0 || globalThis.__applyCalls !== 1) {
  throw new Error('La confirmación SSE del dispositivo emisor no consolidó y retiró el outbox.');
}
globalThis.__apiPost = null;

acknowledged = 0;
globalThis.__savedMeta = null;
client.lastProcessedSequence = 0;
client.lastAcceptedStreamSequence = 0;
let recoveredGapOptions = null;
client.refreshBootstrap = async (options = {}) => {
  recoveredGapOptions = options;
  client.snapshotRecoveryRequired = false;
  return { snapshotRequests: [] };
};
await client.handleEvent({
  eventId: 'gap_recovered_by_bootstrap',
  eventType: 'p2p.delivery.gap',
  currentSequence: 12,
  gap: true,
  reason: 'queue_truncated'
});
if (acknowledged !== 12 || globalThis.__savedMeta?.value !== 12) {
  throw new Error('El cliente no avanzó de forma segura tras recuperar un salto sin diferencia de estado.');
}
if (recoveredGapOptions?.requestSnapshots !== 'force' || recoveredGapOptions?.forceRecoveryAllReadable === true) {
  throw new Error('El salto de entrega no limitó la recuperación a diferencias reales de revisión.');
}
if (!dispatched.some((event) => event.type === 'p2p:delivery-gap')) {
  throw new Error('El cliente no informó el salto detectado en la entrega.');
}

acknowledged = 0;
globalThis.__savedMeta = null;
client.lastProcessedSequence = 90;
client.lastAcceptedStreamSequence = 90;
client.highestPendingAck = 90;
client.pendingAckReplicaSpaceIds.add('space_cursor_epoch');
client.refreshBootstrap = async () => {
  client.snapshotRecoveryRequired = false;
  return { snapshotRequests: [] };
};
await client.handleEvent({
  eventId: 'gap_cursor_epoch_reset',
  eventType: 'p2p.delivery.gap',
  currentSequence: 3,
  gap: true,
  reason: 'cursor_ahead_of_server',
  cursorResetRequired: true,
  resetToSequence: 3
});
if (acknowledged !== 3
  || globalThis.__savedMeta?.value !== 3
  || client.lastProcessedSequence !== 3
  || client.lastAcceptedStreamSequence !== 3
  || client.highestPendingAck !== 0
  || client.pendingAckReplicaSpaceIds.size !== 0) {
  throw new Error('El cliente no rebajó de forma cercada el cursor perteneciente a una secuencia anterior del backend.');
}

acknowledged = 0;
globalThis.__savedMeta = null;
client.lastProcessedSequence = 0;
client.lastAcceptedStreamSequence = 0;
client.refreshBootstrap = async () => {
  client.snapshotRecoveryRequired = true;
  return { snapshotRequests: [{ requestId: 'snapshot_gap' }] };
};
await client.handleEvent({
  eventId: 'gap_waiting_snapshot',
  eventType: 'p2p.delivery.gap',
  currentSequence: 20,
  gap: true,
  reason: 'queue_expired_or_already_acknowledged'
});
if (acknowledged !== 0 || globalThis.__savedMeta) {
  throw new Error('El cliente confirmó un salto antes de completar la reconstrucción por snapshot.');
}

const originalWindowSetTimeout = window.setTimeout;
const originalWindowClearTimeout = window.clearTimeout;
const ackTimers = [];
window.setTimeout = (callback, delay) => {
  const timer = { callback, delay: Number(delay || 0), cancelled: false };
  ackTimers.push(timer);
  return timer;
};
window.clearTimeout = (timer) => {
  if (timer) timer.cancelled = true;
};
const flushAckMicrotasks = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};
const takeAckTimer = (expectedDelay) => {
  let timer = ackTimers.shift();
  while (timer?.cancelled) timer = ackTimers.shift();
  if (!timer) throw new Error(`No se programó el ACK esperado de ${expectedDelay} ms.`);
  if (timer.delay !== expectedDelay) {
    throw new Error(`El ACK se programó a ${timer.delay} ms en lugar de ${expectedDelay} ms.`);
  }
  return timer;
};

const ackClient = new SemillaP2PClient();
ackClient.started = true;
ackClient.manualClose = false;
ackClient.realtimeLeader = true;
ackClient.user = { userId: 'usr_ack' };
ackClient.deviceId = 'dev_ack_000001';
ackClient.sessionGeneration = 1;
ackClient.pendingAckReplicaSpaceIds.add('space_ack_applied');
globalThis.__stateRevisions = { space_ack_applied: 19 };
const replicaRefreshRequests = [];
ackClient.scheduleReplicaHealthRefresh = (spaceIds = []) => { replicaRefreshRequests.push([...spaceIds]); };
let ackCalls = 0;
const ackRequests = [];
globalThis.__apiPost = async (path, request) => {
  if (path !== '/api/p2p/events/ack') throw new Error(`Ruta inesperada durante ACK: ${path}`);
  ackCalls += 1;
  ackRequests.push(request);
  if (ackCalls === 1) {
    const error = new Error('Backend temporalmente no disponible');
    error.status = 503;
    throw error;
  }
  return { acknowledged: 1, replicaRevisionHints: { space_ack_applied: 19 } };
};

ackClient.scheduleAck(21);
takeAckTimer(250).callback();
await flushAckMicrotasks();
if (ackCalls !== 1 || ackClient.highestPendingAck !== 21 || ackClient.ackRetryCount !== 1) {
  throw new Error('El ACK fallido no conservó el cursor para reintento seguro.');
}
if (!dispatched.some((event) => event.type === 'p2p:ack-deferred' && event.detail?.retryDelayMs === 1000)) {
  throw new Error('El cliente no informó el primer ACK diferido con retroceso de 1 segundo.');
}
takeAckTimer(1000).callback();
await flushAckMicrotasks();
if (ackCalls !== 2 || ackClient.highestPendingAck !== 0 || ackClient.ackRetryCount !== 0 || ackTimers.some((timer) => !timer.cancelled)) {
  throw new Error('El ACK recuperado dejó cursores o temporizadores residuales.');
}
if (ackRequests[0]?.appliedStateRevisions?.space_ack_applied !== 19
  || ackRequests[1]?.appliedStateRevisions?.space_ack_applied !== 19
  || replicaRefreshRequests[0]?.[0] !== 'space_ack_applied') {
  throw new Error('El ACK no preservó ni reportó la revisión realmente aplicada durante el reintento.');
}

globalThis.__stateRevisions = {};
navigator.onLine = false;
ackClient.scheduleAck(22);
if (ackTimers.some((timer) => !timer.cancelled) || ackClient.highestPendingAck !== 22) {
  throw new Error('El cliente intentó enviar ACK mientras estaba sin conexión.');
}
navigator.onLine = true;
ackClient.scheduleAck(ackClient.highestPendingAck, { immediate: true });
takeAckTimer(0).callback();
await flushAckMicrotasks();
if (ackCalls !== 3 || ackClient.highestPendingAck !== 0) {
  throw new Error('El cursor pendiente no se confirmó al recuperar la conexión.');
}

let resolveInflightAck;
let inflightAckCalls = 0;
globalThis.__apiPost = () => {
  inflightAckCalls += 1;
  if (inflightAckCalls === 1) return new Promise((resolve) => { resolveInflightAck = resolve; });
  return Promise.resolve({ acknowledged: 1 });
};
ackClient.scheduleAck(30, { immediate: true });
takeAckTimer(0).callback();
await flushAckMicrotasks();
if (typeof resolveInflightAck !== 'function' || inflightAckCalls !== 1) {
  throw new Error('El ACK en vuelo no alcanzó la llamada HTTP después de preparar sus comprobantes durables.');
}
ackClient.scheduleAck(31);
if (ackTimers.some((timer) => !timer.cancelled) || ackClient.highestPendingAck !== 31) {
  throw new Error('El cliente abrió un segundo ACK mientras existía otro en vuelo.');
}
resolveInflightAck({ acknowledged: 1 });
await flushAckMicrotasks();
takeAckTimer(250).callback();
await flushAckMicrotasks();
if (ackClient.highestPendingAck !== 0 || ackClient.ackPromise || ackTimers.some((timer) => !timer.cancelled)) {
  throw new Error('La serialización de ACK dejó trabajo pendiente después de confirmar el cursor más alto.');
}

let cursorResetReconnect = false;
ackClient.scheduleReconnect = () => { cursorResetReconnect = true; };
globalThis.__apiPost = async () => {
  const error = new Error('Cursor de una secuencia anterior');
  error.status = 409;
  error.code = 'P2P_ACK_SEQUENCE_AHEAD';
  error.currentSequence = 3;
  throw error;
};
ackClient.scheduleAck(40, { immediate: true });
takeAckTimer(0).callback();
await flushAckMicrotasks();
if (!cursorResetReconnect
  || ackClient.highestPendingAck !== 0
  || ackClient.ackRetryCount !== 0
  || ackTimers.some((timer) => !timer.cancelled)
  || !dispatched.some((event) => event.type === 'p2p:ack-reset-required')) {
  throw new Error('Un ACK perteneciente a una secuencia anterior entró en reintento y pudo confirmar eventos futuros.');
}

globalThis.__apiPost = null;
window.setTimeout = originalWindowSetTimeout;
window.clearTimeout = originalWindowClearTimeout;
navigator.onLine = true;

console.log('OK: snapshot seguro, confirmación SSE ordenada, reversión, recuperación de saltos y ACK serializado con pausa offline, retroceso exponencial y cercado de cursores obsoletos.');
""".strip(),
            encoding="utf-8",
        )
        result = subprocess.run([node, str(script)], cwd=tmp_root, text=True, capture_output=True)
        if result.returncode != 0:
            fail(f"Falló la prueba dinámica de continuidad snapshot: {result.stderr.strip() or result.stdout.strip()}")


def assert_no_update_polling() -> None:
    for relative in JAVASCRIPT_FILES:
        text = (ROOT / relative).read_text(encoding="utf-8")
        for pattern in POLLING_FORBIDDEN_PATTERNS:
            if re.search(pattern, text):
                fail(f"{relative} contiene actualización por polling o intervalo prohibido: {pattern}")


def assert_manifest_icon_fallbacks(manifest: Dict[str, Any]) -> None:
    icons = manifest.get("icons") or []
    if not isinstance(icons, list) or not icons:
        fail("manifest.webmanifest debe declarar icons instalables.")

    png_icons = [icon for icon in icons if str(icon.get("src", "")).startswith("./assets/icons/")]
    data_fallbacks = [icon for icon in icons if str(icon.get("src", "")).startswith("data:image/svg+xml,")]

    if len(png_icons) < 4:
        fail("manifest.webmanifest debe conservar rutas PNG reales para que el logo/íconos se actualicen cuando existan en assets.")
    if len(data_fallbacks) < 4:
        fail("manifest.webmanifest debe incluir fallbacks geométricos data:image/svg+xml para que sea instalable aun sin PNG reales.")

    required_pairs = {("192x192", "any"), ("512x512", "any"), ("192x192", "maskable"), ("512x512", "maskable")}
    fallback_pairs = {(str(icon.get("sizes", "")), str(icon.get("purpose", ""))) for icon in data_fallbacks}
    missing_pairs = sorted(required_pairs - fallback_pairs)
    if missing_pairs:
        fail(f"manifest.webmanifest no cubre fallbacks geométricos instalables: {missing_pairs}")

    for icon in data_fallbacks:
        src = str(icon.get("src", ""))
        if "<svg" in src or "</svg>" in src:
            fail("Los fallbacks SVG del manifest deben estar URL-encoded dentro del data URI.")
        if icon.get("type") != "image/svg+xml":
            fail(f"Fallback geométrico del manifest con type incorrecto: {icon}")


def assert_manifest_matches_textx(languages: Dict[str, Any]) -> None:
    codes_from_files = textx_language_pairs()
    codes_from_manifest = {item.get("code") for item in languages.get("languages", [])}

    missing = sorted(codes_from_files - codes_from_manifest)
    if missing:
        fail(f"textX/languages.json no detecta idiomas presentes en carpetas: {missing}")

    for language in languages.get("languages", []):
        code = language.get("code")
        if not code:
            fail(f"Idioma sin código público: {language}")
        for namespace in ["app", "seo"]:
            route = language.get(namespace)
            if not route:
                fail(f"Idioma sin namespace {namespace}: {language}")
            if not public_path_exists(route):
                fail(f"Archivo de idioma inexistente: {route}")


def assert_release_tracks_languages(version: Dict[str, Any], metadata_text: str) -> None:
    asset_urls = {asset.get("url") for asset in version.get("criticalAssets") or []}
    for code in textx_language_pairs():
        for public_path in [f"./textX/app/{code}.json", f"./textX/seo/{code}.json"]:
            if public_path not in asset_urls:
                fail(f"version.json no incluye idioma en criticalAssets: {public_path}")
            if public_path not in metadata_text:
                fail(f"src/js/app-metadata.js no precachea idioma detectado: {public_path}")


def import_release_generator():
    module_path = ROOT / "tools" / "generate-release.py"
    spec = importlib.util.spec_from_file_location("generate_release", module_path)
    if spec is None or spec.loader is None:
        fail("No se pudo cargar tools/generate-release.py para validar autodetección.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def assert_runtime_backend_injection() -> None:
    generator = import_release_generator()
    managed_names = [
        "APP_BACKEND_URL",
        "SEMILLA_BACKEND_URL",
        "sinBACKEND",
        "APP_SIN_BACKEND",
    ]
    previous = {name: os.environ.get(name) for name in managed_names}
    original_runtime_config = generator.RUNTIME_CONFIG_FILE

    with tempfile.TemporaryDirectory() as tmp:
        runtime_config = Path(tmp) / "runtime-config.js"
        generator.RUNTIME_CONFIG_FILE = runtime_config
        try:
            for name in managed_names:
                os.environ.pop(name, None)
            os.environ["APP_BACKEND_URL"] = '"https://mapsx.app/"'
            os.environ["sinBACKEND"] = '"true"'
            backend_url = generator.update_runtime_config_file(require_backend=True)
            generated = runtime_config.read_text(encoding="utf-8")
            if backend_url != "https://mapsx.app":
                fail("El generador no normaliza APP_BACKEND_URL copiada con comillas o barra final.")
            if 'backendUrl: "https://mapsx.app"' not in generated or "sinBACKEND: true" not in generated:
                fail("runtime-config.js no conserva backendUrl/sinBACKEND normalizados.")

            os.environ.pop("APP_BACKEND_URL", None)
            try:
                generator.update_runtime_config_file(require_backend=True)
                fail("El build de producción debe fallar cuando falta APP_BACKEND_URL.")
            except RuntimeError as error:
                if "APP_BACKEND_URL" not in str(error):
                    fail("El error por backend ausente debe indicar la variable exacta APP_BACKEND_URL.")

            generator.update_runtime_config_file(require_backend=False)
            generated = runtime_config.read_text(encoding="utf-8")
            if "backendUrl: """ not in generated:
                fail("El generador debe limpiar runtime-config.js para evitar conservar una URL antigua.")

            os.environ["APP_BACKEND_URL"] = "ftp://mapsx.app"
            try:
                generator.update_runtime_config_file(require_backend=True)
                fail("APP_BACKEND_URL debe rechazar protocolos distintos de HTTP(S).")
            except ValueError:
                pass
        finally:
            generator.RUNTIME_CONFIG_FILE = original_runtime_config
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value


def assert_generator_autodetects_new_language() -> None:
    generator = import_release_generator()
    es_app = read_json("textX/app/es.json")
    es_seo = read_json("textX/seo/es.json")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)
        textx = tmp_root / "textX"
        (textx / "app").mkdir(parents=True)
        (textx / "seo").mkdir(parents=True)

        for namespace, payload in [("app", es_app), ("seo", es_seo)]:
            for code in ["es", "en", "ar", "zz"]:
                clone = json.loads(json.dumps(payload))
                clone.setdefault("meta", {})["languageCode"] = "es" if code == "zz" else code
                clone.setdefault("meta", {})["languageName"] = "Test Language" if code == "zz" else clone["meta"].get("languageName", code.upper())
                clone.setdefault("meta", {})["nativeName"] = "Idioma de prueba" if code == "zz" else clone["meta"].get("nativeName", code.upper())
                (textx / namespace / f"{code}.json").write_text(json.dumps(clone, ensure_ascii=False, indent=2), encoding="utf-8")

        original_textx = generator.TEXTX_DIR
        original_manifest = generator.LANGUAGE_MANIFEST_FILE
        try:
            generator.TEXTX_DIR = textx
            generator.LANGUAGE_MANIFEST_FILE = textx / "languages.json"
            manifest = generator.discover_languages("2026-07-02T00:00:00-05:00")

            orphan = json.loads(json.dumps(es_app))
            (textx / "app" / "yy.json").write_text(json.dumps(orphan, ensure_ascii=False), encoding="utf-8")
            try:
                generator.discover_languages("2026-07-02T00:00:00-05:00")
                fail("tools/generate-release.py debe fallar si un idioma existe solo en textX/app o solo en textX/seo.")
            except FileNotFoundError:
                pass
        finally:
            generator.TEXTX_DIR = original_textx
            generator.LANGUAGE_MANIFEST_FILE = original_manifest

    languages = {item["code"]: item for item in manifest["languages"]}
    if "zz" not in languages:
        fail("tools/generate-release.py no detectó automáticamente un idioma nuevo pegado en textX.")
    if languages["zz"].get("code") != "zz":
        fail("El código del idioma nuevo debe salir del nombre del archivo, no de metadatos copiados.")
    if languages["zz"].get("htmlLang") != "es":
        fail("El manifiesto debe conservar htmlLang separado cuando el JSON trae metadata heredada.")


def assert_generator_syncs_prompts_and_fingerprints() -> None:
    generator = import_release_generator()

    with tempfile.TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)
        custom_prompt = tmp_root / "assets" / "brand" / "hero.png.txt"
        custom_prompt.parent.mkdir(parents=True)
        custom_prompt.write_text("{}", encoding="utf-8")

        original_root = generator.ROOT
        try:
            generator.ROOT = tmp_root
            prompt_assets = generator.discover_prompt_assets()
        finally:
            generator.ROOT = original_root

    if "./assets/brand/hero.png.txt" not in prompt_assets:
        fail("tools/generate-release.py no detecta prompts nuevos en assets/**/*.png.txt.")

    fake_manifest = {
        "languages": [
            {"code": "es", "app": "./textX/app/es.json", "seo": "./textX/seo/es.json"},
            {"code": "fr", "app": "./textX/app/fr.json", "seo": "./textX/seo/fr.json"},
        ]
    }
    files = generator.fingerprint_check_files(fake_manifest, prompt_assets)
    for expected in ["./textX/app/fr.json", "./textX/seo/fr.json", "./assets/brand/hero.png", "./assets/brand/hero.png.txt"]:
        if expected not in files:
            fail(f"La verificación directa no queda sincronizada con idiomas/assets nuevos: falta {expected}")


def assert_subfolder_entrypoint_normalization() -> None:
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    match = re.search(r'<script id="app-path-bootstrap">([^<]+)</script>', index)
    if not match:
        fail("index.html debe normalizar entradas de subcarpeta sin barra final antes de cargar recursos.")

    script = match.group(1)
    if index.find('id="app-path-bootstrap"') > index.find('href="./src/css/app.css"'):
        fail("La normalización de subcarpeta debe ejecutarse antes de resolver el CSS.")

    for required in [
        "window.location.pathname",
        "window.location.search",
        "window.location.hash",
        "window.location.replace",
        "lastIndexOf('/')",
        "indexOf('.')===-1",
    ]:
        if required not in script:
            fail(f"El bootstrap de ruta perdió la protección requerida: {required}")

    digest = base64.b64encode(hashlib.sha256(script.encode("utf-8")).digest()).decode("ascii")
    csp_token = f"'sha256-{digest}'"
    csp_files = [
        "render.yaml",
        "_headers",
        "vercel.json",
        "deploy/nginx.conf.sample",
        "deploy/apache.htaccess.sample",
        "deploy/docker/nginx.conf",
    ]
    for relative in csp_files:
        content = (ROOT / relative).read_text(encoding="utf-8")
        if csp_token not in content:
            fail(f"{relative} no autoriza el bootstrap de ruta mediante su hash CSP exacto.")


def main() -> None:
    for relative in REQUIRED_FILES + REQUIRED_PROMPTS:
        if not (ROOT / relative).exists():
            fail(f"Falta archivo obligatorio: {relative}")

    assert_subfolder_entrypoint_normalization()
    assert_javascript_syntax()
    assert_replication_contract()
    assert_replica_batch_atomicity()
    assert_local_state_reconciliation()
    assert_storage_durability()
    assert_crypto_roundtrip()
    assert_local_capability_authentication()
    assert_local_network_recovery()
    assert_multitab_coordination()
    assert_session_isolation()
    assert_project_domain()
    assert_trash_lifecycle()
    assert_invitation_notification_intent()
    assert_control_mutation_atomicity()
    assert_retry_after_recovery()
    assert_application_scope()
    assert_service_worker_request_isolation()
    assert_install_prompt()
    assert_snapshot_request_liveness()
    assert_no_update_polling()
    assert_runtime_backend_injection()
    assert_generator_autodetects_new_language()
    assert_generator_syncs_prompts_and_fingerprints()

    index = (ROOT / "index.html").read_text(encoding="utf-8")
    for marker in ['Control de proyectos', 'new-project-button', 'project-list', 'add-purchase-button', 'add-income-button', 'add-projection-button', 'manage-access-button', 'access-dialog', 'access-member-list', 'storage-durability-banner', 'protect-storage-button', 'trash-button', 'trash-dialog', 'action-menu-dialog', 'action-menu-confirm-panel', 'project-filter-input', 'project-filter-clear', 'project-filter-summary']:
        if marker not in index:
            fail(f"index.html no contiene la interfaz administrativa requerida: {marker}.")
    app_source = (ROOT / "src/js/app.js").read_text(encoding="utf-8")
    for marker in ["pendingProjectCreation", "recordByType", "data-action-menu-scope", "admin.project", "admin.purchase", "admin.income", "admin.projection", "requestStorageProtection", "inspectStorageDurability", "semillaP2P.revoke", "semillaP2P.transfer", "semillaP2P.leave", "semillaP2P.updatePermissions", "accessPermissionEditor", "permissionsUpdated", "revokedRotationPending", "referenceGuards", "referenceRequirements", "projectionVarianceLabel", "varianceStatus", "deleteLinkedError", "normalizeProjectFilterText", "projectMatchesFilter", "projectFilterQuery"]:
        if marker not in app_source and marker not in (ROOT / "src/js/project-domain.js").read_text(encoding="utf-8"):
            fail(f"La interfaz administrativa perdió una capacidad funcional requerida: {marker}.")

    for needle in ["manifest.webmanifest", "i18n.js", "skeleton-screen.js", "asset-loader.js", "pwa-install-prompt.js", "pwa-update-manager.js", "pwa-install-dialog", "pwa-install-button", "pwa-install-close", "data-language-selector", "data-skeleton-slot"]:
        if needle not in index:
            fail(f"index.html no contiene {needle}.")

    manifest = read_json("manifest.webmanifest")
    for key in ["name", "short_name", "start_url", "scope", "display", "icons"]:
        if key not in manifest:
            fail(f"manifest.webmanifest no tiene {key}.")
    if manifest.get("display") not in ["standalone", "fullscreen", "minimal-ui"]:
        fail("manifest.webmanifest debe usar display instalable.")
    assert_manifest_icon_fallbacks(manifest)

    languages = read_json("textX/languages.json")
    codes = [item.get("code") for item in languages.get("languages", [])]
    for code in ["es", "en", "ar"]:
        if code not in codes:
            fail(f"textX/languages.json no detecta idioma obligatorio: {code}")
    assert_manifest_matches_textx(languages)
    ar_language = next((item for item in languages.get("languages", []) if item.get("code") == "ar"), None)
    if not ar_language:
        fail("textX/languages.json debe incluir árabe como idioma obligatorio.")
    if ar_language.get("dir") != "rtl" or ar_language.get("htmlLang") != "ar":
        fail("El idioma árabe debe declarar htmlLang=ar y dir=rtl para validar orientación de lectura.")

    css = (ROOT / "src/css/app.css").read_text(encoding="utf-8")
    for needle in ["html[dir=\"rtl\"]", "letter-spacing: 0", "left: calc(16px + var(--safe-left))"]:
        if needle not in css:
            fail(f"src/css/app.css no contiene soporte RTL robusto: {needle}")

    install_prompt = (ROOT / "src/js/pwa-install-prompt.js").read_text(encoding="utf-8")
    if "AppI18n.apply(dialog)" in install_prompt:
        fail("La presentación PWA no debe redisparar el aplicador global de idioma desde app-language-ready.")
    for required in ["beforeinstallprompt", "appinstalled", "display-mode: standalone", "navigator.standalone", "showModal", "installManualIos", "installManualGeneric"]:
        if required not in install_prompt:
            fail(f"src/js/pwa-install-prompt.js perdió una garantía de instalación: {required}")
    for required in ["position: fixed", "inset: 0", ".pwa-install-close", ".pwa-install-button"]:
        if required not in css:
            fail(f"src/css/app.css no centra o presenta correctamente la instalación PWA: {required}")

    for needle in ["project-filter-toolbar", "project-filter-field", "project-filter-summary", "focus-within"]:
        if needle not in css:
            fail(f"src/css/app.css no contiene la interfaz compacta del filtro de proyectos: {needle}")

    for needle in ["is-skeletonscreen-active", "data-skeleton-slot", "skeletonscreen-shimmer", "prefers-reduced-motion"]:
        if needle not in css:
            fail(f"src/css/app.css no contiene skeletonscreen robusto: {needle}")

    for code in sorted(textx_language_pairs() - {"es"}):
        assert_same_keys("textX/app/es.json", f"textX/app/{code}.json")
        assert_same_keys("textX/seo/es.json", f"textX/seo/{code}.json")

    for code in sorted(textx_language_pairs()):
        payload = read_json(f"textX/app/{code}.json")
        for namespace, key in [("projection", "overBudget"), ("projection", "underBudget"), ("projection", "onBudget"), ("projection", "deleteLinkedError"), ("p2p", "referenceDeletePreserved"), ("access", "deleteProject"), ("access", "deleteConfirm"), ("access", "deletedRemote"), ("trash", "title"), ("trash", "restore"), ("trash", "deletePermanently"), ("trash", "confirmPermanentProject"), ("actions", "projectMenu"), ("dashboard", "filterLabel"), ("dashboard", "filterPlaceholder"), ("dashboard", "clearFilter"), ("dashboard", "filterResults"), ("dashboard", "filterNoResultsTitle"), ("dashboard", "filterNoResultsDescription")]:
            if not str(payload.get(namespace, {}).get(key, "")).strip():
                fail(f"textX/app/{code}.json no contiene el texto funcional {namespace}.{key}.")

    config = (ROOT / "src/js/config.js").read_text(encoding="utf-8")
    manager = (ROOT / "src/js/pwa-update-manager.js").read_text(encoding="utf-8")
    p2p_client = (ROOT / "src/js/p2p-client.js").read_text(encoding="utf-8")
    for required in ["enqueueEvent(payload)", "this.eventPipeline", "this.eventPipelineBlocked", "Math.max(this.lastProcessedSequence, sequence)", "stateRevisions", "snapshotChunksByBytes", "replaceBootstrapControlState", "saveControlStateAtomically", "snapshotRecoveryRequired", "reconcileSnapshotRecovery", "p2p:snapshot-source-error", "p2p:snapshot-source-deferred", "pendingForSpace", "hasOptimisticEntities", "queueWhenOffline: false", "request.expiresAt", "enqueueOptimisticOperation", "enqueueOptimisticOperationBatch", "enqueueOutboxBatch", "publishBatch", "publish-batch", "revertRejectedOutboxBatch", "abortBatchOnFailure", "P2P_BATCH_CANCELLED", "rejectOutboxOperation", "p2p:operation-reverted", "isPermanentOutboxRejection", "orderedSourceConfirmation", "normalizePublishDeliveryIntent", "P2P_PARTIAL_STATE_DELIVERY_FORBIDDEN", "includeSourceDevice: deliveryIntent.includeSourceDevice", "'entity.put', 'entity.patch', 'entity.trash', 'entity.restore', 'entity.purge', 'entity.delete', 'custom'", "operationType: entity.operationType", "purgeLocalSpace", "p2p.membership.revoked", "p2p.space.deleted", "async deleteSpace(", "'/api/p2p/access/delete'", "async leave(", "async revoke(", "async updatePermissions(", "async transfer(", "requestId: String(options.requestId || options.clientRequestId || '').trim()", "async createSpace(options = {})", "error.p2pQueued = true", "normalizeDeleteReferenceGuards", "referenceGuards: normalizedReferenceGuards", "pendingAtomicEventBatches", "collectAtomicTransportBatch", "handleEventBatch", "applyDecryptedOperationEventBatch", "event-batch-assembly"]:
        if required not in p2p_client:
            fail(f"src/js/p2p-client.js perdió la tubería secuencial o el cursor monótono: {required}")
    if "this.handleEvent(payload)" in p2p_client:
        fail("src/js/p2p-client.js no debe aplicar callbacks SSE directamente en paralelo.")
    if p2p_client.find("await this.flushOutbox()") > p2p_client.find("await this.openRealtime()"):
        fail("La réplica abre el stream antes de confirmar su outbox y podría servir snapshots con cambios no canónicos.")
    publish_block = p2p_client[p2p_client.find("async publish("):p2p_client.find("put(spaceId", p2p_client.find("async publish("))]
    if publish_block.find("removeOutbox(normalized.operationId)") < publish_block.find("applyP2PEvent(data.event)"):
        fail("publish elimina el outbox antes de materializar la confirmación canónica local.")
    if "} else if (event.eventType === 'p2p.snapshot.request') {\n      await this.sendSnapshot(event);" in p2p_client:
        fail("Una solicitud de snapshot vencida todavía puede bloquear la tubería realtime antes del ACK.")
    p2p_crypto = (ROOT / "src/js/p2p-crypto.js").read_text(encoding="utf-8")
    for required in ["ECDH-P256+HKDF-SHA256+A256GCM", "AES-GCM", "deferEncryptedEvent", "purgeSpaceCrypto", "createSpaceKeyEnvelope", "encryptSnapshotEntities"]:
        if required not in p2p_crypto:
            fail(f"src/js/p2p-crypto.js perdió la capa de cifrado P2P: {required}")
    for required in ["encryptOperationForTransport", "decryptOperationEvent", "isRejectedEncryptedPayloadError", "rejectEncryptedTransportEvents", "excludedSnapshotSourceDeviceIdsBySpace", "p2p.key.request", "p2p.key.envelope", "requestSpaceKey", "purgeSpaceCrypto", "assertEncryptedTransportEvent", "createRejectedEncryptedPayloadError"]:
        if required not in p2p_client:
            fail(f"src/js/p2p-client.js perdió la integración de cifrado P2P: {required}")

    p2p_tabs = (ROOT / "src/js/p2p-tab-coordinator.js").read_text(encoding="utf-8")
    for required in ["navigatorRef?.locks", "ifAvailable", "leaseTtlMs", "BroadcastChannelRef", "state-request", "leader-active"]:
        if required not in p2p_tabs:
            fail(f"src/js/p2p-tab-coordinator.js perdió coordinación multiventana: {required}")
    for required in ["P2PTabCoordinator", "realtimeLeader", "bindTabRelays", "outbox-ready", "sharedTab", "removeSpaceFromBootstrapState", "addRelay('p2p:space-deleted'", "addRelay('p2p:access-revoked'", "type === 'space-deleted'", "type === 'access-revoked'", "this.realtimeLeader ? 'new-device' : false", "if (!this.realtimeLeader) return;"]:
        if required not in p2p_client:
            fail(f"src/js/p2p-client.js perdió la integración multiventana: {required}")
    for required in ["sessionToken: getSessionToken()", "String(context.sessionToken || '') === getSessionToken()", "isSessionChangedError(error)"]:
        if required not in p2p_client:
            fail(f"src/js/p2p-client.js perdió el aislamiento de sesión: {required}")
    api_source = (ROOT / "src/js/api.js").read_text(encoding="utf-8")
    for required in ["SESSION_CHANGED_ERROR_CODE", "subscribeSessionTokenChanges", "clearSessionToken", "assertRequestSession"]:
        if required not in api_source:
            fail(f"src/js/api.js perdió el aislamiento de sesión: {required}")
    if "error.code = 'BACKEND_NOT_CONFIGURED'" not in api_source:
        fail("src/js/api.js debe conservar un código estructurado cuando falta el backend.")
    if "auth.backendNotConfigured" not in app_source:
        fail("src/js/app.js debe mostrar un mensaje de producción cuando el build no inyectó el backend.")
    for required in ["synchronizeExternalSession", "queueExternalSessionSynchronization", "resetUserScopedInterface", "subscribeSessionTokenChanges", "delete-project", "p2p:space-deleted", "p2p:access-revoked", "semillaP2P.deleteProjectAfterReplicas"]:
        if required not in app_source:
            fail(f"src/js/app.js perdió la transición segura de cuenta: {required}")

    invitation_intent = (ROOT / "src/js/p2p-invitation-intent.js").read_text(encoding="utf-8")
    for required in ["readInvitationIntent", "invitationIntentFromServiceWorkerMessage", "findPendingInvitation", "clearInvitationIntentFromUrl"]:
        if required not in invitation_intent:
            fail(f"src/js/p2p-invitation-intent.js perdió el flujo de apertura de invitaciones: {required}")
    for required in ["pendingInvitationId", "refreshInvitationIntent", "invitationIntentFromServiceWorkerMessage", "revealPendingInvitationIntent"]:
        if required not in app_source:
            fail(f"src/js/app.js perdió la apertura automática desde Web Push: {required}")

    p2p_storage = (ROOT / "src/js/p2p-storage.js").read_text(encoding="utf-8")
    for required in ["STATE_REVISION_META_PREFIX", "listStateRevisions", "incomingStateRevision", "confirmedStateRevision", "pendingOperations", "enqueueOptimisticOperation", "enqueueOptimisticOperationBatch", "enqueueOutboxBatch", "rejectOutboxOperation", "rejectOutboxOperationBatch", "discardPendingOperationRecord", "confirmOutboxOperation", "outboxConfirmed", "'entity.put', 'entity.patch', 'entity.trash', 'entity.restore', 'entity.purge', 'entity.delete', 'custom'", "source.operationType === 'custom'", "confirmedOperationType", "findRemovedSpaceIds", "snapshotRecordSpaceId", "RECOVERY_REQUIREMENTS_META_KEY", "findReferenceGuardConflictsFromRecords", "__reference__", "referenceConflicts", "applyP2PEventBatch", "atomicBatchDescriptor", "transaction.abort()"]:
        if required not in p2p_storage:
            fail(f"src/js/p2p-storage.js perdió anti-entropía o preservación de versión optimista: {required}")
    p2p_durability = (ROOT / "src/js/p2p-durability.js").read_text(encoding="utf-8")
    for required in ["requestPersistentStorage", "inspectStorageDurability", "calculateStorageDurability", "low-space", "best-effort"]:
        if required not in p2p_durability:
            fail(f"src/js/p2p-durability.js perdió la protección local: {required}")
    for required in ["onversionchange", "onblocked", "P2P_STORAGE_QUOTA_EXCEEDED", "p2p:storage-risk"]:
        if required not in p2p_storage:
            fail(f"src/js/p2p-storage.js perdió manejo del ciclo de vida o cuota: {required}")

    if "updateCheckIntervalMs: 0" not in config or "periodicUpdateChecksEnabled: false" not in config:
        fail("config.js debe dejar desactivadas las revisiones periódicas.")
    for optional_asset in ["./assets/icons/logo.png", "./assets/icons/icon-192.png", "./assets/icons/icon-512.png"]:
        if optional_asset not in config:
            fail(f"config.js debe vigilar cambios del asset opcional: {optional_asset}")
    if "fetchBytesNoStore" not in manager or "missing:0" not in manager:
        fail("pwa-update-manager.js debe tolerar assets opcionales ausentes y detectar cuando aparezcan.")

    skeleton = (ROOT / "src/js/skeleton-screen.js").read_text(encoding="utf-8")
    for needle in ["DEFAULT_DELAY_MS = 500", "begin", "track", "decorateAsync", "aria-busy", "is-skeletonscreen-active"]:
        if needle not in skeleton:
            fail(f"src/js/skeleton-screen.js no contiene infraestructura esperada: {needle}")

    i18n = (ROOT / "src/js/i18n.js").read_text(encoding="utf-8")
    asset_loader = (ROOT / "src/js/asset-loader.js").read_text(encoding="utf-8")
    for relative, text in [("src/js/i18n.js", i18n), ("src/js/asset-loader.js", asset_loader)]:
        if "AppSkeletonScreen" not in text or "delayMs" not in text:
            fail(f"{relative} debe usar skeletonscreen en esperas perceptibles.")

    skeleton_docs = (ROOT / "docs/skeletonscreen.md").read_text(encoding="utf-8")
    for needle in ["500 milisegundos", "AppSkeletonScreen", "data-skeleton-slot", "No usar polling"]:
        if needle not in skeleton_docs:
            fail(f"docs/skeletonscreen.md no documenta la regla skeletonscreen: {needle}")
    for needle in ["prefetchReleaseAssetsOnCheck", "PREFETCH_URLS", "criticalAssets", "last-prefetched-release-assets-key"]:
        if needle not in manager and needle not in config:
            fail(f"Falta precarga por evento de assets de release: {needle}")

    version = read_json("version.json")
    assets = version.get("criticalAssets") or []
    if not assets:
        fail("version.json debe incluir criticalAssets.")
    if version.get("updateStrategy", {}).get("clientPolling") != "disabled":
        fail("version.json debe declarar clientPolling disabled.")
    if "i18n" not in version:
        fail("version.json debe incluir metadatos i18n.")
    if "assetPrompts" not in version or "files" not in version.get("assetPrompts", {}):
        fail("version.json debe incluir metadatos de prompts de assets autodetectados.")

    for asset in assets:
        url = asset.get("url", "")
        expected = asset.get("sha256", "")
        if not url or not expected:
            fail("Cada criticalAsset debe tener url y sha256.")
        relative = url[2:] if url.startswith("./") else url.lstrip("/")
        file_path = ROOT / relative
        if not file_path.exists():
            fail(f"criticalAsset no existe: {url}")
        actual = sha256(file_path)
        if actual != expected:
            fail(f"Huella incorrecta en {url}: {actual} != {expected}")

    metadata_text = (ROOT / "src/js/app-metadata.js").read_text(encoding="utf-8")
    if "./src/js/application-scope.js" not in metadata_text:
        fail("El alcance por aplicación debe formar parte del precache offline.")
    if "./src/js/project-domain.js" not in metadata_text:
        fail("El módulo administrativo importado debe formar parte del precache offline.")
    if "./src/js/p2p-durability.js" not in metadata_text:
        fail("El módulo de durabilidad local debe formar parte del precache offline.")
    if "./src/js/p2p-tab-coordinator.js" not in metadata_text:
        fail("El coordinador P2P multiventana debe formar parte del precache offline.")
    if "./src/js/p2p-invitation-intent.js" not in metadata_text:
        fail("El manejador de invitaciones Push debe formar parte del precache offline.")
    if not any(asset.get("url") == "./src/js/application-scope.js" for asset in assets):
        fail("version.json debe verificar la huella del alcance por aplicación.")
    if not any(asset.get("url") == "./src/js/project-domain.js" for asset in assets):
        fail("version.json debe verificar la huella del módulo administrativo.")
    if not any(asset.get("url") == "./src/js/p2p-durability.js" for asset in assets):
        fail("version.json debe verificar la huella del módulo de durabilidad local.")
    if not any(asset.get("url") == "./src/js/p2p-tab-coordinator.js" for asset in assets):
        fail("version.json debe verificar la huella del coordinador multiventana.")
    if not any(asset.get("url") == "./src/js/p2p-invitation-intent.js" for asset in assets):
        fail("version.json debe verificar la huella del manejador de invitaciones Push.")
    assert_release_tracks_languages(version, metadata_text)

    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    for needle in ["skipWaiting", "clients.claim", "navigationPreload", "APP_SW_ACTIVATED", "textX/languages.json", "src/js/skeleton-screen.js", "src/js/p2p-invitation-intent.js", "P2P_PUSH_RECEIVED", "createGeneratedImageFallbackResponse", "networkFirstWithGeneratedImageFallback", "isApplicationOwnedUrl", "isOwnedMessageSource", "isApplicationClientUrl", "rootOwnedPathPrefixes", "rootNavigationPaths"]:
        if needle not in sw:
            fail(f"sw.js no contiene señal esperada: {needle}")
    for needle in ["createCanonicalOptionalAssetRequest", "cache.put(canonicalRequest", "ignoreSearch: true"]:
        if needle not in sw:
            fail(f"sw.js debe cachear íconos/logos opcionales de forma canónica para que el logo real sustituya el fallback y funcione offline: {needle}")
    for needle in ["INTERNAL_CACHE_BUST_PARAMS", "createRuntimeCacheRequest", "hasOnlyInternalCacheBustParams", "cache.put(cacheRequest"]:
        if needle not in sw:
            fail(f"sw.js debe normalizar parámetros internos de actualización/i18n para no llenar Cache Storage con entradas temporales: {needle}")
    for needle in ["isUsableImageResponse", "contentType === 'text/html'", "buildOptionalImageFallbackReason"]:
        if needle not in sw:
            fail(f"sw.js debe rechazar rewrites SPA HTML como si fueran imágenes opcionales reales: {needle}")

    headers = (ROOT / "_headers").read_text(encoding="utf-8")
    for route in ["/sw.js", "/version.json", "/index.html", "/textX/*"]:
        if route not in headers:
            fail(f"_headers no define reglas para {route}")
    if "no-store" not in headers:
        fail("_headers debe usar no-store para archivos críticos.")

    render = (ROOT / "render.yaml").read_text(encoding="utf-8")
    for needle in ["runtime: static", "buildCommand: python tools/generate-release.py", "staticPublishPath: .", "source: /*", "destination: /index.html"]:
        if needle not in render:
            fail(f"render.yaml no contiene configuración Render esperada: {needle}")
    if not re.search(r"(?m)^\s*- key: sinBACKEND\s*$", render):
        fail("render.yaml debe exponer la variable pública sinBACKEND para activar el bloque P2P_sin_ desde el Blueprint de Render.")
    if "--require-backend" not in render:
        fail("Render debe impedir un despliegue de producción sin APP_BACKEND_URL.")
    if not re.search(r'(?ms)^\s*- key: sinBACKEND\s*\n\s*value: ["\']false["\']\s*$', render):
        fail("sinBACKEND debe quedar desactivado por defecto en Render para conservar el flujo normal con memoriaBACKEND.")

    generator = (ROOT / "tools/generate-release.py").read_text(encoding="utf-8")
    for needle in ["discover_languages", "textX/app/*.json", "metadata_precache_urls", "update_metadata_file", "update_config_file", "update_runtime_config_file", "normalize_backend_url", "--require-backend", "render_environment", "os.environ.get(\"sinBACKEND\")", "APP_SIN_BACKEND", "discover_prompt_assets", "validate_language_key_parity", "codeSource", "src/js/application-scope.js", "src/js/skeleton-screen.js", "src/js/p2p-durability.js", "src/js/p2p-tab-coordinator.js", "src/js/p2p-invitation-intent.js", "src/js/p2p-permissions.js"]:
        if needle not in generator:
            fail(f"tools/generate-release.py no conserva autodetección/sincronización robusta: {needle}")

    print("OK: semilla PWA validada con i18n ES/EN/AR, RTL, autodetección release y cero polling.")


if __name__ == "__main__":
    main()
