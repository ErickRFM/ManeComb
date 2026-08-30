const { randomUUID } = require("crypto");
const {
  abortChatWrite,
  getPendingChatWrite
} = require("./chat-write-transaction");

class AttachmentRepository {
  constructor(model) {
    this.model = model;
  }

  buildFromMessage(message, conversation) {
    const url =
      message.kind === "audio"
        ? message.audioUrl || ""
        : message.kind === "image"
          ? message.imageUrl || ""
          : message.kind === "video"
            ? message.videoUrl || ""
            : "";

    if (!url || !["audio", "image", "video"].includes(message.kind)) {
      return null;
    }

    return {
      _id: randomUUID(),
      conversationId: conversation._id || conversation.id,
      messageId: message.id || message._id,
      organizationId: String(conversation.organizationId || "").trim(),
      ownerId: message.senderId,
      kind: message.kind,
      url,
      mimeType: message.mimeType || "",
      durationSeconds: Number(message.durationSeconds || 0),
      status: "available",
      createdAt: message.createdAt || new Date()
    };
  }

  async createForMessage(message, conversation) {
    const attachment = this.buildFromMessage(message, conversation);

    if (!attachment) {
      return null;
    }

    const context = getPendingChatWrite(attachment.messageId);
    try {
      await this.model.updateOne(
        { messageId: attachment.messageId, kind: attachment.kind },
        { $setOnInsert: attachment },
        {
          upsert: true,
          ...(context ? { session: context.session } : {})
        }
      );
      return attachment;
    } catch (error) {
      if (context) {
        await abortChatWrite(attachment.messageId, error).catch(() => undefined);
      }
      throw error;
    }
  }
}

module.exports = {
  AttachmentRepository
};
