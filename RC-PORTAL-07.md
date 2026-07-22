# RC-PORTAL-07 — Modularización de Gestión de Usuarios

> **Estado:** Cerrado técnicamente — pendiente de commit
>
> **Base de la RC:** `9e883b0`
>
> **Alcance:** modularización presentacional de `ventas/features/portal/screens/portal-users-screen.tsx` sin cambios funcionales.

## 1. Objetivo y resultado

Se redujo la responsabilidad visual de `PortalUsersScreen` mediante cuatro componentes presentacionales y un módulo de estilos. La pantalla continúa siendo el único contenedor: conserva acceso al store, estado local, efectos, memos, callbacks, reglas RBAC, navegación y confirmaciones.

La pantalla pasó de **452 a 147 líneas físicas**, una reducción de **305 líneas (67.5 %)**. No se modificaron contratos, datos, endpoints, persistencia, navegación ni reglas de negocio.

## 2. Estado inicial verificado

| Aspecto | Evidencia inicial |
|---|---|
| Rama | `main` |
| Commit base | `9e883b0` |
| Árbol de trabajo | Limpio |
| Archivo original | 452 líneas físicas |
| Export público | `PortalUsersScreen` |
| Consumidor | Carga diferida desde `ventas/src/App.tsx` |
| Acceso | Propietario o administrador mediante `canManageUsers` |
| Navegación | Apertura de `/portal/onboarding` |

El contenedor seleccionaba desde `useAppStore`: `deleteUser`, `isSubmitting`, `loadUsers`, `loadVehicles`, `updateUser`, `user`, `users` y `vehicles`.

## 3. Comportamiento preservado

Se mantuvieron en `PortalUsersScreen`, en el mismo flujo funcional:

- estados `deleteTarget`, `message`, `editTarget` y `editStatus`;
- efecto de carga de usuarios y vehículos, con dependencias `loadUsers` y `loadVehicles`;
- memos `administrativeUsers`, `driverUsers` y `availableVehicles`;
- callbacks `assignVehicleToDriver`, `confirmDelete` y `confirmEdit`;
- payloads y llamadas a `updateUser` y `deleteUser`;
- control RBAC para propietario/administrador;
- navegación al onboarding;
- ambos `ConfirmModal` y su estado de envío;
- textos, estados vacíos, badges, selectores, botones y estilos visibles.

La pantalla no incluía búsqueda, filtrado, paginación, creación ni invitación por API; por tanto, no se atribuye a esta RC ninguna preservación o extracción inexistente.

## 4. Arquitectura final

| Archivo | Responsabilidad | Acceso a negocio |
|---|---|---|
| `portal-users-screen.tsx` | Contenedor, store, estado, efectos, memos, callbacks, RBAC, navegación y modales | Sí; permanece como propietario |
| `users/components/portal-users-context-notice.tsx` | Aviso visual sobre activación de claves | No; recibe `onOpenActivation` |
| `users/components/portal-driver-assignments.tsx` | Presentación de conductores y asignación visual de unidad | No; recibe datos y `onAssign` |
| `users/components/portal-administrative-users.tsx` | Lista visual de usuarios administrativos y acciones | No; recibe `onEdit` y `onDelete` |
| `users/components/portal-user-status-selector.tsx` | Selector presentacional de estado | No; recibe `value` y `onChange` |
| `users/users.styles.ts` | `StyleSheet` trasladado mecánicamente | Ninguno |

Los componentes extraídos no importan store, API, router, persistencia ni temporizadores. No se crearon helpers, constantes o tipos de dominio adicionales.

## 5. Reutilización y estilos

Se conservaron los componentes compartidos existentes: `PortalSectionCard`, `PortalDataList`, `PortalDataRow`, `PortalButton`, `EmptyState`, `StatusBadge` y `ConfirmModal`.

El `StyleSheet.create` fue movido al módulo `users.styles.ts` manteniendo sus claves y valores. La RC no rediseña la pantalla, no introduce una nueva paleta y no intenta limpiar elementos preexistentes ajenos a la modularización.

## 6. Métricas

| Métrica | Antes | Después |
|---|---:|---:|
| Líneas de `portal-users-screen.tsx` | 452 | 147 |
| Reducción del contenedor | — | 305 líneas (67.5 %) |
| Componentes presentacionales extraídos | 0 | 4 |
| Módulos de estilos extraídos | 0 | 1 |
| Archivos nuevos | 0 | 5 |
| Archivos fuente modificados | — | 1 |

## 7. Validaciones

| Verificación | Resultado |
|---|---|
| `npm run typecheck` en `ventas` | Correcto, sin errores |
| `npm run build` en `ventas` | Correcto; 611 módulos transformados |
| `npm run test` | No disponible: no existe script `test` |
| `npm run lint` | No disponible: no existe script `lint` |
| `git diff --check` | Correcto |
| Pureza de componentes extraídos | Sin imports de store, API, router, persistencia ni temporizadores |

### Verificación de runtime

Se inició el frontend y se abrió `/portal/usuarios` en navegador. El bundle cargó sin error de evaluación o de módulo y la protección de acceso redirigió correctamente a `/ventas/login`, cuya interfaz se renderizó. La validación autenticada de la lista y sus acciones no se pudo completar sin credenciales de prueba; no se usaron credenciales reales ni datos simulados. Esta limitación se registra explícitamente y no se presenta como validación funcional completa.

## 8. Matriz de compatibilidad

| Área | ¿Cambió? |
|---|---|
| Contratos y tipos de dominio | No |
| Datos, endpoints o payloads | No |
| Store y persistencia | No |
| RBAC | No |
| Selección y asignación de unidades | No |
| Edición de estado y eliminación | No |
| Navegación | No |
| Textos y estados vacíos | No |
| Apariencia y estilos | No; traslado estructural |

## 9. Archivos de la RC

Modificado:

- `ventas/features/portal/screens/portal-users-screen.tsx`

Creados:

- `ventas/features/portal/users/users.styles.ts`
- `ventas/features/portal/users/components/portal-users-context-notice.tsx`
- `ventas/features/portal/users/components/portal-driver-assignments.tsx`
- `ventas/features/portal/users/components/portal-administrative-users.tsx`
- `ventas/features/portal/users/components/portal-user-status-selector.tsx`
- `RC-PORTAL-07.md`

## 10. Rollback

Después de crear el commit de esta RC, el rollback completo será:

```bash
git revert <HASH_RC_PORTAL_07>
```

El comando se documenta únicamente; no debe ejecutarse durante el cierre.
