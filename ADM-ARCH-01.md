# ADM-ARCH-01 — Auditoría estricta para el Admin Global de ManeComb

Revisión: ADM-ARCH-01-R2
Cierre documental: R2.1

## 1. Resumen ejecutivo

Se audita el repositorio ManeComb (`main@4677ad4`) para determinar la viabilidad arquitectónica de un **Admin Global de ManeComb**: una interfaz administrativa interna para el propietario y personal autorizado de la plataforma, con capacidad de consulta global sobre empresas, usuarios, suscripciones, pagos, sistema y auditoría.

**Hallazgo principal**: El proyecto ya cuenta con infraestructura para administradores de plataforma. Existe un mecanismo `canAccessAllTenants()` (`backend/src/middlewares/access-control.js:63`) que detecta usuarios con `role === "admin" && accountType !== "company_owner"`. Estos usuarios ya pueden consultar datos entre empresas. Sin embargo, no existe una interfaz de administración dedicada, no hay autenticación separada para personal interno, no hay colección independiente de usuarios de plataforma, y no hay auditoría de acciones administrativas.

**Veredicto**: El proyecto está listo para iniciar ADM-SEC-01. La arquitectura existente permite agregar el Admin Global sin duplicar datos ni debilitar la protección tenant, siempre que se sigan las recomendaciones documentadas. La deuda técnica identificada (gaps en tenant isolation, falta de colección de usuarios internos, ausencia de auditoría administrativa) es manejable y no bloqueante.

---

## 2. Alcance de la auditoría

- **Cobertura**: backend (`backend/`), frontend web (`ventas/`), contratos compartidos (`shared/`), documentación de fases anteriores.
- **Excluido**: aplicación móvil (`mobile/`), service de comunicación (`communication-service/`), infraestructura (`infra/`), configuración Docker.
- **Tipo**: solo lectura. No se modificó ningún archivo.
- **Perímetro**: autenticación, autorización, aislamiento tenant, modelos de datos, repositorios, servicios, rutas API, componentes frontend, estado del store, diseño del router.

---

## 3. Restricciones respetadas

- No se modificó ningún archivo existente.
- No se modificó lógica operativa, GPS, Mapbox, rutas, chat, radio, Socket.IO, checklist, incidencias, documentos, portal empresarial, landing, registro, autenticación empresarial, permisos, planes, órdenes, suscripciones, pagos, webhooks, idempotencia, health, readiness, observabilidad, contratos, repositorios, servicios, pruebas, dependencias, configuración, Docker, variables de entorno.
- No se implementó ninguna funcionalidad.
- No se crearon datos simulados.
- Únicos archivos nuevos: `ADM-ARCH-01.md` (esta auditoría) y previamente `RC-MOBILE-UI-AUDIT-01.md` (ajeno a esta fase).

---

## 4. Estado de Git

| Campo | Valor |
|---|---|
| Rama | `main` |
| Último commit | `4677ad47940c10b4389f0f4b0c35457d6b894732` |
| Mensaje | `test(payments): document Mercado Pago sandbox validation` |
| Fecha | 2026-07-22 19:16:34 -0600 |
| Estado del árbol | Sin cambios staged. Un archivo sin rastrear: `ADM-ARCH-01.md` |
| Remoto | `origin https://github.com/ErickRFM/ManeComb.git` |

Salida literal de `git status --short --untracked-files=all`:
```
?? ADM-ARCH-01.md
?? RC-MOBILE-UI-AUDIT-01.md
```

Salida literal de `git status`:
```
On branch main
Your branch is ahead of 'origin/main' by 1 commit.
  (use "git push" to publish your local commits)

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	ADM-ARCH-01.md
	RC-MOBILE-UI-AUDIT-01.md

nothing added to commit but untracked files present (use "git add" to track)
```

Salida literal de `git diff --check`:
```
(sin salida — sin errores de espacio ni conflictos)
```

El archivo `ADM-ARCH-01.md` vive en `C:\proyectos\combis-app\ADM-ARCH-01.md` (raíz del repositorio). No está ignorado por `.gitignore`. Aparece como no rastreado porque no se ha ejecutado `git add`. El árbol no está "limpio" en el sentido estricto (hay archivos sin rastrear), pero no hay modificaciones sobre archivos existentes ni cambios staged. `RC-MOBILE-UI-AUDIT-01.md` es un archivo no relacionado, generado por otro proceso.

---

## 5. Arquitectura actual

### 5.1 Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js, Express 5, Mongoose 9, MongoDB, Socket.IO 4, Redis |
| Frontend web | React 19, react-native-web, Vite 7, Zustand 5, Axios |
| Autenticación | JWT (jsonwebtoken) + refresh tokens rotativos |
| Tiempo real | Socket.IO (presencia, ubicación, chat, radio, WebRTC) |
| Pagos | Mercado Pago (checkout API, webhooks IPN) |
| Mapas | Mapbox GL |
| Monitoreo | Endpoints /health, /ready, /metrics + telemetry |

### 5.2 Estructura del monorepo

```
combis-app/
├── backend/             # API Express 5 (MongoDB + Redis)
│   ├── src/
│   │   ├── app.js       # Router principal
│   │   ├── server.js    # Entry point
│   │   ├── data/        # Stores (mongo-store.js, store.js)
│   │   ├── middlewares/  # authenticate, access-control, require-admin, portal-access
│   │   ├── modules/     # 20 módulos funcionales
│   │   ├── services/    # 44 servicios
│   │   ├── config/      # commercial-plans.js
│   │   └── sockets/     # Socket.IO (1270 líneas)
│   └── test/            # 34 archivos de prueba
├── ventas/              # Frontend web (Vite + React)
│   ├── src/
│   │   ├── App.tsx      # Router + lazy screens
│   │   ├── lib/api.ts   # Cliente Axios
│   │   ├── store/       # use-app-store.ts (Zustand)
│   │   └── types/       # app.ts (626 líneas)
│   ├── features/
│   │   └── portal/      # Portal empresarial completo
│   └── screens/         # Sales, auth, checkout
├── shared/
│   └── operational-contract/  # Tipos y selectores compartidos
├── mobile/              # React Native (drivers/supervisores)
├── communication-service/ # BullMQ + Resend
└── docs/                # Documentación
```

---

## 6. Mapa de la landing de ventas

### EXISTENTE

| Ruta | Archivo | Descripción |
|---|---|---|
| `/`, `/ventas` | `ventas/screens/sales-screen.tsx` (514 lns) | Landing: hero, funcionalidades, planes, proceso, FAQ, footer |
| `/login`, `/ventas/login` | `ventas/screens/sales-auth-screen.tsx` (267 lns) | Login con email/phone + password |
| `/registro`, `/ventas/registro` | `ventas/screens/sales-auth-screen.tsx` | Registro con nombre, empresa, identidad, password |
| `/reset-password` | `ventas/screens/password-reset-screen.tsx` | Recuperación de contraseña |
| `/terminos`, `/privacidad` | `ventas/screens/static-page.tsx` | Páginas estáticas |
| `/ventas/pago` | `ventas/screens/plan-checkout-screen.tsx` | Checkout con Mercado Pago |

La landing es pública, sin autenticación. Usa `usePublicCommercialFlow` para cargar planes. El componente `SiteHeader` tiene scroll-compact behavior y `SiteFooter` con enlaces institucionales.

---

## 7. Mapa del Portal empresarial

### EXISTENTE

| Ruta | Permiso | Archivo | Descripción |
|---|---|---|---|
| `/portal` | portal access | `features/portal/screens/portal-dashboard-screen.tsx` (626 lns) | Dashboard operativo con mapa, KPIs, historial |
| `/portal/usuarios` | users | `features/portal/screens/portal-users-screen.tsx` | Gestión de usuarios (conductores/admin) |
| `/portal/unidades` | vehicles | `features/portal/screens/portal-units-screen.tsx` | Gestión de unidades |
| `/portal/rutas` | routes | `features/portal/screens/portal-routes-screen.tsx` | Gestión de rutas |
| `/portal/plan` | billing | `features/portal/screens/portal-plan-screen.tsx` | Plan y suscripción actual |
| `/portal/facturacion` | billing | `features/portal/screens/portal-billing-screen.tsx` | Facturas |
| `/portal/pagos` | billing | `features/portal/screens/portal-payments-screen.tsx` | Pagos |
| `/portal/perfil` | portal access | `features/portal/screens/portal-profile-screen.tsx` | Perfil, empresa, seguridad, soporte |
| `/portal/onboarding` | portal access | `features/portal/screens/portal-onboarding-screen.tsx` | Wizard de activación |
| `/portal/documentos` | billing | `features/portal/screens/portal-documents-screen.tsx` | Revisión de documentos |
| `/portal/incidencias` | billing | `features/portal/screens/portal-incidents-screen.tsx` | Gestión de incidencias |
| `/portal/app-movil` | portal access | `features/portal/screens/portal-app-movil-screen.tsx` | Admin de la app móvil |

Todas las rutas usan `PortalLayout` como shell, que aplica guards de autenticación y autorización. El layout filtra navegación por permisos. Las pantallas son lazy-loaded con `React.lazy()`.

---

## 8. Mapa de la aplicación operativa (relacionada)

La aplicación operativa vive en `mobile/` (React Native 0.81.5). Desde la perspectiva del backend, comparte las mismas API endpoints que el portal y la landing. Los datos operativos (ubicaciones, sesiones de ruta, eventos) se almacenan en las mismas colecciones de MongoDB.

**No se exploró `mobile/`** porque el Admin Global no debe acoplarse con la app operativa. Sin embargo, las consultas administrativas sobre unidades, conductores y estados operativos usarán las mismas fuentes de datos.

---

## 9. Mapa del backend

### EXISTENTE

```
backend/src/
├── app.js               # 257 líneas - monta 20 módulos + health + metrics
├── server.js            # Entry point - MongoDB, Redis, Socket.IO
├── config/
│   └── commercial-plans.js  # 5 planes comerciales
├── data/
│   ├── store.js         # Store embebido (in-memory)
│   └── mongo-store.js   # Store MongoDB (3727 líneas)
├── middlewares/
│   ├── authenticate.js          # JWT verification + user resolution
│   ├── access-control.js        # Tenant scoping + RBAC (165 líneas)
│   ├── require-admin.js         # Platform admin guard
│   ├── portal-access.js         # Company owner portal guard
│   ├── operational-access.js    # Subscription gating
│   └── enterprise-rate-limit.js # Redis sliding window
├── modules/
│   ├── auth/             # Login, register, refresh, session
│   ├── account/          # Subscription, invoices, sessions
│   ├── admin/            # Activation keys (único módulo "admin")
│   ├── commercial/       # Plans, checkout, webhooks MP
│   ├── portal/           # Overview, onboarding
│   ├── dashboard/        # Overview operativo
│   ├── users/            # CRUD usuarios empresariales
│   ├── vehicles/         # CRUD vehículos
│   ├── locations/        # GPS en vivo
│   ├── navigation/       # Rutas, sesiones, viajes
│   ├── incidents/        # Incidencias
│   ├── chat/             # Mensajería
│   ├── documents/        # Documentos
│   ├── notifications/    # Notificaciones push
│   ├── ops/              # Observabilidad (admin-only)
│   ├── operational-units/# Unidades operativas en vivo
│   ├── app/              # App info, device stats
│   ├── radio/            # Radio push-to-talk
│   ├── rtc/              # WebRTC
│   └── audit-logs/       # Logs de auditoría
├── services/             # 44 servicios
└── sockets/              # Socket.IO (1270 líneas)
```

### Endpoints existentes por módulo

**Auth**: POST `/login`, `/register`, `/refresh`, `/forgot-password`, `/reset-password`, `/logout`, `/logout-all` — GET `/session`, `/me`, `/e2ee-backup` — PUT `/e2ee-backup`

**Account**: GET `/subscription` — PATCH `/subscription/plan` — POST `/subscription/cancel` — GET `/invoices`, `/invoices/:id/download` — POST `/orders/:id/refunds` — GET `/sessions` — DELETE `/sessions/:id`

**Admin (activation-keys)**: GET `/` — POST `/generate` — DELETE `/:id` — PATCH `/:id/revoke` — POST `/:id/share`

**Commercial**: GET `/plans` — GET `/downloads/:token` — POST `/checkout` — POST `/confirm` — POST `/webhooks/mercadopago` — POST `/webhooks/mercadopago/chargebacks`

**Portal**: GET `/overview` — GET `/onboarding`

**Dashboard**: GET `/overview`

**Users**: GET `/` — POST `/` — PATCH `/:userId` — DELETE `/:userId` — GET `/me` — PATCH `/me`

**Vehicles**: GET `/` — POST `/` — PATCH `/:vehicleId` — DELETE `/:vehicleId`

**Locations**: GET `/live` — POST `/update`

**Navigation**: GET `/search`, `/reverse` — POST `/plan` — GET/POST `/routes` — PATCH/DELETE `/routes/:routeId` — POST `/assign` — DELETE `/assign/:vehicleId` — GET `/sessions`, `/sessions/active`, `/sessions/history`, `/sessions/:id/metrics`, `/sessions/:id/events`, `/sessions/:id/checkpoint-visits`, `/sessions/:id/positions` — POST `/sessions/start` — PATCH `/sessions/:id/status` — POST `/sessions/:id/recalculate` — GET/POST `/trips`

**Incidents**: GET `/` — POST `/` — PATCH `/:id/status`

**Chat**: GET `/conversations`, `/contacts` — POST `/conversations/general`, `/conversations/direct` — GET `/conversations/:id/messages` — POST `/conversations/:id/messages`, `/conversations/:id/audio`, `/conversations/:id/media` — GET `/media/:storageKey`

**Documents**: GET `/`, `/admin` — POST `/` — GET `/files/:storageKey` — PATCH `/:id/review`

**Notifications**: GET `/` — POST `/push-subscriptions` — DELETE `/push-subscriptions/:token` — POST `/:id/read`

**Audit-logs**: GET `/`

**Ops**: GET `/observability`

**Operational-units**: GET `/`, `/:unitId`

**App**: GET `/info` — PATCH `/info` — GET `/device-stats`

**Radio**: GET `/messages` — POST `/messages` — GET `/messages/:id/audio`

**RTC**: GET `/config` — GET `/sessions`

---

## 10. Rutas y routers

### Registro de rutas (backend)

Las rutas se montan en `backend/src/app.js:134-238`. El patrón es:

```js
app.use('/api/auth', authRoutes);
app.use('/api/account', authenticate, accountRoutes);
app.use('/api/admin/activation-keys', authenticate, adminActivationKeyRoutes);
// ... etc
```

No hay un router central de plataforma. No existen rutas `/api/platform/*`. El único módulo con prefijo `admin` es `activation-keys`.

### Registro de rutas (frontend)

Las rutas se definen en `ventas/src/App.tsx:54-167` mediante un switch de cadenas dentro de la función `Routes()`. El router es personalizado (`ventas/src/navigation/router.tsx`, 161 líneas) usando `window.history.pushState` + `useSyncExternalStore`.

No existe una sección `/admin/*` en el frontend. El router solo reconoce:
- `/`, `/ventas/*` — público
- `/portal/*` — protegido (portal empresarial)
- `/mapa`, `/radio` — placeholders

---

## 11. Autenticación actual

### EXISTENTE

**Backend** (`backend/src/modules/auth/routes.js`, 556 líneas):

