# RC-AUTHORIZATION-FINAL-01

## Estado

Certificación de código aprobada para Propietario, Administrador, Supervisor y Chofer. REST y Socket.IO resuelven identidad desde JWT, usuario persistido y sesión vigente; los permisos derivan de `ROLE_PERMISSIONS`, el tenant deriva del usuario autenticado y el cliente aplica guards antes del render y antes de sus mutaciones administrativas.

## Hallazgos encontrados y corregidos

- Un access token con `sid` continuaba válido después de revocar la sesión. Ahora REST y Socket rechazan sesiones revocadas o vencidas.
- Una cuenta suspendida podía conservar acceso con un token emitido previamente. El resolvedor compartido la rechaza y refresh revoca la sesión.
- Las mutaciones de plan, cancelación y facturas validaban billing, pero no exigían cuenta empresarial de Portal. Ahora usan `requirePortalAccess` y `canManageBilling`.
- Eventos comerciales, de cuenta y de usuarios se emitían al tenant completo. Ahora se segmentan por permisos desde `ROLE_PERMISSIONS` y, cuando corresponde, por usuario afectado.
- `chat:typing` aceptaba identidad declarada por el cliente. Ahora usa exclusivamente el usuario autenticado, conversación autorizada y room activa.
- Ubicaciones, rutas, jornadas, vehículos, incidencias, invitaciones y Activation Keys dejaron de difundirse a roles sin permiso.
- Supervisor podía abrir Directorio, pero su store no cargaba datos. Consulta UI/cliente/backend quedó alineada; las mutaciones siguen denegadas.
- Chofer podía intentar resolver su incidencia directamente por REST. La transición requiere `canManageIncidents`.
- Inicio de jornada y registro de recorrido para no-Chofer exigen `canManageRoutes`; Chofer queda limitado a su unidad asignada.
- El alta de usuarios ya no conserva fallback a `organizationId` del body.

## Validaciones reutilizadas y consolidadas

- `resolveAuthenticatedUser`: JWT, usuario, suspensión y `sid` activo para REST y Socket.IO.
- `ROLE_PERMISSIONS`, `hasPermission` y `getRolesWithPermission`: fuente backend para middleware y audiencias Socket.
- `requireOrganization`, `canAccessTenantResource`, `filterTenantList`: aislamiento multiempresa.
- `requireOperationalAccess`: plan y tenant operativo.
- `requirePortalAccess`: cuenta empresarial y rol de Portal.
- `canUserAccessConversation`: Chat, Radio, E2EE, adjuntos, delivered/read/typing/RTC.
- `canRoleAccessRoute`, `canAccessPortal` y `hasPortalPermission`: navegación previa al render en Mobile y Ventas.

## Código eliminado

- Store Mobile: `createUser`, `updateUser`, `deleteUser` y `createVehicle`, sin consumidores.
- API Mobile y tipos exclusivos de esas acciones muertas.
- Campos `organizationId` y `accountType` del payload de edición de perfil Mobile; el backend nunca los aceptaba.
- Código de llamada Chat sin consumidores y variables sin uso detectadas por ESLint.

## Matriz final

| Dominio | Propietario | Administrador | Supervisor | Chofer |
| --- | --- | --- | --- | --- |
| Portal | Cuenta, equipo, unidades, rutas, billing | Según cuenta empresarial | No | No |
| Usuarios | Consultar/gestionar en Portal | Consultar/gestionar | Consultar Directorio | Sin Directorio |
| Vehículos/rutas | Consultar/gestionar | Consultar/gestionar | Consultar/gestionar | Solo unidad/ruta asignada |
| Jornadas/historial | Consultar/gestionar | Consultar/gestionar | Consultar/gestionar | Ejecutar/consultar la propia |
| Incidencias | Crear/consultar/resolver | Crear/consultar/resolver | Crear/consultar/resolver | Crear y consultar propias/asignadas |
| Documentos | Subir/consultar/revisar | Subir/consultar/revisar | Subir/consultar/revisar | Propios o de su unidad |
| Chat/Radio/RTC | Conversaciones asignadas | Conversaciones asignadas | Conversaciones asignadas | Conversaciones asignadas |
| GPS/Seguimiento | Flota del tenant | Flota autorizada | Consulta autorizada | Actualizar/consultar su unidad |
| Billing/suscripción | Administrar | Solo cuenta empresarial autorizada | No | No |
| Perfil/sesiones | Propias | Propias | Propias | Propias |

