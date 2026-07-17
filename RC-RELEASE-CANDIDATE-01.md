# RC-RELEASE-CANDIDATE-01

**Fecha:** 2026-07-16
**Alcance:** Sistema completo — Ventas (Portal Web) + Backend + Mobile (operaciones)
**Objetivo:** Determinar si el producto está listo para producción

---

## Resumen Ejecutivo

Se revisaron **22 flujos extremo a extremo** a través de **~96 endpoints HTTP, ~30 eventos Socket.IO, 13 pantallas web y 11 pantallas mobile**. Se encontraron **5 hallazgos bloqueantes**, **12 importantes**, **8 menores** y **5 observaciones**.

**Nivel de preparación estimado: 72%**

---

## 🔴 Bloqueantes

### B1. Modal de cambio de estado de usuario no funcional
**Archivo:** `ventas/features/portal/screens/portal-users-screen.tsx:206`
**Evidencia:** El modal `ConfirmModal` no tiene controles de entrada (radio buttons, dropdown, etc.). `editStatus` se inicializa con el estado actual del usuario y nunca puede cambiar. El "Guardar" siempre envía el mismo estado actual — es un no-op.
**Impacto:** La funcionalidad "Cambiar estado" de usuarios aparece pero no funciona. El usuario cree que cambió el estado pero no ocurre nada.
**Riesgo:** Medio (funcionalidad rota, pero no corrompe datos).

### B2. Editar unidad con estado `assigned` lo silencia a `available`
**Archivo:** `ventas/features/portal/screens/portal-units-screen.tsx:116-117`
**Evidencia:**
```ts
status: vehicle.status === 'maintenance' ? 'maintenance' : 'available',
```
Al editar una unidad cuyo estado es `assigned`, el editor lo mapea silenciosamente a `available`. Si el usuario guarda (incluso sin tocar el segmento de estado), la unidad pierde su estado asignado.
**Impacto:** Corrupción de datos. Unidades asignadas a conductores/rutas pueden quedar marcadas como disponibles sin advertencia.
**Riesgo:** Alto. Afecta integridad de asignación vehículo-conductor.

### B3. Portal no tiene UI para Documentos, Incidentes, Chat ni Radio
**Archivos:** Backend `modules/documents/routes.js`, `modules/incidents/routes.js`, `modules/chat/routes.js`, `modules/radio/routes.js` tienen endpoints completos. Portal (`ventas/features/portal/screens/`) no tiene **ninguna** pantalla para estos módulos.
**Evidencia:**
- Documentos: backend soporta CRUD + revisión/aprobación. Portal no lista, sube, revisa ni descarga documentos.
- Incidentes: backend soporta CRUD + SOS + tiempo real. Portal no muestra incidentes.
- Chat: backend soporta mensajes, E2EE, notas de voz, medios. Portal no tiene chat.
- Radio: backend soporta PTT, mensajes de audio. Portal no tiene radio.
**Impacto:** Las Historias 6 (Documentos) y 7 (Incidentes) no son completables desde Portal. Los administradores no pueden gestionar documentos ni incidentes.
**Riesgo:** Alto para negocio. Funcionalidad contratada no entregada.

### B4. Módulo Checklist sin backend
**Archivo:** No existe `backend/src/modules/checklist/`. Mobile app tiene pantalla de checklist (`mobile/src/screens/checklist-screen.tsx`) que llama a `getRouteSessionHistoryRequest`, `createNavigationRouteRequest`, etc., pero no hay un endpoint específico de checklist.
**Evidencia:** Ni `getChecklistRequest` ni ruta `/api/checklist` existen. La pantalla mobile opera con datos de navegación/sesiones, no con un modelo de checklist dedicado.
**Impacto:** La funcionalidad de checklist opera sobre datos prestados de otros módulos. No hay persistencia de checklist como entidad propia.
**Riesgo:** Si el modelo de datos cambia, checklist mobile se rompe.

### B5. Búsqueda de audio de radio es O(N*M) sin paginación
**Archivo:** `backend/src/modules/radio/routes.js:62-85`
**Evidencia:** `findAccessibleRadioAudio` itera TODAS las conversaciones del usuario y luego TODOS los mensajes de cada conversación para encontrar un audio. Sin límite ni paginación.
**Impacto:** Degradación lineal del rendimiento. Con miles de mensajes, la reproducción de un audio puede tardar segundos o minutes.
**Riesgo:** Alto en producción con uso intensivo de radio.

---

## 🟠 Importantes

