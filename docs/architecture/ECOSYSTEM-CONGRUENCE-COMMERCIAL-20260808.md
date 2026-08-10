# ManeComb — Auditoría de congruencia Comercial / Pagos

**Fecha:** 2026-08-08 (America/Mexico_City)  
**PR:** #63  
**Estado:** complemento del dossier `ECOSYSTEM-CONGRUENCE-AUDIT-20260808.md`.

## Resultado de la pasada

### Confirmado y correcto

#### Evidencia de transferencia manual

`backend/src/modules/manual-payments/routes.js` resuelve la orden mediante `listCommercialOrdersForUser(req.user)` y después compara `orderId`. Tanto lectura como envío de evidencia requieren:

- autenticación;
- `requirePortalAccess`;
- `canManageBilling`.

Los eventos realtime de evidencia se emiten a roles derivados de `canManageBilling`, al owner y a Platform. No se encontró bypass cross-tenant por `orderId`.

#### Activation keys

Los endpoints administrativos de `backend/src/modules/activation-keys/routes.js` para listar, generar, compartir, revocar y eliminar keys exigen `canManageUsers` + organización. El backend coincide con el guard `users.manage` aplicado en Portal. `/portal/onboarding` usa las keys para calcular progreso, pero no entrega la colección de claves crudas.

#### Facturas y descargas

`/account/invoices` y `/account/invoices/:invoiceId/download` requieren `canManageBilling`. La descarga comercial usa un token HMAC con expiración y valida `orderId`, tipo de asset y token antes de entregar/redirect. No se encontró un acceso directo a factura por ID sin autoridad de billing.

### Hallazgo cerrado — `latestOrder` enviaba más de lo declarado

`PortalOverview.latestOrder` está tipado en Ventas como `CommercialCheckoutResult`: id, referencia, empresa, plan, total, status, paymentStatus y fecha.

Sin embargo `buildPortalOverview()` devolvía `activeOrder` completo. Las órdenes enriquecidas pueden transportar `billingProfile`, instrucciones de pago, provider IDs, downloads/tokens y otros campos internos. La búsqueda de consumidores no encontró una pantalla que necesitara el objeto completo.

Corrección:

- `buildLatestOrderSummary()` produce exactamente el shape declarado por `CommercialCheckoutResult`.
- `buildPortalOverview()` usa ese resumen en `latestOrder`.
- `portal-overview-redaction.test.js` inyecta deliberadamente billing profile, provider ID, instrucciones de pago, download token y error interno y exige que ninguno sobreviva en `latestOrder`.

Este cambio no elimina el campo ni cambia su contrato público; hace que backend cumpla el contrato que el cliente ya declaraba.

### Hallazgo parcial / P1 — `subscription:updated` sobreexpone payload por realtime

REST considera el resumen `/account/subscription` visible para cualquier identidad con `portal.access`, por lo que `support` y `viewer` no son un bypass por sí mismos.

La discrepancia aparece en Socket.IO:

- sockets operativos y de Portal comparten la room `org:<organizationId>`;
- `subscription:updated` se emite a esa room con `buildSubscription(order)` completo;
- ese objeto incluye mensualidad y estados financieros como refund/chargeback;
- identidades Mobile sin `portal.access`, incluido un driver, pueden pertenecer a la room de organización;
- tanto Ventas como Mobile usan `subscription:updated` como **señal para recargar**, no necesitan el objeto financiero recibido por socket.

**Dirección de solución:** conservar una señal mínima org-wide, por ejemplo `{ organizationId, updatedAt }`, para que Mobile reevalúe autorización/entitlement; obtener el detalle por REST según autoridad del producto. No crear otra lista manual de roles y no eliminar la señal necesaria para suspender/activar operación tras cambios de plan.

**No aplicado en esta pasada:** el emisor principal vive en `backend/src/modules/commercial/routes.js`, un archivo crítico y grande de pagos/webhooks. No se reescribe el archivo completo por una modificación aislada sin antes añadir una prueba específica de payload realtime.

## Diferencia entre información compartida y billing

No se considera automáticamente incorrecto que un rol Portal sin `billing.manage` conozca que existe un plan activo: el estado de suscripción participa en onboarding, capacidad y disponibilidad del producto. Sí se considera incorrecto transportar datos comerciales internos o financieros que no necesita el receptor cuando el mismo resultado puede resolverse con una señal de invalidación + fetch autorizado.

## Próxima prueba recomendada para esta P1

Crear una prueba de Socket.IO con:

1. driver del tenant conectado a `org:<tenant>`;
2. billing manager/owner en el mismo tenant;
3. transición de suscripción;
4. verificar que el driver recibe `subscription:updated` sin `monthlyPrice`, `refundedAmountMinor`, `refundableAmountMinor` ni `chargebackStatus`;
5. verificar que Portal continúa recargando por el evento;
6. verificar que la operación Mobile reevalúa `authContext` tras la señal.

La solución debe cerrar **payload exposure** sin romper **entitlement propagation**.
