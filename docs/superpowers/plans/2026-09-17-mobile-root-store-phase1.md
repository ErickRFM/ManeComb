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

### Task 3: Extract shared storage transport and session persistence runtime

**Files:**
- Create: `mobile/src/store/runtime/store-storage.ts`
- Create: `mobile/src/store/runtime/store-storage.test.ts`
- Create: `mobile/src/store/runtime/session-storage.ts`
- Create: `mobile/src/store/runtime/session-storage.test.ts`
- Create: `mobile/src/store/root-store-storage-wiring.test.js`
- Create: `mobile/src/store/root-store-session-storage-wiring.test.js`
- Modify: `mobile/src/store/root-store.ts`

**Interfaces:**
- `store-storage.ts` produces `STORE_STORAGE_TIMEOUT_MS` and `createStoreStorageRuntime(...)` with `getItem`, `setItem`, and `deleteItem`.
- `session-storage.ts` produces `SESSION_STORAGE_KEYS` and `createSessionStorageRuntime(storage)` with `getToken`, `getRefreshToken`, `getMode`, and `persistSession`.
- The generic runtime owns only web/native transport, timeout and failure fallback behavior.
- The session runtime owns only session credential keys and the existing persistence ordering.
- Push and E2EE continue to use the generic storage runtime directly; neither depends on session storage.
- Neither runtime imports `root-store.ts`, owns Zustand state, or introduces a second session authority.

**Implementation refinement:** The original plan placed the shared `getStoredItem`/`setStoredItem`/`deleteStoredItem` helpers directly in `session-storage.ts`. Repository inspection showed those helpers are also used by push-token and E2EE persistence. A lower-level stateless `store-storage.ts` boundary therefore preserves ownership more accurately and prevents unrelated domains from depending on a session-named module.

- [ ] **Step 1: Characterize the generic storage transport**

Cover the existing 1200 ms timeout, safe web-storage behavior, native fallback behavior, and failure swallowing semantics.

- [ ] **Step 2: Extract the generic runtime and delegate root-store helpers**

Remove the inline timeout/storage implementation from `root-store.ts` while keeping the same three helper call sites for push/E2EE compatibility.

- [ ] **Step 3: Characterize session persistence semantics**

Test the exact token/refresh/mode keys and the current write/delete ordering for remembered sessions and teardown.

- [ ] **Step 4: Extract session persistence policy**

Move the three session keys and `persistSession` behavior into `session-storage.ts`. Rewire initialization, API refresh fallback and logout reads through the session runtime without changing `session-epoch` ordering.

- [ ] **Step 5: Run persistence/lifecycle contracts**

Run:
```bash
cd mobile
npx jest src/store/runtime/store-storage.test.ts src/store/runtime/session-storage.test.ts src/store/root-store-storage-wiring.test.js src/store/root-store-session-storage-wiring.test.js src/store/session-lifecycle-boundary.test.js src/store/single-account-session-contract.test.js --runInBand
npm run typecheck
```
Expected: all PASS.

- [ ] **Step 6: Commit**

Keep generic transport, session policy and wiring contracts independently reversible.

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
