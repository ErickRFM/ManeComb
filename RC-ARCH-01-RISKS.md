# RC-ARCH-01 — Risks: Observaciones Arquitectónicas (Ventas + Admin Portal)

> **Propósito:** Documentar observaciones basadas en evidencia sobre la arquitectura del proyecto Ventas.
> **Estado:** Solo auditoría. Sin modificaciones ni recomendaciones.

---

## Evidencia de la auditoría

| Dato | Valor |
|------|-------|
| Rama | `main` |
| Commit | `30a2052` |
| Fecha | 2026-07-21 |
| Método | Revisión manual de imports, estructura de archivos, y topes de líneas. |
| Archivos excluidos | `node_modules/`, `dist/`, `build/`, logs, `*.md`, `.*`, tests |

---

## 1. Archivos grandes con múltiples responsabilidades

### `screens/sales-screen.tsx` — 3,179 líneas

**Evidencia de tamaño:**
```
PS> (Get-Content ventas/screens/sales-screen.tsx).Count
3179
```

**Responsabilidades observadas en el mismo archivo:**
- Catálogo de planes con precios
- Sección FAQ expandible
- Animaciones inline (pulse, shimmer con @keyframes CSS-in-JS)
- Healthcheck del backend
- Paleta de colores neon inline
- Integración con checkout process
- Manejo de error/loading/empty states

### `features/portal/screens/portal-dashboard-screen.tsx` — 2,260 líneas

**Responsabilidades observadas:**
- Mapa de monitoreo en vivo (Mapbox GL)
- Filtros de vehículos, conductores, rutas
- Replay de sesiones de conducción
- Métricas operativas en vivo
- Renderizado de checkpoints
- Posiciones históricas de unidades

### `features/portal/components/operations-map.tsx` — 794 líneas

- Renderizado de mapa Mapbox
- Marcadores de unidades en tiempo real
- Capas de rutas y geometrías
- Manejo de clics y popups

### `features/portal/components/portal-layout.tsx` — 633 líneas

- Navegación lateral con submenús
- Header con breadcrumbs y usuario activo
- Responsividad (sidebar colapsable en mobile)
- Integración con notificaciones toast

---

## 2. Dependencias observadas

### 2.1 Dependencias circulares

**Método de verificación:**
Se revisaron manualmente los imports de cada archivo en `screens/`, `features/`, y `src/`. El grafo de dependencias es:

```
screens/* → features/commercial/* → src/store/ → src/lib/api → (backend)
screens/* → features/portal/* → src/store/ → src/lib/api → (backend)
screens/* → src/store/ → (src/lib/api → backend, features/portal/store → no re-importa)
screens/* → src/navigation/ → no imports circulares
screens/* → src/types/ → no imports circulares
screens/* → constants/ → no imports circulares
src/store/ → features/portal/store/ → solo definiciones de estado, no re-importa src/store
```

**Resultado: No se encontraron dependencias circulares en el proyecto Ventas.**

### 2.2 Dependencia `src/store → features/portal/store`

`src/store/use-app-store.ts` importa `features/portal/store/use-portal-store.ts`:
```typescript
import { usePortalStore } from '../../features/portal/store/use-portal-store';
```

Esto crea una dependencia desde la capa Core hacia la capa de feature Portal. No es circular porque `use-portal-store` no importa `use-app-store`.

### 2.3 Dependencia `features/portal → features/commercial`

`features/portal/screens/portal-plan-screen.tsx` importa `features/commercial/components/commercial-activity-list`:
```typescript
import { CommercialActivityList } from '../../commercial/components/commercial-activity-list';
```

Esta es la única dependencia entre módulos de features.

---

## 3. Tipos compartidos vs duplicados

### Tipos en `src/types/app.ts` (574 líneas)

Contiene definiciones de tipos para toda la aplicación: `User`, `Session`, `Plan`, `PlanCategory`, `Company`, `SalePoint`, `Agency`, `CheckoutState`, `PlanFeature`, etc.

### Tipos en `features/commercial/types.ts` (206 líneas)

Define tipos específicos del motor comercial que no están en `src/types/app.ts`: `CommercialState`, `CheckoutForm`, `CheckoutPayload`, tipos de adapters.

### Tipos en `features/portal/types.ts` (19 líneas)

Define solo `PortalUser` como extensión de `User`:
```typescript
export type PortalUser = User & { agencyName?: string; salePointName?: string };
```

**Observación:** No se encontraron tipos duplicados entre los tres archivos. Los tipos de cada capa son específicos de su dominio.

