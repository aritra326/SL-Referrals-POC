<#
.SYNOPSIS
  Adds or replaces web resources inside an EXPORTED solution zip and bumps the solution version.

.DESCRIPTION
  Why edit the zip instead of `pac solution unpack` / `pack`? pac 2.10 does not unpack Custom APIs, so a pack would
  silently drop them from the package. Editing the exported zip directly leaves every other component untouched.

  Each resource is a hashtable:  @{ Name = "slcrm_x.html"; Display = "..."; Description = "..."; Type = 1; File = "path" }
  Type: 1 = HTML, 3 = script (JScript). An existing resource with the same Name is replaced; otherwise it is added
  and registered as a solution component.

.EXAMPLE
  .\scripts\New-DeploymentZip.ps1 -SourceZip solution-export\SL_Referrals_1_0_0_8.zip `
      -OutputZip out\SL_Referrals_1_0_0_9_deploy.zip -Version 1.0.0.9 -Resources $resources
#>
param(
    [Parameter(Mandatory)] [string]$SourceZip,
    [Parameter(Mandatory)] [string]$OutputZip,
    [Parameter(Mandatory)] [string]$Version,
    [Parameter(Mandatory)] [hashtable[]]$Resources
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-Entry($zip, $name) {
    $entry = $zip.GetEntry($name)
    $reader = New-Object System.IO.StreamReader($entry.Open(), (New-Object System.Text.UTF8Encoding($true)))
    try { return $reader.ReadToEnd() } finally { $reader.Close() }
}

function Write-Entry($zip, $name, [byte[]]$bytes) {
    $existing = $zip.GetEntry($name)
    if ($existing) { $existing.Delete() }
    $entry = $zip.CreateEntry($name)
    $stream = $entry.Open()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Close() }
}

function Write-TextEntry($zip, $name, [string]$text) {
    Write-Entry $zip $name ((New-Object System.Text.UTF8Encoding($true)).GetBytes($text))
}

$outDir = Split-Path $OutputZip -Parent
if ($outDir) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
Copy-Item $SourceZip $OutputZip -Force

$zip = [System.IO.Compression.ZipFile]::Open((Resolve-Path $OutputZip), [System.IO.Compression.ZipArchiveMode]::Update)
try {
    $customizations = Read-Entry $zip "customizations.xml"
    $solution = Read-Entry $zip "solution.xml"
    $contentTypes = Read-Entry $zip "[Content_Types].xml"

    foreach ($resource in $Resources) {
        $name = $resource.Name
        $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $resource.File))
        $nameTag = "<Name>$name</Name>"
        $at = $customizations.IndexOf($nameTag)

        if ($at -ge 0) {
            # Existing resource: overwrite the stored file named in its <FileName>.
            $end = $customizations.IndexOf("</WebResource>", $at)
            $block = $customizations.Substring($at, $end - $at)
            $fileName = [regex]::Match($block, "<FileName>/(WebResources/[^<]+)</FileName>").Groups[1].Value
            Write-Entry $zip $fileName $bytes
            Write-Host "Replaced  $name"
            continue
        }

        $id = [guid]::NewGuid()
        $stored = "WebResources/" + $name.Replace(".", "") + $id.ToString().ToUpper()
        Write-Entry $zip $stored $bytes

        $xml = @"
    <WebResource>
      <WebResourceId>{$($id.ToString().ToLower())}</WebResourceId>
      <Name>$name</Name>
      <DisplayName>$($resource.Display)</DisplayName>
      <Description>$($resource.Description)</Description>
      <WebResourceType>$($resource.Type)</WebResourceType>
      <IntroducedVersion>1.0</IntroducedVersion>
      <IsEnabledForMobileClient>0</IsEnabledForMobileClient>
      <IsAvailableForMobileOffline>0</IsAvailableForMobileOffline>
      <IsCustomizable>1</IsCustomizable>
      <CanBeDeleted>1</CanBeDeleted>
      <IsHidden>0</IsHidden>
      <FileName>/$stored</FileName>
    </WebResource>
"@
        $customizations = $customizations.Replace("</WebResources>", $xml + "  </WebResources>")
        $solution = $solution.Replace("</RootComponents>", "      <RootComponent type=`"61`" schemaName=`"$name`" behavior=`"0`" />`n    </RootComponents>")
        $contentTypes = $contentTypes.Replace("</Types>", "<Override PartName=`"/$stored`" ContentType=`"application/octet-stream`" /></Types>")
        Write-Host "Added     $name"
    }

    $solution = [regex]::Replace($solution, "<Version>[^<]+</Version>", "<Version>$Version</Version>", 1)

    Write-TextEntry $zip "customizations.xml" $customizations
    Write-TextEntry $zip "solution.xml" $solution
    Write-TextEntry $zip "[Content_Types].xml" $contentTypes
}
finally {
    $zip.Dispose()
}

Write-Host "Wrote $OutputZip (version $Version)"
