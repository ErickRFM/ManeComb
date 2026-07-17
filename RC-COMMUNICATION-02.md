# RC-COMMUNICATION-02 — Delivery Engine

**Fecha:** 2026-07-16
**Estado:** ✅ Certificada

---

## Componentes implementados

| Componente | Archivo | Descripción |
|---|---|---|
| **Error Classification** | `src/errors/index.js` | Jerarquía de errores: CommunicationError, BounceError, RejectError, RateLimitError, TimeoutError, AuthError, InvalidAddressError, ProviderError. Función `classifyError()` que categoriza errores por contenido del mensaje (códigos SMTP, strings de error). |
| **Connection Manager** | `src/connection/index.js` | Pool de conexiones reciclables con maxConnections, idle timeout, acquire/release. Integrado con SMTP provider para reutilizar transportes de nodemailer. |
| **Timeout Manager** | `src/timeout/index.js` | `withTimeout(promiseFn, timeoutMs)` envuelve cualquier async con timeout. `getTimeoutMs(priority)` escala timeout según prioridad (CRITICAL=60s, HIGH=45s, otras=30s). |
| **Rate Limiter** | `src/rate-limit/index.js` | Token bucket configurable por nombre. `waitForToken(name)` bloquea hasta tener token disponible. Refill rate/interval configurables. |
| **Delivery Pipeline** | `src/delivery/pipeline.js` | Pipeline de stages encadenables: ValidateStage → ResolveTemplateStage → RateLimitStage → ErrorClassificationStage → SendStage → MetricsStage → HistoryStage → EventsStage. Cada stage es una clase intercambiable. |
| **Delivery Engine** | `src/delivery/engine.js` | Orquestador que integra el pipeline completo. Expone `sendDirect()`, `sendViaQueue()`, `queueOrDirect()` (crítico → directo, resto → cola). |
| **Liveness Check** | `src/health/index.js` | `getLiveness()` añadido: status, uptime, timestamp. |

## Componentes auditados

| Componente | Estado | Hallazgos |
|---|---|---|
| **SMTP Transport** | ✅ Corregido | Ahora usa ConnectionManager con pooling. Conexiones recicladas, no creadas por envío. Timeout configurado (connectionTimeout, greetingTimeout, socketTimeout). Nodemailer pool mode activado (maxConnections: 5, maxMessages: 100). |
| **Base Provider** | ✅ Mejorado | Añadido `getConnectionKey()` para identificación de pools. |
| **Retry (exponential backoff)** | ✅ Corregido | `getJobOptions()` ahora usa `backoff: { type: "exponential", delay: 1000 }` en lugar de `type: "fixed"`. Las progresivas RETRY_DELAYS arrays se conservan como documentación pero ya no son necesarias para BullMQ. |
| **Workers** | ✅ Mejorado | Tracking de intentos por history con `attempts` reales. Clasificación de errores en workers: no reintenta bounce/reject, reintenta rate-limit/timeout. Métricas por categoría de error. |
| **Queue** | ✅ Sin cambios | Compatibilidad total mantenida. |
| **Metrics** | ✅ Sin cambios | Nuevas métricas: `emails_retry_attempt`, `emails_{category}`, `emails_retryable_failure`, `emails_permanent_failure`. |
| **History** | ✅ Sin cambios | Schema intacto. Tracking de intentos mejorado. |
| **Events** | ✅ Sin cambios | Eventos incluyen categoría de error. |
| **Logger** | ✅ Sin cambios | Logs incluyen categoría de error. |
| **Config** | ✅ Mejorado | Añadida sección `delivery` con configuración de timeouts, rate limits y connection pooling. |
| **Templates** | ✅ Sin cambios | Sin cambios necesarios. |
| **Renderer** | ✅ Sin cambios | Sin cambios necesarios. |

## Evidencias

- **communication-service tests:** 22/22 tests pasan
- **Backend tests:** 18 suites, todas pasan
- **git diff --check:** Sin errores (solo whitespace warnings preexistentes)

## Problemas encontrados

| Problema | Solución |
|---|---|
| `getJobOptions()` usaba `backoff: { type: "fixed" }` ignorando los arrays progresivos de `RETRY_DELAYS` | Cambiado a `type: "exponential"` con delay base 1s |
| SMTP Provider creaba nuevo transporter por envío | Implementado ConnectionManager con pooling de conexiones |
| `shouldRetry()` estaba definido pero nunca llamado en producción | Integrado en workers: los errores no reintentables (bounce, reject, auth, invalid) detienen el job sin rethrow |
| Workers no registraban intentos reales en history | Ahora pasan `attempts: (job.attemptsMade || 0) + 1` al history.log |
| No existía error classification | `classifyError()` categoriza errores por código/string y retorna objetos con propiedades `category` y `retryable` |
| Sin timeouts en providers | `withTimeout()` envuelve provider.send() en SendStage |
| Sin rate limiting preventivo | RateLimiter token bucket integrado en el pipeline |
| Sin liveness check | `getLiveness()` añadido a health module |

## Correcciones realizadas

1. `src/core/retry.js` — backoff de fixed a exponential
2. `src/providers/smtp.provider.js` — conexión poolizada con ConnectionManager
3. `src/providers/base.provider.js` — `getConnectionKey()` añadido
4. `src/workers/index.js` — clasificación de errores, tracking de intentos reales, no reintento de bounce/reject
5. `src/config/index.js` — sección `delivery` añadida
6. `src/health/index.js` — `getLiveness()` añadido
7. `src/delivery/pipeline.js` — bugfix ValidateStage (argumentos posicionales → objeto)

## Riesgos pendientes

| Riesgo | Severidad | Acción futura |
|---|---|---|
| No hay webhook receiver para bounce/click/open tracking | Media | Fase posterior |
| No hay dead-letter queue para jobs permanentemente fallidos | Baja | Configurable en queue |
| No hay circuit breaker para proveedores | Baja | Monitorizar health de proveedores |
| Connection Manager cleanup no probado en high concurrency | Baja | Pruebas de carga recomendadas |
| History no expone API REST | Ninguno | Fase 2 (API REST) |

## Respuestas a las preguntas de certificación

### ¿Existe ahora una única implementación del Communication Service?

✅ **Sí.** `communication-service/src/` es la única fuente de verdad. Backend adapters delegan exclusivamente aquí.

### ¿backend/modules/communication contiene únicamente adapters?

✅ **Sí.** 13 archivos, todos son adapters puros (reexport, delegación, wiring mínimo en logger). No hay lógica de negocio.

### ¿Quedó una sola fuente de verdad?

✅ **Sí.** Todos los componentes (queue, metrics, providers, templates, retry, validators, history, events, delivery engine) tienen implementación única en `communication-service/src/`.

### ¿Se eliminó toda la deuda técnica detectada en RC-COMMUNICATION-VERIFY-01?

✅ **Sí.** `communication.service.js` eliminado (265 líneas duplicadas). Backoff corregido. shouldRetry() integrado.

### ¿Puede certificarse definitivamente la Fase 1?

✅ **Sí.** Fase 1 certificada. La auditoría RC-COMMUNICATION-VERIFY-01 y la limpieza RC-COMMUNICATION-CLEANUP-01 están completas.

## Clasificación

✅ **Fase certificada**

Todos los componentes del Delivery Engine están implementados, auditados, corregidos y verificados. No se rompió compatibilidad hacia atrás. Backend, tests, adapters existentes siguen funcionando.
