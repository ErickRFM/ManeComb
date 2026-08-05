# RC-TRACKING-HUD-AUDIT-20260805

## Veredicto

`TRACKING_CODE_READY_VISUAL_DEVICE_CHECK_PENDING`

Se auditó el flujo funcional de la pantalla móvil **Seguimiento / Mapa**, desde la proyección canónica del backend hasta el HUD, las rutas dibujadas, los marcadores, la selección de unidad, el panel inferior, las jornadas y sus métricas.

El texto histórico `Rutas 0 / 3?` era semánticamente incorrecto. No representaba “0 de 3 rutas”: mezclaba dos conteos diferentes en una fracción aparente.

- `0`: unidades confirmadas por backend como `on_route`.
- `3`: unidades con ruta, pero con estado `unknown` porque el GPS no era fresco.

La lógica operacional era conservadora y correcta; la presentación era engañosa.

---

# 1. Corrección del HUD

## Antes

```text
Rutas
0 / 3?
```

El segundo número no era el total, por lo que el slash hacía pensar que faltaban tres rutas o que ninguna estaba configurada.

## Ahora

```text
En ruta       0
Sin datos     3
GPS local     ...
GPS unidad    ...
```

Los estados se muestran como indicadores independientes:

- **En ruta:** unidades cuyo snapshot canónico afirma `operationalState: on_route`.
- **Sin datos:** unidades cuyo snapshot afirma `operationalState: unknown`.

No se suma `unknown` a “En ruta”, “Detenida” ni “Sin ruta”. La interfaz deja de afirmar algo que el backend no conoce.

También se corrigió el rótulo **Servidor**. Ese valor nunca midió el socket ni el backend: mostraba la frescura GPS de la unidad asignada al usuario. Ahora se llama **GPS unidad**. La conectividad real continúa perteneciendo al banner global de conexión.

El estado del tráfico permanece accesible y visible en el botón flotante dedicado; no se perdió la función de activar/desactivar tráfico.

---

# 2. Fuente de verdad revisada

## Backend

Archivo:

```text
backend/src/domain/operational-unit-snapshot.js
```

El backend resuelve una sola vez:

- identidad de unidad;
- visibilidad;
- conductor;
- ruta;
- sesión;
- GPS y frescura;
- velocidad;
- ETA;
- estado operacional;
- incidencias.

Reglas confirmadas:

- sin ruta → `no_route`;
- mantenimiento → `maintenance`;
- jornada pausada → `stopped`;
- ruta con GPS no fresco → `unknown`;
- GPS fresco y velocidad menor a 3 km/h → `stopped`;
- estado activo con GPS fresco → `on_route`.

No se cambió esta lógica.

## Store y tiempo real

Archivo:

```text
mobile/src/store/root-store.ts
```

- `refreshAll()` obtiene `operationalUnits` desde el endpoint canónico.
- `operational-unit:updated` reemplaza el snapshot completo de una unidad.
- No se mezclan campos operacionales de `mapData` con el snapshot canónico.
- Los eventos más viejos no reemplazan datos más recientes.

## Selectores

Archivos:

```text
mobile/src/screens/map/hooks/use-tracking-data.ts
mobile/src/screens/map/utils/tracking.ts
```

Se confirmó que:

- el inventario visible incluye unidades con y sin GPS;
- el mapa solo excluye una unidad cuando no existe coordenada dibujable;
- una posición vieja se conserva como última posición conocida;
- `activeRouteCount` cuenta exclusivamente `on_route`;
- `unknownStateCount` cuenta exclusivamente `unknown`;
- selección, incidencias y prioridad usan el inventario completo.

---

# 3. Mapa y rutas

Archivos:

```text
mobile/src/screens/map-screen.native.tsx
mobile/src/screens/map/components/MapCanvas.tsx
```

Se revisó:

- selección de unidad por marcador o chip;
- seguimiento automático y cancelación al mover manualmente el mapa;
- centrado en posición cuando no existe geometría;
- encuadre de la ruta cuando existe polilínea;
- ruta del vehículo seleccionado;
- ruta guardada, ruta enriquecida y fallback de asignación;
- última posición conocida con marcador atenuado;
- etiqueta de antigüedad GPS;
- incidentes sobre mapa;
- tráfico;
- selector de origen, destino y paradas;
- arrastre de puntos;
- retorno Android desde selector;
- estados vacíos por organización, unidad, ruta o GPS.

