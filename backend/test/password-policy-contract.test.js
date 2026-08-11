const assert = require("node:assert/strict");

const { validatePasswordStrength } = require("../src/utils/password-policy");

const POLICY_ERROR = "La contraseña debe incluir letras, números y al menos un carácter especial";

function run() {
  assert.equal(
    validatePasswordStrength("12345678_r"),
    null,
    "La política acepta minúscula + números + guion bajo"
  );
  assert.equal(
    validatePasswordStrength("12345678_R"),
    null,
    "La política acepta letras mayúsculas o minúsculas; no exige ambas"
  );
  assert.equal(
    validatePasswordStrength("contraseña123!"),
    null,
    "Las letras Unicode como ñ deben contar como letras cuando existe un símbolo real"
  );
  assert.equal(
    validatePasswordStrength("Árbol123_"),
    null,
    "Las letras acentuadas deben contar como letras"
  );
  assert.equal(
    validatePasswordStrength("contraseña123"),
    POLICY_ERROR,
    "La ñ es una letra y no debe satisfacer por sí sola el requisito de carácter especial"
  );
  assert.equal(
    validatePasswordStrength("contraseña 123"),
    POLICY_ERROR,
    "Los espacios no deben contarse como carácter especial"
  );
  assert.equal(
    validatePasswordStrength("12345678_"),
    POLICY_ERROR,
    "Debe seguir exigiéndose al menos una letra"
  );
  assert.equal(
    validatePasswordStrength("abcdefgh_"),
    POLICY_ERROR,
    "Debe seguir exigiéndose al menos un número"
  );
  assert.equal(
    validatePasswordStrength("abcdefgh1"),
    POLICY_ERROR,
    "Debe seguir exigiéndose al menos un carácter especial"
  );

  console.log("ok - password policy Unicode: letras reales, números y símbolo/puntuación real");
}

run();
