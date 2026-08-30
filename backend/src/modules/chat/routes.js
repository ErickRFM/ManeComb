const { Router } = require("express");
const multer = require("multer");
const { authenticate } = require("../../middlewares/authenticate");
const { getOrganizationId } = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const { requireEnterpriseCapability } = require("../../middlewares/enterprise-capability-access");
const { ENTERPRISE_CAPABILITY } = require("../../services/enterprise-capabilities");
const {
  deleteChatMediaAsset,
  streamChatMediaAsset,
  uploadChatAudioAsset,
  uploadChatMediaAsset
} = require("../../services/chat-media");
const { transcribeAudioBuffer } = require("../../services/audio-transcription");
const { deliverOperationalNotification } = require("../../services/notification-delivery");
const {
  buildChatMessageId,
  normalizeClientMessageId
} = require("../../services/chat-message-idempotency");
const logger = require("../../services/logger");

const router = Router();
const MAX_VOICE_NOTE_SECONDS = 60;
const requireChatAccess = requireEnterpriseCapability(ENTERPRISE_CAPABILITY.CHAT_ACCESS);

function isValidE2eePublicKey(value) {
  try {
    return Buffer.from(String(value || "").trim(), "base64").length === 32;
  } catch {
    return false;
  }
}

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 6 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    const mimeType = String(file.mimetype || "").toLowerCase();
    callback(
      mimeType.startsWith("audio/")
        ? null
        : new Error("Solo se permiten audios para el canal de radio"),
      mimeType.startsWith("audio/")
    );
  }
});

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB for video/images
  },
  fileFilter: (req, file, callback) => {
    const mimeType = String(file.mimetype || "").toLowerCase();
    const isImage = mimeType.startsWith("image/");
    const isVideo = mimeType.startsWith("video/");

    callback(
      (isImage || isVideo)
        ? null
        : new Error("Solo se permiten imagenes y videos"),
      (isImage || isVideo)
    );
  }
});

router.use(authenticate, requireOperationalAccess, requireChatAccess);

function emitConversationUpdate(req, conversationOrId, message) {
  const conversationId =
    typeof conversationOrId === "string" ? conversationOrId : conversationOrId?.id;

  req.app.locals.io
    ?.to(`conversation:${conversationId}`)
    .emit("chat:message", message);

  if (conversationOrId?.channelMode === "radio") {
    req.app.locals.io
      ?.to(`conversation:${conversationId}`)
      .emit("radio:message:new", {
        conversationId,
        message
      });
  }

  const organizationId = getOrganizationId(req.user);

}

function getParticipantId(participant) {
  if (typeof participant === "string") return String(participant).trim();
  return String(participant?.id || participant?._id || "").trim();
}

async function getEligibleNotificationRecipientIds(store, conversation, senderId) {
  const safeSenderId = String(senderId || "").trim();
  const candidateIds = (Array.isArray(conversation?.participants) ? conversation.participants : [])
    .map(getParticipantId)
    .filter((participantId) => participantId && participantId !== safeSenderId);

  if (!candidateIds.length) return [];

  // Direct conversations already pass the canonical conversation guard, which
  // validates both participants against tenant/lifecycle/chat capability.
  if (conversation?.kind === "direct") return candidateIds;

  // Legacy group records may still contain users whose role no longer has Chat.
  // Reuse the guarded contact directory so push metadata never reaches an
  // identity that cannot actually open the conversation.
  const contacts = await store.listChatContactsForUser(safeSenderId);
  const eligibleIds = new Set(
    (Array.isArray(contacts) ? contacts : [])
      .map(getParticipantId)
      .filter(Boolean)
  );

  return candidateIds.filter((participantId) => eligibleIds.has(participantId));
}

function buildMultipartMessageId(req, conversation) {
  const rawClientMessageId = req.body?.clientMessageId;
  const safeClientMessageId = normalizeClientMessageId(rawClientMessageId);

  if (!safeClientMessageId) {
    return null;
  }

  return buildChatMessageId({
    organizationId: conversation.organizationId,
    conversationId: conversation.id,
    senderId: req.user.id,
    clientMessageId: safeClientMessageId
  });
}

function normalizeMessageResult(message) {
  const deduplicated = Boolean(message) && message.deduplicated !== false;
  const responseMessage = message ? { ...message } : null;
  if (responseMessage) delete responseMessage.deduplicated;
  return { deduplicated, responseMessage };
}

