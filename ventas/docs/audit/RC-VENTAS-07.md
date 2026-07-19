# RC-VENTAS-07 — Auditoría de Congruencia y Estandarización de Datos (Ventas ↔ App)

> **Foco:** Frontera de datos entre `ventas` (Vite/React), `mobile` (Expo/RN) y `backend` (Express/Mongoose). Nombres de campo, enums, formatos de ID/fecha y unidades numéricas. **No cubre UX/UI** (ya cubierto en RC-01…RC-06).
> **Clasificación:** 🔴 Critico | 🟠 Incompleto | 🟡 UX/UI | 🔵 Conversion | 🟢 Coherencia | ⚫ Refactor | 🟣 **Congruencia de Datos (nueva)**
> **Roadmap:** FASE A (inmediato, bajo riesgo) → FASE B (normalización) → FASE C (contrato) → FASE D (refactor)
> **Fuente de la verdad:** `backend/src/data/models.js` + `backend/src/domain/operational-unit-snapshot.js`. `ventas` y `mobile` se evalúan como consumidores.

---

## Nota preliminar sobre el encuadre del ticket

Dos supuestos del ticket resultaron **inexactos** al verificarlos contra el repo. Se documentan porque cambian la propuesta de solución:

1. **Sí existe un paquete compartido.** `shared/operational-contract/` (`types.ts`, `selectors.ts`, `index.ts`) es la contraparte tipada de `operational-unit-snapshot.js` y se declara a sí mismo canónico. El problema no es que falte un paquete compartido: es que **existe y ninguno de los dos `app.ts` lo importa**. Ver F-21. Esto abarata mucho el fix — hay dónde poner la verdad única, sólo falta adoptarla.

2. **No se encontró el diccionario de labels que mezcla `available`/`ASSIGNED` en el mismo mapa.** Se buscó `patrolling` en todo el repo: aparece sólo en `backend/src/data/seedData.js`, `backend/src/domain/operational-unit-snapshot.js`, `mobile/src/screens/checklist-screen.tsx:72` y un doc. En `checklist-screen.tsx:72` es un `Set` de estados de vehículo **sin** valores de sesión mezclados. El problema real es distinto y peor, y se documenta en F-04/F-05/F-07: no hay un mapa mezclado, hay **tres vocabularios de estado paralelos** y `ventas` sólo conoce uno de ellos.

---

## 🔴 Críticos

### F-01. `averageSpeed`/`maxSpeed` viajan en m/s y se renderizan como km/h
**Archivo:** `backend/src/services/route-metrics-engine.js:36-44,220-221` → `mobile/src/screens/map/components/BottomTrackingPanel.tsx:291-292`
**Evidencia:** El backend normaliza a **metros por segundo**:
```js
return value > 45 ? value / 3.6 : value;   // normalizeSpeed → m/s
averageSpeed: roundMetric(average(speeds)),
```
El móvil los imprime sin convertir:
```ts
rows.push(['Velocidad promedio', `${Math.round(Number(selectedSession.averageSpeed))} km/h`]);
rows.push(['Velocidad maxima', `${Math.round(Number(selectedSession.maxSpeed))} km/h`]);
```
**Impacto:** Una jornada real a 36 km/h se muestra como **"10 km/h"** — un factor de 3.6 de subestimación en métricas de velocidad. TypeScript no avisa porque ambos lados son `number | null`. Afecta reportes de jornada que un supervisor usa para evaluar conductores.
**Roadmap:** FASE A

### F-02. `subscription.activeUnits` no cuenta unidades reales, y el gate de downgrade depende de él
**Archivo:** `backend/src/services/portal-account.js:97-120` → `ventas/features/commercial/rules/subscription-validator.ts:146-150`
**Evidencia:** El backend deriva el consumo del plan de un snapshot comercial, no de la flota registrada:
```js
const activeUnits = Array.isArray(order.starterFleet)
  ? order.starterFleet.filter((entry) => entry.status === "active").length
  : 0;
```
`ventas` bloquea el downgrade con ese número:
```ts
if (changeKind === PLAN_CHANGE_KINDS.DOWNGRADE && subscription.activeUnits > targetPlan.units) {
```
**Impacto:** `starterFleet` es la flota *sugerida* que se generó en el checkout, no las unidades dadas de alta después. Un cliente con 12 combis operando y un `starterFleet` vacío pasa el gate de downgrade a un plan de 2 unidades. Inversamente, puede quedar bloqueado por unidades que nunca existieron. Es el módulo de cobro decidiendo sobre datos que no describen la realidad.
**Roadmap:** FASE A

