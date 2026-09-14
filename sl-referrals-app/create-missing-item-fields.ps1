$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
$base = "C:\Users\arka1\AppData\Roaming\Claude\local-agent-mode-sessions\cec4bbaa-b2d7-4c52-91bd-07c422bfda07\70c7ba8c-2d98-4cb5-848e-f45d4fbefa0b\rpm\plugin_01FTLKkg8QQEpvtKrQ3KH3n9"
$env2 = "https://org6dab580e.crm17.dynamics.com"
$entity = "slcrm_referralitem"

function New-DecimalAttr($schemaName, $displayName, $description, $precision = 2, $minValue = -100000000000, $maxValue = 100000000000) {
    return @{
        "@odata.type" = "Microsoft.Dynamics.CRM.DecimalAttributeMetadata"
        SchemaName = $schemaName
        DisplayName = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $displayName; LanguageCode = 1033 }) }
        Description = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $description; LanguageCode = 1033 }) }
        RequiredLevel = @{ Value = "None" }
        Precision = $precision
        MinValue = $minValue
        MaxValue = $maxValue
    }
}

function New-MemoAttr($schemaName, $displayName, $description, $maxLength = 2000) {
    return @{
        "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"
        SchemaName = $schemaName
        DisplayName = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $displayName; LanguageCode = 1033 }) }
        Description = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $description; LanguageCode = 1033 }) }
        RequiredLevel = @{ Value = "None" }
        MaxLength = $maxLength
    }
}

function New-StringAttr($schemaName, $displayName, $description, $maxLength = 200) {
    return @{
        "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
        SchemaName = $schemaName
        DisplayName = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $displayName; LanguageCode = 1033 }) }
        Description = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $description; LanguageCode = 1033 }) }
        RequiredLevel = @{ Value = "None" }
        MaxLength = $maxLength
        FormatName = @{ Value = "Text" }
    }
}

function New-PicklistAttr($schemaName, $displayName, $description, $options) {
    $optionList = @()
    $val = 100000000
    foreach ($label in $options) {
        $optionList += @{ Value = $val; Label = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $label; LanguageCode = 1033 }) } }
        $val++
    }
    return @{
        "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
        SchemaName = $schemaName
        DisplayName = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $displayName; LanguageCode = 1033 }) }
        Description = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $description; LanguageCode = 1033 }) }
        RequiredLevel = @{ Value = "None" }
        OptionSet = @{
            "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"
            IsGlobal = $false
            OptionSetType = "Picklist"
            Options = $optionList
        }
    }
}

$attrs = @(
    New-DecimalAttr "slcrm_proposedduration" "Proposed Duration" "Proposed policy duration in months for this referral item." 2
    New-DecimalAttr "slcrm_maxduration" "Max Duration" "Maximum duration in months permitted by the selected authority." 2
    New-StringAttr "slcrm_requestedgeography" "Requested Geography" "Country or territory requested when the reason requires geography information." 200
    New-MemoAttr "slcrm_geographyexception" "Geography Exception" "Explanation of the geography exception being requested." 2000
    New-DecimalAttr "slcrm_requestedlimit" "Requested Limit" "Limit or capacity being requested for this item." 2
    New-DecimalAttr "slcrm_currentauthoritylimit" "Current Authority Limit" "Limit permitted by the underwriter's current authority, for comparison." 2
    New-DecimalAttr "slcrm_proposedpremium" "Proposed Premium" "Premium proposed for this referral item." 2
    New-DecimalAttr "slcrm_technicalpremium" "Technical Premium" "Technically rated premium for comparison against the proposed premium." 2
    New-DecimalAttr "slcrm_pricingdeviation" "Pricing Deviation %" "Percentage deviation of proposed premium from technical premium." 2 -100 1000
    New-MemoAttr "slcrm_pricingrationale" "Pricing Rationale" "Underwriter rationale for the proposed pricing." 2000
    New-PicklistAttr "slcrm_reinsurancetype" "Reinsurance Type" "Type of reinsurance arrangement relevant to this referral item." @("Facultative","Treaty","Quota Share","Excess of Loss","None")
    New-DecimalAttr "slcrm_retentionamount" "Retention Amount" "Retained amount before reinsurance applies." 2
    New-MemoAttr "slcrm_placementdetail" "Placement Detail" "Detail of the reinsurance placement." 2000
    New-StringAttr "slcrm_wordingtitle" "Wording Title" "Title of the policy wording relevant to this item." 200
    New-MemoAttr "slcrm_currentwording" "Current Wording" "Current policy wording text." 4000
    New-MemoAttr "slcrm_requestedwording" "Requested Wording" "Requested amendment to the policy wording." 4000
)

$results = @()
foreach ($attr in $attrs) {
    $bodyFile = [System.IO.Path]::GetTempFileName()
    $json = $attr | ConvertTo-Json -Depth 10 -Compress
    [System.IO.File]::WriteAllText($bodyFile, $json, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "Creating $($attr.SchemaName)..."
    $out = node "$base\scripts\dataverse-request.js" $env2 POST "EntityDefinitions(LogicalName='$entity')/Attributes" --body "@$bodyFile" --include-headers 2>&1 | Out-String
    Write-Host $out
    Remove-Item $bodyFile -Force
    $results += [PSCustomObject]@{ Field = $attr.SchemaName; Output = $out }
}

$results | ConvertTo-Json -Depth 5 | Out-File "C:\Users\arka1\Desktop\Rishi\Claude\SL Referrals POC\sl-referrals-app\create-missing-item-fields-result.json" -Encoding utf8
Write-Host "Done."
