const { createHash } = require("crypto");

const CLIENT_MESSAGE_ID_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;

function normalizeClientMessageId(value) {
  const normalized = String(value || "").trim();
  return CLIENT_MESSAGE_ID_PATTERN.test(normalized) ? normalized : "";
}

function buildChatMessageId({ organizationId, conversationId, senderId, clientMessageId }) {
  return `chat-${createHash("sha256")
    .update(`${organizationId}:${conversationId}:${senderId}:${clientMessageId}`)
    .digest("hex")}`;
}

module.exports = {
  buildChatMessageId,
  normalizeClientMessageId
};
