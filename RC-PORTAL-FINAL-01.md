# RC-PORTAL-FINAL-01

## Certificacion final del Portal Operativo

Fecha: 2026-07-16  
Alcance: `ventas/`, integraciones existentes en `backend/` y persistencia ya expuesta por la API.  
Resultado: **APROBADO**.

No se crearon endpoints, pantallas ni una segunda implementacion de logica movil.

## Evidencia por modulo

| Modulo | Ruta | Consumidor | Fuente existente | Resultado |
| --- | --- | --- | --- | --- |
| Dashboard / Operaciones | `/portal` | `PortalDashboardScreen` | usuarios, unidades, historial, metricas, eventos, checkpoints y posiciones | Aprobado |
| Mapa operativo | `/portal` | `OperationsMap` | ubicacion y progreso incluidos en unidades; geometria y posiciones de jornada | Aprobado |
| Empresa | `/portal/perfil?section=empresa` | `PortalProfileScreen` | perfil de cuenta | Aprobado |
| Equipo | `/portal/usuarios` | `PortalUsersScreen` | API de usuarios | Aprobado con permiso `users` |
| Unidades | `/portal/unidades` | `PortalUnitsScreen` | API de unidades | Aprobado con permiso `vehicles` |
| Rutas | `/portal/rutas` | `PortalRoutesScreen` | asignacion existente sobre unidades | Aprobado con permiso `routes` |
| Seguridad | `/portal/perfil?section=seguridad` | `PortalProfileScreen` | sesiones activas y revocacion | Aprobado |
| Mi plan | `/portal/plan` | `PortalPlanScreen` | suscripcion y planes comerciales | Aprobado con permiso `billing` |
| Facturacion | `/portal/facturacion` | `PortalBillingScreen` | facturas de cuenta | Aprobado con permiso `billing` |
| Pagos | `/portal/pagos` | `PortalPaymentsScreen` | orden y suscripcion persistidas | Aprobado con permiso `billing` |
| Activacion | `/portal/onboarding` | `PortalOnboardingScreen` | onboarding y activation keys | Aprobado |
| Soporte | `/portal/perfil?section=soporte` | `PortalProfileScreen` | canales existentes | Aprobado |

## Cadena de integracion verificada

`UI -> hooks/store -> cliente API -> rutas backend existentes -> store Mongo/embebido -> render`

- El layout protege el portal, aplica permisos y dirige cada opcion del menu a un consumidor real.
- `useAppStore` mantiene usuarios y unidades; `usePortalStore` mantiene cuenta, plan, facturas, sesiones, onboarding y activation keys.
- Operaciones reutiliza los endpoints existentes de historial, metricas, eventos, checkpoints y posiciones de jornada.
- El mapa consume las mismas ubicaciones y asignaciones operativas presentes en las unidades. No introduce otra fuente de seguimiento.
- Las tarjetas operativas se calculan a partir de unidades y jornadas cargadas; no contienen fixtures de portal.

## Correcciones de certificacion

- El mapa ya no muestra nombres de variables de entorno ni instrucciones para desarrolladores. Si Mapbox falta o falla, conserva una vista funcional con la ultima ubicacion real por unidad o recorrido.
- Los filtros dejaron de truncar unidades, conductores y rutas.
- Estados de jornada se presentan en espanol.
- Filtros, detalle e historial muestran codigo de unidad, nombre de conductor y nombre de ruta en lugar de UUID cuando existe la relacion.
- Los errores de las consultas de jornada pasan por el normalizador existente y no imprimen excepciones internas directamente.
- Se mantuvo la composicion compacta existente; no se agregaron tarjetas ni contenido artificial.

## Validacion

- TypeScript: `npm run typecheck` aprobado.
- Build Vite: `npm run build` aprobado.
- Smoke manual:
  - `/ventas` renderiza correctamente.
  - `/portal` sin sesion redirige a `/ventas/login`.
  - La pantalla de acceso no registra errores de consola.
  - Navegacion, consumidores y permisos autenticados fueron verificados en codigo contra el router y los stores.
- `git diff --check`: aprobado para el arbol de trabajo. Los cambios concurrentes ajenos al Portal se preservaron y no forman parte de esta certificacion.

## Conclusion

El Portal reutiliza la infraestructura existente, no expone configuracion tecnica del mapa, no trunca filtros operativos y no presenta identificadores internos como etiqueta principal. Las opciones del menu tienen consumidor y control de acceso. El bloque queda listo para produccion dentro de la configuracion y credenciales del entorno de despliegue.
