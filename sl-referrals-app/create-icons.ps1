$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
$base = "C:\Users\arka1\AppData\Roaming\Claude\local-agent-mode-sessions\cec4bbaa-b2d7-4c52-91bd-07c422bfda07\70c7ba8c-2d98-4cb5-848e-f45d4fbefa0b\rpm\plugin_01FTLKkg8QQEpvtKrQ3KH3n9"
$env2 = "https://org6dab580e.crm17.dynamics.com"

function Svg($path, $color) {
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' width='20' height='20'><path fill='$color' d='$path'/></svg>"
}

$blue = "#0B5FFF"; $green = "#107C10"; $red = "#D13438"; $amber = "#CA5010"; $gray = "#605E5C"

$icons = @{
    # Referral Request buttons
    "slcrm_icon_completepartial" = Svg "M10 1a9 9 0 1 0 9 9h-9V1z M11 1.06A9 9 0 0 1 18.94 9H11V1.06z" $amber
    "slcrm_icon_completerejected" = Svg "M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm3.36-11.36L10 10l3.36 3.36-1.27 1.28L10 11.27l-3.36 3.37-1.27-1.28L8.73 10 5.37 6.64l1.27-1.28L10 8.73l3.36-3.37 1.27 1.28z" $red
    "slcrm_icon_cancel" = Svg "M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm3.36-11.36L10 10l3.36 3.36-1.27 1.28L10 11.27l-3.36 3.37-1.27-1.28L8.73 10 5.37 6.64l1.27-1.28L10 8.73l3.36-3.37 1.27 1.28z" $red
    # Referral Item buttons
    "slcrm_icon_startreview" = Svg "M10 4c-4.4 0-7.9 3.1-9 6.5C2.1 13.9 5.6 17 10 17s7.9-3.1 9-6.5C17.9 7.1 14.4 4 10 4zm0 10.5a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" $blue
    "slcrm_icon_requestinformation" = Svg "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 12H9v-2h2v2zm0-3.5H9V6h2v4.5z" $blue
    "slcrm_icon_resubmit" = Svg "M10 4V1L6 5l4 4V6a4 4 0 1 1-4 4H4a6 6 0 1 0 6-6z" $blue
    "slcrm_icon_onward" = Svg "M11 4l6 6-6 6-1.4-1.4L13.2 11H3V9h10.2L9.6 5.4z" $blue
    "slcrm_icon_authorise" = Svg "M16.7 5.3l-8.2 8.2-3.2-3.2-1.4 1.4 4.6 4.6 9.6-9.6z" $green
    "slcrm_icon_authorisewithrecommendations" = Svg "M16.7 5.3l-8.2 8.2-3.2-3.2-1.4 1.4 4.6 4.6 9.6-9.6z M17 1l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L14 3.3 16 3z" $green
    "slcrm_icon_authorisewithconditions" = Svg "M16.7 5.3l-8.2 8.2-3.2-3.2-1.4 1.4 4.6 4.6 9.6-9.6z M17 2h1v6h-1z M14 4l4-2 4 2v3l-4 2-4-2z" $green
    "slcrm_icon_reject" = Svg "M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm3.36-11.36L10 10l3.36 3.36-1.27 1.28L10 11.27l-3.36 3.37-1.27-1.28L8.73 10 5.37 6.64l1.27-1.28L10 8.73l3.36-3.37 1.27 1.28z" $red
    "slcrm_icon_createrevision" = Svg "M15.7 3.3a1 1 0 0 0-1.4 0l-1.1 1.1 2.4 2.4 1.1-1.1a1 1 0 0 0 0-1.4l-1-1zM3 14.6V17h2.4l7.1-7.1-2.4-2.4L3 14.6z" $blue
    "slcrm_icon_cancelitem" = Svg "M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm3.36-11.36L10 10l3.36 3.36-1.27 1.28L10 11.27l-3.36 3.37-1.27-1.28L8.73 10 5.37 6.64l1.27-1.28L10 8.73l3.36-3.37 1.27 1.28z" $red
}

foreach ($name in $icons.Keys) {
    $svgContent = $icons[$name]
    $b64 = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($svgContent))
    $body = @{
        name = $name
        displayname = $name -replace "^slcrm_icon_", ""
        webresourcetype = 11
        content = $b64
    }
    $bodyFile = [System.IO.Path]::GetTempFileName()
    $json = $body | ConvertTo-Json -Depth 5 -Compress
    [System.IO.File]::WriteAllText($bodyFile, $json, (New-Object System.Text.UTF8Encoding $false))
    $out = node "$base\scripts\dataverse-request.js" $env2 POST "webresourceset" --body "@$bodyFile" --include-headers 2>$null | Out-String
    Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue
    if ($out -match "odata-entityid.*?\(([0-9a-fA-F-]{36})\)") {
        Write-Host "  $name -> $($matches[1])"
    } else {
        Write-Host "  $name -> FAILED: $out"
    }
}
