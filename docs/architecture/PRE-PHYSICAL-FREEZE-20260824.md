# ManeComb pre-physical freeze — 2026-08-24

This record freezes the semantic review performed before the final physical-device campaign. It does not claim that Android hardware, production credentials, real MFA, FCM delivery or TURN relay have passed.

## Audited base

- Repository: `ErickRFM/ManeComb`
- Audited branch: `origin/main`
- Audited SHA: `f092fc3df900b94d49b6032400d5ef2ac9a1752c`
- Previous audit baseline: `fd8528956d613411abbe0deed01e9a9f7e8726e4`
- Open PRs at capture: `0`
- Open issues at capture: `#29`, `#89`, `#108`
- Recent `main` workflows: CI PASS, Dependency audit PASS, Ventas deployment freshness PASS, System audit FAIL only because the audit/authority baselines exceeded the five-commit drift limit.

The five-commit thresholds and all required gates remain unchanged.

## Baseline-to-main commit classification

| Commit | Classification | Semantic result |
|---|---|---|
| `6d601928` | Infrastructure/deployment marker | Forces a Pages rebuild; no runtime or authority decision. |
| `2ca6e233` | Governance | Moved the audit SHA to the then-current reviewed base; did not change gates or thresholds. |
| `231188c8` | Governance | Moved the authority-map SHA/phase only; did not change an authority entry. |
| `63537d45` | Infrastructure/CI | Added exact-commit freshness verification for `manecomb.com`; no product authority change. |
| `30442819` | Merge metadata | PR #230 integration commit. |
| `1e8c4f7c` | UI/presentation | CSS-only map-first Portal workspace; no data, API or authorization contract. |
| `fbf4bb91` | UI contract test | Presentation guard only. |
| `3fd4c9d2` | Infrastructure/deployment marker | Records the map-first deployment revision. |
| `e4132b57` | Infrastructure/deployment marker | Temporary duplicate release marker. |
| `b63d1769` | Infrastructure cleanup | Removed that duplicate marker. |
| `c8790ed5` | UI/presentation | CSS-only KPI readability correction. |
| `3ba8eb09` | UI contract test | KPI grid presentation guard. |
| `698c723a` | Infrastructure/deployment marker | Retriggered final Portal validation. |
| `f092fc3d` | Merge metadata | PR #231 integration commit. |

No commit in this window changed backend behavior, Mobile behavior, a public contract, tenant ownership, authentication, RTC authority, navigation authority or Platform RBAC. The authority map therefore preserves all unchanged owners and only records the status/evidence clarifications below.

## Authority decisions

| Authority | Decision | Evidence and remaining boundary |
|---|---|---|
| `capabilities` | `CANONICAL` | Backend owns and emits the explicit capability set; protected routes enforce it; Portal and Mobile consume it before limited legacy-session fallbacks. Platform capabilities are also backend Platform RBAC output. |
| `communication-events` | `PARTIAL` justified | Provider delivery lives in `communication-service`; realtime Chat/Radio/RTC contracts span backend sockets and `shared/communication`. The installed backend package and cross-product tests make this safe for physical testing, but one versioned event/ACK/retry catalog is still required for closure. |
| `api-errors` | `PARTIAL` justified | Central error containment and trace IDs exist, but route-specific envelopes remain and Admin Global collapses errors to a message. Critical auth/session/429 behavior is explicitly tested; a shared versioned error envelope remains future closure work. |
| `navigation` | `TRANSITIONAL` justified | Canonical journeys coexist intentionally with legacy `/navigation` sessions and `pending:*` offline reconciliation. Backend transition/tenant/concurrency checks remain authoritative. Closure requires removal of the legacy path after persisted sessions are reconciled. |
| `platform-access` | `EXTERNAL_CONFIGURATION_PENDING` | Access/DNS/enforcement/CORS are observable; authenticated Platform + real MFA + production `platform_owner` remain unprovable without credentials and must stay open under #29. |

No new blocking P0/P1 code inconsistency was found.

