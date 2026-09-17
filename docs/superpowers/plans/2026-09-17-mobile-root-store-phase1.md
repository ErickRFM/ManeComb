# Mobile root-store Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `mobile/src/store/root-store.ts` coupling with behavior-preserving, low-risk extractions that establish safe module boundaries for later domain refactors.

**Architecture:** Keep `useAppStore` as the single public Zustand authority. Extract only pure/shared contracts, session persistence helpers, resource/reset factories, and preference state construction; root-store keeps orchestration and delegates through narrow imports so no second auth/socket/network/sync authority is introduced.

**Tech Stack:** React Native 0.81.5, TypeScript 5.9, Zustand 5, Jest 29, React Native Keychain/SecureStore adapter, AsyncStorage.

**Spec:** `docs/superpowers/specs/2026-09-17-mobile-root-store-modularization-design.md`

## Global Constraints

- Scope is `mobile/` only.
- Preserve the current public `useAppStore` keys and action signatures.
- Keep `session-epoch` as the only identity invalidation authority.
- Keep exactly one Socket.IO owner; Phase 1 does not move socket lifecycle.
- Preserve `operationalUnits` as the canonical operational projection.
- No backend, endpoint, UI, data-model or cryptography behavior changes.
- No extracted module may import `root-store.ts` or `useAppStore`.
- Every extraction must be independently reversible.

---

### Task 1: Add architecture boundary guard

**Files:**
- Create: `mobile/src/store/store-module-boundary.test.js`

**Interfaces:**
- Consumes: filesystem under `mobile/src/store/slices` and `mobile/src/store/runtime`.
- Produces: a Jest guard that rejects imports of `root-store`/`use-app-store` from extracted implementation modules.

- [ ] **Step 1: Write the failing/characterization test**

```js
const fs = require('node:fs');
const path = require('node:path');

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(absolute) : [absolute];
  });
}

describe('mobile store module boundaries', () => {
  it('keeps extracted slices/runtime independent from the public root store', () => {
    const storeDir = __dirname;
    const candidates = [
      ...collectFiles(path.join(storeDir, 'slices')),
      ...collectFiles(path.join(storeDir, 'runtime')),
    ].filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));

    for (const file of candidates) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*root-store['"]/);
      expect(source).not.toMatch(/from\s+['"][^'"]*use-app-store['"]/);
    }
  });
});
```

- [ ] **Step 2: Run focused test**

Run: `cd mobile && npx jest src/store/store-module-boundary.test.js --runInBand`
Expected: PASS before extraction and continue passing as modules are added.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/store/store-module-boundary.test.js
git commit -m "test(mobile): guard store module boundaries"
```

### Task 2: Extract resource-domain and session-reset factories

**Files:**
- Create: `mobile/src/store/app-state-foundation.ts`
- Create: `mobile/src/store/app-state-foundation.test.ts`
- Modify: `mobile/src/store/root-store.ts`

**Interfaces:**
- Produces: `MobileResourceDomain`, `MOBILE_RESOURCE_DOMAINS`, `createIdleMobileResources()`, and `createEmptyOperationalState()`.
- `createEmptyOperationalState()` returns exactly the current session-scoped operational reset fields and receives no store instance.

- [ ] **Step 1: Add focused tests for factory isolation**

```ts
import {
  createEmptyOperationalState,
  createIdleMobileResources,
  MOBILE_RESOURCE_DOMAINS,
} from './app-state-foundation';

