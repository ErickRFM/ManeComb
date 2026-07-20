# Documento de Alcance y Funcionamiento del Sistema Combis App

Fecha: 2026-05-06  
Proyecto: Combis App  
Estado del documento: Version base para presentacion, planeacion y seguimiento tecnico

Nota de estabilizacion 2026-06-17: este documento conserva contexto historico. El stack activo de la app movil es React Native CLI en `mobile/`; las referencias a Expo/desktop pertenecen a una etapa anterior y no deben usarse como guia de build o deploy.

## 1. Resumen ejecutivo

Combis App es un sistema integral para administrar la operacion diaria de una flotilla de combis. El sistema concentra en una sola plataforma la gestion de usuarios, unidades, rutas, ubicacion en tiempo real, incidencias, documentos operativos, comunicacion interna, notificaciones, seguimiento comercial y herramientas administrativas.

La solucion esta pensada para empresas o grupos operadores de transporte que necesitan visibilidad sobre sus unidades, mejor coordinacion entre administradores, supervisores y choferes, y control documental para reducir riesgos operativos. La aplicacion activa funciona como una plataforma movil React Native CLI y una web comercial Vite, conectadas a una API Express con persistencia en MongoDB y comunicacion en tiempo real mediante Socket.IO.

## 2. Objetivo general

Desarrollar una plataforma que permita controlar, supervisar y mejorar la operacion de combis mediante informacion centralizada, actualizacion en tiempo real y flujos digitales para tareas que normalmente se realizan por llamadas, mensajes dispersos, papel o seguimiento manual.

## 3. Objetivos especificos

- Centralizar la informacion de choferes, supervisores, administradores, unidades, rutas y documentos.
- Visualizar ubicaciones, estado de unidades, incidencias y alertas desde un dashboard operativo.
- Permitir que los choferes reporten incidencias y actualicen informacion relevante durante el turno.
- Facilitar la comunicacion entre usuarios por chat, radio operativo y sesiones RTC.
- Gestionar documentos de choferes y unidades con revision, estatus y vencimientos.
- Administrar usuarios y roles desde un panel con permisos.
- Registrar recorridos, rutas asignadas y eventos relevantes de la operacion.
- Ofrecer una ruta comercial web para venta de planes, checkout, seguimiento de activacion y onboarding.
- Mejorar la trazabilidad tecnica mediante eventos, errores, tiempos de respuesta y observabilidad.

## 4. Alcance actual del sistema

### 4.1 Gestion de acceso y perfiles

El sistema cuenta con autenticacion por correo y contrasena, generacion de token JWT y consulta de sesion activa. Los perfiles incluyen informacion personal, rol, telefono, turno, estado operativo, avatar, unidad asignada, datos de empresa, perfil de pago y respaldo de claves E2EE para chat directo.

Roles principales:

- Administrador: controla usuarios, revisa documentos, observa toda la operacion, consulta ventas, pedidos, RTC y observabilidad.
- Supervisor: monitorea unidades, rutas, incidencias, documentos y comunicacion operativa.
- Chofer: consulta su dashboard, reporta incidencias, envia ubicacion, participa en chat/radio y gestiona documentos propios.
- Dueno de empresa o comprador: puede registrarse, comprar planes, revisar ordenes comerciales y seguir el proceso de activacion.

### 4.2 Dashboard operativo

El dashboard resume el estado general de la operacion segun el rol del usuario. Presenta metricas, unidades relevantes, alertas, notificaciones y datos del turno. Sirve como punto de entrada para detectar retrasos, documentos por vencer, unidades en mantenimiento, incidentes abiertos y estado de la flotilla.

### 4.3 Mapa y ubicacion en vivo

La plataforma muestra rutas, unidades, incidentes y centro geografico operativo. Las unidades pueden actualizar su ubicacion, velocidad y estado. El sistema emite cambios en tiempo real a traves de Socket.IO para que el mapa y el dashboard reflejen la operacion actual.

Tambien existe un modulo de navegacion que permite:

- Buscar lugares.
- Calcular rutas entre origen y destino.
- Asignar rutas a unidades.
- Registrar recorridos por unidad y fecha.
- Consultar historial de viajes.

### 4.4 Incidencias

El sistema permite listar, crear y actualizar incidencias. Cada incidencia incluye titulo, tipo, severidad, estado, ruta, unidad, reportero, descripcion, fecha y evidencias. Los choferes pueden reportar problemas en ruta, mientras administradores y supervisores pueden dar seguimiento y cambiar el estado.

Estados contemplados:

- Abierta.
- En proceso.
- Resuelta.

Severidades contempladas:

- Baja.
- Media.
- Alta.
- Critica.

### 4.5 Comunicacion interna

El sistema incluye conversaciones de chat y radio operativo. Soporta conversaciones generales y directas, mensajes de texto, mensajes multimedia, notas de voz, transcripcion de audio cuando se configura proveedor externo y cifrado E2EE para conversaciones directas.

La comunicacion en tiempo real se apoya en Socket.IO. Cuando se envia un mensaje, la API lo registra en el store y lo retransmite a los participantes unidos a la conversacion.

### 4.6 Radio y RTC

Ademas del chat, el sistema contempla canales de radio y sesiones RTC para comunicacion mas inmediata. El backend administra salas, participantes, ofertas, respuestas, candidatos ICE, colgado de llamadas e historial de sesiones.

La configuracion RTC incluye STUN por defecto y puede usar TURN estatico o TURN dinamico tipo Coturn REST si se configuran las variables correspondientes.

### 4.7 Documentos operativos

El modulo documental permite cargar documentos de choferes o unidades, clasificarlos, revisar su estado y controlar vencimientos. Los documentos incluyen metadata, archivo, propietario, categoria, fecha de vencimiento, estatus y revision administrativa.

El sistema puede guardar documentos en MongoDB GridFS de forma predeterminada cuando MongoDB esta disponible. Tambien conserva opcion para Cloudinary como almacenamiento externo.

### 4.8 Notificaciones

El sistema maneja notificaciones dirigidas por rol o usuario. Cada notificacion tiene titulo, cuerpo, nivel, categoria, destinatarios, datos adicionales, fecha de creacion y usuarios que la han leido.

Tambien existe soporte para registrar y eliminar suscripciones push, asi como para deep links hacia chat, radio e incidencias cuando la notificacion incluye una intencion de navegacion.

### 4.9 Gestion de usuarios

Los administradores pueden listar usuarios, actualizar su estado y asignaciones, y eliminarlos cuando las reglas de integridad lo permiten. Los choferes se dan de alta exclusivamente mediante activation keys: el administrador genera la key en el portal y el chofer completa su propio registro al canjearla. El portal no ofrece alta directa de choferes. El sistema controla correos duplicados, fortalece politicas de contrasena, normaliza roles y limpia asociaciones de unidades, conversaciones, documentos y notificaciones cuando se elimina un usuario.

### 4.10 Gestion de vehiculos y rutas

El sistema maneja vehiculos con codigo, placa, ruta, chofer, supervisor, estado, ocupacion, capacidad, ETA, retraso, velocidad, combustible, ubicacion y ruta asignada. Las rutas contienen nombre, codigo, color y polilinea.

### 4.11 Ruta comercial y ventas

La aplicacion incluye una experiencia web de ventas en `/ventas`, con planes comerciales por numero de combis, add-ons, checkout, confirmacion de pago, webhooks de Mercado Pago, ordenes comerciales, seguimiento de activacion, onboarding, descargas y perfil del comprador.

Planes configurados actualmente:

- 2 combis.
- 4 combis.
- 6 combis.
- 8 combis.
- 12 combis.

Algunos planes permiten agregar el modulo de radio operativo como add-on y otros lo incluyen por defecto.

### 4.12 Observabilidad operativa

