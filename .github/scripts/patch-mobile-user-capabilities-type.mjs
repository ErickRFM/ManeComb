import { readFileSync, writeFileSync } from 'node:fs';

function replaceExactlyOnce(filePath, label, before, after) {
  const source = readFileSync(filePath, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${filePath} ${label}: source snippet not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${filePath} ${label}: source snippet appears more than once`);
  }
  writeFileSync(filePath, source.slice(0, first) + after + source.slice(first + before.length));
}

replaceExactlyOnce(
  'mobile/src/types/app.ts',
  'User capabilities contract',
  "  accountChannelReason?: string | null;\n  organizationId?: string;",
  "  accountChannelReason?: string | null;\n  capabilities?: string[];\n  organizationId?: string;"
);

replaceExactlyOnce(
  'mobile/src/screens/alerts/AlertsScreen.tsx',
  'remove obsolete capability cast',
  "  const canManageIncidents = canManageMobileIncidents(user as typeof user & { capabilities?: string[] });",
  "  const canManageIncidents = canManageMobileIncidents(user);"
);

console.log('ok - User capability contract typed and obsolete cast removed');
