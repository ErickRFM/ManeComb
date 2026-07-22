# RC-PORTAL-05 — Auditoría técnica, histórica y documental

**Estado:** Cerrado técnicamente — pendiente de auditoría documental

**Commit de implementación:** `ce1a500`

## Objetivo y alcance real

RC-PORTAL-05 realizó cinco cambios controlados:

1. División de Portal Cards y migración de consumidores.
2. Modularización interna de Portal Onboarding.
3. Extracción de estilos y helper de Portal Documents.
4. Eliminación de dos bloques JSX permanentemente inalcanzables en Routes.
5. Estabilización de `toggleVersionExpanded` mediante `useCallback` en App Mobile.

No fue una RC exclusiva de Onboarding y esta auditoría no repitió ninguna extracción.

## Historial verificado

La implementación completa está contenida en un único commit:

| Commit | Responsabilidad |
|---|---|
| `ce1a500` | Modularización de Cards, Onboarding y Documents; eliminación de JSX muerto en Routes; estabilización del callback de App Mobile; creación del reporte inicial |
| `<HASH_DOCUMENTAL>` | Auditoría documental; se registra externamente después del commit |

El commit afecta 36 rutas:

- 17 agregadas.
- 18 modificadas.
- 1 eliminada.
- 1,263 inserciones y 1,407 eliminaciones según `git show --stat`.

No se detectaron otros commits de implementación de RC-PORTAL-05.

## Alcance por estado Git

### Agregados

- `RC-PORTAL-05.md`.
- 7 archivos en `ventas/features/portal/cards/`.
- 7 archivos en `ventas/features/portal/onboarding/`.
- 2 archivos en `ventas/features/portal/documents/`.

### Eliminado

- `ventas/features/portal/components/portal-cards.tsx`.

### Modificados

- 17 consumidores existentes de Portal Cards actualizaron su import.
- `portal-onboarding-screen.tsx`.
- `portal-documents-screen.tsx`.
- `portal-routes-screen.tsx`.
- `portal-app-movil-screen.tsx`.

Algunos archivos cumplen más de una categoría funcional; por eso esta lista descriptiva no debe sumarse como rutas únicas.

Las modificaciones dentro de `dashboard/` y `plan/components/plan-change-preview.tsx` fueron actualizaciones mecánicas de consumidores de Portal Cards. No se modificaron su lógica ni sus contratos.

No se tocaron `mobile/`, backend, shared, communication-service, Commercial, store, API, dependencias, `package.json`, lockfiles, `RC-PORTAL-04.md` ni `RC-PORTAL-06.md`.

## 1. Portal Cards

### Archivos finales (7)

```text
cards/
├── index.ts
├── portal-section-card.tsx
├── account-summary-card.tsx
├── activation-timeline.tsx
├── invoice-list.tsx
├── format-portal-status.ts
└── get-portal-status-tone.ts
```

El archivo anterior `components/portal-cards.tsx` tenía 343 líneas físicas en el padre de `ce1a500` y ya no está rastreado.

### Compatibilidad del barrel

| Export anterior | Export actual | Estado |
|---|---|---|
| `PortalSectionCard` | `PortalSectionCard` | Conservado |
| `AccountSummaryCard` | `AccountSummaryCard` | Conservado |
| `ActivationTimeline` | `ActivationTimeline` | Conservado |
| `InvoiceList` | `InvoiceList` | Conservado |
| `formatPortalStatus` | `formatPortalStatus` | Conservado |
| `getPortalStatusTone` | `getPortalStatusTone` | Conservado |

`getStatusTone`, que antes era helper privado del monolito, también quedó exportado por el barrel. Es una ampliación aditiva de la superficie pública; no elimina ni renombra ningún export anterior.

### Consumidores

- 17 consumidores existentes migraron desde `components/portal-cards` al barrel `cards`.
- Existen 20 consumidores actuales: los 17 migrados y 3 archivos nuevos de Onboarding.
- No queda ningún import a `portal-cards`.
- No hay imports directos innecesarios a archivos internos.
- Todos los consumidores están dentro de `ventas/features/portal`.

Consumidores actuales:

| Área | Archivos | Import actual |
|---|---:|---|
| Screens | 11 | `../cards` |
| Dashboard | 5 | `../cards` o `../../cards` |
| Plan | 1 | `../../cards` |
| Onboarding | 3 | `../cards` o `../../cards` |
| **Total** | **20** | Barrel `cards/index.ts` |

