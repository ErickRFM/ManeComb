# RC-PORTAL-08 — Modularización de Gestión de Unidades

> **Estado:** Cerrado técnicamente — pendiente de commit
>
> **Rama:** `main`
>
> **Commit base:** `6f8796a`
>
> **Estado Git inicial:** árbol limpio, sin revert, rebase, merge ni cherry-pick en curso.

## 1. Objetivo y resultado

Se modularizó estructuralmente `ventas/features/portal/screens/portal-units-screen.tsx` sin rehacer la gestión de unidades. `PortalUnitsScreen` continúa siendo el único contenedor y conserva store, sesión, RBAC, estado, efecto, memo, validaciones, construcción de payloads, llamadas operativas, navegación y confirmación de eliminación.

El contenedor pasó de **597 a 196 líneas físicas**, una reducción de **401 líneas (67.2 %)**. Esta reducción representa traslado estructural; no significa que se haya eliminado funcionalidad o código total del módulo.

## 2. Estado inicial e inventario real

| Elemento | Implementación verificada |
|---|---|
| Export público | `PortalUnitsScreen` |
| Consumidores | Carga diferida en `ventas/src/App.tsx`, dentro de `ScreenErrorBoundary` |
| Ruta | Caso de Portal para Unidades; sin cambio de registro |
| Props públicas | Ninguna |
| Store | `useAppStore` con selector superficial |
| Acciones | `createVehicle`, `deleteVehicle`, `loadVehicles`, `updateVehicle` |
| Datos | `user`, `vehicles`, `isSubmitting` |
| RBAC | `canManageUnits`: roles `owner` o `admin` |
| Navegación | `router.push('/portal/rutas')` desde dos acciones |
| API directa | Ninguna; la operación continúa delegada al store |
| Modal | Un `ConfirmModal` destructivo para eliminación |

La pantalla real no tenía búsqueda, filtros, paginación, asignación o desasignación de conductores, activación/desactivación, reintento ni panel de detalle. Esas capacidades no se inventaron ni se atribuyen a esta RC.

### Estado local original y final

El orden se conserva:

1. `editor`, inicializado con `createBlankEditor`.
2. `editingId`.
3. `statusTouched`.
4. `showCreationBanner`.
5. `message`.
6. `deleteTarget`.

### Hooks y datos derivados

El orden de hooks permanece: `useAppStore`, seis `useState`, un `useEffect` y un `useMemo`.

- `useEffect`: ejecuta `loadVehicles`; dependencias `[loadVehicles]`.
- `useMemo`: crea `sortedVehicles` ordenando una copia por `code`; dependencias `[vehicles]`.
- No existían `useCallback`, `useRef`, `useWindowDimensions` ni hooks responsive locales.

### Acciones conservadas en el contenedor

- `setField` actualiza campos controlados.
- `resetEditor` limpia edición, estado tocado y formulario.
- `startEdit` carga código, placas, kilometraje y estado.
- `saveUnit` conserva guards, normalización, validaciones, payload y selección entre creación/edición.
- La confirmación de eliminación conserva restricciones por conductor/ruta, mensajes y llamada a `deleteVehicle`.

## 3. Arquitectura anterior

El archivo original concentraba:

- conexión y selección del store;
- RBAC;
- estado y ciclo de carga;
- ordenamiento;
- formulario controlado;
- validación y construcción de `VehicleMutationPayload`;
- creación y edición;
- banner de continuidad hacia Rutas;
- listado, estado visual, conductor, ruta, actividad y mantenimiento;
- acciones de edición/eliminación;
- confirmación destructiva;
- helpers visuales, constante de mantenimiento, tipo privado y StyleSheet.

## 4. Arquitectura final

```text
PortalUnitsScreen
└── units/
    ├── components/
    │   ├── portal-unit-form.tsx
    │   ├── portal-units-continuity-banner.tsx
    │   └── portal-units-list.tsx
    ├── units.constants.ts
    ├── units.styles.ts
    ├── units.types.ts
    └── units.utils.ts
```

### Componentes extraídos

| Componente | Responsabilidad | Props principales | Estado propio | Hooks | Consumidor |
|---|---|---|---|---|---|
| `PortalUnitForm` | Formulario visual, selector visual de estado y botones | editor, editingId, loading, message y callbacks | Ninguno | Ninguno | `PortalUnitsScreen` |
| `PortalUnitsContinuityBanner` | Banner posterior a creación y acción hacia Rutas | `onAssignRoute` | Ninguno | Ninguno | `PortalUnitsScreen` |
| `PortalUnitsList` | Card, filas, estado vacío, metadatos, mantenimiento y acciones visuales | vehicles, permiso y callbacks | Ninguno | Ninguno | `PortalUnitsScreen` |

Los componentes no importan store, API, clientes HTTP, sesión, router, persistencia o temporizadores. Reciben datos, permisos calculados y acciones mediante props.

## 5. Unidades, estados y asignaciones

No cambiaron los datos de unidades o vehículos, el orden alfabético, el conductor mostrado, la ruta asignada, la última actividad, el kilometraje ni los indicadores de mantenimiento. `getUnitStatus`, `getKilometersLabel` y `getMaintenanceInfo` se trasladaron mecánicamente como utilidades puras.

La pantalla únicamente muestra la asignación existente; no implementaba asignación o desasignación de conductores. No se añadió ese flujo.

Los estados editables siguen siendo `available` y `maintenance`; sus valores, labels, colores, selección y condición `statusTouched` no cambiaron.

