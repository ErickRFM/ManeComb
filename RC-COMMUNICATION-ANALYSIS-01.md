# RC-COMMUNICATION-ANALYSIS-01: Análisis Completo del Ecosistema de Comunicación

> **Fecha:** 2026-07-16
> **Propósito:** Análisis exhaustivo de todo el código existente relacionado con comunicaciones antes de diseñar la nueva plataforma independiente.
> **Principio rector:** Reutilizar todo lo que ya funciona. No duplicar. No reimplementar. Solo mejorar y extraer.

---

## 1. Código Encontrado

### 1.1 Módulo de Comunicación Principal

| # | Archivo | Responsabilidad | Estado | Reutilizable | Refactorizar | Eliminar | Mover | Dependencias | Riesgos | Prioridad |
|---|---------|----------------|--------|-------------|-------------|---------|-------|-------------|---------|-----------|
| 1 | `backend/modules/communication/index.js` | Entry point / public API facade del módulo | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ✅ Sí (communication-service/src/) | Ninguna | Bajo | Alta |
| 2 | `backend/modules/communication/communication.types.js` | Enums: PRIORITY, CHANNEL, PROVIDER, STATUS, TEMPLATE, TEMPLATE_PRIORITY, TEMPLATE_META, MAX_RETRIES, RETRY_DELAYS, QUEUE_NAMES | ✅ Estable | ✅ Sí | ⚠️ Parcial (extraer a constantes/dominio) | ❌ No | ✅ Sí (communication-service/src/domain/) | Ninguna | Bajo | Alta |
| 3 | `backend/modules/communication/communication.provider.js` | 6 providers (Resend, SMTP, SES, Mailgun, Postmark, SendGrid) + factory | ✅ Estable | ✅ Sí | ⚠️ Sí (separar cada provider en su propio archivo) | ❌ No | ✅ Sí (communication-service/src/providers/) | `nodemailer`, `@aws-sdk/client-ses` (dynamic require) | Medio: dependencias dinámicas sin package.json | Alta |
| 4 | `backend/modules/communication/communication.service.js` | Orchestrator: configure, sendEmail, sendDirect | ✅ Estable | ✅ Sí | ⚠️ Sí (separar responsabilidades) | ❌ No | ✅ Sí (communication-service/src/services/) | Todo el módulo | Medio: acoplado a configuración global | Alta |
| 5 | `backend/modules/communication/communication.validators.js` | Input validation (email, template, priority, provider config) | ✅ Estable | ✅ Sí | ⚠️ Sí (mejorar cobertura) | ❌ No | ✅ Sí (communication-service/src/validators/) | types.js | Bajo | Alta |
| 6 | `backend/modules/communication/communication.templates.js` | 22 template builder functions | ✅ Estable | ✅ Sí | ⚠️ Sí (extraer a archivos individuales, soporte i18n) | ❌ No | ✅ Sí (communication-service/src/templates/) | components.js | Bajo | Alta |
| 7 | `backend/modules/communication/communication.renderer.js` | HTML rendering with base layout | ✅ Estable | ✅ Sí | ⚠️ Sí (soporte para múltiples layouts) | ❌ No | ✅ Sí (communication-service/src/renderer/) | base.js, types.js | Bajo | Alta |
| 8 | `backend/modules/communication/communication.queue.js` | BullMQ / in-memory queue abstraction | ✅ Estable | ✅ Sí | ⚠️ Sí (duplicado con src/services/queue.js) | ❌ No | ✅ Sí (communication-service/src/queue/) | `bullmq` | Medio: duplicación con src/services/queue.js | Alta |
| 9 | `backend/modules/communication/communication.jobs.js` | Email & WhatsApp workers | ✅ Estable | ✅ Sí | ⚠️ Sí (separar workers por canal) | ❌ No | ✅ Sí (communication-service/src/workers/) | queue.js, history.js, metrics.js | Medio | Alta |
| 10 | `backend/modules/communication/communication.history.js` | MongoDB/in-memory history store | ✅ Estable | ✅ Sí | ⚠️ Sí (mejorar schema, agregar índices compuestos) | ❌ No | ✅ Sí (communication-service/src/history/) | mongoose | Bajo | Alta |
| 11 | `backend/modules/communication/communication.metrics.js` | In-memory counters & timers | ✅ Estable | ✅ Sí | ⚠️ Sí (duplicado con src/services/metrics.js) | ❌ No | ✅ Sí (communication-service/src/metrics/) | Ninguna | Medio: duplicado con src/services/metrics.js | Alta |
| 12 | `backend/modules/communication/communication.events.js` | Socket.IO event emitter | ✅ Estable | ✅ Sí | ⚠️ Sí (mejorar tipado, colas de eventos) | ❌ No | ✅ Sí (communication-service/src/events/) | Socket.IO | Bajo | Alta |
| 13 | `backend/modules/communication/communication.logger.js` | Structured logging wrapper | ✅ Estable | ✅ Sí | ⚠️ Sí (simplificar, delegar al logger central) | ❌ No | ✅ Sí (communication-service/src/logger/) | src/services/logger.js | Bajo | Alta |
| 14 | `backend/modules/communication/communication.retry.js` | Priority-based retry logic | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ✅ Sí (communication-service/src/retry/) | types.js | Bajo | Alta |
| 15 | `backend/modules/communication/communication.validators.js` | Input validation | ✅ Estable | ✅ Sí | ⚠️ Sí (mejorar cobertura, agregar schemas) | ❌ No | ✅ Sí (communication-service/src/validators/) | types.js | Bajo | Alta |
| 16 | `backend/modules/communication/templates/base.js` | HTML email base layout (responsive, dark mode, Outlook) | ✅ Estable | ✅ Sí | ⚠️ Sí (parametrizar colores, marca) | ❌ No | ✅ Sí (communication-service/src/templates/) | Ninguna | Bajo | Alta |
| 17 | `backend/modules/communication/templates/components.js` | 16 reusable HTML email components | ✅ Estable | ✅ Sí | ⚠️ Sí (parametrizar colores, marca) | ❌ No | ✅ Sí (communication-service/src/templates/) | Ninguna | Bajo | Alta |
| 18 | `backend/modules/communication/package.json` | Module metadata | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ✅ Sí (communication-service/package.json) | Ninguna | Bajo | Alta |

