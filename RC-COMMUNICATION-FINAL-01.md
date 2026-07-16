# RC-COMMUNICATION-FINAL-01: Módulo de Comunicación — Crash-Proof

## Objetivo
Certificar que ningún proveedor externo (Resend, SMTP, DNS, etc.) puede derribar el backend de Node.js mediante unhandled rejections o excepciones no capturadas.

## Cambios realizados

### 1. `communication.provider.js` — Todos los providers devuelven resultado estructurado (nunca lanzan)

**Problema:** Los métodos `send()` de los 6 providers lanzaban `throw new Error(...)` cuando la API externa respondía con error HTTP. Además, `fetch()` podía lanzar por error de red (DNS, timeout) sin try/catch envolvente, generando unhandled rejections.

**Solución:** Cada `send()` ahora envuelve todo su cuerpo en `try/catch` y devuelve:
- `{ success: true, id: "..." }` en éxito
- `{ success: false, error: "...", status: N }` en fallo

Archivos modificados:
- `ResendProvider.send()` (línea 28)
- `SmtpProvider.send()` (línea 90)
- `SesProvider.send()` (línea 141)
- `MailgunProvider.send()` (línea 201)
- `PostmarkProvider.send()` (línea 265)
- `SendGridProvider.send()` (línea 327)

### 2. `communication.service.js` — sendDirect() nunca lanza, validación de API key

**Problema 1:** `sendDirect()` capturaba errores del provider pero relanzaba (`throw error`), permitiendo que el error escapara al caller. En la ruta crítica (prioridad CRITICAL), `sendEmail()` llamaba a `sendDirect()` sin try/catch, propagando el error al request handler.

**Solución:** `sendDirect()` ahora:
- Expande el `try/catch` para cubrir todo el código (incluyendo `renderTemplate` y `getTemplateBuilder`)
- Verifica `result.success` del provider; si es `false`, registra métricas/eventos/log y retorna `{ success: false, error, ... }` en vez de lanzar
- El `catch` final también retorna `{ success: false, ... }` en vez de relanzar

**Problema 2:** `queue.add()` podía lanzar si BullMQ no puede conectar a Redis.

**Solución:** Se envuelve `queue.add()` en try/catch. Si falla, se cae a `sendDirect()` como fallback.

**Problema 3:** Al arrancar, si `RESEND_API_KEY` faltaba, el proveedor se creaba igual y fallaba en el primer envío.

**Solución:** `configure()` ahora llama a `validateProviderConfig()` antes de crear el provider. Si la configuración es inválida, se loggea un warning ("Communication Provider: Disabled") y se establece `provider = null`. `isConfigured()` retorna `false`, y `sendEmail()` responde con error controlado ("Módulo de comunicaciones no configurado").

### 3. `communication.queue.js` — Local queue maneja correctamente consumers asíncronos

**Problema:** La cola local ejecutaba el consumer dentro de `process.nextTick()` con un `try/catch` sincrónico. Como el consumer es `async`, las promesas rechazadas no eran capturadas, generando unhandled rejections.

**Solución:** Se cambió `process.nextTick()` por `setImmediate(async () => { ... })` con `for...of` y `await consumer(...)` dentro del try/catch, capturando correctamente tanto errores sincrónicos como asíncronos.

### 4. `communication.jobs.js` — Workers verifican result.success, handler global de unhandled rejections

**Problema:** Los workers (`createEmailWorker`, `createWhatsAppWorker`) no verificaban si el resultado de `sendFn` indicaba fallo. Con el cambio a retorno estructurado, el worker debía lanzar explícitamente para que BullMQ active retries.

**Solución:** Después de `await sendFn(...)`, se verifica `if (!result.success) throw new Error(...)`. El throw queda dentro del try/catch del worker, que lo captura, registra en historial, y relanza para BullMQ.

Además, se agregó un handler global `process.on("unhandledRejection", ...)` que loggea cualquier rejection no capturada sin permitir que el proceso termine.

## Archivos modificados (solo comunicación)

| Archivo | Cambios | Líneas |
|---------|---------|--------|
| `communication.provider.js` | 6 providers: try/catch envolvente, retorno estructurado | +282 / -165 |
| `communication.service.js` | sendDirect no lanza, queue.add() con fallback, validación API key startup | +92 / -35 |
| `communication.jobs.js` | Workers verifican result.success, handler global unhandledRejection | +18 |
| `communication.queue.js` | Local queue: setImmediate async con await consumer | +8 / -8 |

## Verificación

- **Tests:** 16 tests de comunicación pasan ✅
- **Smoke test completo:** 17 suites pasan sin errores ✅
- **Escenario cubierto:** RESEND_API_KEY inválida o faltante → servidor no crashea, solo loggea "Communication Provider: Disabled"
- **Escenario cubierto:** fetch a Resend falla (timeout, DNS, 4xx, 5xx) → provider retorna `{ success: false }`, service loggea y retorna error controlado
- **Escenario cubierto:** Redis no disponible → `queue.add()` captura error, cae a sendDirect
- **Escenario cubierto:** Worker async lanza → cola local captura (setImmediate + try/catch), BullMQ captura (failed event)
- **Escenario cubierto:** Unhandled rejection residual → handler global loggea sin crash