## Auditoría de rutas

- Rutas públicas justificadas: login, registro, refresh, recuperación/reset, catálogo público, confirmación/webhook Mercado Pago, descarga firmada y activación inicial de Chofer.
- Confirmación/webhook validan al proveedor y correlacionan external reference/orden; descargas usan token firmado.
- Rutas operativas: JWT + acceso operativo; las mutaciones agregan permiso y validación del recurso/tenant.
- Usuarios, vehículos, documentos, incidencias, rutas y jornadas derivan organización/actor del contexto autenticado.
- Portal, checkout autenticado, suscripción y facturación exigen cuenta empresarial y permiso correspondiente.
- Sesiones propias no aceptan `userId` del cliente y la revocación invalida refresh y access token con `sid`.

## Auditoría Socket.IO

- Handshake usa el mismo resolvedor que REST.
- Presence ignora identidad del payload y usa `socket.data.user`.
- Join de Chat/Radio/RTC valida acceso operativo, conversación y tenant.
- Typing, delivered, read y send usan identidad autenticada; stores vuelven a comprobar membresía.
- PTT valida membresía, room, propietario del lock Redis, transmission id, cadencia y tamaño.
- GPS valida tenant, unidad y Chofer asignado; emisiones se segmentan por permiso/usuario.
- No se mantienen rooms cruzados de RTC y los eventos de señalización requieren membresía activa.

## Background, offline y multiempresa

- Background GPS usa el token vigente y el backend vuelve a validar tenant/unidad/Chofer.
- La cola offline se elimina al cerrar o reemplazar sesión, evitando replay bajo otra identidad/empresa.
- El replay conserva únicamente payload operativo; actor y tenant se recalculan en backend.
- Las pruebas de tenant isolation cubren vehículos, recorridos, incidencias, usuarios, Chat y notificaciones cruzadas.

## Pruebas y builds

- Backend: suite completa correcta, incluida `rbac-integration.test.js`.
- Mobile: 21 suites, 98 pruebas correctas.
- Casos cubiertos: permitido/denegado por rol, tenant cruzado, sesión revocada, usuario suspendido, refresh revocado, JWT inválido, offline/background, reconexión, Radio/Chat y jornadas.
- TypeScript Mobile y Ventas: correcto.
- ESLint Mobile: limpio.
- Build Ventas: correcto; advertencia informativa por chunk de mapa mayor a 500 kB.
- APK Release y AAB Release: correctos.
- `git diff --check`: correcto.

## Archivos principales modificados

- Backend: `authenticate.js`, `access-control.js`, `sessions.js`, `sockets/index.js`; rutas Account, Commercial, Users, Vehicles, Locations, Navigation, Incidents y Activation Keys; prueba RBAC y script de tests.
- Mobile: `root-store.ts`, `api/client.ts`, `types/app.ts` y limpieza ESLint relacionada.
- Ventas/Portal: guards de acciones administrativas en `use-app-store.ts` y protecciones existentes de App/Portal reutilizadas.

## Riesgos restantes

- No queda un defecto de autorización conocido en el código auditado.
- Riesgo operativo externo: una prueba de penetración contra el despliegue real y una prueba Socket multi-instancia con Redis administrado requieren ambiente/credenciales productivas; no se sustituyeron con datos falsos ni cambios de arquitectura.