### 1.2 Archivos Relacionados Fuera del Módulo

| # | Archivo | Responsabilidad | Estado | Reutilizable | Refactorizar | Eliminar | Mover | Dependencias | Riesgos | Prioridad |
|---|---------|----------------|--------|-------------|-------------|---------|-------|-------------|---------|-----------|
| 19 | `backend/src/server.js` | Inicializa y configura el módulo de comunicación | ✅ Estable | ⚠️ Parcial (solo la inicialización) | ⚠️ Sí (extraer init a communication-service) | ❌ No | ❌ No | communication module | Bajo | Alta |
| 20 | `backend/src/services/commercial-notifier.js` | Notificaciones comerciales (email + WhatsApp) | ✅ Estable | ✅ Sí | ⚠️ Sí (migrar a communication-service) | ❌ No | ✅ Sí (communication-service/src/services/) | communication module, Twilio | Medio: lógica duplicada de Resend API directa | Alta |
| 21 | `backend/src/services/notification-service.js` | In-app notification service (StoreDomainService) | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ❌ No (es parte del core de ManeComb) | store-domain-service | Bajo | Media |
| 22 | `backend/src/services/notification-delivery.js` | In-app + push notification delivery orchestrator | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ❌ No (es parte del core de ManeComb) | push-notifier, Socket.IO | Bajo | Media |
| 23 | `backend/src/services/push-notifier.js` | Expo Push Notification sender | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ❌ No (es parte del core de ManeComb) | fetch | Bajo | Media |
| 24 | `backend/src/services/queue.js` | General queue service (BullMQ / in-memory) | ✅ Estable | ⚠️ Parcial | ⚠️ Sí (duplicado con communication.queue.js) | ❌ No | ❌ No (es parte del core) | bullmq | Medio: duplicación con communication.queue.js | Alta |
| 25 | `backend/src/services/logger.js` | Centralized structured logging | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ❌ No (es parte del core) | Ninguna | Bajo | Alta |
| 26 | `backend/src/services/metrics.js` | Centralized metrics (counters, timers, gauges) | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ❌ No (es parte del core) | Ninguna | Bajo | Media |
| 27 | `backend/src/services/commercial-notifier.js` | Notificaciones comerciales (email + WhatsApp) | ✅ Estable | ✅ Sí | ⚠️ Sí (migrar a communication-service) | ❌ No | ✅ Sí (communication-service/src/services/) | communication module, Twilio | Medio: lógica duplicada de Resend API | Alta |
| 28 | `backend/src/modules/notifications/routes.js` | REST endpoints for in-app notifications | ✅ Estable | ❌ No (es parte del core) | ❌ No | ❌ No | ❌ No | authenticate middleware | Bajo | Media |
| 29 | `backend/src/services/notification-service.js` | In-app notification service | ✅ Estable | ❌ No (es parte del core) | ❌ No | ❌ No | ❌ No | store-domain-service | Bajo | Media |
| 30 | `backend/src/services/notification-delivery.js` | In-app + push delivery orchestrator | ✅ Estable | ❌ No (es parte del core) | ❌ No | ❌ No | ❌ No | push-notifier, Socket.IO | Bajo | Media |
| 31 | `backend/src/services/push-notifier.js` | Expo Push Notification sender | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ❌ No (es parte del core) | fetch | Bajo | Media |
| 32 | `backend/src/services/logger.js` | Centralized structured logging | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ❌ No (es parte del core) | Ninguna | Bajo | Alta |
| 33 | `backend/src/services/metrics.js` | Centralized metrics (counters, timers, gauges) | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ❌ No (es parte del core) | Ninguna | Bajo | Media |
| 34 | `backend/src/services/queue.js` | General queue service (BullMQ / in-memory) | ✅ Estable | ⚠️ Parcial | ⚠️ Sí (duplicado con communication.queue.js) | ❌ No | ❌ No (es parte del core) | bullmq | Medio: duplicación con communication.queue.js | Alta |
| 35 | `backend/src/config/env.js` | Centralized environment configuration | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ❌ No (es parte del core) | Ninguna | Bajo | Alta |
| 36 | `backend/test/communication.test.js` | 16 tests for communication module | ✅ Estable | ✅ Sí | ⚠️ Sí (mejorar cobertura, agregar mocks) | ❌ No | ✅ Sí (communication-service/tests/) | communication module | Bajo | Alta |
| 37 | `backend/.env.example` | Environment variables template | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ❌ No | Ninguna | Bajo | Media |
| 38 | `RC-COMMUNICATION-FINAL-01.md` | Documentación de cambios crash-proof | ✅ Estable | ✅ Sí | ❌ No | ❌ No | ✅ Sí (communication-service/docs/) | Ninguna | Bajo | Media |

