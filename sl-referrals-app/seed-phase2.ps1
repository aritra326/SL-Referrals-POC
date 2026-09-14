$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
$base = "C:\Users\arka1\AppData\Roaming\Claude\local-agent-mode-sessions\cec4bbaa-b2d7-4c52-91bd-07c422bfda07\70c7ba8c-2d98-4cb5-848e-f45d4fbefa0b\rpm\plugin_01FTLKkg8QQEpvtKrQ3KH3n9"
$env2 = "https://org6dab580e.crm17.dynamics.com"

function Post-Record($entitySet, $body) {
    $bodyFile = [System.IO.Path]::GetTempFileName()
    $json = $body | ConvertTo-Json -Depth 10 -Compress
    [System.IO.File]::WriteAllText($bodyFile, $json, (New-Object System.Text.UTF8Encoding $false))
    $out = node "$base\scripts\dataverse-request.js" $env2 POST $entitySet --body "@$bodyFile" --include-headers 2>$null | Out-String
    Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue
    if ($out -match "odata-entityid.*?\(([0-9a-fA-F-]{36})\)") { return $matches[1] }
    Write-Host "  FAILED: $out"
    return $null
}

# ---- Reload phase 1 IDs ----
$phase1 = Get-Content "C:\Users\arka1\Desktop\Rishi\Claude\SL Referrals POC\sl-referrals-app\seed-phase1-ids.json" -Raw | ConvertFrom-Json
$authLevelIds = @{}; $phase1.authLevelIds.PSObject.Properties | ForEach-Object { $authLevelIds[$_.Name] = $_.Value }
$productIds = @{}; $phase1.productIds.PSObject.Properties | ForEach-Object { $productIds[$_.Name] = $_.Value }
$countryIds = @{}; $phase1.countryIds.PSObject.Properties | ForEach-Object { $countryIds[$_.Name] = $_.Value }

# ---- Known users ----
$aritra = "a79ff9c2-4ea3-f111-b8dd-002248dac077"
$david  = "42b7f40c-5fd2-ea11-a812-002248029f77"
$alan   = "cf849519-50d5-ea11-a813-002248029f77"
$jeremy = "43b7f40c-5fd2-ea11-a812-002248029f77"

# ---- Reused standard-table records ----
$accFabrikam  = "88cea450-cb0c-ea11-a813-000d3a1b1223"
$accTrey      = "a4cea450-cb0c-ea11-a813-000d3a1b1223"
$accNorthwind = "b4cea450-cb0c-ea11-a813-000d3a1b1223"
$accAlpine    = "81883308-7ad5-ea11-a813-000d3a33f3b4"
$accADatum    = "83883308-7ad5-ea11-a813-000d3a33f3b4"
$accFourth    = "dbdd0b93-4a1b-4848-b83a-39352f6b2e7a"

$opps = @(
    "e90a0493-e8f0-ea11-a815-000d3a1b14a2","b052fc98-e8f0-ea11-a815-000d3a1b14a2",
    "becc5dba-b1f1-ea11-a815-000d3a1b14a2","2ec06197-31ec-ea11-a817-000d3a1b14a2",
    "14741c9e-4b9e-ea11-a811-000d3a1bb122","90a128af-1f73-ea11-a811-000d3a1bb5a2"
)

