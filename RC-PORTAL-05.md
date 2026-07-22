# RC-PORTAL-05: Portal refactor — cards, onboarding, documents, dead code, useCallback

## Scope

### 1. `portal-cards.tsx` monolith split
- **`cards/`** directory created with 7 files (index.ts barrel + 6 specialized files)
- Files: `portal-section-card.tsx`, `account-summary-card.tsx`, `activation-timeline.tsx`, `invoice-list.tsx`, `format-portal-status.ts`, `get-portal-status-tone.ts`
- All 17 consumers across the portal module updated from `'../components/portal-cards'` → `'../cards'`
- Original 322-line file deleted

### 2. `portal-onboarding-screen.tsx` extraction (971→197 lines)
- **`onboarding/`** directory: `onboarding.styles.ts`, `onboarding.utils.ts`
- **`onboarding/components/`**: `activation-wizard-step.tsx`, `activation-metric.tsx`, `activation-keys-summary.tsx`, `key-action-button.tsx`, `activation-key-row.tsx`
- Helpers extracted: `getStepIcon`, `getStepTarget`, `formatActivationKeyStatus`, `getActivationKeyTone`
- Screen now only contains: store calls, derived state, callbacks, JSX assembly

### 3. `portal-documents-screen.tsx` extraction (342→157 lines)
- **`documents/`** directory: `documents.styles.ts`, `documents.utils.ts`
- Helper `getStatusMeta` extracted

### 4. `portal-routes-screen.tsx` — dead code removal
- Removed `{false && canManageRoutes ? ...}` block (asignar ruta form, ~119 lines)
- Removed `{false && sortedVehicles.length ? ...}` block (rutas por unidad table, ~60 lines)
- No orphaned references; all imports still in active use

### 5. `portal-app-movil-screen.tsx` — useCallback fix
- `toggleVersionExpanded` wrapped with `useCallback` + empty deps `[]`

## Verification
- `npm run typecheck` — passes clean
- `npm run build` — builds successfully

## Commit
```
git add .
git commit -m "RC-PORTAL-05: refactor portal-cards, onboarding, documents; remove dead code; fix useCallback"
```
