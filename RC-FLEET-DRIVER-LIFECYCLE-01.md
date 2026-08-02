# RC-FLEET-DRIVER-LIFECYCLE-01 — Ciclo profesional de flota y conductores

**Estado:** Cerrado técnicamente — validación autenticada y en dispositivo pendiente
**Veredicto:** `RC_FLEET_LIFECYCLE_CODE_READY_DEVICE_PENDING`
**Base:** `e76965b` (`origin/main`)
**Rama:** `codex/rc-fleet-driver-lifecycle-01`
**Commit previsto:** `feat(fleet): complete driver offboarding and unit lifecycle`

## 1. Objetivo y alcance

Esta RC cierra el ciclo administrativo entre unidades, conductores, cupos comerciales y claves de activación sin reconstruir los módulos existentes. El cambio reutiliza los modelos, repositorios, stores, rutas, componentes del Portal y navegación Mobile actuales.

Quedaron fuera de alcance pagos, Mercado Pago, planes y checkout, correo, recuperación de contraseña, documentos, rutas aprendidas, GPS, Mapbox, chat, radio, WebRTC, checklist, incidencias, Admin Global, Platform Auth y MFA.

## 2. Diagnóstico Git inicial

| Verificación | Resultado |
| --- | --- |
| Worktree | `C:\proyectos\combis-app-fleet-lifecycle` |
| Rama | `codex/rc-fleet-driver-lifecycle-01` |
| HEAD inicial | `e76965b` |
| `origin/main` | `e76965b` |
| Divergencia inicial | `0 0` |
| Estado inicial | limpio |

No se detectó trabajo ajeno en el worktree y no se modificó ningún otro worktree.

## 3. Modelo auditado y brechas atendidas

| Área | Implementación previa | Brecha confirmada | Cambio aplicado |
| --- | --- | --- | --- |
| Crear/editar unidad | CRUD y unicidad por organización existentes | Edición podía provocar una desvinculación implícita | Se conserva CRUD; mantenimiento con conductor o jornada exige resolver dependencias |
| Liberar unidad | `vehicleId: null` existía | No había contrato de dominio ni impacto previo | Operación bilateral, bloqueada por jornada y sin liberar cupo |
| Cambiar unidad | Actualización desde usuarios | Riesgo de carrera y desplazamiento silencioso | Reclamo condicional y transacción Mongo; el perdedor recibe `409` |
| Eliminar unidad | Eliminación directa | No distinguía unidad nueva de unidad histórica | Eliminación física solo sin dependencias; retiro para unidades con historial |
| Historial de unidad | Sesiones, posiciones, documentos, incidencias y viajes | No gobernaba la eliminación | Vista de impacto agrega dependencias y decide eliminar o retirar |
| Crear key | Servicio compartido existente | Capacidad calculada antes de persistir podía competir | Reserva serializada por orden comercial y creación atómica |
| Usar key | Registro la marcaba `used` | Estado del conductor no era visible tras la baja | Se conserva `usedByDriverId` y se agrega `usedByDriverState` |
| Revocar/eliminar key | Operaciones existentes | Acción inmediata y valor visible en estados históricos | Confirmación en Portal; solo `available` conserva acciones y valor completo |
| Cupos del plan | Activos + keys disponibles | Reactivación podía superar el plan | Reactivación bloqueada con `409 capacity`; generación y reactivación comparten bloqueo |
| Dar de baja | Suspensión genérica | No liberaba integralmente unidad, sesiones y cupo | Acción explícita, idempotente, transaccional y auditada |
| Reactivar | Cambio de estado | Restauración/capacidad no gobernadas | Requiere plan y cupo; no restaura unidad, key ni sesiones |
| Eliminar conductor | Eliminación genérica | Riesgo de destruir trazabilidad | Baja previa, confirmación `ELIMINAR`, motivo y soft delete |
| Sesiones | Servicio de sesión existente | Baja no garantizaba revocación total | Todas las sesiones se revocan después de confirmar la baja |
| Jornadas activas | RouteSession existente | Operaciones administrativas podían competir con una jornada | Liberar, cambiar, dar de baja, retirar y eliminar se bloquean según dependencia |
| Tenant | Scopes presentes en rutas principales | Faltaba cobertura uniforme en el ciclo | Búsquedas y mutaciones incluyen `organizationId`; otro tenant responde no encontrado |
| Eventos realtime | Eventos por recurso | No había semántica completa de ciclo | Eventos de ciclo y resumen, limitados a organización y sin claves completas |
| Portal | Pantallas existentes | Orden operativo poco guiado | Modales de impacto y administración, selectores y checklist contextual |
| Mobile suspendido | Refresh/login genéricos | Una baja podía parecer token inválido o dejar loader | Código `ACCOUNT_SUSPENDED`, limpieza de sesión y pantalla específica |

