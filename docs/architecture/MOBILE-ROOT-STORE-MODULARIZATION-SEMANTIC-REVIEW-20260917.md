# Mobile root-store modularization semantic review — 2026-09-17

## Candidate reviewed

- Reviewed product-code candidate: `8f264c169a13ddf05d6ca1383b3dff724fd14f8a`.
- Production base: `eabbf91b0ac7088573be0902480804618da9cb98` (`main` when this refactor was rebuilt).
- Scope is Mobile only. No backend endpoint, Socket.IO event, native permission, data model, navigation or UI contract is intentionally changed.

## Authority review

The refactor reduces implementation coupling without introducing a second state authority.

- `useAppStore` / `root-store.ts` remains the single public Mobile Zustand authority.
- Session invalidation remains owned by `session-epoch.ts`; its ordering around refresh/logout is unchanged.
- `persistent-storage.ts` remains the generic timeout-safe web/native storage I/O authority introduced on current main.
- `runtime/session-storage.ts` only defines the semantics and keys for token, refresh token and remembered connection mode over that existing storage port. It is not a second credential/session manager.
- Mobile appearance authority remains `use-app-theme.ts` + `theme-preference.ts`, matching `system-authorities.json`. The preferences slice preserves the public store action but does not replace the active account-scoped hook authority.
- `@shared/resource-state` remains the ResourceState semantics authority. The new resource-refresh projection delegates to its existing begin/complete/fail transitions rather than redefining them.
- Socket.IO, GPS/background location, offline queue replay, chat/E2EE and push lifecycle remain in their current authorities and are not moved in this phase.

## Lifecycle and race review

- Identity teardown still increments the existing session epoch before stale asynchronous work may commit.
- Persisted session reads/writes are routed through the existing storage implementation; token/refresh/mode ordering is covered by focused tests.
- The session storage runtime has no Zustand import and cannot mutate identity directly.
- Preference writes remain account-scoped; anonymous appearance remains light and the compatibility slice rechecks ownership after async persistence.
- Resource refresh preserves the prior distinction between initial loading and refreshing previously successful data.
- A newly added test initially assumed that all refreshing resources set `isRefreshing=true`; CI correctly rejected that assumption. The test was corrected to match the canonical `@shared/resource-state` behavior without changing product implementation.

## Integration review

- No API route names or request payload contracts changed.
- No socket event names, socket ownership or reconnect policy changed.
- No offline queue operation type/shape changed.
- No GPS/location submission behavior changed.
- No E2EE key generation, backup or message envelope behavior changed.
- Existing `native-session-lifecycle.ts`, `persistent-storage.ts` and shared browser storage from current main are reused instead of duplicated.
- Architecture guards reject extracted `store/runtime` and `store/slices` modules importing `root-store` or `use-app-store`.

## Verification evidence on candidate

- Mobile typecheck: PASS.
- Mobile lint with zero warnings: PASS.
- Mobile Jest on the primary runner: **136/136 suites, 763/763 tests PASS**.
- Mobile Jest portability gate on Windows: **136/136 suites, 763/763 tests PASS**.
- Mobile production dependency audit: PASS.
- Backend, Infrastructure, Admin Global, Ventas and Communication Service jobs on the candidate run: PASS.
- Android debug APK certification is an exact-head merge gate and remains required before final integration. This semantic review does not convert a pending Android job into a physical/native PASS.

## Physical boundary

No Kotlin/Java native implementation, Android permission, Mapbox native integration, FCM native implementation, Radio native runtime, microphone/call path or background GPS service is modified by this phase. CI can certify build/package integrity, but this review makes no new real-device behavioral claim.

## Result

`8f264c169a13ddf05d6ca1383b3dff724fd14f8a` is accepted as the semantic authority checkpoint for the first safe root-store modularization cut. Subsequent documentation-only checkpoint commits do not change product behavior. Any further domain extraction must retain the same single-authority rules and re-run the configured gates.
