# Post-265 integration and cold Windows test review

Reviewed main: `760ed37a6dfaf29f335e1eed81d8dc185986d0d3`.
Prior baseline: `14cbb739e8554b7a1bca9a04cbf5cd0bf0a17b88`.

## Scope and retained authorities

The four-commit range contains #264's documented semantic reconciliation and
#265's native-map terminal notice. #264 changed audit metadata/documentation,
not runtime. #265 adds a consumer of the existing `socketStatus` authority:
the native map bypasses AppShell, so it now mounts the existing ConnectionBanner
for terminal auth outside its content/selector/recovery branches. Copy and
signOut are reused; cached data does not decide whether authentication is valid.
The overlay stays outside layout flow and below the safe-area inset. It does not
modify session epochs, refresh, native Radio/Calls, GPS freshness or map ownership.

The current test-only correction bootstraps React Native's existing Jest native
primitives when the media suite loads. Native getters previously triggered cold
transformation inside the first auth test's five-second budget. Main CI
[33989842849](https://github.com/ErickRFM/ManeComb/actions/runs/33989842849)
failed that test with a 5000ms timeout; 704 other tests passed. Local cold timing
isolated approximately 4245ms in first render and 26ms in error/refresh work.
Eager primitive bootstrap reduced the same first render to 14ms; the uninstrumented
suite also passes with an explicitly stricter local 1000ms budget (first case 29ms).
The committed test keeps the default 5000ms limit, all assertions, real apiClient
recovery and the same Jest native mocks. There is no production Chat change.

## Baseline reconciliation

Current main is 4/5 commits from the previous baseline. Another one-commit branch
plus normal merge would produce 6/5: PR checks alone compare against pre-merge
main and would miss that post-merge failure. The two baselines are reanchored to
the reviewed main above as part of closing this integration gate. Neither drift
maximum changes. All seven products, 32 authorities, six known divergences,
severity policies and required gates are unchanged. This is not evidence of
resolving any known architectural divergence.

## Physical boundary

On the previous integrated debug, actual expired access on Xiaomi yielded one
refresh HTTP 200, one rotation and native reactivation; revoking only the emulator's
current test session via the normal account API yielded one refresh HTTP 401 and both
transports terminal without a reconnect loop in a bounded follow-up observation.
Those observations do not certify the corrected map notice: #265 remains
ACCEPTED_PENDING until its integrated-debug UI retest at M02. The Windows test
bootstrap and this documentation need no new device behavior to prove, but cannot
convert #265 or the campaign to physical PASS.

Radio performance, GPS snapshot freshness, alerts and the remaining product
matrix stay open. #108/#89/#29 remain open; final RTC/TURN still needs two physical
Android devices. Release 22, assets, version/build, AppConfig and release workflows
are unchanged. No release dispatch, build 23 or backendPatch is part of this work.
