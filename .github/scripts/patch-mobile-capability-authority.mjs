import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'mobile/src/store/root-store.ts';
let source = readFileSync(filePath, 'utf8');

function replaceExactlyOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`${label}: expected source snippet was not found`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: source snippet appears more than once`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceExactlyOnce(
  'capability authority import',
  "import { createClientMessageId, normalizeClientMessageId } from '@/src/utils/chat-message-id';\n",
  "import { createClientMessageId, normalizeClientMessageId } from '@/src/utils/chat-message-id';\nimport {\n  canLoadDirectoryUsers,\n  canRefreshOperationalData,\n} from '@/src/store/mobile-capability-authority';\n"
);

replaceExactlyOnce(
  'operational refresh authority',
  `function shouldRefreshOperationalData(\n  authContext: AuthRoutingContext | null | undefined,\n  user: User | null | undefined\n) {\n  if (!user || !authContext) {\n    return false;\n  }\n\n  const accountChannel = authContext.accountChannel ?? user.accountChannel;\n\n  if (accountChannel) {\n    return accountChannel === 'mobile_operations' && authContext.canAccessMobile === true;\n  }\n\n  return user.accountType === 'operations' && authContext.canAccessMobile === true;\n}\n`,
  `function shouldRefreshOperationalData(\n  authContext: AuthRoutingContext | null | undefined,\n  user: User | null | undefined\n) {\n  return canRefreshOperationalData(authContext, user);\n}\n`
);

replaceExactlyOnce(
  'refreshAll directory prefetch',
  "user.role === 'admin' || user.role === 'supervisor' || user.accountType === 'company_owner' ? getUsersRequest() : Promise.resolve([]),",
  "canLoadDirectoryUsers(user) ? getUsersRequest() : Promise.resolve([]),"
);

replaceExactlyOnce(
  'loadUsers directory authority',
  "if (!currentUser || !['owner', 'admin', 'supervisor'].includes(currentUser.role)) return;",
  "if (!canLoadDirectoryUsers(currentUser)) return;"
);

writeFileSync(filePath, source);
console.log('ok - root-store capability authority codemod applied exactly once');
