const { Router } = require("express");
const multer = require("multer");
const { authenticate } = require("../../middlewares/authenticate");
const { getOrganizationId } = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const { transcribeAudioBuffer } = require("../../services/audio-transcription");
const { getChatMediaAsset, uploadChatAudioAsset, uploadChatMediaAsset } = require("../../services/chat-media");
const { deliverOperationalNotification } = require("../../services/notification-delivery");

const router = Router();
const MAX_VOICE_NOTE_SECONDS = 45;

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

router.use(authenticate, requireOperationalAccess);

function emitConversationUpdate(req, conversationId, message) {
  req.app.locals.io
    ?.to(`conversation:${conversationId}`)
    .emit("chat:message", message);
  const organizationId = getOrganizationId(req.user);

  if (organizationId) {
    req.app.locals.io?.to(`org:${organizationId}`).emit("conversation:updated", {
      conversationId
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

router.post("/conversations/direct", authenticate, async (req, res) => {
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
    return res.status(400).json({
      ok: false,
      message: error.message || "No fue posible abrir el canal directo"
    });
  }
});

router.get("/conversations/:conversationId/messages", authenticate, async (req, res) => {
  const messages = await req.app.locals.store.getMessages(req.params.conversationId, req.user.id);

  if (!messages) {
    return res.status(404).json({
      ok: false,
      message: "Conversacion no encontrada"
    });
  }

  return res.json({
    ok: true,
    data: messages
  });
});

router.post("/conversations/:conversationId/messages", authenticate, async (req, res) => {
  const { text, e2eeEnvelope, textPreview } = req.body;

  if (!text?.trim() && !e2eeEnvelope?.ciphertext) {
    return res.status(400).json({
      ok: false,
      message: "El mensaje no puede ir vacio"
    });
  }

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

  const message = await req.app.locals.store.addMessage(
    req.params.conversationId,
    req.user.id,
    e2eeEnvelope?.ciphertext
      ? {
          kind: "text",
          text: "",
          textPreview: String(textPreview || "").trim() || "Mensaje cifrado de extremo a extremo",
          e2eeEnvelope
        }
      : text.trim()
  );

  emitConversationUpdate(req, req.params.conversationId, message);

  const recipientIds = conversation.participants.filter((participantId) => participantId !== req.user.id);
  const isDirectChat = conversation.kind === "direct" && conversation.channelMode !== "radio";

  if (recipientIds.length) {
    await deliverOperationalNotification({
      io: req.app.locals.io,
      store: req.app.locals.store,
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
            kind: "text"
          },
          deepLink: `/chat?conversationId=${encodeURIComponent(conversation.id)}&channelMode=${encodeURIComponent(conversation.channelMode)}`
        }
      });
  }

  return res.status(201).json({
    ok: true,
    data: message
  });
});

router.post(
  "/transcribe-search",
  authenticate,
  audioUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          message: "Debes adjuntar un audio para la busqueda por voz"
        });
      }

      const transcript = await transcribeAudioBuffer(req.file);

      return res.json({
        ok: true,
        data: {
          transcript: transcript || ""
        }
      });
    } catch (error) {
      return res.status(422).json({
        ok: false,
        message: error.message || "No fue posible transcribir el audio"
      });
    }
  }
);

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
        durationSeconds
      });

      emitConversationUpdate(req, req.params.conversationId, message);

      const recipientIds = conversation.participants.filter((participantId) => participantId !== req.user.id);

      if (recipientIds.length) {
        await deliverOperationalNotification({
          io: req.app.locals.io,
          store: req.app.locals.store,
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

      return res.status(201).json({
        ok: true,
        data: message
      });
    } catch (error) {
      return res.status(422).json({
        ok: false,
        message: error.message || "No fue posible enviar la nota de voz"
      });
    }
  }
);

router.post(
  "/conversations/:conversationId/media",
  authenticate,
  mediaUpload.single("file"),
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
          message: "Debes adjuntar un archivo"
        });
      }

      const uploadedAsset = await uploadChatMediaAsset(req.file);
      const mimeType = req.file.mimetype || "";
      const kind = mimeType.startsWith("image/") ? "image" : "video";

      const message = await req.app.locals.store.addMessage(req.params.conversationId, req.user.id, {
        kind,
        text: String(req.body.caption || "").trim(),
        audioUrl: uploadedAsset.fileUrl, // Reusing audioUrl field for generic media URL
        mimeType
      });

      emitConversationUpdate(req, req.params.conversationId, message);

      const recipientIds = conversation.participants.filter((participantId) => participantId !== req.user.id);

      if (recipientIds.length) {
        await deliverOperationalNotification({
          io: req.app.locals.io,
          store: req.app.locals.store,
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

      return res.status(201).json({
        ok: true,
        data: message
      });
    } catch (error) {
      return res.status(422).json({
        ok: false,
        message: error.message || "No fue posible enviar el archivo multimedia"
      });
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

  const asset = await getChatMediaAsset(req.params.storageKey);

  if (!asset) {
    return res.status(404).json({
      ok: false,
      message: "Audio no encontrado"
    });
  }

  if (asset.redirectUrl) {
    return res.redirect(asset.redirectUrl);
  }

  res.setHeader("Content-Type", asset.mimeType || "audio/mp4");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(asset.originalFileName || "voice-note")}"`
  );

  asset.stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        message: "No fue posible reproducir el audio"
      });
      return;
    }

    res.end();
  });

  asset.stream.pipe(res);
});

module.exports = router;
