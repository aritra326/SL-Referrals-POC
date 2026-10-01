<#
.SYNOPSIS
  Builds the solution, runs the unit tests, and produces ONE signed assembly ready to register in Dataverse.

.DESCRIPTION
  Dataverse loads a single plug-in assembly, but our code is split into four projects (Domain, Application,
  Dataverse, Plugins). This script merges them into out\SLCRM.ReferralLifecycle.dll with ILRepack and signs the result.
  Microsoft.Xrm.Sdk and friends are NOT merged: Dataverse already provides them.

  Prerequisites: .NET SDK 8.0.x (see global.json), nuget.exe on PATH (or the one that ships with the Power Platform
  CLI), and a strong-name key (run scripts\New-StrongNameKey.ps1 once).

.EXAMPLE
  .\scripts\Build-PluginAssembly.ps1
#>
param(
    [string]$KeyFile = (Join-Path (Split-Path $PSScriptRoot -Parent) "SLCRM.ReferralLifecycle.snk"),
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path $KeyFile)) { throw "Strong-name key not found: $KeyFile. Run scripts\New-StrongNameKey.ps1 first." }

Write-Host "== Build (Release) =="
dotnet build ReferralLifecycle.sln -c Release --nologo -v q
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

if (-not $SkipTests) {
    Write-Host "== Unit tests =="
    dotnet test ReferralLifecycle.sln -c Release --no-build --nologo -v q
    if ($LASTEXITCODE -ne 0) { throw "Tests failed. Fix them before packaging." }
}

Write-Host "== Get ILRepack =="
$toolsDir = Join-Path $root ".tools"
$ilrepack = Get-ChildItem $toolsDir -Recurse -Filter ILRepack.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ilrepack) {
    $nuget = (Get-Command nuget -ErrorAction SilentlyContinue).Source
    if (-not $nuget) { $nuget = Join-Path $env:LOCALAPPDATA "Microsoft\PowerAppsCLI\nuget.exe" }
    if (-not (Test-Path $nuget)) { throw "nuget.exe not found. Install it or the Power Platform CLI." }
    & $nuget install ILRepack -Version 2.0.34 -OutputDirectory $toolsDir -NonInteractive | Out-Null
    $ilrepack = Get-ChildItem $toolsDir -Recurse -Filter ILRepack.exe | Select-Object -First 1
}

Write-Host "== Merge and sign =="
$bin = Join-Path $root "src\Referral.Plugins\bin\Release\net462"
$out = Join-Path $root "out"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$merged = Join-Path $out "SLCRM.ReferralLifecycle.dll"

& $ilrepack.FullName /out:$merged /keyfile:$KeyFile /lib:$bin `
    (Join-Path $bin "SLCRM.ReferralLifecycle.dll") `
    (Join-Path $bin "Referral.Domain.dll") `
    (Join-Path $bin "Referral.Application.dll") `
    (Join-Path $bin "Referral.Dataverse.dll")
if ($LASTEXITCODE -ne 0) { throw "ILRepack failed." }

$name = [System.Reflection.AssemblyName]::GetAssemblyName($merged)
$token = ($name.GetPublicKeyToken() | ForEach-Object { $_.ToString("x2") }) -join ""
Write-Host ""
Write-Host "Built $merged"
Write-Host ("  Name      : {0}" -f $name.Name)
Write-Host ("  Version   : {0}" -f $name.Version)
Write-Host ("  Public key: {0}" -f $token)
Write-Host ("  Size      : {0:N0} bytes" -f (Get-Item $merged).Length)
