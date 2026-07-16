# RC-ALERTS-01

## Auditoría Integral de Alertas, Confirmaciones, Mensajes y Feedback

**Fecha:** 2026-07-15
**Alcance:** `mobile/`, `ventas/`, `desktop/`, `backend/`
**Rol:** Staff UX Engineer / Principal React Native Engineer / Product Designer / QA Lead / Software Architect
**Restricción:** NO se modifica código. Solo certificación.

---

## Resumen Ejecutivo

| Métrica | Cantidad |
|---------|----------|
| Total `Alert.alert()` | **1** |
| Total `confirm()` / `window.confirm` / `window.alert` | **0** |
| Total `ConfirmModal` (componente reutilizable) | **2** (mobile + ventas) |
| Total `Toast` (componente reutilizable) | **2** (mobile + ventas) |
| Total `Modal` directos | **7** (mobile: 5, ventas: 2) |
| Total llamadas `signOut()` sin confirmación | **6** |
| Total componentes UI duplicados | **4** |
| Total componentes UI muertos (definidos pero no usados) | **3** |
| Total errores con lenguaje técnico | **~20 mensajes** en `getApiErrorMessage` |
| Total confirmaciones destructivas correctas | **5** |
| Total confirmaciones destructivas faltantes | **7+** |

---

## Inventario Completo

### 1. `Alert.alert()` — 1 ocurrencia

| # | Archivo | Línea | Acción | Clasificación |
|---|---------|-------|--------|---------------|
| 1 | `mobile/src/screens/checklist-screen.tsx` | 1861 | Eliminar ruta guardada | 🟢 Correcta |

**Análisis (A1):**
- ¿Dónde aparece? `deleteSavedRoute` en checklist-screen
- ¿Qué acción la dispara? Tap en botón eliminar ruta
- ¿Es necesaria? Sí, es destructiva
- ¿Interrumpe? Sí, pero es correcto para acción destructiva
- ¿Botones correctos? Sí: "Cancelar" (cancel), "Eliminar" (destructive)
- ¿Texto claro? Aceptable: "Se eliminara {name} y se limpiara de las unidades asignadas."
- ¿Título claro? Sí: "Eliminar ruta"
- ¿Lenguaje técnico? No
- **Veredicto:** Único `Alert.alert` en toda la app. Está bien ubicado. Coherente.

---

### 2. `confirm()` / `window.confirm` / `window.alert` — 0 ocurrencias

No se encontraron llamadas a `confirm()`, `window.confirm` ni `window.alert` en ningún archivo.

---

### 3. ConfirmModal — 2 componentes (duplicados)

#### 3a. `mobile/src/components/ui/confirm-modal.tsx`

| Aspecto | Estado |
|---------|--------|
| Definido | Sí |
| Importado/usado | **NUNCA** — 0 imports en toda la app mobile |
| Prop `danger` | Usa `danger` (booleano) para color destructivo |
| Botón por defecto | "Confirmar" / "Cancelar" |
| Clasificación | ⚫ Innecesaria (muerto) |

#### 3b. `ventas/src/components/ui/confirm-modal.tsx`

| Aspecto | Estado |
|---------|--------|
| Definido | Sí |
| Importado/usado | 4 pantallas portal |
| Prop `destructive` | Usa `destructive` (no `danger`) |
| Botón por defecto | "Confirmar" / "Cancelar" |
| Clasificación | 🟡 Mejorable |

**Inconsistencia:** El componente mobile usa `danger` mientras ventas usa `destructive`. Son funcionalmente idénticos pero con API diferente. Deberían unificarse.

**Usos en Ventas Portal:**

| # | Pantalla | Línea | Acción | Clasificación |
|---|----------|-------|--------|---------------|
| C1 | `portal-users-screen.tsx` | 375 | Eliminar usuario | 🟢 Correcta |
| C2 | `portal-routes-screen.tsx` | 300 | Liberar ruta (destructiva) | 🟢 Correcta |
| C3 | `portal-profile-screen.tsx` | 223 | Cerrar sesión remota | 🟢 Correcta |
| C4 | `portal-payments-screen.tsx` | 543 | Eliminar tarjeta | 🟢 Correcta |

---

### 4. Toast — 2 componentes (duplicados, 1 muerto)

#### 4a. `mobile/src/components/ui/toast.tsx`

| Aspecto | Estado |
|---------|--------|
| Definido | Sí |
| ToastProvider exportado | Sí |
| Importado/usado | **NUNCA** — 0 imports en toda la app mobile |
| Animación | Sí (fade + translate) |
| Clasificación | ⚫ Innecesaria (muerto) |

**Nota:** El `Toast` mobile tiene animación de entrada (`Animated.timing`) con soporte para `reduceMotion`, pero nunca se usa.

