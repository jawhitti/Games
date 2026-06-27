# Convert SVGs -> PNGs via headless Edge/Chrome (no ImageMagick needed).
#   pwsh ./svg-to-png.ps1                                            # cards-svg -> cards-png (750x1050)
#   pwsh ./svg-to-png.ps1 -SvgDir cards-sheets -PngDir cards-sheets-png -Width 2400 -Height 3000  # the 8x10 print sheets
param(
  [string]$SvgDir = 'cards-svg',
  [string]$PngDir = 'cards-png',
  [int]$Width = 750,
  [int]$Height = 1050
)
$ErrorActionPreference = 'Stop'
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Error "No Edge/Chrome found"; exit 1 }

$root  = $PSScriptRoot
$svgDir = Join-Path $root $SvgDir
$pngDir = Join-Path $root $PngDir
$tmpDir = Join-Path $env:TEMP 'nofate-svg2png'
$prof   = Join-Path $env:TEMP 'nofate-edge'
New-Item -ItemType Directory -Force -Path $pngDir, $tmpDir | Out-Null

$svgs = Get-ChildItem $svgDir -Filter *.svg
Write-Host "Converting $($svgs.Count) files ($($Width)x$($Height)) via $([IO.Path]::GetFileName($browser))..."
foreach ($svg in $svgs) {
  $name = [IO.Path]::GetFileNameWithoutExtension($svg.Name)
  $html = "<!doctype html><html><head><style>*{margin:0;padding:0}body{width:${Width}px;height:${Height}px}</style></head><body>$(Get-Content $svg.FullName -Raw)</body></html>"
  $hp = Join-Path $tmpDir "$name.html"; Set-Content -Path $hp -Value $html -Encoding UTF8
  $png = Join-Path $pngDir "$name.png"; Remove-Item $png -ErrorAction SilentlyContinue
  & $browser --headless=new --no-sandbox --disable-gpu --user-data-dir="$prof" --hide-scrollbars --force-device-scale-factor=1 --window-size="$Width,$Height" --screenshot="$png" ("file:///" + $hp.Replace('\','/')) 2>$null
  $waited = 0; while (-not (Test-Path $png) -and $waited -lt 8000) { Start-Sleep -Milliseconds 200; $waited += 200 }
  if (Test-Path $png) { Write-Host "  $name.png" } else { Write-Warning "  $name FAILED" }
}
Write-Host "Done -> $pngDir"
