# RC-ECOSYSTEM-RECONCILIATION-20260815

Resultado de la auditoría definida en `CLAUDE-ECOSYSTEM-RECONCILIATION-20260815.md`.

## 1. SHAs

```
main utilizado (BASE):      d8e0d9f56cd8a996b82df218ca7f5a47ef9ca701
rama de auditoría (HEAD):   28036b6465a8ad307fb56bc4a983dc82684d0856
rama:                       audit/claude-reconcile-20260815
delta:                      71 commits · 143 archivos · +9449 / -1478
```

`origin/main` **no avanzó** durante la auditoría: coincide exactamente con el baseline del brief. No hizo falta actualizar la rama.

### Correcciones al brief (verificadas contra el estado real)

| Afirmación del brief | Estado real verificado |
|---|---|
| #196 head `7ac8b942` | Correcto. Incluye la certificación Mongo (`7458496a`) y un merge de main. |
| #197 "GitHub lo reporta no mergeable" | **Obsoleto.** Hoy `MERGEABLE` / `CLEAN`. |
| #198 "CI, Dependency, System y Portal verdes" | **Incorrecto.** 30 pass, 1 skip y **1 fail**: `Production dependencies (ventas)`. |
| #198 "la mención a nanoid puede estar obsoleta" | **Al revés:** el fallo de nanoid es real y se debe a que #198 está 1 commit detrás de main (le falta `d8e0d9f5`). Se resuelve al integrar main, como se hizo en esta rama. |

## 2. Inventario de PRs (checks reales al momento de auditar)

| PR | HEAD | Base | Checks | Posición vs main | Veredicto |
|---|---|---|---|---|---|
| #196 GPS/historial/V2 | `7ac8b942` | main | 17 pass · 1 skip | +7 / -0 | **Integrado** |
| #200 Route Learning V3 | `2c8e5beb` | #196 | 20 pass · 1 skip | apilado | **Integrado** |
| #198 autoridad operacional | `31bf4366` | main | 30 pass · 1 skip · **1 fail** | +4 / -1 | **Integrado** (el fail se resuelve con main) |
| #197 Ventas/Portal | `2ad90902` | main | 17 pass · 1 skip | +34 / -1 | **Integrado** |
| #193 diagnóstico realtime | `6cbcff20` | main | 16 pass | +2 / -2 | **Integrado** (justificado abajo) |
| #187 Comunicación Web | `530c3f5c` | main | 1 pass · **1 fail** | +63 / **-20** | **NO integrado** |
| #195 sync inverso | main→#187 | #187 | 13 pass · **3 fail** | n/a | **Cerrar** |

## 3. Matriz de solapamiento (archivos compartidos)

| Par | Archivos | Naturaleza |
|---|---|---|
| #196 ∩ #198 | 4 | `vehicle-location-ingestion.js`, `locations/routes.js`, `root-store.ts`, `dashboard.utils.ts` |
| #196 ∩ #200 | 3 | `auto-route.js`, `auto-route-learning.js`, `.env.example` (dependencia esperada) |
| #193 ∩ #196 ∩ #198 | 1 | `root-store.ts` |
| #197 ∩ #200 | 1 | `app.js` (registro de rutas, aditivo) |
| #187 ∩ #197 | 2 | `package-lock.json`, `App.tsx` |
| #187 ∩ #198 | 2 | `chat/routes.js`, `use-app-store.ts` |

Todas las integraciones resolvieron **sin conflicto de git**. Se verificó el resultado semántico a mano, porque auto-merge limpio no implica corrección.

## 4. Conflictos semánticos resueltos y autoridad elegida

### `ventas/features/portal/dashboard/dashboard.utils.ts` — #196 vs #198

Ambos PRs modificaron `applyOperationalSnapshot` y su entorno por razones distintas, y **ambos tenían razón**:

- #198 elimina `speed: unit.gps.speedKmh`. `Vehicle.speed` es el valor legado de ingesta en m/s; proyectar el canónico en km/h borraba la unidad y provocaba una **segunda conversión 3.6x** en el Portal.
- #196 hace viajar la taxonomía canónica completa en `gpsFreshness` (`connectionState`, `ageSeconds`, `hasEverReported`).

