<#
.SYNOPSIS
  Creates the strong-name key (.snk) the plug-in assembly must be signed with. Run once per developer machine.

.DESCRIPTION
  Dataverse only accepts strong-named plug-in assemblies. The key file is NOT committed (see .gitignore): keep it
  somewhere safe and reuse the same key for every build, otherwise Dataverse treats each build as a different assembly.
  Needs Windows PowerShell 5.1 (it uses .NET Framework cryptography).

.PARAMETER Path
  Where to write the key. Defaults to SLCRM.ReferralLifecycle.snk next to this script's parent folder.
#>
param(
    [string]$Path = (Join-Path (Split-Path $PSScriptRoot -Parent) "SLCRM.ReferralLifecycle.snk")
)

if (Test-Path $Path) {
    Write-Host "Key already exists, leaving it alone: $Path"
    return
}

$rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
[System.IO.File]::WriteAllBytes($Path, $rsa.ExportCspBlob($true))
Write-Host "Created $Path"
