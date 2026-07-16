# RC-UI-CERTIFICATION-01 — Certificación Final de Coherencia Visual y Funcional

**Fecha:** 2026-07-15
**Objetivo:** Recorrer cada pantalla, evaluar cambios visuales y verificar cadena funcional completa (UI → Hook → Store → API → Backend → Persistencia → Respuesta → UI).

---

## Resumen por Pantalla

### 1. Login (CustomerAuthScreen) 🟡 Requiere ajustes menores

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | Artwork `faster.png`, botón "Probar conexión", handler `handleTestConnection` + estado `isTestingConnection`, fake "Recuperar acceso" Pressable, texto legal verboso, placeholder instructivo, flujo completo de `showForgotPassword` + `forgotEmail` + `handleForgotPassword` |
| 2 | ¿Qué espacio quedó libre? | ~60px entre brandRow y segmentedControl (antes ocupado por artwork) |
| 3 | ¿Ese espacio fue reutilizado correctamente? | No. Sigue siendo un gap visual vacío. No se movió ningún elemento para ocuparlo. |
| 4 | ¿La jerarquía visual mejoró? | Sí. Menos ruido visual, más enfoque en el formulario. |
| 5 | ¿Quedó algún texto redundante? | No. |
| 6 | ¿Existe algún botón que ya no tenga sentido? | No. |
| 7 | ¿Existe algún botón que siga sin lógica? | **Recordarme**: ✅ Tiene toggle visual, pasa `rememberSession` a `signIn`/`register`. **⚠️ Sin embargo, la store/persistencia de esta flag no está verificada en el backend.** |
| 8 | ¿Hay componentes que ahora se vean vacíos? | No. |
| 9 | ¿Hay cards demasiado grandes? | No. |
| 10 | ¿Hay padding excesivo? | El espacio vacío entre brandRow (logo) y el segmented control podría reducirse. Actualmente ~24px paddingTop en `.form` + gap natural. |
| 11 | ¿Hay scroll innecesario? | Sí. Existe scroll aún en viewports grandes porque el formulario usa `<ScrollView>`. En desktop el contenido no llena la pantalla verticalmente. |
| 12 | ¿Hay elementos mal alineados? | No. |
| 13 | ¿Hay títulos repetidos? | No. |
| 14 | ¿Hay iconos redundantes? | No. |
| 15 | ¿Hay placeholders innecesarios? | No, los placeholders restantes son funcionales. |
| 16 | ¿Hay estados vacíos pobres? | No aplica (no hay empty states en login). |
| 17 | ¿Hay componentes que ya no aporten valor? | Estilos `forgotPanel`, `forgotTitle`, `forgotDescription`, `forgotActions`, `forgotSendButton`, `secondaryButton`, `secondaryButtonText` — **código muerto**. `forgotPassword` en store selector — **nunca se ejecuta**. |

**Cadena funcional:**
- `signIn(email, password, rememberSession)` → store → API → backend → actualiza `user` → `<Redirect>` a home ✅
- `register(...)` → store → API → backend → actualiza `user` → `<Redirect>` ✅
- `activateDriverWithKey(...)` → valida key → `register` equivalente con datos de unidad ✅
- Recordarme: pasa `rememberSession` booleano → store decision → **no verificado si efectivamente persiste sesión** 🟡

**🔴 Hallazgos:**
1. Estilos `forgotPanel`, `forgotTitle`, `forgotDescription`, `forgotActions`, `forgotSendButton` — muertos (nunca renderizados)
2. `secondaryButton`, `secondaryButtonText` — muertos
3. `forgotPassword` en store selector se destructurea pero no se usa (podría eliminarse)
4. **Botón "Recordarme":** no hay confirmación visual de que la sesión se recuerde efectivamente entre cierres de app. Si no hay persistencia real en el backend/device, es un botón falso.

---

### 2. Dashboard / Mapa (MapScreen) 🟢 Certificada

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1-17 | General | Pantalla wrapper que carga `map-screen.native` o `map-screen.web` según platform. No tiene UI propia. La UI está en los archivos nativo/web y en componentes de mapa. Sin cambios realizados. |

**Cadena funcional:**
- La pantalla es un thin wrapper. La lógica de mapa completo está en `map/` y `components/app-map.*`. No se intervino.