Write-Host "=== Underwriter Authorities ==="
$uaIds = @()
$uaDefs = @(
    @{ name="Aritra Bhattacharya - Marine Hull";      underwriter=$aritra; product="Marine Hull";       level="Level 5" },
    @{ name="Aritra Bhattacharya - Marine Liability";  underwriter=$aritra; product="Marine Liability";  level="Level 4" },
    @{ name="David Mallory - Marine Cargo";            underwriter=$david;  product="Marine Cargo";      level="Level 4" },
    @{ name="David Mallory - Marine Freight";          underwriter=$david;  product="Marine Freight";    level="Level 3" },
    @{ name="Alan Steiner - Marine Liability";         underwriter=$alan;   product="Marine Liability";  level="Level 3" },
    @{ name="Alan Steiner - Marine Cargo";              underwriter=$alan;   product="Marine Cargo";      level="Level 3" },
    @{ name="Jeremy Johnson - Marine Hull";            underwriter=$jeremy; product="Marine Hull";       level="Level 4" },
    @{ name="Jeremy Johnson - Ports & Terminals";      underwriter=$jeremy; product="Ports & Terminals"; level="Level 4" }
)
foreach ($ua in $uaDefs) {
    $body = @{
        slcrm_name = $ua.name
        slcrm_authorityassignmentnumber = "UA-" + ($uaIds.Count + 1).ToString("0000")
        slcrm_licencescheme = 633650001
        slcrm_licencelocation = "United Kingdom"
        slcrm_effectivefrom = "2026-09-01"
        slcrm_effectiveto = "2027-08-31"
        statuscode = 633650001
        statecode = 0
    }
    $body["slcrm_AuthorityLevel@odata.bind"] = "/slcrm_authoritylevels($($authLevelIds[$ua.level]))"
    $body["slcrm_ProductClassofbusiness@odata.bind"] = "/slcrm_products($($productIds[$ua.product]))"
    $body["slcrm_Underwriter@odata.bind"] = "/systemusers($($ua.underwriter))"
    $id = Post-Record "slcrm_underwriterauthorities" $body
    $uaIds += [PSCustomObject]@{ id=$id; product=$ua.product; underwriter=$ua.underwriter; name=$ua.name }
    Write-Host "  $($ua.name) -> $id"
}

Write-Host "=== Policies ==="
$policyIds = @()
$policyDefs = @(
    @{ cust=$accFabrikam;  broker=$accTrey;      opp=$opps[0]; product="Marine Hull";      type=633650000; trade=633650000 },
    @{ cust=$accNorthwind; broker=$accADatum;    opp=$opps[1]; product="Marine Cargo";     type=633650001; trade=633650001 },
    @{ cust=$accAlpine;    broker=$accFourth;    opp=$opps[2]; product="Marine Liability"; type=633650000; trade=633650002 },
    @{ cust=$accADatum;    broker=$accFabrikam;  opp=$opps[3]; product="Marine Freight";   type=633650002; trade=633650003 }
)
$i = 0
foreach ($p in $policyDefs) {
    $i++
    $body = @{
        slcrm_name = "POL-2026-" + $i.ToString("0000")
        slcrm_inceptiondate = "2026-09-01"
        slcrm_policytype = $p.type
        slcrm_tradetype = $p.trade
        slcrm_quoteid = "Q-2026-" + $i.ToString("0000")
    }
    $body["slcrm_CustomerInsured@odata.bind"] = "/accounts($($p.cust))"
    $body["slcrm_Broker@odata.bind"] = "/accounts($($p.broker))"
    $body["slcrm_Opportunity@odata.bind"] = "/opportunities($($p.opp))"
    $body["slcrm_Product@odata.bind"] = "/slcrm_products($($productIds[$p.product]))"
    $id = Post-Record "slcrm_policies" $body
    $policyIds += $id
    Write-Host "  POL-2026-$($i.ToString('0000')) -> $id"
}

Write-Host "=== Rationale ==="
$rationalIds = @()
$rationalDefs = @(
    @{ cust=$accFabrikam;  opp=$opps[0]; uw=$aritra },
    @{ cust=$accNorthwind; opp=$opps[1]; uw=$david },
    @{ cust=$accAlpine;    opp=$opps[2]; uw=$alan },
    @{ cust=$accADatum;    opp=$opps[3]; uw=$jeremy }
)
$i = 0
foreach ($r in $rationalDefs) {
    $i++
    $body = @{
        slcrm_name = "Rationale-" + $i.ToString("0000")
        slcrm_pricing = "Pricing broadly in line with technical rate; minor deviation justified by claims-free history."
        slcrm_ppmcategory = "Standard"
        slcrm_claimsexperience = "No material losses in the last 3 policy years."
        slcrm_underwriteropinion = "Risk is acceptable within current appetite; recommend proceeding."
    }
    $body["slcrm_CustomerInsured@odata.bind"] = "/accounts($($r.cust))"
    $body["slcrm_Opportunity@odata.bind"] = "/opportunities($($r.opp))"
    $body["slcrm_Underwriter@odata.bind"] = "/systemusers($($r.uw))"
    $id = Post-Record "slcrm_rationals" $body
    $rationalIds += $id
    Write-Host "  Rationale-$($i.ToString('0000')) -> $id"
}

