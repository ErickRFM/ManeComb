# PHASE-0 — Inventario, autoridades y plan de madurez ManeComb

## Veredicto actual

```text
PHASE_0_BASELINE_FROZEN
PHASE_0_AUTHORITY_MAP_CREATED
PHASE_0_RUNTIME_LOGIC_UNCHANGED
PHASE_0_CI_CERTIFICATION_PENDING
```

## Base congelada

| Dato | Valor |
|---|---|
| Repositorio | `ErickRFM/ManeComb` |
| Rama base | `main` |
| SHA base | `06909cca6814441386f7be25e6e5d5a0e9c636f8` |
| Rama de trabajo | `audit/system-authorities-phase-0-20260806-v2` |
| Fecha | 2026-08-06 |
| Cambios de runtime en esta fase | Ninguno |

Esta fase no modifica autenticación, pagos, GPS, Radio, RTC, rutas, documentos, MongoDB, Redis, Render o Cloudflare. Su propósito es impedir que las siguientes fases vuelvan a duplicar decisiones o mezclen productos.

---

# 1. Ajuste del plan después del trabajo de Claude

Durante la preparación de esta fase, `main` avanzó con el commit `06909cca6814441386f7be25e6e5d5a0e9c636f8`, que integró el trabajo funcional de Claude:

- eliminó la demo únicamente de la UI;
- mantuvo intacta la plomería de trial;
- igualó la altura de las tarjetas;
- preservó la compra pendiente para cualquier cuenta autenticada;
- conservó la pantalla temporal `OperationalHandoff` de PR #45;
- conservó `/mapa`, `/radio` y el contrato `verify:account-routing`.

Por tanto, esta fase no vuelve a implementar ni revierte esos cambios. La base oficial ya incluye ese commit.

## Decisión de producto corregida

```text
Ventas / Portal = adquisición, cuenta y administración empresarial
Mobile = operación, mapa, GPS, Radio, Chat y RTC
Admin Global = gobierno interno de ManeComb
Backend = autoridad de identidad, tenant, capacidades y dominios
```

La pantalla de handoff actual evita una vista fantasma, pero se considera una protección transitoria. La solución final de Fase 1 será:

1. preservar explícitamente la intención de compra;
2. clasificar la cuenta mediante un contexto canónico del backend;
3. permitir el Portal únicamente al canal empresarial;
4. rechazar de forma clara una cuenta operativa dentro de Ventas;
5. retirar `/mapa` y `/radio` cuando todos los redirects hayan sido migrados y probados;
6. mantener toda la operación real exclusivamente en Mobile.

---

# 2. Productos y límites canónicos

| Producto | Carpeta | Usuario | Responsabilidad | No debe contener |
|---|---|---|---|---|
| Backend | `backend/` | Sistema | API, identidad, tenant, capacidades, dominios y auditoría | Decisiones de presentación |
| Ventas/Portal | `ventas/` | Público y empresa | Landing, compra, onboarding y administración empresarial | Runtime de GPS, Radio o RTC |
| Mobile | `mobile/` | Personal operativo | Mapa, GPS, rutas activas, Radio, Chat, llamadas y Push | Administración global de empresas |
| Admin Global | `admin-global/` | Personal interno ManeComb | Gobierno Platform y auditoría global | Operación diaria de una flotilla |
| Communication package | `communication-service/` | Backend | Eventos, proveedores, workers y métricas de comunicación | Autorización empresarial independiente |
| Contratos compartidos | `shared/operational-contract/` | Builds | Vocabulario y contratos interproducto | Reglas de negocio o persistencia |
| Infraestructura | `.github/`, `scripts/`, Compose | Sistema | Validación, CI, despliegue y entorno | Secretos productivos versionados |

## Invariante principal

Ningún frontend es autoridad de autorización. Los clientes pueden ocultar, orientar o deshabilitar acciones, pero el backend vuelve a comprobar identidad, tenant y capability para cada acción protegida.

---

# 3. Autoridades registradas

La fuente legible por máquinas queda en:

```text
docs/architecture/system-authorities.json
```

El archivo registra productos, propietarios, consumidores, estado actual, fase de maduración y divergencias conocidas.

