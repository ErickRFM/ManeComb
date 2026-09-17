# Mobile `image-size` risk review — 2026-09-17

## Scope

This review covers the two high-severity advisories currently reached by the Mobile production dependency graph through Metro and `image-size@1.2.1`:

- `GHSA-w3rx-r6r6-pgpr`
- `GHSA-5p2g-fcmc-qvqq`

The previous bounded acceptance expired on 2026-09-15. The current Dependency audit correctly failed closed on 2026-09-17 before any renewal was made.

## Current dependency state

The installed Mobile lockfile still resolves `image-size@1.2.1`. Metro 0.84.x is still documented downstream with the same 1.x dependency line, so replacing it inside Metro with the newly published `image-size` 2.x line is a major dependency substitution that has not been certified against React Native 0.81.5/Metro in this repository.

The official `image-size` package now has a 2.0.4 release in the registry. This removes the historical problem where the advisory referenced a 2.0.3 patched version that was not installable, but it does not by itself prove that ManeComb can override Metro's 1.x dependency with 2.x without breaking Metro's asset API expectations.

Third-party patched forks/aliases are not adopted in this closeout because their compatibility and supply-chain trust have not been certified by the existing Android/Metro release gates.

## Exposure review

In the ManeComb dependency path, `image-size` is used by Metro while processing application assets during bundling/development tooling. The application does not expose Metro's asset parser as a production HTTP upload endpoint. Production user document/media uploads are handled by backend/storage paths, not by the Metro bundler.

This lowers practical production reachability compared with a server that feeds arbitrary remote uploads into `image-size`, but it does not make the advisory disappear. A malicious or compromised repository/build input can still affect build tooling, so the finding remains tracked and time-bounded rather than ignored globally.

## Decision

Renew a narrow temporary acceptance until **2026-10-17T00:00:00Z** under all of these conditions:

1. Only the two advisory URLs listed above are accepted.
2. Only exact installed `image-size@1.2.1` is accepted; any version drift fails the gate.
3. Any new high/critical advisory in the dependency chain fails the gate.
4. If either reviewed advisory disappears from `npm audit`, the gate fails so the stale exception is removed instead of carried forward.
5. The acceptance expires automatically and must be re-reviewed; there is no broad package/severity ignore.
6. A compatible Metro/React Native dependency chain that consumes an officially patched `image-size` release supersedes this acceptance immediately.

## Required next re-review

Before 2026-10-17:

- Check Metro and React Native release notes/dependency graph for migration from `image-size` legacy 1.x.
- If Metro supports the official 2.x line, upgrade through the supported dependency chain rather than an unverified root override.
- Run Mobile typecheck, lint, Jest, Android debug APK certification, Dependency audit, and the full main CI on the exact candidate.

## Evidence

The 2026-09-17 PR closeout run failed exactly at the expiration check while backend, Ventas, Admin Global, and Communication Service production dependency audits remained green. That failure is the RED evidence for this bounded renewal; the renewal is considered valid only if a fresh Dependency audit confirms that the observed findings still resolve exclusively to the two reviewed advisory IDs and exact reviewed version.