Write-Host "=== Referral Requests ==="
$referralRequestIds = @()
$rrDefs = @(
    @{ cust=$accFabrikam;  broker=$accTrey;   opp=$opps[0]; product="Marine Hull";      uw=$aritra; status=633650001; priority=633650001; country="United Kingdom"; submitted=$false },
    @{ cust=$accNorthwind; broker=$accADatum; opp=$opps[1]; product="Marine Cargo";     uw=$david;  status=633650001; priority=633650002; country="France";         submitted=$false },
    @{ cust=$accAlpine;    broker=$accFourth; opp=$opps[2]; product="Marine Liability"; uw=$alan;   status=633650002; priority=633650000; country="Spain";          submitted=$true },
    @{ cust=$accADatum;    broker=$accFabrikam; opp=$opps[3]; product="Marine Freight"; uw=$jeremy; status=633650002; priority=633650001; country="United Kingdom"; submitted=$true },
    @{ cust=$accTrey;      broker=$accNorthwind; opp=$opps[4]; product="Marine Trades"; uw=$aritra; status=633650004; priority=633650000; country="United Kingdom"; submitted=$true },
    @{ cust=$accFourth;    broker=$accAlpine; opp=$opps[5]; product="Ports & Terminals"; uw=$david;  status=633650014; priority=633650001; country="Spain";          submitted=$true }
)
$i = 0
foreach ($rr in $rrDefs) {
    $i++
    $stateCode = if ($rr.status -ge 633650014 -or $rr.status -eq 633650017 -or $rr.status -eq 633650018 -or $rr.status -eq 633650019) { 1 } else { 0 }
    $body = @{
        slcrm_commonbusinessriskdescription = "Referral for underwriting review of a marine risk requiring additional authority."
        slcrm_inceptioneffectivedate = "2026-10-01"
        slcrm_priority = $rr.priority
        slcrm_policytype = 633650000
        slcrm_sourcesystem = 633650000
        slcrm_haseverbeensubmitted = $rr.submitted
        statuscode = $rr.status
        statecode = $stateCode
    }
    if ($rr.submitted) {
        $body["slcrm_submittedon"] = "2026-09-10T09:00:00Z"
        $body["slcrm_lastsubmittedon"] = "2026-09-10T09:00:00Z"
        $body["slcrm_SubmittedBy@odata.bind"] = "/systemusers($($rr.uw))"
    }
    $body["slcrm_Opportunity@odata.bind"] = "/opportunities($($rr.opp))"
    $body["slcrm_Product@odata.bind"] = "/slcrm_products($($productIds[$rr.product]))"
    $body["slcrm_CustomerInsured@odata.bind"] = "/accounts($($rr.cust))"
    $body["slcrm_Broker@odata.bind"] = "/accounts($($rr.broker))"
    $body["slcrm_PrimaryUnderwriter@odata.bind"] = "/systemusers($($rr.uw))"
    $body["slcrm_CountryofReferral@odata.bind"] = "/slcrm_countries($($countryIds[$rr.country]))"
    $id = Post-Record "slcrm_referralrequests" $body
    $referralRequestIds += [PSCustomObject]@{ id=$id; product=$rr.product; uw=$rr.uw; status=$rr.status }
    Write-Host "  Referral Request $i -> $id (status=$($rr.status))"
}

$state = @{ uaIds=$uaIds; policyIds=$policyIds; rationalIds=$rationalIds; referralRequestIds=$referralRequestIds }
$state | ConvertTo-Json -Depth 6 | Out-File "C:\Users\arka1\Desktop\Rishi\Claude\SL Referrals POC\sl-referrals-app\seed-phase2-ids.json" -Encoding utf8
Write-Host "Phase 2 complete."
