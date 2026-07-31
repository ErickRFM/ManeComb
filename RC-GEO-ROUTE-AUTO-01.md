# RC-GEO-ROUTE-AUTO-01 — Cierre profesional de geolocalización y rutas aprendidas

**Estado:** Endurecimiento validado localmente — pendiente de despliegue protegido y prueba física
**Veredicto previo al despliegue:** `RC_GEO_ROUTE_AUTO_NOT_READY`
**Base auditada:** `main` en `c14a777`
**Rama de trabajo aislada:** `codex/rc-geo-route-auto-01`
**Fecha:** 2026-07-31
**Commit / despliegue:** el hash del commit y la evidencia desplegada se registran externamente después del commit

## 1. Objetivo y alcance

La RC estabiliza el seguimiento GPS existente sin sustituir Mapbox, Socket.IO, Expo, el servicio Android, MongoDB, Zustand ni los modelos operativos. La nueva capacidad aprende patrones de recorridos terminados y propone una ruta para revisión administrativa. Una sugerencia nunca modifica una ruta oficial, nunca se asigna automáticamente a una unidad y nunca se aprueba sin una acción autenticada y autorizada.

Quedaron fuera del alcance pagos, correo, documentos, chat, radio y el portal público de ventas. No se cambió ningún endpoint comercial.

## 2. Auditoría inicial verificada

| Área | Estado inicial comprobado | Riesgo | Decisión aplicada |
| --- | --- | --- | --- |
| Propietario GPS foreground | `useLocationSync` se montaba en `App.tsx` y nuevamente en `map-screen.native.tsx` | Dos `packetId` distintos para una misma lectura | Un solo propietario global en `App.tsx` |
| Servicio Android | Foreground service, notificación, cola en `SharedPreferences`, flush ordenado, backoff, wake lock y renovación de token | Faltaba diagnóstico de cola y confirmación | Se exponen pendientes y marcas de captura, envío y confirmación |
| HTTP GPS | Pipeline completo de autorización, sesión, posición, eventos, métricas y realtime | Era la implementación dominante | Se convirtió en adaptador del servicio común |
| Socket GPS | Implementación paralela e incompleta; no persistía evidencia de sesión | Divergencia funcional y doble mantenimiento | Se convirtió en adaptador del mismo servicio común |
| Orden temporal | El store podía conservar live data por recepción, pero el pipeline no distinguía explícitamente rechazo | Un paquete viejo podía recalcular o emitir estado | Autoridad temporal explícita y respuesta `accepted/decision` |
| Dedupe | Posición histórica tenía índice `(sessionId, packetId)` | Live state no tenía identidad del último paquete | Se añadió `locationPacketId` y decisión `duplicate` |
| Reconnect móvil | Reconectaba rooms y cola, sin esperar snapshot completo | Socket conectado con datos aún viejos | Estado `reconnecting` hasta completar REST + cola |
| Reconnect portal | Refrescaba portal, pero no vehículos/snapshot operacional | REST viejo podía sobrescribir Socket nuevo | Reconciliación por `gps.receivedAt` y refresh de ambos stores |
| Cámara portal | Auto-fit tenía llave estable, pero no modo explícito | Selección y gesto manual podían competir | Modos `center`, `follow` y `user` |
| Estado GPS | `fresh/stale/missing` no expresaba retraso o pérdida operativa | Mensajes ambiguos | Contrato canónico `live/delayed/stale/lost` |
| Aprendizaje de rutas | No existía modelo, servicio, endpoint ni revisión | Sin capacidad automática | Candidato mínimo, idempotente y revisable |

## 3. Arquitectura final

```text
React foreground ─┐
Android service ──┼─ HTTP /locations/update ─┐
cliente Socket ───┘                          ├─ vehicle-location-ingestion
Socket location:update ──────────────────────┘
                                              ├─ identidad / tenant / unidad
                                              ├─ normalización temporal
                                              ├─ dedupe y protección de orden
                                              ├─ live Vehicle
                                              ├─ RouteSessionPosition
                                              ├─ eventos y métricas
                                              └─ location + operational snapshot

FINISHED RouteSession
  └─ auto-route-learning (una vez por sessionId + versión)
       ├─ valida calidad, duración, distancia y continuidad
       ├─ normaliza y simplifica geometría
       ├─ separa origen/destino y sentido
       ├─ agrega evidencia a un candidato único
       └─ READY_FOR_REVIEW al alcanzar el mínimo

Portal autenticado
  └─ revisar → aprobar o rechazar
       └─ aprobar crea Route oficial; NO la asigna a una unidad
```

