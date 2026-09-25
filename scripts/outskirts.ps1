# Outskirts stack control: detached start, stop, status.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\outskirts.ps1 up|down|status
param(
  [ValidateSet('up', 'down', 'status')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $env:TEMP 'opencode\outskirts-logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$VenvPy = Join-Path $Root '.venv\Scripts\python.exe'

$Services = @(
  @{ Name = 'engineering'; Port = 8001; Cwd = Join-Path $Root 'services\engineering'; Exe = $VenvPy; Args = '-m uvicorn main:app --host 127.0.0.1 --port 8001' },
  @{ Name = 'perception';  Port = 8002; Cwd = Join-Path $Root 'services\perception';  Exe = $VenvPy; Args = '-m uvicorn main:app --host 127.0.0.1 --port 8002' },
  @{ Name = 'gateway';     Port = 3000; Cwd = $Root; Exe = 'cmd.exe'; Args = '/c pnpm --filter @outskirts/server start' },
  @{ Name = 'desktop';     Port = 5173; Cwd = $Root; Exe = 'cmd.exe'; Args = '/c pnpm --filter @outskirts/desktop dev' }
)

function Get-PortOwner([int]$Port) {
  $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { return $conn.OwningProcess }
  return $null
}

function Start-Detached([hashtable]$Svc) {
  if (Get-PortOwner $Svc.Port) {
    Write-Host ("{0,-12} already listening on {1}" -f $Svc.Name, $Svc.Port)
    return
  }
  $log = Join-Path $LogDir ("{0}.log" -f $Svc.Name)
  # Start-Process gives the child its OWN hidden console: a Ctrl+C in this
  # terminal or closing this window can never signal the stack. (Children
  # spawned via Win32_Process.Create share the caller's console and die
  # with it.)
  $cmdLine = '/c ""{0}" {1} > "{2}" 2>&1"' -f $Svc.Exe, $Svc.Args, $log
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdLine -WorkingDirectory $Svc.Cwd -WindowStyle Hidden -PassThru
  Write-Host ("{0,-12} starting (pid {1}) -> {2}" -f $Svc.Name, $p.Id, $log)
}

function Stop-Stack([hashtable]$Svc) {
  $pidToKill = Get-PortOwner $Svc.Port
  if ($pidToKill) {
    # kill the process tree so pnpm/node children go too
    & taskkill.exe /PID $pidToKill /T /F 2>$null | Out-Null
    Write-Host ("{0,-12} stopped (pid {1})" -f $Svc.Name, $pidToKill)
  } else {
    Write-Host ("{0,-12} not running" -f $Svc.Name)
  }
}

function Show-Status([hashtable]$Svc) {
  $owner = Get-PortOwner $Svc.Port
  if (-not $owner) {
    Write-Host ("{0,-12} :{1}  DOWN" -f $Svc.Name, $Svc.Port)
    return
  }
  $health = ''
  try {
    $h = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/health" -f $Svc.Port) -TimeoutSec 3
    if ($h.status) { $health = $h.status }
  } catch { $health = 'no /health' }
  Write-Host ("{0,-12} :{1}  UP (pid {2}) {3}" -f $Svc.Name, $Svc.Port, $owner, $health)
}

switch ($Action) {
  'up'     {
    foreach ($s in $Services) { Start-Detached $s }
    # Services take 5-15s to bind (pnpm + tsx + vite); poll instead of a fixed 2s sleep.
    $deadline = (Get-Date).AddSeconds(40)
    do {
      Start-Sleep -Seconds 2
      $pending = @($Services | Where-Object { -not (Get-PortOwner $_.Port) })
    } while ($pending.Count -gt 0 -and (Get-Date) -lt $deadline)
    Write-Host ''
    foreach ($s in $Services) { Show-Status $s }
  }
  'down'   { foreach ($s in $Services) { Stop-Stack $s } }
  'status' { foreach ($s in $Services) { Show-Status $s } }
}
