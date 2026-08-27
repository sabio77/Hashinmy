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
import json
import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_CONFIG_FILE = ROOT / "runtime-config.js"


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
    print(f"Backend público: {backend_url or 'no configurado (solo válido fuera de Render)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
