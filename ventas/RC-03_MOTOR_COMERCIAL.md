# RC-03 — Motor de Suscripciones y Reglas Comerciales

Fecha: 10 de julio de 2026
Alcance: `ventas/`

## Límite de alcance

RC-03 se implementó exclusivamente dentro del proyecto comercial `ventas`. No se modificaron la app móvil, backend operativo, APIs operativas, panel operativo, GPS, radio, chat, seguimiento, incidencias, Socket.IO, autenticación móvil ni base de datos.

No se implementaron pagos, prorrateos, webhooks, facturación SAT, renovaciones, cancelaciones ni cambios reales de suscripción.

## 1. Arquitectura implementada

Se creó `features/commercial` como una capa comercial independiente:

- `types.ts`: estados, resultados, resúmenes y eventos tipados.
- `contracts.ts`: interfaces de repositorios, servicios, proveedor y facturación.
- `subscription-state.ts`: traductor único entre estados de API y estados comerciales.
- `rules/subscription-validator.ts`: reglas y validaciones estructuradas.
- `services/commercial-engine.ts`: composición de workspace, resumen, timeline y dashboard.
- `adapters/in-memory-commercial-adapters.ts`: implementaciones simuladas y reemplazables.
- `hooks/use-commercial-experience.ts`: integración entre UI, estado actual y servicios.
- `components/commercial-activity-list.tsx`: timeline reutilizable.
- `create-commercial-service.ts`: composición de dependencias.

Las pantallas consumen hooks y modelos comerciales. Ya no interpretan estados crudos ni calculan reglas de upgrade/downgrade.

## 2. Reglas comerciales creadas

- Upgrade por aumento de capacidad o precio cuando la capacidad es equivalente.
- Downgrade por reducción de capacidad.
- Selección del mismo plan.
- Downgrade bloqueado cuando las unidades utilizadas exceden la capacidad objetivo.
- Cambio bloqueado cuando ya existe otro cambio programado.
- Cambio bloqueado para cuenta suspendida.
- Cambio bloqueado para suscripción cancelada o vencida.
- Cambio bloqueado por pago pendiente o rechazado.
- Tratamiento específico para prueba activa.
- Contratación inicial preparada cuando no existe suscripción activa.

Ninguna regla esperada lanza excepciones. Todas devuelven código, motivo, restricciones, resultado esperado, siguiente paso y acción sugerida.

## 3. Servicios nuevos

- `DefaultSubscriptionService`
- `DefaultSubscriptionValidator`
- `SimulatedBillingService`
- `SimulatedPaymentProvider`

El servicio de suscripción sincroniza snapshots de solo lectura, compone el catálogo, calcula cambios, crea la previsualización y genera modelos de dashboard y actividad.

## 4. Interfaces creadas

- `PlanRepository`
- `SubscriptionRepository`
- `CommercialTimelineRepository`
- `SubscriptionValidator`
- `SubscriptionService`
- `BillingService`
- `PaymentProvider`

Las implementaciones se inyectan al crear el servicio. Un proveedor real podrá sustituir al simulado sin modificar las vistas.

## 5. Estados comerciales implementados

- `TRIAL`
- `ACTIVE`
- `PAYMENT_PENDING`
- `PAYMENT_FAILED`
- `CHANGE_SCHEDULED`
- `SUSPENDED`
- `CANCELLED`
- `EXPIRED`
- `INACTIVE`

Cada estado incluye etiqueta, mensaje, tono, acción principal y restricciones. Las variantes actuales de la API se normalizan en un único punto para evitar cadenas mágicas distribuidas.

## 6. Validaciones soportadas

El resultado `PlanChangeValidation` responde:

- Si el cambio puede continuar.
- El código de validación.
- Si es upgrade, downgrade o mismo plan.
- Por qué está permitido o bloqueado.
- Qué restricciones existen.
- Qué ocurriría con la suscripción.
- Cuál sería el estado esperado.
- Qué debe hacer el usuario después.

El resumen `CommercialChangeSummary` añade diferencias de capacidad, mensualidad, beneficios y snapshots del plan actual y objetivo.

## 7. Componentes refactorizados

### Mi plan

- Consume `useCommercialExperience`.
- No llama APIs de catálogo ni mutaciones de suscripción.
- Muestra mensajes y restricciones generados por el validador.
- Las acciones bloqueadas tienen microcopy contextual.
- “Continuar” solo registra una previsualización local y termina en “Próximamente”.
- Incorpora el historial comercial reutilizable.

### Dashboard

- Consume `useCommercialDashboard`.
- Su estado, recomendación, uso, método principal y actividad provienen del modelo comercial.
- Reacciona automáticamente a pago pendiente, pago rechazado, suspensión, cancelación, vencimiento y cambio programado.
- Utiliza `CommercialActivityList` como centro de actividad.

### Actividad comercial

La estructura soporta:

- Cuenta creada.
- Plan contratado.
- Comparación preparada.
- Cambio solicitado.
- Cambio confirmado.
- Renovación.
- Cancelación.
- Reactivación.
- Método de pago agregado.
- Comprobante emitido.

Los eventos iniciales son simulados o derivados de datos disponibles y declaran su fuente. El repositorio puede sustituirse por uno remoto posteriormente.

## 8. Riesgos encontrados

- El bundle principal alcanza aproximadamente 890 kB. La división de código sigue pendiente.
- La timeline en memoria no persiste entre recargas, deliberadamente por alcance.
- Los beneficios de planes se derivan del catálogo actual; un catálogo administrable necesitará recibirlos normalizados desde backend.
- React Native Web continúa usando el shim TypeScript local introducido en RC-02.
- Las vistas privadas requieren una sesión real para revisión visual completa en navegador; no se crearon usuarios ni datos de prueba.

## 9. Preparación para RC-04

- `PaymentProvider` permite conectar Mercado Pago, Stripe, OpenPay u otro proveedor mediante un adaptador.
- `BillingService` separa facturación de la suscripción.
- Los repositorios en memoria pueden reemplazarse por repositorios HTTP sin tocar la UI.
- El resumen de cambio ya contiene capacidad, precio, estado esperado y siguiente paso para incorporar prorrateo y confirmación.
- Los códigos de validación permiten mapear respuestas futuras de backend sin propagar errores técnicos a componentes.
- La timeline acepta eventos provenientes de API mediante el campo `source`.

## 10. Certificación técnica

Validaciones realizadas:

- `npm run typecheck`: aprobado.
- `npm run build`: aprobado.
- TypeScript con `noUnusedLocals` y `noUnusedParameters`: aprobado.
- Responsive público en 360, 768, 1024 y 1440 px: sin overflow horizontal.
- Vistas privadas: estructura responsive validada mediante layout flexible, breakpoint a 720 px, build y TypeScript.
- `git diff --check`: aprobado.
- Búsqueda de mutaciones reales desde Mi plan y Dashboard: sin llamadas.

## Certificación

**RC-03 — APROBADA TÉCNICAMENTE.**

La capa comercial queda preparada para conectar un proveedor en RC-04 sin modificar las vistas. RC-04 no fue iniciada.