### F-03. `activeUnits` y `maxUnits` significan cosas distintas en dos endpoints del mismo portal
**Archivo:** `backend/src/services/portal-account.js:117-120` vs `backend/src/services/activation-keys.js:145-147`
**Evidencia:** En `PortalSubscription` → unidades del pedido:
```js
activeUnits,                            // starterFleet activos
unitsLimit: totalUnits,                 // = order.fleetSize
```
En `PortalActivationKeysSummary` → conductores con vehículo:
```js
maxUnits: maxDrivers,                   // literalmente el límite de conductores
activeUnits: activeDrivers.filter((entry) => entry.vehicleId).length,
```
**Impacto:** `maxUnits: maxDrivers` es una asignación cruzada explícita: el resumen de llaves reporta un límite de *unidades* que en realidad es el de *conductores*. Dos pantallas del portal que lean "unidades activas" de endpoints distintos mostrarán cifras distintas para el mismo concepto, sin que ningún tipo lo detecte (ambos son `number`).
**Roadmap:** FASE A

---

## 🟣 Congruencia de Datos

### F-04. `VehicleStatus` tipado en `ventas`, `string` en `mobile`, sin enum en el backend
**Archivo:** `backend/src/data/models.js:221` · `ventas/src/types/app.ts:86` · `mobile/src/types/app.ts:631`
**Evidencia:** El backend no restringe el valor:
```js
status: { type: String, required: true },   // vehicleSchema — sin enum
```
`ventas` declara tres valores: `export type VehicleStatus = 'available' | 'assigned' | 'maintenance';`
`mobile` no declara ninguno: `status: string;`
Pero los valores que el backend realmente escribe son **siete**: `available`, `assigned` (`mongo-store.js:661,665,705,1479`), `online`, `patrolling`, `on-route`, `maintenance` (`seedData.js:36,51,66,140`), más `archived`/`deleted`/`retired` reservados en `operational-unit-snapshot.js:20`.
**Impacto:** El enum de `ventas` es falso: excluye `online`, `patrolling` y `on-route`, que son precisamente los estados de unidades en operación. `Vehicle.status` está tipado `VehicleStatus | string` (`app.ts:159`), así que la unión se degrada a `string` y el enum no protege nada — sólo engaña al lector.
**Roadmap:** FASE A

### F-05. `ventas` colapsa todo estado ≠ `maintenance` a "Disponible"
**Archivo:** `ventas/features/portal/screens/portal-units-screen.tsx:36,237`
**Evidencia:**
```ts
const editableStatuses: UnitEditor['status'][] = ['available', 'maintenance'];
...
{status === 'maintenance' ? 'Mantenimiento' : 'Disponible'}
```
**Impacto:** Consecuencia directa de F-04. Una unidad con `status: 'on-route'` o `'patrolling'` se muestra al administrador como **"Disponible"** mientras está en ruta con pasajeros. Además, guardar desde ese editor escribe `available`, **sobrescribiendo silenciosamente** el estado operativo real de la unidad.
**Roadmap:** FASE A

### F-06. `ActivationKeyStatus` tipado en `mobile`, `string` suelto en `ventas`
**Archivo:** `backend/src/data/models.js:792-797` · `mobile/src/types/app.ts:134,152` · `ventas/src/types/app.ts:433`
**Evidencia:** El backend **sí** define enum aquí:
```js
status: { type: String, enum: ["available", "used", "expired", "revoked"], default: "available" }
```
`mobile`: `export type ActivationKeyStatus = 'available' | 'used' | 'expired' | 'revoked';`
`ventas`: `status: string;`
**Impacto:** Es el único enum del dominio comercial que el backend garantiza, y el proyecto dueño del ciclo de venta (`ventas`) es el que no lo aprovecha. Un typo en una comparación de estado de llave no se detecta en compilación. Fix trivial y sin riesgo: copiar el tipo.
**Roadmap:** FASE A

