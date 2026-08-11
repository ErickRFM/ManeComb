# RC-UX-UI-SYSTEM-02 — Auditoría avanzada de jerarquía, densidad y coherencia

> Estado: AUDITORÍA BASE CERRADA / IMPLEMENTACIÓN EJECUTADA EN SUPERFICIES NO CONFLICTIVAS
>
> Rama: `ux/global-polish-clean-20260811`
>
> Base de implementación: `main@f30ad08fa34f876fde3702782a6cd7cef7f9d7b0`
>
> Evidencia de implementación: `RC-UX-UI-SYSTEM-03-IMPLEMENTATION.md`

## 1. Dictamen

ManeComb **no necesita un rediseño global**. Ya existe identidad, tokens, patrones, contratos operacionales y varias pasadas de limpieza. El salto de calidad de esta RC viene de:

- mejor jerarquía de información;
- menos repetición;
- menos superficie visual innecesaria;
- estados más cercanos a la acción;
- misma semántica entre Mobile, Portal y Admin Global;
- conservar la acción principal limpia y obvia;
- no agregar copy si no resuelve una duda real.

La regla aplicada fue **sustracción y reordenamiento antes de agregar**.

## 2. Base que se conserva

### Mobile

Se congela el sistema visual canónico existente:

- `DesignSystem` para tipografía, spacing, radios, controles, motion y breakpoints;
- `phone=640` y `compact=1080` como breakpoints compartidos;
- `AppShell`, `AppCard`, `StatusPill` y patrones comunes;
- normalización previa de títulos, sheets, handles y chips.

No se repitió una migración masiva de tokens.

### Modelo operacional

`OperationalUnitSnapshot` sigue siendo la autoridad compartida para el estado de las unidades. Mapa, Seguimiento, Control, Jornadas e Incidencias no reciben una nueva interpretación visual del estado.

### Ventas / Portal

Se conserva la limpieza previa de navegación, carga por ruta, lazy loading de Mapbox y separación entre Perfil, Plan, Pagos y Facturación.

La landing pública mantiene su identidad neón deliberada; no se obliga a usar exactamente la paleta sobria del Portal.

## 3. Hallazgos y resolución

### UX-P1-01 — Radio repetía contexto

**Hallazgo:** canal, participantes y salida aparecían arriba y volvían a aparecer en una fila inferior.

**Resolución:** aplicada.

- se eliminó la fila inferior redundante;
- título, miembros y audio route permanecen arriba;
- PTT y última transmisión ganan prioridad;
- prueba de contrato impide reintroducir `consoleMetaRow`.

**Autoridades protegidas:** floor control, captura, playback, Socket.IO, lifecycle, haptics y audio route.

### UX-P1-02 — No crear nuevas autoridades operacionales

**Resolución:** cumplida por diseño.

No se añadieron estados, KPIs o badges de jornada/GPS/ruta basados en cálculos locales nuevos. Las superficies operacionales sin un problema visual demostrado se dejaron intactas.

### UX-P2-01 — Admin Global forzaba copy secundario

**Hallazgo:** `AdminShell` exigía subtítulo y repetía `ADMIN GLOBAL` encima de cada título.

**Resolución:** aplicada.

- `subtitle` es opcional;
- se retiró el eyebrow repetitivo;
- se conservaron explicaciones útiles de las pantallas que sí las necesitan.

### UX-P2-02 — Admin Global duplicaba “módulos”

**Hallazgo:** sin órdenes comerciales, el cuarto KPI era `Módulos habilitados`, mientras una tarjeta inferior ya mostraba `Módulos disponibles`.

**Resolución:** aplicada.

El KPI duplicado desaparece y el grid se adapta a tres o cuatro métricas reales.

### UX-P2-03 — Navegación Admin demasiado descriptiva

**Hallazgo:** cada item mostraba label más hasta dos líneas explicativas aunque los destinos son inequívocos.

**Resolución:** aplicada.

