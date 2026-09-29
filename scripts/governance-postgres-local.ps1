param([ValidateSet('init','start','stop','status')][string]$Action='status')
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot=[IO.Path]::GetFullPath((Join-Path $projectRoot 'build\postgres-native'))
$binaryRoot=Join-Path $projectRoot 'build\postgres-runtime\pgsql\bin'
$dataRoot=Join-Path $testRoot 'cluster'
$accessPath=Join-Path $testRoot 'cluster-access.json'
if(-not $testRoot.StartsWith($projectRoot+[IO.Path]::DirectorySeparatorChar)){throw 'Test path escaped project root'}
if(-not (Test-Path -LiteralPath (Join-Path $binaryRoot 'pg_ctl.exe'))){throw 'Install the official portable PostgreSQL archive in build/postgres-runtime first'}
if($Action -eq 'init'){
 if(Test-Path -LiteralPath $dataRoot){throw 'Cluster directory already exists; refusing to overwrite it'}
 New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
 if(Test-Path -LiteralPath $accessPath){throw 'Existing cluster credentials found; refusing to replace them'}
 $password=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
 $settings=@{host='127.0.0.1';port=55439;user='governance_test_admin';password=$password}
 [IO.File]::WriteAllText($accessPath,($settings|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
 $passwordFile=Join-Path $testRoot 'init-password.txt'
 [IO.File]::WriteAllText($passwordFile,$password,[Text.UTF8Encoding]::new($false))
 try{
  & (Join-Path $binaryRoot 'initdb.exe') -D $dataRoot -U governance_test_admin --pwfile=$passwordFile --auth=scram-sha-256 --encoding=UTF8 --locale=C
  if($LASTEXITCODE -ne 0){throw 'PostgreSQL cluster initialization failed'}
 }finally{Remove-Item -LiteralPath $passwordFile -ErrorAction SilentlyContinue}
 [IO.File]::WriteAllText((Join-Path $testRoot 'LOCAL-SYNTHETIC-ONLY'),'Dedicated loopback governance test cluster; no production data.')
 exit 0
}
if(-not (Test-Path -LiteralPath (Join-Path $testRoot 'LOCAL-SYNTHETIC-ONLY'))){throw 'Dedicated test-cluster marker is missing'}
switch($Action){
 'start'{& (Join-Path $binaryRoot 'pg_ctl.exe') -D $dataRoot -l (Join-Path $testRoot 'postgres.log') -o '-h 127.0.0.1 -p 55439 -c max_connections=50 -c shared_buffers=64MB' -w start}
 'stop'{& (Join-Path $binaryRoot 'pg_ctl.exe') -D $dataRoot -m fast -w stop}
 'status'{& (Join-Path $binaryRoot 'pg_ctl.exe') -D $dataRoot status}
}
exit $LASTEXITCODE
