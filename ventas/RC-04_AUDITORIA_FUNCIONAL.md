# RC-04 — Auditoría Funcional Integral y preparación para pagos

## Alcance certificado

La revisión se realizó exclusivamente sobre `ventas`: landing, acceso, checkout y portal comercial. No se modificaron la app móvil, el backend operativo, mapas, GPS, radio, chat, sockets, seguimiento, incidencias ni sus APIs.

## Problemas encontrados y decisiones tomadas

- La ruta `/usuarios` apuntaba al módulo comercial y varias acciones la trataban como destino operativo, creando una navegación circular. Se separó de `/portal/usuarios` y ahora muestra un estado operativo explícito.
- Landing y checkout consumían directamente detalles de la API de pagos. Se aislaron detrás de contratos y adaptadores comerciales para reducir acoplamiento sin cambiar endpoints ni comportamiento del backend.
- Existían tarjetas de portal exportadas pero sin consumidores, mensajes comerciales duplicados y promesas de facturación o cancelación aún no implementadas. Se eliminaron los componentes muertos y se ajustó el microcopy a las capacidades reales.
- La descarga de comprobantes dependía directamente de la configuración HTTP desde la pantalla. La resolución de URL se movió al servicio comercial de facturación.
- Todas las pantallas se cargaban en el paquete inicial. Se aplicó carga diferida por ruta con un estado de arranque común.
- Se encontraron acciones con semántica visual pero sin rol o nombre accesible. Se añadieron roles, etiquetas, estados seleccionados, estados deshabilitados y estado expandido donde correspondía.
- La navegación del portal carecía de contexto secundario. Se añadió una ruta de navegación compacta sin duplicar el título principal.

## Flujo funcional auditado

- Landing: catálogo, CTA, acceso, selección de plan y retorno de pago existente.
- Checkout: selección de método, validación visual, estado del proveedor, confirmación y redirección existente.
- Portal: dashboard, mi plan, comparación, facturación, métodos de pago, empresa/perfil, usuarios, seguridad, ayuda/configuración y onboarding.
- Acciones operativas fuera de ventas: conservadas como destinos explícitos sin mezclar módulos comerciales.
- Rutas públicas, privadas y de no encontrado: verificadas a nivel de configuración y compilación.

Las vistas privadas respetan la autenticación real. No se fabricó una sesión ni se alteraron credenciales para forzar una auditoría visual del portal.

## Arquitectura preparada para integración de pagos

Se incorporó una capa comercial tipada con:

- `CheckoutService` para planes, disponibilidad del proveedor, validación, creación de sesión y confirmación del retorno.
- `PaymentProvider` como contrato intercambiable.
- `PaymentSession`, `PaymentResult`, `PaymentReturnConfirmation` y estados explícitos del ciclo de pago.
- `SubscriptionService`, `BillingService` y `CommercialState` ya desacoplados de las pantallas.
- Adaptador de checkout que encapsula únicamente las llamadas existentes; no añade APIs, proveedores, cobros, prorrateos ni persistencia.
- Validación de tarjeta de prueba aislada del componente visual.

La UI utiliza términos neutrales como “proveedor de pago” y representa de forma explícita los estados no disponible, preparando RC-05 sin prometer una integración inexistente.

## Componentes eliminados o unificados

- Eliminados `PlanStatusCard`, `UsageUnitsCard`, `PaymentMethodCard` y `OnboardingChecklist` sin uso.
- Reutilizados estados vacíos, skeletons, badges, modales, toasts y tarjetas del sistema visual consolidado en RC-01/RC-02.
- Unificada la creación de servicios comerciales en una fábrica estable.
- Checkout y landing comparten el mismo modelo tipado de planes y resultados de pago.

## Rendimiento

- Entrada principal de producción: **388.06 kB** (125.63 kB gzip).
- Landing: **156.28 kB**; checkout: **21.52 kB**; pantallas del portal: cada una por debajo de **18 kB** en sus chunks principales.
- La compilación ya no reporta un chunk JavaScript superior a 500 kB.
- El archivo de fuente de iconos (1.15 MB) continúa como activo estático y es un candidato de optimización futura, sin afectar la certificación funcional.

## Responsive y accesibilidad

La landing fue ejecutada en navegador real a 360, 390, 768, 1024, 1280, 1440 y 1920 px. En todos los anchos `scrollWidth` coincidió con `clientWidth`; no hubo desbordamiento horizontal.

Se revisaron breakpoints y estructuras flexibles del portal. Se reforzaron nombres accesibles en navegación, pestañas, botones de icono, acciones de usuario y controles de checkout.

## Validaciones

| Validación | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto |
| TypeScript estricto con no usados | Correcto |
| `npm run build` | Correcto — 451 módulos |
| Responsive 360–1920 px | Correcto, sin overflow |
| Consola del navegador | Sin errores de aplicación |
| Búsqueda TODO/FIXME/debugger/console.log | Sin hallazgos en código fuente |
| `git diff --check -- ventas` | Correcto |

La consola muestra dos avisos no bloqueantes emitidos por la compatibilidad web de React Native: deprecación de `pointerEvents` como prop y fallback de `Animated` a JavaScript.

## Riesgos y trabajo futuro

- La integración del proveedor, los cobros reales, webhooks, idempotencia, prorrateos y conciliación siguen fuera de alcance.
- La disponibilidad del proveedor depende del endpoint de salud y de las APIs existentes; el contrato nuevo permite sustituir el adaptador sin reescribir pantallas.
- La validación visual autenticada deberá repetirse con una cuenta comercial de QA cuando exista una sesión autorizada.
- El peso de la fuente completa de iconos puede reducirse mediante subconjuntos en una fase de rendimiento dedicada.
- Los avisos de React Native Web dependen de librerías base y no indican fallos del flujo comercial.

## Versionado y publicación

- Rama: `codex/ptt-radio-realtime`
- Commit de implementación: `PENDIENTE_RC04_COMMIT`
- Push: pendiente de confirmación tras crear el commit.
- Cambios ajenos existentes en `mobile/`: excluidos del stage y del commit.

## Certificación

La certificación final queda condicionada únicamente a registrar y publicar el commit. El código de `ventas` compila, supera TypeScript, no contiene errores de formato y cumple la validación responsive definida para RC-04. No se avanzó a una integración real de pagos.