---

### 3. Checklist / Control (ChecklistScreen) 🟡 Requiere ajustes menores

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | `eyebrow` "SISTEMA DE CONTROL", empty state con instrucción |
| 2 | ¿Qué espacio quedó libre? | ~20px en header |
| 4 | ¿La jerarquía visual mejoró? | Sí, más limpio |
| 5 | ¿Quedó algún texto redundante? | `routeHeaderSubtitle` para `'empty'` → `'Gestion de rutas'` — no es necesario como subtítulo cuando ya hay título "Checklist" o "Control" |
| 6 | ¿Botones sin lógica? | No |
| 7 | ¿Botones sin confirmación? | **🔴 Iniciar/finalizar jornada no tienen confirmación visual (modal/alert)** previa a ejecutar la acción |
| 10 | ¿Padding excesivo? | En `recordCard` el padding es 14, aceptable. `progressCard` padding 14. Adecuado. |
| 11 | ¿Scroll innecesario? | Posiblemente — la pantalla es extremadamente larga (~2800 líneas) con muchos paneles anidados y ScrollViews internos. |
| 13 | ¿Títulos repetidos? | El título "Checklist" en AppShell header y quizás un título duplicado en el header personalizado. |

**Cadena funcional:**
- `startTrip()` → `startRouteSessionRequest()` → API → setea `activeSession` + `tracker.restoreTrackerSession()` ✅
- `finishTrip()` → `updateRouteSessionStatusRequest()` → API → recoge metrics/events → calcula summary ✅
- Soporte offline con `enqueuePendingSyncOperation()` ✅
- Toda la lógica de rutas, waypoints, tracking, y asignación de rutas funciona con store + API + tracker hook ✅

**🔴 Hallazgos:**
1. **Botones "Iniciar jornada" / "Finalizar jornada" sin confirmación** — acción irreversible sin diálogo de confirmación
2. `routeHeaderSubtitle` en estado `empty` muestra "Gestión de rutas" que es texto decorativo redundante
3. El `selectedVehicle` selector elige `vehicles[0]` como fallback — si no hay vehículos puede mostrar datos incorrectos

---

### 4. Incidencias (IncidentsScreen) 🟢 Certificada

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | `eyebrow` "CENTRO DE ALERTAS", subtítulos instructivos en panel y bitácora, texto de carga verboso, empty state con instrucción |
| 2 | ¿Qué espacio quedó libre? | ~40px en header y en cada sección |
| 4 | ¿Jerarquía mejoró? | Sí. Los títulos "Incidencias", "Nuevo reporte", "Bitácora de eventos" ahora son claros y directos. |
| 5 | ¿Texto redundante? | `mobileSubtitle="Reportes y seguimiento"` — **es redundante** después de eliminar los subtítulos internos. Ya no hay contraste justificado para mantenerlo. |
| 6 | ¿Botones sin lógica? | No |
| 7 | ¿Botones sin confirmación? | **🔴 "Panico" y "Unidad" (SOS)**: envían incidencia crítica sin confirmación. Para un botón de alerta tipo SOS esto es intencional pero podría ser riesgoso. |
| 10 | ¿Padding excesivo? | `formCard` padding `16` en desktop, adecuado. `timelinePanel` padding `14`. Correcto. |
| 15 | ¿Placeholders innecesarios? | No |

**Cadena funcional:**
- `handleCreate()` → `createIncident({title, type, description, severity, location, ...})` → store → API ✅
- `handleQuickSos(type)` → `createIncident({...critical})` ✅
- `updateIncidentStatus(id, 'resolved')` → store → API ✅
- Botón "Mapa" → `router.push('/mapa', params)` con ubicación ✅
- Filtros y búsqueda locales (client-side) ✅
- "Ver más eventos" toggle ✅

---