## 4. Ingesta GPS común

`backend/src/services/vehicle-location-ingestion.js` es el único dueño del pipeline. HTTP y Socket conservan sus contratos de transporte, pero delegan la lógica funcional.

Validaciones del servidor:

1. usuario autenticado y acceso operacional;
2. coordenadas válidas;
3. unidad existente;
4. organización/tenant de la unidad;
5. conductor asignado o administrador autorizado;
6. horario operacional cuando no existe una sesión solicitada;
7. normalización del reloj cliente;
8. identidad `packetId`;
9. pertenencia temporal y física a `RouteSession`.

Las respuestas distinguen:

| Decisión | Live state | Evidencia histórica | Eventos/realtime |
| --- | --- | --- | --- |
| `accepted` | Actualiza | Persiste si pertenece a sesión | Sí |
| `duplicate` | No cambia | No duplica por `packetId` | No |
| `out_of_order` | No retrocede | Puede conservar paquete tardío de la sesión | No recalcula el live state |

La lectura nativa acepta `heading`, `speed` y `accuracy` tanto en el nivel superior como dentro de `coordinates`, manteniendo compatibilidad con el payload Android existente.

## 5. Modelo temporal y contrato operacional

El live state compara `locationTimestamp` procesado y conserva `locationReceivedAt` como autoridad de reconciliación entre REST y Socket. El snapshot canónico aumentó a `snapshotVersion: 1` e incluye:

- `gps.recordedAt`: instante efectivo de la lectura;
- `gps.receivedAt`: instante de recepción del backend;
- `gps.connectionState`: `live`, `delayed`, `stale` o `lost`;
- `lastEventAt`: incluye recepción, lectura, sesión y evento operativo.

Umbrales actuales del backend:

| Estado | Edad de autoridad |
| --- | --- |
| `live` | hasta 30 segundos |
| `delayed` | más de 30 y hasta 120 segundos |
| `stale` | más de 120 y hasta 900 segundos |
| `lost` | más de 900 segundos o sin marca temporal |

El portal usa `gps.receivedAt` antes que cualquier fallback. Un refresh REST tardío ya no sustituye una unidad más nueva recibida por Socket.

## 6. Captura móvil y servicio Android

- Se eliminó el segundo `useLocationSync` de la pantalla de mapa.
- `App.tsx` es el propietario único del watcher React.
- Solo se transmite durante una jornada `RUNNING`; la ubicación local puede seguir alimentando la vista sin crear evidencia de servidor fuera de jornada.
- Al pasar a background, el servicio Android mantiene propiedad exclusiva.
- La cola nativa conserva orden y durabilidad en `SharedPreferences`.
- El bridge expone `pendingPackets`, `lastCapturedAt`, `lastSentAt` y `lastConfirmedAt`.
- Tras reconectar, Mobile permanece en `reconnecting` hasta completar `refreshAll()` y `flushPendingSync()`.

El inicio de jornada ahora permite una sesión de grabación sin ruta oficial mediante una identidad interna `recording:{vehicleId}`. Esta identidad no aparece como ruta asignada en el snapshot y solo habilita evidencia; no crea ni asigna una ruta.

## 7. Aprendizaje de rutas

### 7.1 Configuración

La configuración está centralizada en `backend/src/config/auto-route.js` y admite:

| Variable | Valor por defecto | Función |
| --- | ---: | --- |
| `AUTO_ROUTE_LEARNING_ENABLED` | `false` | Habilita el análisis al finalizar jornadas |
| `AUTO_ROUTE_REVIEW_ENABLED` | `false` | Habilita listado, aprobación y rechazo |
| `AUTO_ROUTE_ALGORITHM_VERSION` | `v2` | Separa la identidad nueva de candidatos `v1` |
| `AUTO_ROUTE_GEOMETRY_VERSION` | `corridor-v1` | Versiona la geometría representativa |
| `AUTO_ROUTE_MIN_CORRIDOR_OVERLAP` | 0.75 | Cobertura bidireccional mínima del corredor |
| `AUTO_ROUTE_MAX_CORRIDOR_DISTANCE_METERS` | 80 | Distancia media y umbral de proximidad |
| `AUTO_ROUTE_MAX_LENGTH_DIFFERENCE_RATIO` | 0.30 | Diferencia relativa máxima de longitud |
| `AUTO_ROUTE_MIN_EVIDENCE_COUNT` | 3 | Recorridos distintos requeridos |
| `AUTO_ROUTE_MIN_POINT_COUNT` | 10 | Mínimo de posiciones válidas |
| `AUTO_ROUTE_MIN_DISTANCE_METERS` | 500 | Distancia mínima |
| `AUTO_ROUTE_MIN_DURATION_SECONDS` | 120 | Duración mínima |
| `AUTO_ROUTE_MAX_ACCURACY_METERS` | 80 | Descarta puntos imprecisos |
| `AUTO_ROUTE_MAX_GAP_SECONDS` | 300 | Descarta discontinuidades |
| `AUTO_ROUTE_MAX_SPEED_KMH` | 140 | Descarta saltos imposibles |
| `AUTO_ROUTE_SIMPLIFY_TOLERANCE_METERS` | 20 | Simplificación de geometría |
| `AUTO_ROUTE_ENDPOINT_GRID_DEGREES` | 0.002 | Agrupación estable de extremos |