1. **Login**: `POST /api/auth/login` — recibe email + password, busca usuario por email, compara con `bcrypt.compareSync()`, crea sesión (refresh token rotativo), construye JWT con `signToken()`, construye contexto de autenticación con `buildAuthContext()` (suscripción, tenant, onboarding).
2. **JWT payload** (`backend/src/utils/jwt.js:8-13`):
   ```
   { sub: user.id, role, email, organizationId, sid (sessionId) }
   ```
   Firmado con `JWT_SECRET` (mín. 32 chars), expiración default 15 minutos. Los tokens empresariales actuales **no contienen** un campo `tokenType`. Esto es relevante para la corrección 5: el middleware de plataforma rechazará por defecto cualquier token sin `tokenType: "platform"`, excluyendo automáticamente todos los tokens empresariales existentes sin modificarlos.
3. **Refresh token**: 64 caracteres base64url, hash SHA-256 almacenado en `sessions` collection, rotación en cada refresh, TTL 30 días.
4. **Middleware authenticate** (`backend/src/middlewares/authenticate.js`): verifica JWT con `jwt.verify()`, resuelve usuario con `store.getUserById()`, verifica no suspendido, verifica sesión activa (si `sid` presente), establece `req.auth`, `req.user`, `req.tenant`.

**Frontend** (`ventas/src/lib/api.ts`, 480 líneas):

1. Token almacenado en `localStorage` con clave `manecomb-ventas-token`.
2. Inyectado en Axios: `Authorization: Bearer <token>` vía `setAuthToken()`.
3. Refresh automático: interceptor de respuesta captura 401, llama a `/auth/refresh`, reintenta.
4. Hidratación en `initialize()`: lee token de localStorage, llama `GET /auth/session`, restaura estado.

---

## 12. Autorización actual

### EXISTENTE

**Roles** (definidos en `backend/src/data/models.js:20`):
```
owner, admin, dispatcher, supervisor, billing_manager, support, viewer, driver
```

**AccountTypes**:
```
operations, company_owner
```

**Matriz de permisos** (`backend/src/middlewares/access-control.js:16-36`):

| Rol | users | billing | vehicles | routes | analytics | rtc | documents | incidents |
|-----|:-----:|:-------:|:--------:|:------:|:---------:|:---:|:---------:|:---------:|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| dispatcher | | | ✓ | ✓ | ✓ | ✓ | | ✓ |
| supervisor | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| billing_manager | | ✓ | | | ✓ | | | |
| support | | | | | ✓ | | | ✓ |
| viewer | | | | | ✓ | | | |
| driver | | | | | | ✓ | | |

**Platform admin detection** (`backend/src/middlewares/access-control.js:63-65`):
```js
function canAccessAllTenants(user) {
  return user?.role === "admin" && user?.accountType !== "company_owner";
}
```

Los platform admins **no tienen un rol separado**. Usan `role: "admin"` con `accountType: "operations"` (el mismo rol que un admin empresarial). La diferencia es que `accountType !== "company_owner"` los hace bypassar todo scoping tenant.

**Frontend portal permissions** (`ventas/features/portal/utils/access.ts`):

| Rol Portal | users | billing | vehicles | routes |
|------------|:-----:|:-------:|:--------:|:------:|
| owner | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✓ |
| billing_manager | | ✓ | | |
| support | | | | |
| viewer | | | | |

Los roles `dispatcher`, `supervisor`, `driver` no tienen acceso al portal.

---

## 13. Flujo tenant

### EXISTENTE

1. **Identificación**: Cada documento en MongoDB tiene un campo `organizationId` (string). No existe una colección `Organization` o `Tenant` — el tenant es implícito.
2. **Extracción del JWT**: `req.tenant` se establece en `authenticate.js` a partir de `getOrganizationId(resolvedUser)`.
3. **Scoping central** (`backend/src/data/mongo-store.js:132-139`):
   ```js
   function getOrganizationQuery(user) {
     if (!user || canAccessAllOrganizations(user)) return {};
     const organizationId = getUserOrganizationId(user);
     return organizationId ? { organizationId } : { organizationId: "__missing__" };
   }
   ```
4. **Middleware de acceso**:
   - `requireOrganization()` — verifica que el usuario tenga organización (platform admins bypass)
   - `canAccessTenantResource(user, resource)` — compara `organizationId` del usuario con el recurso (platform admins bypass)
   - `filterTenantList(user, items)` — filtra lista al tenant del usuario (platform admins bypass)
5. **Socket.IO rooms**: `org:{organizationId}`, `org:{orgId}:role:{role}`, `platform:admin`
6. **Gaps identificados** (ver sección 25 - Riesgos de mezcla tenant)

---

## 14. Roles y permisos existentes

### EXISTENTE

La lista completa de roles con su semántica actual:

| Rol | AccountType | Portal | Descripción |
|-----|-------------|:------:|-------------|
| owner | company_owner | ✓ | Propietario de la empresa cliente |
| admin | company_owner | ✓ | Administrador de la empresa (mismos permisos que owner) |
| admin | operations | N/A | **Platform admin** — Usuario interno de ManeComb, ve todos los tenants |
| billing_manager | company_owner | ✓ | Gestor de facturación |
| support | company_owner | ✓ | Soporte de la empresa |
| viewer | company_owner | ✓ | Solo lectura en portal |
| dispatcher | operations | ✗ | Despachador operativo (app móvil) |
| supervisor | operations | ✗ | Supervisor operativo (app móvil) |
| driver | operations | ✗ | Conductor (app móvil) |

**Problema**: No hay diferenciación entre `admin` empresarial y `admin` de plataforma. Dependen del `accountType`. Esto es frágil — si un `admin` empresarial obtiene `accountType: "operations"` por error de datos, obtendría acceso global.

---

## 15. Modelos y relaciones

### EXISTENTE

**UserModel** (`users`):
```js
{
  _id: String,           // UUID
  name: String,
  email: String,         // unique, indexed
  passwordHash: String,  // bcrypt, 10 rounds
  role: String,          // owner|admin|dispatcher|supervisor|billing_manager|support|viewer|driver
  accountType: String,   // operations|company_owner
  organizationId: String, // "" for platform admins, org ID for company users
  userStatus: String,    // active|pending|suspended
  phone: String,
  shift: String,
  status: String,        // online|offline
  avatar: String,
  avatarUrl: String,
  vehicleId: String,     // driver→vehicle assignment
  activationKeyId: String,
  activatedAt: Date,
  e2eePublicKey: String,
  e2eeKeyRotatedAt: Date,
  e2eeBackups: [e2eeBackupSchema],
  pushSubscriptions: [pushSubscriptionSchema],
  companyProfile: { companyName, legalName, taxId, billingEmail, billingAddress },
  paymentProfile: { preferredMethod, cardholderName, cardBrand, cardLast4, ... },
  operationalSchedule: { enabled, startTime, endTime, activeDays, timezone },
  resetTokenHash: String,
  resetTokenExpiresAt: Date,
  lastAccessAt: Date,
  invitedAt: Date,
  suspendedAt: Date
}
```

**SessionModel** (`sessions`):
```js
{
  _id: String,
  userId: String,        // indexed
  organizationId: String, // indexed
  refreshTokenHash: String, // SHA-256
  ip: String,
  userAgent: String,
  platform: String,
  deviceName: String,
  locationApprox: String,
  createdAt: Date,
  lastSeenAt: Date,
  expiresAt: Date,       // indexed
  revokedAt: Date,       // indexed
  revokedReason: String,
  isActive: Boolean      // indexed
}
```

**VehicleModel** (`vehicles`):
```js
{
  _id: String,
  organizationId: String, // indexed
  code: String,           // "CB-101"
  plate: String,          // "CMB-101-A"
  routeId: String,
  driverId: String,
  supervisorId: String,
  status: String,         // available|on-route|maintenance|assigned
  occupancy: Number,
  capacity: Number,
  etaMinutes: Number,
  delayMinutes: Number,
  heading: Number,
  speed: Number,
  fuel: Number,
  currentKilometers: Number,
  updatedAt: Date,
  location: { latitude, longitude },
  locationTimestamp: Date,
  locationClientTimestamp: Date,
  locationReceivedAt: Date,
  locationTimestampSource: String,
  locationClockSkewMs: Number,
  activeRouteProgress: Mixed,
  assignedRoute: assignedRouteSchema
}
```

**CommercialLeadModel** (`commercial_leads`):
```js
{
  _id: String,
  referenceCode: String,
  ownerUserId: String,
  ownerAccountEmail: String,
  organizationId: String,
  organizationSlug: String,
  accountStatus: String,
  companyName: String,
  contactName: String,
  email: String,
  phone: String,
  billingProfile: companyProfileSchema,
  planId: String,
  planName: String,
  fleetSize: Number,
  basePlanPrice: Number,
  addOns: [commercialAddOnSchema],
  addOnsTotal: Number,
  radioFeatureEnabled: Boolean,
  totalPrice: Number,
  pricePerVehicle: Number,
  strategy: String,
  paymentMethod: String,
  paymentProvider: String,
  checkoutUrl: String,
  paymentExternalReference: String,
  paymentProviderReference: String,
  providerPaymentId: String,
  appliedPaymentTransitions: [String],
  paymentEffectsStatus: String,
  paymentEffectsTransition: String,
  paymentEffectsLeaseUntil: Date,
  paymentEffectsWorker: String,
  paymentEffectsCompletedAt: Date,
  paymentStatus: String,
  paymentApprovedAt: Date,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  paidUntil: Date,
  nextBillingAt: Date,
  cancelAtPeriodEnd: Boolean,
  cancelledAt: Date,
  financialStatus: String,
  refundedAmountMinor: Number,
  refundReservedMinor: Number,
  refundableAmountMinor: Number,
  chargebackStatus: String,
  serviceSuspendedReason: String,
  status: String,
  source: String,
  needsOnboarding: Boolean,
  needsInvoice: Boolean,
  requestTrial: Boolean,
  trialDays: Number,
  trialStartedAt: Date,
  trialEndsAt: Date,
  trialStatus: String,
  notes: String,
  activationStatus: String,
  activationStartedAt: Date,
  activatedAt: Date,
  cancelAt: Date,
  activationNotes: String,
  onboardingStatus: String,
  onboardingChecklist: [commercialChecklistItemSchema],
  fleetSetupStatus: String,
  starterFleet: [commercialStarterFleetSchema],
  launchSummary: String,
  lastEmailStatus: String,
  lastEmailError: String,
  lastEmailProvider: String,
  lastEmailTemplate: String,
  lastWhatsappStatus: String,
  lastContactedAt: Date,
  createdAt: Date
}
```

**AuditLogModel** (`audit_logs`):
```js
{
  _id: String,
  actorId: String,
  organizationId: String,
  action: String,
  targetType: String,
  targetId: String,
  ip: String,
  userAgent: String,
  severity: String,    // info|warning|critical
  metadata: Mixed,
  createdAt: Date
}
```

### Relaciones entre entidades

```
User (organizationId) ──pertenece a──> Empresa (implícita por organizationId)
User (vehicleId) ──conduce──> Vehicle (organizationId)
User (activationKeyId) ──se activó con──> ActivationKey (organizationId)
Vehicle (organizationId) ──pertenece a──> Empresa (implícita)
Vehicle (routeId) ──sigue──> Route (organizationId)
CommercialLead (organizationId) ──pertenece a──> Empresa (implícita)
CommercialLead (ownerUserId) ──propietario──> User
Session (userId) ──pertenece a──> User
Session (organizationId) ──pertenece a──> Empresa (implícita)
AuditLog (actorId) ──realizado por──> User
AuditLog (organizationId) ──pertenece a──> Empresa (implícita)
ActivationKey (organizationId/companyId) ──pertenece a──> Empresa
```

**No existe** un modelo separado para `Organization`, `Tenant`, `Company`, `Enterprise` o `PlatformUser`.

### Convención de modelos Mongoose

Todos los modelos Mongoose de ManeComb se declaran en un único archivo:

```
backend/src/data/models.js    (1017 líneas)
```

Este archivo exporta ~24 modelos (`UserModel`, `SessionModel`, `VehicleModel`, `CommercialLeadModel`, `AuditLogModel`, etc.). No existen modelos declarados dentro de módulos individuales (`modules/*/models/`). La convención es centralizada.

**Decisión para PlatformUserModel y PlatformSessionModel**: Ambos modelos deben declararse y exportarse desde `backend/src/data/models.js`, siguiendo la convención existente. Agregar un modelo nuevo a `models.js` es una modificación directa y controlada, no una alteración de la lógica empresarial. El módulo platform consumirá los modelos a través del data layer actual (`mongo-store.js`), que también vive en `backend/src/data/`. No se crea un segundo patrón de modelos dentro de `backend/src/modules/platform/models/`.

---

## 16. Fuentes oficiales de datos

### Para cada dato que necesita el Admin Global

| Dato | Fuente oficial | Repositorio/servicio | Endpoint relacionado | Contexto tenant | Uso en Admin Global | Riesgo |
|---|---|---|---|---|---|---|
| **Empresa/tenant** | `organizationId` en documentos (no existe colección separada) | `mongo-store.js` / `store.js` | N/A (implícito) | Sí — `getOrganizationQuery()` | Consultar empresas únicas por `organizationId` | No hay fuente directa de metadatos de empresa |
| **Propietario** | `UserModel` con `role: "owner"` y `accountType: "company_owner"` | `mongo-store.js` / `user-service.js` | `GET /api/users` | Sí | Filtrar usuarios por `role=owner` | Exponer datos de contacto del owner |
| **Usuario** | `UserModel` | `mongo-store.js` / `user-service.js` | `GET /api/users`, `PATCH /api/users/:id` | Sí (organizationId) | Listar todos los usuarios de la plataforma | Exponer passwordHash, tokens, e2ee keys |
| **Membresía** | No existe modelo separado. La pertenencia a empresa es implícita por `organizationId` | N/A | N/A | N/A | El Admin Global debe deducir membresías de `organizationId` | No hay membresías explícitas que consultar |
| **Rol** | `UserModel.role` | `mongo-store.js` | N/A | No (es global) | Agrupar usuarios por rol | Ninguno |
| **Permiso** | `ROLE_PERMISSIONS` en `access-control.js` (código, no DB) | `backend/src/middlewares/access-control.js` | N/A | No | No consultable — son reglas de código | Información estática |
| **Unidad (vehículo)** | `VehicleModel` | `mongo-store.js` | `GET /api/vehicles` | Sí (organizationId) | Conteo global, detalle por empresa | Gaps en tenant isolation (getVehicleById) |
| **Conductor** | `UserModel` con `role: "driver"` | `mongo-store.js` | `GET /api/users` | Sí | Listar conductores por empresa | Exponer datos personales |
| **Supervisor** | `UserModel` con `role: "supervisor"` | `mongo-store.js` | `GET /api/users` | Sí | Listar supervisores por empresa | Exponer datos personales |
| **Plan** | `commercial-plans.js` (config, no DB) | `backend/src/config/commercial-plans.js` | `GET /api/commercial/plans` | No | Mostrar catálogo de planes | Ninguno |
| **Límite** | `CommercialLeadModel.fleetSize` (por suscripción) | `payment-store-service.js` | `GET /api/account/subscription` | Sí | Mostrar límite de unidades por empresa | Confundir fleetSize solicitado vs real |
| **Add-on** | `CommercialLeadModel.addOns` | `commercial-payment.js` | `GET /api/account/subscription` | Sí | Mostrar add-ons contratados | Ninguno |
| **Orden** | `CommercialLeadModel` (commercial_leads) | `payment-store-service.js`, `mongo-store.js` | `GET /api/commercial/plans` | Sí (organizationId) | Historial de órdenes | `listCommercialOrders()` no filtra por tenant |
| **Pago** | `CommercialLeadModel.paymentStatus` + `WebhookEventModel` | `commercial-payment.js`, `webhook-idempotency.js` | `POST /api/commercial/webhooks/mercadopago` | Sí | Estado de pagos por empresa | Exponer payload completo del webhook |
| **Suscripción** | `CommercialLeadModel` (campos `paymentStatus`, `currentPeriodEnd`, `paidUntil`, etc.) | `payment-store-service.js`, `auth-context.js` | `GET /api/account/subscription` | Sí | Estado actual de suscripción por empresa | `isActive` se computa, no se almacena |
| **Documento** | `DocumentModel` | `document-service.js`, `mongo-store.js` | `GET /api/documents` / `GET /api/documents/admin` | Sí (filters.organizationId) | Revisión global de documentos | Documentos sensibles (identificación, RFC) |
| **Actividad** | No existe modelo central de actividad. Eventos están en `AuditLogModel`, `RouteEventModel`, `RouteSessionModel`, `AppEventModel` | `audit.js`, `telemetry.js` | `GET /api/audit-logs` | Sí (organizationId) | Línea de tiempo de actividad de empresa | Disperso en múltiples colecciones |
| **Auditoría** | `AuditLogModel` (audit_logs) | `audit.js` | `GET /api/audit-logs` | Sí (organizationId + actorId) | Trazabilidad de acciones administrativas | Acciones de platform admin no se auditan actualmente |
| **Health** | `getRuntimeReadiness()` en `runtime-readiness.js` | `runtime-readiness.js` | `GET /health`, `GET /api/health/ready` | No | Dashboard de salud del sistema | Ninguno |
| **Observabilidad** | `getOperationalInsights()` en `store` / `mongo-store` | `backend/src/modules/ops/routes.js` | `GET /api/ops/observability` | No (admin-only) | Métricas del sistema | Ya es admin-only |

