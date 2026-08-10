param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$Cronometro = [System.Diagnostics.Stopwatch]::StartNew()

$RaizProjeto = Split-Path -Parent $PSScriptRoot
$Origem = Join-Path $env:USERPROFILE ".cache\huggingface"
$Destino = Join-Path $RaizProjeto "resources\huggingface"

$ModelosObrigatorios = @(
    @{
        Nome = "Florence-2-base-ft"
        Relativo = "hub\models--microsoft--Florence-2-base-ft"
    },
    @{
        Nome = "clip-ViT-B-32"
        Relativo = "hub\models--sentence-transformers--clip-ViT-B-32"
    }
)

$AuxiliaresFlorence = @(
    "modules\__init__.py",
    "modules\transformers_modules\__init__.py",
    "modules\transformers_modules\microsoft\__init__.py",
    "modules\transformers_modules\microsoft\Florence-2-base-ft",
    "modules\transformers_modules\microsoft\Florence_hyphen_2_hyphen_base_hyphen_ft"
)

function Test-ItemCompleto {
    param(
        [Parameter(Mandatory)]
        [string]$OrigemItem,

        [Parameter(Mandatory)]
        [string]$DestinoItem
    )

    if (-not (Test-Path -LiteralPath $DestinoItem)) {
        return $false
    }

    $ItemOrigem = Get-Item -LiteralPath $OrigemItem -Force
    $ItemDestino = Get-Item -LiteralPath $DestinoItem -Force

    if (-not $ItemOrigem.PSIsContainer) {
        return (
            -not $ItemDestino.PSIsContainer -and
            $ItemOrigem.Length -eq $ItemDestino.Length
        )
    }

    if (-not $ItemDestino.PSIsContainer) {
        return $false
    }

    $ArquivosOrigem = @(
        Get-ChildItem -LiteralPath $OrigemItem -Recurse -File -Force
    )
    if ($ArquivosOrigem.Count -eq 0) {
        return $false
    }

    $PrefixoOrigem = $ItemOrigem.FullName.TrimEnd("\")
    foreach ($ArquivoOrigem in $ArquivosOrigem) {
        $Relativo = $ArquivoOrigem.FullName.Substring(
            $PrefixoOrigem.Length
        ).TrimStart("\")
        $ArquivoDestino = Join-Path $DestinoItem $Relativo
        if (-not (Test-Path -LiteralPath $ArquivoDestino -PathType Leaf)) {
            return $false
        }
        if (
            (Get-Item -LiteralPath $ArquivoDestino -Force).Length -ne
            $ArquivoOrigem.Length
        ) {
            return $false
        }
    }

    return $true
}

function Copy-ItemIncremental {
    param(
        [Parameter(Mandatory)]
        [string]$Nome,

        [Parameter(Mandatory)]
        [string]$Relativo
    )

    $OrigemItem = Join-Path $Origem $Relativo
    $DestinoItem = Join-Path $Destino $Relativo

    if (-not (Test-Path -LiteralPath $OrigemItem)) {
        throw "Recurso obrigatorio nao encontrado no cache: $OrigemItem"
    }

    if (-not $Force -and (Test-ItemCompleto $OrigemItem $DestinoItem)) {
        Write-Output "[=] Reutilizado: $Nome"
        return
    }

    $ItemOrigem = Get-Item -LiteralPath $OrigemItem -Force
    if ($ItemOrigem.PSIsContainer) {
        New-Item -ItemType Directory -Force -Path $DestinoItem | Out-Null
        Get-ChildItem -LiteralPath $OrigemItem -Force | ForEach-Object {
            Copy-Item `
                -LiteralPath $_.FullName `
                -Destination $DestinoItem `
                -Recurse `
                -Force
        }
    }
    else {
        $PastaDestino = Split-Path -Parent $DestinoItem
        New-Item -ItemType Directory -Force -Path $PastaDestino | Out-Null
        Copy-Item `
            -LiteralPath $OrigemItem `
            -Destination $DestinoItem `
            -Force
    }

    if (-not (Test-ItemCompleto $OrigemItem $DestinoItem)) {
        throw "A copia de '$Nome' terminou incompleta em: $DestinoItem"
    }

    $Acao = if ($Force) { "Atualizado" } else { "Copiado" }
    Write-Output "[+] ${Acao}: $Nome"
}

if (-not (Test-Path -LiteralPath $Origem -PathType Container)) {
    throw "Cache Hugging Face nao encontrado em: $Origem"
}

New-Item -ItemType Directory -Force -Path $Destino | Out-Null

foreach ($Modelo in $ModelosObrigatorios) {
    Copy-ItemIncremental `
        -Nome $Modelo.Nome `
        -Relativo $Modelo.Relativo
}

foreach ($Auxiliar in $AuxiliaresFlorence) {
    Copy-ItemIncremental `
        -Nome "Modulo Florence: $Auxiliar" `
        -Relativo $Auxiliar
}

$Cronometro.Stop()
Write-Output (
    "[tempo] Modelos Hugging Face: {0:c}" -f $Cronometro.Elapsed
)
