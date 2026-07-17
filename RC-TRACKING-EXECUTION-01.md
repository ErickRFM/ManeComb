# RC-TRACKING-EXECUTION-01 — Informe de ejecución

Fecha: 2026-07-17

## Estado de cierre

Implementación técnica de Fases 1–3 y reduced-motion Mobile completada. Fase 4-landing está implementada pero no certificada. La RC permanece **abierta**: el conteo de rutas huérfanas sobre MongoDB productivo, el bloqueo TypeScript del Portal y la matriz manual en dispositivo requieren resolución externa. No se modificaron datos productivos.

> Actualización 2026-07-17: se cerraron los frentes de ubicación persistida de incidentes y prevención de nuevas rutas huérfanas. La extensión reduced-motion de la landing fue implementada, pero su certificación quedó bloqueada por un error TypeScript concurrente y ajeno en `portal-dashboard-screen.tsx` (`styles.replayEmptyNote` inexistente). Por ello Fase 4-landing no se declara cerrada.

## Fase 0 — Verificación de datos

### Resultado

- Dataset embebido: 0 rutas, 0 rutas huérfanas, impacto nulo, migración no requerida.
- MongoDB configurado: consulta de solo lectura intentada dentro y fuera del sandbox; ambos intentos fallaron por resolución DNS (`ECONNREFUSED _mongodb._tcp...`).
- Conteo productivo: pendiente; no se infiere un valor.
- Prioridad provisional: alta hasta ejecutar la consulta, porque una ruta sin organización quedaba visible en live tracking antes de Fase 3.

### Entregable

- `backend/scripts/audit-orphan-routes.js`: cuenta rutas sin `organizationId`, vehículos asignados y jornadas relacionadas; no contiene operaciones de escritura.

## Fase 1 — Integridad temporal

### Cambios

- `backend/src/services/tracking-time.js`: normalización central de reloj cliente, tolerancia acotada, timestamp procesado por servidor y criterio de frescura.
- `backend/src/modules/locations/routes.js` y `backend/src/sockets/index.js`: HTTP y Socket usan la misma decisión temporal y registran origen, recibido, procesado, desfase y motivo.
- `backend/src/data/store.js` y `backend/src/data/mongo-store.js`: paquetes anteriores no sobrescriben la última ubicación.
- `backend/src/data/models.js`: conserva timestamp del cliente, recepción, fuente y desfase para auditoría.

### Riesgos

- Equipos con más de 5 minutos de desfase conservan su hora original para auditoría, pero su orden operativo usa la hora del servidor.
- El umbral puede configurarse con `TRACKING_MAX_CLOCK_SKEW_MS`; cambiarlo exige repetir pruebas.

### Evidencia

- `backend/test/tracking-integrity.test.js`: reloj adelantado, atrasado, dentro de tolerancia, recuperación y frescura.
- Prueba focalizada: verde.

## Fase 2 — Consistencia GPS

### Cambios

- Backend calcula y publica `gpsFreshness` (`state`, `isFresh`, `thresholdMs`, `evaluatedAt`, `freshUntil`) en snapshot, HTTP y Socket.
- Mobile (`mobile/src/screens/map/utils/tracking.ts`, `BottomTrackingPanel.tsx`) y Portal (`ventas/features/portal/utils/tracking.ts`, `portal-dashboard-screen.tsx`) deciden con el mismo `freshUntil` autoritativo.
- Tipos actualizados en Mobile y Portal.

### Riesgos

- Clientes anteriores que no reciben `gpsFreshness` muestran el dato como no fresco; comportamiento seguro ante incertidumbre.

## Fase 3 — Aislamiento por organización

### Cambios

- `/locations/live` ya no acepta rutas sin organización como globales.
- Las rutas se filtran por tenant; solo el rol con acceso explícito a todos los tenants puede cruzar organizaciones.
- Emisiones de ubicación continúan segmentadas por sala de organización/rol y usuario conductor.
- `POST /navigation/routes` exige `requireOrganization` antes del acceso operativo; una identidad sin tenant ya no puede persistir una ruta con `organizationId: null`.

### Riesgos

- Rutas históricas huérfanas dejarán de verse hasta migrarlas; evita fuga y hace visible la deuda de datos.

## Fase 4 — Experiencia de usuario

### Cambios

- El panel inferior de Mobile escucha `reduceMotionChanged` y omite `LayoutAnimation` cuando el sistema solicita movimiento reducido.
- No se modificó lógica de seguimiento, selección, HUD ni mapa.
- Landing: se añadió una vía estática de revelado, preferencia reactiva `matchMedia`, supresión de parallax antes de registrar pointer/rAF, detención de loops y gate de keyframes con `@media (prefers-reduced-motion: reduce)`.
- Estado landing: **implementada, no certificada**. El árbol compilaba antes de la edición; durante la verificación apareció un error TypeScript ajeno en `ventas/features/portal/screens/portal-dashboard-screen.tsx` por un estilo `replayEmptyNote` faltante. No se modificó ese frente concurrente.

## Frente adicional — Ubicación persistida de incidentes

- Antes: Mobile copiaba `vehicle.location` si existía `locationTimestamp`, aunque estuviera vencido; Backend lo persistía sin clasificación y mapa/historial lo consumían como ubicación real.
- Política aplicada: una ubicación de vehículo solo se persiste si el mismo criterio autoritativo la clasifica `fresh`.
- GPS vencido: `location: null`, `locationState: stale`, `locationSourceTimestamp` preservado.
- Sin GPS: `location: null`, `locationState: missing`.
- GPS fresco: coordenada persistida normalmente con `locationState: fresh`.
- La validación se ejecuta en Backend; Mobile anticipa el mismo estado para presentar “GPS vencido” distinto de “Sin ubicación GPS”.

## Validaciones automáticas

- Mobile TypeScript: verde.
- Mobile ESLint: verde.
- Mobile Jest/punto-a-punto: 21 suites, 99 pruebas, verde.
- Backend: suite completa verde; prueba focalizada de integridad verde; `node --check` verde.
- Portal TypeScript: verde.
- Portal build Vite: verde (advertencia preexistente por chunks grandes, no error).
- Android `assembleDebug`: verde.
- Portal no define script ESLint; Backend es JavaScript y no define TypeScript ni script de build independiente.

## Validación manual pendiente

No se declara ejecutada sin dispositivo/sesión operativa. Queda por comprobar: cambio de vehículo, ruta asignada/eliminada, reconexión, background/foreground, cambio de red, pérdida/recuperación GPS, marcadores, polilíneas, panel inferior, HUD, selector y comparación Mobile–Portal para la misma unidad.

## Criterio de cierre

La RC no debe cerrarse hasta obtener el conteo productivo de Fase 0 y completar la matriz manual. El código y las compilaciones están listos para esa validación.
