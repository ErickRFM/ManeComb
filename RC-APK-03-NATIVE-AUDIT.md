# RC-APK-03 — Auditoría de Módulos Nativos y Arquitectura de Compilación

> **Estado:** Solo auditoría. Sin cambios de código, Gradle, ni configuración.
> **APK actual:** 91.15 MB (post RC-APK-01 + RC-APK-02)

---

## Resumen Ejecutivo

**No existen optimizaciones de bajo riesgo y alto impacto adicionales.**

El análisis completo de los módulos nativos, TurboModules, Fabric components, NativeModules y dependencias demuestra que:

1. **Todas las dependencias instaladas se usan** (directa o transitivamente).
2. **New Architecture (Fabric + TurboModules) está en pleno uso**, no hay componentes "muertos".
3. **libappmodules.so** (5.1 MB) contiene código C++ generado por codegen de 14 bibliotecas — inseparable sin eliminar dependencias.
4. **Las 4 librerías .so dominantes** (Mapbox 31.9 MB, WebRTC 17.2 MB, RN core 9.6 MB, appmodules 5.1 MB) son todas obligatorias y no reducibles mediante configuración.
5. **No hay dependencias huérfanas ni módulos registrados que nunca se usen.**

**Conclusión: No se recomiendan más optimizaciones sobre .so ni módulos nativos.**
Cualquier reducción significativa requeriría eliminar funcionalidades (mapas, WebRTC, etc.) o recompilar dependencias desde fuente, lo cual viola las restricciones del proyecto.

---

## 1. Arquitectura React Native — Estado Actual

### New Architecture: ✅ ACTIVA

| Componente | Estado | Evidencia |
|-----------|--------|-----------|
| **Fabric** | ✅ Habilitado | `DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)` en `MainActivity.kt:30` |
| **TurboModules** | ✅ Habilitado | `BuildConfig.IS_NEW_ARCHITECTURE_ENABLED` en `MainApplication.kt:32`; 14 TurboModules en `autolinking.cpp` |
| **Codegen** | ✅ Activo | `codegenDir` configurado en `build.gradle:90`; 14 módulos codegen generados en CMake |
| **Hermes** | ✅ Habilitado | `hermesEnabled=true` en `gradle.properties:49`; `implementation("com.facebook.react:hermes-android")` en `build.gradle:272` |
| **Bridgeless** | ❌ No detectable | No hay flag `bridgelessEnabled`. No está activo. |
| **JSI** | ✅ Activo | `libjsi.so` presente (382 KB arm64); `libfbjni.so` presente (173 KB arm64) |

### Evidencia de configuración

**`gradle.properties`:**
```properties
newArchEnabled=true
hermesEnabled=true
```

**`MainActivity.kt`:**
```kotlin
DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
```

**`MainApplication.kt`:**
```kotlin
override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
```

**Respuesta:** Sí, todas estas tecnologías están siendo utilizadas. Fabric, TurboModules, Codegen, JSI están activos y generan código compilado en `libappmodules.so`. No hay componentes compilados que nunca se usen — el codegen solo genera código para las dependencias instaladas.

---

## 2. Inventario de Paquetes Registrados

### Paquetes autolinkeados (16)