El backend registra eventos relevantes de API, errores, solicitudes lentas, eventos comerciales, push, RTC e incidencias criticas. El administrador puede consultar una fotografia operativa con errores recientes, tiempos lentos, sesiones RTC, eventos de checkout y actividad relevante.

## 5. Como funciona el sistema

### 5.1 Flujo general

1. El usuario abre la aplicacion movil, web o desktop.
2. La aplicacion valida si existe una sesion guardada.
3. Si hay token, consulta `/api/auth/session` y carga perfil, dashboard y documentos.
4. Si no hay sesion, muestra login o registro.
5. Una vez autenticado, la aplicacion carga dashboard, mapa, incidencias, conversaciones, contactos, documentos, notificaciones y, para administradores, observabilidad y usuarios.
6. La app establece conexion Socket.IO para recibir mensajes, actualizaciones de ubicacion e incidencias en tiempo real.
7. Cada modulo consume endpoints REST y actualiza el estado global en Zustand.
8. El backend valida JWT, aplica permisos, consulta el store y responde datos normalizados.

### 5.2 Flujo de ubicacion

1. La unidad o app del chofer obtiene coordenadas.
2. La app envia ubicacion a `/api/locations/update` o por evento de socket.
3. El backend actualiza el vehiculo.
4. Socket.IO emite `location:updated`.
5. Dashboard y mapa se refrescan en las sesiones activas.

### 5.3 Flujo de incidencia

1. El chofer, supervisor o administrador crea una incidencia.
2. El backend valida titulo, tipo, descripcion y severidad.
3. Se asocia la incidencia con ruta, unidad y reportero.
4. La incidencia queda abierta y se transmite a clientes conectados.
5. Administrador o supervisor cambia estatus a en proceso o resuelta.
6. El dashboard y las alertas reflejan el cambio.

### 5.4 Flujo documental

1. El usuario carga un documento desde la app.
2. La API recibe el archivo mediante multipart/form-data.
3. El backend guarda metadata y binario en el almacenamiento configurado.
4. El administrador revisa el documento desde el panel.
5. El documento queda aprobado, rechazado o pendiente.
6. El dashboard muestra vencimientos y alertas.

### 5.5 Flujo de chat y radio

1. El usuario abre una conversacion general o directa.
2. La app consulta mensajes y contactos.
3. El socket se une a la sala de conversacion.
4. Al enviar mensaje, la API lo persiste y Socket.IO lo retransmite.
5. En conversaciones directas, la app puede cifrar/descifrar mensajes usando claves E2EE.
6. En radio, el canal se orienta a comunicacion operativa inmediata.

### 5.6 Flujo comercial

1. Un comprador entra a la pagina de ventas.
2. Revisa planes y selecciona una opcion.
3. Completa datos de empresa, contacto, facturacion y metodo de pago.
4. La API crea una orden comercial.
5. El proveedor de pago genera checkout o instrucciones.
6. Al confirmar el pago, el sistema actualiza la orden.
7. Si corresponde, activa onboarding, starter fleet, descargas y seguimiento administrativo.

## 6. Arquitectura tecnica

### 6.1 Frontend

La aplicacion esta construida con Expo Router, React Native, React Native Web y Zustand. Comparte pantallas y estado entre movil, web y desktop. Usa Axios para la API REST y Socket.IO Client para eventos en tiempo real.

Tecnologias principales:

- Expo 54.
- React 19.
- React Native 0.81.
- Expo Router.
- Zustand.
- Axios.
- Socket.IO Client.
- React Native Maps en movil.
- Leaflet / React Leaflet en web.
- Expo Notifications.
- Expo Secure Store.
- TweetNaCl para cifrado E2EE.

### 6.2 Backend

El backend es una API Node.js con Express. Expone endpoints REST por modulos y un servidor Socket.IO sobre HTTP. Usa middlewares de seguridad, CORS, compresion, rate limit, trazabilidad por `x-trace-id`, manejo de errores y autenticacion JWT.

Tecnologias principales:

