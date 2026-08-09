const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const target = path.join(root, "backend/src/sockets/index.js");
let source = fs.readFileSync(target, "utf8");

const before = `      acknowledge(ack, result.ok
        ? { ok: true, callId: result.callId, roomId: result.roomId, status: result.status }
        : { ok: false, code: result.code });`;
const after = `      acknowledge(ack, result.ok
        ? {
            ok: true,
            callId: result.callId,
            roomId: result.roomId,
            status: result.status,
            expiresAt: result.expiresAt,
            ringTimeoutMs: result.ringTimeoutMs
          }
        : { ok: false, code: result.code });`;

const count = source.split(before).length - 1;
if (count !== 1) {
  throw new Error(`rtc:call ACK codemod expected one match, found ${count}`);
}
source = source.replace(before, after);
fs.writeFileSync(target, source);
execFileSync(process.execPath, ["--check", target], { stdio: "inherit" });
console.log("rtc ringing ACK codemod: OK");
