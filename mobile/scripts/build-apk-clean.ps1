# Script definitivo para compilacion de APK en Windows
# Resuelve bloqueos de OneDrive, paths largos y variables de entorno

$scriptDir = $PSScriptRoot
$mobileDir = Join-Path $scriptDir ".."
$androidDir = Join-Path $mobileDir "android"

# --- VERIFICACION DE SEGURIDAD ---
# Las compilaciones de C++ (Ninja/CMake) fallan si la ruta total supera 260 caracteres.
if ($mobileDir.Length -gt 80) {
    Write-Host "`n[!] ERROR CRITICO: La ruta del proyecto es demasiado larga ($($mobileDir.Length) caracteres)." -ForegroundColor Red
    Write-Host "    Debido a limites de Windows y CMake, el build FALLARA en esta carpeta."
    Write-Host "    SOLUCION: Mueve la carpeta 'combis-app' a 'C:\combis-app' e intenta de nuevo.`n"
    exit 1
}

# --- CONFIGURACION DE ENTORNO ---
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'C:\Users\erik5\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'C:\Users\erik5\AppData\Local\Android\Sdk'
$env:NODE_BINARY = 'C:\Program Files\nodejs\node.exe'
$env:NODE_ENV = 'production'

# Mover el cache de Gradle fuera de OneDrive para evitar bloqueos de sincronizacion
$env:GRADLE_USER_HOME = 'C:\gradle-cache-combis'
if (!(Test-Path $env:GRADLE_USER_HOME)) {
    New-Item -ItemType Directory -Path $env:GRADLE_USER_HOME -Force
}

Set-Location $mobileDir

Write-Host "`n[1/3] Parcheando configuracion de Android..."
node -e "require('./scripts/patch-android-node-path').patchAndroidNodePath('$($androidDir.Replace('\','\\'))')"

Set-Location $androidDir

Write-Host "[2/3] Limpiando compilaciones previas..."
.\gradlew.bat clean --no-daemon

Write-Host "[3/3] Iniciando compilacion assembleRelease..."
Write-Host "     (Sigue el progreso en: $mobileDir\build.log)"

# Ejecucion con redireccion de logs para diagnostico completo
.\gradlew.bat assembleRelease --no-daemon *>$mobileDir\build.log

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[√] EXITO: APK generado." -ForegroundColor Green
    $apkPath = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
    if (Test-Path $apkPath) {
        $distDir = Join-Path $mobileDir "dist"
        if (!(Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir }
        Copy-Item $apkPath (Join-Path $distDir "combis-control-release.apk") -Force
        Write-Host "     Ubicacion: $distDir\combis-control-release.apk"
    }
} else {
    Write-Host "`n[!] ERROR: La compilacion ha fallado." -ForegroundColor Red
    Write-Host "    Revisa el archivo $mobileDir\build.log para ver el error exacto."

    # Intentar buscar errores comunes en el log
    if (Select-String -Path "$mobileDir\build.log" -Pattern "longer than 260 characters") {
        Write-Host "    -> Se detecto un error de ruta larga. Mueve el proyecto a C:\combis-app" -ForegroundColor Yellow
    }
}