- Node.js 18 o superior.
- Express 5.
- MongoDB / Mongoose.
- Socket.IO.
- JWT.
- bcryptjs.
- Multer.
- Helmet.
- express-rate-limit.
- Cloudinary opcional.
- TweetNaCl.

### 6.3 Persistencia

El sistema puede trabajar con MongoDB o con un store embebido en memoria para desarrollo. En modo productivo se recomienda exigir MongoDB con `REQUIRE_MONGO=true`.

Colecciones/modelos principales:

- Usuarios.
- Vehiculos.
- Rutas.
- Incidencias.
- Conversaciones.
- Documentos.
- Notificaciones.
- Registros de viaje.
- Ordenes comerciales.
- Sesiones RTC.
- Eventos de aplicacion.

### 6.4 Tiempo real

Socket.IO soporta:

- Presencia por usuario y rol.
- Unirse a conversaciones.
- Enviar mensajes.
- Actualizar ubicacion.
- Crear o actualizar incidencias.
- Salas RTC.
- Ofertas, respuestas, candidatos ICE y colgado.

### 6.5 Seguridad

Controles actuales:

- Autenticacion JWT.
- Hash de contrasenas con bcrypt.
- Validacion de politicas de contrasena.
- Middlewares de autenticacion y permisos admin.
- Helmet.
- CORS configurable.
- Rate limit para `/api`.
- Trazabilidad con `x-trace-id`.
- Cifrado E2EE en chat directo.
- Sanitizacion de usuario para no exponer passwordHash, suscripciones push ni backups sensibles.

## 7. Estructura del proyecto

```text
combis-app/
  README.md
  package.json
  .env.example
  docs/
    project-master.md
    alcance-sistema-combis.md
  backend/
    package.json
    src/
      app.js
      server.js
      config/
        db.js
        env.js
        commercial-plans.js
      data/
        models.js
        mongo-store.js
        seedData.js
        store.js
      middlewares/
        authenticate.js
        error-handler.js
        not-found.js
        require-admin.js
      modules/
        auth/
        chat/
        commercial/
        dashboard/
        documents/
        incidents/
        locations/
        navigation/
        notifications/
        ops/
        rtc/
        users/
        vehicles/
      services/
        audio-transcription.js
        chat-media.js
        commercial-activation.js
        commercial-downloads.js
        commercial-notifier.js
        commercial-payment.js
        commercial-profile.js
        navigation-service.js
        notification-delivery.js
        push-notifier.js
        rtc-config.js
        runtime-readiness.js
        storage.js
        telemetry.js
      sockets/
        index.js
      utils/
        chat-crypto.js
        jwt.js
        password-policy.js
        service-date.js
    test/
    uploads/
  mobile/
    package.json
    app/
      _layout.tsx
      index.tsx
      login.tsx
      registro.tsx
      ventas.tsx
      comercial.tsx
      perfil-comprador.tsx
      privacidad.tsx
      terminos.tsx
      (tabs)/
        index.tsx
        mapa.tsx
        incidencias.tsx
        chat.tsx
        radio.tsx
        checklist.tsx
        usuarios.tsx
        perfil.tsx
        perfil-editar.tsx
    src/
      api/
        client.ts
        offline.ts
      components/
      constants/
      desktop/
      hooks/
      navigation/
      screens/
      store/
      types/
      utils/
    e2e/
    test/
    scripts/
    assets/
    android/
  desktop/
    README.md
```

## 8. Modulos principales del backend

| Modulo | Responsabilidad |
| --- | --- |
| `auth` | Login, registro, sesion y respaldo E2EE |
| `dashboard` | Resumen operativo por rol |
| `locations` | Ubicacion viva y actualizacion de unidades |
| `navigation` | Busqueda, planeacion, asignacion y bitacora de recorridos |
| `incidents` | Alta, listado y cambio de estado de incidencias |
| `chat` | Conversaciones, mensajes, audio, media y contactos |
| `documents` | Carga, consulta, descarga y revision documental |
| `notifications` | Bandeja de notificaciones y push subscriptions |
| `commercial` | Planes, checkout, confirmacion, webhooks, ordenes y descargas |
| `rtc` | Configuracion ICE y sesiones RTC |
| `users` | Perfil propio y administracion de usuarios |
| `vehicles` | Consulta de unidades |
| `ops` | Observabilidad administrativa |

