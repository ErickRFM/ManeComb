# RC-RBAC-INTEGRATION-02

## Resultado

Integración RBAC certificada para Administrador, Supervisor y Chofer en UI, cliente, HTTP, Socket.IO y persistencia tenant-scoped.

## Matriz efectiva

| Acción | Administrador | Supervisor | Chofer |
| --- | --- | --- | --- |
| Directorio | Consultar y gestionar | Consultar | Sin acceso |
| Vehículos y rutas | Consultar y gestionar | Consultar y gestionar | Solo unidad/ruta asignada |
| Jornadas | Consultar y gestionar | Consultar y gestionar | Iniciar/cambiar estado solo en unidad asignada |
| Incidencias | Crear, consultar y resolver | Crear, consultar y resolver | Crear y consultar las propias/asignadas |
| Documentos | Subir, consultar, aprobar/rechazar | Subir, consultar, aprobar/rechazar | Subir/consultar solo propios o de su unidad |
| Chat, Radio y RTC | Conversaciones autorizadas | Conversaciones autorizadas | Conversaciones autorizadas |
| Ubicación | Flota autorizada | Consulta de flota autorizada | Actualización/consulta de su unidad |
| Observabilidad/exportaciones administrativas | Permitido | No permitido salvo consulta operativa autorizada | No permitido |
| Portal, facturación y suscripción | Según cuenta empresarial y `canManageBilling` | Sin acceso de cuenta operativa | Sin acceso |
| Perfil, contraseña y sesiones propias | Propias | Propias | Propias |

## Huecos cerrados

- Directorio Mobile y backend alineados: Supervisor puede consultar, pero crear, editar, eliminar, cambiar rol o suspender sigue reservado a gestión de usuarios.
- Chofer ya no puede resolver incidencias mediante una llamada HTTP directa.
- Inicio de jornadas y registro de recorridos exigen Chofer asignado o `canManageRoutes`.
- `chat:typing` y `chat:typing:stop` ignoran identidad suministrada por cliente y validan usuario autenticado, conversación, acceso operativo y room activa.
- Emisiones de llaves de activación, invitaciones, vehículos, ubicaciones, rutas, jornadas e incidencias dejaron de usar el room tenant completo. Se entregan por roles derivados de la matriz o directamente al Chofer afectado.
- La carga de Directorio para Supervisor ya no produce una pantalla autorizada con store vacío.
- Se agregó una prueba RBAC integrada y quedó incluida en la suite backend.

## Validación

- Backend: suite completa correcta.
- Mobile: 21 suites, 98 pruebas correctas.
- RBAC integrado: correcto para consulta/gestión de Directorio y resolución de incidencias.
- Jornadas, tenant isolation, Activation Keys, Chat, Radio, Mercado Pago y smoke general: correctos.
- TypeScript Mobile y Ventas: correcto.
- ESLint Mobile: correcto, sin errores ni advertencias.
- Build Vite Ventas: correcto.
- APK Release: `mobile/dist/app-release.apk`.
- AAB Release: `mobile/dist/app-release.aab`.
- `git diff --check`: correcto.

No se agregaron roles, permisos, endpoints, contratos ni funcionalidades.
