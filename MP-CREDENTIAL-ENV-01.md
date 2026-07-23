# MP-CREDENTIAL-ENV-01 — Detección de ambiente de credenciales

**Estado:** Cerrado técnicamente — pendiente de despliegue

## Causa raíz

La validación de credenciales asumía que el prefijo `APP_USR` identificaba exclusivamente credenciales productivas. Mercado Pago también puede entregar credenciales de prueba con ese prefijo, por lo que una configuración explícita `MERCADO_PAGO_ENV=sandbox` era rechazada con `credential_environment_mismatch`.

## Condición anterior

```text
sandbox    → solo TEST
production → solo APP_USR
```

Esta tabla convertía un prefijo ambiguo en fuente de autoridad para determinar el ambiente.

## Condición corregida

`MERCADO_PAGO_ENV` continúa siendo obligatorio y es la fuente principal:

```text
sandbox    → TEST o APP_USR
production → APP_USR
```

El prefijo inequívocamente de prueba `TEST` continúa rechazado en producción. Los prefijos ausentes o desconocidos continúan rechazados. No se inventaron prefijos nuevos.

## Guardas conservadas

- Ambiente explícito obligatorio: `sandbox` o `production`.
- Access Token obligatorio.
- Webhook Secret obligatorio.
- Webhook URL pública, HTTPS y con ruta exacta.
- URLs de retorno HTTPS en producción.
- Provider simulado prohibido en producción.
- Selección separada de `sandbox_init_point` e `init_point`.
- Precio y moneda definidos por backend.
- `external_reference`, Payment ID, metadata y unicidad conciliados.
- Idempotencia de creación y efectos conservada.
- Sandbox exige `payment.live_mode === false`.
- Producción exige `payment.live_mode === true`.
- Fallo cerrado ante ambiente ausente, inválido o inconsistente.

## Tests

| Caso | Resultado |
|---|---|
| Sandbox + `APP_USR` no genera mismatch | PASS |
| Sandbox + `APP_USR` y configuración completa queda ready | PASS |
| Producción + `APP_USR` no se clasifica como Sandbox | PASS |
| Producción + `TEST` se rechaza | PASS |
| Ambiente ausente | PASS |
| Ambiente inválido | PASS |
| Access Token ausente | PASS |
| Webhook Secret ausente | PASS |
| Webhook URL ausente | PASS |
| Webhook no HTTPS o privado | PASS |
| Provider simulado en producción | PASS |
| Sandbox exige `live_mode=false` | PASS |
| Producción exige `live_mode=true` | PASS |
| Readiness no expone el Access Token | PASS |
| `env.test.js` | PASS |
| `payment-readiness.test.js` | PASS |
| `mercado-pago.test.js` | PASS |

Todas las credenciales de prueba son ficticias. Las pruebas no realizaron solicitudes a Mercado Pago.

## Archivos

- `backend/src/services/commercial-payment.js`
- `backend/test/mercado-pago.test.js`
- `MP-CREDENTIAL-ENV-01.md`

## Confirmaciones

| Control | Resultado |
|---|---|
| `MERCADO_PAGO_ENV` cambiado | NO |
| Credencial productiva utilizada | NO |
| Validación `live_mode` eliminada | NO |
| Fail-closed debilitado | NO |
| Secretos expuestos | NO |
| Mobile modificado | NO |
| Ventas modificado | NO |

## Despliegue y readiness

El commit debe desplegarse en Render antes de verificar el resultado remoto. El resultado esperado, con las demás variables presentes, es:

```json
{
  "provider": "mercado_pago",
  "environment": "sandbox",
  "configured": true,
  "webhookConfigured": true,
  "webhookUrlConfigured": true,
  "ready": true,
  "issues": []
}
```

No se ejecutó Checkout, APRO ni ninguna operación contra Mercado Pago.

## Rollback

Después del commit:

```bash
git revert <HASH_MP_CREDENTIAL_ENV_01>
```

No ejecutar como parte de esta RC.
