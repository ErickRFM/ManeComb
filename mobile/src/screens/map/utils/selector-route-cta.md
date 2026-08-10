# Selector route CTA contract

- Crear ruta: `Continuar`.
- Editar ruta existente (`editingRouteId` presente): `Guardar cambios`.
- Mientras se recalcula/resuelve la ruta: `Calculando ruta...`.
- El CTA del mapa no crea una segunda autoridad de persistencia: conserva `editingRouteId` al regresar al Checklist, donde el flujo existente decide entre crear y actualizar la ruta.
