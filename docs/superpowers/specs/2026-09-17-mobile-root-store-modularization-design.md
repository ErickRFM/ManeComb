# Mobile root-store modularization design

Date: 2026-09-17
Status: Design approved in chat; implementation pending review of this written spec
Branch: `refactor/mobile-root-store-modularization`
Scope: `mobile/` only

## Problem

`mobile/src/store/root-store.ts` is currently ~127 KB and owns too many independent responsibilities at once: authentication/session lifecycle, SecureStore persistence, Socket.IO lifecycle and auth recovery, network state, offline queue/sync, operational resources, GPS/location submission, incidents, chat/E2EE, notifications, route sessions, documents, users, theme and bootstrap orchestration.

The store is protected by a strong set of tests and already delegates several policies to leaf modules (`session-epoch`, `shared-realtime-socket`, auth failure policy, route-session reconciliation, storage helpers, resource state policies). The problem is therefore not lack of tests or immediate functional breakage; it is change radius and coupling. A modification in one domain can require reasoning about unrelated lifecycle, realtime and persistence paths.

## Goals

1. Preserve current runtime behavior and public `useAppStore` API while reducing internal coupling.
2. Keep one authoritative Zustand store during the migration so selectors, subscriptions, session teardown and current screen contracts do not change at once.
3. Extract domain state/actions into focused slices and extract side-effect-heavy infrastructure into services/controllers.
4. Preserve the existing single authorities for identity/session epoch, realtime socket ownership, operational-unit projection and resource state.
5. Make each domain independently testable without importing the entire mobile runtime.
6. Make the migration incremental and reversible, with characterization/contract tests at each boundary.

## Non-goals

- No UI redesign.
- No endpoint contract changes.
- No backend changes.
- No data model redesign.
- No replacement of Zustand.
- No immediate conversion to many independent global stores.
- No new event bus unless an extracted boundary demonstrably needs one.
- No rewrite of working E2EE, GPS, Socket.IO or offline algorithms merely to move files.

## Architectural decision

### Keep one public store, compose it from internal modules

`useAppStore` remains the public state contract during this refactor. Internally it will be assembled from focused slices and runtime services.

Target direction:

```text
screens / hooks / observers
          |
          v
     useAppStore
   (public facade)
          |
  +-------+-------------------------------+
  |       |        |        |             |
 session resources chat   incidents   preferences
 slices   slices   slice    slice         slice
  |       |        |        |             |
  +-------+--------+--------+-------------+
                  |
            runtime services
                  |
   +--------------+------------------------------+
   |              |              |               |
 session       realtime       sync/offline     notifications
 storage       controller      coordinator      bridge
                  |
                API/native adapters
```

This is intentionally safer than creating a separate Zustand store per feature. Multiple global stores would immediately introduce cross-store ordering, teardown and consistency problems around login/logout, reconnect, refresh and offline replay. The first refactor should reduce implementation coupling without changing the consistency model.

## Source-of-truth rules

The following authorities must remain singular throughout the migration:

- Authenticated identity: `useAppStore` session slice.
- Session invalidation: existing `session-epoch` mechanism.
- Shared Socket.IO instance/lifecycle: one realtime controller; callers may observe/use it but may not create competing sockets.
- Operational unit truth: `operationalUnits` remains the canonical backend projection for unit/driver/route/GPS/ETA facts.
- Network reachability: network runtime/connection slice.
- Socket connectivity: realtime controller/socket status.
- Sync state: sync coordinator/queue state.
- Resource loading state: existing resource-state contract.

Network, socket and sync status must stay separate because they describe different facts.

## Proposed module boundaries

The file names below are target boundaries; implementation may reuse existing leaf modules where they already satisfy the responsibility.

### `store/root-store.ts`

Final responsibility:

- create the Zustand store;
- compose slices;
- wire runtime services to store ports;
- export `useAppStore`, `AppState` and compatibility helpers;
- contain no domain algorithms.

### `store/app-state.types.ts`

Owns shared store-facing types that are not domain-specific:

- `AppState` composition type;
- `ActionResult`;
- connection/status types used across slices;
- slice creator ports/types.

Domain-specific types stay with their existing source modules where practical.

### `store/slices/session-slice.ts`

Owns:

- token/refresh token/session persistence mode;
- hydration/bootstrap session state;
- sign-in/register/activation/logout orchestration entry points;
- account suspension/auth routing context;
- session-scoped reset trigger.

It must use existing `session-epoch` rather than introducing another identity generation counter.