## 4. Reglas de claves de activación

Regla inmutable: **una key `used` nunca vuelve a `available`.**

- La key usada conserva `usedByDriverId`, `usedAt` y su asociación histórica.
- La baja cambia únicamente `usedByDriverState` a `offboarded`; la eliminación segura lo cambia a `deleted`.
- Las keys `used`, `revoked` y `expired` se presentan enmascaradas.
- Solo una key `available` puede copiarse, compartirse, revocarse o eliminarse.
- Liberar una unidad no crea ni habilita un cupo nuevo porque el conductor sigue activo.
- Dar de baja libera un cupo; desde ese momento el administrador puede generar manualmente una key nueva y distinta.
- No se genera una key automáticamente durante liberación o baja. En el flujo de reemplazo se genera una key nueva después de la baja; nunca se recicla la anterior.

La frase funcional “al liberar o dar de baja se genera una key nueva” se interpreta de forma compatible con las reglas obligatorias: la liberación de unidad no genera key, y la baja habilita la generación administrativa posterior.

## 5. Reglas de capacidad comercial

El cálculo conserva la semántica existente:

```text
reservedSlots = activeDrivers + availableKeys
availableSlots = maxDrivers - reservedSlots
```

| Estado | Consumo de cupo |
| --- | --- |
| Conductor activo con unidad | 1 |
| Conductor activo sin unidad | 1 |
| Key `available` | 1 reservado |
| Key `used` | 0 adicional; el conductor activo ya consume el cupo |
| Conductor suspendido | 0 |
| Conductor eliminado | 0 |

La generación de keys y la reactivación usan el mismo límite autoritativo. En Mongo se bloquea la orden comercial dentro de una transacción para serializar el último cupo. Resultado: reactivación sin cupo devuelve `409`; con cupo queda activa y sin unidad.

## 6. Servicio de dominio y contratos

Se creó `backend/src/services/driver-lifecycle.js` como propietario de las reglas de ciclo. Expone operaciones equivalentes a:

- vista previa de impacto del conductor;
- liberar o cambiar unidad;
- dar de baja;
- reactivar;
- eliminar conductor de forma segura;
- vista previa de eliminación de unidad;
- retirar o eliminar unidad según sus dependencias.

Contratos añadidos o endurecidos:

| Método y ruta | Propósito |
| --- | --- |
| `GET /api/users/:userId/lifecycle-impact` | Dependencias, bloqueos, advertencias y capacidad del conductor |
| `POST /api/users/:userId/offboard` | Baja profesional con motivo y liberación confirmada |
| `POST /api/users/:userId/reactivate` | Reactivación sujeta a plan y capacidad |
| `PATCH /api/users/:userId` | Liberación/cambio bilateral delegado al servicio |
| `DELETE /api/users/:userId` | Eliminación segura con `ELIMINAR` y motivo |
| `GET /api/vehicles/:vehicleId/deletion-impact` | Checklist de conductor, ruta, jornada e historial |
| `POST /api/vehicles/:vehicleId/retire` | Retiro histórico con motivo |
| `DELETE /api/vehicles/:vehicleId` | Eliminación física solo para unidad nunca usada |

