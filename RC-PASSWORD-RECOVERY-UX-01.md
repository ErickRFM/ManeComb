# RC-PASSWORD-RECOVERY-UX-01 — Recuperación profesional de credenciales

**Estado:** Código validado — correo real y dispositivo físico pendientes

**Veredicto:** `RC_PASSWORD_RECOVERY_CODE_READY_EMAIL_PENDING`

**Base:** `3b58016` (`origin/main`)

**Rama:** `codex/rc-password-recovery-ux-01`

**Commit:** se registra externamente después de crear el commit; no se introduce el hash del commit dentro de sí mismo.

## 1. Alcance

Esta RC consolida la recuperación de contraseña como una capacidad transversal de autenticación:

- un backend y dos endpoints públicos;
- un único sistema de tokens;
- una única vía de correo central;
- una misma política funcional de contraseña;
- un enlace HTTPS público;
- una experiencia dedicada para Mobile;
- una experiencia dedicada para Ventas.

No se modificó lógica de pagos, Mercado Pago, planes, suscripciones, checkout, documentos, chat, radio, GPS, rutas, WebRTC, Socket.IO, tenant, roles, Admin Global ni Platform Auth.

## 2. Diagnóstico inicial

| Área | Estado real inicial | Fuente de verdad | Problema | Cambio mínimo aplicado |
| --- | --- | --- | --- | --- |
| Solicitud de recuperación | Existía | `POST /api/auth/forgot-password` | Las interfaces presentaban flujos inconsistentes | Mantener endpoint y crear pantallas dedicadas |
| Respuesta neutral | Existía | Backend Auth | Debía comprobarse para todos los estados de entrega | Pruebas de igualdad estricta de respuesta |
| Generación de token | Existía | Store de Backend | No debía duplicarse | Se conservó el generador existente |
| Expiración | Una hora | Store de Backend | La vigencia no aparecía claramente en la plantilla | Se informa “1 hora” |
| Uso único | Existía, pero Mongo hacía lectura y actualización separadas | `mongo-store.js` | Ventana de concurrencia entre validación y consumo | Reclamo y consumo atómicos con `findOneAndUpdate` |
| Enlace del correo | Derivado de `APP_URL` por concatenación | Auth Backend | Variable ambigua y construcción manual | `PASSWORD_RESET_PUBLIC_URL` + `URL.searchParams` |
| Plantilla | Existía | `communication-service/src/templates/builders.js` | Copia y CTA insuficientes | Se actualizó solo `password-reset` |
| Política de contraseña | 8+ caracteres, letra, número y especial | `backend/src/utils/password-policy.js` | UI Mobile/Ventas no la comunicaba igual | Helpers equivalentes y comprobados en cada paquete |
| Reset | Existía | `POST /api/auth/reset-password` | Pantalla web minimalista y flujo móvil incrustado | Pantallas dedicadas y estados diferenciados |
| Revocación de sesiones | Existía | Servicio de sesiones de Backend | Debía conservarse y probarse | Prueba de revocación de refresh anterior |
| Correo `PASSWORD_CHANGED` | Existía | Eventos de correo del dominio | Debía conservarse | Prueba de emisión tras éxito |
| Recuperación Mobile | Incrustada en login | `customer-auth-screen.tsx` | Mezclaba login con solicitud y token manual | Flujo de cuatro rutas separado |
| Recuperación Ventas | El enlace enviaba inmediatamente | `sales-auth-screen.tsx` | No permitía confirmar la solicitud | Navegación a formulario dedicado |
| Deep link Mobile | No existía para HTTPS | Navigation + Android Manifest | El correo no podía abrir la app | App Link exacto y ruta React Navigation |
| Ruta web | `/reset-password` existía | Ventas App | Presentación y estados incompletos | Integración con el sistema visual de Auth |
| Checkout Ventas | Contexto disponible en login | Checkout context existente | Riesgo de perder `planId` y `trial` | Parámetros preservados al entrar y volver |
| Observabilidad | Parcial | App events y logger | Faltaban eventos específicos | Cinco eventos seguros, sin secretos |

