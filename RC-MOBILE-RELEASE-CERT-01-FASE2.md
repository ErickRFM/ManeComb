# RC-MOBILE-RELEASE-CERT-01 — FASE 2: Autoridad y navegación

**Estado:** IN PROGRESS. Barrido `pantalla → store → endpoint → middleware` cerrado
para los módulos operativos; certificación física pendiente.
**Base:** `af46bfa840e19f39605f437f870be15786d7d630`

---

## 2.1 Vocabulario de autoridad — una sola tabla

`backend/src/services/enterprise-capabilities.js` es la fuente. Mobile la espeja
en `mobile-authority.ts::ENTERPRISE_CAPABILITY` con las mismas 12 cadenas.

| Permiso legado backend | Capability |
|---|---|
| `canManageUsers` | `users.manage` |
| `canManageBilling` | `billing.manage` |
| `canManageVehicles` | `vehicles.manage` |
| `canViewAnalytics` | `analytics.view` |
| `canAccessRTC` | `communication.rtc.access` |
| `canManageRoutes` | `routes.manage` |
| `canManageDocuments` | `documents.manage` |
| `canManageIncidents` | `incidents.manage` |

Esto **corrobora la refutación de F-04**: `/checklist` exige `routes.manage`, que
es exactamente el `canManageRoutes` con el que backend protege las mutaciones de
rutas y asignaciones.

---

## 2.2 Matriz pantalla → store → endpoint → middleware

| Pantalla | Petición del store | Endpoint | Guarda backend | Autoridad Mobile | Veredicto |
|---|---|---|---|---|---|
| Mapa | `getLocationsRequest` | `GET /locations/live` | `requireOperationalAccess` | `OperationalRoute` | **OK** |
| Mapa | `getOperationalUnitsRequest` | `GET /operational-units` | `requireOperationalAccess` | `OperationalRoute` | **OK** |
| Alertas | `getIncidentsRequest` | `GET /incidents` | `requireOperationalAccess` | `OperationalRoute` | **OK** |
| Alertas (cambio de estado) | `updateIncidentStatus…` | `PATCH /incidents/:id/status` | `canManageIncidents` | `canManageMobileIncidents` | **OK** |
| Directorio | `getUsersRequest` | `GET /users` | `canViewAnalytics` | `canLoadMobileDirectory` | **OK** tras F-03 |
| Chat | `getConversationsRequest` / `getChatContactsRequest` | `GET /chat/*` | `authenticate` | `OperationalRoute` | **OK** |
| Documentos (driver) | `uploadDriverDocumentRequest` | `POST /documents` | `requireOperationalAccess` | `allowedRoles: ['driver']` | **OK** — self-service deliberado |
| Documentos (admin) | portal | `GET /documents/admin` | `canManageDocuments` | `canManageMobileDocuments` | **OK** |
| Control | rutas y asignaciones | `POST/PATCH/DELETE /navigation/*` | `canManageRoutes` (en handler) | `canUseMobileControl` | **OK** tras F-09 |
| Jornada (driver) | sesiones de ruta | `/navigation/sessions/*` | `role === 'driver' \|\| canManageRoutes` | Mapa | **OK** — dos planos, uno de cada lado |
| Notificaciones | `getNotificationsRequest` | `GET /notifications` | `authenticate` | — | **OK** |
| Perfil | `observability` | `GET /ops/observability` | **410 retirado** | `role === 'admin'` | **F-10 — CORREGIDO** |

---

## 2.3 Hallazgos

### F-09 — Segunda autorización dentro de Control · CORREGIDO `b5cbe51`

**Categoría 3** (segunda autorización dentro de pantalla) y **4** (lista local de
roles donde ya existe capability).

`checklist-screen.tsx` decidía el acceso otra vez con una lista negra literal:

```
if (user.role === 'driver' || 'viewer' || 'support' || 'billing_manager' || 'dispatcher')
  return <Redirect href="/mapa" />
```

**Reproducción:** un `dispatcher` con `routes.manage` concedido por backend pasa
`ControlRoute`, monta la pantalla, y la pantalla lo devuelve a `/mapa`. Módulo
inalcanzable para un actor que el backend sí autoriza.

**Autoridad correcta existente:** `canUseMobileControl` vía `ControlRoute`, que es
el **único** punto de montaje de la pantalla (verificado: `App.tsx:437`).

