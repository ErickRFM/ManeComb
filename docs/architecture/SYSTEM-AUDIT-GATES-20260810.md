# ManeComb — Cross-layer System Audit Gates

**Baseline:** `main@2d02c857507ccf54fb8058aa94e273b2166767f9`  
**Captured:** 2026-08-10  
**Scope:** architecture, integration, release and physical-device certification.  
**Rule:** green CI is necessary, never sufficient by itself for a P0/P1 cross-layer change.

## 1. Canonical defect record

Every meaningful system defect must be documented with the same evidence shape:

```text
SYMPTOM
What the user saw or what failed.

ROOT CAUSE
What was actually wrong.

WHY IT HAPPENED
Which architecture, integration decision, stale assumption or missing contract allowed it.

SOLUTION
What changed and which authority now owns the behavior.

REGRESSION
Which automated test, invariant or guard prevents recurrence.

PHYSICAL GATE
Which behavior still has to be proven on the real device/runtime.
```

A fix is incomplete when it only removes the symptom. The root cause, authority and regression must be explicit.

## 2. Six mandatory gates

### AUTHORITY

Question: **Who owns this state or decision?**

Audit for duplicated stores, frontend re-derivation of backend policy, native/JS competing authorities, stale compatibility fallbacks, independent timers, parallel permission tables and multiple sources of release configuration.

A consumer may normalize or present a decision. It must not silently become a second authority.

### RACE / LIFECYCLE

Question: **What happens if events arrive together, late, repeated or out of order?**

At minimum test duplicate delivery, reconnect boundaries, app foreground/background transitions, process restart, stale acknowledgements, delayed push, cache expiry, repeated taps, rapid screen transitions and multi-device ownership.

A happy-path unit test does not close this gate.

### PLATFORM

Question: **Do Android, iOS, web and backend interpret the same contract?**

Platform-specific SDK identifiers, notification behavior, file viewers, deep links, Mapbox layers, secure storage, audio focus, permissions and lifecycle semantics must be checked against the SDK/runtime actually installed in the repository.

Do not assume JSX order, web behavior or Android behavior automatically carries to iOS.

### INTEGRATION

Question: **Does the module remain correct when it touches the rest of ManeComb?**

Exercise the real boundaries: auth, tenant isolation, capabilities, sockets, Redis, cache, rate limits, storage, FCM, Mapbox, media, retries, offline state and deep links.

A subsystem can be locally correct and still fail when two otherwise-correct layers meet.

### CI / RELEASE

Question: **Does CI certify exactly what will be installed or deployed?**

The artifact is part of the product. A compile-only green build is insufficient if the installed APK can lack its JS bundle, runtime environment, Mapbox configuration or production routing contract.

Any new commit invalidates artifact evidence tied to an older head SHA.

### PHYSICAL

Question: **What remains unprovable without the real device or runtime?**

Use a physical gate for audio distinguishability, notification-channel behavior, vibration, lockscreen privacy, Android lifecycle, background execution, gestures, scroll momentum, font scaling, safe areas, real Mapbox rendering, camera fitting, permission prompts and release APK behavior.

A physical-only bug must produce a regression guard wherever its root cause can be encoded afterwards.

## 3. Defect families that must be searched deliberately

The audit is adversarial. Do not wait for the user to discover the next visible bug. Search for:

- authority drift and duplicated state;
- lifecycle and event-order races;
- backend/frontend/native contract divergence;
- tenant, capability and privacy leaks;
- cache that writes but is not read, or retry that bypasses cache;
- rate limiting that treats media like ordinary API traffic;
- notification TTL, dedup and transport-priority mismatch;
- scroll, gesture, overscroll and responsive-layout races;
- Mapbox style-graph/layer-order assumptions;
- Android/iOS SDK identifier differences;
- release configuration that differs from local development;
- CI that validates structure but not freshness;
- tests that assert source strings instead of runtime behavior;
- configuration or state that survives upgrades differently than clean installs;
- behavior that passes emulator/tests but fails on a physical device.

## 4. Findings captured by the initial audit and current status

### SYS-GATE-001 — `main` branch protection (resolved 2026-08-17)

GitHub ruleset `20485564` (`Protect main`) now targets the default branch with active enforcement and no bypass actors. The branch API reports `main.protected=true`.

**Classification:** release-governance P1, resolved.
**Owner:** GitHub repository configuration.  
**Enforced outcome:** Pull Request required, latest-base checks required, review threads resolved, deletion and force-push blocked, and the canonical CI, System Audit and Dependency Audit contexts required. The signed-commit rule remains conditional on first configuring and validating a real owner signing key; unsigned automation commits are not represented as verified.

The exact certified configuration and required contexts are recorded in `docs/architecture/GITHUB-MAIN-RULESET-20260817.md`.

### SYS-GATE-002 — authority-map freshness validation (resolved)

