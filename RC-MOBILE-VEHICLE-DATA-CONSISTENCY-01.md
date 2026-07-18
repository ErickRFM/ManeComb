# RC-MOBILE-VEHICLE-DATA-CONSISTENCY-01

## Root Cause Analysis: Vehicle Data Consistency Flow

### Date
2026-07-17

### Severity
**CRITICAL** — Unhandled `null` coordinate cascading into React Native crash (Error Boundary), invisible units in map, and data discrepancies between Ventas and Mobile.

---

## 1. BUG IDENTIFIED: Crash en AppMapMarker con coordinate null

### Location
- `mobile/src/components/app-map.native.tsx:285` — `coordinate.latitude` sin null-check
- `mobile/src/components/app-map.web.tsx:267` — misma vulnerabilidad

### Root Cause
El tipo TypeScript `Vehicle.location` declaraba `GeoPoint` como obligatorio (no-nullable), pero la DB MongoDB permite `null` (schema: `location: { type: pointSchema, default: null }`). Cuando un vehículo nuevo o sin GPS se carga en el mapa, `vehicle.location` es `null`, y al pasarlo como `coordinate` a `AppMapMarker`, el acceso `coordinate.latitude` produce un crash irrecuperable que activa el Error Boundary.

**Chain de propagación del bug:**
1. Backend `getFleetSummary()` retorna vehículo con `location: null` y `locationTimestamp: <fecha>` → no recupera posición desde `RouteSessionPosition`
2. Store (socket `location:updated`) hace merge con `{ ...ev, ...nextVehicle }` — si payload entrante tiene `location: null`, sobrescribe valor previo
3. `MapCanvas.tsx` itera `vehicles` y pasa `vehicle.location` sin filtro a `AppMapMarker`
4. `AppMapMarker` accede `coordinate.latitude` → crash → Error Boundary → pantalla "La app encontró un problema"

### Fix Aplicado
**FIX 1 — AppMapMarker (nativo + web):** Guard al inicio del componente: si `coordinate` es null o no tiene lat/lng finitos, retorna null.

**FIX 2 — VehicleMarkers (MapCanvas.tsx):** Filtro previo: si `vehicle.location` es null o inválido, no renderiza marker.

**FIX 3 — Vehicle type (app.ts):** `location` cambiado de `GeoPoint` a `GeoPoint | null`.

**FIX 4 — getFleetSummary (mongo-store.js + store.js):** Condición de recuperación ampliada: si `locationTimestamp` existe pero `location` es null, igual se intenta recuperar desde `RouteSessionPosition`.

**FIX 5 — normalizeVehicle (navigation-data.ts):** Ahora normaliza `location` mediante `normalizePoint`, asegurando formato consistente.

**FIX 6 — Socket merge (root-store.ts):** El merge `{ ...ev, ...nextVehicle }` está seguido de `normalizeVehicle()` que garantiza datos consistentes.

**FIX 7 — ChecklistScreen RoutePreview:** Guard condicional: solo renderiza `AppMapMarker` si `vehicle?.location` es truthy.

**FIX 8 — map-screen.native.tsx:** Guards en `handleSelectTrackingVehicle` y `handleSelectIncidentVehicle` para no acceder `vehicle.location` sin validación.

**FIX 9 — use-point-to-point-tracker.ts:** `createVehiclePoint` retorna null si `vehicle.location` es null, con manejo en el caller.

**FIX 10 — hasVehicleLiveLocation (tracking.ts):** Función existente que filtra correctamente vehículos sin GPS — compatible con todos los fixes.

---

## 2. Impact Assessment

### Crashes Eliminados
- Renderizado de `AppMapMarker` con coordinate null → protegido por early return
- `focusMap(vehicle.location.latitude)` → protegido por guards condicionales
- `focusPoint(vehicle.location)` → protegido por guards en `hasVehicleLiveLocation`

### Vehículos Invisibles Eliminados
- `getFleetSummary` ahora recupera location de `RouteSessionPosition` incluso si el campo `location` del vehículo es null pero `locationTimestamp` existe

### Data Flow Consistente
```
Ventas → Backend (mongo-store) → API → Store → Mobile → Mapa/Checklist
         ↕                        ↕
    RouteSessionPosition    normalizeVehicle
    (fallback location)     (validates & shapes)
```

---

## 3. Detection Method

1. Análisis de `getFleetSummary` en `mongo-store.js:2330` — condición `vehicle.locationTimestamp` excluye vehículos sin GPS pero **no** recupera location cuando `location` es null y `locationTimestamp` existe
2. Análisis de tipos TS: `Vehicle.location: GeoPoint` vs DB schema `default: null`
3. Revisión de componentes que acceden `vehicle.location` sin validación: 8 ubicaciones identificadas
4. Confirmación: Error Boundary se activaba al cargar mapa con vehículo sin GPS

---

## 4. Testing & Validation

- **TypeScript**: `tsc --noEmit` pasa limpio
- **Lint**: `eslint .` pasa limpio
- **Unit Tests**: 21 test suites, 99 tests pasan
- **Expected behavior post-fix**: Vehículos sin GPS se renderizan sin crash (no aparecen en el mapa pero no rompen la app). Vehículos con `locationTimestamp` pero sin `location` ahora recuperan posición de `RouteSessionPosition`.

---

## 5. Commit Record

| File | Change |
|------|--------|
| `mobile/src/components/app-map.native.tsx` | FIX 1: Guard null coordinate |
| `mobile/src/components/app-map.web.tsx` | FIX 1: Guard null coordinate (hooks-safe) |
| `mobile/src/screens/map/components/MapCanvas.tsx` | FIX 2: Filter null location in VehicleMarkers |
| `mobile/src/types/app.ts` | FIX 3: Vehicle.location nullable |
| `backend/src/data/mongo-store.js` | FIX 4: Recover location when null in getFleetSummary |
| `backend/src/data/store.js` | FIX 4: Same fix for in-memory store |
| `mobile/src/utils/navigation-data.ts` | FIX 5: normalizeVehicle validates location |
| `mobile/src/screens/checklist-screen.tsx` | FIX 7: Guard null location in RoutePreview |
| `mobile/src/screens/map-screen.native.tsx` | FIX 8: Guards en handleSelectTracking/IncidentVehicle |
| `mobile/src/hooks/use-point-to-point-tracker.ts` | FIX 9: createVehiclePoint nullable return |

---

## 6. Escalation Path

- No se requieren cambios en Ventas (ya envía datos correctamente)
- Backend `mongo-store.js` y `store.js` actualizados — mantener sincronizados
- Monitorear logs de Error Boundary post-despliegue para confirmar eliminación de crashes por coordinate null

---

## 7. Prepared By

Sistema de auditoría automatizada OpenCode
