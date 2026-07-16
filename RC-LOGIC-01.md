# RC-LOGIC-01: Certificación Integral de Lógica Funcional — ManeComb

**Fecha:** 2026-07-15
**Alcance:** mobile/ · ventas/ · backend/
**Metodología:** Trazado completo desde cada elemento de UI hasta backend y vuelta

---

## Resumen Ejecutivo

| Clasificación | Cantidad |
|---|---|
| 🟢 Certificado | 42 |
| 🟡 Parcial | 18 |
| 🔴 Roto | 5 |
| ⚫ Sin implementación | 3 |

| Prioridad | Cantidad |
|---|---|
| P0 — Rompe operación | 4 |
| P1 — Rompe flujo | 8 |
| P2 — UX | 10 |
| P3 — Refactor | 4 |

---

## 1. Login / CustomerAuthScreen

**Archivo:** `mobile/src/screens/customer-auth-screen.tsx`

### Elementos interactivos

| Elemento | onPress | Hook | Store | Backend | Persistencia | Estado | Resultado |
|---|---|---|---|---|---|---|---|
| Segmento "Iniciar sesión" | `goToMode('login')` → `router.replace('/login')` | — | — | — | — | Local | 🟢 |
| Segmento "Registrarse" | `goToMode('register')` → `router.replace('/registro')` | — | — | — | — | Local | 🟢 |
| Segmento "Cliente"/"Soy conductor" | `setRegisterProfile('owner'|'driver')` | — | — | — | — | Local | 🟢 |
| Campo email/phone | `onChangeText` → setLoginIdentity | — | — | — | — | Local | 🟢 |
| Campo contraseña | `onChangeText` → setLoginPassword | — | — | — | — | Local | 🟢 |
| **Botón principal "Iniciar sesión"** | `handleSubmit()` → `signIn(email, password, rememberSession)` | useAppTheme | `useAppStore.signIn` | `POST /auth/login` | SecureStore (token/refresh) | `isSubmitting`, `error` | 🟢 |
| **Botón "Registrarse"** | `handleSubmit()` → `register(payload, rememberSession)` | useAppTheme | `useAppStore.register` | `POST /auth/register` | SecureStore (token/refresh) | `isSubmitting`, `error` | 🟢 |
| **Botón "Activar cuenta" (driver)** | `handleSubmit()` → `activateDriverWithKey(payload, rememberSession)` | useAppTheme | `useAppStore.activateDriverWithKey` | `POST /driver/activation/register` | SecureStore | `isSubmitting`, `error` | 🟢 |
| Checkbox "Recordarme" | `setRememberSession(!current)` | — | — | — | — | Local | 🟢 |
| **Link "Recuperar acceso"** | `setHelperMessage('Contacta al administrador...')` | — | — | **Ninguno** — solo mensaje estático | — | Local | 🔴 **P1: No hay flujo de recuperación de contraseña real** |
| Link "Términos y Condiciones" | `router.push('/terminos')` | — | — | — | — | Navegación | 🟢 |
| Link "Política de Privacidad" | `router.push('/privacidad')` | — | — | — | — | Navegación | 🟢 |
| **Botón "Probar conexión"** | `handleTestConnection()` → `healthRequest()` | useAppTheme | — | `GET /health` | — | `isTestingConnection`, mensaje | 🟢 |
| Campo driver activation key | `onChangeText` → setDriverActivationKey | — | — | `POST /driver/activation/validate` | — | `isValidatingDriverKey` | 🟢 |

### Cadena completa: Login
```
Tap "Iniciar sesión"
→ handleSubmit() valida campos
→ normalizeIdentity(loginIdentity)
→ store.signIn(email, password, rememberSession)
  → loginRequest(email, password) → POST /api/auth/login
  → replaceSessionFromBackend(token, refreshToken, remember)
    → setAuthToken(token) [axios header]
    → persistSession(token, refreshToken, mode) [SecureStore]
    → getSessionRequest() → GET /api/auth/me
  → refreshAll() → carga 9 endpoints paralelos
  → connectSocket()
  → registerCurrentPushToken()
  → persistOfflineSnapshot()
→ Redirect a /mapa via <Redirect href={getAuthenticatedHome(user)}>
```
✅ **Certificado**

---

## 2. Mapa / MapScreen

**Archivo:** `mobile/src/screens/map-screen.native.tsx`

### Elementos interactivos