| Autoridad | Propietario objetivo | Estado inicial | Fase |
|---|---|---|---:|
| Identidad y sesión | Backend | Canónica | 1 |
| Canal de cuenta | Backend | Parcial y duplicada | 1 |
| Tenant | Backend | Canónica | 2 |
| Capacidades | Backend | Parcial entre clientes | 2 |
| Catálogo comercial | Backend | Canónica | 4 |
| Suscripción y activación | Backend | Canónica | 4 |
| Flotilla | Backend | Canónica | 5 |
| Navegación | Backend | Transicional | 6 |
| Tracking | Backend | Canónica | 6 |
| Documentos | Backend | Canónica | 5 |
| Incidencias | Backend | Canónica | 5 |
| Eventos de comunicación | Communication package | Parcial | 7 |
| Acceso Platform | Infraestructura + Backend | Configuración externa pendiente | 9 |
| Versión móvil | `mobile/app.json` | Canónica | 3 |
| Entorno | Infraestructura | Canónica | 8 |
| Auditoría | Backend | Canónica | 8 |
| Errores API | Backend | Parcial | 3 |

---

# 4. Hallazgos congelados

## P0 — bloquear antes de limpiar

### AUTH-CHANNEL-OR-AND

`ventas/src/utils/account-routing.ts` considera una cuenta empresarial mediante:

```text
accountType == company_owner OR portal role
```

`ventas/features/portal/utils/access.ts` exige:

```text
accountType == company_owner AND portal role
```

Dos reglas diferentes toman la misma decisión.

### PORTAL-GUARD-PARTIAL

El guard global de `ventas/src/App.tsx` comprueba que exista un usuario antes de montar `/portal`, pero no exige el canal empresarial canónico para cada ruta del Portal.

### ADMIN-GLOBAL-EXTERNAL-CERTIFICATION

El código de Admin Global está integrado, pero producción todavía depende de DNS, Cloudflare Access, issuer, audience, MFA real, cuenta Platform y certificación autenticada.

## P1 — estabilización de fronteras

### SALES-OPERATIONAL-HANDOFF-TEMPORARY

`/mapa` y `/radio` continúan en Ventas como handoff temporal. No son el producto operativo final.

### COMMUNICATION-HYBRID-BOUNDARY

`communication-service` tiene pruebas propias, pero el backend lo instala durante `postinstall`. Debe existir una interfaz pública única y debe prohibirse importar internals.

## P2 — mantenimiento y claridad

### BACKEND-TEST-CHAIN

El backend ejecuta una cadena extensa de archivos mediante `&&`. La cobertura es amplia, pero la ejecución no está agrupada por dominio.

### MOBILE-VERSION-METADATA

`mobile/app.json` contiene la versión pública `1.1.0` y build `19`; `mobile/package.json` conserva metadata de paquete `1.0.0`. El release debe seguir usando exclusivamente `mobile/app.json`.

### DOCUMENTATION-SPRAWL

Existen reportes RC, auditorías y documentos históricos tanto en la raíz como en `docs/`. Se archivarán únicamente después de crear índice, referencias y política de retención.

---

# 5. Plan definitivo modificado

Las fases se ejecutan una por una. No se abre una fase funcional nueva hasta que la anterior tenga CI verde, revisión, merge, smoke y veredicto de cierre.

## Fase 0 — Inventario y autoridades

**Rama:** `audit/system-authorities-phase-0-20260806-v2`

### Alcance

- congelar el SHA de referencia;
- definir productos y responsabilidades;
- registrar autoridades;
- registrar divergencias;
- validar que cada autoridad apunte a fuentes reales del repositorio;
- añadir el gate a CI;
- fijar el orden de trabajo.

### Fuera de alcance

- cambiar redirects;
- eliminar archivos;
- tocar modelos;
- modificar permisos;
- desplegar dominios.

### Cierre

```text
PHASE_0_INVENTORY_COMPLETE
PHASE_0_AUTHORITIES_VALIDATED
PHASE_0_CI_GREEN
PHASE_0_MERGED
```

## Fase 1 — Contexto de autenticación y canal único

**Rama futura:** `fix/auth-account-channel-authority`

### Objetivo

Una cuenta debe obtener exactamente el mismo canal en Backend, Ventas y Mobile.

### Cambios necesarios