### I1. Banners de continuidad engañosos
**Archivos:**
- `portal-units-screen.tsx:220-229`: banner "Unidad creada" aparece siempre que existen unidades, no solo después de crear.
- `portal-routes-screen.tsx:204-213`: banner "Ruta asignada" aparece siempre que alguna unidad tiene ruta.
**Impacto:** UX engañosa. El usuario ve mensajes de éxito aunque no haya realizado ninguna acción.
**Riesgo:** Medio.

### I2. Botón duplicar ruta puede apuntar al mismo vehículo
**Archivo:** `portal-routes-screen.tsx:386-395` + `124-136`
**Evidencia:** `duplicateRoute` no verifica que `source.id !== editor.vehicleId`. Duplicar la ruta sobre el mismo vehículo es un no-op semántico.
**Impacto:** El botón está disponible aunque no tenga sentido. Opera sin advertencia.
**Riesgo:** Bajo.

### I3. Guardar ruta sobrescribe sin advertencia
**Archivo:** `portal-routes-screen.tsx:138-187`
**Evidencia:** `saveRoute` no verifica si el vehículo ya tiene una ruta asignada. Llama `assignRoute` que sobrescribe silenciosamente.
**Impacto:** Un administrador puede destruir la ruta existente de una unidad por accidente.
**Riesgo:** Alto.

### I4. Pantalla Pagos ignora error del store
**Archivo:** `ventas/features/portal/screens/portal-payments-screen.tsx`
**Evidencia:** `usePortalStore` tiene campo `error` que se setea en fallos de carga, pero la pantalla nunca lo lee. Cuando falla la carga, se muestra "No existe una orden comercial" aunque el usuario sí tenga suscripción.
**Impacto:** Mensajes de error engañosos. Usuarios ven datos incorrectos sin saber que falló la carga.
**Riesgo:** Medio-alto. Puede causar pánico en usuarios que sí tienen plan activo.

### I5. Reintentar pago sin planId es no-op silencioso
**Archivo:** `ventas/features/portal/screens/portal-payments-screen.tsx:29`
**Evidencia:**
```ts
if (!subscription?.planId) return;
```
Sin mensaje, sin feedback. El usuario presiona "Reintentar pago" y no pasa nada.
**Impacto:** UX frustrante. El usuario no sabe por qué no funciona.
**Riesgo:** Medio.

### I6. Descarga de factura sin manejo de errores
**Archivo:** `ventas/features/portal/screens/portal-billing-screen.tsx:29`
**Evidencia:** `Linking.openURL(...)` con `void` descarta cualquier promesa de rechazo.
**Impacto:** Si la URL de descarga es inválida o no se puede abrir, el usuario no recibe feedback.
**Riesgo:** Medio.

### I7. Sin indicador de carga inicial en Users, Units, Routes
**Archivos:**
- `portal-users-screen.tsx:44-47`
- `portal-units-screen.tsx:90-92`
- `portal-routes-screen.tsx:96-98`
**Evidencia:** Las pantallas llaman `loadUsers()` / `loadVehicles()` en `useEffect` pero no muestran spinner/skeleton mientras cargan. Los estados vacíos titilan o se muestran permanentemente si falla la API.
**Impacto:** Percepción de lentitud. En conexiones lentas el usuario ve pantallas vacías sin explicación.
**Riesgo:** Medio.

### I8. Pantallas Users, Units, Routes tragan errores de carga
**Archivo:** Mismos que I7.
**Evidencia:** Ninguna de estas pantallas tiene `.catch()` ni consume `state.error` del store. Si la API devuelve error, la pantalla muestra datos vacíos como si todo estuviera bien.
**Impacto:** El usuario no sabe que los datos no se cargaron.
**Riesgo:** Medio.

### I9. `sos` regex demasiado permisivo
**Archivo:** `backend/src/modules/incidents/routes.js:63`
**Evidencia:** `/^sos/i.test(incident.title)` — títulos como "sospechoso" o "sostenibilidad" disparan alerta SOS.
**Impacto:** Falsos positivos de emergencia. El equipo operativo recibe alertas SOS por incidentes no críticos.
**Riesgo:** Alto.

### I10. TOCTOU race condition en actualización de incidentes
**Archivo:** `backend/src/modules/incidents/routes.js:111-113`
**Evidencia:** Primero se busca el incidente vía `listIncidents(req.user).find(...)` para verificar acceso, luego se llama `updateIncidentStatus`. Entre ambas operaciones, el incidente pudo ser eliminado o el permiso del usuario cambiado.
**Impacto:** Potencial error 404 o actualización de recurso incorrecto.
**Riesgo:** Bajo en la práctica, pero es una vulnerabilidad de concurrencia.

