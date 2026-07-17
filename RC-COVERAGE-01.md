# RC-COVERAGE-01 — Certificación de Cobertura Total

Fecha de corte: 2026-07-16. Fuente: estado actual del repositorio. Esta matriz no hereda certificaciones de RC anteriores.

## Leyenda

- ✅ Certificada: código localizado, consumidor localizado, integración verificable y validación actual superada.
- 🟡 Parcial: existe implementación, pero falta un tramo demostrable, prueba o integración productiva.
- ⚪ Fuera de alcance: infraestructura existente sin consumidor de producto requerido para esta release.
- 🔴 Release blocker: impide autorizar el artefacto actual.

Columnas: `C` consumidor, `T` tests, `B` build, `I` integración, `UI` interfaz, `BE` backend. `—` significa no aplicable.

## Evidencia de validación actual

| Validación | Resultado |
|---|---|
| Backend `npm test` | ✅ Suite completa, RBAC, tenant, pagos, navegación, Communication y smoke |
| Mobile TypeScript / ESLint | ✅ |
| Mobile tests | ✅ 21 suites, 98 pruebas |
| Android debug | ✅ `BUILD SUCCESSFUL`, APK generado |
| Portal TypeScript / Vite build | ✅ |
| Portal build con entorno Docker `/api` y `/` | ✅ |
| `git diff --check` | ✅ |
| Docker daemon / Compose ejecutado | 🔴 Docker no está instalado en el entorno |
| Producción real (Mongo, Redis, TURN, Mercado Pago) | 🟡 Código cubierto; credenciales y servicios externos no ejecutados |

## 1. Inventario backend

### Módulos HTTP

| Módulo / API | C | T | B | I | UI | BE | Estado y causa |
|---|---:|---:|---:|---:|---:|---:|---|
| account: subscription GET, plan PATCH, cancel POST, invoices/download, sessions GET/DELETE | Sí | Sí | Sí | Sí | Sí Portal | Sí | ✅ |
| activation-keys: listar, generar, revocar | Sí | Sí | Sí | Sí | Sí Portal/Mobile | Sí | ✅ |
| auth: login, register, refresh, recovery, logout, session/me, E2EE backup | Sí | Sí | Sí | Sí | Sí | Sí | ✅ |
| chat: conversaciones, contactos, mensajes, voz, media y descarga | Sí | Sí | Sí | Sí | Sí Mobile | Sí | ✅ |
| commercial: plans, checkout, confirm, webhook y downloads | Sí | Sí | Sí | Sí | Sí Portal | Sí | 🟡 Falta smoke con proveedor productivo real |
| dashboard: overview | Sí | Sí | Sí | Sí | Sí Mobile | Sí | ✅ |
| documents: listar/descargar | Sí | Sí parcial | Sí | Sí | Sí Mobile | Sí | ✅ lectura |
| documents: admin/upload/review | No interno | No específico | Sí | Sí backend | No | Sí | ⚪ API administrativa preparada; no pertenece a UI de esta release |
| incidents: listar, crear, actualizar estado | Sí | Sí | Sí | Sí REST/Socket | Sí Mobile | Sí | ✅ |
| locations: live/update | Sí | Sí | Sí | Sí REST/Socket/GPS | Sí | Sí | ✅ |
| navigation: search/reverse/plan/routes CRUD/assign | Sí | Sí | Sí | Sí | Sí Mobile/Portal | Sí | ✅ |
| navigation: sessions active/start/status/history/metrics/events/visits/positions/trips | Sí | Sí | Sí | Sí | Sí Mobile/Portal | Sí | ✅ |
| navigation: sessions GET general y recalculate | Solo tests | Sí | Sí | Sí backend | No | Sí | ⚪ Operación administrativa sin consumidor de producto |
| notifications: listar/marcar leído | Sí | Sí smoke | Sí | Sí | Sí Mobile | Sí | ✅ |
| notifications: push subscriptions | Consumidor sin token real | Parcial | Sí | Parcial | No efectiva | Sí | 🟡 Proveedor push nativo ausente |
| ops: observability | Sí | Sí | Sí | Sí | Sí perfil admin | Sí | ✅ |
| portal: overview/onboarding | Sí | Sí indirecto | Sí | Sí | Sí Portal | Sí | ✅ |
| radio: messages/audio | Socket y tests; REST histórico sin cliente directo | Sí | Sí | Sí | Sí Radio | Sí | ✅ flujo activo; ⚪ endpoints históricos directos |
| rtc: config | Sí Mobile web | Backend sí | Sí | Sí | Sí Chat | Sí | 🟡 Falta relay real desplegado |
| rtc: sessions admin | No interno | No específico | Sí | Sí backend | No | Sí | ⚪ Observabilidad administrativa |
| users: perfil y CRUD | Sí | Sí RBAC | Sí | Sí REST/Socket | Sí Portal/Mobile | Sí | ✅ |
| vehicles: listar, crear, editar | Sí | Sí integración | Sí | Sí REST/Socket | Sí Portal/Mobile | Sí | ✅; edición preserva estado no modificado |
| audit-logs | No interno | No específico | Sí | Sí backend | No | Sí | ⚪ API administrativa sin UI en esta release |

