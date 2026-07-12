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
    kind: "audio",
    text: "",
    audioUrl: uploadedAsset.fileUrl,
    mimeType: "audio/wav",
    durationSeconds
  });
}

module.exports = {
  FRAME_BYTES,
  FRAME_BASE64_LENGTH,
  appendFrame,
  createWavBuffer,
  persistTransmission
};