#### 4b. `ventas/src/components/ui/toast.tsx`

| Aspecto | Estado |
|---------|--------|
| Definido | Sí |
| Importado/usado | Solo en `portal-layout.tsx:227` |
| Propósito | Muestra `error` global del portal store |
| Botón cerrar | "Cerrar" (opcional) |
| Clasificación | 🟡 Mejorable |

**Usos:**

| # | Archivo | Línea | Propósito | Clasificación |
|---|---------|-------|-----------|---------------|
| T1 | `portal-layout.tsx` | 227 | Error global del portal store (danger) | 🟡 Mejorable |

**Problema:** Solo se usa para errores globales. No hay uso para feedback de éxito (success) en ninguna pantalla ventas.

---

### 5. Modal directo (React Native `<Modal>`) — 7 ocurrencias

| # | Archivo | Línea | Propósito | Clasificación |
|---|---------|-------|-----------|---------------|
| M1 | `checklist-screen.tsx` | 2242 | Editor de ruta (bottom-sheet) | 🟢 Correcta |
| M2 | `chat-screen-view.tsx` | 656 | Menú de adjuntos (bottom-sheet) | 🟢 Correcta |
| M3 | `message-media.tsx` | 279 | Imagen a pantalla completa | 🟢 Correcta |
| M4 | `confirm-modal.tsx` (mobile) | 29 | Componente interno del modal | ⚫ Muerto |
| M5 | `confirm-modal.tsx` (ventas) | 29 | Componente interno del modal | 🟢 Correcta |
| M6 | `portal-users-screen.tsx` | 375 | Contenido del ConfirmModal | 🟢 Correcta |
| M7 | `plan-checkout-screen.tsx` (ventas) | — | No tiene Modal directo | — |

---

### 6. ConnectionBanner — 1 componente (correcto)

| Aspecto | Estado |
|---------|--------|
| Archivo | `mobile/src/components/connection-banner.tsx` |
| Usado en | `app-shell.tsx:188,194` |
| Estados | offline (warning), reconectando/sincronizando (info) |
| Clasificación | 🟢 Correcta |

---

### 7. EmptyState — 2 componentes (duplicados)

| # | Archivo | Usos | Clasificación |
|---|---------|------|---------------|
| E1 | `mobile/src/components/ui/empty-state.tsx` | 8 usos en screens mobile | 🟢 Correcta |
| E2 | `ventas/src/components/ui/empty-state.tsx` | 19 usos en ventas portal | 🟢 Correcta |

**Problema:** Código casi idéntico duplicado entre mobile y ventas. Debe unificarse.

---

### 8. Skeleton — 2 componentes (1 muerto)

| # | Archivo | Usado | Clasificación |
|---|---------|-------|---------------|
| S1 | `mobile/src/components/ui/skeleton.tsx` | **No** — 0 usos en mobile screens | ⚫ Muerto |
| S2 | `ventas/src/components/ui/skeleton.tsx` | Sí — portal-plan-screen | 🟢 Correcta |

---

### 9. ErrorBoundary — 1 componente (ventas)

| Archivo | Uso | Clasificación |
|---------|-----|---------------|
| `ventas/src/components/error-boundary.tsx` | Envuelve App en `main.tsx:14` | 🟢 Correcta |

Mobile **no tiene** ErrorBoundary a nivel de screen (solo `MobileErrorBoundary` en `App.tsx:239` que captura errores de renderizado del root).

---

### 10. Loading States (ActivityIndicator) — ~27 ocurrencias

| Screen | Ubicación | Propósito | Clasificación |
|--------|-----------|-----------|---------------|
| App.tsx:702 | Bootstrap | "Sincronizando centro de control..." | 🟢 Correcta |
| checklist-screen:2119 | Guard clause | Full-screen mientras carga | 🟢 Correcta |
| checklist-screen:2386 | Botón guardar ruta | Loading inline | 🟢 Correcta |
| checklist-screen:2597 | Botón guardar nombre ruta | Loading inline | 🟢 Correcta |
| incidents-screen:1124 | Full-screen | "Cargando" | 🟢 Correcta |
| customer-auth-screen:418 | Botón submit | Loading inline | 🟢 Correcta |
| chat-composer:145 | Botón enviar mensaje | Loading inline | 🟢 Correcta |
| chat-composer:167 | Botón grabar voz | Loading inline | 🟢 Correcta |
| message-media:183 | Reproductor audio | Loading inline | 🟢 Correcta |
| message-media:264 | Carga imagen | Loading overlay | 🟢 Correcta |
| message-media:336 | Carga video | Loading overlay | 🟢 Correcta |
| primary-button:59 | Botón genérico | Loading inline | 🟢 Correcta |
| radio-screen-view:1794 | Botón PTT | Loading inline | 🟢 Correcta |
| router:173 | Redirección | Loading inline | 🟢 Correcta |
| mobile-account-gate:145 | Refrescando | Loading inline | 🟢 Correcta |
| portal-onboarding-screen:415,424 | Keys | Loading inline | 🟢 Correcta |
| plan-checkout-screen:149,397 | Planes/pago | Loading inline | 🟢 Correcta |
| sales-auth-screen:355 | Submit | Loading inline | 🟢 Correcta |