Las respuestas de impacto no exponen tokens, refresh tokens, claves completas, coordenadas ni recursos de otro tenant.

## 7. Liberación, cambio y baja

### Liberar unidad

- mantiene activa la cuenta;
- deja `user.vehicleId = null` y `vehicle.driverId = null` en una sola transición lógica;
- devuelve la unidad a `available` cuando correspondía;
- bloquea una jornada activa;
- no cambia key, sesiones ni cupo.

### Cambiar unidad

- valida conductor, tenant, estado y jornada;
- reclama la nueva unidad con condición `status=available`, `driverId=null` y `retiredAt=null`;
- libera la anterior y actualiza al conductor dentro de la misma transacción Mongo;
- dos solicitudes concurrentes producen un ganador y un conflicto, sin desplazamiento silencioso.

### Dar de baja

- exige conductor del mismo tenant y motivo;
- bloquea jornada activa;
- libera la unidad;
- cambia la cuenta a `suspended` y presencia a `offline`;
- revoca todas las sesiones;
- conserva documentos, historial, `activationKeyId` y key `used`;
- libera el cupo y devuelve el resumen actualizado;
- es idempotente y no genera keys ni correos.

## 8. Reactivación y eliminación del conductor

La reactivación valida organización, plan vigente, capacidad y ausencia de eliminación. Cambia la cuenta a `active`, conserva la key histórica, no restaura sesiones ni unidad y mantiene presencia `offline` hasta el siguiente inicio de sesión.

La eliminación definitiva es una baja lógica para conservar evidencia. Solo procede cuando el conductor ya está suspendido, no tiene unidad ni jornada activa, incluye motivo y la confirmación exacta `ELIMINAR`. Los listados operativos omiten registros con `deletedAt`, pero las referencias históricas permanecen.

## 9. Retiro y eliminación de unidades

Se agregaron al modelo existente `retiredAt`, `retiredBy`, `retirementReason` y una versión de ciclo.

- Una unidad sin conductor, ruta, jornada, sesiones, posiciones, documentos, incidencias ni viajes puede eliminarse físicamente.
- Una unidad con historia debe retirarse.
- El retiro exige resolver antes conductor, ruta y jornada activa.
- Las consultas operativas excluyen retiradas.
- El Portal administrativo puede incluirlas mediante “Mostrar retiradas”.
- Una retirada no puede recibir conductor ni ruta y deja de formar parte del resumen operativo.
- No se altera la política de unicidad de código o placas.

## 10. Atomicidad, concurrencia y fallos

Mongo usa sesiones/transacciones para cambios de conductor-unidad, baja, reactivación, retiro y eliminación. El reclamo de la unidad nueva se realiza mediante escritura condicional. La capacidad se serializa incrementando la versión de la orden comercial dentro de la transacción.

El store embebido aplica las mismas reglas de dominio de manera síncrona. No existe un punto asíncrono entre la comprobación y mutación del reclamo embebido. Los resultados fallidos no dejan un conductor apuntando a una unidad que no lo apunta de regreso.

Riesgo operativo documentado: el despliegue Mongo debe soportar transacciones (replica set o clúster compatible). La validación local comprobó el comportamiento embebido y la forma de las operaciones Mongo; la ejecución autenticada contra el entorno real queda pendiente.

## 11. Aislamiento multi-tenant

Todas las operaciones nuevas resuelven `organizationId` desde el usuario autenticado y lo incluyen en lecturas y escrituras. Un administrador no puede consultar o mutar conductores, unidades ni capacidad de otra organización; el contrato responde como recurso no encontrado para no revelar existencia.

La activación mantiene el scope de empresa y una unidad solo puede asignarse cuando pertenece a la misma organización.

