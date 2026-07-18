# RC-PORTAL-OPERATIONS-UX-REDESIGN-02

## Resultado

La pantalla de Operaciones se recompuso como una superficie de monitoreo continua. El mapa es el plano dominante, el detalle funciona como panel operativo integrado y los KPIs pasan a ser una franja secundaria de lectura rápida.

## Auditoría previa

- La composición anterior conservaba la semántica visual de una página administrativa aunque los bloques hubieran cambiado de posición.
- `PortalSectionCard`, la tarjeta de ruta, la tarjeta de conductor y cada celda de métricas producían cajas anidadas y repetitivas.
- Los encabezados `Estado`, `Ruta`, `Conductor`, `Métricas` y `Acciones` explicaban una estructura que el contenido ya comunicaba.
- El panel derecho y los KPIs tenían un peso de borde y sombra comparable al mapa.
- La barra del mapa consumía altura útil y reforzaba la percepción de widget.
- El encabezado exterior `Detalle de unidad / código` duplicaba la identidad mostrada dentro del panel.

## Cambios de UX/UI

- Los controles existentes del mapa ahora flotan sobre la cartografía en una superficie translúcida; no se agregó ni eliminó ninguna acción.
- Se eliminó exclusivamente la envoltura visual redundante del detalle. Unidad, estado, alertas, ruta y progreso forman ahora un único contexto operativo.
- La unidad seleccionada tiene una cabecera propia de mayor jerarquía, sin duplicar el código.
- Ruta y conductor dejaron de presentarse como tarjetas independientes y se integraron mediante ritmo, iconos y separadores discretos.
- Las métricas conservan todos sus valores, pero dejaron de parecer mini tarjetas protagonistas.
- Se redujeron los encabezados repetitivos; `Eventos recientes` se conserva como ancla semántica útil.
- Las acciones existentes permanecen al final del panel en una zona persistente y separada.
- Los KPIs conservan toda su información con menor altura, contraste y ornamentación.
- Se redujo el uso decorativo del rojo; queda concentrado en selección, estado y contexto relevante.

## Comparación

| Antes | Después |
|---|---|
| Mapa tratado como tarjeta con cabecera propia | Mapa como lienzo dominante con controles superpuestos |
| Panel formado por tarjetas y títulos repetidos | Panel operativo continuo y escaneable |
| Métricas con seis cajas equivalentes | Datos secundarios abiertos y de menor peso |
| KPI inferior alto y con acento decorativo fuerte | Franja compacta de estado |
| Código de unidad duplicado | Un único contexto de unidad seleccionada |

## Alcance técnico

Archivo modificado por esta RC:

- `ventas/features/portal/screens/portal-dashboard-screen.tsx`

No se modificaron backend, APIs, MongoDB, Socket.IO, autenticación, permisos, contratos, modelos, stores, hooks, servicios, Mapbox, seguimiento, historial ni jornadas. Los datos, callbacks y condiciones existentes permanecen iguales. No se agregó ninguna funcionalidad, filtro, botón, métrica, indicador o estado.

No se modificaron archivos de la aplicación mobile.

## Validación

- TypeScript: `npm.cmd run typecheck` correcto.
- Build Vite de producción: correcto, 465 módulos transformados.
- Integridad del diff: `git diff --check` correcto.
- La estructura continúa usando el mismo `OperationsMap`, `VehicleSidePanel`, datos, handlers y acciones.
- La composición usa tamaños fluidos y `clamp()` ya existentes; no se introdujo scroll adicional.

Nota: el build local informa `TOKEN_EMPTY` para Mapbox porque la variable local de producción no está cargada en esta terminal. Es el diagnóstico de entorno ya conocido y no está relacionado con esta RC visual.