describe('app-state foundation', () => {
  it('creates a fresh resource-state record per call', () => {
    const first = createIdleMobileResources();
    const second = createIdleMobileResources();
    expect(Object.keys(first)).toEqual(MOBILE_RESOURCE_DOMAINS);
    expect(first).not.toBe(second);
  });

  it('creates fresh mutable containers for identity teardown', () => {
    const first = createEmptyOperationalState();
    const second = createEmptyOperationalState();
    expect(first.incidents).toEqual([]);
    expect(first.messagesByConversation).toEqual({});
    expect(first.incidents).not.toBe(second.incidents);
    expect(first.messagesByConversation).not.toBe(second.messagesByConversation);
  });
});
```

- [ ] **Step 2: Run focused test and confirm RED**

Run: `cd mobile && npx jest src/store/app-state-foundation.test.ts --runInBand`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure factories**

Move the existing domain list, `idleMobileResources()` behavior and `getEmptyOperationalState()` object construction into `app-state-foundation.ts`. Do not import `root-store.ts` and do not add side effects.

- [ ] **Step 4: Replace root-store inline helpers with imports**

`root-store.ts` imports the new factories/types and continues calling the same behavior from `clearSessionState` and initial state construction. The public `AppState` shape remains unchanged.

- [ ] **Step 5: Run focused + lifecycle contracts**

Run:
```bash
cd mobile
npx jest src/store/app-state-foundation.test.ts src/store/session-lifecycle-boundary.test.js src/store/resource-state.test.ts --runInBand
npm run typecheck
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/store/app-state-foundation.ts mobile/src/store/app-state-foundation.test.ts mobile/src/store/root-store.ts
git commit -m "refactor(mobile): extract root store state foundation"
```

### Task 3: Extract session persistence runtime

**Files:**
- Create: `mobile/src/store/runtime/session-storage.ts`
- Create: `mobile/src/store/runtime/session-storage.test.ts`
- Modify: `mobile/src/store/root-store.ts`

**Interfaces:**
- Produces:
  - `SESSION_STORAGE_KEYS`
  - `getStoredSessionItem(key): Promise<string | null>`
  - `setStoredSessionItem(key, value): Promise<boolean>`
  - `removeStoredSessionItem(key): Promise<void>`
  - `clearPersistedSession(): Promise<void>`
- Uses existing `native/secure-store.ts` serialization and `safe-web-storage.ts`; it does not introduce a credential manager or a second session authority.

- [ ] **Step 1: Add tests for persistence semantics**

Test that the exported keys remain `combis-session-token`, `combis-refresh-token`, and `combis-session-mode`; web/native branching preserves null/memory failure behavior; and the runtime source does not import `root-store`.

- [ ] **Step 2: Run focused test and confirm RED**

Run: `cd mobile && npx jest src/store/runtime/session-storage.test.ts --runInBand`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Move only the existing storage implementation**

Move the current timeout-safe `getStoredItem`, `setStoredItem`, `removeStoredItem`, and persisted-session clear mechanics out of `root-store.ts`. Preserve existing timeout values and error swallowing/reporting semantics exactly; do not change session epoch ordering.

- [ ] **Step 4: Rewire root-store to the runtime helpers**

Replace inline storage calls without changing `initialize`, login/register/activation, token refresh or logout ordering.

- [ ] **Step 5: Run persistence/lifecycle contracts**

Run:
```bash
cd mobile
npx jest src/store/runtime/session-storage.test.ts src/store/session-lifecycle-boundary.test.js src/store/single-account-session-contract.test.js --runInBand
npm run typecheck
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/store/runtime/session-storage.ts mobile/src/store/runtime/session-storage.test.ts mobile/src/store/root-store.ts
git commit -m "refactor(mobile): isolate session persistence runtime"
```

### Task 4: Extract preference slice construction without changing public state

**Files:**
- Create: `mobile/src/store/slices/preferences-slice.ts`
- Create: `mobile/src/store/slices/preferences-slice.test.ts`
- Modify: `mobile/src/store/root-store.ts`

**Interfaces:**
- Produces `createPreferencesSlice(set, get)` returning exactly `{ themeMode, setThemeMode }` for composition into the existing `AppState` object.
- Uses existing `theme-preference.ts` account-scoped persistence; does not persist theme under session credential keys.

- [ ] **Step 1: Add slice tests**

Test the default mode, account-scoped owner passed to `saveThemePreference`, state update, and absence of root-store imports.

- [ ] **Step 2: Run focused test and confirm RED**

Run: `cd mobile && npx jest src/store/slices/preferences-slice.test.ts --runInBand`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the slice**

Use narrow `set`/`get` ports. Keep the current public action name `setThemeMode` and existing failure-tolerant theme persistence behavior.

- [ ] **Step 4: Compose it in root-store**

Spread the preference slice into the Zustand initializer and remove the duplicate inline theme action/default field. No screen import changes.

- [ ] **Step 5: Run theme + boundary + type gates**

Run:
```bash
cd mobile
npx jest src/store/theme-preference.test.ts src/store/slices/preferences-slice.test.ts src/store/store-module-boundary.test.js --runInBand
npm run typecheck
npm run lint
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/store/slices/preferences-slice.ts mobile/src/store/slices/preferences-slice.test.ts mobile/src/store/root-store.ts
git commit -m "refactor(mobile): compose preference slice"
```

### Task 5: Phase-1 regression gate and baseline measurement

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-mobile-root-store-modularization-design.md` only if implementation reveals a necessary ownership clarification.

**Interfaces:**
- Produces a verified Phase-1 baseline for Phase 2.

- [ ] **Step 1: Run full mobile checks**

```bash
cd mobile
npm run typecheck
npm run lint
npm test
```

- [ ] **Step 2: Run Android unit tests if the configured CI runner/host supports Android SDK**

Run: `cd mobile && npm run android:test:unit`
Expected: PASS; if the environment lacks Android SDK, record that as an environment limitation rather than a product pass.

- [ ] **Step 3: Measure root-store reduction and check forbidden dependencies**

Run:
```bash
wc -l src/store/root-store.ts
wc -c src/store/root-store.ts
grep -R "root-store\|use-app-store" src/store/slices src/store/runtime || true
```
Expected: root-store is smaller; only tests/comments explicitly intended by the architecture guard may mention the public facade, and implementation modules must not import it.

- [ ] **Step 4: Review diff for accidental behavioral changes**

Confirm no changes to API endpoint names, socket event names, offline operation shapes, auth epoch order, GPS behavior, chat/E2EE behavior, navigation, or UI.

- [ ] **Step 5: Commit any documentation-only clarification separately**

```bash
git add docs/superpowers/specs/2026-09-17-mobile-root-store-modularization-design.md
git commit -m "docs(mobile): clarify modular store ownership"
```