Los componentes y helpers conservan props, valores por defecto, JSX, textos, estilos, callbacks, estados vacíos, tonos, iconos y orden. `formatPortalStatus` y `getStatusTone` son helpers deterministas sin acceso a infraestructura.

La búsqueda de stores, API, router, persistencia y timers en `cards/` produjo cero coincidencias.

## 2. Portal Onboarding

### Métricas reales

| Archivo | Original | Actual | Reducción del contenedor |
|---|---:|---:|---:|
| `portal-onboarding-screen.tsx` | 971 | 280 | 691 líneas (71.2 %) |

El reporte inicial indicaba 197 líneas finales; el conteo real es 280. La reducción corresponde al contenedor: el código fue distribuido entre componentes, estilos y helpers privados, no eliminado en su totalidad.

### Archivos extraídos (7)

```text
onboarding/
├── onboarding.styles.ts
├── onboarding.utils.ts
└── components/
    ├── activation-wizard-step.tsx
    ├── activation-metric.tsx
    ├── activation-keys-summary.tsx
    ├── key-action-button.tsx
    └── activation-key-row.tsx
```

### Responsabilidades

`PortalOnboardingScreen` conserva store, datos de onboarding, activaciones, loading, error, estado derivado, progreso, callbacks, acciones, navegación, validaciones y composición del JSX.

Los cinco componentes extraídos no importan store, API, router, navegación o persistencia. Reciben datos y acciones mediante props.

### Helpers

| Helper | Consumidor | Clasificación |
|---|---|---|
| `getStepIcon` | `ActivationWizardStep` | Puro |
| `getStepTarget` | `PortalOnboardingScreen` | Puro |
| `formatActivationKeyStatus` | `ActivationKeyRow` | Puro; delega fallback a `formatPortalStatus` |
| `getActivationKeyTone` | `ActivationKeyRow` | Puro |

No existen copias activas de estos helpers en la pantalla. Se conservaron firmas, parámetros, retornos, fallbacks y consumidores.

La comparación no encontró cambios en número u orden de pasos, objetivos, progreso, navegación, acciones de activación, loading, errores, mensajes, permisos, botones o textos.

## 3. Portal Documents

### Métricas reales

| Archivo | Original | Actual | Reducción del contenedor |
|---|---:|---:|---:|
| `portal-documents-screen.tsx` | 342 | 188 | 154 líneas (45.0 %) |

El reporte inicial indicaba 157 líneas finales; el conteo real es 188. La diferencia representa código trasladado a módulos privados.

### Archivos extraídos (2)

- `documents.styles.ts`.
- `documents.utils.ts`.

`getStatusMeta` conserva sus parámetros, labels, tonos y fallback:

- `approved` o `active`: Aprobado/positive.
- `rejected`: Rechazado/danger.
- Otro valor: Pendiente/warning.

Existe un helper homónimo en Incidents, pero pertenece a otro dominio y no es duplicación activa dentro de Documents. El helper de Documents tiene un único origen y tres usos en su pantalla.

Store, carga, filtros, lista, revisión, aprobación, rechazo, payloads, endpoints, permisos, loading, errores y mensajes permanecen en `PortalDocumentsScreen`. `documents/` no accede a store, API, router o persistencia.

## 4. Portal Routes

El diff de `ce1a500` confirma la eliminación literal de:

```tsx
{false && canManageRoutes ? (...) : null}
```

y:

```tsx
{false && sortedVehicles.length ? <PortalSectionCard ... /> : null}
```

Los dos bloques sumaban aproximadamente 179 líneas: alrededor de 119 y 60, respectivamente. Eran JSX inalcanzable porque la primera expresión evaluada era el literal `false`.

No contenían hooks ni expresiones ejecutadas antes del `false &&`. Sus callbacks, llamadas y render de componentes estaban dentro de la rama inalcanzable. La eliminación no produjo comportamiento runtime.

`canManageRoutes` continúa activo en otras condiciones del editor y no quedó huérfano. TypeScript y build no detectan imports o referencias rotas. El historial muestra que el patrón existía antes de RC-PORTAL-05 y fue retirado por `ce1a500`; no se encontró un feature flag dinámico equivalente.

