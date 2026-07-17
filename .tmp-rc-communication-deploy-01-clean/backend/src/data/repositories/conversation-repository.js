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

    if (incrementMessageCount) {
      return this.model.findByIdAndUpdate(
        conversationId,
        {
          $set: update,
          $inc: { messageCount: incrementMessageCount }
        },
        { new: true }
      );
    }

    return this.model.findByIdAndUpdate(conversationId, { $set: update }, { new: true });
  }
}

module.exports = {
  ConversationRepository
};
