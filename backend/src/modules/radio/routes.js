const { Router } = require("express");
const multer = require("multer");
const { authenticate } = require("../../middlewares/authenticate");
const { getOrganizationId } = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const { transcribeAudioBuffer } = require("../../services/audio-transcription");
const { streamChatMediaAsset, uploadChatAudioAsset } = require("../../services/chat-media");

const router = Router();
const MAX_RADIO_AUDIO_SECONDS = 60;

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    const mimeType = String(file.mimetype || "").toLowerCase();
    const isAudio = mimeType.startsWith("audio/");
    callback(isAudio ? null : new Error("Solo se permiten archivos de audio"), isAudio);
  }
});

router.use(authenticate, requireOperationalAccess);

function emitRadioMessage(req, conversation, message) {
  const conversationId = conversation.id;

  req.app.locals.io
    ?.to(`conversation:${conversationId}`)
    .emit("radio:message:new", {
      conversationId,
      message
    });

  const organizationId = getOrganizationId(req.user);

  if (organizationId) {
    req.app.locals.io?.to(`org:${organizationId}`).emit("conversation:updated", {
      conversationId
    });
  }
}

async function getAccessibleRadioConversation(req, channelId) {
  const safeChannelId = String(channelId || "").trim();

  if (!safeChannelId) {
    return null;
  }

  const conversation = await req.app.locals.store.getConversationById(safeChannelId);

  if (
    !conversation ||
    conversation.channelMode !== "radio" ||
    !(await req.app.locals.store.canUserAccessConversation(req.user.id, conversation))
  ) {
    return null;
  }

  return conversation;
}

function getStorageKeyFromAudioUrl(audioUrl) {
  const match = String(audioUrl || "").match(/\/api\/chat\/media\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function findAccessibleRadioAudio(req, messageId) {
  const conversations = await req.app.locals.store.getConversationsForUser(req.user.id);

  for (const conversation of conversations) {
    if (conversation.channelMode !== "radio") {
      continue;
    }

    const messages = await req.app.locals.store.getMessages(conversation.id, req.user.id);
    const message = Array.isArray(messages)
      ? messages.find((entry) => entry.id === messageId && entry.kind === "audio")
      : null;

    if (message) {
      return {
        conversation,
        message,
        storageKey: getStorageKeyFromAudioUrl(message.audioUrl)
      };
    }
  }

  return null;
}

router.get("/messages", async (req, res) => {
  const conversation = await getAccessibleRadioConversation(req, req.query.channelId);

  if (!conversation) {
    return res.status(404).json({
      ok: false,
      message: "Canal de radio no disponible"
    });
  }

  const messages = await req.app.locals.store.getMessages(conversation.id, req.user.id);

  return res.json({
    ok: true,
    data: Array.isArray(messages)
      ? messages.filter((message) => message.kind === "audio")
      : []
  });
});

router.post("/messages", audioUpload.single("file"), async (req, res) => {
  try {
    const conversation = await getAccessibleRadioConversation(req, req.body.channelId);

    if (!conversation) {
      return res.status(404).json({
        ok: false,
        message: "Canal de radio no disponible"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "Debes adjuntar un audio"
      });
    }

    const durationSeconds = Math.max(
      1,
      Number(req.body.durationSeconds || req.body.duration || 0)
    );

    if (durationSeconds > MAX_RADIO_AUDIO_SECONDS) {
      return res.status(422).json({
        ok: false,
        message: `La transmision no puede exceder ${MAX_RADIO_AUDIO_SECONDS} segundos`
      });
    }

    const uploadedAsset = await uploadChatAudioAsset(req.file);
    const transcript = await transcribeAudioBuffer(req.file).catch(() => null);
    const message = await req.app.locals.store.addMessage(conversation.id, req.user.id, {
      kind: "audio",
      text: String(req.body.caption || "").trim(),
      transcript,
      audioUrl: uploadedAsset.fileUrl,
      mimeType: req.file.mimetype || "audio/mp4",
      durationSeconds
    });

    emitRadioMessage(req, conversation, message);

    return res.status(201).json({
      ok: true,
      data: message
    });
  } catch (error) {
    return res.status(422).json({
      ok: false,
      message: error.message || "No fue posible guardar el audio de radio"
    });
  }
});

router.get("/messages/:messageId/audio", async (req, res) => {
  const result = await findAccessibleRadioAudio(req, req.params.messageId);

  if (!result?.storageKey) {
    return res.status(404).json({
      ok: false,
      message: "Audio no encontrado"
    });
  }

  const streamed = await streamChatMediaAsset(req, res, result.storageKey, {
    fileName: "radio-audio",
    mimeType: result.message.mimeType || "audio/mp4"
  });

  if (!streamed) {
    return res.status(404).json({
      ok: false,
      message: "Audio no encontrado"
    });
  }
});

module.exports = router;
