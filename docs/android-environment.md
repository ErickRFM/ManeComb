# Android local environment

Proyecto: ManeComb / Combis Control  
Carpeta app: `mobile`  
Entorno auditado: Windows + Android Studio + React Native CLI

## Estado recomendado

- La app movil ya no usa Expo para Android local; usar React Native CLI.
- Gradle debe correr con el JBR embebido de Android Studio:
  - `C:/Program Files/Android/Android Studio/jbr`
  - JBR detectado: `21.0.10`
- Evitar Oracle JDK 24 como daemon de Gradle. En este equipo el launcher del wrapper puede arrancar desde JDK 24 por PATH, pero el daemon debe usar JBR 21.
- `mobile/android/gradle.properties` fija:

```properties
org.gradle.java.home=C:/Program Files/Android/Android Studio/jbr
```

- En Android Studio, configurar Gradle JDK como Embedded JBR/JDK 21 o `#GRADLE_LOCAL_JAVA_HOME`.
- `adb` no esta en PATH en este equipo; usar el binario del SDK local:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

## Versiones detectadas

- React Native: `0.81.5`
- React: `19.1.0`
- Reanimated: `~4.1.1`
- Worklets: `0.5.1`
- Gradle wrapper: `8.14.3`
- Kotlin definido para Android: `2.1.20`
- Android SDK del proyecto:
  - buildTools: `36.0.0`
  - minSdk: `24`
  - compileSdk: `36`
  - targetSdk: `36`
  - NDK: `27.1.12297006`

## Validacion ejecutada

Desde `mobile/android`:

```powershell
.\gradlew.bat --version
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

Resultado validado:

- `clean`: exitoso.
- `assembleDebug`: exitoso.
- APK generado:

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Nota sobre `clean`:

- `mobile/android/app/build.gradle` deshabilita solo los tasks `:app:externalNativeBuildClean*`.
- Motivo: con React Native New Architecture, esos tasks pueden intentar regenerar CMake con rutas de codegen JNI ya borradas y fallar con `Android-autolinking.cmake`.
- El task `:app:clean` sigue borrando `app/.cxx` y los outputs Gradle; el siguiente build regenera los artefactos nativos.

`adb devices` validado con:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

Estado observado:

```text
emulator-5554 device
```

## Pixel 6 AVD actual

AVD detectado: `Pixel_6`

- Android: `16`
- API: `36`
- ABI: `x86_64`
- RAM: `3G`
- CPU cores: `4`
- Data partition: `6G`
- GPU: `swiftshader_indirect`
- Snapshots / Quick Boot: deshabilitados
- Cold boot: forzado
- Boot completado: `sys.boot_completed=1`

Claves importantes en `C:\Users\erik5\.android\avd\Pixel_6.avd\config.ini`:

```properties
avd.id=Pixel_6
avd.name=Pixel_6
abi.type=x86_64
target=android-36
image.sysdir.1=system-images\android-36\google_apis\x86_64\
hw.ramSize=3G
hw.cpu.ncore=4
hw.gpu.enabled=yes
hw.gpu.mode=swiftshader_indirect
fastboot.forceColdBoot=yes
fastboot.forceFastBoot=no
firstboot.bootFromDownloadableSnapshot=no
firstboot.bootFromLocalSnapshot=no
firstboot.saveToLocalSnapshot=no
showDeviceFrame=no
```

## Comandos diarios

Instalar dependencias:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm install
```

Metro:

```powershell
npm start
```

Android:

```powershell
npm run android
```

Build nativo sin instalar:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile\android
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

Build solo para x86_64 si se quiere acotar al emulador:

```powershell
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64
```

## Recuperacion de ADB

Si aparece `offline`, `timeout`, o React Native no puede instalar:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" kill-server
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" start-server
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

Validar boot:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 shell getprop sys.boot_completed
```

Debe devolver:

```text
1
```

## Si vuelve a fallar System UI

Orden seguro de recuperacion:

1. Cerrar el emulador desde Android Studio o con:

   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 emu kill
   ```

2. Si `adb emu kill` responde `KO`, cerrar el proceso headless especifico:

   ```powershell
   Get-Process | Where-Object { $_.ProcessName -like '*qemu*' -or $_.ProcessName -like '*emulator*' }
   Stop-Process -Id <PID> -Force
   ```

3. Verificar que no haya `emulator.exe` ni `qemu-system-x86_64-headless` vivo.
4. Arrancar con cold boot y sin snapshot:

   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Pixel_6 -no-snapshot -gpu swiftshader_indirect -no-boot-anim
   ```

5. Si System UI sigue bloqueado, usar Android Studio Device Manager:
   - Cold Boot Now
   - Si no basta: Wipe Data
   - Mantener Graphics en Software / SwiftShader si host GPU causa cuelgues

## Recrear emulador

Si `Pixel_6` vuelve a quedar corrupto:

1. Android Studio > Device Manager > Create device.
2. Elegir `Pixel 4` o `Pixel 6`.
3. Elegir imagen `Google APIs x86_64`.
4. Preferir API 36 actual; usar API 35 solo si API 36 queda inestable en este equipo.
5. RAM: `2048 MB` a `3072 MB`.
6. Graphics: `Software` si hay cuelgues; `Hardware` solo si es estable.
7. Deshabilitar snapshots / quick boot si reaparecen estados `offline`.

CLI equivalente, si la imagen ya esta instalada:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\cmdline-tools\latest\bin\avdmanager.bat" create avd -n ManeComb_Pixel_4_API36 -k "system-images;android-36;google_apis;x86_64" -d pixel_4
```

Despues ajustar el nuevo `config.ini` con los valores recomendados de RAM, GPU y snapshots.

## Warnings conocidos

- Gradle 8.14.3 reporta deprecated features para Gradle 9.0. No bloquea el build actual.
- Varias librerias React Native muestran warnings de `package=` en AndroidManifest o APIs deprecated. No editar `node_modules`.
- HAXM no esta instalado. En equipos AMD/Windows 11 esto es normal; usar Hyper-V / Windows Hypervisor Platform.
- La virtualizacion de firmware esta activa. La consulta de features Windows con DISM y `systeminfo` requirio privilegios de administrador y no pudo verificarse desde Codex.
- Si CMake falla por path largo, mover el repo a una ruta corta como `C:\src\combis-app`.
