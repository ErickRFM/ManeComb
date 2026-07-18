# RC-PORTAL-OPERATIONS-POLISH-01

## Alcance

Esta RC contiene exclusivamente polish visual. No se modificaron componentes, posiciones, layout principal, funciones, lógica, hooks, backend, APIs, stores, servicios ni Mapbox.

Los únicos cambios de esta fase son propiedades visuales dentro de:

- `ventas/features/portal/screens/portal-dashboard-screen.tsx`
- `ventas/src/global.css`

## Mejoras visuales

### Barra inferior de KPIs

- Se reforzó la lectura como una única barra continua de estado.
- La superficie compartida recibió una sombra exterior suave y un highlight interior de un píxel.
- Se mantuvieron divisores internos en lugar de tarjetas independientes.
- Los valores principales aumentaron ligeramente su jerarquía mediante tamaño, tracking negativo discreto y line-height uniforme.
- Las etiquetas usan tracking mínimo para mejorar legibilidad sin aumentar altura.
- La animación de aparición permanece dentro del rango solicitado: 220 ms.

### Panel derecho

- Se añadieron highlights interiores muy sutiles a ruta, conductor y métricas.
- Bordes y fondos conservan el aspecto de un solo panel, sin añadir nuevas cajas.
- Los divisores de sección redujeron contraste para evitar fragmentación visual.
- Se refinó el tracking de encabezados secundarios.
- Las transiciones de superficies y bordes duran 180 ms.
- No se movió, ocultó ni eliminó información.

### Chips y controles

- Los filtros incorporan transición coherente de fondo, borde, sombra y escala en 180 ms.
- El estado seleccionado tiene borde más definido, highlight interior y sombra corta.
- El hover de controles usa elevación discreta sin alterar dimensiones.
- Los estados pressed existentes permanecen sutiles y conservan el flujo del operador.

### Marcadores

- Se redujo la intensidad del pulso para evitar un efecto llamativo.
- El marcador seleccionado incorpora un halo exterior fino y semitransparente.
- Hover ajustado mediante brillo y saturación mínimos.
- Borde, halo y sombra usan transiciones de 180 ms.
- El movimiento de marcadores conserva la interpolación visual existente de 220 ms.
- No se modificó la creación, actualización, posición, selección ni comportamiento de los marcadores.

## Rutas y polylines

No se modificó Mapbox ni el pipeline GIS. La auditoría confirmó que permanecen conectados:

- `operations-route-source` / `operations-route-layer` para ruta principal;
- `operations-replay-source` / `operations-replay-layer` para recorrido guardado;
- actualización de geometría mediante `GeoJSONSource.setData`;
- recreación de layers después de `style.load`;
- checkpoints sincronizados por identificador;
- ruta operacional con ancho 4, color de acento y extremos redondeados;
- replay con ancho 3, color informativo y opacidad 0.72.

La diferenciación adicional entre “tramo recorrido” y “tramo pendiente” no se inventó visualmente porque la vista no recibe dos geometrías independientes para esos estados. Implementarla habría requerido modificar datos o lógica GIS, expresamente prohibido por esta RC.

## Confirmación de integridad

No se modificó ninguna lógica del sistema.

En particular, permanecen intactos:

- flujo de selección de unidad;
- filtros;
- consultas y caché;
- actualización de métricas;
- historial y replay;
- cálculo de rutas;
- sources, layers y checkpoints;
- inicialización y lifecycle de Mapbox;
- navegación y acciones;
- responsive y ausencia de scroll introducidos en la RC anterior.

## Validación

- TypeScript: aprobado con `tsc --noEmit`.
- Build Vite: aprobado; 464 módulos transformados.
- `git diff --check`: aprobado.
- ESLint: no disponible; `ventas/package.json` no declara script `lint` ni configuración ESLint.
- Panel: estructura y contenido intactos.
- KPIs: información intacta, presentación continua refinada.
- Animaciones: 180–220 ms para interacciones discretas.
- Rutas y polylines: pipeline auditado e intacto, sin cambios GIS.
- Regresiones lógicas: ninguna modificación lógica realizada.
