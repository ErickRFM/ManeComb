# RC-02 — Experiencia Comercial SaaS

Fecha: 10 de julio de 2026
Alcance: `ventas/` — portal comercial, Mi plan, dashboard y estados relacionados

## Límite de alcance

RC-02 se implementó exclusivamente dentro de `ventas/`. No se modificaron la app móvil, el backend, las APIs, el panel operativo, GPS, seguimiento, radio, chat, sockets ni la navegación móvil.

La experiencia creada no ejecuta cambios de plan, cancelaciones, cobros, prorrateos ni pagos. Los contratos actuales de la API se consumen sin alterarlos.

## Pantallas refinadas

### Mi plan

- La vista presenta el plan actual como una suscripción comercial y no como un formulario CRUD.
- Muestra estado, descripción, mensualidad, unidades incluidas, unidades utilizadas, porcentaje de uso y próxima renovación.
- Incorpora un comparador de planes con nombre, precio mensual, capacidad, costo aproximado por unidad, descripción y beneficios.
- Cada tarjeta tiene una acción contextual: “Plan actual”, “Comparar” o “Seleccionado”.
- Los indicadores comerciales se asignan una sola vez por tarjeta: “Más elegido”, “Mayor cobertura”, “Escala empresarial” o “Para comenzar”.
- La comparación muestra plan actual, nuevo plan, diferencia de capacidad, diferencia de mensualidad, beneficios y el paso posterior.
- “Continuar” no ejecuta ninguna mutación. Cambia únicamente el estado local y presenta “Próximamente”.
- Se eliminó de la interfaz la cancelación real y cualquier llamada directa a cambio de plan.

### Dashboard comercial

- Se redujo el resumen a tres señales prioritarias: suscripción, uso de unidades y método principal.
- Se agregó un único próximo paso recomendado según el contexto de la cuenta.
- La recomendación prioriza, en orden: facturas pendientes, método faltante, activación incompleta y comparación de planes.
- Se agregó una sección de última actividad comercial con suscripción y último comprobante.
- Se eliminaron accesos rápidos genéricos y métricas que no explicaban una decisión comercial.
- La ausencia de facturas se comunica mediante un estado vacío y no una fila o tabla vacía.

### Facturación y métodos de pago

- Facturación utiliza el mensaje “No existen facturas todavía”.
- Métodos de pago utiliza “No tienes métodos de pago registrados”.
- Se mantienen separados historial fiscal y administración de métodos.

## Componentes modificados

- `PortalPlanScreen`
- `PortalDashboardScreen`
- `PortalBillingScreen`
- `PortalPaymentsScreen`
- `MaterialCommunityIcons` web wrapper
- `StatusBar` web wrapper
- Cliente Axios de VENTAS
- Configuración de scripts de `ventas/package.json`

## Componentes nuevos

Los siguientes componentes de presentación se añadieron dentro de Mi plan:

- `CurrentPlanOverview`
- `PlanFact`
- `CommercialPlanCard`
- `ChangePreview`
- `ComparisonPlan`
- `ChangeFact`

En el dashboard se añadió:

- `ActivityRow`
- Modelo local de recomendación comercial contextual

También se añadió una declaración TypeScript para los aliases web de React Native que Vite ya utilizaba. No modifica el runtime ni la API.

## Decisiones UX

- Explicar primero la situación actual y después ofrecer alternativas.
- Mantener una sola etiqueta destacada por tarjeta para evitar competencia visual.
- Mostrar diferencias en unidades y mensualidad antes de presentar beneficios.
- Separar selección, comparación y continuación como estados visuales distintos.
- Indicar explícitamente que la previsualización no aplica cambios.
- Convertir el siguiente paso no disponible en un estado “Próximamente” claro y no en un botón falso o una operación silenciosa.
- Utilizar lenguaje comercial: “unidades incluidas”, “mensualidad”, “cobertura”, “tu suscripción está activa” y “próximo paso”.
- En móvil, apilar la comparación verticalmente, cambiar la flecha a dirección descendente y llevar las acciones al ancho completo.

## Inconsistencias corregidas

- La pantalla dejó de invocar `changePlan` al seleccionar una tarjeta.
- La pantalla dejó de invocar `cancelPlan` desde una acción comercial todavía no soportada por RC-02.
- Se eliminó la confirmación que prometía un cambio inmediato sin comparación comercial.
- Se eliminaron nombres de plan usados como única explicación de capacidad.
- El dashboard dejó de mezclar usuarios administrativos, activación y estado de plan como métricas equivalentes.
- Se eliminó la navegación por acciones genéricas repetidas y se reemplazó por una recomendación contextual.
- Los estados vacíos ahora describen qué ocurrirá después.

## Mejoras de navegación

- “Mi plan” conduce a una secuencia clara: situación actual → opciones → comparación → siguiente paso.
- El dashboard dirige a Facturación, Métodos de pago, Activación o Mi plan según el estado real disponible.
- No se añadieron rutas nuevas ni se modificó la navegación móvil.

## Responsive y accesibilidad

- Las tarjetas utilizan `flexWrap`, bases flexibles y anchos mínimos compatibles con el contenedor del portal.
- La comparación cambia a una columna por debajo de 720 px.
- Las acciones de comparación ocupan todo el ancho en móvil.
- Los controles nuevos declaran rol, nombre, estado seleccionado y estado deshabilitado.
- La ruta pública de acceso se comprobó en 360, 768, 1024 y 1440 px sin overflow horizontal.
- Las vistas privadas redirigen correctamente a acceso cuando no existe sesión; su composición responsive se verificó mediante reglas de layout y compilación.

## Preparación para RC-03

- El plan seleccionado permanece en estado local y está separado de las mutaciones del store.
- El panel de comparación ya presenta los datos necesarios para insertar posteriormente prorrateo, impuestos, fecha efectiva y confirmación.
- El botón final dispone de un estado explícito para conectarse más adelante al flujo real.
- No se creó deuda contractual: `CommercialPlan` y `PortalSubscription` se utilizan sin modificar su forma.

## Riesgos encontrados

- El bundle principal es de aproximadamente 871 kB. La división de código continúa pendiente para la fase de performance.
- React Native Web no incluía declaraciones TypeScript consumibles por este proyecto. Se añadió un shim local deliberadamente amplio; conviene sustituirlo por tipos oficiales si la dependencia los incorpora en una actualización futura.
- Los beneficios de cada plan se derivan de los campos actuales. RC-03 deberá recibir beneficios comerciales normalizados desde una fuente única si el catálogo se vuelve editable.
- No existe todavía historial de solicitudes de cambio; por alcance, RC-02 no creó datos ni endpoints para simularlo.

## Validación

- `npm.cmd run typecheck`: aprobado.
- `npm.cmd run build`: aprobado.
- Vite compiló 436 módulos correctamente.
- Revisión responsive pública: aprobada en 360, 768, 1024 y 1440 px, sin overflow horizontal.
- `git diff --check`: aprobado.

## Certificación

**RC-02 — APROBADA.**

La experiencia comercial queda preparada para conectar la lógica real en RC-03. No se implementaron cobros, prorrateos, cancelaciones ni cambios reales de suscripción.
