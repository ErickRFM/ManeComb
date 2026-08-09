# ManeComb — Ecosystem Congruence Audit

**Fecha de trabajo:** 2026-08-08 (America/Mexico_City)  
**PR de trabajo:** #63 `fix(ventas): close portal capability and routing contracts`  
**Base:** `main@2c5d63e21b0d8b775a4405fc0b30dfd81a7d5db1`  
**Estado:** auditoría activa; PR en draft; no fusionar hasta segunda revisión independiente.

## 1. Objetivo

Esta auditoría no parte de una pantalla concreta ni de una lista cerrada de bugs. Su objetivo es detectar incongruencias de ecosistema entre:

- Backend / Mongo / contratos de autoridad.
- Ventas y Portal empresarial.
- Mobile operativo.
- Admin Global / Platform.
- Rutas, jornadas, GPS, documentos, incidencias, chat, radio/RTC y perfil.
- Carga inicial, sesión, reconexión, persistencia y estados de error.
- Cloudflare, Workers, Render, contenedores y build/certificación.

La regla de trabajo es: **la UI no debe inventar autoridad, el cliente no debe contradecir al backend y una acción visible debe ser ejecutable para la identidad que la ve.**

## 2. Método

Para cada flujo se reconstruye la cadena completa:

`identidad -> canal principal -> capabilities -> guard de ruta -> carga de datos -> acción UI -> endpoint -> middleware -> store -> evento realtime -> reconciliación del cliente`

Se consideran hallazgos tanto los fallos de seguridad como los defectos de congruencia aparentemente pequeños: CTA que apunta al lugar equivocado, etiqueta de rol incorrecta, loader que no puede terminar, menú que ofrece una acción imposible, datos que viajan aunque la UI los oculte o una tabla de permisos que quedó atrasada respecto al backend.

## 3. Hallazgos cerrados en PR #63

### 3.1 Ventas / Portal: autoridad y routing

- `portal.access` y las capabilities explícitas del backend son la autoridad del producto; `accountChannel` queda como destino principal y compatibilidad, no como exclusividad.
- Router y navegación comparten `PORTAL_ROUTE_REGISTRY`; se eliminó una segunda tabla de permisos dentro del router/layout.
- Documentos usa `documents.manage`, no `billing.manage`.
- Incidencias usa `incidents.manage`, no `billing.manage` ni una lista manual de roles.
- Activación/keys queda bajo `users.manage`.
- Equipo usa `users.manage`; Unidades usa `vehicles.manage`; Dashboard no ofrece `Cambiar chofer` sin `users.manage`.
- El Portal empresarial ya no expone el editor global de metadata/APK que el backend no permite a una organización.
- La carga inicial no solicita facturas a quien no tiene `billing.manage` y conserva ese scope durante reload/reconnect.
- El router falla cerrado hasta `isHydrated=true`.

### 3.2 Perfil empresarial

- Se identificó que `accountType=company_owner` también aparece en roles limitados del Portal; ya no basta ese dato para editar empresa/pago.
- Self-service empresarial requiere autoridad de administración (`users.manage`).
- `billing_manager`, `support`, `viewer` y cuentas operativas solo pueden editar identidad personal.
- El Portal separa `Guardar perfil personal` de `Guardar datos de empresa`.
- Se añadieron regresiones puras y HTTP contra inyección de `companyProfile`, `paymentProfile` y `operationalSchedule`.

### 3.3 Mobile: UX y frontera de productos

- Perfil Mobile muestra el rol real (`Owner`, `Admin`, etc.) en vez de llamar `Propietario` a cualquier `company_owner`.
- El CTA de perfil pasó de `Editar perfil y cuenta` a `Editar mi perfil`, coherente con que la empresa se administra en Portal.
- `missing_tenant` ya no manda a `/perfil-editar`, una pantalla que no puede configurar empresa. Ahora entrega la activación al Portal.
- `Control` admite `dispatcher`, coherente con `routes.manage` del backend.
- `/mis-documentos` queda reservado a `driver` incluso por deep link; la administración documental vive en Portal.
- Directorio **no** se abre todavía a dispatcher: backend le concede `analytics.view`, pero el store Mobile aún no carga usuarios para ese rol. Se evita una pantalla visible pero vacía hasta migrar esa autoridad correctamente.

