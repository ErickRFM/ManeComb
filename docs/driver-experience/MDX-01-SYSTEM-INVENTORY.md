# MDX-01 — Inventario operativo y reglas de consolidación

## Base

- Rama: `agent/mdx-journey-consolidation`
- Base original: `main@624816d052bceb16d491b321b2dbfcc175037233`
- PR: `#47`
- Estado: `AUDIT_COMPLETE_CONTRACT_PENDING`

## Objetivo

Identificar las autoridades operativas ya existentes antes de introducir el concepto de Jornada. La implementación debe reutilizar los contratos actuales y evitar un segundo sistema paralelo.

## Autoridades encontradas

| Responsabilidad | Autoridad existente | Decisión MDX |
|---|---|---|
| Identidad y tenant | Backend de autenticación y access control | No redefinir en Jornada |
| Conductor asignado a unidad | Ciclo de vida del conductor y asignación conductor-unidad | Reutilizar como prerequisito |
| Unidad asignada a ruta | Vehicle route assignment | Reutilizar como prerequisito |
| Sesión activa de ruta | Route session | Reutilizar como ejecución operativa |
| Vista consolidada | `operational-unit-snapshot` | Extender como read model canónico |
| Contrato compartido | `shared/operational-contract` | Ampliar; no duplicar tipos en móvil/portal |
| GPS | Vehicle location ingestion y lifecycle móvil | Asociar a sesión/jornada activa |
| Checklist | Flujo móvil de checklist | Vincular al inicio y cierre de jornada |
| Seguimiento | Tracking hooks, snapshot y dashboard | Consumir el mismo read model |
| Historial de sesión | Portal dashboard session history/detail | Reutilizar para historial inicial |
| Conciliación portal | `operational-reconciliation` | Conservar como reconciliador de eventos |
| Radio/chat/RTC | Runtime operativo separado | Jornada solo aporta contexto, no ownership |

## Componentes relevantes

### Backend

- `backend/src/services/driver-lifecycle.js`
- `backend/src/domain/operational-unit-snapshot.js`
- `backend/src/services/operational-units-service.js`
- `backend/src/modules/navigation/routes.js`
- `backend/src/services/vehicle-location-ingestion.js`
- `backend/src/domain/vehicle-route-assignment-activation.js`
- `backend/src/services/route-event-engine.js`
- `backend/src/data/models.js`
- `backend/src/data/store.js`
- `backend/src/data/mongo-store.js`

### Contrato compartido

- `shared/operational-contract/types.ts`

### Mobile

- `mobile/src/services/route-session-actions.ts`
- `mobile/src/store/root-store.ts`
- `mobile/src/screens/map-screen.native.tsx`
- `mobile/src/screens/map/hooks/use-tracking-data.ts`
- `mobile/src/screens/map/utils/tracking.ts`
- `mobile/src/screens/map/components/BottomTrackingPanel.tsx`
- `mobile/src/screens/checklist-screen.tsx`
- `mobile/src/screens/checklist/checklist.utils.ts`
- `mobile/src/native/background-location.ts`

### Portal

- `ventas/features/portal/dashboard/dashboard.types.ts`
- `ventas/features/portal/dashboard/dashboard.utils.ts`
- `ventas/features/portal/dashboard/components/dashboard-operational-unit-card.tsx`
- `ventas/features/portal/dashboard/components/dashboard-vehicle-side-panel.tsx`
- `ventas/features/portal/dashboard/components/dashboard-session-detail.tsx`
- `ventas/features/portal/dashboard/components/dashboard-session-history-card.tsx`
- `ventas/src/store/operational-reconciliation.ts`
- `ventas/features/portal/routes/components/route-unit-selector.tsx`

## Hallazgos de congruencia

### 1. La Jornada ya existe de forma distribuida

El sistema posee las piezas de una jornada, pero no una identidad única que las relacione de principio a fin:

```text
conductor-unidad
+ unidad-ruta
+ route session
+ checklist
+ tracking
+ incidentes
+ historial
```

La solución no es crear una copia de cada pieza. La solución es añadir una identidad de ejecución que las relacione.

### 2. `operational-unit-snapshot` es la mejor autoridad de lectura

Móvil y Portal ya dependen de una representación consolidada de unidad, conductor, ruta, sesión activa y tracking. El read model de Jornada debe agregarse ahí o componerse desde ahí.

