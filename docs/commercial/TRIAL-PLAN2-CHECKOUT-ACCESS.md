# Prueba de 7 días — contrato comercial

## Regla definitiva

Solo `starter-2` puede iniciar una prueba.

| Campo | Valor |
|---|---|
| Plan | `starter-2` |
| Capacidad | 2 combis |
| Duración | 7 días |
| Repetición | Una por organización |
| Otros planes | Compra obligatoria |

## Flujo

### Compra

`plan seleccionado -> cuenta -> checkout -> pago confirmado -> correo -> portal activo`

### Prueba

`starter-2 -> cuenta -> método de pago válido -> prueba activa -> avisos -> cobro al vencer -> ACTIVE o PAST_DUE`

## Autoridades existentes reutilizadas

- `backend/src/config/commercial-plans.js`: catálogo y precios.
- `commercial-activation.js`: elegibilidad, activación y fechas.
- `portal-account.js`: estado derivado y vencimiento.
- `auth-context.js`: acceso al portal y operación.
- `checkout-context.ts`: intención e idempotencia del checkout.
- `commercial-notifier.js`: notificaciones comerciales.

## Cambios de esta fase

- Política canónica independiente para el plan de prueba.
- Validación backend por ID, unidades, días y bandera de elegibilidad.
- Sanitización del contexto de checkout para ignorar `trial=1` en otros planes.
- Bloqueo en el consumidor de checkout antes de crear una sesión inválida.
- Pruebas de los cinco planes y configuraciones inconsistentes.

## Importante sobre tarjeta y cobro automático

La regla de negocio exige método de pago antes de iniciar la prueba y cobro del plan `starter-2` al terminar. Esto no debe simularse guardando número completo o CVV, ni usando el flujo manual demo como si fuera una suscripción real.

La siguiente fase debe conectar tokenización/suscripción recurrente del proveedor configurado, persistiendo únicamente referencias seguras (`customerId`, `paymentMethodId`, marca, últimos cuatro y vencimiento). Hasta certificar ese proveedor, no se declarará el cobro automático como terminado.

## Acceso

- `pending_payment`: solo pago, perfil y soporte.
- `trial`: portal y operación, máximo 2 unidades, con vencimiento visible.
- `active`: acceso conforme al plan pagado.
- `past_due`: solo perfil, facturación, método de pago y soporte.
- `expired`, `suspended`, `cancelled`: operación bloqueada.

## Veredicto

`TRIAL_POLICY_HARDENED_RECURRING_BILLING_PENDING`
