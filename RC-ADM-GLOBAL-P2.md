# ADM-GLOBAL-P2 — Empresas y detalle global en modo lectura

**Rama:** `feat/adm-global-p2-companies`  
**Base apilada:** `feat/adm-global-p1-shell`  
**Estado:** implementación técnica cerrada; pendiente de revisión y merge secuencial

## Alcance cerrado

- Read model `PlatformCompanyView` construido desde `organizationId`.
- Fuentes canónicas existentes: usuarios empresariales, unidades, órdenes comerciales y catálogo de planes.
- Listado global paginado con búsqueda, plan, estado de pago y onboarding.
- Orden controlado por empresa, creación o último acceso.
- Detalle sanitizado de propietario, plan, estado comercial, usuarios y unidades.
- Sin posiciones GPS, secretos, hashes, referencias privadas del proveedor ni payloads comerciales completos.
- Endpoints protegidos `GET /api/platform/companies` y `GET /api/platform/companies/:organizationId`.
- Permiso obligatorio `platform.companies.read`, MFA y token Platform.
- Auditoría `platform.company.list` y `platform.company.view`.
- Pantallas responsive de lista y detalle exclusivamente de lectura.
- Pruebas backend, integración HTTP y contratos frontend conectadas a los gates permanentes.

## Límites

P2 no suspende empresas, no cambia planes, no ejecuta reembolsos, no activa cuentas y no modifica datos empresariales. Las acciones permanecen reservadas para P4.

No se creó una colección Organization ni se reutilizó el bypass empresarial legado. No se modificaron secretos, MongoDB, Render, Cloudflare ni Producción.

## Certificación

- Platform backend suites: PASS
- Company service and HTTP tests: PASS
- Admin Global typecheck: PASS
- Admin Global P1/P2 contract tests: PASS
- Admin Global build and SPA fallback: PASS
- Environment contract: PASS