No se permitirá que Portal y Mobile calculen estados distintos desde colecciones separadas.

### 3. `route session` debe seguir siendo la ejecución de ruta

Jornada tiene un alcance mayor que una sesión de ruta:

```text
Jornada
├── asignación y confirmación
├── preparación/checklist
├── una o más sesiones de ruta
├── pausas formales
├── incidencias
├── cambio de unidad autorizado
└── cierre administrativo
```

Por ello, Jornada no sustituye RouteSession. Una Jornada puede contener una o más sesiones cuando exista relevo, interrupción o cambio controlado.

### 4. Los campos heredados de usuario no pueden ser autoridad

`user.shift`, `user.status` y `user.vehicleId` son útiles como compatibilidad o resumen, pero no deben decidir por sí solos si existe una jornada activa.

La autoridad debe venir del backend mediante el vínculo operativo activo.

### 5. El contrato compartido debe evitar tipos dobles

No se añadirá un `Journey` independiente en `mobile/src/types/app.ts` y otro distinto en `ventas/src/types/app.ts`. El contrato se define en `shared/operational-contract` y cada producto puede crear view models, no contratos contradictorios.

### 6. GPS y runtime móvil ya tienen lifecycle protegido

La consolidación previa de GPS introdujo ownership y leases. Jornada deberá proporcionar contexto a ese lifecycle, pero no crear otro foreground service, watcher o cola paralela.

### 7. Existe trabajo paralelo de autenticación

El PR `#48` redefine el canal canónico de cuentas. MDX no modificará auth, account routing ni guards hasta integrar esa autoridad. La jornada solo consumirá identidad autenticada y permisos ya resueltos.

## Matriz de reutilización

| Sistema | Conservar | Extender | Sustituir | Eliminar ahora |
|---|---:|---:|---:|---:|
| Driver lifecycle | Sí | Sí | No | No |
| Vehicle route assignment | Sí | Sí | No | No |
| Route session | Sí | Sí | No | No |
| Operational snapshot | Sí | Sí | No | No |
| Shared operational contract | Sí | Sí | No | No |
| GPS lifecycle | Sí | Contexto | No | No |
| Checklist | Sí | Sí | No | No |
| Tracking | Sí | Sí | No | No |
| Portal reconciliation | Sí | Sí | No | No |
| `user.shift` | Compatibilidad | No | Como autoridad | Después de migración |
| `user.status` | Presencia/resumen | No | Como jornada | No |
| Tipos operativos duplicados | Temporal | No | Por contrato compartido | Después de consumidores |

## Riesgos P0

| Riesgo | Consecuencia | Control |
|---|---|---|
| Doble autoridad Jornada/RouteSession | Estados contradictorios | Jornada compone RouteSession |
| Campos legacy usados por UI | Jornada fantasma | Snapshot canónico y migración gradual |
| Portal y Mobile calculan distinto | Admin no hace match | Shared contract + backend read model |
| Cambio de unidad crea otra jornada | Historial fragmentado | Evento de sustitución dentro de jornada |
| Reinicio de app pierde contexto | GPS sin jornada | Restaurar desde backend |
| PR #48 cambia guards | Conflictos de integración | No tocar auth en MDX |
| Versionar antes de funcionalidad | Release engañoso | Bump solo tras certificación |

## Checks de Fase 1

- [x] Autoridad de identidad localizada.
- [x] Autoridad conductor-unidad localizada.
- [x] Autoridad unidad-ruta localizada.
- [x] RouteSession localizada.
- [x] Snapshot operativo localizado.
- [x] Contrato compartido localizado.
- [x] GPS lifecycle localizado.
- [x] Checklist localizado.
- [x] Consumidores Mobile localizados.
- [x] Consumidores Portal localizados.
- [x] Conciliación Portal localizada.
- [x] Campos legacy identificados.
- [x] Trabajo paralelo de auth identificado.
- [ ] Contrato Journey revisado contra modelos completos.
- [ ] Migración y compatibilidad definidas.
- [ ] Pruebas de contrato añadidas.

## Veredicto

```text
PHASE_1_INVENTORY_CLOSED
NO_RUNTIME_CHANGES
JOURNEY_MUST_COMPOSE_EXISTING_AUTHORITIES
```