### F-07. Tres vocabularios paralelos para "estado de unidad", ninguno reconciliado en los tipos
**Archivo:** `backend/src/domain/operational-unit-snapshot.js:213-227` · `shared/operational-contract/types.ts:13-17` · ambos `app.ts`
**Evidencia:** El backend traduce el estado crudo a un vocabulario canónico distinto:
```js
function buildStatus({ vehicle, activeSession }) {
  if (raw === "maintenance") return "maintenance";
  if (raw === "offline") return "offline";
  if (sessionStatus === "RUNNING") return "active";
  if (ACTIVE_VEHICLE_STATUSES.has(raw)) return "active";
  return "idle";
}
```
Resultan tres vocabularios: **(a)** crudo `vehicle.status` (7+ valores libres), **(b)** `OperationalUnitStatus = 'active'|'idle'|'maintenance'|'offline'` + `OperationalState = 'on_route'|'stopped'|'no_route'|'maintenance'`, **(c)** `RouteSessionStatus` en MAYÚSCULAS.
**Impacto:** Ni `ventas/src/types/app.ts` ni `mobile/src/types/app.ts` declaran (b) — el vocabulario que el backend considera canónico. Cada frontend reinterpreta (a) por su cuenta, que es exactamente lo que el módulo canónico prohíbe en su encabezado ("Mobile y Portal consumen el resultado sin reinterpretarlo").
**Roadmap:** FASE B

### F-08. `User.phone`/`shift`/`status`/`avatar`: requeridos en `mobile`, opcionales en `ventas`
**Archivo:** `backend/src/data/models.js:185-188` · `mobile/src/types/app.ts:101-106` · `ventas/src/types/app.ts:76-81`
**Evidencia:** El backend siempre los emite con default y `sanitizeUser` no los elimina:
```js
phone: { type: String, default: "Pendiente" },
shift: { type: String, default: "Pendiente asignacion" },
status: { type: String, default: "offline" },
avatar: { type: String, default: "" },
```
`mobile`: `phone: string; shift: string; status: string; avatar: string; vehicleId: string | null;`
`ventas`: `phone?: string; shift?: string; status?: string; avatar?: string;`
**Impacto:** **`mobile` tiene razón** — el backend garantiza presencia. Pero los defaults son cadenas-rótulo (`"Pendiente"`, `"Pendiente asignacion"`), no vacíos: `ventas` nunca dispara sus fallbacks de `undefined` y termina imprimiendo la palabra "Pendiente" como si fuera un teléfono. Relacionado con RC-VENTAS-06 F-02, pero la causa es de datos, no visual.
**Roadmap:** FASE B

### F-09. `vehicle.speed` no declara unidad; el umbral de "detenido" está duplicado en dos unidades distintas
**Archivo:** `backend/src/data/seedData.js:103` · `backend/src/domain/operational-unit-snapshot.js:35,242-243` · `ventas/features/portal/screens/portal-dashboard-screen.tsx:83-88,301,430`
**Evidencia:** La unidad sólo consta en un comentario del seed: `speed: 10, // 36 km/h en m/s`. El backend define su umbral en km/h (`const STOPPED_SPEED_KMH = 3;`), y `ventas` mantiene el suyo en m/s:
```ts
Number(vehicle.speed) <= 0.8
```
**Impacto:** `0.8 m/s ≈ 2.88 km/h` coincide *hoy* con los 3 km/h del backend por casualidad. Son dos constantes independientes, en unidades distintas, sin referencia cruzada: cualquier ajuste en una desincroniza el criterio de "unidad detenida" entre portal y backend. A favor de `ventas`: su comentario en la línea 83 documenta correctamente por qué no adivina la unidad por magnitud.
**Roadmap:** FASE B

### F-10. `PortalSubscription.status` tiene vocabulario abierto por passthrough
**Archivo:** `backend/src/services/portal-account.js:34-61`
**Evidencia:** La función termina devolviendo el valor crudo del pedido:
```js
return paymentStatus || activationStatus || "pending";
```
El conjunto conocido es `inactive|cancelled|suspended|expired|past_due|active|trial|pending`, más **cualquier** `paymentStatus` que exista en el lead (p. ej. `paid_test`).
**Impacto:** Ambos frontends lo tipan `status: string`, lo cual es honesto pero inútil. Ningún consumidor puede exhaustivamente cubrir los casos, y un `paymentStatus` nuevo introducido por una pasarela se propaga a la UI sin que nadie lo note. Es el campo que decide bloqueo por plan vencido.
**Roadmap:** FASE B