No se añadió un fallback de ruta inventado. Si no hay geometría válida, la unidad puede seleccionarse y la cámara se centra únicamente cuando existe posición.

---

# 4. Panel inferior

Archivos:

```text
mobile/src/screens/map/components/BottomTrackingPanel.tsx
mobile/src/screens/map/components/bottom-tracking-panel-data.ts
```

Se revisó:

- panel compacto y expandido;
- gestos verticales;
- reducción de movimiento;
- selector horizontal de unidades;
- centrado automático del chip seleccionado;
- estado, GPS, velocidad, ETA y actualización;
- ocupación, combustible y odómetro;
- métricas de jornada;
- detalles;
- historial;
- incidencias;
- roles admin, supervisor y conductor.

## Correcciones adicionales

### Métricas vacías

Antes, `Number('')`, `Number(false)` o `Number([])` podían convertirse en `0`. Eso podía mostrar `0 km` o `0 min` aunque el dato no existiera.

Ahora solo se aceptan:

- números finitos;
- cadenas numéricas no vacías.

Valores vacíos, booleanos, arreglos y `NaN` se consideran ausencia de dato.

### Jornada activa desordenada

Antes, al consultar otra unidad, se seleccionaba la primera jornada activa encontrada en el arreglo. El resultado dependía del orden del endpoint o del caché.

Ahora:

1. se prefiere la sesión activa explícita cuando pertenece a la unidad;
2. si se consulta el historial, se filtran jornadas `RUNNING` o `PAUSED`;
3. se elige la más reciente por `startedAt`.

---

# 5. Acciones revisadas

## Actualización

`Actualizar seguimiento` ejecuta en paralelo:

- sincronización completa del store;
- actualización de ubicación local.

## Seguimiento de cámara

- activado: sigue a la unidad seleccionada;
- un gesto manual lo desactiva;
- el botón lo reactiva.

## Tráfico

El botón conmuta la capa de tráfico sin cambiar rutas ni GPS.

## Incidencias

- el botón superior abre Incidencias;
- el botón flotante recorre alertas visibles;
- al seleccionar una alerta se centra su unidad o coordenada.

## Jornada

Para conductor:

- iniciar;
- pausar;
- reanudar;
- finalizar;
- confirmar acción;
- activar/detener rastreo en segundo plano;
- refrescar datos después del cambio.

No se modificó este flujo.

---

# 6. Pruebas añadidas

## HUD

- `0 on_route + 3 unknown` produce dos indicadores independientes.
- ninguna cifra contiene `/`.
- la etiqueta ya no es `Rutas`.
- conteos negativos, decimales o `NaN` se normalizan.

## Panel inferior

- la sesión activa explícita conserva prioridad;
- se recupera la sesión de otra unidad;
- historial desordenado elige la jornada más reciente;
- una jornada finalizada no se usa como activa;
- métricas agregadas y fallback `metrics` funcionan;
- cadenas numéricas reales se aceptan;
- vacío, booleano, arreglo y `NaN` se rechazan;
- distancia vacía no se presenta como cero.

---

# 7. Resultado esperado para el caso reportado

Con tres unidades que tienen ruta, pero cuyo GPS no permite confirmar movimiento:

```text
En ruta:   0
Sin datos: 3
```

Cuando una de ellas reporte GPS fresco y el backend confirme estado activo:

```text
En ruta:   1
Sin datos: 2
```

Si una unidad no tiene ruta, se presenta en su ficha como **Sin ruta** y no entra en **Sin datos**.

---

# 8. Gate pendiente

Debe comprobarse visualmente en un APK real:

1. HUD en teléfono angosto y ancho.
2. Caso real de tres unidades con GPS perdido.
3. Transición `Sin datos -> Detenida/En ruta` al recibir GPS fresco.
4. Selección de cada unidad y encuadre de su ruta.
5. Métricas vacías sin `0` artificial.
6. Historial con la jornada correcta.
7. Botones de tráfico, seguimiento, actualización e incidencias.

La revisión de código y las pruebas automatizadas no sustituyen esta validación visual y de datos reales.