### Servicios

| Servicio | Consumidor / integración | Estado |
|---|---|---|
| activation-keys | rutas de activación | ✅ |
| audio-transcription | Chat/Radio; proveedor opcional | 🟡 sin proveedor productivo demostrado |
| audit | mutaciones críticas y store | ✅ |
| auth-context | middleware de acceso operativo | ✅ |
| chat-media | Chat, Radio y Storage | ✅ |
| commercial-activation | checkout/confirmación | ✅ |
| commercial-downloads | endpoint firmado de descarga | ✅ |
| commercial-notifier | Commercial → Communication | ✅ email; 🟡 WhatsApp |
| commercial-payment | Mercado Pago/manual/test | 🟡 sin smoke productivo |
| commercial-profile | Portal/account | ✅ |
| document-service | capa de documentos | ✅ |
| error-classification | middleware/logging | ✅ |
| fleet-service | dominio de flota/store | ✅ |
| incident-service | dominio de incidencias | ✅ |
| logger, metrics, telemetry | app, health y observabilidad | ✅ |
| navigation-service | geocoding/plan | ✅ |
| notification-delivery / notification-service | incidencias/comunicación | ✅ in-app; 🟡 push remoto |
| organization-service | tenant/empresa | ✅ |
| payment-store-service | adaptador de persistencia comercial | ✅ |
| portal-account | overview/onboarding | ✅ |
| presence | Socket | ✅ |
| push-notifier | sin proveedor/token nativo | 🟡 |
| redis | sockets/colas | 🟡 tests sin Redis real |
| route-event-engine / route-metrics-engine / route-progress | jornadas, métricas y seguimiento | ✅ |
| rtc-config | endpoint RTC y readiness | 🟡 TURN no desplegado en esta validación |
| runtime-readiness | health | ✅; usa cola real de Communication |
| sessions / session-store-service | JWT refresh y sesiones | ✅ |
| storage | GridFS/Cloudinary/local | 🟡 GridFS cubierto por código; Mongo real no ejecutado |
| store-domain-service / repositories | reglas compartidas de stores | ✅ |
| tracking-service | ubicación/jornada | ✅ |
| user-service | usuarios | ✅ |
| webhook-idempotency | Mercado Pago | ✅ tests |

### Persistencia y modelos

| Modelo | Persistido/consumido | Tests | Estado |
|---|---|---:|---|
| User, Session, Vehicle, Route | Sí | Sí | ✅ |
| RouteSession, RouteSessionPosition, RouteEvent, CheckpointVisit, TripLog | Sí | Sí navegación | ✅ |
| Incident, Notification, AppEvent, AuditLog | Sí | Sí parcial/smoke | ✅ |
| Conversation, ChatMessage, ChatAttachment | Sí | Sí Chat/Radio | ✅ |
| Document | Sí | Parcial | 🟡 escritura/revisión sin UI de release |
| CommercialLead, ActivationKey, WebhookEvent | Sí | Sí pagos/activación | ✅ |
| RtcSession | Sí | Sí indirecto | 🟡 sin TURN real |

Stores únicos inventariados: `backend-store.js`, `store.js` (memoria), `mongo-store.js`, `store-domain-repository.js`, `store-domain-service.js`, `payment-store-service.js`, `session-store-service.js`. Los dos adaptadores de persistencia siguen duplicando parte de la implementación: 🟡 riesgo de divergencia, sin fallo demostrado en las suites actuales.

