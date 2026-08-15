# RC-ROUTE-LEARNING-V3-01 — Corredor tolerante y aprendizaje por segmentos

**Estado:** implementación en PR apilado; activación productiva bloqueada por flags y validación física.

## 1. Objetivo

Evolucionar el aprendizaje de rutas existente sin crear una segunda autoridad de GPS, rutas o navegación. V3 conserva `RouteSessionPosition` como evidencia histórica, `Route.revision` como token de concurrencia, `navigation-service.js` como autoridad de planeación y el mecanismo V2 para jornadas libres. La nueva capacidad añade dos comportamientos:

1. seguimiento tolerante: una calle paralela o una variación corta no se presenta como desvío real por una sola lectura GPS;
2. aprendizaje por segmento: cuando una unidad abandona la geometría oficial y se reincorpora de forma recurrente, solo ese tramo se convierte en candidato de mejora.

## 2. Autoridades que NO cambian

- `vehicle-location-ingestion`: ingesta GPS y persistencia operativa;
- `route_session_positions`: historia canónica de posiciones de una jornada;
- `navigation-service`: Mapbox / OSRM / Valhalla y normalización de planes;
- `Route`: geometría oficial y `revision` monotónica;
- `auto-route-learning`: orquestación de aprendizaje;
- `learned_route_candidates`: evidencia agregada, confianza y revisión;
- permisos `canManageRoutes`: autoridad administrativa de revisión.

No se añadieron colecciones paralelas para GPS ni una segunda entidad de Route.

## 3. Motor de corredor

La decisión deja de ser `distancia > 50 m = OFF_ROUTE`.

Estados internos:

```text
ON_ROUTE
  -> NEAR_ROUTE
  -> POSSIBLE_DEVIATION
  -> OFF_ROUTE_CONFIRMED
  -> RECOVERING
  -> ON_ROUTE
```

Valores iniciales conservadores:

| Parámetro | Default |
| --- | ---: |
| Sobre ruta | <= 65 m |
| Corredor cercano | <= 120 m |
| Posible desviación | >= 220 m |
| Separación fuerte | >= 650 m |
| Confirmación desviación media | 45 s |

`routeProgress.isOffRoute` solo se vuelve `true` en `OFF_ROUTE_CONFIRMED`. `route-event-engine` conserva su contrato existente y por tanto ya no emite `OFF_ROUTE` por ruido aislado.

Mobile usa una proyección ligera: clasifica la separación para representación inmediata, pero deja la confirmación temporal al backend. Una separación fuerte conserva una advertencia inmediata de seguridad.

## 4. Geometría común

`backend/src/domain/route-geometry.js` centraliza primitivas puras:

- normalización de coordenadas;
- Haversine;
- proyección de punto sobre polilínea;
- distancia acumulada;
- `slice` de un tramo por progreso;
- `splice` de un tramo aprendido dentro de la ruta oficial;
- simplificación de polilínea;
- remuestreo y comparación de corredores.

Esto evita repetir matemáticas entre progreso, aprendizaje y aplicación.

## 5. Aprendizaje V3 por tramo

V3 solo procesa una sesión vinculada a una `Route` oficial versionada. `recording:*` y otras identidades técnicas siguen siendo responsabilidad de V2.

Flujo:

```text
RouteSession FINISHED
  -> posiciones válidas ya normalizadas
  -> proyectar contra Route revision N
  -> detectar salida >= umbral de candidato
  -> recopilar puntos reales
  -> exigir reincorporación al corredor
  -> extraer tramo baseline de Route N
  -> descartar si ambos corredores son equivalentes
  -> agrupar evidencia por ruta + revision + anchors + corredor
  -> learned_route_candidate V3
```

Un tail que termina lejos de la ruta no se aprende como mejora: puede representar un abandono real, una jornada incompleta o un destino distinto.

## 6. Identidad y compatibilidad

El candidato V3 usa:

```text
algorithmVersion = v3-segment
geometryVersion = segment-v1:<routeId codificado>:<revision>:<startM>:<endM>
```

Esto permite:

- no reinterpretar candidatos V2;
- conocer la ruta oficial base;
- conocer la revisión exacta observada;
- conocer el tramo que se reemplazaría;
- invalidar una sugerencia cuando la ruta cambió durante el aprendizaje.

El mismo `learned_route_candidates` conserva `evidenceSessionIds`, `evidenceVehicleIds`, `evidenceServiceDates`, `distinctServiceDays`, `confidence`, idempotencia y aislamiento por organización.