### `store/runtime/session-storage.ts`

Owns:

- SecureStore/web persistence helpers for token, refresh token and remembered-session mode;
- timeout/failure handling around persistence;
- no Zustand state.

Theme persistence should not remain mixed into this module.

### `store/slices/connection-slice.ts`

Owns state only:

- `networkStatus`;
- `networkSnapshot`;
- `connectionMode`;
- `socketStatus`;
- realtime auth state/diagnostics exposed to UI.

Lifecycle and timers live in runtime services, not in the slice.

### `store/runtime/realtime-controller.ts`

Owns exactly one Socket.IO runtime:

- connect/disconnect/reconnect;
- auth refresh/rejection handling;
- heartbeat timers/acks;
- socket diagnostics;
- AppState foreground recovery hooks that directly affect realtime;
- subscription registration/unregistration;
- exposure of the current shared socket.

Existing `shared-realtime-socket.ts`, `realtime-state.ts`, diagnostics and their tests remain supporting policies. The controller must not duplicate those decisions.

### `store/runtime/network-controller.ts`

Owns:

- mobile network subscription;
- refresh/recovery checks;
- API healthcheck timer if still required after separation;
- translation of runtime network signals into connection-slice state.

### `store/runtime/sync-coordinator.ts`

Owns:

- pending queue load/flush;
- single in-flight guard;
- operation dispatch/retry/replacement/removal;
- cache timestamps/counts;
- online-triggered replay.

Feature code should enqueue typed operations through this coordinator instead of owning replay logic itself.

The first migration will preserve existing operation shapes and semantics. No new generic framework is required.

### `store/slices/resources-slice.ts`

Owns:

- `operationalUnits`;
- `mapData`;
- `documents`;
- `users`;
- `routeSessionHistory`;
- resource loading metadata;
- focused resource refresh actions.

Where a domain later deserves a separate slice, it can be extracted without changing the public facade.

### `store/runtime/refresh-coordinator.ts`

Owns the `refreshAll` orchestration and its in-flight/epoch fencing.

It calls focused loaders through ports and must preserve current authorization rules (`canRefreshOperationalData`, `canLoadDirectoryUsers`) and resource-state transitions.

### `store/slices/incidents-slice.ts`

Owns:

- incidents collection;
- focused incident id;
- create/update actions;
- realtime incident state application.

Offline behavior is delegated to the sync coordinator rather than implemented by the slice.

### `store/slices/chat-slice.ts`

Owns:

- conversations/contacts;
- messages/page info/loading flags;
- active conversation;
- typing/read/presence projections;
- conversation open/load/send actions.

### `store/runtime/chat-crypto-service.ts`

Owns orchestration around the existing E2EE utilities:

- key/device storage lifecycle;
- backup load/write;
- direct-message encrypt/decrypt decisions.

Cryptographic primitives remain in the current utility module; they are not rewritten in this refactor.

### `store/slices/notifications-slice.ts`

Owns:

- notification collection;
- mark-read state action;
- push intent handling that mutates store state.

Native token registration, permission prompts, foreground display and feedback remain in notification infrastructure/utilities and are invoked through a small bridge.

### `store/slices/location-slice.ts`

Owns:

- `deviceLocation`;
- refresh/update state actions;
- public `sendVehicleLocation` action facade.

Background-location credentials and API/offline submission plumbing are delegated to runtime/services. The existing tracking authority outside the store is not duplicated.

### `store/slices/preferences-slice.ts`

Owns:

- theme mode;
- theme persistence action.

This is deliberately low-risk and is a good first extraction candidate.

## Dependency rules

1. Slices may depend on narrow runtime/service ports passed during composition, not import other slice implementations directly.
2. Runtime services may call store ports (`get`, `set`, narrowly typed callbacks) supplied by the composition root.
3. No extracted module may import `useAppStore` from `root-store.ts`; this prevents cycles.
4. Existing leaf policies remain leaf modules where possible.
5. Screens continue importing through `use-app-store.ts` / current public paths during migration.
6. No feature creates a second socket, second auth epoch, second network authority or second offline queue.

## Session-scoped reset

The current `getEmptyOperationalState` behavior will become an explicit session-scoped reset contract. Each slice contributes its reset state, and the composition layer combines them.

This avoids a new God helper while preserving atomic cleanup on logout/account invalidation.

Example shape:

```ts
type SessionScopedReset = () => Partial<AppState>;

const sessionScopedResetters = [
  resetResourcesState,
  resetIncidentsState,
  resetChatState,
  resetNotificationsState,
  resetLocationSessionState,
];
```

The actual implementation may use object constants/functions instead of a registry if that is simpler. The important invariant is one atomic identity teardown from the session authority.

## Migration strategy

Use a strangler refactor. Public behavior stays stable while internals move behind compatible functions.

### Phase 0 — characterization and architecture guards

Before moving behavior:

- add/confirm tests for exported `AppState`/public actions;
- add a contract preventing extracted modules from importing `root-store.ts`;
- add/confirm logout/identity teardown coverage;
- add/confirm shared-socket singleton coverage;
- add/confirm offline replay and session-epoch fencing around stale async work.

### Phase 1 — pure/low-risk extractions

Extract:

- store-facing types;
- preference/theme slice;
- session storage helpers;
- session-scoped reset helpers;
- small resource state helpers that currently live inline.

No behavior change.

### Phase 2 — resource and incident slices

Extract resource loading state and incident state/actions behind the same `AppState` keys. Preserve current request functions and realtime update semantics.

### Phase 3 — sync/offline coordinator

Move queue ownership and flush/retry mechanics out of the root file. Existing queue operation schema is preserved. GPS/incidents/chat callers continue to see the same action results.

### Phase 4 — chat state and E2EE orchestration

Move chat state/actions first, then E2EE orchestration. Preserve optimistic/confirmed message behavior, pagination, read/typing state, presence and direct-message encryption rules.

### Phase 5 — realtime/network runtime

Move Socket.IO globals, timers and subscriptions into a singleton realtime controller and network lifecycle into its controller. Preserve `getSharedRealtimeSocket` as a compatibility export from the facade.

This phase is intentionally late because it has the widest lifecycle blast radius.

### Phase 6 — session/bootstrap/refresh orchestration

Move the remaining session and refresh orchestration after all dependent ports are stable. `root-store.ts` becomes composition-only.

### Phase 7 — cleanup

- remove compatibility helpers only when all consumers have migrated;
- delete dead inline helpers/imports;
- assert no circular imports;
- update architecture docs with final ownership map.

## Test strategy

Every extraction follows red/green/refactor discipline where a boundary is not already covered.

Required gates after each phase:

- focused Jest tests for changed modules;
- existing store contract tests;
- `npm run typecheck`;
- `npm run lint` for affected mobile code / full lint when practical;
- `npm test` before phase completion;
- Android unit tests where native boundary behavior changed;
- release verification before final merge.

Critical behavioral contracts:

1. Remembered and memory-only login persist exactly as before.
2. Logout/account invalidation increments the same session epoch and clears session-scoped state atomically.
3. Stale async responses cannot repopulate a new identity.
4. Exactly one shared Socket.IO runtime exists for the authenticated identity.
5. Socket auth recovery/rejection semantics remain unchanged.
6. Offline queue replay remains single-flight and identity-safe.
7. GPS submission keeps online/offline behavior and background credential synchronization.
8. Incident create/status changes keep optimistic/offline/realtime semantics.
9. Chat keeps pagination, optimistic send, media/voice/text behavior, E2EE and presence/read/typing semantics.
10. Resource loading metadata and operational-unit authority remain unchanged.
11. Native session teardown (radio/push notifications) continues reacting to the authoritative identity transition.

## Rollback strategy

Each phase should be a small commit or small group of cohesive commits. Because public store keys/actions remain stable, any failed extraction can be reverted independently without reverting later unrelated product work.

Do not combine this refactor with feature work or UI changes in the same commits.

## Definition of done

The refactor is complete when:

- `root-store.ts` is primarily composition/bootstrap/facade code and no longer contains domain algorithms;
- no extracted slice/runtime imports `root-store.ts`;
- public store behavior remains compatible unless a separately documented migration intentionally changes it;
- session, realtime, network, sync and operational-unit authorities remain singular and documented;
- all existing mobile tests plus new boundary tests pass;
- typecheck and lint pass;
- architecture docs identify each owner and dependency direction;
- no known dead compatibility layer remains.

## Preferred implementation order

1. Types + preferences + storage/reset helpers.
2. Resources + incidents.
3. Sync/offline.
4. Chat + E2EE orchestration.
5. Realtime + network.
6. Session/bootstrap/refresh.
7. Cleanup and final architecture certification.

This ordering deliberately keeps session and realtime—the highest-risk cross-cutting pieces—stable until lower-risk boundaries are proven.