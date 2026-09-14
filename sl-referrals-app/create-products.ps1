$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
$base = "C:\Users\arka1\AppData\Roaming\Claude\local-agent-mode-sessions\cec4bbaa-b2d7-4c52-91bd-07c422bfda07\70c7ba8c-2d98-4cb5-848e-f45d4fbefa0b\rpm\plugin_01FTLKkg8QQEpvtKrQ3KH3n9"
$env2 = "https://org6dab580e.crm17.dynamics.com"
$uomScheduleId = "cf834dec-e059-4892-b22d-6892028e7eac"
$uomId = "230e4021-8214-4aad-b3c7-e05c6843a504"

$products = @(
  @{ name = "Marine Hull"; number = "MAR-HULL" },
  @{ name = "Marine Cargo"; number = "MAR-CARGO" },
  @{ name = "Marine Freight"; number = "MAR-FREIGHT" },
  @{ name = "Marine Liability"; number = "MAR-LIAB" },
  @{ name = "Marine Trades"; number = "MAR-TRADES" },
  @{ name = "Ports & Terminals"; number = "MAR-PORTS" }
)

foreach ($p in $products) {
  $body = @{
    name = $p.name
    productnumber = $p.number
    "defaultuomscheduleid@odata.bind" = "/uomschedules($uomScheduleId)"
    "defaultuomid@odata.bind" = "/uoms($uomId)"
    quantitydecimal = 2
  } | ConvertTo-Json -Compress
  $bodyFile = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($bodyFile, $body, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "Creating $($p.name)..."
  node "$base\scripts\dataverse-request.js" $env2 POST "products" --body "@$bodyFile" --include-headers 2>&1
  Remove-Item $bodyFile -Force
}