## 9. Endpoints principales

### Salud y sesion

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/session`
- `GET /api/auth/e2ee-backup`
- `PUT /api/auth/e2ee-backup`

### Operacion

- `GET /api/dashboard/overview`
- `GET /api/locations/live`
- `POST /api/locations/update`
- `GET /api/navigation/search`
- `POST /api/navigation/plan`
- `POST /api/navigation/assign`
- `GET /api/navigation/trips`
- `POST /api/navigation/trips`

### Incidencias, comunicacion y documentos

- `GET /api/incidents`
- `POST /api/incidents`
- `PATCH /api/incidents/:incidentId/status`
- `GET /api/chat/conversations`
- `GET /api/chat/conversations/:conversationId/messages`
- `POST /api/chat/conversations/:conversationId/messages`
- `POST /api/chat/conversations/:conversationId/audio`
- `POST /api/chat/conversations/:conversationId/media`
- `GET /api/documents`
- `GET /api/documents/admin`
- `POST /api/documents`
- `PATCH /api/documents/:documentId/review`

### Administracion y comercial

- `GET /api/users/me`
- `PATCH /api/users/me`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:userId`
- `DELETE /api/users/:userId`
- `GET /api/vehicles`
- `GET /api/commercial/plans`
- `POST /api/commercial/checkout`
- `POST /api/commercial/confirm`
- `POST /api/commercial/webhooks/mercadopago`
- `GET /api/commercial/orders`
- `PATCH /api/commercial/orders/:orderId`
- `GET /api/rtc/config`
- `GET /api/rtc/sessions`
- `GET /api/ops/observability`

## 10. Datos iniciales de prueba

El sistema incluye datos semilla para desarrollo:

- Administrador: `admin@combis.app` / `Ruta123!`
- Supervisor: `supervisor@combis.app` / `Ruta123!`
- Chofer: `chofer@combis.app` / `Ruta123!`

Tambien incluye rutas de ejemplo, unidades, incidencias, conversaciones, documentos, notificaciones y registros de viaje.

## 11. Como mejora la operacion

### 11.1 Menos informacion dispersa

El sistema evita que la operacion dependa solo de llamadas, hojas de calculo, mensajes sueltos o notas en papel. La informacion queda concentrada y consultable por roles.

### 11.2 Mejor reaccion ante incidentes

Las incidencias se registran con severidad, descripcion, unidad y ruta. Esto permite priorizar problemas y dar seguimiento hasta su cierre.

### 11.3 Mas visibilidad sobre unidades

La ubicacion y estado de las unidades permite tomar decisiones sobre retrasos, mantenimiento, aforo, combustible y rutas asignadas.

### 11.4 Control documental

Los documentos por vencer o vencidos aparecen como alertas, reduciendo riesgo operativo y administrativo.

### 11.5 Comunicacion mas directa

Chat, radio y RTC reducen tiempos de coordinacion entre centro de control, supervisores y choferes.

### 11.6 Mejor venta y activacion de clientes

La ruta comercial permite convertir interesados en ordenes, registrar pagos, activar cuentas y entregar materiales de inicio.

### 11.7 Mayor trazabilidad tecnica

La observabilidad ayuda a detectar errores, lentitud, fallas de push, sesiones RTC y eventos comerciales importantes.

## 12. Mejoras recomendadas para siguientes versiones

### 12.1 Corto plazo

- Formalizar permisos por rol en cada accion sensible.
- Completar push notifications con Expo/FCM en ambiente real.
- Mejorar onboarding inicial para empresas y alta de flotilla.
- Agregar filtros avanzados en incidencias, documentos y usuarios.
- Mejorar dashboard con indicadores por ruta, unidad y turno.
- Crear exportacion de reportes en PDF/CSV para incidencias, documentos y recorridos.