async function cleanupRedundantUpload(uploadedAsset, req, kind) {
  try {
    await deleteChatMediaAsset(uploadedAsset);
  } catch (error) {
    // A cleanup failure must not turn an already-confirmed replay into another
    // client retry, otherwise each retry could upload yet another redundant asset.
    // Keep the durable message authoritative and leave the orphan for reconciliation.
    logger.error({
      module: "Chat",
      action: "media.replay_cleanup_failed",
      requestId: req.traceId,
      userId: req.user?.id,
      message: "No fue posible limpiar un asset redundante de Chat",
      metadata: {
        conversationId: req.params.conversationId,
        kind,
        storageKey: uploadedAsset?.storageKey || null
      },
      error
    });
  }
}

router.get("/conversations", authenticate, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.getConversationsForUser(req.user.id)
  });
});

router.get("/contacts", authenticate, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.listChatContactsForUser(req.user.id)
  });
});

router.post("/conversations/general", authenticate, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.ensureGeneralConversation(
      req.user.id,
      req.body.channelMode
    )
  });
});

router.post("/conversations/direct", authenticate, async (req, res, next) => {
  try {
    const conversation = await req.app.locals.store.ensureDirectConversation(
      req.user.id,
      req.body.targetUserId,
      {
        channelMode: req.body.channelMode
      }
    );

    return res.status(201).json({
      ok: true,
      data: conversation
    });
  } catch (error) {
    error.statusCode = 400;
    error.publicMessage = "No fue posible abrir el canal directo";
    return next(error);
  }
});

router.get("/conversations/:conversationId/messages", authenticate, async (req, res) => {
  const wantsCursorPage = Boolean(req.query.limit || req.query.before);
  const messages = await req.app.locals.store.getMessages(
    req.params.conversationId,
    req.user.id,
    wantsCursorPage
      ? {
          paginated: true,
          limit: req.query.limit,
          before: req.query.before
        }
      : undefined
  );

  if (!messages) {
    return res.status(404).json({
      ok: false,
      message: "Conversacion no encontrada"
    });
  }

  if (wantsCursorPage) {
    return res.json({
      ok: true,
      data: messages.items,
      pageInfo: messages.pageInfo
    });
  }

  return res.json({
    ok: true,
    data: messages
  });
});

router.post("/conversations/:conversationId/messages", authenticate, async (req, res) => {
  const { text, e2eeEnvelope, textPreview, clientMessageId } = req.body;

  if (!text?.trim() && !e2eeEnvelope?.ciphertext) {
    return res.status(400).json({ ok: false, message: "El mensaje no puede ir vacio" });
  }

  const safeClientMessageId = normalizeClientMessageId(clientMessageId);
  if (clientMessageId && !safeClientMessageId) {
    return res.status(400).json({ ok: false, message: "Identidad de mensaje invalida" });
  }

  const conversation = await req.app.locals.store.getConversationById(req.params.conversationId);
  if (!conversation || !(await req.app.locals.store.canUserAccessConversation(req.user.id, conversation))) {
    return res.status(404).json({ ok: false, message: "Conversacion no disponible" });
  }

  if (e2eeEnvelope?.ciphertext) {
    const recipientIds = conversation.participants.filter((participantId) => participantId !== req.user.id);
    const validDirectEnvelope =
      conversation.kind === "direct" &&
      conversation.channelMode !== "radio" &&
      conversation.participants.length === 2 &&
      recipientIds.length === 1 &&
      e2eeEnvelope.recipientId === recipientIds[0] &&
      isValidE2eePublicKey(e2eeEnvelope.senderPublicKey) &&
      e2eeEnvelope.senderPublicKey === req.user.e2eePublicKey;
    if (!validDirectEnvelope) {
      return res.status(400).json({ ok: false, message: "El sobre E2EE no corresponde a este chat directo" });
    }
  }

  const messageId = safeClientMessageId
    ? buildChatMessageId({
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        senderId: req.user.id,
        clientMessageId: safeClientMessageId
      })
    : undefined;
  const message = await req.app.locals.store.addMessage(
    req.params.conversationId,
    req.user.id,
    e2eeEnvelope?.ciphertext
      ? {
          kind: "text",
          text: "",
          textPreview: String(textPreview || "").trim() || "Mensaje cifrado de extremo a extremo",
          e2eeEnvelope,
          messageId
        }
      : { kind: "text", text: text.trim(), messageId }
  );
  // Ambos stores marcan `deduplicated: false` al crear. Los fast-paths que
  // recuperan un messageId ya existente son legado y pueden no traer flag; eso
  // sigue siendo un replay y nunca debe repetir Socket/FCM.
  const { deduplicated, responseMessage } = normalizeMessageResult(message);

  if (!deduplicated) emitConversationUpdate(req, conversation, responseMessage);

  const recipientIds = await getEligibleNotificationRecipientIds(
    req.app.locals.store,
    conversation,
    req.user.id
  );
  const isDirectChat = conversation.kind === "direct" && conversation.channelMode !== "radio";
  if (!deduplicated && recipientIds.length) {
    await deliverOperationalNotification({
      io: req.app.locals.io,
      store: req.app.locals.store,
      persist: conversation.channelMode === "radio",
      payload: {
        organizationId: conversation.organizationId,
        title:
          conversation.channelMode === "radio"
            ? `Radio: ${conversation.title}`
            : isDirectChat
              ? `Mensaje directo de ${req.user.name}`
              : `Nuevo mensaje en ${conversation.title}`,
        body:
          conversation.channelMode === "radio"
            ? "Hay un mensaje operativo nuevo en el canal de radio."
            : e2eeEnvelope?.ciphertext
              ? "Recibiste un mensaje cifrado de extremo a extremo."
              : String(text || "").trim().slice(0, 140) || "Tienes un mensaje nuevo.",
        level: conversation.channelMode === "radio" ? "warning" : "info",
        category: conversation.channelMode === "radio" ? "radio" : "chat",
        targetUserIds: recipientIds,
        data: {
          conversationId: conversation.id,
          channelMode: conversation.channelMode,
          kind: "text",
          encrypted: Boolean(e2eeEnvelope?.ciphertext)
        },
        deepLink: `/chat?conversationId=${encodeURIComponent(conversation.id)}&channelMode=${encodeURIComponent(conversation.channelMode)}`
      }
    });
  }

  return res.status(deduplicated ? 200 : 201).json({
    ok: true,
    data: responseMessage,
    deduplicated
  });
});