## 12. UX del Portal

### Unidades

- resumen compacto: total, disponibles, asignadas, mantenimiento y retiradas;
- búsqueda por código o placas;
- filtros de estado y visualización de retiradas;
- modal de impacto con checklist de jornada, conductor, ruta, documentos e historial;
- acciones contextuales para abrir Equipo, Rutas o Jornada;
- eliminación únicamente sin historial y retiro con motivo cuando existe evidencia.

### Equipo

- filas administrativas limpias en lugar de todos los vehículos como chips;
- una acción principal “Administrar” abre el flujo contextual;
- selector limitado a unidades disponibles;
- acciones separadas para cambiar/liberar unidad, dar de baja, reactivar y eliminar definitivamente;
- baja prioritaria y eliminación secundaria con confirmación fuerte;
- mensajes explican si la unidad vuelve a estar disponible y si se liberó cupo.

### Activación

- resumen se refresca tras cambios de ciclo;
- keys históricas se muestran enmascaradas y con estado del conductor;
- solo las disponibles ofrecen copiar, compartir, revocar o eliminar;
- revocación y eliminación requieren `ConfirmModal`;
- al recuperar capacidad vuelve a habilitarse la generación de una nueva key.

## 13. Mobile — cuenta suspendida

El backend diferencia una cuenta suspendida con el código `ACCOUNT_SUSPENDED`, tanto en autenticación protegida como en refresh. Mobile intercepta ese código, limpia la sesión y muestra:

> Acceso suspendido
> Tu cuenta fue dada de baja por el administrador de la empresa. Contacta a tu empresa si consideras que se trata de un error.

La acción “Volver al inicio” retorna al acceso sin presentar el caso como plan vencido, error del servidor o token inválido.

## 14. Eventos y auditoría

Se reutiliza la emisión por organización y se incorporan las señales necesarias: `driver:offboarded`, `driver:reactivated`, `vehicle:released`, `vehicle:retired` y `activation:summary-updated`.

Los payloads contienen usuario/unidad sanitizados y solo el resumen de capacidad. No contienen keys, tokens, contraseñas, refresh tokens ni coordenadas. Las acciones registran actor, organización, recurso afectado, motivo, fecha y resultado mediante la auditoría existente.

## 15. Archivos afectados

### Backend

- `backend/package.json`
- `backend/src/data/models.js`
- `backend/src/data/mongo-store.js`
- `backend/src/data/repositories/fleet-repository.js`
- `backend/src/data/repositories/user-repository.js`
- `backend/src/data/store.js`
- `backend/src/middlewares/authenticate.js`
- `backend/src/modules/auth/routes.js`
- `backend/src/modules/navigation/routes.js`
- `backend/src/modules/users/routes.js`
- `backend/src/modules/vehicles/routes.js`
- `backend/src/services/activation-keys.js`
- `backend/src/services/driver-lifecycle.js` (nuevo)
- `backend/test/driver-lifecycle.test.js` (nuevo)
- `backend/test/driver-unit-assignment.test.js`

### Ventas / Portal

- `ventas/features/portal/onboarding/components/activation-key-row.tsx`
- `ventas/features/portal/screens/portal-onboarding-screen.tsx`
- `ventas/features/portal/screens/portal-units-screen.tsx`
- `ventas/features/portal/screens/portal-users-screen.tsx`
- `ventas/features/portal/store/portal-actions.ts`
- `ventas/features/portal/units/units.styles.ts`
- `ventas/features/portal/units/units.utils.ts`
- `ventas/features/portal/users/components/portal-driver-assignments.tsx`
- `ventas/features/portal/users/users.styles.ts`
- `ventas/src/lib/api.ts`
- `ventas/src/store/use-app-store.ts`
- `ventas/src/types/app.ts`

### Mobile

