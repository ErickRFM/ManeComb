# RC-CHAT-CALL-ACTIONS-UX-01

## Alcance

Correccion exclusivamente visual y de interaccion de los botones de llamada y videollamada del encabezado del chat. No se modificaron backend, navegacion, sockets, WebRTC ni la logica de llamadas.

## Auditoria del estado actual

Los dos controles son funcionales y no ocultan una funcion futura:

- El boton de telefono ejecuta el handler existente `startCall('audio')`.
- El boton de video ejecuta el handler existente `startCall('video')`.
- El controlador existente valida conversacion activa, conexion y disponibilidad de WebRTC; si no puede iniciar, presenta el aviso existente `La cabina de llamadas no esta disponible.`

Por lo tanto, no correspondia presentarlos como controles deshabilitados ni agregar un flujo alternativo.

## Por que se veian deshabilitados

Los iconos estaban dibujados en blanco sobre los fondos semanticos claros `accentSoft` e `infoSoft`. Esa combinacion producia poco contraste y una apariencia lavada, similar a un boton inactivo, aunque los `Pressable` no tenian la propiedad `disabled` y sus handlers estaban conectados.

Adicionalmente, en telefono cada control media 38 x 38 px y no tenia un estado visual `pressed`, de modo que el objetivo tactil era reducido y la pulsacion no entregaba feedback visible.

## Correccion aplicada

- Se mantuvo opacidad normal en reposo.
- El icono de llamada usa `theme.colors.accent` sobre `accentSoft`.
- El icono de videollamada usa `theme.colors.info` sobre `infoSoft`.
- Ambos iconos aumentaron de 20 a 22 px para mejorar legibilidad sin alterar la alineacion.
- Ambos objetivos tactiles miden 44 x 44 px y conservan centrado horizontal y vertical.
- El estado `pressed` reduce brevemente opacidad a 0.72 y escala a 0.94, ofreciendo feedback tactil visible sin introducir estado ni logica nueva.
- Se declaro `accessibilityRole="button"` y se hicieron explicitos el nombre y la ayuda de cada accion.

## Confirmacion de alcance funcional

No cambio ninguna logica de llamadas. Los callbacks siguen invocando exactamente `startCall('audio')` y `startCall('video')`; no se agregaron llamadas, WebRTC, sockets, endpoints, navegacion ni funciones nuevas.

## Validacion

- TypeScript: **OK** — `npm.cmd run typecheck` (`tsc --noEmit`).
- Build Android: **OK** — `npm.cmd run android:debug` (`BUILD SUCCESSFUL`).
- `git diff --check`: **OK** para los archivos de este alcance.
- Inspeccion visual estatica: **OK** — se verificaron iconos de 22 px centrados dentro de circulos de 44 x 44 px, separacion consistente, colores semanticos sobre sus fondos suaves, opacidad completa en reposo y feedback `pressed` uniforme.
- Inspeccion en dispositivo: no se pudo capturar una pantalla porque `adb devices -l` no reporto ningun dispositivo conectado durante la validacion. Esta limitacion no altera los resultados de TypeScript, build ni revision estatica.
