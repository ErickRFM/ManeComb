# RC-UX-UI-SYSTEM-03 — Implementación global controlada

> Estado: IMPLEMENTACIÓN CERRADA EN SUPERFICIES NO CONFLICTIVAS / CI E INTEGRACIÓN PARALELA PENDIENTES
>
> Rama: `ux/global-polish-clean-20260811`
>
> Base integrada al iniciar código: `main@f30ad08fa34f876fde3702782a6cd7cef7f9d7b0`

## 1. Criterio usado

Esta fase no mide éxito por número de archivos modificados. La regla es:

> **auditar todo, modificar solo cuando existe un problema demostrable y preservar lo que ya está bien.**

No se añadieron slogans, tarjetas, KPIs, badges, loaders, estados ni capacidades para llenar espacio. No se creó un sistema visual paralelo y no se alteró ninguna autoridad de negocio para acomodar una decisión estética.

## 2. Cambios implementados

### Mobile — Radio

Archivos:

- `mobile/src/screens/radio/radio-screen-view.tsx`
- `mobile/src/screens/radio/radio-screen-contracts.test.ts`

Corrección:

- Se eliminó la fila inferior que repetía canal, conectados y salida.
- El nombre del canal permanece como título del header.
- El número de miembros permanece arriba y sigue navegando a Canales.
- La salida de audio permanece arriba como control real y sigue consumiendo la autoridad nativa de audio route.
- El PTT y la última transmisión ganan jerarquía al desaparecer metadato repetido.
- Se añadió contrato de regresión que impide reintroducir `consoleMetaRow` en la vista.

No se tocó:

- floor control;
- captura;
- playback;
- Socket.IO;
- lifecycle;
- haptics;
- audio routing;
- máquina de estados de Radio.

### Mobile — Alertas

Archivo:

- `mobile/src/screens/alerts/AlertsScreen.tsx`

Corrección:

- Se retiraron `mobileTitle`, `mobileSubtitle` y `mobileBadges` que no podían renderizar porque la pantalla ya entrega un `header` personalizado a `AppShell`.
- Se eliminó el cálculo de críticas que existía únicamente para ese badge muerto.
- El contador real que sí muestra `AlertsHeader` queda reducido a una sola derivación: incidencias activas.

Resultado: menos estado derivado sin consumidor y ningún copy invisible mantenido por accidente.

No se cambió la creación/resolución de incidencias ni SOS.

### Mobile — Perfil

Archivo:

- `mobile/src/screens/profile-screen.tsx`

Corrección:

- Se retiraron `mobileTitle` y `mobileBadges` muertos porque el header personalizado ya es la autoridad visual de la pantalla.
- El rol y presencia visibles se conservan donde aportan valor, junto a la identidad del usuario.

No se cambió sesión, presencia, edición, documentos ni tema.

### Mobile — Documentos del conductor

Archivo:

- `mobile/src/screens/documents/documents-screen.tsx`

Corrección:

- Se retiró `mobileTitle` muerto por el mismo contrato de `AppShell` + header propio.
- La acción `Reintentar / actualizar` pasó a `Actualizar`. El estado de error ya se explica en su mensaje; el botón normal no debe fingir simultáneamente un error.

No se cambiaron upload, replace, history, delete, file open ni confirmaciones.

### Portal empresarial — Shell compartido

Archivo:

- `ventas/features/portal/components/portal-layout.tsx`

Corrección:

- El breadcrumb `Portal > pantalla` se conserva en escritorio y se oculta en layout compacto, donde repetía el título justo debajo y consumía altura útil.
- El glow inferior cian se sustituyó por un acento rojo extremadamente sutil, alineado con la paleta canónica del Portal.

No se cambiaron router, capabilities, políticas de carga, logout ni navegación.

### Portal empresarial — Tema

Archivo:

- `ventas/features/portal/portal-theme.ts`

Corrección:

- El CTA compartido deja de introducir violeta en su gradiente y sombra; conserva rojo + rosa dentro del lenguaje actual del Portal.
- No se cambian tokens base ni la identidad neón deliberada de la landing pública de Ventas.

### Admin Global — Shell

Archivo:

- `admin-global/src/features/platform/components/admin-shell.tsx`

Correcciones:

- `subtitle` dejó de ser obligatorio.
- Se eliminó el eyebrow fijo `ADMIN GLOBAL` de todas las páginas; el contexto global ya está presente en el shell/brand y no necesita repetirse encima de cada título.
- Se quitaron las descripciones de dos líneas debajo de cada opción de navegación. Los labels ya son inequívocos.
- Sidebar de escritorio: 280 → 260 px.
- Opciones: altura mínima 58 → 44 px, manteniendo target táctil suficiente.
- Se redujo el espacio vertical entre opciones.

