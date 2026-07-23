# MP-SANDBOX-ADMIN-01 — Administrador global Sandbox

**Estado:** Cerrado técnicamente — pendiente de despliegue y ejecución controlada

**Veredicto:** `DEPLOY_NOT_READY`

## Resumen

No existía un mecanismo seguro para crear un administrador global en MongoDB Sandbox. Se implementó un bootstrap interactivo, idempotente y protegido por tres guardas de ambiente. El administrador no fue creado porque la sesión disponible del panel de Render requiere autenticación y no fue posible confirmar la base efectiva desplegada sin solicitar o exponer credenciales.

La implementación no modifica usuarios existentes, no promueve cuentas comerciales y aborta antes de conectarse cuando la configuración no corresponde exclusivamente a Sandbox.

## Base

| Dato | Valor |
|---|---|
| Rama | `main` |
| Commit base | `8d7b283` |
| `MONGO_DB_NAME` desplegado | Pendiente de confirmar en Render Shell |
| `MERCADO_PAGO_ENV` desplegado | Pendiente de confirmar en Render Shell |
| Mongo configurada | Pendiente de confirmar en Render Shell |

No se leyó ni registró la URI de MongoDB.

## Mecanismo

| Elemento | Implementación |
|---|---|
| Tipo | Implementado |
| Archivo | `backend/scripts/bootstrap-sandbox-admin.js` |
| Script npm | `npm run admin:bootstrap:sandbox` |
| Modelo | `UserModel` real |
| Hash | `bcryptjs`, factor 10 |
| Política | `validatePasswordStrength` existente |
| Entrada | Correo interactivo y contraseña/confirmación ocultas |
| Idempotencia | Un administrador existente no se duplica |
| Conflicto | Un correo existente no administrativo nunca se promueve |

## Guardas

El proceso aborta antes de conectarse salvo que se cumpla todo lo siguiente:

```text
MONGO_DB_NAME === manecomb_sandbox
MERCADO_PAGO_ENV === sandbox
ALLOW_SANDBOX_ADMIN_BOOTSTRAP === true
MONGO_URI o MONGODB_URI configurada
```

También exige una terminal interactiva para capturar la contraseña sin mostrarla. No acepta credenciales mediante argumentos ni contiene valores predeterminados.

## Resultado

El mecanismo está listo en código, pero no se ejecutó:

- base desplegada no confirmada;
- administrador Sandbox no creado;
- login administrativo no ejecutado;
- readiness remoto no consultado;
- APRO no ejecutado.

Por estas condiciones el resultado es `DEPLOY_NOT_READY`, no `PAYMENTS_READY`.

## Seguridad

| Control | Resultado |
|---|---|
| Contraseña expuesta | NO |
| JWT expuesto | NO |
| Mongo URI expuesta | NO |
| Usuario comercial promovido | NO |
| Base productiva modificada | NO |
| Organización comercial creada | NO |
| Credenciales en argumentos | NO |
| Llamadas a Mercado Pago | NO |

## Pruebas

| Caso | Resultado |
|---|---|
| Rechazo de `combisapp` | PASS |
| Rechazo de base ausente | PASS |
| Rechazo de ambiente production | PASS |
| Rechazo de ambiente ausente | PASS |
| Rechazo de flag ausente | PASS |
| Rechazo de Mongo no configurada | PASS |
| Compatibilidad con `MONGO_URI` y `MONGODB_URI` | PASS |
| Creación con rol `admin` y cuenta `operations` | PASS |
| Hash real integrado, sin contraseña en documento | PASS |
| Idempotencia para administrador existente | PASS |
| Rechazo de usuario existente no administrativo | PASS |
| Organización comercial no creada | PASS |
| Prueba específica | PASS |
| Suite completa del backend | PASS |

Las pruebas usan dobles locales y no se conectan a MongoDB ni a Mercado Pago.

## Ejecución pendiente en Render

Antes de ejecutar el bootstrap, confirmar de forma segura:

```json
{
  "mongoConfigured": true,
  "databaseName": "manecomb_sandbox",
  "mercadoPagoEnvironment": "sandbox"
}
```

Solo entonces se puede habilitar temporalmente `ALLOW_SANDBOX_ADMIN_BOOTSTRAP=true`, ejecutar `npm run admin:bootstrap:sandbox` desde Render Shell y retirar el flag al terminar.

Después, iniciar sesión con el administrador manteniendo el JWT únicamente en memoria y consultar `GET /api/ops/readiness/payments`. Solo una respuesta segura con `ready: true` e `issues: []` permitirá clasificar una tarea posterior como `PAYMENTS_READY`.

## Rollback

Después del commit:

```bash
git revert <HASH_MP_SANDBOX_ADMIN_01>
```

No ejecutar como parte de esta RC.
