param(
    [ValidateSet("nsis", "portable", "all")]
    [string]$Target = "nsis",

    [switch]$Clean,

    [switch]$PrepareOnly,

    [switch]$Publish
)

$ErrorActionPreference = "Stop"
$RaizProjeto = Split-Path -Parent $PSScriptRoot
$CronometroTotal = [System.Diagnostics.Stopwatch]::StartNew()
$Tempos = [ordered]@{}

function Invoke-Etapa {
    param(
        [Parameter(Mandatory)]
        [string]$Nome,

        [Parameter(Mandatory)]
        [scriptblock]$Comando
    )

    Write-Output ""
    Write-Output "[>] $Nome"
    $Cronometro = [System.Diagnostics.Stopwatch]::StartNew()
    & $Comando
    if ($LASTEXITCODE -ne 0) {
        throw "A etapa '$Nome' falhou com codigo $LASTEXITCODE."
    }
    $Cronometro.Stop()
    $Tempos[$Nome] = $Cronometro.Elapsed
    Write-Output ("[tempo] ${Nome}: {0:c}" -f $Cronometro.Elapsed)
}

Push-Location $RaizProjeto
try {
    Invoke-Etapa "Tailwind e assets" {
        & npm.cmd run prepare:assets
    }

    Invoke-Etapa "Modelos Hugging Face" {
        $ArgumentosModelos = @(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            (Join-Path $PSScriptRoot "prepare-models.ps1")
        )
        if ($Clean) {
            $ArgumentosModelos += "-Force"
        }
        & powershell.exe @ArgumentosModelos
    }

    Invoke-Etapa "Build Python" {
        $ArgumentosPython = @(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            (Join-Path $PSScriptRoot "build-python.ps1")
        )
        if ($Clean) {
            $ArgumentosPython += "-Clean"
        }
        & powershell.exe @ArgumentosPython
    }

    Invoke-Etapa "Validacao JavaScript" {
        & npm.cmd run check
    }

    if (-not $PrepareOnly) {
        Invoke-Etapa "Electron Builder ($Target)" {
            $ArgumentosBuilder = @(
                "electron-builder",
                "--win"
            )
            if ($Target -eq "all") {
                $ArgumentosBuilder += @("nsis", "portable")
            }
            else {
                $ArgumentosBuilder += $Target
            }
            $ArgumentosBuilder += "--x64"
            if ($Publish) {
                $ArgumentosBuilder += @("--publish", "always")
            }
            & npx.cmd @ArgumentosBuilder
        }
    }
}
finally {
    Pop-Location
    $CronometroTotal.Stop()
    Write-Output ""
    Write-Output "Resumo de tempos:"
    foreach ($Etapa in $Tempos.GetEnumerator()) {
        Write-Output ("  - {0}: {1:c}" -f $Etapa.Key, $Etapa.Value)
    }
    Write-Output ("  - Total: {0:c}" -f $CronometroTotal.Elapsed)
}