### 3.4 Documentos: cierre de lectura, escritura y perfil

Se encontró una autoridad partida dentro del mismo dominio:

- `/documents/admin` exigía `canManageDocuments`.
- `POST /documents` permitía a cualquier no-driver operativo escoger un owner del mismo tenant.
- `GET /documents` devolvía el conjunto documental del tenant a cualquier no-driver.
- `canAccessDocument()` daba lectura de archivo/historial a cualquier no-driver del tenant.
- `/auth/session`, `/auth/me` y `/users/me` transportaban `profile.documents` aunque el rol no tuviera autoridad documental.

Cierre aplicado:

- Driver conserva self-service de sus documentos permitidos.
- Todo no-driver necesita `documents.manage` para listado, archivo, historial y mutaciones.
- Las respuestas de perfil/session redactan `documents` para identidades sin autoridad.
- Prueba HTTP contrasta `dispatcher` (sin documents.manage) contra `supervisor` (con documents.manage), además de probar redacción de perfil y POST rechazado.

Archivos principales:

- `backend/src/modules/documents/routes.js`
- `backend/src/services/profile-visibility.js`
- `backend/src/modules/auth/routes.js`
- `backend/src/modules/users/routes.js`
- `backend/test/document-upload-authority.test.js`

### 3.5 Ventas: persistencia de sesión y loader

Se detectaron dos defectos deterministas:

1. `localStorage.getItem()` ocurría fuera de una frontera tolerante a errores. Un navegador con storage bloqueado podía lanzar antes de completar hidratación y dejar el loader sin salida.
2. `rememberSession=false` simplemente omitía persistir la sesión nueva. Si existía una sesión anterior guardada, sus credenciales podían sobrevivir y reaparecer después de recargar.

Cierre aplicado:

- `get/set/remove` de localStorage toleran storage restringido.
- `rememberSession=false` borra explícitamente token y refresh token persistidos.
- Una sesión sin refresh token elimina cualquier refresh token persistido anterior.
- `verify-session-storage.cjs` forma parte de `verify:contracts`, por lo que el build congela estas reglas.

### 3.6 Incidencias: notificación alineada a capability

Realtime y mutaciones ya consumían `canManageIncidents`, pero el push de una incidencia nueva tenía `targetRoles: ["admin", "supervisor"]` hardcodeado. Esto excluía roles que sí tienen la capability, especialmente `dispatcher` y `support`, además de no derivar `owner` de la autoridad real.

Cierre aplicado:

- `incidentManagerRoles = getRolesWithPermission("canManageIncidents")` se usa para realtime, SOS y notificación operacional.
- `incident-notification-authority.test.js` congela que owner/admin/dispatcher/supervisor/support pertenecen al conjunto y viewer/driver no.

### 3.7 Realtime, App Center global y RTC CDR

Se auditó Socket.IO buscando vías que saltaran REST/tenant guards.

Hallazgos refutados/confirmados:

- Chat delivered/read delega la pertenencia al store; ambos stores validan `canUserAccessConversation()` antes de modificar recibos.
- `chat:send` exige `senderId === authenticatedUser.id` y pertenencia a conversación.
- Radio join/start exige operación + pertenencia a conversación/canal.
- RTC join usa `callId` autoritativo, `canUseOperations`, organización y `callService.canJoinCall`; la room no se acepta libremente desde el cliente.
- GPS realtime pasa por `ingestVehicleLocation()`, que valida tenant y, para no-admin, `actor.vehicleId === payload.vehicleId`.
- Las emisiones operativas revisadas usan rooms `org:<tenant>:...`/`user:<id>`; no se encontró un emisor tenant-scoped que use las rooms globales `role:<rol>` o `account:<tipo>`.

Se encontraron dos fallos adicionales:

1. `GET /app/device-stats` exponía estadísticas globales de versiones/dispositivos a cualquier usuario autenticado. Se endureció con `requireAdmin` y `app-global-authority.test.js` prueba driver=403/admin operativo=200. Esto es un hardening temporal: la autoridad definitiva de App Center global sigue pendiente de migración a Platform.
2. `GET /rtc/sessions` listaba CDR mediante `listRtcSessions()` sin `organizationId`. Un admin operativo podía recibir metadatos de llamadas de otros tenants. Se añadió scope Mongo por organización y filtro defensivo en la ruta para stores embebidos/legado. `rtc-session-tenant-authority.test.js` crea sesiones de dos empresas y comprueba que solo se responda la propia.

