const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const {
  ChatAttachmentModel,
  ChatMessageModel,
  ConversationModel
} = require("../src/data/models");
const { AttachmentRepository } = require("../src/data/repositories/attachment-repository");
const { ChatMessageRepository } = require("../src/data/repositories/chat-message-repository");
const { ConversationRepository } = require("../src/data/repositories/conversation-repository");
const {
  clearPendingChatWritesForTests,
  topologySupportsTransactions
} = require("../src/data/repositories/chat-write-transaction");
const { buildAggregateRepair } = require("../scripts/migrate-chat-messages");

async function main() {
  const legacyRepair = buildAggregateRepair(
    {
      messageCount: 9,
      lastMessage: { id: "stale-message" },
      lastActivityAt: new Date("2026-08-29T19:00:00.000Z"),
      unreadBy: { "user-recipient": 7 }
    },
    1,
    {
      _id: "authoritative-message",
      createdAt: new Date("2026-08-29T20:00:00.000Z")
    }
  );
  assert.equal(legacyRepair.changed, true);
  assert.equal(legacyRepair.update.messageCount, 1);
  assert.equal(String(legacyRepair.update.lastMessage._id), "authoritative-message");
  assert.equal(
    Object.prototype.hasOwnProperty.call(legacyRepair.update, "unreadBy"),
    false,
    "La reconciliacion historica nunca debe inventar unreadBy"
  );

  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

  try {
    await mongoose.connect(replSet.getUri(), { dbName: "manecomb-chat-aggregate-tx" });
    assert.equal(topologySupportsTransactions(ChatMessageModel), true);

    // Mongoose can build indexes lazily after connection. Finish all DDL before
    // opening the fault-injection transaction so a tiny ephemeral lock window
    // cannot masquerade as a write-path failure.
    await Promise.all([
      ChatAttachmentModel.init(),
      ChatMessageModel.init(),
      ConversationModel.init()
    ]);

    await Promise.all([
      ChatAttachmentModel.deleteMany({}),
      ChatMessageModel.deleteMany({}),
      ConversationModel.deleteMany({})
    ]);

    const conversationId = "conversation-chat-tx";
    const senderId = "user-sender";
    const recipientId = "user-recipient";
    await ConversationModel.create({
      _id: conversationId,
      organizationId: "org-chat-tx",
      title: "Chat transaccional",
      kind: "direct",
      channelMode: "chat",
      encrypted: true,
      participants: [senderId, recipientId],
      unreadBy: { [senderId]: 0, [recipientId]: 0 },
      lastMessage: null,
      lastActivityAt: null,
      messageCount: 0,
      messages: []
    });

    const messages = new ChatMessageRepository(ChatMessageModel);
    const attachments = new AttachmentRepository(ChatAttachmentModel);
    const conversations = new ConversationRepository(ConversationModel);
    const createdAt = new Date("2026-08-29T20:00:00.000Z");
    const message = {
      _id: "message-chat-tx-01",
      conversationId,
      organizationId: "org-chat-tx",
      senderId,
      kind: "image",
      text: "",
      textPreview: "Evidencia",
      payloadEncrypted: "encrypted-test-payload",
      isEncrypted: true,
      imageUrl: "/api/chat/media/local__tx.png",
      mimeType: "image/png",
      durationSeconds: 0,
      status: "sent",
      createdAt
    };
    const aggregateMessage = {
      id: message._id,
      senderId,
      kind: "image",
      text: "",
      textPreview: "Evidencia",
      imageUrl: message.imageUrl,
      mimeType: message.mimeType,
      createdAt
    };
    const conversationShape = {
      _id: conversationId,
      organizationId: "org-chat-tx"
    };

    // Fault injection: message and attachment are written inside the open
    // transaction, then aggregate persistence fails. Nothing may survive.
    await messages.create(message);
    await attachments.createForMessage(aggregateMessage, conversationShape);
    const originalFindByIdAndUpdate = ConversationModel.findByIdAndUpdate;
    ConversationModel.findByIdAndUpdate = function forcedAggregateFailure() {
      throw new Error("forced_conversation_aggregate_failure");
    };
    await assert.rejects(
      () => conversations.updateAggregates(conversationId, {
        lastMessage: aggregateMessage,
        unreadBy: { [senderId]: 0, [recipientId]: 1 },
        incrementMessageCount: 1
      }),
      /forced_conversation_aggregate_failure/
    );
    ConversationModel.findByIdAndUpdate = originalFindByIdAndUpdate;

    assert.equal(await ChatMessageModel.countDocuments({ _id: message._id }), 0);
    assert.equal(await ChatAttachmentModel.countDocuments({ messageId: message._id }), 0);
    let conversation = await ConversationModel.findById(conversationId).lean();
    assert.equal(conversation.messageCount, 0);
    assert.equal(conversation.lastMessage, null);

    // Same durable attempt now succeeds and all three records become visible
    // together after the commit.
    await messages.create(message);
    await attachments.createForMessage(aggregateMessage, conversationShape);
    await conversations.updateAggregates(conversationId, {
      lastMessage: aggregateMessage,
      unreadBy: { [senderId]: 0, [recipientId]: 1 },
      incrementMessageCount: 1
    });

    assert.equal(await ChatMessageModel.countDocuments({ _id: message._id }), 1);
    assert.equal(await ChatAttachmentModel.countDocuments({ messageId: message._id }), 1);
    conversation = await ConversationModel.findById(conversationId).lean();
    assert.equal(conversation.messageCount, 1);
    assert.equal(String(conversation.lastMessage?.id || ""), message._id);
    assert.equal(Number(conversation.unreadBy?.[recipientId] ?? conversation.unreadBy?.get?.(recipientId) ?? 0), 1);

    // A pre-seeded opening aggregate deliberately uses the direct path: the
    // Conversation already owns this exact message before ChatMessage insert.
    const seededMessage = {
      ...message,
      _id: "message-chat-seeded-01",
      imageUrl: "/api/chat/media/local__seed.png",
      createdAt: new Date("2026-08-29T20:01:00.000Z")
    };
    await ConversationModel.create({
      _id: "conversation-chat-seeded",
      organizationId: "org-chat-tx",
      title: "Seed",
      kind: "direct",
      channelMode: "chat",
      encrypted: true,
      participants: [senderId, recipientId],
      unreadBy: { [senderId]: 0, [recipientId]: 0 },
      lastMessage: { id: seededMessage._id, senderId, createdAt: seededMessage.createdAt },
      lastActivityAt: seededMessage.createdAt,
      messageCount: 1,
      messages: []
    });
    await messages.create({ ...seededMessage, conversationId: "conversation-chat-seeded" });
    assert.equal(await ChatMessageModel.countDocuments({ _id: seededMessage._id }), 1);

    console.log("ok - ChatMessage + attachment + Conversation aggregate commit/rollback atomico en replica set");
  } finally {
    await clearPendingChatWritesForTests();
    await mongoose.disconnect().catch(() => undefined);
    await replSet.stop().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
