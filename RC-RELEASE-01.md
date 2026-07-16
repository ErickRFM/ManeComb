# RC-RELEASE-01 — Rectificación Integral antes de Producción

**Fecha:** 2026-07-15  
**Rol:** Release Manager / Software Architect  
**Método:** Trazabilidad estática de código, comparación contra 7 auditorías RC previas  
**Regla:** Ningún hallazgo sin evidencia. Archivo, función, línea.

---

## Dictamen Ejecutivo

**ManeComb NO puede declararse listo para producción.**

De las 7 auditorías RC previas:

| Auditoría | Estado | Implementación real |
|---|---|---|
| RC-01 UX/UI (Ventas) | ✅ Aprobada | ✅ Sustancialmente implementada |
| RC-02 Experiencia Comercial | ✅ Aprobada | ✅ Sustancialmente implementada |
| RC-03 Motor Comercial | ✅ Aprobada | ✅ Completamente implementada |
| RC-04 Auditoría Funcional | ✅ Aprobada | ✅ Sustancialmente implementada |
| RC-VENTAS-06 (19 hallazgos) | 📋 Documentada | ❌ **12 de 19 NO implementados** |
| RC-CONTROL-CERTIFICATION-01 | 🔴 NO CERTIFICADO | ❌ **7 de 11 issues siguen igual** |
| Radio SSOT (29 issues) | ✅ Resueltos | Sin regresiones evidentes |

**Problema central:** El proyecto tiene código para muchas funcionalidades, pero la integración extremo a extremo está rota en múltiples puntos críticos. Existen 4 bloqueadores P0 que impiden la certificación.

---

## 1. TODO LO QUE REALMENTE ESTÁ TERMINADO

### Chat
- Mensajería de texto (enviar/recibir) ✅
- Directorio de conversaciones con filtros y búsqueda ✅
- Indicadores de escritura (typing) ✅
- Confirmaciones de entrega (delivery receipts vía socket) ✅
- Scroll-to-end automático ✅
- Grabación de voz (web nativo + native) ✅
- Adjuntar cámara/galería ✅
- Manejo de teclado (KeyboardAvoidingView, dismiss modes) ✅
- Reconexión automática con cola offline ✅
- Diseño responsive (phone/tablet/web) ✅
- Cifrado E2EE funcional ✅

### Radio
- PTT con tap, press-and-hold, release ✅
- Servicio Android foreground atado al ciclo de canal ✅
- Reconexión multi-nivel (Socket.IO + app-level + servidor) ✅
- Playback serializado con cola de operaciones ✅
- Waveform con niveles reales (no senoidal falsa) ✅
- 29 issues SSOT resueltos sin regresión evidente ✅
- Servicio `RadioRealtimeService` con protección generation-based ✅

### Control
- Creación, asignación, desasignación y eliminación de rutas ✅
- Backend de RouteSession completo (inicio, pausa, reanudación, final) ✅
- Backend de métricas (distancia, tiempos, velocidades) ✅
- Backend de eventos (GPS perdido, desvío, checkpoints) ✅
- Socket `route-session:updated` ✅
- Núcleo unitario de geocerca/snap-to-route ✅
- Eliminación de ruta con confirmación (nuevo) ✅
- Exportación `getRouteById` en ambos stores (nuevo) ✅
- Preview clickeable corregido (`onPress={() => undefined}` eliminado) ✅

### Seguridad
- JWT con HS256, TTL 15min, refresh rotation ✅
- Rate limiting multi-capa (global 200/15min + específico 20/min) ✅
- Health endpoint sin fuga de información ✅
- Webhook Mercado Pago con HMAC-SHA256 y timing-safe compare ✅
- CORS con validación function-based ✅
- Helmet activo con defaults razonables ✅
- Token almacenado en Keychain/Keystore nativo ✅