## 4. Incongruencias confirmadas que NO deben parchearse a ciegas

### P0/P1 — Mobile ignora parcialmente la autoridad que backend ya entrega

Backend serializa usuarios con `capabilities`, pero `mobile/src/types/app.ts` todavía no modela `User.capabilities` y `mobile/src/store/root-store.ts` mantiene decisiones por `role/accountType/accountChannel`.

#### 4.1 Owner/Admin de empresa: acceso Mobile concedido y luego negado por el store

`backend/src/services/enterprise-capabilities.js` establece explícitamente que `owner/admin` de `company_portal` tienen también `mobile.access` y `operations.use`.

Sin embargo `shouldRefreshOperationalData()` en Mobile exige que, si existe `accountChannel`, sea exactamente `mobile_operations`. Para owner/admin de empresa el canal principal puede ser `company_portal`, por lo que el backend concede Mobile pero el store evita el refresh operativo.

**Dirección de corrección:** operacionalidad debe depender de `canAccessMobile && canUseOperations` / capabilities. `accountChannel` debe seguir siendo orientación de destino, no veto de segundo producto.

**No resolver con:** otro `if (role === 'owner' || role === 'admin')`.

### P1 — Directorio dispatcher: backend y store divergen

Backend `GET /users` exige `canViewAnalytics`; dispatcher tiene `analytics.view`. Mobile `loadUsers()` y el bloque de `refreshAll()` todavía usan listas locales que excluyen dispatcher.

Por eso la ruta `/usuarios` permanece cerrada a dispatcher temporalmente. La solución correcta es migrar el store a capabilities y después habilitar la ruta, no abrir la ruta antes.

### P1 — Observabilidad sigue bajo middleware legado

`backend/src/middlewares/require-admin.js` autoriza únicamente `role=admin` y además excluye `accountType=company_owner`. Mobile solo pide observabilidad para `user.role === 'admin'`.

Debe decidirse si Observabilidad es realmente una función interna/operativa exclusiva o si debe pertenecer a una capability explícita. No ampliar acceso sin definir el producto y el dato sensible.

### P1 — App Center global sigue bajo autoridad legado

`PATCH /app/info` modifica `appConfig` global, pero su autoridad es `requireAdmin` (admin operativo) y no Platform/Admin Global. El Portal empresarial ya no expone esa mutación y `device-stats` ya no es público a cualquier autenticado, pero la publicación global aún vive en una frontera heredada.

La corrección final debe definir primero el hogar de release management y después mover la mutación; no duplicar `updateAppConfig` en otro módulo.

### P1 — Storage web Mobile

`mobile/src/store/root-store.ts` protege SecureStore con `try/catch`, pero el branch web de `window.localStorage` todavía puede lanzar. `clearSessionState()` depende de esa limpieza. Debe endurecerse en un refactor focalizado con prueba, igual que Ventas.

### P2 — Timeout de bootstrap Mobile

La UI sí tiene estados lento/recuperable, pero el timeout duro ronda 80 s. Antes de reducirlo hay que medir la razón de cold-start/Render y diferenciar timeout de red, session recovery y primera sincronización. No convertir un problema de infraestructura en un spinner más corto sin evidencia.

## 5. Decisiones arquitectónicas pendientes

### 5.1 `companyProfile` dentro de User

Ya está cerrado quién puede modificar los campos empresariales, pero sigue existiendo la posibilidad conceptual de que owner/admin representen copias o vistas divergentes de una misma empresa. La segunda auditoría debe determinar si hace falta una entidad canónica Organization/Company y si User solo debe referenciarla.

### 5.2 Metadata y publicación global del APK

`appConfig` es global, no organization-scoped. El Portal empresarial ya no puede editarlo y las estadísticas globales ya no se exponen a cualquier autenticado, pero `PATCH /app/info` sigue siendo legado. Falta decidir el hogar definitivo de publicación/versionado: Admin Global/Platform, pipeline de release o combinación controlada.

