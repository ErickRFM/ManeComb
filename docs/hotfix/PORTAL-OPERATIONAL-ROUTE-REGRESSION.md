# Hotfix — regresión de rutas en Centro de operaciones

## Síntoma

Después de integrar Jornada, el Portal podía mostrar unidades con `Sin datos` y dejar de dibujar la ruta que antes estaba visible.

## Causa

La resolución de ruta cambió de:

```text
asignación de unidad → routeId de unidad → sesión
```

a:

```text
sesión/Jornada → asignación de unidad → routeId de unidad
```

Como `ASSIGNED` y `READY` ahora cuentan como jornadas vigentes, una jornada futura o incompleta podía sustituir silenciosamente la ruta operativa real.

## Corrección

Se restaura una autoridad estable:

```text
vehicle.assignedRoute.routeId
→ vehicle.routeId
→ activeSession.routeId como fallback
```

Jornada continúa disponible en `snapshot.journey`, pero no reemplaza la ruta operativa mientras la unidad conserve una asignación explícita.

## Validación

La regresión cubre:

- asignación operativa tiene prioridad;
- `vehicle.routeId` conserva prioridad de compatibilidad;
- la ruta de Jornada solo se usa cuando no existe asignación en la unidad.

## Alcance

No modifica datos, rutas guardadas, GPS, UI, pagos, permisos ni Jornada. Solo corrige la selección de la ruta utilizada para construir el snapshot REST y Socket.IO.
