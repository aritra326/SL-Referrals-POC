<#
.SYNOPSIS
  Uploads the files in this folder to a Dataverse environment as web resources and publishes them.

.DESCRIPTION
  The quick way to try an edit: change a file here, run this, refresh the app (Ctrl+F5).
  The environment must already have the SL_Referrals solution (so the web resources exist and are in the solution).
  Resources that do not exist yet are created and added to the SL_Referrals solution.

  Needs the Azure CLI signed in to the environment's tenant:  az login
  This is a developer tool. It is not part of the solution and nothing in the solution depends on it.

.EXAMPLE
  .\Deploy-WebResources.ps1 -OrgUrl https://myorg.crm11.dynamics.com
  .\Deploy-WebResources.ps1 -OrgUrl https://myorg.crm11.dynamics.com -Only slcrm_referralbuilder.js
#>
param(
    [Parameter(Mandatory)] [string]$OrgUrl,
    [string[]]$Only,
    [string]$SolutionName = "SL_Referrals"
)

$ErrorActionPreference = "Stop"
$OrgUrl = $OrgUrl.TrimEnd("/")
$token = az account get-access-token --resource $OrgUrl --query accessToken -o tsv
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "Content-Type" = "application/json" }
$api = "$OrgUrl/api/data/v9.2"

# File name -> Dataverse web resource type (1 = HTML, 2 = CSS, 3 = JavaScript).
$types = @{ ".html" = 1; ".css" = 2; ".js" = 3 }

$files = Get-ChildItem $PSScriptRoot -File | Where-Object { $_.Name -like "slcrm_*" -and $types.ContainsKey($_.Extension) }
if ($Only) { $files = $files | Where-Object { $Only -contains $_.Name } }

$publishIds = @()
foreach ($file in $files) {
    $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
    $found = (Invoke-RestMethod "$api/webresourceset?`$select=webresourceid&`$filter=name eq '$($file.Name)'" -Headers $headers).value | Select-Object -First 1

    if ($found) {
        Invoke-RestMethod "$api/webresourceset($($found.webresourceid))" -Method Patch -Headers $headers -Body (@{ content = $content } | ConvertTo-Json) | Out-Null
        $id = $found.webresourceid
        Write-Host "Updated  $($file.Name)"
    }
    else {
        $body = @{ name = $file.Name; displayname = $file.Name; webresourcetype = $types[$file.Extension]; content = $content } | ConvertTo-Json
        $created = Invoke-RestMethod "$api/webresourceset" -Method Post -Body $body `
            -Headers ($headers + @{ Prefer = "return=representation"; "MSCRM.SolutionUniqueName" = $SolutionName })
        $id = $created.webresourceid
        Write-Host "Created  $($file.Name)"
    }
    $publishIds += "<webresource>{$id}</webresource>"
}

$xml = "<importexportxml><webresources>$($publishIds -join '')</webresources></importexportxml>"
Invoke-RestMethod "$api/PublishXml" -Method Post -Headers $headers -Body (@{ ParameterXml = $xml } | ConvertTo-Json) | Out-Null
Write-Host "Published $($publishIds.Count) web resource(s). Hard-refresh the app (Ctrl+F5) to load them."
