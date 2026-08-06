const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const { PlatformUserModel } = require("./models");
const { validatePasswordStrength } = require("../utils/password-policy");

function createPlatformUserMongoStore() {
  async function countPlatformOwners() {
    return PlatformUserModel.countDocuments({ role: "platform_owner" });
  }

  async function getPlatformUserById(userId) {
    if (!userId) return null;
    return PlatformUserModel.findById(userId).lean();
  }

  async function getPlatformUserByEmail(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) return null;
    return PlatformUserModel.findOne({ email: normalizedEmail }).lean();
  }

  async function createPlatformUser(payload) {
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "").trim();

    if (!name || !email || !password) {
      throw new Error("Nombre, correo y contraseña son obligatorios");
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) throw new Error(passwordError);

    const existing = await PlatformUserModel.findOne({ email }).lean();
    if (existing) throw new Error("El correo ya existe");

    return PlatformUserModel.create({
      _id: randomUUID(),
      name,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role: payload.role || "platform_viewer",
      status: payload.status || "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
      passwordChangedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdBy: payload.createdBy || null,
      suspendedAt: null,
      suspendedReason: "",
      mfaEnabled: false,
      mfaEnrollmentRequired:
        payload.mfaEnrollmentRequired !== undefined
          ? payload.mfaEnrollmentRequired
          : false,
      mfaSecretEncrypted: null,
      mfaBackupCodes: [],
      mfaSetupCompletedAt: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null
    });
  }

  async function updatePlatformUser(userId, updates) {
    const setFields = {};
    if (updates.name !== undefined) setFields.name = String(updates.name).trim();
    if (updates.role !== undefined) setFields.role = updates.role;
    if (updates.status !== undefined) setFields.status = updates.status;
    if (updates.lastLoginAt !== undefined) setFields.lastLoginAt = updates.lastLoginAt;
    if (updates.failedLoginAttempts !== undefined) {
      setFields.failedLoginAttempts = updates.failedLoginAttempts;
    }
    if (updates.lockedUntil !== undefined) setFields.lockedUntil = updates.lockedUntil;
    if (updates.passwordHash !== undefined) setFields.passwordHash = updates.passwordHash;
    if (updates.passwordChangedAt !== undefined) {
      setFields.passwordChangedAt = updates.passwordChangedAt;
    }
    if (updates.suspendedAt !== undefined) setFields.suspendedAt = updates.suspendedAt;
    if (updates.suspendedReason !== undefined) {
      setFields.suspendedReason = updates.suspendedReason;
    }
    if (updates.mfaEnabled !== undefined) setFields.mfaEnabled = updates.mfaEnabled;
    if (updates.mfaEnrollmentRequired !== undefined) {
      setFields.mfaEnrollmentRequired = updates.mfaEnrollmentRequired;
    }
    if (updates.mfaSecretEncrypted !== undefined) {
      setFields.mfaSecretEncrypted = updates.mfaSecretEncrypted;
    }
    if (updates.mfaBackupCodes !== undefined) {
      setFields.mfaBackupCodes = updates.mfaBackupCodes;
    }
    if (updates.mfaSetupCompletedAt !== undefined) {
      setFields.mfaSetupCompletedAt = updates.mfaSetupCompletedAt;
    }
    if (updates.mfaFailedAttempts !== undefined) {
      setFields.mfaFailedAttempts = updates.mfaFailedAttempts;
    }
    if (updates.mfaLockedUntil !== undefined) {
      setFields.mfaLockedUntil = updates.mfaLockedUntil;
    }
    setFields.updatedAt = new Date();

    return PlatformUserModel.findByIdAndUpdate(
      userId,
      { $set: setFields },
      { returnDocument: "after" }
    ).lean();
  }

  return {
    countPlatformOwners,
    createPlatformUser,
    getPlatformUserByEmail,
    getPlatformUserById,
    updatePlatformUser
  };
}

module.exports = {
  createPlatformUserMongoStore
};
