# ManeComb Ventas — QA funcional y UI

Este checklist corresponde al flujo actual de Ventas + Portal. No asume Mercado Pago: la autoridad de pago puede ser `manual`, `test` o un proveedor habilitado por backend.

## 1. Gate automático antes de desplegar

Desde `ventas/`:

```bash
npm ci
npm run typecheck
npm run verify:contracts
npm run build
```

Debe pasar también `verify:sales-actions`, que protege rutas literales, precondiciones de confirmaciones, estados asíncronos del checkout y jerarquía básica de botones.

## 2. Landing pública

- Abrir `/ventas` por acceso directo y por recarga.
- Probar header: Funciones, App móvil, Planes, iniciar sesión/portal.
- Probar CTA principal del hero y CTA secundario.
- Probar cada plan: seleccionar, cambiar plan y conservar `planId` al pasar por login/registro.
- Probar demo pública únicamente en el plan elegible de 2 unidades / 7 días.
- Probar FAQ: abrir/cerrar cada pregunta y navegación por teclado.
- Probar footer: Funciones, App móvil, Planes, Confianza, Contacto, Soporte comercial, Privacidad y Términos.
- Probar `mailto:` y `tel:` en un navegador/dispositivo que soporte esos esquemas.

## 3. Login, registro y recuperación

- Login vacío: no debe enviar petición.
- Login inválido: debe mostrar error y permitir reintento.
- Registro: correo/teléfono, contraseña y confirmación obligatorios.
- Contraseña: mínimo 8, letra Unicode, número y símbolo real.
- `contraseña123` debe fallar; `contraseña123!` debe pasar.
- Contraseñas distintas no deben crear usuario ni reservar el correo.
- Doble toque en submit no debe duplicar la petición.
- “Olvidé mi contraseña” debe conservar plan/demo pendiente.
- Recuperación con correo inválido no debe enviar.
- Reset sin token debe mantener “Guardar nueva contraseña” deshabilitado.
- Reset válido debe volver a login sin perder contexto comercial.

## 4. Checkout

- Abrir `/ventas/pago?planId=<plan>` sin sesión: debe redirigir a registro conservando plan.
- Con sesión: debe cargar precio/capacidad del backend, nunca un precio inventado por UI.
- Si el proveedor no responde, debe aparecer estado de error; no debe quedar un spinner infinito.
- Doble toque en pagar/activar no debe crear dos órdenes.
- Trial sin tarjeta: activar una sola vez por organización y sin cargo.
- Trial con tarjeta opcional: validar tarjeta demo, guardar solo metadatos permitidos y no CVV/número completo.
- Pago manual: generar orden y mostrar importe/referencia de backend.
- Add-on Radio: sumar solo cuando el plan lo permite y nunca durante trial.
- Si backend devuelve un importe distinto al seleccionado, bloquear la orden y mostrar error.
- Retorno del proveedor: éxito, pendiente, fallo y error de red deben terminar en un estado visible; nunca permanecer indefinidamente en “Validando pago”.

## 5. Portal — navegación y sesión

- Abrir directamente y recargar: `/portal`, `/portal/usuarios`, `/portal/unidades`, `/portal/rutas`, `/portal/plan`, `/portal/pagos`, `/portal/facturacion`, `/portal/perfil`, `/portal/onboarding`, `/portal/documentos`, `/portal/incidencias`, `/portal/app-movil`.
- Desktop: probar cada item del sidebar.
- Móvil: abrir/cerrar drawer, tocar fuera, navegar por cada item y comprobar que el drawer cierre.
- Breadcrumb “Portal” debe volver al inicio.
- Logo debe volver a Ventas.
- Cerrar sesión debe invalidar la sesión y no restaurarla al volver atrás.
- Roles sin permiso no deben ver ni ejecutar acciones protegidas.

## 6. Portal — Equipo

- Editar estado administrativo y guardar.
- Propietario: el botón de eliminación debe estar deshabilitado.
- Conductor con unidad actual: la unidad debe aparecer marcada como `actual`.
- Confirmar asignación sin cambiar unidad debe quedar deshabilitado para evitar no-op.
- “Sin unidad” debe liberar correctamente la unidad.
- Dar de baja: motivo mínimo válido y preflight cargado antes de habilitar confirmación.
- Con jornada activa: baja administrativa debe cerrar la jornada según backend, revocar sesiones y liberar unidad/cupo.
- Eliminar conductor: solo después de baja, sin unidad/jornada, motivo válido y texto exacto `ELIMINAR`.

## 7. Portal — Unidades

- Crear y editar: nombre, placas, kilometraje y estado.
- Inputs inválidos no deben enviar petición.
- Buscar y filtros: Todas, Disponibles, Asignadas, Mantenimiento, retiradas.
- Abrir retiro: mientras carga el impacto, confirmar debe estar deshabilitado.
- Con conductor o jornada activa: confirmar retiro debe estar bloqueado y ofrecer navegación para resolver la dependencia.
- Con ruta asignada pero sin bloqueo duro: informar que la ruta se liberará automáticamente y permitir retiro.
- Sin historial/dependencias: eliminación permanente.
- Con historial: retiro conservando evidencia.

## 8. Portal — Rutas

- Crear ruta, seleccionar origen/destino, checkpoints, guardar y editar.
- Buscar, ordenar y filtrar catálogo.
- Asignar ruta a unidad y sobrescribir con confirmación.
- Liberar ruta.
- Intentar eliminar una ruta aún asignada: backend debe rechazarla con feedback visible; tras desasignar debe eliminarse.
- Aprobar/rechazar ruta aprendida sin doble submit.
- Durante recalculado rápido, solo el plan más reciente debe actualizar geometría/métricas.

## 9. Portal — Plan, pagos y facturación

- Comparar planes y abrir preview antes de cambiar.
- Acciones de cambio deben respetar la decisión devuelta por la autoridad comercial.
- Cancelación: modal, estado de procesamiento y feedback.
- Pagos: reintentar/regenerar solo cuando existe `planId`; pendiente no debe aparentar activación.
- Evidencia SPEI: validar campos, enviar una vez y mostrar resultado.
- Facturación: descarga válida y error visible si el servidor/enlace falla.

## 10. Portal — Activación, incidencias, perfil y App Móvil

- Keys: generar solo con cupo, copiar, compartir, revocar y eliminar con feedback.
- Key usada no debe volver a estar disponible.
- Incidencias: filtros, detalle y cambio de estado.
- Perfil personal/empresa: validaciones y loading durante guardado.
- Cambio de contraseña y sesiones remotas: confirmar, bloquear doble acción y actualizar lista.
- App Móvil: reintentar carga, descargar APK, QR, tabs y versiones; error de enlace debe ser visible.

## 11. Matriz responsive y accesibilidad

Probar al menos 320, 360, 390, 430, 768, 1024 y escritorio ancho.

- Ningún CTA debe quedar fuera de pantalla o tapado por teclado.
- Targets táctiles principales >= 44 px.
- Botones disabled/loading deben verse y anunciarse como disabled/busy.
- Secundarios/destructivos deben tener jerarquía visual clara.
- Modales deben cerrar con Cancelar/Back cuando no estén procesando.
- Navegación por teclado y foco visibles en web.

## 12. Cierre de producción

La auditoría automática certifica contratos de código. Antes de declarar PASS físico/productivo todavía hay que ejecutar esta matriz contra el deployment real con una cuenta de prueba y datos controlados, verificando backend, correo, pagos y permisos reales.
