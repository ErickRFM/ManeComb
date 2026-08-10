# RC-MOBILE-RELEASE-CERT-01 — FASE 5: Documentos + Incidencias

**Estado:** auditoría de código CERRADA.
**Base:** `af46bfa840e19f39605f437f870be15786d7d630`
**Resultado inusual y deliberado:** esta fase **no produjo cambios de código**.
Ningún hallazgo resultó reproducible con impacto real. Lo verificado se registra
abajo con su evidencia para que no se re-audite.

---

# DOCUMENTOS

## 5.1 Cadena reconstruida

```
Actor
 └─ driver  -> self-service            route-registry: allowedRoles ['driver']
    otros   -> documents.manage        canManageMobileDocuments
 └─ Route guard
     /mis-documentos  driver-only, deliberadamente fuera del mapa publico de linking.ts
 └─ Pantalla  documents-screen.tsx
     └─ validatePickedDocument   PDF/JPG/PNG/WEBP, 15 MB   (espeja el backend)
 └─ POST /documents  |  POST /documents/:id/replace
     ├─ uploadLimiter                 20 / 15 min
     ├─ receiveDocumentFile           multer memoryStorage
     │   ├─ fileFilter allowlist MIME -> 415
     │   └─ limits.fileSize 15 MB     -> 413
     ├─ resolveUploadOwner            driver -> {driver, user.id} forzado
     └─ getAccessibleOwner            tenant + ownership
 └─ Store / Mongo
     ├─ reviewStatus  pending_review | approved | rejected
     ├─ expiresAt     -> vigencia derivada, nunca almacenada como estado
     └─ supersededByDocumentId        reemplazo encadenado
 └─ Archivo   GET /documents/files/:storageKey
     └─ getDocumentByStorageKey(scope) + canAccessDocument -> 404
 └─ Admin review  PATCH /documents/:id/review   requirePermission canManageDocuments
     └─ reviewChanged -> DOCUMENT_APPROVED | DOCUMENT_REJECTED
 └─ Reconciliacion Mobile   refreshAll -> getDocumentsRequest()   (no hay socket)
```

**Autoridad central:** `canAccessDocument` (`documents/routes.js:55`):

```
tenant  AND ( driver ? (ownerType driver && ownerId===user.id)
                     || (ownerType vehicle && ownerId===user.vehicleId)
                     : hasPermission(user, "canManageDocuments") )
```

## 5.2 Auditoría de los 24 casos

| # | Caso | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Driver sube sólo lo suyo | **OK** | `resolveUploadOwner` fuerza `{driver, user.id}` sin leer el body |
| 2 | Driver no sube/reemplaza de otro | **OK** | `getAccessibleOwner` rechaza salvo `ownerId===user.id` o `===user.vehicleId` |
| 3 | Driver no aprueba lo propio | **OK** | `/review` exige `canManageDocuments`; `driver` sólo tiene `canAccessRTC` |
| 4 | `documents.manage` revisa lo permitido | **OK** | `requirePermission` + `getScopedDocument` |
| 5 | Sin `documents.manage` no ve acciones admin | **OK** | `users-screen` consulta `canManageMobileDocuments` antes de ofrecer el portal |
| 6 | Deep link `/mis-documentos` driver-only | **OK** | `allowedRoles:['driver']` y ausente del `config.screens` de `linking.ts` |
| 7 | Empresarial vs personal no se mezclan | **OK** | `ownerType` driver/vehicle resuelto en backend, nunca por la UI |
| 8 | Tenant A no lee de Tenant B | **OK** | `canAccessTenantResource` dentro de `canAccessDocument`, en toda ruta |
| 9 | IDs manipulados | **OK** | `getScopedDocument` + `canAccessDocument` → **404**, no 403: no confirma existencia |
| 10 | URL de archivo no rompe aislamiento | **OK** | `/files/:storageKey` resuelve por scope y revalida `canAccessDocument` antes de servir |
| 11 | MIME inválido | **OK** | allowlist en `fileFilter` → 415; Mobile valida igual antes de subir |
| 12 | Archivo demasiado grande | **OK** | `LIMIT_FILE_SIZE` → 413 |
| 13 | Nombre/extensión manipulados | **OK** | la decisión es por `mimetype`, no por extensión; descarga con `sanitizeDownloadFileName` |
| 14 | Reemplazo | **OK** | `/replace` + `supersededByDocumentId`; `canDriverMutateDocument` limita al driver a `pending_review`/`rejected`/vencido |
| 15 | Doble submit / retry | **OK** | el reemplazo supersede en cadena; no quedan dos vigentes |
| 16 | Documento borrado con caché viva | **OK** | `refreshAll` sustituye `documents` completo desde `getDocumentsRequest()` |
| 17 | Estados sin inventar | **OK** | `getDocumentStatus` es el único derivador y la vigencia sale siempre de `expiresAt` |
| 18 | Motivo de rechazo llega al conductor | **OK** | `/review` exige `reviewNotes` si rechaza (400 si falta); la pantalla lo renderiza |
| 19 | Aprobación/rechazo repetido | **OK** | whitelist → 400; `reviewChanged` evita re-notificar |
| 20 | Expiración/fecha inválida | **OK** | `normalizeDocumentDate` + vigencia derivada |
| 21 | 4xx/5xx no se vuelven "sin documentos" | **OK** | `documents-screen` usa `getApiErrorMessage` en las cuatro operaciones |
| 22 | Realtime introduce documento ajeno | **OK por construcción** | **no existe ningún handler `document:*` en el socket**; los documentos sólo se reconcilian por REST |
| 23 | Caché tras logout/login de otra empresa | **OK** | `cachedIdentityChanged` compara `id` y `organizationId` y llama `clearTenantCache` |
| 24 | Frontend no decide por listas de roles | **OK** | cero `role ===` en `src/screens/documents/` |

