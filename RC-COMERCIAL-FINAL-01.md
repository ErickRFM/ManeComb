# RC-COMERCIAL-FINAL-01

## Estado final

El flujo Comercial existente quedó certificado a nivel de código, contratos HTTP, pruebas de integración y UI pública. El catálogo continúa siendo la fuente estática existente del backend; no se agregó CRUD, modelo Mongo ni endpoint.

## Flujo auditado

`Landing → GET /api/commercial/plans → checkout → POST /api/commercial/checkout → Mercado Pago → confirmación/webhook → orden aprobada → suscripción → Portal`.

- Producción: la API pública respondió `200` con cinco planes y CORS válido para la landing desplegada.
- La landing desplegada renderizó los cinco planes reales.
- Un fallo de API ahora muestra error y reintento; el estado “No hay planes publicados” queda reservado para una respuesta válida `[]`.
- Checkout conserva el mismo `planId` en selección, orden, `external_reference`, metadata, webhook, suscripción y Portal.
- El addon de radio se envía al backend y su importe forma parte del total de la preference.
- Webhook y confirmación activan únicamente pagos aprobados y mantienen idempotencia.
- Portal usa la suscripción real para plan, importe, periodo, cambio y cancelación. El reintento de pago abre el checkout real del mismo plan.

## Rectificaciones

- Conectadas las acciones reales de cambio y cancelación de plan en Portal.
- Eliminados estados y mensajes que prometían reactivación, renovación o cambios diferidos inexistentes.
- Unificada la procedencia de badges, nombres y precios en el catálogo del backend.
- Eliminada la billetera local de métodos de pago: Mercado Pago nunca la consumía y mostraba datos desconectados.
- Eliminados endpoints comerciales/admin sin consumidores y tipos, helpers, eventos e imports asociados.
- Endurecidas las reglas para impedir cambios sobre suscripciones canceladas y cancelaciones repetidas.
- Corregidas etiquetas de periodo/importe para no representar una renovación automática inexistente.

## Variables y Mercado Pago

- `VITE_API_URL` de producción apunta a `https://manecomb.onrender.com/api`.
- Las pruebas cubren selección de URL, sandbox/producción, ausencia o ambigüedad de credenciales, metadata, `external_reference`, `planId`, `orderId`, snapshot e importe.
- No se ejecutó un cobro real en producción para evitar generar una transacción; el contrato completo se validó con el proveedor simulado y pruebas de webhook.

## Validación ejecutada

- TypeScript Ventas: correcto.
- Build Vite: correcto (advertencia informativa de chunk grande existente).
- Backend smoke: correcto.
- Pruebas Mercado Pago: correctas.
- Landing productiva/API/CORS: correctos.
- UI local sin API: muestra error + reintento y nunca el empty state falso.
- ESLint: los paquetes Ventas y Backend no tienen script/configuración ESLint disponible.

## Observaciones

- Los descuentos no forman parte del contrato actual del catálogo; no se inventó cálculo ni visualización.
- La persistencia productiva no fue modificada. Las pruebas smoke validaron creación de orden, aprobación, activación, cambio y cancelación mediante el store existente.
- `git diff --check` solo reporta una línea vacía final preexistente en `mobile/src/utils/format.ts`, fuera del módulo Comercial.
