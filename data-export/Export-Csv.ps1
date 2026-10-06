<#
  Writes one CSV per table (same 15 tables and order as data/manifest.json) from a live environment.
  Usage:   az login (source tenant), then  .\Export-Csv.ps1 -OrgUrl https://<source>.crm17.dynamics.com
  Output:  ..\csv-export\NN-<table>.csv  (UTF-8 with BOM so Excel opens it correctly)
  Columns: <table>id (GUID, lets the import wizard upsert/match), then every column the app uses.
    - Choice / Status columns are written as their labels (the import wizard maps labels to options).
    - Lookups are written as the target row's primary name (the wizard resolves them by name).
    - Dates are ISO 8601 UTC.
  Row set = the rows listed in data/*.json, so the account/opportunity files only hold the referenced rows.
#>
param(
  [Parameter(Mandatory)][string]$OrgUrl,
  [string]$DataDir = (Join-Path $PSScriptRoot 'data'),
  [string]$OutDir = (Join-Path $PSScriptRoot '..\csv-export')
)
$ErrorActionPreference = 'Stop'
$OrgUrl = $OrgUrl.TrimEnd('/')
$token = az account get-access-token --resource $OrgUrl --query accessToken -o tsv
$h = @{ Authorization = "Bearer $token"; Accept = 'application/json'
        Prefer = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' }
$api = "$OrgUrl/api/data/v9.2"
$fv = '@OData.Community.Display.V1.FormattedValue'
$manifest = Get-Content (Join-Path $DataDir 'manifest.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force $OutDir | Out-Null

$n = 0
foreach ($t in $manifest.importOrder) {
  $n++
  $data = Get-Content (Join-Path $DataDir "$t.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  $fields = @($data.records | ForEach-Object { $_.fields.PSObject.Properties.Name } | Select-Object -Unique)
  $lookups = @($data.records | ForEach-Object { $_.lookups } | ForEach-Object { $_.attr } | Select-Object -Unique)
  $users = @($data.records | ForEach-Object { $_.users } | ForEach-Object { $_.attr } | Select-Object -Unique)
  $lookupCols = @($lookups + $users | Where-Object { $_ } | Select-Object -Unique)
  $primary = @($fields | Where-Object { $_ -like '*name' } | Select-Object -First 1)
  $ordered = @($primary) + @($fields | Where-Object { $_ -notin $primary }) | Where-Object { $_ }
  $select = @("${t}id") + $ordered + @($lookupCols | ForEach-Object { "_$($_)_value" })
  $rows = foreach ($r in $data.records) {
    $rec = Invoke-RestMethod "$api/$($data.set)($($r.id))?`$select=$($select -join ',')" -Headers $h
    $o = [ordered]@{ "${t}id" = $rec."${t}id" }
    foreach ($f in $ordered) {
      $v = $rec.$f
      $label = $rec.PSObject.Properties["$f$fv"]
      # Only choice/status (integers) and yes/no columns use their label. Dates, money and decimals keep the raw
      # value, and a label that is just a formatted number (e.g. "1,200") is ignored.
      $isLabelType = $v -is [bool] -or $v -is [int] -or $v -is [long]
      $o[$f] = if ($null -ne $label -and $isLabelType -and $label.Value -notmatch '^[\d,\.\-]+$') { $label.Value.Trim() } else { $v }
    }
    foreach ($l in $lookupCols) {
      $p = $rec.PSObject.Properties["_$($l)_value$fv"]
      $o[$l] = if ($p) { $p.Value } else { $null }
    }
    [pscustomobject]$o
  }
  $file = Join-Path $OutDir ('{0:D2}-{1}.csv' -f $n, $t)
  $rows | Export-Csv $file -NoTypeInformation -Encoding UTF8
  Write-Host ("{0,-30} {1} rows" -f $t, @($rows).Count)
}
