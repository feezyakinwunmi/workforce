# Repairs a half-installed Electron on Windows ("Electron failed to install correctly").
# Electron's own unzip step can stop silently on very new Node versions; this uses
# Windows' built-in unzip instead. Run from the repo root:  npm run fix:electron
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$electronDir = Join-Path $root "node_modules\electron"
if (-not (Test-Path $electronDir)) { throw "node_modules\electron not found. Run 'npm install' first." }

$version = (Get-Content (Join-Path $electronDir "package.json") -Raw | ConvertFrom-Json).version
$name = "electron-v$version-win32-x64.zip"
Write-Host "Electron $version"

$zip = Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter $name -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $zip) {
  $mirror = if ($env:ELECTRON_MIRROR) { $env:ELECTRON_MIRROR.TrimEnd('/') + "/v$version" } else { "https://github.com/electron/electron/releases/download/v$version" }
  $target = Join-Path $env:TEMP $name
  Write-Host "Downloading $name ..."
  Invoke-WebRequest "$mirror/$name" -OutFile $target
  $zip = Get-Item $target
}

$dist = Join-Path $electronDir "dist"
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
Write-Host "Unzipping ..."
Expand-Archive $zip.FullName -DestinationPath $dist
Set-Content -Path (Join-Path $electronDir "path.txt") -Value "electron.exe" -NoNewline
Write-Host "Electron is ready. Run: npm run agent"
