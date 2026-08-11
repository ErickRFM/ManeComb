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

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

function mapMaybe(value, mapper) {
  return isPromiseLike(value) ? value.then(mapper) : mapper(value);
}

function allMaybe(values) {
  return values.some(isPromiseLike) ? Promise.all(values) : values;
}

function resolveUser(store, userOrId) {
  if (userOrId && typeof userOrId === "object") return userOrId;
  const userId = getUserId(userOrId);
  if (!userId || typeof store.getUserById !== "function") return null;
  return store.getUserById(userId);
}

function filterConversationSummary(store, conversation, currentUser) {
  if (!conversation || typeof conversation !== "object") return null;

  const participantResults = (Array.isArray(conversation.participants)
    ? conversation.participants
    : [])
    .map((participant) => resolveUser(store, participant));

  return mapMaybe(allMaybe(participantResults), (resolvedParticipants) => {
    const participants = resolvedParticipants.filter(
      (user) =>
        isOperationalCommunicationUser(user) &&
        sameOrganization(currentUser, user)
    );

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
  });
}

function filterSubscriptions(store, entries) {
  const subscriptions = Array.isArray(entries) ? entries : [];
  const userIds = [...new Set(subscriptions.map((entry) => getUserId(entry?.userId)).filter(Boolean))];
  const userResults = userIds.map((userId) => resolveUser(store, userId));

  return mapMaybe(allMaybe(userResults), (users) => {
    const eligibilityByUserId = new Map(
      userIds.map((userId, index) => [userId, isOperationalCommunicationUser(users[index])])
    );
    return subscriptions.filter(
      (entry) => eligibilityByUserId.get(getUserId(entry?.userId)) === true
    );
  });
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

  function getEligibleCurrentUser(userId) {
    return mapMaybe(resolveUser(store, userId), (user) =>
      isOperationalCommunicationUser(user) ? user : null
    );
  }

  if (original.listChatContactsForUser) {
    store.listChatContactsForUser = (userId) =>
      mapMaybe(getEligibleCurrentUser(userId), (currentUser) => {
        if (!currentUser) return [];
        return mapMaybe(original.listChatContactsForUser(userId), (contacts) =>
          (Array.isArray(contacts) ? contacts : []).filter(
            (contact) =>
              isOperationalCommunicationUser(contact) &&
              sameOrganization(currentUser, contact)
          )
        );
      });
  }

  if (original.ensureDirectConversation) {
    store.ensureDirectConversation = (userId, targetUserId, options) =>
      mapMaybe(
        allMaybe([
          getEligibleCurrentUser(userId),
          resolveUser(store, targetUserId)
        ]),
        ([sourceUser, targetUser]) => {
          if (
            !sourceUser ||
            !isOperationalCommunicationUser(targetUser) ||
            !sameOrganization(sourceUser, targetUser)
          ) {
            throw new Error("Participante no encontrado");
          }
          return original.ensureDirectConversation(userId, targetUserId, options);
        }
      );
  }

  if (original.ensureGeneralConversation) {
    store.ensureGeneralConversation = (userId, channelMode) =>
      mapMaybe(getEligibleCurrentUser(userId), (currentUser) => {
        if (!currentUser) throw new Error("Usuario operativo no disponible");
        return mapMaybe(
          original.ensureGeneralConversation(userId, channelMode),
          (conversation) => filterConversationSummary(store, conversation, currentUser)
        );
      });
  }

  if (original.getConversationsForUser) {
    store.getConversationsForUser = (userId) =>
      mapMaybe(getEligibleCurrentUser(userId), (currentUser) => {
        if (!currentUser) return [];
        return mapMaybe(original.getConversationsForUser(userId), (conversations) => {
          const filteredResults = (Array.isArray(conversations) ? conversations : []).map(
            (conversation) => filterConversationSummary(store, conversation, currentUser)
          );
          return mapMaybe(allMaybe(filteredResults), (filtered) => filtered.filter(Boolean));
        });
      });
  }

  if (original.canUserAccessConversation) {
    store.canUserAccessConversation = (userId, conversationOrId) =>
      mapMaybe(getEligibleCurrentUser(userId), (currentUser) => {
        if (!currentUser) return false;

        return mapMaybe(
          original.canUserAccessConversation(userId, conversationOrId),
          (allowed) => {
            if (!allowed) return false;

            const conversationResult =
              typeof conversationOrId === "string"
                ? original.getConversationById?.(conversationOrId)
                : conversationOrId;

            return mapMaybe(conversationResult, (conversation) => {
              if (!conversation || conversation.kind !== "direct") return true;

              const participantIds = (Array.isArray(conversation.participants)
                ? conversation.participants
                : [])
                .map(getUserId)
                .filter(Boolean);

              if (
                participantIds.length !== 2 ||
                !participantIds.includes(getUserId(currentUser))
              ) {
                return false;
              }

              const participantResults = participantIds.map((participantId) =>
                resolveUser(store, participantId)
              );
              return mapMaybe(allMaybe(participantResults), (participants) =>
                participants.every(
                  (participant) =>
                    isOperationalCommunicationUser(participant) &&
                    sameOrganization(currentUser, participant)
                )
              );
            });
          }
        );
      });
  }

  if (original.getMessages) {
    store.getMessages = (conversationId, userId, options) =>
      mapMaybe(store.canUserAccessConversation(userId, conversationId), (allowed) =>
        allowed ? original.getMessages(conversationId, userId, options) : null
      );
  }

  if (original.addMessage) {
    store.addMessage = (conversationId, senderId, input) =>
      mapMaybe(store.canUserAccessConversation(senderId, conversationId), (allowed) =>
        allowed ? original.addMessage(conversationId, senderId, input) : null
      );
  }

  if (original.markConversationMessageRead) {
    store.markConversationMessageRead = (conversationId, messageId, userId) =>
      mapMaybe(store.canUserAccessConversation(userId, conversationId), (allowed) =>
        allowed ? original.markConversationMessageRead(conversationId, messageId, userId) : null
      );
  }

  if (original.markConversationMessageDelivered) {
    store.markConversationMessageDelivered = (conversationId, messageId, userId) =>
      mapMaybe(store.canUserAccessConversation(userId, conversationId), (allowed) =>
        allowed
          ? original.markConversationMessageDelivered(conversationId, messageId, userId)
          : null
      );
  }

  if (original.canUserAccessChatMedia) {
    store.canUserAccessChatMedia = (userId, storageKey) =>
      mapMaybe(getEligibleCurrentUser(userId), (currentUser) => {
        if (!currentUser) return false;
        return mapMaybe(
          original.canUserAccessChatMedia(userId, storageKey),
          (allowed) => Boolean(allowed)
        );
      });
  }

  if (original.listPushSubscriptionsForUsers) {
    store.listPushSubscriptionsForUsers = (userIds) =>
      mapMaybe(
        original.listPushSubscriptionsForUsers(userIds),
        (entries) => filterSubscriptions(store, entries)
      );
  }

  if (original.listPushSubscriptionsForRoles) {
    store.listPushSubscriptionsForRoles = (roles, organizationId) =>
      mapMaybe(
        original.listPushSubscriptionsForRoles(roles, organizationId),
        (entries) => filterSubscriptions(store, entries)
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