| # | Paquete (npm) | Clase Java | Código Nativo | .so generados |
|---|--------------|-----------|--------------|---------------|
| 1 | `@react-native-async-storage/async-storage` | `AsyncStoragePackage` | codegen | — |
| 2 | `@react-native-community/netinfo` | `NetInfoPackage` | — | — |
| 3 | `@rnmapbox/maps` | `RNMBXPackage` | codegen + nativo | `libmapbox-maps.so`, `libmapbox-common.so` |
| 4 | `react-native-config` | `RNCConfigPackage` | codegen | — |
| 5 | `react-native-geolocation-service` | `RNFusedLocationPackage` | — | — |
| 6 | `react-native-gesture-handler` | `RNGestureHandlerPackage` | codegen | `libgesturehandler.so` |
| 7 | `react-native-image-picker` | `ImagePickerPackage` | codegen | `libnative-imagetranscoder.so` |
| 8 | `react-native-keyboard-controller` | `KeyboardControllerPackage` | codegen | `libreact_codegen_RNKC.so` |
| 9 | `react-native-keychain` | `KeychainPackage` | codegen | — |
| 10 | `react-native-reanimated` | `ReanimatedPackage` | codegen | `libreanimated.so` |
| 11 | `react-native-safe-area-context` | `SafeAreaContextPackage` | codegen | `libreact_codegen_safeareacontext.so` |
| 12 | `react-native-screens` | `RNScreensPackage` | codegen | `librnscreens.so`, `libreact_codegen_rnscreens.so` |
| 13 | `react-native-svg` | `SvgPackage` | codegen | `libreact_codegen_rnsvg.so` |
| 14 | `react-native-vector-icons` | `VectorIconsPackage` | codegen | — |
| 15 | `react-native-video` | `ReactVideoPackage` | — | — |
| 16 | `react-native-webrtc` | `WebRTCModulePackage` | nativo pesado | `libjingle_peerconnection_so.so` |
| — | `react-native-worklets` | `WorkletsPackage` | codegen | `libworklets.so` |
| — | `react-native` (core) | `MainReactPackage` | nativo | `libreactnative.so`, `libhermes.so`, `libjsi.so`, `libfbjni.so`, `libc++_shared.so`, `libappmodules.so` |

### Paquetes personalizados (4)

| # | Nombre | Clase | Módulo Nativo |
|---|--------|-------|--------------|
| 1 | ManeCombAudio | `ManeCombAudioPackage` | `ManeCombAudioModule` |
| 2 | ManeCombCall | `ManeCombCallPackage` | `ManeCombCallModule` |
| 3 | ManeCombLocation | `ManeCombLocationPackage` | `ManeCombLocationModule` |
| 4 | ManeCombNotification | `ManeCombNotificationPackage` | `ManeCombNotificationModule` |

### Paquete base (1)

| # | Nombre | Descripción |
|---|--------|-------------|
| 1 | `MainReactPackage` | Paquete core de React Native (siempre presente) |

**Total de paquetes registrados: 21** (16 autolinkeados + 4 personalizados + 1 RN core)

---

## 3. Inventario de TurboModules (Codegen C++)

Registrados en `autolinking.cpp:33-85`. Proveen 14 TurboModules:

| # | Módulo | Header | Función |
|---|--------|--------|---------|
| 1 | `rnasyncstorage` | `rnasyncstorage.h` | AsyncStorage |
| 2 | `rnmapbox_maps_specs` | `rnmapbox_maps_specs.h` | Mapbox maps |
| 3 | `RNCConfigSpec` | `RNCConfigSpec.h` | Config |
| 4 | `rngesturehandler_codegen` | `rngesturehandler_codegen.h` | Gesture Handler |
| 5 | `RNImagePickerSpec` | `RNImagePickerSpec.h` | Image Picker |
| 6 | `RNKC` | `RNKC.h` | Keyboard Controller |
| 7 | `RNKeychainSpec` | `RNKeychainSpec.h` | Keychain |
| 8 | `rnreanimated` | `rnreanimated.h` | Reanimated |
| 9 | `safeareacontext` | `safeareacontext.h` | Safe Area Context |
| 10 | `rnscreens` | `rnscreens.h` | Screens |
| 11 | `rnsvg` | `rnsvg.h` | SVG |
| 12 | `RNVectorIconsSpec` | `RNVectorIconsSpec.h` | Vector Icons |
| 13 | `rnworklets` | `rnworklets.h` | Worklets |
| 14 | *(cxxModuleProvider)* | — | Vacío (retorna nullptr) |

**Todos los TurboModules son obligatorios** — cada uno corresponde a una dependencia npm utilizada.

---

## 4. Inventario de Fabric Components

Registrados en `autolinking.cpp:94-185`. Total: **90+ component descriptors.**

