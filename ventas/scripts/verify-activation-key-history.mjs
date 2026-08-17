import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const screenPath = path.join(here, '..', 'features', 'portal', 'screens', 'portal-onboarding-screen.tsx');
const source = fs.readFileSync(screenPath, 'utf8');

const requirements = [
  ['available keys are separated from history', "const availableActivationKeys = activationKeys.filter((key) => key.status === 'available');"],
  ['non-available keys are historical', "const historicalActivationKeys = activationKeys.filter((key) => key.status !== 'available');"],
  ['active pagination uses only available keys', 'totalItems={availableActivationKeys.length}'],
  ['history is opened from a dedicated action', 'Ver historial'],
  ['history uses the shared content modal', 'title="Historial de keys"'],
  ['history renders only the historical page', 'visibleHistoricalActivationKeys.map((activationKey) => ('],
  ['released slots keep the safe new-key action', "activationKey.usedByDriverState === 'offboarded' || activationKey.usedByDriverState === 'deleted'"],
  ['used keys remain permanently historical', 'Una key usada nunca vuelve a habilitarse.'],
];

for (const [label, needle] of requirements) {
  if (!source.includes(needle)) {
    throw new Error(`Activation key history contract failed: ${label}`);
  }
}

const forbidden = [
  ['all keys paginated together', 'const visibleActivationKeys = activationKeys.slice('],
  ['all keys counted as active pagination', 'totalItems={activationKeys.length}'],
];

for (const [label, needle] of forbidden) {
  if (source.includes(needle)) {
    throw new Error(`Activation key history contract failed: ${label}`);
  }
}

console.log('Activation key history contract: PASS');
