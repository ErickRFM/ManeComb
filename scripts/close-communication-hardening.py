from pathlib import Path
import json
import re


def replace_once(path, old, new, label):
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise SystemExit(f"{label}: pattern not found in {path}")
    target.write_text(text.replace(old, new, 1))


Path("backend/src/services/chat-message-idempotency.js").write_text(
    """const { createHash } = require("crypto");

const CLIENT_MESSAGE_ID_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;

function normalizeClientMessageId(value) {
  const normalized = String(value || "").trim();
  return CLIENT_MESSAGE_ID_PATTERN.test(normalized) ? normalized : "";
}

function buildChatMessageId({ organizationId, conversationId, senderId, clientMessageId }) {
  return `chat-${createHash("sha256")
    .update(`${organizationId}:${conversationId}:${senderId}:${clientMessageId}`)
    .digest("hex")}`;
}

module.exports = {
  buildChatMessageId,
  normalizeClientMessageId
};
"""
)

# HTTP and Socket share exactly one identity implementation.
routes = Path("backend/src/modules/chat/routes.js")
text = routes.read_text()
text = text.replace('const { createHash } = require("crypto");\n', '', 1)
logger_import = 'const logger = require("../../services/logger");'
shared_import = '''const {
  buildChatMessageId,
  normalizeClientMessageId
} = require("../../services/chat-message-idempotency");'''
if logger_import not in text:
    raise SystemExit("chat logger import missing")
text = text.replace(logger_import, shared_import + "\n" + logger_import, 1)
helper_pattern = re.compile(
    r"const CLIENT_MESSAGE_ID_PATTERN = .*?\n\nfunction buildChatMessageId\(.*?\n\}\n\n",
    re.S,
)
text, count = helper_pattern.subn('', text, count=1)
if count != 1:
    raise SystemExit("duplicated route idempotency helpers not found")
routes.write_text(text)

socket_file = Path("backend/src/sockets/index.js")
text = socket_file.read_text()
rtc_import = 'const { createRtcCallService } = require("../services/rtc-call-service");'
shared_socket_import = '''const {
  buildChatMessageId,
  normalizeClientMessageId
} = require("../services/chat-message-idempotency");'''
if rtc_import not in text:
    raise SystemExit("socket RTC import missing")
text = text.replace(rtc_import, rtc_import + "\n" + shared_socket_import, 1)
old_handler = '''    socket.on("chat:send", async ({ conversationId, senderId, text, ...payload } = {}, ack) => {
      const startedAt = Date.now();
      const authenticatedUser = socket.data.user || null;

      if (!authenticatedUser || authenticatedUser.id !== senderId) {
        acknowledge(ack, { ok: false, error: "unauthorized" });
        observeSocketEvent(socket, "chat:send", startedAt, "unauthorized");
        return;
      }

      if (
        !(await canUseOperations(socket)) ||
        !conversationId ||
        !senderId ||
        (!text?.trim() && payload.kind !== "audio") ||
        !(await store.canUserAccessConversation?.(authenticatedUser.id, conversationId))
      ) {
        acknowledge(ack, { ok: false, error: "forbidden_or_invalid_payload" });
        observeSocketEvent(socket, "chat:send", startedAt, "invalid");
        return;
      }

      const message = await store.addMessage(
        conversationId,
        senderId,
        payload.kind === "audio"
          ? payload
          : text.trim()
      );

      if (message) {
        io.to(`conversation:${conversationId}`).emit("chat:message", message);
        acknowledge(ack, {
          ok: true,
          messageId: message.id,
          packetId: String(payload.packetId || "")
        });
        incrementMetric("chat_messages_total", 1, { transport: "socket" });
        if (payload.kind === "audio") {
          incrementMetric("radio_transmissions_total", 1, { transport: "socket" });
        }
        observeSocketEvent(socket, "chat:send", startedAt, "success", { conversationId });
      }
    });'''
