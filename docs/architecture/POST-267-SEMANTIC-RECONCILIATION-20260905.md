# Post-267 session integration review

Reviewed main: `ae100dc42c1007d597a23a6fbc530107eb2e2710`.
Previous baseline: `760ed37a6dfaf29f335e1eed81d8dc185986d0d3`.

The four-commit range consists of #266 (test-only cold React Native Jest
bootstrap plus its documented baseline review) and #267 (allowing the existing
public GET /health before interactive login). #267 does not authenticate a
health response, resume the boundary on health, admit protected operations or
allow stale responses. Only the existing successful new-session response resumes
the session boundary. Its functional regression covers exact method/path,
rejected login, unavailable health, stale epochs and protected requests.

Main CI 33993490082, System Audit 33993490048 and Dependency Audit 33993490066
completed successfully. On emulator API30, same bundled debug APK and same PID,
an actual terminal refresh 401 was followed by manual GET /health 200, login 200,
auth/me 200, map and connected/listening transports without restarting the app.
This proves the bounded re-login regression, not the whole physical matrix.

The same M02 checkpoint exposed a separate native-resource omission. Both a
terminal HTTP session clear and a normal visible logout removed root identity,
but the native Radio snapshot remained LISTENING/connected. App.tsx removes the
authenticated CallOverlay (which contains RadioLiveOverlay) when user disappears;
the latter's eligibility effect cannot clean up after it has been unmounted.
The existing native-session teardown observer cleaned notifications and FCM but
did not reset Radio. The fix adds Radio's existing reset command to that observer
at logout start, identity loss and settled unauthenticated bootstrap. Root-store
remains the sole identity authority. Radio activation also respects isSigningOut.
No reset is attached to screen navigation, ordinary rerenders or backgrounding.
The existing realtime UNAUTHORIZED projection and token-rotation path remain intact.

The new functional test drives authority transitions without mounting an overlay,
uses the real Radio store, and covers early logout, identity loss, settled
bootstrap, queued old publications and subsequent activation. Negative cases
preserve token rotation, transient network and realtime terminal projection.
The existing overlay convergence suite additionally rejects activation during
pending logout. Six new assertions failed before the fix; all focused tests pass
after it. Native code, authentication endpoints, CORS, GPS and release authority
are unchanged.

Reanchor both metadata baselines to reviewed main so the next one-commit branch
and normal merge do not exceed 6/5. Neither maximum of 5 changes; all 32 authorities,
seven products, six known divergences and required gates remain unchanged. No
architectural divergence is declared resolved by updating this baseline.

Physical acceptance remains pending on the new integrated main debug. The manual
reset used to contain the observed orphan is explicitly NOT a physical fix PASS.
M02 remains open, including terminal map notice, shared banner inset and the user's
new login-keyboard report. Keyboard is a separate cause/PR; Chat is reported OK.
Radio performance, GPS freshness, alerts and the rest of the matrix are not passed.
Release 22, its assets, AppConfig, version/build and release dispatches stay frozen;
#108/#89/#29 remain open and final RTC/TURN still requires two physical Androids.