### F-11. `monthlyPrice` y `price` conviven como dos nombres del mismo dinero
**Archivo:** `ventas/src/types/app.ts:374,412` · `ventas/features/commercial/types.ts:89` · `ventas/features/portal/screens/portal-plan-screen.tsx:45,199,210`
**Evidencia:** `CommercialPlan` usa `price`; `PortalSubscription` usa `monthlyPrice`; el tipo comercial interno vuelve a usar `monthlyPrice`. En una sola pantalla conviven ambos:
```ts
const monthlyPrice = subscription.monthlyPrice ?? currentPlan?.price ?? 0;
...
price={currentPlan.monthlyPrice}
```
**Impacto:** `currentPlan` se lee con `.price` en una línea y con `.monthlyPrice` en otra. Funciona sólo porque `commercial-engine.ts:56` reconcilia (`monthlyPrice: Number(subscription?.monthlyPrice ?? plan?.price ?? 0)`). Un refactor que toque cualquiera de los dos deja el otro en `undefined` → `$0` mostrado como precio.
**Roadmap:** FASE B

### F-12. `RouteSession`: `mobile` declara 12 campos que `ventas` desconoce
**Archivo:** `backend/src/data/models.js:268-304` · `mobile/src/types/app.ts:780-791` · `ventas/src/types/app.ts:248-279`
**Evidencia:** El backend persiste y `mobile` declara — pero `ventas` no: `startedOdometer`, `finishedOdometer`, `startBattery`, `endBattery`, `startGpsAccuracy`, `endGpsAccuracy`, `finishReason`, `deviceInfo`, `assignedBy`, `startedBy`, `finishedBy`, `updatedBy`.
**Impacto:** Datos de auditoría de jornada (quién asignó, quién finalizó, por qué) llegan al portal en el JSON pero son invisibles para el desarrollador que trabaja en `ventas`, porque el tipo no los menciona. `RouteSessionComputedMetrics.pausedTime` (`mobile:819`) falta igualmente en `ventas`.
**Roadmap:** FASE B

### F-13. `RouteEvent` y `CheckpointVisit`: `organizationId` y `createdAt` divergen en opcionalidad
**Archivo:** `backend/src/data/models.js:345,372,382,391` · `ventas/src/types/app.ts:329,339,344,352` · `mobile/src/types/app.ts:863-887`
**Evidencia:** El backend siempre los escribe (`organizationId` con default `""`, `createdAt` con `default: Date.now`). `ventas` declara `organizationId?: string; createdAt?: string;`. `mobile` **omite `organizationId`** por completo y declara `createdAt: string` requerido.
**Impacto:** Tres opiniones distintas sobre los mismos dos campos. `mobile` no puede filtrar eventos por organización sin castear; `ventas` trata como opcional algo garantizado.
**Roadmap:** FASE B

### F-14. `Incident`: relaciones tipadas distinto y `locationState` ausente en `ventas`
**Archivo:** `backend/src/data/models.js:404-412` · `ventas/src/types/app.ts:551-572` · `mobile/src/types/app.ts:671-692`
**Evidencia:** `ventas` usa formas ad-hoc reducidas:
```ts
vehicle?: { id: string; code: string } | null;
reporter?: { id: string; name: string } | null;
```
`mobile` usa las entidades completas (`vehicle?: Vehicle | null; reporter?: User | null;`). Además el backend define `locationState: { enum: ["fresh","stale","missing"] }` y `locationSourceTimestamp`, que `mobile` declara (`:685-686`) y **`ventas` no**.
**Impacto:** El portal no puede distinguir un incidente con GPS fresco de uno con ubicación obsoleta — el dato llega y se descarta por no estar tipado. Nota: `severity` y `status` **no** tienen enum en el backend (`default: "medium"` / `"open"`), aunque ambos frontends los tipan como uniones cerradas idénticas; ahí la divergencia es frontend-vs-backend, no frontend-vs-frontend.
**Roadmap:** FASE B

