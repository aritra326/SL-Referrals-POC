$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
$base = "C:\Users\arka1\AppData\Roaming\Claude\local-agent-mode-sessions\cec4bbaa-b2d7-4c52-91bd-07c422bfda07\70c7ba8c-2d98-4cb5-848e-f45d4fbefa0b\rpm\plugin_01FTLKkg8QQEpvtKrQ3KH3n9"
$env2 = "https://org6dab580e.crm17.dynamics.com"

function Svg($path, $color) {
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' width='20' height='20'><path fill='$color' d='$path'/></svg>"
}

$blue = "#0B5FFF"; $teal = "#008272"; $purple = "#5C2D91"; $navy = "#004E8C"; $gray = "#605E5C"; $green = "#107C10"; $amber = "#CA5010"

# Distinct simple glyphs per table: document/folder/people/ship/anchor/scale motifs.
$icons = @{
    "slcrm_table_referralrequest"      = Svg "M4 2h9l3 3v13H4V2zm8 1v3h3l-3-3zM6 9h8v1.2H6V9zm0 2.6h8v1.2H6v-1.2zm0 2.6h5v1.2H6v-1.2z" $blue
    "slcrm_table_referralitem"          = Svg "M4 2h9l3 3v13H4V2zm8 1v3h3l-3-3zM6 9h8v1.2H6V9zm0 2.6h8v1.2H6v-1.2z M15.5 14a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm0 1.2l-1.4 1.4 1.4 1.4 1.4-1.4z" $navy
    "slcrm_table_referraldecision"      = Svg "M10 2l7 3v5c0 4.4-3 8.1-7 9-4-.9-7-4.6-7-9V5l7-3zm-1 9.6L6.8 9.4l-1.1 1.1L9 14l5.3-5.3-1.1-1.1L9 11.6z" $green
    "slcrm_table_referralparticipant"   = Svg "M7 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm7 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM2 16c0-2.8 2.2-5 5-5s5 2.2 5 5v1H2v-1zm11.5-3c2 .4 3.5 2.2 3.5 4.3V17h-3v-1c0-1.5-.5-2.9-1.4-4z" $purple
    "slcrm_table_referralnotification"  = Svg "M10 2a1.5 1.5 0 0 1 1.5 1.5v.7A5.5 5.5 0 0 1 15.5 9.6V13l1.5 2H3l1.5-2V9.6A5.5 5.5 0 0 1 8.5 4.2v-.7A1.5 1.5 0 0 1 10 2zM8 16h4a2 2 0 0 1-4 0z" $amber
    "slcrm_table_policy"                = Svg "M5 2h10v16l-5-2.5L5 18V2zm2 2v11.3l3-1.5 3 1.5V4H7z" $teal
    "slcrm_table_rational"              = Svg "M4 3h6l4 4v10H4V3zm6 1v3h3l-3-3zM6 10h6v1.2H6V10zm0 2.5h6v1.2H6v-1.2zM6 15h4v1.2H6V15z" $gray
    "slcrm_table_authoritylevel"        = Svg "M10 2l1.6 3.6L15 6l-2.7 2.4L13 12l-3-1.9L7 12l.7-3.6L5 6l3.4-.4z M4 13h12v1.5H4z M4 16h12v1.5H4z" $navy
    "slcrm_table_underwriterauthority"  = Svg "M10 2l7 3v5c0 4.4-3 8.1-7 9-4-.9-7-4.6-7-9V5l7-3zm0 2.2L5 6v4c0 3.3 2 6 5 6.8 3-.8 5-3.5 5-6.8V6l-5-1.8z" $navy
    "slcrm_table_referralreason"        = Svg "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 12H9v-2h2v2zm0-3.5H9c0-2.5 2-2.2 2-4a2 2 0 1 0-4 0H5a5 5 0 0 1 10 0c0 2.5-2 2.4-2 4h-2z" $blue
    "slcrm_table_country"               = Svg "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 1.6c1 0 2 2.4 2.3 5.6H7.7C8 6 9 3.6 10 3.6zM7.7 10.8h4.6c-.3 3.2-1.3 5.6-2.3 5.6s-2-2.4-2.3-5.6zM4 8.4h2.1c.1-1.6.5-3 .9-4A6.4 6.4 0 0 0 4 8.4zm9-4c.4 1 .8 2.4.9 4H16a6.4 6.4 0 0 0-3-4zM4 9.6a6.4 6.4 0 0 0 3 4c-.4-1-.8-2.4-.9-4H4zm9 4a6.4 6.4 0 0 0 3-4h-2.1c-.1 1.6-.5 3-.9 4z" $teal
    "slcrm_table_product"               = Svg "M10 2l7 4v8l-7 4-7-4V6l7-4zm0 2.3L5 7v6l5 2.7L15 13V7l-5-2.7zM9 8h2v5H9V8z" $amber
}

foreach ($name in $icons.Keys) {
    $svgContent = $icons[$name]
    $b64 = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($svgContent))
    $body = @{
        name = $name
        displayname = $name -replace "^slcrm_table_", ""
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
