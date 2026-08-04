# RC-PHYSICAL-GPS-C3-01

## Alcance

Fase GPS exclusivamente. No se modifico RTC, ventas, portal, F3, F4, F5 ni la logica de rutas multiples.

## Hallazgo reproducido por auditoria

- `mobile/App.tsx` habilitaba `useLocationSync` solo con una jornada `RUNNING`.
- El mismo componente detenia el servicio Android para un conductor sin jornada `RUNNING`.
- El backend ya separaba correctamente ambos conceptos: actualiza `Vehicle.location` antes de resolver si corresponde crear una `RouteSessionPosition`.
- `ManeCombLocationService` si tiene un call-site JS mediante `startBackgroundLocationServiceAsync`; el problema era el gate de jornada que impedia llegar a el.

## Cambio

- La captura foreground sincroniza cuando existe una unidad y acceso mobile; conserva los gates de coordenadas, red, intervalo y horario.
- El servicio Android puede iniciar sin jornada y recibe `sessionId` vacio.
- `sessionId` solo se adjunta cuando la jornada actual esta `RUNNING`; un estado `PAUSED` o la ausencia de jornada no se convierten implicitamente en jornada activa.
- Se conserva un solo pipeline de ubicacion y la cola durable offline existente.
- El resultado HTTP queda registrado de forma sanitizada con `vehicleId`, presencia de `sessionId`, HTTP status, backend code, `packetId`, `accepted/decision` y timestamp. No se registran tokens ni credenciales.
- El HUD diferencia `GPS local` de `Servidor`; la segunda señal usa el `OperationalUnitSnapshot` confirmado por backend.

## Cobertura automatizada

| Verificacion | Resultado |
| --- | --- |
| `npm.cmd run typecheck` en `mobile` | PASS, exit 0 |
| Jest: location service, background location y offline cache | PASS, 3 suites / 11 tests, exit 0 |
| `node --require ./test/setup-env.js test/vehicle-location-ingestion.test.js` | PASS, exit 0 |
| `git diff --check` | PASS, exit 0 |

La prueba de ingestion confirma que, sin jornada, se actualiza ubicacion, se emiten `location:updated` y `operational-unit:updated`, y no aumenta el numero de posiciones de jornada. Tambien cubre duplicados, fuera de orden y que otro conductor no puede actualizar la unidad.

## Validacion fisica pendiente

Debe repetirse con C-3 y el Sandbox desplegado:

1. Sin jornada, foreground: `GPS local` debe indicar lectura y `Servidor` debe pasar de `Hace 12 d` a segundos/minutos.
2. Confirmar en backend que no se creo `RouteSessionPosition`.
3. Con jornada `RUNNING`, confirmar que la posicion viva y la posicion de jornada se actualizan.
4. Cortar y recuperar Internet para confirmar drenaje de la cola en un device real.

No se declara cierre fisico hasta completar esas comprobaciones.
