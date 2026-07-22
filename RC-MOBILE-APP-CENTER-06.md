# RC-MOBILE-APP-CENTER-06 — Estandarización y modularización de Alertas

## Resultado

Se estandarizó la nomenclatura visible del módulo móvil como **Alertas** y se dividió la pantalla monolítica en componentes presentacionales, constantes y utilidades. El dominio interno continúa siendo `Incident` y la compatibilidad pública de `incidents-screen.tsx` se conserva.

## Archivos modificados

- `mobile/src/screens/incidents-screen.tsx`
  - Se mantiene como adaptador compatible.
  - Continúa exportando `IncidentsScreen` y `getIncidentContext` con los nombres consumidos por el resto de la aplicación.

## Archivos creados

- `mobile/src/screens/alerts/AlertsScreen.tsx`
- `mobile/src/screens/alerts/components/AlertsHeader.tsx`
- `mobile/src/screens/alerts/components/AlertForm.tsx`
- `mobile/src/screens/alerts/components/AlertFilters.tsx`
- `mobile/src/screens/alerts/components/AlertSearch.tsx`
- `mobile/src/screens/alerts/components/AlertSummary.tsx`
- `mobile/src/screens/alerts/components/AlertState.tsx`
- `mobile/src/screens/alerts/components/AlertBadge.tsx`
- `mobile/src/screens/alerts/constants/alerts.constants.ts`
- `mobile/src/screens/alerts/utils/alerts.utils.ts`

## Componentes extraídos

- `AlertsHeader`: título, resumen operativo y accesos rápidos de pánico/unidad.
- `AlertSummary`: resumen visual de alertas abiertas.
- `AlertForm`: campos de título, tipo, severidad y descripción, además del botón de emisión.
- `AlertFilters`: filtros horizontales de la bitácora.
- `AlertSearch`: entrada y limpieza de búsqueda.
- `AlertState`: estados de carga, ausencia de resultados y ausencia de alertas.
- `AlertBadge`: presentación de tipo, estado, severidad y archivos.

La bitácora y cada elemento de la bitácora permanecen en `AlertsScreen.tsx`. Extraerlos implicaba trasladar callbacks de navegación y actualización de estado. También se conservaron en la pantalla todos los hooks y la creación de estilos. No se crearon `useAlertUI.ts`, `AlertTimeline.tsx`, `AlertTimelineItem.tsx` ni `alerts.styles.ts` porque hacerlo habría contradicho las prohibiciones explícitas de mover hooks, renders funcionales, callbacks u orden de ejecución. Esta RC prioriza la regla principal de comportamiento idéntico sobre completar esos nombres de archivo de la estructura objetivo.

## Cambios visuales de nomenclatura

| Antes | Después |
| --- | --- |
| Incidencias | Alertas |
| Nuevo reporte | Nueva alerta |
| Título de la incidencia | Título de la alerta |
| Detalles del evento | Detalles de la alerta |
| Bitácora de eventos | Historial de alertas |
| evento / eventos | alerta / alertas |
| Buscar evento | Buscar alerta |
| Ver más eventos | Ver más alertas |
| Sin eventos recientes | Sin alertas recientes |

Los identificadores, modelos, contratos y llamadas internas conservan la palabra `Incident`.

## Evidencia de compatibilidad

- `mobile/App.tsx` no fue modificado y continúa importando `IncidentsScreen` desde `screens/incidents-screen`.
- La ruta `/incidencias` y el registro de navegación no fueron modificados.
- `createIncident`, `updateIncidentStatus`, `incidents`, `focusedIncidentId` e `incidentId` conservan nombre, origen y uso.
- Los estados `title`, `description`, `type`, `severity`, `activeFilter`, `search` y `showAllEvents` permanecen en `AlertsScreen`.
- Los `useMemo`, `useRef`, `useState`, `useWindowDimensions`, `useLocalSearchParams`, `useAppStore` y `useAppTheme` permanecen en la pantalla y conservan su orden.
- Los callbacks de creación, SOS, resolución, filtros, búsqueda y navegación conservan sus llamadas originales.
- `getIncidentContext` fue movido mecánicamente y se reexporta desde la ruta anterior para conservar sus consumidores.
- No se modificaron archivos de backend, portal, App Center, API, store, servicios, modelos o contratos.

## Matriz de validación solicitada

| Pregunta | Respuesta |
| --- | --- |
| ¿Cambió alguna lógica? | NO |
| ¿Cambió algún flujo? | NO |
| ¿Cambió algún contrato? | NO |
| ¿Cambió algún modelo? | NO |
| ¿Cambió algún endpoint? | NO |
| ¿Cambió algún dato? | NO |
| ¿Cambió algún store? | NO |
| ¿Cambió algún servicio? | NO |
| ¿Cambió la navegación? | NO |
| ¿Cambió el comportamiento? | NO |
| ¿Cambió la UI? | Solo la nomenclatura visual autorizada |

## Verificación técnica

- `npm.cmd run typecheck`: aprobado.
- `npm.cmd test`: aprobado.
- 25 suites aprobadas.
- 126 pruebas aprobadas.
- 0 snapshots modificados.

## Alcance excluido

No se modificaron backend, endpoints, respuestas JSON, persistencia, MongoDB, JWT, login, portal web, Mobile App Center, stores, servicios, contratos compartidos ni modelos TypeScript.