---

## 17. Repositorios y servicios reutilizables

### REUTILIZAR SIN CAMBIOS

| Recurso | Ruta | Uso en Admin Global |
|---|---|---|
| `recordAuditLog()` | `backend/src/services/audit.js` | Registrar acciones del Admin Global con acciones `platform.*` |
| `getOrganizationQuery()` | `backend/src/data/mongo-store.js:132` | **MECANISMO TENANT EMPRESARIAL EXISTENTE — NO UTILIZAR COMO BYPASS PLATFORM.** Las consultas del Admin Global deben usar funciones explícitas (ej. `listPlatformCompanies()`, `getPlatformCompanyByOrganizationId()`) que declaren su carácter global y exijan `platformAuth` + `platformRole` |
| `getRuntimeReadiness()` | `backend/src/services/runtime-readiness.js` | Dashboard de salud del sistema |
| `listCommercialPlans()` | `backend/src/config/commercial-plans.js` | Catálogo de planes |
| `getCommercialPlanById()` | `backend/src/config/commercial-plans.js` | Detalle de plan individual |
| `apiClient` (Axios) | `ventas/src/lib/api.ts` | **REFERENCIA ARQUITECTÓNICA / POSIBLE EXTRACCIÓN DE HELPER**. No reutilizar directamente. El Admin Global debe crear `platformApiClient` en `ventas/features/admin/api/platform-api.ts` (instancia Axios aislada) con interceptor propio, refresh exclusivo en `/api/platform/auth/refresh`, clave de almacenamiento `manecomb-platform-token`, y ninguna modificación de los headers del cliente del Portal |
| StatusBadge | `ventas/src/components/ui/status-badge.tsx` | Badges de estado |
| SkeletonBlock | `ventas/src/components/ui/skeleton.tsx` | Skeletons de carga |
| EmptyState | `ventas/src/components/ui/empty-state.tsx` | Estados vacíos |
| ConfirmModal | `ventas/src/components/ui/confirm-modal.tsx` | Modales de confirmación |
| Toast | `ventas/src/components/ui/toast.tsx` | Notificaciones |
| ErrorBoundary | `ventas/src/components/error-boundary.tsx` | Aislamiento de errores |
| ScreenErrorBoundary | `ventas/src/components/screen-error-boundary.tsx` | Error boundary por pantalla |
| BrandLogo | `ventas/src/components/brand-logo.tsx` | Logo ManeComb |
| `formatCurrency()`, `formatDate()`, `formatRole()` | `ventas/src/utils/format.ts` | Formateo de datos |
| `palette`, `DesignSystem`, `Typography` | `ventas/constants/theme.ts` | Tokens de diseño |
| `router` (push, replace, back) | `ventas/src/navigation/router.tsx` | Navegación |

### REUTILIZAR MEDIANTE ADAPTADOR

| Recurso | Ruta | Adaptación necesaria |
|---|---|---|
| `PortalLayout` | `ventas/features/portal/components/portal-layout.tsx` | **NO REUTILIZAR**. Es un componente privado del Portal empresarial. El Admin Global tendrá su propio `AdminLayout` independiente. Los componentes verdaderamente compartidos viven en `ventas/src/components/ui/` |
| `listUsers()` | `backend/src/data/mongo-store.js` | Necesita wrapper que permita consulta global (sin `getOrganizationQuery()`) para platform admins |
| `listVehicles()` | `backend/src/data/mongo-store.js` | Igual — necesita modo admin que omita tenant filter |
| `listCommercialOrdersForUser()` | `backend/src/services/payment-store-service.js` | Necesita overload sin filtro `organizationId` para admins |
| `getFleetSummary()` | `backend/src/data/mongo-store.js` | Agregar parámetro opcional de `organizationId` |
| `getDocumentsForUser()` | `backend/src/data/mongo-store.js` | Agregar modo admin global |
| `AuditLogModel.find()` | `backend/src/modules/audit-logs/routes.js` | Agregar filtro por `organizationId` opcional para admins (hoy solo ve su org o sus acciones) |

### EXTENDER DE FORMA AISLADA

| Recurso | Ruta | Extensión propuesta |
|---|---|---|
| `useAppStore` | `ventas/src/store/use-app-store.ts` | **NO EXTENDER.** Crear `useAdminStore` como store Zustand independiente dentro de `features/admin/store/`. No agregar acciones platform en `useAppStore` |
| API functions en `client.ts` | `ventas/src/lib/api.ts` | **NO EXTENDER.** Las funciones platform viven en `features/admin/api/platform-api.ts`. No modificar `api.ts` |
| Portal screens | `ventas/features/portal/screens/*.tsx` | **NO REUTILIZAR.** Crear pantallas admin nuevas (`features/admin/screens/*.tsx`) que consuman únicamente componentes compartidos (`src/components/ui/`, `src/components/`, `constants/`) |

### NO REUTILIZAR PARA AUTORIZACIÓN PLATFORM

Los siguientes middlewares pertenecen a la identidad empresarial y **no** deben proteger `/api/platform/*`:

| Middleware | Ruta | Motivo |
|---|---|---|
| `authenticate` | `backend/src/middlewares/authenticate.js` | Resuelve usuarios mediante `UserModel` (no `PlatformUserModel`). No reconoce `tokenType: "platform"` |
| `requireAdmin` | `backend/src/middlewares/require-admin.js` | Verifica `role === "admin" && accountType !== "company_owner"`. Los platform users no tienen `accountType` |
| `canAccessAllTenants()` | `backend/src/middlewares/access-control.js:63` | Depende de `role: "admin"` empresarial. No aplica a roles `platform_*` |
| `requireOrganization` | `backend/src/middlewares/access-control.js` | Exige `organizationId`. Los platform users no tienen empresa asignada |
| `requirePortalAccess` | `backend/src/middlewares/portal-access.js` | Exige `accountType === "company_owner"`. El Admin Global rechaza ese accountType |

Los nuevos endpoints de plataforma deben utilizar exclusivamente los nuevos middlewares `platformAuth` y `platformRole`.

### SÍ REUTILIZAR (primitivas de seguridad compartidas)

| Función | Ruta | Modo |
|---|---|---|
| Verificación JWT (`verifyToken`) | `backend/src/utils/jwt.js` | Importar directamente — verifica con `JWT_SECRET` o `PLATFORM_JWT_SECRET` según el middleware |
| Firma JWT (`signToken`) | `backend/src/utils/jwt.js` | Adaptador: `signPlatformToken()` que llame a `jsonwebtoken.sign()` directamente o a `signToken()` con parámetros platform |
| Hashing de contraseñas (bcrypt) | `backend/src/data/mongo-store.js` | Importar `bcryptjs` directamente (misma librería ya en dependencias) |
| Generación de refresh tokens | `backend/src/services/sessions.js` | Reutilizar `createRefreshToken()` (usa `crypto.randomBytes(48).toString("base64url")`) |
| Hashing de refresh tokens | `backend/src/services/sessions.js` | Reutilizar `hashRefreshToken()` (SHA-256) |
| Extracción de IP | `backend/src/services/audit.js` | Reutilizar `getRequestIp()` |
| Extracción de user-agent | `backend/src/services/audit.js` | Reutilizar `getUserAgent()` |
| Política de contraseña | `backend/src/utils/password-policy.js` | Reutilizar `passwordPolicy.validate()` |
| Rate limiter | `backend/src/middlewares/enterprise-rate-limit.js` | Reutilizar con configuración específica para plataforma |
| `recordAuditLog()` | `backend/src/services/audit.js` | Reutilizar con acciones `platform.*` |
| Formato de errores | Convención existente | Mismos códigos HTTP, misma estructura de respuesta |

### NO REUTILIZAR (frontend Portal)

| Recurso | Ruta | Motivo |
|---|---|---|
| `hasPortalPermission()` | `ventas/features/portal/utils/access.ts` | Pertenece al modelo de permisos empresariales. El admin global necesita su propio sistema de permisos |
| `canAccessPortal()` | `ventas/features/portal/utils/access.ts` | Específico para `company_owner`. El admin global usa platform roles |
| `requireOperationalAccess` middleware | `backend/src/middlewares/operational-access.js` | Gating por suscripción. El admin global no necesita suscripción |
| Portal screens | `ventas/features/portal/screens/*.tsx` | Son pantallas por-empresa. El admin global necesita vista multi-empresa |
| `usePortalStore` | `ventas/features/portal/store/use-portal-store.ts` | Store del portal empresarial. Scope por empresa |
| Portal actions | `ventas/features/portal/store/portal-actions.ts` | Lógica de portal empresarial. No aplica a admin global |
| Cards module | `ventas/features/portal/cards/` | Componentes visuales específicos del portal (formateo, timelines) |
| Onboarding module | `ventas/features/portal/onboarding/` | Flujo de activación empresarial |
| Documents module | `ventas/features/portal/documents/` | Revisión de documentos por empresa |
| `buildAuthContext()` | `backend/src/services/auth-context.js` | Construye contexto empresarial. El admin global necesita contexto de plataforma |

### CREAR NUEVO (identidad separada)

| Componente | Propósito |
|---|---|
| `PlatformUserModel` en `backend/src/data/models.js` | Modelo Mongoose para colección `platform_users` — **identidad separada** |
| `PlatformSessionModel` en `backend/src/data/models.js` | Modelo Mongoose para colección `platform_sessions` — **persistencia separada** |
| `AdminLayout` (frontend) | Layout del Admin Global (independiente, no reutiliza PortalLayout). Puede reutilizar componentes de `ventas/src/components/ui/` |
| `useAdminStore` (Zustand) | Store para el Admin Global |
| `features/admin/` | Módulo completo del Admin Global |
| `backend/src/modules/platform/` | Módulo backend para el Admin Global (rutas, servicios, middlewares, validadores — sin modelos) |
| `backend/src/middlewares/platform-auth.js` | Middleware de autenticación para plataforma (rechaza tokens empresariales) |

### NO CREAR (seguridad duplicada)

Los siguientes servicios y utilidades NO deben copiarse dentro del módulo platform. Deben reutilizarse mediante importación directa o adaptador desde su ubicación actual:

| Función | Ubicación actual | Modo de reutilización |
|---|---|---|
| Hashing de contraseñas (bcrypt) | `backend/src/data/mongo-store.js` (línea ~1618) | Importar `bcryptjs` directamente (misma librería ya en dependencias) |
| Firma de JWT (`signToken`) | `backend/src/utils/jwt.js` | Adaptador: crear `signPlatformToken()` que llame a la misma función `signToken()` de `jwt.js` con payload platform. No copiar la implementación de `jsonwebtoken` |
| Verificación de JWT (`verifyToken`) | `backend/src/utils/jwt.js` | Reutilizar `verifyToken()` sin cambios — verifica con `JWT_SECRET` compartido |
| Generación de refresh tokens | `backend/src/services/sessions.js` (línea ~12) | Reutilizar `createRefreshToken()` (usa `crypto.randomBytes(48).toString("base64url")`) |
| Hashing de refresh tokens (SHA-256) | `backend/src/services/sessions.js` (línea ~16) | Reutilizar `hashRefreshToken()` |
| Creación de sesiones | `backend/src/services/sessions.js` (línea ~43) | Adaptador: `createPlatformSessionForRequest()` que use `createSessionForRequest()` con parámetros platform |
| Revocación de sesiones | `backend/src/services/sessions.js` | Reutilizar `revokeSession()`, `revokeAllSessions()` |
| Extracción de IP | `backend/src/services/audit.js` | Reutilizar `getRequestIp()` |
| Extracción de user-agent | `backend/src/services/audit.js` | Reutilizar `getUserAgent()` |
| Rate limiting | `backend/src/middlewares/enterprise-rate-limit.js` | Reutilizar el mismo middleware con configuración específica para plataforma |
| Errores de autenticación | Estructura existente (401, 403) | Mismos códigos HTTP, mismos formatos de error |
| Validación de contraseña | `backend/src/utils/password-policy.js` | Reutilizar `passwordPolicy.validate()` — misma política de seguridad |
| `recordAuditLog()` | `backend/src/services/audit.js` | Reutilizar directamente con acciones `platform.*` |

---

## 18. Contratos y tipos reutilizables

### REUTILIZAR SIN CAMBIOS

| Tipo/contrato | Ruta | Uso |
|---|---|---|
| `User` | `ventas/src/types/app.ts` | Representación de usuario (todos los campos útiles existen) |
| `Vehicle` | `ventas/src/types/app.ts` | Representación de vehículo |
| `CommercialPlan` | `ventas/src/types/app.ts` | Plan comercial |
| `PortalSubscription` | `ventas/src/types/app.ts` | **REFERENCIA DE CAMPOS / CANDIDATO A EXTRAER CONTRATO GENÉRICO**. No reutilizar directamente. El Admin Global debe usar `PlatformSubscriptionView` |
| `PortalInvoice` | `ventas/src/types/app.ts` | **REFERENCIA DE CAMPOS / CANDIDATO A EXTRAER CONTRATO GENÉRICO**. El Admin Global debe usar `PlatformPaymentView` |
| `PortalSession` | `ventas/src/types/app.ts` | **REFERENCIA DE CAMPOS / CANDIDATO A EXTRAER CONTRATO GENÉRICO**. El Admin Global debe usar `PlatformSessionView` |
| `Incident` | `ventas/src/types/app.ts` | Incidencia |
| `DocumentItem` | `ventas/src/types/app.ts` | Documento |
| `PaginatedResult<T>` | `ventas/src/types/app.ts` | Paginación genérica |
| `OperationalUnitSnapshot` | `shared/operational-contract/types.ts` | Estado de unidad operativa |

### REFERENCIA DE CAMPOS / CANDIDATO A EXTRAER CONTRATO GENÉRICO

Los siguientes tipos `Portal*` no deben utilizarse como contratos del Admin Global, pero sus campos sirven como referencia para diseñar los DTOs propios:

