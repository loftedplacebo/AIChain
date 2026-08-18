[CmdletBinding()]
param(
    [string]$DataDir = (Join-Path $PSScriptRoot '..\devnet\node-1'),
    [int]$NetworkId = 20260818,
    [int]$Port = 30303,
    [string]$Bootnodes = '',
    [switch]$Mine,
    [string]$Etherbase,
    [int]$MinerThreads = 1
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeBinary = Join-Path $projectRoot 'build\core-geth.exe'

if (-not (Test-Path -LiteralPath $nodeBinary)) {
    throw "Core-Geth binary not found at $nodeBinary. Run .\scripts\build-core-geth.ps1 first."
}
if (-not (Test-Path -LiteralPath (Join-Path $DataDir 'geth'))) {
    throw "No initialized chain database found at $DataDir. Run .\scripts\initialize-devnet.ps1 first."
}
if ($Mine -and -not $Etherbase) {
    throw 'Mining requires -Etherbase with a 0x-prefixed reward address.'
}

$arguments = @(
    '--datadir', $DataDir,
    '--networkid', $NetworkId,
    '--port', $Port,
    '--nat', 'none',
    '--ethash.dagdir', (Join-Path $DataDir 'ethash-dag'),
    '--http',
    '--http.addr', '127.0.0.1',
    '--http.port', '8545',
    '--http.api', 'eth,net,web3,txpool',
    '--http.vhosts', 'localhost',
    '--nodiscover'
)
if ($Bootnodes) { $arguments += @('--bootnodes', $Bootnodes) }
if ($Mine) { $arguments += @('--mine', '--miner.etherbase', $Etherbase, '--miner.threads', $MinerThreads) }

Write-Host 'Starting a development-only node. HTTP JSON-RPC is bound to localhost.'
& $nodeBinary @arguments
