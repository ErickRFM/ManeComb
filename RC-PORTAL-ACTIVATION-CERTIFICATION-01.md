# RC-PORTAL-ACTIVATION-CERTIFICATION-01

## Resultado ejecutivo

Estado: **certificación condicionada; no apta todavía para certificación final de producción**.

La jerarquía y la unicidad de la acción principal quedaron corregidas usando únicamente datos y destinos existentes. Sin embargo, el contrato actual no permite distinguir entre `key creada` y `key compartida`: compartir usa `Share.share(...)`, muestra feedback local y no persiste un estado. Certificar ambos escenarios como estados diferentes sería afirmar algo que el sistema no conoce.

## Escenarios auditados

| Escenario | Evidencia existente | Mensaje principal | Acción de flujo visible | Resultado |
|---|---|---|---|---|
| Empresa nueva, sin key | Sin key disponible/usada | Genera una key para comenzar | Generar key | Conforme |
| Key creada, no compartida | Key `available` | Comparte la key con el conductor | Compartir | Conforme |
| Key compartida, sin primer login | Continúa siendo key `available` | Comparte la key con el conductor | Compartir | No distinguible del escenario anterior |
| Primer usuario conectado, faltan usuarios | Key `used`, primer login completado y primer paso pendiente | Continúa con el primer paso pendiente | Abrir | Conforme |
| Usuarios completos, falta configuración | Primer paso pendiente entregado por `onboarding.steps` | Continúa con el paso pendiente | Abrir | Conforme |
| Activación terminada | `onboarding.status === completed` | Activación completada | Ninguna acción de flujo | Conforme para estado terminal |

## Auditoría del asistente

- El estado actual aparece primero.
- El mensaje indica una sola instrucción breve.
- `Generar key`, `Compartir` y `Abrir` reutilizan los handlers y destinos existentes.
- La acción principal no se duplica dentro de la lista correspondiente.
- Los pasos completados y pendientes ya no muestran múltiples botones `Abrir`.
- La utilidad global `Actualizar` permanece disponible y no se presenta como acción del flujo.
- El estado terminal no propone una acción artificial.

## Jerarquía visual

Orden certificado en la composición:

1. Asistente contextual.
2. Acción correspondiente.
3. Progreso.
4. Plan, límite, cupos y keys.
5. Pasos existentes.
6. Historial como evidencia secundaria.

## Ruido eliminado

- Se retiraron los botones `Abrir` repetidos de cada paso.
- El único `Abrir` se presenta para el primer paso pendiente.
- El botón `Compartir` de la key destacada se mueve al asistente y no se repite en su fila.
- El botón `Generar key` se mueve al asistente y deja de repetirse en la cabecera de keys.
- El historial permanece al final y en variante compacta.

## Accesibilidad

- Las acciones contextuales tienen rol de botón y nombre accesible.
- Los estados deshabilitados conservan `accessibilityState` donde ya existía.
- Los títulos mantienen orden visual y semántico legible.
- No se eliminó información textual necesaria para comprender plan, keys, cupos o progreso.

## Responsive

La estructura usa `flex`, `flexWrap`, bases flexibles y anchos mínimos para 1366×768, 1440×900, 1600×900 y 1920×1080. No se añadieron alturas fijas de página ni contenedores con scroll interno.

La inspección visual autenticada local no pudo completarse: el portal redirige a `/ventas/login` y la sesión del dominio de producción no es transferible al servidor local. Por este motivo no se declara evidencia visual completa para las cuatro resoluciones.

## Cambios realizados

- Se consolidó la acción `Abrir` del primer paso pendiente en el asistente.
- Se eliminaron acciones de navegación duplicadas en la lista de pasos.
- Se añadieron etiquetas accesibles a las acciones existentes que carecían de ellas.

Archivo modificado:

- `ventas/features/portal/screens/portal-onboarding-screen.tsx`

## Cambios descartados

- No se creó un estado `shared`.
- No se persistió el resultado de `Share.share(...)`.
- No se agregó una API, endpoint, store, hook ni validación.
- No se simuló que una key fue compartida.
- No se alteró generación, copia, revocación o uso de keys.

## Validación técnica

- TypeScript: correcto.
- Build Vite: correcto.
- `git diff --check`: correcto.
- Backend, APIs, stores, hooks, persistencia y estados: sin cambios.

## Certificación final

La experiencia queda certificada estructuralmente para todos los estados que el sistema puede observar. La certificación integral de producción queda pendiente por dos evidencias objetivas:

1. El sistema no distingue `key creada` de `key compartida`.
2. Falta completar la inspección visual autenticada en las cuatro resoluciones solicitadas.

Resolver el primer punto requeriría ampliar persistencia o estados, algo expresamente prohibido por esta RC. Por tanto, no se realizó ese cambio.
