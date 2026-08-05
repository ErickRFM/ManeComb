const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const runtimeFiles = [
  "src/modules/auth/routes.js",
  "../mobile/src/screens/password-recovery/password-recovery-screens.tsx",
  "../ventas/screens/password-recovery/password-recovery-sent-screen.tsx"
];

for (const relativePath of runtimeFiles) {
  const source = fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
  assert.doesNotMatch(
    source,
    /si (?:el correo|la cuenta) existe|si existe una cuenta/i,
    `${relativePath} no debe mostrar mensajes condicionales sobre la existencia de una cuenta`
  );
}

const backendSource = fs.readFileSync(
  path.resolve(__dirname, "../src/modules/auth/routes.js"),
  "utf8"
);
assert.match(backendSource, /PASSWORD_RECOVERY_ACCEPTED_MESSAGE/);
assert.match(backendSource, /Solicitud recibida\. Revisa tu correo/);

const mobileSource = fs.readFileSync(
  path.resolve(__dirname, "../../mobile/src/screens/password-recovery/password-recovery-screens.tsx"),
  "utf8"
);
const ventasSource = fs.readFileSync(
  path.resolve(__dirname, "../../ventas/screens/password-recovery/password-recovery-sent-screen.tsx"),
  "utf8"
);

for (const source of [mobileSource, ventasSource]) {
  assert.match(source, /Solicitud recibida para/);
  assert.match(source, /carpeta de spam|bandeja de entrada y spam/);
}

console.log("ok - neutral password recovery notices");
