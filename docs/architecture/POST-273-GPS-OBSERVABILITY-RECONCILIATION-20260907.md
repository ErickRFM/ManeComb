# ManeComb — reconciliación semántica post-273 para observabilidad GPS — 2026-09-07

## Alcance

Esta revisión refresca los baselines de auditoría desde `main@7a8c015756204f8b9e322fbedec777fbdd0e3806` hasta `main@f25de8df878c5f90d69c8113a5347da6e12bf010` antes de integrar la observabilidad propuesta por PR #276.

No se modifica ningún propietario de autoridad ni la semántica de GPS.

## Ventana revisada de main

- `d2ddb963` / `c4698638`: foco de teclado en login; sin cambio de identidad, sesión o tracking.
- `270f1711` / `d2eebb0e`: safe inset del aviso de conexión; presentación únicamente.
- `586b0514` / `f25de8df`: espera la unidad Mongo enriquecida antes de construir/publicar el snapshot realtime. El backend sigue siendo autoridad de tracking; el cambio evita perder identidad de unidad por una Promise no esperada.

Resultado: identity, tenant, capabilities, tracking, navigation, communication, Platform RBAC y release authority conservan los propietarios registrados en `system-authorities.json`.

## PR #276

`emitOperationalUnitUpdate()` mantiene la política existente: si falla el ensamblado del snapshot después de persistir GPS, no revierte la persistencia y no publica un snapshot parcial.

El PR sólo hace observable esa ruta de fallo mediante:

- contador agregado `operational_snapshot_emit_failed` con tags acotados `decision` y `stage`;
- warning estructurado `OperationalUnitSnapshotBuildFailed`;
- prueba que fuerza la falla, verifica retorno `null`, ausencia de emisión parcial y presencia de la métrica.

No cambia los umbrales 8/15/30, `locationReceivedAt`, ordering, cadencia, payload realtime, rooms, RBAC, tenant, Mobile, Portal ni persistencia Mongo.

## Gate físico

La observabilidad no sustituye la prueba física. Si durante el retest aparece de nuevo el patrón “persistencia correcta / mapa sin realtime”, primero se correlacionará esta señal para distinguir falla de ensamblado de falla de ingestión o de consumo cliente.

## Veredicto

```text
MAIN_7A8C015_TO_F25DE8DF_SEMANTICALLY_RECONCILED
AUTHORITY_OWNERS_UNCHANGED
GPS_REALTIME_OBSERVABILITY_ONLY
PHYSICAL_GPS_RETEST_STILL_PENDING
```
