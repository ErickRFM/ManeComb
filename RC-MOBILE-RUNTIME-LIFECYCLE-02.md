# RC-MOBILE-RUNTIME-LIFECYCLE-02

## Estado

`CODE_REVIEW_PENDING`

Rama: `hotfix-mobile-runtime-lifecycle-02`

Este cambio es independiente de `hotfix-radio-first-open-crash-01`. No fusionar ambos sin ejecutar primero sus pruebas físicas por separado.

## Objetivo

Eliminar fallos de lifecycle equivalentes al cierre inicial de Radio:

- promesas GPS antiguas que terminan después de cambiar de foreground/background;
- dos propietarios intentando iniciar o detener el mismo servicio de ubicación;
- llamadas enlazadas a una instancia anterior del socket compartido;
- `start/stop` del foreground service de llamadas cruzados durante transiciones rápidas.

## Cambios

### GPS foreground

`useLocationEngine` usa una generación monotónica por solicitud. Cada cambio de ownership invalida permisos, posición inicial y creación de watcher pendientes. Una suscripción nativa que termina tarde se elimina inmediatamente y no actualiza estado.

La captura continua se limita a:

- rol `driver`;
- `vehicleId` asignado;
- acceso móvil habilitado.

### GPS background

El puente de ubicación usa propietarios explícitos:

- `operational-runtime`;
- `journey`;
- `legacy`.

La configuración canónica del runtime sustituye leases de jornada obsoletos después de cambios de token, vehículo, horario o sesión. Un cleanup legado no puede detener el servicio mientras `operational-runtime` siga activo.

El handoff conserva el servicio Android hasta que el watcher React esté activo o se confirme que el foreground no puede capturar.

### Llamadas

`CallOverlay` se vuelve a renderizar por:

- `socketStatus`;
- token;
- usuario autenticado.

Cuando `root-store` reemplaza la instancia Socket.IO, el store de llamadas quita listeners exactos de la instancia anterior y enlaza la nueva.

El foreground service de llamadas usa una cola latest-intent-wins. Las transiciones `CONNECTING / CONNECTED / RECONNECTING / IDLE` ya no dependen del cleanup previo de un `useEffect`.

## Pruebas añadidas

- watcher foreground inicia y libera una sola vez;
- usuario sin unidad no mantiene captura continua;
- permiso tardío no crea watcher después de background;
- background runtime adquiere lease con el `sessionId` vigente;
- cleanup legado no detiene GPS operacional;
- último owner libera el servicio;
- credenciales/sesión nuevas sustituyen journey lease obsoleto;
- foreground service de llamada serializa audio/video/stop;
- estado repetido no duplica arranques.

## Gates

- [ ] Mobile typecheck
- [ ] Mobile lint
- [ ] Mobile tests
- [ ] Android debug APK
- [ ] Prueba foreground/background rápida x20
- [ ] Pantalla bloqueada 10 minutos con GPS
- [ ] Logout/login con otro usuario
- [ ] Refresh de token y llamada entrante
- [ ] Llamada audio → finalizar → nueva llamada inmediata

## Fuera de alcance

- merge de PR #20;
- publicación en tiendas;
- push nativo para llamadas con la app cerrada;
- TURN productivo;
- cambios de rutas múltiples, ventas o portal.

## Veredicto esperado

`MOBILE_RUNTIME_CODE_READY` después de CI.

`MOBILE_RUNTIME_DEVICE_READY` únicamente después de la matriz física.
