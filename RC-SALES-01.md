# RC-SALES-01 — Reporte de Evidencia (corregido)

> **Propósito:** Modularización presentacional de `ventas/screens/sales-screen.tsx` (3,319 → 514 líneas).
> **Estado:** Completado. Build y typecheck exitosos.

---

## 1. Estado Git completo

### Archivos modificados por RC-SALES-01

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `ventas/screens/sales-screen.tsx` | Modificado | +57 / −2,862 |

### Archivos nuevos (14 archivos en `ventas/screens/sales/`)

Ver lista completa en §3.

### Archivos modificados antes de RC-SALES-01 (cambios preexistentes, NO atribuibles)

| Archivo | RC origen |
|---------|-----------|
| `mobile/android/app/proguard-rules.pro` | RC-APK-01 |
| `mobile/android/gradle.properties` | RC-APK-02 |
| `mobile/src/screens/incidents-screen.tsx` | RC previa (no identificada) |

### Archivos fuera de alcance no tocados

`features/commercial/`, `src/store/`, `src/navigation/`, `src/lib/`, `constants/`, `features/portal/`, `mobile/`, `backend/`, `shared/` — **0 modificaciones**.

---

## 2. Validación

| Comando | Resultado | Nota |
|---------|-----------|------|
| `npm run typecheck` | Sin errores | — |
| `npm run build` | BUILD SUCCESSFUL (6.00s, 531 módulos) | — |
| `npm run test` | No ejecutado | No existe script `test` en `ventas/package.json`. No hay configuración de test runner detectable. |

---

## 3. Archivos creados (14 archivos, 2,889 líneas)

