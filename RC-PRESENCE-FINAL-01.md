# RC-PRESENCE-FINAL-01 — Certificacion integral de presencia y conexion

## Resultado ejecutivo

ManeComb queda con una fuente canonica para presencia humana en mobile: `presenceByUser` dentro del root store. Esa tabla solo cambia por `presence:snapshot`, `presence:updated` o por invalidacion local ante perdida de transporte/background. Ninguna pantalla certificada usa ya `user.status`, expresiones regulares sobre textos como `activo/disponible`, GPS ni estado de unidad para declarar que una persona esta online.

La salud de la conexion local sigue una maquina distinta y explicita (`getRealtimeSnapshot`): sesion autenticada + red alcanzable + Socket.IO conectado + heartbeat vigente. GPS, ruta, disponibilidad de unidad, llamada y fase PTT son estados operacionales distintos; no se mezclan con presencia humana.

## Arquitectura anterior

- Backend marcaba online al recibir `presence:join` y offline solo al evento `disconnect`.
- Un socket vivo sin heartbeat podia permanecer online indefinidamente.
- Snapshot y control de multiples sockets inspeccionaban solo el proceso backend local.
- Mobile mantenia `presenceByUser`, pero tambien copiaba presencia en contactos, participantes y remitentes.
- Perfil y Usuarios mostraban `user.status`, un campo persistido que algunos roles recibian como `online` por defecto.
- Chat interpretaba cualquier texto parecido a `available`, `activo` o `en linea` como online.
- Chat tenia un banner de conexion propio ademas del banner global de AppShell.
- Avatares y listas dibujaban puntos, textos y colores con reglas diferentes.

## Arquitectura final

```text
Socket autenticado
  -> presence:join
  -> heartbeat cada 20 s
  -> backend renueva lastPresenceHeartbeatAt
  -> snapshot/update distribuido por organizacion
  -> root-store presenceByUser
  -> PresenceDot / PresenceBadge / PresenceLabel
```

Regla backend:

- Online: socket autenticado, unido a presencia y heartbeat con antiguedad maxima de 55 segundos.
- Offline: desconexion del ultimo socket del usuario o expiracion del heartbeat del ultimo socket.
- Multiples dispositivos: cerrar/expirar uno no marca offline mientras otro siga vigente.
- Multiples instancias: `fetchSockets()` consulta el adapter distribuido, no solo memoria local.

Regla mobile:

- `online`: confirmado por snapshot/update.
- `offline`: confirmado por snapshot/update.
- `unknown`: aun no existe confirmacion vigente o la app perdio capacidad de observar presencia.
- Al perder red/socket, entrar a background, volver a foreground o cerrar sesion se invalidan inmediatamente los valores observados; no se conserva un online viejo.

## Hallazgos y correcciones

| Hallazgo | Correccion |
|---|---|
| Presencia sin timeout de heartbeat | Sweep backend cada 5 s; caducidad a 55 s |
| Multiples sockets solo locales | Consulta distribuida mediante `fetchSockets()` |
| Estado persistido `online` por rol | Default backend cambiado a `offline`; UI deja de usarlo como presencia |
| Snapshot incompleto en mobile | Se incluyen usuario actual, Usuarios, contactos, participantes y remitentes cargados |
| Presencia duplicada en objetos | Las copias necesarias para compatibilidad se derivan exclusivamente de `presenceByUser` |
| Online viejo tras perder conexion | Se invalida la tabla al perder red/socket y en lifecycle background/foreground |
| Logout tardaba en desaparecer | Socket y timers se desconectan al inicio de logout |
| Chat inferia presencia por texto | Eliminadas expresiones regulares y rankings de estado |
| Componentes visuales duplicados | `PresenceDot`, `PresenceBadge` y `PresenceLabel` unifican presentacion |
| Banner duplicado en Chat | Eliminado; AppShell conserva `ConnectionBanner` |
| Conexion declarada solo por socket | `ConnectionBanner` exige heartbeat reciente y cero ACK perdidos |

## Modulos certificados

- Chat: directorio, conversaciones directas, cabecera, remitentes y selector de contactos.
- Radio: contactos directos e historial de transmisiones.
- Usuarios: lista y avatar.
- Perfil: usuario actual.
- AppShell/Dashboard/Control/Checklist/Seguimiento: usan el banner global para conexion. Sus estados GPS, unidad, jornada y checklist permanecen separados por ser telemetria, no presencia humana.
- Backend: join, snapshot, heartbeat, expiracion, desconexion y multiples sockets.

## Codigo consolidado

- `mobile/src/utils/presence.ts`: contrato, snapshot y presentacion canonica.
- `mobile/src/components/presence-indicator.tsx`: componentes visuales compartidos.
- `mobile/src/store/root-store.ts`: unico punto de aplicacion e invalidacion de presencia.
- `backend/src/services/presence.js`: reglas comprobables de vigencia y multiples sockets.

## Codigo eliminado

- Inferencia de online mediante expresiones regulares en Chat.
- Ranking/tone duplicado de estados de contacto.
- Punto de presencia dibujado manualmente por Chat.
- Banner de conexion privado de Chat y sus estilos.
- Regla backend que inventaba `online` por rol cuando faltaba estado.

## Pruebas realizadas

- TypeScript mobile: sin errores.
- ESLint focalizado sobre todos los archivos modificados: sin errores.
- Jest: presencia desconocida, snapshot completo, offline explicito y heartbeat no vigente.
- Backend: frontera temporal de heartbeat y multiples sockets del mismo/diferente usuario.
- Sintaxis Node del servidor de sockets.

## Matriz de comportamiento cubierta por codigo

| Escenario | Resultado esperado/cubierto |
|---|---|
| Login/restore | connect -> join -> snapshot; antes del snapshot se muestra Sin confirmar |
| Logout | desconexion inmediata; limpieza de listeners, timers y tabla local |
| Reconnect | invalida datos viejos; nuevo join solicita snapshot |
| Perdida/recuperacion de Internet | offline/unknown inmediato; reconexion automatica y snapshot nuevo |
| Background/foreground | invalida al salir y al volver; revalida red, socket y snapshot |
| Heartbeat perdido | conexion deja de mostrarse conectada; backend expira a los 55 s |
| Multiples sockets | no se emite offline mientras otro socket vigente exista |
| Multiples usuarios | snapshot se limita a la organizacion autenticada |

## Pruebas pendientes antes del APK

1. Dos dispositivos fisicos y dos cuentas en la misma organizacion: login, logout y cambio de red.
2. Una cuenta abierta simultaneamente en dos dispositivos; cerrar uno y verificar que permanezca online.
3. Dos instancias backend con adapter Redis; conectar cada dispositivo a una instancia diferente.
4. Pantalla bloqueada por mas de 55 segundos: confirmar expiracion y restauracion al foreground.
5. Doze y cambio Wi-Fi/datos con inspeccion de eventos y tiempos reales.
6. Validacion visual final en todas las densidades Android.

## Riesgos residuales

- Android puede suspender JS y Socket.IO en background. La presencia ahora caduca correctamente, pero no se promete continuidad online durante suspension.
- `status` sigue existiendo en el modelo por compatibilidad operacional; no debe volver a consumirse como presencia humana.
- La verificacion multi-instancia requiere un ambiente real con adapter Redis para certificacion fisica.

## Certificacion

La implementacion queda **certificada a nivel de codigo y pruebas automatizadas** respecto a una SSOT de presencia, timeout, invalidacion, multiples sockets y representacion visual. La certificacion de produccion queda condicionada exclusivamente a la matriz manual de dispositivos/background/multi-instancia anterior.
