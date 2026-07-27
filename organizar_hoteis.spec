# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = []

for pacote in [
    "accelerate",
    "deep_translator",
    "huggingface_hub",
    "sentence_transformers",
    "sklearn",
    "timm",
    "torch",
    "torchvision",
    "transformers",
    "ultralytics",
]:
    pacote_datas, pacote_binaries, pacote_hiddenimports = collect_all(pacote)
    datas += pacote_datas
    binaries += pacote_binaries
    hiddenimports += pacote_hiddenimports

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
        "jupyter",
        "matplotlib.tests",
        "pytest",
        "tkinter",
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