**Cambio mínimo:** eliminar la lista negra. No se añadió ninguna tabla.

**Prueba de comportamiento:** `checklist-screen.test.ts` renderiza Control con un
dispatcher real y verifica que pinta su contenido. Con la lista negra, `Redirect`
(mockeado a `() => null`) dejaba el árbol vacío y el test falla.

### F-10 — Superficie retirada consumida y su 410 escondido · CORREGIDO `87b191c`

**Categoría 8** (empty/error que oculta un 4xx) y **4** (rol escrito a mano).

`backend/src/modules/ops/routes.js` monta un único `router.use` que responde
`410 platform_authority_required`: la superficie salió del plano operativo.

**Reproducción:** cualquier admin. En cada `refreshAll` —y por F-08, en cada paso
a foreground— Mobile pedía `GET /ops/observability`, gateado por un
`user.role === 'admin'` escrito a mano. `Promise.allSettled` descarta los
rechazos sin registrarlos, así que el `410` quedaba invisible y el panel "Estado
operativo" del perfil **nunca podía renderizarse**: un estado vacío escondiendo
un error de autoridad, indistinguible de "no hay datos".

**Autoridad correcta existente:** ninguna en Mobile — la observabilidad vive en la
autoridad de plataforma. El código estaba reemplazado y muerto.

**Cambio mínimo:** eliminar el request, el campo de store, el campo de caché
offline, el tipo y el panel. Se cuidó la alineación posicional entre el array de
`Promise.allSettled` y su array `keys`, que se indexan por posición.

**Regresión:** `src/api/retired-endpoints.test.js`.

---

## 2.4 Verificado sano

Para que fases posteriores no lo repitan:

- **Categoría 1** (pantalla visible, API prohibida): sin casos. Cada módulo
  operativo se monta bajo `OperationalRoute`, que exige `canAccessMobile`, y las
  mutaciones con capability ya se consultan antes de pintar la acción.
- **Categoría 2** (API permitida, UI oculta): resuelto por F-03. El único caso
  restante —un supervisor podría subir su propio documento por API sin tener UI—
  es la separación deliberada driver self-service / `documents.manage`.
- **Categoría 5** (deep links): `linking.ts` resuelve todo módulo hacia su
  componente, que va envuelto en la guarda. `/mis-documentos` está
  deliberadamente fuera del mapa público. El drawer, el router y la navegación de
  escritorio comparten `canUserAccessRoute`.
- **Categoría 6** (acción visible → 403): `AlertsScreen` consulta
  `canManageMobileIncidents` antes de ofrecer el cambio de estado;
  `users-screen` consulta `canManageMobileDocuments` antes de ofrecer el portal
  documental. `users-screen` no expone mutaciones.
- **Categoría 7** (datos para quien no debe recibirlos): `refreshAll` sólo
  condiciona `getUsersRequest` por `canLoadDirectoryUsers`; el resto son
  endpoints de alcance organizacional que backend ya acota por tenant.
- **Redirects supervivientes en pantallas**: `customer-auth-screen`,
  `map-screen.native` y `mobile-account-gate-screen` redirigen por **ausencia de
  sesión** o son la propia pantalla de bloqueo. Ninguno vuelve a decidir
  autorización.
- **`communication.rtc.access`**: declarada en ambos lados pero **no aplicada en
  ningún endpoint ni handler de socket** del backend. Mobile tampoco la aplica.
  Los dos lados son consistentes; se registra para Fase 8, no es una brecha.

---

## 2.5 Gates ejecutados

Sobre `a396c19`, en `mobile/`:

```
npx tsc --noEmit     exit 0
npx eslint .         0 errores, 32 warnings (no-void, preexistentes)
npm test             61 suites, 357 tests, todos PASS
```

---

## 2.6 Estado

```
Fase 0: CLOSED
Fase 1: CLOSED (auditoría)
Fase 2: IN PROGRESS

MOBILE_ARCHITECTURE_RECONSTRUCTED: PASS
MOBILE_NAVIGATION_CERTIFIED: BLOCKED hasta APK + Android real
MOBILE_AUTH_CERTIFIED: BLOCKED hasta APK + Android real
```

Deuda que permanece sin ampliar (sin evidencia de impacto funcional): F-05, F-06,
F-07, F-08.
