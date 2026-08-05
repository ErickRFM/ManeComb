const assert = require("node:assert/strict");
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