new_handler = '''    socket.on("chat:send", async ({ conversationId, senderId, text, ...payload } = {}, ack) => {
      const startedAt = Date.now();
      const authenticatedUser = socket.data.user || null;

      if (!authenticatedUser || authenticatedUser.id !== senderId) {
        acknowledge(ack, { ok: false, error: "unauthorized" });
        observeSocketEvent(socket, "chat:send", startedAt, "unauthorized");
        return;
      }

      const clientIdentity = payload.clientMessageId || payload.packetId || "";
      const safeClientMessageId = normalizeClientMessageId(clientIdentity);
      if (
        !(await canUseOperations(socket)) ||
        !conversationId ||
        !senderId ||
        (!text?.trim() && payload.kind !== "audio") ||
        (clientIdentity && !safeClientMessageId) ||
        !(await store.canUserAccessConversation?.(authenticatedUser.id, conversationId))
      ) {
        acknowledge(ack, { ok: false, error: "forbidden_or_invalid_payload" });
        observeSocketEvent(socket, "chat:send", startedAt, "invalid");
        return;
      }

      const messageId = safeClientMessageId
        ? buildChatMessageId({
            organizationId: getOrganizationId(authenticatedUser),
            conversationId,
            senderId,
            clientMessageId: safeClientMessageId
          })
        : undefined;
      const message = await store.addMessage(
        conversationId,
        senderId,
        payload.kind === "audio"
          ? { ...payload, messageId }
          : { kind: "text", text: text.trim(), messageId }
      );

      if (message) {
        const deduplicated = Boolean(message.deduplicated);
        const responseMessage = { ...message };
        delete responseMessage.deduplicated;
        if (!deduplicated) {
          io.to(`conversation:${conversationId}`).emit("chat:message", responseMessage);
          incrementMetric("chat_messages_total", 1, { transport: "socket" });
          if (payload.kind === "audio") {
            incrementMetric("radio_transmissions_total", 1, { transport: "socket" });
          }
        }
        acknowledge(ack, {
          ok: true,
          messageId: responseMessage.id,
          packetId: String(payload.packetId || ""),
          deduplicated
        });
        observeSocketEvent(
          socket,
          "chat:send",
          startedAt,
          deduplicated ? "duplicate" : "success",
          { conversationId }
        );
      }
    });'''
if old_handler not in text:
    raise SystemExit("socket chat:send handler not found")
socket_file.write_text(text.replace(old_handler, new_handler, 1))

# Remove the legacy in-screen RTC tile; the global CallOverlay is the only call UI.
media = Path("mobile/src/screens/chat/components/message-media.tsx")
text = media.read_text()
marker = "\nexport function CallMediaTile({"
if marker not in text:
    raise SystemExit("legacy CallMediaTile not found")
text = text[: text.index(marker)].rstrip() + "\n"
text = text.replace("createElement, ", "", 1)
text = text.replace("import type { CallMode, MessageDeliveryStatus }", "import type { MessageDeliveryStatus }", 1)
text = text.replace("import { RTCViewComponent } from '@/src/native/webrtc';\n", "", 1)
media.write_text(text)

# Real embedded-store regression: same durable identity mutates state exactly once.
Path("backend/test/chat-idempotency.test.js").write_text(
    """const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const {
  buildChatMessageId,
  normalizeClientMessageId
} = require("../src/services/chat-message-idempotency");

async function main() {
  assert.equal(normalizeClientMessageId(" durable-message-01 "), "durable-message-01");
  assert.equal(normalizeClientMessageId("bad id"), "");

  const store = createEmbeddedStore();
  const users = await store.listUsers();
  let source = null;
  let target = null;
  let conversation = null;
  for (const candidate of users) {
    for (const peer of users) {
      if (candidate.id === peer.id) continue;
      try {
        const opened = await store.ensureDirectConversation(candidate.id, peer.id, {
          channelMode: "chat"
        });
        source = candidate;
        target = peer;
        conversation = opened;
        break;
      } catch {
        // Try another pair from the same seeded tenant.
      }
    }
    if (conversation) break;
  }
  assert.ok(source && target && conversation, "Debe existir un par de usuarios del mismo tenant");

  const before = await store.getMessages(conversation.id, source.id);
  const clientMessageId = "durable-message-01";
  const messageId = buildChatMessageId({
    organizationId: conversation.organizationId,
    conversationId: conversation.id,
    senderId: source.id,
    clientMessageId
  });
  const first = await store.addMessage(conversation.id, source.id, {
    kind: "text",
    text: "Mensaje durable",
    messageId
  });
  const second = await store.addMessage(conversation.id, source.id, {
    kind: "text",
    text: "Mensaje durable",
    messageId
  });
  const after = await store.getMessages(conversation.id, source.id);

  assert.equal(first.id, messageId);
  assert.equal(first.deduplicated, false);
  assert.equal(second.id, messageId);
  assert.equal(second.deduplicated, true);
  assert.equal(after.length, before.length + 1, "El mismo intento solo debe persistirse una vez");
  assert.equal(after.filter((entry) => entry.id === messageId).length, 1);
  console.log("ok - chat idempotente persiste y contabiliza una sola vez");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
"""
)

package_file = Path("backend/package.json")
package_data = json.loads(package_file.read_text())
test_command = package_data["scripts"]["test"]
anchor = "node --require ./test/setup-env.js test/chat-data-model.test.js"
new_test = "node --require ./test/setup-env.js test/chat-idempotency.test.js"
if new_test not in test_command:
    if anchor not in test_command:
        raise SystemExit("backend test command anchor missing")
    test_command = test_command.replace(anchor, new_test + " && " + anchor, 1)
package_data["scripts"]["test"] = test_command
package_file.write_text(json.dumps(package_data, indent=2, ensure_ascii=False) + "\n")
