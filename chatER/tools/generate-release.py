#!/usr/bin/env python3
"""Genera la configuración pública de chatER para un Static Site de Render.

Uso recomendado en producción:
  python tools/generate-release.py --require-backend

Lee APP_BACKEND_URL desde las variables de entorno disponibles durante el build
y la publica en runtime-config.js para que el frontend estático pueda conocer la
URL del backend sin dejarla fija en el código fuente.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_CONFIG_FILE = ROOT / "runtime-config.js"
INDEX_FILE = ROOT / "index.html"
SW_FILE = ROOT / "sw.js"
MANIFEST_FILE = ROOT / "manifest.webmanifest"
VERSION_QUERY_RE = re.compile(r"\?v=[A-Za-z0-9._-]+")
RELEASE_CONST_RE = re.compile(r"const RELEASE_VERSION = ['\"][^'\"]+['\"];")
BUNDLED_IMAGE_ASSETS_RE = re.compile(r"const BUNDLED_IMAGE_ASSETS = new Set\(\[[^\n]*\]\);")
FALLBACK_ICON_DATA_RE = re.compile(r"data:image/svg\+xml;charset=utf-8,[^\"'\s]+#chater-fallback-(192|512)")
MODULE_IMPORT_RE = re.compile(r"((?:from\s+|import\s*)['\"])(\.{1,2}/[^'\"]+?\.js)(?:\?v=[^'\"]+)?(['\"])")
OPTIONAL_IMAGE_ASSETS = (
    "./assets/icon-192.png",
    "./assets/icon-512.png",
)
OPTIONAL_ICON_SIZES = (192, 512)
ICON_LINK_RE = re.compile(
    r'(?P<prefix><link\b(?=[^>]*\brel=["\'](?:icon|apple-touch-icon)["\'])(?=[^>]*\bsizes=["\']192x192["\'])[^>]*\bhref=["\'])(?P<url>[^"\']*)(?P<suffix>["\'][^>]*>)',
    re.IGNORECASE,
)


def clean_env_scalar(value: object = "") -> str:
    """Normaliza valores de panel que accidentalmente incluyan comillas exteriores."""
    text = str(value or "").strip()
    while len(text) >= 2 and text[0] == text[-1] and text[0] in {"'", '"'}:
        text = text[1:-1].strip()
    return text


def bool_env(value: object = "") -> bool:
    return clean_env_scalar(value).lower() in {"1", "true", "yes", "on"}


def normalize_backend_url(value: object = "") -> str:
    raw = clean_env_scalar(value).rstrip("/")
    if not raw:
        return ""

    try:
        parsed = urlsplit(raw)
    except ValueError as error:
        raise ValueError("APP_BACKEND_URL no contiene una URL válida.") from error

    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError(
            "APP_BACKEND_URL debe ser una URL HTTP(S) absoluta, por ejemplo https://backend.example.com."
        )
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError(
            "APP_BACKEND_URL no puede incluir credenciales, parámetros ni fragmentos."
        )

    normalized_path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme.lower(), parsed.netloc, normalized_path, "", ""))


def render_environment() -> bool:
    """Detecta el build de Render para impedir un despliegue sin backend configurado."""
    return bool_env(os.environ.get("RENDER")) or bool(
        clean_env_scalar(os.environ.get("RENDER_SERVICE_ID"))
    )


def update_runtime_config_file(*, require_backend: bool = False) -> str:
    """Inyecta APP_BACKEND_URL en el JavaScript público consumido por chatER."""
    backend_url = normalize_backend_url(os.environ.get("APP_BACKEND_URL", ""))

    if require_backend and not backend_url:
        raise RuntimeError(
            "Falta APP_BACKEND_URL. Define en Render la URL pública del backend antes de desplegar chatER."
        )

    payload = (
        "(function exposeChatERRuntimeConfig(root) {\n"
        "  'use strict';\n\n"
        "  root.APP_RUNTIME_CONFIG = Object.freeze({\n"
        f"    backendUrl: {json.dumps(backend_url, ensure_ascii=False)}\n"
        "  });\n"
        "})(window);\n"
    )
    RUNTIME_CONFIG_FILE.write_text(payload, encoding="utf-8")
    return backend_url




def normalized_release_text(path: Path, text: str) -> str:
    """Elimina marcas generadas para que el hash sea estable entre builds idénticos."""
    normalized = VERSION_QUERY_RE.sub("", text)
    had_fallback_icon = "#chater-fallback-" in normalized
    normalized = FALLBACK_ICON_DATA_RE.sub(lambda match: f"./assets/icon-{match.group(1)}.png", normalized)
    if path == INDEX_FILE and had_fallback_icon:
        normalized = re.sub(
            r'(<link\b(?=[^>]*\brel=["\']icon["\'])[^>]*\btype=)["\']image/svg\+xml["\']',
            r'\1"image/png"',
            normalized,
            count=1,
            flags=re.IGNORECASE,
        )
    if path == MANIFEST_FILE and had_fallback_icon:
        try:
            payload = json.loads(normalized)
            for icon in payload.get("icons", []):
                if not isinstance(icon, dict):
                    continue
                sizes = str(icon.get("sizes", "")).strip().lower()
                matched_size = next((size for size in OPTIONAL_ICON_SIZES if f"{size}x{size}" in sizes), None)
                if matched_size:
                    icon["src"] = f"./assets/icon-{matched_size}.png"
                    icon["type"] = "image/png"
            normalized = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    if path == SW_FILE:
        normalized = RELEASE_CONST_RE.sub("const RELEASE_VERSION = 'BUILD_RELEASE';", normalized)
        normalized = BUNDLED_IMAGE_ASSETS_RE.sub("const BUNDLED_IMAGE_ASSETS = new Set(BUILD_IMAGE_ASSETS);", normalized)
    return normalized


def compute_release_version() -> str:
    digest = hashlib.sha256()
    text_extensions = {".js", ".css", ".html", ".webmanifest"}
    binary_extensions = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"}
    release_extensions = text_extensions | binary_extensions
    files = sorted(path for path in ROOT.rglob("*") if path.is_file() and path.suffix.lower() in release_extensions)
    for path in files:
        relative = path.relative_to(ROOT).as_posix()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        if path.suffix.lower() in text_extensions:
            text = path.read_text(encoding="utf-8")
            digest.update(normalized_release_text(path, text).encode("utf-8"))
        else:
            # Las imágenes reales forman parte del release. Si se agrega un PNG que antes
            # solo tenía fallback geométrico, cambia la versión y se descarta ese fallback cacheado.
            digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:16]


def with_version(url: str, release: str) -> str:
    clean = VERSION_QUERY_RE.sub("", str(url or ""))
    return f"{clean}?v={release}" if clean else clean


def geometric_icon_data_url(size: int) -> str:
    """Devuelve un icono geométrico sin crear archivos ni provocar un 404 de red."""
    safe_size = max(64, min(512, int(size or 192)))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{safe_size}" height="{safe_size}" '
        f'viewBox="0 0 {safe_size} {safe_size}">'
        '<rect width="100%" height="100%" rx="20%" fill="#0aa884"/>'
        '<rect x="20%" y="25%" width="60%" height="43%" rx="12%" fill="white"/>'
        '<path d="M25 65 L20 82 L43 68 Z" fill="white" transform="scale(' + str(safe_size / 100) + ')"/>'
        '<circle cx="40%" cy="47%" r="3.5%" fill="#0aa884"/>'
        '<circle cx="50%" cy="47%" r="3.5%" fill="#0aa884"/>'
        '<circle cx="60%" cy="47%" r="3.5%" fill="#0aa884"/>'
        '</svg>'
    )
    return f"data:image/svg+xml;charset=utf-8,{quote(svg, safe='')}#chater-fallback-{safe_size}"


def optional_icon_url(size: int, release: str) -> tuple[str, str]:
    safe_size = 512 if int(size or 192) >= 512 else 192
    asset = f"./assets/icon-{safe_size}.png"
    if (ROOT / asset.removeprefix("./")).is_file():
        return with_version(asset, release), "image/png"
    return geometric_icon_data_url(safe_size), "image/svg+xml"


def configure_index_optional_icons(release: str) -> None:
    """Evita 404 de iconos antes de que el Service Worker controle la primera visita."""
    text = INDEX_FILE.read_text(encoding="utf-8")
    icon_url, icon_type = optional_icon_url(192, release)

    def replace_icon_link(match: re.Match[str]) -> str:
        prefix = match.group("prefix")
        if re.search(r"\btype=[\"'][^\"']+[\"']", prefix, re.IGNORECASE):
            prefix = re.sub(
                r"\btype=[\"'][^\"']+[\"']",
                f'type="{icon_type}"',
                prefix,
                count=1,
                flags=re.IGNORECASE,
            )
        return f"{prefix}{icon_url}{match.group('suffix')}"

    text = ICON_LINK_RE.sub(replace_icon_link, text)
    INDEX_FILE.write_text(text, encoding="utf-8")


def version_index_assets(release: str) -> None:
    text = INDEX_FILE.read_text(encoding="utf-8")
    asset_re = re.compile(r'(?P<prefix>(?:src|href)=["\'])(?P<url>\./[^"\']+?\.(?:js|css|webmanifest|png))(?:\?v=[^"\']+)?(?P<suffix>["\'])')
    text = asset_re.sub(lambda match: f"{match.group('prefix')}{with_version(match.group('url'), release)}{match.group('suffix')}", text)
    INDEX_FILE.write_text(text, encoding="utf-8")


def version_module_imports(release: str) -> None:
    for path in sorted(ROOT.rglob("*.js")):
        if path == SW_FILE or path == RUNTIME_CONFIG_FILE:
            continue
        text = path.read_text(encoding="utf-8")
        updated = MODULE_IMPORT_RE.sub(lambda match: f"{match.group(1)}{with_version(match.group(2), release)}{match.group(3)}", text)
        if updated != text:
            path.write_text(updated, encoding="utf-8")


def version_manifest_assets(release: str) -> None:
    payload = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    for icon in payload.get("icons", []):
        if not isinstance(icon, dict):
            continue
        sizes = str(icon.get("sizes", "")).strip().lower()
        matched_size = next((size for size in OPTIONAL_ICON_SIZES if f"{size}x{size}" in sizes), None)
        if matched_size:
            icon_url, icon_type = optional_icon_url(matched_size, release)
            icon["src"] = icon_url
            icon["type"] = icon_type
            continue
        if str(icon.get("src", "")).startswith("./"):
            icon["src"] = with_version(icon["src"], release)
    MANIFEST_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def inject_bundled_image_assets() -> None:
    """Publica en el SW qué PNG opcionales existen realmente en este release.

    Esto permite que el service worker omita requests destinados a terminar en 404
    cuando el proyecto conserva solo el prompt .txt, pero siga consultando/cachéando
    automáticamente el archivo real en cuanto aparezca dentro de assets.
    """
    available = [
        asset
        for asset in OPTIONAL_IMAGE_ASSETS
        if (ROOT / asset.removeprefix("./")).is_file()
    ]
    sw = SW_FILE.read_text(encoding="utf-8")
    replacement = f"const BUNDLED_IMAGE_ASSETS = new Set({json.dumps(available, ensure_ascii=False)});"
    updated, count = BUNDLED_IMAGE_ASSETS_RE.subn(replacement, sw, count=1)
    if count != 1:
        raise RuntimeError("sw.js no contiene la marca BUNDLED_IMAGE_ASSETS esperada.")
    SW_FILE.write_text(updated, encoding="utf-8")


def apply_release_version(release: str) -> None:
    sw = SW_FILE.read_text(encoding="utf-8")
    sw = RELEASE_CONST_RE.sub(f"const RELEASE_VERSION = '{release}';", sw, count=1)
    SW_FILE.write_text(sw, encoding="utf-8")
    inject_bundled_image_assets()
    version_index_assets(release)
    configure_index_optional_icons(release)
    version_module_imports(release)
    version_manifest_assets(release)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--require-backend",
        action="store_true",
        help="Falla si APP_BACKEND_URL no está definida; obligatorio para producción.",
    )
    args = parser.parse_args()

    backend_url = update_runtime_config_file(
        require_backend=args.require_backend or render_environment()
    )
    release = compute_release_version()
    apply_release_version(release)
    print(f"Backend público: {backend_url or 'no configurado (solo válido fuera de Render)'}")
    print(f"Release estático: {release}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
