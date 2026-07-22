# RC-PORTAL-03 — Modularización de portal-plan-screen.tsx

## Estado

Cerrado

## Commit de implementación

```
61c59eb
```

## Objetivo

Modularización estructural de `portal-plan-screen.tsx` (1,071 → 178 líneas, −83.4 %) extrayendo componentes presentacionales y estilos a `plan/`, conservando exactamente el comportamiento actual y sin cambiar datos, lógica, UI, store, API, navegación, planes, precios, trial, add-ons, cancelación ni reactivación.

## Archivos creados (4)

```
ventas/features/portal/plan/plan.styles.ts
ventas/features/portal/plan/components/plan-current-summary.tsx
ventas/features/portal/plan/components/plan-comparison-card.tsx
ventas/features/portal/plan/components/plan-change-preview.tsx
```

## Archivo modificado (1)

```
ventas/features/portal/screens/portal-plan-screen.tsx
```

**Total: 5 archivos afectados** (162 inserciones, 905 eliminaciones netas en screen).

## Componentes extraídos

| Componente | Responsabilidad |
|---|---|
| `PlanCurrentSummary` | Resumen del plan actual con métricas, barra de uso y botón de cancelación |
| `PlanFact` | Fact individual (label + value) dentro del resumen |
| `PlanComparisonCard` | Tarjeta de plan del listado con precio, beneficios, estado y botón comparar |
| `PlanChangePreview` | Vista previa completa del cambio con comparación, reglas, beneficios y acciones |
| `ComparisonPlan` | Plan individual dentro de la vista previa (actual/nuevo) |
| `ChangeFact` | Fact individual dentro de la cuadrícula de cambio |

## Foundation

| Archivo | Contenido |
|---|---|
| `plan.styles.ts` | Todos los estilos extraídos (StyleSheet.create completo, ~60 entradas) |

No se crearon `types`, `constants` ni `utils` porque el módulo `features/commercial` provee todos los tipos necesarios (`CommercialPlanView`, `CommercialChangeSummary`, `CommercialStatePresentation`) y no se requirieron funciones auxiliares adicionales.

## Compatibilidad

No cambiaron los siguientes aspectos respecto al estado previo a la modularización:

- Hook `useCommercialExperience` y todos sus datos/acciones
- Lógica de cancelación y reactivación
- Navegación (`router.push` a `/ventas/pago`, `/portal/pagos`, etc.)
- Store y estado (`cancelOpen`, `runPrimaryAction`)
- Diseño visual (colores, fuentes, espaciados, bordes, sombras)
- Textos visibles para el usuario
- Dependencias (`package.json` sin cambios)

## Métricas

| Métrica | Valor |
|---|---|
| Líneas originales (commit padre `7922118`) | 1,071 |
| Líneas finales en screen | 178 |
| Reducción absoluta | 893 |
| Reducción porcentual | 83.4 % |
| Archivos nuevos | 4 |
| Archivos afectados totales | 5 |

## Validaciones posteriores al rebase

| Validación | Resultado |
|---|---|
| `tsc --noEmit` (typecheck) | Sin errores |
| `vite build` (build) | Éxito (573 módulos transformados) |
| `npm run test` | No disponible — el script `test` no está definido en `package.json` |
| `git diff --check` | Sin errores de whitespace |
| `git status --short` | Árbol limpio |

## Rollback

```bash
git revert 61c59eb
```

No ejecutar a menos que sea necesario.