---

## Análisis por Flujo

### FLUJO: Login / Autenticación

| Archivo | Patrón | Feedback | Clasificación |
|---------|--------|----------|---------------|
| `customer-auth-screen.tsx` | Inline `helperMessage` banner | Error: mensaje claro | 🟡 Mejorable |
| `customer-auth-screen.tsx:145` | Login exitoso | Solo Haptics, sin mensaje visual | 🔴 Incorrecta |
| `customer-auth-screen.tsx:418` | Loading en botón | ActivityIndicator | 🟢 Correcta |
| `sales-auth-screen.tsx` (ventas) | Inline `helperMessage` banner | Error: mensaje claro | 🟡 Mejorable |
| `sales-auth-screen.tsx:355` | Loading en botón | ActivityIndicator | 🟢 Correcta |

**Problemas:**
1. Login exitoso no muestra feedback visual — solo vibración táctil. El usuario no sabe si inició sesión hasta que la pantalla cambia.
2. `customer-auth-screen.tsx` usa `getApiErrorMessage` directamente (línea 177) que puede devolver lenguaje técnico.

---

### FLUJO: Chat

| Archivo | Patrón | Feedback | Clasificación |
|---------|--------|----------|---------------|
| `use-chat-controller.ts:720` | Mensaje falla → status "failed" local | ❌ No hay alerta/notificación | 🟡 Mejorable |
| `use-chat-controller.ts:759` | Reintentar mensaje | Botón "Reintentar" inline | 🟢 Correcta |
| `chat-screen-view.tsx:81-91` | Conexión perdida | Banner informativo | 🟢 Correcta |
| `chat-screen-view.tsx:656` | Menú adjuntos | Modal bottom-sheet | 🟢 Correcta |
| `message-media.tsx:279` | Imagen fullscreen | Modal overlay | 🟢 Correcta |
| `message-media.tsx:174` | Error audio | Mensaje inline | 🟡 Mejorable |
| `use-chat-controller.ts:1293` | Error subir archivo | `attachmentNotice` inline | 🟡 Mejorable |

**Problemas:**
1. No hay feedback visual de "mensaje enviado" — el mensaje aparece en la lista pero sin confirmación de envío exitoso. Un Toast sería apropiado.
2. `message-media.tsx` usa `getAudioPlaybackErrorMessage` que puede devolver lenguaje genérico.

---

### FLUJO: Radio (PTT)

| Archivo | Patrón | Feedback | Clasificación |
|---------|--------|----------|---------------|
| `radio-screen-view.tsx:387-398` | Error transmisión | Phase → ERROR + mensaje | 🟢 Correcta |
| `radio-screen-view.tsx:493-496` | Micrófono bloqueado | `setRecorderMessage('Mic bloqueado')` | 🟢 Correcta |
| `radio-screen-view.tsx:1020-1031` | Error al detener | Phase → OFFLINE/ERROR | 🟢 Correcta |
| `radio-screen-view.tsx:1143-1146` | Timeout envío | Mensaje claro | 🟢 Correcta |
| `radio-screen-view.tsx:1148-1150` | Grabación muy corta | "Manten presionado al menos 1 segundo" | 🟡 Mejorable |
| `radio-screen-view.tsx:1222-1241` | Error permisos | "Mic bloqueado" | 🟢 Correcta |
| `radio-screen-view.tsx:523` | Frame falla | Phase → OFFLINE | 🟢 Correcta |
| `radio-realtime-service.ts:133` | Error conexión | Mensaje de error claro | 🟢 Correcta |
| `radio-realtime-service.ts:155` | Error handler | Mensaje de error claro | 🟢 Correcta |

**Problemas menores:**
1. `getRadioRealtimeErrorMessage` tiene mensajes adecuados pero cortos ("Sesion expirada", "Sin permisos para transmitir", "Error de conexion"). Podrían tener más contexto.

---

### FLUJO: Control (Jornada / Rutas)

| Archivo | Patrón | Feedback | Clasificación |
|---------|--------|----------|---------------|
| `checklist-screen.tsx:1861` | Eliminar ruta | Alert.alert con confirmación | 🟢 Correcta |
| `checklist-screen.tsx:1605-1618` | Finalizar jornada falla | `setPointMessage` | 🟡 Mejorable |
| `checklist-screen.tsx:1631-1653` | Iniciar jornada falla | Offline queue + mensaje | 🟡 Mejorable |
| `checklist-screen.tsx:1671-1688` | Pausar/reanudar falla | Offline queue + mensaje | 🟡 Mejorable |