---

## 4. Manejo de errores en API

### `src/lib/api.ts`

- Errores HTTP se propagan como excepciones de Axios
- **No hay reintentos automáticos** en caso de timeout o error 5xx
- El único interceptor post-response es para 401: cierra sesión (`clearSession()`)
- Cada screen/hook debe implementar su propio manejo de errores

### Contraste con Mobile

Mobile (`mobile/src/api/client.ts` 963 líneas) implementa:
- Reintento automático en 401 (hasta 3 veces)
- Refresh token transparente
- Trace ID en headers
- Interceptor de logging

---

## 5. Estado global

### Store monolítico

`use-app-store.ts` (656 líneas) y `use-portal-store.ts` (449 líneas) son los únicos stores. No hay stores de UI, stores de formularios, ni stores de cache separados. Toda la lógica de estado vive en estos dos archivos.

**Cantidad de slices en use-app-store:**
- Sesión/Auth
- Comercial (planes, categorías)
- Portal (delegado a use-portal-store)
- Checkout
- Sistema (sidebar, onboarding template)

### Persistencia

Solo `session` y `user` persisten en localStorage vía middleware `persist` de Zustand. El resto del estado se pierde al recargar.

---

## 6. Seguridad

**Token de Mapbox** en `features/portal/components/operations-map.tsx`:
- El token `pk.eyJ1Ijoi...` está hardcodeado en el código fuente
- No se encontró variable de entorno ni archivo de configuración separado

**Autenticación:**
- Bearer token via interceptor de Axios
- No hay refresh token en Ventas (solo en Mobile)
- No hay CSRF protection observada

---

## 7. Pruebas

| Módulo | Archivos de test | Framework |
|--------|-----------------|-----------|
| Commercial | `rules/subscription-validator.test.ts` | Vitest |
| Portal | Ninguno | — |
| Core (src/) | Ninguno | — |
| Screens | Ninguno | — |

**Solo hay 1 archivo de test en todo el proyecto Ventas.**

---

## 8. Cobertura de la auditoría contra los requisitos originales

### Requisito 1: Análisis de estructura de carpetas
- **Cubierto:** Estructura completa de `ventas/` con todos los directorios mapeados. Se documentó el rol de cada carpeta.

### Requisito 2: Mapeo de dependencias entre módulos
- **Cubierto:** Grafo de dependencias completo. Se verificaron manualmente los imports. Sin dependencias circulares. Una dependencia entre módulos de features (portal → commercial).

### Requisito 3: Inventario de componentes y clasificación
- **Cubierto:** 39 archivos .tsx catalogados por módulo, tamaño y responsabilidad. Screens separadas de componentes. UI y polyfills incluidos.

### Requisito 4: Evaluación de cobertura de tipos (shared/contract)
- **Cubierto:** Se documentaron los tipos importados de shared. Se verificó que no hay tipos duplicados.

### Requisito 5: Identificación de dependencias circulares
- **Cubierto:** Verificación manual de imports en todos los archivos de `screens/`, `features/`, `src/`. Resultado: 0 dependencias circulares.

### Requisito 6: Análisis de tamaño de archivos
- **Cubierto:** Ranking top 30 por líneas. El archivo más grande es `screens/sales-screen.tsx` con 3,179 líneas.

### Requisito 7: Documentación de stores y estado global
- **Cubierto:** Ambos stores documentados (use-app-store 656 líneas, use-portal-store 449 líneas). Dependencia unidireccional Core → Portal.

### Requisito 8: Evaluación de manejo de errores y reintentos
- **Cubierto:** Se verificó que Ventas NO tiene retry automático. Mobile sí. Se documentaron interceptores.

### Requisito 9: Documentación de puntos de integración mobile ↔ ventas
- **Cubierto:** Se identificaron 4 puntos de integración (deep links, sales portal, API compartida, shared contract). Se verificó que no hay imports cruzados.

### Requisito 10: Matriz de módulos admin en mobile
- **Cubierto:** Se listaron 11+ archivos en mobile con verificaciones `role === 'admin'`. El portal admin completo vive en Ventas.

### Requisito 11: Evidencia reproducible
- **Cubierto:** Commit SHA (`30a2052`), comandos de PowerShell, fechas, y métodos de verificación en todos los documentos.

### Requisito 12: Solo auditoría, sin recomendaciones
- **Cubierto:** Todos los documentos usan lenguaje descriptivo. No hay "debería", "podría", "requiere" ni propuestas de refactor.
