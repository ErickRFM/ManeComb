# RC-VENTAS-PORTAL-HARDENING-20260805

## Estado inicial

`IN_PROGRESS`

Rama de trabajo:

```text
feat/ventas-portal-hardening-20260805
```

Base:

```text
daa26de066e81746ea504cbb1fceb5f824411098
```

## Objetivo

Cerrar funcional y visualmente Ventas/Portal sin duplicar lógica ni romper los contratos ya validados de ManeComb.

## Alcance

### A. Seguridad de cuenta

- Flujo dedicado para cambio de contraseña.
- Verificación de contraseña actual.
- Política de fortaleza centralizada.
- Confirmación de contraseña nueva.
- Revocación segura de otras sesiones.
- Auditoría y correo de seguridad.
- UX de sesiones activas y cierre remoto.

### B. Pagos y facturación

- Separar claramente Pagos de Facturación.
- SPEI como flujo productivo principal cuando el proveedor sea manual.
- Ocultar la tarjeta demo fuera de entornos de prueba.
- Línea de tiempo de orden, referencia e instrucciones de pago.
- Evitar duplicar facturas entre pantallas.

### C. Rutas

- Migrar el Portal del escritor legado `/navigation/assign` al modelo canónico `/navigation/assignments`.
- Mostrar múltiples asignaciones por unidad.
- Prioridad, vigencia, selección por conductor y estado.
- Separar catálogo, editor y asignaciones.
- Eliminar estados y acciones legadas únicamente cuando la nueva ruta esté cubierta por pruebas.

### D. Planes

- Unificar identidad visual entre landing y Portal.
- Tonos, gradientes, insignias e iconografía compartidos.
- Estados actuales, seleccionados, upgrade y downgrade claros.
- Mantener la lógica comercial existente.

### E. Perfil

- Guardado claro por sección.
- Etiquetas persistentes y mensajes por campo.
- Perfil personal, empresa, seguridad y soporte con jerarquía consistente.

### F. Unidades

- Diferenciar eliminar y retirar.
- Cargar impacto antes de permitir confirmar.
- Motivo de retiro validado.
- Historial y metadatos visibles.
- Estados retirados en modo lectura.

### G. Keys de activación

- TTL configurable.
- Reemplazo seguro de keys disponibles.
- Filtros y métricas por estado.
- Revocación y eliminación con copy correcto.
- Conservar evidencia de keys usadas, vencidas o revocadas.

### H. Auditoría UX/UI global

Revisar en 360, 768, 1024, 1280 y 1440 px:

- loading;
- vacío;
- error;
- éxito;
- permisos;
- confirmaciones destructivas;
- responsive;
- teclado;
- accesibilidad;
- tiempo real.

## Reglas de ejecución

- No hacer cambios directos en `main`.
- Commits separados por dominio.
- No duplicar servicios ni stores.
- Reutilizar contratos y componentes existentes.
- No borrar código legado hasta que la sustitución tenga pruebas.
- No declarar cierre sin typecheck, lint, tests y build.

## Gates finales

```text
backend tests
communication-service tests
ventas typecheck
ventas build
mobile typecheck
mobile tests
admin-global build
container smoke tests
android assembleDebug
```

## Veredicto de salida esperado

```text
VENTAS_PORTAL_HARDENED
ROUTES_ASSIGNMENT_MODEL_STANDARDIZED
ACCOUNT_SECURITY_READY
PAYMENTS_PRODUCTION_CLARIFIED
UX_UI_CONSISTENT
DEVICE_AND_PRODUCTION_CERT_PENDING
```
