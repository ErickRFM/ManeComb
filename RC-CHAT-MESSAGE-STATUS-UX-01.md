# RC-CHAT-MESSAGE-STATUS-UX-01 — Auditoría y Mejora de Indicadores de Estado de Mensajes

Fecha: 2026-07-18  
Dictamen: **Certificación condicionada**

## Resultado ejecutivo

El chat ya contaba con cinco estados de entrega y lectura: `sending`, `sent`, `delivered`, `read` y `failed`. No se creó ningún estado ni se modificó su transición. La representación visible se concentraba en `MessageDeliveryMeta`, pero mostraba icono y texto redundante (`✓ Enviado`, `✓✓ Entregado`, `✓✓ Leído`) y duplicaba la hora de los mensajes propios entre el encabezado y el pie.

La UI ahora presenta una sola línea compacta `hora + indicador`, sin texto visible de estado. Las etiquetas se conservan mediante `accessibilityLabel` y `accessibilityHint`. Texto, audio, imagen y video continúan usando el mismo indicador compartido.

## Inventario completo

| Capa | Archivo / símbolo | Responsabilidad |
|---|---|---|
| Contrato | `mobile/src/types/app.ts` / `ChatMessage.status` | Estados persistidos `sent`, `delivered`, `read`, `failed` |
| Estado local | `mobile/src/screens/chat/types.ts` / `LocalTextMessage.localStatus` | Estados transitorios `sending` y `failed` |
| Normalización UI | `mobile/src/screens/chat/utils/conversation.ts` / `getMessageDeliveryStatus` | Selecciona `status`, `deliveryStatus`, `sendStatus` o `localStatus`; fallback existente `sent` |
| Envío optimista | `mobile/src/screens/chat/hooks/use-chat-controller.ts` | Crea mensaje local `sending`, lo elimina al confirmar o lo marca `failed` |
| Store | `mobile/src/store/root-store.ts` | Inserta mensajes confirmados y actualiza estados recibidos |
| Entrega | listener `chat:delivered` del store | Transición existente `sent -> delivered` |
| Lectura | listener `chat:read` del store | Transición existente a `read` |
| Lista/burbuja | `chat-screen-view.tsx` | Resuelve propiedad, tipo de contenido y render del metadato |
| Indicador único | `message-media.tsx` / `MessageDeliveryMeta` | Traduce estado existente a icono, color y accesibilidad |
| Estilos | `chat-screen.styles.ts` / `deliveryMeta` | Mantiene hora e indicador alineados en una fila |

## Flujo auditado

```text
Usuario
  -> useChatController (sending / failed local)
  -> store.sendMessage
  -> REST backend (sent)
  -> Socket.IO chat:delivered / chat:read
  -> root-store (delivered / read)
  -> useChatDirectoryData
  -> ChatScreenView
  -> getMessageDeliveryStatus
  -> MessageDeliveryMeta
  -> hora + indicador visual
```

La auditoría confirmó que audio, imagen, video y texto se renderizan dentro de la misma burbuja y que `MessageDeliveryMeta` se coloca después del contenido, por lo que no existe una variante independiente por tipo multimedia.

## Estados encontrados y representación

| Estado existente | Antes | Después | Color | Accesibilidad |
|---|---|---|---|---|
| `sending` | reloj + “Enviando” | spinner discreto | neutro | “Enviando” |
| `sent` | ✓ + “Enviado” | ✓ | neutro | “Enviado” |
| `delivered` | ✓✓ + “Entregado” | ✓✓ | neutro | “Entregado” |
| `read` | ✓✓ + “Leído” | ✓✓ | `theme.colors.info` | “Visto” |
| `failed` | alerta + “No enviado” | alerta | `theme.colors.danger` | “No enviado” |

No se alteró la semántica de `read`; “Visto” es únicamente la etiqueta de presentación solicitada.

## Comparativa antes/después

```text
ANTES                         DESPUÉS
21:44 (encabezado)            contenido del mensaje
contenido del mensaje         21:44   ✓
21:44  ✓  Enviado

21:44  ✓✓  Entregado          21:44   ✓✓
21:44  ✓✓  Leído              21:44   ✓✓  (color del tema)
```

