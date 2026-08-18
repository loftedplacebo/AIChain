[CmdletBinding()]
param(
    [string]$DataDir = (Join-Path $PSScriptRoot '..\devnet\node-1'),
    [string]$GenesisPath = (Join-Path $PSScriptRoot '..\config\devnet\genesis.json'),
    [string]$PrefundedAddress
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeBinary = Join-Path $projectRoot 'build\core-geth.exe'

if (-not (Test-Path -LiteralPath $nodeBinary)) {
    throw "Core-Geth binary not found at $nodeBinary. Run .\scripts\build-core-geth.ps1 first."
}
if (-not (Test-Path -LiteralPath $GenesisPath)) {
    throw "Genesis file not found at $GenesisPath."
}
if (Test-Path -LiteralPath (Join-Path $DataDir 'geth')) {
    throw "A chain database already exists at $DataDir. Use a new directory or remove the development-only data deliberately."
}

$genesis = Get-Content -LiteralPath $GenesisPath -Raw | ConvertFrom-Json
if ($PrefundedAddress) {
    if ($PrefundedAddress -notmatch '^0x[0-9a-fA-F]{40}$') {
        throw 'PrefundedAddress must be a 0x-prefixed, 40-hex-character address.'
    }
    $genesis.alloc | Add-Member -NotePropertyName $PrefundedAddress -NotePropertyValue ([PSCustomObject]@{ balance = '0x3635c9adc5dea00000' })
}

New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
$resolvedGenesis = Join-Path $DataDir 'genesis.json'
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($resolvedGenesis, ($genesis | ConvertTo-Json -Depth 10), $utf8WithoutBom)

& $nodeBinary --datadir $DataDir init $resolvedGenesis
if ($LASTEXITCODE -ne 0) {
    throw "Core-Geth genesis initialization failed with exit code $LASTEXITCODE."
}

Write-Host "Initialized development-only devnet data directory: $DataDir"
if (-not $PrefundedAddress) {
    Write-Warning 'No account was pre-funded. Create an account and initialize a fresh devnet directory with -PrefundedAddress before testing transactions.'
}
