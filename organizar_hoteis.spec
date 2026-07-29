# -*- mode: python ; coding: utf-8 -*-

import json
import os
import sys
from importlib.metadata import version
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = []

CACHE_VERSION = 2
CACHE_PATH = (
    Path("build")
    / "pyinstaller-work"
    / "collect-all-cache.json"
)
PACKAGE_DISTRIBUTIONS = {
    "accelerate": "accelerate",
    "deep_translator": "deep-translator",
    "huggingface_hub": "huggingface-hub",
    "sentence_transformers": "sentence-transformers",
    "sklearn": "scikit-learn",
    "timm": "timm",
    "torch": "torch",
    "torchvision": "torchvision",
    "transformers": "transformers",
    "ultralytics": "ultralytics",
}
excluded_data_segments = {
    "__pycache__",
    ".pytest_cache",
    "doc",
    "docs",
    "notebooks",
    "test",
    "tests",
    "test_utils",
    "testing",
    "testing_utils",
}
excluded_module_prefixes = (
    "IPython",
    "ipykernel",
    "ipywidgets",
    "jupyter",
    "notebook",
    "pytest",
    "sphinx",
)


def is_runtime_data(item):
    source, destination = item
    normalized = (
        source.replace("\\", "/").lower().split("/")
        + destination.replace("\\", "/").lower().split("/")
    )
    return not any(part in excluded_data_segments for part in normalized)


def is_runtime_module(name):
    lowered_parts = name.lower().split(".")
    if any(part in excluded_data_segments for part in lowered_parts):
        return False
    return not name.startswith(excluded_module_prefixes)


def build_cache_fingerprint():
    return {
        "cache_version": CACHE_VERSION,
        "python": sys.version,
        "environment": sys.prefix,
        "packages": {
            package: version(distribution)
            for package, distribution in PACKAGE_DISTRIBUTIONS.items()
        },
    }


def load_collect_all_cache(fingerprint):
    if os.environ.get("GARIMPU_PYINSTALLER_CLEAN") == "1":
        return None
    if not CACHE_PATH.is_file():
        return None
    try:
        cached = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if cached.get("fingerprint") != fingerprint:
        return None
    print(f"[=] Reutilizando coleta PyInstaller: {CACHE_PATH}")
    return cached


def collect_runtime_dependencies():
    collected_datas = []
    collected_binaries = []
    collected_hiddenimports = []
    for package in PACKAGE_DISTRIBUTIONS:
        package_datas, package_binaries, package_hiddenimports = collect_all(
            package
        )
        collected_datas += [
            item for item in package_datas if is_runtime_data(item)
        ]
        collected_binaries += package_binaries
        collected_hiddenimports += [
            name
            for name in package_hiddenimports
            if is_runtime_module(name)
        ]
    return {
        "datas": collected_datas,
        "binaries": collected_binaries,
        "hiddenimports": collected_hiddenimports,
    }


fingerprint = build_cache_fingerprint()
cache = load_collect_all_cache(fingerprint)
if cache is None:
    print("[>] Atualizando coleta de dependencias do PyInstaller...")
    cache = collect_runtime_dependencies()
    cache["fingerprint"] = fingerprint
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"[+] Coleta PyInstaller gravada em: {CACHE_PATH}")

datas = [tuple(item) for item in cache["datas"]]
binaries = [tuple(item) for item in cache["binaries"]]
hiddenimports = cache["hiddenimports"]

a = Analysis(
    ["organizar_hoteis.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "IPython",
        "ipykernel",
        "ipywidgets",
        "jupyter",
        "jupyter_client",
        "jupyter_core",
        "matplotlib.tests",
        "notebook",
        "pytest",
        "sphinx",
        "tkinter",
        "__main__",
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="organizar_hoteis",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="python-organizer",
)
