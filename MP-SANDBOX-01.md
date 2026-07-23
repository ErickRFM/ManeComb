# MP-SANDBOX-01 — Prueba end-to-end controlada de Mercado Pago Checkout Pro

**Veredicto:** FALLIDA — CONFIGURACIÓN

## Resumen

La prueba se detuvo durante la auditoría de precondiciones, antes de crear una orden, Preference o pago. El entorno disponible no tiene configurada la integración sandbox obligatoria y no existe evidencia verificable de cuentas nuevas de vendedor/comprador ni de una base aislada.

No se realizaron llamadas a Mercado Pago, no se abrió Checkout Pro, no se usaron tarjetas, no se modificó código y no se alteraron datos.

## Base

| Dato | Resultado |
| --- | --- |
| Rama | `main` |
| Commit base | `82dbedf` |
| MP-HARDEN-01 | `fa92d38` |
| MP-HARDEN-02 | `f686a8d` |
| MP-HARDEN-03 | `fdc4a28` |
| MP-HARDEN-04 | `9ebdb0c` |
| MP-HARDEN-05 | `1f2d8df` |
| MP-HARDEN-06 | `82dbedf` |
| Inicio de auditoría UTC | `2026-07-23T01:15:29.463Z` |
| Backend/Ventas | Limpios |
| Trabajo paralelo | Cambios ajenos en `mobile/` y documentos `RC-MOBILE-*` |
| Backend sandbox | NO CONFIRMADO |
| Ventas sandbox | NO CONFIRMADO |
| Base aislada | NO CONFIRMADA |

Las URLs no se registran porque no se proporcionó ni se detectó un ambiente sandbox HTTPS confirmado.

## Configuración efectiva observada

La revisión se limitó a presencia y clasificación; no se imprimieron valores secretos.

| Variable/requisito | Estado |
| --- | --- |
| `PAYMENT_PROVIDER=mercado_pago` | Ausente |
| `MERCADO_PAGO_ENV=sandbox` | Ausente |
| Access Token de prueba | Ausente |
| Public Key de prueba | Ausente |
| Webhook secret de prueba | Ausente |
| Webhook URL HTTPS | Ausente |
| Return/App URL HTTPS sandbox | No configurada; el valor local disponible no es HTTPS |
| MongoDB aislado | Existe configuración, pero su aislamiento no pudo verificarse sin exponerla |
| Readiness sandbox | NO EJECUTADO; configuración previa incompleta |

No se copiaron tokens, connection strings, secretos ni valores completos al reporte.

## Producto y cuentas

| Verificación | Resultado |
| --- | --- |
| Aplicación ManeComb confirmada en Mercado Pago Developers | NO CONFIRMADA |
| Producto Checkout Pro confirmado | NO CONFIRMADO |
| Application ID parcial | NO DISPONIBLE |
| Vendedor de prueba nuevo | NO CONFIRMADO |
| Comprador de prueba nuevo | NO CONFIRMADO |
| Cuentas distintas | NO CONFIRMADO |
| País México para ambas | NO CONFIRMADO |

Las cuentas visibles anteriormente se trataron como expuestas y no se utilizaron.

## Criterios de detención activados

- Readiness no puede estar `ready` sin provider, ambiente, token, secreto y Webhook URL.
- No existe una Webhook URL HTTPS sandbox confirmada.
- No se pudo confirmar una base no productiva aislada.
- No se pudo confirmar una pareja nueva y distinta de vendedor/comprador.

Según el procedimiento, no se intentó una compra ni se configuraron credenciales desde el repositorio.

## Escenarios

| Escenario | Orden única | Webhook | Conciliación | Activa | Periodo | Sin duplicado |
| --- | --- | --- | --- | --- | --- | --- |
| APRO | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADA | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADO |
| Replay confirmación | NO CONFIRMADA | NO REQUERIDO | NO CONFIRMADA | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADO |
| Replay Webhook | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADA | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADO |
| Idempotency replay | NO CONFIRMADA | NO CONFIRMADO | N/A | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADO |
| Idempotency conflict | NO CONFIRMADA | NO CONFIRMADO | N/A | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADO |
| CONT | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADA | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADO |
| OTHE | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADA | NO CONFIRMADA | NO CONFIRMADO | NO CONFIRMADO |
| Aislamiento organizacional | NO CONFIRMADA | N/A | N/A | N/A | N/A | NO CONFIRMADO |

No se completó ninguna celda por inferencia a partir de pruebas automatizadas.

## Evidencia y base de datos

No existen IDs de orden, Preference, Payment o delivery porque no se inició el flujo. Tampoco se tomaron contadores de la base: hacerlo sobre una base cuyo aislamiento no está confirmado podría mezclar evidencia productiva o de otro entorno.

## Logs y secretos

La auditoría local no imprimió valores de credenciales. No se generaron logs de checkout/Webhook ni se observaron tokens, firmas, contraseñas, cookies, tarjetas o payloads de Mercado Pago.

## Defecto bloqueante

| Campo | Detalle |
| --- | --- |
| Severidad | Bloqueante |
| Componente | Configuración del ambiente sandbox |
| Pasos | Auditar presencia de provider, ambiente, credenciales TEST, secreto, URLs HTTPS y base aislada |
| Esperado | Configuración completa y readiness `ready` |
| Obtenido | Variables obligatorias ausentes, URL local no HTTPS y aislamiento sin confirmar |
| Evidencia | Tabla de presencia redactada en este reporte |
| Bloquea producción | Sí; también bloquea iniciar la prueba sandbox |

## Condiciones para repetir

1. Crear una aplicación/credenciales de prueba compatibles con Checkout Pro.
2. Crear cuentas nuevas y distintas de vendedor y comprador, ambas de México.
3. Desplegar Backend y Ventas en URLs sandbox HTTPS.
4. Usar una base MongoDB aislada y sin datos comerciales reales.
5. Configurar secretos únicamente en el administrador seguro del entorno.
6. Configurar el Webhook de pagos en modo prueba.
7. Confirmar readiness sin exponer secretos.
8. Reanudar desde la simulación previa del Webhook y después ejecutar APRO, CONT y OTHE.

## Próximo paso

Repetir `MP-SANDBOX-01` cuando las condiciones anteriores estén disponibles. Solo después de aprobar todos los escenarios corresponde:

```text
MP-PREPROD-01 — Validación controlada previa a producción
```

Este resultado no autoriza producción.
