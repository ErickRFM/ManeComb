const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const store = fs.readFileSync(path.join(root, 'src/store/use-app-store.ts'), 'utf8');

const required = [
  ['try {\n    return window.localStorage.getItem(key);', 'La lectura de localStorage debe fallar cerrada sin bloquear la hidratación.'],
  ['try {\n    window.localStorage.setItem(key, value);', 'La escritura de localStorage debe tolerar políticas de privacidad/restricción.'],
  ['try {\n    window.localStorage.removeItem(key);', 'La limpieza de localStorage debe tolerar storage restringido.'],
  ['deleteStoredItem(REFRESH_TOKEN_KEY);', 'Una sesión sin refresh token debe limpiar un refresh token persistido anterior.'],
  ['rememberSession ? response.token : null', 'Login debe borrar la persistencia cuando recordar sesión está desactivado.'],
  ['rememberSession ? response.refreshToken : null', 'Login/registro deben borrar el refresh persistido cuando recordar sesión está desactivado.'],
];

for (const [contract, message] of required) {
  if (!store.includes(contract)) throw new Error(message);
}

const legacyConditionalPersistence = /if \(rememberSession\) \{\s*persistSession\(response\.token, response\.refreshToken\);\s*\}/m;
if (legacyConditionalPersistence.test(store)) {
  throw new Error('Regresó la persistencia condicional que deja credenciales viejas cuando rememberSession=false.');
}

if (!store.includes("set({ isBootstrapping: false, isHydrated: true });")) {
  throw new Error('La inicialización sin sesión debe terminar hidratación explícitamente.');
}

console.log('Ventas session storage and remember-session contracts verified.');