### 5.3 Rutas Portal

`portal-routes-screen.tsx` todavía calcula parte de su autoridad con owner/admin. Hoy coincide con `routes.manage`, pero sigue siendo autoridad duplicada y debe normalizarse cuando no implique reescribir un módulo grande sin prueba.

### 5.4 Documentación histórica de RBAC

Documentos RC anteriores certifican matrices previas a `dispatcher`/capabilities. Deben tratarse como evidencia histórica, no como fuente de verdad actual. La autoridad vigente debe reconstruirse desde capability map + middleware + contratos de cliente.

## 6. Matriz mínima para la siguiente auditoría independiente

La segunda auditoría debe reconstruir, sin asumir que este documento es correcto:

| Dominio | Verificar de extremo a extremo |
|---|---|
| Auth | login, refresh, session, logout, recovery, accountChannel, capabilities, suspensión |
| Portal | router, menú, cargas, billing, keys, perfil, equipo, unidades, rutas, documentos, incidencias |
| Mobile | post-login, bootstrap, offline/cache, role/capability, mapa, Control, perfil, documentos, incidentes |
| Realtime | socket auth, rooms, reconnection, presence, events, tenant scope |
| GPS/Jornadas | asignación, sesión activa, telemetría, ownership de unidad, historial |
| Chat/Radio/RTC | participants, permisos, llamadas, floor control, CDR, reconexión |
| Documents | self-service driver, admin, lectura, archivo, historial, revisión, tenant isolation |
| Platform | Admin Global, companies, appConfig, soporte/gobernanza, autoridad cross-tenant |
| Comercial | planes, trial, transferencia, facturas, onboarding, cambio/cancelación |
| Deploy | Cloudflare SPA, Workers, Render, env contract, Docker/Redis, builds |

## 7. Protocolo para Claude / auditor independiente

Claude no debe recibir una instrucción tipo “confirma que estos bugs están arreglados”. Debe actuar como revisor adversarial independiente:

1. Reconstruir la arquitectura desde el repositorio, rutas, middleware, stores, contratos y CI.
2. Enumerar productos y fronteras: Ventas, Portal, Mobile, Admin Global, Backend y servicios.
3. Construir su propia matriz `rol -> capability -> producto -> ruta -> endpoint -> mutación/dato`.
4. Buscar contradicciones aunque no aparezcan en este documento.
5. Buscar específicamente:
   - botones que backend rechaza;
   - endpoints permisivos que UI oculta;
   - datos sensibles transportados a roles que no los usan;
   - deep links sin guard;
   - loaders sin salida y estados de error no recuperables;
   - dos fuentes de verdad para la misma decisión;
   - roles nuevos no propagados a clientes;
   - accountChannel usado como permiso;
   - capabilities ignoradas;
   - acciones globales dentro de un producto tenant-scoped;
   - estados empty/error/loading que parecen válidos pero en realidad encubren 403/404;
   - realtime que salte guards REST o cruce tenants;
   - cache/offline que conserve autoridad o datos de otra sesión/tenant.
6. Por cada hallazgo entregar evidencia de archivos/funciones, severidad, escenario reproducible y solución estructural mínima.
7. Solo al terminar su análisis independiente comparar contra este dossier y marcar:
   - `CONFIRMADO`;
   - `REFUTADO`;
   - `PARCIAL`;
   - `NUEVO`.
8. No programar automáticamente todos los hallazgos. Separar correcciones mecánicas seguras de decisiones arquitectónicas.

## 8. Gate de cierre

PR #63 permanece en draft hasta que:

- CI del head final pase en todos los jobs funcionales/build.
- Portal production certification pase sobre el head final.
- El rojo conocido de dependency audit Mobile esté identificado por paquete/vulnerabilidad y tratado como deuda separada, no ocultado.
- La segunda auditoría independiente haya revisado el ecosistema completo y no queden P0/P1 sin decisión explícita.
- El diff final siga siendo trazable y no mezcle rediseños ajenos al problema de congruencia.

**No fusionar este PR solo porque compile. El objetivo es que ManeComb tenga una autoridad coherente entre productos, datos, UX y backend.**
