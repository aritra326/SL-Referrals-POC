$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:PATH
$base = "C:\Users\arka1\AppData\Roaming\Claude\local-agent-mode-sessions\cec4bbaa-b2d7-4c52-91bd-07c422bfda07\70c7ba8c-2d98-4cb5-848e-f45d4fbefa0b\rpm\plugin_01FTLKkg8QQEpvtKrQ3KH3n9"
$env2 = "https://org6dab580e.crm17.dynamics.com"

$productIds = @(
  "7f8cf172-f1af-f111-aaac-002248db53bb",
  "828cf172-f1af-f111-aaac-002248db53bb",
  "848cf172-f1af-f111-aaac-002248db53bb",
  "868cf172-f1af-f111-aaac-002248db53bb",
  "888cf172-f1af-f111-aaac-002248db53bb",
  "492dab79-f1af-f111-aaac-002248db53bb"
)

foreach ($id in $productIds) {
  $body = '{"statecode":0,"statuscode":1}'
  $bodyFile = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($bodyFile, $body, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "Activating $id..."
  node "$base\scripts\dataverse-request.js" $env2 PATCH "products($id)" --body "@$bodyFile" 2>&1
  Remove-Item $bodyFile -Force
}
