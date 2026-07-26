# RC-MOBILE-EMPTYSTATE-DESIGN-01 — Propuesta canónica de estado vacío + veredicto

> **Tipo:** propuesta de diseño y decisión (no inventario). Cierra el hilo del estado vacío abierto en RC-08/09/10.
>
> **No se escribió código ni componente.** Los valores vienen de los inventarios ya cerrados; no se reabre inventario.

## 0. Veredicto (arriba, porque es lo que pediste decidir)

**Recomiendo archivar la unificación completa. No vale el rediseño.** De las 5 cajas de estado vacío, 2 (checklist, AlertState) convergen barato y 3 (users, radio, chat) **perderían un tratamiento propio y más pulido** a cambio de uniformidad, en un componente que se ve poco (estados vacíos) y dedup ~10 líneas. El único sub-win limpio —checklist + AlertState— es marginal (2 consumidores, y AlertState arrastra su lógica de carga). Mi juicio de diseño: los tratamientos actuales por pantalla son **mejores** que una caja uniforme forzada.

Abajo tienes la propuesta canónica concreta y el diff por pantalla **para que decidas con todo a la vista**; si quieres el win barato pese a mi recomendación, la única opción sensata es checklist+AlertState (§4), no las cinco.

## 1. Propuesta canónica (una sola opción, sin menú)

Si se unificara, este sería el aspecto objetivo — una **caja punteada** (es el tratamiento más "de diseño" de estado vacío, y el que ya usan 2 de las 5):

| Propiedad | Valor canónico | Origen de la elección |
|---|---|---|
| Layout | columna, `alignItems`/`justifyContent: center` | ya común a las 5 |
| Borde | 1px **punteado**, `theme.colors.line` | checklist + AlertState |
| Fondo | **ninguno** (transparente) | 4 de 5 (solo users tiene fondo) |
| Radio | `AppTheme.radius.sm` = **16** | token limpio entre checklist(18) y AlertState(14) |
| minHeight | **160** | AlertState (checklist 170 casi igual) |
| gap | **8** | mayoría (3 de 5) |
| padding | **18** | AlertState |
| Icono | **desnudo**, size **28**, `theme.colors.muted` | mayoría (chat/checklist 28) |
| Título | `display` **16 / 900**, center | AlertState (checklist 17/900 casi igual) |
| Subtítulo (opcional) | `body` 13, muted, center, maxWidth 360 | AlertState `stateBody` |

Estructura: `caja punteada > icono 28 desnudo > título 16/900 > [subtítulo opcional]`.

## 2. Qué pantallas cambian (5) y cómo se ven después

| Pantalla | Cambia | Magnitud |
|---|---|---|
| checklist | radio 18→16, minHeight 170→160, padding 22→18, título 17→16 | **pequeña** |
| AlertState | radio 14→16, icono 27→28 (logica carga/vacío se conserva envolviendo la caja) | **mínima** |
| users | solido→**punteado**, **pierde fondo** surfaceAlt, radio 20→16, gap 10→8, padding 16→18, icono 26→28, y su texto (frase muted `sectionSubtitle`) tendría que volverse título 16/900 **o** ir al slot subtítulo | **grande** |
| radio | gana caja punteada, **pierde su icon-shell 64×64**, icono→28 desnudo, gap 12→8, título 18→16 | **grande** |
| chat `emptyState` | gana caja punteada, título 20→16, padding V32→18 | **media** |

(Se quedan fuera por rol distinto, no cambian: chat `emptyStateCard` = fila horizontal con copy al lado; BottomTrackingPanel = pista inline minHeight 36.)

## 3. Diff visual por pantalla — qué gana / qué pierde

- **checklist** ("Sin registros"): **gana** consistencia; **pierde** nada relevante (caja un pelín más compacta, título −1px). Neto: aceptable.
- **AlertState** ("Cargando"/"Sin alertas"): **gana** dedup y consistencia; **pierde** nada (radio +2, icono +1). Su lógica carga/vacío se preserva: la caja compartida envuelve ambas ramas. Neto: el mejor candidato.
- **users** ("No hay personal operativo disponible"): **gana** consistencia; **pierde** su look de **tarjeta rellena** (fondo + borde sólido) que la distingue como celda del directorio, y —peor— su contenido es una **frase descriptiva**, no un título corto: forzarla al título 16/900 la vuelve un encabezado en negrita semánticamente raro, o exige **añadir un título** (cambio de texto, prohibido). Neto: **regresión**.
- **radio** ("Sin audios"): **gana** consistencia; **pierde** su **icon-shell 64×64** —el estado vacío más pulido de la app— degradado a icono 28 desnudo dentro de una caja genérica. Neto: **regresión clara**.
- **chat** ("Sin mensajes"/"Selecciona un canal"): **gana** consistencia; **pierde** su estética **sin borde** con título 20 grande y aireado (padV 32); la caja punteada + título 16 lo apretuja. Neto: **regresión leve**.

## 4. El "win barato" (solo si rechazas mi recomendación)

Como bien dijiste, checklist↔AlertState nunca convergen solos porque AlertState carga lógica de estados. Pero **sí** pueden compartir la **caja** (no el componente entero): un `EmptyStateBox` punteado (radio 16, minHeight 160, gap 8, padding 18, icono 28, título 16/900) que:
- checklist consume directo (cambios pequeños de §3),
- AlertState consume **dentro** de sus ramas (la rama "cargando" y la rama "vacío" renderizan la caja; la lógica de branching se queda en AlertState).

Es la **única** convergencia sin regresión aesthetic (ambas ya son cajas punteadas). Coste: 2 consumidores, ~10 líneas dedup, y cirugía menor en AlertState para envolver sus ramas. Mi lectura: **no compensa** los moving parts, pero es defendible si quieres cerrar con algo tangible. users/radio/chat **no** entran ni en esta versión.

## 5. Decisión que te queda

1. **Archivar** (mi recomendación): los estados vacíos se quedan como están; hilo cerrado definitivamente.
2. **Win barato**: creo `EmptyStateBox` punteado y migro **solo** checklist + AlertState (§4), con el diff pequeño/mínimo de §3.
3. **Unificación completa**: las 5 al canónico de §1, aceptando las regresiones de users/radio/chat de §3. **No lo recomiendo.**

No hay opción "cero cambio visual": cualquiera de 2/3 mueve valores. Por eso es decisión tuya de diseño, no refactor. Si no respondes por (2) o (3), **queda archivado por (1)** — no lo dejo abierto indefinidamente.

## 6. Estado

Sin cambios de código. Árbol como en RC-MOBILE-UI-05 (suite 26/134). Rollback: `rm RC-MOBILE-EMPTYSTATE-DESIGN-01.md`.
