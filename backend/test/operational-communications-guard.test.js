const assert = require("assert");
const {
  installOperationalCommunicationsGuard,
  isChatCommunicationUser,
  isOperationalCommunicationUser
} = require("../src/services/operational-communications-guard");

function buildUser(id, overrides = {}) {
  return {
    id,
    name: id,
    organizationId: "org-1",
    role: "driver",
    accountType: "operations",
    userStatus: "active",
    deletedAt: null,
    ...overrides
  };
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

function buildStore() {
  const users = new Map([
    ["admin", buildUser("admin", { role: "admin", accountType: "company_owner" })],
    ["active", buildUser("active")],
    ["pending", buildUser("pending", { userStatus: "pending" })],
    ["suspended", buildUser("suspended", { userStatus: "suspended" })],
    ["deleted", buildUser("deleted", { deletedAt: "2026-08-11T06:00:00.000Z" })],
    ["other-org", buildUser("other-org", { organizationId: "org-2" })],
    ["billing", buildUser("billing", { role: "billing_manager", accountType: "company_owner" })]
  ]);

  const conversations = new Map([
    [
      "direct-active",
      {
        id: "direct-active",
        kind: "direct",
        channelMode: "chat",
        participants: ["admin", "active"]
      }
    ],
    [
      "direct-deleted",
      {
        id: "direct-deleted",
        kind: "direct",
        channelMode: "chat",
        participants: ["admin", "deleted"]
      }
    ],
    [
      "general",
      {
        id: "general",
        kind: "group",
        channelMode: "chat",
        participants: ["admin", "active", "suspended", "deleted", "billing"]
      }
    ]
  ]);

  const calls = {
    addMessage: 0,
    ensureDirectConversation: 0,
    getMessages: 0
  };

  const toSummary = (conversation) => ({
    ...conversation,
    participants: conversation.participants.map((id) => users.get(id)).filter(Boolean)
  });

  return {
    calls,
    users,
    addMessage(conversationId, senderId, input) {
      calls.addMessage += 1;
      return { id: "message-1", conversationId, senderId, ...input };
    },
    canUserAccessChatMedia() {
      return true;
    },
    canUserAccessConversation(userId, conversationOrId) {
      const conversation =
        typeof conversationOrId === "string"
          ? conversations.get(conversationOrId)
          : conversationOrId;
      const participantIds = (conversation?.participants || []).map((participant) =>
        typeof participant === "string" ? participant : participant?.id
      );
      return participantIds.includes(userId);
    },
    ensureDirectConversation(userId, targetUserId) {
      calls.ensureDirectConversation += 1;
      return toSummary({
        id: `direct:${userId}:${targetUserId}`,
        kind: "direct",
        channelMode: "chat",
        participants: [userId, targetUserId]
      });
    },
    ensureGeneralConversation() {
      return toSummary(conversations.get("general"));
    },
    getConversationById(conversationId) {
      return conversations.get(conversationId) || null;
    },
    getConversationsForUser() {
      return [...conversations.values()].map(toSummary);
    },
    getMessages(conversationId) {
      calls.getMessages += 1;
      return [{ id: "message-1", conversationId }];
    },
    getUserById(userId) {
      return users.get(userId) || null;
    },
    listChatContactsForUser() {
      return ["active", "pending", "suspended", "deleted", "other-org", "billing"].map((id) => users.get(id));
    },
    listPushSubscriptionsForRoles() {
      return ["active", "suspended", "deleted"].map((userId) => ({ userId, token: `token-${userId}` }));
    },
    listPushSubscriptionsForUsers() {
      return ["active", "suspended", "deleted"].map((userId) => ({ userId, token: `token-${userId}` }));
    },
    markConversationMessageDelivered() {
      return { id: "message-1", status: "delivered" };
    },
    markConversationMessageRead() {
      return { id: "message-1", status: "read" };
    }
  };
}

async function run() {
  assert.strictEqual(isOperationalCommunicationUser(buildUser("active")), true);
  assert.strictEqual(
    isOperationalCommunicationUser(buildUser("pending", { userStatus: "pending" })),
    true
  );
  assert.strictEqual(
    isOperationalCommunicationUser(buildUser("suspended", { userStatus: "suspended" })),
    false
  );
  assert.strictEqual(
    isOperationalCommunicationUser(buildUser("deleted", { deletedAt: new Date() })),
    false
  );
  assert.strictEqual(isChatCommunicationUser(buildUser("active")), true);
  assert.strictEqual(
    isChatCommunicationUser(buildUser("billing", { role: "billing_manager", accountType: "company_owner" })),
    false
  );

  const store = installOperationalCommunicationsGuard(buildStore());

  const contacts = store.listChatContactsForUser("admin");
  assert.strictEqual(isPromiseLike(contacts), false, "embedded contact contract stays synchronous");
  assert.deepStrictEqual(contacts.map((entry) => entry.id), ["active", "pending"]);

  assert.throws(
    () => store.ensureDirectConversation("admin", "deleted"),
    /Participante no encontrado/
  );
  assert.throws(
    () => store.ensureDirectConversation("admin", "suspended"),
    /Participante no encontrado/
  );
  assert.throws(
    () => store.ensureDirectConversation("admin", "other-org"),
    /Participante no encontrado/
  );
  assert.throws(
    () => store.ensureDirectConversation("admin", "billing"),
    /Participante no encontrado/
  );
  assert.strictEqual(store.calls.ensureDirectConversation, 0);

  const active = store.ensureDirectConversation("admin", "active");
  assert.strictEqual(isPromiseLike(active), false, "embedded direct contract stays synchronous");
  assert.deepStrictEqual(active.participants.map((entry) => entry.id), ["admin", "active"]);
  assert.strictEqual(store.calls.ensureDirectConversation, 1);

  const conversations = store.getConversationsForUser("admin");
  assert.strictEqual(isPromiseLike(conversations), false, "embedded conversation contract stays synchronous");
  assert.deepStrictEqual(conversations.map((entry) => entry.id), ["direct-active", "general"]);
  assert.deepStrictEqual(
    conversations.find((entry) => entry.id === "general").participants.map((entry) => entry.id),
    ["admin", "active"]
  );

  assert.strictEqual(store.canUserAccessConversation("admin", "direct-deleted"), false);
  assert.strictEqual(store.getMessages("direct-deleted", "admin"), null);
  assert.strictEqual(store.addMessage("direct-deleted", "admin", { text: "hola" }), null);
  assert.strictEqual(store.calls.getMessages, 0);
  assert.strictEqual(store.calls.addMessage, 0);

  assert.strictEqual(store.canUserAccessConversation("admin", "direct-active"), true);
  assert.deepStrictEqual(store.getMessages("direct-active", "admin"), [
    { id: "message-1", conversationId: "direct-active" }
  ]);

  const directTargets = store.listPushSubscriptionsForUsers(["active", "suspended", "deleted"]);
  const roleTargets = store.listPushSubscriptionsForRoles(["driver"], "org-1");
  assert.deepStrictEqual(directTargets.map((entry) => entry.userId), ["active"]);
  assert.deepStrictEqual(roleTargets.map((entry) => entry.userId), ["active"]);

  const asyncBase = buildStore();
  const syncGetUserById = asyncBase.getUserById.bind(asyncBase);
  const syncListContacts = asyncBase.listChatContactsForUser.bind(asyncBase);
  asyncBase.getUserById = async (userId) => syncGetUserById(userId);
  asyncBase.listChatContactsForUser = async (userId) => syncListContacts(userId);
  const asyncStore = installOperationalCommunicationsGuard(asyncBase);
  const asyncContactsResult = asyncStore.listChatContactsForUser("admin");
  assert.strictEqual(isPromiseLike(asyncContactsResult), true, "Mongo-style async contract stays asynchronous");
  const asyncContacts = await asyncContactsResult;
  assert.deepStrictEqual(asyncContacts.map((entry) => entry.id), ["active", "pending"]);

  console.log("operational communications lifecycle guard tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});