### I11. `NONE` action con label no vacío en máquina de estados
**Archivo:** `ventas/features/commercial/subscription-state.ts:71-73`
**Evidencia:** `CHANGE_SCHEDULED` tiene `primaryAction: 'NONE'` pero `actionLabel: 'Cambio en proceso'`. Un consumidor que renderice un botón a partir de `actionLabel` sin verificar `primaryAction` mostraría un botón no funcional.
**Impacto:** Potencial botón fantasma.
**Riesgo:** Medio si hay consumidores no alineados.

### I12. `channelMode` en chat directo sin validación
**Archivo:** `backend/src/modules/chat/routes.js:108`
**Evidencia:** `channelMode` se pasa desde `req.body` sin validación contra valores permitidos.
**Impacto:** Un cliente malicioso podría crear conversaciones con modo inválido.
**Riesgo:** Bajo.

---

## 🟡 Menores

### M1. Faltan acentos en mensajes en español (5 ocurrencias)
**Archivos:**
- `portal-units-screen.tsx:131`: "Los kilometros deben ser un numero valido."
- `portal-units-screen.tsx:177`: placeholder "Kilometros actuales"
- `portal-routes-screen.tsx:162`: "Las coordenadas deben ser reales y estar dentro de rango."
**Impacto:** Percepción de calidad. Los usuarios notan errores ortográficos.
**Riesgo:** Muy bajo.

### M2. Botón volver en Payments retry no disponible
**Archivo:** `portal-payments-screen.tsx:28-31`
**Evidencia:** `retryPayment()` navega a `/ventas/pago` con `router.push()`. No hay forma de volver a Payments desde checkout a menos que el usuario use el navegador "atrás".
**Impacto:** Ruptura menor en la navegación.
**Riesgo:** Bajo.

### M3. Mapa en rutas no se puede ocultar
**Archivo:** `portal-routes-screen.tsx:276`
**Evidencia:** Una vez que el mapa aparece (porque se seleccionaron coordenadas), no hay botón para ocultarlo.
**Impacto:** Ocupa espacio en pantallas pequeñas sin poder colapsarse.
**Riesgo:** Bajo.

### M4. Duplicación de lista de vehículos entre Dashboard y Rutas
**Archivos:** `portal-dashboard-screen.tsx:633-660` vs `portal-routes-screen.tsx:341-402`
**Evidencia:** Ambos muestran lista de vehículos con código, ruta y conductor. Dashboard añade datos operativos (velocidad, GPS, estado jornada). Rutas añade acciones (editar, liberar, duplicar).
**Impacto:** Mantenimiento duplicado. No hay navegación directa desde Dashboard a gestión de rutas.
**Riesgo:** Bajo para producción, medio para mantenibilidad.

### M5. `trial_active` mapeado como `TRIAL`
**Archivo:** `ventas/features/commercial/subscription-state.ts:10`
**Evidencia:** `trial_active` se mapea a `TRIAL`. Si backend separa "trial" de "trial activo", se pierde la distinción.
**Impacto:** El portal no puede diferenciar un trial que nunca se activó de uno activo.
**Riesgo:** Bajo.

### M6. `canceled` (single L) manejado aparte de `cancelled`
**Archivo:** `ventas/features/commercial/subscription-state.ts:20-21`
**Evidencia:** Se manejan ambos, pero añade complejidad. Si el backend usa solo una variante, la otra es código muerto.
**Impacto:** Código muerto potencial.
**Riesgo:** Muy bajo.

### M7. Sin transiciones de estado validadas en frontend
**Archivo:** `ventas/features/commercial/subscription-state.ts`
**Evidencia:** La máquina de estados solo mapea estados a presentación. No hay validación de transiciones (ej: ir de PAYMENT_FAILED a ACTIVE).
**Impacto:** Si el backend envía una transición inválida, el frontend la muestra sin rechazarla.
**Riesgo:** Bajo (backend tiene su propia validación).

### M8. `category` en documentos acepta cualquier string
**Archivo:** `backend/src/modules/documents/routes.js:174`
**Evidencia:** `String(req.body.category || "evidence").trim()` sin validación contra valores permitidos.
**Impacto:** Se pueden almacenar documentos con categorías inventadas que luego no se pueden filtrar.
**Riesgo:** Bajo.

---

## 🟢 Observaciones