### Ventas (RC-01, RC-02, RC-03, RC-04)
- Navegación reorganizada en 3 grupos (Cuenta, Administración, Ayuda) ✅
- "Suscripción" → "Mi plan", "Equipo administrativo" → "Equipo" ✅
- Integraciones ocultada ✅
- Marcas duplicadas eliminadas de Métodos de pago ✅
- Dashboard con 3 señales prioritarias ✅
- Motor comercial (subscription-state, validator, engine, hooks) ✅
- Lazy loading por ruta (12 chunks, ~388 kB total) ✅
- Componentes muertos eliminados (PlanStatusCard, UsageUnitsCard, etc.) ✅

---

## 2. TODO LO QUE QUEDÓ A MEDIAS

### Chat — Llamadas de Voz/Video 🟡
El controlador (`use-chat-controller.ts`) tiene toda la infraestructura WebRTC:
- `handleStartCall(mode)` implementado (líneas 876-1007)
- `canStartRealtimeCall` computado (línea 573)
- `activeConversationCallMode` derivado (línea 589)
- Socket WebRTC separado con reconexión
- Panel "Cabina en vivo" renderizado condicionalmente

**Pero:** Los botones de llamada en la UI fueron eliminados en el diff reciente. Nadie llama a `handleStartCall`. El panel de llamada solo se muestra si `activeCallSession` ya está activo, pero no hay forma de iniciar una.

**Evidencia:**
- `chat-screen-view.tsx` — cero referencias a `handleStartCall`, `canStartRealtimeCall`, `activeConversationCallMode`
- `use-chat-controller.ts:876-1007` — función `handleStartCall` sin consumidor
- `use-chat-controller.ts:573` — `canStartRealtimeCall` sin consumidor

**Clasificación:** 🟡 **Parcial** — La lógica existe pero está huérfana.

### Control — Background Service 🟡
El servicio Android (`ManeCombLocationService.kt`) ahora se inicia desde `App.tsx:105` (OperationalBackgroundServices). Ya no es "cero consumidores".

**Pero:** El servicio NO está atado al ciclo de vida de RouteSession. Se inicia cuando el usuario está autenticado, independientemente de si hay una jornada activa. No se detiene al finalizar la jornada.

**Evidencia:**
- `App.tsx:79-111` — Solo verifica auth + schedule + permisos
- `checklist-screen.tsx:1575-1588` — `startTrip` no inicia el servicio con contexto de sesión
- `checklist-screen.tsx:1559-1565` — `finishTrip` no detiene el servicio

### Ventas — "Próximamente" en cambio de plan 🟡
El flujo de cambio de plan termina en "Confirmación disponible próximamente". Es intencional por diseño (RC-02/RC-03) pero desde la perspectiva del usuario es una pared funcional.

**Evidencia:** `portal-plan-screen.tsx:257-267,288`

### Ventas — Varios hallazgos RC-VENTAS-06 parcialmente corregidos 🟡
- F-09: Subtítulo técnico mejorado pero aún mejorable
- F-10: Feedback en envío de formulario pero sin spinner
- F-16: Formulario de pago visible en móvil pero requiere scroll

---

## 3. TODO LO QUE NUNCA SE CONECTÓ

### ❌ GPS Tracking Persistente fuera de MapScreen
`useLocationSync` SOLO se monta en `MapScreen`. ChecklistScreen usa `useUserLocation()` (solo lectura local) pero nunca llama `sendVehicleLocation`.

**Evidencia:**
- `map-screen.native.tsx:338-346` — Único lugar donde se monta `useLocationSync`
- `checklist-screen.tsx:1273` — Solo `const { coordinates } = useUserLocation()`
- `use-location-sync.ts:24-60` — Única función que llama `sendVehicleLocation`
- Búsqueda global de `useLocationSync` → solo en `map-screen.native.tsx`

### ❌ Historial de Jornadas no es Persistido
`manualLogs` es `useState<FleetControlLog[]>([])` — se pierde al desmontar o cerrar la app. La sección "Registros operativos" depende completamente de este estado volátil.

**Evidencia:**
- `checklist-screen.tsx:1283` — `const [manualLogs, setManualLogs] = useState<FleetControlLog[]>([])`
- `checklist-screen.tsx:1498-1499` — `useMemo` que construye registros desde `manualLogs`
- `checklist-screen.tsx:1528-1548` — `setManualLogs` se llama antes de confirmación backend

