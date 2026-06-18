# Legacy notes

Fecha local: 2026-06-17

## Fase 7 - limpieza legacy controlada

### Mobile app routes

- `mobile/app/` no se elimino.
- Motivo: el proyecto React Native CLI actual lo usa como arbol de rutas sobre el router propio de `mobile/src/navigation/router.tsx`.
- Validacion: `mobile/app/_layout.tsx`, `mobile/app/(tabs)/*`, `mobile/app/login.tsx`, `mobile/app/plan-blocked.tsx` y rutas equivalentes siguen siendo entrypoints reales.

### Mobile y ventas

- Se elimino el acoplamiento de Metro/Babel desde `mobile` hacia `../ventas`.
- Motivo: no quedan imports reales `ventas/...` en `mobile`; mantener el alias podia arrastrar codigo comercial web al APK o hacer que el build dependiera del paquete de ventas.
- Archivos retirados por no tener referencias:
  - `mobile/src/types/ventas-modules.d.ts`
  - `mobile/src/screens/buyer-profile-screen.tsx`
  - `mobile/src/constants/commercial.ts`
  - `mobile/src/utils/checkout-context.ts`

### API comercial en mobile

- Se retiraron helpers comerciales/portal sin consumidores en `mobile/src/api/client.ts`.
- La app movil conserva solo la apertura externa del portal de ventas mediante `mobile/src/utils/sales-portal.ts`.
- Los botones de compra, renovacion o revision de pago deben abrir `https://manecomb1.pages.dev` o el runtime override `MANECOMB_SALES_PORTAL_URL`.

### Desktop

- `desktop/README.md` se actualizo como nota historica.
- Motivo: mencionaba Expo y `npm run desktop`, pero el proyecto activo es React Native CLI y no existe ese script.

### Documentacion historica

- `docs/alcance-sistema-combis.md` conserva contenido historico amplio.
- Se agrego una nota superior para aclarar que Expo/desktop no son el stack activo de build o deploy.
- No se regenero `docs/documentacion-tecnica-sistema-inteligente-gestion-combis.docx` en esta fase.
