# ManeComb system closeout semantic review — 2026-09-17

## Candidate reviewed

- Reviewed authority/UI candidate: `aacbf2052079a65c205f8da7f117d0f3fac4c65c` (`ui/portal-collapsible-sidebar`, PR #291).
- Base authority before UI candidate: `fe0ec43dff528eca19599630038daa4e128ef21d` (merged PR #289).
- Review purpose: re-establish a fresh authority baseline before release-gate and production closeout work.

## Authority conclusion

The reviewed candidate does not move business or data authority away from the existing backend/shared contracts. Its production changes are presentation-focused in Portal/Admin Global plus a backend test stabilization. It does not introduce a new store, API, permission table, GPS authority, Socket.IO connection authority, route-session authority, payment authority, or persistence authority.

The following authorities remain unchanged:

- Backend owns authentication, tenant membership, capabilities/permissions, subscription/commercial state, operational units, GPS ingestion, journeys, incidents, documents, notifications, chat/radio/RTC coordination, and persistent writes.
- Mongo remains the persistent system of record for production state.
- Redis/BullMQ remain runtime coordination/queue infrastructure where configured; they do not replace Mongo business authority.
- `shared/operational-contract` remains the cross-client operational snapshot contract.
- `shared/communication` remains the shared browser/mobile communication contract.
- Portal and Mobile consume backend authority and reconcile realtime events; neither becomes a second system of record.

## Race/lifecycle review

No candidate production change alters session epochs, socket authentication, reconnect policy, route-session reconciliation, GPS ordering, offline synchronization, or teardown authority. The UI changes consume the pre-existing state and therefore do not add a new late/repeated/out-of-order event path.

## Platform/integration review

The candidate keeps the established surfaces separated:

- Ventas/Portal remains the company web surface.
- Mobile remains React Native CLI with Mapbox.
- Admin Global remains its isolated application behind Platform auth/Cloudflare Access.
- Backend routes and shared runtime contracts are unchanged by the visual candidate.

## CI/release finding

The existing system-audit validator could certify a pull request against `origin/main` instead of the exact merge candidate, hiding candidate drift until after merge. The closeout changes therefore make `HEAD` the single freshness reference. This tightens the gate; it does not relax the five-commit drift limits or P0/P1 blocking severities.

The Portal production certification failures observed on PR #291 are not authority drift. The failing public Playwright contract still searched for historical accessible copy (`Registrarse`, `Seleccionar plan 2 combis`) while the intended current UI exposes `Crear cuenta` and `Ver plan 2 combis`. The closeout fixes the stale certification contract instead of changing business logic to satisfy obsolete locators.

## Physical boundary

No new claim is made for physical-device-only behavior by this semantic review. Android GPS/background execution, native notifications, radio/RTC media behavior, Mapbox rendering on real hardware, and other physical evidence remain governed by their dedicated release/device gates.

## Decision

`aacbf2052079a65c205f8da7f117d0f3fac4c65c` is accepted as the fresh semantic authority baseline for this closeout. Any subsequent commit must remain within the configured drift window and is still subject to the full AUTHORITY, RACE_LIFECYCLE, PLATFORM, INTEGRATION, CI_RELEASE, and PHYSICAL gates.
