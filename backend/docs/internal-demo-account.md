# Acceso demo interno de ManeComb

## Propósito

La prueba pública y una cuenta interna de demostración son conceptos distintos.

La prueba pública conserva su contrato de producto:

- plan `starter-2`
- 2 combis
- 7 días
- una sola vez por organización

Para QA, demostraciones comerciales o validaciones de ManeComb sobre planes mayores se utiliza un **acceso demo interno**. Este acceso no modifica `trial_entitlements`, no borra el historial de pruebas y no vuelve elegible al plan de 12 combis para la prueba pública.

## Autoridad

`backend/src/services/internal-demo-access.js` construye una orden `paid_test` con proveedor `internal_demo`. El Portal ya trata `paid_test` como una suscripción activa y `pickActiveOrder` la prioriza por encima de una prueba expirada.

El acceso demo interno:

- usa un plan real del catálogo comercial;
- por defecto usa `enterprise-12`;
- dura 30 días por defecto y admite de 1 a 90 días;
- conserva el historial comercial anterior;
- cancela únicamente otra orden `internal_demo` activa de la misma cuenta al renovarse;
- se bloquea si existe una suscripción real pagada y activa;
- nunca elimina ni reinicia el entitlement de prueba pública.

## Diagnóstico seguro

La herramienta opera en **dry-run por defecto**:

```bash
node scripts/manage-demo-account.js --email eris@correo.com --plan enterprise-12 --days 30
```

El reporte muestra:

- usuario y tenant encontrados;
- órdenes comerciales relacionadas;
- suscripción que actualmente gana en `pickActiveOrder`;
- estado del entitlement de prueba pública;
- razón exacta por la que la prueba pública está disponible o bloqueada;
- vista previa del acceso demo solicitado.

## Aplicación

Para escribir en producción requiere tanto `--apply` como una confirmación exacta del correo:

```bash
node scripts/manage-demo-account.js --email eris@correo.com --plan enterprise-12 --days 30 --apply --confirm eris@correo.com
```

Si hay una suscripción real pagada y activa, la herramienta falla cerrado y no modifica la cuenta.

## Resultado esperado para una cuenta demo de 12 combis

La orden nueva queda con:

- `planId=enterprise-12`
- `fleetSize=12`
- `paymentStatus=paid_test`
- `paymentProvider=internal_demo`
- `activationStatus=active`
- `requestTrial=false`
- vigencia explícita en `currentPeriodStart/currentPeriodEnd`

Esto permite probar el Portal y la operación con capacidad de 12 unidades sin alterar el contrato comercial de la prueba pública.
