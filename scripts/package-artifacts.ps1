$ErrorActionPreference = "Stop"

$RaizProjeto = Split-Path -Parent $PSScriptRoot
$Builder = Join-Path $RaizProjeto "node_modules\.bin\electron-builder.cmd"
$Log = Join-Path $RaizProjeto "build-electron.log"
$Resultado = Join-Path $RaizProjeto "build-electron.exitcode"

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
Remove-Item -LiteralPath $Resultado -Force -ErrorAction SilentlyContinue
Push-Location $RaizProjeto
try {
    & $Builder --win nsis portable --x64 *>&1 |
        Tee-Object -FilePath $Log
    $Codigo = $LASTEXITCODE
    Set-Content -LiteralPath $Resultado -Value $Codigo -Encoding ascii
    exit $Codigo
}
finally {
    Pop-Location
}
