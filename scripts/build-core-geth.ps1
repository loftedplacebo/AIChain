[CmdletBinding()]
param(
    [switch]$RunTests
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$goExe = Join-Path $projectRoot '.toolchains\go\bin\go.exe'
$compiler = Join-Path $projectRoot '.toolchains\llvm-mingw-20260616-ucrt-x86_64\bin\x86_64-w64-mingw32-clang.exe'
$nodeRoot = Join-Path $projectRoot 'node\core-geth'
$buildRoot = Join-Path $projectRoot 'build'

if (-not (Test-Path -LiteralPath $goExe)) {
    throw 'Go is not bootstrapped. Run .\scripts\bootstrap-go.ps1 first.'
}

if (-not (Test-Path -LiteralPath $compiler)) {
    throw 'The CGO compiler is not bootstrapped. Run .\scripts\bootstrap-cgo-toolchain.ps1 first.'
}

if (-not (Test-Path -LiteralPath $nodeRoot)) {
    throw 'Core-Geth submodule is missing. Run git submodule update --init --recursive first.'
}

$env:GOCACHE = Join-Path $projectRoot '.gocache'
$env:GOMODCACHE = Join-Path $projectRoot '.gomodcache'
$env:CGO_ENABLED = '1'
$env:CC = $compiler
New-Item -ItemType Directory -Path $env:GOCACHE -Force | Out-Null
New-Item -ItemType Directory -Path $env:GOMODCACHE -Force | Out-Null
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null

Push-Location $nodeRoot
try {
    & $goExe mod download
    if ($LASTEXITCODE -ne 0) { throw 'Core-Geth module download failed.' }

    & $goExe build -trimpath -o (Join-Path $buildRoot 'core-geth.exe') './cmd/geth'
    if ($LASTEXITCODE -ne 0) { throw 'Core-Geth build failed.' }

    if ($RunTests) {
        & $goExe test './...'
        if ($LASTEXITCODE -ne 0) { throw 'Core-Geth test suite failed.' }
    }
}
finally {
    Pop-Location
}

Write-Output "Core-Geth baseline build completed: $(Join-Path $buildRoot 'core-geth.exe')"
