# RC-ROUTE-LEARNING-V3-01 — Corredor tolerante y aprendizaje por segmentos

**Estado técnico:** implementado en PR apilado `#200`; activación productiva bloqueada por flags y matriz física.
**Base:** PR `#196` (`fix/gps-route-history-learning-20260814`).

## 1. Objetivo

Evolucionar el aprendizaje de rutas existente sin crear una segunda autoridad de GPS, rutas o navegación. V3 conserva `RouteSessionPosition` como evidencia histórica, `Route.revision` como token de concurrencia, `navigation-service.js` como autoridad de planeación y V2 para jornadas libres.

V3 añade:

1. corredor tolerante: una calle paralela o variación corta no se presenta como desvío real por una sola lectura GPS;
2. aprendizaje por segmento: solo se aprende el tramo entre salida y reincorporación a la ruta oficial;
3. aplicación in-place: una mejora aprobada actualiza esa misma `Route` y avanza su `revision`, sin crear una ruta duplicada.

## 2. Autoridades conservadas

- `vehicle-location-ingestion`: ingesta GPS y persistencia operativa;
- `route_session_positions`: historia canónica de posiciones;
- `navigation-service`: Mapbox / OSRM / Valhalla;
- `Route`: geometría oficial + `revision` monotónica;
- `auto-route-learning`: entrada pública de aprendizaje;
- `learned_route_candidates`: evidencia agregada, confianza y revisión;
- `canManageRoutes`: autoridad administrativa;
- `portal-routes-screen.tsx`: autoridad existente de editor/planificación;
- `portal-layout.tsx`: autoridad existente de navegación del Portal.

No se añadieron colecciones paralelas de GPS ni una segunda entidad Route.

## 3. Motor de corredor

La decisión deja de ser `distancia > 50 m = OFF_ROUTE`.

```text
ON_ROUTE
  -> NEAR_ROUTE
  -> POSSIBLE_DEVIATION
  -> OFF_ROUTE_CONFIRMED
  -> RECOVERING
  -> ON_ROUTE
```

Defaults iniciales:

| Parámetro | Default |
| --- | ---: |
| Sobre ruta | <= 65 m |
| Corredor cercano | <= 120 m |
| Posible desviación | >= 220 m |
| Separación fuerte | >= 650 m |
| Confirmación de desviación media | 45 s |

`routeProgress.isOffRoute` solo se vuelve `true` en `OFF_ROUTE_CONFIRMED`. `route-event-engine` conserva el contrato `OFF_ROUTE` / `ON_ROUTE`, pero ya no recibe falsos positivos por una lectura aislada.

Mobile clasifica la separación para representación inmediata; la confirmación temporal sigue siendo autoridad backend.

## 4. Geometría común

`backend/src/domain/route-geometry.js` concentra primitivas puras:

- normalización de coordenadas;
- Haversine;
- proyección de punto sobre polilínea;
- distancia acumulada;
- corte de tramo por progreso;
- reemplazo de un tramo dentro de la ruta oficial;
- simplificación/remuestreo;
- comparación de corredores.

Progreso, aprendizaje y aplicación reutilizan la misma matemática.

## 5. Contexto inmutable de jornada

Al crear `SESSION_STARTED`, `route-event-engine` congela en `metadata.routeContext`:

```text
routeId
routeRevision
geometryHash
```

El hash usa coordenadas normalizadas. Al finalizar la jornada, V3 exige que `routeId + revision + hash` sigan coincidiendo con la ruta oficial antes de usar la evidencia.

Si el contexto no coincide:

- no se aprende el tramo;
- se incrementa `auto_route_segment_context_rejected{reason=route_context_mismatch}`;
- la sesión no contamina otro candidato.

Las jornadas técnicas `recording:*` no inventan contexto de Route y siguen en V2.

## 6. Aprendizaje V3 por tramo

```text
RouteSession FINISHED
  -> posiciones válidas
  -> contexto de inicio válido
  -> proyectar contra Route revision N
  -> detectar salida del corredor
  -> recopilar recorrido real
  -> exigir reincorporación
  -> extraer baseline de Route N
  -> descartar si ambos corredores equivalen
  -> agrupar por ruta + revision + anchors + corredor
  -> learned_route_candidate V3
```

Una salida sin reincorporación nunca se convierte en mejora: puede ser un abandono real, una jornada incompleta o un destino distinto.

El candidato usa:

```text
algorithmVersion = v3-segment
geometryVersion = segment-v1:<routeId codificado>:<revision>:<startM>:<endM>
```

V2 no se reinterpreta. V3 conserva `evidenceSessionIds`, `evidenceVehicleIds`, `evidenceServiceDates`, `distinctServiceDays`, `confidence`, idempotencia y aislamiento de tenant.