**Autoridad elegida:** las dos. Verificado en el árbol integrado que sobreviven ambos arreglos, que `getOperationalAlerts` lee `unit.gps.speedKmh <= 3` (coincide con `STOPPED_SPEED_KMH = 3` del backend) y que el rename `formatSpeed → formatSpeedMetersPerSecond` no dejó referencias colgantes.

### `mobile/src/store/root-store.ts` — #193 vs #196 vs #198

Tres cambios de propósito disjunto sobre el mismo archivo: replay de `control:sessionStart` (#196, 4 líneas), `ResourceState` + diagnóstico de apply (#198), instrumentación de transporte (#193). Se conservan los tres; ninguno redefine al otro.

### `ventas/src/store/use-app-store.ts` — #198 vs #187 (no integrado)

Conflicto real detectado en merge de prueba: #198 añade heartbeat de presencia y #187 añade `getSharedPortalRealtimeSocket` / `subscribeSharedPortalRealtimeSocket`. **Son complementarios**: el registro de suscriptores de #187 existe precisamente para que Comunicación y Llamadas reusen el *mismo* socket. Ninguno crea una segunda conexión. Queda documentado para cuando #187 se rebase.

## 5. Hallazgo corregido en esta rama

**`fix(routes): single authority for technical journey identity` (`28036b64`)**

`isTechnicalRouteId` estaba definida dos veces con cuerpo idéntico: en `domain/route-context.js` (autoridad, consumida por `auto-route-learning.js` y `route-event-engine.js`) y **redefinida localmente** en `auto-route-learning-core.js`.

La copia local es la que decide si una jornada entra a V3 o cae a V2. Mientras los cuerpos coincidan no se nota; en cuanto se añada un prefijo técnico nuevo (p. ej. `pending:`) divergen y la frontera **enruta mal en silencio**: una jornada libre podría entrar a V3, o una jornada oficial generar un candidato V2 duplicado.

El core importa ahora la autoridad. Se verificó equivalencia sobre `recording:` / `assigned:` / vacío / null / id real antes de sustituir. Sin cambio de comportamiento.

### Hardening 201.1 — carreras posteriores a la reconciliación

- **Backlog offline histórico:** cuando existe `requestedSessionId` explícito
  pero no existe una sesión directa, `resolveTrackingSession` da prioridad a la
  sesión histórica que contiene `capturedAt` antes que a una sesión activa
  posterior. Un replay `pending:*` conserva `packetId`/captura, persiste en la
  jornada finalizada correcta y sigue siendo idempotente.
- **Autoridad del CAS Mongo:** el documento devuelto por
  `findOneAndUpdate(..., returnDocument: "after")` es el resultado autoritativo
  de la mutación. El refresh de `Vehicle.assignedRoute` sigue ejecutándose y
  puede reconciliar una revisión posterior, pero su retorno o fallo no puede
  convertir un CAS aplicado en `route_update_failed`. El resultado V3 expone
  `committedRevision`.

## 6. Auditoría lógica — resultados

| Verificación | Resultado |
|---|---|
| Escaleras de frescura GPS | **Una sola**: `domain/gps-telemetry-state.js` define 8/15/30; los 5 consumidores importan las constantes |
| Historia de posiciones | **Una sola**: `RouteSessionPosition`; única escritura en `vehicle-location-ingestion.js` |
| Entidad Route | **Una sola**: V3 aplica in-place; no existe `RouteV2`/`RouteNew` |
| Revisión monotónica | CAS en `FleetRepository.updateRouteIfRevision`, filtro Mongo `{_id, organizationId, revision}` |
| Resultado del CAS | El documento CAS es autoridad; el refresh de proyección no reemplaza `committedRevision` ni revierte una escritura aplicada |
| Doble incremento de revision | **Descartado**: tras el CAS, `updateRoute(id, {}, actor)` usa guardas `typeof !== "undefined"`, no muta campos operativos y el fingerprint no cambia |
| Tenant leakage en CAS | Filtro incluye `organizationId` y `canActorAccessRoute` previo |
| Frontera V2/V3 | Mutuamente excluyente; V3 solo con Route oficial válida (revision ≥ 1, polyline ≥ 2, mismo tenant); guard impide fallback a V2 si la Route desapareció |
| Flags OFF = legacy | `segmentLearningEnabled=false` ⇒ `applicable:false` inmediato ⇒ V2 puro, sin efectos laterales |
| ResourceState | Autoridad única en `shared/resource-state.ts`; sin copias locales en mobile ni ventas |
| Presence | Un emisor por cliente |
| Socket | Exactamente un `io()` por cliente |
| Endpoint público `sales-events` | Correcto: allowlist de eventos, metadata acotada por longitud, **sin PII**, rate-limited, responde 202 |
| Servicios duplicados | `auto-route-learning.js` (49 líneas) es boundary guard sobre `-core.js` (380): extracción, no `Service2` |

## 7. Qué entra, qué no

### Entra (integrado y verde)

- **#196** — frescura GPS canónica, `RouteSessionPosition` como única historia, reconciliación de jornada offline, `recording:*` como identidad técnica.
- **#200** — Route Learning V3 con CAS por revisión, apply in-place, separado de V2 y **apagado por defecto**.
- **#198** — autoridad operacional, presence/heartbeat, `x-trace-id`, telemetría Android, `ResourceState` por dominio. Su fallo de CI se resuelve al traer main.
- **#197** — Ventas/Portal comercial, funnel first-party sin PII, legales.
- **#193** — instrumentación DEV realtime.

**Justificación de integrar #193 en vez de archivarlo:** su hipótesis **no** está resuelta. Los gates físicos pendientes de #196/#198/#200 son exactamente background, reconexión y red intermitente, que es lo que instrumenta. Es complementario a #198 (transporte vs apply), la compuerta DEV es real (`logRealtimeDiag` hace early-return fuera de dev y sanitiza `token`/`password`/`authorization`), es módulo hoja sin imports y no participa de ninguna decisión de runtime. Se respeta la regla 9: sigue siendo diagnóstico, no comportamiento productivo.

### No entra

- **#187 Comunicación Web** — 63 commits por delante y **20 por detrás** de main, `CONFLICTING`, CI con fallo real y gate físico propio (Portal↔Android). Integrarlo aquí bloquearía todo el núcleo verde con un gate ajeno a GPS/rutas/operación. Su diseño de socket compartido **es compatible** con #198 (verificado por merge de prueba: solo 2 conflictos, ambos aditivos). Debe rebasarse sobre un main que ya contenga #198, que es justo la compatibilidad que necesita.

### Debe cerrarse

- **#195** — es sincronización inversa hacia la rama de Comunicación, no una feature hacia `main`. Queda superado en cuanto #187 se rebase. No es candidato de producción.

## 8. Orden exacto de merge recomendado

```
1. #196  fix/gps-route-history-learning-20260814   (base de todo)
2. #200  agent/route-learning-v3-20260815           (apilado sobre #196)
3. #198  codex/operational-authority-audit-20260815 (traer main antes: resuelve nanoid)
4. #197  agent/ventas-product-maturity-20260815
5. #193  diag/realtime-instrumentation-20260812     (opcional; útil para los gates físicos)
--- después, en su propia pista ---
6. #187  rebase sobre main y re-auditoría
7. #195  cerrar
```

Alternativamente puede mergearse esta rama de auditoría como unidad ya reconciliada, pero **no mientras existan gates físicos pendientes**.

## 9. Matriz de tests

| Gate | Resultado |
|---|---|
| `backend npm test` | **PASS** |
| `communication-service npm test` | **PASS** |
| `mobile npx tsc --noEmit` | **PASS** |
| `mobile npm run lint` | **PASS** |
| `mobile npm test -- --runInBand` | **PASS** — 107 suites / 601 tests |
| `ventas npx tsc --noEmit` | **PASS** |
| `ventas npm run build` (incluye `verify:contracts`) | **PASS** |

Ejecutados además por corte tras cada integración (#196, #200, #198, #197, #193) y tras la corrección de duplicación. No se eliminó ninguna prueba para conseguir verde.

## 10. Gates físicos pendientes

```
PHYSICAL_GATE: ACCEPTED_PENDING
```

- **#196 / #198 / #200** — GPS real: background, pantalla apagada, batería, red intermitente, replay de jornada, presencia multidispositivo.
- **#200** — matriz GPS multi-día / multi-unidad y review/apply controlado de segmentos.
- **#187** — Portal ↔ Android real (no integrado).

CI verde **no** convierte ninguno de estos en PASS.

## 11. Flags y variables que deben seguir OFF

| Variable | Valor | Motivo |
|---|---|---|
| `AUTO_ROUTE_LEARNING_ENABLED` | `false` | V2 sigue oscuro hasta decisión de despliegue |
| `AUTO_ROUTE_REVIEW_ENABLED` | `false` | Revisión puede abrirse por separado tras acumular evidencia |
| `AUTO_ROUTE_SEGMENT_LEARNING_ENABLED` | `false` | V3 ships dark; requiere gate físico |
| `AUTO_ROUTE_MIN_DISTINCT_SERVICE_DAYS` | `2` | Regla de uso habitual |

### Gate obligatorio antes de activar V3

El patch de Route y el cambio del Candidate a `APPROVED` todavía **no forman
una transacción única**. Con `AUTO_ROUTE_LEARNING_ENABLED=false`,
`AUTO_ROUTE_REVIEW_ENABLED=false` y
`AUTO_ROUTE_SEGMENT_LEARNING_ENABLED=false` esto no bloquea el runtime actual.
Antes de habilitar V3 en producción es obligatorio implementar o demostrar una
frontera transaccional/recuperable que impida Route aplicada con Candidate sin
aprobar (o la inversa), y certificarla bajo concurrencia y fallo intermedio.

```
DEPLOYMENT_CONFIGURATION_REQUIRED
```

El repositorio no contiene manifiesto de despliegue; las variables viven en el panel de Render, que no es inspeccionable desde aquí. No se afirma su estado actual.

## 12. Riesgos residuales reales

1. **#187 divergirá más.** Cada día que el núcleo avanza, su rebase se encarece. Su compatibilidad con #198 está verificada hoy, no mañana.
2. **Frescura GPS endurecida** de 120 s a 15 s en REST y socket (#196). Aceptado lógicamente: el foreground Android pide ubicación cada 5 s y el lease live es 8 s.
3. **`resolveSessionStartedAt`** acepta un inicio declarado por el cliente, acotado a 24 h hacia el pasado.
4. **V3 nunca ha corrido con tráfico real.** Todo su comportamiento está certificado por pruebas y flags apagados.
5. **Route patch + Candidate APPROVED no son una transacción única.** Es gate obligatorio antes de activar V3; hoy los tres flags permanecen apagados.
6. **`rcgeo` es un remote muerto** (`.codex-tmp-rc-geo-01c`, directorio inexistente) que rompe `git fetch --all`. Fuera del alcance de esta auditoría; se documenta, no se modifica.
7. La certificación Mongo de candidatos aprendidos usa `mongodb-memory-server`; si el binario no se puede descargar, el test hace SKIP explícito en vez de inventar un PASS.
# Corte 4R apilado

El retiro operacional post-reconciliación vive exclusivamente en `refactor/operational-legacy-retirement-20260815`, apilado sobre este PR en `8d06836a8f602b5161e9ffdbdbb845176c1d1ae1`. Sustituye consumidores live de Vehicle/`location:updated` por `OperationalUnitSnapshot`, conserva Vehicle como identidad/configuración, RouteSessionPosition como historia e `incidents[]` como autoridad mutable. No modifica las garantías 201.1 ni activa Route Learning V3. Su PR debe fusionarse después de #201; mientras exista prueba física pendiente permanece Draft y `PHYSICAL_GATE=ACCEPTED_PENDING`.