El texto de estado ya no ocupa espacio visual. El contenedor conserva `flexDirection: row`, alineación centrada y una altura mínima de 14 px, por lo que el indicador no incrementa materialmente la burbuja ni fuerza saltos de línea.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `mobile/src/screens/chat/components/message-media.tsx` | Eliminación del texto visible, spinner para envío, etiquetas accesibles y color temático para visto |
| `mobile/src/screens/chat/components/chat-screen-view.tsx` | La hora de mensajes propios se muestra solo junto al indicador; se elimina la duplicación del encabezado |
| `mobile/src/screens/chat/chat-screen.styles.ts` | Separación de 4 px, altura estable y retiro del estilo de hora duplicado obsoleto |
| `RC-CHAT-MESSAGE-STATUS-UX-01.md` | Auditoría, evidencia y dictamen |

## Evidencia visual

### Evidencia posterior reportada por el usuario

La captura recibida después de la primera implementación todavía muestra `✓ Enviado`:

![Bundle anterior con texto visible](C:/Users/erik5/AppData/Local/Temp/codex-clipboard-cc31a5d0-a2b0-4abf-9b3a-37cd827e27a2.png)

La comparación con el código fuente confirmó que esa interfaz procede de un bundle/APK anterior. El JSX activo ya no contiene el nodo visible `<Text>{config.label}</Text>`; la etiqueta permanece exclusivamente en `accessibilityLabel`. Por tanto, la captura no invalida el cambio fuente, pero sí demuestra que todavía no fue desplegado en la aplicación probada.

La tabla de estados y la comparativa monoespaciada anterior documentan el resultado visual implementado. No se adjunta captura de dispositivo: `adb devices -l` no encontró teléfonos ni emuladores conectados durante esta RC. No se fabricó una captura ni se sustituyó evidencia real con un mock.

La ausencia de captura en Android/iPhone es la razón del dictamen condicionado; debe capturarse una conversación real con mensajes `sent`, `delivered`, `read` y `failed` antes de promoción final.

## Pruebas realizadas

| Validación | Resultado |
|---|---|
| TypeScript (`npm run typecheck`) | Pasa |
| ESLint (`npm run lint`) | Pasa |
| Suite móvil (`npm test`) | 23 suites, 115 pruebas, todas pasan |
| Android debug (`gradlew assembleDebug`) | `BUILD SUCCESSFUL` |
| `git diff --check` sobre archivos de esta RC | Pasa |
| Dispositivo Android conectado | No disponible |
| Backend / Socket.IO / persistencia | Sin modificaciones por esta RC |

Se añadió una prueba de regresión estática en `src/navigation/input-infrastructure.test.ts`. La prueba exige que las etiquetas permanezcan accesibles, que no exista un nodo visual con `config.label` y que continúen presentes los iconos de uno y dos checks. Resultado: 5/5 pruebas del archivo aprobadas.

## Accesibilidad y responsive

- El contenedor del estado es accesible y expone una etiqueta explícita.
- `accessibilityHint="Estado del mensaje"` conserva contexto para lector de pantalla.
- El icono no depende de texto visible para usuarios visuales.
- El spinner de envío conserva tamaño discreto de 12 px; los demás iconos usan 14 px.
- La fila usa ancho intrínseco, alineación horizontal y no introduce listeners ni cálculos por dimensión.
- Los colores proceden del tema existente; modo oscuro no recibe colores hardcodeados nuevos salvo el neutro blanco translúcido ya utilizado por mensajes propios.

## Riesgos remanentes

1. Falta captura y recorrido manual con TalkBack/VoiceOver en dispositivo real.
2. Debe verificarse visualmente el escalado con fuente del sistema al máximo.
3. La aplicación instalada debe regenerar su bundle JavaScript; una compilación que reutilice el bundle anterior seguirá mostrando el texto redundante aunque la fuente ya esté corregida.

## Dictamen final

**Certificación condicionada.** Se reutilizan exclusivamente los estados actuales, el indicador es único para todos los contenidos, la hora y el estado quedan en una línea y backend/Socket.IO/persistencia permanecen intactos. La certificación definitiva queda condicionada a evidencia visual y accesible en un dispositivo real, necesaria para afirmar que no existe ninguna regresión con fuentes grandes o lectores de pantalla.