---

# INCIDENCIAS

## 5.3 Cadena reconstruida

```
Crear   POST /incidents        authenticate + requireOperationalAccess
 ├─ effectiveVehicleId = body.vehicleId || user.vehicleId
 ├─ canAccessTenantResource(vehicle)
 ├─ driver && user.vehicleId !== effectiveVehicleId   -> 404
 └─ createIncident(req.user, ...)     reporterId/organizationId los pone backend

Listar  GET /incidents -> listIncidents(user)
 └─ org AND ( role !== driver || reporterId===user.id || vehicleId===user.vehicleId )

Estado  PATCH /incidents/:id/status   requirePermission canManageIncidents
 ├─ whitelist open | in_progress | resolved   -> 400
 └─ busqueda dentro de listIncidents(req.user) -> 404 si no le corresponde

Realtime
 ├─ incident:created -> org:{org}:role:{rol con canManageIncidents} + platform:admin
 ├─ incident:updated -> idem + user:{reporterId}
 └─ incident:sos     -> idem manager roles
```

## 5.4 Auditoría de los 22 casos

| # | Caso | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Driver reporta en su alcance | **OK** | `effectiveVehicleId` cae a `user.vehicleId` |
| 2 | No reporta con unidad ajena | **OK** | `driver && user.vehicleId !== effectiveVehicleId` → 404 |
| 3 | Admin/supervisor/dispatcher ven según autoridad | **OK** | `listIncidents` da org completo a no-drivers; driver acotado |
| 4 | `incidents.manage` gobierna lo administrativo | **OK** | `requirePermission("canManageIncidents")` en `/status` |
| 5 | Crear no concede resolver | **OK** | crear es `requireOperationalAccess`; resolver exige la capability |
| 6 | Autor no escala por payload | **OK** | `reporterId` y `organizationId` los fija `createIncident` desde `req.user` |
| 7 | Cross-tenant por ID | **OK** | la búsqueda del PATCH ocurre dentro de `listIncidents(req.user)` → 404 |
| 8 | Incidencia sin unidad | **OK** | `vehicleId` es opcional; si viene, se valida |
| 9 | Durante jornada activa | **OK** | independiente de la jornada; no la altera |
| 10 | Fuera de jornada | **OK** | idem |
| 11 | Doble submit / retry | **PARCIAL** | sin clave de idempotencia: dos envíos crean dos incidencias. Ver deuda F-18 |
| 12 | Resolver dos veces | **OK** | segunda llamada re-aplica `resolved`; resultado estable |
| 13 | Reabrir | **OK** | `resolved → open` está dentro de la whitelist: la transición **existe** y es deliberada |
| 14 | Estado inválido manual | **OK** | whitelist → 400 |
| 15 | Realtime sólo a audiencia autorizada | **OK** | `getRolesWithPermission("canManageIncidents")`, por capability y no por lista escrita a mano |
| 16 | Realtime no sustituye REST | **OK** | `refreshAll` repone `incidents` desde `getIncidentsRequest()` |
| 17 | Mobile adopta incidencia ajena | **OK** | ver 5.5 |
| 18 | Caché stale tras resolución | **OK** | `upsertIncident` + `applyIncidentToMapData` en la misma transacción de store |
| 19 | Adjuntos/evidencias | **N/A** | `media` viaja como metadato; no hay endpoint de subida propio de incidencias |
| 20 | 403/409 escondidos como empty state | **OK** | `updateIncidentStatus` usa `getReadableErrorMessage` en la rama no-red |
| 21 | Notificación al actor correcto | **OK** | `deliverOperationalNotification` + `user:{reporterId}` en `incident:updated` |
| 22 | Historial con autor/timestamps/resolución | **OK** | `reporterId`, `recordAppEvent("incident_status_updated")` |