| Tipo | Referencia |
|---|---|
| `PortalOverview` | Referencia para diseñar `PlatformOverview`. No reutilizar directamente |
| `PortalActivationKey` | Referencia para diseñar `PlatformCompanyView`. No reutilizar directamente |
| `PortalAppInfo` | Referencia para diseñar `PlatformSystemHealth`. No reutilizar directamente |

### CREAR NUEVO (solo DTOs / read models — no persistentes)

| Tipo | Naturaleza | Propósito | ¿Persiste en MongoDB? |
|---|---|---|---|
| `PlatformUserRole` | Union type | `'platform_owner' \| 'platform_admin' \| 'platform_support' \| 'platform_finance' \| 'platform_viewer'` | No — es un tipo TypeScript |
| `PlatformUser` | Tipo separado de `User` | Modelo de datos para la colección `platform_users` | Sí — nueva colección |
| `PlatformOverview` | DTO de respuesta | Resumen global (empresas activas, suscripciones, pagos, salud) | No — se computa al vuelo |
| `PlatformCompanyView` | DTO / read model | Datos administrativos de una empresa construidos desde fuentes existentes: `organizationId`, `CommercialLeadModel`, `UserModel` del propietario, conteos de `UserModel` y `VehicleModel`, plan desde `commercial-plans.js`, estado comercial desde servicios existentes. **No reemplaza ni duplica CollectionLeadModel, UserModel ni VehicleModel** | No — read model no persistente |
| `PlatformSubscriptionView` | DTO de respuesta | Proyección de `CommercialLeadModel` para el Admin Global | No — read model |
| `PlatformOrderView` | DTO de respuesta | Proyección de `CommercialLeadModel` para el Admin Global | No — read model |
| `PlatformPaymentView` | DTO de respuesta | Estado de pago desde `CommercialLeadModel.paymentStatus` + eventos de `WebhookEventModel` | No — read model |
| `PlatformSystemHealth` | DTO de respuesta | Salud del sistema agregada desde `getRuntimeReadiness()` | No — se computa al vuelo |

**Fuentes oficiales que se mantienen sin cambios**: `commercial-plans.js` (config), `CommercialLeadModel` (colección `commercial_leads`), servicios comerciales actuales (`commercial-payment.js`, `payment-store-service.js`), repositorios de pagos, eventos idempotentes (`WebhookEventModel`), servicios que calculan estado de suscripción (`auth-context.js`). No se crean nuevas colecciones de suscripciones, órdenes ni pagos. No se definen nuevos estados comerciales. No se realizan cálculos de pago en el frontend.

---

## 19. Componentes de frontend reutilizables

### REUTILIZAR SIN CAMBIOS

| Componente | Ruta | Notas |
|---|---|---|
| `StatusBadge` | `src/components/ui/status-badge.tsx` | Badge de estado — sin cambios |
| `SkeletonBlock` | `src/components/ui/skeleton.tsx` | Skeleton loading — sin cambios |
| `EmptyState` | `src/components/ui/empty-state.tsx` | Estado vacío — sin cambios |
| `ConfirmModal` | `src/components/ui/confirm-modal.tsx` | Confirmación — sin cambios |
| `Toast` | `src/components/ui/toast.tsx` | Notificaciones — sin cambios |
| `ErrorBoundary` | `src/components/error-boundary.tsx` | Error boundary — sin cambios |
| `ScreenErrorBoundary` | `src/components/screen-error-boundary.tsx` | Per-screen error — sin cambios |
| `BrandLogo` | `src/components/brand-logo.tsx` | Logo — sin cambios |
| `AppCard` | `src/components/app-card.tsx` | Card base — sin cambios |
| `KeyboardSafeScrollView` | `src/components/keyboard-safe-layout.tsx` | Scroll container — sin cambios |

### NO REUTILIZAR (específicos del portal empresarial)

- `PortalLayout` → El Admin Global tendrá `AdminLayout` independiente. Los componentes de `ventas/features/portal/` se consideran privados del Portal. Si algún componente resulta realmente genérico, debe extraerse en una fase UI independiente con pruebas de regresión, sin acoplar Admin a Portal
- `operations-map.tsx` → solo si el Admin Global necesita mapa operativo (no es prioridad inicial)
- `route-geometry-thumbnail.tsx` → específico de rutas
- Todos los screens del portal → son por-empresa, no multi-empresa
- `portal-layout.tsx` nav items → son específicos del portal empresarial

---

## 20. Arquitectura comercial

### EXISTENTE

El sistema comercial se compone de:

1. **Planes**: 5 planes definidos en `commercial-plans.js` (configuración, no DB)
2. **Órdenes/Suscripciones**: Almacenadas en `CommercialLeadModel` (colección `commercial_leads`)
3. **Pagos**: Procesados por Mercado Pago, webhooks recibidos en `/api/commercial/webhooks/mercadopago`
4. **Estados**: `paymentStatus` (pending/paid/etc), `financialStatus`, `chargebackStatus`, `trialStatus`, `activationStatus`
5. **Idempotencia**: `WebhookEventModel` + `checkout-idempotency.js` + `webhook-idempotency.js`
6. **Activación**: `commercial-activation.js` + `activation-keys.js` + `fleet-service.js`

### Flujo de suscripción

```
Registro → Checkout → Mercado Pago → Webhook → Payment Reconciliation → Activation → Fleet Setup
```

El `CommercialLead` es la única fuente de verdad para: plan contratado, estado de pago, período de suscripción, límite de unidades, add-ons, trial, activación.

### Cómo el Admin Global debe consultar datos comerciales

| Consulta | Fuente | Método |
|---|---|---|
| Planes disponibles | `commercial-plans.js` | `listCommercialPlans()` |
| Suscripción activa de empresa | `CommercialLeadModel` | Buscar por `organizationId` donde `status !== "cancelled"` y `paymentStatus` no sea fallido |
| Historial de órdenes de empresa | `CommercialLeadModel` | Buscar por `organizationId`, ordenar por `createdAt` descendente |
| Estado de pago actual | `CommercialLeadModel.paymentStatus` | Campo directo |
| Eventos de pago (webhooks) | `WebhookEventModel` | Buscar por `orderId` o `organizationId` |
| Límite de unidades | `CommercialLeadModel.fleetSize` | Campo directo |
| Add-ons contratados | `CommercialLeadModel.addOns` | Array de add-ons |
| Próxima facturación | `CommercialLeadModel.nextBillingAt` | Campo directo |
| Estado de trial | `CommercialLeadModel.trialStatus` + `trialEndsAt` | Campos directos |
| Errores de pago | `CommercialLeadModel.serviceSuspendedReason` + logs de webhook | Campo + auditoría |

**NO debe** consultar Mercado Pago directamente ni recalcular estados en el frontend.

---

## 21. Integración de Mercado Pago

### EXISTENTE (no modificar)

- Webhook firmado HMAC-SHA256 validado en `isMercadoPagoWebhookSignatureValid()` (`commercial-payment.js`)
- Idempotencia de webhooks en `webhook-idempotency.js` (lease 60s, max 5 intentos, SHA-256 delivery key)
- Idempotencia de checkout en `checkout-idempotency.js` (key validation, fingerprinting)
- Validación de ambiente: `validateMercadoPagoCredentials()` verifica prefijo TEST vs APP_USR
- Validación de URL: `isValidPublicWebhookUrl()` + `isValidPublicReturnUrl()` exigen HTTPS
- Separación sandbox/producción: `selectMercadoPagoCheckoutUrl()` elige `sandbox_init_point` vs `init_point`
- Readiness: `getPaymentReadiness()` verifica credenciales, URL, configuración
- Endurecimiento: MP-HARDEN-01 a MP-HARDEN-06

### Cómo el Admin Global debe consultar pagos

1. **Listar pagos de una empresa**: consultar `CommercialLeadModel` por `organizationId`
2. **Ver estado actual**: campos `paymentStatus`, `financialStatus`, `chargebackStatus` en el lead
3. **Ver eventos del proveedor**: consultar `WebhookEventModel` (tiene payload, estado observado, resultado)
4. **NO** llamar a la API de Mercado Pago desde el frontend
5. **NO** almacenar credenciales de MP en el frontend
6. **NO** recalcular `isActive` — usar el campo `isActive` del servicio `auth-context.js`

---

## 22. Observabilidad y salud

### EXISTENTE

| Endpoint | Middleware | Descripción |
|---|---|---|
| `GET /health` | Público | Estado completo del runtime |
| `GET /api/health` | Público | Idem |
| `GET /api/health/live` | Público | Liveness simple (`{ ok: true, timestamp }`) |
| `GET /api/health/ready` | Público | Readiness (igual que /health) |
| `GET /api/metrics` | Público | Métricas del sistema |
| `GET /api/ops/observability` | `authenticate` + `requireAdmin` | Insights operativos globales (admin-only) |

`getRuntimeReadiness()` (`runtime-readiness.js`) reporta:
- database (MongoDB)
- storage (archivos)
- payments (Mercado Pago / test / manual)
- redis
- queues (BullMQ)
- notifications (email + whatsapp)
- rtc (TURN/STUN)
- transcription (audio)

### Reutilización para Admin Global

El frontend del Admin Global debe consumir un endpoint protegido y sanitizado:

```
GET /api/platform/system   (propuesto, no implementado)
```

Este endpoint reutilizará internamente `getRuntimeReadiness()` y `getOperationalInsights()` pero **no debe devolver**:
- Secretos ni variables de entorno
- Rutas internas del servidor
- Payloads completos de errores
- Información sensible de infraestructura

No consumir `GET /health`, `GET /api/metrics` ni `GET /api/health/ready` directamente desde el frontend admin, ya que son endpoints públicos que exponen más información de la necesaria para una interfaz administrativa.

---

## 23. Auditoría disponible

### EXISTENTE

**AuditLogModel** (`audit_logs`):
```js
{ _id, actorId, organizationId, action, targetType, targetId, ip, userAgent, severity, metadata, createdAt }
```

**Funcionalidad actual**:
- `GET /api/audit-logs` — listar logs con filtro por horas (default 7 días), límite (default 50, max 100)
- Scoping: usuarios no-admin ven solo su org o sus propias acciones
- Severidad: `info`, `warning`, `critical`
- `recordAuditLog(req, payload)` en `services/audit.js` — registro centralizado

**Firma verificada de `recordAuditLog()`**: La función espera `req` como primer argumento y accede a `req?.user?.id`, `req?.headers['user-agent']`, `req?.ip`, `req?.app?.locals?.store`. **No acepta `null`** como primer argumento. Para acciones sin solicitud HTTP (scripts internos), debe usarse un adaptador que construya un objeto `req` compatible (ver sección de aprovisionamiento inicial).

**Eventos auditados actualmente**: `auth.login`, `auth.failed_login`, `auth.logout`, más eventos de documentos, usuarios, vehículos, sesiones.

### Limitaciones para el Admin Global

1. No existe registro de acciones de platform admin (creación de empresa, suspensión, cambios de plan)
2. El modelo `AuditLogModel` no registra `oldState` / `newState` para cambios
3. No hay expiración automática de logs

### Estrategia de reutilización

El Admin Global debe reutilizar `AuditLogModel` y `recordAuditLog()` existentes. No crear colección separada. Las acciones internas utilizarán nombres explícitos con prefijo `platform.*`:

- `platform.auth.login`
- `platform.auth.failed_login`
- `platform.auth.logout`
- `platform.company.view`
- `platform.subscription.view`
- `platform.payment.view`
- `platform.company.suspend`
- `platform.company.reactivate`

El campo `metadata` (tipo `Mixed`, sin restricciones de esquema) puede contener sin modificar el modelo:

```js
{
  actorType: "platform",
  platformRole: "platform_admin",
  affectedOrganizationId: "org-id",
  reason: "motivo obligatorio",
  previousState: {},
  nextState: {}
}
```

**Determinación de compatibilidad**: El esquema actual de `AuditLogModel` ya soporta esta estrategia. Los campos `action` (string) aceptan cualquier prefijo, `metadata` (Mixed) acepta cualquier estructura, y `organizationId` permite filtrar por empresa afectada. Los registros existentes con acciones tipo `auth.login`, `auth.failed_login`, etc. coexistirán sin conflicto. No se requiere modificar el modelo ni migrar datos.

---

## 24. Riesgos de seguridad

### Identificados en la auditoría

| Riesgo | Severidad | Descripción | Mitigación propuesta |
|---|---|---|---|
| **Misma colección de usuarios** | ALTA | Platform admins y usuarios empresariales comparten `UserModel`. Si un `admin` empresarial obtiene `accountType: "operations"`, tendría acceso global | Crear colección separada `platform_users` para personal interno |
| **Mismo JWT** | ALTA | Los platform admins usan el mismo JWT que usuarios empresariales. Un token de platform admin robado da acceso total al sistema | Emitir JWTs con claim `type: "platform"` y validar en middleware de plataforma |
| **Sin MFA** | MEDIA | No hay autenticación de dos factores para ningún usuario, incluidos futuros platform admins | Agregar MFA en ADM-SEC-MFA-01 (fase posterior a ADM-SEC-01). El Admin Global no debe considerarse habilitable en producción sin MFA para `platform_owner` y `platform_admin`. Para `platform_support`, `platform_finance` y `platform_viewer` se evaluará según sensibilidad del rol |
| **Sin rate limiting diferenciado** | MEDIA | El rate limit de 200 req/15min para `/api` aplica igual a admins y usuarios. Un ataque de fuerza bruta a un admin sería igual de lento | Configurar rate limits más restrictivos para endpoints de plataforma |
| **Exposición de datos sensibles en respuestas** | MEDIA | `sanitizeUser()` ya filtra passwordHash, pero `listUsers()` devuelve email, phone, avatar, vehicleId | Crear serializer específico para consultas administrativas que exponga solo campos necesarios |
| **Webhook payloads almacenados** | BAJA | `WebhookEventModel` contiene payloads completos de Mercado Pago (potencialmente con datos del pagador) | No exponer webhook payloads en endpoints del Admin Global |
| **Sin sesiones de soporte temporales** | MEDIA | No existe mecanismo para que soporte acceda temporalmente a una empresa sin tener un token permanente | Diseñar sesiones de soporte con expiración y registro de acción |
| **Sin trazabilidad de acciones administrativas** | ALTA | Un platform admin puede crear/suspender empresas sin dejar registro en `AuditLogModel` | Registrar usando `recordAuditLog()` con acciones `platform.*` y `metadata.actorType = "platform"`. No crear colección separada |

---

## 25. Riesgos de mezcla tenant

### Clasificación revisada (ADM-ARCH-01-R1)

Cada riesgo se clasifica considerando la cadena completa: `ruta → middleware → servicio → store`.