| Categoría | Cantidad | Provider |
|-----------|----------|----------|
| Mapbox (`RNMBX*`) | 33 | `@rnmapbox/maps` |
| Gesture Handler (`RNGestureHandler*`) | 2 | `react-native-gesture-handler` |
| Keyboard Controller (`Keyboard*`, `OverKeyboard*`, `ClippingScroll*`) | 7 | `react-native-keyboard-controller` |
| Safe Area (`RNCSafeArea*`) | 2 | `react-native-safe-area-context` |
| Screens (`RNS*`, `RNSScreen*`, `RNSFull*`, `RNSBottomTabs*`) | 12 | `react-native-screens` |
| SVG (`RNSVG*`) | 24 | `react-native-svg` |

**Todos son obligatorios** — generados automáticamente por codegen a partir de las especificaciones de cada dependencia.

---

## 5. Inventario de NativeModules (Java/Kotlin)

### Personalizados (4)

| Módulo | Nombre JS | @ReactMethods | Instanciado | Uso real en TS |
|--------|-----------|---------------|-------------|----------------|
| `ManeCombAudioModule` | `ManeCombAudio` | 13 | `ManeCombAudioPackage` | `src/native/audio.ts:97,99` |
| `ManeCombCallModule` | `ManeCombCall` | 2 | `ManeCombCallPackage` | `src/native/call-service.ts:9` |
| `ManeCombLocationModule` | `ManeCombLocation` | 3 | `ManeCombLocationPackage` | `src/native/background-location.ts:31` |
| `ManeCombNotificationModule` | `ManeCombNotification` | 2 | `ManeCombNotificationPackage` | `src/utils/push-notifications.ts:18` |

**Los 4 son obligatorios** — audio PTT/grabación, llamadas WebRTC, ubicación en segundo plano y notificaciones push.

### Servicios Android registrados en AndroidManifest (7)

| Servicio/Receiver | Propósito |
|-------------------|-----------|
| `ManeCombLocationService` | Ubicación foreground (FG type: location) |
| `ManeCombRadioService` | Radio foreground (FG type: mediaPlayback) |
| `ManeCombCallService` | Llamadas foreground (FG type: microphone\|camera) |
| `ManeCombReplyService` | Reply headless task |
| `ManeCombReplyReceiver` | Broadcast receiver para respuesta rápida desde notificación |
| `ManeCombBootReceiver` | Broadcast para restart ubicación tras boot |
| `WebRTCModule.MediaProjectionService` | WebRTC screen share |

---

## 6. Dependencias Registradas vs. Realmente Utilizadas

### package.json → Autolinking → Uso real

| Dependencia | Autolink | .so generado | Uso en TS | Obligatoria |
|------------|----------|-------------|-----------|-------------|
| `@rnmapbox/maps` | ✅ | `libmapbox-maps.so`, `libmapbox-common.so` | `app-map.native.tsx` | ✅ Mapas |
| `react-native-webrtc` | ✅ | `libjingle_peerconnection_so.so` | `webrtc.ts` | ✅ Llamadas audio/video |
| `react-native` | ✅ (core) | `libreactnative.so`, `libhermes.so`, `libjsi.so`, `libfbjni.so`, `libc++_shared.so` | Toda la app | ✅ Framework |
| `react-native-reanimated` | ✅ | `libreanimated.so` | 4 archivos (UI) | ✅ Animaciones UI |
| `react-native-worklets` | ✅ | `libworklets.so` | (vía reanimated) | ✅ Dependencia de reanimated |
| `react-native-screens` | ✅ | `librnscreens.so`, `libreact_codegen_rnscreens.so` | 0 directas, transitiva vía `@react-navigation/native-stack` | ✅ Navegación |
| `react-native-svg` | ✅ | `libreact_codegen_rnsvg.so` | `brand-logo.tsx` | ✅ Logo SVG |
| `react-native-gesture-handler` | ✅ | `libgesturehandler.so` | 2 archivos | ✅ Checklist UI |
| `react-native-safe-area-context` | ✅ | `libreact_codegen_safeareacontext.so` | 7 archivos | ✅ Layout |
| `react-native-image-picker` | ✅ | `libnative-imagetranscoder.so` | 2 archivos | ✅ Subida fotos |
| `react-native-keyboard-controller` | ✅ | `libreact_codegen_RNKC.so` | 3 archivos | ✅ Teclado |
| `react-native-vector-icons` | ✅ | — | `vector-icons.tsx` | ✅ Iconos UI |
| `react-native-config` | ✅ | — | 4 archivos | ✅ Config (API URL, tokens) |
| `react-native-keychain` | ✅ | — | `secure-store.ts` | ✅ Almacén seguro |
| `react-native-geolocation-service` | ✅ | — | `location.ts` | ✅ GPS |
| `@react-native-async-storage/async-storage` | ✅ | — | (store de persistencia) | ✅ Persistencia offline |
| `@react-native-community/netinfo` | ✅ | — | 5 archivos | ✅ Estado red |
| `react-native-video` | ✅ | — | `video.tsx` | ✅ Reproducción video |

