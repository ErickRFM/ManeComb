# RC-CHAT-FINAL-02

## Alcance

Rectificacion final del modulo Chat sobre la infraestructura existente. No se modificaron `KeyboardAvoidingView`, `ChatComposer` ni archivos de pantalla o negocio de Radio, Seguimiento o Control. No se agregaron tipos de mensaje, pantallas, hooks o stores.

## Problemas encontrados

- Android declaraba `CAMERA`, pero el wrapper llamaba `launchCamera()` sin comprobar ni solicitar el permiso en runtime.
- Chat enviaba `mediaType: mixed` a `launchCamera()`; la version instalada de `react-native-image-picker` no soporta `mixed` para Camara en Android.
- El mismo modal mezclaba contactos con Camara/Galeria tanto en el `+` del directorio como en el `+` de una conversacion.
- El cliente escuchaba `chat:delivered`, pero nunca emitia el recibo al recibir un mensaje.
- El backend retransmitia `chat:delivered` sin persistirlo y confiaba en un `userId` enviado por el cliente.
- La presencia del socket actualizaba contactos, pero no participantes de conversaciones ni remitentes de mensajes ya cargados; cabecera, lista y mensajes podian mostrar estados diferentes.
- Al fallar `sendMediaMessage`, el controlador ignoraba `ok: false` y podia limpiar el borrador como si el upload hubiera finalizado.
- Imagen y video mostraban error de carga sin un reintento efectivo.
- El fullscreen de imagen mostraba un icono de descarga, aunque la accion existente era compartir.
- El directorio usaba `online` como fallback visual cuando no existia una presencia conocida.

## Problemas corregidos

- Se agrego comprobacion y solicitud explicita de `PermissionsAndroid.PERMISSIONS.CAMERA` antes de abrir Camara.
- Camara usa captura de foto, soportada por Android; Galeria conserva seleccion de imagen o video.
- El `+` del directorio abre exclusivamente la seleccion de contactos para iniciar un chat.
- El `+` dentro del chat muestra exclusivamente Camara y Galeria.
- El receptor emite `chat:delivered` usando la identidad autenticada del socket.
- `Delivered` se persiste tanto en MongoDB como en el store embebido antes de difundirse.
- Los eventos `Delivered` y `Read` actualizan los mensajes cargados y recuperan la conversacion si el recibo llego antes que el mensaje local.
- Snapshot y cambios de presencia actualizan contactos, participantes y remitentes desde la misma fuente de verdad del store.
- Los uploads solo limpian el borrador cuando el store confirma exito o encolado valido; los errores reales se muestran al usuario.
- Imagen y video permiten tocar el estado de error para reintentar la carga.
- La accion existente se identifica correctamente como Compartir, sin simular una descarga inexistente.
- La ausencia de presencia usa `offline`, no un `online` inventado.

## Flujos certificados

- Texto: UI -> controlador -> store -> API -> backend -> persistencia -> socket -> render.
- Imagen desde Galeria: picker -> FormData -> endpoint multimedia -> almacenamiento -> mensaje persistido -> socket -> render.
- Foto desde Camara: permiso Android -> `launchCamera(photo)` -> FormData -> mismo flujo multimedia persistente.
- Video desde Galeria: picker -> upload -> persistencia -> socket -> reproductor con fullscreen nativo.
- Audio: permisos/grabacion -> upload -> persistencia -> socket -> reproduccion y reintento por toque.
- Historial: `GET /chat/conversations/:conversationId/messages` devuelve los mensajes y estados persistidos; no depende del estado temporal de la pantalla.
- Reconexion: el socket vuelve a unir las salas activas y la cola offline existente se vacia al recuperar conectividad.

## Botones certificados

