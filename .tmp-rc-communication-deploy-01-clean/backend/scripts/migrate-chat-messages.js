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
    mimeType: message.mimeType || "",
    durationSeconds: Number(message.durationSeconds || 0),
    status: message.status || "sent",
    createdAt: message.createdAt || new Date()
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
  const backupPath = getArgValue("--backup") || "";
  const db = await connectDB();

  if (!db.connected) {
    throw new Error(getDbState().message || "MongoDB no conectado");
  }

  const repository = new ChatMessageRepository(ChatMessageModel);
  const attachmentRepository = new AttachmentRepository(ChatAttachmentModel);
  const conversations = await ConversationModel.find({
    messages: { $exists: true, $not: { $size: 0 } }
  }).lean();
  const backupStream = backupPath
    ? fs.createWriteStream(path.resolve(process.cwd(), backupPath), { flags: "a" })
    : null;
  const summary = {
    conversations: 0,
    messages: 0,
    attachments: 0,
    upserted: 0,
    pruned: 0,
    dryRun
  };

  try {
    for (const conversation of conversations) {
      const messages = Array.isArray(conversation.messages) ? conversation.messages : [];

      if (!messages.length) {
        continue;
      }

      summary.conversations += 1;
      summary.messages += messages.length;

      if (backupStream) {
        writeBackupLine(backupStream, conversation);
      }

      const documents = messages.map((message) => buildChatMessageDocument(message, conversation));
      const lastMessage = messages[messages.length - 1] || null;

      if (dryRun) {
        continue;
      }

      const result = await repository.upsertMany(documents);
      summary.upserted += Number(result.upsertedCount || 0);
      for (const message of documents) {
        const attachment = await attachmentRepository.createForMessage(message, conversation);

        if (attachment) {
          summary.attachments += 1;
        }
      }

      const update = {
        lastMessage,
        lastActivityAt: lastMessage?.createdAt || null,
        messageCount: await repository.countByConversation(conversation._id)
      };

      if (pruneEmbedded) {
        update.messages = [];
        summary.pruned += 1;
      }

      await ConversationModel.updateOne({ _id: conversation._id }, { $set: update });
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
    console.log("Dry-run activo. Ejecuta con --write para aplicar; agrega --prune-embedded solo despues de revisar el backup.");
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
  buildChatMessageDocument
};
