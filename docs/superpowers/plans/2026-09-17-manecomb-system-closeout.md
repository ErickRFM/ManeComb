# ManeComb System Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the current ManeComb release blockers without changing established business/data authority, then leave production, CI, Portal certification, Sandbox, and maintainability in a verifiable state.

**Architecture:** Preserve backend/Mongo/Redis/Socket.IO and the shared operational contracts as authorities. Stabilization work is layered: release governance first, certification contracts second, runtime configuration third, then bounded cleanup/refactoring. Production behavior is changed only when the current runtime demonstrably conflicts with the documented production contract.

**Tech Stack:** Node.js 22, Express, MongoDB/Mongoose, Redis/BullMQ, Socket.IO, React Native CLI, React Native Web/Vite, Playwright, Jest, GitHub Actions, Render.

**Spec:** `docs/architecture/system-audit-gates.json` plus the production contracts in `docs/deployment.md` and the current PR #291 UI scope.

## Global Constraints

- Keep backend as authority for auth, tenant, permissions, commercial state, operational state, GPS, journeys, chat/radio/RTC coordination, and persistence.
- Keep `shared/operational-contract`, `shared/communication`, and `shared/resource-state` as shared contracts; do not reintroduce duplicated authorities.
- Do not reintroduce Expo or Google Maps; Mobile remains React Native CLI and Mapbox remains the mapping authority.
- Do not relax P0/P1 audit blocking severities or hide new dependency advisories.
- Production releases must be tied to an exact commit and fail closed when mandatory persistence/security configuration is unavailable.
- UI closeout must preserve current behavior and accessibility; stale certification locators/copy expectations are corrected only when the rendered UI is already the intended contract.

---

### Task 1: Re-establish release governance on the exact candidate HEAD

**Files:**
- Modify: `scripts/validate-system-audit-gates.mjs`
- Modify: `docs/architecture/system-audit-gates.json`
- Create: `docs/architecture/SYSTEM-CLOSEOUT-SEMANTIC-REVIEW-20260917.md`

**Interfaces:**
- Consumes: Git `HEAD`, audit baseline commit, required cross-layer gates.
- Produces: fail-closed drift validation against the exact checkout being certified.

- [ ] **Step 1:** Use the existing post-#289 failure as the RED case: PR candidates must not certify against stale `origin/main` while ignoring candidate commits.
- [ ] **Step 2:** Port the validated #290 HEAD-based drift logic.
- [ ] **Step 3:** Rebaseline authority review to the reviewed UI candidate `aacbf2052079a65c205f8da7f117d0f3fac4c65c` and document why no business/data authority changed.
- [ ] **Step 4:** Run the System audit gates workflow and require success.

### Task 2: Re-review the expired Mobile dependency exception

**Files:**
- Modify: `.github/scripts/mobile-production-audit.mjs`
- Create: `docs/security/mobile-image-size-risk-review-20260917.md`

**Interfaces:**
- Consumes: `npm audit --omit=dev --json`, exact installed `image-size` version/advisory URLs.
- Produces: advisory-specific, version-pinned, bounded risk gate that fails on new findings or drift.

- [ ] **Step 1:** Use the post-2026-09-15 workflow failure as RED evidence.
- [ ] **Step 2:** Record that official `image-size` 2.x now has patched releases but Metro 0.84.x still consumes the 1.x line, so an unverified major override is not accepted as a release fix.
- [ ] **Step 3:** Renew only the two existing advisory IDs for a short bounded review window; keep exact-version and new-advisory failure behavior.
- [ ] **Step 4:** Run Dependency audit and require success; remove the exception immediately if the dependency graph later moves to a verified patched compatible line.

### Task 3: Repair stale Portal production certification contracts

**Files:**
- Modify: `mobile/e2e/certification/public-responsive.spec.ts`

**Interfaces:**
- Consumes: current accessible names rendered by Ventas (`Crear cuenta`, `Ver plan <name>`).
- Produces: Playwright selectors that certify current intended UI rather than obsolete copy.