router.post(
  "/conversations/:conversationId/audio",
  authenticate,
  audioUpload.single("file"),
  async (req, res) => {
    try {
      const conversation = await req.app.locals.store.getConversationById(req.params.conversationId);

      if (
        !conversation ||
        !(await req.app.locals.store.canUserAccessConversation(req.user.id, conversation))
      ) {
        return res.status(404).json({
          ok: false,
          message: "Conversacion no disponible"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          message: "Debes adjuntar un audio"
        });
      }

      const messageId = buildMultipartMessageId(req, conversation);
      if (!messageId) {
        return res.status(400).json({
          ok: false,
          message: "Identidad de mensaje multimedia invalida"
        });
      }

      const durationSeconds = Math.max(1, Number(req.body.durationSeconds) || 0);

      if (durationSeconds > MAX_VOICE_NOTE_SECONDS) {
        return res.status(422).json({
          ok: false,
          message: `La nota de voz no puede exceder ${MAX_VOICE_NOTE_SECONDS} segundos`
        });
      }

      const uploadedAsset = await uploadChatAudioAsset(req.file);
      const transcript = await transcribeAudioBuffer(req.file).catch(() => null);
      const message = await req.app.locals.store.addMessage(req.params.conversationId, req.user.id, {
        kind: "audio",
        text: String(req.body.caption || "").trim(),
        transcript,
        audioUrl: uploadedAsset.fileUrl,
        mimeType: req.file.mimetype || "",
        durationSeconds,
        messageId
      });
      const { deduplicated, responseMessage } = normalizeMessageResult(message);

      if (deduplicated) {
        await cleanupRedundantUpload(uploadedAsset, req, "audio");
      } else {
        emitConversationUpdate(req, conversation, responseMessage);

        const recipientIds = await getEligibleNotificationRecipientIds(
          req.app.locals.store,
          conversation,
          req.user.id
        );

        if (recipientIds.length) {
          await deliverOperationalNotification({
            io: req.app.locals.io,
            store: req.app.locals.store,
            persist: conversation.channelMode === "radio",
            payload: {
              organizationId: conversation.organizationId,
              title:
                conversation.channelMode === "radio"
                  ? `Radio: ${conversation.title}`
                  : `Nota de voz de ${req.user.name}`,
              body:
                conversation.channelMode === "radio"
                  ? "Hay una transmision de audio nueva en el canal operativo."
                  : "Recibiste una nota de voz nueva.",
              level: conversation.channelMode === "radio" ? "warning" : "info",
              category: conversation.channelMode === "radio" ? "radio" : "chat",
              targetUserIds: recipientIds,
              data: {
                conversationId: conversation.id,
                channelMode: conversation.channelMode,
                kind: "audio"
              },
              deepLink: `/chat?conversationId=${encodeURIComponent(conversation.id)}&channelMode=${encodeURIComponent(conversation.channelMode)}`
            }
          });
        }
      }

      return res.status(deduplicated ? 200 : 201).json({
        ok: true,
        data: responseMessage,
        deduplicated
      });
    } catch (error) {
      logger.error({
        module: "Chat",
        action: "voiceNote.upload_failed",
        requestId: req.traceId,
        userId: req.user?.id,
        message: "No fue posible enviar la nota de voz",
        metadata: { conversationId: req.params.conversationId },
        error
      });

      return res.status(422).json({
        ok: false,
        message: "No fue posible enviar la nota de voz"
      });
    }
  }
);

