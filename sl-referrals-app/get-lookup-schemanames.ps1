$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
$base = "C:\Users\arka1\AppData\Roaming\Claude\local-agent-mode-sessions\cec4bbaa-b2d7-4c52-91bd-07c422bfda07\70c7ba8c-2d98-4cb5-848e-f45d4fbefa0b\rpm\plugin_01FTLKkg8QQEpvtKrQ3KH3n9"
$env2 = "https://org6dab580e.crm17.dynamics.com"

$pairs = @(
    @("slcrm_coversection","slcrm_product"),
    @("slcrm_referralreason","slcrm_defaultrequiredauthoritylevel"),
    @("slcrm_referralreason","slcrm_countryofreferral"),
    @("slcrm_referralreason","slcrm_transactioncurrency"),
    @("slcrm_underwriterauthority","slcrm_authoritylevel"),
    @("slcrm_underwriterauthority","slcrm_productclassofbusiness"),
    @("slcrm_underwriterauthority","slcrm_underwriter"),
    @("slcrm_policy","slcrm_customerinsured"),
    @("slcrm_policy","slcrm_broker"),
    @("slcrm_policy","slcrm_opportunity"),
    @("slcrm_policy","slcrm_product"),
    @("slcrm_rational","slcrm_opportunity"),
    @("slcrm_rational","slcrm_customerinsured"),
    @("slcrm_rational","slcrm_underwriter"),
    @("slcrm_referralrequest","slcrm_opportunity"),
    @("slcrm_referralrequest","slcrm_product"),
    @("slcrm_referralrequest","slcrm_customerinsured"),
    @("slcrm_referralrequest","slcrm_broker"),
    @("slcrm_referralrequest","slcrm_primaryunderwriter"),
    @("slcrm_referralrequest","slcrm_countryofreferral"),
    @("slcrm_referralrequest","slcrm_submittedby"),
    @("slcrm_referralrequest","slcrm_completedby"),
    @("slcrm_referralrequest","slcrm_plemlcurrency"),
    @("slcrm_referralitem","slcrm_referral"),
    @("slcrm_referralitem","slcrm_coversection"),
    @("slcrm_referralitem","slcrm_referralreason"),
    @("slcrm_referralitem","slcrm_product"),
    @("slcrm_referralitem","slcrm_requiredauthoritylevel"),
    @("slcrm_referralitem","slcrm_underwriterauthority"),
    @("slcrm_referralitem","slcrm_assignedapprover"),
    @("slcrm_referralitem","slcrm_decisionby"),
    @("slcrm_referralitem","slcrm_submittedby"),
    @("slcrm_referralitem","slcrm_previousreferralitem"),
    @("slcrm_referralitem","slcrm_rootreferralitem"),
    @("slcrm_referraldecision","slcrm_referralitem"),
    @("slcrm_referraldecision","slcrm_referral"),
    @("slcrm_referraldecision","slcrm_decisionby"),
    @("slcrm_referraldecision","slcrm_onwardauthorityassignment"),
    @("slcrm_referraldecision","slcrm_authorityassignmentused"),
    @("slcrm_referralparticipant","slcrm_referral"),
    @("slcrm_referralparticipant","slcrm_participantuser"),
    @("slcrm_referralnotification","slcrm_referral"),
    @("slcrm_referralnotification","slcrm_referralitem"),
    @("slcrm_referralnotification","slcrm_referraldecision"),
    @("slcrm_referralnotification","slcrm_recipientuser")
)

$results = @{}
foreach ($p in $pairs) {
    $entity = $p[0]; $attr = $p[1]
    $out = node "$base\scripts\dataverse-request.js" $env2 GET "EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='$attr')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?`$select=SchemaName" 2>$null | Out-String
    try {
        $json = $out | ConvertFrom-Json
        $schemaName = $json.data.SchemaName
        $results["$entity.$attr"] = $schemaName
        Write-Host "$entity.$attr -> $schemaName"
    } catch {
        Write-Host "$entity.$attr -> ERROR: $out"
    }
}
$results | ConvertTo-Json | Out-File "C:\Users\arka1\Desktop\Rishi\Claude\SL Referrals POC\sl-referrals-app\lookup-schemanames.json" -Encoding utf8