The initial audit found a stale authority baseline and no freshness enforcement. The current `System audit gates` workflow now checks ancestry and bounded drift for both audit contracts, while `validate-system-authorities.mjs` pins closed divergences so they cannot be silently reintroduced.

The semantic authority map was refreshed again against `main@d6dd194d431b5264e78dd57e3235c8e30213a48b` after the final Portal, communication and operational integration. The repository-governance P1 was removed only after GitHub independently reported `main.protected=true` and returned the required rules.

The map and gate baseline were reviewed through `main@3a222f666b1b0d8c1009bfd4d8284a740e0ffad1` after #217. The intervening delta preserves the existing commercial authority and makes cancellation a single CAS transition: concurrent requests produce one audit/effect, retries remain idempotent, capacity downgrade remains a 409, and onboarding remains a read-only projection rather than billing authority.

The map and gate baseline were reviewed through `main@00b41b777433df2356f5e6ca9a139703b82558f9` after #220 and #219. Activation-key history remains a Portal projection over the existing activation-key authority. OLA 8 preserves primary-operation authority while failing closed when configured distributed rate limiting is unavailable, rebinding push installations to the current identity, and issuing short-lived provider download URLs. The post-merge focused regressions and full PR matrices passed; physical platform evidence remains `ACCEPTED_PENDING`.

**Classification:** audit-integrity P1, resolved.

### SYS-GATE-003 — PR #97 could be green and still lose or duplicate an alert (resolved)

The alert-feedback branch is a useful example of why these gates exist.

Confirmed cross-layer blockers on its current head:

1. The FCM operational-alert renderer returns immediately when Android reports the app in foreground. If Socket.IO is reconnecting or the realtime event is lost at that boundary, neither path is guaranteed to deliver the SOS feedback.
2. Non-call FCM currently inherits the general 24-hour TTL while native dedup is an in-memory 8-second window. A delayed push, process restart or long reconnect can alert again for the same incident.
3. The public lockscreen version still uses the real alert title. `PRIVATE` protects the body, but the public title can still disclose incident information instead of a generic redacted label.
4. Foreground feedback uses `MediaPlayer` and `Vibrator` directly. This can bypass user choices made for the corresponding Android NotificationChannel, so background and foreground policy are not truly equivalent.
5. `warning` incidents use category `incident` and level `warning`; the FCM transport marks HIGH only critical/call/chat/SOS/emergency. Warning therefore falls back to NORMAL transport priority despite its high-priority UX policy.
6. Socket wiring has source-string assertions. Those guards prove text is present, not that reconnect/foreground races behave correctly.

**Resolution:** #97 was corrected and merged with the behavioral gates described above. The remaining real-device alert/restart evidence stays tracked in #29 and is not represented as an automated PASS.

## 5. Parallel work without collisions

Parallelism is allowed only when ownership is explicit.

**Audit lane — `audit/system-gates-*`:** architecture evidence, CI/audit guards, issue tracking, cross-layer review. Do not modify feature behavior while another feature branch owns it.

**Feature lane — `codex/*`, `claude/*`, `fix/*`, `feat/*`:** one bounded functional problem, its regression tests and its physical matrix. Reconcile with current `main` before certification.

**Integration lane:** only after feature gates pass. It reconciles already-reviewed heads; it does not invent fixes while integrating.

Never repair the same source file simultaneously from two lanes. If an audit finds a bug in an owned feature branch, report it as a review blocker and let that lane implement the fix, unless ownership is explicitly transferred.

## 6. Merge policy

A PR that changes P0/P1 cross-layer behavior must remain Draft until:

- the authority is identified and not duplicated;
- race/reordering/reconnect cases are tested behaviorally;
- Android/iOS/web/backend differences are resolved or explicitly scoped;
- integration contracts are exercised across the touched boundaries;
- CI is green on the exact final head SHA;
- the installed/deployed artifact is the one CI certified;
- every declared physical gate has PASS evidence;
- a new commit after certification causes the affected evidence to be rerun.

A green checkmark is evidence for one gate. It is not a release decision by itself.

## 7. Rotating system check

The permanent audit should rotate through these surfaces instead of repeatedly reviewing only the last bug:

1. Auth/session/account channel/capabilities and tenant boundaries.
2. Notifications/FCM/deep links/privacy/dedup/TTL.
3. Socket reconnect, offline reconciliation and stale state.
4. RTC and Radio ownership, media lifecycle, cache and rate limiting.
5. GPS/routes/journeys/Mapbox rendering and platform differences.
6. Documents/native viewers/storage and authorization.
7. Commercial subscription/payment/trial/account activation authority.
8. Web responsive behavior, routing and production Cloudflare contracts.
9. Android/iOS native permissions, background services and upgrade behavior.
10. CI, environment contracts, release artifacts, deployment configuration and physical certification.

The objective is not "zero bugs found by tests." The objective is that every important decision has one authority, every cross-layer assumption is explicit, and every critical behavior has both automated and real-runtime evidence.
