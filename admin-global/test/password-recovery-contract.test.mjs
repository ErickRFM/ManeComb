import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const api = read('src/features/auth/api.ts');
const login = read('src/features/auth/screens/login-screen.tsx');
const recovery = read('src/features/auth/screens/password-recovery-screens.tsx');

assert.match(login, /\/admin\/forgot-password/);
assert.match(login, /¿Olvidaste tu contraseña\?/);
assert.match(app, /case '\/admin\/forgot-password'/);
assert.match(app, /case '\/admin\/reset-password'/);
assert.match(api, /platformForgotPasswordRequest/);
assert.match(api, /platformResetPasswordRequest/);
assert.match(api, /\/forgot-password/);
assert.match(api, /\/reset-password/);
assert.match(recovery, /El enlace vence en 1 hora/);
assert.match(recovery, /Las contraseñas no coinciden/);
assert.match(recovery, /Tus sesiones anteriores fueron cerradas/);

console.log('ok - Admin Global password recovery contract');
