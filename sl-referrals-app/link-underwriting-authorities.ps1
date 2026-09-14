$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
$base = "C:\Users\arka1\AppData\Roaming\Claude\local-agent-mode-sessions\cec4bbaa-b2d7-4c52-91bd-07c422bfda07\70c7ba8c-2d98-4cb5-848e-f45d4fbefa0b\rpm\plugin_01FTLKkg8QQEpvtKrQ3KH3n9"
$env2 = "https://org6dab580e.crm17.dynamics.com"

$products = @{
  "Marine Hull"      = "7f8cf172-f1af-f111-aaac-002248db53bb"
  "Marine Cargo"     = "828cf172-f1af-f111-aaac-002248db53bb"
  "Marine Freight"   = "848cf172-f1af-f111-aaac-002248db53bb"
  "Marine Liability" = "868cf172-f1af-f111-aaac-002248db53bb"
  "Marine Trades"    = "888cf172-f1af-f111-aaac-002248db53bb"
  "Ports & Terminals"= "492dab79-f1af-f111-aaac-002248db53bb"
}

# systemuser ids resolved via GET below (fullname -> id)
$users = @{}
foreach ($name in @("Aritra Bhattacharya","David Mallory","Alan Steiner","Jeremy Johnson")) {
  $filter = [uri]::EscapeDataString("fullname eq '$name'")
  $result = node "$base\scripts\dataverse-request.js" $env2 GET "systemusers?`$select=systemuserid,fullname&`$filter=$filter" 2>&1 | Out-String
  if ($result -match '"systemuserid"\s*:\s*"([0-9a-fA-F-]+)"') {
    $users[$name] = $matches[1]
    Write-Host "Resolved $name -> $($matches[1])"
  } else {
    Write-Host "FAILED to resolve $name"
    Write-Host $result
  }
}

$rows = @(
  @{ name = "Aritra Bhattacharya - Marine Hull";       user = "Aritra Bhattacharya"; product = "Marine Hull" }
  @{ name = "Aritra Bhattacharya - Marine Liability";  user = "Aritra Bhattacharya"; product = "Marine Liability" }
  @{ name = "David Mallory - Marine Cargo";            user = "David Mallory";       product = "Marine Cargo" }
  @{ name = "David Mallory - Marine Freight";          user = "David Mallory";       product = "Marine Freight" }
  @{ name = "Alan Steiner - Marine Liability";         user = "Alan Steiner";        product = "Marine Liability" }
  @{ name = "Alan Steiner - Marine Cargo";             user = "Alan Steiner";        product = "Marine Cargo" }
  @{ name = "Jeremy Johnson - Marine Hull";            user = "Jeremy Johnson";      product = "Marine Hull" }
  @{ name = "Jeremy Johnson - Ports & Terminals";      user = "Jeremy Johnson";      product = "Ports & Terminals" }
)

foreach ($row in $rows) {
  $filter = [uri]::EscapeDataString("sl_name eq '$($row.name)'")
  $result = node "$base\scripts\dataverse-request.js" $env2 GET "sl_underwritingauthorities?`$select=sl_underwritingauthorityid,sl_name&`$filter=$filter" 2>&1 | Out-String
  if ($result -match '"sl_underwritingauthorityid"\s*:\s*"([0-9a-fA-F-]+)"') {
    $recId = $matches[1]
    $userId = $users[$row.user]
    $productId = $products[$row.product]
    if (-not $userId -or -not $productId) {
      Write-Host "SKIP $($row.name): missing userId or productId"
      continue
    }
    $body = @{
      "sl_underwriterid@odata.bind" = "/systemusers($userId)"
      "sl_productid@odata.bind" = "/products($productId)"
    } | ConvertTo-Json -Compress
    $bodyFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($bodyFile, $body, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "Patching $($row.name) ($recId)..."
    node "$base\scripts\dataverse-request.js" $env2 PATCH "sl_underwritingauthorities($recId)" --body "@$bodyFile" 2>&1
    Remove-Item $bodyFile -Force
  } else {
    Write-Host "FAILED to resolve record $($row.name)"
    Write-Host $result
  }
}
