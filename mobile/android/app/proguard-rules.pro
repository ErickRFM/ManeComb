# =============================================================================
# REGLAS PROGUARD / R8 PARA REACT NATIVE 0.81
# =============================================================================
# Cada regla está justificada: estas clases son accedidas vía reflexión por
# el bridge de React Native, JNI, o el framework Android. Sin estas reglas,
# R8 las eliminaría y la app crasearía en runtime.
# =============================================================================

# ---------------------------------------------------------------------------
# React Native Core — Bridge, TurboModules, Fabric, JNI
# ---------------------------------------------------------------------------
# El bridge de RN usa reflexión para NativeModules (@ReactMethod) y
# Class.forName() en TurboModuleManager. Hermes y JNI requieren
# que las clases nativas no sean ofuscadas ni eliminadas.
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.fabric.** { *; }

# React Native — métodos invocados vía reflexión por el bridge JS
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.react.common.annotations.VisibleForTesting *;
}

# ---------------------------------------------------------------------------
# react-native-reanimated — worklet runtime + JNI
# ---------------------------------------------------------------------------
# Usa reflexión para worklets y JNI para comunicación con native.
-keep class com.swmansion.reanimated.** { *; }

# ---------------------------------------------------------------------------
# react-native-worklets — worklet runtime
# ---------------------------------------------------------------------------
-keep class com.swmansion.worklets.** { *; }

# ---------------------------------------------------------------------------
# react-native-gesture-handler — gesture resolution vía reflexión
# ---------------------------------------------------------------------------
-keep class com.swmansion.gesture.** { *; }

# ---------------------------------------------------------------------------
# react-native-screens — native screen containers (FragmentManager)
# ---------------------------------------------------------------------------
-keep class com.navigation.reactnative.** { *; }

# ---------------------------------------------------------------------------
# react-native-svg — renderizado nativo de SVG
# ---------------------------------------------------------------------------
-keep class com.horcrux.svg.** { *; }

# ---------------------------------------------------------------------------
# react-native-video — reproductor multimedia nativo
# ---------------------------------------------------------------------------
-keep class com.brentvatne.react.** { *; }

# ---------------------------------------------------------------------------
# react-native-webrtc — WebRTC nativo + reflexión en PeerConnection
# ---------------------------------------------------------------------------
-keep class com.oney.WebRTCModule.** { *; }

# ---------------------------------------------------------------------------
# react-native-image-picker — imagen/selector de galería
# ---------------------------------------------------------------------------
-keep class com.imagepicker.** { *; }

# ---------------------------------------------------------------------------
# @react-native-async-storage/async-storage
# ---------------------------------------------------------------------------
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ---------------------------------------------------------------------------
# react-native-keychain — almacenamiento seguro de credenciales
# ---------------------------------------------------------------------------
-keep class com.oblador.keychain.** { *; }

# ---------------------------------------------------------------------------
# react-native-vector-icons — carga de fuentes vía reflexión
# ---------------------------------------------------------------------------
-keep class com.oblador.vectoricons.** { *; }

# ---------------------------------------------------------------------------
# react-native-geolocation-service — GPS nativo
# ---------------------------------------------------------------------------
-keep class com.agontuk.RNFusedLocation.** { *; }

# ---------------------------------------------------------------------------
# react-native-safe-area-context — insets nativos
# ---------------------------------------------------------------------------
-keep class com.th3rdwave.safeareacontext.** { *; }

# ---------------------------------------------------------------------------
# react-native-config — BuildConfig expuesto a JS
# ---------------------------------------------------------------------------
-keep class com.lugg.RNCConfig.** { *; }

# ---------------------------------------------------------------------------
# react-native-keyboard-controller — keyboard avoidance nativo
# ---------------------------------------------------------------------------
-keep class com.keyboardcontroller.** { *; }

# ---------------------------------------------------------------------------
# @react-native-community/netinfo — estado de red nativo
# ---------------------------------------------------------------------------
-keep class com.reactnativecommunity.netinfo.** { *; }

# ---------------------------------------------------------------------------
# @rnmapbox/maps — Mapbox SDK vía reflexión + JNI
# ---------------------------------------------------------------------------
# El SDK de Mapbox/MapLibre usa reflexión internamente para renderizado,
# fuentes, capas, y callbacks geoespaciales.
-keep class com.rnmapbox.rnmbx.** { *; }
-keep class org.maplibre.android.** { *; }
-keep class com.mapbox.mapboxsdk.** { *; }
-keep class com.mapbox.common.** { *; }

# ---------------------------------------------------------------------------
# R8 — Flags globales de optimización
# ---------------------------------------------------------------------------
# No ofuscar (las trazas de pila deben mostrar nombres reales de clases).
# No agregar source-file:"SourceFile" (ahorra espacio en el mapping).
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable

# ---------------------------------------------------------------------------
# Fin de reglas
# ---------------------------------------------------------------------------