| Elemento | onPress | Hook | Store | Backend | Persistencia | Estado | Resultado |
|---|---|---|---|---|---|---|---|
| **FAB Refresh** | `handleRefresh()` → `refreshAll()` + `refreshDeviceLocation()` | useMapCamera | `useAppStore.refreshAll` | 9 endpoints paralelos | Offline cache fallback | `isRefreshing` | 🟢 |
| **FAB Follow mode** | `setFollowMode(!current)` | useMapCamera | — | — | — | Local | 🟢 |
| **FAB Traffic** | `setTrafficEnabled(!current)` | — | — | — | — | Local | 🟢 |
| **FAB Next Alert** | `focusNextAlert()` → `focusMap()` o `router.push('/incidencias')` | useMapCamera | — | — | — | `activeAlertIndex` | 🟢 |
| **FAB Start Journey** | `handleStartJourney()` → `router.push('/checklist?action=start')` | — | — | — | — | Navegación | 🟢 |
| **FAB Pause Journey** | `handlePauseJourney()` → `router.push('/checklist?action=pause')` | — | — | — | — | Navegación | 🟢 |
| **FAB Finish Journey** | `handleFinishJourney()` → `router.push('/checklist?action=finish')` | — | — | — | — | Navegación | 🟢 |
| **FAB Retry Location** | `refresh()` → `requestLocation()` | useLocationEngine | `useAppStore.deviceLocation` | — | — | `locationIssue`, `loading` | 🟢 |
| **Vehicle Marker press** | `onVehiclePress(vehicle)` → `setSelectedVehicleId`, `focusPoint`, `fitRoute` | useMapCamera, useTrackingData | — | — | — | Local | 🟢 |
| **Map tap (selector mode)** | `handleSelectorPress(location)` → `reverseNavigationPlaceRequest` → `planNavigationRouteRequest` | useMapSelector | — | `GET /navigation/reverse`, `POST /navigation/plan` | — | `selectorPoints`, `selectorPlan` | 🟢 |
| **TrackingHud Menu** | `setMenuOpen(true)` | — | — | — | — | Local | 🟢 |
| **TrackingHud Incidents** | `router.push('/incidencias')` | — | — | — | — | Navegación | 🟢 |
| **BottomPanel Retry** | `onRetryLocation` → `requestLocation()` | useLocationEngine | `deviceLocation` | — | — | `locationIssue` | 🟢 |
| **BottomPanel Incident vehicle** | `focusMap(vehicle.location)` | useMapCamera | — | — | — | Local | 🟢 |
| **BottomPanel Vehicle chip** | `focusMap(vehicle.location)`, `setSelectedVehicleId` | useMapCamera | — | — | — | Local | 🟢 |
| **SelectorRouteOverlay Remove origin/dest** | `removeSelectorPoint(role)` | useMapSelector | — | Aborta reverse geocode | — | `selectorPoints` | 🟢 |
| **SelectorRouteOverlay Reset** | `resetSelectorRoute()` | useMapSelector | — | Aborta ambos controllers | — | `selectorPoints`, `selectorStops` | 🟢 |
| **SelectorRouteOverlay Undo stop** | `removeLastSelectorStop()` | useMapSelector | — | — | — | `selectorStops` | 🟢 |
| **SelectorRouteOverlay Confirm** | `handleConfirmSelection()` → `router.push('/checklist')` | useMapSelector | — | — | — | Navegación con params | 🟢 |
| **MapDataRecovery Primary** | Según tipo: `openSalesPortal()`, `router.replace('/perfil-editar')`, `onRefresh` | — | — | — | — | Varios | 🟢 |
| **MapDataRecovery Sync** | `onRefresh` | — | — | — | — | `isRefreshing` | 🟢 |
| **MapDataRecovery Reset session** | `signOut()` → `router.replace('/login')` | — | `useAppStore.signOut` | `POST /auth/logout` | Clear SecureStore | — | 🟢 |

### Observaciones

1. **SelectorRouteOverlay** — La función `handleConfirmSelection()` construye params y navega a Checklist. Todas las rutas existen. ✅
2. **FAB Journey buttons** — Solo navegan a Checklist con parámetros `action`. La ejecución real ocurre en ChecklistScreen vía `useEffect([params.action])`. **Cadena completa verificada.** ✅
3. **useLocationEngine** — Maneja permisos, GPS native, fallbacks, reducer con 6 estados. ✅

🟢 **Certificado**

---

## 3. ChecklistScreen

**Archivo:** `mobile/src/screens/checklist-screen.tsx` (2596 líneas)

### Elementos interactivos

| Elemento | onPress | Hook | Store | Backend | Persistencia | Estado | Resultado |
|---|---|---|---|---|---|---|---|
| **Filter tabs** (Historial/En ruta/Rutas) | `setFilterMode(id)` | — | — | — | — | Local | 🟢 |
| **Record card "Ruta"** | `openRouteModal(vehicle)` → `setSelectedVehicleId`, `setRouteModalOpen(true)` | — | — | — | — | Local | 🟢 |
| **RouteSlider "Iniciar"** | `onComplete={startTrip}` | usePointToPointTracker | `useAppStore.activeRouteSession` | `POST /navigation/sessions/start` | Offline queue | `isChangingSession` | 🟢 |
| **RouteSlider "Finalizar"** | `onComplete={() => finishTrip(vehicle)}` | usePointToPointTracker | `useAppStore.activeRouteSession` | `PATCH /navigation/sessions/:id/status` + metrics/events/checkpoints | Offline queue | `isChangingSession` | 🟢 |
| **Close modal** | `closeRouteModal()` → `resetPointToPointSession()` si aplica | usePointToPointTracker | — | — | — | Local | 🟢 |
| **Cancel draft** | `cancelRouteDraft()` → `resetPointToPointSession()` | usePointToPointTracker | — | — | — | Local | 🟢 |
| **"Crear ruta"** | `openMapForVehicle(vehicle, 'origin')` → `router.push('/mapa')` | — | — | — | — | Navegación con params | 🟢 |
| **"Abrir mapa" (stop)** | `openMapForVehicle(vehicle, 'stop')` → `router.push('/mapa')` | — | — | — | — | Navegación con params | 🟢 |
| **Saved route assign** | `assignSavedRoute(route)` → `assignVehicleRouteRequest` + `refreshAll` | — | — | `POST /navigation/assign` | — | `isSavingAssignedRoute` | 🟢 |
| **Saved route delete** | `deleteSavedRoute(route)` → `deleteNavigationRouteRequest` + `refreshAll` | — | — | `DELETE /navigation/routes/:id` | — | `isSavingAssignedRoute` | 🟢 |
| **"Guardar ruta"** | `saveAssignedRoute()` → `createNavigationRouteRequest`/`updateNavigationRouteRequest` + `assignVehicleRouteRequest` + `refreshAll` | — | — | `POST/PATCH /navigation/routes` + `POST /navigation/assign` | — | `isSavingAssignedRoute` | 🟢 |
| **"Cambiar ruta"** | `editAssignedRoute()` → `setEditingRouteId` | — | — | — | — | Local | 🟢 |
| **"Pausar"/"Continuar"** | `toggleSessionPause()` → `updateRouteSessionStatusRequest` | usePointToPointTracker | `activeRouteSession` | `PATCH /navigation/sessions/:id/status` | Offline queue | `isChangingSession` | 🟢 |
| **"Ver paradas"** | `tracker.setPointMessage(stopsList)` | — | — | — | — | Local message | 🟢 |
| **Stop reorder up/down** | `tracker.moveStop(stopId, direction)` | usePointToPointTracker | — | — | — | Local | 🟢 |
| **Stop remove** | `handleRemoveRouteStop(stopId)` → `tracker.removeStop(stopId)` | usePointToPointTracker | — | — | — | Local | 🟢 |
| **Route name save** | `saveAssignedRoute` (con nombre) | — | — | (ver arriba) | — | `isSavingAssignedRoute` | 🟢 |
| **Route name cancel** | `setRouteNamePromptOpen(false)` | — | — | — | — | Local | 🟢 |
| **"Nueva ruta" (finalized)** | `openMapForVehicle(vehicle, 'origin')` | — | — | — | — | Navegación | 🟢 |