### 7.2 Elegibilidad y geometría

Solo se analiza una sesión `FINISHED`. Los puntos se validan, ordenan, depuran por precisión, separaciones temporales y velocidad implícita. La geometría se simplifica con una variante de Ramer–Douglas–Peucker. El candidato guarda una polilínea consolidada/simplificada y referencias a sesiones; no copia el historial crudo completo.

Los extremos son solamente un prefiltro. Después se remuestrean ambas polilíneas y se calcula solapamiento bidireccional, distancia media entre corredores y diferencia relativa de longitud. El `groupKey` usa hash SHA-256 de organización, celdas de origen/destino, sentido, cluster geométrico y versión. Ya no depende de `vehicleId`; origen/destino invertidos y corredores alternativos producen grupos diferentes.

La primera geometría válida se conserva como representante estable mientras las evidencias posteriores satisfagan los umbrales. El candidato registra `representativeSessionId`, `geometryVersion`, `evidenceSessionIds`, `evidenceVehicleIds`, `evidenceCount` y `vehicleCount`; no reemplaza la traza ciegamente con la última sesión.

### 7.3 Estados

```text
COLLECTING → READY_FOR_REVIEW → APPROVED
                              ↘ REJECTED
```

`confidence` progresa según evidencia y llega a 1 al alcanzar el mínimo configurado. La evidencia de una sesión no puede sumarse dos veces.

## 8. Idempotencia y concurrencia

Se añadieron dos entidades mínimas:

### `auto_route_processing`

- `_id = sessionId:algorithmVersion`;
- índice único `(sessionId, algorithmVersion)`;
- impide reprocesar una sesión con la misma versión;
- registra `PROCESSING`, `COMPLETED`, `REJECTED` o `FAILED`.

### `learned_route_candidates`

- índice único `(organizationId, groupKey)`;
- `$addToSet` para `evidenceSessionIds` y `evidenceVehicleIds`;
- `evidenceCount` atómico;
- recuperación de carrera `E11000` sin crear un segundo candidato.

Ambas colecciones son nuevas, por lo que no existe una migración destructiva ni datos históricos que deduplicar. La creación de índices debe verificarse en el despliegue antes de activar la revisión productiva.

## 9. API y permisos

| Método | Ruta | Regla |
| --- | --- | --- |
| GET | `/navigation/learned-routes` | autenticación, operación, organización y `canManageRoutes` |
| GET | `/navigation/learned-routes/:candidateId` | mismo tenant y permiso |
| POST | `/navigation/learned-routes/:candidateId/approve` | solo `READY_FOR_REVIEW` |
| POST | `/navigation/learned-routes/:candidateId/reject` | no revisada previamente |

La aprobación llama al store existente de rutas oficiales. El resultado queda enlazado por `approvedRouteId`, pero no ejecuta `assignRouteToVehicle`.

## 10. Portal

La pantalla Rutas carga candidatos listos para revisión, muestra:

- unidad o cantidad de unidades de evidencia;
- cantidad de recorridos;
- distancia y duración promedio;
- confianza;
- previsualización Mapbox de la traza;
- acciones Aprobar y Rechazar.

El mapa operacional incorpora tres intenciones de cámara:

- `center`: encuadre explícito de la flota;
- `follow`: sigue únicamente la unidad seleccionada;
- `user`: un gesto manual suspende movimientos automáticos.

## 11. Observabilidad

Se añadieron contadores diferenciados:

