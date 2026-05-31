const {
  AUDIO_TRANSCRIPTION_API_KEY,
  AUDIO_TRANSCRIPTION_API_URL,
  AUDIO_TRANSCRIPTION_LANGUAGE,
  AUDIO_TRANSCRIPTION_MODEL,
  AUDIO_TRANSCRIPTION_PROVIDER
} = require("../config/env");

function getAudioTranscriptionReadiness() {
  const provider = String(AUDIO_TRANSCRIPTION_PROVIDER || "none").trim().toLowerCase();

  if (provider === "none") {
    return {
      provider: "none",
      ready: false,
      missing: ["AUDIO_TRANSCRIPTION_PROVIDER"]
    };
  }

  const missing = [];

  if (!AUDIO_TRANSCRIPTION_API_KEY) {
    missing.push("AUDIO_TRANSCRIPTION_API_KEY");
  }

  if (provider !== "openai" && !AUDIO_TRANSCRIPTION_API_URL) {
    missing.push("AUDIO_TRANSCRIPTION_API_URL");
  }

  return {
    provider,
    ready: missing.length === 0,
    missing
  };
}

async function transcribeAudioBuffer(file) {
  const provider = String(AUDIO_TRANSCRIPTION_PROVIDER || "none").trim().toLowerCase();

  if (provider === "none") {
    return null;
  }

  if (!file?.buffer?.length) {
    throw new Error("No se recibio audio para transcribir");
  }

  const endpoint =
    provider === "openai"
      ? AUDIO_TRANSCRIPTION_API_URL || "https://api.openai.com/v1/audio/transcriptions"
      : AUDIO_TRANSCRIPTION_API_URL;

  if (!endpoint || !AUDIO_TRANSCRIPTION_API_KEY) {
    return null;
  }

  const formData = new FormData();
  const blob = new Blob([file.buffer], {
    type: file.mimetype || "audio/webm"
  });

  formData.append(
    "file",
    blob,
    file.originalname || `voice-note-${Date.now()}.webm`
  );
  formData.append("model", AUDIO_TRANSCRIPTION_MODEL);
  formData.append("language", AUDIO_TRANSCRIPTION_LANGUAGE);
  formData.append("response_format", "json");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AUDIO_TRANSCRIPTION_API_KEY}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "La transcripcion externa devolvio error");
  }

  const payload = await response.json();
  const text = String(payload?.text || payload?.transcript || "").trim();
  return text || null;
}

module.exports = {
  getAudioTranscriptionReadiness,
  transcribeAudioBuffer
};
