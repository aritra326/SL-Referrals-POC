<#
  Exports the SL Referrals data (slcrm_ tables + the accounts/opportunities they reference) to JSON, keeping record
  GUIDs and lookups so Import-Data.ps1 can recreate it exactly in another environment.
  Uses the Azure CLI for the token:  az login  (same tenant as `pac auth`), then  .\Export-Data.ps1
#>
param(
  [string]$OrgUrl = 'https://61858932.crm17.dynamics.com',
  [string]$OutDir = (Join-Path $PSScriptRoot 'data')
)
$ErrorActionPreference = 'Stop'
$token = az account get-access-token --resource $OrgUrl --query accessToken -o tsv
$h = @{ Authorization = "Bearer $token"; Accept = 'application/json'; Prefer = 'odata.include-annotations="*"' }
$api = "$OrgUrl/api/data/v9.2"
New-Item -ItemType Directory -Force $OutDir | Out-Null

# Dependency order: reference data first, then the referral chain.
$slcrm = 'slcrm_country','slcrm_product','slcrm_coversection','slcrm_authoritylevel','slcrm_referralreason',
         'slcrm_policy','slcrm_rational','slcrm_underwriterauthority','slcrm_referralrequest','slcrm_referralitem',
         'slcrm_referraldecision','slcrm_referralparticipant','slcrm_referralnotification'
$skipAttrs = 'organizationid','ownerid','owninguser','owningteam','owningbusinessunit','transactioncurrencyid','exchangerate',
             'overriddencreatedon','importsequencenumber','timezoneruleversionnumber','utcconversiontimezonecode','versionnumber'

# Whitelists for the standard tables (their full column set has many read-only/calculated columns).
$std = @{
  account     = @{ set='accounts';      id='accountid';     cols='name','accountnumber','telephone1','emailaddress1','address1_line1','address1_city','address1_postalcode','address1_country','websiteurl','description' }
  opportunity = @{ set='opportunities'; id='opportunityid'; cols='name','parentaccountid','description','estimatedvalue','estimatedclosedate','budgetamount','closeprobability' }
}
$setNames = @{ account='accounts'; opportunity='opportunities'; systemuser='systemusers'; contact='contacts' }
$userCache = @{}
function Get-UserEmail($id) {
  if (-not $userCache.ContainsKey($id)) {
    try { $userCache[$id] = (Invoke-RestMethod "$api/systemusers($id)?`$select=internalemailaddress" -Headers $h).internalemailaddress } catch { $userCache[$id] = $null }
  }
  $userCache[$id]
}
# Windows PowerShell 5.1 adds a byte-order mark with -Encoding UTF8, which breaks other tools. Write plain UTF-8 instead.
function Write-Json($path) {
  process { $text += $_ }
  end { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding($false))) }
}
function Get-All($url) {
  while ($url) { $r = Invoke-RestMethod $url -Headers $h; $r.value; $url = $r.'@odata.nextLink' }
}
function Get-Meta($logical) {
  $m = Invoke-RestMethod "$api/EntityDefinitions(LogicalName='$logical')?`$select=EntitySetName,PrimaryIdAttribute&`$expand=ManyToOneRelationships(`$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity)" -Headers $h
  $a = (Invoke-RestMethod "$api/EntityDefinitions(LogicalName='$logical')/Attributes?`$select=LogicalName,IsValidForCreate" -Headers $h).value |
       Where-Object IsValidForCreate | ForEach-Object LogicalName
  [pscustomobject]@{ Set = $m.EntitySetName; Id = $m.PrimaryIdAttribute; Rels = $m.ManyToOneRelationships; Writable = $a }
}
function Convert-Row($row, $meta, $cols) {
  $fields = [ordered]@{}; $lookups = @(); $users = @()
  foreach ($p in $row.PSObject.Properties) {
    $n = $p.Name
    if ($n -like '*@*' -or $null -eq $p.Value) { continue }
    if ($n -match '^_(.+)_value$') {
      $attr = $Matches[1]
      if ($skipAttrs -contains $attr -or $attr -match '^(created|modified)') { continue }
      # The whitelist is for the standard columns. Our own slcrm_* lookups (e.g. the opportunity's policy) are always kept.
      if ($cols -and $cols -notcontains $attr -and $attr -notlike 'slcrm_*') { continue }
      $target = $row."$n@Microsoft.Dynamics.CRM.lookuplogicalname"
      $rels = @($meta.Rels | Where-Object ReferencingAttribute -eq $attr)
      $rel = $rels | Where-Object ReferencedEntity -eq $target | Select-Object -First 1
      if (-not $rel) { continue }
      if ($target -eq 'systemuser') { $users += [ordered]@{ attr = $attr; nav = $rel.ReferencingEntityNavigationPropertyName; email = (Get-UserEmail $p.Value) } }
      else { $lookups += [ordered]@{ attr = $attr; nav = $rel.ReferencingEntityNavigationPropertyName; entity = $target; id = $p.Value } }
    }
    elseif ($n -ne $meta.Id) {
      if ($cols) { if ($cols -notcontains $n -and $n -notlike 'slcrm_*') { continue } }
      elseif ($meta.Writable -notcontains $n -or $skipAttrs -contains $n) { continue }
      $fields[$n] = $p.Value
    }
  }
  [ordered]@{ id = $row.($meta.Id); fields = $fields; lookups = $lookups; users = $users }
}

