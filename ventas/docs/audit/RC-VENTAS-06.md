# RC-VENTAS-06 — Auditoría de Coherencia y Flujo UX (Portal)

> **Foco:** Coherencia visual entre pantallas, transiciones de flujo, UX interna del portal, problemas no cubiertos en RC-VENTAS-05  
> **Clasificación:** 🔴 Critico | 🟠 Incompleto | 🟡 UX/UI | 🔵 Conversion | 🟢 Coherencia | ⚫ Refactor  
> **Roadmap:** FASE A (inmediato, bajo riesgo) → FASE B (UX) → FASE C (comercial) → FASE D (refactor)

---

## 🔴 Críticos

### F-01. Contraseñas enviadas en texto plano al backend
**Archivo:** `features/portal/screens/portal-users-screen.tsx:122`  
**Evidencia:** `password: editor.password.trim() || undefined`  
**Impacto:** Sin HTTPS o sin hash del lado del servidor, las contraseñas viajan en texto plano. Riesgo de seguridad y percepción de app amateur.  
**Roadmap:** FASE A

### F-02. Avatar muestra URL cruda en lugar de iniciales
**Archivo:** `features/portal/screens/portal-users-screen.tsx:342`  
**Evidencia:** `item.avatar || item.name.slice(0, 2)` — si `avatar` es una URL (ej. `https://...`), se renderiza la URL como texto en lugar de las iniciales del usuario.  
**Impacto:** Bug visual evidente; el avatar muestra una URL larga en la lista de usuarios.  
**Roadmap:** FASE A

### F-03. Filtros del dashboard truncan datos silenciosamente
**Archivo:** `features/portal/screens/portal-dashboard-screen.tsx:991,1005,1012`  
**Evidencia:** `.slice(0, 8)` en vehículos, `.slice(0, 6)` en conductores, `.slice(0, 6)` en rutas. Si hay más opciones, el usuario nunca las ve.  
**Impacto:** Empresas con +8 unidades no pueden filtrar por las demás sin saber que están truncadas. Percepción de app "rota".  
**Roadmap:** FASE A

---

## 🟠 Funcionalidad Incompleta

### F-04. Cambio de plan dice "Próximamente" en botón primario
**Archivo:** `features/portal/screens/portal-plan-screen.tsx:261,288`  
**Evidencia:** `"Confirmación disponible próximamente"` y botón deshabilitado con icono de reloj. La feature de cambio de plan termina en una pared.  
**Impacto:** El usuario elige un plan, ve el preview, y no puede completar la acción. Frustrante y daña la confianza.  
**Roadmap:** FASE C

### F-05. Liberar ruta sin confirmación
**Archivo:** `features/portal/screens/portal-routes-screen.tsx:150-160`  
**Evidencia:** `clearRoute()` se ejecuta inmediatamente al presionar el botón. Acción destructiva sin confirmación ni undo.  
**Impacto:** Un admin puede liberar una ruta por error sin advertencia.  
**Roadmap:** FASE A

### F-06. Portal no cambia `document.title` por ruta
**Evidencia global:** Ninguna pantalla del portal actualiza `document.title`. El título del tab permanece igual en dashboard, plan, pagos, etc.  
**Impacto:** Mala experiencia con múltiples tabs abiertos; imposible distinguir pestañas.  
**Roadmap:** FASE A

---

## 🟡 UX/UI

### F-07. Dashboard usa IDs internos en lugar de nombres legibles
**Archivo:** `features/portal/screens/portal-dashboard-screen.tsx:688`  
**Evidencia:** `{selectedSession.vehicleId}` — muestra el UUID interno del vehículo (ej. `"a1b2c3d4-..."`) en lugar del código o nombre.  
**Impacto:** El usuario ve cadenas crípticas donde debería ver "Unidad 01" o "ECO-001".  
**Roadmap:** FASE A

### F-08. Estados de jornada mezclan español e inglés
**Archivo:** `features/portal/screens/portal-dashboard-screen.tsx:999,1058`, `features/portal/screens/portal-dashboard-screen.tsx:249-252`  
**Evidencia:** `getJourneyState()` retorna "En ruta"/"Pausado"/"Finalizado" pero el fallback en línea 252 usa `session.status` crudo ("CANCELLED"). Los filtros y cards también muestran "RUNNING", "PAUSED", "FINISHED".  
**Impacto:** Inconsistencia de idioma; el dashboard parece sin terminar.  
**Roadmap:** FASE A