- `mobile/App.tsx`
- `mobile/src/api/client.ts`
- `mobile/src/navigation/linking.ts`
- `mobile/src/screens/account-suspended-screen.tsx` (nuevo)
- `mobile/src/store/root-store.ts`

### Documentación

- `RC-FLEET-DRIVER-LIFECYCLE-01.md` (nuevo)

## 16. Pruebas y builds

| Validación | Resultado | Evidencia resumida |
| --- | --- | --- |
| Backend `npm test` | aprobado | 32 comandos de prueba, incluido el nuevo pretest de ciclo |
| Prueba focal de ciclo | aprobado | Baja, sesiones, capacidad, keys, tenant, retiro y carrera de asignación |
| Mobile `npm run typecheck` | aprobado | sin errores TypeScript |
| Mobile `npm test` | aprobado | 26 suites, 139 pruebas |
| Android `gradlew.bat assembleDebug --no-daemon --console=plain` | aprobado | `BUILD SUCCESSFUL`; 623 tareas |
| Ventas `npm run typecheck` | aprobado | sin errores TypeScript |
| Ventas `npm run build` | aprobado | 640 módulos; solo advertencia informativa de tamaño de chunks |
| `node --check` en JS modificados | aprobado | sin errores de sintaxis |
| `git diff --check` | aprobado | sin errores de whitespace |

Las pruebas de ciclo demuestran que la liberación actualiza ambos lados sin liberar cupo, la baja revoca sesiones y conserva la key usada, una nueva key es distinta, la baja repetida es idempotente, otro tenant no puede reactivar, la reactivación sin cupo falla, una unidad histórica se retira, una unidad nueva se elimina y una carrera de asignación tiene exactamente un ganador.

## 17. Validación manual

No se contó con credenciales autenticadas de Portal ni con una sesión real de conductor durante esta RC. Por ello no se declara validado manualmente:

- los flujos A–F completos en Portal contra el backend desplegado;
- viewports de 375, 768 y 1440 px con datos reales;
- el cierre de sesión por baja en un dispositivo físico;
- la transacción Mongo contra el clúster de producción.

El bundle del Portal, el typecheck de Mobile, sus pruebas y el APK debug sí fueron construidos. Esta diferencia justifica el veredicto `CODE_READY_DEVICE_PENDING` y evita afirmar una validación no ejecutada.

## 18. Riesgos pendientes

1. Confirmar en un entorno autenticado que el usuario administrador posee permisos para todos los contratos nuevos.
2. Ejecutar una carrera real sobre Mongo para comprobar las garantías del despliegue transaccional.
3. Recorrer los viewports requeridos con una flota grande y datos históricos.
4. Dar de baja una cuenta de prueba con la app abierta, en segundo plano y cerrada.
5. Verificar visualmente que mapas y selectores no muestran unidades retiradas después de recibir los eventos.

No queda identificado en código un blocker de key reutilizable, fuga entre tenants, doble asignación, reactivación por encima del plan, sesión conservada o destrucción de historial.

## 19. Resultado funcional demostrado

```text
Conductor A usa Key A y toma C-1
        ↓
Administrador da de baja a Conductor A
        ↓
C-1 queda disponible y el plan recupera un cupo
        ↓
Key A permanece used y enmascarada
        ↓
Administrador genera manualmente Key B, distinta
        ↓
Conductor B puede usar Key B y reclamar C-1 una sola vez
```

## 20. Rollback

Después de crear el commit, el rollback será:

```bash
git revert <HASH_REAL_RC_FLEET_DRIVER_LIFECYCLE_01>
```

No ejecutar `reset`, `rebase`, merge, push ni revert como parte del cierre.

## 21. Veredicto

`RC_FLEET_LIFECYCLE_CODE_READY_DEVICE_PENDING`

El código, pruebas automatizadas, typechecks y builds están aprobados. El estado no se eleva a `READY` hasta completar la validación autenticada del Portal, la ejecución en Mongo desplegado y la prueba física de Mobile.
