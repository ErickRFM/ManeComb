const assert = require("assert");

const {
  ChatAttachmentModel,
  ChatMessageModel,
  ConversationModel
} = require("../src/data/models");
const { createEmbeddedStore } = require("../src/data/store");
const { createSeedState } = require("../src/data/seedData");

function hasIndex(indexes, expectedFields) {
  return indexes.some(([fields]) =>
    Object.entries(expectedFields).every(([field, direction]) => fields[field] === direction)
  );
}

async function run() {
  const chatMessageIndexes = ChatMessageModel.schema.indexes();
  const attachmentIndexes = ChatAttachmentModel.schema.indexes();
  const conversationPaths = ConversationModel.schema.paths;

  assert.ok(conversationPaths.lastMessage, "conversation stores lastMessage aggregate");
  assert.ok(conversationPaths.lastActivityAt, "conversation stores lastActivityAt aggregate");
  assert.ok(conversationPaths.messageCount, "conversation stores messageCount aggregate");
  assert.ok(ChatMessageModel.schema.path("conversationId"), "message references conversationId");
  assert.ok(ChatMessageModel.schema.path("organizationId"), "message stores organizationId");
  assert.ok(ChatMessageModel.schema.path("senderId"), "message stores senderId");
  assert.ok(ChatMessageModel.schema.path("status"), "message stores delivery status");
  assert.ok(hasIndex(chatMessageIndexes, { conversationId: 1, createdAt: -1, _id: -1 }));
  assert.ok(hasIndex(chatMessageIndexes, { organizationId: 1, conversationId: 1, createdAt: -1 }));
  assert.ok(hasIndex(chatMessageIndexes, { senderId: 1, createdAt: -1 }));
  assert.ok(hasIndex(chatMessageIndexes, { organizationId: 1, status: 1, createdAt: -1 }));
  assert.ok(ChatAttachmentModel.schema.path("messageId"), "attachment references messageId");
  assert.ok(ChatAttachmentModel.schema.path("conversationId"), "attachment references conversationId");
  assert.ok(hasIndex(attachmentIndexes, { conversationId: 1, createdAt: -1 }));
  assert.ok(hasIndex(attachmentIndexes, { organizationId: 1, status: 1, createdAt: -1 }));

  const seed = createSeedState();
  const store = createEmbeddedStore();
  const userId = seed.users[0].id;
  const conversation = store.ensureGeneralConversation(userId, "chat");
  const before = store.getMessages(conversation.id, userId);

  assert.ok(Array.isArray(before), "legacy getMessages keeps array response");
  assert.ok(before.length >= 1, "seed messages remain readable after extraction");

  const added = store.addMessage(conversation.id, userId, "Mensaje de prueba RC-02");
  const after = store.getMessages(conversation.id, userId);
  const page = store.getMessages(conversation.id, userId, { paginated: true, limit: 1 });
  const storedConversation = store.getConversationById(conversation.id);

  assert.strictEqual(added.conversationId, conversation.id);
  assert.ok(after.some((message) => message.id === added.id), "new message is readable");
  assert.strictEqual(storedConversation.messages.length, 0, "conversation keeps no embedded messages");
  assert.strictEqual(page.items.length, 1, "cursor pagination returns requested page size");
  assert.strictEqual(typeof page.pageInfo.hasMore, "boolean");
}

run()
  .then(() => {
    console.log("chat-data-model tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