| # | Archivo | Líneas | Exporta | Responsabilidad |
|---|---------|--------|---------|----------------|
| 1 | `sales/types.ts` | 4 | `IconName`, `PointerVector` | Tipos compartidos de la pantalla |
| 2 | `sales/constants.ts` | 193 | `neonPalette`, `accentByTone`, `planVisualTones`, `benefits`, `processSteps`, `trustMetrics`, `footerColumns`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SYSTEM_STATUS_URL` | Paleta neon, datos de UI, configuración |
| 3 | `sales/utils.ts` | 211 | `formatCurrency`, `getPlanAccent`, `getPlanVisualTone`, `buildPlanParams`, `prefersReducedMotion`, `getStaticRevealStyle`, `usePrefersReducedMotion`, `usePointerParallax`, `webStyle`, `getFirstParam`, `openExternalUrl`, `normalizePaymentReturnStatus`, `getCheckoutReturnCopy` | Helpers de presentación, 2 hooks personalizados |
| 4 | `sales/styles.ts` | 1,283 | `styles` | StyleSheet.create completo (94 keys) |
| 5 | `sales/components/section-heading.tsx` | 224 | `SectionHeading`, `ActionButton`, `BenefitCard`, `ProcessStep`, `RoundIconButton` | 5 componentes presentacionales pequeños |
| 6 | `sales/components/site-header.tsx` | 102 | `SiteHeader` | Header público con nav, login, buy |
| 7 | `sales/components/immersive-background.tsx` | 130 | `ImmersiveBackground` | Fondo animado (orbes, partículas, rutas, parallax) |
| 8 | `sales/components/dashboard-mockup.tsx` | 143 | `DashboardMockup` | Mockup dashboard + 3 indicadores (FloatingIndicator interno) |
| 9 | `sales/components/reveal-view.tsx` | 122 | `RevealView` | Wrapper de animación por scroll |
| 10 | `sales/components/plan-card.tsx` | 192 | `PlanCard` | Tarjeta de plan (precio, características, botones) |
| 11 | `sales/components/plan-card-skeleton.tsx` | 30 | `PlanCardSkeleton` | Esqueleto de carga (SkeletonBar interno) |
| 12 | `sales/components/checkout-return-banner.tsx` | 44 | `CheckoutReturnBanner` | Banner de retorno de checkout |
| 13 | `sales/components/faq-item.tsx` | 103 | `FaqItem` | FAQ con animación accordion |
| 14 | `sales/components/site-footer.tsx` | 108 | `SiteFooter` | Footer con 4 columnas, contacto (ContactRow interno) |
| | **Total** | **2,889** | **14 componentes exportados + 3 internos** | |

**Nota:** 3 definiciones de componente no se exportan individualmente sino que son uso interno de su archivo contenedor: `FloatingIndicator` (dentro de dashboard-mockup.tsx), `SkeletonBar` (dentro de plan-card-skeleton.tsx), `ContactRow` (dentro de site-footer.tsx). Las 17 definiciones de componente (14 exportados + 3 internos) corresponden exactamente a las 17 funciones componente que estaban inline en el archivo original.

---

## 4. Ubicación de hooks

### 4.1 Hooks que permanecen en `SalesScreen`

| Hook | Línea | Propósito |
|------|-------|-----------|
| `useWindowDimensions()` | 57 | Dimensiones de viewport |
| `useLocalSearchParams()` | 58 | Parámetros de ruta (return de checkout) |
| `usePublicCommercialFlow()` | 66-70 | Carga de planes y estado comercial |
| `useAppStore()` | 72 | Usuario autenticado |
| `useRef<ScrollView>` | 71 | Referencia al carrusel de planes |
| `useState(1)` | 73 | `activePlanIndex` |
| `useState(0)` | 74 | `openFaqIndex` |
| `useState(false)` | 75 | `headerCompact` |
| `useState(0)` | 76 | `nativeScrollY` |
| `useEffect` (init activePlanIndex) | 78-84 | Sincroniza activePlanIndex con plans |
| `useEffect` (scroll listener) | 86-118 | Detecta scroll para compact header |

### 4.2 Hooks extraídos con sus componentes (movimiento mecánico)

| Hook | Archivo destino | Línea | Componente propietario original |
|------|----------------|-------|-------------------------------|
| `useRef(null)` | `components/reveal-view.tsx` | 21-23 | RevealView |
| `useState(0)`, `useState(immediate)`, `useState(immediate)` | `components/reveal-view.tsx` | 24-26 | RevealView |
| `useEffect` (IntersectionObserver) | `components/reveal-view.tsx` | 31-60 | RevealView |
| `useEffect` (scroll nativo) | `components/reveal-view.tsx` | 63-71 | RevealView |
| `useEffect` (animación) | `components/reveal-view.tsx` | 73-91 | RevealView |
| `useRef(Animated.Value(0))` | `components/immersive-background.tsx` | 8 | ImmersiveBackground |
| `useEffect` (pulse loop) | `components/immersive-background.tsx` | 15-32 | ImmersiveBackground |
| `useRef(Animated.Value(open ? 1 : 0))` | `components/faq-item.tsx` | 19 | FaqItem |
| `useEffect` (FAQ animation) | `components/faq-item.tsx` | 21-26 | FaqItem |

### 4.3 Hooks personalizados extraídos a `utils.ts`

| Hook | Línea en utils.ts | Uso |
|------|-------------------|-----|
| `usePrefersReducedMotion()` | 43 | ImmersiveBackground, DashboardMockup, FloatingIndicator, RevealView |
| `usePointerParallax()` | 62 | ImmersiveBackground, DashboardMockup |

**Estos 2 hooks estaban definidos como funciones de módulo en el archivo original (no dentro de `SalesScreen`).** Fueron extraídos mecánicamente a `utils.ts` sin cambiar su orden, lógica ni responsabilidad.

### 4.4 Componentes sin hooks

`SiteHeader`, `SiteFooter`, `PlanCard`, `PlanCardSkeleton`, `CheckoutReturnBanner`, `SectionHeading`, `ActionButton`, `BenefitCard`, `ProcessStep`, `RoundIconButton` — ninguno usa hooks de estado/efecto en el original ni en la extracción.

### 4.5 Conclusión sobre hooks

**Afirmación corregida:** No "todos los hooks permanecen en SalesScreen". Los hooks que estaban DENTRO de componentes inline (RevealView, ImmersiveBackground, FaqItem) se movieron CON sus componentes. Los hooks que eran funciones de módulo (usePrefersReducedMotion, usePointerParallax) se movieron a utils.ts. Solo los hooks de estado/efecto que orquestan la pantalla completa permanecen en SalesScreen. **No hubo cambio en orden, responsabilidad ni ejecución** — cada hook y efecto mantiene exactamente las mismas dependencias y lógica que en el archivo original.

---

## 5. Desviaciones de extracción mecánica detectadas

### 5.1 Reemplazo de `webStyle()` por inline `Platform.OS === 'web'`

En el archivo original, las secciones Hero, Trust y FAQ usaban `webStyle({...})` para aplicar estilos web específicos. En `sales-screen.tsx` final se reemplazaron con inline `Platform.OS === 'web' ? ({...} as any) : undefined`.

| Ubicación | Línea | Original | Final |
|-----------|-------|----------|-------|
| heroSection | 241-244 | `webStyle({backgroundImage, boxShadow, scrollMarginTop})` | `Platform.OS === 'web' ? ({...}) : undefined` |
| trustSection | 431-435 | `webStyle({backgroundImage, boxShadow, backdropFilter, scrollMarginTop})` | `Platform.OS === 'web' ? ({...}) : undefined` |
| faqShell | 472-476 | `webStyle({backgroundImage, boxShadow, backdropFilter, scrollMarginTop})` | `Platform.OS === 'web' ? ({...}) : undefined` |

**Impacto funcional:** Cero — `webStyle()` es definido como `Platform.OS === 'web' ? (style as any) : undefined`. La expresión inline produce exactamente el mismo resultado. **Esto no afecta comportamiento responsive, animaciones ni contenido visible.**

**Razón documentada:** Error menor durante la extracción; omisión involuntaria del import de `webStyle`. No requiere corrección funcional.

---

## 6. Evidencia de compatibilidad

### 6.1 Lógica comercial — Sin cambios

| Componente | Evidencia |
|-----------|-----------|
| `usePublicCommercialFlow` | Permanece en SalesScreen, importado de `@/features/commercial`. Sin modificar. |
| `CommercialPlan` | Tipo importado de `@/src/types/app`. Sin modificar. |
| `getPlanAccent`, `getPlanVisualTone`, `formatCurrency` | Movidos a `utils.ts` con código idéntico al original. |

### 6.2 Precios y planes — Sin cambios

`PlanCard` recibe `plan: CommercialPlan` y llama `formatCurrency(plan.price)` y `formatCurrency(plan.pricePerVehicle)` — idéntico al original. El contenido de `plan.badge`, `plan.name`, `plan.subtitle`, `plan.units`, `plan.includesRadioModule`, `plan.trialDays` se renderiza sin transformación.

### 6.3 Checkout — Sin cambios

`goToPlanCheckout(plan, requestTrial?)` se mantiene íntegro en SalesScreen (líneas 123-137). Llama `buildPlanParams()` (extraído a utils), `saveCheckoutContext()` (sin tocar), decide ruta según `user` y `isCustomerAccount()`. `CheckoutReturnBanner` extraído con código idéntico.

### 6.4 Navegación — Sin cambios

`router.push()`, `router.replace()`, `scrollToSection()`, `jumpToPlan()` — todas las referencias a `router` y lógica de navegación permanecen en SalesScreen o en `SiteFooter` (que importa `router` directamente, mismo comportamiento). `openExternalUrl()` extraído a utils con código idéntico.

| Ruta | Estado |
|------|--------|
| `/ventas/login` | Sin cambios |
| `/ventas/registro` | Sin cambios |
| `/ventas/pago` | Sin cambios |
| `/portal`, `/portal/pagos` | Sin cambios |
| `/privacidad`, `/terminos` | Sin cambios |

### 6.5 Stores — Sin cambios

`useAppStore` continúa en `SalesScreen`. `usePortalStore` no se toca. Importaciones idénticas.

### 6.6 Servicios y endpoints — Sin cambios

`usePublicCommercialFlow`, `loadPlans`, `healthCheck` — sin tocar. No se modificó `src/lib/api.ts` ni `features/commercial/index.ts`.

### 6.7 Callbacks — Sin cambios

| Callback | Línea en SalesScreen | ¿Modificado? |
|----------|---------------------|--------------|
| `goToPlanCheckout` | 123-137 | No — código idéntico |
| `scrollToSection` | 160-168 | No — código idéntico |
| `jumpToPlan` | 170-183 | No — código idéntico |
| `handlePlansScrollEnd` | 185-194 | No — código idéntico |
| `loginAction` | 199 | No — código idéntico |

### 6.8 Estado — Sin cambios

4 estados (`activePlanIndex`, `openFaqIndex`, `headerCompact`, `nativeScrollY`) permanecen en SalesScreen con los mismos valores iniciales. `activePlan` y `checkoutReturnStatus` son valores derivados idénticos.

### 6.9 Comportamiento responsive — Sin cambios

| Flag responsive | Cálculo | ¿Modificado? |
|----------------|---------|--------------|
| `isDesktop` | `width >= 1024` | No |
| `isPhone` | `width < 640` | No |
| `isTablet` | `!isDesktop && !isPhone` | No |
| `heroSideBySide` | `width >= 880` | No |
| `cardWidth` | `isPhone ? Math.max(268, width - 42) : isDesktop ? 336 : 306` | No |
| `cardStep` | `cardWidth + 14` | No |

### 6.10 Animaciones — Sin cambios

| Animación | Ubicación | ¿Modificada? |
|-----------|-----------|--------------|
| RevealView (fade + slide) | `components/reveal-view.tsx` | No — código idéntico |
| ImmersiveBackground (pulse orbs) | `components/immersive-background.tsx` | No — código idéntico |
| FaqItem (accordion expand) | `components/faq-item.tsx` | No — código idéntico |
| CSS keyframes (gradient, orb, route, particle) | Componentes vía `webStyle` | No — mismas strings |

### 6.11 Contenido visible — Sin cambios

Todo texto visible (títulos, subtítulos, descripciones, precios, nombres de planes, badges, botones, FAQ, footer, etc.) proviene de:
- Constantes extraídas mecánicamente (`benefits`, `processSteps`, `trustMetrics`, `footerColumns` en `constants.ts`)
- Datos de API (`plan.name`, `plan.subtitle`, etc.)
- Props inmutables desde SalesScreen

Ningún string fue alterado.

---

## 7. Matriz de compatibilidad

| Pregunta | Respuesta | Evidencia |
|----------|-----------|-----------|
| ¿Cambió la lógica comercial? | NO | `usePublicCommercialFlow` intacto; `PlanCard` recibe datos ya resueltos |
| ¿Cambió algún dato? | NO | Constantes extraídas con valores literales idénticos; planes desde API sin tocar |
| ¿Cambió algún precio? | NO | `plan.price`, `plan.pricePerVehicle` leídos desde API; `formatCurrency` idéntico |
| ¿Cambió algún contrato? | NO | `CommercialPlan` sigue siendo el tipo de `@/src/types/app` |
| ¿Cambió algún endpoint? | NO | `src/lib/api.ts` no se modificó |
| ¿Cambió algún store? | NO | `useAppStore` sin modificar; `usePortalStore` sin tocar |
| ¿Cambió algún servicio? | NO | `features/commercial/index.ts` sin modificar |
| ¿Cambió la navegación? | NO | `router.push()` idéntico en `SiteFooter` y `SalesScreen` |
| ¿Cambió el checkout? | NO | `goToPlanCheckout` sin cambios; `CheckoutReturnBanner` extraído con código idéntico |
| ¿Cambió la UI visible? | NO | Ver §6.11 |
| ¿Cambió el comportamiento responsive? | NO | Mismas 6 flags responsive, mismas condiciones, mismos valores |
| ¿Se duplicó lógica? | NO | Extracción unidireccional sin dejar código original |

---

## 8. Comparación estructural

| Métrica | Original | Final |
|---------|----------|-------|
| Líneas de `sales-screen.tsx` | 3,319 | 514 |
| Líneas eliminadas | — | 2,862 |
| Líneas insertadas | — | 57 |
| Reducción neta | — | −86.2% |
| Componentes inline definidos | 17 | 0 |
| Componentes importados | 0 | 14 |
| Imports eliminados | — | 11 (`memo`, `ReactNode`, `Animated`, `Easing`, `StyleSheet`, `Typography`, `pulse as pulseDot`, `shimmer`, `BrandLogo`, `PaymentReturnConfirmation`, `buildCheckoutParams`) |

---

## 9. Componentes reutilizados (sin crear)

| Componente | Origen | Uso |
|-----------|--------|-----|
| `BrandLogo` | `src/components/brand-logo` | SiteHeader, DashboardMockup, SiteFooter |
| `router` | `src/navigation/router` | SalesScreen (callbacks), SiteFooter (links legales) |

---

## 10. Código preexistente no modificado (candidato para RC futura)

| Código | Ubicación en original | Nota |
|--------|----------------------|------|
| `neonPalette` (definición inline de 21 colores) | Líneas 40-61 → `constants.ts` | Se movió, no se eliminó |
| `benefits`, `processSteps`, `trustMetrics`, `footerColumns` | Líneas 119-227 → `constants.ts` | Se movieron, no se eliminaron |
| Helpers `formatCurrency`, `webStyle`, etc. | Líneas 229-436 → `utils.ts` | Se movieron, no se eliminaron |
| `StyleSheet.create` (1,278 líneas) | Líneas 2040-3319 → `styles.ts` | Se movió, no se eliminó |

---

## 11. Riesgos detectados para RC futura

| Riesgo | Evidencia | Archivo | Líneas |
|--------|-----------|---------|--------|
| `sales-screen.tsx` sigue siendo el chunk JS más grande del build | Build output: `sales-screen-DKr80wW-.js` = 161.60 kB gzip: 45.88 kB | — | — |
| `useRef<ScrollView>` en SalesScreen no es tipado estrictamente `ScrollView` | No se encontró un tipo extraíble para el ref | `sales-screen.tsx` | 71 |
| Los `RevealView` anidados duplican la llamada `usePrefersReducedMotion()` repetidamente | 6 instancias de `RevealView` en el mismo JSX, cada una crea su propio observer | `sales-screen.tsx` | 226-498 |
| `styles.ts` (1,283 líneas) es el archivo más grande de la extracción | Candidato a división por sección (hero, header, plans, footer, etc.) | `sales/styles.ts` | — |