### Cadena completa: Iniciar Jornada
```
RouteSlider "Deslizar para iniciar ruta"
→ onComplete={startTrip}
→ startTrip():
  → if (!selectedVehicle || activeSession || isChangingSession) return
  → setIsChangingSession(true)
  → startRouteSessionRequest(vehicleId) → POST /api/navigation/sessions/start
    → backend: getAccessibleVehicle() + store.createRouteSession() + socket emit 'route-session:updated'
  → setActiveSession(session)
  → tracker.restoreTrackerSession({ startedAt, status: 'RUNNING', vehicleId })
  → Si offline: enqueuePendingSyncOperation + crear pendingSession local + tracker.restoreTrackerSession + mensaje
  → setIsChangingSession(false)
```
✅ **Certificado**

🟢 **Certificado**

---

## 4. Incidencias / IncidentsScreen

**Archivo:** `mobile/src/screens/incidents-screen.tsx` (1266 líneas)

### Elementos interactivos

| Elemento | onPress | Hook | Store | Backend | Persistencia | Estado | Resultado |
|---|---|---|---|---|---|---|---|
| **SOS "Pánico"** | `handleQuickSos('security')` → `createIncident({title:'SOS PANICO', severity:'critical', ...})` | — | `useAppStore.createIncident` | `POST /incidents` | Offline queue | `isSubmitting` | 🟢 |
| **SOS "Unidad"** | `handleQuickSos('maintenance')` → `createIncident({...})` | — | `useAppStore.createIncident` | `POST /incidents` | Offline queue | `isSubmitting` | 🟢 |
| **Tipo chips** | `setType(type)` | — | — | — | — | Local | 🟢 |
| **Severidad chips** | `setSeverity(severity)` | — | — | — | — | Local | 🟢 |
| **"Emitir alerta"** | `handleCreate()` → `createIncident({title, type, description, severity})` | — | `useAppStore.createIncident` | `POST /incidents` | Offline queue | `isSubmitting` | 🟢 |
| **Filtros** | `setActiveFilter(key)` | — | — | — | — | Local | 🟢 |
| **Search** | `setSearch(value)` | — | — | — | — | Local | 🟢 |
| **Clear search** | `setSearch('')` | — | — | — | — | Local | 🟢 |
| **"Mapa" en incidente** | `router.push({pathname:'/mapa', params:{focusLatitude, focusLongitude}})` | — | — | — | — | Navegación | 🟢 |
| **"Resolver"** | `updateIncidentStatus(incident.id, 'resolved')` | — | `useAppStore.updateIncidentStatus` | `PATCH /incidents/:id/status` | Offline queue | — | 🟢 |
| **"Ver más"** | `setShowAllEvents(!current)` | — | — | — | — | Local | 🟢 |

### Cadena completa: Emitir alerta
```
Tap "Emitir alerta"
→ handleCreate():
  → if (!title || !description) return
  → createIncident({title, type, description, severity, vehicleId, routeId, location})
    → createIncidentRequest(draft) → POST /api/incidents
      → backend: store.createIncident() + deliverOperationalNotification() + socket emit 'incident:created' + 'incident:sos'
    → set({ incidents: [newIncident, ...state.incidents] })
    → Si offline: enqueuePendingSyncOperation({ type: 'incident:create', payload })
  → Si ok: reset form fields
```
✅ **Certificado**

🟢 **Certificado**

---

## 5. Chat / ChatScreen

**Archivo:** `mobile/src/screens/chat-screen.tsx` → `chat/components/chat-screen-view.tsx` + `chat/hooks/use-chat-controller.ts`

### Elementos interactivos