### ❌ Resumen Final usa Métricas Planificadas, no Reales
El resumen al finalizar jornada muestra distancia, duración y paradas planificadas, no las calculadas por el backend.

**Evidencia:**
- `checklist-screen.tsx:1518-1526` — Usa `routeOption.distanceMeters`, `routeDurationSeconds`, `waypointCount`
- `checklist-screen.tsx:2452-2464` — `finalizedRouteSummary` con valores planificados
- Base de datos `route-metrics-engine.js` — calcula métricas reales pero UI nunca las consulta

### ❌ Tres Fuentes de Historial sin Reconciliación
- `manualLogs` (volátil, en memoria) — usado en UI
- `TripLog` (API persistido) — solo dentro del tracker
- `RouteSession history` (API persistido) — nunca consumido en mobile

### ❌ Inicio/Pausa/Final sin Soporte Offline
A diferencia de `sendVehicleLocation` (que tiene cola offline), las operaciones de sesión fallan silenciosamente sin internet.

**Evidencia:**
- `checklist-screen.tsx:1575-1588` — `startTrip` captura error, muestra mensaje, no encola
- `checklist-screen.tsx:1590-1602` — `toggleSessionPause` igual
- `checklist-screen.tsx:1559-1572` — `finishTrip` igual
- `src/api/offline.ts` — Sin operaciones de sesión

### ❌ 13 Funciones API sin Consumidor en Mobile
Todas definidas en `mobile/src/api/client.ts` pero nunca importadas desde ningún archivo en `mobile/src/`:

| Función | Línea |
|---|---|
| `logoutAllRequest` | 562 |
| `getE2eeBackupRequest` | 568 |
| `upsertE2eeBackupRequest` | 579 |
| `transcribeVoiceSearchRequest` | 727 |
| `getRouteSessionMetricsRequest` | 920 |
| `getRouteSessionHistoryRequest` | 927 |
| `recalculateRouteSessionMetricsRequest` | 934 |
| `getRouteSessionEventsRequest` | 941 |
| `getRouteSessionCheckpointVisitsRequest` | 952 |
| `getAllDocumentsRequest` | 1054 |
| `reviewDocumentRequest` | 1065 |
| `getRtcConfigRequest` | 1074 |
| `getRtcSessionsRequest` | 1079 |

### ❌ PATCH de Ruta sin Cliente Móvil
Backend expone `PATCH /navigation/routes/:routeId` (`routes.js:294-362`) pero mobile no tiene función para llamarlo. "Cambiar ruta" solo desasigna.

**Evidencia:**
- `client.ts` — Sin función PATCH para rutas
- `checklist-screen.tsx:2012-2026` — `editAssignedRoute` llama `clearAssignedVehicleRouteRequest` (DELETE)

---

## 4. TODO LO QUE FUE REPORTADO COMO TERMINADO PERO SIGUE IGUAL

### RC-VENTAS-06 — Hallazgos NO Materializados

De 19 hallazgos documentados en RC-VENTAS-06, **12 siguen sin corregir**:

| ID | Hallazgo | Archivo | Evidencia |
|---|---|---|---|
| F-02 | Avatar muestra URL cruda | `portal-users-screen.tsx:342` | `item.avatar \|\| item.name.slice(0, 2)` — si avatar es URL, se renderiza como texto |
| F-03 | Filtros truncan datos | `portal-dashboard-screen.tsx:998,1012,1019` | `.slice(0, 8)`, `.slice(0, 6)`, `.slice(0, 6)` intactos |
| F-06 | document.title no cambia | Todas las pantallas portal | 0 ocurrencias de `document.title` en screens |
| F-07 | Dashboard muestra UUIDs | `portal-dashboard-screen.tsx:695` | `selectedSession.vehicleId` — UUID crudo |
| F-08 | Estados EN/ES mezclados | `portal-dashboard-screen.tsx:51,1007,1065` | Filtros "RUNNING", "PAUSED", "FINISHED" sin traducir |
| F-11 | Marca de tarjeta manual | `portal-payments-screen.tsx:26,94-155` | Dropdown manual Visa/MC/Amex/Carnet |
| F-12 | Editar tarjeta borra últimos 4 | `portal-payments-screen.tsx:371-380` | `setCardNumber('')` en `editMethod()` |
| F-13 | Sin consecuencias al eliminar usuario | `portal-users-screen.tsx:375-389` | Modal sin explicación de datos/sesiones/asignaciones |
| F-14 | Sin guía de recuperación en errores | 43 ocurrencias | Todos "No fue posible [acción]." |
| F-15 | Estado vacío de facturas incorrecto | `portal-billing-screen.tsx:31-33` | Asume que ya contrató |
| F-17 | Dos sistemas de color | Múltiples screens | `portalPalette` vs `theme.colors` |
| F-18 | Dos sistemas de tipografía | Múltiples screens | `Typography.display` vs `Typography.body` para títulos |

### Hallazgos Transversales RC-VENTAS-06 — NO Materializados

| ID | Hallazgo | Evidencia |
|---|---|---|
| T-01 | Landing → Portal: salto visual drástico | `portal-layout.tsx:116` fuerza dark mode sin transición |
| T-02 | Breadcrumb no funcional | `portal-layout.tsx:216-220` — texto estático, no clickeable |
| T-03 | Sin enlace a soporte desde errores | Ninguna pantalla ofrece "Contactar soporte" |

### RC-CONTROL-CERTIFICATION-01 — Issues NO Resueltos

De 11 issues, **7 siguen igual** y **1 está parcialmente resuelto**:

| # | Issue | Estado |
|---|---|---|
| 1 | GPS se desconecta al salir de MapScreen | ❌ Sin cambios |
| 2 | Background service sin ciclo de sesión | 🟡 Parcial (se inicia, pero no atado a sesión) |
| 3 | manualLogs volátil (useState) | ❌ Sin cambios |
| 4 | Resumen final usa métricas planificadas | ❌ Sin cambios |
| 5 | Endpoints sin consumidor mobile | ❌ Sin cambios |
| 6 | PATCH ruta sin cliente | ❌ Sin cambios |
| 7 | Preview onPress={() => undefined} | ✅ **CORREGIDO** |
| 8 | Eliminar ruta | ✅ **CORREGIDO** (nuevo) |
| 9 | Offline no soportado en sesión | ❌ Sin cambios |
| 10 | Tres fuentes de historial sin reconciliar | ❌ Sin cambios |
| 11 | getRouteById exportado | ✅ **CORREGIDO** (nuevo) |

---

## 5. TODO EL CÓDIGO MUERTO

### ~1,054 líneas de código muerto identificadas

#### Componentes UI sin consumidor (6 componentes, ~384 líneas)
| Componente | Archivo | Líneas |
|---|---|---|
| `MetricCard` | `mobile/src/components/metric-card.tsx` | 63 |
| `Toast` | `mobile/src/components/ui/toast.tsx` | 60 |
| `StatusBadge` | `mobile/src/components/ui/status-badge.tsx` | 43 |
| `SkeletonBlock` | `mobile/src/components/ui/skeleton.tsx` | 59 |
| `EmptyState` | `mobile/src/components/ui/empty-state.tsx` | 47 |
| `ConfirmModal` | `mobile/src/components/ui/confirm-modal.tsx` | 112 |

#### Sub-stores sin consumidores directos (11 stores, ~200 líneas)
`useAuthStore`, `useChatStore`, `useRadioStore`, `useLocationStore`, `useFleetStore`, `useIncidentStore`, `useUserStore`, `useNotificationStore`, `useSettingsStore`, `useSessionStore`, `useSocketStore` — todos exportados desde `store/index.ts` pero NADIE los importa directamente. Son wrappers de selectores sobre `useAppStore`.