router.post(
  "/conversations/:conversationId/media",
  authenticate,
  mediaUpload.single("file"),
  async (req, res, next) => {
    try {
      const conversation = await req.app.locals.store.getConversationById(req.params.conversationId);

      if (
        !conversation ||
        !(await req.app.locals.store.canUserAccessConversation(req.user.id, conversation))
      ) {
        return res.status(404).json({
          ok: false,
          message: "Conversacion no disponible"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          message: "Debes adjuntar un archivo"
        });
      }

      const messageId = buildMultipartMessageId(req, conversation);
      if (!messageId) {
        return res.status(400).json({
          ok: false,
          message: "Identidad de mensaje multimedia invalida"
        });
      }

      const uploadedAsset = await uploadChatMediaAsset(req.file);
      const mimeType = req.file.mimetype || "";
      const kind = mimeType.startsWith("image/") ? "image" : "video";

      const message = await req.app.locals.store.addMessage(req.params.conversationId, req.user.id, {
        kind,
        text: String(req.body.caption || "").trim(),
        ...(kind === "image"
          ? { imageUrl: uploadedAsset.fileUrl }
          : { videoUrl: uploadedAsset.fileUrl }),
        mimeType,
        messageId
      });
      const { deduplicated, responseMessage } = normalizeMessageResult(message);

      if (deduplicated) {
        await cleanupRedundantUpload(uploadedAsset, req, kind);
      } else {
        emitConversationUpdate(req, conversation, responseMessage);

        const recipientIds = await getEligibleNotificationRecipientIds(
          req.app.locals.store,
          conversation,
          req.user.id
        );

        if (recipientIds.length) {
          await deliverOperationalNotification({
            io: req.app.locals.io,
            store: req.app.locals.store,
            persist: conversation.channelMode === "radio",
            payload: {
              organizationId: conversation.organizationId,
              title: kind === "image" ? `Imagen de ${req.user.name}` : `Video de ${req.user.name}`,
              body: String(req.body.caption || "").trim() || `Recibiste un ${kind === "image" ? "archivo de imagen" : "video"}.`,
              level: "info",
              category: "chat",
              targetUserIds: recipientIds,
              data: {
                conversationId: conversation.id,
                channelMode: conversation.channelMode,
                kind
              },
              deepLink: `/chat?conversationId=${encodeURIComponent(conversation.id)}&channelMode=${encodeURIComponent(conversation.channelMode)}`
            }
          });
        }
      }

      return res.status(deduplicated ? 200 : 201).json({
        ok: true,
        data: responseMessage,
        deduplicated
      });
    } catch (error) {
      error.statusCode = 422;
      error.publicMessage = "No fue posible enviar el archivo multimedia";
      return next(error);
    }
  }
);

router.get("/media/:storageKey", authenticate, async (req, res) => {
  const canAccess = await req.app.locals.store.canUserAccessChatMedia?.(
    req.user.id,
    req.params.storageKey
  );

  if (!canAccess) {
    return res.status(404).json({
      ok: false,
      message: "Audio no encontrado"
    });
  }

  const streamed = await streamChatMediaAsset(req, res, req.params.storageKey, {
    fileName: "voice-note"
  });

  if (!streamed) {
    return res.status(404).json({
      ok: false,
      message: "Audio no encontrado"
    });
  }
});

module.exports = router;