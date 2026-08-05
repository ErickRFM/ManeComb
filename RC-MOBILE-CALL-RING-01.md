# RC-MOBILE-CALL-RING-01 — Timbrado de llamadas entrantes

> **Estado actual (2026-08-05):** restaurado y revalidado en el PR `#1` sobre el `main` vigente. La implementación histórica descrita abajo se perdió durante integraciones posteriores; sus objetos `1b65a6f`, `9cba219`, `b9ee08b` y `db81394` ya no existen en el repositorio. La restauración actual vuelve a incluir backend, mobile, modal de llamada entrante, aceptación/rechazo/cancelación/timeout, protección de concurrencia y pruebas automatizadas. **Pendiente únicamente de certificación en dos dispositivos físicos y de TURN para redes restrictivas.**

## Diagnóstico histórico

La llamada WebRTC ya contaba con sala, offer/answer, ICE, CDR y servicio foreground, pero no existía un timbrado real antes de entrar al RTC room. Ambos clientes podían quedar en “1 en cabina”, y abrir una conversación podía registrar al usuario dentro de la sala aunque todavía no hubiera aceptado una llamada.

## Contrato restaurado

### Backend

- `rtc:call`: valida tenant, acceso a la conversación, ocupación y participantes.
- `rtc:incoming-call`: se entrega a las salas personales `user:{id}` de los destinatarios.
- `rtc:accept`: la primera aceptación válida gana y cancela los timbrados restantes.
- `rtc:reject`: permite rechazo individual; en una conversación grupal no corta a los demás hasta el último rechazo.
- `rtc:cancel`: el llamante cancela el intento pendiente.
- `rtc:call-accepted`, `rtc:call-rejected`, `rtc:call-cancelled` y `rtc:call-timeout`: estados explícitos para el cliente.
- Registro temporal central con expiración de 35 segundos y bloqueo de llamadas superpuestas por usuario.
- Limpieza de llamadas pendientes al desconectarse llamante o destinatario.

### Mobile

- Entrar a una conversación ya no entra automáticamente al RTC room.
- El llamante obtiene medios, entra a la sala y después solicita el timbrado.
- El destinatario ve un modal de “Llamada entrante” con nombre, tipo de llamada, aceptar y rechazar.
- El destinatario solo entra al RTC room después de aceptar.
- Rechazo, cancelación, timeout, ocupación y desconexión limpian medios, temporizadores y estado.
- El socket de llamada se registra en la sala personal del usuario para recibir el timbrado mientras la pantalla de chat está montada.

## Seguridad

- El backend obtiene los destinatarios desde la conversación persistida; el cliente no puede elegir IDs arbitrarios.
- Aceptar y rechazar requieren que el usuario pertenezca al conjunto de destinatarios del intento.
- Cancelar requiere ser el llamante.
- Solo existe un intento pendiente por usuario; esto evita llamadas cruzadas y estados huérfanos.
- El RTC room mantiene su límite de dos participantes y sus validaciones de tenant/acceso existentes.

## Validación automatizada

- Suite completa backend: aprobada.
- Pruebas del registro de llamadas pendientes: creación, aceptación, rechazo grupal, timeout, concurrencia y desconexión.
- TypeScript mobile: aprobado.
- ESLint de la superficie modificada: aprobado.
- Suite completa mobile: aprobada.

## Validación física pendiente

1. Dos teléfonos con la app abierta en Chat: llamar, recibir modal, aceptar y confirmar audio bidireccional.
2. Rechazar y confirmar que el llamante salga de “Llamando”.
3. No contestar y confirmar timeout/limpieza.
4. Colgar antes de aceptar y confirmar cancelación en el destinatario.
5. Probar audio y video con Wi‑Fi, datos móviles y redes distintas.
6. Confirmar TURN en redes donde P2P directo no funcione.

## Alcance pendiente

El timbrado actual corresponde a foreground con la pantalla Chat montada. Recibir llamadas con la app cerrada o completamente en segundo plano requiere una fase separada con push de alta prioridad/servicio nativo y no se declara resuelto aquí.