---

## 2. Análisis de Duplicación y Problemas Identificados

### 2.1 Duplicación Crítica

| Problema | Archivo 1 | Archivo 2 | Impacto |
|----------|-----------|-----------|---------|
| **Queue duplicada** | `communication.queue.js` | `src/services/queue.js` | Alta: dos implementaciones de cola con la misma lógica BullMQ/in-memory. La general (`src/services/queue.js`) tiene más queue names pero no workers. La de comunicación tiene workers. |
| **Metrics duplicada** | `communication.metrics.js` | `src/services/metrics.js` | Media: dos implementaciones casi idénticas de contadores/timers in-memory. La de comunicación es más simple. |
| **Resend API directa** | `communication.provider.js` (ResendProvider) | `commercial-notifier.js` (fetch directo a Resend) | Alta: commercial-notifier tiene un fallback que llama a Resend API directamente, duplicando la lógica del provider. |
| **Queue names duplicados** | `communication.types.js` (QUEUE_NAMES) | `src/services/queue.js` (getQueueNames) | Media: ambos definen cola "emails", "whatsapp", "push" pero el general tiene más nombres. |

### 2.2 Problemas Arquitectónicos Identificados

1. **Dos sistemas de colas separados**: `communication.queue.js` y `src/services/queue.js` coexisten con lógica duplicada. El de comunicación tiene workers; el general no.

