param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$Cronometro = [System.Diagnostics.Stopwatch]::StartNew()

$RaizProjeto = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RaizProjeto "venv\Scripts\python.exe"
$Spec = Join-Path $RaizProjeto "organizar_hoteis.spec"
$DistPath = Join-Path $RaizProjeto "build"
$WorkPath = Join-Path $RaizProjeto "build\pyinstaller-work"
$Executavel = Join-Path $DistPath "python-organizer\organizar_hoteis.exe"
$EstadoBuild = Join-Path $WorkPath "garimpu-build-state.json"

function Get-FingerprintBuild {
    $Entradas = @(
        $PSCommandPath
        $Spec
        (Join-Path $RaizProjeto "organizar_hoteis.py")
        (Join-Path $RaizProjeto "requirements-windows.txt")
    )
    $Entradas += Get-ChildItem `
        -LiteralPath (Join-Path $RaizProjeto "python_organizador") `
        -Filter "*.py" `
        -File |
        Select-Object -ExpandProperty FullName

    $Hashes = [ordered]@{}
    foreach ($Entrada in ($Entradas | Sort-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $Entrada -PathType Leaf)) {
            throw "Entrada do build Python nao encontrada: $Entrada"
        }
        $Relativo = $Entrada.Substring($RaizProjeto.Length).TrimStart("\")
        $Hashes[$Relativo] = (
            Get-FileHash -LiteralPath $Entrada -Algorithm SHA256
        ).Hash
    }

    $Distribuicoes = @(
        "accelerate",
        "deep-translator",
        "huggingface-hub",
        "sentence-transformers",
        "scikit-learn",
        "timm",
        "torch",
        "torchvision",
        "transformers",
        "ultralytics"
    )
    $CodigoIdentidade = @"
import importlib.metadata as metadata
import sys

import json
names = sys.argv[1].split(',')
print(json.dumps({
    'python': sys.version,
    'prefix': sys.prefix,
    'packages': {name: metadata.version(name) for name in names},
}, sort_keys=True))
"@
    $IdentidadePython = & $Python `
        -c $CodigoIdentidade `
        ($Distribuicoes -join ",")
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel identificar o ambiente Python."
    }

    $Dados = [ordered]@{
        versao = 1
        python = $IdentidadePython
        entradas = $Hashes
    } | ConvertTo-Json -Depth 5 -Compress

    $Sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Dados)
        return [System.BitConverter]::ToString(
            $Sha.ComputeHash($Bytes)
        ).Replace("-", "")
    }
    finally {
        $Sha.Dispose()
    }
}

function Test-PacotePythonCompleto {
    $Obrigatorios = @(
        $Executavel,
        (Join-Path $DistPath "python-organizer\_internal\python312.dll"),
        (Join-Path $DistPath "python-organizer\_internal\unicodedata.pyd"),
        (Join-Path $DistPath "python-organizer\_internal\cv2"),
        (Join-Path $DistPath "python-organizer\_internal\deep_translator"),
        (Join-Path $DistPath "python-organizer\_internal\PIL"),
        (Join-Path $DistPath "python-organizer\_internal\sentence_transformers"),
        (Join-Path $DistPath "python-organizer\_internal\sklearn"),
        (Join-Path $DistPath "python-organizer\_internal\torch"),
        (Join-Path $DistPath "python-organizer\_internal\torchvision"),
        (Join-Path $DistPath "python-organizer\_internal\transformers"),
        (Join-Path $DistPath "python-organizer\_internal\ultralytics")
    )
    foreach ($Obrigatorio in $Obrigatorios) {
        if (-not (Test-Path -LiteralPath $Obrigatorio)) {
            return $false
        }
    }
    return (Get-Item -LiteralPath $Executavel).Length -gt 0
}

if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    throw "Python do projeto nao encontrado em $Python"
}
if (-not (Test-Path -LiteralPath $Spec -PathType Leaf)) {
    throw "Spec do PyInstaller nao encontrado em $Spec"
}

$Fingerprint = Get-FingerprintBuild
if (
    -not $Clean -and
    (Test-Path -LiteralPath $EstadoBuild -PathType Leaf) -and
    (Test-PacotePythonCompleto)
) {
    try {
        $EstadoAnterior = Get-Content `
            -LiteralPath $EstadoBuild `
            -Raw |
            ConvertFrom-Json
    }
    catch {
        $EstadoAnterior = $null
    }
    if ($EstadoAnterior.fingerprint -eq $Fingerprint) {
        $Cronometro.Stop()
        Write-Output "[=] Pacote Python reutilizado: entradas inalteradas."
        Write-Output (
            "[tempo] Build Python incremental: {0:c}" -f
            $Cronometro.Elapsed
        )
        exit 0
    }
}

$Argumentos = @(
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--distpath",
    $DistPath,
    "--workpath",
    $WorkPath
)
if ($Clean) {
    $Argumentos += "--clean"
}
$Argumentos += $Spec

$Modo = if ($Clean) { "limpo" } else { "incremental" }
Write-Output "[>] Iniciando build Python $Modo..."
$EstadoCleanAnterior = $env:GARIMPU_PYINSTALLER_CLEAN
$env:GARIMPU_PYINSTALLER_CLEAN = if ($Clean) { "1" } else { "0" }
Push-Location $RaizProjeto
try {
    & $Python @Argumentos
    if ($LASTEXITCODE -ne 0) {
        throw "O PyInstaller terminou com codigo $LASTEXITCODE."
    }
}
finally {
    Pop-Location
    if ($null -eq $EstadoCleanAnterior) {
        Remove-Item Env:GARIMPU_PYINSTALLER_CLEAN -ErrorAction SilentlyContinue
    }
    else {
        $env:GARIMPU_PYINSTALLER_CLEAN = $EstadoCleanAnterior
    }
}

if (-not (Test-Path -LiteralPath $Executavel -PathType Leaf)) {
    throw "Executavel Python nao foi criado em $Executavel"
}
if ((Get-Item -LiteralPath $Executavel).Length -le 0) {
    throw "Executavel Python foi criado vazio em $Executavel"
}
if (-not (Test-PacotePythonCompleto)) {
    throw "O pacote Python foi criado sem um ou mais modulos obrigatorios."
}

New-Item -ItemType Directory -Force -Path $WorkPath | Out-Null
[ordered]@{
    fingerprint = $Fingerprint
    modo = $Modo
    criadoEm = (Get-Date).ToUniversalTime().ToString("o")
} |
    ConvertTo-Json |
    Set-Content -LiteralPath $EstadoBuild -Encoding UTF8

$Cronometro.Stop()
Write-Output "[+] Organizador criado em $Executavel"
Write-Output (
    "[tempo] Build Python ${Modo}: {0:c}" -f $Cronometro.Elapsed
)