## 2. Inventario Mobile

### Pantallas

| Pantalla | C | T | B | I | UI | BE | Estado |
|---|---:|---:|---:|---:|---:|---:|---|
| customer-auth | Sí navegación | Sí auth | Sí | Sí | Sí | Sí | ✅ |
| mobile-account-gate | Sí routing | Sí routing | Sí | Sí | Sí | Sí | ✅ |
| map (native/web/wrapper) | Sí | Sí servicios | Sí | Sí GPS/navigation | Sí | Sí | ✅ |
| checklist/control | Sí | Sí | Sí | Sí routes/sessions | Sí | Sí | ✅ |
| incidents | Sí | Sí smoke | Sí | Sí Socket | Sí | Sí | ✅ |
| chat | Sí | Sí crypto/navigation | Sí | Sí REST/Socket/RTC | Sí | Sí | ✅ chat; 🟡 TURN real |
| radio | Sí | Sí reducer/realtime | Sí | Sí Socket/media | Sí | Sí | ✅ |
| users | Sí por roles | Sí routing/RBAC backend | Sí | Sí | Sí | Sí | ✅ |
| profile/profile-edit | Sí | Sí routing | Sí | Sí | Sí | Sí | ✅ |
| legal | Sí auth/routing | Sin test específico | Sí | Local | Sí | — | ✅ contenido estático |

### Hooks principales

| Hook | Consumidor | Estado |
|---|---|---|
| use-app-theme | shells/pantallas | ✅ |
| use-point-to-point-tracker | Checklist/Mapa | ✅ tests |
| use-chat-controller / directory-data / chat-scroll | Chat | ✅ |
| use-location-engine / location-sync / map-camera / map-selector / schedule-tick / tracking-data | Mapa | ✅ integración; tests selectivos |
| use-radio-lifecycle | Radio | ✅ |
| use-desktop-mode | compatibilidad histórica | ⚪ fuera del release Mobile nativo |

### Store y componentes reutilizables

| Elemento | Consumidor | Estado |
|---|---|---|
| root-store / use-app-store | toda la app | ✅; archivo monolítico, riesgo no bloqueante |
| secure-store | sesión/credenciales | ✅ |
| offline-cache y pending sync queue | store | ✅ tests |
| AppShell, AppCard, PrimaryButton, KeyboardSafeLayout | múltiples pantallas | ✅ |
| AppMap native/web | Mapa | ✅ |
| ConfirmModal, StatusPill, PresenceIndicator, UserAvatar | múltiples módulos | ✅ |
| OperationalMenuDrawer, ConnectionBanner, BrandLogo | shell | ✅ |
| componentes internos Chat/Mapa/Radio inventariados bajo sus pantallas | renderizados por sus vistas | ✅ |

## 3. Inventario Portal/Ventas

| Pantalla | C | T | B | I | UI | BE | Estado |
|---|---:|---:|---:|---:|---:|---:|---|
| sales | Sí | No específico | Sí | plans | Sí | Sí | ✅ build; 🟡 sin E2E |
| sales-auth / password-reset | Sí | Backend auth | Sí | Sí | Sí | Sí | ✅ |
| plan-checkout | Sí | Backend pagos | Sí | Sí | Sí | Sí | 🟡 sin proveedor productivo |
| portal-dashboard/operaciones | Sí | Backend sessions | Sí | Sí mapa/history | Sí | Sí | ✅ |
| portal-onboarding | Sí | Activation tests | Sí | Sí | Sí | Sí | ✅ |
| portal-users/equipo | Sí | RBAC backend | Sí | Sí Socket | Sí | Sí | ✅ |
| portal-units | Sí | Backend/store | Sí | Sí Socket | Sí | Sí | ✅; preservación de `assigned` corregida |
| portal-routes | Sí | Navigation tests | Sí | Sí | Sí | Sí | ✅ |
| portal-plan | Sí | Commercial tests | Sí | Sí | Sí | Sí | 🟡 sin cambio productivo real |
| portal-payments / portal-billing | Sí | Commercial tests | Sí | Sí | Sí | Sí | 🟡 descarga/productor reales no verificados |
| portal-profile | Sí | Session tests | Sí | Sí | Sí | Sí | ✅ |