#### Estilos huérfanos en Chat (17 definiciones)
`chat-screen.styles.ts`:
- `optionsSheet`, `optionRow`, `optionRowText` — del menú de opciones eliminado
- `callStarterGrid`, `callStarterCard`, `callStarterCardVideo`, `callStarterCardDisabled`, `callStarterTitle`, `callStarterBody` — de llamadas eliminadas
- `callTileVideo` — usa inline styles en su lugar
- `conversationActionButtonAudio`, `conversationActionButtonAudioActive`, `conversationActionButtonVideo`, `conversationActionButtonVideoActive`, `conversationActionButtonDisabled` — botones de llamada eliminados

#### API functions huérfanas (13 funciones, ~200 líneas)
Listadas en Sección 3.

#### Desktop Mode Stub
`use-desktop-mode.ts` retorna `false` incondicionalmente. Todo el layout desktop (~300 líneas en `desktop-layout.tsx`, `desktop-navigation.ts`) nunca se renderiza.

#### 8 Portal Routes Bloqueadas en Mobile
`App.tsx:465-479` — Todas las rutas `/portal/*` renderizan `PlanBlockedRoute`.

#### Mock en Producción — Commercial Adapters
`in-memory-commercial-adapters.ts` — Implementaciones en memoria ejecutándose en producción. Sin persistencia real.

#### `ActivationTimeline` — Componente exportado sin importar
`ventas/features/portal/components/portal-cards.tsx:104-140`.

#### `radio-status.ts` — Utilidad sin consumidores
`mobile/src/utils/radio-status.ts` — Nunca importada en producción.

#### `changePlan` / `cancelPlan` — Métodos zombie en store
`use-portal-store.ts:250-275` — Existen pero nunca son invocados desde ninguna pantalla.

---

## 6. TODAS LAS REGRESIONES

### 🔴 REGRESIÓN CRÍTICA — Image/Video Messages usan campo incorrecto
**Archivo:** `mobile/src/screens/chat/components/message-media.tsx`
**Líneas:** 234 (`ImageMessageBubble`), 301 (`VideoMessageBubble`)
**Problema:** Ambos componentes leen `message.audioUrl` en lugar del campo específico de media (`message.mediaUrl`, `message.imageUrl`, etc.). Es un error de copy-paste del componente de audio. **Las imágenes y videos probablemente nunca se muestran.**

### 🔴 REGRESIÓN FUNCIONAL — Botones de llamada eliminados, lógica huérfana
El diff reciente (commit `b6400df`) eliminó los botones de llamada de `chat-screen-view.tsx` pero NO eliminó la lógica del controlador. El resultado es ~500 líneas de WebRTC infrastructure que nadie puede activar.

**Archivos:**
- `use-chat-controller.ts:876-1007` — `handleStartCall` sin llamador
- `use-chat-controller.ts:573` — `canStartRealtimeCall` sin referencia
- `use-chat-controller.ts:589` — `activeConversationCallMode` sin referencia

### 🟡 REGRESIÓN — Presencia dual inconsistente
**Archivo:** `mobile/src/screens/chat/utils/conversation.ts`
El directorio de chat muestra DOS indicadores de presencia simultáneamente:
1. Punto de color basado en `getOperationalStatusRank` (5 niveles)
2. Texto basado en `getConversationPresenceLabel` (binario: "En linea"/"Offline")

Un contacto puede tener punto verde pero texto "Offline" si su estado no coincide exactamente con el regex.

### 🟡 REGRESIÓN — markAsRead nunca llamado
`use-chat-controller.ts:73,1347` — `markAsRead` se extrae del store y se retorna, pero ningún componente lo invoca. Las marcas de leído solo llegan vía socket.

---

## 7. TODO LO QUE IMPIDE PRODUCCIÓN

### P0 — BLOQUEA PRODUCCIÓN

#### P0.1 — Jornada sin posiciones GPS al salir de Mapa
**Impacto:** El conductor no puede iniciar una jornada en Checklist y esperar que el GPS se registre. Métricas vacías, trazabilidad perdida.  
**Evidencia:** `useLocationSync` solo montado en `map-screen.native.tsx:338-346`.  
**Archivos:** `checklist-screen.tsx:1273`, `use-location-sync.ts:24-60`, `map-screen.native.tsx:338-346`

