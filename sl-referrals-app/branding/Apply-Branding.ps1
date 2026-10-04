<#
  Applies the Intact Insurance UK top-bar theme in an environment that has the SL_Referrals solution imported.
  Why a script: Dataverse themes cannot be added to a solution, so the top-bar logo does not travel in the zip.
  The logo image itself (web resource slcrm_/branding/intact_logo_reversed.svg) and the app tile icon DO travel in
  the solution; this script only creates the theme row that points at the logo and makes it the active theme.
  NOTE: the active theme is environment-wide, so it changes the top bar of every app in that environment.
  Usage:  az login (target tenant), then  .\Apply-Branding.ps1 -OrgUrl https://<target>.crm.dynamics.com
  Re-runnable: updates the theme if it already exists.
#>
param([Parameter(Mandatory)][string]$OrgUrl)
$ErrorActionPreference = 'Stop'
$OrgUrl = $OrgUrl.TrimEnd('/')
$token = az account get-access-token --resource $OrgUrl --query accessToken -o tsv
$h = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'Content-Type' = 'application/json' }
$api = "$OrgUrl/api/data/v9.2"

$logo = (Invoke-RestMethod "$api/webresourceset?`$select=webresourceid&`$filter=name eq 'slcrm_/branding/intact_logo_reversed.svg'" -Headers $h).value | Select-Object -First 1
if (-not $logo) { throw 'Logo web resource not found. Import the SL_Referrals solution (1.0.0.19 or later) first.' }

$theme = [ordered]@{
  name = 'Intact Insurance UK'; logotooltip = 'Intact Insurance UK'
  'logoimage@odata.bind' = "/webresourceset($($logo.webresourceid))"
  navbarbackgroundcolor = '#0B1F3A'; navbarshelfcolor = '#FFFFFF'
  headercolor = '#E3002B'; maincolor = '#E3002B'; accentcolor = '#E3002B'; globallinkcolor = '#B3001F'
  controlborder = '#BDC3C7'; controlshade = '#FFFFFF'; hoverlinkeffect = '#F3F3F3'; selectedlinkeffect = '#F8FAFC'
  panelheaderbackgroundcolor = '#F3F3F3'; pageheaderbackgroundcolor = '#E0E0E0'; backgroundcolor = '#FFFFFF'
  defaultcustomentitycolor = '#00CCA3'; defaultentitycolor = '#666666'; processcontrolcolor = '#358717'
}
$body = $theme | ConvertTo-Json
$existing = (Invoke-RestMethod "$api/themes?`$select=themeid&`$filter=name eq 'Intact Insurance UK'" -Headers $h).value | Select-Object -First 1
if ($existing) { $id = $existing.themeid; Invoke-RestMethod "$api/themes($id)" -Method Patch -Headers $h -Body $body | Out-Null }
else { $r = Invoke-RestMethod "$api/themes" -Method Post -Headers ($h + @{ Prefer = 'return=representation' }) -Body $body; $id = $r.themeid }
Invoke-RestMethod "$api/themes($id)/Microsoft.Dynamics.CRM.PublishTheme" -Method Post -Headers $h -Body '{}' | Out-Null
Write-Host "Theme $id published. Hard-refresh the app (Ctrl+F5) to see the logo."
