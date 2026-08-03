# MP-EMAIL-02B — Entrega real controlada y cierre funcional del correo

**Fecha:** 31 de julio de 2026
**Rama:** `main`
**Commit inicial:** `b0bf031`
**Commit de implementación:** `c40423b`
**Commit desplegado:** `c40423b`
**Estado:** Pendiente de confirmación visual del destinatario
**Veredicto:** `MP_EMAIL_02_NOT_READY`

## Alcance

Esta fase validó una sola entrega real de correo mediante el servicio central
de comunicación. No se crearon endpoints, eventos, plantillas ni flujos
comerciales nuevos. No se modificaron Redis, BullMQ, MongoDB, pagos,
suscripciones, documentos ni dependencias.

## Mecanismo interno

Se agregó `backend/scripts/verify-email-real.js`, un runner que aborta si no se
cumplen simultáneamente sus guardas de producción, activación explícita,
confirmación por argumentos, correo habilitado, dry-run desactivado, cola
habilitada y destinatario temporal configurado.

Render Free no ofrece Shell ni one-off jobs. Para ejecutar el runner sin
publicar una ruta HTTP, se utilizó temporalmente el comando interno de build.
Al finalizar se restauró `npm install`.

La identidad usada fue:

```text
tenantScope=system:email-validation
eventType=WELCOME
idempotencyKey=operational-validation:mp-email-02b:v1
```

Se reutilizó la plantilla activa `welcome` con datos ficticios. El destinatario
controlado solo existió como variable temporal de Render y no se incluyó en
logs, evidencia ni repositorio.

## Preflight

| Control | Resultado |
| --- | --- |
| Commit esperado y desplegado | `c40423b` |
| Build | Exitoso |
| Servicio | `live` |
| Provider | Resend configurado |
| Historial | MongoDB |
| Índice idempotente | Verificado |
| Cola | BullMQ conectada y funcional |
| Worker | Activo |
| Política de memoria | `noeviction` |
| Persistencia de Valkey | Desactivada |
| Durabilidad productiva | `false` |
| Remitente | Dominio `@manecomb.com` |
| Reply-to | Configurado |
| HTML y texto plano | Presentes |
| CTA | HTTPS |

## Primera entrega

El runner generó una sola entrega:

```text
created -> queued -> processing -> sent
```

| Evidencia | Resultado |
| --- | --- |
| Entregas creadas | 1 |
| Registros Mongo para la identidad | 1 |
| Trabajo BullMQ creado | 1 |
| Estado final | `sent` |
| `accepted` | `true` |
| `delivered` | `true` |
| `failed` | `false` |
| Provider message ID | Presente |
| Huella sanitizada del provider ID | `559f05ae6f72` |
| Provider attempts | 1 |
| Deliveries sent | 1 |
| Deliveries failed | 0 |
| HTML | Presente |
| Texto plano | Presente |
| Datos sensibles en evidencia | Ausentes |

## Idempotencia real

La segunda ejecución utilizó la misma identidad funcional. El resultado fue:

| Evidencia | Resultado |
| --- | --- |
| `duplicate` | `true` |
| Entregas nuevas | 0 |
| Trabajos nuevos | 0 |
| Llamadas adicionales a Resend | 0 |
| Intentos acumulados en la entrega | 1 |
| Incremento de `deliveries_sent` | 0 |
| Incremento de `deliveries_failed` | 0 |
| Incremento de `duplicates_prevented` | 1 |
| Registros Mongo después de repetir | 1 |

No hubo colisión pública ni duplicación del historial.

## Sanitización

La evidencia no contiene:

- dirección completa del destinatario;
- `RESEND_API_KEY`;
- `MONGO_URI`;
- `REDIS_URL`;
- tokens;
- HTML completo;
- headers de autorización;
- respuesta cruda de Resend.

## Restauración segura

Se restauró el estado operativo inmediatamente después de la comprobación:

```text
EMAIL_ENABLED=true
EMAIL_DRY_RUN=true
Build Command=npm install
EMAIL_REAL_VALIDATION=eliminada
EMAIL_REAL_VALIDATION_RECIPIENT=eliminada
```

El despliegue final `dep-d9m4s16417fc73e0i3jg` quedó `live`. Su
`RuntimeDiagnostics` reportó:

```text
status=dry_run
emailEnabled=true
emailDryRun=true
providerConfigured=true
queueMode=bullmq
queueConnected=true
queueFunctional=true
workerStarted=true
historyMode=mongo
idempotencyIndexVerified=true
productionDurability=false
```

El readiness público respondió HTTP 200 y mantuvo el estado global
`degraded`, que es el comportamiento correcto mientras Valkey Free no tenga
persistencia.

## Pruebas posteriores

| Suite | Resultado |
| --- | --- |
| `communication-service: npm test` | Aprobada |
| `backend: npm test` | Aprobada; 28 archivos encadenados |
| `backend: npm run test:password-recovery` | Aprobada |
| Fallos funcionales | 0 |

La primera ejecución aislada del backend en `C:\tmp` encontró un `EPERM` al
crear un archivo temporal de la prueba de documentos. La misma suite se
repitió desde el workspace normal y aprobó completa. No fue un fallo del
módulo de correo ni requirió cambios de código.

## Confirmación manual

Pendiente de que el propietario confirme en el buzón:

- recepción de exactamente un correo;
- remitente visible de ManeComb;
- asunto y preview correctos;
- HTML legible;
- visualización móvil aceptable;
- ausencia de valores `undefined`, `null` o `[object Object]`;
- ausencia de secretos o identificadores internos innecesarios.

Hasta recibir esa confirmación, el veredicto permanece:

```text
MP_EMAIL_02_NOT_READY
```

## Limitación vigente

```text
productionQueueDurability=false
reason=Valkey Free Persistence Mode Off
```

No se utiliza `MP_EMAIL_02_PRODUCTION_READY`.
