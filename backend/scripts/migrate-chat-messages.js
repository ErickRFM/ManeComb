const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const mongoose = require("mongoose");
const { connectDB, getDbState } = require("../src/config/db");
const {
  ChatAttachmentModel,
  ChatMessageModel,
  ConversationModel
} = require("../src/data/models");
const { AttachmentRepository } = require("../src/data/repositories/attachment-repository");
const { ChatMessageRepository } = require("../src/data/repositories/chat-message-repository");

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArgValue(name) {
  const direct = process.argv.find((entry) => entry.startsWith(`${name}=`));

  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function buildChatMessageDocument(message, conversation) {
  return {
    _id: message.id || message._id,
    conversationId: conversation._id,
    organizationId: String(conversation.organizationId || "").trim(),
    senderId: message.senderId,
    kind: message.kind || "text",
    text: message.text || "",
    textPreview: message.textPreview || "",
    payloadEncrypted: message.payloadEncrypted || "",
    isEncrypted: Boolean(message.isEncrypted || message.payloadEncrypted),
    transcript: message.transcript || "",
    audioUrl: message.audioUrl || null,
    imageUrl: message.imageUrl || null,
    videoUrl: message.videoUrl || null,
    mimeType: message.mimeType || "",
    durationSeconds: Number(message.durationSeconds || 0),
    status: message.status || "sent",
    createdAt: message.createdAt || new Date()
  };
}

function getMessageId(message) {
  return String(message?.id || message?._id || "").trim();
}

function datesEqual(left, right) {
  const leftTime = left ? new Date(left).getTime() : null;
  const rightTime = right ? new Date(right).getTime() : null;
  return leftTime === rightTime;
}

function buildAggregateRepair(conversation, storedCount, latestMessage) {
  const currentLastMessageId = getMessageId(conversation?.lastMessage);
  const latestMessageId = getMessageId(latestMessage);
  const currentCount = Math.max(0, Number(conversation?.messageCount) || 0);
  const nextCount = Math.max(0, Number(storedCount) || 0);
  const currentActivity = conversation?.lastActivityAt || null;
  const nextActivity = latestMessage?.createdAt || null;
  const changed =
    currentCount !== nextCount ||
    currentLastMessageId !== latestMessageId ||
    !datesEqual(currentActivity, nextActivity);

  return {
    changed,
    update: {
      lastMessage: latestMessage || null,
      lastActivityAt: nextActivity,
      messageCount: nextCount
    }
  };
}

function writeBackupLine(stream, conversation) {
  stream.write(
    `${JSON.stringify({
      conversationId: conversation._id,
      messages: conversation.messages || []
    })}\n`
  );
}

async function main() {
  const dryRun = !hasFlag("--write");
  const pruneEmbedded = hasFlag("--prune-embedded");
  const repairAggregates = hasFlag("--repair-aggregates");
  const backupPath = getArgValue("--backup") || "";
  const db = await connectDB();

  if (!db.connected) {
    throw new Error(getDbState().message || "MongoDB no conectado");
  }

  const repository = new ChatMessageRepository(ChatMessageModel);
  const attachmentRepository = new AttachmentRepository(ChatAttachmentModel);
  const conversations = await ConversationModel.find(
    repairAggregates
      ? {}
      : { messages: { $exists: true, $not: { $size: 0 } } }
  ).lean();
  const backupStream = backupPath
    ? fs.createWriteStream(path.resolve(process.cwd(), backupPath), { flags: "a" })
    : null;
  const summary = {
    conversations: 0,
    messages: 0,
    attachments: 0,
    upserted: 0,
    aggregateRepairs: 0,
    pruned: 0,
    repairAggregates,
    dryRun
  };

  try {
    for (const conversation of conversations) {
      const embeddedMessages = Array.isArray(conversation.messages) ? conversation.messages : [];

      if (!embeddedMessages.length && !repairAggregates) {
        continue;
      }

      summary.conversations += 1;
      summary.messages += embeddedMessages.length;

      if (backupStream && embeddedMessages.length) {
        writeBackupLine(backupStream, conversation);
      }

      const documents = embeddedMessages.map((message) =>
        buildChatMessageDocument(message, conversation)
      );

      if (!dryRun && documents.length) {
        const result = await repository.upsertMany(documents);
        summary.upserted += Number(result.upsertedCount || 0);
        for (const message of documents) {
          const attachment = await attachmentRepository.createForMessage(message, conversation);

          if (attachment) {
            summary.attachments += 1;
          }
        }
      }

      // Aggregate repair is deliberately based only on reconstructible facts.
      // `unreadBy` is NOT touched: the historical collection has no per-user
      // read watermark, so changing it here would fabricate unread state.
      const [storedCount, latestMessage] = await Promise.all([
        repository.countByConversation(conversation._id),
        ChatMessageModel.findOne({ conversationId: conversation._id })
          .sort({ createdAt: -1, _id: -1 })
          .lean()
      ]);
      const aggregateRepair = buildAggregateRepair(
        conversation,
        storedCount,
        latestMessage
      );

      if (aggregateRepair.changed) {
        summary.aggregateRepairs += 1;
      }

      if (dryRun) {
        continue;
      }

      const update = {
        ...(repairAggregates || documents.length ? aggregateRepair.update : {})
      };

      if (pruneEmbedded && embeddedMessages.length) {
        update.messages = [];
        summary.pruned += 1;
      }

      if (Object.keys(update).length) {
        await ConversationModel.updateOne({ _id: conversation._id }, { $set: update });
      }
    }
  } finally {
    await new Promise((resolve) => {
      if (!backupStream) {
        resolve();
        return;
      }

      backupStream.end(resolve);
    });
    await mongoose.disconnect();
  }

  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) {
    console.log(
      "Dry-run activo. Ejecuta con --write para aplicar; usa --repair-aggregates para reconciliar conteo/ultimo mensaje sin tocar unreadBy; agrega --prune-embedded solo despues de revisar el backup."
    );
  }
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error.message || error);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  });
}

module.exports = {
  buildAggregateRepair,
  buildChatMessageDocument
};
