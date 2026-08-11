const {
  installOperationalCommunicationsGuard,
  isOperationalCommunicationUser
} = require("../src/services/operational-communications-guard");

function buildUser(id, overrides = {}) {
  return {
    id,
    name: id,
    organizationId: "org-1",
    role: "driver",
    userStatus: "active",
    deletedAt: null,
    ...overrides
  };
}

function buildStore() {
  const users = new Map([
    ["admin", buildUser("admin", { role: "admin" })],
    ["active", buildUser("active")],
    ["pending", buildUser("pending", { userStatus: "pending" })],
    ["suspended", buildUser("suspended", { userStatus: "suspended" })],
    ["deleted", buildUser("deleted", { deletedAt: "2026-08-11T06:00:00.000Z" })],
    ["other-org", buildUser("other-org", { organizationId: "org-2" })]
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
        participants: ["admin", "active", "suspended", "deleted"]
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
      return Boolean(conversation?.participants.includes(userId));
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
      return ["active", "pending", "suspended", "deleted", "other-org"].map((id) => users.get(id));
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

describe("operational communications guard", () => {
  test("defines one eligibility rule for active/pending versus suspended/deleted users", () => {
    expect(isOperationalCommunicationUser(buildUser("active"))).toBe(true);
    expect(isOperationalCommunicationUser(buildUser("pending", { userStatus: "pending" }))).toBe(true);
    expect(isOperationalCommunicationUser(buildUser("suspended", { userStatus: "suspended" }))).toBe(false);
    expect(isOperationalCommunicationUser(buildUser("deleted", { deletedAt: new Date() }))).toBe(false);
  });

  test("removes suspended, deleted and cross-tenant users from Nuevo chat", async () => {
    const store = installOperationalCommunicationsGuard(buildStore());

    const contacts = await store.listChatContactsForUser("admin");

    expect(contacts.map((entry) => entry.id)).toEqual(["active", "pending"]);
  });

  test("prevents opening a new direct channel to a deleted or suspended user", async () => {
    const store = installOperationalCommunicationsGuard(buildStore());

    await expect(store.ensureDirectConversation("admin", "deleted")).rejects.toThrow("Participante no encontrado");
    await expect(store.ensureDirectConversation("admin", "suspended")).rejects.toThrow("Participante no encontrado");
    await expect(store.ensureDirectConversation("admin", "other-org")).rejects.toThrow("Participante no encontrado");
    expect(store.calls.ensureDirectConversation).toBe(0);

    const active = await store.ensureDirectConversation("admin", "active");
    expect(active.participants.map((entry) => entry.id)).toEqual(["admin", "active"]);
    expect(store.calls.ensureDirectConversation).toBe(1);
  });

  test("keeps historical membership stored but removes it from the live conversation projection", async () => {
    const store = installOperationalCommunicationsGuard(buildStore());

    const conversations = await store.getConversationsForUser("admin");

    expect(conversations.map((entry) => entry.id)).toEqual(["direct-active", "general"]);
    expect(conversations.find((entry) => entry.id === "general").participants.map((entry) => entry.id))
      .toEqual(["admin", "active"]);
  });

  test("blocks stale direct deep-links and message writes after the counterpart is deleted", async () => {
    const store = installOperationalCommunicationsGuard(buildStore());

    await expect(store.canUserAccessConversation("admin", "direct-deleted")).resolves.toBe(false);
    await expect(store.getMessages("direct-deleted", "admin")).resolves.toBeNull();
    await expect(store.addMessage("direct-deleted", "admin", { text: "hola" })).resolves.toBeNull();
    expect(store.calls.getMessages).toBe(0);
    expect(store.calls.addMessage).toBe(0);

    await expect(store.canUserAccessConversation("admin", "direct-active")).resolves.toBe(true);
    await expect(store.getMessages("direct-active", "admin")).resolves.toEqual([
      { id: "message-1", conversationId: "direct-active" }
    ]);
  });

  test("does not deliver push notifications to suspended or deleted accounts", async () => {
    const store = installOperationalCommunicationsGuard(buildStore());

    const directTargets = await store.listPushSubscriptionsForUsers(["active", "suspended", "deleted"]);
    const roleTargets = await store.listPushSubscriptionsForRoles(["driver"], "org-1");

    expect(directTargets.map((entry) => entry.userId)).toEqual(["active"]);
    expect(roleTargets.map((entry) => entry.userId)).toEqual(["active"]);
  });
});