### F-09. Subtítulo del dashboard es técnico y jargon-heavy
**Archivo:** `features/portal/screens/portal-dashboard-screen.tsx:566`  
**Evidencia:** `"Supervision de flota, jornadas historicas, timeline y replay usando metricas persistidas."`  
**Problema:** "timeline", "replay", "metricas persistidas" son términos de developer, no de operador de flota.  
**Roadmap:** FASE B

### F-10. Formulario de ruta no tiene feedback visual durante carga
**Archivo:** `features/portal/screens/portal-routes-screen.tsx:238-245`  
**Evidencia:** El botón solo cambia a `disabled` con opacidad. No hay spinner, no hay indicador de progreso.  
**Impacto:** El usuario puede pensar que la app no respondió y hacer clic múltiples veces.  
**Roadmap:** FASE A

### F-11. Selección manual de marca de tarjeta (Visa/MC/Amex) sin autodetección
**Archivo:** `features/portal/screens/portal-payments-screen.tsx:26,94-155`  
**Evidencia:** El usuario debe elegir de un dropdown "Visa", "Mastercard", "American Express", "Carnet". En 2026, cualquier pasarela seria detecta la marca desde el BIN.  
**Impacto:** Percepción de solución artesanal. Además, el usuario puede equivocarse.  
**Roadmap:** FASE B

### F-12. Al editar tarjeta, se borra el campo de últimos 4 dígitos
**Archivo:** `features/portal/screens/portal-payments-screen.tsx:371-380`  
**Evidencia:** `editMethod()` limpia `cardNumber` y pide al usuario que ingrese los últimos 4 dígitos _de nuevo_.  
**Impacto:** El usuario probablemente no recuerde los 4 dígitos de una tarjeta que ya registró. Debería pre-cargarse (enmascarado).  
**Roadmap:** FASE A

### F-13. Sin indicación de consecuencias al eliminar usuario
**Archivo:** `features/portal/screens/portal-users-screen.tsx:376-389`  
**Evidencia:** Modal dice `"Se eliminara [user] de la cuenta."` sin explicar qué pasa con sus datos, sesiones activas, o asignaciones.  
**Impacto:** El usuario no puede tomar una decisión informada.  
**Roadmap:** FASE A

### F-14. Sin guía de recuperación en mensajes de error
**Evidencia global:** Todos los mensajes de error siguen el patrón `"No fue posible [accion]."` sin sugerir qué hacer.  
**Ejemplos:** `portal-routes-screen.tsx:123`, `portal-users-screen.tsx:131`, `portal-dashboard-screen.tsx:356`  
**Roadmap:** FASE B

---

## 🔵 Conversión

### F-15. Estado vacío de facturas usa tono incorrecto
**Archivo:** `features/portal/screens/portal-billing-screen.tsx:33`  
**Evidencia:** `"Tus facturas aparecerán aquí después de confirmar el primer cobro."` — asume que el usuario _ya contrató_ pero no ha pagado. Si aún no tiene plan, el mensaje no aplica.  
**Roadmap:** FASE B

### F-16. Vista de pago en móvil puede ocultar el formulario
**Archivo:** `features/portal/screens/portal-payments-screen.tsx:394-516`  
**Evidencia:** En layout angosto, los métodos de pago existentes aparecen primero y el formulario "Agregar método" queda debajo del pliegue. El estado vacío dirige al formulario pero puede no ser visible.  
**Roadmap:** FASE A

---

## 🟢 Coherencia Visual

### F-17. Dos sistemas de color dentro del portal
**Evidencia:**  
- `portal-dashboard-screen.tsx`, `portal-plan-screen.tsx`, `portal-billing-screen.tsx`, `portal-payments-screen.tsx`, `portal-onboarding-screen.tsx` usan `portalPalette` directamente.
- `portal-profile-screen.tsx`, `portal-routes-screen.tsx`, `portal-units-screen.tsx`, `portal-users-screen.tsx` usan `useAppTheme()` → `theme.colors`.

**Impacto:** Si el contexto de tema falla o cambia, 4 pantallas se ven diferentes a las otras 5. Los estilos inline con `theme.colors` vs `portalPalette` producen colores sutilmente distintos.  
**Roadmap:** FASE D

