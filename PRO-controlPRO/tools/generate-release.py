#!/usr/bin/env python3
"""
Genera o actualiza `version.json` y `textX/languages.json` con huellas SHA-256.

Uso básico:
  python tools/generate-release.py

Uso con versión/build:
  python tools/generate-release.py --version 1.3.1 --build 2026-07-02-005

No requiere dependencias externas. Está pensado para CI/CD, Render Static Site,
Vercel, Netlify, Cloudflare Pages o cualquier hosting estático.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set
from urllib.parse import quote, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT / "version.json"
METADATA_FILE = ROOT / "src" / "js" / "app-metadata.js"
CONFIG_FILE = ROOT / "src" / "js" / "config.js"
RUNTIME_CONFIG_FILE = ROOT / "src" / "js" / "runtime-config.js"
TEXTX_DIR = ROOT / "textX"
LANGUAGE_MANIFEST_FILE = TEXTX_DIR / "languages.json"
MANIFEST_FILE = ROOT / "manifest.webmanifest"
INDEX_FILE = ROOT / "index.html"

DEFAULT_FALLBACK_LANGUAGE = "es"
DEFAULT_CRITICAL_ASSETS = [
    "./index.html",
    "./offline.html",
    "./manifest.webmanifest",
    "./sw.js",
    "./src/css/app.css",
    "./src/js/app-metadata.js",
    "./src/js/runtime-config.js",
    "./src/js/config.js",
    "./src/js/application-scope.js",
    "./src/js/api.js",
    "./src/js/firebase-auth.js",
    "./src/js/p2p-storage.js",
    "./src/js/p2p-durability.js",
    "./src/js/p2p-crypto.js",
    "./src/js/p2p-tab-coordinator.js",
    "./src/js/p2p-client.js",
    "./src/js/p2p-audit.js",
    "./src/js/p2p-permissions.js",
    "./src/js/p2p-space-creation-intent.js",
    "./src/js/p2p-invitation-intent.js",
    "./src/js/project-domain.js",
    "./src/js/device-management.js",
    "./src/js/skeleton-screen.js",
    "./src/js/i18n.js",
    "./src/js/asset-loader.js",
    "./src/js/pwa-install-prompt.js",
    "./src/js/pwa-update-manager.js",
    "./src/js/app.js",
]

APP_ICON_SPECS = [
    {"path": "./assets/logoAPP_16x16.png", "sizes": "16x16", "purpose": "any"},
    {"path": "./assets/logoAPP_32x32.png", "sizes": "32x32", "purpose": "any"},
    {"path": "./assets/logoAPP_48x48.png", "sizes": "48x48", "purpose": "any"},
    {"path": "./assets/logoAPP_72x72.png", "sizes": "72x72", "purpose": "any"},
    {"path": "./assets/logoAPP_96x96.png", "sizes": "96x96", "purpose": "any"},
    {"path": "./assets/logoAPP_128x128.png", "sizes": "128x128", "purpose": "any"},
    {"path": "./assets/logoAPP_144x144.png", "sizes": "144x144", "purpose": "any"},
    {"path": "./assets/logoAPP_152x152.png", "sizes": "152x152", "purpose": "any"},
    {"path": "./assets/logoAPP_180x180.png", "sizes": "180x180", "purpose": "any"},
    {"path": "./assets/logoAPP_192x192.png", "sizes": "192x192", "purpose": "any"},
    {"path": "./assets/logoAPP_384x384.png", "sizes": "384x384", "purpose": "any"},
    {"path": "./assets/logoAPP_512x512.png", "sizes": "512x512", "purpose": "any"},
    {"path": "./assets/logoAPP_maskable_192x192.png", "sizes": "192x192", "purpose": "maskable"},
    {"path": "./assets/logoAPP_maskable_512x512.png", "sizes": "512x512", "purpose": "maskable"}
]

OPTIONAL_RUNTIME_ASSETS = [
    "./P2P_sin_RED_LOCALx/P2P_sin_transport.js",
    *[item["path"] for item in APP_ICON_SPECS],
]

DEFAULT_PROMPT_ASSETS = [f"{item['path']}.txt" for item in APP_ICON_SPECS]



def read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def public_to_file(public_path: str) -> Path:
    relative = public_path[2:] if public_path.startswith("./") else public_path.lstrip("/")
    return ROOT / relative


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def app_icon_source_file(public_path: str) -> Path | None:
    image = public_to_file(public_path)
    if image.exists():
        return image
    prompt = Path(str(image) + ".txt")
    return prompt if prompt.exists() else None


def validate_png_dimensions(public_path: str, expected_sizes: str) -> None:
    image = public_to_file(public_path)
    if not image.exists():
        return

    raw = image.read_bytes()
    if len(raw) < 33 or raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{public_path} existe pero no es un PNG válido.")

    offset = 8
    width = height = 0
    saw_ihdr = saw_idat = saw_iend = False
    while offset + 12 <= len(raw):
        length = struct.unpack(">I", raw[offset:offset + 4])[0]
        chunk_type = raw[offset + 4:offset + 8]
        data_start = offset + 8
        data_end = data_start + length
        crc_end = data_end + 4
        if crc_end > len(raw):
            raise ValueError(f"{public_path} contiene un chunk PNG truncado.")

        chunk_data = raw[data_start:data_end]
        expected_crc = struct.unpack(">I", raw[data_end:crc_end])[0]
        actual_crc = zlib.crc32(chunk_type)
        actual_crc = zlib.crc32(chunk_data, actual_crc) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            raise ValueError(f"{public_path} contiene un chunk PNG con CRC inválido.")

        if chunk_type == b"IHDR":
            if saw_ihdr or offset != 8 or length != 13:
                raise ValueError(f"{public_path} contiene un IHDR PNG inválido.")
            width, height = struct.unpack(">II", chunk_data[:8])
            saw_ihdr = True
        elif chunk_type == b"IDAT":
            saw_idat = True
        elif chunk_type == b"IEND":
            if length != 0:
                raise ValueError(f"{public_path} contiene un IEND PNG inválido.")
            saw_iend = True
            offset = crc_end
            break

        offset = crc_end

    if not (saw_ihdr and saw_idat and saw_iend) or offset != len(raw):
        raise ValueError(f"{public_path} no contiene una estructura PNG completa.")

    expected_width, expected_height = (int(value) for value in expected_sizes.lower().split("x", 1))
    if (width, height) != (expected_width, expected_height):
        raise ValueError(
            f"{public_path} debe medir {expected_width}x{expected_height}px, "
            f"pero mide {width}x{height}px."
        )


def app_icon_fingerprint(public_path: str) -> str:
    source = app_icon_source_file(public_path)
    return sha256_file(source)[:20] if source else "missing"


def versioned_app_icon_url(public_path: str) -> str:
    return f"{public_path}?v={app_icon_fingerprint(public_path)}"


def build_app_identity() -> Dict[str, Any]:
    icons: List[Dict[str, Any]] = []
    for spec in APP_ICON_SPECS:
        public_path = str(spec["path"])
        image = public_to_file(public_path)
        validate_png_dimensions(public_path, str(spec["sizes"]))
        icons.append({
            "url": versioned_app_icon_url(public_path),
            "path": public_path,
            "sizes": spec["sizes"],
            "purpose": spec["purpose"],
            "fingerprint": app_icon_fingerprint(public_path),
            "available": image.exists(),
        })

    fingerprint_material = "|".join(
        f"{item['path']}:{item['fingerprint']}:{item['purpose']}" for item in icons
    ).encode("utf-8")
    icon_version = hashlib.sha256(fingerprint_material).hexdigest()[:20]

    by_path = {item["path"]: item for item in icons}
    return {
        "manifest": "./manifest.webmanifest",
        "iconVersion": icon_version,
        "updateMode": "fingerprinted-icon-url",
        "interfaceLogo": by_path["./assets/logoAPP_192x192.png"]["url"],
        "favicon": by_path["./assets/logoAPP_32x32.png"]["url"],
        "appleTouchIcon": by_path["./assets/logoAPP_180x180.png"]["url"],
        "notificationIcon": by_path["./assets/logoAPP_192x192.png"]["url"],
        "icons": icons,
    }


def generated_icon_fallback_data_uri(size: int, *, maskable: bool = False) -> str:
    radius = round(size * (0.28 if maskable else 0.22))
    margin = round(size * (0.20 if maskable else 0.12))
    inner = size - (margin * 2)
    stroke = max(2, round(size * 0.055))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}" role="img" aria-label="Logo geométrico de respaldo">'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#128c7e"/><stop offset="1" stop-color="#075e54"/></linearGradient></defs>'
        f'<rect width="{size}" height="{size}" rx="{radius}" fill="url(#g)"/>'
        f'<circle cx="{size/2:g}" cy="{size/2:g}" r="{inner*0.23:g}" fill="none" stroke="#fff" stroke-width="{stroke}" opacity=".94"/>'
        f'<path d="M {margin} {size/2:g} C {size*0.28:g} {size*0.23:g}, {size*0.43:g} {size*0.23:g}, {size/2:g} {size/2:g} C {size*0.57:g} {size*0.77:g}, {size*0.72:g} {size*0.77:g}, {size-margin} {size/2:g}" fill="none" stroke="#fff" stroke-width="{stroke}" stroke-linecap="round" opacity=".94"/>'
        '</svg>'
    )
    return "data:image/svg+xml," + quote(svg, safe="")


def update_manifest_file(app_identity: Dict[str, Any]) -> None:
    manifest = read_json(MANIFEST_FILE)
    manifest_icons = [
        {
            "src": item["url"],
            "sizes": item["sizes"],
            "type": "image/png",
            "purpose": item["purpose"],
        }
        for item in app_identity["icons"]
    ]
    for size in (192, 512):
        manifest_icons.append({
            "src": generated_icon_fallback_data_uri(size),
            "sizes": f"{size}x{size}",
            "type": "image/svg+xml",
            "purpose": "any",
        })
        manifest_icons.append({
            "src": generated_icon_fallback_data_uri(size, maskable=True),
            "sizes": f"{size}x{size}",
            "type": "image/svg+xml",
            "purpose": "maskable",
        })

    manifest["icons"] = manifest_icons
    shortcut_icon = next(
        item for item in app_identity["icons"]
        if item["path"] == "./assets/logoAPP_192x192.png"
    )
    for shortcut in manifest.get("shortcuts", []):
        shortcut["icons"] = [{
            "src": shortcut_icon["url"],
            "sizes": shortcut_icon["sizes"],
            "type": "image/png",
        }]
    write_json(MANIFEST_FILE, manifest)


def replace_role_url(text: str, role: str, value: str, attribute: str = "href", *, replace_all: bool = False) -> str:
    tag_pattern = re.compile(rf'<[^>]*\bdata-app-icon-role="{re.escape(role)}"[^>]*>')
    matches = list(tag_pattern.finditer(text))
    if not matches:
        raise RuntimeError(f"No se encontró data-app-icon-role={role} en index.html")

    selected = matches if replace_all else matches[:1]
    chunks: List[str] = []
    cursor = 0
    for match in selected:
        tag = match.group(0)
        attribute_pattern = re.compile(rf'(\b{re.escape(attribute)}=")[^"]+(")')
        updated_tag, count = attribute_pattern.subn(rf'\g<1>{value}\g<2>', tag, count=1)
        if count != 1:
            raise RuntimeError(f"El rol {role} no contiene el atributo {attribute} esperado.")
        chunks.append(text[cursor:match.start()])
        chunks.append(updated_tag)
        cursor = match.end()
    chunks.append(text[cursor:])
    return "".join(chunks)


def update_index_identity(app_identity: Dict[str, Any]) -> None:
    text = INDEX_FILE.read_text(encoding="utf-8")
    text = replace_role_url(text, "favicon", app_identity["favicon"])
    text = replace_role_url(text, "apple-touch-icon", app_identity["appleTouchIcon"])

    text = replace_role_url(
        text,
        "interface-logo",
        app_identity["interfaceLogo"],
        attribute="data-image-src",
        replace_all=True,
    )
    INDEX_FILE.write_text(text, encoding="utf-8")


def asset_record(public_path: str, *, required: bool = True) -> Dict[str, Any] | None:
    file_path = public_to_file(public_path)
    if not file_path.exists():
        if required:
            raise FileNotFoundError(f"No existe el archivo crítico: {public_path}")
        return None

    return {
        "url": public_path,
        "sha256": sha256_file(file_path),
        "bytes": file_path.stat().st_size,
    }


def file_to_public(path: Path) -> str:
    return "./" + path.relative_to(ROOT).as_posix()


def png_path_from_prompt(public_prompt_path: str) -> str:
    return public_prompt_path[:-4] if public_prompt_path.endswith(".txt") else public_prompt_path


def discover_prompt_assets() -> List[str]:
    assets_dir = ROOT / "assets"
    discovered = [file_to_public(path) for path in assets_dir.glob("**/*.png.txt")] if assets_dir.exists() else []
    return ordered_unique(DEFAULT_PROMPT_ASSETS + sorted(discovered))


def discover_optional_runtime_assets(prompt_assets: Iterable[str]) -> List[str]:
    prompt_images = [png_path_from_prompt(path) for path in prompt_assets]
    return ordered_unique(OPTIONAL_RUNTIME_ASSETS + prompt_images)


def build_release_id(version: str, build: str) -> str:
    return f"semilla-appweb-pwa@{version}+{build}"


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def flatten_keys(payload: Dict[str, Any], prefix: str = "") -> List[str]:
    if not isinstance(payload, dict):
        raise ValueError("El archivo JSON de idioma debe ser un objeto en la raíz.")

    keys: List[str] = []
    for key, value in payload.items():
        current = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict):
            keys.extend(flatten_keys(value, current))
        else:
            keys.append(current)
    return sorted(keys)


def validate_language_key_parity(reference_path: Path, candidate_path: Path, namespace: str) -> None:
    try:
        reference_keys = flatten_keys(read_json(reference_path))
        candidate_keys = flatten_keys(read_json(candidate_path))
    except json.JSONDecodeError as error:
        raise ValueError(f"JSON inválido en textX/{namespace}/{candidate_path.name}: {error}") from error

    if reference_keys == candidate_keys:
        return

    missing = sorted(set(reference_keys) - set(candidate_keys))
    extra = sorted(set(candidate_keys) - set(reference_keys))
    raise ValueError(
        f"Idioma incompleto en textX/{namespace}/{candidate_path.name}. "
        f"Debe usar exactamente las mismas keys de {reference_path.name}. "
        f"Faltan={missing}. Sobran={extra}."
    )


def read_text_language_meta(path: Path, code: str) -> Dict[str, str]:
    payload = read_json(path)
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}

    # El código público del idioma se toma del nombre del archivo para que pegar
    # textX/app/fr.json + textX/seo/fr.json sea suficiente y no dependa de editar código.
    return {
        "code": code,
        "htmlLang": str(meta.get("languageCode") or code),
        "name": str(meta.get("languageName") or code.upper()),
        "nativeName": str(meta.get("nativeName") or meta.get("languageName") or code.upper()),
        "dir": str(meta.get("dir") or "ltr"),
    }


def discover_languages(released_at: str) -> Dict[str, Any]:
    app_dir = TEXTX_DIR / "app"
    seo_dir = TEXTX_DIR / "seo"
    app_codes = {path.stem for path in app_dir.glob("*.json")} if app_dir.exists() else set()
    seo_codes = {path.stem for path in seo_dir.glob("*.json")} if seo_dir.exists() else set()

    only_app = sorted(app_codes - seo_codes)
    only_seo = sorted(seo_codes - app_codes)
    if only_app or only_seo:
        raise FileNotFoundError(
            "Cada idioma debe existir en ambas carpetas textX/app y textX/seo. "
            f"Falta SEO para={only_app}. Falta APP para={only_seo}."
        )

    valid_codes = sorted(app_codes & seo_codes)

    if DEFAULT_FALLBACK_LANGUAGE in valid_codes:
        valid_codes.remove(DEFAULT_FALLBACK_LANGUAGE)
        valid_codes.insert(0, DEFAULT_FALLBACK_LANGUAGE)

    if not valid_codes:
        raise FileNotFoundError("textX necesita al menos un idioma con app/<codigo>.json y seo/<codigo>.json")

    fallback_code = DEFAULT_FALLBACK_LANGUAGE if DEFAULT_FALLBACK_LANGUAGE in valid_codes else valid_codes[0]
    fallback_app = app_dir / f"{fallback_code}.json"
    fallback_seo = seo_dir / f"{fallback_code}.json"

    languages: List[Dict[str, str]] = []
    for code in valid_codes:
        app_path = app_dir / f"{code}.json"
        seo_path = seo_dir / f"{code}.json"
        validate_language_key_parity(fallback_app, app_path, "app")
        validate_language_key_parity(fallback_seo, seo_path, "seo")

        meta = read_text_language_meta(app_path, code)
        public_app = f"./textX/app/{code}.json"
        public_seo = f"./textX/seo/{code}.json"
        languages.append({
            "code": meta["code"],
            "htmlLang": meta["htmlLang"],
            "name": meta["name"],
            "nativeName": meta["nativeName"],
            "dir": meta["dir"],
            "app": public_app,
            "seo": public_seo,
        })

    return {
        "schemaVersion": 2,
        "generatedAt": released_at,
        "fallbackLanguage": fallback_code,
        "namespaces": ["app", "seo"],
        "discovery": {
            "mode": "render-static-build-scan",
            "appPattern": "textX/app/*.json",
            "seoPattern": "textX/seo/*.json",
            "codeSource": "filename-stem",
            "keyReference": fallback_code,
        },
        "languages": languages,
    }


def public_language_assets(language_manifest: Dict[str, Any]) -> List[str]:
    assets = ["./textX/languages.json"]
    for language in language_manifest.get("languages", []):
        for namespace in ("app", "seo"):
            value = language.get(namespace)
            if value:
                assets.append(str(value))
    return assets


def ordered_unique(paths: Iterable[str]) -> List[str]:
    seen: Set[str] = set()
    output: List[str] = []
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        output.append(path)
    return output


def js_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"


def format_js_array(values: Iterable[str], indent: str = "      ", closing_indent: str = "    ") -> str:
    items = [f"{indent}{js_string(value)}" for value in values]
    return "[\n" + ",\n".join(items) + f"\n{closing_indent}]"


def find_matching_bracket(text: str, open_index: int) -> int:
    depth = 0
    quote: str | None = None
    escape = False

    for index in range(open_index, len(text)):
        char = text[index]
        if quote:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == quote:
                quote = None
            continue

        if char in ["'", '"', "`"]:
            quote = char
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return index

    raise RuntimeError("No se encontró el cierre del arreglo JavaScript.")


def replace_js_array_property(text: str, property_name: str, values: Iterable[str], *, indent: str = "      ", closing_indent: str = "    ") -> str:
    pattern = re.compile(rf"({re.escape(property_name)}\s*:\s*)\[")
    match = pattern.search(text)
    if not match:
        raise RuntimeError(f"No se encontró la propiedad JS {property_name} para actualizarla.")

    open_index = match.end() - 1
    close_index = find_matching_bracket(text, open_index)
    replacement = match.group(1) + format_js_array(values, indent=indent, closing_indent=closing_indent)
    return text[:match.start()] + replacement + text[close_index + 1:]


def metadata_precache_urls(language_manifest: Dict[str, Any]) -> List[str]:
    return ordered_unique([
        "./",
        *DEFAULT_CRITICAL_ASSETS,
        *public_language_assets(language_manifest),
        *OPTIONAL_RUNTIME_ASSETS,
    ])


def fingerprint_check_files(language_manifest: Dict[str, Any], prompt_assets: Iterable[str]) -> List[str]:
    prompt_assets = list(prompt_assets)
    return ordered_unique([
        "./index.html",
        "./manifest.webmanifest",
        *public_language_assets(language_manifest),
        "./src/css/app.css",
        "./src/js/app-metadata.js",
        "./src/js/runtime-config.js",
        "./src/js/config.js",
        "./src/js/application-scope.js",
        "./src/js/api.js",
        "./src/js/firebase-auth.js",
        "./src/js/p2p-storage.js",
        "./src/js/p2p-durability.js",
        "./src/js/p2p-crypto.js",
        "./src/js/p2p-tab-coordinator.js",
        "./src/js/p2p-client.js",
        "./src/js/p2p-audit.js",
        "./src/js/p2p-permissions.js",
        "./src/js/p2p-space-creation-intent.js",
        "./src/js/p2p-invitation-intent.js",
        "./src/js/project-domain.js",
    "./src/js/device-management.js",
        "./src/js/i18n.js",
        "./src/js/asset-loader.js",
        "./src/js/pwa-install-prompt.js",
        "./src/js/pwa-update-manager.js",
        "./src/js/app.js",
        *discover_optional_runtime_assets(prompt_assets),
        *prompt_assets,
    ])


def clean_env_scalar(value: Any = "") -> str:
    """Normaliza valores copiados desde paneles que pueden incluir comillas exteriores."""
    text = str(value or "").strip()
    while len(text) >= 2 and text[0] == text[-1] and text[0] in {"'", '"'}:
        text = text[1:-1].strip()
    return text


def bool_env(value: Any = "") -> bool:
    return clean_env_scalar(value).lower() in {"1", "true", "yes", "on"}


def normalize_backend_url(value: Any = "") -> str:
    raw = clean_env_scalar(value).rstrip("/")
    if not raw:
        return ""
    try:
        parsed = urlsplit(raw)
    except ValueError as error:
        raise ValueError("APP_BACKEND_URL no contiene una URL válida.") from error
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError("APP_BACKEND_URL debe ser una URL HTTP(S) absoluta, por ejemplo https://mapsx.app.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("APP_BACKEND_URL no puede incluir credenciales, parámetros ni fragmentos.")
    normalized_path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme.lower(), parsed.netloc, normalized_path, "", ""))


def render_environment() -> bool:
    return bool_env(os.environ.get("RENDER")) or bool(clean_env_scalar(os.environ.get("RENDER_SERVICE_ID")))


def update_runtime_config_file(*, require_backend: bool = False) -> str:
    """Inyecta configuración pública y evita publicar una PWA sin su backend obligatorio."""
    raw_backend_url = os.environ.get("APP_BACKEND_URL") or os.environ.get("SEMILLA_BACKEND_URL") or ""
    backend_url = normalize_backend_url(raw_backend_url)
    sin_backend = bool_env(os.environ.get("sinBACKEND") or os.environ.get("APP_SIN_BACKEND") or "false")

    if require_backend and not backend_url:
        raise RuntimeError(
            "Falta APP_BACKEND_URL. Esta PWA necesita memoriaBACKEND incluso cuando sinBACKEND=true, "
            "porque Google, invitaciones y capacidades P2P se validan en el servidor."
        )

    payload = (
        "(function exposeRuntimeConfig(root) {\n"
        "  'use strict';\n\n"
        "  root.APP_RUNTIME_CONFIG = Object.freeze({\n"
        f"    backendUrl: {json.dumps(backend_url, ensure_ascii=False)},\n"
        f"    sinBACKEND: {str(sin_backend).lower()}\n"
        "  });\n"
        "})(window);\n"
    )
    RUNTIME_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_CONFIG_FILE.write_text(payload, encoding="utf-8")
    return backend_url


def update_metadata_file(version: str, build: str, released_at: str, language_manifest: Dict[str, Any], app_identity: Dict[str, Any]) -> None:
    if not METADATA_FILE.exists():
        return

    text = METADATA_FILE.read_text(encoding="utf-8")
    replacements = {
        r"version:\s*'[^']+'": f"version: '{version}'",
        r"build:\s*'[^']+'": f"build: '{build}'",
        r"releasedAt:\s*'[^']+'": f"releasedAt: '{released_at}'",
        r"appIconVersion:\s*'[^']+'": f"appIconVersion: '{app_identity['iconVersion']}'",
    }

    for pattern, value in replacements.items():
        text = re.sub(pattern, value, text)

    text = replace_js_array_property(text, "precacheUrls", metadata_precache_urls(language_manifest))
    METADATA_FILE.write_text(text, encoding="utf-8")


def update_config_file(language_manifest: Dict[str, Any], prompt_assets: Iterable[str]) -> None:
    if not CONFIG_FILE.exists():
        return

    files = fingerprint_check_files(language_manifest, prompt_assets)
    text = CONFIG_FILE.read_text(encoding="utf-8")
    text = replace_js_array_property(text, "directFingerprintCheckFiles", files)
    text = replace_js_array_property(text, "fingerprintCheckFiles", files)
    CONFIG_FILE.write_text(text, encoding="utf-8")


def build_critical_assets(language_manifest: Dict[str, Any], prompt_assets: Iterable[str]) -> List[Dict[str, Any]]:
    required_paths = ordered_unique(DEFAULT_CRITICAL_ASSETS + public_language_assets(language_manifest))
    records: List[Dict[str, Any]] = []

    for public_path in required_paths:
        record = asset_record(public_path, required=True)
        if record:
            records.append(record)

    optional_runtime_assets = discover_optional_runtime_assets(prompt_assets)
    for public_path in ordered_unique(optional_runtime_assets + list(prompt_assets)):
        record = asset_record(public_path, required=False)
        if record:
            records.append(record)

    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Actualiza version.json y textX/languages.json con huellas de release.")
    parser.add_argument("--version", help="Versión pública. Ejemplo: 1.3.1")
    parser.add_argument("--build", help="Build público. Ejemplo: 2026-07-02-005")
    parser.add_argument("--released-at", help="Fecha ISO del release")
    parser.add_argument("--no-metadata", action="store_true", help="No actualizar src/js/app-metadata.js")
    parser.add_argument(
        "--require-backend",
        action="store_true",
        help="Fallar si APP_BACKEND_URL no está definida; obligatorio para despliegues de producción.",
    )
    args = parser.parse_args()

    current = read_json(VERSION_FILE)
    version = args.version or current.get("version") or "1.0.0"
    # Cada ejecución de CI/CD debe producir una identidad de release nueva aunque la versión
    # semántica no cambie. Reutilizar build/releasedAt impide que una PWA antigua detecte
    # correctamente que el servidor ya publica otro bundle.
    build = args.build or datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    released_at = args.released_at or iso_now()

    backend_url = update_runtime_config_file(require_backend=args.require_backend or render_environment())
    language_manifest = discover_languages(released_at)
    prompt_assets = discover_prompt_assets()
    app_identity = build_app_identity()
    update_manifest_file(app_identity)
    update_index_identity(app_identity)
    write_json(LANGUAGE_MANIFEST_FILE, language_manifest)

    if not args.no_metadata:
        update_metadata_file(version, build, released_at, language_manifest, app_identity)
        update_config_file(language_manifest, prompt_assets)

    assets = build_critical_assets(language_manifest, prompt_assets)

    next_payload = {
        **current,
        "schemaVersion": 4,
        "releaseId": build_release_id(version, build),
        "version": version,
        "build": build,
        "releasedAt": released_at,
        "channel": current.get("channel", "stable"),
        "minimumSupportedBuild": current.get("minimumSupportedBuild", build),
        "forceReload": current.get("forceReload", True),
        "message": "Semilla PWA local-first con almacenamiento persistente supervisado, invitaciones por correo, sincronización SSE/POST, replay temporal, Web Push y autenticación Google.",
        "updateStrategy": {
            "mode": "auto-reload",
            "primarySignal": "version.json",
            "assetFingerprintSignal": "criticalAssets",
            "clientPolling": "disabled",
            "clientChecks": ["startup", "focus", "visibilitychange", "online", "pageshow", "service-worker-updatefound", "controllerchange"],
            "multiTabCoordination": True,
        },
        "i18n": {
            "manifest": "./textX/languages.json",
            "fallbackLanguage": language_manifest["fallbackLanguage"],
            "autoDiscovery": "build-time scan of textX/app/*.json and textX/seo/*.json",
            "codeSource": "filename-stem",
            "requiresPair": ["textX/app/<code>.json", "textX/seo/<code>.json"],
            "languages": [item["code"] for item in language_manifest.get("languages", [])],
        },
        "appIdentity": app_identity,
        "assetPrompts": {
            "autoDiscovery": "build-time scan of assets/**/*.png.txt",
            "count": len(prompt_assets),
            "files": prompt_assets,
        },
        "criticalAssets": assets,
    }

    write_json(VERSION_FILE, next_payload)

    print(f"Release generado: {next_payload['releaseId']}")
    print(f"Backend público: {backend_url or 'no configurado (solo válido para desarrollo/CI)'}")
    print(f"Idiomas detectados: {', '.join(next_payload['i18n']['languages'])}")
    print(f"Archivos críticos con huella: {len(assets)}")


if __name__ == "__main__":
    main()
