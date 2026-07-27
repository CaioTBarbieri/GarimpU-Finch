$ErrorActionPreference = "Stop"

$RaizProjeto = Split-Path -Parent $PSScriptRoot
$Origem = Join-Path $env:USERPROFILE ".cache\huggingface"
$Destino = Join-Path $RaizProjeto "resources\huggingface"
$ModelosObrigatorios = @(
    "hub\models--microsoft--Florence-2-base-ft",
    "hub\models--sentence-transformers--clip-ViT-B-32"
)

foreach ($Modelo in $ModelosObrigatorios) {
    $Caminho = Join-Path $Origem $Modelo
    if (-not (Test-Path -LiteralPath $Caminho)) {
        throw "Modelo obrigatório não encontrado no cache: $Caminho"
    }
}

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
Copy-Item -Path (Join-Path $Origem "*") `
    -Destination $Destino `
    -Recurse `
    -Force

Write-Output "[+] Modelos Hugging Face copiados para $Destino"
