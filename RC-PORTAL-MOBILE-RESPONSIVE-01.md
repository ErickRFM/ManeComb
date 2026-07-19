# RC-PORTAL-MOBILE-RESPONSIVE-01 — Auditoría y Optimización Responsive del Portal Operativo

Fecha: 2026-07-18  
Dictamen: **Certificación condicionada**

## Resumen

Se auditó el shell compartido del Portal y las pantallas de Operaciones, Plan, Pagos, Facturación, Perfil, Onboarding, Documentos, Incidencias, Usuarios, Unidades y Rutas. La corrección se concentró en el layout compartido y el Centro de Operaciones, sin modificar backend, APIs, Socket.IO ni cálculos operacionales.

El Centro de Operaciones ahora tiene un sistema responsive centralizado, mapa con altura útil en móvil, KPIs en dos columnas, controles táctiles de 44 px y panel de detalle apilado con tratamiento de bottom sheet. El panel vacío se oculta cuando no existe una selección explícita; ya no reduce el mapa por seleccionar automáticamente la primera unidad.

## Inventario de problemas

| Área | Problema localizado | Corrección |
|---|---|---|
| Shell del Portal | Header y acciones conservaban distribución de escritorio | Header, breadcrumb y acciones reciben hooks responsive compartidos |
| Contenido compacto | `maxHeight: 100vh` y `overflow: hidden` podían crear doble scroll o contenido inaccesible | En móvil se restaura altura automática, overflow visible y scroll principal |
| Centro de Operaciones | Grid rígido horizontal con altura fija | En móvil se convierte en flujo vertical |
| Mapa | Compartía ancho con un panel vacío y podía quedar estrecho | Ocupa todo el ancho sin selección y mantiene 420–440 px / 56–58 vh mínimos |
| Panel derecho | Siempre aparecía porque se elegía `vehicles[0]` como fallback | Operaciones inicia sin selección; panel oculto hasta seleccionar unidad |
| Detalle móvil | Conservaba columna lateral con bordes de escritorio | Se presenta debajo del mapa como panel/bottom sheet de ancho completo |
| KPIs | Seis tarjetas en una fila sin wrap | Grid móvil de dos columnas, palabras horizontales y wrap permitido |
| Tipografía | Etiquetas podían comprimirse o mostrarse verticalmente | `overflow-wrap`, `white-space: normal` y `writing-mode: horizontal-tb` |
| Acciones | Áreas táctiles inferiores a la recomendación móvil | Botones y roles button con mínimo 44 px bajo breakpoint móvil |
| Selector sobre mapa | Ancho fijo de 240 px y altura alta | Se limita al viewport y reduce su altura en móvil |
| Banner/avisos | Padding y alineación excesivos en teléfono | Variante móvil compacta y alineada al inicio |
| Pantallas administrativas | Dependían del shell para ancho, header y scroll | Se benefician del mismo sistema de contenido, acciones y overflow |
| Rutas | Paneles internos tienen `minWidth` altos, aunque usan wrap | Riesgo remanente: requiere recorrido visual con rutas reales |
| Plan | Algunos carruseles/listas usan overflow propio | Se conserva porque forma parte de controles especializados; requiere QA táctil |

## Componentes modificados

| Archivo | Cambio |
|---|---|
| `ventas/features/portal/components/portal-layout.tsx` | Hooks DOM estables para header, breadcrumb, acciones, barra móvil y contenido compartido |
| `ventas/features/portal/screens/portal-dashboard-screen.tsx` | Selección explícita, hooks para mapa, KPIs y panel de detalle |
| `ventas/src/global.css` | Sistema central de breakpoints y reglas responsive |

## Breakpoints

| Breakpoint | Uso |
|---|---|
| `<= 979 px` | Tablet / shell sin sidebar; contenido sin límite estrecho |
| `<= 767 px` | Móvil: flujo vertical, mapa protagonista, KPIs 2 columnas, detalle apilado, touch targets |
| `<= 479 px` | Teléfonos estrechos: padding y tipografía menores, mapa mínimo 420 px |

Los anchos solicitados 360, 375, 390, 412 y 480 caen en reglas coherentes; 480 usa la regla móvil general y 360–412 reciben además el ajuste de teléfono estrecho hasta 479.

## Comportamiento del Centro de Operaciones

### Sin selección

- El mapa usa prácticamente todo el ancho.
- El panel de detalle queda oculto.
- Los KPIs aparecen debajo en dos columnas.
- El selector de unidades permanece como overlay compacto dentro del mapa.

### Con unidad seleccionada

- El mapa conserva su altura útil.
- El detalle aparece debajo como panel de ancho completo con borde superior redondeado y elevación de bottom sheet.
- En escritorio se conserva la columna lateral original.

## Validaciones realizadas

| Validación | Resultado |
|---|---|
| TypeScript Portal (`npm run typecheck`) | Pasa |
| Build Vite de producción (`npm run build`) | Pasa |
| Presencia de hooks y reglas en assets compilados | Confirmada |
| CSS para 360/375/390/412/480 | Incluido mediante breakpoints 479/767 |
| Tablet | Incluido mediante breakpoints 767/979 |
| Escritorio | Reglas limitadas por media query; layout lateral original permanece |
| `git diff --check` | Pasa |
| Backend / APIs / Socket.IO | Sin cambios por esta RC |
| Listeners de resize nuevos | Ninguno; se reutiliza `useWindowDimensions` del shell y CSS media queries |

## Capturas antes/después

Se preparó un entorno local aislado con backend embebido y una cuenta QA para inspección. La sesión del navegador permitió confirmar el estado previo del Centro de Operaciones y los elementos del Portal, pero el controlador bloqueó la recarga posterior por su política de navegación local antes de producir capturas finales exportables. No se fabricaron imágenes ni se presentó una captura previa como si fuera posterior.

Por esta razón, las capturas antes/después quedan como condición pendiente del dictamen. Deben tomarse en una sesión QA autenticada a 390 px y 1440 px, con al menos una unidad seleccionable, antes de promover la RC.

## Accesibilidad y rendimiento

- Áreas táctiles mínimas de 44 px en móvil.
- Focus visible existente se conserva.
- El contraste y la paleta no fueron alterados.
- No se agregaron listeners ni cálculos de resize.
- Los media queries actúan en CSS y no provocan renders React adicionales.
- Se conserva `prefers-reduced-motion`.

## Riesgos remanentes

1. Falta evidencia visual final en Chrome Android, Brave Android y Safari iPhone reales.
2. La pantalla Rutas necesita QA con catálogos y geometrías reales por sus paneles con mínimos internos.
3. El mapa local no pudo inicializar Mapbox por configuración/token del entorno QA; se validó el contenedor, no la interacción cartográfica real.
4. El build mantiene advertencias existentes por chunks mayores de 500 kB; no fueron introducidas por esta RC.
5. La cuenta QA no tenía unidad ni plan activo, por lo que el panel con selección requiere una segunda pasada con datos operacionales.

## Dictamen final

**Certificación condicionada.** La estructura responsive, los breakpoints, el mapa protagonista, el grid de KPIs, el panel condicionado a selección y los targets táctiles están implementados y el Portal compila. La certificación definitiva requiere capturas y prueba manual en navegadores móviles reales con datos operacionales, especialmente una unidad seleccionada y la pantalla Rutas.
