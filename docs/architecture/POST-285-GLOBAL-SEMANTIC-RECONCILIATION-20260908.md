# ManeComb — reconciliación semántica post-285 — 2026-09-08

## Alcance

Esta revisión refresca la evidencia de auditoría desde `main@c95150a02a5e3b436103340b53c51af820e7dfc3` hasta `main@6c04591cd7c99214305206bc60adf860e6edee90`. Se revisan los siete commits incorporados después de PR #280 antes de integrar PR #286. El objetivo es comprobar si alguno cambia la autoridad canónica de identidad, acceso Platform, catálogo comercial, tracking, mapas, configuración o release.

## Ventana revisada

| Commit | Cambio | Decisión semántica |
|---|---|---|
| `cf00c7da` | Admin Global same-origin | Introduce Worker/proxy restringido para `/api/platform/*`. Cambia transporte, no identidad ni autorización: Cloudflare Access + backend Platform Auth/MFA/RBAC siguen siendo la autoridad. |
| `e9bdf4b1` | Merge PR #281 | Integra el corte same-origin anterior; no agrega una nueva autoridad. |
| `b3ac7882` | Dominio comercial | Retira el fallback obsoleto `manecomb.app` y conserva `manecomb.com` como dominio comercial vigente. No cambia catálogo, cuenta ni pagos. |
| `0f31eefe` | Gate de dominio | Añade regresión para impedir reintroducir dominios retirados; es enforcement, no fuente de verdad de negocio. |
| `8bf7bbe9` | Merge PR #283 | Integra el retiro del dominio obsoleto sin cambiar ownership. |
| `9bbbb6e8` | Contrato de mapas | Retira variables Google Maps ya no consumidas. Mapbox continúa como proveedor activo; no cambia autoridad de rutas/tracking. |
| `6c04591c` | Merge PR #285 | Integra el contrato Mapbox-only después de gates verdes; sin nueva autoridad. |

## Autoridades verificadas

- **platform-access**: permanece en infraestructura y backend. El Worker de Admin Global solo transporta el namespace Platform; no decide actor, MFA, sesión ni RBAC.
- **identity / capabilities**: permanecen en backend.
- **commercial-catalog / subscription**: permanecen en backend; el retiro de un dominio de soporte no altera precios, planes ni transiciones de pago.
- **tracking / navigation**: permanecen en backend. Ninguno de los siete commits modifica la decisión de qué posición es válida o qué jornada la contiene.
- **environment**: permanece en infraestructura. El contrato elimina residuos de Google Maps y mantiene Mapbox como integración provisionada.
- **repository-change-governance / CI_RELEASE**: los nuevos guards endurecen regresiones; no sustituyen las autoridades de runtime.

## PR #286 — revisión previa a integración

PR #286 endurece la autoridad temporal de GPS offline: `clientQueueAgeMs` solo puede reconstruir tiempo live cuando declara fuente `monotonic`. Edad de cola legacy/no verificada con reloj sospechoso queda `historical-only`; puede conservar evidencia de jornada pero no mover la proyección viva ni emitir una actualización realtime como válida.

La autoridad continúa en backend (`tracking-time.js` + `vehicle-location-ingestion.js`). No se delega ordering al cliente: el cliente únicamente aporta evidencia de procedencia y el backend decide elegibilidad live, historial, deduplicación y orden.

La fixture histórica que modela explícitamente una cola monotónica fue actualizada para declarar `clientQueueAgeSource=monotonic`; las pruebas nuevas de PR #286 mantienen cobertura separada para legacy/untrusted y fail-closed.

## Resultado

```text
MAIN_C95150A_TO_6C04591_SEMANTICALLY_RECONCILED
AUTHORITY_OWNERS_UNCHANGED
ADMIN_SAME_ORIGIN_IS_TRANSPORT_NOT_AUTHORITY
COMMERCIAL_DOMAIN_CLEANUP_NO_BUSINESS_AUTHORITY_CHANGE
MAPBOX_ONLY_ENVIRONMENT_CONTRACT_CONFIRMED
PR_286_TRACKING_TIME_REMAINS_BACKEND_AUTHORITATIVE
```

Se refrescan `baseline.commit` y `authorityReview.commit` a `main@6c04591cd7c99214305206bc60adf860e6edee90` sin ampliar los límites de drift (`5`).
