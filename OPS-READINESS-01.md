# OPS-READINESS-01 — Readiness segura de Mercado Pago

## Estado

**Cerrado**

## Base

| Campo | Resultado |
|---|---|
| Rama | `main` |
| Commit base | `075aeaf` |
| MP-HARDEN-06 | `82dbedf`, presente en el historial de la base |
| Backend inicial | Limpio |
| Trabajo paralelo | No se encontraron cambios ajenos durante esta ejecución |
| Operaciones Git en curso | Ninguna: sin merge, rebase, revert ni cherry-pick |

## Inventario

La función canónica es `getPaymentReadiness()`, exportada por
`backend/src/services/commercial-payment.js`. Se invoca sin argumentos y devuelve
la readiness calculada por la misma lógica que protege los pagos automáticos.

Antes de esta RC existían:

- `/health`, `/api/health` y `/api/health/ready`, que calculan la readiness
  global pero devuelven deliberadamente solo estado, versión, uptime y fecha;
- `/api/ops/observability`, autenticado y restringido a administradores;
- el namespace `/api/ops`, ya montado por `backend/src/app.js`;
- los middlewares `authenticate` y `requireAdmin`.

No existía una ruta autenticada que expusiera la readiness filtrada de pagos.
El health público no fue modificado.

`getPaymentReadiness()` contiene campos adicionales como `diagnostics`, `mode` y
`missing`. Algunos diagnósticos incluyen fuentes de variables o prefijos y no
forman parte del contrato público de esta RC.

## Implementación

### Endpoint

```text
GET /api/ops/readiness/payments
```

La ruta se añadió al módulo existente `backend/src/modules/ops/routes.js`; no se
creó un namespace paralelo.

### Autenticación y autorización

La cadena aplicada es:

```text
authenticate → requireAdmin → handler
```

`requireAdmin` admite exclusivamente al administrador global con
`role: admin` y excluye cuentas `company_owner`. No se inventó un rol o permiso
nuevo. Una solicitud sin sesión recibe `401`; un usuario autenticado que no es
administrador recibe `403`.

### Respuesta

La ruta invoca directamente `getPaymentReadiness()` y copia explícitamente:

```text
provider
environment
configured
webhookConfigured
webhookUrlConfigured
ready
issues
```

Una consulta ejecutada correctamente devuelve HTTP `200` aunque `ready` sea
`false`. Una excepción inesperada devuelve HTTP `500` con:

```json
{
  "ok": false,
  "code": "payments_readiness_unavailable"
}
```

No se devuelve el mensaje interno ni un stack trace.

### Campos prohibidos

La respuesta no incorpora:

- Access Token o su prefijo;
- Public Key;
- Webhook Secret;
- URL completa del Webhook o URLs de retorno;
- headers, firma o cookies;
- `process.env`;
- URI, host, usuario, contraseña o nombre de MongoDB.

## Tests

Se creó `backend/test/payment-readiness.test.js` y se integró en el script
existente `npm test`. Usa exclusivamente credenciales ficticias, almacenamiento
embebido y solicitudes locales; no llama a Mercado Pago, Render, MongoDB ni
servicios de correo.

| Validación | Resultado |
|---|---|
| Prueba específica de payment readiness | Aprobada |
| No autenticado → `401` | Aprobada |
| Autenticado sin permiso → `403` | Aprobada |
| Administrador → `200` | Aprobada |
| Provider `mercado_pago` | Aprobada |
| Ambiente `sandbox` | Aprobada |
| Configuración completa → `ready: true` | Aprobada |
| Falta Webhook Secret → `ready: false` | Aprobada |
| Falta Webhook URL → `ready: false` | Aprobada |
| Falta ambiente → `ready: false` | Aprobada |
| Códigos de `issues` preservados | Aprobada |
| Access Token no expuesto | Aprobada |
| Public Key no expuesta | Aprobada |
| Webhook Secret no expuesto | Aprobada |
| Mongo URI no expuesta | Aprobada |
| `process.env` no expuesto | Aprobada |
| Excepción interna → error seguro | Aprobada |
| `mercado-pago.test.js` / MP-HARDEN-01 fail-closed | Aprobada |
| `env.test.js` | Aprobada |
| Suite completa `npm test` | Aprobada |

## Compatibilidad

No se modificaron:

- `/api/health` ni su contrato público;
- `commercial-payment.js` ni la lógica de Mercado Pago;
- Checkout, Webhook, conciliación, leases, refunds o chargebacks;
- activación, trial, periodos, precios o planes;
- MongoDB o variables de entorno;
- Ventas, Mobile, Shared, Communication Service o Render;
- dependencias o lockfiles.

El único cambio en `backend/package.json` agrega la prueba nueva a la suite
existente.

## Seguridad

```text
Access Token expuesto: NO
Public Key completa expuesta: NO
Webhook Secret expuesto: NO
Mongo URI expuesta: NO
Variables completas expuestas: NO
Health público ampliado: NO
```

La revisión del diff solo encontró nombres de variables y valores de prueba
inequívocamente ficticios dentro del test.

## Consulta

Usar una sesión administrativa válida del entorno Sandbox:

```http
GET /api/ops/readiness/payments
Authorization: Bearer <ADMIN_SANDBOX_TOKEN>
```

No registrar ni copiar el token en reportes o consolas compartidas.

Respuesta esperada cuando Mercado Pago está listo:

```json
{
  "ok": true,
  "payments": {
    "provider": "mercado_pago",
    "environment": "sandbox",
    "configured": true,
    "webhookConfigured": true,
    "webhookUrlConfigured": true,
    "ready": true,
    "issues": []
  }
}
```

## Métricas

| Métrica | Valor |
|---|---:|
| Archivos fuente modificados | 1 |
| Archivos de configuración de pruebas modificados | 1 |
| Archivos de prueba nuevos | 1 |
| Reportes nuevos | 1 |
| Archivos totales de la RC | 4 |
| Casos obligatorios cubiertos | 18 |
| Inserciones y eliminaciones | 455 inserciones, 1 eliminación |

## Rollback

```bash
git revert <HASH_OPS_READINESS_01>
```

No ejecutar el rollback durante esta tarea.

## Estado de despliegue

El commit y el push se registrarán como evidencia externa al cerrar esta RC. Un
push correcto no demuestra que Render haya desplegado el cambio. Hasta verificar
en Render el commit en estado `Live`, no debe ejecutarse APRO.
