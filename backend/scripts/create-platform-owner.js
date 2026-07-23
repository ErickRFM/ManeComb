/**
 * Script controlado para crear el primer platform_owner.
 *
 * Uso:
 *   npm run platform:create-owner
 *
 * Requisitos:
 * - Ejecución manual en terminal interactiva
 * - Correo solicitado interactivamente
 * - Contraseña y confirmación ocultas
 * - No aceptar argumentos de línea de comandos
 * - No aceptar valores predeterminados
 * - No imprimir la contraseña ni el hash
 * - Validar política de contraseña existente
 * - No ejecutarse durante npm install, arranque, despliegue ni pruebas
 */

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");
const readline = require("readline");

// Abort if running in test mode
if (process.env.NODE_ENV === "test" || process.argv.includes("--test")) {
  console.error("Este script no debe ejecutarse durante pruebas.");
  process.exit(1);
}

// Verify PLATFORM_JWT_SECRET exists
const platformJwtSecret = String(process.env.PLATFORM_JWT_SECRET || "").trim();
if (!platformJwtSecret || platformJwtSecret.length < 32) {
  console.error("PLATFORM_JWT_SECRET debe estar configurado y tener al menos 32 caracteres.");
  process.exit(1);
}

async function prompt(question, silent = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    if (silent) {
      const stdin = process.stdin;
      const stdout = process.stdout;
      const onData = (char) => {
        const str = String(char);
        switch (str) {
          case "\n":
          case "\r":
          case "\u0004":
            stdin.removeListener("data", onData);
            break;
          default:
            stdout.write("*");
            break;
        }
      };
      rl.question(question, (answer) => {
        stdin.removeListener("data", onData);
        resolve(answer);
      });
      stdin.on("data", onData);
    } else {
      rl.question(question, (answer) => {
        resolve(answer);
      });
    }
  }).finally(() => rl.close());
}

async function main() {
  console.log("");
  console.log("=== Creación del primer platform_owner ===");
  console.log("Este script crea el usuario administrador inicial de la plataforma.");
  console.log("");

  const email = (await prompt("Correo electrónico: ")).trim().toLowerCase();
  if (!email) {
    console.error("El correo es obligatorio.");
    process.exit(1);
  }

  const password = await prompt("Contraseña: ", true);
  if (!password || password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const confirmPassword = await prompt("Confirmar contraseña: ", true);
  if (password !== confirmPassword) {
    console.error("Las contraseñas no coinciden.");
    process.exit(1);
  }

  // Validate password policy using the existing validator
  const { validatePasswordStrength } = require("../src/utils/password-policy");
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    console.error(passwordError);
    process.exit(1);
  }

  console.log("");
  console.log("Conectando a MongoDB...");

  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) {
    console.error("MONGO_URI no está configurada.");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB_NAME || "combisapp" });
  const { PlatformUserModel } = require("../src/data/models");

  // Check if a platform_owner already exists
  const existingOwner = await PlatformUserModel.findOne({ role: "platform_owner" }).lean();
  if (existingOwner) {
    console.error("Ya existe un platform_owner. No se puede crear otro mediante este script.");
    console.error("Si necesitas un segundo owner, usa el mecanismo de gestión de usuarios de plataforma.");
    await mongoose.disconnect();
    process.exit(1);
  }

  // Check for conflicting user with same email
  const existingUser = await PlatformUserModel.findOne({ email }).lean();
  if (existingUser) {
    console.error(`Ya existe un usuario de plataforma con el correo ${email}.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const name = (await prompt("Nombre completo del owner: ")).trim();
  if (!name) {
    console.error("El nombre es obligatorio.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const user = await PlatformUserModel.create({
    _id: randomUUID(),
    name,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "platform_owner",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    passwordChangedAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdBy: "system",
    suspendedAt: null,
    suspendedReason: ""
  });

  // Record audit event
  try {
    const { recordPlatformSystemAction } = require("../src/services/platform-audit");
    await recordPlatformSystemAction({
      actorId: user._id,
      action: "platform.owner.created",
      targetType: "platform_user",
      targetId: user._id,
      severity: "info",
      metadata: { platformRole: "platform_owner", createdBy: "system" }
    });
  } catch {
    // Audit failure should not block owner creation
  }

  await mongoose.disconnect();

  console.log("");
  console.log("✓ Platform owner creado exitosamente.");
  console.log(`  Email: ${email}`);
  console.log(`  Rol: platform_owner`);
  console.log("");
  console.log("IMPORTANTE:");
  console.log("- No compartas estas credenciales.");
  console.log("- Habilita MFA antes de usar este usuario en producción (ADM-SEC-MFA-01).");
  console.log("");
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