Stores inventariados: `ventas/src/store/use-app-store` y `features/portal/store/use-portal-store`: ✅ consumidores activos. Hooks comerciales `use-checkout-experience` y `use-commercial-experience`: ✅. Componentes `portal-layout`, `portal-cards`, `operations-map`, boundaries, badges, modal, empty state, skeleton y toast: ✅ build; los componentes sin test aislado heredan 🟡 cobertura visual.

## 4. Socket.IO y eventos

| Familia | Eventos | Productor | Listener | Estado |
|---|---|---:|---:|---|
| presencia | `presence:join`, `presence:snapshot`, `presence:updated`, heartbeat/pong | Sí | Sí Mobile/Portal | ✅ |
| Chat | `conversation:join`, `chat:send`, `chat:message`, typing/stop, delivered/read | Sí | Sí Mobile | ✅ |
| Radio | join/leave/start/frame/end/error y `radio:message:new` | Sí | Sí Mobile | ✅ |
| RTC | join/leave/offer/answer/ice-candidate/participants/hangup | Sí | Sí Chat web | 🟡 TURN real no probado |
| ubicación | `location:update`, `location:updated` | Sí | Sí Mobile/Portal | ✅ |
| flota | `vehicle:created`, `vehicle:updated` | Sí | Sí Mobile/Portal | ✅ |
| usuarios | invited/first-login/updated/deleted | Sí | Sí Mobile/Portal | ✅ |
| incidencias | created/updated/sos | Sí | Sí Mobile | ✅ |
| rutas/jornadas | route/session updates | Sí | Sí Mobile/Portal | ✅ |
| comercial | account/payment/plan/subscription/onboarding/activation-key updates | Sí | Sí Portal | ✅ |

No se certifican como huérfanos eventos solo por no tener listener en el mismo cliente: las emisiones segmentadas por rol/plataforma tienen consumidores cruzados. No quedó familia Socket en estado desconocido.

## 5. Jobs, workers y Communication

| Elemento | Productor | Worker | Integración | Estado |
|---|---:|---:|---:|---|
| cola `emails` | `sendEmail` | `createEmailWorker` registrado en configure | Commercial notifier | ✅ |
| cola `whatsapp` | No productor activo localizado | Worker existe pero no se registra | notifier reporta canal | 🟡 implementación parcial |
| cola genérica backend anterior | Ninguno | Ninguno | eliminada | ✅ duplicación removida |
| `communication-service/` independiente | No forma parte del backend activo | Incompleto/no versionado | Ninguna | ⚪ trabajo fuera de alcance; no desplegar |
| templates, retry, metrics, history, events y providers del módulo integrado | Sí Communication | — | Tests Communication | ✅ email; 🟡 proveedores no configurados |

## 6. Infraestructura, Docker, scripts y CI/CD

| Elemento | Consumidor / validación | Estado |
|---|---|---|
| backend Dockerfile | Compose api | 🟡 no ejecutado localmente |
| mobile/Dockerfile.web | Compose web; ahora construye Portal Vite | 🔴 build Docker pendiente por ausencia de daemon |
| docker-compose.yml | desarrollo API/web/Redis/Nginx | 🔴 no ejecutado |
| docker-compose.prod.yml | producción + Mongo externo/Redis/Coturn/Nginx | 🔴 no ejecutado; requiere `.env` y servicios reales |
| Nginx proxy/API/Socket/SPA | Compose | 🟡 configuración localizada, no levantada |
| Redis | Socket/Communication queue | 🟡 fallback probado; Redis real no |
| Mongo/GridFS | store/storage | 🟡 código y tests de contrato; Mongo real no |
| Coturn | backend RTC config/Mobile | 🟡 configuración conectada; relay no probado |
| GitHub Actions CI | backend tests, Mobile quality, Portal typecheck/build, Docker web build | 🟡 workflow actualizado; falta corrida verde del commit candidato |
| scripts Android/device/build | package scripts | ✅ build Android; utilidades de dispositivo fuera de CI |
| Detox/Playwright scripts | comandos manuales | 🟡 existen; no ejecutados ni en CI |
| migrate-chat-messages | migración manual | ⚪ ejecutar solo ante datos legacy |
| diagnose-auth-account / device-doctor / dev-windows | operación manual | ⚪ herramientas de soporte |

## 7. Historias de usuario

