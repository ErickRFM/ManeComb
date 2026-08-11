function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isOperationalCommunicationUser(user) {
  return Boolean(
    user &&
    !user.deletedAt &&
    normalizeStatus(user.userStatus) !== "suspended"
  );
}

function getUserId(userOrId) {
  if (typeof userOrId === "string") return String(userOrId).trim();
  return String(userOrId?.id || userOrId?._id || "").trim();
}

function getOrganizationId(user) {
  return String(user?.organizationId || user?.organizationSlug || "").trim();
}

function sameOrganization(left, right) {
  const leftOrganizationId = getOrganizationId(left);
  return Boolean(
    leftOrganizationId &&
    leftOrganizationId === getOrganizationId(right)
  );
}

async function resolveUser(store, userOrId) {
  if (userOrId && typeof userOrId === "object") return userOrId;
  const userId = getUserId(userOrId);
  if (!userId || typeof store.getUserById !== "function") return null;
  return Promise.resolve(store.getUserById(userId));
}

async function filterConversationSummary(store, conversation, currentUser) {
  if (!conversation || typeof conversation !== "object") return null;

  const participants = [];
  for (const participant of Array.isArray(conversation.participants) ? conversation.participants : []) {
    const user = await resolveUser(store, participant);
    if (
      isOperationalCommunicationUser(user) &&
      sameOrganization(currentUser, user)
    ) {
      participants.push(user);
    }
  }

  if (conversation.kind === "direct") {
    const participantIds = new Set(participants.map(getUserId).filter(Boolean));
    if (participants.length !== 2 || !participantIds.has(getUserId(currentUser))) {
      return null;
    }
  }

  return {
    ...conversation,
    participants
  };
}

async function filterSubscriptions(store, entries) {
  const subscriptions = Array.isArray(entries) ? entries : [];
  const userIds = [...new Set(subscriptions.map((entry) => getUserId(entry?.userId)).filter(Boolean))];
  const eligibilityByUserId = new Map();

  await Promise.all(
    userIds.map(async (userId) => {
      const user = await resolveUser(store, userId);
      eligibilityByUserId.set(userId, isOperationalCommunicationUser(user));
    })
  );

  return subscriptions.filter((entry) => eligibilityByUserId.get(getUserId(entry?.userId)) === true);
}