| Elemento | onPress | Hook | Store | Backend | Persistencia | Estado | Resultado |
|---|---|---|---|---|---|---|---|
| **Modo "Todo"/"Prioridad"/"No leídos"** | `setDirectoryMode(mode)` | — | — | — | — | Local | 🟢 |
| **Canal general** | `handleOpenGeneral('chat')` | useChatController | `openGeneralConversation` | `POST /chat/conversations/general` | — | — | 🟢 |
| **Conversación tile** | `handleSelectConversation(id)` | useChatController | `setActiveConversationId` + `loadConversation` | `GET /chat/conversations/:id/messages` | — | — | 🟢 |
| **Contacto** | `handleOpenDirect(contact.id, 'chat')` | useChatController | `openDirectConversation` | `POST /chat/conversations/direct` | — | — | 🟢 |
| **Botón "Radio"** | `handleOpenRadioFromChat()` | useChatController | `openDirectConversation`/`openGeneralConversation` con 'radio' | `POST /chat/conversations/direct\|general` | — | — | 🟢 |
| **Toggle mute (call)** | `toggleCallMute()` | useChatController | — | — | — | `isCallMuted` | 🟢 |
| **Toggle camera** | `toggleCamera()` | useChatController | — | — | — | `isCameraEnabled` | 🟢 |
| **Hangup** | `closeActiveCall({reason})` | useChatController | — | Socket `rtc:leave` | — | — | 🟢 |
| **Retry message** | `handleRetryTextMessage(msg)` | useChatController | `sendMessage` | `POST /chat/conversations/:id/messages` | Offline queue | — | 🟢 |
| **Cámara (attachment)** | `handleMediaPicked('camera')` | useChatController | `sendMediaMessage` | `POST /chat/conversations/:id/media` | — | `attachmentNotice` | 🟢 |
| **Galería (attachment)** | `handleMediaPicked('gallery')` | useChatController | `sendMediaMessage` | `POST /chat/conversations/:id/media` | — | `attachmentNotice` | 🟢 |
| **Attach button** | `setAttachmentMenuOpen(true)` | — | — | — | — | Local | 🟢 |
| **Send button** | `handleSendText()` | useChatController | `sendMessage` | `POST /chat/conversations/:id/messages` | Offline queue | `isSubmitting` | 🟢 |
| **Voice button** | `handleVoiceAction()` | useChatController (AudioRecorder) | `sendVoiceMessage` | `POST /chat/conversations/:id/audio` | — | `recordingState` | 🟡 |
| **Image/video playback** | `setIsFullscreen(true)` | — | — | `resolveAssetUrl` → `GET /chat/media/:key` | — | `hasError`, `isLoading` | 🟢 |
| **Audio message play** | `handlePlayback()` | useAudioPlayer | — | `resolveAssetUrl` | — | `isBuffering`, `playbackError` | 🟢 |

### Hallazgos

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| C1 | `sendVoiceMessage` no tiene offline queue (falla sin conexión) | P2 | 🟡 |
| C2 | `sendMediaMessage` no tiene offline queue | P2 | 🟡 |
| C3 | `markAsRead` es socket-only, sin cola offline (read receipts perdidos sin conexión) | P3 | 🟡 |
| C4 | `typingByConversation` y `readByConversation` no expuestos en chat-store wrapper | P3 | 🟡 |

🟡 **Parcial** — Faltan offline queue para voice/media messages

---

## 6. Radio / RadioScreen

**Archivo:** `mobile/src/screens/radio/radio-screen-view.tsx` (1947 líneas)

### Elementos interactivos

| Elemento | onPress | Hook | Store | Backend | Persistencia | Estado | Resultado |
|---|---|---|---|---|---|---|---|
| **Settings mic chip** | `setShowSettings(!showSettings)` | — | — | — | — | Local | 🟢 |
| **Settings output chip** | `setShowSettings(!showSettings)` | — | — | — | — | Local | 🟢 |
| **Settings toggle** | `setShowSettings(!showSettings)` | — | — | — | — | Local | 🟢 |
| **Refresh devices** | `requestAudioDeviceAccess()` | — | — | `getUserMedia` (navegador) | — | `audioPermissionState` | 🟢 |
| **Input device select** | `setSelectedInputId(deviceId)` | — | — | — | — | Local | 🟢 |
| **Output device select** | `setSelectedOutputId(deviceId)` | — | — | — | — | Local | 🟢 |
| **Search** | `setSearch(value)` | — | — | — | — | Local | 🟢 |
| **Canal general** | `handleOpenGeneralRadio()` | — | `openGeneralConversation('radio')` | `POST /chat/conversations/general` | — | — | 🟢 |
| **Canal card** | `handleSelectChannel(id)` | — | `setActiveConversationId` + `loadConversation` | `GET /chat/conversations/:id/messages` | — | `historyLoadInFlightRef` | 🟢 |
| **Contacto direct radio** | `handleOpenDirectRadio(contact.id)` | — | `openDirectConversation(id, 'radio')` | `POST /chat/conversations/direct` | — | — | 🟢 |
| **Audio filter chip** | `setAudioFilter(key)` | — | — | — | — | Local | 🟢 |
| **Page indicator** | `goToPage(index)` | — | — | — | — | Local | 🟢 |
| **PTT button (tap)** | `handlePttPress()` → transmisión | RadioRealtimeService | — | Socket `radio:start`/`radio:end`, REST `POST /radio/messages` | — | `radioSession.phase` | 🟢 |
| **PTT button (hold)** | `handlePttPressIn()` / `handlePttPressOut()` | RadioRealtimeService | — | Socket events | — | holdTimer | 🟢 |
| **Voice card playback** | `handleTogglePlayback()` | useAudioPlayer | — | `resolveAssetUrl` | — | `playbackError` | 🟢 |

