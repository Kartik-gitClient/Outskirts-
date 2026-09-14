# Launch the Outskirts workbench as a desktop window, or create a Desktop shortcut.
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\desktop-app.ps1 launch
#   powershell -ExecutionPolicy Bypass -File scripts\desktop-app.ps1 shortcut
param(
  [ValidateSet('launch', 'shortcut')]
  [string]$Action = 'launch',
  [int]$Port = 5173
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Url = "http://localhost:$Port"
$Icon = Join-Path $Root 'apps\desktop\public\outskirts.ico'
$ProfileDir = Join-Path $env:LOCALAPPDATA 'Outskirts\app-profile'

$Candidates = @(
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
) | Where-Object { $_ -and (Test-Path $_) }

$Exe = $Candidates | Select-Object -First 1
if (-not $Exe) {
  throw 'No Chromium-based browser (Edge/Chrome) found. Install Edge or Chrome, or run the Vite build behind the Tauri shell.'
}

# --app= gives a chromeless native-looking window with its own profile/taskbar entry.
$AppArgs = @("--app=$Url", '--window-size=1600,1000', "--user-data-dir=$ProfileDir", '--no-first-run')

if ($Action -eq 'launch') {
  Start-Process -FilePath $Exe -ArgumentList $AppArgs
  Write-Host "launched Outskirts desktop window -> $Url"
  exit 0
}

$Desktop = [Environment]::GetFolderPath('Desktop')
$Lnk = Join-Path $Desktop 'Outskirts Workbench.lnk'
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($Lnk)
$Shortcut.TargetPath = $Exe
$Shortcut.Arguments = ($AppArgs | ForEach-Object { '"{0}"' -f $_ }) -join ' '
$Shortcut.WorkingDirectory = Split-Path $Exe
$Shortcut.Description = 'Outskirts — Sovereign AI Workbench'
if (Test-Path $Icon) { $Shortcut.IconLocation = $Icon }
$Shortcut.Save()
Write-Host "desktop shortcut created -> $Lnk"