## 7. Aplicación de una mejora

Aprobar un candidato V3 NO crea otra ruta.

```text
Route R / revision 12
       + learned segment
       -> compare-and-swap revision=12
       -> reemplazo solo startM..endM
       -> Route R / revision 13
```

Protecciones:

1. candidato `READY_FOR_REVIEW`;
2. mismo tenant;
3. `canManageRoutes`;
4. `Route.revision` actual coincide con la revisión base;
5. no existen jornadas `RUNNING` o `PAUSED` para esa ruta;
6. Mongo aplica `findOneAndUpdate` condicionado por `revision`;
7. si otro escritor gana la carrera, el apply devuelve `candidate_stale` y no pisa el cambio;
8. `assignedRoute` se vuelve a proyectar usando el escritor canónico existente;
9. se registra auditoría de la decisión y la comparación del tramo.

## 8. Rollout

V3 se entrega oscuro:

```env
AUTO_ROUTE_LEARNING_ENABLED=false
AUTO_ROUTE_SEGMENT_LEARNING_ENABLED=false
AUTO_ROUTE_REVIEW_ENABLED=false
AUTO_ROUTE_SEGMENT_ALGORITHM_VERSION=v3-segment
AUTO_ROUTE_SEGMENT_GEOMETRY_VERSION=segment-v1
```

Orden recomendado:

1. desplegar con los tres flags en `false`;
2. validar health, índices y regresiones;
3. tenant controlado: `AUTO_ROUTE_LEARNING_ENABLED=true` + `AUTO_ROUTE_SEGMENT_LEARNING_ENABLED=true`, revisión aún cerrada;
4. observar candidatos sin permitir aplicación;
5. abrir `AUTO_ROUTE_REVIEW_ENABLED=true` solo para matriz controlada;
6. ejecutar recorridos físicos foreground/background, red intermitente y múltiples días;
7. validar apply y stale guard;
8. decidir activación progresiva.

## 9. Casos obligatorios de certificación

### Corredor

- 40 m: `ON_ROUTE`;
- ~90 m: `NEAR_ROUTE`;
- calle paralela >120 m: observada sin alarma inmediata;
- >220 m sostenido: `OFF_ROUTE_CONFIRMED`;
- >650 m: separación fuerte;
- regreso al corredor: `RECOVERING` y después `ON_ROUTE`.

### Segmentos

- salida + misma calle + reincorporación: un tramo candidato;
- salida sin reincorporación: no candidato;
- misma variante con ruido: mismo grupo;
- corredor distinto: candidato diferente;
- mismo segmento sobre otra `Route.revision`: no mezclar;
- una sola jornada repetida: no duplica evidencia;
- múltiples unidades/días: aumenta evidencia organizacional.

### Apply

- candidato vigente: misma `routeId`, `revision + 1`;
- prefijo y sufijo de la ruta permanecen;
- candidato stale: HTTP 409 y cero mutación;
- jornada activa: HTTP 409 y cero mutación;
- carrera de escritura: compare-and-swap deja un solo ganador.

## 10. Archivos V3

### Nuevos

- `backend/src/config/route-corridor.js`
- `backend/src/domain/route-geometry.js`
- `backend/src/domain/learned-route-segment.js`
- `backend/src/services/route-segment-learning.js`
- `backend/src/services/route-segment-approval.js`
- `backend/src/modules/navigation/segment-routes.js`
- `backend/test/route-corridor.test.js`
- `backend/test/route-segment-learning.test.js`
- `backend/test/route-segment-approval.test.js`
- `.github/workflows/route-learning-v3.yml`

### Evolucionados

- `backend/src/config/auto-route.js`
- `backend/src/services/auto-route-learning.js`
- `backend/src/services/route-progress.js`
- `backend/src/app.js`
- `mobile/src/hooks/point-to-point-tracker-core.ts`
- `mobile/src/utils/active-route.ts`
- `mobile/test/point-to-point-tracker-core.test.mts`
- Portal de rutas y contrato API al integrar presentación de V3.

## 11. Criterio de cierre

La implementación de código puede considerarse integrada cuando CI, gate V3, TypeScript y builds estén verdes. La característica NO debe considerarse certificada para producción hasta completar la matriz física; la ausencia de una prueba con dispositivo, GPS real y reconexión no se sustituye por unit tests.
