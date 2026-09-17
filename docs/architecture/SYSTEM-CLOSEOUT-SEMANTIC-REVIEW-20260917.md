# ManeComb system closeout semantic review — 2026-09-17

## Candidate reviewed

- Initial reviewed authority/UI candidate: `aacbf2052079a65c205f8da7f117d0f3fac4c65c` (`ui/portal-collapsible-sidebar`, PR #291).
- Pre-merge closeout checkpoint: `023e5746cf6af6c16778a170fe05f710f5a50767` (PR #293 before the final workflow-only correction).
- Base authority before UI candidate: `fe0ec43dff528eca19599630038daa4e128ef21d` (merged PR #289).
- Review purpose: establish the exact semantic authority checkpoint before the final release-gate correction and merge.

## Authority conclusion

Neither the reviewed UI candidate nor the subsequent closeout commits move business or data authority away from the existing backend/shared contracts. Production changes remain presentation-focused in Portal/Admin Global plus a backend test stabilization; closeout additions affect certification, audit governance, and dependency-risk policy. They do not introduce a new store, API, permission table, GPS authority, Socket.IO connection authority, route-session authority, payment authority, or persistence authority.

The following authorities remain unchanged:

- Backend owns authentication, tenant membership, capabilities/permissions, subscription/commercial state, operational units, GPS ingestion, journeys, incidents, documents, notifications, chat/radio/RTC coordination, and persistent writes.
- Mongo remains the persistent system of record for production state.
- Redis/BullMQ remain runtime coordination/queue infrastructure where configured; they do not replace Mongo business authority.
- `shared/operational-contract` remains the cross-client operational snapshot contract.
- `shared/communication` remains the shared browser/mobile communication contract.
- Portal and Mobile consume backend authority and reconcile realtime events; neither becomes a second system of record.

## Race/lifecycle review

No candidate production change alters session epochs, socket authentication, reconnect policy, route-session reconciliation, GPS ordering, offline synchronization, or teardown authority. The UI changes consume pre-existing state and therefore do not add a new late/repeated/out-of-order event path.

## Platform/integration review

The candidate keeps the established surfaces separated:

- Ventas/Portal remains the company web surface.
- Mobile remains React Native CLI with Mapbox.
- Admin Global remains its isolated application behind Platform auth/Cloudflare Access.
- Backend routes and shared runtime contracts are unchanged by the visual candidate.

## CI/release findings

The former system-audit validator could certify a pull request against `origin/main` instead of the exact merge candidate, hiding candidate drift until after merge. The closeout therefore makes `HEAD` the single freshness reference. This tightens the gate; it does not relax the five-commit drift limits or P0/P1 blocking severities.

The Portal production certification failures observed on PR #291 were certification-contract drift, not authority drift. The public Playwright contract searched for historical accessible copy (`Registrarse`, `Seleccionar plan 2 combis`) while the intended current UI exposes `Crear cuenta` and `Ver plan 2 combis`. The closeout updates only those locators and keeps the existing assertions for layout, focus, touch targets, hierarchy, and animation.

During pre-merge diff review, the workflow-only change that enabled stale-run cancellation was found to have accidentally removed `node-version: "22"` from the manual production-preflight Setup Node step. The final closeout commit restores that pin. This correction changes CI execution configuration only; it does not change runtime product authority.

## Dependency-risk boundary

The Mobile dependency gate remains fail-closed. Its temporary `image-size@1.2.1` acceptance is exact-version, exact-advisory, time-bounded, and fails on new findings, version drift, advisory disappearance, or expiration. The full rationale is recorded in `docs/security/mobile-image-size-risk-review-20260917.md`.

## Physical boundary

No new claim is made for physical-device-only behavior by this semantic review. Android GPS/background execution, native notifications, radio/RTC media behavior, Mapbox rendering on real hardware, and other physical evidence remain governed by their dedicated release/device gates.

## Decision

`023e5746cf6af6c16778a170fe05f710f5a50767` is accepted as the semantic authority checkpoint immediately before the final CI-only correction. The final candidate may differ from that checkpoint only by the reviewed workflow pin restoration and the audit checkpoint update in the same commit. The configured drift window and all AUTHORITY, RACE_LIFECYCLE, PLATFORM, INTEGRATION, CI_RELEASE, and PHYSICAL gates remain mandatory.
