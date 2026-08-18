[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot '.toolchains'
$toolchainName = 'llvm-mingw-20260616-ucrt-x86_64'
$toolchainRoot = Join-Path $toolRoot $toolchainName
$compiler = Join-Path $toolchainRoot 'bin\x86_64-w64-mingw32-clang.exe'
$archivePath = Join-Path $env:TEMP "$toolchainName.zip"
$expectedHash = 'b9b68a4d276e16fa25802aaba458e4638f64b3884c290aaccdc2d87083b6ca35'

if (Test-Path -LiteralPath $compiler) {
    & $compiler --version
    exit $LASTEXITCODE
}

if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
    throw "This bootstrap currently supports Windows AMD64 only; detected $env:PROCESSOR_ARCHITECTURE."
}

Invoke-WebRequest -Uri 'https://github.com/mstorsjo/llvm-mingw/releases/download/20260616/llvm-mingw-20260616-ucrt-x86_64.zip' -OutFile $archivePath

$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
    throw "LLVM-MinGW archive checksum mismatch: $actualHash"
}

New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $toolRoot -Force
Remove-Item -LiteralPath $archivePath -Force

& $compiler --version