**Problemas:**
1. **No hay confirmación para iniciar/finalizar/pausar jornada** — acciones importantes que afectan el registro laboral del conductor. Deberían tener confirmación o al menos feedback claro.
2. `setPointMessage` es un mecanismo no estándar que muestra mensajes temporales en el tracker, no visible en toda la pantalla. El conductor podría no verlo.

---

### FLUJO: Incidencias

| Archivo | Patrón | Feedback | Clasificación |
|---------|--------|----------|---------------|
| `incidents-screen.tsx:838-844` | Crear incidencia exitosa | Solo Haptics | 🔴 Incorrecta |
| `incidents-screen.tsx:859-861` | SOS exitoso | Solo Haptics | 🔴 Incorrecta |
| `incidents-screen.tsx:1106-1120` | Error al cargar | Banner inline | 🟢 Correcta |
| `incidents-screen.tsx:1122-1126` | Cargando | ActivityIndicator | 🟢 Correcta |
| `incidents-screen.tsx:1243-1258` | Sin resultados | EmptyState doble | 🟢 Correcta |

**Problemas:**
1. Sin feedback visual de éxito al crear incidencia o SOS — solo vibración. En una situación crítica (SOS), el usuario necesita confirmación VISUAL clara de que se registró.
2. **No hay confirmación para enviar SOS** — acción potencialmente crítica sin doble verificación.

---

### FLUJO: Perfil

| Archivo | Patrón | Feedback | Clasificación |
|---------|--------|----------|---------------|
| `profile-screen.tsx:290` | Cerrar sesión | **SIN CONFIRMACIÓN** — llama `signOut()` directo | 🔴 Incorrecta |
| `profile-edit-screen.tsx:304` | Guardar cambios exitoso | Mensaje inline "Informacion actualizada" | 🟢 Correcta |
| `profile-edit-screen.tsx:295-298` | Error al guardar | Mensaje inline | 🟢 Correcta |
| `profile-edit-screen.tsx:342-353` | Cancelar edición | Sin confirmación de cambios sin guardar | 🟡 Mejorable |

