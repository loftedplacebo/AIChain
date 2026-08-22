[CmdletBinding()]
param(
    [string]$Benchtime = '3x'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$goExe = Join-Path $projectRoot '.toolchains\go1.21.13\go\bin\go.exe'
$compilerDirectory = Join-Path $projectRoot '.toolchains\llvm-mingw-20260616-ucrt-x86_64\bin'
$cc = Join-Path $compilerDirectory 'x86_64-w64-mingw32-clang.exe'
$cxx = Join-Path $compilerDirectory 'x86_64-w64-mingw32-clang++.exe'
$spikeDirectory = Join-Path $projectRoot 'spikes\c1-kawpow-verifier'
$expectedCommit = '061d341011ca341e1f506c52b571f5fd64a0df71'

foreach ($path in @($goExe, $cc, $cxx, (Join-Path $spikeDirectory 'cpp-kawpow\.git'))) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required Phase 2A spike dependency is missing: $path" }
}
if ((& git -C (Join-Path $spikeDirectory 'cpp-kawpow') rev-parse HEAD).Trim() -ne $expectedCommit) {
    throw 'cpp-kawpow source is not at the pinned Phase 2A commit.'
}

$env:GOCACHE = Join-Path $projectRoot '.gocache'
$env:GOMODCACHE = Join-Path $projectRoot '.gomodcache'
$env:CGO_ENABLED = '1'
$env:CC = $cc
$env:CXX = $cxx
$env:PATH = "$compilerDirectory;$env:PATH"

Push-Location $spikeDirectory
try {
    & $goExe test -run '^$' -bench '^Benchmark(Hash|Verify)(IncludesEpochSetup|CachedEpoch)$' -benchtime $Benchtime -count 1
    if ($LASTEXITCODE -ne 0) { throw 'C1 KawPoW verifier spike benchmark failed.' }
}
finally {
    Pop-Location
}
