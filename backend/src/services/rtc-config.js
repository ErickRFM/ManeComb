const crypto = require("crypto");
const {
  TURN_CREDENTIAL,
  TURN_CREDENTIAL_TTL_SECONDS,
  TURN_REALM,
  TURN_SECRET,
  TURN_URLS,
  TURN_USERNAME
} = require("../config/env");

function buildCoturnRestCredentials(user) {
  if (!TURN_SECRET || !TURN_REALM || !TURN_URLS.length) {
    return null;
  }

  const expiresAtSeconds =
    Math.floor(Date.now() / 1000) + Math.max(60, Number(TURN_CREDENTIAL_TTL_SECONDS) || 3600);
  const subject =
    String(user?.id || user?.email || user?.name || "operador")
      .trim()
      .replace(/[^\w.-]+/g, "-")
      .slice(0, 48) || "operador";
  const username = `${expiresAtSeconds}:${subject}`;
  const credential = crypto
    .createHmac("sha1", TURN_SECRET)
    .update(username)
    .digest("base64");

  return {
    credential,
    credentialExpiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    credentialMode: "coturn_rest",
    realm: TURN_REALM,
    username
  };
}

function getRtcIceConfig(user = null) {
  const iceServers = [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ];
  let credentialExpiresAt = null;
  let credentialMode = "stun_only";
  let realm = "";

  const dynamicTurnCredentials = buildCoturnRestCredentials(user);

  if (dynamicTurnCredentials) {
    iceServers.push({
      urls: TURN_URLS,
      username: dynamicTurnCredentials.username,
      credential: dynamicTurnCredentials.credential
    });
    credentialExpiresAt = dynamicTurnCredentials.credentialExpiresAt;
    credentialMode = dynamicTurnCredentials.credentialMode;
    realm = dynamicTurnCredentials.realm;
  } else if (TURN_URLS.length && TURN_USERNAME && TURN_CREDENTIAL) {
    iceServers.push({
      urls: TURN_URLS,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL
    });
    credentialMode = "static";
  }

  return {
    iceServers,
    turnEnabled: iceServers.length > 1,
    credentialExpiresAt,
    credentialMode,
    realm
  };
}

function getRtcReadiness() {
  const config = getRtcIceConfig();
  const hasDynamicTurn = Boolean(TURN_URLS.length && TURN_SECRET && TURN_REALM);
  const hasStaticTurn = Boolean(TURN_URLS.length && TURN_USERNAME && TURN_CREDENTIAL);
  const missing = [];

  if (!TURN_URLS.length) {
    missing.push("TURN_URLS");
  }

  if (!hasDynamicTurn && !hasStaticTurn) {
    if (!TURN_SECRET || !TURN_REALM) {
      missing.push("TURN_SECRET", "TURN_REALM");
    }

    if (!TURN_USERNAME || !TURN_CREDENTIAL) {
      missing.push("TURN_USERNAME", "TURN_CREDENTIAL");
    }
  }

  return {
    mode: config.turnEnabled
      ? config.credentialMode === "coturn_rest"
        ? "turn_dynamic+stun"
        : "turn_static+stun"
      : "stun_only",
    ready: config.turnEnabled,
    missing: config.turnEnabled ? [] : Array.from(new Set(missing.filter(Boolean)))
  };
}

module.exports = {
  getRtcIceConfig,
  getRtcReadiness
};
