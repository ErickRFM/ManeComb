const {
  abortChatWrite,
  commitChatWrite,
  getPendingChatWrite
} = require("./chat-write-transaction");

class ConversationRepository {
  constructor(model) {
    this.model = model;
  }

  findById(id, options = {}) {
    const query = this.model.findById(id);
    return options.lean === false ? query : query.lean();
  }

  findForParticipant(userId, organizationId) {
    return this.model.find({ participants: userId, organizationId }).lean();
  }

  async updateAggregates(conversationId, { lastMessage, unreadBy, incrementMessageCount = 0 }) {
    const update = {
      lastMessage,
      lastActivityAt: lastMessage?.createdAt || new Date()
    };

    if (unreadBy) {
      update.unreadBy = unreadBy;
    }

    const messageId = String(lastMessage?.id || lastMessage?._id || "").trim();
    const context = getPendingChatWrite(messageId);
    const options = {
      returnDocument: "after",
      ...(context ? { session: context.session } : {})
    };
    const mutation = incrementMessageCount
      ? {
          $set: update,
          $inc: { messageCount: incrementMessageCount }
        }
      : { $set: update };

    try {
      const conversation = await this.model.findByIdAndUpdate(
        conversationId,
        mutation,
        options
      );
      if (!conversation) {
        throw new Error("Conversacion no encontrada al consolidar mensaje");
      }
      if (context) {
        await commitChatWrite(messageId);
      }
      return conversation;
    } catch (error) {
      if (context) {
        await abortChatWrite(messageId, error).catch(() => undefined);
      }
      throw error;
    }
  }
}

module.exports = {
  ConversationRepository
};