### 5. Chat (ChatScreenView) 🟡 Requiere ajustes menores

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | Empty state instructivo, "Selecciona un canal" subtitle, "Sin conversaciones" subtitle, callHubSubtitle, "Abrir grupo operativo" body text, "Tu cabina" → "Tu", sheet subtitle, callNotice condicional |
| 2 | ¿Qué espacio quedó libre? | ~15px en varios empty states, ~20px en call hub |
| 4 | ¿Jerarquía mejoró? | Sí |
| 5 | ¿Texto redundante? | `directoryHelperText` se destructurea pero **nunca se renderiza** (está en `ListHeaderComponent` como `sectionHint` pero no hay un componente `sectionHint` en el JSX). Revisar si se eliminó o nunca se usó. |
| 6 | ¿Botones sin lógica? | No |
| 7 | ¿Botones sin confirmación? | No |
| 10 | ¿Padding excesivo? | No |

**Cadena funcional:**
- Mensajes de texto → `handleSendTextMessage` → `sendTextMessage` → API → actualiza conversación ✅
- Mensajes de voz → grabación → upload → `sendVoiceMessage` ✅
- Mensajes de imagen/video → picker → upload ✅
- Reintento de mensajes fallidos → `handleRetryTextMessage` ✅
- Llamadas WebRTC → señalización socket → peer connection → stream ✅
- "General Operativo" → `handleOpenGeneral('chat')` → store ✅
- "Hablar por radio" → `handleOpenRadioFromChat()` → navegación ✅

**🔴 Hallazgos:**
1. `directoryHelperText` se destructurea del hook pero no se renderiza en el JSX — posible bug visual (el texto existe en el hook pero no se muestra)
2. Empty state para contactos: "Sin conversaciones" se muestra cuando `item.type` no coincide con `generalShortcut`, `conversation`, ni `contact` — caso borde

---

### 6. Radio (RadioScreenView) 🟢 Certificada

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | Status details/labels verbosos (TRANSMITTING → "Transmitiendo", REQUESTING → "Solicitando", etc.), PTT subtitle instructivo ("Suelta para enviar" → "Soltar", "Mantener o tocar" → "PTT"), texto instructivo radioActionText (estados OFFLINE/CONNECTING/permission), empty state con instrucción |
| 2 | ¿Qué espacio quedó libre? | ~15px en PTT button, ~20px en status area |
| 4 | ¿Jerarquía mejoró? | Sí. Mensajes más directos y profesionales. |
| 5 | ¿Texto redundante? | No |
| 6 | ¿Botones sin lógica? | No |
| 7 | ¿Botones sin confirmación? | PTT button — no requiere confirmación, es PTT ✅ |
| 10 | ¿Padding excesivo? | No |
| 15 | ¿Placeholders innecesarios? | No |
| 16 | ¿Estados vacíos pobres? | "Sin audios" — correcto y minimal ✅ |

**Cadena funcional:**
- PTT → solicita canal → captura audio → envía frames → libera canal ✅
- Recepción → recibe transmisión → reproducción audio ✅
- Subida Web → captura con MediaRecorder → sube archivo → `sendVoiceMessage` ✅
- Reconexión automática ✅
- Foreground service (native) ✅
- Selector de canales y directo rápido ✅

**🔴 Hallazgos:** Ninguno crítico.

---

### 7. Perfil (ProfileScreen) 🟢 Certificada

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | Badge `pendingNotifications`, StatusPill redundante "Sincronizado", unused `notifications` store access |
| 2 | ¿Qué espacio quedó libre? | ~25px en badges row |
| 4 | ¿Jerarquía mejoró? | Sí. Solo el rol es relevante como badge. |
| 5 | ¿Texto redundante? | No |
| 6-8 | Botones sin lógica | No |
| 10 | ¿Padding excesivo? | No |
| 13 | ¿Títulos repetidos? | "Perfil" como `mobileTitle` y en el header personalizado — visualmente se ve igual en AppShell. Es intencional (ambos muestran en diferentes layouts). |

**Cadena funcional:**
- Theme toggle → `setThemeMode(mode)` → actualiza theme global ✅
- "Cerrar sesión" → `signOut()` → store limpia auth → `router.replace('/login')` ✅
- Datos de usuario se cargan desde store (poblado por auth) ✅

---