2. **Dos sistemas de métricas**: `communication.metrics.js` y `src/services/metrics.js` con la misma funcionalidad.

3. **Acoplamiento a ManeComb**: El módulo de comunicación importa `src/services/logger` y `src/services/queue` directamente, creando dependencia circular potencial.

4. **Sin API REST**: No existe una API REST para el módulo de comunicación. Solo se usa mediante llamadas directas desde otros servicios.

5. **Sin autenticación propia**: Depende del middleware `authenticate` de ManeComb.

6. **Sin soporte multi-tenant real**: Aunque `history.js` tiene `organizationId`, no hay aislamiento real entre organizaciones.

7. **Sin versionado de templates**: Los templates son funciones JS, no hay versionado.

8. **Sin i18n**: Todos los templates están en español duro.

9. **Sin webhooks**: No hay sistema de webhooks para eventos de comunicación.

10. **Sin dashboard**: No existe interfaz administrativa.

11. **Sin rate limiting propio**: Depende del rate limiting general de ManeComb.

12. **Sin autenticación propia**: Depende del JWT de ManeComb.

13. **Sin soporte multi-dominio**: Solo un fromEmail configurable.

14. **Sin API Keys propias**: No hay sistema de API keys para consumidores externos.

15. **Sin RBAC**: No hay roles/permisos específicos para comunicación.

---

## 3. Mapa de Dependencias

```
communication.service.js
  ├── communication.validators.js
  │   └── communication.types.js
  ├── communication.templates.js
  │   └── templates/components.js
  ├── communication.renderer.js
  │   ├── templates/base.js
  │   └── communication.types.js
  ├── communication.provider.js
  │   └── src/services/logger.js  ← DEPENDENCIA EXTERNA
  ├── communication.queue.js
  │   └── bullmq
  ├── communication.jobs.js
  │   ├── communication.queue.js
  │   ├── communication.history.js
  │   ├── communication.metrics.js
  │   └── src/services/logger.js  ← DEPENDENCIA EXTERNA
  ├── communication.history.js
  │   ├── mongoose
  │   └── src/services/logger.js  ← DEPENDENCIA EXTERNA
  ├── communication.metrics.js
  ├── communication.events.js
  ├── communication.logger.js
  │   └── src/services/logger.js  ← DEPENDENCIA EXTERNA
  └── communication.retry.js
      └── types.js
```

---

## 4. Estrategia de Migración

### 4.1 Fase 1: Extracción (No romper ManeComb)

1. Copiar todo `backend/modules/communication/` a `communication-service/`
2. Mantener el original intacto como puente
3. Hacer que el original sea un wrapper que delegue al nuevo servicio
4. Verificar que todos los tests pasen

### 4.2 Fase 2: Refactorización

1. Separar cada provider en su propio archivo
2. Unificar `communication.metrics.js` con `src/services/metrics.js` o crear adapter
3. Unificar `communication.queue.js` con `src/services/queue.js` o crear adapter
4. Extraer configuración a su propio módulo
5. Agregar API REST
6. Agregar autenticación propia (API Keys)
7. Agregar soporte multi-tenant

### 4.3 Fase 3: Independencia

1. Crear `communication-service/` como paquete independiente
2. Hacer que `backend/modules/communication/` sea un wrapper que delegue
3. Agregar Dockerfile
4. Agregar dashboard web
5. Agregar webhooks
6. Agregar i18n
7. Agregar versionado de templates

---

## 5. Recomendaciones Clave

### 5.1 Qué NO hacer (no duplicar)