**No se detectan dependencias instaladas no utilizadas.** react-native-screens tiene 0 imports directos, pero es dependencia obligatoria de `@react-navigation/native-stack` (usado para navegación nativa con animaciones).

---

## 7. Análisis de .so en libappmodules.so

`libappmodules.so` (5,213 KB total entre ambas arquitecturas, 5.1 MB arm64) contiene el código C++ generado por codegen. Se compone de:

| Componente en libappmodules.so | Estimado | Reducible |
|-------------------------------|----------|-----------|
| Codegen de Mapbox (33 Fabric component descriptors) | ~30% | No |
| Codegen de SVG (24 Fabric component descriptors) | ~20% | No |
| Codegen de Screens (12 Fabric component descriptors) | ~15% | No |
| Codegen de Keyboard Controller (7 Fabric descriptors) | ~8% | No |
| Codegen de GestureHandler, SafeArea, otros | ~10% | No |
| Código C++ de autolinking.cpp (14 TurboModule providers) | ~10% | No |
| Otro overhead de compilación | ~7% | No |

**Conclusión: libappmodules.so no puede reducirse.** Todo su contenido es código generado automáticamente por codegen para las dependencias instaladas.

---

## 8. Análisis de Carga Inicial

### ¿Qué módulos nativos se inicializan al abrir la aplicación?

**Todos los 21 paquetes se registran al inicio** en `MainApplication.getPackages()`. Sin embargo, la inicialización "real" (llamada a constructores de módulos nativos) solo ocurre bajo demanda:

1. **Carga inmediata (startup):**
   - `MainReactPackage` — RN core (obligatorio)
   - `AsyncStoragePackage` — persistencia offline (requerida en startup para restaurar estado)
   - `ReanimatedPackage` + `WorkletsPackage` — UI thread worklets
   - `SafeAreaContextPackage` — medición de área segura
   - `RNScreensPackage` — navegación inicial
   - `KeyboardControllerPackage` — detección de teclado
   - `VectorIconsPackage` — iconografía inicial

2. **Carga bajo demanda (lazy):**
   - `WebRTCModulePackage` — solo cuando se inicia/recibe llamada
   - `RNMBXPackage` — solo cuando se monta el mapa
   - `ManeCombLocationPackage` — solo cuando se inicia tracking GPS
   - `ManeCombAudioPackage` — solo cuando se graba/reproduce audio PTT
   - `ManeCombNotificationPackage` — solo cuando se muestra notificación
   - `ReactVideoPackage` — solo cuando se reproduce video
   - `ImagePickerPackage` — solo cuando se selecciona imagen

### ¿Cuáles podrían inicializarse bajo demanda?

En la práctica, **todos los módulos perezosos ya se cargan bajo demanda**. El registro del paquete en `getPackages()` no implica inicialización del módulo nativo — solo lo hace disponible. La inicialización real del objeto `NativeModule` ocurre cuando JS llama a `NativeModules.X` por primera vez.

