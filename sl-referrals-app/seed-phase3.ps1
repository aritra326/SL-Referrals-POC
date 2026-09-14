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

$phase1 = Get-Content "C:\Users\arka1\Desktop\Rishi\Claude\SL Referrals POC\sl-referrals-app\seed-phase1-ids.json" -Raw | ConvertFrom-Json
$phase2 = Get-Content "C:\Users\arka1\Desktop\Rishi\Claude\SL Referrals POC\sl-referrals-app\seed-phase2-ids.json" -Raw | ConvertFrom-Json

$authLevelIds = @{}; $phase1.authLevelIds.PSObject.Properties | ForEach-Object { $authLevelIds[$_.Name] = $_.Value }
$coverIds = @{}; $phase1.coverIds.PSObject.Properties | ForEach-Object { $coverIds[$_.Name] = $_.Value }
$reasonIds = @{}; $phase1.reasonIds.PSObject.Properties | ForEach-Object { $reasonIds[$_.Name] = $_.Value }
$productIds = @{}; $phase1.productIds.PSObject.Properties | ForEach-Object { $productIds[$_.Name] = $_.Value }

$aritra = "a79ff9c2-4ea3-f111-b8dd-002248dac077"
$david  = "42b7f40c-5fd2-ea11-a812-002248029f77"
$alan   = "cf849519-50d5-ea11-a813-002248029f77"
$jeremy = "43b7f40c-5fd2-ea11-a812-002248029f77"
$users = @($aritra, $david, $alan, $jeremy)

# Product -> cover section names & UA lookup helper
$productCovers = @{
    "Marine Hull" = @("Hull All Risks","Hull War Risks")
    "Marine Cargo" = @("Cargo Transit","Cargo Storage")
    "Marine Freight" = @("Freight Demurrage","Freight Demurrage")
    "Marine Liability" = @("Liability P&I","Liability P&I")
    "Marine Trades" = @("Trades Repairers","Trades Repairers")
    "Ports & Terminals" = @("Ports Terminal Operations","Ports Terminal Operations")
}
function Get-UA($product) {
    return ($phase2.uaIds | Where-Object { $_.product -eq $product } | Select-Object -First 1)
}

$itemDefs = @()
$reasonCycle = @("Pricing (incl AP/TP TRI)","Policy Duration","Reinsurance (Incl. Fac)","Limits/Capacity","Appetite/Hazard Code","Authorised Geography")
$itemStatusByParent = @{
    633650001 = @(633650001, 633650001)              # Draft parent -> Draft items
    633650002 = @(633650002, 633650003)               # Sent for Approval -> Submitted / In Review
    633650004 = @(633650006, 633650006)                # Onward for Approval -> Onward for Approval
    633650014 = @(633650008, 633650014)                # Authorised -> Authorised / Authorised with Recommendations
}

Write-Host "=== Referral Items ==="
$itemIds = @()
$seq = 0
foreach ($rr in $phase2.referralRequestIds) {
    $covers = $productCovers[$rr.product]
    $itemStatuses = $itemStatusByParent[[int]$rr.status]
    if (-not $itemStatuses) { $itemStatuses = @(633650001, 633650001) }
    for ($j = 0; $j -lt 2; $j++) {
        $seq++
        $reason = $reasonCycle[$seq % $reasonCycle.Count]
        $ua = Get-UA $rr.product
        $status = $itemStatuses[$j]
        $stateCode = if ($status -ge 633650008 -and $status -ne 633650012) { 1 } elseif ($status -eq 633650012) { 1 } else { 0 }
        $body = @{
            slcrm_logicalitemid = "ITEM-" + $seq.ToString("0000")
            slcrm_revisionnumber = 1
            slcrm_iscurrentrevision = $true
            slcrm_itemsummary = "Referral item for $($rr.product) - $reason"
            slcrm_referraldetails = "Underwriter requests review of $reason for this $($rr.product) risk."
            slcrm_sequence = $j + 1
        }
        if ($status -ne 633650001) { $body["statuscode"] = $status; $body["statecode"] = $stateCode }
        if ($reason -eq "Pricing (incl AP/TP TRI)") {
            $body["slcrm_proposedpremium"] = 125000.00
            $body["slcrm_technicalpremium"] = 118000.00
            $body["slcrm_pricingrationale"] = "Proposed premium reflects competitive market pressure; technical premium confirms adequacy."
        } elseif ($reason -eq "Policy Duration") {
            $body["slcrm_proposedduration"] = 18
            $body["slcrm_maxduration"] = 12
        } elseif ($reason -eq "Reinsurance (Incl. Fac)") {
            $body["slcrm_reinsurancetype"] = 633650000
            $body["slcrm_retentionamount"] = 500000.00
            $body["slcrm_placementdetail"] = "Facultative placement with lead reinsurer at 40% share."
        }
        $body["slcrm_Referral@odata.bind"] = "/slcrm_referralrequests($($rr.id))"
        if ($covers) { $body["slcrm_CoverSection@odata.bind"] = "/slcrm_coversections($($coverIds[$covers[$j % $covers.Count]]))" }
        $body["slcrm_ReferralReason@odata.bind"] = "/slcrm_referralreasons($($reasonIds[$reason]))"
        $body["slcrm_Product@odata.bind"] = "/slcrm_products($($productIds[$rr.product]))"
        $body["slcrm_RequiredAuthorityLevel@odata.bind"] = "/slcrm_authoritylevels($($authLevelIds['Level 4']))"
        if ($ua) { $body["slcrm_UnderwriterAuthority@odata.bind"] = "/slcrm_underwriterauthorities($($ua.id))" }
        $approver = $users | Where-Object { $_ -ne $rr.uw } | Select-Object -First 1
        $body["slcrm_AssignedApprover@odata.bind"] = "/systemusers($approver)"
        $id = Post-Record "slcrm_referralitems" $body
        $itemIds += [PSCustomObject]@{ id=$id; status=$status; approver=$approver; referral=$rr.id }
        Write-Host "  ITEM-$($seq.ToString('0000')) -> $id (status=$status)"
    }
}

