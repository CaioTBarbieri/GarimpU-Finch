$ErrorActionPreference = "Stop"

$RaizProjeto = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RaizProjeto "venv\Scripts\python.exe"
$Spec = Join-Path $RaizProjeto "organizar_hoteis.spec"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python do projeto não encontrado em $Python"
}

& $Python -m PyInstaller `
    --noconfirm `
    --clean `
    --distpath (Join-Path $RaizProjeto "build") `
    --workpath (Join-Path $RaizProjeto "build\pyinstaller-work") `
    $Spec
if ($LASTEXITCODE -ne 0) {
    throw "O PyInstaller terminou com código $LASTEXITCODE."
}

$Executavel = Join-Path $RaizProjeto "build\python-organizer\organizar_hoteis.exe"
if (-not (Test-Path -LiteralPath $Executavel)) {
    throw "Executável Python não foi criado em $Executavel"
}

Write-Output "[+] Organizador criado em $Executavel"
