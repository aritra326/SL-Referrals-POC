$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
$base = "C:\Users\arka1\AppData\Roaming\Claude\local-agent-mode-sessions\cec4bbaa-b2d7-4c52-91bd-07c422bfda07\70c7ba8c-2d98-4cb5-848e-f45d4fbefa0b\rpm\plugin_01FTLKkg8QQEpvtKrQ3KH3n9"
$env2 = "https://org6dab580e.crm17.dynamics.com"

function Post-Record($entitySet, $body) {
    $bodyFile = [System.IO.Path]::GetTempFileName()
    $json = $body | ConvertTo-Json -Depth 10 -Compress
    [System.IO.File]::WriteAllText($bodyFile, $json, (New-Object System.Text.UTF8Encoding $false))
    $out = node "$base\scripts\dataverse-request.js" $env2 POST $entitySet --body "@$bodyFile" --include-headers 2>$null | Out-String
    Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue
    if ($out -match "odata-entityid.*?\(([0-9a-fA-F-]{36})\)") {
        return $matches[1]
    }
    Write-Host "  FAILED: $out"
    return $null
}

# ---- Known users ----
$aritra = "a79ff9c2-4ea3-f111-b8dd-002248dac077"
$david  = "42b7f40c-5fd2-ea11-a812-002248029f77"
$alan   = "cf849519-50d5-ea11-a813-002248029f77"
$jeremy = "43b7f40c-5fd2-ea11-a812-002248029f77"

# ---- Reused standard-table records ----
$accFabrikam = "88cea450-cb0c-ea11-a813-000d3a1b1223"
$accTrey     = "a4cea450-cb0c-ea11-a813-000d3a1b1223"
$accNorthwind= "b4cea450-cb0c-ea11-a813-000d3a1b1223"
$accAlpine   = "81883308-7ad5-ea11-a813-000d3a33f3b4"
$accADatum   = "83883308-7ad5-ea11-a813-000d3a33f3b4"
$accFourth   = "dbdd0b93-4a1b-4848-b83a-39352f6b2e7a"

$contacts = @("cdcfa450-cb0c-ea11-a813-000d3a1b1223","9fd4a450-cb0c-ea11-a813-000d3a1b1223","cdd6a450-cb0c-ea11-a813-000d3a1b1223","678c7b32-3f72-ea11-a811-000d3a1b1f2c")

$opps = @("e90a0493-e8f0-ea11-a815-000d3a1b14a2","b052fc98-e8f0-ea11-a815-000d3a1b14a2","becc5dba-b1f1-ea11-a815-000d3a1b14a2","2ec06197-31ec-ea11-a817-000d3a1b14a2","14741c9e-4b9e-ea11-a811-000d3a1bb122","90a128af-1f73-ea11-a811-000d3a1bb5a2")

Write-Host "=== Countries (already created earlier - re-querying) ==="
$countryIds = @{}
$out = node "$base\scripts\dataverse-request.js" $env2 GET "slcrm_countries?`$select=slcrm_countryid,slcrm_name" 2>$null | Out-String
$json = $out | ConvertFrom-Json
foreach ($r in $json.data.value) { $countryIds[$r.slcrm_name] = $r.slcrm_countryid; Write-Host "  $($r.slcrm_name) -> $($r.slcrm_countyid)" }

Write-Host "=== Authority Levels (already created earlier - re-querying) ==="
$authLevelIds = @{}
$out = node "$base\scripts\dataverse-request.js" $env2 GET "slcrm_authoritylevels?`$select=slcrm_authoritylevelid,slcrm_name" 2>$null | Out-String
$json = $out | ConvertFrom-Json
foreach ($r in $json.data.value) { $authLevelIds[$r.slcrm_name] = $r.slcrm_authoritylevelid; Write-Host "  $($r.slcrm_name) -> $($r.slcrm_authoritylevelid)" }

Write-Host "=== Products (already created earlier - re-querying) ==="
$productIds = @{}
$out = node "$base\scripts\dataverse-request.js" $env2 GET "slcrm_products?`$select=slcrm_productid,slcrm_name" 2>$null | Out-String
$json = $out | ConvertFrom-Json
foreach ($r in $json.data.value) { $productIds[$r.slcrm_name] = $r.slcrm_productid; Write-Host "  $($r.slcrm_name) -> $($r.slcrm_productid)" }

