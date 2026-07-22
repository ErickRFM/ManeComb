# RC-ARCH-01 — Services: Clientes API y Servicios Externos (Ventas + Admin Portal)

> **Propósito:** Catalogar los servicios HTTP y de negocio del proyecto Ventas, documentar configuración y endpoints.
> **Estado:** Solo auditoría. Sin modificaciones.

---

## Evidencia de la auditoría

| Dato | Valor |
|------|-------|
| Rama | `main` |
| Commit | `30a2052` |
| Fecha | 2026-07-21 |
| Método | Búsqueda manual de archivos con axios, fetch, api, service, client |
| Archivos excluidos | `node_modules/`, `dist/`, `build/`, logs, `*.md`, `.*`, tests |

---

## 1. Cliente HTTP central

### `src/lib/api.ts` (386 líneas)

| Propiedad | Valor |
|-----------|-------|
| Archivo | `src/lib/api.ts` |
| Dependencia | Axios v1.x |
| Base URL | `https://manecomb.onrender.com/api` (hardcodeada) |
| Timeout por defecto | 30 segundos |
| Autenticación | Bearer token desde `useAppStore.getState().session?.token` vía interceptor `request` |
| Refresh token | No implementado. Si el token expira (401), se llama `useAppStore.getState().clearSession()` y redirige a `/login` |
| Headers por defecto | `Content-Type: application/json`, `Accept: application/json` |
| Manejo de errores | Los errores HTTP se propagan como excepciones. No hay reintentos automáticos. |

**Interceptores:**
- `request`: Inyecta `Authorization: Bearer <token>` en cada request
- `response`: En error 401, cierra sesión y redirige

**No hay retry automático** en el cliente HTTP de Ventas. Si una request falla por timeout (30s) o error 5xx, la excepción se propaga al llamante. El manejo de reintentos queda a criterio de cada screen/hook.

#### Endpoints disponibles (desde `src/lib/api.ts`)

| Ruta | Método | Función exportada |
|------|--------|-------------------|
| `/login` | POST | `login` |
| `/register` | POST | `register` |
| `/sale-points/register` | POST | `registerSalePoint` |
| `/users/profile` | GET | `getUserProfile` |
| `/agencies` | GET | `getAgencies` |
| `/plans` | GET | `getPlans` |
| `/special-plans` | GET | `getSpecialPlans` |
| `/plans-categories` | GET | `getPlanCategories` |
| `/sale-points` | GET | `listSalePoints` |
| `/sale-points/:id` | GET | `getSalePoint` |
| `/assigned-companies` | GET | `getAssignedCompanies` |
| `/companies` | GET | `getCompanyPlans` |
| `/companies/preferences` | GET | `getCompanyPreferences` |
| `/companies/plan-selected` | POST | `selectCompanyPlan` |
| `/checkout/process` | POST | `processCheckout` |
| `/payment/save` | POST | `savePaymentInfo` |
| `/forgot-password` | POST | `forgotPassword` |
| `/reset-password` | POST | `resetPassword` |
| `/health` | GET | `healthCheck` |
| `/sse/subscribe` | GET | — (eventos SSE) |
| `/rental/admin-exists` | GET | `adminExists` |

### 1.1 Diferencia con mobile

| Aspecto | Ventas (`src/lib/api.ts`) | Mobile (`mobile/src/api/client.ts`) |
|---------|--------------------------|-----------------------------------|
| Líneas | 386 | 963 |
| Retry automático | **No** | **Sí** — intercepta 401, intenta refresh token, reintenta request original |
| Refresh token | **No** — solo cierra sesión | **Sí** — endpoint `/auth/refresh`, hasta 3 reintentos |
| Trace ID | **No** | **Sí** — `traceId` en headers |
| Timeout | 30s | 30s |

**Conclusión:** Ventas NO tiene retry ni refresh automático. Las afirmaciones en documentos anteriores sobre "retry automático" eran incorrectas. Mobile sí tiene retry, pero Ventas no.

---

## 2. API del Portal Admin

### `features/portal/api.ts` (29 líneas)

