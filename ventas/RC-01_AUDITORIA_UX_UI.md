# RC-01 — Auditoría UX/UI del portal comercial

Fecha: 10 de julio de 2026
Alcance: `ventas/` (landing, acceso, checkout y portal comercial)

## Límite de alcance

La revisión y los cambios se mantuvieron dentro de `ventas/`. No se modificaron la aplicación móvil, el panel operativo, mapas, radio, chat, sockets, GPS, seguimiento, incidencias ni la autenticación de la aplicación móvil.

RC-01 no incorpora prorrateos, cambios de plan avanzados, nuevos flujos de facturación ni onboarding nuevo. La lógica comercial existente se conserva para las siguientes certificaciones.

## Problemas encontrados

- La navegación mezclaba producto, administración, activación y módulos todavía vacíos.
- “Integraciones” conducía a una pantalla sin funcionalidad disponible.
- El bloque de contexto del menú lateral repetía información que ya expresaban el encabezado y la navegación.
- El dashboard mostraba varias veces la misma idea con textos distintos: plan activo, cuenta activa y activación lista.
- La alerta principal podía repetir dos avisos sobre una misma activación pendiente y siempre llevaba a Activación, incluso cuando el problema era una factura.
- “Actividad reciente” mostraba en realidad el progreso de activación y usaba como subtítulo la última factura.
- Métodos de pago mezclaba cuatro métricas, próximo cobro, historial y un checklist de facturación. Gran parte de esa información duplicaba Facturación, Mi plan e incluso la misma pantalla.
- Métodos secundarios recibían el badge “Activo” aunque el modelo no entrega un estado real para respaldarlo.
- Facturación mostraba “0 registros” junto a un empty state, repitiendo la ausencia de datos.
- La sección Integraciones presentaba un empty state permanente para una capacidad inexistente.
- Había microcopy inconsistente, anglicismos innecesarios, faltas de acentuación y dos apariciones incorrectas de la marca “MancComb”.
- Varias acciones críticas no declaraban nombre, rol o estado accesible.
- Los modales destructivos usaban una propiedad anterior (`danger`) que ya no coincidía con el componente unificado (`destructive`).

## Decisiones tomadas

- Reorganizar la navegación en tres grupos comprensibles: Cuenta, Administración y Ayuda.
- Renombrar “Suscripción” como “Mi plan” y “Equipo administrativo” como “Equipo”.
- Ocultar Integraciones hasta que exista una capacidad real y una pantalla con propósito.
- Mantener Activación porque ya contiene acciones y datos reales; no se agregó ni rediseñó su flujo.
- Dar a cada tarjeta de Inicio un significado único: mi plan, usuarios activos, próximo pago o facturación pendiente, y progreso de activación.
- Dirigir la alerta prioritaria a Facturación cuando existen documentos pendientes y a Activación en los demás casos.
- Reservar Facturación para comprobantes e historial; reservar Métodos de pago para referencias, método principal y próximo cobro.
- Mostrar badges únicamente cuando existe un estado o significado comprobable.
- Conservar la identidad oscura, el acento de ManeComb y la estructura general. Se refinó el sistema existente sin rediseñarlo desde cero.

## Componentes y contenido eliminados

- Enlace de navegación a Integraciones.
- Pantalla vacía permanente de Integraciones dentro de Perfil.
- Bloque descriptivo redundante “Cuenta SaaS / Portal comercial” del menú lateral.
- Cuatro métricas duplicadas de Métodos de pago.
- Historial reciente duplicado dentro de Métodos de pago.
- Checklist redundante de estado de facturación dentro de Métodos de pago.
- Badge ficticio “Activo” en métodos de pago secundarios.
- CTA vacío de métodos de pago que solo mostraba otro mensaje sin mover ni cambiar el estado de la interfaz.
- Estilos y componentes internos que quedaron sin uso tras la limpieza de Métodos de pago.

## Componentes unificados

- Estados mediante `StatusBadge` y el formateador común de estados del portal.
- Confirmaciones mediante `ConfirmModal`, incluida la variante destructiva.
- Empty states mediante el patrón visual compartido.
- Paleta, espaciado, radios, tipografía, tonos y controles mediante los tokens del sistema visual de VENTAS.
- Terminología principal: Mi plan, Facturación, Métodos de pago, Empresa, Equipo, Seguridad, Activación y Soporte.

## Mejoras realizadas

- Jerarquía y etiquetas de navegación más cortas y naturales.
- Dashboard con menor carga cognitiva y sin estados equivalentes repetidos.
- Alertas con destino coherente según el problema real.
- Responsabilidades claras entre Mi plan, Facturación y Métodos de pago.
- Empty states sin contadores redundantes ni acciones falsas.
- Microcopy corregida en landing, acceso, checkout y portal.
- Corrección de la marca ManeComb en mensajes compartidos.
- Roles, etiquetas y estados accesibles en navegación, planes, descargas, métodos de pago, alertas y confirmaciones.
- Confirmaciones destructivas alineadas con la API actual del componente común.

## Verificación

- `npm.cmd run build`: aprobado.
- Vite procesó 436 módulos y generó el bundle de producción correctamente.
- `git diff --check`: sin errores de espacios o parches mal formados.
- Búsqueda de módulos y textos objetivo: no quedan Integraciones expuestas, banners de token expirado ni las duplicidades “Plan activo / Activación lista”.

## Riesgos y observaciones

- El bundle principal continúa por encima de 500 kB. Es un riesgo de performance existente y debe tratarse en RC-05 mediante división de código, sin mezclarlo con esta limpieza funcional.
- El proyecto no cuenta con un script propio de typecheck. Ejecutar TypeScript directamente revela dependencias de tipos de React Native no instaladas y errores previos fuera de los cambios de RC-01; el build de Vite sí está aprobado.
- La inspección automática en el navegador local quedó bloqueada por permisos del runtime del entorno. Se recomienda una pasada manual final en 360, 768, 1024 y 1440 px antes de cerrar visualmente la RC.
- Los flujos de cambio, cancelación, reactivación, prorrateo, pagos fallidos, PDF y XML pertenecen a RC-02/RC-03 y no fueron ampliados.

## Certificación final

**RC-01 — APROBADA TÉCNICAMENTE, CON VALIDACIÓN VISUAL MANUAL PENDIENTE.**

La arquitectura visual y la navegación quedan preparadas para RC-02. No debe iniciarse lógica nueva de planes hasta completar la revisión visual de breakpoints indicada arriba.
