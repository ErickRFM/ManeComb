# RC-VENTAS-PLANES-FINAL-01

**Estado:** vigente como evidencia documental del catálogo comercial canónico.

## Autoridad

La fuente ejecutable de planes es `backend/src/config/commercial-plans.js`. Ventas y checkout deben consumir el contrato comercial expuesto por backend y no mantener precios paralelos como autoridad independiente.

## Catálogo actual

| Plan | Unidades | Precio base MXN | Prueba | Radio |
|---|---:|---:|---|---|
| `starter-2` | 2 | 149 | 7 días | Add-on +20 |
| `value-4` | 4 | 209 | No | Add-on +20 |
| `control-6` | 6 | 299 | No | Add-on +20 |
| `premium-8` | 8 | 449 | No | Incluido |
| `enterprise-12` | 12 | 749 | No | Incluido |

## Contrato

- `listCommercialPlans()` publica snapshots del catálogo.
- `getCommercialPlanById()` resuelve la autoridad por `planId`.
- `getCommercialPlanPricing()` recalcula precio base, add-ons y total.
- `radio_dispatch` cuesta 20 MXN únicamente en planes elegibles; en planes con Radio incluido su precio es 0.
- El backend conserva la autoridad del total comercial; la UI no debe confiar en un total enviado por cliente.

## Cierre

Este archivo sustituye el marcador incompleto que existía en `main`. No agrega una segunda fuente de precios: documenta la configuración ejecutable actual para que los reportes que lo citan apunten a una evidencia válida.