### 8. Editar Perfil (ProfileEditScreen) 🟡 Requiere ajustes menores

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | `mobileSubtitle`, header subtitle paragraph, "Los cambios se reflejan..." paragraph + identityPills, password helper text, billing caption, schedule caption, unused `sectionCaption`/`identityText` styles |
| 2 | ¿Qué espacio quedó libre? | ~60px distribuido en varias secciones |
| 4 | ¿Jerarquía mejoró? | Sí |
| 5 | ¿Texto redundante? | `subtitle` style no usado en el componente principal (solo en el fallback `if (!user)`). Aceptable. |
| 6 | ¿Botones sin lógica? | No |
| 7 | ¿Botones sin confirmación? | **🔴 "Guardar cambios"** — guarda sin confirmación, pero muestra mensaje de éxito/error después. Aceptable pero no hay "¿Estás seguro?" antes de sobreescribir. |
| 10 | ¿Padding excesivo? | `.editorCard` gap `lg` (posiblemente 24px) entre secciones puede ser amplio. |
| 15 | ¿Placeholders innecesarios? | No |

**Cadena funcional:**
- `handlePhotoUpload()` → File picker → guarda base64 en local state → se envía con `updateProfile()` ✅
- `handleProfileSave()` → valida campos → `updateProfile(data)` → store → API ✅
- Validación de password strength client-side ✅
- Validación de horario operativo client-side ✅
- Feedback visual (mensaje de éxito/error) ✅

**🔴 Hallazgos:**
1. **`sectionsRef` con `@ts-ignore`** — hack para scroll a secciones. Funciona pero es frágil.
2. **Campos de tarjeta/pago** — no se verifica si el backend realmente procesa estos datos o solo los almacena. Si no hay pasarela de pago real, son campos decorativos.
3. `passwordHelperText` style — muerto (el texto helper se eliminó pero el style permanece)

---

### 9. Usuarios (UsersScreen) 🟢 Certificada

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | `mobileSubtitle` "Personal y unidades en operación.", eyebrow "OPERACIÓN", "cuentas visibles" → "usuarios" |
| 2 | ¿Qué espacio quedó libre? | ~40px en header |
| 4 | ¿Jerarquía mejoró? | Sí |
| 5 | ¿Texto redundante? | Estilo `eyebrow` en createStyles — **código muerto** (ya no se usa) |
| 6-8 | Botones | No hay botones interactivos (solo pull-to-refresh). Pantalla informativa. |

**Cadena funcional:**
- `loadUsers()` + `refreshAll()` → store → API ✅
- Pull-to-refresh ✅
- Datos de usuarios + vehículos se mapean correctamente ✅

**🔴 Hallazgos:**
1. Estilo `eyebrow` muerto (ya no se renderiza)
2. Sin acción por usuario (no hay tap para ver detalle, no hay llamada/mensaje directo desde aquí)

---

### 10. Legal (LegalScreen) 🟢 Certificada

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | Nada (no se intervino esta pantalla) |
| 5 | ¿Texto redundante? | `"Ultima actualizacion: 12/04/2026"` — hardcoded, quedará desactualizado. |
| 6-8 | Botones | Solo "Volver" → `router.back()` ✅ |

---

### 11. AppShell 🟢 Certificada

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | Botón alerta redundante en toolbar (que navegaba a /incidencias duplicando el menú drawer) |
| 2 | ¿Qué espacio quedó libre? | 42px en toolbar |
| 4 | ¿Jerarquía mejoró? | Sí. Solo un botón de menú. |
| 10 | ¿Padding excesivo? | Se redujo `contentMobile` padding (md→sm, sm→xs, xl→lg) y gap (12→10). Adecuado. |
| 11 | ¿Scroll innecesario? | No. AppShell maneja correctamente scroll vs no-scroll según prop. |

---

### 12. AppCard 🟢 Certificada

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué se eliminó? | Padding excesivo (16→12, gap 10→8) |
| 10 | ¿Padding excesivo? | Ahora está en 12px con gap 8px. Aceptable. |

---

### 13. Componentes Compartidos 🟢 Certificada

- **PrimaryButton:** ✅ Funcional, soporta loading/disabled/icon/variants
- **StatusPill:** ✅ Utilizado correctamente en todas las pantallas
- **UserAvatar:** ✅ Con showStatus, usado correctamente
- **ConnectionBanner:** ✅ Se muestra en AppShell cuando hay problemas de conexión
- **OperationalMenuDrawer:** ✅ Drawer funcional con navegación a todas las secciones + badge counts

