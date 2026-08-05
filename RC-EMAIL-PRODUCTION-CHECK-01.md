# RC-EMAIL-PRODUCTION-CHECK-01 — Auditoría de conexión de correos

**Fecha:** 5 de agosto de 2026  
**Rama:** `agent/email-production-ux-audit`  
**Base:** `main` en `494dbfef79705ca69750f01b126ae614c9dfbd1f`  
**Estado:** Revisión de código cerrada; validación runtime real pendiente de observar en Render/Resend

## Objetivo

Comprobar que el sistema de correo siga conectado desde los eventos de backend hasta ventas y la app, limpiar los mensajes de recuperación de contraseña y registrar los avisos que están conectados o deliberadamente pendientes.

## Resultado ejecutivo

- El proveedor permanece centralizado en `communication-service`; los módulos de negocio no llaman directamente a Resend.
- Backend configura proveedor, historial, cola y worker al iniciar.
- Ventas y mobile consumen el mismo endpoint `POST /api/auth/forgot-password`.
- El enlace se construye exclusivamente desde `PASSWORD_RESET_PUBLIC_URL` y conserva el token mediante `URL.searchParams`.
- La recuperación responde igual para una dirección registrada, inexistente o ante un fallo interno de entrega; no expone existencia de cuentas.
- Se eliminó de backend, ventas y mobile el texto visible `Si el correo/la cuenta existe`.
- El reenvío conserva cooldown y bloqueo de solicitudes simultáneas.
- Los fallos de entrega quedan en logs sanitizados y en `recordAppEvent`, sin exponer destinatario completo ni token.
- El endpoint de salud ya incluye `communication`, cola, proveedor, historial e idempotencia mediante `getRuntimeReadiness`.

## Eventos de correo conectados

1. `WELCOME`
2. `PASSWORD_RESET`
3. `ORDER_CREATED`
4. `PAYMENT_CONFIRMED`
5. `PAYMENT_FAILED`
6. `PAYMENT_PENDING`
7. `SUBSCRIPTION_ACTIVATED`
8. `SUBSCRIPTION_CANCELLED`
9. `PASSWORD_CHANGED`
10. `EMAIL_CHANGED`
11. `ACCOUNT_SUSPENDED`
12. `ACCOUNT_REACTIVATED`
13. `REFUND_CONFIRMED`
14. `CHARGEBACK_UPDATED`
15. `DOCUMENT_UPLOADED`
16. `DOCUMENT_APPROVED`
17. `DOCUMENT_REJECTED`

Todos pasan por `communication.sendEmail`, usan `tenantScope`, `eventType` e `idempotencyKey`, y aíslan los fallos de comunicación de la transacción principal.

## Avisos operativos revisados

### Incidencias y SOS

Ya tienen aviso interno y en tiempo real mediante `deliverOperationalNotification`, Socket.IO y destinatarios por rol `admin`/`supervisor`. No se añadió correo masivo porque el dominio todavía no define preferencia de email, escalamiento ni lista persistida de destinatarios. Conectar la plantilla `critical-incident` sin esa política podría generar spam o avisar a personas incorrectas.

### Invitación de conductor

No se conectó `driver-invitation`. La activation key actual no contiene `recipientEmail`, estado de invitación ni identidad persistente de una invitación. El correo de bienvenida sí se envía después de que el conductor completa el registro.

### Avisos programados

`plan-renewal`, `plan-expiring`, `trial-expiring`, `weekly-report`, `monthly-report` e `invoice-available` continúan sin consumidor porque requieren scheduler o una transición persistida de emisión. No se añadieron timers improvisados al proceso web.

## Cambios aplicados

- `backend/src/modules/auth/routes.js`
  - Mensaje neutral único para todas las respuestas aceptadas de recuperación.
  - Se mantiene la protección contra enumeración de usuarios.
- `ventas/screens/password-recovery/password-recovery-sent-screen.tsx`
  - Texto directo de solicitud recibida y recordatorio de revisar spam.
- `mobile/src/screens/password-recovery/password-recovery-screens.tsx`
  - Mismo contrato de UX que ventas.
- `backend/test/password-recovery-copy.test.js`
  - Bloquea regresiones del texto condicional en las tres superficies.
- `backend/package.json`
  - Incluye el contrato de copy dentro de `npm run test:password-recovery`.

## Validación pendiente de producción

La revisión del repositorio no permite leer secretos o variables de Render ni consultar el panel de Resend. Después del merge/despliegue se debe comprobar en el runtime:

```text
EMAIL_ENABLED=true
EMAIL_DRY_RUN=false
providerConfigured=true
queueConnected=true
queueFunctional=true
workerStarted=true
history.mode=mongo
history.idempotencyIndex=true
```

Prueba final recomendada: una recuperación real desde ventas y otra desde mobile con cuentas controladas diferentes, comprobando una sola entrega por solicitud, enlace HTTPS correcto y apertura de la pantalla de nueva contraseña.

## Veredicto

```text
EMAIL_SOURCE_CONNECTIONS=OK
PASSWORD_RECOVERY_ENUMERATION_PROTECTION=OK
PASSWORD_RECOVERY_COPY=FIXED
CRITICAL_INCIDENT_EMAIL=POLICY_REQUIRED
SCHEDULED_EMAILS=SCHEDULER_REQUIRED
RUNTIME_REAL_DELIVERY=VERIFY_AFTER_DEPLOY
```
