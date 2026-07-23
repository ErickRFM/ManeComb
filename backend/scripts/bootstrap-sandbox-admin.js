const path = require("path");
const readline = require("readline");
const { randomUUID } = require("crypto");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
  quiet: true
});

const EXPECTED_DATABASE = "manecomb_sandbox";
const EXPECTED_PAYMENT_ENVIRONMENT = "sandbox";

class BootstrapError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function validateBootstrapEnvironment(env) {
  const databaseName = String(env.MONGO_DB_NAME || "").trim();
  const paymentEnvironment = String(env.MERCADO_PAGO_ENV || "").trim().toLowerCase();
  const bootstrapAllowed =
    String(env.ALLOW_SANDBOX_ADMIN_BOOTSTRAP || "").trim().toLowerCase() === "true";
  const mongoConfigured = Boolean(
    String(env.MONGO_URI || env.MONGODB_URI || "").trim()
  );

  if (databaseName !== EXPECTED_DATABASE) {
    throw new BootstrapError("sandbox_database_required");
  }

  if (paymentEnvironment !== EXPECTED_PAYMENT_ENVIRONMENT) {
    throw new BootstrapError("sandbox_payment_environment_required");
  }

  if (!bootstrapAllowed) {
    throw new BootstrapError("sandbox_bootstrap_authorization_required");
  }

  if (!mongoConfigured) {
    throw new BootstrapError("mongo_configuration_required");
  }

  return {
    databaseName,
    mongoConfigured,
    paymentEnvironment
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function bootstrapSandboxAdmin({
  bcrypt,
  connect,
  credentials,
  disconnect,
  env,
  getConnectionState,
  userModel,
  uuid = randomUUID
}) {
  const configuration = validateBootstrapEnvironment(env);
  const email = normalizeEmail(credentials.email);
  const password = String(credentials.password || "");
  const confirmation = String(credentials.confirmation || "");

  if (!validateEmail(email)) {
    throw new BootstrapError("invalid_admin_email");
  }

  if (password !== confirmation) {
    throw new BootstrapError("password_confirmation_mismatch");
  }

  const { validatePasswordStrength } = require("../src/utils/password-policy");
  if (validatePasswordStrength(password)) {
    throw new BootstrapError("password_policy_rejected");
  }

  await connect();

  try {
    if (!getConnectionState().connected) {
      throw new BootstrapError("mongo_connection_required");
    }

    const existing = await userModel.findOne({ email }).lean();

    if (existing) {
      if (existing.role === "admin" && existing.accountType !== "company_owner") {
        return {
          created: false,
          database: configuration.databaseName,
          role: "admin",
          status: "already_exists"
        };
      }

      throw new BootstrapError("conflicting_non_admin_user");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await userModel.create({
      _id: uuid(),
      accountType: "operations",
      avatar: "AS",
      email,
      name: "Administrador Sandbox",
      organizationId: "",
      passwordHash,
      phone: "Pendiente",
      role: "admin",
      shift: "Centro de control",
      status: "offline",
      userStatus: "active"
    });

    return {
      created: true,
      database: configuration.databaseName,
      role: "admin",
      status: "created"
    };
  } finally {
    await disconnect();
  }
}

function askVisible(prompt) {
  const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    input.question(prompt, (answer) => {
      input.close();
      resolve(answer);
    });
  });
}

function askHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new BootstrapError("interactive_terminal_required");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(value);
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          reject(new BootstrapError("bootstrap_cancelled"));
          return;
        }

        if (character === "\r" || character === "\n") {
          finish();
          return;
        }

        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }

        value += character;
      }
    };

    process.stdin.on("data", onData);
  });
}

async function main() {
  validateBootstrapEnvironment(process.env);

  const email = await askVisible("Correo del administrador Sandbox: ");
  const password = await askHidden("Contraseña: ");
  const confirmation = await askHidden("Confirmar contraseña: ");
  const bcrypt = require("bcryptjs");
  const mongoose = require("mongoose");
  const { connectDB, getDbState } = require("../src/config/db");
  const { UserModel } = require("../src/data/models");

  const result = await bootstrapSandboxAdmin({
    bcrypt,
    connect: connectDB,
    credentials: { confirmation, email, password },
    disconnect: async () => {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    },
    env: process.env,
    getConnectionState: getDbState,
    userModel: UserModel
  });

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      code: error.code || "sandbox_admin_bootstrap_failed"
    }));
    process.exitCode = 1;
  });
}

module.exports = {
  BootstrapError,
  bootstrapSandboxAdmin,
  normalizeEmail,
  validateBootstrapEnvironment
};