- ampliar o reutilizar el contexto de autenticación del backend;
- devolver `channel`, tenant, capabilities, estado comercial y razón de bloqueo;
- crear un resolver único de destino;
- separar intención normal, intención de compra y recuperación;
- aplicar guard empresarial global al Portal;
- conservar checkout pendiente antes de cualquier redirect;
- mostrar aviso de cuenta no empresarial en Ventas;
- retirar redirects internos hacia `/mapa` y `/radio`;
- retirar esas rutas después de que las pruebas confirmen cero consumidores.

### Reglas

```text
company_portal -> Ventas/Portal
mobile_operations -> Mobile
platform_admin -> Admin Global
blocked -> ningún producto protegido
```

### Pruebas obligatorias

- owner empresarial;
- admin empresarial;
- billing manager;
- supervisor operativo;
- dispatcher;
- driver;
- combinación inválida de role/accountType;
- cuenta sin tenant;
- cuenta suspendida;
- compra pendiente;
- recuperación de contraseña con compra pendiente;
- acceso manual a `/portal` con cuenta operativa;
- sesión restaurada.

### Cierre

```text
AUTH_CONTEXT_CANONICAL
ACCOUNT_CHANNEL_SINGLE_AUTHORITY
PORTAL_GLOBAL_GUARD_ACTIVE
CHECKOUT_INTENT_PRESERVED
SALES_OPERATIONAL_ROUTES_REMOVED
```

## Fase 2 — Tenant, capabilities y políticas

**Rama futura:** `refactor/tenant-capability-authority`

- catálogo estable de capabilities;
- política rol-capability únicamente en backend;
- clientes consumen capabilities sin inventarlas;
- revocación o actualización de sesión ante cambios sensibles;
- aislamiento multiempresa para todos los dominios protegidos;
- eliminación progresiva de comparaciones directas de roles en componentes.

```text
TENANT_AUTHORITY_CANONICAL
CAPABILITY_POLICY_BACKEND_ONLY
FRONTEND_ROLE_DECISIONS_REMOVED
TENANT_ISOLATION_CERTIFIED
```

## Fase 3 — Contratos compartidos, errores y versión

**Rama futura:** `refactor/shared-contracts-and-errors`

Prioridad:

1. identidad y canal;
2. errores API;
3. capabilities;
4. sesión;
5. versión móvil;
6. unidad operativa;
7. navegación;
8. comercial y documentos.

```text
SHARED_AUTH_CONTRACT_ACTIVE
SHARED_ERROR_CONTRACT_ACTIVE
DUPLICATED_ROLE_ENUMS_REMOVED
MOBILE_VERSION_SINGLE_AUTHORITY
```

## Fase 4 — Comercial, pago manual y activación

**Rama futura:** `harden/commercial-state-authority`

- SPEI continúa como método productivo actual;
- Mercado Pago permanece desactivado detrás de provider/configuración;
- tarjeta simulada solo existe en test;
- frontend nunca activa una suscripción;
- confirmación y activación son idempotentes;
- catálogo y precios vienen del backend.

```text
COMMERCIAL_CATALOG_CANONICAL
MANUAL_PAYMENT_PRODUCTION_ONLY
SUBSCRIPTION_STATE_MACHINE_ACTIVE
ACTIVATION_BACKEND_ONLY
```

## Fase 5 — Flotilla, documentos e incidencias

**Rama futura:** `harden/fleet-documents-incidents`

- unidad operativa canónica;
- lifecycle de vehículo y conductor;
- retiro frente a eliminación;
- subida documental del chofer con MIME, tamaño, tenant y owner;
- revisión administrativa trazable;
- incidentes con estados, severidad, asignación y resolución.

```text
OPERATIONAL_UNIT_CANONICAL
VEHICLE_LIFECYCLE_CERTIFIED
DRIVER_DOCUMENT_UPLOAD_CERTIFIED
INCIDENT_STATE_MACHINE_ACTIVE
```

## Fase 6 — Navegación, tracking y aprendizaje

**Rama futura:** `refactor/navigation-single-writer`

- inventariar consumidores de `/api/navigation/assign`;
- añadir telemetría de uso legado;
- migrar consumidores;
- versionar activación;
- separar route definition, assignment, activation y session;
- aprendizaje genera propuestas, no modifica producción automáticamente;
- certificar varias rutas visibles simultáneamente.

```text
NAVIGATION_SINGLE_WRITER
LEGACY_ASSIGN_USAGE_ZERO
ROUTE_ACTIVATION_VERSIONED
ROUTE_LEARNING_PROPOSAL_ONLY
```

