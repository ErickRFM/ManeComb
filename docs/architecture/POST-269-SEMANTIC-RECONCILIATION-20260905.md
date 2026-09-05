# Post-269 integration review

Reviewed main: `7a8c015756204f8b9e322fbedec777fbdd0e3806`.
Previous baseline: `ae100dc42c1007d597a23a6fbc530107eb2e2710`.

The four-commit range consists of #268 and #269 plus their normal merges.
#268 adds Radio reset to the existing native identity teardown observer at
logout start, identity loss and settled unauthenticated bootstrap. Its overlay
also rejects activation while isSigningOut. Root store remains the only identity
authority; Radio reset remains the only native teardown command. Existing
refresh/UNAUTHORIZED projection, notification cleanup timing, native transport,
CORS, tenant and RTC authority are unchanged. Tests exercise the real Radio store
without a mounted overlay, queued stale publications and new-session activation.

#269 opts only login into the existing keyboard controller's bottomOffset using
AppTheme.spacing.lg. The shared wrapper exposes the optional prop but does not
change defaults. Registration and Chat retain their existing keyboard semantics.
There is no new layout container, dependency, native configuration or auth path.
Both PRs merged with 28 required executions and all 30 checks green, including
Ready physical policy. They explicitly accept pending integrated-debug proof;
neither is a physical certification or Release approval.

The integrated main debug has embedded production JS, both ARM64/x86_64 native
libraries, Mapbox gate PASS and the same debug signing authority. On emulator
API30, focused password clearance changed from -18px to +40px, with the entire
field visible. Xiaomi was disconnected before its update preflight, so its
installed artifact remains the earlier main. The current M02 retest also found
that login Next focuses password but hides the IME: the existing single-line
TextInput defaults to blurAndSubmit. The focused fix passes submitBehavior=submit
only from login identity through AuthField and the existing getTextInputProps.
Password Done, registration, Chat, validation and authentication remain unchanged.
Its regression fails before the fix and verifies native-prop forwarding, password
focus once and no readiness/login request after it.

Reanchor metadata to this reviewed main; retain both maximum drift limits of 5,
all 32 authorities, seven products, six known divergences and every required gate.
This does not resolve any recorded architectural divergence. Physical Radio
teardown, terminal map/shared-shell notice, Xiaomi keyboard and enlarged-label
behavior remain pending or failing at M02. GPS, alerts, Radio performance/PTT and
the remaining matrix are not passed. Release22/assets/AppConfig remain frozen;
no build23 or release dispatch, and #108/#89/#29 remain open.