## 3. Arquitectura final

```text
Mobile o Ventas
  └─ POST /api/auth/forgot-password
       ├─ Store genera requestId y token aleatorio
       ├─ Backend almacena únicamente el hash y la expiración
       ├─ URL(PASSWORD_RESET_PUBLIC_URL).searchParams.set("token", token)
       └─ Communication Service renderiza y entrega password-reset

HTTPS https://manecomb.com/reset-password?token=...
  ├─ app instalada y asociación válida → Mobile /nueva-contrasena
  └─ sin app → Ventas /reset-password

Mobile o Ventas
  └─ POST /api/auth/reset-password
       ├─ valida la política autoritativa
       ├─ consume hash vigente de forma atómica en Mongo
       ├─ actualiza contraseña
       ├─ revoca sesiones anteriores
       ├─ emite PASSWORD_CHANGED
       └─ obliga a volver a iniciar sesión
```

## 4. Fuentes de verdad

- **Token:** generador del store de Backend; el token en claro solo se usa para construir la entrega y no se persiste en clientes.
- **Consumo Mongo:** filtro por hash y expiración dentro de una única operación `findOneAndUpdate`.
- **Política:** `backend/src/utils/password-policy.js`: mínimo de ocho caracteres, al menos una letra, un número y un carácter especial.
- **Plantilla activa:** `communication-service/src/templates/builders.js`, con asunto en `communication-service/src/core/types.js`.
- **Correo:** adaptador `backend/modules/communication/index.js` sobre `communication-service`; no hay envío directo desde rutas.
- **API:** exclusivamente `POST /api/auth/forgot-password` y `POST /api/auth/reset-password`.

No se creó una utilidad en `shared/`: Mobile, Ventas y Backend son paquetes con compilaciones separadas, y mover la política habría agregado acoplamiento. Los helpers de presentación replican el contrato real y tienen pruebas.

## 5. Contratos API

### Solicitud

Entrada: `{ "email": "usuario@correo.com" }`.

La respuesta pública para correo existente o inexistente y para entrega `dry_run`, `queued`, `sent`, `skipped`, `failed` o con excepción es siempre:

```json
{
  "ok": true,
  "message": "Si el correo existe, recibiras instrucciones para recuperar tu contrasena"
}
```

No expone usuario, tenant, organización, provider, `deliveryId`, token ni estado de entrega.

### Restablecimiento

Entrada: `{ "token": "...", "password": "..." }`.

- token ausente o contraseña ausente: `400`;
- token inválido/vencido/usado o contraseña rechazada: `400` con mensaje funcional;
- error inesperado: `500` sanitizado;
- éxito: revocación de sesiones, evento y correo de cambio, sin inicio de sesión automático.

## 6. URL pública y deep links

Variable nueva:

```env
PASSWORD_RESET_PUBLIC_URL=https://manecomb.com/reset-password
```

`APP_URL/reset-password` se conserva solo como fallback compatible. En producción debe configurarse la variable explícita.

Mobile acepta:

- `https://manecomb.com/reset-password?token=...` como vía principal;
- `manecomb://reset-password?token=...` como fallback interno existente.

Se rechazan dominio no autorizado, path incorrecto y token duplicado. Android usa un intent filter `autoVerify` con host `manecomb.com` y path exacto `/reset-password`. React Navigation atiende la URL inicial y eventos posteriores mediante su integración `linking`.

La asociación HTTPS aún requiere publicar `/.well-known/assetlinks.json` con la huella SHA-256 real de la firma de producción. La huella no existe en el repositorio y no se inventó.

## 7. Flujo Mobile

Rutas:

- `/recuperar-contrasena`;
- `/recuperacion-enviada`;
- `/nueva-contrasena`;
- `/contrasena-actualizada`.

El login conserva login, registro, activación de conductor y recordar sesión. “¿Olvidaste tu contraseña?” solo navega al flujo. Las pantallas incorporan normalización y validación del correo, mensaje neutral, correo enmascarado, apertura del cliente de correo, contador local de 45 segundos, ingreso manual de token como fallback, lista de requisitos de contraseña, mostrar/ocultar, confirmación, estados de red y limpieza del estado temporal.

