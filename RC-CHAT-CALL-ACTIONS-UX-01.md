# RC-CHAT-CALL-ACTIONS-UX-01

## Auditoría

### Funcionalidad: ✅ EXISTE

Los botones de llamada y videollamada en el encabezado de conversación (`chat-screen-view.tsx:347-370`) invocan `startCall('audio')` / `startCall('video')`, funciones completamente implementadas en `use-chat-controller.ts:706-752`:

- WebRTC (`RTCPeerConnection`, `getUserMedia`)
- Señalización vía socket.io (`rtc:join`)
- Gestión de sesión de llamada (`CallSession`, `CallPhase`)
- Control de mute/cámara/colgado

NO son botones placeholder ni stub. No hay navegación a pantalla externa de llamadas — todo es inline.

### Estado visual PRE-violación

| Aspecto | Estado previo | Problema |
|---|---|---|
| Opacidad | Normal (1.0) | ✅ |
| Color de icono | `theme.colors.accent` / `theme.colors.info` | ✅ Correcto |
| Tamaño de icono | 22px | ✅ Correcto |
| Área táctil | 38-44px | ✅ Adecuado |
| `accessibilityRole` | `"button"` | ✅ |
| `accessibilityLabel` | Descriptivo | ✅ |
| `accessibilityHint` | Presente | ✅ |
| **Pressed state background** | `conversationActionButtonPressed` (opacity: 0.72) | ❌ Opacidad 0.72 hacía lucir el botón *más* deshabilitado al presionar |
| **Pressed state icon color** | Sin cambio (seguía usando accent/info) | ❌ Faltaba contraste a blanco sobre fondo sólido |
| **Pressed state visual** | Solo opacidad + scale | ❌ No usaba `conversationActionButtonAudioActive` / `conversationActionButtonVideoActive` (fondos sólidos) |

### Por qué se veían deshabilitados

La violación principal era el pressed state:

- En reposo los botones se veían bien: fondo `accentSoft`/`infoSoft` con icono accent/info.
- **Al presionar**, se aplicaba `conversationActionButtonPressed`: solo bajaba la opacidad a **0.72** y escalaba a **0.94**. Esto hacía que el botón se viera **más tenue** en vez de "activo", dando la impresión visual de un botón deshabilitado.
- El fondo no cambiaba a sólido, por lo que no había retroalimentación de "activación".
- El icono mantenía el mismo color, perdiendo la oportunidad de contrastar contra un fondo sólido.

## Corrección aplicada

Archivo modificado: `mobile/src/screens/chat/components/chat-screen-view.tsx`

### Cambio 1: Audio button — pressed state

```
- pressed ? styles.conversationActionButtonPressed : undefined,
+ pressed ? styles.conversationActionButtonAudioActive : undefined,
+ pressed ? styles.controlPressed : undefined,
```

- `conversationActionButtonAudioActive`: cambia fondo a `theme.colors.accent` (rojo sólido)
- `controlPressed`: opacidad 0.9 + scale 0.96 (consistente con DesignSystem)
- Icono cambia a `#FFFFFF` para contrastar con el fondo rojo sólido

### Cambio 2: Video button — pressed state

```
- pressed ? styles.conversationActionButtonPressed : undefined,
+ pressed ? styles.conversationActionButtonVideoActive : undefined,
+ pressed ? styles.controlPressed : undefined,
```

- `conversationActionButtonVideoActive`: cambia fondo a `theme.colors.info` (azul sólido)
- `controlPressed`: opacidad 0.9 + scale 0.96
- Icono cambia a `#FFFFFF` para contrastar con el fondo azul sólido

### Cambio 3: Icon color dinámico

Los iconos ahora usan función children de `Pressable` para cambiar color según estado:

```tsx
{({ pressed }) => (
  <MaterialCommunityIcons
    name="phone-outline"
    size={22}
    color={pressed ? '#FFFFFF' : theme.colors.accent}
  />
)}
```

### Estados visuales resultantes

| Estado | Audio (phone) | Video (video) |
|---|---|---|
| **Default** | Fondo `accentSoft` (16% rojo), icono `accent` | Fondo `infoSoft` (16% azul), icono `info` |
| **Pressed** | Fondo `accent` (rojo sólido), icono blanco, opacidad 0.9, scale 0.96 | Fondo `info` (azul sólido), icono blanco, opacidad 0.9, scale 0.96 |
| **Disabled** | No aplica (los botones nunca se disabled) | N/A |

## Validaciones

- ✅ **TypeScript**: `npx tsc --noEmit` sin errores
- ✅ **Build**: Sin errores de compilación
- ✅ **git diff --check**: Sin espacios en blanco conflictivos
- ✅ **Inspección visual**: Botones mantienen diseño consistente con Design System

## Confirmación: NO se modificó lógica de llamadas

- `startCall()` no fue modificado
- `useChatController` no fue modificado
- WebRTC no fue modificado
- Socket signaling no fue modificado
- No se agregaron nuevas funciones
- No se cambió navegación
- No se cambió backend
- El archivo `use-chat-controller.ts` quedó intacto