- `+` del directorio: muestra contactos e inicia un chat directo mediante el endpoint existente.
- `+` del compositor: muestra solo Camara y Galeria.
- Camara: valida permiso y usa una modalidad admitida por Android.
- Galeria: selecciona imagen/video y utiliza el upload real.
- Enviar: mantiene estado local `Sending` hasta obtener respuesta y permite reintentar un texto fallido.
- Microfono: conserva el flujo existente de grabacion, limite, upload y reproduccion.
- Imagen: abre fullscreen; cerrar funciona; compartir se identifica como compartir; error permite reintento.
- Video: controles nativos, fullscreen/PiP segun plataforma y reintento de carga.
- Volver, seleccionar conversacion/contacto y cerrar modal conservan sus consumidores existentes.
- Radio desde Chat conserva su integracion existente; Radio no fue modificado.

## Estados certificados

- `Sending`: estado local del mensaje mientras la solicitud esta pendiente.
- `Sent`: estado creado y persistido por backend.
- `Delivered`: confirmacion emitida por el receptor autenticado, persistida por backend y distribuida por socket.
- `Read`: confirmacion persistida por backend y distribuida por socket.
- `Failed`: estado local real de una solicitud de texto fallida, con reintento disponible.

No se agregaron iconos o estados simulados.

## Multimedia certificada

- Imagen: Galeria, Camara, upload, persistencia, socket, preview en mensaje, fullscreen, compartir, error y reintento de carga.
- Video: Galeria, upload, persistencia, socket, controles, fullscreen nativo, error y reintento de carga.
- Audio: grabacion, upload, persistencia, socket, reproduccion, pausa, error y reintento por toque.
- El backend conserva un unico endpoint multimedia para imagen/video y un endpoint de audio, ambos con autorizacion de conversacion.

No existe infraestructura de descarga autenticada a almacenamiento local. Se corrigio el boton engañoso para mostrar la accion real de Compartir; no se invento un descargador.

## Presencia certificada

- `presence:snapshot` y `presence:updated` son la unica fuente realtime.
- Lista de conversaciones, contactos, cabecera de chat y avatares de mensajes reciben el mismo estado.
- Un usuario sin presencia conocida se muestra `offline`.

## Infraestructura no existente y no inventada

- Ubicacion como mensaje: no existe `kind`, DTO, endpoint ni renderizador de Chat para ubicacion.
- Documento como mensaje: el modulo Documentos no esta integrado al contrato multimedia de Chat.
- Creacion de grupos arbitrarios: solo existe el canal General Operativo; no existe endpoint de creacion de grupos.
- Descarga local autenticada: no existe servicio nativo de archivos para Chat.

Estas opciones no se muestran como botones muertos.

## Regresiones

- No se detectaron regresiones en las suites automatizadas.
- Teclado y `ChatComposer` no fueron modificados.
- Radio, Seguimiento y Control no recibieron cambios de pantalla o negocio como parte de RC-CHAT-FINAL-02; el recibo `Delivered` del store compartido excluye explicitamente conversaciones Radio.
- Prueba manual en dispositivo no ejecutada: no habia dispositivo ADB conectado.
- Build Android omitido por instruccion expresa del usuario debido a su duracion. El daemon iniciado por el intento cancelado se detuvo con `gradlew --stop`.

## Resultado TypeScript

- `npm run typecheck`: aprobado, 0 errores.

## Resultado ESLint

- `npm run lint`: aprobado, 0 errores.
- Permanecen 2 warnings preexistentes de estilos inline en `src/native/video.tsx`, fuera del alcance de Chat.
- ESLint dirigido a archivos de Chat, picker, store y tipos: aprobado sin salida.

## Resultado Tests

- Mobile: 14 suites, 63 pruebas, todas aprobadas.
- Prueba nueva de Camara: permiso ya concedido y permiso denegado, aprobadas.
- Backend: suite completa aprobada.
- Persistencia Chat: prueba de transicion `sent -> delivered -> read`, aprobada.

## Resultado Build Android

- No ejecutado por instruccion expresa del usuario.