- `gps_packets_received`;
- `gps_packets_accepted`;
- `gps_packets_duplicate`;
- `gps_packets_out_of_order`;
- `gps_packets_rejected`;
- `auto_route_sessions_duplicate`;
- `auto_route_evidence_accepted`;
- `auto_route_evidence_rejected`;
- `auto_route_candidates_ready`;
- `auto_route_processing_failed`;
- `auto_route_processing_duration_ms`.

No se registran rutas completas ni ubicaciones en estas métricas. Los logs temporales conservan identificadores operativos ya existentes y la decisión normalizada.

## 12. Validaciones ejecutadas

| Validación | Resultado | Evidencia |
| --- | --- | --- |
| Backend suite completa | OK | 31 archivos de prueba ejecutados; exit 0 |
| Prueba nueva de ingesta | OK | HTTP/Socket, duplicate, out-of-order, no emisión duplicada |
| Pruebas de aprendizaje `v2` | OK | 18 escenarios: ruido, corredor alternativo, sentido, multiunidad, tenant, concurrencia, rechazo, aprobación y flags |
| Mobile typecheck | OK | `tsc --noEmit` |
| Mobile tests | OK | 26 suites, 134 pruebas, 0 fallos |
| Ventas typecheck | OK | `tsc --noEmit` |
| Ventas build | OK | Vite, 634 módulos |
| Reconciliación Portal | OK | REST viejo no reemplaza Socket nuevo |
| Kotlin Android | OK | incluida en el ensamblado normal |
| APK completo | OK | `assembleDebug --no-daemon --console=plain`, 623 tareas, BUILD SUCCESSFUL |
| `git diff --check` | OK | sin errores de whitespace |
| Prueba física con dos dispositivos | Pendiente | requiere entorno y credenciales físicas |

Los logs esperados de pruebas de errores comerciales y correo no configurado pertenecen a escenarios negativos existentes; la suite terminó con código 0.

## 13. Archivos modificados

### Backend

- `backend/package.json`
- `backend/.env.example`
- `backend/scripts/verify-auto-route-indexes.js`
- `backend/src/config/auto-route.js`
- `backend/src/data/models.js`
- `backend/src/data/mongo-store.js`
- `backend/src/data/store.js`
- `backend/src/domain/operational-unit-snapshot.js`
- `backend/src/modules/locations/routes.js`
- `backend/src/modules/navigation/routes.js`
- `backend/src/services/auto-route-learning.js`
- `backend/src/services/vehicle-location-ingestion.js`
- `backend/src/sockets/index.js`
- `backend/test/auto-route-learning.test.js`
- `backend/test/auto-route-flags.test.js`
- `backend/test/rbac-integration.test.js`
- `backend/test/vehicle-location-ingestion.test.js`

### Mobile

- `mobile/App.tsx`
- `mobile/android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationModule.kt`
- `mobile/android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationService.kt`
- `mobile/src/native/background-location.ts`
- `mobile/src/screens/checklist-screen.test.ts`
- `mobile/src/screens/map-screen.native.tsx`
- `mobile/src/screens/map/utils/tracking.test.ts`
- `mobile/src/store/root-store.ts`

### Contrato compartido y Ventas

- `shared/operational-contract/selectors.ts`
- `shared/operational-contract/types.ts`
- `ventas/features/portal/components/operations-map.tsx`
- `ventas/features/portal/screens/portal-routes-screen.tsx`
- `ventas/src/lib/api.ts`
- `ventas/src/store/operational-reconciliation.ts`
- `ventas/src/store/use-app-store.ts`

### Documentación

- `RC-GEO-ROUTE-AUTO-01.md`

## 14. Prueba física pendiente obligatoria

Para elevar el veredicto a `READY` deben verificarse dos dispositivos reales y una sesión administrativa:

1. iniciar jornada con ruta y sin ruta asignada;
2. confirmar un solo propietario de captura en foreground;
3. apagar pantalla y comprobar servicio Android;
4. perder red, acumular paquetes y observar `pendingPackets`;
5. recuperar red y comprobar flush ordenado y `lastConfirmedAt`;
6. enviar el mismo `packetId` por HTTP y Socket y comprobar una sola evidencia;
7. entregar un paquete viejo y comprobar que el marcador no retrocede;
8. observar simultáneamente Mobile y Portal;
9. forzar reconexión y comprobar reconciliación REST + Socket;
10. completar tres recorridos equivalentes por sentido;
11. revisar la sugerencia en Portal;
12. aprobar y confirmar que aparece en catálogo sin asignación automática;
13. rechazar otra sugerencia y comprobar aislamiento de tenant;
14. verificar métricas y ausencia de doble evento.

