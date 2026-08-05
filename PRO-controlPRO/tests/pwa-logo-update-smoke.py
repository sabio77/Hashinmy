#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import struct
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def load_generator():
    path = ROOT / "tools/generate-release.py"
    spec = importlib.util.spec_from_file_location("release_generator", path)
    if not spec or not spec.loader:
        fail("No se pudo cargar tools/generate-release.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    generator = load_generator()
    identity = generator.build_app_identity()

    if len(identity.get("icons", [])) < 14:
        fail("La familia logoAPP_ no cubre todos los tamaños estándar previstos.")
    if not identity.get("iconVersion"):
        fail("Falta iconVersion global.")
    if any("?v=" not in item.get("url", "") for item in identity["icons"]):
        fail("Cada URL de icono debe estar versionada por contenido.")
    if any(not Path(item["path"]).name.startswith("logoAPP_") for item in identity["icons"]):
        fail("Todos los iconos deben iniciar con logoAPP_.")

    manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
    external = [item for item in manifest.get("icons", []) if str(item.get("src", "")).startswith("./assets/logoAPP_")]
    if len(external) != len(identity["icons"]):
        fail("manifest.webmanifest no está sincronizado con APP_ICON_SPECS.")
    if any("?v=" not in str(item.get("src", "")) for item in external):
        fail("manifest.webmanifest conserva iconos sin huella.")

    index = (ROOT / "index.html").read_text(encoding="utf-8")
    for role in ["favicon", "apple-touch-icon", "interface-logo"]:
        if f'data-app-icon-role="{role}"' not in index:
            fail(f"index.html perdió el rol de identidad {role}.")
    if "./manifest.webmanifest" not in index:
        fail("La ruta del manifest debe permanecer estable.")

    original_root = generator.ROOT
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            generator.ROOT = temp_root
            image = temp_root / "assets/logoAPP_192x192.png"
            image.parent.mkdir(parents=True)
            def png_chunk(chunk_type: bytes, chunk_data: bytes) -> bytes:
                crc = zlib.crc32(chunk_type)
                crc = zlib.crc32(chunk_data, crc) & 0xFFFFFFFF
                return struct.pack(">I", len(chunk_data)) + chunk_type + chunk_data + struct.pack(">I", crc)

            def build_png(width: int, height: int, pixel_value: int) -> bytes:
                ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
                row = b"\x00" + bytes([pixel_value, 0, 0, 255]) * width
                idat = zlib.compress(row * height, level=9)
                return (
                    b"\x89PNG\r\n\x1a\n"
                    + png_chunk(b"IHDR", ihdr)
                    + png_chunk(b"IDAT", idat)
                    + png_chunk(b"IEND", b"")
                )

            image.write_bytes(build_png(192, 192, 32))
            generator.validate_png_dimensions("./assets/logoAPP_192x192.png", "192x192")
            first = generator.app_icon_fingerprint("./assets/logoAPP_192x192.png")
            image.write_bytes(build_png(192, 192, 64))
            second = generator.app_icon_fingerprint("./assets/logoAPP_192x192.png")
            if first == second:
                fail("La huella no cambia cuando cambia el contenido real del logo.")

            image.write_bytes(build_png(191, 192, 32))
            try:
                generator.validate_png_dimensions("./assets/logoAPP_192x192.png", "192x192")
            except ValueError:
                pass
            else:
                fail("El build debe rechazar un PNG cuyo tamaño no coincide con su nombre.")
    finally:
        generator.ROOT = original_root

    print("OK: logoAPP_ usa familia estándar, fallback geométrico y URLs de identidad con huella de contenido.")


if __name__ == "__main__":
    main()