$manifest = @(); $refs = @{ account = @{}; opportunity = @{} }
foreach ($t in $slcrm) {
  $meta = Get-Meta $t; $setNames[$t] = $meta.Set
  $rows = @(Get-All "$api/$($meta.Set)")
  $recs = @($rows | ForEach-Object { Convert-Row $_ $meta $null })
  foreach ($r in $recs) { foreach ($l in $r.lookups) { if ($refs.ContainsKey($l.entity)) { $refs[$l.entity][$l.id] = $true } } }
  [ordered]@{ table = $t; set = $meta.Set; records = $recs } | ConvertTo-Json -Depth 10 | Write-Json (Join-Path $OutDir "$t.json")
  "{0,-30} {1}" -f $t, $recs.Count
  $manifest += [ordered]@{ table = $t; count = $recs.Count }
}

# Referenced opportunities first (they point at accounts), then the accounts those need.
$stdOut = @{}
foreach ($t in 'opportunity','account') {
  $meta = Get-Meta $t; $cfg = $std[$t]
  $recs = @()
  foreach ($id in @($refs[$t].Keys)) {
    $row = Invoke-RestMethod "$api/$($cfg.set)($id)" -Headers $h
    $rec = Convert-Row $row $meta $cfg.cols
    if ($t -eq 'opportunity') { foreach ($l in $rec.lookups) { if ($l.entity -eq 'account') { $refs['account'][$l.id] = $true } } }
    $recs += $rec
  }
  $stdOut[$t] = $recs
}
foreach ($t in 'account','opportunity') {
  $recs = @($stdOut[$t])
  # account list may have grown after opportunities were read
  if ($t -eq 'account') {
    $have = @($recs | ForEach-Object id)
    foreach ($id in @($refs['account'].Keys)) { if ($have -notcontains $id) { $recs += Convert-Row (Invoke-RestMethod "$api/accounts($id)" -Headers $h) (Get-Meta 'account') $std.account.cols } }
  }
  [ordered]@{ table = $t; set = $std[$t].set; records = $recs } | ConvertTo-Json -Depth 10 | Write-Json (Join-Path $OutDir "$t.json")
  "{0,-30} {1}" -f $t, $recs.Count
  $manifest += [ordered]@{ table = $t; count = $recs.Count }
}

# Import order: standard tables and reference data first.
$order = @('account','opportunity') + $slcrm
[ordered]@{ exportedFrom = $OrgUrl; exportedOn = (Get-Date).ToString('s'); importOrder = $order; sets = $setNames; tables = $manifest } |
  ConvertTo-Json -Depth 6 | Write-Json (Join-Path $OutDir 'manifest.json')
'Done.'

