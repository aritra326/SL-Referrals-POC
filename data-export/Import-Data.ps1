<#
  Imports the JSON written by Export-Data.ps1 into another environment.
  Prerequisite: import the SL_Referrals solution (managed or unmanaged) into the target first, so the tables exist.
  Usage:   az login   (target tenant)   then   .\Import-Data.ps1 -OrgUrl https://<target>.crm.dynamics.com
  Re-runnable: records are upserted by their original GUID, so running it twice does not duplicate anything.
  Users are matched by email; anyone not found in the target is replaced by the user running the import.
  Tip: run it before registering the lifecycle plug-ins, or the decision guard may reject historic decisions.
#>
param(
  [Parameter(Mandatory)][string]$OrgUrl,
  [string]$DataDir = (Join-Path $PSScriptRoot 'data')
)
$ErrorActionPreference = 'Stop'
$OrgUrl = $OrgUrl.TrimEnd('/')
$token = az account get-access-token --resource $OrgUrl --query accessToken -o tsv
$h = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'Content-Type' = 'application/json; charset=utf-8' }
$api = "$OrgUrl/api/data/v9.2"
$manifest = Get-Content (Join-Path $DataDir 'manifest.json') -Raw | ConvertFrom-Json
$sets = @{}; $manifest.sets.PSObject.Properties | ForEach-Object { $sets[$_.Name] = $_.Value }

$me = (Invoke-RestMethod "$api/WhoAmI" -Headers $h).UserId
Write-Host "Importing into $OrgUrl as $me"
$userCache = @{}
function Resolve-User($email) {
  if (-not $email) { return $me }
  if (-not $userCache.ContainsKey($email)) {
    $f = [uri]::EscapeDataString("internalemailaddress eq '$email'")
    $u = (Invoke-RestMethod "$api/systemusers?`$select=systemuserid&`$filter=$f" -Headers $h).value | Select-Object -First 1
    $userCache[$email] = if ($u) { $u.systemuserid } else { $me }
  }
  $userCache[$email]
}
function Send($set, $id, $body) {
  # PATCH on a keyed URL is an upsert: creates the row with that GUID if absent, otherwise updates it.
  Invoke-RestMethod "$api/$set($id)" -Method Patch -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 6))) | Out-Null
}

$done = @{}      # guid -> $true for every row already in the target
$deferred = @()  # lookups whose target was not imported yet
$failed = @()
foreach ($t in $manifest.importOrder) {
  $file = Join-Path $DataDir "$t.json"
  if (-not (Test-Path $file)) { continue }
  $data = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json
  $ok = 0
  foreach ($r in $data.records) {
    $body = [ordered]@{}
    foreach ($p in $r.fields.PSObject.Properties) { $body[$p.Name] = $p.Value }
    foreach ($l in $r.lookups) {
      $setName = $sets[$l.entity]
      if ($done.ContainsKey($l.id) -or $l.entity -eq $t) {
        if ($l.entity -eq $t -and -not $done.ContainsKey($l.id)) { $deferred += [pscustomobject]@{ set = $data.set; id = $r.id; nav = $l.nav; target = "/$setName($($l.id))" }; continue }
        $body["$($l.nav)@odata.bind"] = "/$setName($($l.id))"
      } else { $deferred += [pscustomobject]@{ set = $data.set; id = $r.id; nav = $l.nav; target = "/$setName($($l.id))" } }
    }
    foreach ($u in $r.users) { $body["$($u.nav)@odata.bind"] = "/systemusers($(Resolve-User $u.email))" }
    try { Send $data.set $r.id $body }
    catch {
      # Some status values cannot be set on create; retry without them rather than losing the record.
      if ($body.Contains('statuscode')) { $body.Remove('statuscode'); try { Send $data.set $r.id $body } catch { $failed += "$t $($r.id): $($_.Exception.Message)"; continue } }
      else { $failed += "$t $($r.id): $($_.Exception.Message)"; continue }
    }
    $done[$r.id] = $true; $ok++
  }
  Write-Host ("{0,-30} {1}/{2}" -f $t, $ok, @($data.records).Count)
}

# Second pass: lookups that pointed at rows imported later (or at the same table).
foreach ($d in $deferred) {
  try { Send $d.set $d.id @{ "$($d.nav)@odata.bind" = $d.target } } catch { $failed += "lookup $($d.nav) on $($d.id): $($_.Exception.Message)" }
}
Write-Host "Deferred lookups applied: $(@($deferred).Count)"
if ($failed) { Write-Warning "$($failed.Count) problem(s):"; $failed | ForEach-Object { Write-Warning $_ } } else { Write-Host 'No errors.' }
