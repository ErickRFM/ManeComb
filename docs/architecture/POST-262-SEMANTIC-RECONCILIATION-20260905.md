# Semantic integration reconciliation after #262

Reviewed main: `14cbb739e8554b7a1bca9a04cbf5cd0bf0a17b88`.
Previous baseline: `b56e13e0eba0018ffe53f0f3145100666e2e5355`.

## Why this reconciliation is required

Main System Audit run [33984182365](https://github.com/ErickRFM/ManeComb/actions/runs/33984182365) failed with baseline and authority-map drift of **14 commits**, above the existing maximum of **5**. The #262 branch preserved its individual commits when merged; its PR checks had evaluated freshness against the earlier main.

This review reanchors the two documents after reviewing the integrated changes. It does not increase either drift limit, remove a required gate, change severity policy, change ownership, resolve a known divergence, or certify physical behavior.

## Reviewed authority changes

| Integrated change | Authority and consumers | Semantic reconciliation |
|---|---|---|
| #260: Mobile session/Radio/Calls convergence and bottom spacing | Backend authenticates; Mobile owns the active client session epoch; the native Radio service owns operational Radio phase. React projects it. | Shared refresh is single-flight; rotated credentials reach native activation with an acknowledgement revision. Terminal auth invalidates queued work and stops reconnect producers. Call ownership still has precedence over Radio. The existing identity, mobile-session-runtime-identity, communication and RTC authorities remain applicable. Spacing changes presentation only. |
| #259: Chat authenticated media recovery | Existing Mobile HTTP/session boundary owns credential rotation and rejection; backend remains media authorization authority. | Media retries are bounded and session-scoped. Stale work cannot commit into another account. No independent media refresh authority, public media bypass or new persistence owner was introduced. |
| #261: Android Socket.IO self-origin | Backend realtime handshake guard; deployment configuration supplies the exact public origin. | `RENDER_EXTERNAL_URL` is normalized and admitted only in realtime, alongside existing trusted origins and native requests without Origin. Normal HTTP CORS is unchanged. Passing Origin never replaces token/session/user/tenant/role checks. No wildcard or shared global allow-list expansion. |
| #262: archived vehicle identity recovery | Backend fleet lifecycle and tenant/permission checks remain authoritative; Portal presents the existing lifecycle actions. | Conflict inspection includes retired records within the authenticated organization and excludes the current vehicle on update. Portal reveals archived entries and enables the existing guarded archive-removal action. Archive state comes from `retiredAt`; no new client deletion authority, direct database path, GPS ownership or Radio runtime change. |

Source review includes `mobile/src/store/root-store.ts`, `mobile/src/api/client.ts`, Radio/Calls overlays and native session controller, Chat media components, `backend/src/middlewares/production-origin-guard.js`, `backend/src/modules/vehicles/identity-conflict.js`, vehicle routes and the Portal unit screen/list. Their focused tests and the existing cross-layer validators provide automated evidence; prior physical observations are not substitutes for these contracts.

The merged range changes 45 files, including tests and documentation. #262 itself changes eight Backend/Portal/script files and **no Mobile files**. Version/build, published release assets, release workflow and AppConfig are unchanged by this reconciliation.

## Validation and retained limitations

- RED is the main run linked above and local `validate-system-audit-gates.mjs`: `14/5` for both baselines.
- The refreshed baseline must pass `validate-system-audit-gates.mjs`, `validate-system-authorities.mjs`, environment validation, focused Origin/vehicle identity tests, and the required PR CI/System/Dependency/Android checks before merge.
- This documentation-only PR has no new device behavior to certify. It does **not** set physical PASS for #108, #89 or #29.
- The ongoing campaign still has an ARM-only debug APK startup failure on the x86_64 emulator, residual Radio UI latency, an unclosed GPS freshness report, and an alert-lifecycle report requiring reproduction. These remain at their physical matrix checkpoints.
- Existing external Admin Global authentication/Access/MFA certification and other known divergences retain their prior status and severity. No unauthenticated probe proves the authenticated Admin matrix.
- Dependency Audit success remains subject to its existing policy and temporary exceptions; this review changes neither dependencies nor accepted-risk scope.
- Release `v1.3.0-build.22` remains historical and immutable. No build23, release dispatch or AppConfig publication is authorized by this baseline refresh.