## Production configuration classification

Evidence was captured without credentials or secret values.

| Surface | Item | Classification | Evidence / next gate |
|---|---|---|---|
| Admin Global | `admin.manecomb.com` DNS and Access | `READY` | Unauthenticated request reaches the named Cloudflare Access application. |
| Admin Global | `admin-api.manecomb.com` Access | `READY` | Unauthenticated Platform request is intercepted by Cloudflare Access. |
| Admin Global | Render Access enforcement, issuer/audience/JWKS wiring | `READY` (observable) | Direct Render Platform request returns `403 Acceso privado requerido`; production startup is fail-closed on incomplete Access configuration. Values remain hidden. |
| Admin Global | CORS | `READY` | Preflight from `https://admin.manecomb.com` returns `204` and the exact origin/header contract. |
| Admin Global | Platform MFA and `platform_owner` | `EXTERNAL_PENDING` | Requires authenticated production evidence; no PASS inferred. |
| FCM Android | Firebase native wiring | `READY` | Messaging dependency, service, manifest metadata and manual/`google-services.json` paths are versioned. |
| FCM Android | `applicationId=com.anonymous.combiscontrol` | `LEGACY` | It is the current installed identity. Renaming it requires an explicit Firebase/store migration and is not safe as a closure-only refactor. |
| FCM Android | `MANECOMB_REQUIRE_FCM=1` release gate | `READY` | The release builder refuses an APK without Firebase public configuration. |
| FCM backend | Service-account configuration/delivery | `EXTERNAL_PENDING` | Code and tests exist, but production credentials/delivery cannot be proved through the public readiness response. |
| TURN | Backend config/readiness authority | `READY` | One service owns static/dynamic TURN config; `/api/rtc/config` is authenticated and STUN-only is reported as not ready. |
| TURN | Production relay | `MISCONFIGURED` / `EXTERNAL_PENDING` | Public readiness reports degraded `rtc`; no relay PASS exists. Configure TURN and capture a CDR with `usedRelay:true`. |
| Ventas/Portal | Cloudflare deployment freshness | `READY` at audited base | `https://manecomb.com/build-meta.json` served `f092fc3d...`, matching audited `main`. |
| Portal | Authenticated roles/real-data matrix | `EXTERNAL_PENDING` | Requires production accounts and controlled fixtures. |
| Backend | Deployed source identity | `SOURCE_EQUIVALENT` / `DEPLOYMENT_IDENTITY_PENDING` | Runtime reports `4002d10c...`; the diff to `f092fc3d...` contains only Ventas files, so deployed backend/mobile/shared sources are identical. The exact-commit production preflight still fails closed until Render reports the frozen SHA. |
| Portal + Backend | Exact production preflight | `EXTERNAL_PENDING` | Portal build metadata matches `f092fc3d...`, but the certification target requires Portal and Render to report the same requested SHA. The 2026-08-24 preflight correctly rejected Render's older monorepo identity; source equivalence is not relabeled as an exact deployment PASS. |

## Issue #108 code evidence

PR #111 remains in `main`. The reviewed paths still provide separate anonymous/authenticated/API media budgets, auth-specific limiters, `Retry-After`, no automatic login/register retry, recoverable 429/5xx/network bootstrap behavior, terminal real 401/`ACCOUNT_SUSPENDED`, non-replayed refresh rotation and single-flight refresh/`refreshAll()` coordination.

Required state after final integration:

```text
CODE_FIX_MERGED
AUTOMATED_REGRESSION_GREEN
PHYSICAL_LONG_SESSION_PENDING
```

## Issue #89 code evidence

Backend remains the live RTC and room/call authorization authority. `/api/rtc/config` is authenticated and capability-protected. Tenant-scoped CDR, `usedRelay`, distributed leases, push/background delivery, CallStyle/lockscreen cleanup, idempotent peer/media/foreground-service cleanup and reconnection ownership remain in code and tests.

