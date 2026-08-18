[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot '.toolchains'
$goRoot = Join-Path $toolRoot 'go'
$goExe = Join-Path $goRoot 'bin\go.exe'
$archivePath = Join-Path $env:TEMP 'go1.26.5.windows-amd64.zip'
$expectedHash = '97e6b2a833b6d89f9ff17d25419ac0a7e3b482a044e9ab18cdef834bd834fd38'

if (Test-Path -LiteralPath $goExe) {
    & $goExe version
    exit $LASTEXITCODE
}

if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
    throw "This bootstrap currently supports Windows AMD64 only; detected $env:PROCESSOR_ARCHITECTURE."
}

Invoke-WebRequest -Uri 'https://go.dev/dl/go1.26.5.windows-amd64.zip' -OutFile $archivePath

$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
    throw "Go archive checksum mismatch: $actualHash"
}

New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $toolRoot -Force
Remove-Item -LiteralPath $archivePath -Force

& $goExe version
