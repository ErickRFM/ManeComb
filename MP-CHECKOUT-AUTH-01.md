# MP-CHECKOUT-AUTH-01 — Diagnóstico de autorización de Checkout

**Estado:** Cerrado

**Veredicto:** `CHECKOUT_403_NOT_REPRODUCED`

## Resumen

El `403` observado en el despliegue no pudo reproducirse con el contrato actual ni con el flujo real de registro de Ventas. Una cuenta comercial recién registrada queda autenticada como `company_owner`, recibe el rol efectivo `owner`, queda asociada a una organización y puede crear un Checkout con respuesta `201`.

No se modificó código de autenticación, autorización, Checkout ni frontend. Hacerlo sin conocer el cuerpo seguro de la respuesta desplegada podría ampliar permisos o esconder una condición válida.

## Evidencia inicial

| Señal | Evidencia disponible |
|---|---|
| Login | La sesión aparentaba existir; no se reportó un `401` nuevo |
| Checkout | `POST /api/commercial/checkout` → `403` en el despliegue |
| Código de respuesta | No se capturó un código funcional ni el mensaje seguro del body |
| Vehículos | `GET /api/vehicles` → `403` |
| Unidades | `GET /api/operational-units` → `403` |
| APRO | No ejecutado |

Los `403` de vehículos y unidades no son requisitos del Checkout. Para una organización registrada sin plan activo, el control de acceso operativo los rechaza con `PLAN_REQUIRED`; la misma sesión puede crear el Checkout correctamente.

## Contrato verificado

La ruta es `POST /api/commercial/checkout` y aplica, en este orden:

1. `authenticate`
2. `requirePortalAccess`
3. `requirePermission("canManageBilling")`
4. handler de creación de Checkout

`requirePortalAccess` exige una cuenta `company_owner`, una organización resoluble y un rol efectivo permitido. `canManageBilling` está habilitado para `owner`, `admin` y `billing_manager`.

El registro desde Ventas envía `accountType: company_owner`. El backend asigna el rol `owner`, deriva la organización y devuelve la sesión saneada. El cliente guarda la sesión, actualiza el cliente HTTP y envía el encabezado de autenticación mediante el mismo cliente usado por Checkout.

El backend obtiene el plan y precio desde su propio catálogo y deriva la organización desde la sesión. El body no es autoridad para el monto ni para seleccionar otro tenant.

## Fuentes posibles del `403`

| Respuesta segura | Condición | Puede afectar Checkout |
|---|---|---|
| `No tienes acceso al portal administrativo` | Tipo de cuenta, organización o rol efectivo incompatible | Sí, en `requirePortalAccess` |
| `No tienes permiso para realizar esta accion` | El rol efectivo no tiene `canManageBilling` | Sí, en `requirePermission` |
| `PLAN_REQUIRED` | Acceso a funciones operativas sin plan activo | No; explica vehículos/unidades, no Checkout |

La interfaz convierte respuestas `403` en un mensaje genérico de permisos. Sin el body seguro del `403` desplegado o los campos no sensibles de `/api/auth/me`, no es posible distinguir entre las dos primeras condiciones.

## Reproducción controlada

El flujo local usó almacenamiento embebido, proveedor stub y datos ficticios:

1. Registro comercial → `201`.
2. Login → `200`.
3. Acceso operativo antes de comprar → `403 PLAN_REQUIRED`.
4. Checkout con plan válido → `201`.
5. Repetición controlada de Checkout → `201`, preservando idempotencia.
6. Confirmación stub → `200`.
7. Consulta posterior de sesión → `200`.

No se llamó a Mercado Pago, no se creó una Preference real y no se simuló un Webhook.

## Causa raíz

**No establecida para el despliegue.** El código y las pruebas demuestran que el contrato admite al comprador comercial correcto. La evidencia remota disponible solo contiene el estado HTTP y el mensaje genérico del frontend; no identifica si la cuenta desplegada perdió `accountType`, organización o permiso efectivo, ni permite atribuir el fallo al frontend o al backend.

## Corrección

No se aplicó corrección de código. La acción segura es capturar, en una nueva reproducción desplegada:

- el body seguro de `POST /api/commercial/checkout`;
- de `/api/auth/me`, únicamente presencia de sesión, `accountType`, rol efectivo y presencia de organización;
- `tokenPresent` y `authorizationHeaderPresent` como booleanos, sin valores.

Con esa evidencia podrá clasificarse el incidente como cuenta incompleta, sesión desalineada o rechazo por diseño sin debilitar el control de acceso.

## Seguridad

| Control | Resultado |
|---|---|
| Checkout público | NO |
| Autenticación retirada | NO |
| Tenant isolation debilitado | NO |
| Roles elevados | NO |
| Monto confiado al frontend | NO |
| Organización confiada al body | NO |
| Secretos expuestos | NO |
| Llamadas reales a Mercado Pago | NO |

## Validaciones

| Validación | Resultado |
|---|---|
| `payment-readiness.test.js` | PASS |
| `mercado-pago.test.js` | PASS, proveedor simulado |
| `tenant-isolation.test.js` | PASS |
| `app-smoke.test.js` | PASS; registro/login/Checkout `201` |
| Suite completa de backend (`npm test`) | PASS |
| Ventas typecheck | PASS |
| Ventas build | PASS, 630 módulos |
| Ventas tests | No existe script `test` |
| Ventas lint | No existe script `lint` |

## Compatibilidad

No se modificaron el proveedor de pagos, conciliación, Webhook, reembolsos, contracargos, trial, periodos, planes, precios, Mobile ni módulos compartidos.

## Estado E2E

`APRO NO EJECUTADO`

No se verificó un nuevo despliegue de Render o Cloudflare porque no existe corrección de código que desplegar.

## Rollback

Cuando exista el hash documental:

```bash
git revert <HASH_MP_CHECKOUT_AUTH_01>
```

No ejecutar como parte de esta RC.
