import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const navigation = read('src/features/platform/navigation.ts');
const shell = read('src/features/platform/components/admin-shell.tsx');
const overview = read('src/features/platform/screens/overview-screen.tsx');
const pendingModule = read('src/features/platform/screens/pending-module-screen.tsx');
const companies = read('src/features/platform/companies/companies-screen.tsx');
const operations = read('src/features/platform/operations/operations-screens.tsx');
const governance = read('src/features/platform/governance/governance-screens.tsx');
const authLayout = read('src/features/auth/components/auth-layout.tsx');
const login = read('src/features/auth/screens/login-screen.tsx');
const mfaSetup = read('src/features/auth/screens/mfa-setup-screen.tsx');
const mfaVerify = read('src/features/auth/screens/mfa-verify-screen.tsx');

// UX-01: la navegación no filtra fases de desarrollo a la interfaz final.
assert.doesNotMatch(navigation, /phase:/);
assert.doesNotMatch(shell, /phaseBadge|phaseBadgeReady/);
assert.doesNotMatch(pendingModule, /item\.phase|styles\.phase/);
assert.match(shell, /accessibilityState=\{\{ selected: active \}\}/);
assert.match(shell, /accessibilityLabel=\{`Ir a \$\{item\.label\}`\}/);

// UX-02: shell y acciones principales respetan targets táctiles y jerarquía semántica.
assert.match(shell, /navigationItemMobile: \{[^}]*minHeight: 44/s);
assert.match(shell, /logoutButton: \{[^}]*minHeight: 44/s);
assert.match(shell, /mobileLogoutButton: \{[^}]*minHeight: 44/s);
assert.match(shell, /accessibilityRole="header"/);
assert.match(authLayout, /accessibilityRole="header"/);

// UX-03: login conserva contraseñas literalmente y ofrece autofill/feedback accesible.
assert.match(login, /login\(email\.trim\(\), password\)/);
assert.doesNotMatch(login, /password\.trim\(\)/);
assert.match(login, /autoComplete="email"/);
assert.match(login, /textContentType="password"/);
assert.match(login, /accessibilityRole="alert"/);
assert.match(login, /minHeight: 48/);

// UX-04: dashboard y empresas son legibles en móvil y evitan lenguaje interno innecesario.
assert.match(overview, /Vista general de empresas, usuarios, unidades y actividad comercial/);
assert.match(overview, /accessibilityRole="header"/);
assert.match(companies, /const compact = width < 720/);
assert.match(companies, /styles\.mobileDataCard/);
assert.match(companies, /accessibilityState=\{\{ selected: active \}\}/);
assert.match(companies, /secondaryButton: \{[^}]*minHeight: 44/s);
assert.doesNotMatch(companies, />retired</);

// UX-05: Comercial, Sistema y Auditoría humanizan estados y mantienen controles accesibles.
assert.match(operations, /function formatStatus/);
assert.match(operations, /accessibilityState=\{\{ selected: active \}\}/);
assert.match(operations, /secondaryButton: \{[^}]*minHeight: 44/s);
assert.match(operations, /Nunca expone secretos, tokens ni URLs privadas/);
assert.match(operations, /IP, user-agent y payloads crudos permanecen fuera/);

// UX-06: gobierno conserva seguridad pero evita modales cortados y jerga cruda en acciones.
assert.match(governance, /ACTION_LABELS/);
assert.match(governance, /textContentType="newPassword"/);
assert.match(governance, /actionOverlayContent/);
assert.match(governance, /keyboardShouldPersistTaps="handled"/);
assert.match(governance, /accessibilityViewIsModal/);
assert.match(governance, /secondaryButton: \{[^}]*minHeight: 44/s);
assert.match(governance, /dangerButton: \{[^}]*minHeight: 44/s);
assert.match(governance, /expectedConfirmation = `CONFIRM \$\{action\}`/);
assert.match(governance, /misma Idempotency-Key/);

// UX-07: MFA mantiene controles primarios suficientemente grandes aunque su lógica permanezca intacta.
assert.match(mfaSetup, /submitButton: \{[^}]*minHeight: 48/s);
assert.match(mfaVerify, /submitButton: \{[^}]*minHeight: 48/s);

console.log('ok - Admin Global UX final: navegación, responsive, accesibilidad, copy y acciones sensibles protegidas');