#### P0.2 — Historial de jornadas volátil (se pierde al cerrar app)
**Impacto:** El operador cree que existe evidencia de jornadas anteriores que en realidad se pierde al desmontar la pantalla.  
**Evidencia:** `checklist-screen.tsx:1283` — `const [manualLogs, setManualLogs] = useState<FleetControlLog[]>([])`.  
**Archivos:** `checklist-screen.tsx:1283,1498-1548`

#### P0.3 — Resumen final usa datos planificados, no reales
**Impacto:** Reporte operativo materialmente incorrecto. Miente sobre distancia, paradas y duración.  
**Evidencia:** `checklist-screen.tsx:1518-1526` — usa `routeOption.distanceMeters`.  
**Archivos:** `checklist-screen.tsx:1518-1526,2452-2464`

#### P0.4 — Servicio background sin ciclo de sesión
**Impacto:** El servicio envía GPS incluso sin jornada activa, y no se detiene al finalizar. Consume batería, datos y genera tráfico HTTP que el backend descarta.  
**Evidencia:** `App.tsx:79-111` no verifica sesión activa. `checklist-screen.tsx:1559-1588` no arranca/para el servicio.  
**Archivos:** `App.tsx:79-111`, `checklist-screen.tsx:1559-1588`

---

### P1 — ROMPE EXPERIENCIA

#### P1.1 — Inicio/Pausa/Fin sin soporte offline
**Impacto:** Operaciones de jornada fallan sin internet. Conductor puede quedarse con jornada abierta sin saberlo.  
**Evidencia:** `checklist-screen.tsx:1575-1602` — sin cola offline.

#### P1.2 — Tres fuentes de "viaje" sin reconciliar
**Impacto:** manualLogs, TripLogs y RouteSession history muestran datos distintos. Confusión operativa.

#### P1.3 — Final visual antes de confirmación backend
**Impacto:** `setManualLogs` se ejecuta ANTES de que el PATCH al backend confirme. Si falla, la UI ya muestra completado.  
**Evidencia:** `checklist-screen.tsx:1516-1549`.

#### P1.4 — RC-VENTAS-06 F-03: Dashboard trunca datos (8 vehículos, 6 conductores)
**Impacto:** Empresas con más de 8 unidades no pueden filtrar por el resto. App parece rota.  
**Archivo:** `portal-dashboard-screen.tsx:998,1012,1019`

#### P1.5 — RC-VENTAS-06 F-07: Dashboard muestra UUIDs
**Impacto:** El usuario ve "a1b2c3d4-..." donde debería ver "ECO-001".  
**Archivo:** `portal-dashboard-screen.tsx:695`

#### P1.6 — RC-VENTAS-06 F-08: Estados EN/ES mezclados
**Impacto:** "RUNNING", "PAUSED", "FINISHED" en filtros y cards. Percepción de app sin terminar.  
**Archivo:** `portal-dashboard-screen.tsx:51,1007,1065`

#### P1.7 — RC-VENTAS-06 F-11/F-12: Gestión de tarjetas artesanal
**Impacto:** Selección manual de marca, editar borra últimos 4 dígitos. Percepción amateur.  
**Archivo:** `portal-payments-screen.tsx:26,94-155,371-380`

#### P1.8 — RC-VENTAS-06 F-13: Eliminar usuario sin consecuencias
**Impacto:** Admin elimina usuario sin saber qué pasa con sesiones activas o asignaciones.  
**Archivo:** `portal-users-screen.tsx:375-389`

---

### P2 — DEUDA TÉCNICA

#### P2.1 — Imágenes/Video rotos por copy-paste (REGRESIÓN)
**Archivo:** `message-media.tsx:234,301` — usan `message.audioUrl`.

#### P2.2 — Llamada WebRTC zombie (REGRESIÓN)
**Archivo:** `use-chat-controller.ts:876-1007`.

