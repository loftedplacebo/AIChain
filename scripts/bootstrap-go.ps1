[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot '.toolchains'
$toolchainName = 'go1.21.13'
$goRoot = Join-Path $toolRoot $toolchainName
$goExe = Join-Path $goRoot 'bin\go.exe'
$archivePath = Join-Path $env:TEMP "$toolchainName.windows-amd64.zip"
$expectedHash = '924655193634bfcdf7ec7a34589e0d73458741998a59e4155a929ce85f81af2d'

if (Test-Path -LiteralPath $goExe) {
    & $goExe version
    exit $LASTEXITCODE
}

if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
    throw "This bootstrap currently supports Windows AMD64 only; detected $env:PROCESSOR_ARCHITECTURE."
}

Invoke-WebRequest -Uri 'https://go.dev/dl/go1.21.13.windows-amd64.zip' -OutFile $archivePath

$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
    throw "Go archive checksum mismatch: $actualHash"
}

New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
New-Item -ItemType Directory -Path $goRoot -Force | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $goRoot -Force
Remove-Item -LiteralPath $archivePath -Force

& $goExe version