## Fase 7 — Comunicación, Radio, Chat, RTC y Push

**Rama futura:** `refactor/communication-public-boundary`

- `public-api` único;
- prohibir imports internos desde Backend;
- eventos versionados;
- `eventId`, tenant, actor, timestamp y ACK;
- idempotencia y reordenamiento;
- estado de llamada y CDR como autoridad backend;
- coordinador Mobile para Radio y llamadas;
- certificación física de FCM, cambio de red y audio.

```text
COMMUNICATION_PUBLIC_API_ONLY
COMMUNICATION_EVENTS_VERSIONED
RADIO_CALL_AUDIO_COORDINATION_CERTIFIED
FCM_CLOSED_APP_CERTIFIED
```

## Fase 8 — Observabilidad, entorno, deprecaciones y suites

**Rama futura:** `harden/observability-and-deprecations`

- health por componente y criticidad;
- `ready`, `degraded`, `optional_disabled`, `not_configured`, `unavailable`;
- request ID de extremo a extremo;
- métricas de endpoints legados;
- registro formal de deprecaciones;
- suites backend por dominio;
- contrato de variables sin aliases indefinidos.

```text
HEALTH_COMPONENTIZED
DEPRECATION_REGISTER_ACTIVE
LEGACY_USAGE_MEASURED
DOMAIN_TEST_SUITES_ACTIVE
```

## Fase 9 — Admin Global y dominios privados

**Rama futura:** `harden/admin-global-production-access`

1. `admin.manecomb.com`;
2. `admin-api.manecomb.com`;
3. Cloudflare Access;
4. issuer y audience;
5. JWKS;
6. CORS exacto;
7. `platform_owner`;
8. MFA real;
9. enforcement;
10. matriz autenticada y auditoría.

```text
ADMIN_GLOBAL_PRIVATE_DOMAIN_ACTIVE
CLOUDFLARE_ACCESS_ENFORCED
PLATFORM_MFA_CERTIFIED
PLATFORM_RBAC_CERTIFIED
```

## Fase 10 — Limpieza, archivo y release final

**Rama futura:** `release/system-maturity-finalization`

- archivo histórico indexado;
- documentación raíz mínima;
- ramas fusionadas eliminadas;
- stashes locales revisados manualmente y no aplicados a ciegas;
- archivos sin importadores eliminados;
- endpoints con uso cero retirados;
- certificación web, backend, Android y Admin Global;
- smoke de dominios;
- rollback probado.

```text
VERIFIED_DEAD_CODE_REMOVED
DOCUMENTATION_ARCHIVED_AND_INDEXED
MAIN_DEPLOYABLE
MANECOMB_DOMAINS_CERTIFIED
MANECOMB_RELEASE_READY
```

---

# 6. Reglas Git para todo el trabajo

1. Cada fase parte del `main` resultante de la fase anterior.
2. No se reutilizan ramas antiguas como base funcional.
3. No se usa force push.
4. No se mezclan dos dominios funcionales en un PR.
5. El PR declara qué preserva y qué queda fuera.
6. CI, dependency audit y artefactos corresponden al SHA revisado.
7. El merge ocurre únicamente después de revisar el diff completo.
8. Después del merge se ejecuta smoke del artefacto afectado.
9. La rama fusionada se elimina.
10. El veredicto distingue código listo, configuración externa pendiente y certificación física pendiente.

---

# 7. Criterio de borrado

Nada se elimina solo por parecer antiguo.

Un archivo, endpoint o adaptador puede retirarse cuando:

- no tiene importadores;
- no registra rutas;
- no emite ni consume eventos;
- no participa en build, migraciones o despliegue;
- no tiene consumidores en versiones soportadas;
- existe reemplazo canónico;
- existe prueba o gate que evita su regreso;
- el rollback está documentado.

---

# 8. Entregables de esta fase

- `docs/architecture/system-authorities.json`;
- `scripts/validate-system-authorities.mjs`;
- gate `Validate system authority map` en CI;
- este reporte de inventario y fases;
- ADR de límites de producto y autoridades.

## Criterio final de Fase 0

La fase se considerará cerrada únicamente después de:

- CI completo verde;
- dependency audit verde;
- diff limitado a arquitectura, validación y CI;
- PR fusionado a `main`;
- rama eliminada;
- confirmación de que no cambió runtime.
