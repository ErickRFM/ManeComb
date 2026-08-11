# RC-05 — Auditoría UI + funcional de Ventas y Portal

Fecha: 2026-08-11  
Alcance: `ventas/` — landing, autenticación, recuperación, checkout y Portal empresarial.

## Objetivo

Revisar que las acciones visibles de Ventas tengan una consecuencia real y coherente: destino registrado, permiso correcto, precondición antes del submit, estado `loading/disabled`, confirmación cuando corresponda y feedback de éxito/error. La auditoría no cambia reglas comerciales ni crea autoridades paralelas; alinea la UI con las autoridades que ya existen en backend y stores.

## Superficies revisadas

- Landing pública: header, hero, secciones, planes, demo, FAQ y footer.
- Login, registro, recuperación y reset de contraseña.
- Checkout, trial, add-on Radio, proveedor de pago y retorno del proveedor.
- Navegación Portal desktop/móvil, breadcrumbs, logout y permisos.
- Equipo/conductores y acciones de ciclo de vida.
- Unidades y retiro/eliminación segura.
- Rutas, catálogo, asignación, aprendizaje y liberación.
- Plan, pagos y facturación.
- Activación y keys.
- Documentos e incidencias.
- Perfil, sesiones y seguridad.
- Centro de App Móvil.

## Hallazgos corregidos

### 1. Confirmaciones sin precondición visual

`ConfirmModal` solo conocía `processing`. Una pantalla podía saber que una acción era inválida y aun así dejar el CTA de confirmar activo. Se agrega `confirmDisabled`, con estado accesible `disabled/busy`, para que las reglas conocidas por la UI se expresen antes del request.

### 2. Equipo: acciones que podían enviarse aunque ya se conocía que no aplicaban

- El propietario podía abrir una eliminación y pulsar Confirmar aunque el handler luego la ignoraba.
- Asignar al conductor exactamente la misma unidad era un no-op clicable.
- Baja/eliminación no expresaban en el CTA las condiciones `canOffboard`, `canDelete`, motivo mínimo y confirmación `ELIMINAR`.
- La unidad actual no aparecía en la lista de opciones porque el filtro mostraba solo unidades libres.

La UI ahora refleja el preflight de ciclo de vida y evita esos submits inválidos.

### 3. Unidades: UI divergente de la autoridad de retiro

Backend ya considera una ruta asignada como dependencia pasiva y la libera automáticamente durante el retiro. Portal todavía la presentaba como tarea manual/bloqueo. Ahora distingue bloqueos duros (conductor/jornada) de la ruta que se limpiará automáticamente y no habilita Confirmar mientras el impacto está cargando o el retiro no es permitido.

### 4. Checkout: promesas sin cierre de error

Dos caminos podían rechazar sin transición UI final: consulta del modo de proveedor y confirmación del retorno de pago. Ambos tienen ahora `catch` y terminan en feedback visible; el retorno no puede quedarse indefinidamente en “Validando pago” por un error de red.

### 5. Activación: key marcada como compartida antes de compartir

El evento de backend se registraba antes de abrir el share sheet. Si el usuario cancelaba, la key podía quedar como compartida sin haberse compartido. El orden quedó: abrir Share → detectar cancelación → registrar el evento solo después de compartir.

### 6. Documentos: acciones sin precondición/feedback suficiente

- Rechazar sin notas y eliminar sin motivo seguían dejando Confirmar activo.
- Edición podía intentar guardar nombre vacío/formato de fecha incompleto.
- Descarga no capturaba rechazo para mostrar error.
- Se completaron roles/estados accesibles de filtros y revisión.

### 7. Jerarquía visual de botones

Las variantes `secondary`, `danger` e `icon` declaraban color de borde pero no ancho de borde. Se restablece el límite visual para diferenciar acciones secundarias/destructivas sin rediseñar el Portal.

## Gate permanente

Se agrega `ventas/scripts/verify-sales-actions.cjs` y se ejecuta dentro de `verify:contracts`. El gate comprueba:

- que las rutas literales usadas por botones/enlaces existan en el switch de `src/App.tsx`;
- que el registry del Portal tenga pantalla registrada;
- que ConfirmModal mantenga soporte para precondiciones;
- que Equipo/Unidades conserven sus guards de ciclo de vida;
- que Activación no marque una key antes de compartir;
- que Documentos mantenga validación y feedback;
- que checkout cierre errores asíncronos;
- que las variantes visuales de PortalButton mantengan sus bordes.

## Estado de certificación

- Auditoría estática de rutas/acciones: automatizada en CI.
- TypeScript y build de Ventas: requeridos por CI.
- Contratos de backend/store existentes: se conservan como autoridad final.
- Validación real en navegador/dispositivo + backend productivo: **ACCEPTED_PENDING** hasta ejecutar `ventas/QA_CHECKLIST.md` con una cuenta de prueba y datos controlados.

No se declara PASS físico/productivo únicamente por CI; la matriz manual cubre los comportamientos que requieren navegador, proveedor externo, permisos, correo, sesión o datos reales.