Write-Host "=== Referral Decisions ==="
$decisionIds = @()
$decisionTypeMap = @{ 633650008=633650000; 633650014=633650001; 633650009=633650000 }
foreach ($item in $itemIds) {
    if ($item.status -eq 633650001 -or $item.status -eq 633650002 -or $item.status -eq 633650003 -or -not $item.id) { continue }
    $dt = $decisionTypeMap[[int]$item.status]
    if (-not $dt) { $dt = 633650000 }
    $body = @{
        slcrm_decisionon = "2026-09-12T10:00:00Z"
        slcrm_decisiontype = $dt
        slcrm_decisioncomments = "Decision recorded following underwriting review; risk profile within delegated authority."
    }
    $body["slcrm_ReferralItem@odata.bind"] = "/slcrm_referralitems($($item.id))"
    $body["slcrm_Referral@odata.bind"] = "/slcrm_referralrequests($($item.referral))"
    $body["slcrm_DecisionBy@odata.bind"] = "/systemusers($($item.approver))"
    $id = Post-Record "slcrm_referraldecisions" $body
    $decisionIds += $id
    Write-Host "  Decision -> $id"
}

Write-Host "=== Referral Participants ==="
$participantIds = @()
$i = 0
foreach ($rr in $phase2.referralRequestIds) {
    $i++
    $participant = $users | Where-Object { $_ -ne $rr.uw } | Select-Object -First 1
    $body = @{
        slcrm_participantrole = 633650002
        slcrm_notifyonsubmission = $true
        slcrm_notifyondecision = $true
    }
    $body["slcrm_Referral@odata.bind"] = "/slcrm_referralrequests($($rr.id))"
    $body["slcrm_ParticipantUser@odata.bind"] = "/systemusers($participant)"
    $id = Post-Record "slcrm_referralparticipants" $body
    $participantIds += $id
    Write-Host "  Participant $i -> $id"
}

Write-Host "=== Referral Notifications ==="
$notificationIds = @()
$i = 0
foreach ($rr in $phase2.referralRequestIds) {
    $i++
    $eventType = if ($rr.status -eq 633650001) { 633650000 } else { 633650004 }
    $body = @{
        slcrm_eventtype = $eventType
        slcrm_processingstatus = 633650002
        slcrm_senton = "2026-09-10T09:05:00Z"
        slcrm_templatekey = "referral-notification"
        slcrm_deduplicationkey = "DEDUP-" + $rr.id.Substring(0,8) + "-" + $eventType
    }
    $body["slcrm_Referral@odata.bind"] = "/slcrm_referralrequests($($rr.id))"
    $body["slcrm_RecipientUser@odata.bind"] = "/systemusers($($rr.uw))"
    $id = Post-Record "slcrm_referralnotifications" $body
    $notificationIds += $id
    Write-Host "  Notification $i -> $id"
}

Write-Host "Phase 3 complete."
