# ManeComb Driver Experience — Master

## Alcance

Consolidar la jornada operativa reutilizando la lógica existente de asignación conductor-unidad, asignación unidad-ruta, sesiones de ruta, checklist, GPS, incidencias, comunicación, seguimiento e historial. No se creará un sistema paralelo.

## Rama

- Base: `main`
- Trabajo: `agent/mdx-journey-consolidation`

## Principios

1. Backend como fuente única de verdad.
2. Aislamiento estricto por `organizationId`.
3. Transiciones idempotentes y auditadas.
4. Aplicación móvil y portal administrativo muestran el mismo estado.
5. Reutilizar modelos, servicios, repositorios, eventos y pruebas existentes.
6. No dividir archivos grandes sin una responsabilidad clara.
7. No eliminar código hasta comprobar consumidores, rutas, pruebas y compatibilidad.
8. No incrementar versión hasta cerrar una entrega funcional.

## Hallazgo inicial

El modelo actual ya contiene conceptos operativos distribuidos: `user.shift`, `user.status`, `user.vehicleId`, `operationalSchedule`, rutas asignadas, sesiones de ruta y seguimiento. La jornada deberá consolidar estas piezas y no duplicarlas.

## Fases

| Fase | Objetivo | Estado |
|---|---|---|
| 0 | Línea base, commits, versiones, despliegues y configuración | EN_PROGRESO |
| 1 | Inventario de sistemas, consumidores, duplicados y legado | EN_PROGRESO |
| 2 | Contrato canónico de jornada y eventos | PENDIENTE |
| 3 | Match administrador-conductor-unidad-ruta | PENDIENTE |
| 4 | Preparación, checklist e inicio transaccional | PENDIENTE |
| 5 | Modo conducción y recuperación de estado | PENDIENTE |
| 6 | GPS, navegación y vinculación con jornada | PENDIENTE |
| 7 | Ritmo de ruta y coordinación entre unidades | PENDIENTE |
| 8 | Pausas, incidencias y sustitución de unidad | PENDIENTE |
| 9 | Finalización del conductor | PENDIENTE |
| 10 | Revisión y cierre administrativo | PENDIENTE |
| 11 | Historial conductor y administrativo | PENDIENTE |
| 12 | Congruencia de UI, navegación, permisos y estados | PENDIENTE |
| 13 | Limpieza de duplicados, fallbacks y legado | PENDIENTE |
| 14 | Certificación integral y regresión | PENDIENTE |
| 15 | Versionado, release y documentación final | PENDIENTE |

## Checklist obligatorio por fase

- [ ] Inventario de archivos y consumidores.
- [ ] Contrato de datos y estados.
- [ ] Reglas de negocio y permisos.
- [ ] Persistencia y aislamiento multiempresa.
- [ ] Tiempo real y reconexión.
- [ ] UI: carga, vacío, éxito, error y estado degradado.
- [ ] Pruebas automáticas nuevas.
- [ ] Pruebas existentes sin regresiones.
- [ ] Documentación de archivos modificados.
- [ ] Código duplicado o legado revisado.
- [ ] Veredicto de cierre.

## Criterio de cierre global

El administrador asigna; el conductor confirma; el sistema valida; el conductor prepara e inicia; seguimiento, GPS y ruta quedan vinculados; la app recupera la jornada tras reinicio; pausas e incidencias quedan auditadas; el conductor finaliza; el administrador revisa y cierra; el historial coincide; no quedan caminos operativos dobles; versión y documentación representan el código desplegable.