- **NO** reimplementar los 6 providers (Resend, SMTP, SES, Mailgun, Postmark, SendGrid) — ya existen y funcionan
- **NO** reimplementar las 22 plantillas de email — ya existen y están probadas
- **NO** reimplementar el sistema de renderizado HTML con base layout y componentes
- **NO** reimplementar la lógica de reintentos por prioridad
- **NO** reimplementar los validadores de email, template, provider
- **NO** reimplementar el sistema de eventos Socket.IO
- **NO** reimplementar el historial con MongoDB
- **NO** reimplementar el sistema de colas (unificar los dos existentes)

### 5.3 Qué SÍ hacer

1. **Extraer** el módulo a `communication-service/` como paquete independiente
2. **Unificar** los dos sistemas de colas (`communication.queue.js` + `src/services/queue.js`)
3. **Unificar** los dos sistemas de métricas (`communication.metrics.js` + `src/services/metrics.js`)
4. **Agregar** API REST completa con autenticación propia (API Keys + JWT)
5. **Agregar** soporte multi-tenant (organizaciones, proyectos, dominios)
6. **Agregar** dashboard web administrativo
7. **Agregar** webhooks para eventos de comunicación
8. **Agregar** versionado de templates
9. **Agregar** i18n (soporte multi-idioma)
10. **Agregar** rate limiting por organización
11. **Agregar** RBAC
12. **Agregar** health checks
13. **Agregar** Docker
14. **Migrar** `commercial-notifier.js` para usar solo el communication-service
15. **Eliminar** el fallback directo a Resend API en `commercial-notifier.js`

---

## 6. Conclusión

El módulo de comunicación existente es **sorprendentemente completo y robusto**. No es un simple "módulo para enviar correos" — ya tiene:

- 6 providers con patrón factory
- 22 plantillas de email profesionales
- Sistema de colas con BullMQ y fallback en memoria
- Workers con reintentos por prioridad
- Historial con MongoDB y fallback en memoria
- Métricas
- Eventos Socket.IO
- Logging estructurado
- Validación de entrada
- 16 tests que pasan

**No se necesita reimplementar nada de esto.** La estrategia correcta es:

1. **Extraer** el módulo completo a `communication-service/` como paquete independiente
2. **Unificar** los sistemas duplicados (queue, metrics)
3. **Agregar** las capacidades faltantes (API REST, auth, multi-tenant, dashboard, webhooks, i18n)
4. **Hacer** que el módulo original sea un wrapper que delegue al nuevo servicio
5. **Migrar** los consumidores existentes (commercial-notifier) gradualmente

---

## 6. Arquitectura Propuesta

