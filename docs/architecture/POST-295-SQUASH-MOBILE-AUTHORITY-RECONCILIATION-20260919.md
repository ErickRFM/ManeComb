# Reconciliación semántica posterior a PR #295 — 2026-09-19

## Hecho y alcance

PR #295 se integró por squash en `main@64b4fb445819c6cf410e8dcfb8cc1d156446293f`, desde el head de PR `f027fd6a2b1b1e84fef95b601e337e84a2a680ae`, basado en `main@eabbf91b0ac7088573be0902480804618da9cb98`. El documento de PR #295 y el contrato anterior se apoyaban en el checkpoint de candidato `8f264c169a13ddf05d6ca1383b3dff724fd14f8a`. El squash conservó el contenido de producto pero no la relación de ascendencia con ese commit intermedio. El push de main falló exclusivamente en `Validate audit gates and baseline freshness` al no ser `8f264c` antepasado del HEAD del merge.

## Autoridad y equivalencia revisadas

- El diff de PR #295 cambia 18 archivos; extrae `app-state-foundation`, `runtime/session-storage`, `runtime/resource-refresh-projection` y `slices/preferences-slice`, con pruebas y guards de límites. Los 18 archivos corresponden al commit integrado por squash; no se introduce un cambio de producto en esta PR de rebaseline.
- `useAppStore` permanece como store Zustand público. `session-epoch` conserva la invalidación y el teardown en las autoridades existentes; `runtime/session-storage` recibe adaptadores de `persistent-storage` y mantiene llaves y orden de persistencia.
- `@shared/resource-state` sigue siendo la autoridad de transiciones de recursos; la proyección extraída utiliza esas operaciones canónicas. Preferencias siguen acotadas por identidad de usuario/organización; el hook de tema actual no se reemplaza con la versión antigua de PR #292.
- No se modificaron backend, contratos API, Socket.IO, colas offline, captura GPS, código nativo Android ni permisos, radio/RTC, Mapbox o FCM en PR #295.
- Las pruebas sobre el head exacto de PR #295 finalizaron en verde: CI con compilación de APK debug, Dependency audit y System audit gates para PR Ready (run #1332). Los despliegues, un APK Release en Android físico y TURN/FCM reales no se certifican aquí.

## Rebaseline y controles

Se actualiza `baseline.commit` y `authorityReview.commit` a `main@64b4fb445819c6cf410e8dcfb8cc1d156446293f`, el primer commit canónico que contiene el producto de PR #295. `maxBaselineDriftCommits` y `maxAuthorityMapDriftCommits` permanecen en 5; no se modifica `scripts/validate-system-audit-gates.mjs`, la matriz de autoridades ni el código de producto. El PR de esta reconciliación debe pasar sus propios controles antes de integrarse y el push posterior debe volver a evaluarse.

## Límites de cierre

Este checkpoint corrige únicamente la coherencia histórica del contrato de CI: no convierte #29, #89, #108, #277 ni #282 en PASS. La prueba física y la certificación del runtime de producción continúan pendientes con un APK Release y entorno identificados de forma reproducible. 
