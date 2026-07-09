const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function normalizeLimit(limit) {
  const safeLimit = Number(limit);

  if (!Number.isFinite(safeLimit) || safeLimit <= 0) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.floor(safeLimit), MAX_PAGE_SIZE);
}

function decodeCursor(cursor) {
  const rawCursor = String(cursor || "").trim();

  if (!rawCursor) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
    const createdAt = decoded?.createdAt ? new Date(decoded.createdAt) : null;
    const id = String(decoded?.id || "").trim();

    if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) {
      return null;
    }

    return { createdAt, id };
  } catch (error) {
    return null;
  }
}

function encodeCursor(message) {
  const id = message?._id || message?.id;

  if (!message?.createdAt || !id) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      createdAt: new Date(message.createdAt).toISOString(),
      id: String(id)
    }),
    "utf8"
  ).toString("base64url");
}

class ChatMessageRepository {
  constructor(model) {
    this.model = model;
  }

  buildCursorFilter(cursor) {
    const decoded = decodeCursor(cursor);

    if (!decoded) {
      return {};
    }

    return {
      $or: [
        { createdAt: { $lt: decoded.createdAt } },
        { createdAt: decoded.createdAt, _id: { $lt: decoded.id } }
      ]
    };
  }

  async listByConversation(conversationId, options = {}) {
    const limit = normalizeLimit(options.limit);
    const filter = {
      conversationId,
      ...this.buildCursorFilter(options.before)
    };
    const rows = await this.model
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();
    const page = rows.slice(0, limit);

    return {
      messages: page.reverse(),
      pageInfo: {
        hasMore: rows.length > limit,
        nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null
      }
    };
  }

  async listAllByConversation(conversationId) {
    return this.model.find({ conversationId }).sort({ createdAt: 1, _id: 1 }).lean();
  }

  async countByConversation(conversationId) {
    return this.model.countDocuments({ conversationId });
  }

  async create(message) {
    return this.model.create(message);
  }

  async upsertMany(messages) {
    const safeMessages = Array.isArray(messages) ? messages.filter(Boolean) : [];

    if (!safeMessages.length) {
      return { upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };
    }

    return this.model.bulkWrite(
      safeMessages.map((message) => ({
        updateOne: {
          filter: { _id: message._id },
          update: { $setOnInsert: message },
          upsert: true
        }
      })),
      { ordered: false }
    );
  }

  async findMediaMessage(conversationIds, mediaPath) {
    return this.model
      .findOne({
        conversationId: { $in: conversationIds },
        $or: [{ audioUrl: mediaPath }, { payloadEncrypted: { $ne: "" } }]
      })
      .lean();
  }
}

module.exports = {
  ChatMessageRepository,
  decodeCursor,
  encodeCursor,
  normalizeLimit
};