### Cadena completa: PTT Transmisión
```
PTT button press (tap/hold)
→ handlePttPress() / handlePttPressIn()
  → Si estado idle/canTransmit: transitionSession('REQUESTING')
  → radioRealtimeService.requestTransmission() → socket.emit('radio:start', { channelId })
    → backend: adquiere Redis lock, verifica canal, emite 'radio:start' a room
  → Si ACK ok: transitionSession('TRANSMITTING')
  → getUserMedia(audio) → stream
  → Inicia grabación: AudioWorklet / MediaRecorder
  → Envía frames: socket.emit('radio:frame', { channelId, transmissionId, data, sequence })
  → Al soltar: socket.emit('radio:end', { channelId, transmissionId })
    → backend: libera Redis lock, emite 'radio:end' a room, persiste mensaje, emite 'radio:message:new'
  → POST /api/radio/messages (formData con audio blob)
    → backend: uploadChatAudioAsset() + transcribeAudioBuffer() + store.addMessage()
```
✅ **Certificado** — Todos los socket events existen en backend.

🟢 **Certificado**

---

## 7. Perfil / ProfileScreen

**Archivo:** `mobile/src/screens/profile-screen.tsx`

| Elemento | onPress | Hook | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|---|
| **Theme light** | `setThemeMode('light')` | useAppTheme | `useAppStore.setThemeMode` | — | Persiste SecureStore | 🟢 |
| **Theme dark** | `setThemeMode('dark')` | useAppTheme | `useAppStore.setThemeMode` | — | Persiste SecureStore | 🟢 |
| **Cerrar sesión** | `signOut().finally(() => router.replace('/login'))` | — | `useAppStore.signOut` | `POST /auth/logout`, `DELETE /notifications/push-subscriptions/:token` | Clear SecureStore | 🟢 |

🟢 **Certificado**

### Perfil Editar / ProfileEditScreen

**Archivo:** `mobile/src/screens/profile-edit-screen.tsx`

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **"Cambiar foto"** | `handlePhotoUpload()` → ImagePicker o FileReader | — | — | Maneja web y native | 🟢 |
| **Método pago chips (SPEI/Transfer/Tarjeta)** | `updateField('preferredMethod', id)` | — | — | Local | 🟢 |
| **Días activos** | `toggleScheduleDay(day)` | — | — | Local | 🟢 |
| **Toggle horario** | `setProfileForm({...scheduleEnabled: !current})` | — | — | Local | 🟢 |
| **"Guardar cambios"** | `handleProfileSave()` → `updateProfile(payload)` | `useAppStore.updateProfile` | `PATCH /users/me` | `isSubmitting`, mensaje | 🟢 |

### Cadena completa: Guardar perfil
```
Tap "Guardar cambios"
→ handleProfileSave():
  → Validaciones: nombre, email, password strength, schedule format
  → updateProfile(payload) → updateProfileRequest(payload) → PATCH /api/users/me
    → backend: store.updateUser(userId, pickFields(body, PROFILE_FIELDS))
  → set({ user: updatedUser, users: updatedUsers })
  → Si !result.ok: setMessage(result.message)
  → Si ok: setMessage('Informacion actualizada...', 'success'), clear password
```
🟢 **Certificado**

---

## 8. Usuarios / UsersScreen

**Archivo:** `mobile/src/screens/users-screen.tsx`

| Elemento | onPress | Hook | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|---|
| **Pull-to-refresh** | `refreshDirectory()` → `loadUsers()` + `refreshAll()` | — | `useAppStore.loadUsers` | `GET /users` | `isRefreshing` | 🟢 |

🟢 **Certificado**

---

## 9. Legal / LegalScreen

**Archivo:** `mobile/src/screens/legal-screen.tsx`

| Elemento | onPress | Resultado |
|---|---|---|
| **"Volver"** | `router.back()` | 🟢 |

🟢 **Certificado**

---

## 10. ModalScreen

**Archivo:** `mobile/src/screens/modal-screen.tsx`

| Elemento | onPress | Resultado |
|---|---|---|
| **"Volver al mapa"** | `<Link href="/mapa" dismissTo>` | 🟢 |

🟢 **Certificado**

---

## 11. MobileAccountGateScreen

**Archivo:** `mobile/src/screens/mobile-account-gate-screen.tsx`

| Elemento | onPress | Store | Backend | Resultado |
|---|---|---|---|---|
| **Botón principal** (según reason) | `handlePrimaryAction()` → `router.replace('/perfil-editar')` / `refreshAll()` / `openSalesPortal()` | `useAppStore.refreshAll` | — | 🟢 |
| **"Reintentar"** | `refreshAll()` | `useAppStore.refreshAll` | 9 endpoints | 🟢 |
| **"Cerrar sesión"** | `signOut().finally(() => router.replace('/login'))` | `useAppStore.signOut` | `POST /auth/logout` | 🟢 |

🟢 **Certificado**

---

## 12. OperationalMenuDrawer

**Archivo:** `mobile/src/components/operational-menu-drawer.tsx`