### F-15. `AssignedRoute` y `NavigationRouteOption`: opcionalidad invertida entre los dos frontends
**Archivo:** `backend/src/data/models.js:27-37,50-68` · `ventas/src/types/app.ts:99-118` · `mobile/src/types/app.ts:384-417`
**Evidencia:** El backend marca `destination`, `assignedBy` y `route` como `required: true`, y el resto con defaults. `mobile` refleja eso (`destination: GeoPoint; assignedBy: string; route: NavigationRouteOption;`). `ventas` declara **todo opcional**, incluidos los requeridos, y además **omite `assignedBy`, `routeId`, `routeName`, `routeCode`, `routeColor`**. En `NavigationRouteOption` la inversión es total: `mobile` todo requerido, `ventas` todo opcional + `trafficLevel` degradado a `| string`.
**Impacto:** `ventas` fuerza guardas nulas innecesarias sobre campos garantizados y pierde `assignedBy` (quién asignó la ruta) — dato de auditoría que sí viaja en el JSON.
**Roadmap:** FASE B

### F-16. `CompanyProfile` / `PaymentProfile`: requeridos en `mobile`, opcionales en `ventas`
**Archivo:** `backend/src/data/models.js:98-124,197-198` · `ventas/src/types/app.ts:15-31` · `mobile/src/types/app.ts:38-54`
**Evidencia:** El backend garantiza el objeto (`default: () => ({})`) y cada campo con `default: ""`. `mobile` declara todos los campos requeridos; `ventas` todos opcionales.
**Impacto:** Ambos son defendibles pero incompatibles: el objeto siempre existe, y sus campos siempre son `string` (posiblemente vacío) — nunca `undefined`. `ventas` escribirá `?? 'valor'` que nunca se dispara, y mostrará cadenas vacías donde esperaba un fallback. Afecta datos de facturación.
**Roadmap:** FASE B

### F-17. `etaMinutes` persiste en el schema aunque el contrato canónico lo prohíbe
**Archivo:** `backend/src/domain/operational-unit-snapshot.js:9` vs `backend/src/data/models.js:224`
**Evidencia:** El módulo canónico declara como regla dura:
```js
*  - `route.etaAt` es el unico ETA del sistema. No existe `etaMinutes`.
```
Pero el schema lo mantiene (`etaMinutes: { type: Number, default: null }`), ambos `app.ts` lo declaran, y `ventas` lo renderiza:
```ts
if (typeof vehicle.etaMinutes === 'number') return `${Math.max(0, Math.round(vehicle.etaMinutes))} min`;
```
**Impacto:** Dos ETA coexisten con precedencia indefinida: `etaAt` (instante absoluto, recalculado) y `etaMinutes` (duración relativa, sin marca de tiempo — se degrada silenciosamente conforme envejece el registro). Requiere plan de migración, no borrado.
**Roadmap:** FASE C

### F-18. `CommercialPlan` no lleva moneda; "MXN" se inyecta después
**Archivo:** `backend/src/config/commercial-plans.js:19-21` · `backend/src/services/portal-account.js:89,122` · ambos `app.ts`
**Evidencia:** El catálogo define importes sin moneda (`units: 2, price: 149, pricePerVehicle: 74.5`) y el servicio la fija a mano: `currency: "MXN"` (en las dos ramas de `buildSubscription`).
**Impacto:** **Aclaración sobre la pregunta del ticket: los importes están en pesos completos, no en centavos** — `149`, `209`, `299`, `449`, `749`, con decimales reales en `pricePerVehicle` (`74.5`, `52.3`, `56.1`). Esto es consistente en los tres proyectos y `formatCurrency` lo trata correctamente. El riesgo no es la unidad actual sino que no está declarada en ninguna parte: nada impide que una pasarela futura (que sí opera en centavos) escriba `14900` en el mismo campo. `pricePerVehicle` como float además arrastra error de redondeo al multiplicar por unidades.
**Roadmap:** FASE C