Si la `Route` oficial ya no existe al postprocesar, V3 cierra el procesamiento como `official_route_unavailable`; nunca cae silenciosamente a un candidato V2 completo.

## 7. Aplicación segura

Aprobar V3 no crea otra ruta:

```text
Route R / revision 12
       + learned segment
       -> CAS revision=12
       -> reemplazo startM..endM
       -> Route R / revision 13
```

Protecciones:

1. `READY_FOR_REVIEW`;
2. mismo tenant;
3. `canManageRoutes`;
4. candidato basado en la revisión actual;
5. sin jornadas `RUNNING` o `PAUSED`;
6. con V3 activo, PATCH/DELETE de una Route también se bloquea mientras tenga jornada activa;
7. Mongo usa compare-and-swap condicionado por `Route.revision`;
8. si otro escritor gana la carrera: `candidate_stale`, cero overwrite;
9. el escritor canónico refresca `assignedRoute` existentes;
10. auditoría conserva tramo anterior, métricas previas, evidencia y revisiones.

## 8. Portal

Las autoridades `PortalRoutesScreen` y `PortalLayout` permanecen intactas.

La UI V3 se empotra en `RouteCatalogPanel`, usada exclusivamente por Rutas:

- `Mejoras detectadas`;
- recorridos, días, unidades y confianza;
- delta de distancia y tiempo;
- revisión base vs actual;
- estado `Obsoleta` cuando el candidato quedó stale;
- `Mantener actual`;
- `Aplicar mejora`.

El endpoint legacy `/navigation/learned-routes` excluye candidatos V3 para impedir que el flujo V2 los trate como “crear una ruta nueva”. V3 se consulta por `/navigation/learned-route-segments`.

## 9. Feature flags / rollout

V3 se entrega oscuro:

```env
AUTO_ROUTE_LEARNING_ENABLED=false
AUTO_ROUTE_SEGMENT_LEARNING_ENABLED=false
AUTO_ROUTE_REVIEW_ENABLED=false
AUTO_ROUTE_SEGMENT_ALGORITHM_VERSION=v3-segment
AUTO_ROUTE_SEGMENT_GEOMETRY_VERSION=segment-v1
```

Orden de activación:

1. desplegar código con flags apagados;
2. validar health e índices;
3. tenant controlado: learning master + segment learning ON, review OFF;
4. observar candidatos sin permitir aplicación;
5. abrir review solo para matriz controlada;
6. recorridos físicos foreground/background, pantalla apagada, red intermitente y múltiples días/unidades;
7. validar stale guard y apply;
8. decidir activación progresiva.

## 10. Gate dedicado

`.github/workflows/route-learning-v3.yml` ejecuta:

### Backend
- corredor e histéresis;
- snapshot de Route al inicio;
- extracción/agrupación de segmentos;
- Route ausente no cae a V2;
- aplicación in-place + revisión monotónica + stale guard;
- regresión V2 `auto-route-learning`;
- regresión `route-revision`;
- dependencias reales de `communication-service` para cargar el app legacy.

### Mobile
- TypeScript;
- contrato point-to-point tolerante.

### Portal
- TypeScript;
- `npm run build`, incluyendo todos los verificadores estáticos existentes.

## 11. Archivos estructurales

### Core / dominio
- `backend/src/config/route-corridor.js`
- `backend/src/domain/route-geometry.js`
- `backend/src/domain/route-context.js`
- `backend/src/domain/learned-route-segment.js`
- `backend/src/services/auto-route-learning-core.js`
- `backend/src/services/route-event-engine-core.js`
- `backend/src/services/route-segment-learning-core.js`

Los paths públicos `auto-route-learning.js`, `route-event-engine.js` y `route-segment-learning.js` son fachadas del contrato y delegan al único core correspondiente; no hay dos motores ejecutándose.

### Apply / API
- `backend/src/services/route-segment-approval.js`
- `backend/src/modules/navigation/route-write-guard.js`
- `backend/src/modules/navigation/segment-review-routes.js`
- `backend/src/modules/navigation/segment-routes.js`

### Mobile
- `mobile/src/hooks/point-to-point-tracker-core.ts`
- `mobile/src/utils/active-route.ts`

### Portal
- `ventas/features/portal/routes/learned-route-segment.api.ts`
- `ventas/features/portal/routes/components/route-catalog-panel.tsx`
- `ventas/features/portal/screens/route-learning-v3-review.tsx`

## 12. Criterio de cierre

El código queda técnicamente integrado cuando gate V3, System Audit, Dependency Audit, CI general y certificaciones aplicables estén verdes contra el HEAD final.

La capacidad **no se declara certificada para producción** hasta completar la matriz física con GPS real y reconexión. Los tests automatizados no sustituyen esa prueba.