### 12.2 Mediano plazo

- Activacion comercial totalmente automatica despues del pago.
- Seguimiento GPS continuo en background para choferes.
- Panel de mantenimiento preventivo por kilometraje, fecha y evidencia.
- Analitica de puntualidad, retrasos, aforo y frecuencia por ruta.
- Asignacion dinamica de unidades segun demanda y congestion.
- Alertas predictivas para documentos, mantenimiento y rutas conflictivas.

### 12.3 Largo plazo

- Multiempresa y multipatio con separacion fuerte de datos.
- Roles configurables y permisos granulares por modulo.
- Integracion con sistemas fiscales, facturacion y contabilidad.
- Integracion con telemetria de unidades o dispositivos GPS dedicados.
- Modelos de prediccion de demanda y optimizacion de rutas.
- Portal publico para usuarios finales con tiempos estimados y avisos.

## 13. Requerimientos tecnicos para operacion real

- Servidor Node.js 18 o superior.
- MongoDB disponible y configurado.
- Variables de entorno del backend y mobile ajustadas.
- Dominio o IP accesible para usuarios moviles.
- Certificado HTTPS para produccion.
- Proveedor de push notifications.
- Proveedor de pagos si se usa checkout automatico.
- TURN configurado para llamadas RTC confiables fuera de redes locales.
- Politica de respaldos de base de datos y archivos.
- Monitoreo de errores, logs y disponibilidad.

## 14. Variables e integraciones importantes

El proyecto contempla variables para:

- `MONGO_URI` y `REQUIRE_MONGO`.
- `CLIENT_ORIGIN`.
- `JWT_SECRET`.
- `MANECOMB_API_URL`.
- `MANECOMB_SOCKET_URL`.
- Configuracion de pagos.
- Configuracion de Cloudinary.
- Configuracion de STUN/TURN.
- Configuracion de transcripcion de audio.
- Configuracion de Sentry.

## 15. Pruebas y validacion

El proyecto incluye comandos para validar backend, frontend y pruebas E2E:

```bash
npm run backend
npm run mobile
npm run mobile:web
npm run lint:mobile
cd backend && npm test
cd mobile && npm run test:e2e:web
cd mobile && npm run build:e2e:mobile && npm run test:e2e:mobile
```

Para una entrega formal se recomienda validar:

- Login y registro.
- Dashboard por rol.
- Mapa y actualizacion de ubicaciones.
- Alta y cierre de incidencias.
- Chat general y directo.
- Radio y RTC.
- Carga y revision de documentos.
- Compra comercial y confirmacion de pago.
- Administracion de usuarios.
- Observabilidad.

## 16. Limites actuales y consideraciones

- El store embebido sirve para desarrollo, pero no debe usarse como persistencia real.
- Algunas integraciones dependen de variables externas y proveedor configurado.
- El seguimiento GPS continuo en background aparece como mejora recomendada para produccion.
- La separacion multiempresa debe fortalecerse antes de operar varios clientes reales en la misma instancia.
- Las reglas de permisos pueden hacerse mas granulares por modulo, ruta, patio o empresa.
- Para RTC confiable en redes reales se recomienda configurar TURN.
- Para documentos reales se recomienda mantener MongoDB GridFS o almacenamiento externo con respaldos.

## 17. Conclusion

Combis App ya cubre una base operativa amplia: autenticacion, dashboard, mapa, ubicaciones, incidencias, documentos, chat, radio, RTC, usuarios, ventas, pagos, activacion comercial y observabilidad. Su valor principal es convertir la operacion diaria de combis en un flujo digital trazable, visible y coordinado.

El siguiente paso para llevarlo a un nivel productivo consiste en fortalecer permisos, automatizar activaciones, habilitar push real, consolidar seguimiento GPS en background, mejorar reportes y preparar separacion multiempresa. Con esas mejoras, el sistema puede pasar de una plataforma operativa funcional a una herramienta robusta para crecimiento, control y toma de decisiones.