### F-19. `NotificationItem` no existe en `ventas`
**Archivo:** `backend/src/data/models.js:567-589` · `mobile/src/types/app.ts:657-669` · `ventas/src/types/app.ts` (ausente)
**Evidencia:** El backend expone `/notifications` con `title`, `body`, `level`, `category` (`default: "system"`), `targetRoles`, `targetUserIds`, `data`, `readBy`. `mobile` lo declara. Búsqueda de `NotificationItem|notification` en `ventas/src`: **cero coincidencias**.
**Impacto:** El portal no consume notificaciones en absoluto — no es una divergencia de forma sino una superficie ausente. Se confirma, según lo pedido, que **no hay conflicto de forma con el trabajo previo de notificaciones de chat**: sólo `mobile` consume esta estructura hoy, así que no existe una segunda definición que pueda derivar. La congruencia hay que garantizarla *antes* de que `ventas` la implemente, no después.
**Roadmap:** FASE C

### F-20. `DocumentItem.owner` es el único punto divergente de un módulo por lo demás sano
**Archivo:** `backend/src/data/models.js:535-556` · `ventas/src/types/app.ts:594` · `mobile/src/types/app.ts:914`
**Evidencia:** `ventas`: `owner?: { id: string; name?: string; code?: string } | null;` · `mobile`: `owner?: User | Vehicle | null;`
**Impacto:** Bajo. Se documenta para cerrar el módulo 6: el resto de `DocumentItem` **sí es congruente** en los tres proyectos — `expiresAt` es `Date` requerido en el backend y `string` requerido en ambos frontends (ISO), `ownerType` tiene enum real (`["driver","vehicle"]`) y ambos lo tipan igual, y `reviewStatus` usa la misma unión `'approved'|'rejected'|'pending_review'|string` con el mismo default del backend. Es el módulo mejor alineado de los ocho.
**Roadmap:** FASE C

---

## 🟢 Coherencia

### F-21. El contrato compartido existe y nadie lo importa
**Archivo:** `shared/operational-contract/types.ts:1-8` · `backend/src/domain/operational-unit-snapshot.js`
**Evidencia:** El propio archivo declara su intención:
```ts
 * Fuente de verdad: backend/src/domain/operational-unit-snapshot.js
 * Este archivo es la contraparte tipada. Si cambia uno, cambia el otro.
```
Ni `ventas/src/types/app.ts` ni `mobile/src/types/app.ts` lo importan; ambos redefinen `GeoPoint`, `ActiveRouteProgress` y estados de unidad por su cuenta.
**Impacto:** Es la mejor noticia de esta auditoría: la infraestructura para una verdad única ya está construida y probada (`backend/test/operational-unit-snapshot.test.js`). El costo de F-04, F-07 y F-09 es de *adopción*, no de diseño. Este hallazgo es el habilitador de la FASE B completa.
**Roadmap:** FASE C

### F-22. No existe una tabla única de traducción de `RouteSessionStatus`
**Archivo:** `ventas/features/portal/screens/portal-dashboard-screen.tsx:249-252` · `mobile/src/screens/checklist-screen.tsx:193-197,2331`
**Evidencia:** Se buscó `statusLabel|STATUS_LABEL|VehicleStatus` en `ventas/src`: el único resultado es la definición de tipo. No hay módulo de labels. `ventas` improvisa en `getJourneyState()` con fallback al valor crudo; `mobile` improvisa el suyo (`if (status === 'active') return 'En ruta'` … `return 'Disponible'`).
**Impacto:** Confirma y explica la causa de RC-VENTAS-06 F-08 (mezcla español/inglés). Aquella auditoría lo trató como bug de UI; la causa raíz es de datos: **no hay tabla que unificar porque no hay tabla** — cada pantalla traduce ad-hoc y por eso los fallbacks caen al enum crudo en inglés. Un único mapa exportado desde `shared/` cierra F-22 y RC-VENTAS-06 F-08 a la vez.
**Roadmap:** FASE B

---

## ⚫ Refactorización Futura

### F-23. Dos `app.ts` de ~600 y ~1050 líneas sin relación declarada
**Archivo:** `ventas/src/types/app.ts` (596 líneas) · `mobile/src/types/app.ts` (1054 líneas)
**Evidencia:** 20 de los 24 hallazgos de este reporte son instancias del mismo defecto estructural: dos copias del contrato que derivan sin que nada las compare.
**Impacto:** El diferencial crece con cada cambio de backend. Destino natural: mover los tipos compartidos a `shared/` (ya existe como workspace) y dejar en cada `app.ts` sólo lo específico de esa superficie.
**Roadmap:** FASE D

