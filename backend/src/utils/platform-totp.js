const crypto = require("crypto");

const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "sha1";
const TOTP_WINDOW = 1;
const TOTP_ISSUER = "ManeComb";

function generateTOTPSecret() {
  return crypto.randomBytes(20).toString("base64url");
}

function totpCounter(timestamp, period) {
  return Math.floor(timestamp / 1000 / period);
}

function generateTOTP(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buffer = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    buffer[i] = counter & 0xff;
    counter >>= 8;
  }
  const hmac = crypto.createHmac(TOTP_ALGORITHM, key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return String(otp).padStart(TOTP_DIGITS, "0");
}

function verifyTOTP(token, secretBase32, timestamp) {
  const counter = totpCounter(timestamp, TOTP_PERIOD);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    const expected = generateTOTP(secretBase32, counter + offset);
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

function generateTOTPUri(secretBase32, email) {
  const encodedEmail = encodeURIComponent(email);
  const encodedIssuer = encodeURIComponent(TOTP_ISSUER);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let result = "";
  let bits = 0;
  let value = 0;
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

function base32Decode(str) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = str.replace(/=+$/, "").toUpperCase();
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function generateBase32Secret() {
  return base32Encode(crypto.randomBytes(20));
}

module.exports = {
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  generateTOTPUri,
  generateBase32Secret,
  base32Encode,
  base32Decode,
  TOTP_PERIOD,
  TOTP_DIGITS,
  TOTP_ALGORITHM,
  TOTP_WINDOW,
  TOTP_ISSUER
};