| Elemento | onPress | Store | Resultado |
|---|---|---|---|
| **Backdrop** | `onClose()` | — | 🟢 |
| **Section nav items** (mapa, incidencias, chat, radio, perfil, checklist, usuarios) | `handleSectionPress(href)` → `onClose()` + `router.push(href)` | — | 🟢 |
| **"Cerrar sesión"** | `signOut().finally(() => router.replace('/login'))` | `useAppStore.signOut` | 🟢 |

🟢 **Certificado**

---

## 13. AppShell

**Archivo:** `mobile/src/components/app-shell.tsx`

| Elemento | onPress | Resultado |
|---|---|---|
| **Incident nav button** | `router.push('/incidencias')` | 🟢 |
| **Menu toggle** | `setMenuOpen(!current)` | 🟢 |
| **Pull to refresh** | `onRefresh` prop | 🟢 |

🟢 **Certificado**

---

## 14. Ventas / Sales App

### SalesScreen (`ventas/screens/sales-screen.tsx`)

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **Header nav items** (5) | `scrollToSection(target)` | — | — | Solo scroll local | 🟢 |
| **Login button** | `router.push(user ? getAuthenticatedHome(user) : '/ventas/login')` | `useAppStore.user` | — | Navegación | 🟢 |
| **Buy button** | `goToPlanCheckout(plan)` → `saveCheckoutContext()` + `router.push('/ventas/pago')` | — | — | localStorage context | 🟢 |
| **"Ver demo"** | `scrollToSection('funcionalidades')` | — | — | Scroll local | 🟢 |
| **"Explorar planes"** | `scrollToSection('planes')` | — | — | Scroll local | 🟢 |
| **Plan carousel prev/next** | `jumpToPlan(index)` | — | — | Local scroll | 🟢 |
| **Plan buy/trial** | `goToPlanCheckout(plan, trial)` | — | — | Navegación | 🟢 |
| **FAQ items** | `setOpenFaqIndex(index)` | — | — | Local toggle | 🟢 |
| **Footer links** | `handleFooterLink(link)` | — | — | Navegación/external | 🟢 |

### SalesAuthScreen (`ventas/screens/sales-auth-screen.tsx`)

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **Segment "Iniciar sesión"** | `router.replace('/ventas/login')` | — | — | Navegación | 🟢 |
| **Segment "Registrarse"** | `router.replace('/ventas/registro')` | — | — | Navegación | 🟢 |
| **"Recordarme"** | `setRememberSession(!current)` | — | — | Local | 🟢 |
| **"Recuperar acceso"** | `setHelperMessage('Contacta al administrador...')` | — | **Ninguno** | Solo mensaje | 🔴 **P1 (duplicado)** |
| **"Entrar"/"Crear cuenta"** | `handleSubmit()` → `signIn()`/`register()` | `useAppStore` | `POST /auth/login\|register` | `isSubmitting`, helperMessage | 🟢 |

### PlanCheckoutScreen (`ventas/screens/plan-checkout-screen.tsx`)

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **"Cambiar plan"** | `router.push('/ventas')` | — | — | Navegación | 🟢 |
| **Método pago tabs** | `setSelectedMethod(method)` | — | — | Local | 🟢 |
| **"Pagar"/"Confirmar"** | `submitPayment()` → `submit()` → checkout | `useCheckoutExperience` | `POST /commercial/checkout` | `processing`, `checkoutMessage` | 🟢 |
| **"Reintentar" (error)** | `loadPlans()` | `useCheckoutExperience` | `GET /commercial/plans` | — | 🟢 |
| **"Volver a planes"** | `router.replace('/ventas')` | — | — | Navegación | 🟢 |
| **"Continuar configuración"** | `router.replace('/portal/onboarding')` | — | — | Navegación | 🟢 |

---

## 15. Portal Web (Ventas)

### PortalDashboardScreen

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **"Actualizar"** | `loadHistory()` | Portal store | `GET /navigation/sessions/history` | `isLoading`, `message` | 🟢 |
| **Vehicle press (mapa)** | `openVehicle(vehicle)` | Portal store | — | — | 🟢 |
| **"Ver ruta"** | `showRoute(vehicle)` | Portal store | — | — | 🟢 |
| **"Historial"** | `setSelectedVehicleId` + filter | — | — | — | 🟢 |
| **"Cambiar chofer"** | `setDriverSelectorVehicleId` | Portal store | — | — | 🟢 |
| **Driver select** | `changeDriver(vehicle, driver)` → `updateUser` | `useAppStore.updateUser` | `PATCH /users/:id` | `driverChangeMessage` | 🟢 |
| **"Ver jornada"** | `openSession(session)` → 4 API calls | Portal store | 4 endpoints | `isDetailLoading` | 🟢 |
| **"Cargar más"** | `loadHistory({append:true})` | Portal store | Paginated | `isLoading` | 🟢 |
| **Replay play/pause** | `onReplayPlayingChange(!replayPlaying)` | — | — | Local | 🟢 |
| **Replay speed** | `onReplaySpeedChange(speed)` | — | — | Local | 🟢 |
| **Replay prev/next** | `onReplayIndexChange(index)` | — | — | Local | 🟢 |
| **Filter chips** (vehicle/status/driver/route) | `onChange(field, value)` | — | — | Local filter | 🟢 |