- se conserva únicamente el label en el sidebar;
- ancho de sidebar: 280 → 260 px;
- item: 58 → 44 px mínimos;
- se mantiene accesibilidad y selección activa.

### UX-P2-04 — Metadata móvil sin consumidor

**Hallazgo:** algunas pantallas entregaban `mobileTitle`, `mobileSubtitle` o `mobileBadges` a `AppShell` al mismo tiempo que proporcionaban `header` propio. Por contrato del shell, ese metadata no se renderiza.

**Resolución parcial focalizada:** aplicada en las pantallas tocadas por esta RC:

- Alertas;
- Perfil;
- Documentos del conductor.

No se hizo búsqueda-reemplazo global sobre pantallas con trabajo paralelo.

### UX-P2-05 — Documentos mezclaba “reintentar” con actualización normal

**Resolución:** aplicada.

`Reintentar / actualizar` pasa a `Actualizar`. Los errores conservan feedback contextual propio.

### UX-P2-06 — Portal repetía breadcrumb en móvil

**Resolución:** aplicada.

`Portal > pantalla` se conserva en escritorio y deja de competir con el título en layout compacto.

### UX-P2-07 — Portal introducía acentos fuera de su paleta operativa

**Resolución:** aplicada con alcance limitado.

El CTA compartido del Portal conserva rojo/rosa y elimina la deriva violeta. Esto no modifica la landing pública de Ventas, cuya paleta neón sí es deliberada.

## 4. Superficies verificadas sin cambio

### Chat

El hallazgo histórico de `directoryHelperText` ya está resuelto en el código actual: se renderiza en el encabezado de Conversaciones. No se parcheó de nuevo.

### Mapa / Seguimiento / Control / Jornadas

No se detectó una razón suficiente para reordenar el estado sin volver a abrir el modelo de información. Se mantiene el contrato operacional compartido como autoridad.

### Calls

El pulido de llamadas de PR #165 ya forma parte de la base integrada. El feedback nativo restante está siendo trabajado por #170, por lo que esta RC no crea una segunda implementación.

### Directorio / Unidades

Protegido por #166 y #168. Esta RC no toca `users-screen.tsx` ni las acciones de lifecycle de unidades.

### Ventas / Checkout

La fase #169 está cerrando precondiciones, feedback y catches de acciones visibles. Esta RC no duplica esa implementación y sus archivos no se solapan con el listado de #169 observado durante la auditoría.

## 5. Regla de copy aplicada

Se conserva texto cuando:

1. identifica el objeto actual;
2. explica un estado no obvio;
3. evita una acción peligrosa;
4. indica qué hacer después de un error/empty state;
5. diferencia conceptos que podrían confundirse.

Se elimina o evita cuando:

- repite el título;
- repite un badge o dato;
- describe lo que ya muestra la UI;
- es marketing dentro de una consola operativa;
- usa nombres internos;
- promete una capacidad no respaldada por autoridad real.

## 6. Arquitectura visual resultante

No se impone un template rígido. La lectura común queda:

**Contexto → estado necesario → acción principal → información reciente/resultado → acciones secundarias.**

Ejemplos:

- Radio: canal/estado/salida → PTT → última transmisión → navegación.
- Mapa: mapa/contexto → estado de unidad → jornada/seguimiento → detalle bajo demanda.
- Chat: conversación → estado relevante → mensajes → composer.
- Portal: objetivo → acción primaria → datos accionables → detalle.
- Admin Global: alcance → estado/riesgo → acción autorizada → trazabilidad.

## 7. Validación y cierre

La implementación está documentada en `RC-UX-UI-SYSTEM-03-IMPLEMENTATION.md`.

Para fusionar:

- CI verde sobre el head final;
- System audit verde;
- Dependency audit verde;
- Portal production certification verde;
- reconsulta de `main` y PRs paralelos;
- validación física/manual declarada como pendiente cuando corresponda.

El resultado buscado sigue siendo **el mismo ManeComb, mejor ordenado**, no una colección nueva de tarjetas, badges o textos.
