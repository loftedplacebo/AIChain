[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,
    [string]$BuildDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'build\phase2a\c1-kawpow-vector-check')
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$expectedCommit = '061d341011ca341e1f506c52b571f5fd64a0df71'
$cCompiler = Join-Path $projectRoot '.toolchains\llvm-mingw-20260616-ucrt-x86_64\bin\x86_64-w64-mingw32-clang.exe'
$compiler = Join-Path $projectRoot '.toolchains\llvm-mingw-20260616-ucrt-x86_64\bin\x86_64-w64-mingw32-clang++.exe'
$runner = Join-Path $projectRoot 'benchmarks\pow\tools\c1_kawpow_vector_check.cpp'

if (-not (Test-Path -LiteralPath $cCompiler)) { throw "Pinned C compiler not found: $cCompiler" }
if (-not (Test-Path -LiteralPath $compiler)) { throw "Pinned C++ compiler not found: $compiler" }
if (-not (Test-Path -LiteralPath $runner)) { throw "Runner source not found: $runner" }
if (-not (Test-Path -LiteralPath (Join-Path $SourceDir '.git'))) { throw 'SourceDir must be a git checkout of Ravencoin/cpp-kawpow.' }

$actualCommit = (& git -C $SourceDir rev-parse HEAD).Trim()
if ($actualCommit -ne $expectedCommit) {
    throw "Unexpected cpp-kawpow revision: $actualCommit. Expected pinned commit $expectedCommit."
}

$required = @(
    'include\ethash\progpow.hpp',
    'test\unittests\progpow_test_vectors.hpp',
    'lib\ethash\ethash.cpp',
    'lib\ethash\managed.cpp',
    'lib\ethash\progpow.cpp',
    'lib\ethash\primes.c',
    'lib\keccak\keccak.c',
    'lib\keccak\keccakf1600.c',
    'lib\keccak\keccakf800.c'
)
foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $SourceDir $path))) { throw "Required upstream file is missing: $path" }
}

New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
$binary = Join-Path $BuildDir 'c1-kawpow-vector-check.exe'

$cppSources = @(
    $runner,
    (Join-Path $SourceDir 'lib\ethash\ethash.cpp'),
    (Join-Path $SourceDir 'lib\ethash\managed.cpp'),
    (Join-Path $SourceDir 'lib\ethash\progpow.cpp')
)
$cSources = @(
    (Join-Path $SourceDir 'lib\ethash\primes.c'),
    (Join-Path $SourceDir 'lib\keccak\keccak.c'),
    (Join-Path $SourceDir 'lib\keccak\keccakf1600.c'),
    (Join-Path $SourceDir 'lib\keccak\keccakf800.c')
)
$objects = @()
foreach ($source in $cSources) {
    $object = Join-Path $BuildDir ((Split-Path -LeafBase $source) + '.o')
    & $cCompiler -std=c11 -O2 "-I$(Join-Path $SourceDir 'include')" "-I$(Join-Path $SourceDir 'lib')" '-c' $source '-o' $object
    if ($LASTEXITCODE -ne 0) { throw "C1 C source compilation failed: $source" }
    $objects += $object
}

& $compiler -std=c++11 -O2 -static "-I$(Join-Path $SourceDir 'include')" "-I$(Join-Path $SourceDir 'lib')" "-I$(Join-Path $SourceDir 'test\unittests')" $cppSources $objects '-o' $binary
if ($LASTEXITCODE -ne 0) { throw 'C1 vector runner compilation failed.' }

& $binary
if ($LASTEXITCODE -ne 0) { throw 'C1 vector runner failed.' }