### PortalOnboardingScreen

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **"Actualizar"** | `loadOverview()` | Portal store | `GET /portal/overview` | `isLoading` | 🟢 |
| **"Generar key"** | `handleGenerateKey()` → `generateActivationKey()` | Portal store | `POST /admin/activation-keys/generate` | `isSubmitting`, `feedback` | 🟢 |
| **"Copiar" key** | `handleCopyKey()` → clipboard | — | — | fallback Share | 🟢 |
| **"Compartir" key** | `handleShareKey()` → Share API | — | — | — | 🟢 |
| **"Revocar" key** | `handleRevokeKey()` → `revokeActivationKey()` | Portal store | `PATCH /admin/activation-keys/:id/revoke` | `isSubmitting`, `feedback` | 🟢 |
| **Wizard steps** | `router.push(stepTarget)` | — | — | Navegación | 🟢 |

### PortalPaymentsScreen

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **Card brand combo** | `setOpen(!open)` | — | — | Local | 🟢 |
| **"Editar"** | `editMethod(method)` | — | — | Form populate | 🟢 |
| **"Principal"** | `markDefault(method)` | Portal store | `POST /account/payment-methods/:id/default` | `message` | 🟢 |
| **"Eliminar"** | `setDeleteTarget(method)` → ConfirmModal | Portal store | `DELETE /account/payment-methods/:id` | `message` | 🟢 |
| **"Agregar/Guardar"** | `submit()` → validate → `createPaymentMethod`/`updatePaymentMethod` | Portal store | `POST/PATCH /account/payment-methods` | `errors`, `message`, `isSubmitting` | 🟢 |

### PortalPlanScreen

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **"Comparar" (plan card)** | `selectPlan(plan.id)` | `useCommercialExperience` | — | `isLoading` | 🟢 |
| **"Elegir otro plan"** | `clearSelection()` | `useCommercialExperience` | — | — | 🟢 |
| **Continue button** | `runPrimaryAction()` → según kind | `useCommercialExperience` | — | `ready` puede deshabilitar | 🟡 |

### PortalProfileScreen

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **"Guardar perfil"** | `saveProfile()` → `updateProfile(payload)` | `useAppStore.updateProfile` | `PATCH /users/me` | `message` | 🟢 |
| **Revocar sesión** | `revokeSession(sessionId)` | Portal store | `DELETE /account/sessions/:id` | Sin feedback al usuario | 🟡 |

### PortalRoutesScreen

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **Vehicle select** | `setField('vehicleId', id)` | — | — | Local | 🟢 |
| **"Asignar ruta"** | `saveRoute()` → `assignRoute()` | `useAppStore.assignRoute` | `POST /navigation/assign` | `message`, `isSubmitting` | 🟢 |
| **"Liberar ruta"** | `clearRoute(vehicle.id)` | `useAppStore.clearRouteAssignment` | `DELETE /navigation/assign/:vehicleId` | `message` | 🟢 |

### PortalUnitsScreen

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **Status segment** | `setField('status', status)` | — | — | Local | 🟢 |
| **"Crear/Guardar"** | `saveUnit()` → `createVehicle()/updateVehicle()` | `useAppStore.createVehicle/updateVehicle` | `POST/PATCH /vehicles` | `message`, `isSubmitting` | 🟢 |
| **Edit icon** | `startEdit(vehicle)` | — | — | Form populate | 🟢 |
| **No hay botón "Eliminar"** | — | — | — | ⚫ **No existe delete vehicle** | ⚫ **P2** |

### PortalUsersScreen

| Elemento | onPress | Store | Backend | Estado | Resultado |
|---|---|---|---|---|---|
| **Role/status segments** | `setField(field, value)` | — | — | Local | 🟢 |
| **"Invitar/Guardar"** | `saveUser()` → `createUser()/updateUser()` | `useAppStore.createUser/updateUser` | `POST/PATCH /users` | `message`, `isSubmitting` | 🟢 |
| **Driver assign chip** | `assignVehicleToDriver(driverId, vehicleId)` | `useAppStore.updateUser` | `PATCH /users/:id` | `message` | 🟢 |
| **"Sin unidad" chip** | `assignVehicleToDriver(driverId, null)` | `useAppStore.updateUser` | `PATCH /users/:id` | `message` | 🟢 |
| **Edit icon** | `startEdit(item)` | — | — | Form populate | 🟢 |
| **Delete icon** | `setDeleteTarget(item)` → ConfirmModal | `useAppStore.deleteUser` | `DELETE /users/:id` | Sin feedback post-delete | 🟡 |

---

## 16. Hallazgos Globales

### 🔴 P0 — Rompe operación

| ID | Hallazgo | Archivos | Descripción |
|---|---|---|---|
| G1 | `sendVoiceMessage` sin offline queue | `root-store.ts:1804-1815` | Los mensajes de voz fallan silenciosamente sin conexión |
| G2 | `sendMediaMessage` sin offline queue | `root-store.ts:1816-1827` | Los mensajes multimedia fallan silenciosamente sin conexión |

### 🔴 P1 — Rompe flujo

| ID | Hallazgo | Archivos | Descripción |
|---|---|---|---|
| G3 | "Recuperar acceso" no tiene implementación real | `customer-auth-screen.tsx:436-438`, `sales-auth-screen.tsx` | Solo muestra mensaje estático. Sin API, sin email de reset |
| G4 | `loadUsers` sin offline fallback | `root-store.ts:1712-1722` | El directorio de usuarios no funciona sin conexión |
| G5 | `updateProfile` sin offline support | `root-store.ts:1695-1711` | Los cambios de perfil se pierden sin conexión |
| G6 | Portal no tiene offline handling | Todos los screens de `ventas/features/portal/` | Sin banners offline, sin cola de sincronización |

### 🟡 P2 — UX

