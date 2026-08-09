const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const target = path.join(root, "backend/src/services/rtc-call-service.js");
let source = fs.readFileSync(target, "utf8");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  'const RING_LEASE_SAFETY_MS = 10000;\n',
  '',
  'remove ringing lease safety window'
);

replaceOnce(
`  function clearPendingDisconnectsForCall(callId) {
    for (const [key, handle] of Array.from(pendingDisconnects.entries())) {
      if (!key.startsWith(\`${'${callId}'}:\`)) continue;
      clearTimeoutFn(handle);
      pendingDisconnects.delete(key);
    }
  }

  async function releaseCurrent(callId, validate) {`,
`  function clearPendingDisconnectsForCall(callId) {
    for (const [key, handle] of Array.from(pendingDisconnects.entries())) {
      if (!key.startsWith(\`${'${callId}'}:\`)) continue;
      clearTimeoutFn(handle);
      pendingDisconnects.delete(key);
    }
  }

  function isRingingExpired(call) {
    if (call?.status !== "ringing") return false;
    const expiresAtMs = Date.parse(String(call.expiresAt || ""));
    return Number.isFinite(expiresAtMs) && expiresAtMs <= now();
  }

  async function releaseCurrent(callId, validate) {`,
  'add authoritative ringing deadline predicate'
);

replaceOnce(
`      const decision = buildNext(current);
      if (!decision?.ok) return { updated: false, call: current, ...decision };
      if (decision.idempotent) return { updated: false, call: current, ...decision };`,
`      const decision = buildNext(current);
      if (!decision?.ok) {
        if (decision?.release) {
          if (await authority.release(current)) {
            clearLocalRingTimer(callId);
            clearPendingDisconnectsForCall(callId);
            return { updated: false, call: current, released: true, ...decision };
          }
          continue;
        }
        return { updated: false, call: current, ...decision };
      }
      if (decision.idempotent) return { updated: false, call: current, ...decision };`,
  'allow rejected transitions to compare-and-release stale ringing state'
);

replaceOnce(
`      reservation = await authority.reserve(call, {
        ttlMs: ringTimeoutMs + RING_LEASE_SAFETY_MS
      });`,
`      reservation = await authority.reserve(call, {
        ttlMs: Math.max(1, Date.parse(call.expiresAt) - now())
      });`,
  'align Redis ringing lease with published deadline'
);

replaceOnce(
`        if (call.status !== "ringing") return { ok: false, code: "unknown_call" };
        return {`,
`        if (call.status !== "ringing") return { ok: false, code: "unknown_call" };
        if (isRingingExpired(call)) {
          return { ok: false, code: "call_expired", release: true };
        }
        return {`,
  'reject expired accept before active transition'
);

for (const forbidden of ['RING_LEASE_SAFETY_MS', 'ringTimeoutMs + 10000']) {
  if (source.includes(forbidden)) throw new Error(`stale ringing safety authority remains: ${forbidden}`);
}

fs.writeFileSync(target, source);
execFileSync(process.execPath, ["--check", target], { stdio: "inherit" });
console.log("rtc ringing deadline codemod: OK");