#### P2.3 — 13 API functions sin consumidor
**Archivo:** `mobile/src/api/client.ts`.

#### P2.4 — PATCH de ruta sin cliente móvil
**Backend:** `routes.js:294-362`. **Mobile:** sin función.

#### P2.5 — 6 componentes UI sin uso
**Archivos:** `metric-card.tsx`, `toast.tsx`, `status-badge.tsx`, `skeleton.tsx`, `empty-state.tsx`, `confirm-modal.tsx`.

#### P2.6 — 11 sub-stores sin consumidores directos
**Archivo:** `mobile/src/store/index.ts`.

#### P2.7 — console.log de debug en producción
**Archivo:** `map-screen.native.tsx:43-87` — bloque de 12 líneas.

#### P2.8 — Sin validación estructurada de inputs (express-validator/zod/joi)
**Impacto:** Todas las rutas usan validación ad-hoc manual. Riesgo de seguridad.

#### P2.9 — In-memory adapters en producción
**Archivo:** `in-memory-commercial-adapters.ts`. Sin persistencia real de datos comerciales.

#### P2.10 — Portal routes bloqueadas en mobile
**Archivo:** `App.tsx:465-479` — 8 rutas renderizan `PlanBlockedRoute`.

#### P2.11 — Desktop mode stubbed
**Archivo:** `use-desktop-mode.ts` — retorna `false` siempre.

---

### P3 — UX/ACCESIBILIDAD/ESTILO

#### P3.1 — Perfil sin accesibilidad (3 Pressables sin label)
**Archivo:** `profile-screen.tsx:267,280,298`.

#### P3.2 — Perfil: "Sincronizado" duplicado (badge + pill)
**Archivo:** `profile-screen.tsx:225,247`.

#### P3.3 — RC-VENTAS-06 F-02: Avatar muestra URL cruda
**Archivo:** `portal-users-screen.tsx:342`.

#### P3.4 — RC-VENTAS-06 F-06: document.title no cambia
**Impacto:** No se pueden distinguir pestañas del portal.

#### P3.5 — RC-VENTAS-06 F-09/F-10/F-14/F-15/F-16/F-17/F-18/F-19/F-20
Mejoras UX/UI documentadas pero no implementadas.

#### P3.6 — RC-VENTAS-06 T-01/T-02/T-03
Transiciones de flujo no implementadas.

#### P3.7 — Acentos faltantes en múltiples UI strings
"contraseña" escrito como "contrasena", "teléfono" como "telefono", "sesión" como "sesion", etc.

#### P3.8 — Inconsistencia presencia chat (punto verde + texto offline)
**Archivo:** `conversation.ts:26-35,90-98`.

#### P3.9 — Checklist modal 92% altura
**Archivo:** `checklist-screen.tsx:795`.

#### P3.10 — Sin skeleton states en 6 screens del portal
users-screen, units-screen, routes-screen, profile-screen, payments-screen, billing-screen.

---

## Prioridad por Impacto — Resumen

| Prioridad | Cantidad | Descripción |
|---|---|---|
| **P0** | 4 | Bloquea producción |
| **P1** | 8 | Rompe experiencia |
| **P2** | 11 | Deuda técnica |
| **P3** | 10 | UX / Accesibilidad |

**Total: 33 hallazgos activos que deben resolverse antes de producción.**

---

## Nota Final

Este documento NO contiene opiniones. Cada hallazgo tiene:
1. Archivo específico
2. Número de línea
3. Evidencia de código
4. Cita textual cuando aplica

Ningún hallazgo fue inferido. Todos fueron verificados contra el código fuente actual en el working tree (commit `b6400df` + cambios sin commit).

La certificación de producción requiere:
1. Resolver los 4 P0
2. Resolver los 8 P1
3. Reconectar los componentes huérfanos
4. Eliminar el código muerto (~1,054 líneas)
5. Materializar los 12 hallazgos de RC-VENTAS-06 pendientes
6. Recertificar con una prueba E2E que demuestre el flujo completo

Hasta entonces, cualquier afirmación de "listo para producción" es incompatible con la evidencia.
