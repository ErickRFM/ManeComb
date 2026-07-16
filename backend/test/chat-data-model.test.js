const assert = require("assert");
const fs = require("node:fs");
const path = require("node:path");

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
  const mongoStoreSource = fs.readFileSync(
    path.join(__dirname, "../src/data/mongo-store.js"),
    "utf8"
  );
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
  assert.ok(ChatMessageModel.schema.path("audioUrl"), "audio message stores audioUrl");
  assert.ok(ChatMessageModel.schema.path("imageUrl"), "image message stores imageUrl");
  assert.ok(ChatMessageModel.schema.path("videoUrl"), "video message stores videoUrl");
  assert.ok(ChatMessageModel.schema.path("transmissionId"), "radio message stores transmissionId");
  assert.equal(
    mongoStoreSource.includes("existingCount < embeddedMessages.length"),
    false,
    "embedded history migration must compare message identities, never collection counts"
  );
  assert.match(
    mongoStoreSource,
    /const documents = embeddedMessages\.map\([\s\S]*await messageRepository\.upsertMany\(documents\)/,
    "every embedded message must pass through the idempotent messageId upsert"
  );
  assert.ok(hasIndex(chatMessageIndexes, { conversationId: 1, createdAt: -1, _id: -1 }));
  assert.ok(hasIndex(chatMessageIndexes, { organizationId: 1, conversationId: 1, createdAt: -1 }));
  assert.ok(hasIndex(chatMessageIndexes, { senderId: 1, createdAt: -1 }));
  assert.ok(hasIndex(chatMessageIndexes, { organizationId: 1, status: 1, createdAt: -1 }));
  assert.ok(hasIndex(chatMessageIndexes, { organizationId: 1, transmissionId: 1 }));
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

  const imageMessage = store.addMessage(conversation.id, userId, {
    kind: "image",
    imageUrl: "/api/chat/media/image-test.jpg",
    mimeType: "image/jpeg"
  });
  const videoMessage = store.addMessage(conversation.id, userId, {
    kind: "video",
    videoUrl: "/api/chat/media/video-test.mp4",
    mimeType: "video/mp4"
  });
  assert.strictEqual(imageMessage.imageUrl, "/api/chat/media/image-test.jpg");
  assert.strictEqual(imageMessage.audioUrl, null);
  assert.strictEqual(videoMessage.videoUrl, "/api/chat/media/video-test.mp4");
  assert.strictEqual(videoMessage.audioUrl, null);
  assert.equal(store.canUserAccessChatMedia(userId, "image-test.jpg"), true);
  assert.equal(store.canUserAccessChatMedia(userId, "video-test.mp4"), true);

  const readMessage = store.markConversationMessageRead(conversation.id, added.id, userId);
  assert.strictEqual(readMessage.status, "read");

  const radioConversation = store.ensureGeneralConversation(userId, "radio");
  const radioInput = {
    messageId: "radio:transmission-test-1",
    transmissionId: "transmission-test-1",
    kind: "audio",
    audioUrl: "/api/chat/media/radio-test.wav",
    mimeType: "audio/wav",
    durationSeconds: 1
  };
  const firstRadioMessage = store.addMessage(radioConversation.id, userId, radioInput);
  const repeatedRadioMessage = store.addMessage(radioConversation.id, userId, radioInput);
  const radioMessages = store.getMessages(radioConversation.id, userId);

  assert.strictEqual(firstRadioMessage.id, repeatedRadioMessage.id, "same transmission keeps one messageId");
  assert.strictEqual(firstRadioMessage.transmissionId, radioInput.transmissionId);
  assert.strictEqual(
    radioMessages.filter((message) => message.id === firstRadioMessage.id).length,
    1,
    "same transmission is persisted once"
  );
}

run()
  .then(() => {
    console.log("chat-data-model tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
