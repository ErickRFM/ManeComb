# Race Conditions - Player

## Riesgos encontrados

Antes existian operaciones por tarjeta y polling periodico capaces de solaparse, respuestas tardias capaces de sobrescribir estado y sesiones nativas simultaneas al cambiar de tarjeta.

## Controles aplicados

- Cola global `radioPlayerOperation` para play/pause/stop/seek.
- `activeRadioPlayerId` como unica propiedad activa.
- El nativo libera todos los ids distintos antes de start.
- Polling recursivo con `setTimeout` solo despues de resolver la promesa anterior.
- Generacion de polling para descartar respuestas obsoletas.
- Un resetter registrado por tarjeta para limpiar la anterior.
- Source change y unmount pasan por la misma cola.

## Timers

El historial tiene como maximo un timeout de polling activo. El `setInterval` restante en `audio.ts` pertenece al recorder generico, no al motor de reproduccion del historial.

## Evidencia

TypeScript, ESLint, 8 suites/34 tests Mobile, Backend tests, Android Release y `git diff --check` pasaron. Logcat mostro una sola session AudioTrack durante Play/Pause/Resume.

## Riesgo residual

No existe todavia una prueba automatizada especifica que inyecte respuestas nativas fuera de orden. La cola y la generacion lo previenen por construccion, pero el stress fisico de 10 ciclos queda pendiente.