### O1. Arquitectura general sólida
La separación entre Portal web (gestión administrativa) y Mobile (operaciones) es correcta. El backend unificado con Socket.IO para tiempo real está bien diseñado. La máquina de estados de suscripción cubre 9 estados con presentación diferenciada.

### O2. Mobile app tiene manejo robusto de estados
Las pantallas mobile (Mapa, Incidencias, Chat, Radio, Checklist) implementan máquinas de estado completas con manejo de carga, error, vacío, y reconexión. Radio tiene un estado de sesión particularmente robusto con reducers.

### O3. Auto-login y refresh token funcionan correctamente
El flujo de inicialización con `initialize()` → validación de token → refresh automático en 401 → `clearSession()` en fallo está bien implementado. El singleton `refreshTokenPromise` evita race conditions.

### O4. Portal Onboarding cubre el ciclo de activación completo
La pantalla de activación incluye generación de keys, copia/Compartir/revocación, timeline de eventos, y wizard de pasos con enlaces a cada pantalla. Después de generar una key, el mensaje ahora guía al admin a revisar Equipo.

### O5. Portal Layout con navegación completa
El sidebar con secciones Cuenta/Administración/Ayuda y control de permisos por rol (`canAccessPortal`, `hasPortalPermission`) es completo y correcto.

---

## Preguntas finales

### 1. ¿Liberarías este sistema hoy? ¿Por qué?
**No.** Hay 5 bloqueantes que impiden una liberación con calidad:

- **B3** (sin UI de Documentos/Incidentes en Portal) significa que dos historias de usuario core no están entregadas.
- **B2** (corrupción de estado de unidades al editar) es un bug de datos que puede causar pérdida de asignaciones.
- **B1** (modal de cambio de estado no funcional) es una funcionalidad quebrada.
- **B4** (checklist sin backend propio) es frágil.
- **B5** (búsqueda O(N*M) de audio radio) es un problema de rendimiento que empeora con el uso.

Además, hay 12 hallazgos importantes que deberían corregirse antes de producción.

### 2. ¿Qué bloquea una liberación?
1. **B3** — Portal no tiene pantallas para documentos, incidentes, chat ni radio. Sin esto, los administradores no pueden operar funcionalidades contratadas.
2. **B2** — Corrupción silenciosa de datos de unidades al editar.
3. **B1** — Modal de cambio de estado de usuario no funcional (dead-end UX + funcionalidad aparente que no opera).
4. **B5** — Degradación de rendimiento en radio al buscar audios.
5. **I9** — Falsos positivos de SOS por regex demasiado permisivo.

### 3. ¿Qué puede esperar a una versión posterior?
- **I1, I4-I8, M1-M8** — Son mejoras de UX, mensajes, acentos, y optimizaciones. No bloquean la operación core.
- **Chat/Radio en Portal** (parte de B3) — Aunque sería ideal tenerlo, las funcionalidades de chat y radio son principalmente mobile; el portal puede priorizar documentos e incidentes primero.
- **M3-M4** — Son mejoras de UI/UX menores.
- **Validación de transiciones de estado** (I11, M7) — El backend ya valida, el frontend es secundario.

### 4. ¿Cuál es el nivel de preparación estimado (0–100%)?
**72%**

- Funcionalidades core de gestión (usuarios, unidades, rutas, planes, facturación): ~85% completas (con bugs B1, B2).
- Funcionalidades operativas (dashboard, sesiones, mapa, GPS): ~90% completas.
- Funcionalidades de soporte (documentos, incidentes): ~30% completas en Portal (backend listo, frontend faltante).
- Funcionalidades de comunicación (chat, radio): ~60% completas en Mobile, 0% en Portal.
- Checklist: ~50% (mobile tiene UI pero no hay modelo backend dedicado).

### 5. ¿Cuáles son los tres mayores riesgos restantes?

1. **Corrupción de datos por B2** (riesgo de negocio) — Administradores pueden perder asignaciones de vehículos sin saberlo al editar unidades. Esto afecta la operación diaria de la flota.

2. **Portal incompleto para administradores** (riesgo de producto) — Sin gestión de documentos ni incidentes, los administradores deben usar el mobile o no tienen acceso a funcionalidades que el backend ya soporta. Esto puede generar insatisfacción si se vendió como funcionalidad de portal.

3. **Degradación progresiva de radio** (riesgo técnico) — La búsqueda O(N*M) de audio sin paginación no escala. En producción con uso intensivo de radio, los tiempos de respuesta se degradarán linealmente con el volumen de mensajes, afectando la comunicación operativa en tiempo real.
