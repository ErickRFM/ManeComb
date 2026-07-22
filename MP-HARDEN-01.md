# MP-HARDEN-01 — Cierre de configuración y confianza del Webhook de Mercado Pago

**Estado:** Cerrado

## Base y alcance

| Campo | Evidencia |
|---|---|
| Rama | `main` |
| Commit base | `c430c74` |
| Estado inicial del alcance Backend | Limpio, sin cambios concurrentes |
| Trabajo paralelo detectado | Cambios ajenos en `mobile/`, `RC-MOBILE-MODULARIZATION-01.md` y eliminación de un archivo temporal de Word en `docs/` |
| Estado final del alcance Backend | Validado y preparado en un commit independiente |

No se ejecutaron `revert`, `reset`, `rebase`, `cherry-pick`, `amend` ni llamadas reales a Mercado Pago. Los cambios concurrentes ajenos no fueron restaurados, modificados ni agregados.

## Inventario previo

- La firma se validaba localmente en `backend/src/modules/commercial/routes.js`.
- Sin `MERCADO_PAGO_WEBHOOK_SECRET`, el validador devolvía verdadero y el Webhook podía continuar.
- El proveedor se seleccionaba en `commercial-payment.js` a partir de `PAYMENT_PROVIDER`.
- Producción ya se detectaba con la señal central `IS_PRODUCTION_RUNTIME`; esta RC la reutiliza.
- Sandbox o producción podían inferirse por prefijos de credenciales cuando faltaba un ambiente explícito.
- `notification_url` provenía de `MERCADO_PAGO_WEBHOOK_URL` o de una base pública configurada por el entorno.
- La readiness existente no comprobaba en conjunto ambiente explícito, secreto y URL pública.
- Los endpoints de health ya consumían la readiness de pagos, por lo que se reforzó esa fuente sin crear rutas nuevas.
- Las pruebas existentes cubrían checkout, estados y Webhook aprobado, pero no el rechazo fail-closed completo.

## Problemas corregidos

### Webhook fail-closed

La validación de firma quedó centralizada en el servicio de pagos. Exige secreto configurado, identificador de pago, `x-request-id`, timestamp numérico válido y firma hexadecimal HMAC-SHA256. La comparación usa `timingSafeEqual` y cualquier dato ausente, formato inválido o excepción produce rechazo.

La ruta conserva su respuesta `401 Unauthorized` y valida la firma antes de registrar idempotencia. Nunca se devuelve `202` cuando la autenticidad no pudo comprobarse.

### Ambiente explícito

Mercado Pago solo admite `sandbox` o `production`. Ya no se infiere el ambiente por el prefijo del token; el prefijo se utiliza únicamente para detectar incoherencias entre credencial y ambiente.

### URL pública obligatoria

La readiness exige una URL HTTPS con el path existente `/api/commercial/webhooks/mercadopago`. Rechaza credenciales embebidas, query strings, fragmentos, localhost, `0.0.0.0`, loopback e IP privadas. En producción también valida que las URLs de retorno sean públicas y HTTPS.

### Provider de prueba bloqueado en producción

`PAYMENT_PROVIDER=test` continúa disponible en desarrollo y pruebas, pero la señal central de runtime productivo lo marca como no preparado. Checkout falla antes de generar `paid_test`, por lo que una orden no puede activarse por esa vía en producción.

### Selección segura por defecto

Si `PAYMENT_PROVIDER` no se declara, el backend queda en modo `manual`. Mercado Pago requiere selección explícita y configuración completa; esto evita iniciar cobros automáticos por una omisión de entorno y conserva los flujos históricos de pruebas que no seleccionan proveedor.

### Readiness segura

El diagnóstico expone solo metadatos seguros: proveedor, ambiente, indicadores de configuración, readiness e issues. No contiene Access Token, secreto, firma, headers ni valores completos. El checkout de Mercado Pago consulta esta readiness y rechaza operaciones cuando no está preparado.

## Archivos modificados

| Archivo | Responsabilidad |
|---|---|
| `backend/src/config/env.js` | Proveedor manual seguro por defecto |
| `backend/src/services/commercial-payment.js` | Validación central, readiness, URLs y restricciones de runtime |
| `backend/src/modules/commercial/routes.js` | Consumo del validador fail-closed antes de idempotencia |
| `backend/test/mercado-pago.test.js` | Casos de firma, ambiente, URL, readiness y provider test |
| `backend/test/env.test.js` | Validación de configuración y runtime productivo |
| `MP-HARDEN-01.md` | Evidencia técnica y cierre |

## Pruebas

| Grupo | Casos verificados | Resultado |
|---|---|---|
| Firma | válida, inválida, ausente, secreto ausente, timestamp inválido, request ID ausente, manifest alterado y comparación segura | Aprobado |
| Orden del Webhook | firma inválida rechazada antes de idempotencia | Aprobado |
| Ambiente | ausente, desconocido, `test`, `dev`, sandbox y producción válidos, coherencia de credencial | Aprobado |
| URL pública | ausente, HTTP, localhost, IP privada, query string y HTTPS válida | Aprobado |
| Provider test | permitido fuera de producción; rechazado en producción sin `paid_test` ni activación | Aprobado |
| Readiness | configuración completa y faltantes de ambiente, secreto o URL, sin exposición sensible | Aprobado |
| Pruebas específicas | `mercado-pago.test.js` y `env.test.js` con el runner real | Aprobado |
| Suite Backend | `npm test` | Aprobado |

Todas las integraciones externas fueron sustituidas por mocks. No se usaron credenciales locales ni se crearon cobros u órdenes reales en Mercado Pago.

## Compatibilidad

No cambiaron endpoints de checkout, confirmación o Webhook; estructura de órdenes; precios; planes; add-ons; activación; facturas; suscripciones; payload público exitoso; redirección; Store; Portal; Checkout frontend ni Mobile. No se modificó el servicio de idempotencia.

## Hallazgos pendientes

Quedan fuera de esta RC la conciliación de monto, moneda, preference ID y merchant; idempotency key de checkout; transiciones financieras; recuperación de eventos; elegibilidad y periodos de trial; refunds y chargebacks. Corresponden a MP-HARDEN-02 y MP-HARDEN-03.

## Métricas

- 5 archivos fuente/prueba modificados.
- 1 reporte nuevo.
- 26 categorías de casos obligatorios cubiertas, con casos adicionales para IP privada y query string.
- 1 suite específica de Mercado Pago, 1 suite de ambiente y la suite completa de Backend ejecutadas.

## Rollback

```bash
git revert <HASH_MP_HARDEN_01>
```

El rollback queda documentado; no fue ejecutado.