Production is currently STUN-only/degraded according to public readiness. Keep #89 open as `EXTERNAL_CONFIGURATION_PENDING` plus physical two-device/TURN evidence.

## Scoped pending-code pass

| Finding | Classification | Decision |
|---|---|---|
| No runtime `TODO`/`FIXME` | Intentional absence | No action. |
| GPS three-state projection and journey timing/session fields | Compatibility | Derived from canonical state and retained for consumers/records in migration. |
| Mobile call adapters under `mobile/src/features/calls` | Compatibility | Re-export `shared/communication`; not a second implementation. |
| Communication delivery legacy idempotency normalization | Compatibility | Keeps historical records readable; new records use the current contract. |
| Auto-route V2/V3 flags | Intentional | V3 segment learning ships dark; V2 remains proven authority until an explicit physical gate enables V3. |
| Device-global theme path in `root-store` | Non-blocking debt | Current account-scoped hook is authoritative; P2 residue already tracked, not changed during freeze. |
| Legacy Portal callback props | Non-blocking debt | Dead compatibility surface, no runtime authority or physical-test blocker. |
| Temporary Mobile dependency acceptance | Time-bounded debt | Pin is fail-closed and expires 2026-09-15; any advisory/version drift fails Dependency audit. |
| Historical remote branches | Superseded/dead | No open PR exists. Representative orphan branches are replaced on `main` by PR #120 (route-plan authority), #126 (panel bounce), #172 (avatar), #93 (radio 429), current physical gate and later Portal map-first work. No current functional patch was identified for merge. |

`scripts/validate-operational-legacy-retirement.mjs` passes; no retired operational projection/socket authority was reintroduced.

## Local automated evidence

The following gates were rerun from the audited base plus this governance-only closure patch:

| Product/gate | Result |
|---|---|
| Backend | `npm test` PASS, including Platform Access/MFA/RBAC, tenant boundaries, journeys, RTC, radio, communications, FCM, rate-limit and session regressions. |
| Communication Service | Standalone package tests PASS. |
| Mobile | Version, TypeScript and zero-warning lint PASS; Jest `109/109` suites and `618/618` tests PASS. |
| Android | Debug unit tests PASS; standalone bundled debug APK PASS; embedded bundle and Mapbox artifact certification PASS. Local debug APK SHA-256: `75997F3F19F488AD33277675957D4A5BFD8F5BBA7794F80CB8A60871EFD1543F`. |
| Android Release | Not claimed. The local production env intentionally lacks the Firebase/Mapbox/signing inputs required by the fail-closed Release builder. Generate and hash one Release from the final post-merge SHA before device certification. |
| Ventas/Portal | TypeScript, all contract gates and production build PASS. Local Playwright certification: `73` PASS, `32` intentional non-target-viewport skips, `0` failures across `105` scheduled cases. |
| Admin Global | TypeScript, contract/UX tests, production build/private-host smoke and Wrangler `4.119.0` deployment dry-run PASS. |
| Dependency audit | Backend, Communication Service, Ventas and Admin Global report zero runtime vulnerabilities. Mobile passes only through the existing fail-closed, version-pinned acceptance for four reviewed `image-size`/`nanoid` advisories expiring 2026-09-15. The runner was corrected to invoke npm portably on Windows without changing the acceptance policy. |
| Global governance/security | Authority map, audit drift contract, environment contract, production security, Render blueprint, repository hygiene, operational legacy retirement, physical-gate tests and `git diff --check` PASS. |
| Containers | Local Docker CLI unavailable. Compose config, image build and container smoke remain mandatory in GitHub's `Infrastructure validation` job before merge. |
| Production identity | Exact preflight remains `EXTERNAL_PENDING`: Portal reports the audited SHA; Render reports a source-equivalent but older monorepo SHA. |

## Certification boundary

Automated/code certification may be declared only after the closure PR and post-merge rerun are green. External configuration and physical-device checks remain governed by issues #29, #89 and #108 and by `docs/PRE-PHYSICAL-DEVICE-MATRIX-20260824.md`.
