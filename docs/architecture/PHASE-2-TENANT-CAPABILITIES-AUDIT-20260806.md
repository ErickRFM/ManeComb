# PHASE-2 — Auditoría de tenant y capacidades empresariales

## Estado

```text
PHASE_2_IMPLEMENTED
PHASE_2_VALIDATION_PENDING
PHASE_2_NOT_READY_TO_MERGE
```

| Dato | Valor |
|---|---|
| Rama | `refactor/tenant-capabilities-authority` |
| Base exacta | `97f8852608099934f8c0b1d95d9924113ecf2d4b` |
| Fase anterior | Fase 1 cerrada |
| Alcance | Tenant empresarial y capacidades |

## Decisiones

1. Las APIs empresariales siempre están limitadas a un `organizationId`.
2. Ningún rol empresarial puede leer todos los tenants.
3. Admin Global conserva su seguridad separada mediante `req.platformUser`, Cloudflare Access y permisos `platform.*`.
4. Los roles existentes no se reemplazan; el backend los traduce a capacidades canónicas según `accountChannel`.
5. Los nombres `canManage*` permanecen únicamente como aliases de compatibilidad.
6. Una combinación inválida de rol y tipo de cuenta obtiene cero capacidades; nunca se convierte en `owner` ni `viewer`.
7. El conductor solo recibe recursos de su tenant y de su unidad asignada en las proyecciones de flotilla.

## Capacidades canónicas

```text
portal.access
mobile.access
operations.use
tenant.access
users.manage
billing.manage
vehicles.manage
analytics.view
communication.rtc.access
routes.manage
documents.manage
incidents.manage
```

## Riesgos cerrados por la implementación

- `operations + admin` ya no funciona como administrador global.
- `company_owner` con rol incompatible ya no hereda permisos de `owner`.
- Un rol desconocido ya no hereda permisos de `viewer`.
- Los recursos de otro tenant fallan cerrados.
- Auditoría empresarial exige tenant y limita la consulta a la organización o al propio actor.
- Ventas consume capacidades emitidas por backend; el rol queda como compatibilidad para sesiones antiguas.

## Compatibilidad controlada

Los módulos existentes pueden seguir solicitando temporalmente:

- `canManageUsers`
- `canManageBilling`
- `canManageVehicles`
- `canViewAnalytics`
- `canAccessRTC`
- `canManageRoutes`
- `canManageDocuments`
- `canManageIncidents`

El middleware los normaliza a capacidades canónicas. No son una segunda autoridad.

## Validación requerida

- [ ] Matriz unitaria de capacidades.
- [ ] Tenant ausente rechazado.
- [ ] Operaciones admin limitado a su tenant.
- [ ] Identidad Platform sin capacidades empresariales.
- [ ] Rol/tipo incompatible sin capacidades.
- [ ] Conductor limitado a su unidad.
- [ ] Backend completo.
- [ ] Ventas typecheck, contratos y build.
- [ ] Mobile y Admin Global sin regresiones.
- [ ] Infraestructura y auditoría de dependencias.
- [ ] APK Android.
- [ ] Preview de Cloudflare.
- [ ] Cero review threads.
- [ ] SHA final certificado.