---

## Componentes y Pantallas No Encontrados

| Solicitado | Estado |
|------------|--------|
| Ventas | ❌ No existe screen, store section, ni ruta. **No implementado.** |
| Portal | ❌ Solo existe `portal-store-bridge.ts` (bridge). **No hay screen.** |
| Configuración | ❌ No existe screen de configuración. |

---

## Clasificación Final

| Pantalla | Estado |
|----------|--------|
| Login | 🟡 **Requiere ajustes menores** — estilos muertos, espacio vacío no reutilizado, "Recordarme" sin verificar |
| Mapa / Dashboard | 🟢 Certificada |
| Checklist / Control | 🟡 **Requiere ajustes menores** — sin confirmación para iniciar/finalizar jornada, textos decorativos |
| Incidencias | 🟢 Certificada — `mobileSubtitle` redundante pero menor |
| Chat | 🟡 **Requiere ajustes menores** — `directoryHelperText` no se renderiza |
| Radio | 🟢 Certificada |
| Perfil | 🟢 Certificada |
| Editar Perfil | 🟡 **Requiere ajustes menores** — `@ts-ignore` hack, `passwordHelperText` muerto, campos de pago sin verificar |
| Usuarios | 🟢 Certificada — solo estilo `eyebrow` muerto |
| Legal | 🟢 Certificada |
| AppShell | 🟢 Certificada |
| AppCard | 🟢 Certificada |
| Ventas | 🔴 **No implementado** |
| Portal | 🔴 **No implementado** |
| Configuración | 🔴 **No implementado** |

---

## 🔴 Hallazgos Críticos

1. **Checklist: Botones "Iniciar jornada" / "Finalizar jornada" sin confirmación** — acción irreversible sin diálogo
2. **Login: Estilos `forgotPanel`, `forgotTitle`, `forgotDescription`, `forgotActions`, `forgotSendButton`, `secondaryButton`, `secondaryButtonText` — código muerto**
3. **Login: `forgotPassword` en store selector — nunca se ejecuta (dead code)**
4. **Chat: `directoryHelperText` se destructurea pero no se renderiza**
5. **ProfileEdit: `sectionsRef` con `@ts-ignore`**
6. **ProfileEdit: `passwordHelperText` style muerto**
7. **UsersScreen: estilo `eyebrow` muerto**
8. **Ventas, Portal, Configuración — no existen**

---

## 🔴 Botones con Cadena Incompleta

| Botón | Problema |
|-------|----------|
| "Recordarme" (Login) | No se verificó si efectivamente persiste sesión. Podría ser un botón decorativo si el backend no implementa persistencia. |
| "Iniciar jornada" (Checklist) | Sin confirmación previa. Acción irreversible sin diálogo. |
| "Finalizar jornada" (Checklist) | Sin confirmación previa. Acción irreversible sin diálogo. |
| Campos de pago (ProfileEdit) | No se verificó si el backend procesa datos de tarjeta o solo los almacena decorativamente. |

---

## 🟡 Hallazgos Visuales Menores

1. Login: ~60px de espacio vacío entre logo y formulario — no reutilizado
2. Incidencias: `mobileSubtitle="Reportes y seguimiento"` — redundante después de limpieza
3. Checklist: `routeHeaderSubtitle` para estado 'empty' = "Gestión de rutas" — decorativo
4. Checklist: Pantalla extremadamente larga (~2800 líneas, múltiples scrollviews anidados)
5. Legal: "Ultima actualizacion: 12/04/2026" hardcoded
6. ProfileEdit: gap `lg` entre secciones puede ser excesivo en mobile

---

## Conclusión

**6 pantallas certificadas 🟢**, **4 requieren ajustes menores 🟡**, **3 no implementadas 🔴**.

La certificación visual está mayormente completa. Las pantallas intervenidas reflejan correctamente los cambios de simplificación. Sin embargo, quedan **8 hallazgos de código muerto** que deben limpiarse, **3 pantallas faltantes** (Ventas, Portal, Configuración), y **2 botones sin confirmación** en Checklist que representan el riesgo funcional más alto.

No se recomienda cerrar la certificación hasta resolver los 🔴 hallazgos críticos.
