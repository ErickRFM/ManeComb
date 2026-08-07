const { uploadChatAudioAsset } = require("../../services/chat-media");

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const FRAME_BYTES = 640;
const FRAME_BASE64_LENGTH = Math.ceil(FRAME_BYTES / 3) * 4;
const MAX_TRANSMISSION_BYTES = SAMPLE_RATE * 2 * 60;

function createWavBuffer(pcmBuffer) {
  const header = Buffer.alloc(44);
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function appendFrame(transmission, base64Data) {
  const encoded = String(base64Data || "").trim();
  if (encoded.length !== FRAME_BASE64_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const frame = Buffer.from(encoded, "base64");
  if (frame.length !== FRAME_BYTES || frame.toString("base64") !== encoded) return false;
  if (transmission.byteLength + frame.length > MAX_TRANSMISSION_BYTES) return false;
  transmission.frames.push(frame);
  transmission.byteLength += frame.length;
  return true;
}

const FRAME_DURATION_MS = 20;
const FRAME_BURST_ALLOWANCE = 50;

/**
 * Unica validacion de cadencia/orden/tamanio de un frame PTT. Se extrajo del
 * handler de socket para poder certificarla sin levantar transporte.
 *
 * @returns {{ ok: true } | { ok: false, reason: string, fatal: boolean }}
 *   `fatal` indica que la transmision debe terminarse, no solo descartar el frame.
 */
function evaluateFrame(transmission, { sequence, sentAt, base64Length, now = Date.now() }) {
  if (!Number.isInteger(sequence)) {
    return { ok: false, reason: "invalid_owner", fatal: false };
  }

  if (sequence <= transmission.lastSequence) {
    return { ok: false, reason: "duplicate", fatal: false };
  }

  const maxSequenceForElapsedTime =
    Math.floor((now - transmission.startedAt) / FRAME_DURATION_MS) + FRAME_BURST_ALLOWANCE;
  if (sequence > maxSequenceForElapsedTime) {
    return { ok: false, reason: "rate_exceeded", fatal: true };
  }

  if (transmission.byteLength + FRAME_BYTES > MAX_TRANSMISSION_BYTES) {
    return { ok: false, reason: "max_duration", fatal: true };
  }

  if (
    sequence !== transmission.lastSequence + 1 ||
    !Number.isFinite(sentAt) ||
    sentAt <= 0 ||
    base64Length !== FRAME_BASE64_LENGTH
  ) {
    return { ok: false, reason: "invalid_frame", fatal: true };
  }

  return { ok: true };
}

async function persistTransmission(store, transmission) {
  if (!transmission.byteLength) return null;
  const pcm = Buffer.concat(transmission.frames, transmission.byteLength);
  const wav = createWavBuffer(pcm);
  const uploadedAsset = await uploadChatAudioAsset({
    buffer: wav,
    mimetype: "audio/wav",
    originalname: `radio-${transmission.id}.wav`,
    size: wav.length
  });
  const durationSeconds = Math.max(0.02, Number((pcm.length / (SAMPLE_RATE * 2)).toFixed(3)));
  return store.addMessage(transmission.channelId, transmission.userId, {
    messageId: `radio:${transmission.id}`,
    transmissionId: transmission.id,
    kind: "audio",
    text: "",
    audioUrl: uploadedAsset.fileUrl,
    mimeType: "audio/wav",
    durationSeconds
  });
}

module.exports = {
  FRAME_BURST_ALLOWANCE,
  FRAME_BYTES,
  FRAME_BASE64_LENGTH,
  FRAME_DURATION_MS,
  MAX_TRANSMISSION_BYTES,
  appendFrame,
  createWavBuffer,
  evaluateFrame,
  persistTransmission
};
