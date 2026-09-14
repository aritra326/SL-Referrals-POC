$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
$base = "C:\Users\arka1\AppData\Roaming\Claude\local-agent-mode-sessions\cec4bbaa-b2d7-4c52-91bd-07c422bfda07\70c7ba8c-2d98-4cb5-848e-f45d4fbefa0b\rpm\plugin_01FTLKkg8QQEpvtKrQ3KH3n9"
$env2 = "https://org6dab580e.crm17.dynamics.com"

$tables = @(
    @{ set="slcrm_countries"; id="slcrm_countryid"; label="Country" }
    @{ set="slcrm_authoritylevels"; id="slcrm_authoritylevelid"; label="Authority Level" }
    @{ set="slcrm_products"; id="slcrm_productid"; label="Product" }
    @{ set="slcrm_coversections"; id="slcrm_coversectionid"; label="Cover Section" }
    @{ set="slcrm_referralreasons"; id="slcrm_referralreasonid"; label="Referral Reason" }
    @{ set="slcrm_underwriterauthorities"; id="slcrm_underwriterauthorityid"; label="Underwriter Authority" }
    @{ set="slcrm_policies"; id="slcrm_policyid"; label="Policy" }
    @{ set="slcrm_rationals"; id="slcrm_rationalid"; label="Rationale" }
    @{ set="slcrm_referralrequests"; id="slcrm_referralrequestid"; label="Referral Request" }
    @{ set="slcrm_referralitems"; id="slcrm_referralitemid"; label="Referral Item" }
    @{ set="slcrm_referraldecisions"; id="slcrm_referraldecisionid"; label="Referral Decision" }
    @{ set="slcrm_referralparticipants"; id="slcrm_referralparticipantid"; label="Referral Participant" }
    @{ set="slcrm_referralnotifications"; id="slcrm_referralnotificationid"; label="Referral Notification" }
)

foreach ($t in $tables) {
    $out = node "$base\scripts\dataverse-request.js" $env2 GET "$($t.set)?`$select=$($t.id)" 2>$null | Out-String
    try {
        $json = $out | ConvertFrom-Json
        $count = $json.data.value.Count
        Write-Host "$($t.label): $count"
    } catch {
        Write-Host "$($t.label): ERROR - $out"
    }
}
