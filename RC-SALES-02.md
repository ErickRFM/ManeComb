# RC-SALES-02: Modularización de plan-checkout-screen.tsx

## Objetivo
Extraer componentes presentacionales, utilidades, tipos y estilos de `plan-checkout-screen.tsx` (~1.321 líneas) en una estructura `checkout/` con 10 archivos, manteniendo PlanCheckoutScreen como contenedor orquestador con toda la lógica de negocio intacta.

## Resultados

### Métricas

| Métrica | Antes | Después | Cambio |
|---|---|---|---|
| plan-checkout-screen.tsx | 1.321 líneas | 212 líneas | **−83,9 %** |
| Archivos en checkout/ | — | 10 | +10 |
| Dependencias externas | — | 0 | sin cambios |
| Typecheck | pasa | pasa | ✅ |
| Build | pasa | pasa | ✅ |

### Archivos creados

```
ventas/screens/checkout/
├── checkout.constants.ts          # palette, checkoutBenefits
├── checkout.styles.ts             # StyleSheet.create completo (extraído)
├── checkout.types.ts              # PaymentMethod, CheckoutStep
├── checkout.utils.ts              # getFirstParam, formatCurrency, openCheckoutUrl, getCheckoutMessage
└── components/
    ├── checkout-header.tsx        # BrandLogo + botón "Cambiar plan"
    ├── checkout-stepper.tsx       # Indicador de pasos (extraído)
    ├── checkout-done-panel.tsx    # Panel de finalización/done (extraído)
    ├── checkout-payment-section.tsx  # Formulario de pago (con MethodTab, TestPaymentInput)
    ├── checkout-order-summary.tsx     # Resumen de pedido (con TotalRow)
    └── checkout-trust-strip.tsx       # Tira de confianza (con TrustItem)
```

### Comportamiento preservado

- **Hooks**: `useCheckoutExperience`, `useAppStore`, `usePortalStore`, `readCheckoutContext` — sin cambios en llamadas ni orden
- **Estado local**: `selectedMethod`, `includeRadioAddon`, `step`, `testCard`, `paymentInFlight` — sin cambios en lógica de actualización
- **Efectos**: `saveCheckoutContext` — idéntico
- **Navegación**: redirecciones por planId ausente, usuario no autenticado, cuenta no customer — sin cambios
- **Estados de carga/error**: idénticos (ActivityIndicator, reintento, volver a planes)
- **Callbacks**: `submitPayment` (con `setStep('confirmation')`, `submit`, manejo de `checkoutUrl`, `loadAll`, `clearCheckoutContext`) — sin cambios
- **Diseño responsive**: `isTwoColumn` (>=980px), `isPhone` (<640px) — exactamente igual, con breakpoints preservados
- **Componentes extraídos**: reciben props; **no** duplican lógica de negocio, no importan stores, no llaman hooks

### Matriz de compatibilidad

| Aspecto | Estado |
|---|---|
| ProviderMode: test | ✅ formulario de tarjeta de pruebas con TestPaymentInput |
| ProviderMode: live | ✅ MethodTabs + paneles informativos card/SPEI |
| ProviderMode: unavailable | ✅ mensaje de servicio no disponible |
| Radio addon | ✅ checkbox + cálculo de total |
| Trial mode | ✅ botón "Activar prueba N días" + mensajes |
| Done (activación) | ✅ "Continuar configuración" → onboarding |
| Done (pendiente) | ✅ "Ver estado en portal" → portal/plan |
| Mensajes de error MP | ✅ getCheckoutMessage filtra errores de Mercado Pago |
| Safe area / scroll | ✅ KeyboardSafeScrollView mantenido |
| Capa de fondo con glows | ✅ backgroundLayer + glows + rail sin cambios |

### Dependencias inalteradas

No se modificaron:
- `package.json` / `package-lock.json`
- `mobile/` — sin cambios
- `backend/` — sin cambios
- `shared/` — sin cambios
- `features/portal/` — sin cambios
- `features/commercial/` — sin cambios
- `src/store/` — sin cambios
- `src/utils/` — sin cambios
- `src/components/` — sin cambios
- Otros screens existentes — sin cambios

### Estado Git

```
Branch: main (up to date with origin/main)

Modified:
  ventas/screens/plan-checkout-screen.tsx   (+41, −1133)

Untracked:
  ventas/screens/checkout/   (10 archivos nuevos)
  RC-SALES-02.md

No staged changes. El árbol contiene exclusivamente los cambios de RC-SALES-02 y no contiene modificaciones ajenas.
```

### Verificación

```bash
npm run typecheck  # ✓ sin errores
npm run build      # ✓ 540 modules transformed, build exitoso
npm run test       # script "test" no definido en package.json — no existe suite de pruebas
```

RC-SALES-02 completo. Rollback oficial con `git revert <commit-de-rc-sales-02>` (no realizar hasta que el commit esté firmado).
