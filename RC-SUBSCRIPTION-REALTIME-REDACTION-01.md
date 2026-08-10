# RC-SUBSCRIPTION-REALTIME-REDACTION-01

## Dictamen

**Corrección implementada — certificación CI en curso.**

Esta RC corrige una regresión de privacidad y least-privilege en el evento organizacional `subscription:updated`, sin modificar la autoridad canónica de suscripción ni los eventos detallados reservados a billing.

## Hallazgo

Todos los usuarios autenticados con `organizationId` pueden pertenecer a la room Socket.IO `org:<tenant>`. Esa room es necesaria para presencia e invalidaciones organizacionales, pero no es una audiencia de billing.

Antes de esta RC, tres caminos podían publicar en esa room un snapshot construido con `buildSubscription(order)`. Ese objeto puede incluir:

- `monthlyPrice`;
- `financialStatus`;
- `refundedAmountMinor`;
- `refundableAmountMinor`;
- `chargebackStatus`;
- `currentPeriodStart` / `currentPeriodEnd`;
- `nextBillingAt`;
- fechas de cancelación.

Los consumidores no necesitaban esos datos en realtime:

- Mobile ignora el payload de `subscription:updated` y ejecuta `refreshAll()` para volver a consultar la autoridad backend.
- Portal trata `subscription:updated` como invalidación comercial y ejecuta `loadAll({ force: true })`; el campo `subscription` del evento ya era opcional.

También `account/routes.js` emitía el evento a `org:<tenant>` y después al `user:<actor>`, por lo que el actor podía recibir dos invalidaciones y disparar dos refetches.

## Causa raíz

La RC de consistencia de suscripción había establecido correctamente que `subscription:updated` debía ser una invalidación saneada, pero esa propiedad no quedó protegida por una regresión de red. Con el tiempo, los emisores volvieron a construir el evento directamente en rutas y reintrodujeron el snapshot completo.

La falla no estaba en `buildSubscription`: ese resolver sigue siendo la fuente correcta para REST y auth. La falla era usar su DTO completo como mensaje broadcast para una audiencia más amplia que billing.

## Corrección

Se añadió `backend/src/services/subscription-realtime.js` como única autoridad para el evento.

El contrato org-wide queda limitado a:

```json
{
  "version": 1,
  "organizationId": "org-id",
  "reason": "plan_changed|subscription_cancelled|payment_confirmed|manual_payment_approved",
  "updatedAt": "ISO-8601"
}
```

No contiene estado comercial, importes, reembolsos, chargebacks, método/proveedor de pago ni fechas de facturación.

### Emisión

`emitSubscriptionUpdated()` publica una sola vez en:

```text
org:<organizationId>
```

No vuelve a emitir al actor individual porque ese socket ya pertenece a la room organizacional.

### Razones enumeradas

- `plan_changed`
- `subscription_cancelled`
- `payment_confirmed`
- `manual_payment_approved`

Una razón desconocida falla antes de emitir.

## Rutas migradas

### Account

Cambio de plan y cancelación dejaron de construir `subscription:updated` directamente. Ambos llaman al servicio canónico.

También se eliminó `emitAccountEvent()` de ese flujo, evitando la segunda emisión al actor.

### Commercial / Mercado Pago

Una transición de pago aplicada mantiene los eventos detallados `payment:confirmed` y `plan:active` en sus audiencias de billing/owner/Platform, pero la invalidación org-wide usa ahora el payload mínimo.

### Platform manual payment

`manual-payment:updated` conserva su payload detallado y sus rooms autorizadas.

`subscription:updated`:

- ya no se mezcla dentro de `emitManualPaymentUpdate()`;
- solo se emite cuando `decision === "approve"`;
- un rechazo SPEI ya no provoca una invalidación de suscripción innecesaria.

## Regresión permanente

`backend/test/subscription-realtime.test.js` protege dos propiedades distintas.

### Contrato de payload

Verifica que el mensaje tenga exactamente:

- `version`;
- `organizationId`;
- `reason`;
- `updatedAt`.

Además prohíbe explícitamente campos como `subscription`, `monthlyPrice`, `financialStatus`, refunds, chargeback y fechas comerciales.

### Autoridad única

El test recorre `backend/src/**/*.js` y falla si el literal `subscription:updated` aparece fuera de `services/subscription-realtime.js`.

La regresión está enlazada desde `backend/test/backend-architecture.test.js`, por lo que forma parte de `npm test` normal y no depende de ejecutar una suite especial.

## Compatibilidad de clientes

No se cambió el nombre del evento.

- Mobile continúa usando `subscription:updated` como señal para `refreshAll()` y recupera `/auth/me`/autoridad backend.
- Portal continúa marcándolo como `needsFullCommercialReload()` y recupera overview/subscription por REST.

Por tanto, retirar el snapshot del evento no cambia la fuente de verdad ni requiere que el cliente infiera estado localmente.

## Eventos deliberadamente no modificados

La auditoría confirmó segmentación adecuada en:

- `payment:confirmed` y `plan:active`: rooms con billing permission + owner + Platform;
- `manual-payment:updated`: billing roles + owner + Platform;
- `activation-keys:updated`: roles con gestión de usuarios + actor;
- GPS / `location:updated`: roles con analytics + conductor + Platform;
- jornadas / `route-session:updated`: analytics + conductor + Platform;
- presencia organizacional: payload mínimo `{ userId, status }`.

No se amplió ni redujo su autoridad en esta RC.

## Archivos de runtime

- `backend/src/services/subscription-realtime.js`
- `backend/src/modules/account/routes.js`
- `backend/src/modules/commercial/routes.js`
- `backend/src/modules/platform/manual-payment-routes.js`

## Archivos de regresión

- `backend/test/subscription-realtime.test.js`
- `backend/test/backend-architecture.test.js`

## Estado de validación

- Dependency Audit: PASS en el primer SHA con regresión.
- Ventas: typecheck/build/SPA PASS.
- Admin Global: typecheck/test/build/Workers PASS.
- Communication Service: PASS.
- Mobile: typecheck/lint PASS; Jest en curso al redactar esta RC.
- Backend: suite completa en curso al redactar esta RC.
- Infrastructure: validación/smoke en curso al redactar esta RC.
- APK Android: se ejecutará después de Mobile quality en el mismo SHA final.

La certificación final de esta RC debe actualizarse únicamente cuando CI, Dependency Audit y APK hayan terminado en el mismo SHA limpio.
