const { randomUUID } = require("crypto");

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

    await this.model.updateOne(
      { messageId: attachment.messageId, kind: attachment.kind },
      { $setOnInsert: attachment },
      { upsert: true }
    );

    return attachment;
  }
}

module.exports = {
  AttachmentRepository
};