## 5.5 Punto 17 — verificado, no es hallazgo

`socket.on('incident:created'|'incident:updated')` adopta el payload sin filtrar,
que es la misma forma que produjo **F-15** en la jornada. Aquí **no** es defecto,
y la razón importa:

- `driver`/`conductor` tienen únicamente `canAccessRTC`, así que **no** pertenecen
  a las salas `org:{org}:role:{rol con canManageIncidents}`. Un conductor sólo
  recibe `incident:updated` de las incidencias que **él reportó**, vía
  `user:{reporterId}`.
- Para roles administrativos, la audiencia realtime es **más estrecha** que lo que
  REST ya les entrega (`listIncidents` devuelve el organizacional completo).

En ambas direcciones el socket es un subconjunto de la autoridad REST, así que no
puede introducir nada que el actor no pudiera leer. Lo contrario de F-15, donde
`activeRouteSession` significaba "la de MI unidad" y realtime lo desbordaba.

---

## 5.6 Cierre

```
DOCUMENTS_CODE_CERTIFIED:   PASS
DOCUMENT_OWNERSHIP:         PASS
DOCUMENT_REVIEW_AUTHORITY:  PASS
INCIDENTS_CODE_CERTIFIED:   PASS
INCIDENT_OWNERSHIP:         PASS
INCIDENT_REALTIME_SCOPE:    PASS
TENANT_ISOLATION:           PASS
```

**Gates**, sobre `8aed4ea` (sin cambios de código en esta fase):

```
mobile   npx tsc --noEmit    exit 0
mobile   npx eslint .        0 errores, 32 warnings (no-void, preexistentes)
mobile   npm test            63 suites, 365 tests, PASS
backend  npm test            suite completa, exit 0 (verificada en F-13)
```

**PHYSICAL_TESTS_REQUIRED:**

- subir documento real desde cámara y desde archivos, con PDF y con imagen;
- subir un archivo > 15 MB y confirmar que el 413 se ve como mensaje, no como
  lista vacía;
- subir un tipo no permitido (por ejemplo `.docx`) y confirmar el 415;
- reemplazar un documento aprobado desde el teléfono y verificar que el driver
  **no** puede;
- rechazar desde Portal con motivo y confirmar que el motivo aparece en el móvil;
- abrir la URL de un archivo con sesión de otra empresa y confirmar 404;
- logout y login con una empresa distinta en el mismo dispositivo, verificando que
  no sobrevive ningún documento en caché;
- reportar incidencia con y sin unidad asignada;
- reportar en modo avión y verificar la cola de sincronización;
- resolver una incidencia desde Portal y ver la actualización en el móvil sin
  refrescar;
- pulsar dos veces *Reportar* con red lenta (relevante para F-18).

**DEBT:**

- **F-18 (nueva, no bloqueante):** `POST /incidents` no tiene clave de
  idempotencia. Un doble envío con red lenta crea dos incidencias. Distinto del
  caso GPS (`packetId`) y del de jornada (`activeKey`), que sí la tienen. No se
  abre en esta fase: requiere decidir la clave con backend y no hay reproducción
  causal registrada todavía.
- Sin abrir por instrucción: **F-05, F-06, F-07, F-08, F-16, F-17**.
- En carril separado con Codex: **F-12**.