### F-24. Sin validación en runtime en la frontera HTTP
**Evidencia:** `ventas/src/lib/api.ts` y `mobile/src/api/client.ts` castean la respuesta al tipo esperado sin verificarla. No hay Zod ni validador equivalente en ninguno de los dos.
**Impacto:** Es la razón por la que F-01 (m/s vs km/h) y F-04 (enum falso) pueden existir sin fallar nunca: el tipo es una afirmación no verificada. Un esquema en la frontera convierte estas derivas en errores detectables. Sí hay congruencia en lo básico: ambos clientes usan `Authorization: Bearer <token>` y el mismo sobre `{ ok: true, ... }` con payload plano — **módulo 1 (Auth) resultó congruente**, sin hallazgos.
**Roadmap:** FASE D

---

## Estado por módulo

| # | Módulo | Hallazgos | Veredicto |
|---|--------|-----------|-----------|
| 1 | Auth / sesión | — | ✅ Congruente (`Bearer`, sobre `{ok, data}` plano, ISO) |
| 2 | Usuarios y roles | F-08, F-16 | 🟠 `Role`/`AccountType`/`UserAccountStatus` idénticos; opcionalidad divergente |
| 3 | Vehículos / unidades | F-04, F-05, F-07 | 🔴 Enum falso en `ventas`; sobrescritura silenciosa de estado |
| 4 | Rutas y sesiones | F-01, F-12, F-13, F-22 | 🔴 Bug de unidad confirmado; enums MAYÚSCULAS sí congruentes |
| 5 | Incidentes | F-14 | 🟠 Enums congruentes entre frontends; sin enum en backend |
| 6 | Documentos | F-20 | ✅ El mejor alineado; sólo `owner` diverge |
| 7 | Notificaciones | F-19 | ⚪ Superficie ausente en `ventas`; sin conflicto con chat |
| 8 | Planes / facturación | F-02, F-03, F-10, F-11, F-18 | 🔴 Módulo más comprometido; `activeUnits` con 2 significados |

---

## Resumen de Hallazgos por Fase

| Fase | 🔴 Crit | 🟣 Datos | 🟢 Coh | ⚫ Ref | Total |
|------|---------|----------|--------|--------|-------|
| A    | 3       | 3        | 0      | 0      | 6     |
| B    | 0       | 10       | 1      | 0      | 11    |
| C    | 0       | 4        | 1      | 0      | 5     |
| D    | 0       | 0        | 0      | 2      | 2     |
| **Total** | **3** | **17** | **2** | **2** | **24** |

> **Nota:** Sin hallazgos 🟠 Incompleto, 🟡 UX/UI ni 🔵 Conversión — por diseño: este ticket es de datos/contratos y esas categorías ya están cubiertas en RC-01…RC-06. Se conservan en la clasificación para mantener el formato de los reportes anteriores.

---

## Criterio de propuesta (no implementado)

Conforme a la restricción del ticket, **no se modificó código**. Toda propuesta futura debe ser **aditiva**:

- **F-04/F-06/F-13:** ampliar uniones y añadir campos faltantes. Cero riesgo — sólo revela datos que ya viajan.
- **F-01:** corregir el render en `mobile` (`* 3.6`) o, preferible, exponer `averageSpeedKmh` como campo nuevo junto al actual y migrar consumidores. Nunca cambiar la unidad de `averageSpeed` in situ.
- **F-11/F-17:** alias, no rename. `monthlyPrice` y `price` conviven hasta que todos los consumidores migren; `etaMinutes` se deprecia sólo cuando `etaAt` esté adoptado en las dos superficies.
- **F-02/F-03:** son bugs de *semántica*, no de forma — requieren decidir qué debe contar `activeUnits` (flota registrada, no `starterFleet`) antes de tocar tipos. Es el único bloque que necesita decisión de producto, no sólo de ingeniería.
- **F-07/F-21:** adoptar `shared/operational-contract` en lugar de reinterpretar `vehicle.status`. Habilitador de la FASE B.

Orden sugerido: **F-02/F-03 (decisión de producto) → F-01 (bug visible) → F-04/F-05 (bug silencioso) → F-21 (habilitador) → resto.**
