# RC-PORTAL-UX-HARDENING-20260805

## Veredicto

`PORTAL_UX_CODE_READY_BROWSER_CERT_PENDING`

Esta rama consolida el endurecimiento funcional y visual de Ventas/Portal sobre el `main` que ya incluye la expansión comercial de la landing y la prueba de siete días limitada al plan inicial de dos unidades.

No se modifica la lógica móvil operativa, GPS, Radio, RTC ni Seguimiento. Los cambios se concentran en cuenta, seguridad, pagos, planes, activación, unidades, rutas, documentos, incidencias y distribución de la app.

## 1. Seguridad y perfil

- Se añadió `POST /api/users/me/change-password`.
- Exige contraseña actual, nueva contraseña y confirmación.
- Verifica la contraseña actual mediante la fuente de autenticación existente.
- Aplica la política central de contraseña.
- Impide reutilizar inmediatamente la contraseña vigente.
- Conserva la sesión actual y revoca las demás.
- Registra auditoría y envía aviso de seguridad.
- Se añadió `DELETE /api/users/me/sessions/others`.
- El Portal muestra requisitos, visibilidad controlada, resultado y cierre masivo de sesiones.
- Los datos personales y los datos de empresa tienen acciones de guardado independientes.
- Las sesiones muestran creación, última actividad, vencimiento y ubicación aproximada cuando existe.

## 2. Pagos y facturación

- El modo manual productivo utiliza SPEI como método efectivo.
- La tarjeta simulada queda restringida al modo de pruebas declarado por backend.
- El Portal ya no presenta la bóveda demo como un método real de cobro.
- Pagos muestra estado de la orden, mensualidad, periodo, capacidad y pasos de validación.
- Facturación conserva el historial y la descarga de comprobantes, sin duplicarlo en Pagos.
- La activación del plan sigue dependiendo exclusivamente de confirmación de backend.

## 3. Planes

- Las tarjetas del Portal reutilizan la identidad visual de la landing: tonos, bordes, degradados, icono y énfasis por plan.
- Se mantiene la lectura administrativa: plan actual, comparación y vista previa de cambio.
- No se duplican precios ni beneficios en una fuente nueva; el contenido continúa viniendo del contrato comercial.

## 4. Keys de activación

- Se muestran keys disponibles, usadas, expiradas y revocadas.
- Se puede elegir vigencia de 1, 7, 14 o 30 días antes de generar.
- La key deja de funcionar al usarse, vencer o revocarse.
- Las keys no se borran al usarse: permanecen enmascaradas como evidencia de auditoría.
- Copiar y compartir siguen disponibles únicamente para keys vigentes.
- El backend mantiene eliminación física solo para keys disponibles y sin asociación.

## 5. Unidades

- Se conserva el lifecycle canónico que calcula dependencias antes de eliminar o retirar.
- Una unidad sin historial puede eliminarse definitivamente.
- Una unidad con evidencia se retira y conserva documentos, recorridos e historial.
- Las unidades retiradas se muestran como archivo de solo lectura y ya no ofrecen edición operativa.
- La acción visual se llama retiro/revisión y no promete borrado cuando el resultado puede ser conservación histórica.

## 6. Rutas

- Se añadió un cliente tipado para `/api/navigation/assignments`.
- El panel visible lista todas las asignaciones de una unidad.
- Muestra estado, prioridad, programación, selección por conductor y ruta activa.
- La creación de una asignación no sobrescribe automáticamente la ruta operativa.
- La activación utiliza versión esperada y el motor canónico de asignaciones.
- La vista previa dejó de ejecutar la asignación directa legada.
- El endpoint legado `/api/navigation/assign` permanece temporalmente en backend por compatibilidad con consumidores anteriores, pero ya no es la acción observable del Portal.
- El archivo contenedor histórico conserva algunos helpers inertes hasta una modularización posterior; no reciben una acción visible y no son el escritor utilizado por el panel nuevo.

## 7. Otras vistas

### Documentos

- Se eliminó del archivo público el cuerpo completo de la implementación anterior que permanecía comentado.
- La pantalla exporta únicamente el módulo administrativo vigente.

### Incidencias

- Se añadió resumen de total, abiertas, en atención y resueltas.
- Las alertas críticas pendientes quedan visibles.
- Los contadores funcionan como filtros rápidos.
- Se añadió actualización manual y el detalle refleja el estado confirmado.

### App móvil

- Se fortaleció la carga de información de release.
- La generación de QR maneja cancelación y error.
- La descarga valida que el enlace pueda abrirse y muestra fallo visible.
- Historial muestra un estado vacío cuando solo existe una versión.
- Se mantienen separados Información, Historial y Administración.

## 8. Integración Git

- Rama: `feat/portal-ux-hardening-20260805`.
- PR: `#19`.
- La rama fue actualizada mediante merge commit real con el `main` comercial vigente.
- Se conservaron los gates de `commercial-activation.test.js` y se añadió `account-security.test.js`.
- No se usó force push.

## Gates requeridos

- Backend tests.
- Communication Service tests.
- Ventas typecheck y build.
- Admin Global typecheck y build.
- Mobile typecheck, lint y tests.
- Contrato de entorno, Docker/Compose y smoke tests.
- Auditoría de dependencias.
- Android debug APK.
- Cloudflare Pages preview.

## Certificación manual pendiente

Antes de publicar, validar en navegador real:

1. Cambio de contraseña correcto e incorrecto.
2. Revocación de una sesión y cierre de todas las demás.
3. Pago manual mostrando únicamente SPEI.
4. Pago test mostrando tarjeta simulada solo en entorno de pruebas.
5. Comparación de todos los planes en escritorio y móvil.
6. Generación de keys con las cuatro vigencias.
7. Uso, vencimiento, revocación y conservación enmascarada.
8. Eliminación de unidad sin historial y retiro con historial.
9. Creación de varias asignaciones de ruta, programación y activación.
10. Descarga y QR de APK.
11. Filtros y cambio de estado de incidencias.
12. Resoluciones de 360, 768, 1024, 1280 y 1440 px.

## Límite honesto

Los gates automáticos certifican contratos, compilación y regresiones. No sustituyen la prueba visual autenticada contra datos reales, la validación de una transferencia bancaria ni la interacción del Portal con una jornada real en curso.
