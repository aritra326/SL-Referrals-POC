<#
.SYNOPSIS
  Puts the web resource files from this folder into a copy of an exported SL_Referrals solution zip.

.DESCRIPTION
  Use this when you changed a file in this folder and want a new solution package to import into another environment.
  It does not need a Dataverse connection: it edits the exported zip (see referral-lifecycle/scripts/New-DeploymentZip.ps1
  for why we edit the zip rather than unpack and pack it).

  Run it twice, once for the unmanaged export and once for the managed export:

  .\Build-SolutionZip.ps1 -SourceZip ..\..\solution-export\SL_Referrals_1_0_0_19.zip         -Version 1.0.0.21
  .\Build-SolutionZip.ps1 -SourceZip ..\..\solution-export\SL_Referrals_1_0_0_19_managed.zip -Version 1.0.0.21 -Managed

  Remember to also change the ?v= number in the three .html files to the same version (tests/sourceRules.test.js checks
  that they agree). The browser caches scripts by their address, so a new ?v= is what makes users get the new file.
#>
param(
    [Parameter(Mandatory)] [string]$SourceZip,
    [Parameter(Mandatory)] [string]$Version,
    [switch]$Managed,
    [string]$OutputFolder = (Join-Path $PSScriptRoot "..\..\solution-export")
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

# Web resource type numbers used by Dataverse: 1 = HTML, 2 = CSS, 3 = JavaScript.
$resources = @(
    @{ Name = "slcrm_common.js";                Display = "SL CRM common helpers";      Description = "Shared helpers for the web resource pages"; Type = 3; File = "$here\slcrm_common.js" },
    @{ Name = "slcrm_common.css";               Display = "SL CRM common styles";       Description = "Shared look for the web resource pages";    Type = 2; File = "$here\slcrm_common.css" },
    @{ Name = "slcrm_referraldecision.html";    Display = "Referral decision dialog";   Description = "Decision dialog page";                       Type = 1; File = "$here\slcrm_referraldecision.html" },
    @{ Name = "slcrm_referraldecision.js";      Display = "Referral decision script";   Description = "Decision dialog logic";                      Type = 3; File = "$here\slcrm_referraldecision.js" },
    @{ Name = "slcrm_copyrationale.html";       Display = "Copy Rationale page";        Description = "Copy Rationale page";                        Type = 1; File = "$here\slcrm_copyrationale.html" },
    @{ Name = "slcrm_copyrationale.js";         Display = "Copy Rationale script";      Description = "Copy Rationale logic";                       Type = 3; File = "$here\slcrm_copyrationale.js" },
    @{ Name = "slcrm_referralbuilder.html";     Display = "Referral Builder page";      Description = "New referral page";                          Type = 1; File = "$here\slcrm_referralbuilder.html" },
    @{ Name = "slcrm_referralbuilder.js";       Display = "Referral Builder script";    Description = "New referral logic";                         Type = 3; File = "$here\slcrm_referralbuilder.js" },
    @{ Name = "slcrm_ReferralCommands.js";      Display = "Referral Commands";          Description = "Command bar handlers for referrals";         Type = 3; File = "$here\slcrm_ReferralCommands.js" },
    @{ Name = "slcrm_OpportunityCommands.js";   Display = "Opportunity Commands";       Description = "Command bar handler for Copy Rationale";     Type = 3; File = "$here\slcrm_OpportunityCommands.js" }
)

$suffix = if ($Managed) { "_managed" } else { "" }
$versionText = $Version.Replace(".", "_")
$output = Join-Path $OutputFolder "SL_Referrals_$versionText$suffix.zip"

& (Join-Path $here "..\..\referral-lifecycle\scripts\New-DeploymentZip.ps1") `
    -SourceZip $SourceZip -OutputZip $output -Version $Version -Resources $resources