| Historia | Backend | Portal | Mobile | Socket | Persistencia | UI | Certificación |
|---|---:|---:|---:|---:|---:|---:|---|
| Empresa → registro → sesión | ✔ | ✔ | ✔ | — | ✔ | ✔ | ✅ |
| Compra → pago → activación | ✔ | ✔ | ✔ gate | ✔ | ✔ | ✔ | 🟡 proveedor productivo no ejecutado |
| Equipo → invitación → primer acceso | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✅ |
| Unidad → editar sin perder asignación | ✔ | ✔ | ✔ consume | ✔ | ✔ | ✔ | ✅ |
| Ruta → asignar → conductor | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✅ |
| Operación → GPS → jornada → checkpoints/ETA | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✅ código/tests; 🟡 dispositivo real no recorrido |
| Incidente → actualización → seguimiento | ✔ | ✔ operaciones | ✔ | ✔ | ✔ | ✔ | ✅ |
| Historial → métricas → replay | ✔ | ✔ | ✔ control | ✔ | ✔ | ✔ | ✅ |
| Chat → media → entrega/lectura | ✔ | — | ✔ | ✔ | ✔ | ✔ | ✅ |
| Radio → PTT → persistencia → historial | ✔ | — | ✔ | ✔ | ✔ | ✔ | ✅ |
| Llamada RTC → TURN | ✔ | — | ✔ web | ✔ | ✔ session | ✔ | 🟡 relay real no probado |
| Documentos → listar/descargar | ✔ | — | ✔ | — | ✔ | ✔ | ✅ |
| Documentos → subir/revisar | ✔ | — | No | — | ✔ | No | ⚪ fuera del alcance UI de esta release |
| Facturación → factura → descarga | ✔ | ✔ | — | ✔ comercial | ✔ | ✔ | 🟡 proveedor/archivo productivo no probado |
| Push en background → deep link | ✔ tokens | — | Parcial | — | ✔ | Parcial | 🟡 proveedor nativo ausente |

## 8. Código sin cobertura clasificado

| Elemento | Evidencia | Clasificación |
|---|---|---|
| audit logs, RTC sessions admin, document admin y recalculate | endpoints sin consumidor interno | ⚪ conservar como administración; no certificados para UI |
| WhatsApp worker | declarado, no registrado ni producido | 🟡 |
| push token/listener | token siempre nulo y listener vacío | 🟡 |
| `communication-service/` | sin entrypoint activo en backend y no versionado | ⚪ |
| Desktop compatibility | documentada como histórica | ⚪ |
| Docker/Compose | no existe binario Docker en el entorno | 🔴 |
| stores memoria/Mongo | ambos consumidos; lógica parcialmente duplicada | 🟡 deuda, no código muerto |
| componentes/hook listados arriba | importados/renderizados o fuera de alcance explícito | sin desconocidos |

## 9. Cobertura de release

| Área | Estado |
|---|---|
| Backend | ✅ |
| Mobile | ✅ |
| Portal | 🟡 build correcto; sin E2E |
| Socket | ✅ |
| RTC | 🟡 |
| Chat | ✅ |
| Radio | ✅ |
| GPS | 🟡 dispositivo/entorno real no certificado |
| Control/Checklist | ✅ |
| Operaciones/Historial | ✅ |
| Documentos lectura | ✅ |
| Documentos administración | ⚪ |
| Incidentes | ✅ |
| Comercial/Pagos | 🟡 |
| Facturación | 🟡 |
| Push | 🟡 |
| Communication integrado | ✅ email / 🟡 WhatsApp |
| Communication independiente | ⚪ |
| Storage/GridFS | 🟡 |
| Redis/Mongo | 🟡 |
| Docker/Compose | 🔴 |
| CI/CD | 🟡 pendiente corrida verde del candidato |

## Decisión de cobertura

No existe ninguna capacidad inventariada en estado desconocido. La cobertura está clasificada completamente, pero la release permanece **🔴 NO GO** hasta demostrar:

1. Build y arranque reales de Docker/Compose.
2. CI verde sobre un commit candidato inmutable.
3. Smoke productivo de pago/webhook/factura/activación.
4. Llamada RTC mediante TURN desplegado.

Push, WhatsApp, documentos administrativos y `communication-service/` independiente no deben presentarse como capacidades certificadas de esta release.
