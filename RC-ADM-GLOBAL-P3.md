# ADM-GLOBAL-P3 — Comercial, Sistema y Auditoría

**Rama:** `feat/adm-global-p3-operations`  
**Base apilada:** `feat/adm-global-p2-companies`  
**Estado:** implementación técnica cerrada; pendiente de revisión y merge secuencial

## Alcance cerrado

- Órdenes comerciales globales paginadas y filtradas en modo lectura.
- Detalle comercial sanitizado sin referencias privadas del proveedor ni metadata cruda.
- Readiness global sanitizado de infraestructura e integraciones.
- Auditoría Platform paginada con metadata y filtros bajo allowlist explícita.
- IP, user-agent, secretos y payloads arbitrarios quedan fuera de las respuestas.
- Permisos separados para comercial, sistema y auditoría.
- Pantallas responsive con carga, error, reintento, persistencia y paginación.
- Pruebas backend, HTTP y frontend incorporadas a gates permanentes.

## Límites

P3 no captura pagos, no reembolsa, no cancela suscripciones, no activa cuentas, no rota secretos y no elimina auditoría. Las acciones controladas permanecen en P4.

No se modificaron secretos, MongoDB, Render, Cloudflare ni Producción.

## Certificación

- Platform backend suites P0-P3: PASS
- Commercial/System/Audit tests: PASS
- Audit metadata/filter allowlists: PASS
- Admin Global typecheck and P1-P3 tests: PASS
- Admin Global build and SPA fallback: PASS
- Environment contract: PASS