Los POST de recuperación usan timeout de 80 segundos, muestran “Conectando con ManeComb…” después de siete segundos, bloquean doble toque y desactivan retry automático y refresh de autenticación.

## 8. Flujo Ventas

Rutas:

- `/ventas/recuperar-contrasena`;
- `/ventas/recuperacion-enviada`;
- `/reset-password`;
- `/ventas/contrasena-actualizada`.

“Recuperar acceso” ya no envía inmediatamente. Abre un formulario dedicado y puede prellenar el correo. Se reutilizan el fondo, encabezado, campos, feedback, botón, enlaces legales, tipografía y paleta de Auth. `/reset-password` conserva el token del query string y ofrece validación, confirmación, mostrar/ocultar, estados de error diferenciados y protección contra doble envío.

`planId`, `trial` y el contexto válido del checkout se conservan al entrar y volver. No se modificó la lógica comercial.

## 9. Seguridad

- Respuesta anti-enumeración idéntica en todos los resultados de entrega.
- Token aleatorio existente, hash SHA-256 almacenado, expiración de una hora y consumo único.
- Consumo Mongo atómico para evitar dos usos concurrentes.
- Rate limit existente conservado y probado.
- Contraseña validada siempre por Backend.
- Revocación de sesiones anteriores tras éxito.
- Token, contraseña, confirmación y URL completa no se persisten en Mobile o Ventas.
- Logs de entrega usan correo enmascarado y error sanitizado.
- La búsqueda final encuentra `api.resend.com` únicamente en `communication-service/src/providers/resend.provider.js`; la otra coincidencia es una aserción de prueba que prohíbe su uso en Auth.

## 10. Observabilidad

Eventos agregados/reutilizados:

- `password_reset_requested`;
- `password_reset_delivery_requested`;
- `password_reset_delivery_failed`;
- `password_reset_completed`;
- `password_reset_rejected`.

Solo incluyen referencias internas ya conocidas, duración, plantilla, provider, estado normalizado o error sanitizado. No incluyen token, contraseña ni URL completa.

## 11. Archivos modificados

### Backend y comunicación

- `backend/.env.example`
- `backend/src/config/env.js`
- `backend/src/data/mongo-store.js`
- `backend/src/modules/auth/routes.js`
- `backend/test/communication.test.js`
- `backend/test/env.test.js`
- `backend/test/password-recovery.test.js`
- `communication-service/src/core/types.js`
- `communication-service/src/templates/builders.js`
- `communication-service/tests/communication.test.js`

`mongo-store.js` se incluyó porque la auditoría demostró que era la implementación activa del consumo y que una lectura seguida de actualización no garantizaba uso único bajo concurrencia.

### Mobile

- `mobile/App.tsx`
- `mobile/android/app/src/main/AndroidManifest.xml`
- `mobile/src/api/client.ts`
- `mobile/src/navigation/deep-linking.test.ts`
- `mobile/src/navigation/linking.ts`
- `mobile/src/screens/auth/components/auth-field.tsx`
- `mobile/src/screens/customer-auth-screen.tsx`
- cuatro archivos nuevos en `mobile/src/screens/password-recovery/`

### Ventas

- `ventas/public/_redirects`
- `ventas/screens/auth/auth.styles.ts`
- `ventas/screens/auth/components/auth-feedback.tsx`
- `ventas/screens/auth/components/auth-field.tsx`
- `ventas/screens/auth/components/auth-header.tsx`
- `ventas/screens/auth/components/auth-submit-button.tsx`
- `ventas/screens/password-reset-screen.tsx`
- `ventas/screens/sales-auth-screen.tsx`
- `ventas/src/App.tsx`
- `ventas/src/lib/api.ts`
- seis archivos nuevos en `ventas/screens/password-recovery/`

### Documentación

- `RC-PASSWORD-RECOVERY-UX-01.md`

