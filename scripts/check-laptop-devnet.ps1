[CmdletBinding()]
param(
    [string]$RpcUrl = 'http://127.0.0.1:8545',
    [int]$MinimumPeers = 1
)

$ErrorActionPreference = 'Stop'

function Invoke-DevnetRpc([string]$Method, [object[]]$Params = @()) {
    $body = @{ jsonrpc = '2.0'; id = 1; method = $Method; params = $Params } | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Method Post -Uri $RpcUrl -ContentType 'application/json' -Body $body
    if ($response.error) { throw "RPC $Method failed: $($response.error.message)" }
    return $response.result
}

$peerCount = [Convert]::ToInt64((Invoke-DevnetRpc 'net_peerCount'), 16)
$blockNumber = [Convert]::ToInt64((Invoke-DevnetRpc 'eth_blockNumber'), 16)
$chainId = Invoke-DevnetRpc 'eth_chainId'
$syncing = Invoke-DevnetRpc 'eth_syncing'

if ($syncing -ne $false) { throw "Laptop node is still syncing: $($syncing | ConvertTo-Json -Compress)" }
if ($peerCount -lt $MinimumPeers) { throw "Laptop peer count $peerCount is below minimum $MinimumPeers" }

[pscustomobject]@{
    Status = 'healthy'
    ChainId = $chainId
    BlockNumber = $blockNumber
    PeerCount = $peerCount
} | Format-List
