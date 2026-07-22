# RC-PORTAL-09 — Modularización de Gestión de Incidencias

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `bba2e01`
>
> **Estado Git inicial:** árbol limpio, sin revert, rebase, merge ni cherry-pick en curso.

## 1. Objetivo y resultado

Se modularizó `ventas/features/portal/screens/portal-incidents-screen.tsx` sin rehacer el módulo. `PortalIncidentsScreen` continúa como único contenedor de stores, sesión, RBAC, estado, efecto, memo, selección, filtro y actualización de estado.

El contenedor pasó de **415 a 90 líneas físicas**, una reducción de **325 líneas (78.3 %)**. La reducción corresponde a traslado estructural hacia componentes, estilos, constantes y utilidades; no representa eliminación del módulo ni de sus capacidades.

## 2. Estado inicial e inventario real

| Elemento | Implementación verificada |
|---|---|
| Export público | `PortalIncidentsScreen` |
| Consumidor | Carga diferida en `ventas/src/App.tsx` |
| Protección | `ScreenErrorBoundary` con nombre `Incidencias` y guard general del Portal |
| Props públicas | Ninguna |
| Stores | `useAppStore` y `usePortalStore` |
| Acción operativa | `updateIncidentStatus` |
| Carga | `loadIncidents` |
| Datos | `user`, `incidents`, `isSubmitting` |
| RBAC | `owner`, `admin` o `supervisor` |
| API directa | Ninguna; el flujo permanece delegado al store |
| Navegación local | Ninguna |
| Confirmación | `ConfirmModal` para cambio de estado |

La implementación real no tenía búsqueda, paginación, ordenamiento explícito, categorías configurables, asignación de responsables, formulario libre, adjuntos interactivos, navegación local o API directa. No se añadieron ni se atribuyen a esta RC.

## 3. Estado, hooks y efectos conservados

El orden original y final permanece:

1. `useAppStore` para `user`.
2. `usePortalStore` para incidencias y acciones.
3. `filterStatus`.
4. `detailTarget`.
5. `statusTarget`.
6. `selectedStatus`.
7. `message`.
8. `useEffect` de carga.
9. `useMemo` de filtrado.

El efecto sigue ejecutando `loadIncidents` con dependencias `[loadIncidents]`. El memo devuelve todas las incidencias cuando no existe filtro y compara `incident.status === filterStatus` cuando hay selección; sus dependencias permanecen `[incidents, filterStatus]`.

No existían `useCallback`, `useRef`, hooks responsive, timers, listeners o cleanup.

## 4. Arquitectura anterior

El archivo original concentraba:

- acceso a dos stores y cálculo RBAC;
- cinco estados locales;
- carga inicial y filtrado derivado;
- actualización de estado y mensajes;
- aviso contextual;
- listado, chips de filtro, badges y estado vacío;
- selección y panel de detalle;
- metadatos, ubicación, vehículo y medios;
- selector de estado dentro del modal;
- helpers de severidad, estado e icono;
- constantes visuales implícitas y StyleSheet completo.

## 5. Arquitectura final

```text
PortalIncidentsScreen
└── incidents/
    ├── components/
    │   ├── portal-incidents-context-notice.tsx
    │   ├── portal-incidents-list.tsx
    │   ├── portal-incident-details.tsx
    │   └── portal-incident-status-selector.tsx
    ├── incidents.constants.ts
    ├── incidents.styles.ts
    └── incidents.utils.ts
```

### Componentes extraídos

| Componente | Responsabilidad | Props | Estado propio | Hooks | Consumidor |
|---|---|---|---|---|---|
| `PortalIncidentsContextNotice` | Aviso contextual para usuarios con gestión | Ninguna | Ninguno | Ninguno | `PortalIncidentsScreen` |
| `PortalIncidentsList` | Filtros visuales, listado, badges y estado vacío | filtro, incidencias, mensaje y callbacks | Ninguno | Ninguno | `PortalIncidentsScreen` |
| `PortalIncidentDetails` | Panel de detalle, metadatos, medios y acción visual | permiso, incidencia, mensaje y callbacks | Ninguno | Ninguno | `PortalIncidentsScreen` |
| `PortalIncidentStatusSelector` | Opciones visuales del estado en el modal | value y onChange | Ninguno | Ninguno | `PortalIncidentsScreen` |

Ningún componente importa stores, API, clientes HTTP, sesión, router, persistencia o temporizadores. Todos reciben datos, permiso calculado y callbacks mediante props.

## 6. Incidencias, estados y prioridades

No cambiaron datos, identificadores, orden recibido, títulos, descripciones, tipos, vehículo, reportante, ubicación, medios, fechas o fallbacks.

Los estados siguen siendo `open`, `in_progress` y `resolved`, con los mismos labels, tonos, orden, filtro y selector. Las severidades conservan `critical`, `high`, `medium` y fallback bajo, incluidos label, tono, icono y tratamiento `SOS` para críticas.

`getStatusMeta`, `getSeverityMeta` y `getTypeIcon` se trasladaron como helpers privados de Incidencias. No se unificaron con Documents porque pertenecen a contratos y semántica de dominio distintos.

## 7. Roles y permisos