## 6. Roles y permisos

RBAC permanece en el contenedor. `canManageUnits` se calcula exactamente con usuario presente y rol `owner` o `admin`. El formulario, banner y acciones administrativas conservan la misma visibilidad. Los componentes reciben el permiso ya calculado y no conocen roles.

## 7. Store, API y navegación

No se modificó `useAppStore`, sus selectores o acciones. No se modificaron API, contratos, endpoints, métodos HTTP, autenticación ni backend. Los mismos métodos reciben los mismos argumentos.

La navegación a `/portal/rutas` permanece en el contenedor y llega a los bloques visuales mediante callbacks. No se crearon rutas ni wrappers públicos.

## 8. Formularios, validaciones y acciones

Se conservaron:

- campos `code`, `plate`, `currentKilometers` y `status`;
- placeholders, capitalización y filtrado visual del kilometraje;
- trim de nombre y placas, uppercase de placas y conversión numérica;
- obligatoriedad y límites de 50/20 caracteres;
- expresiones regulares originales;
- kilometraje finito, no negativo y máximo `9999999`;
- inclusión condicional de `status` al crear o cuando fue tocado al editar;
- mensajes, loading, reset y banner posterior a creación;
- restricciones y textos de eliminación.

El payload continúa siendo `VehicleMutationPayload` con `code`, `plate`, `currentKilometers` y el mismo `statusPayload` condicional. No existe endpoint directo en la pantalla.

## 9. Búsqueda, filtros y ordenamiento

No existían búsqueda, filtros, reset de filtros o paginación. El único ordenamiento existente se conserva en el contenedor: copia de `vehicles`, comparación por `code` y `localeCompare`.

## 10. Estilos y código sin referencias

El `StyleSheet.create` completo fue trasladado a `units.styles.ts` manteniendo todos sus valores, incluidas claves históricas sin consumidor actual. No se rediseñaron inputs, segmentos, filas, banners, badges, botones ni responsive.

El import histórico sin uso `portalButtonGradient` permanece en el contenedor para no introducir una limpieza ajena a la modularización. Las claves de estilo históricas sin referencias también se conservaron y solo se trasladaron.

## 11. Métricas

| Métrica | Resultado |
|---|---:|
| Líneas originales del contenedor | 597 |
| Líneas finales del contenedor | 196 |
| Reducción del contenedor | 401 (67.2 %) |
| Archivos fuente nuevos | 7 |
| Archivos fuente modificados | 1 |
| Componentes extraídos | 3 |
| Módulos de estilos | 1 |
| Módulos de tipos | 1 |
| Módulos de constantes | 1 |
| Módulos de utilidades | 1 |
| Diff del contenedor | 29 inserciones, 430 eliminaciones |
| Reportes nuevos | 1 |
| Archivos previstos en el commit | 9 |

## 12. Validaciones

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Aprobado, sin errores |
| `npm run build` | Aprobado; 617 módulos transformados |
| `npm run test` | No ejecutado: el script `test` no está definido en `ventas/package.json` |
| `npm run lint` | No ejecutado: el script `lint` no está definido en `ventas/package.json` |
| `git diff --check` | Aprobado |
| Dependencias | Cero dependencias nuevas |
| Package y lockfile | Sin cambios |
| Pureza de utilidades/componentes | Sin acceso funcional a store, API, router, persistencia o timers |

### Runtime

La ruta pública, el bundle y el guard de autenticación fueron verificados. La gestión autenticada de unidades, creación, edición, asignación y eliminación no pudo validarse manualmente por falta de credenciales de prueba.

La navegación pública a `/portal/unidades` cargó sin errores de importación o evaluación y redirigió a `/ventas/login`, cuya interfaz se renderizó correctamente. No se utilizaron credenciales reales ni datos simulados.

## 13. Matriz de compatibilidad

| Pregunta | Respuesta |
|---|---|
| ¿Cambió el export público o la ruta? | NO |
| ¿Cambió alguna unidad o vehículo? | NO |
| ¿Cambió algún conductor o asignación? | NO |
| ¿Cambió algún estado? | NO |
| ¿Cambió algún permiso o RBAC? | NO |
| ¿Cambió algún campo o validación? | NO |
| ¿Cambió el ordenamiento? | NO |
| ¿Se añadieron filtros o búsqueda? | NO |
| ¿Cambió algún payload o endpoint? | NO |
| ¿Cambió el store o la API? | NO |
| ¿Cambió la navegación? | NO |
| ¿Cambió la UI o responsive? | NO |
| ¿Se agregaron dependencias? | NO |
| ¿Se modificó RC-PORTAL-07? | NO |
| ¿Typecheck aprobó? | SÍ |
| ¿Build aprobó? | SÍ |

## 14. Archivos incluidos

Modificado:

- `ventas/features/portal/screens/portal-units-screen.tsx`

Creados:

- `ventas/features/portal/units/components/portal-unit-form.tsx`
- `ventas/features/portal/units/components/portal-units-continuity-banner.tsx`
- `ventas/features/portal/units/components/portal-units-list.tsx`
- `ventas/features/portal/units/units.constants.ts`
- `ventas/features/portal/units/units.styles.ts`
- `ventas/features/portal/units/units.types.ts`
- `ventas/features/portal/units/units.utils.ts`
- `RC-PORTAL-08.md`

## 15. Rollback

Después del commit, el rollback completo será:

```bash
git revert <HASH_RC_PORTAL_08>
```

No se ejecutó el rollback.