function installOperationalCommunicationsGuard(store) {
  if (!store || store.__operationalCommunicationsGuardInstalled) return store;

  const original = {
    addMessage: typeof store.addMessage === "function" ? store.addMessage.bind(store) : null,
    canUserAccessChatMedia:
      typeof store.canUserAccessChatMedia === "function"
        ? store.canUserAccessChatMedia.bind(store)
        : null,
    canUserAccessConversation:
      typeof store.canUserAccessConversation === "function"
        ? store.canUserAccessConversation.bind(store)
        : null,
    ensureDirectConversation:
      typeof store.ensureDirectConversation === "function"
        ? store.ensureDirectConversation.bind(store)
        : null,
    ensureGeneralConversation:
      typeof store.ensureGeneralConversation === "function"
        ? store.ensureGeneralConversation.bind(store)
        : null,
    getConversationById:
      typeof store.getConversationById === "function"
        ? store.getConversationById.bind(store)
        : null,
    getConversationsForUser:
      typeof store.getConversationsForUser === "function"
        ? store.getConversationsForUser.bind(store)
        : null,
    getMessages: typeof store.getMessages === "function" ? store.getMessages.bind(store) : null,
    listChatContactsForUser:
      typeof store.listChatContactsForUser === "function"
        ? store.listChatContactsForUser.bind(store)
        : null,
    listPushSubscriptionsForRoles:
      typeof store.listPushSubscriptionsForRoles === "function"
        ? store.listPushSubscriptionsForRoles.bind(store)
        : null,
    listPushSubscriptionsForUsers:
      typeof store.listPushSubscriptionsForUsers === "function"
        ? store.listPushSubscriptionsForUsers.bind(store)
        : null,
    markConversationMessageDelivered:
      typeof store.markConversationMessageDelivered === "function"
        ? store.markConversationMessageDelivered.bind(store)
        : null,
    markConversationMessageRead:
      typeof store.markConversationMessageRead === "function"
        ? store.markConversationMessageRead.bind(store)
        : null
  };

  async function getEligibleCurrentUser(userId) {
    const user = await resolveUser(store, userId);
    return isOperationalCommunicationUser(user) ? user : null;
  }

  if (original.listChatContactsForUser) {
    store.listChatContactsForUser = async (userId) => {
      const currentUser = await getEligibleCurrentUser(userId);
      if (!currentUser) return [];
      const contacts = await Promise.resolve(original.listChatContactsForUser(userId));
      return (Array.isArray(contacts) ? contacts : []).filter(
        (contact) =>
          isOperationalCommunicationUser(contact) &&
          sameOrganization(currentUser, contact)
      );
    };
  }

  if (original.ensureDirectConversation) {
    store.ensureDirectConversation = async (userId, targetUserId, options) => {
      const [sourceUser, targetUser] = await Promise.all([
        getEligibleCurrentUser(userId),
        resolveUser(store, targetUserId)
      ]);

      if (
        !sourceUser ||
        !isOperationalCommunicationUser(targetUser) ||
        !sameOrganization(sourceUser, targetUser)
      ) {
        throw new Error("Participante no encontrado");
      }

      return original.ensureDirectConversation(userId, targetUserId, options);
    };
  }

  if (original.ensureGeneralConversation) {
    store.ensureGeneralConversation = async (userId, channelMode) => {
      const currentUser = await getEligibleCurrentUser(userId);
      if (!currentUser) throw new Error("Usuario operativo no disponible");
      const conversation = await Promise.resolve(
        original.ensureGeneralConversation(userId, channelMode)
      );
      return filterConversationSummary(store, conversation, currentUser);
    };
  }

  if (original.getConversationsForUser) {
    store.getConversationsForUser = async (userId) => {
      const currentUser = await getEligibleCurrentUser(userId);
      if (!currentUser) return [];
      const conversations = await Promise.resolve(original.getConversationsForUser(userId));
      const filtered = await Promise.all(
        (Array.isArray(conversations) ? conversations : []).map((conversation) =>
          filterConversationSummary(store, conversation, currentUser)
        )
      );
      return filtered.filter(Boolean);
    };
  }

  if (original.canUserAccessConversation) {
    store.canUserAccessConversation = async (userId, conversationOrId) => {
      const currentUser = await getEligibleCurrentUser(userId);
      if (!currentUser) return false;

      const allowed = await Promise.resolve(
        original.canUserAccessConversation(userId, conversationOrId)
      );
      if (!allowed) return false;

      const conversation =
        typeof conversationOrId === "string"
          ? await Promise.resolve(original.getConversationById?.(conversationOrId))
          : conversationOrId;

      if (!conversation || conversation.kind !== "direct") return true;

      const participantIds = (Array.isArray(conversation.participants)
        ? conversation.participants
        : [])
        .map(getUserId)
        .filter(Boolean);

      if (participantIds.length !== 2 || !participantIds.includes(getUserId(currentUser))) {
        return false;
      }

      const participants = await Promise.all(
        participantIds.map((participantId) => resolveUser(store, participantId))
      );

      return participants.every(
        (participant) =>
          isOperationalCommunicationUser(participant) &&
          sameOrganization(currentUser, participant)
      );
    };
  }

  if (original.getMessages) {
    store.getMessages = async (conversationId, userId, options) => {
      if (!(await store.canUserAccessConversation(userId, conversationId))) return null;
      return original.getMessages(conversationId, userId, options);
    };
  }

  if (original.addMessage) {
    store.addMessage = async (conversationId, senderId, input) => {
      if (!(await store.canUserAccessConversation(senderId, conversationId))) return null;
      return original.addMessage(conversationId, senderId, input);
    };
  }

  if (original.markConversationMessageRead) {
    store.markConversationMessageRead = async (conversationId, messageId, userId) => {
      if (!(await store.canUserAccessConversation(userId, conversationId))) return null;
      return original.markConversationMessageRead(conversationId, messageId, userId);
    };
  }

  if (original.markConversationMessageDelivered) {
    store.markConversationMessageDelivered = async (conversationId, messageId, userId) => {
      if (!(await store.canUserAccessConversation(userId, conversationId))) return null;
      return original.markConversationMessageDelivered(conversationId, messageId, userId);
    };
  }

  if (original.canUserAccessChatMedia) {
    store.canUserAccessChatMedia = async (userId, storageKey) => {
      if (!(await getEligibleCurrentUser(userId))) return false;
      return Boolean(await Promise.resolve(original.canUserAccessChatMedia(userId, storageKey)));
    };
  }

  if (original.listPushSubscriptionsForUsers) {
    store.listPushSubscriptionsForUsers = async (userIds) =>
      filterSubscriptions(
        store,
        await Promise.resolve(original.listPushSubscriptionsForUsers(userIds))
      );
  }

  if (original.listPushSubscriptionsForRoles) {
    store.listPushSubscriptionsForRoles = async (roles, organizationId) =>
      filterSubscriptions(
        store,
        await Promise.resolve(original.listPushSubscriptionsForRoles(roles, organizationId))
      );
  }

  Object.defineProperty(store, "__operationalCommunicationsGuardInstalled", {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false
  });

  return store;
}

module.exports = {
  filterConversationSummary,
  installOperationalCommunicationsGuard,
  isOperationalCommunicationUser
};