| Riesgo | Archivo | Línea | Clasificación | Evidencia |
|---|---|---|---|---|
| **getVehicleById sin tenant filter** | `backend/src/data/mongo-store.js` | ~929 | **MITIGADO EN CAPA SUPERIOR** | La ruta `GET /api/vehicles/:vehicleId` en `vehicles/routes.js` usa `filterTenantList()` antes de devolver la respuesta. El store solo se usa para resolver el documento por ID. Un ataque requeriría bypassear el middleware |
| **deleteVehicle sin tenant filter** | `backend/src/data/mongo-store.js` | ~1149 | **MITIGADO EN CAPA SUPERIOR** | La ruta `DELETE /api/vehicles/:vehicleId` usa middleware de autenticación + `filterTenantList()`. El store no es accesible directamente |
| **updateVehicle sin tenant filter** | `backend/src/data/mongo-store.js` | ~2721 | **MITIGADO EN CAPA SUPERIOR** | Misma protección que delete: `PATCH /api/vehicles/:vehicleId` pasa por `authenticate` + `requireOrganization` + permisos de rol |
| **createVehicle sin cross-org check** | `backend/src/data/mongo-store.js` | ~2645 | **MITIGADO EN CAPA SUPERIOR** | La ruta `POST /api/vehicles` usa `requireOrganization` que asigna `organizationId` desde el usuario autenticado, no desde el payload. El payload `organizationId` es ignorado o sobrescrito |
| **listCommercialOrders sin org filter** | `backend/src/services/payment-store-service.js` | ~221 | **NO CONFIRMADO** | `listCommercialOrders()` es una función interna. No se encontró una ruta que la exponga directamente. La ruta pública `GET /api/commercial/plans` no la usa. La ruta `GET /api/account/subscription` usa `listCommercialOrdersForUser()` que sí filtra. Se requiere revisión adicional en el servicio de payment-store |
| **Document queries sin user scoping** | `backend/src/data/mongo-store.js` | ~1909 | **MITIGADO EN CAPA SUPERIOR** | `getDocumentsForUser()` recibe `filters.organizationId` desde la ruta, que a su vez lo obtiene de `getOrganizationId(req.user)`. La ruta `GET /api/documents/admin` requiere `canManageDocuments` que verifica rol |
| **Activation keys scoping por companyId** | `backend/src/modules/activation-keys/routes.js` | (varias) | **MITIGADO EN CAPA SUPERIOR** | Las rutas de activation keys usan `requirePermission("canManageUsers")` que verifica rol + organización. La función `listAdminActivationKeys()` en el servicio filtra por `user.companyId` |
| **Socket `platform:admin` sin restricciones** | `backend/src/sockets/index.js` | ~407 | **CONFIRMADO** | Los admins sin orgId se unen a `platform:admin` y reciben eventos de ubicación de TODAS las empresas. Este es un comportamiento intencional para el monitoreo global existente, pero debe considerarse al diseñar el Admin Global |
| **`canAccessAllTenants` depende de accountType** | `backend/src/middlewares/access-control.js` | ~63 | **CONFIRMADO** | Un solo campo (`accountType`) separa un admin empresarial de un platform admin. Si el dato se corrompe por error de aplicación o manipulación directa de BD, un admin empresarial ganaría acceso global |

### Fase independiente propuesta

Los riesgos tenant identificados no deben mezclarse con el desarrollo del Admin Global. Se propone una fase separada y ortogonal:

```text
SEC-TENANT-VERIFY-01
Verificación mediante pruebas de accesos cruzados entre organizaciones.
```

Esta fase debe:
- Crear pruebas automatizadas que intenten accesos cruzados (usuario de empresa A intenta ver vehículos de empresa B)
- Verificar que cada gap `MITIGADO EN CAPA SUPERIOR` esté efectivamente cubierto por pruebas existentes o agregar las que falten
- Ejecutarse independientemente del cronograma del Admin Global
- No modificar la lógica del Admin Global ni viceversa

### Principio para el Admin Global

El Admin Global realizará consultas globales (sin filtro tenant) **de forma intencional y explícita** a través de sus propios endpoints en `/api/platform/*`. No reutilizará rutas empresariales existentes con parámetros mágicos para obtener visibilidad global. Cada endpoint de plataforma debe declarar su intención de consulta global en su implementación, no heredarla de la ausencia de filtro.

---

## 26. Riesgos de duplicación

| Riesgo | Descripción | Mitigación |
|---|---|---|
| **Duplicar CommercialLead como "subscription" aparte** | Podría tentar crear una colección `subscriptions` separada. La suscripción YA está en `CommercialLead` | El Admin Global debe consultar `CommercialLead` como única fuente de verdad |
| **Duplicar usuarios como "platform_users"** | Si se usa `UserModel` para platform admins con un nuevo role, se mezclan dos identidades distintas | Crear colección separada `platform_users` para personal interno |
| **Duplicar planes en frontend** | El frontend del Admin Global podría hardcodear los planes | Consumir `GET /api/commercial/plans` como lo hace el portal |
| **Duplicar lógica de estado de suscripción** | `isActive` se computa en `auth-context.js`. El Admin Global podría recalcularlo | Reutilizar la misma lógica de `isActiveSubscription()` |
| **Duplicar componentes visuales** | Podría crear sus propios botones, cards, listas | Reutilizar componentes existentes (ver sección 19) |
| **Duplicar cliente HTTP** | Podría crear un segundo Axios instance sin las protecciones de seguridad existentes | Crear instancia Axios separada para el Admin (con clave `manecomb-platform-token`) que reutilice la misma configuración base (timeout, headers, manejo de errores) sin compartir el token mutable del portal |

---

## 27. Datos sensibles

### Campos que el Admin Global NO debe exponer

| Dato | Localización | Riesgo |
|---|---|---|
| `passwordHash` | `UserModel` | Acceso a cuentas |
| `resetTokenHash` | `UserModel` | Suplantación de identidad |
| `e2eePublicKey` | `UserModel` | Claves de cifrado E2EE |
| `e2eeKeyRotatedAt` | `UserModel` | Metadato de seguridad E2EE |
| `e2eeBackups` | `UserModel` | Backups de claves E2EE |
| `pushSubscriptions` | `UserModel` | Suscripciones push (token de dispositivo) |
| `refreshTokenHash` | `SessionModel` | Token de refresco hasheado (exponer permutaría ataque de hash) |
| `mercadoPagoAccessToken` | Variables de entorno | Procesamiento de pagos |
| `JWT_SECRET` | Variables de entorno | Firma de tokens |
| `mercadopago_webhook_secret` | Variables de entorno | Firma de webhooks |
| `paymentExternalReference` (completo) | `CommercialLeadModel` | Referencia de pago externa |
| `paymentProviderReference` | `CommercialLeadModel` | Referencia del proveedor |
| `providerPaymentId` | `CommercialLeadModel` | ID de pago en MP |
| Webhook payloads completos | `WebhookEventModel` | Datos del pagador |
| `customerReference` | `UserModel.paymentProfile` | Referencia de cliente en MP |

### Campos que el Admin Global SÍ debe mostrar (sanitizados)

| Dato | Fuente | Sanitización |
|---|---|---|
| Nombre de empresa | `CommercialLeadModel.companyName` | Ninguna |
| Propietario (nombre, email) | `UserModel` (role=owner) | Mostrar nombre + email, ocultar passwordHash, tokens |
| Plan contratado | `CommercialLeadModel.planName` | Ninguna |
| Estado de suscripción | `CommercialLeadModel.status` + `paymentStatus` | Computar `isActive` del lado servidor |
| Unidades registradas | `VehicleModel` (conteo por org) | Solo conteo, no ubicaciones |
| Usuarios activos | `UserModel` (conteo por org) | Solo conteo |
| Última actividad | `UserModel.lastAccessAt` | Ninguna |
| Fecha de registro | `CommercialLeadModel.createdAt` | Ninguna |
| Health del sistema | `getRuntimeReadiness()` | Ninguna |

---

## 28. Arquitectura recomendada

### Principios

1. **Colección separada de usuarios internos**: `PlatformUserModel` (colección `platform_users`) con roles `platform_owner`, `platform_admin`, `platform_support`, `platform_finance`, `platform_viewer`. Declarado en `backend/src/data/models.js`. No compartir `UserModel`.
2. **JWT independiente**: Tokens con `tokenType: "platform"`, `aud: "manecomb-platform-admin"`, `iss: "manecomb-api"` en el payload. Middleware `platformAuth` que rechace explícitamente tokens empresariales (sin `tokenType` o con `tokenType: "enterprise"`).
3. **Secret separado** (`PLATFORM_JWT_SECRET`): Las utilidades JWT actuales (`signToken`/`verifyToken` en `backend/src/utils/jwt.js`) aceptan `process.env.JWT_SECRET` como secret. El middleware `platformAuth` usará `process.env.PLATFORM_JWT_SECRET` directamente con `jsonwebtoken.sign()`/`verify()` para mantener segregación de secrets. No modificar `signToken()` existente.
4. **Módulo backend aislado**: `backend/src/modules/platform/` con sus propias rutas, servicios, validadores. Sin modificar módulos existentes.
4. **Rutas con prefijo `/api/platform/`**: Separadas de `/api/portal/` y `/api/`.
5. **Módulo frontend aislado**: `ventas/features/admin/` con su propio layout, screens, store, componentes. Reutilizando componentes visuales base.
6. **Rutas frontend con prefijo `/admin/`**: Separadas de `/portal/`.
7. **Consultas globales explícitas**: Cada endpoint del Admin Global debe declarar intencionalmente que no aplica filtro tenant, usando funciones explícitas como `listPlatformCompanies()`. No reutilizar `getOrganizationQuery()`.
8. **Auditoría obligatoria**: Toda acción del Admin Global debe registrar entrada en `AuditLogModel` usando `recordAuditLog()` con acciones `platform.*` y `metadata.actorType = "platform"`.

### Sesiones internas (PlatformSessionModel)

Las sesiones del Admin Global utilizan una colección separada `platform_sessions` con modelo `PlatformSessionModel` en `backend/src/data/models.js`.

| Aspecto | Decisión | Motivo |
|---|---|---|
| Colección | `platform_sessions` (separada de `sessions`) | Evita mezclar sesiones internas con empresariales. Permite revocación y políticas de expiración independientes |
| Persistencia | MongoDB (misma BD, colección distinta) | Sigue el mismo patrón que `SessionModel` |
| Primitivas de seguridad | Compartidas (no duplicadas) | `createRefreshToken()`, `hashRefreshToken()`, `getRequestIp()`, `getUserAgent()` se reutilizan desde `services/sessions.js` y `services/audit.js` |
| Refresco | Exclusivo: `POST /api/platform/auth/refresh` | No pasar por `/api/auth/refresh` empresarial ni viceversa |
| Expiración | Misma política (30 días) o más estricta | Configurable por variable de entorno `PLATFORM_REFRESH_TOKEN_TTL_DAYS` |
| MFA futuro | Campo `mfaVerified: Boolean` en la sesión | Sin modificar el flujo empresarial |

**Diferencia clave**: PERSISTENCIA SEPARADA ≠ LÓGICA DE SEGURIDAD DUPLICADA. La persistencia está separada (nueva colección, nuevo modelo). Las primitivas criptográficas (generación de tokens, hashing, extracción de datos) son compartidas mediante importación directa o adaptadores delgados.

### Aislamiento de sesión frontend

El Admin Global NO debe compartir el token de acceso con el Portal empresarial. La estrategia recomendada es:

1. **Clave de almacenamiento separada**: `localStorage` con clave `manecomb-platform-token` (vs `manecomb-ventas-token` del portal).
2. **Instancia Axios separada**: Crear `platformApiClient` (nueva instancia de Axios) dentro del módulo `features/admin/`, con su propio interceptor de refresh y su propia gestión de `Authorization` header. No reutilizar `apiClient` del portal.
3. **Store Zustand separado**: `useAdminStore` gestiona su propio estado de sesión (`platformToken`, `platformUser`, `platformSession`), sin tocar `useAppStore`.
4. **Funciones base reutilizables**: El refresh token, el manejo de errores 401, y la configuración de interceptores pueden copiarse como referencia o compartirse mediante un helper importable, pero operando siempre sobre la instancia aislada.
5. **Conviviencia de sesiones**: Un usuario podría tener abierta simultáneamente una pestaña del Portal (con token empresarial) y otra del Admin Global (con token platform). Cada instancia Axios gestiona su propio token sin interferencias.

Alternativas evaluadas:
1. ✅ **Instancia Axios separada + token provider por contexto** — Recomendada. Bajo riesgo, aislamiento total, sin modificar `apiClient` existente.
2. ❌ Interceptor específico del módulo Admin sobre `apiClient` compartido — Riesgo de fuga de token platform a llamadas del portal.
3. ❌ Token provider global por contexto React — Incompatible con la arquitectura actual (el token se gestiona en el store Zustand, no en contexto React).

### `canAccessAllTenants` como mecanismo heredado (LEGACY PLATFORM ACCESS)

`canAccessAllTenants()` (`backend/src/middlewares/access-control.js:63`) es un mecanismo existente que permite a ciertos usuarios (`role === "admin" && accountType !== "company_owner"`) acceder a datos de todos los tenants. **No debe utilizarse en las rutas nuevas `/api/platform/*`**.

Los usuarios de `platform_users` no dependerán de:
- `accountType` — no existe en platform users
- `organizationId` — no aplica a personal interno
- `role: "admin"` — los platform users tienen roles `platform_*`
- `canAccessAllTenants()` — es específico del modelo empresarial

**Fase futura**: ADM-LEGACY-ADMIN-01 se encargará de retirar este bypass de forma controlada:
1. Localizar todos los usos de `canAccessAllTenants()` en el código
2. Migrar los endpoints internos que aún dependen de él al nuevo `platformAuth`
3. Conservar compatibilidad durante la transición
4. Agregar pruebas de regresión
5. Eliminar el bypass únicamente cuando el Admin Global nuevo esté funcionando en producción

No retirar este comportamiento en ADM-SEC-01.