| Propiedad | Valor |
|-----------|-------|
| Archivo | `features/portal/api.ts` |
| Dependencia | Re-exporta funciones de `src/lib/api.ts` |
| Funciones re-exportadas | `getUserProfile`, `listSalePoints`, `getSalePoint`, `getAssignedCompanies`, `getCompanyPlans`, `getCompanyPreferences`, `selectCompanyPlan`, `getPlanCategories` |
| Funciones propias | Ninguna |

Es un wrapper delgado que re-exporta un subconjunto de `src/lib/api.ts`. No añade lógica, interceptores ni configuración propia.

---

## 3. Servicios de Commercial

### `features/commercial/services/commercial-engine.ts` (272 líneas)

| Propiedad | Valor |
|-----------|-------|
| Dependencia | `src/lib/api` (getPlans, getPlanCategories, getSpecialPlans, selectCompanyPlan) |
| Funciones | `getEngine(state, payload)`, `selectPlan(state, plan)`, `executeCheckout(state, payload)` |
| Responsabilidad | Orquesta la lógica de selección de plan y checkout, combinando datos de API con estado local |

### `features/commercial/services/checkout-validation.ts` (37 líneas)

| Propiedad | Valor |
|-----------|-------|
| Dependencia | Ninguna externa |
| Función | `validateCheckoutForm(form: CheckoutForm)` |
| Responsabilidad | Validación local de formulario de checkout (no llama API) |

### `features/commercial/services/plans-cache.ts` (31 líneas)

| Propiedad | Valor |
|-----------|-------|
| Dependencia | Map nativo |
| Función | `plansCache` — objeto Map para cachear planes por categoría |
| Responsabilidad | Cache en memoria de planes para evitar requests duplicados |

### `features/commercial/services/billing-download.ts` (6 líneas)

| Propiedad | Valor |
|-----------|-------|
| Dependencia | `src/lib/api` |
| Función | `downloadBilling()` |
| Responsabilidad | Descarga de factura (solo inicia, no implementa el streaming) |

---

## 4. Adaptadores de Commercial

### `features/commercial/adapters/api-checkout-service-adapter.ts` (139 líneas)

| Propiedad | Valor |
|-----------|-------|
| Dependencia | `src/lib/api`, `features/commercial/types.ts` |
| Función | Adaptador entre el motor comercial y la API de checkout |
| Responsabilidad | Traduce llamadas del `commercial-engine` a requests HTTP concretas |

### `features/commercial/adapters/in-memory-commercial-adapters.ts` (40 líneas)

| Propiedad | Valor |
|-----------|-------|
| Dependencia | `features/commercial/types.ts` |
| Función | Adaptadores en memoria (mock) |
| Responsabilidad | Datos de prueba para desarrollo/localhost |

---

## 5. Servicios externos consumidos

| Servicio | Propósito | Biblioteca | Configuración |
|----------|-----------|-----------|---------------|
| **Mapbox GL JS** | Mapas en dashboard y rutas | `mapbox-gl@2.15` | Token en `operations-map.tsx` (hardcodeado en el archivo) |
| **Socket.IO** | Tiempo real (ubicaciones, eventos) | `socket.io-client` v4.x | URL desde variable de entorno o hardcodeada (no documenta cuál) |
| **Backend Laravel** | API REST | Axios | `https://manecomb.onrender.com/api` |

---

## 6. Servicios de Mobile (solo referencia)

| Servicio | Archivo | Líneas |
|----------|---------|--------|
| API Client + retry + refresh | `mobile/src/api/client.ts` | 963 |
| Socket.IO (conexión tiempo real) | `mobile/src/lib/socket.ts` | — |
| Geocoding inverso | `mobile/src/lib/reverse-geocoding.ts` | — |
| Location service | `mobile/src/lib/location-service.ts` | — |
| Notification service | `mobile/src/services/notification-service.ts` | — |
| Permissions service | `mobile/src/services/permission-service.ts` | — |
| Audio service | `mobile/src/lib/audio.ts` | — |

**Mobile tiene servicios que Ventas no comparte:** geocoding, location, notificaciones push, permisos nativos, audio. No hay superposición.