Este fue un cambio cruzado controlado sobre un archivo previamente tratado por RC-PORTAL-02. No se restauró ni se volvió a modificar durante la auditoría.

## 5. App Mobile

`toggleVersionExpanded` quedó como:

```tsx
const toggleVersionExpanded = useCallback((version: string) => {
  setExpandedVersions((prev) => {
    const next = new Set(prev);
    if (next.has(version)) next.delete(version);
    else next.add(version);
    return next;
  });
}, []);
```

El callback captura únicamente el setter estable de React y utiliza actualización funcional. No captura props, estado externo, valores derivados, store ni callbacks variables; por tanto, `[]` no introduce stale closure.

Su consumidor es `AppMobileVersionTimeline` mediante `onToggleVersion`. Conserva una referencia estable, pero no se afirma una mejora de rendimiento no medida. No cambió estado inicial, expansión, colapso, props, UI, textos ni orden inválido de hooks.

Este cambio cruzado sobre RC-PORTAL-04 se documenta solo aquí. `RC-PORTAL-04.md` no fue modificado por `ce1a500` ni por esta auditoría.

## Dependencias y ciclos

- No se agregaron dependencias ni cambiaron package o lockfiles.
- `cards/index.ts` depende únicamente de archivos internos de Cards.
- Screens y componentes consumen el barrel; Cards no importa screens.
- Componentes de Onboarding no importan su screen.
- Documents no importa su screen.
- No se detectaron ciclos entre los módulos extraídos.

## Validaciones

| Validación | Resultado |
|---|---|
| `npm run typecheck` | Aprobado, 0 errores |
| `npm run build` | Aprobado, 606 módulos transformados |
| `npm run test` | No disponible: no existe script `test` en `ventas/package.json` |
| `npm run lint` | No disponible: no existe script `lint` en `ventas/package.json` |
| `git diff --check` antes de editar el reporte | Aprobado |
| Estado Git previo | Limpio, sin operaciones en curso |

`git show --check ce1a500` detecta un espacio final en `cards/invoice-list.tsx:18`. Es un detalle histórico no funcional del commit, no un fallo actual de TypeScript o build. No se modificó código para corregirlo.

## Código trasladado frente a eliminado

Onboarding y Documents redujeron sus contenedores al distribuir JSX, estilos y helpers entre módulos privados. Esa reducción no equivale a código eliminado del módulo.

En Routes sí hubo eliminación real de aproximadamente 179 líneas de JSX inalcanzable.

Portal Cards fue redistribuido desde un archivo de 343 líneas hacia siete archivos especializados, conservando la API utilizada.

## Matriz de compatibilidad

| Pregunta | Respuesta |
|---|---|
| ¿Cambió la API utilizada de Portal Cards? | NO |
| ¿Quedaron imports antiguos? | NO |
| ¿Los consumidores fueron actualizados? | SÍ |
| ¿Cambió el flujo o algún paso de Onboarding? | NO |
| ¿Cambió alguna activación? | NO |
| ¿Cambió Documents? | Solo su estructura interna |
| ¿Cambió algún payload, endpoint, store o API? | NO |
| ¿Cambió la navegación o RBAC? | NO |
| ¿Cambió la UI o sus textos? | NO |
| ¿Los bloques de Routes eran inalcanzables? | SÍ, por `false &&` literal |
| ¿`useCallback([])` es seguro? | SÍ, usa setter y actualización funcional |
| ¿Se modificó `mobile/`? | NO |
| ¿Se agregaron dependencias? | NO |
| ¿Typecheck y build aprobaron? | SÍ |

## Hallazgos para futuras RC

- No existen pruebas automatizadas ni script de lint en el paquete Ventas.
- `onboarding.styles.ts` es un archivo grande; dividirlo sería una RC separada, no parte de esta auditoría.
- Algunos componentes de Onboarding tienen contratos amplios de props; cualquier simplificación requiere una RC independiente.
- `getStatusMeta` también existe en Incidents con semántica propia; no debe unificarse sin analizar ambos dominios.
- El commit de implementación contiene un espacio final histórico en `invoice-list.tsx`.

## Rollback futuro

No ejecutar durante esta auditoría. Al existir implementación y documentación separadas, el orden futuro es:

```bash
git revert <HASH_DOCUMENTAL>
git revert ce1a500
```

El hash documental se obtiene después de crear el commit y se registra externamente; no puede incluirse dentro del mismo commit que identifica.