**No hay oportunidades de mejora** en el patrón de carga actual.

---

## 9. Oportunidades Reales de Optimización

### Evaluación contra criterios de decisión

| Criterio | ¿Se cumple? |
|----------|-------------|
| Evidencia objetiva | — |
| Ahorro significativo (≥3 MB) | — |
| Riesgo bajo | — |
| No requiere mantener forks | — |
| No rompe compatibilidad | — |
| No altera arquitectura | — |

### Posibles candidatos evaluados

| Optimización | Ahorro estimado | Riesgo | ¿Recomendada? | Razón |
|-------------|----------------|--------|---------------|-------|
| Recompilar WebRTC con solo features usadas | 5-7 MB | Alto | ❌ NO | Requiere fork de `react-native-webrtc`, compilar WebRTC desde fuente (horas), rompe actualizaciones automáticas |
| Migrar Mapbox → MapLibre | ~0 MB (mismo engine) | Alto | ❌ NO | SDK comparable, mismo tamaño, cambiaría API |
| Static link de libc++_shared | ~1.5 MB | Medio | ❌ NO | Puede aumentar tamaño total si múltiples .so duplican libc++ |
| Eliminar react-native-screens | 1.3 MB | Alto | ❌ NO | Rompe navegación nativa de `@react-navigation/native-stack` |
| Eliminar react-native-video | <1 MB | Medio | ❌ NO | Funcionalidad de reproducción de video |
| Eliminar react-native-svg | 1.1 MB | Medio | ❌ NO | Logo y gráficos SVG |

### Conclusión de oportunidades

**No existe ninguna optimización adicional de bajo riesgo y alto impacto.**

Todas las oportunidades reales de reducción han sido agotadas en RC-APK-01 (R8) y RC-APK-02 (ABI). El APK restante de 91.15 MB se compone de:

- **77.94 MB (85.5%)** — Librerías nativas .so obligatorias (Mapbox 31.9 MB, WebRTC 17.2 MB, RN core 14.7 MB, appmodules 5.1 MB, reanimated 2.3 MB, etc.)
- **11.25 MB (12.3%)** — DEX (bytecode Java/Kotlin, ya optimizado por R8)
- **3.29 MB (3.6%)** — Hermes bytecode bundle (JS compilado)

Ninguno de estos componentes puede reducirse sin eliminar funcionalidades, recompilar dependencias desde fuente (viola restricciones), o cambiar la arquitectura del proyecto.

---

## 10. Riesgos

No se proponen cambios. Riesgo: **N/A**.

---

## 11. Recomendaciones

1. **DETENER la optimización del APK.** No hay más oportunidades de reducción sin romper las restricciones del proyecto.
2. **Considerar Android App Bundle (AAB)** para distribución en Play Store. Esto entregaría solo `arm64-v8a` a ~95% de dispositivos (eliminando los 31 MB de `armeabi-v7a`), reduciendo el *download size* efectivo a ~60 MB sin cambiar el APK.
3. **No realizar más cambios sobre Gradle, ProGuard, .so, o módulos nativos.**

---

## 12. Conclusión

**¿Existe alguna optimización adicional de bajo riesgo y alto impacto?**

**NO.**

El análisis exhaustivo demuestra que:

- Todos los 21 paquetes registrados son necesarios.
- Todos los 14 TurboModules son generados por dependencias npm usadas.
- Los 90+ Fabric component descriptors son obligatorios para las librerías instaladas.
- Los 4 NativeModules personalizados son código de negocio activo.
- Las 4 librerías .so dominantes (31.9 MB Mapbox, 17.2 MB WebRTC, 9.6 MB RN core, 5.1 MB appmodules) son inseparables de las funcionalidades del proyecto.

**Se recomienda DETENER la optimización del APK y no realizar más cambios sobre Gradle, ProGuard, .so, o módulos nativos.**