## 12. Archivos y módulos excluidos

No se modificaron `ventas/features/admin/`, `backend/src/modules/platform/`, pagos, Mercado Pago, planes, suscripciones, checkout comercial, documentos, chat, radio, WebRTC, Socket.IO, GPS, Mapbox, rutas, rutas aprendidas, incidencias, notificaciones generales, roles, permisos, tenant, flotillas, Portal operacional ni Admin Global.

El repositorio original `C:\proyectos\combis-app` conserva sus archivos ajenos sin seguimiento y su rama activa; todo el trabajo se realizó en el worktree aislado.

## 13. Validaciones automatizadas

| Área | Comando | Resultado |
| --- | --- | --- |
| Backend | `npm test` | Aprobado, suite completa sin fallos |
| Backend recuperación | `npm run test:password-recovery` | Aprobado |
| Communication Service | `npm test` | Aprobado |
| Mobile TypeScript | `npm run typecheck` | Aprobado, 0 errores |
| Mobile pruebas | `npm test` | 26 suites, 137 pruebas aprobadas |
| Ventas TypeScript | `npm run typecheck` | Aprobado, 0 errores |
| Ventas build | `VITE_API_URL=... npm run build` | Aprobado, 640 módulos transformados |
| Git | `git diff --check` | Limpio |

Las pruebas de recuperación cubren respuesta neutral, usuario inexistente, estados de entrega, excepción del provider, URL segura y encoding, rate limit, política débil, expiración, uso único, revocación, evento de cambio y ausencia de filtraciones públicas.

## 14. Validación manual

### Ventas local

Se cargó la aplicación web en runtime y se verificó:

- navegación desde `/ventas/login?planId=pro&trial=1`;
- prellenado del correo;
- conservación de `planId` y `trial`;
- estado de servidor lento y error de red sin reintento automático;
- pantalla neutral de solicitud enviada;
- `/reset-password` sin token, con token simulado y contraseña débil;
- pantalla final y retorno a `/ventas/login?planId=pro&trial=1`;
- viewport 375 × 667 sin desbordamiento horizontal.

El entorno local no pudo completar un POST contra Render por conectividad/CORS, por lo que no se afirma una entrega real.

### Mobile/Android

No había dispositivo ADB conectado. Typecheck y pruebas de navegación pasaron. `assembleDebug` se intentó con daemon y con `--no-daemon`; ambos intentos agotaron el timeout mientras Gradle permanecía ocupado, sin devolver error de compilación ni producir APK. No se declara el build Android como aprobado.

## 15. Variables operativas

Configurar en Render antes de una validación real:

```env
PASSWORD_RESET_PUBLIC_URL=https://manecomb.com/reset-password
```

No se modificaron automáticamente `EMAIL_ENABLED` ni `EMAIL_DRY_RUN`. Una prueba real debe hacerse en una ventana controlada y restaurar el estado acordado por operaciones.

## 16. Riesgos pendientes

1. Publicar `assetlinks.json` con package y huella reales de la firma Android.
2. Validar apertura del HTTPS App Link con la app cerrada, en background y activa sobre un dispositivo real.
3. Validar correo real, CTA, enlace visible, token válido, vencido y reutilizado contra el despliegue.
4. Confirmar recepción de `PASSWORD_CHANGED` en la ventana controlada.
5. Resolver el bloqueo del entorno Gradle y obtener un `assembleDebug` exitoso.
6. No hay proyecto iOS nativo en este repositorio; una asociación AASA queda fuera del alcance actual.

## 17. Estado Git y cierre

Antes del commit:

- rama: `codex/rc-password-recovery-ux-01`;
- base y `origin/main`: `3b58016`;
- divergencia inicial: `0 0`;
- `git diff --check`: limpio;
- diff limitado a Auth Backend, plantilla activa, Mobile, Ventas y este reporte.

La RC no usa el veredicto `READY` porque faltan el correo real y el dispositivo físico. El resultado correcto es:

```text
RC_PASSWORD_RECOVERY_CODE_READY_EMAIL_PENDING
```
