# CERT-PROD-01 — Certificación Portal y Android con datos reales

## Veredicto actual

```text
CERTIFICATION_HARNESS_READY
PORTAL_PUBLIC_EXECUTION_PENDING
PORTAL_AUTHENTICATED_EXECUTION_PENDING
ANDROID_PHYSICAL_CERTIFICATION_PENDING
```

Este bloque no modifica la lógica funcional de Ventas, Portal, pagos, Rutas, unidades, keys, GPS, Radio, RTC o Push. Añade un mecanismo reproducible para certificar el despliegue y conservar evidencia antes del release.

Fuente de seguimiento: issue `#29`.

## 1. Certificación pública del Portal

El workflow `Portal production certification` ejecuta Chromium en:

- 360 × 800;
- 768 × 1024;
- 1024 × 768;
- 1280 × 800;
- 1440 × 900.

Comprueba:

- landing de Ventas;
- login;
- registro;
- recuperación de contraseña;
- reset con token inválido;
- protección del Portal sin sesión;
- ausencia de pantalla en blanco;
- ausencia de respuestas HTTP 5xx;
- ausencia de errores JavaScript no controlados;
- ausencia de desbordamiento horizontal del documento;
- presencia de jerarquía y acciones comerciales de planes.

Cada ejecución conserva reporte HTML/JSON, capturas y trazas o video ante fallo.

## 2. Certificación autenticada

La ejecución autenticada es exclusivamente manual y utiliza GitHub Actions Secrets:

```text
CERT_OWNER_EMAIL
CERT_OWNER_PASSWORD
CERT_OWNER_NEXT_PASSWORD
CERT_ADMIN_EMAIL
CERT_ADMIN_PASSWORD
CERT_BILLING_EMAIL
CERT_BILLING_PASSWORD
CERT_SUPERVISOR_EMAIL
CERT_SUPERVISOR_PASSWORD
```

Nunca se escriben credenciales en el repositorio.

La matriz valida:

- owner y admin con administración y facturación;
- billing_manager limitado a módulos comerciales;
- supervisor fuera del Portal empresarial;
- cambio incorrecto de contraseña;
- cambio correcto y rollback automático a la contraseña original;
- revocación de una segunda sesión conservando la actual.

Las mutaciones permanecen bloqueadas salvo que `allow_mutations=true` y exista `CERT_OWNER_NEXT_PASSWORD`.

## 3. Operaciones que requieren datos fixture y revisión humana

Las siguientes pruebas permanecen en el issue #29 porque requieren elegir registros de certificación y observar su impacto real:

- keys de 1, 7, 14 y 30 días;
- revocación, eliminación y reemplazo;
- eliminación de unidad sin historial;
- retiro de unidad con historial;
- varias asignaciones de ruta;
- activación y conflicto con jornada;
- orden SPEI real pendiente;
- factura PDF/XML;
- verificación de permisos backend 403.

No se automatizan mutaciones destructivas contra datos arbitrarios. Deben utilizar prefijos o fixtures identificables y conservar evidencia sanitizada.

## 4. Admin Global

- PR #25 contiene el cierre P0 de MFA fail-closed.
- Se solicitó una ejecución actual de CI y auditoría antes de su merge.
- PR #28 permanece apilado sobre P0 y no debe integrarse antes.
- Secretos Platform, `platform_owner`, CORS y TOTP real requieren validación externa.

## 5. Android físico

Los PR #20, #23 y #24 permanecen sin merge porque sus criterios dependen de Android real:

- Radio en primera apertura y handoff repetido;
- GPS foreground/background y pantalla bloqueada;
- lifecycle de llamadas y cambio de red;
- Firebase/FCM con app cerrada;
- llamada entrante, aceptar, rechazar, cancelar y timeout.

CI certifica compilación y contratos, no audio, GPS prolongado, notificaciones FCM, restricciones del fabricante ni NAT/TURN.

## Ejecución local pública

```bat
cd C:\proyectos\combis-app\mobile
npm ci
npx playwright install chromium
npx playwright test --config playwright.certification.config.ts e2e/certification/public-responsive.spec.ts
```

## Ejecución contra producción

Las credenciales se configuran como Secrets en GitHub. Después se ejecuta manualmente:

```text
Actions
→ Portal production certification
→ Run workflow
→ base_url: https://manecomb.com
→ run_authenticated: true
→ allow_mutations: false o true de forma deliberada
```

## Criterio de cierre

Solo después de adjuntar evidencia y completar el issue #29 podrá declararse:

```text
PORTAL_PRODUCTION_CERTIFIED
ADMIN_GLOBAL_PRODUCTION_CERTIFIED
ANDROID_RUNTIME_DEVICE_CERTIFIED
PUSH_CALLS_ANDROID_RELEASE_CERTIFIED
MANECOMB_RELEASE_CERTIFIED
```
