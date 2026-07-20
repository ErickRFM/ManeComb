# RC-CHAT-HEADER-ACTION-STANDARDIZATION-01

## Alcance

Estandarización exclusivamente visual del botón de nueva conversación del encabezado de Chat. No se modificaron su acción, navegación, creación de conversaciones, icono, color, posición, animaciones ni accesibilidad.

## Causa raíz

El botón se renderiza en `ChatHeader` mediante un `Pressable` con `styles.headerActionButton`. Su estilo tenía una escala y una sombra mayores que las acciones equivalentes del sistema:

- tamaño: `52 × 52 px`;
- radio: `18 px`;
- icono: `24 px`;
- sombra nativa: opacidad `0.28`, radio `14`, offset vertical `8`;
- elevación Android: `6`;
- sombra web: `0 14px 26px rgba(229, 30, 45, 0.28)`.

La combinación de 52 px y una sombra extensa generaba la jerarquía dominante observada en la captura.

## Componentes auditados

| Componente | Métricas relevantes | Resultado |
| --- | --- | --- |
| Nueva conversación (`ChatHeader`) | 52 × 52, radio 18, elevación 6 | Sobredimensionado respecto al header. |
| Menú móvil (`AppShell`) | 42 × 42, radio 14 | Estándar compacto del encabezado. |
| Acciones superiores del mapa | 42 × 42, radio 13 | Estándar compacto operacional. |
| FAB del mapa | 42 × 42, radio 15, elevación 6 | Acción flotante compacta. |

Se seleccionó `44 × 44 px`: queda próximo al estándar visual de 42 px y conserva el mínimo táctil recomendado solicitado por la RC.

## Estilos modificados

Solo se modificó `headerActionButton` en `chat-screen.styles.ts`:

```diff
- width: 52
- height: 52
- borderRadius: 18
+ width: 44
+ height: 44
+ borderRadius: 14

- shadowOpacity: 0.28
- shadowRadius: 14
- shadowOffset: { width: 0, height: 8 }
- elevation: 6
+ shadowOpacity: 0.2
+ shadowRadius: 8
+ shadowOffset: { width: 0, height: 4 }
+ elevation: 4
```

La sombra web se redujo proporcionalmente de `0 14px 26px / 0.28` a `0 8px 16px / 0.20`.

No existía padding explícito: el centrado se realiza con `alignItems` y `justifyContent`, que permanecen sin cambios. El icono conserva sus `24 px`.

## Comparativa antes/después

| Propiedad | Antes | Después |
| --- | --- | --- |
| Área táctil | 52 × 52 px | 44 × 44 px |
| Icono | `plus`, 24 px | Sin cambios |
| Color | Rojo del tema | Sin cambios |
| Radio | 18 px | 14 px |
| Elevación Android | 6 | 4 |
| Acción y accesibilidad | `openDirectoryMenu`, “Nuevo chat” | Sin cambios |

## Evidencia visual

### Antes

Captura proporcionada durante la auditoría:

![Botón antes del ajuste](C:/Users/erik5/AppData/Local/Temp/codex-clipboard-32423ee4-19a5-417a-acef-8371b3912115.png)

### Después

No se ejecutó la aplicación. La captura posterior queda pendiente de la validación del usuario. La evidencia estática confirma la reducción a 44 px y una sombra contenida sin cambios en JSX ni comportamiento.

## Validaciones realizadas

- TypeScript (`npm.cmd run typecheck`): aprobado.
- ESLint (`npm.cmd run lint`): aprobado.
- `git diff --check`: aprobado.
- Revisión de componente: `onPress`, icono y `accessibilityLabel` permanecen intactos.
- Build Android: no ejecutado; el usuario realizará la app.
- Validación visual en teléfonos y tablets: pendiente del usuario.

## Integridad del alcance

El archivo `chat-screen.styles.ts` ya contenía modificaciones preexistentes relacionadas con metadatos de mensajes. Fueron preservadas y no forman parte de esta RC. El cambio atribuible a esta certificación está limitado al bloque `headerActionButton`.

## Riesgos remanentes

- Confirmar en dispositivo el equilibrio exacto entre “Mensajes”, el botón “+” y el menú.
- Confirmar la percepción de la sombra en Android y web con renderizado real.
- Confirmar visualmente teléfonos pequeños, grandes y tablets.

## Dictamen final

**Implementación completada; certificación visual pendiente.**

El botón conserva funcionalidad, icono, color y accesibilidad, mantiene un área táctil de 44 px y adopta proporciones coherentes con las acciones principales de ManeComb. La certificación definitiva requiere el build y la prueba visual que realizará el usuario.