## 15. Riesgos pendientes

- Falta ejecutar el verificador contra el MongoDB efectivo después del despliegue y confirmar ambos índices únicos; la prueba local de concurrencia usa el store embebido y el adapter Mongo emplea operaciones atómicas más recuperación `E11000`.
- Falta prueba física de batería, proceso asesinado, reinicio del teléfono y dos observadores simultáneos.
- El modo de persistencia del dispositivo y las restricciones OEM pueden variar; deben incluirse en QA físico.
- Los umbrales de aprendizaje son configurables y requieren calibración con recorridos reales antes de habilitar decisiones operativas.

## 16. Resultado

El código elimina la doble captura foreground, unifica HTTP y Socket, protege el live state contra duplicados y retrocesos, conserva evidencia tardía, reconcilia REST/realtime, hace explícitos los estados de señal y añade un flujo de aprendizaje revisable, idempotente y aislado por organización.

No se declara desplegada ni `READY` dentro de este commit: primero deben subirse los cambios con ambos flags apagados, verificarse el servicio y los índices efectivos, ejecutar los fixtures controlados y, finalmente, completar la prueba física simultánea con dos dispositivos.

```text
RC_GEO_ROUTE_AUTO_NOT_READY
```

## 17. Endurecimiento RC-GEO-ROUTE-AUTO-01B

La revisión confirmó que `v1` agrupaba únicamente por organización, unidad, celdas terminales, sentido y versión; no comparaba el corredor. `v2` corrige esa ambigüedad sin reinterpretar candidatos anteriores.

Resultados obligatorios cubiertos por fixtures automatizados:

| Escenario | Resultado verificado |
| --- | --- |
| Una sesión | candidato `COLLECTING`, no revisable |
| A + B + C, mismo corredor con ruido | un candidato `READY_FOR_REVIEW`, `evidenceCount=3` |
| Mismos extremos por corredor alternativo | candidato diferente |
| Sentido contrario | candidato diferente |
| Varias unidades del mismo tenant | un candidato organizacional y varias `evidenceVehicleIds` |
| Tenant distinto | aislamiento completo |
| Misma sesión reprocesada | no aumenta evidencia |
| Procesamiento concurrente | un candidato y tres evidencias |
| Longitud incompatible | no se mezcla |
| Hueco GPS grave o velocidad imposible | evidencia rechazada |
| Candidato rechazado | no vuelve a estado revisable con el mismo corredor |
| Aprobación | crea ruta oficial y persiste `approvedRouteId` |
| Asignación | ninguna unidad se asigna automáticamente |
| Aprendizaje deshabilitado | no reclama ni procesa sesión |
| Revisión deshabilitada | endpoint responde `auto_route_review_disabled` |

### Estrategia de índices y migración

`backend/scripts/verify-auto-route-indexes.js` se conecta a la base efectiva sin imprimir la URI, revisa duplicados y lista/verifica los índices de `auto_route_processing` y `learned_route_candidates`. Por defecto y con `--dry-run` no modifica nada. `--apply` solo crea un índice ausente cuando no existen duplicados; no elimina documentos ni reemplaza automáticamente un índice no único. La versión `v2` evita reinterpretar silenciosamente candidatos `v1`, por lo que no se requiere reescritura de datos históricos.

### Activación protegida

El despliegue inicial debe conservar:

```env
AUTO_ROUTE_LEARNING_ENABLED=false
AUTO_ROUTE_REVIEW_ENABLED=false
AUTO_ROUTE_ALGORITHM_VERSION=v2
```

Solo después de confirmar build, health HTTP 200, MongoDB y ambos índices únicos podrá abrirse una ventana de validación en un tenant de prueba. Al finalizar, los flags deben regresar al estado acordado; no se autoriza activación global permanente en esta RC.

### Matriz física preparada

La validación restante usa dos usuarios, dos unidades y dos jornadas en foreground, background y pantalla apagada; incluye pérdida de red, cola offline, reconexión, flush, paquete fuera de orden, logout/login y Portal simultáneo. Se registrarán únicamente `pendingPackets`, `lastCapturedAt`, `lastSentAt`, `lastConfirmedAt`, `gps.connectionState`, `locationReceivedAt`, `sessionId` y `vehicleId`, sin coordenadas completas.