Write-Host "=== Cover Sections (already created earlier - re-querying) ==="
$coverIds = @{}
$out = node "$base\scripts\dataverse-request.js" $env2 GET "slcrm_coversections?`$select=slcrm_coversectionid,slcrm_name" 2>$null | Out-String
$json = $out | ConvertFrom-Json
foreach ($r in $json.data.value) { $coverIds[$r.slcrm_name] = $r.slcrm_coversectionid; Write-Host "  $($r.slcrm_name) -> $($r.slcrm_coversectionid)" }

Write-Host "=== Referral Reasons ==="
$reasonIds = @{}
$reasons = @(
    @{ name="Appetite/Hazard Code"; code="APPETITE"; tmpl="Appetite / Hazard Code"; order=10 },
    @{ name="Limits/Capacity"; code="LIMITSCAP"; tmpl="Limits / Capacity"; order=20 },
    @{ name="Pricing (incl AP/TP TRI)"; code="PRICING"; tmpl="Pricing (incl AP/TP TRI)"; order=30 },
    @{ name="Policy Duration"; code="POLICYDUR"; tmpl="Policy Duration"; order=40 },
    @{ name="Additional Covers"; code="ADDCOVER"; tmpl="Additional Covers"; order=50 },
    @{ name="Specific Wording Issues"; code="WORDING"; tmpl="Specific Wording Issues"; order=60 },
    @{ name="US Exposure"; code="USEXP"; tmpl="US Exposure"; order=70 },
    @{ name="Risk Management"; code="RISKMGMT"; tmpl="Risk Management"; order=80 },
    @{ name="Reinsurance (Incl. Fac)"; code="REINSURANCE"; tmpl="Reinsurance"; order=90 },
    @{ name="Void Cover / Declaration"; code="VOIDCOVER"; tmpl="Void Cover / Declaration"; order=100 },
    @{ name="Authorised Geography"; code="AUTHGEO"; tmpl="Authorised Geography"; order=110 },
    @{ name="Country Moratorium"; code="CTRYMORAT"; tmpl="Country Moratorium"; order=120 },
    @{ name="Commission"; code="COMMISSION"; tmpl="General"; order=130 },
    @{ name="Loss Record"; code="LOSSREC"; tmpl="General"; order=140 },
    @{ name="High Risk Country (Blue Flag)"; code="HIGHRISK"; tmpl="General"; order=150 }
)
foreach ($r in $reasons) {
    $body = @{ slcrm_name = $r.name; slcrm_reasoncode = $r.code; slcrm_displayorder = $r.order; slcrm_defaultsladays = 5; slcrm_requirescoversection = $true }
    $tmplMap = @{
        "Appetite / Hazard Code"=633650001; "Limits / Capacity"=633650002; "Pricing (incl AP/TP TRI)"=633650003;
        "Policy Duration"=633650004; "Additional Covers"=633650005; "Specific Wording Issues"=633650006;
        "US Exposure"=633650007; "Risk Management"=633650008; "Reinsurance"=633650009;
        "Void Cover / Declaration"=633650010; "Authorised Geography"=633650011; "Country Moratorium"=633650012;
        "General"=633650000
    }
    $body["slcrm_detailtemplate"] = $tmplMap[$r.tmpl]
    # Note: slcrm_DefaultRequiredAuthorityLevel actually targets slcrm_underwriterauthority (not
    # slcrm_authoritylevel, despite its name) - left unset here since underwriter authorities are
    # created in phase 2, after referral reasons.
    $id = Post-Record "slcrm_referralreasons" $body
    $reasonIds[$r.name] = $id
    Write-Host "  $($r.name) -> $id"
}

Write-Host "Phase 1 complete."
$state = @{
    countryIds=$countryIds; authLevelIds=$authLevelIds; productIds=$productIds; coverIds=$coverIds; reasonIds=$reasonIds
}
$state | ConvertTo-Json -Depth 5 | Out-File "C:\Users\arka1\Desktop\Rishi\Claude\SL Referrals POC\sl-referrals-app\seed-phase1-ids.json" -Encoding utf8