```
communication-service/
├── package.json
├── Dockerfile
├── docker-compose.yml
├── src/
│   ├── index.js                          # Entry point / public API
│   ├── config/
│   │   ├── index.js                     # Configuración centralizada
│   │   ├── env.js                       # Variables de entorno
│   │   └── providers.js                 # Mapeo de proveedores
│   ├── domain/
│   │   ├── constants.js                 # Enums: PRIORITY, CHANNEL, PROVIDER, STATUS, etc.
│   │   ├── errors.js                    # Errores de dominio
│   │   └── value-objects.js            # Email, TemplateName, etc.
│   ├── providers/
│   │   ├── index.js                     # Factory + exports
│   │   ├── base.provider.js            # Clase base abstracta
│   │   ├── resend.provider.js          # Resend API
│   │   ├── smtp.provider.js            # Nodemailer SMTP
│   │   ├── ses.provider.js             # AWS SES
│   │   ├── mailgun.provider.js         # Mailgun API
│   │   ├── postmark.provider.js        # Postmark API
│   │   ├── sendgrid.provider.js        # SendGrid API
│   │   └── smtp-server/               # SMTP server propio (Modo 2)
│   │       ├── index.js
│   │       ├── smtp.server.js          # SMTP listener (smtp-server)
│   │       ├── dns.resolver.js         # DNS lookups (SPF, DKIM, DMARC)
│   │       └── queue.outbound.js       # Outbound queue for SMTP server
│   ├── services/
│   │   ├── email.service.js            # Core email sending orchestrator
│   │   ├── template.service.js         # Template management
│   │   ├── provider.service.js         # Provider management
│   │   ├── organization.service.js     # Multi-tenant management
│   │   ├── domain.service.js           # Domain & sender management
│   │   ├── api-key.service.js          # API Key management
│   │   ├── webhook.service.js          # Webhook delivery
│   │   └── scheduler.service.js        # Email scheduling
│   ├── providers/
│   │   ├── base.provider.js            # Abstract base class
│   │   ├── resend.provider.js          # Resend API
│   │   ├── smtp.provider.js            # Nodemailer SMTP
│   │   ├── ses.provider.js             # AWS SES
│   │   ├── mailgun.provider.js         # Mailgun API
│   │   ├── postmark.provider.js        # Postmark API
│   │   ├── sendgrid.provider.js        # SendGrid API
│   │   └── smtp-server/               # Modo 2: SMTP propio
│   │       ├── index.js
│   │       ├── smtp.server.js          # SMTP listener (smtp-server)
│   │       ├── dns.resolver.js         # SPF, DKIM, DMARC validation
│   │       └── outbound.queue.js       # Outbound queue
│   ├── queue/
│   │   ├── index.js                    # Queue abstraction (unified)
│   │   ├── bullmq.adapter.js           # BullMQ adapter
│   │   └── memory.adapter.js          # In-memory fallback
│   ├── workers/
│   │   ├── email.worker.js             # Email sending worker
│   │   ├── webhook.worker.js           # Webhook delivery worker
│   │   └── scheduler.worker.js        # Scheduled email worker
│   ├── templates/
│   │   ├── index.js                    # Template registry
│   │   ├── base.js                     # HTML base layout (from existing)
│   │   ├── components.js              # HTML components (from existing)
│   │   ├── builders/                   # One file per template
│   │   │   ├── welcome.js
│   │   │   ├── password-reset.js
│   │   │   └── ... (22 builders)
│   │   └── i18n/                       # Internationalization
│   │       ├── es.js
│   │       ├── en.js
│   │       └── index.js
│   ├── renderer/
│   │   ├── index.js                    # Template rendering engine
│   │   └── layouts/                    # Multiple layouts
│   │       ├── default.js
│   │       └── minimal.js
│   ├── queue/
│   │   ├── index.js                    # Unified queue abstraction
│   │   ├── bullmq.adapter.js
│   │   └── memory.adapter.js
│   ├── workers/
│   │   ├── email.worker.js             # Email sending worker
│   │   ├── webhook.worker.js           # Webhook delivery worker
│   │   └── scheduler.worker.js         # Scheduled email worker
│   ├── api/
│   │   ├── index.js                    # Express app setup
│   │   ├── routes/
│   │   │   ├── emails.js              # POST /send, POST /schedule, GET /
│   │   │   ├── templates.js           # CRUD templates
│   │   │   ├── providers.js           # Provider management
│   │   │   ├── domains.js             # Domain management
│   │   │   ├── api-keys.js            # API Key management
│   │   │   ├── webhooks.js            # Webhook management
│   │   │   ├── metrics.js             # Metrics endpoints
│   │   │   ├── health.js              # Health check
│   │   │   └── auth.js                # Authentication
│   │   ├── middlewares/
│   │   │   ├── authenticate.js        # API Key + JWT auth
│   │   │   ├── rate-limit.js          # Rate limiting
│   │   │   ├── rbac.js                # Role-based access
│   │   │   └── validate.js            # Request validation
│   │   └── docs/
│   │       └── openapi.yaml           # OpenAPI 3.0 spec
│   ├── services/
│   │   ├── email.service.js           # Core email orchestrator
│   │   ├── template.service.js        # Template management
│   │   ├── provider.service.js        # Provider management
│   │   ├── organization.service.js     # Multi-tenant
│   │   ├── domain.service.js           # Domain & sender management
│   │   ├── api-key.service.js          # API Key management
│   │   ├── webhook.service.js          # Webhook delivery
│   │   └── scheduler.service.js        # Email scheduling
│   ├── history/
│   │   ├── index.js                    # History abstraction
│   │   ├── mongo.history.js            # MongoDB implementation
│   │   └── memory.history.js           # In-memory fallback
│   ├── metrics/
│   │   ├── index.js                    # Metrics abstraction
│   │   └── prometheus.exporter.js     # Prometheus format
│   ├── events/
│   │   ├── index.js                    # Event emitter
│   │   └── handlers/                   # Event handlers
│   │       ├── email.events.js
│   │       └── webhook.events.js
│   ├── validators/
│   │   ├── email.validator.js
│   │   ├── template.validator.js
│   │   └── provider.validator.js
│   ├── middleware/
│   │   ├── authenticate.js             # API Key + JWT auth
│   │   ├── rate-limit.js               # Rate limiting
│   │   ├── rbac.js                     # Role-based access
│   │   └── validate.js                # Request validation
│   └── utils/
│       ├── email.js                    # Email utilities
│       └── crypto.js                   # Key generation, hashing
├── dashboard/                          # Admin dashboard (SPA)
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── Emails.jsx
│       │   ├── Templates.jsx
│       │   ├── Providers.jsx
│       │   ├── Domains.jsx
│       │   ├── ApiKeys.jsx
│       │   ├── Webhooks.jsx
│       │   ├── Metrics.jsx
│       │   ├── Logs.jsx
│       │   ├── Workers.jsx
│       │   ├── Queues.jsx
│       │   ├── Users.jsx
│       │   ├── Settings.jsx
│       │   └── Health.jsx
│       └── components/
│           ├── Layout.jsx
│           ├── Sidebar.jsx
│           ├── StatsCard.jsx
│           ├── EmailTable.jsx
│           └── Chart.jsx
├── tests/
│   ├── unit/
│   │   ├── providers.test.js
│   │   ├── validators.test.js
│   │   ├── retry.test.js
│   │   ├── templates.test.js
│   │   ├── renderer.test.js
│   │   ├── history.test.js
│   │   └── metrics.test.js
│   ├── integration/
│   │   ├── email.test.js
│   │   ├── queue.test.js
│   │   └── api.test.js
│   └── fixtures/
│       ├── templates.js
│       └── providers.js
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── openapi.yaml
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## 7. API REST Propuesta

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v1/emails/send` | Enviar un email |
| POST | `/api/v1/emails/schedule` | Programar un email |
| GET | `/api/v1/emails` | Listar emails enviados |
| GET | `/api/v1/emails/:id` | Obtener detalle de un email |
| POST | `/api/v1/templates` | Crear template |
| GET | `/api/v1/templates` | Listar templates |
| GET | `/api/v1/templates/:id` | Obtener template |
| PUT | `/api/v1/templates/:id` | Actualizar template |
| DELETE | `/api/v1/templates/:id` | Eliminar template |
| POST | `/api/v1/templates/:id/versions` | Crear nueva versión |
| GET | `/api/v1/templates/:id/versions` | Listar versiones |
| GET | `/api/v1/providers` | Listar proveedores configurados |
| POST | `/api/v1/providers` | Configurar proveedor |
| PUT | `/api/v1/providers/:name` | Actualizar proveedor |
| POST | `/api/v1/providers/:name/verify` | Verificar conexión |
| GET | `/api/v1/domains` | Listar dominios |
| POST | `/api/v1/domains` | Agregar dominio |
| PUT | `/api/v1/domains/:id/verify` | Verificar dominio (DNS) |
| GET | `/api/v1/api-keys` | Listar API Keys |
| POST | `/api/v1/api-keys` | Crear API Key |
| DELETE | `/api/v1/api-keys/:id` | Revocar API Key |
| GET | `/api/v1/webhooks` | Listar webhooks |
| POST | `/api/v1/webhooks` | Crear webhook |
| PUT | `/api/v1/webhooks/:id` | Actualizar webhook |
| DELETE | `/api/v1/webhooks/:id` | Eliminar webhook |
| GET | `/api/v1/metrics` | Obtener métricas |
| GET | `/api/v1/metrics/prometheus` | Métricas en formato Prometheus |
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/health/readiness` | Readiness probe |
| GET | `/api/v1/health/liveness` | Liveness probe |
| GET | `/api/v1/logs` | Logs de comunicación |
| GET | `/api/v1/queue/stats` | Estadísticas de colas |
| GET | `/api/v1/workers/status` | Estado de workers |
| GET | `/api/v1/domains` | Listar dominios |
| POST | `/api/v1/domains` | Agregar dominio |
| POST | `/api/v1/domains/:id/verify` | Verificar dominio (DNS) |
| GET | `/api/v1/stats` | Estadísticas generales |
| GET | `/api/v1/stats/:organizationId` | Estadísticas por organización |

---

## 7. Dashboard Propuesto (Páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | Dashboard | Resumen general: enviados hoy, pendientes, fallidos, tasa de entrega |
| `/emails` | Correos | Lista de correos enviados con filtros (fecha, template, estado) |
| `/emails/:id` | Detalle de correo | Información completa de un envío |
| `/templates` | Plantillas | CRUD de plantillas con editor y previsualización |
| `/templates/:id` | Editor de plantilla | Editor con preview en vivo, versionado |
| `/providers` | Proveedores | Configuración y estado de proveedores |
| `/domains` | Dominios | Gestión de dominios y remitentes |
| `/api-keys` | API Keys | Gestión de claves de API |
| `/webhooks` | Webhooks | Configuración de webhooks |
| `/metrics` | Métricas | Gráficas de rendimiento y uso |
| `/logs` | Logs | Visualización de logs en tiempo real |
| `/workers` | Workers | Estado de workers activos |
| `/queues` | Colas | Estado de colas (pendientes, fallidos) |
| `/users` | Usuarios | Gestión de usuarios del servicio |
| `/settings` | Configuración | Configuración global del servicio |
| `/health` | Salud | Estado del sistema |

---

## 8. Conclusión

El módulo de comunicación existente en `backend/modules/communication/` es **sorprendentemente completo y profesional**. No es un simple "módulo para enviar correos" — ya implementa:

- **6 proveedores** con patrón factory y strategy
- **22 plantillas** de email con componentes reutilizables
- **Sistema de colas** con BullMQ y fallback en memoria
- **Workers** con reintentos por prioridad
- **Historial** con MongoDB y fallback en memoria
- **Métricas** in-memory
- **Eventos** Socket.IO
- **Logging** estructurado
- **Validación** de entrada
- **16 tests** que pasan

**No se necesita reimplementar nada de esto.** La estrategia es:

1. **Extraer** el módulo completo a `communication-service/` como paquete independiente
2. **Unificar** los sistemas duplicados (queue, metrics)
3. **Agregar** las capacidades faltantes (API REST, auth, multi-tenant, dashboard, webhooks, i18n)
4. **Migrar** consumidores existentes gradualmente
5. **Mantener** el módulo original como wrapper hasta completar la migración

---

## 8. Próximos Pasos

1. ✅ **Fase 0** — Análisis completo (este documento)
2. ⬜ **Fase 1** — Crear estructura `communication-service/` con el código extraído
3. ⬜ **Fase 2** — Unificar sistemas duplicados (queue, metrics)
4. ⬜ **Fase 3** — Agregar API REST con autenticación propia
5. ⬜ **Fase 4** — Agregar soporte multi-tenant (organizaciones, proyectos, dominios)
6. ⬜ **Fase 5** — Agregar dashboard web
7. ⬜ **Fase 6** — Agregar webhooks
8. ⬜ **Fase 7** — Agregar i18n y versionado de templates
9. ⬜ **Fase 8** — Migrar consumidores existentes
10. ⬜ **Fase 9** — Dockerizar y preparar para Kubernetes