**Problemas:**
1. **Cerrar sesión SIN confirmación** (#1 crítico). Acción destructiva que borra sesión local. Debe tener ConfirmModal.
2. Salir de edición sin guardar no pregunta. Riesgo de pérdida de datos.

---

### FLUJO: Usuarios

| Archivo | Patrón | Feedback | Clasificación |
|---------|--------|----------|---------------|
| `users-screen.tsx` (mobile) | Solo lectura | Sin CRUD | 🟢 Correcta |
| `portal-users-screen.tsx` (ventas) | Eliminar usuario | ConfirmModal destructivo | 🟢 Correcta |
| `portal-users-screen.tsx:106-137` | Guardar usuario | Mensaje inline en subtitle | 🟡 Mejorable |

**Problema menor:**
1. Feedback de éxito/error en `subtitle` de PortalSectionCard puede pasar desapercibido.

---

### FLUJO: Vehículos

| Archivo | Patrón | Feedback | Clasificación |
|---------|--------|----------|---------------|
| `portal-units-screen.tsx:106-136` | Crear/editar unidad | Mensaje inline en subtitle | 🟡 Mejorable |
| `portal-units-screen.tsx:197-198` | Loading submit | ActivityIndicator | 🟢 Correcta |

**Problema:**
1. **No hay confirmación al eliminar vehículo** — ni siquiera hay botón eliminar en la UI actual.

---

### FLUJO: Ventas / Portal

| Archivo | Patrón | Feedback | Clasificación |
|---------|--------|----------|---------------|
| `portal-payments-screen.tsx` | Eliminar tarjeta | ConfirmModal + mensaje tono | 🟢 Correcta |
| `portal-payments-screen.tsx:346-369` | Guardar tarjeta | Mensaje tono-based | 🟢 Correcta |
| `portal-profile-screen.tsx` | Revocar sesión | ConfirmModal + mensaje inline | 🟢 Correcta |
| `portal-routes-screen.tsx` | Liberar ruta | ConfirmModal + mensaje inline | 🟢 Correcta |
| `portal-users-screen.tsx` | Eliminar usuario | ConfirmModal | 🟢 Correcta |
| `portal-dashboard-screen.tsx` | Error carga | Notice bar | 🟡 Mejorable |
| `portal-layout.tsx` | Cerrar sesión | **SIN CONFIRMACIÓN** (línea 196, 261) | 🔴 Incorrecta |
| `use-portal-store.ts:250` | Cambiar plan | Sin confirmación UI | 🔴 Incorrecta |
| `use-portal-store.ts:263` | Cancelar plan | Sin confirmación UI | 🔴 Incorrecta |
| `plan-checkout-screen.tsx` | Pago exitoso | Done panel con icono | 🟢 Correcta |
| `plan-checkout-screen.tsx:155-171` | Error plan | Pantalla error + Reintentar | 🟢 Correcta |
| `portal-plan-screen.tsx:388-398` | Cargando planes | Skeleton | 🟢 Correcta |

**Problemas:**
1. Cerrar sesión en portal sin confirmación (2 lugares).
2. Cambiar plan y cancelar plan no tienen confirmación en la capa UI.

---

## Problemas Críticos

### 🔴 CRIT-1: SignOut sin confirmación (6 lugares)

| # | Archivo | Línea | Contexto |
|---|---------|-------|----------|
| S1 | `mobile/src/screens/profile-screen.tsx` | 290 | Botón "Cerrar sesion" |
| S2 | `mobile/src/screens/map-screen.native.tsx` | 316 | Map screen |
| S3 | `mobile/src/screens/mobile-account-gate-screen.tsx` | 121 | Account gate |
| S4 | `mobile/src/components/operational-menu-drawer.tsx` | 272 | Menú lateral |
| S5 | `ventas/features/portal/components/portal-layout.tsx` | 196 | Portal header |
| S6 | `ventas/features/portal/components/portal-layout.tsx` | 261 | Portal footer |

**Cerrar sesión es una acción destructiva** (pierde sesión local, datos no sincronizados pueden perderse). Debe tener confirmación en TODOS los casos.

---

### 🔴 CRIT-2: Sin feedback visual de éxito en acciones clave

| # | Acción | Feedback actual | Feedback necesario |
|---|--------|-----------------|-------------------|
| 1 | Login exitoso | Solo Haptics | Toast/Banner "Sesión iniciada" |
| 2 | Crear incidencia | Solo Haptics | Toast "Incidencia registrada" |
| 3 | Enviar SOS | Solo Haptics | Modal/Banner CONFIRMACIÓN VISIBLE |
| 4 | Enviar mensaje chat | Nada (aparece en lista) | Indicador "Enviado" / checkmark |
| 5 | Iniciar jornada | Nada | Toast "Jornada iniciada" |
| 6 | Finalizar jornada | Nada | Toast "Jornada finalizada" |

---

### 🔴 CRIT-3: Lenguaje técnico en errores visibles al usuario

`getApiErrorMessage` (mobile `client.ts:222-312`) genera mensajes con:

```
"Timeout: el backend de produccion no respondio a tiempo en https://api.manecomb.com."
"Android bloqueo HTTP sin SSL. La app ya permite cleartext..."
"Error de SSL/handshake con el backend de produccion..."
"No se pudo conectar con el backend de produccion en https://api.manecomb.com."
"API no encontrada: /api/v1/routes. Revisa que la ruta exista en el backend."
"Error interno del servidor (500). Revisa la consola del backend."
"Despertando servidor, intentando de nuevo. Si continua, revisa Render. Codigo: abc-123"
```

Estos mensajes son **inaceptables para un conductor**. Contienen:
- URLs de backend
- Códigos HTTP (500, 502, 503, 504)
- Términos técnicos: SSL, handshake, cleartext, APK, Render, traceId, Código de error
- Instrucciones para desarrolladores

**Afecta a:** `customer-auth-screen.tsx:177`, todas las store actions, `portal-store.ts` via `getMessage`, `api-checkout-service-adapter.ts`.

---

### 🔴 CRIT-4: Toast y ConfirmModal mobile nunca se usan (dead code)

| Componente | Archivo | Líneas | Estado |
|------------|---------|--------|--------|
| `Toast` | `mobile/src/components/ui/toast.tsx` | 96 | Definido, **0 imports** |
| `ToastProvider` | `mobile/src/components/ui/toast.tsx` | 65 | Definido, **0 imports** |
| `ConfirmModal` | `mobile/src/components/ui/confirm-modal.tsx` | 112 | Definido, **0 imports** |
| `Skeleton` | `mobile/src/components/ui/skeleton.tsx` | ~50 | Definido, **0 imports** en screens |

**Impacto:** 4 componentes con ~260 líneas de código muerto. Peor aún, los screens mobile no tienen acceso a Toast — cuando necesiten feedback ligero, no hay componente disponible.

---

### 🔴 CRIT-5: Iniciar/Finalizar jornada sin confirmación

`checklist-screen.tsx`:
- `startTrip` (línea 1631): inicia jornada sin preguntar
- `finishTrip` (línea 1605): finaliza jornada sin preguntar
- `toggleSessionPause` (línea 1671): pausa/reanuda sin preguntar

La jornada es el registro central de trabajo del conductor. Iniciar, pausar o finalizar sin confirmación puede causar errores de registro.

---

### 🟡 CRIT-6: Múltiples patrones de feedback inconsistentes

La app mobile usa al menos **5 patrones diferentes** para mostrar feedback:

| Patrón | Screens |
|--------|---------|
| `helperMessage` banner inline | customer-auth-screen |
| `message` con estilo success/error box | profile-edit-screen |
| `error` banner inline | incidents-screen |
| `trackerRef.setPointMessage()` (no estándar) | checklist-screen |
| `ConnectionBanner` | Todas (via AppShell) |
| Phase-based messaging | radio-screen-view |
| Per-message retry + notice | chat-screen-view |

**No hay un sistema unificado de feedback.** Cada screen implementa su propio patrón.

---

### 🟡 CRIT-7: Componentes duplicados entre mobile y ventas

| Componente | mobile/ | ventas/ | Diferencia |
|------------|--------|---------|------------|
| `confirm-modal.tsx` | Sí | Sí | `danger` vs `destructive` prop |
| `toast.tsx` | Sí | Sí | Animación vs no animación |
| `empty-state.tsx` | Sí | Sí | Idénticos |
| `skeleton.tsx` | Sí | Sí | Idénticos |

**Impacto:** 4 pares de componentes que deberían compartirse. El código duplicado inevitablemente deriva en inconsistencias.

---

### 🟡 CRIT-8: `portal-payments-screen.tsx` es el único con feedback tono-based

Mientras todas las otras pantallas portal usan `message` en `subtitle` de PortalSectionCard, `portal-payments-screen.tsx` implementa su propio sistema de feedback con `FeedbackTone` (`'success' | 'danger' | 'info'`) y renderizado con iconos y colores. Es el estándar correcto pero está aislado.

---

## Acciones Destructivas — Verificación

### Correctamente protegidas con confirmación:

| Acción | Screen | Componente |
|--------|--------|------------|
| ✅ Eliminar ruta | checklist-screen (mobile) | Alert.alert |
| ✅ Eliminar usuario | portal-users-screen (ventas) | ConfirmModal |
| ✅ Liberar ruta | portal-routes-screen (ventas) | ConfirmModal |
| ✅ Revocar sesión remota | portal-profile-screen (ventas) | ConfirmModal |
| ✅ Eliminar tarjeta | portal-payments-screen (ventas) | ConfirmModal |

### Sin confirmación (deberían tener):

| Acción | Ubicación | Riesgo |
|--------|-----------|--------|
| ❌ Cerrar sesión (mobile) | 4 lugares | Pérdida de sesión, datos no sincronizados |
| ❌ Cerrar sesión (portal) | 2 lugares en portal-layout | Pérdida de sesión |
| ❌ Iniciar jornada | checklist-screen | Error registro laboral |
| ❌ Finalizar jornada | checklist-screen | Error registro laboral |
| ❌ Pausar jornada | checklist-screen | Error registro laboral |
| ❌ Cancelar plan | use-portal-store (sin UI confirm) | Pérdida de servicio |
| ❌ Cambiar plan | use-portal-store (sin UI confirm) | Cambio de facturación |

---

## Acciones NO Destructivas que deberían usar feedback ligero

| Acción | Feedback actual | Feedback recomendado |
|--------|----------------|---------------------|
| Guardar perfil | Mensaje inline | Toast "Perfil actualizado" |
| Enviar mensaje | Nada | Checkmark / "Enviado" |
| Iniciar jornada | Nada | Toast "Jornada iniciada" |
| Finalizar jornada | Nada | Toast "Jornada finalizada" |
| Pausar jornada | Nada | Toast "Jornada pausada" |
| SOS enviado | Solo Haptics | Modal + Toast "SOS registrado" |
| Login exitoso | Solo Haptics | Toast "Bienvenido" / transición |

---

## Mensajes Técnicos Identificados

### `getApiErrorMessage` (mobile `client.ts:222-312`)

| Condición | Mensaje actual | Problema |
|-----------|---------------|----------|
| Sin internet (hasInternet=false) | "El celular no tiene internet o no esta conectado a la Wi-Fi. Conectalo a la misma red que la laptop e intenta de nuevo." | Menciona "laptop" — asume contexto escritorio |
| Timeout producción | "Timeout: el backend de produccion no respondio a tiempo en {url}. Verifica tu internet y el estado de Render." | Expone URL, menciona "Render" (infraestructura) |
| Timeout genérico | "Timeout: el backend configurado no respondio a tiempo en {url}. Verifica la URL y la conexion." | Expone URL, lenguaje técnico |
| ClearText | "Android bloqueo HTTP sin SSL. La app ya permite cleartext en desarrollo; reinstala/recompila el APK si sigues viendo este error." | Términos: SSL, cleartext, APK, reinstala, recompila |
| SSL error | "Error de SSL/handshake con el backend de produccion..." | Término: SSL, handshake |
| Sin conexión producción | "No se pudo conectar con el backend de produccion en {url}. Verifica tu internet y que Render este activo." | Expone URL, menciona Render |
| Sin conexión genérico | "No se pudo conectar con el backend configurado en {url}. Verifica la URL y la conexion." | Expone URL |
| 404 | "API no encontrada: {url}. Revisa que la ruta exista en el {backendLabel}." | Expone URL, menciona backend |
| 500+ | "Error interno del servidor ({status}). Revisa la consola del backend." | Muestra código HTTP, menciona consola backend |
| 502/503/504 prod | "Despertando servidor, intentando de nuevo. Si continua, revisa Render. {traceId}" | Menciona Render, expone traceId |
| 502/503/504 genérico | "El backend configurado no respondio ({status}).{traceId}" | Muestra código HTTP, traceId |

### `getApiErrorMessage` (ventas `api.ts:96-129`)

| Condición | Mensaje actual | Problema |
|-----------|---------------|----------|
| Sin conexión | "No se pudo conectar con el backend: {API_URL}" | Expone URL del backend |
| 500+ | "Error interno del servidor ({status})." | Muestra código HTTP |

### `getRadioRealtimeErrorMessage` (mobile `radio-audio-service.ts:24-32`)

| Condición | Mensaje | Problema |
|-----------|---------|----------|
| Unauthorized | "Sesion expirada" | Aceptable |
| Forbidden | "Sin permisos para transmitir" | Aceptable |
| Timeout | "Servidor no disponible" | Aceptable |
| Default | "Error de conexion" | Aceptable |

---

## Mapa de Alertas

```
                    ┌──────────────────────┐
                    │     Alert.alert       │
                    │  checklist-screen.tsx │
                    │  "Eliminar ruta"      │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │  ConfirmModal │   │    Toast     │   │  Connection  │
   │  (ventas) ✔   │   │  (ventas) ✔  │   │   Banner ✔   │
   │  4 usos       │   │  1 uso       │   │  app-shell   │
   └──────────────┘   └──────────────┘   └──────────────┘
          │
          ├── portal-users-screen (Eliminar usuario)
          ├── portal-routes-screen (Liberar ruta)
          ├── portal-profile-screen (Revocar sesión)
          └── portal-payments-screen (Eliminar tarjeta)

   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │  EmptyState  │   │   Skeleton   │   │   Inline     │
   │  ✔ usado     │   │  (ventas) ✔  │   │   Messages   │
   │  27 usos     │   │  1 screen    │   │   5 patrones │
   └──────────────┘   └──────────────┘   └──────────────┘

   ┌─────────────────────────────────────────────┐
   │           COMPONENTES MUERTOS                │
   ├─────────────────────────────────────────────┤
   │  mobile/ConfirmModal  → 0 imports            │
   │  mobile/Toast         → 0 imports            │
   │  mobile/Skeleton      → 0 imports            │
   └─────────────────────────────────────────────┘
```

---

## Duplicados

| Componente | # de copias | Archivos |
|------------|-------------|----------|
| ConfirmModal | 2 | `mobile/src/components/ui/confirm-modal.tsx`, `ventas/src/components/ui/confirm-modal.tsx` |
| Toast | 2 | `mobile/src/components/ui/toast.tsx`, `ventas/src/components/ui/toast.tsx` |
| EmptyState | 2 | `mobile/src/components/ui/empty-state.tsx`, `ventas/src/components/ui/empty-state.tsx` |
| Skeleton | 2 | `mobile/src/components/ui/skeleton.tsx`, `ventas/src/components/ui/skeleton.tsx` |

---

## Resumen de Clasificaciones

### 🟢 Correctas (15)

| ID | Elemento |
|----|----------|
| A1 | Alert.alert "Eliminar ruta" (checklist-screen) |
| C1 | ConfirmModal "Eliminar usuario" (portal-users) |
| C2 | ConfirmModal "Liberar ruta" (portal-routes) |
| C3 | ConfirmModal "Cerrar sesión remota" (portal-profile) |
| C4 | ConfirmModal "Eliminar tarjeta" (portal-payments) |
| E1 | EmptyState mobile (8 usos) |
| E2 | EmptyState ventas (19 usos) |
| M1 | Modal editor ruta (checklist-screen) |
| M2 | Modal menú adjuntos (chat) |
| M3 | Modal imagen fullscreen (message-media) |
| CB | ConnectionBanner (app-shell) |
| EB | ErrorBoundary ventas |
| PC | plan-checkout-screen done panel |
| PC | plan-checkout-screen error + retry |
| SK | Skeleton ventas (portal-plan) |

### 🟡 Mejorables (12)

| ID | Elemento | Problema |
|----|----------|----------|
| T1 | Toast ventas (portal-layout) | Solo errors, sin success |
| L1 | customer-auth-screen helperMessage | Error técnico desde getApiErrorMessage |
| L2 | Login exitoso sin feedback visual | Solo Haptics |
| CH1 | Mensaje chat sin confirmación envío | Sin "Enviado" visible |
| CH2 | message-media error audio | Mensaje genérico |
| CH3 | attachment error sin notificación | attachmentNotice poco visible |
| R1 | Radio grabación corta | Mensaje podría ser más claro |
| R2 | Radio mensajes de error | Muy cortos, falta contexto |
| CT1 | setPointMessage en checklist | Mecanismo no estándar, poco visible |
| P1 | profile-edit sin confirmación salir | Riesgo pérdida datos |
| US1 | portal-users mensaje en subtitle | Puede pasar desapercibido |
| UN1 | portal-units mensaje en subtitle | Puede pasar desapercibido |

### 🔴 Incorrectas (10)

| ID | Elemento | Problema |
|----|----------|----------|
| CRIT-1 | SignOut sin confirmación (6 lugares) | Acción destructiva sin doble verificación |
| CRIT-2a | Incidencia exitosa sin feedback visual | Solo Haptics |
| CRIT-2b | SOS exitoso sin feedback visual | Solo Haptics — crítico |
| CRIT-2c | Login exitoso sin feedback visual | Solo Haptics |
| CRIT-3 | getApiErrorMessage lenguaje técnico | ~20 mensajes con URLs, códigos, términos técnicos |
| CRIT-5 | Iniciar/finalizar/pausar jornada sin confirmación | Acción que afecta registro laboral |
| CRIT-6b | Cancelar plan sin confirmación UI | Acción destructiva |
| CRIT-6c | Cambiar plan sin confirmación UI | Acción importante sin verificación |

### ⚫ Innecesarias / Muertas (4)

| ID | Elemento | Razón |
|----|----------|-------|
| D1 | `mobile/src/components/ui/confirm-modal.tsx` | Definido, 0 imports, 0 usos |
| D2 | `mobile/src/components/ui/toast.tsx` | Definido, 0 imports, 0 usos |
| D3 | `mobile/src/components/ui/skeleton.tsx` | Definido, 0 imports en screens |
| D4 | `getApiErrorMessage` mensajes técnicos | Deben reemplazarse por mensajes usuario |

---

## Recomendaciones (priorizadas)

### P0 — Urgente (seguridad / datos)

1. **Agregar ConfirmModal a TODOS los signOut** (6 lugares)
2. **Reemplazar mensajes técnicos de `getApiErrorMessage`** por versiones conductor-friendly
3. **Agregar confirmación a iniciar/finalizar/pausar jornada**
4. **Agregar confirmación a SOS** (doble verificación antes de enviar alerta crítica)

### P1 — Alta (experiencia de usuario)

5. **Agregar feedback visual de éxito a login, incidencias, SOS, jornada**
6. **Unificar componentes duplicados** (ConfirmModal, Toast, EmptyState, Skeleton) en paquete compartido
7. **Hacer que Toast mobile sea usable** o eliminarlo
8. **Hacer que ConfirmModal mobile sea usable** o eliminarlo
9. **Agregar confirmación a cancelar/cambiar plan** en portal

### P2 — Media (consistencia)

10. **Unificar patrones de feedback en mobile** (elegir 1-2 patrones estándar)
11. **Estandarizar feedback de portal** (seguir modelo de `portal-payments-screen` con tono-based)
12. **Agregar Toast de "Mensaje enviado" en chat**
13. **Agregar confirmación al salir de profile-edit con cambios sin guardar**
14. **Reemplazar `setPointMessage` por Toast/Banner estándar**

### P3 — Baja (limpieza)

15. **Eliminar componentes muertos** si no se van a usar
16. **Unificar nomenclatura** (`danger` vs `destructive` en ConfirmModal)
17. **Agregar `isSubmitting` loading a portal-profile-screen** (falta)

---

## Checklist Final

| Criterio | Estado |
|----------|--------|
| ¿Cada alerta aparece cuando corresponde? | ✅ Mayoría sí |
| ¿Cada alerta no interrumpe innecesariamente? | ❌ SignOut interrumpe sin confirmación necesaria |
| ¿Cada alerta informa claramente? | ❌ Errores con lenguaje técnico |
| ¿Cada alerta permite actuar correctamente? | ⚠️ Falta confirmación en acciones destructivas |
| ¿Cada alerta mantiene coherencia con toda la aplicación? | ❌ Múltiples patrones inconsistentes |

**Certificación final:** ❌ **NO APRUEBA** — Se requieren rectificaciones mayores antes de certificar.