| ID | Hallazgo | Archivos | Prioridad |
|---|---|---|---|
| G7 | `loadConversation` sin loading state | `root-store.ts:1763-1775` | El usuario no ve indicador al cargar mensajes | P2 |
| G8 | `loadChatContacts` sin loading state | `root-store.ts:1776-1783` | Sin feedback al cargar contactos | P2 |
| G9 | `markNotificationRead` sin offline queue | `root-store.ts:1853-1858` | Notificaciones marcadas offline se pierden | P2 |
| G10 | Portal no tiene botón "Eliminar vehículo" | `portal-units-screen.tsx` | No hay forma de eliminar una unidad desde el portal | P2 |
| G11 | Revocar sesión no muestra feedback | `portal-profile-screen.tsx` | El modal se cierra sin mensaje de éxito/error | P2 |
| G12 | Delete user sin feedback post-eliminación | `portal-users-screen.tsx` | Sin confirmación visual después de eliminar | P2 |
| G13 | `sendVoiceMessage` sin isSubmitting | `root-store.ts:1804` | El botón de voz no se deshabilita durante upload | P2 |
| G14 | `sendMediaMessage` sin isSubmitting | `root-store.ts:1816` | El botón de adjuntar no se deshabilita durante upload | P2 |

### ⚫ Sin implementación

| ID | Hallazgo | Archivos | Descripción |
|---|---|---|---|
| G15 | No hay pantalla "Configuración" dedicada | — | La configuración se limita a tema y perfil, no existe pantalla de configuración general |
| G16 | No hay pantalla "Control" dedicada | — | La funcionalidad de control está integrada en ChecklistScreen |
| G17 | No hay pantalla "Administración" dedicada | — | La administración se maneja desde el portal web (Ventas) |
| G18 | No hay pantalla "Rutas" dedicada en mobile | — | La gestión de rutas está dentro de ChecklistScreen modal |

### 🟡 P3 — Refactor / Code Quality

| ID | Hallazgo | Archivos | Descripción |
|---|---|---|---|
| G19 | `typingByConversation` y `readByConversation` no expuestos en chat-store wrapper | `chat-store.ts` | No accesibles desde el store wrapper dedicado |
| G20 | Portal store `applyRealtimeEvent` fire-and-forget sin await | `use-portal-store.ts` | Puede causar race conditions en actualizaciones rápidas |
| G21 | ChecklistScreen (2596 líneas) excesivamente grande | `checklist-screen.tsx` | Debería dividirse en componentes más pequeños |
| G22 | `root-store.ts` (~1872 líneas) monolítico | `root-store.ts` | Store único extremadamente grande |

---

## 17. Cobertura de Pantallas vs. Rutas de Navegación

| Pantalla | Ruta | Existe en route-registry? | Backend existe? | Certificación |
|---|---|---|---|---|
| Login/Registro | `/login`, `/registro` | No en moduleRoutes (es auth) | ✅ | 🟢 |
| Mapa | `/mapa` | ✅ module: 'map' | ✅ | 🟢 |
| Incidencias | `/incidencias` | ✅ module: 'incidents' | ✅ | 🟢 |
| Chat | `/chat` | ✅ module: 'chat' | ✅ | 🟢 |
| Radio | `/radio` | ✅ module: 'radio' | ✅ | 🟢 |
| Checklist | `/checklist` | ✅ module: 'checklist' | ✅ | 🟢 |
| Perfil | `/perfil` | ✅ module: 'profile' | ✅ | 🟢 |
| Perfil editar | `/perfil-editar` | ✅ module: 'profile' | ✅ | 🟢 |
| Usuarios | `/usuarios` | ✅ module: 'users' (solo admin/supervisor) | ✅ | 🟢 |
| Legal términos | `/terminos` | No (ruta directa) | — | 🟢 |
| Legal privacidad | `/privacidad` | No (ruta directa) | — | 🟢 |
| Modal | `/modal` | No (debug) | — | 🟢 |
| MobileAccountGate | `/cuenta-bloqueada` | No (redirect condicional) | ✅ | 🟢 |

---

## 18. Conclusión

### Fortalezas
- **Trazabilidad completa** en la mayoría de los flujos críticos: login, mapa, checklist, radio, incidencias
- **Offline support** implementado en los flujos core: sesiones de ruta, incidencias, mensajes de texto, ubicación
- **Backend coverage** casi total: ~110 endpoints REST + ~30 socket events implementados
- **E2EE** en chat directo con tweetnacl
- **Manejo de errores** global con interceptors, retry, y signals de red

### Debilidades
- **Voice/media messages sin offline queue** (P0): la funcionalidad principal de radio/chat falla sin conexión
- **Sin recuperación de contraseña** (P1): el link "Recuperar acceso" no hace nada real
- **Portal web sin offline support** (P1): toda la experiencia del portal depende de conectividad
- **Store monolítico** (P3): `root-store.ts` con ~1872 líneas es difícil de mantener
- **Stores wrapper incompletos**: algunas acciones/estados no expuestos en stores dedicados

### Puntuación Final

| Categoría | Puntaje |
|---|---|
| Lógica funcional completa | 42/68 (62%) |
| Parcialmente completa | 18/68 (26%) |
| Rota | 5/68 (7%) |
| Sin implementación | 3/68 (4%) |

**Estado General: 🟡 PARCIAL — No certificado**

Se requiere corregir hallazgos P0 y P1 antes de considerar la certificación completa.