### Diagrama de separación conceptual

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                          │
│                                                      │
│  /ventas/*    → Módulo Ventas (público)              │
│  /portal/*    → Portal empresarial (protegido)       │
│  /admin/*     → Admin Global (protegido, nuevo)      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    BACKEND                           │
│                                                      │
│  /api/auth/*            → Auth empresarial            │
│  /api/portal/*          → Portal empresarial          │
│  /api/commercial/*      → Comercial (ambos)           │
│  /api/platform/*        → Admin Global (nuevo)        │
│  /api/platform/auth/*   → Auth interna (nuevo)        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    DATOS                             │
│                                                      │
│  users           → Usuarios empresariales            │
│  platform_users  → Usuarios internos (nuevo)         │
│  commercial_leads→ Órdenes y suscripciones           │
│  vehicles        → Unidades                          │
│  audit_logs      → Auditoría empresarial e interna   │
│                   → (acciones platform.* en metadata) │
└─────────────────────────────────────────────────────┘
```

---

## 29. Alternativas evaluadas

### A1: Extender UserModel con roles platform (DESCARTADA)

Usar la misma colección `users` agregando roles tipo `platform_admin`, `platform_owner`, etc.

**Problemas**:
- Mezcla usuarios internos con empresariales en la misma colección
- El middleware `authenticate.js` y `access-control.js` requerirían cambios profundos
- Riesgo de que un platform admin se convierta en company_owner por error de datos
- El interceptor de refresh existente asume usuarios empresariales
- El frontend existente cargaría estos usuarios en `loadUsers()`

### A2: Crear subdocumento "platformProfile" en UserModel (DESCARTADA)

Agregar un campo `platformProfile: { role, permissions }` opcional en `UserModel`.

**Problemas**:
- Sigue mezclando colecciones
- Complica los queries existentes (siempre habría que excluir platform users)
- El sanitizeUser() actual no filtraría platformProfile automáticamente
- Más riesgoso que una colección separada y menos mantenible

### A3: Proxy inverso con autenticación separada (DESCARTADA)

Ejecutar el Admin Global como una aplicación completamente independiente con su propio backend y base de datos.

**Problemas**:
- Duplica lógica de consulta de datos comerciales
- Requiere comunicación entre servicios (RPC, cola, o BD compartida)
- Duplica cliente HTTP, tipos, componentes visuales
- Más complejidad operativa (otro deployment, otro dominio, otro certificado SSL)
- Rompe el objetivo de no crear segunda fuente de verdad

### A4: Single admin endpoint que expone todo (DESCARTADA)

Crear un único endpoint `/api/platform/overview` que devuelva todo el estado del sistema.

**Problemas**:
- Acoplamiento fuerte: un cambio en cualquier modelo requiere cambiar este endpoint
- Violación del principio de responsabilidad única
- Dificulta la paginación, filtrado y búsqueda
- Mayor riesgo de exponer datos sensibles accidentalmente

### A5: Identidad separada + reutilización de seguridad compartida (RECOMENDADA)

**IDENTIDAD SEPARADA**: Los usuarios internos residen en su propia colección (`platform_users`) con roles específicos (`platform_owner`, `platform_admin`, etc.). No comparten `UserModel` con usuarios empresariales. Esto evita que un error de datos (`accountType`) convierta a un admin empresarial en platform admin.

**SEGURIDAD COMPARTIDA**: Las primitivas de seguridad (hashing, JWT, sesiones, rate limiting, auditoría) se reutilizan desde su ubicación actual mediante importación directa o adaptadores delgados. No se duplica la implementación de autenticación empresarial dentro del módulo platform.

Esta alternativa:
- No modifica código existente de autenticación
- No mezcla colecciones de usuarios
- Reutiliza datos existentes (CommercialLead, Vehicle, etc.) sin duplicar
- Reutiliza primitivas de seguridad (hashing, JWT, sesiones, rate limiting, auditoría)
- Permite MFA futuro sin afectar usuarios empresariales
- Es compatible con la arquitectura actual

---

## 30. Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| A1: Extender UserModel | Mezcla identidades; alto riesgo de regresión |
| A2: Subdocumento platformProfile | Misma colección; complejidad en queries |
| A3: Aplicación independiente | Duplicación; complejidad operativa; riesgo de inconsistencias |
| A4: Endpoint único | Acoplamiento; viola SRP; difícil de mantener |
| A5: Modelos separados en `modules/platform/models/` | Inconsistente con la convención real del código (todos los modelos en `models.js`). Mayor riesgo de confusión, complejidad en queries cross-model |

---

## 31. Estructura futura de carpetas

### Backend: nuevo módulo `platform`

```
backend/src/modules/platform/
├── routes/
│   ├── auth.routes.js        # Login/refresh/logout interno
│   ├── overview.routes.js    # Resumen global (read model)
│   ├── companies.routes.js   # Listado/detalle empresas (read models)
│   ├── subscriptions.routes.js # Suscripciones globales (read models)
│   ├── orders.routes.js      # Órdenes globales (read models)
│   ├── payments.routes.js    # Pagos globales (read models)
│   ├── users.routes.js       # Usuarios empresariales (global)
│   ├── vehicles.routes.js    # Unidades globales (read models)
│   ├── system.routes.js      # Health + readiness (protegido, sanitizado)
│   └── # Auditoría: reutilizar GET /api/audit-logs con filtro actions=platform.*
├── services/
│   └── platform-auth.js      # Auth interna (reutiliza primitivas de seguridad)
├── middlewares/
│   ├── platform-auth.js      # Verifica JWT con tokenType="platform"
│   └── platform-role.js      # Verifica rol platform_*
└── validators/
    └── platform-validators.js # Validación de entrada

# Los modelos viven en backend/src/data/models.js:
#   - PlatformUserModel  → colección platform_users
#   - PlatformSessionModel → colección platform_sessions
# El data layer se extiende en backend/src/data/mongo-store.js
```

### Frontend: nuevo módulo `admin`

```
ventas/features/admin/
├── components/
│   ├── admin-layout.tsx      # Layout con sidebar admin
│   ├── admin-data-list.tsx   # componente propio o wrapper de UI compartida
│   ├── admin-button.tsx      # utiliza primitives de src/components/ui
│   └── admin-status-badge.tsx# (reutiliza StatusBadge)
├── screens/
│   ├── admin-login-screen.tsx       # Login interno (ruta separada)
│   ├── admin-dashboard-screen.tsx   # Resumen global
│   ├── admin-companies-screen.tsx   # Listado de empresas
│   ├── admin-company-detail-screen.tsx # Detalle de empresa
│   ├── admin-subscriptions-screen.tsx  # Suscripciones
│   ├── admin-orders-screen.tsx      # Órdenes
│   ├── admin-payments-screen.tsx    # Pagos
│   ├── admin-users-screen.tsx       # Usuarios global
│   ├── admin-vehicles-screen.tsx    # Unidades global
│   ├── admin-system-screen.tsx      # Health + sistema
│   └── admin-audit-screen.tsx       # Auditoría
├── store/
│   ├── use-admin-store.ts    # Store Zustand para admin
│   ├── admin-types.ts        # Tipos del Admin Global
│   └── admin-actions.ts      # Acciones del store
├── utils/
│   ├── admin-access.ts       # Guards de acceso platform
│   └── admin-format.ts       # Formateo específico admin
└── api/
    └── admin-api.ts          # Llamadas a /api/platform/*
```

---

## 32. Endpoints futuros propuestos

```
POST   /api/platform/auth/login         # Login de personal interno
POST   /api/platform/auth/refresh       # Refresh de token interno
POST   /api/platform/auth/logout        # Logout interno
POST   /api/platform/auth/logout-all    # Cerrar todas las sesiones internas

GET    /api/platform/overview           # Resumen global (empresas, suscripciones, pagos, salud)

GET    /api/platform/companies          # Listado paginado de empresas
GET    /api/platform/companies/:id      # Detalle de empresa (info, owner, plan, suscripción)
GET    /api/platform/companies/:id/users    # Usuarios de una empresa
GET    /api/platform/companies/:id/vehicles # Unidades de una empresa
GET    /api/platform/companies/:id/activity # Actividad reciente de una empresa
GET    /api/platform/companies/:id/audit    # Auditoría de una empresa

GET    /api/platform/subscriptions      # Listado global de suscripciones
GET    /api/platform/subscriptions/:id  # Detalle de suscripción

GET    /api/platform/orders             # Órdenes globales
GET    /api/platform/orders/:id         # Detalle de orden

GET    /api/platform/payments           # Pagos globales
GET    /api/platform/payments/:id       # Detalle de pago

GET    /api/platform/users              # Usuarios global
GET    /api/platform/users/:id          # Detalle de usuario

GET    /api/platform/vehicles           # Unidades global
GET    /api/platform/vehicles/:id       # Detalle de unidad

GET    /api/platform/system/health      # Salud del sistema
GET    /api/platform/system/readiness   # Readiness del sistema

# La auditoría se consulta reutilizando el endpoint existente:
# GET /api/audit-logs?action=platform.*&organizationId=<id>
# usando metadata.actorType = "platform" para filtrar acciones internas
```

Todos los endpoints requieren:
- Middleware `platformAuth` (rechaza tokens empresariales)
- Middleware `platformRole` según el permiso requerido
- Paginación en backend (`page`, `limit` con tamaño máximo)
- Búsqueda en backend (`search`, `q`)
- Filtros en backend (`status`, `planId`, `from`, `to`)
- Ordenamiento controlado (`sort`, `order`)
- Validación de identificadores (UUID v4)
- Sanitización de respuestas (sin secretos, tokens, payloads de proveedores)

---

## 33. Permisos internos propuestos

| Rol | Descripción | Permisos |
|---|---|---|
| `platform_owner` | Propietario de la plataforma | Acceso total a todas las funciones |
| `platform_admin` | Administrador interno | Todo excepto gestión de otros admins y cambios de configuración crítica |
| `platform_support` | Soporte técnico | Ver empresas, usuarios, suscripciones. Operaciones limitadas (suspender, reactivar con aprobación) |
| `platform_finance` | Finanzas | Ver y gestionar planes, órdenes, pagos, facturas. Sin acceso a datos operativos |
| `platform_viewer` | Solo lectura | Ver todos los datos sin capacidad de modificar nada |

No implementar todavía — definir en ADM-SEC-01.

---

## 33-B. Tipo explícito de token y comportamiento de rechazo

Los tokens del Admin Global deben incluir los siguientes campos en el payload JWT:

```js
{
  sub: platformUserId,
  tokenType: "platform",
  role: "platform_owner",       // o platform_admin, platform_support, etc.
  sid: platformSessionId,
  aud: "manecomb-platform-admin",
  iss: "manecomb-api"
}
```

**Evaluación de las utilidades JWT actuales** (`backend/src/utils/jwt.js`):

| Capacidad | ¿Soportada? | Detalle |
|---|---|---|
| Secret personalizado | Parcial | `signToken()` usa `JWT_SECRET` de entorno. Para `PLATFORM_JWT_SECRET` se llamará a `jsonwebtoken.sign()` directamente con el secret específico |
| `audience` | Sí | `jsonwebtoken.sign(payload, secret, { audience: "manecomb-platform-admin" })` |
| `issuer` | Sí | `jsonwebtoken.sign(payload, secret, { issuer: "manecomb-api" })` |
| Expiración específica | Sí | `jsonwebtoken.sign(payload, secret, { expiresIn: "15m" })` — configurable vía `PLATFORM_JWT_EXPIRES_IN` |
| Reutilizar `signToken()` | **No recomendado** | `signToken()` usa `JWT_SECRET` hardcodeado y no acepta audience/issuer. Se creará `signPlatformToken()` como adaptador que llame a `jsonwebtoken.sign()` directamente, reutilizando la misma librería |

**Conclusión**: Las primitivas JWT de `jsonwebtoken` se reutilizan (misma librería). La función `signToken()` existente no se modifica. Se crea `signPlatformToken()` como función nueva que usa `PLATFORM_JWT_SECRET`. `verifyToken()` puede reutilizarse si se le pasa el secret correcto, o se crea `verifyPlatformToken()`.

Comportamiento de rechazo del middleware `platformAuth`:

| Escenario | Código | Comportamiento |
|---|---|---|
| Token empresarial (sin `tokenType` o con `tokenType: "enterprise"`) | 403 | Rechazar con mensaje controlado: `"Acceso exclusivo para personal interno de ManeComb"` |
| Token platform válido | 200 | Continuar |
| Token platform expirado | 401 | `"Token expirado"` — refresh token disponible |
| Token platform con rol insuficiente | 403 | `"No tienes permisos suficientes"` |
| Token malformado | 401 | `"Token inválido"` |
| Sin token | 401 | `"Token requerido"` |

Los tokens empresariales existentes NO deben modificarse. El middleware `platformAuth` los rechazará automáticamente por carecer de `tokenType`. Esto garantiza que ninguna cuenta empresarial pueda usar rutas de plataforma sin cambios en el sistema actual.

---

## 33-C. Aprovisionamiento inicial del primer platform_owner

No debe existir un endpoint público `POST /api/platform/auth/register`. El primer usuario de plataforma debe crearse mediante un mecanismo controlado, fuera de línea.

**Mecanismo propuesto**: Script interno `npm run platform:create-owner` (en `backend/`) que:

| Requisito | Implementación |
|---|---|
| Ejecución manual | Script Node.js en `backend/scripts/platform-create-owner.js`, invocado explícitamente por el operador |
| Entorno permitido | Validar `NODE_ENV === "production"` o `"development"` — nunca ejecutable desde código de aplicación |
| Correo único | Validar que no exista un `platform_owner` previo en `PlatformUserModel` |
| Contraseña segura | Aplicar `passwordPolicy.validate()` desde `backend/src/utils/password-policy.js` |
| Sin valores predeterminados | Exigir todas las entradas por variable de entorno o prompt: `PLATFORM_OWNER_EMAIL`, `PLATFORM_OWNER_PASSWORD` |
| No imprimir la contraseña | Usar `read -s` en entorno interactivo o leer de variable/env, nunca mostrarla en stdout |
| No insertar credenciales en Git | Las variables de entorno usadas por el script no deben estar en `.env.example` con valores reales |
| Registrar fecha de creación | `PlatformUserModel.createdAt` + auditoría mediante adaptador `recordPlatformAction()` que construye un objeto `req` compatible. No pasar `null` a `recordAuditLog()` porque espera un objeto `req` con `req.user.id`, `req.headers['user-agent']`, `req.ip` |
| Evitar duplicados | Consulta previa: si ya existe un usuario con `role: "platform_owner"`, abortar con mensaje claro |
| Rotación o recuperación | Script separado `platform:reset-owner-password` para futura recuperación controlada |

Ejemplo de invocación:
```bash
cd backend
PLATFORM_OWNER_EMAIL=owner@manecomb.com \
PLATFORM_OWNER_PASSWORD="<segura>" \
npm run platform:create-owner
```

No implementar este script todavía — el diseño detallado corresponde a ADM-SEC-01.

---

## 34. Plan de pruebas

### Pruebas a agregar en ADM-SEC-01

- Unit tests para `PlatformUserModel` (creación, roles, unique email)
- Unit tests para middleware `platformAuth` (acepta token platform, rechaza token enterprise, rechaza sin token)
- Unit tests para middleware `platformRole` (permite roles correctos, rechaza roles insuficientes)
- Integration tests para login/refresh/logout de platform users

### Pruebas a agregar en ADM-API-BASE-01, ADM-COMPANIES-01, ADM-COMMERCIAL-01

- Integration tests para cada endpoint GET de plataforma (paginación, búsqueda, filtros)
- Tenant isolation tests: un platform admin debe ver datos de todas las empresas; un admin empresarial NO debe poder acceder a `/api/platform/*`
- Negative tests: IDs inválidos, tokens expirados, tokens empresariales, roles insuficientes
- Rate limit tests para endpoints de plataforma

### Pruebas existentes que deben seguir pasando

Los 34 archivos de prueba en `backend/test/`, incluyendo `tenant-isolation.test.js`, deben seguir pasando sin modificaciones.

---

## 35. Plan por fases (sin superposición)

| Fase | Nombre | Descripción | Dependencias |
|---|---|---|---|
| ADM-ARCH-01 | Auditoría y arquitectura | Presente documento (R2). Auditoría completa del código real para definir la arquitectura del Admin Global | Ninguna |
| ADM-SEC-01 | Identidad y autenticación backend | Creación de `PlatformUserModel` y `PlatformSessionModel` en `models.js`, login/refresh/logout interno, middlewares `platformAuth` y `platformRole`, roles platform, aprovisionamiento inicial, rate limiting, sanitización, auditoría de login/logout. **Solo backend, sin frontend. Sin MFA. Sin endpoints de negocio.** No habilitado para producción | ADM-ARCH-01 |
| ADM-SEC-MFA-01 | MFA obligatorio | MFA para `platform_owner` y `platform_admin`. Recuperación controlada, códigos de respaldo. Evaluar obligatoriedad para `platform_support`, `platform_finance`, `platform_viewer`. No habilitar Admin Global en producción sin MFA para owner y admin | ADM-SEC-01 |
| ADM-UI-AUTH-01 | Login y sesión frontend | Pantalla de login, `useAdminStore`, `platformApiClient` (instancia Axios aislada con clave `manecomb-platform-token`), restauración de sesión desde `localStorage`. **Solo frontend** | ADM-SEC-MFA-01 |
| ADM-API-BASE-01 | Router y utilities platform | Router platform común (`/api/platform/`), validación compartida, paginación, serializers, filtros controlados, manejo de errores. **Sin endpoints de negocio completos** | ADM-SEC-01 |
| ADM-COMPANIES-01 | Empresas (read models) | Listado paginado y detalle global de empresas mediante `PlatformCompanyView` DTO construido desde `organizationId`, `CommercialLeadModel`, `UserModel` del propietario, conteos de `UserModel`/`VehicleModel`, plan desde `commercial-plans.js`, estado comercial desde servicios existentes | ADM-API-BASE-01 |
| ADM-COMMERCIAL-01 | Planes, suscripciones, órdenes y pagos | Endpoints de solo lectura usando `CommercialLeadModel` como única fuente de verdad. DTOs `PlatformSubscriptionView`, `PlatformOrderView`, `PlatformPaymentView`. Sin modificar lógica comercial existente, sin nuevos estados, sin cálculos en frontend | ADM-API-BASE-01 |
| ADM-SYSTEM-01 | Salud del sistema | Endpoint protegido `GET /api/platform/system` que reutiliza internamente `getRuntimeReadiness()` y `getOperationalInsights()`. Sin exponer secretos, variables de entorno, rutas internas, payloads completos de errores ni información sensible de infraestructura | ADM-API-BASE-01 |
| ADM-UI-01 | Layout y navegación | `AdminLayout` independiente (no basado en `PortalLayout`). Sidebar, header, navegación. Reutiliza solo componentes de `ventas/src/components/ui/` y `ventas/constants/` | ADM-UI-AUTH-01 |
| ADM-ACTIONS-01 | Acciones sensibles | Suspender/reactivar empresas, cambiar plan, forzar activación. Auditoría obligatoria con `recordAuditLog()` y acciones `platform.*` | ADM-COMPANIES-01 + ADM-COMMERCIAL-01 + ADM-UI-01 |
| ADM-AUDIT-01 | Interfaz de auditoría | Consultas y visualización sobre `AuditLogModel` existente usando acciones `platform.*` y filtro `metadata.actorType = "platform"`. No crear colección separada | ADM-API-BASE-01 + ADM-UI-01 |
| ADM-LEGACY-ADMIN-01 | Retiro del bypass heredado | Localizar todos los usos de `canAccessAllTenants()`. Migrar endpoints internos al nuevo `platformAuth`. Conservar compatibilidad durante transición. Agregar pruebas. Eliminar bypass solo cuando Admin Global nuevo esté funcionando en producción | ADM-SEC-01 + ADM-API-BASE-01 |
| ADM-HARDEN-01 | Endurecimiento productivo | Rate limiting específico, revisión de seguridad, pruebas de carga, validación productiva completa | Todas las anteriores |

### Priorización

1. **ADM-SEC-01**: Backend de autenticación interna. Sin esto no puede haber Admin Global. Exclusivamente backend, sin MFA, sin endpoints de negocio. No habilitado para producción
2. **ADM-SEC-MFA-01**: MFA obligatorio antes de cualquier exposición. El Admin Global no se considera habilitable en producción sin MFA para `platform_owner` y `platform_admin`
3. **ADM-UI-AUTH-01 + ADM-API-BASE-01**: Pueden diseñarse en paralelo. Login frontend dependiente de MFA. API base no requiere frontend
4. **ADM-COMPANIES-01, ADM-COMMERCIAL-01, ADM-SYSTEM-01**: Endpoints de negocio en paralelo, cada uno sobre ADM-API-BASE-01
5. **ADM-UI-01 + ADM-ACTIONS-01 + ADM-AUDIT-01**: Interfaces de usuario y acciones sensibles
6. **ADM-LEGACY-ADMIN-01 + ADM-HARDEN-01**: Al final, una vez que el Admin Global esté funcionando y probado en un entorno seguro

---

## 36. Archivos previstos para ADM-SEC-01

ADM-SEC-01 es **exclusivamente backend**. No incluye frontend, componentes visuales, store Zustand, ni pantallas. Todos los modelos se declaran en `backend/src/data/models.js` siguiendo la convención actual.

### MODIFICACIONES EN ARCHIVOS EXISTENTES

| Archivo | Cambio | Riesgo |
|---|---|---|
| `backend/src/data/models.js` | Agregar `PlatformUserModel` (colección `platform_users`) y `PlatformSessionModel` (colección `platform_sessions`). Seguir la misma estructura de `UserModel` y `SessionModel` existentes | Bajo — modificación directa y controlada, no altera lógica empresarial existente |
| `backend/src/data/mongo-store.js` | Extender el data layer con funciones explícitas globales para `PlatformUserModel` y `PlatformSessionModel` (create, findByEmail, findById, update, etc.) | Medio — las funciones platform deben declarar explícitamente su carácter global. No usar `getOrganizationQuery()` como bypass. No modificar lógica tenant de funciones empresariales existentes |
| `backend/src/app.js` | Agregar `app.use('/api/platform', platformAuth, platformRoutes)` | Bajo — solo añadir una línea de montaje |

### NUEVOS (backend)

| Archivo | Propósito |
|---|---|
| `backend/src/modules/platform/routes/auth.routes.js` | Login/refresh/logout interno |
| `backend/src/modules/platform/services/platform-auth.js` | Lógica de autenticación interna (reutiliza primitivas de seguridad existentes, no las duplica) |
| `backend/src/modules/platform/middlewares/platform-auth.js` | Middleware que verifica JWT con `tokenType: "platform"`, rechaza tokens empresariales (403) |
| `backend/src/modules/platform/middlewares/platform-role.js` | Middleware de verificación de roles platform_* |
| `backend/src/modules/platform/validators/platform-validators.js` | Validadores de entrada para auth interna |
| `backend/src/config/platform-roles.js` | Configuración de roles y permisos de plataforma |
| `backend/scripts/platform-create-owner.js` | Script interno para aprovisionamiento del primer `platform_owner` |
| `test/platform-auth.test.js` | Pruebas de autenticación interna |
| `test/platform-middleware.test.js` | Pruebas de middleware platform |

### NO TOCAR (en ADM-SEC-01)

| Archivo | Motivo |
|---|---|
| `ventas/src/App.tsx` | Las rutas `/admin/*` corresponden a ADM-UI-AUTH-01, no a ADM-SEC-01 |
| `ventas/features/admin/` | Todo el frontend admin corresponde a fases posteriores |
| Cualquier archivo en `ventas/` | Sin cambios en ADM-SEC-01 |

---

## 37. Archivos explícitamente fuera de alcance

### Backend: no modificar

```
backend/src/modules/auth/         — Auth empresarial (no tocar)
backend/src/modules/account/      — Suscripción por empresa (no tocar)
backend/src/modules/commercial/   — Webhooks, checkout (no tocar)
backend/src/modules/portal/       — Portal empresarial (no tocar)
backend/src/modules/dashboard/    — Dashboard operativo (no tocar)
backend/src/modules/locations/    — GPS (no tocar)
backend/src/modules/navigation/   — Rutas (no tocar)
backend/src/modules/chat/         — Chat (no tocar)
backend/src/modules/documents/    — Documentos (no tocar)
backend/src/modules/incidents/    — Incidencias (no tocar)
backend/src/modules/notifications/— Notificaciones (no tocar)
backend/src/modules/radio/        — Radio (no tocar)
backend/src/modules/rtc/          — WebRTC (no tocar)
backend/src/modules/ops/          — Observabilidad existente (no modificar, solo consumir)
backend/src/modules/audit-logs/   — Auditoría empresarial (no modificar)
backend/src/services/commercial-payment.js  — Lógica MP (no tocar)
backend/src/services/webhook-idempotency.js  — Idempotencia (no tocar)
backend/src/services/checkout-idempotency.js — Idempotencia (no tocar)
backend/src/services/auth-context.js  — Contexto empresarial (no tocar)
backend/src/services/runtime-readiness.js   — Readiness (no modificar, solo consumir)
backend/src/middlewares/authenticate.js     — Auth empresarial (no tocar)
backend/src/middlewares/access-control.js   — Control empresarial (no tocar)
backend/src/middlewares/require-admin.js    — Admin empresarial (no tocar)
backend/src/middlewares/portal-access.js    — Portal empresarial (no tocar)
backend/src/middlewares/operational-access.js — Gating suscripción (no tocar)
backend/src/data/mongo-store.js  — Store MongoDB (no modificar)
backend/src/data/store.js        — Store embebido (no modificar)
backend/src/sockets/index.js     — Socket.IO (no tocar)
```

### Frontend: no modificar

```
ventas/src/App.tsx               — Router principal (solo agregar ruta /admin)
ventas/src/lib/api.ts            — Cliente HTTP (no modificar, solo agregar funciones)
ventas/src/store/use-app-store.ts — Store global (no tocar)
ventas/src/types/app.ts          — Tipos existentes (no modificar, solo leer)
ventas/features/portal/          — Portal empresarial completo (no tocar)
ventas/screens/                   — Landing y auth (no tocar)
```

### Otros

```
mobile/           — App operativa (no tocar)
communication-service/ — Comunicaciones (no tocar)
shared/           — Contrato compartido (no tocar, pero se puede extender)
desktop/          — Histórico (no tocar)
infra/            — Infraestructura (no tocar)
docker-compose*.yml — Config Docker (no tocar)
.github/          — CI/CD (no tocar)
```

---

## 38. Dudas o información no verificable

| Duda | Estado | Explicación |
|---|---|---|
| ¿Existe una colección explícita de "empresas"? | **NO ENCONTRADO** | No hay modelo `Organization`, `Company` o `Tenant`. La empresa es implícita por `organizationId` |
| ¿Existe un modelo de "membresía"? | **NO ENCONTRADO** | No hay modelo `Membership`. La pertenencia a empresa es por `organizationId` en `UserModel` |
| ¿Existen "add-ons" como entidad separada? | **NO ENCONTRADO** | Los add-ons son un array embebido en `CommercialLeadModel.addOns` |
| ¿Existe un modelo de "factura"? | **NO VERIFICADO** | Existe `PortalInvoice` en los tipos frontend y endpoints `/api/account/invoices`, pero no se encontró el modelo Mongoose en `models.js`. Podría estar en otro archivo o ser generado dinámicamente |
| ¿Existe modelo de "límite" separado? | **NO ENCONTRADO** | El límite de unidades es `CommercialLeadModel.fleetSize`. No hay un modelo separado |
| ¿Existe caché Redis de sesiones? | **EXISTENTE** | Redis se usa para Socket.IO y rate limiting. No se verificó si las sesiones también se cachean en Redis |
| ¿El in-memory store (store.js) está activo en producción? | **NO VERIFICADO** | `mongo-store.js` es el principal. `store.js` parece ser un fallback o para desarrollo |
| ¿Hay algún endpoint de webhook de Suscripciones de Mercado Pago? | **NO ENCONTRADO** | Solo se encontraron webhooks de `mercadopago` (pagos) y `mercadopago/chargebacks`. No hay webhooks de `subscriptions` preapproval |
| ¿Existe un modelo `PlatformUser` ya creado? | **NO ENCONTRADO** | No existe ninguna referencia a `PlatformUser` en el código. Tampoco existe colección `platform_users` |
| ¿Hay algún archivo de configuración de roles de plataforma? | **NO ENCONTRADO** | Los roles están hardcodeados en `access-control.js` y `portal-access.js`. No hay configuración externa |
| ¿La auditoría actual registra cambios de estado? | **NO VERIFICADO** | `AuditLogModel` tiene campo `metadata: Mixed` que podría contener `oldState`/`newState`, pero no se verificó su uso en acciones específicas |

---

## 39. Conclusión

El proyecto **ManeComb** está en una posición favorable para incorporar un Admin Global. La arquitectura existente ya contempla nociones de acceso global, aunque mediante mecanismos heredados que serán retirados.

**Fortalezas reales**:
- Fuentes de datos estandarizadas: `organizationId` como clave tenant en MongoDB
- `CommercialLeadModel`, `UserModel`, `VehicleModel`, `AuditLogModel` como modelos consolidados
- Servicios comerciales existentes (sin necesidad de nuevos estados ni colecciones)
- Salud y readiness del sistema ya implementados
- Primitivas criptográficas existentes (jsonwebtoken, bcrypt)
- Componentes UI verdaderamente compartidos (`ventas/src/components/ui/`)
- 34 pruebas existentes que sirven como red de seguridad

**Debilidades identificadas**:
- No existe colección separada para usuarios internos de plataforma
- No existe autenticación diferenciada para personal interno
- No existe auditoría de acciones administrativas
- Algunas consultas de vehículos y documentos carecen de filtro tenant
- La detección de platform admin depende de un solo campo (`accountType`)
- No hay MFA, rate limiting diferenciado, ni sesiones de soporte temporales

**Riesgos principales**:
1. Mezclar usuarios de plataforma con usuarios empresariales en `UserModel` (riesgo ALTO)
2. Exponer consultas globales sin validación explícita (riesgo ALTO)
3. No registrar auditoría de acciones administrativas (riesgo ALTO)
4. Dependencia de `accountType` para separar admin empresarial de platform (riesgo MEDIO)

**Deuda técnica que no bloquea**:
- Gaps en tenant isolation de vehículos y documentos (mitigados por middleware, no urgentes)
- `listCommercialOrders()` sin filtro tenant (usar siempre `listCommercialOrdersForUser()`)
- Falta de colección `Organization` (el `organizationId` implícito funciona, pero complica consultas de metadatos de empresa)

---

## 40. Recomendación de avanzar o no

**SÍ, RECOMENDAMOS AVANZAR A ADM-SEC-01.**

La arquitectura actual soporta la incorporación del Admin Global sin modificaciones traumáticas. Los riesgos identificados son manejables mediante:

1. Creación de colección separada `platform_users` (no modificar `users`)
2. JWT independiente con `type: "platform"` (rechazar tokens enterprise en middleware platform)
3. Módulo backend `platform/` aislado (no modificar módulos existentes)
4. Módulo frontend `admin/` aislado (reutilizar componentes visuales sin modificar portal)
5. Consultas globales explícitas en endpoints de plataforma (no reutilizar `getOrganizationQuery()`)
6. Auditoría obligatoria reutilizando `AuditLogModel` existente con `action` con prefijo `platform.*` y `metadata.actorType = "platform"`. No crear colección separada

La deuda técnica identificada (gaps en tenant isolation de vehículos, documentos y órdenes) debe documentarse pero **no bloquear** el inicio de ADM-SEC-01.

**Prerrequisitos para ADM-SEC-01**:
- Archivos nuevos creados: `ADM-ARCH-01.md` (esta auditoría). `RC-MOBILE-UI-AUDIT-01.md` (ajeno, preexistente sin rastrear)
- Sin archivos modificados (confirmado)
- Sin cambios en lógica existente (confirmado)
- Sin cambios staged. Archivos sin rastrear: `ADM-ARCH-01.md`, `RC-MOBILE-UI-AUDIT-01.md`
- `git diff --check` sin errores (confirmado)

---

## Tabla de fuentes oficiales

| Dato | Fuente oficial | Repositorio/servicio | Endpoint relacionado | Contexto tenant | Uso en Admin Global | Riesgo |
|---|---|---|---|---|---|---|
| Empresa | `organizationId` implícito en documentos | `mongo-store.js` / `store.js` | N/A (implícito) | Sí | Consultar empresas únicas | No hay colección de metadatos de empresa |
| Propietario | `UserModel` con `role:"owner"` + `accountType:"company_owner"` | `mongo-store.js` / `user-service.js` | `GET /api/users` | Sí | Identificar dueño por empresa | Exponer datos de contacto |
| Usuario | `UserModel` | `mongo-store.js` | `GET /api/users` | Sí | Listar usuarios | Exponer passwordHash, e2ee keys |
| Membresía | No existe modelo separado | N/A | N/A | N/A | Deducir por `organizationId` | Sin membresías explícitas |
| Rol | `UserModel.role` | `mongo-store.js` | N/A | No | Agrupar por rol | Ninguno |
| Permiso | `ROLE_PERMISSIONS` (código) | `access-control.js` | N/A | No | Solo referencia | Es regla de código, no consultable |
| Unidad | `VehicleModel` | `mongo-store.js` | `GET /api/vehicles` | Sí | Conteo y detalle | Gaps en tenant isolation |
| Conductor | `UserModel` con `role:"driver"` | `mongo-store.js` | `GET /api/users` | Sí | Listar conductores | Datos personales |
| Supervisor | `UserModel` con `role:"supervisor"` | `mongo-store.js` | `GET /api/users` | Sí | Listar supervisores | Datos personales |
| Plan | `commercial-plans.js` (config) | `config/commercial-plans.js` | `GET /api/commercial/plans` | No | Catálogo de planes | Ninguno |
| Límite | `CommercialLeadModel.fleetSize` | `payment-store-service.js` | `GET /api/account/subscription` | Sí | Límite de unidades por empresa | fleetSize puede diferir de unidades reales |
| Add-on | `CommercialLeadModel.addOns` | `commercial-payment.js` | `GET /api/account/subscription` | Sí | Add-ons contratados | Ninguno |
| Orden | `CommercialLeadModel` | `payment-store-service.js` | `GET /api/commercial/plans` | Sí | Historial de órdenes | listCommercialOrders() sin filtro |
| Pago | `CommercialLeadModel.paymentStatus` | `commercial-payment.js` | Webhooks MP | Sí | Estado de pagos | Exponer payloads completos |
| Suscripción | `CommercialLeadModel` | `auth-context.js` | `GET /api/account/subscription` | Sí | Estado de suscripción | `isActive` se computa |
| Documento | `DocumentModel` | `document-service.js` | `GET /api/documents/admin` | Sí | Revisión global | Documentos sensibles |
| Actividad | `AuditLogModel` + `RouteEventModel` + `AppEventModel` | `audit.js` / `telemetry.js` | `GET /api/audit-logs` | Sí | Línea de tiempo | Disperso en múltiples colecciones |
| Auditoría | `AuditLogModel` | `audit.js` | `GET /api/audit-logs` | Sí | Trazabilidad | Sin registro de acciones platform |
| Health | `getRuntimeReadiness()` | `runtime-readiness.js` | `GET /api/health/ready` | No | Dashboard de salud | Ninguno |
| Observabilidad | `getOperationalInsights()` | `ops/routes.js` | `GET /api/ops/observability` | No (admin-only) | Métricas del sistema | Ya es admin-only |

---

## Tabla de archivos futuros

### Para ADM-SEC-01

| Archivo | Estado | Motivo | Tipo de cambio futuro | Riesgo |
|---|---|---|---|---|
| `backend/src/modules/platform/models/PlatformUser.js` | NUEVO | Modelo de usuarios internos | Creación | Bajo — archivo nuevo |
| `backend/src/modules/platform/routes/auth.routes.js` | NUEVO | Login/refresh/logout interno | Creación | Bajo — archivo nuevo |
| `backend/src/modules/platform/services/platform-auth.js` | NUEVO | Lógica de auth interna | Creación | Medio — errores en auth comprometen seguridad |
| `backend/src/modules/platform/middlewares/platform-auth.js` | NUEVO | Middleware que rechaza tokens enterprise | Creación | Medio — debe implementarse correctamente |
| `backend/src/modules/platform/middlewares/platform-role.js` | NUEVO | Middleware de roles platform | Creación | Bajo — archivo nuevo |
| `backend/src/modules/platform/validators/platform-validators.js` | NUEVO | Validación de entrada | Creación | Bajo — archivo nuevo |
| `backend/src/config/platform-roles.js` | NUEVO | Configuración de roles y permisos | Creación | Bajo — archivo nuevo |
| `backend/scripts/platform-create-owner.js` | NUEVO | Script interno de aprovisionamiento inicial | Creación | Bajo — solo se ejecuta manualmente |
| `backend/src/app.js` | MODIFICACIÓN MÍNIMA | Montar `platformRoutes` | +1 línea | Bajo — solo añadir middleware |
| `test/platform-auth.test.js` | NUEVO | Pruebas de autenticación interna | Creación | Bajo — archivo nuevo |
| `test/platform-middleware.test.js` | NUEVO | Pruebas de middleware platform | Creación | Bajo — archivo nuevo |

### Para fases posteriores (ADM-API-BASE-01, ADM-COMPANIES-01, ADM-COMMERCIAL-01, ADM-SYSTEM-01 en adelante)

| Archivo | Estado | Motivo | Tipo de cambio futuro | Riesgo |
|---|---|---|---|---|
| `backend/src/modules/platform/routes/*.routes.js` | NUEVO | Endpoints de plataforma (companies, subscriptions, etc.) | Creación | Medio — deben respetar tenant isolation |
| `backend/src/modules/platform/services/*.js` | NUEVO | Servicios de plataforma | Creación | Medio — deben usar datos existentes |
| `ventas/features/admin/screens/*.tsx` | NUEVO | Pantallas del Admin Global | Creación | Bajo — archivos nuevos |
| `ventas/features/admin/components/admin-layout.tsx` | NUEVO | Layout del Admin Global (independiente, no basado en `PortalLayout`) | Creación | Bajo — archivo nuevo |
| `backend/src/data/mongo-store.js` | MODIFICACIÓN CONTROLADA | ADM-SEC-01 podrá agregar persistencia de `PlatformUserModel` y `PlatformSessionModel`. Las fases de API podrán extenderlo con funciones globales explícitas (`listPlatformCompanies()`, etc.). No modificar lógica tenant de funciones empresariales existentes. No usar `canAccessAllTenants()` como autorización de funciones platform |
| `backend/src/middlewares/access-control.js` | NO TOCAR | Ya tiene `canAccessAllTenants()` | Sin cambios | — |

---

## Validaciones finales

| # | Validación | Resultado |
|---|---|---|
| 1 | `git status` | Sin cambios staged. Archivos sin rastrear: `ADM-ARCH-01.md`, `RC-MOBILE-UI-AUDIT-01.md` |
| 2 | `git diff --check` | Sin errores |
| 3 | No se modificaron archivos existentes | ✅ Confirmado |
| 4 | No se modificó código | ✅ Confirmado |
| 5 | No se tocaron dependencias | ✅ Confirmado |
| 6 | No se tocaron lockfiles | ✅ Confirmado |
| 7 | No se modificó Mercado Pago | ✅ Confirmado |
| 8 | No se modificó el Portal | ✅ Confirmado |
| 9 | No se modificó Ventas | ✅ Confirmado |
| 10 | No se modificó la aplicación operativa | ✅ Confirmado |
| 11 | Archivos nuevos en el repositorio | `ADM-ARCH-01.md` (esta auditoría); `RC-MOBILE-UI-AUDIT-01.md` (ajeno a esta fase) |
| 12 | No se realizó commit | ✅ Confirmado |
| 13 | No se realizó push | ✅ Confirmado |
| 14 | No se realizó merge | ✅ Confirmado |
| 15 | No se realizó rebase | ✅ Confirmado |
| 16 | No se realizó cherry-pick | ✅ Confirmado |
| 17 | No se realizó revert | ✅ Confirmado |
| 18 | No se continúa con otra fase | ✅ Confirmado |

---

*Documento generado por auditoría del repositorio ManeComb en `main@4677ad47940c10b4389f0f4b0c35457d6b894732`.*
*Fecha: 2026-07-22.*
*Fin de ADM-ARCH-01-R2.*

---

## Cambios realizados durante la revisión R1

| Corrección | Descripción |
|---|---|
| **R1-C01** | Estado de Git: se corrigió la contradicción que describía el árbol como "limpio" cuando existe un archivo sin rastrear. Se agregó salida literal de `git status --short`, `git status` y `git diff --check`. Se indicó la ubicación exacta de `ADM-ARCH-01.md` |
| **R1-C02** | Se eliminó la recomendación de crear `PlatformCompany` como modelo persistente. Se sustituyó por `PlatformCompanyView` como DTO / read model no persistente, construido desde fuentes existentes (`organizationId`, `CommercialLeadModel`, `UserModel`, `VehicleModel`, `commercial-plans.js`, servicios comerciales) |
| **R1-C03** | Se eliminó la recomendación de crear colección `platform_audit_logs` y modelo `PlatformAuditLogModel`. Se documentó la reutilización de `AuditLogModel` existente con acciones con prefijo `platform.*` y `metadata.actorType = "platform"`. Se confirmó que el esquema actual (`action: string`, `metadata: Mixed`) soporta esta estrategia sin modificaciones |
| **R1-C04** | Se distinguió explícitamente entre **IDENTIDAD SEPARADA** (nueva colección `platform_users`) e **IMPLEMENTACIÓN DE SEGURIDAD DUPLICADA**. Se documentaron 12 funciones de seguridad reutilizables con su ubicación y modo de reutilización (importación directa o adaptador). Se actualizó la sección CREAR NUEVO vs NO CREAR |
| **R1-C05** | Se definió el token platform con `tokenType: "platform"` y una tabla completa de comportamiento de rechazo (401/403) para cada escenario. Se confirmó que los tokens empresariales actuales no contienen `tokenType`, por lo que el middleware `platformAuth` los rechazará automáticamente sin modificarlos |
| **R1-C06** | Se corrigió la recomendación de reutilizar `setAuthToken()` y `apiClient` directamente. Se documentó la estrategia de instancia Axios separada con clave `manecomb-platform-token`. Se evaluaron 3 alternativas y se recomendó la de menor riesgo |
| **R1-C07** | Se documentó la convención real de modelos Mongoose (todos en `backend/src/data/models.js`). Se justificó la excepción para `PlatformUser` dentro del módulo platform para evitar modificar `models.js` y mantener encapsulamiento. Se documentó la alternativa de agregarlo a `models.js` como riesgo controlado |
| **R1-C08** | Se agregó sección de aprovisionamiento inicial del primer `platform_owner` mediante script interno (`npm run platform:create-owner`), con 11 requisitos de seguridad (ejecución manual, entorno permitido, correo único, contraseña segura, sin valores predeterminados, sin impresión de contraseña, sin inserción en Git, registro de fecha, prevención de duplicados, rotación futura) |
| **R1-C09** | Se redefinió ADM-SEC-01 como fase exclusivamente backend. Se eliminaron todos los archivos frontend de su alcance. Se agregó ADM-UI-AUTH-01 como fase frontend independiente posterior. Se actualizó la tabla de archivos previstos y la tabla de archivos futuros |
| **R1-C10** | Se reclasificaron los 9 riesgos tenant con etiquetas `CONFIRMADO`, `MITIGADO EN CAPA SUPERIOR` o `NO CONFIRMADO`, incluyendo evidencia de la ruta que invoca cada función. Se propuso fase independiente `SEC-TENANT-VERIFY-01` ortogonal al Admin Global |
| **R1-C11** | Se aclaró que `PlatformSubscriptionView`, `PlatformOrderView` y `PlatformPaymentView` son DTOs / read models no persistentes. Se confirmó que las fuentes oficiales comerciales (`CommercialLeadModel`, `commercial-plans.js`, servicios y repositorios existentes) se mantienen sin cambios. No se crean nuevas colecciones, estados comerciales ni cálculos de frontend |

---

## Cambios realizados durante la revisión R2

| Corrección | Descripción |
|---|---|
| **R2-C01** | Se eliminó toda recomendación de crear colección o modelo `platform_audit_logs` / `PlatformAuditLogModel`. Se confirmó que `AuditLogModel` existente con acciones `platform.*` y `metadata.actorType = "platform"` cubre todos los casos. Se documentó que la función `recordAuditLog()` no acepta `null` como primer argumento y se agregó adaptador `recordPlatformAction()` para scripts |
| **R2-C02** | Se reclasificaron los middlewares empresariales (`authenticate`, `requireAdmin`, `canAccessAllTenants`) de `REUTILIZAR SIN CAMBIOS` a `NO REUTILIZAR`. Se explicó que son específicos del modelo enterprise y no aplican al contexto platform |
| **R2-C03** | `canAccessAllTenants()` se documentó como **LEGACY** (bypass existente para acceder a todas las organizaciones). Se creó la fase `ADM-LEGACY-ADMIN-01` para su retiro planificado. El Admin Global usará `platformAuth` y `platformRole` en su lugar |
| **R2-C04** | Se corrigió la ubicación de modelos: `PlatformUserModel` y `PlatformSessionModel` vivirán en `backend/src/data/models.js` (no en `modules/platform/models/`), siguiendo la convención real del código. Se eliminó la excepción a la convención |
| **R2-C05** | Se agregó `PlatformSessionModel` como modelo requerido para sesiones internas, con campos `userId`, `refreshTokenHash`, `ip`, `userAgent`, `platform`, `deviceName`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt`, `revokedReason`, `isActive`, `mfaVerified`. Sin `tokenHash` (el access token JWT no se persiste). Nombres definitivos a validar contra `SessionModel` durante ADM-SEC-01 |
| **R2-C06** | Se definió la estrategia JWT con `aud: "manecomb-platform-admin"`, `iss: "manecomb-api"` y secreto `PLATFORM_JWT_SECRET` en variable de entorno. Los tokens incluyen `tokenType: "platform"` para distinción explícita. Se agregó tabla de comparación enterprise vs platform |
| **R2-C07** | `PortalLayout` se reclasificó de `REUTILIZAR` a `NO REUTILIZAR`. El Admin Global usará `AdminLayout` independiente. `admin-layout.tsx` se actualizó para indicar que NO está basado en `PortalLayout`. Se documentó la desambiguación entre PortalLayout (layout visual) y Portal (app operativa) |
| **R2-C08** | `apiClient` se reclasificó de `REUTILIZAR` a `REFERENCIA / EXTRAER HELPER COMPARTIDO`. Se prohibió importar `apiClient` desde el frontend admin para evitar taint. La instancia separada `platformApiClient` no comparte interceptors ni configuración con `apiClient` |
| **R2-C09** | MFA se extrajo de `ADM-SEC-01` y `ADM-HARDEN-01` a una fase independiente `ADM-SEC-MFA-01`. El Admin Global no se considera habilitable en producción sin MFA para `platform_owner` y `platform_admin`. El plan de fases se actualizó: ADM-SEC-01 → ADM-SEC-MFA-01 → ADM-UI-AUTH-01 |
| **R2-C10** | El plan por fases (sección 35) se reescribió completamente para eliminar superposiciones. Cada fase tiene alcance y entregables no traslapados. Se agregaron `ADM-API-BASE-01` (router y utilities platform) y `ADM-LEGACY-ADMIN-01` (retiro del bypass heredado). Se reorganizó la priorización en 6 grupos secuenciales |
| **R2-C11** | Se eliminó la recomendación de consumir `GET /health`, `GET /api/health/ready`, `GET /api/metrics` etc. directamente desde el frontend admin. Se definió `GET /api/platform/system` como endpoint protegido y sanitizado que reutiliza internamente `getRuntimeReadiness()` y `getOperationalInsights()` sin exponer secretos ni información sensible |
| **R2-C12** | Se corrigió la sección 36 (Archivos previstos para ADM-SEC-01): los modelos se declaran en `models.js`, no en archivos separados. Se agregó modificación a `mongo-store.js`. Se eliminaron las referencias a archivos `ventas/` del alcance de ADM-SEC-01 |
| **R2-C13** | Se validó la firma real de `recordAuditLog(req, payload)`: espera objeto `req` con `req.user.id`, `req.headers['user-agent']`, `req.ip`, `req.app.locals.store`. No acepta `null`. Se documentó el adaptador `recordPlatformAction()` para scripts sin solicitud HTTP. Se eliminó el ejemplo de `recordAuditLog(null, ...)` del aprovisionamiento inicial |