No se cambiaron capabilities, MFA, sesión, navegación efectiva ni guards.

### Admin Global — Resumen

Archivo:

- `admin-global/src/features/platform/screens/overview-screen.tsx`

Corrección:

- Cuando no existe `commercialOrders`, ya no se inventa un cuarto KPI `Módulos habilitados` porque la misma pantalla ya contiene `Módulos disponibles` con el detalle real de capabilities.
- El grid usa tres columnas en escritorio cuando existen tres KPIs y cuatro cuando existen órdenes.

No se cambió la fuente de datos ni la matriz de permisos.

## 3. Superficies auditadas y congeladas

### Mapa / Seguimiento / Control / Jornadas

No se creó ninguna tarjeta, badge ni selector de estado nuevo.

Razón: el repositorio ya dispone de `OperationalUnitSnapshot` y contrato compartido para jornada, ruta, GPS, conductor, ETA, progreso e incidencias. Una pasada visual no debe volver a introducir precedencias locales.

Cualquier evolución posterior de esas pantallas debe proyectar el snapshot canónico, no volver a calcular estado desde `Vehicle.status`, sesiones o tracker por separado.

### Chat

Se revisó el hallazgo histórico de `directoryHelperText`: en el código actual sí se renderiza dentro del encabezado de Conversaciones. No se aplicó un parche a un problema ya resuelto.

No se tocaron composer, mensajes, media, E2EE, RTC ni teclado.

### Llamadas

No se tocó porque existe trabajo paralelo específico sobre feedback de llamada/ringtone/ringback. La rama UX ya integró el pulido visual de llamadas que llegó a `main` mediante PR #165 y no debe crear una segunda autoridad.

### Directorio / Unidades

No se tocó `users-screen.tsx` ni sus acciones porque existen trabajos paralelos #166 y #168 sobre modularización y archivo de unidades. Se evita conflicto deliberadamente.

### Ventas pública / Auth / Checkout

La landing conserva su identidad neón deliberada. No se fuerza la paleta del Portal sobre la superficie comercial.

Login/registro y checkout fueron revisados; la fase paralela #169 está certificando precondiciones, catches, botones y estados asíncronos. Este PR no duplica esa corrección ni pisa sus archivos.

## 4. Concurrencia verificada

PRs paralelos vigentes durante esta implementación:

- #166 — modularización de autoridades del Directorio;
- #168 — archivo de unidades con historial;
- #169 — auditoría funcional/UI de Ventas y Portal;
- #170 — feedback nativo completo de llamadas.

No se editaron los archivos de código declarados por #166, #168 o #170. Los archivos tocados en `ventas/` tampoco se solapan con el listado de archivos de #169 al momento de esta fase.

Antes de integrar esta RC a `main` se debe volver a consultar el `main` vigente y reconciliar los PRs que hayan entrado.

## 5. Identidad visual

Se conservan dos contextos válidos, no se intenta hacerlos idénticos:

- **operación / Portal / Admin:** oscuro sobrio, rojo ManeComb, jerarquía funcional;
- **Ventas pública:** identidad neón más expresiva para adquisición/comercial.

La coherencia se exige en interacción, estados, componentes y lenguaje; no en convertir todas las superficies en la misma pantalla.

## 6. Qué NO se añadió

- cero dependencias;
- cero widgets nuevos;
- cero managers/stores paralelos;
- cero APIs nuevas;
- cero estados de negocio;
- cero copy de marketing dentro de Mobile operativo;
- cero capacidades ficticias;
- cero cambios de permisos;
- cero cambios de backend.

## 7. Validación automática

Estado al crear este documento:

- `System audit gates`: PASS en el último commit de código observado.
- `Dependency audit`: PASS en el último commit de código observado.
- `CI`: en ejecución.
- `Portal production certification`: pendiente/en cola.

El resultado final debe actualizarse después del último commit de documentación y después de reconciliar el `main` vigente. No se declara build/test verde por adelantado.

## 8. Gate visual/físico

Esta fase cambia principalmente jerarquía y densidad. Requiere revisión final de:

- Radio en Android físico: alto normal y pantalla compacta;
- Profile/Alertas/Documentos en phone y font scale alto;
- Portal en 360/390/768/1024/1440;
- Admin Global en móvil y escritorio;
- contraste/targets/teclado en navegador real.

No se marca como evidencia física ejecutada desde CI.

## 9. Cierre técnico esperado

La RC puede pasar a ready/merge cuando:

1. CI, System audit, Dependency audit y Portal certification estén verdes sobre el head final;
2. el `main` vigente haya sido reconciliado si avanzó;
3. no exista solapamiento sin resolver con #166/#168/#169/#170;
4. el diff final siga conteniendo solo sustracción, compactación o alineación demostrable;
5. cualquier prueba física pendiente quede declarada explícitamente, no inventada.
