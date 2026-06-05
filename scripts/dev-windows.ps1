param(
  [ValidateSet('help', 'all', 'backend', 'metro', 'android', 'adb', 'ventas', 'urls')]
  [string] $Task = 'help'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MobileDir = Join-Path $RepoRoot 'mobile'
$BackendDir = Join-Path $RepoRoot 'backend'
$AndroidSdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$AndroidPlatformTools = Join-Path $AndroidSdkRoot 'platform-tools'
$AndroidEmulatorTools = Join-Path $AndroidSdkRoot 'emulator'
$AdbPath = Join-Path $AndroidPlatformTools 'adb.exe'
$NpmPath = Join-Path $env:ProgramFiles 'nodejs\npm.cmd'

$env:ANDROID_HOME = $AndroidSdkRoot
$env:ANDROID_SDK_ROOT = $AndroidSdkRoot
if ($env:Path -notlike "*$AndroidPlatformTools*") {
  $env:Path = "$AndroidPlatformTools;$AndroidEmulatorTools;$env:Path"
}

function Get-LanIp {
  $mobileEnvPath = Join-Path $MobileDir '.env'
  if (Test-Path -LiteralPath $mobileEnvPath) {
    $configured = Get-Content -LiteralPath $mobileEnvPath |
      Where-Object { $_ -match '^\s*MANECOMB_LAN_HOST\s*=' } |
      Select-Object -First 1

    if ($configured) {
      $value = ($configured -split '=', 2)[1].Trim()
      if ($value) {
        return $value
      }
    }
  }

  try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.'
      } |
      Where-Object { $_.IPAddress -ne '127.0.0.1' } |
      Select-Object -First 1 -ExpandProperty IPAddress

    if ($ip) {
      return $ip
    }
  } catch {
    return '192.168.x.x'
  }

  return '192.168.x.x'
}

function Show-Urls {
  $lanIp = Get-LanIp
  Write-Host ''
  Write-Host 'URLs esperadas:'
  Write-Host "  Backend local PC:       http://localhost:5000"
  Write-Host "  API local PC:           http://localhost:5000/api"
  Write-Host "  Android emulator API:   http://10.0.2.2:5000/api"
  Write-Host "  Celular fisico API:     http://${lanIp}:5000/api"
  Write-Host "  Socket emulator:        http://10.0.2.2:5000"
  Write-Host "  Socket celular fisico:  http://${lanIp}:5000"
  Write-Host ''
}

function Show-Adb {
  if (-not (Test-Path -LiteralPath $AdbPath)) {
    Write-Host "ADB no encontrado en: $AdbPath"
    Write-Host 'Instala Android SDK Platform-Tools desde Android Studio.'
    return
  }

  & $AdbPath devices -l
}

function Get-AdbDeviceIds {
  if (-not (Test-Path -LiteralPath $AdbPath)) {
    return @()
  }

  $lines = & $AdbPath devices | Select-Object -Skip 1
  return @(
    $lines |
      Where-Object { $_ -match '\sdevice(\s|$)' } |
      ForEach-Object { ($_ -split '\s+')[0] }
  )
}

function Test-MetroRunning {
  try {
    $response = Invoke-WebRequest -Uri 'http://localhost:8081/status' -UseBasicParsing -TimeoutSec 3
    $content = if ($response.Content -is [byte[]]) {
      [System.Text.Encoding]::UTF8.GetString($response.Content)
    } else {
      [string] $response.Content
    }
    return ($content -match 'packager-status:running')
  } catch {
    return $false
  }
}

function Show-All {
  Show-Urls
  Write-Host 'Abre terminales separadas y ejecuta:'
  Write-Host ''
  Write-Host 'Terminal 1 - backend:'
  Write-Host '  npm run dev:backend'
  Write-Host ''
  Write-Host 'Terminal 2 - Metro React Native CLI:'
  Write-Host '  npm run dev:mobile'
  Write-Host ''
  Write-Host 'Terminal 3 - Android:'
  Write-Host '  npm run dev:android'
  Write-Host ''
  Write-Host 'Verificar ADB:'
  Write-Host '  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-windows.ps1 adb'
  Write-Host ''
}

switch ($Task) {
  'backend' {
    Push-Location $BackendDir
    try {
      & $NpmPath run dev
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
      Pop-Location
    }
  }
  'metro' {
    Push-Location $MobileDir
    try {
      & $NpmPath start
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
      Pop-Location
    }
  }
  'android' {
    $devices = Get-AdbDeviceIds
    $emulator = $devices | Where-Object { $_ -eq 'emulator-5554' } | Select-Object -First 1
    $androidArgs = @('run', 'android')

    if (Test-MetroRunning) {
      $androidArgs += '--'
      $androidArgs += '--no-packager'
    }

    if ($emulator) {
      $env:ANDROID_SERIAL = $emulator
      if (-not ($androidArgs -contains '--')) {
        $androidArgs += '--'
      }
      $androidArgs += '--device'
      $androidArgs += $emulator
    }

    Push-Location $MobileDir
    try {
      Write-Host "Ejecutando en mobile: npm $($androidArgs -join ' ')"
      & $NpmPath @androidArgs
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
      Pop-Location
    }
  }
  'adb' {
    Show-Adb
  }
  'ventas' {
    Show-Urls
    Write-Host 'La ruta ventas vive dentro de la app mobile:'
    Write-Host '  Android/app: /ventas, /ventas/login, /ventas/registro'
    Write-Host '  Backend API: /api/commercial/plans y /api/commercial/checkout'
    Write-Host ''
    Write-Host 'Arranca backend + Metro + Android con los comandos de `all`.'
  }
  'urls' {
    Show-Urls
  }
  default {
    Show-All
  }
}