El cálculo RBAC permanece en el contenedor: existe gestión únicamente cuando el usuario tiene rol `owner`, `admin` o `supervisor`. La visibilidad del aviso y de la acción para cambiar estado conserva las mismas condiciones. Los componentes reciben `canManage` y no consultan roles.

## 8. Store, API y actualización

No se modificaron `useAppStore`, `usePortalStore`, sus selectores ni acciones. No se modificaron API, endpoints, métodos HTTP, autenticación, backend o contratos.

`handleStatusChange` permanece en el contenedor y conserva:

- guard de `statusTarget`;
- parámetros `statusTarget.id` y estado seleccionado;
- cast a `open | in_progress | resolved`;
- espera de `updateIncidentStatus`;
- mensajes de éxito y error;
- cierre de confirmación únicamente cuando `result.ok`.

No existe refresh explícito adicional en la pantalla; no se inventó uno.

## 9. Filtros, selección y acciones

El filtro existente conserva sus cuatro opciones: todos, abierto, en proceso y resuelto. No se agregó búsqueda, reset separado, debounce, ordenamiento o paginación.

La selección sigue abriendo el detalle de la misma incidencia. Cerrar detalle limpia `detailTarget`. Cambiar estado mantiene la incidencia objetivo y copia su estado actual antes de abrir la confirmación. Cancelar sigue limpiando únicamente `statusTarget`.

## 10. Estilos y código histórico

El `StyleSheet.create` completo fue trasladado mecánicamente a `incidents.styles.ts` conservando claves y valores, incluidas claves históricas sin consumidor actual. No se cambiaron colores, tipografía, dimensiones, espaciados, bordes, iconos, textos o responsive.

El import histórico sin uso `portalButtonGradient` permanece en el contenedor y queda fuera de alcance. Retirarlo sería una limpieza independiente de esta modularización.

## 11. Métricas

| Métrica | Resultado |
|---|---:|
| Líneas originales del contenedor | 415 |
| Líneas finales del contenedor | 90 |
| Reducción del contenedor | 325 (78.3 %) |
| Archivos fuente nuevos | 7 |
| Archivos fuente modificados | 1 |
| Componentes extraídos | 4 |
| Módulos de estilos | 1 |
| Módulos de constantes | 1 |
| Módulos de utilidades | 1 |
| Módulos de tipos | 0 |
| Diff del contenedor | 26 inserciones, 351 eliminaciones |
| Reporte nuevo | 1 |
| Archivos totales afectados | 9 |

## 12. Validaciones

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Aprobado, sin errores |
| `npm run build` | Aprobado; 624 módulos transformados |
| `npm run test` | No ejecutado: el script `test` no está definido en `ventas/package.json` |
| `npm run lint` | No ejecutado: el script `lint` no está definido en `ventas/package.json` |
| `git diff --check` | Aprobado |
| Dependencias | Cero dependencias nuevas |
| Package y lockfile | Sin cambios |
| Pureza de utilidades | Sin stores, API, navegación, setters, timers o persistencia |

### Runtime

La ruta pública, el bundle y el guard de autenticación fueron verificados. La visualización y actualización autenticada de incidencias no pudieron validarse manualmente por falta de credenciales de prueba.

La apertura de `/portal/incidencias` cargó sin errores de importación o evaluación y redirigió a `/ventas/login`, cuya interfaz se renderizó. No se utilizaron credenciales reales ni datos simulados.

## 13. Matriz de compatibilidad

| Pregunta | Respuesta |
|---|---|
| ¿Cambió el export público o la ruta? | NO |
| ¿Cambió alguna incidencia? | NO |
| ¿Cambió algún estado o prioridad? | NO |
| ¿Se añadieron categorías o responsables? | NO |
| ¿Cambió algún permiso o RBAC? | NO |
| ¿Cambió el filtro o la selección? | NO |
| ¿Cambió alguna validación o payload? | NO |
| ¿Cambió algún endpoint? | NO |
| ¿Cambió el store o la API? | NO |
| ¿Cambió la navegación? | NO; no existía navegación local |
| ¿Cambió la UI o responsive? | NO |
| ¿Se agregaron dependencias? | NO |
| ¿Se modificó RC-PORTAL-08? | NO |
| ¿Typecheck aprobó? | SÍ |
| ¿Build aprobó? | SÍ |

## 14. Archivos incluidos

Modificado:

- `ventas/features/portal/screens/portal-incidents-screen.tsx`

Creados:

- `ventas/features/portal/incidents/components/portal-incidents-context-notice.tsx`
- `ventas/features/portal/incidents/components/portal-incidents-list.tsx`
- `ventas/features/portal/incidents/components/portal-incident-details.tsx`
- `ventas/features/portal/incidents/components/portal-incident-status-selector.tsx`
- `ventas/features/portal/incidents/incidents.constants.ts`
- `ventas/features/portal/incidents/incidents.styles.ts`
- `ventas/features/portal/incidents/incidents.utils.ts`
- `RC-PORTAL-09.md`

## 15. Rollback

```bash
git revert <HASH_RC_PORTAL_09>
```

El rollback se documenta y no se ejecuta durante esta RC.