### F-18. Dos patrones de tipografía para títulos de sección
**Evidencia:**  
- En dashboard/plan/pagos/onboarding: `fontFamily: Typography.display` + `fontWeight: '900'` para títulos.
- En profile/routes/units/users: `fontFamily: Typography.body` + `fontWeight: '900'` para títulos similares (ej. `styles.unitName`, `styles.routeName`, `styles.userName`).

**Impacto:** Los títulos en unas pantallas usan `display` font y en otras `body` font — diferencia visual perceptible.  
**Roadmap:** FASE D

### F-19. Sidebar tiene dos ítems que apuntan a `/portal/perfil` con diferentes `section`
**Archivo:** `features/portal/components/portal-layout.tsx:59,63`  
**Evidencia:** `{ label: 'Empresa', href: '/portal/perfil', section: 'empresa' }` y `{ label: 'Seguridad', href: '/portal/perfil', section: 'seguridad' }` — ambos llevan a la misma ruta con diferente parámetro. El highlight del menú se basa en `currentSection`, pero la ruta es la misma.  
**Impacto:** Al navegar desde "Empresa" a "Seguridad", no hay transición de ruta — solo cambia el contenido interno. Puede confundir al usuario sobre dónde está.  
**Roadmap:** FASE B

### F-20. Sin estado skeleton consistente entre pantallas del portal
**Evidencia:** El dashboard usa `MapFallback` con "Cargando mapa..." pero los listados de unidades/rutas/usuarios no tienen skeleton states; aparecen directamente con datos o vacío. El contraste entre pantallas con skeleton (plan-screen) y sin skeleton (users-screen) es evidente.  
**Roadmap:** FASE B

---

## ⚫ Refactorización Futura

### F-21. Dashboard monolítico de 1779 líneas
**Archivo:** `features/portal/screens/portal-dashboard-screen.tsx`  
**Evidencia:** 1779 líneas, 15+ subcomponentes en el mismo archivo, lógica de negocio, estado local, y JSX todo mezclado.  
**Impacto:** Difícil de mantener, testear, o modificar sin romper algo.  
**Roadmap:** FASE D

### F-22. Lógica de negocio duplicada entre dashboard y store
**Evidencia:** El dashboard tiene sus propios `useMemo`, `useEffect`, y lógica de filtrado/ordenamiento que duplica parcialmente la lógica en `useAppStore` y `usePortalStore`.  
**Ejemplo:** La función `getRouteSessionHistoryRequest` se llama directamente desde el dashboard en lugar de delegar al store.  
**Roadmap:** FASE D

---

## Transiciones de Flujo (Hallazgos Transversales)

### T-01. Landing → Portal: salto visual drástico
- Landing usa paleta clara con acentos rojos (#E31E24)
- Portal fuerza `dark` mode (`setThemeMode('dark')` en `portal-layout.tsx:116`)
- **Resultado:** El usuario pasa de una página mayormente blanca a un dashboard oscuro. No hay transición, fade, ni explicación.

### T-02. Portal no tiene breadcrumb funcional
- `portal-layout.tsx:216-219` muestra "Portal > [título]" estático. No es un breadcrumb real; no se puede hacer clic en "Portal" para volver al dashboard.

### T-03. Sin enlace directo a soporte desde errores
- Cuando una operación falla ("No fue posible cargar jornadas"), no hay un enlace o botón "Contactar soporte". El usuario queda varado.

---

## Resumen de Hallazgos por Fase

| Fase | 🟠 F-Inc | 🔴 Crit | 🟡 UX/UI | 🔵 Conv | 🟢 Coh | ⚫ Ref | Total |
|------|----------|---------|----------|---------|--------|--------|-------|
| A    | 2        | 3       | 5        | 1       | 0      | 0      | 11    |
| B    | 0        | 0       | 2        | 1       | 2      | 0      | 5     |
| C    | 1        | 0       | 0        | 0       | 0      | 0      | 1     |
| D    | 0        | 0       | 0        | 0       | 0      | 2      | 2     |
| **Total** | 3 | 3 | 7 | 2 | 2 | 2 | **19** |

> **Nota:** Todos los hallazgos son distintos y complementarios a RC-VENTAS-05. RC-VENTAS-05 cubrió landing, auth, checkout (25 hallazgos). RC-VENTAS-06 cubre portal, coherencia, flujos internos (19 hallazgos + 3 transversales).