- [ ] **Step 1:** Treat the existing Playwright failures on 320/360/390 px as RED evidence.
- [ ] **Step 2:** Replace obsolete `Registrarse` signals/tabs with `Crear cuenta` while retaining login/register semantic coverage.
- [ ] **Step 3:** Replace obsolete `Seleccionar plan 2 combis` card locator with the production accessibility label `Ver plan 2 combis`.
- [ ] **Step 4:** Run the full Portal production certification workflow and require all responsive matrices to pass.

### Task 4: Align production payment mode with the intended Mercado Pago production contract

**Files:**
- Runtime configuration only unless repository validation reveals a code mismatch.

**Interfaces:**
- Consumes: Render production env plus existing Mercado Pago credentials/webhook configuration.
- Produces: runtime readiness reporting `provider=mercado_pago` and `environment=production` without changing secrets.

- [ ] **Step 1:** Verify accepted provider/environment values from backend config/tests.
- [ ] **Step 2:** Change only non-secret mode selectors in Render when existing credential readiness is already present.
- [ ] **Step 3:** Verify restart logs/readiness; if readiness fails, revert selectors rather than leaving payment partially configured.

### Task 5: Synchronize Sandbox with the certified release line

**Files:**
- Git ref/runtime configuration only.

**Interfaces:**
- Consumes: final certified `main` commit.
- Produces: Sandbox branch deployed from the same product generation while retaining sandbox-specific environment values.

- [ ] **Step 1:** Fast-forward `codex/mp-sandbox-02` only after the closeout PR is merged and production commit is known.
- [ ] **Step 2:** Verify Render auto-deploy completes on Sandbox.
- [ ] **Step 3:** Verify Sandbox Mongo/environment isolation remains distinct from production.

### Task 6: Reduce Mobile store coupling without changing authority

**Files:**
- Modify/create only after release gates are green; extraction must be behavior-preserving and covered by existing/new Jest contract tests.

**Interfaces:**
- Consumes: `mobile/src/store/root-store.ts` public `AppState` API.
- Produces: focused helpers/modules while keeping the store API stable for screens.

- [ ] **Step 1:** Identify one bounded responsibility with existing tests (realtime/session lifecycle first).
- [ ] **Step 2:** Add a failing contract test for the extracted boundary before production refactor.
- [ ] **Step 3:** Extract without changing exported store behavior.
- [ ] **Step 4:** Run Mobile typecheck, lint, Jest, and Android debug certification.

### Task 7: Remove safe deployment/documentation residue

**Files:**
- Candidate removal: `ventas/public/operations-map-first-revision.txt`
- Preserve: `desktop/README.md` historical marker and any compatibility file with active imports.

**Interfaces:**
- Consumes: code search/build references.
- Produces: cleaner deploy artifact without deleting active compatibility adapters.

- [ ] **Step 1:** Prove each candidate has no runtime/build consumer.
- [ ] **Step 2:** Remove only proven residue and keep historical compatibility explicitly documented.
- [ ] **Step 3:** Re-run Ventas build and CI.

### Task 8: Final release verification and integration

**Files:**
- Update closeout evidence only after workflows/runtime verification.

**Interfaces:**
- Consumes: CI, System audit gates, Dependency audit, Portal production certification, Render deploy/readiness.
- Produces: one mergeable closeout PR and a synchronized production/Sandbox state.

- [ ] **Step 1:** Require all GitHub workflows green on the exact head SHA.
- [ ] **Step 2:** Review changed-file diff for authority drift and accidental secrets.
- [ ] **Step 3:** Merge only the certified head SHA.
- [ ] **Step 4:** Verify Render production deploy references the merge commit and startup diagnostics are ready.
- [ ] **Step 5:** Synchronize Sandbox and record any remaining physical-device-only evidence as explicitly unproven rather than silently passing it.
