# CERT-PROD-01 — Certificación Portal y Android con datos reales

## Veredicto actual

```text
CERTIFICATION_HARNESS_READY
PORTAL_PUBLIC_LOCAL_MATRIX_PASSED
PORTAL_PRODUCTION_AUTHENTICATED_EXECUTION_PENDING
ADMIN_GLOBAL_P0_MERGED_PRODUCTION_CONFIG_PENDING
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

Comprueba landing, login, registro, recuperación, reset inválido y protección del Portal sin sesión. También bloquea pantallas en blanco, respuestas 5xx, errores JavaScript no controlados y desbordamiento horizontal.

La matriz local determinista pasó en el run `31057973283`. Artifact de evidencia: `8951106660`, digest `sha256:bc36e9d59d92589eafd7d585420b53b862f727a741f6d91a2ba2fd52a720c54b`.

El contrato local simula únicamente la respuesta pública de planes cuando no existe `CERT_BASE_URL`. La ejecución manual contra `https://manecomb.com` no instala mocks y consulta el backend real.

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

La matriz valida owner, admin, billing_manager y supervisor; también cubre contraseña incorrecta, cambio correcto con rollback y revocación de una segunda sesión conservando la actual.

Las mutaciones permanecen bloqueadas salvo que `allow_mutations=true` y exista `CERT_OWNER_NEXT_PASSWORD`.

## 3. Operaciones con fixtures y revisión humana

Permanecen en el issue #29:

- keys de 1, 7, 14 y 30 días;
- revocación, eliminación y reemplazo;
- eliminación de unidad sin historial;
- retiro de unidad con historial;
- varias asignaciones de ruta;
- activación y conflicto con jornada;
- orden SPEI real pendiente;
- factura PDF/XML;
- verificación de permisos backend 403.

No se automatizan mutaciones destructivas contra datos arbitrarios.

## 4. Admin Global

- PR #25 fue revalidado y fusionado en `main` como `c5e5acb8c8b3f6da4d0029e07493b41659877ed7`.
- PR #28 fue reconstruido sobre ese P0 y su diff quedó limitado a 14 archivos P1.
- Secretos Platform, `platform_owner`, CORS y TOTP real siguen requiriendo validación externa.

## 5. Android físico

Los PR #20, #23 y #24 permanecen sin merge porque sus criterios dependen de Android real:

- Radio en primera apertura y handoff repetido;
- GPS foreground/background y pantalla bloqueada;
- lifecycle de llamadas y cambio de red;
- Firebase/FCM con app cerrada;
- llamada entrante, aceptar, rechazar, cancelar y timeout.

CI certifica compilación y contratos, no audio, GPS prolongado, FCM, restricciones del fabricante ni NAT/TURN.

## Ejecución local pública

```bat
cd C:\proyectos\combis-app\mobile
npm ci
npm ci --prefix ..\ventas
npx playwright install chromium
npx playwright test --config playwright.certification.config.ts e2e/certification/public-responsive.spec.ts
```

## Ejecución contra producción

```text
Actions
→ Portal production certification
→ Run workflow
→ base_url: https://manecomb.com
→ run_authenticated: true
→ allow_mutations: false inicialmente
→ allow_mutations: true únicamente para el bloque controlado de seguridad
```

## Criterio de cierre

```text
PORTAL_PRODUCTION_CERTIFIED
ADMIN_GLOBAL_PRODUCTION_CERTIFIED
ANDROID_RUNTIME_DEVICE_CERTIFIED
PUSH_CALLS_ANDROID_RELEASE_CERTIFIED
MANECOMB_RELEASE_CERTIFIED
```
