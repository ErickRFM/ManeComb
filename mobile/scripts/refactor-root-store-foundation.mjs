import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootStorePath = path.resolve(here, '../src/store/root-store.ts');
let source = fs.readFileSync(rootStorePath, 'utf8');

function replaceExactlyOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`${label}: expected source block was not found`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: expected exactly one source block`);
  }
  source = source.replace(before, after);
}

replaceExactlyOnce(
  'resource-state import',
  `import {\n  applyIncrementalResourceEvent,\n  beginResourceAttempt,\n  completeResourceAttempt,\n  failResourceAttempt,\n  idleResourceState,\n  type ResourceState,\n} from '@shared/resource-state';`,
  `import {\n  applyIncrementalResourceEvent,\n  beginResourceAttempt,\n  completeResourceAttempt,\n  failResourceAttempt,\n  type ResourceState,\n} from '@shared/resource-state';\nimport {\n  createEmptyOperationalState,\n  createIdleMobileResources,\n  type MobileResourceDomain,\n} from './app-state-foundation';\nexport type { MobileResourceDomain } from './app-state-foundation';`
);

replaceExactlyOnce(
  'inline mobile resource domain foundation',
  `export type MobileResourceDomain =\n  | 'operationalUnits'\n  | 'mapData'\n  | 'incidents'\n  | 'documents'\n  | 'notifications'\n  | 'users'\n  | 'conversations'\n  | 'routeSessionHistory';\n\nconst mobileResourceDomains: MobileResourceDomain[] = [\n  'operationalUnits', 'mapData', 'incidents', 'documents', 'notifications',\n  'users', 'conversations', 'routeSessionHistory',\n];\n\nfunction idleMobileResources(): Record<MobileResourceDomain, ResourceState> {\n  return Object.fromEntries(mobileResourceDomains.map((domain) => [domain, idleResourceState()])) as Record<MobileResourceDomain, ResourceState>;\n}\n\n`,
  ''
);

replaceExactlyOnce(
  'inline empty operational state factory',
  `function getEmptyOperationalState(): Partial<AppState> {\n  return {\n    mapData: null,\n    operationalUnits: [],\n    resources: idleMobileResources(),\n    incidents: [],\n    conversations: [],\n    chatContacts: [],\n    presenceByUser: {},\n    messagesByConversation: {},\n    chatPageInfoByConversation: {},\n    isLoadingOlderChatByConversation: {},\n    documents: [],\n    notifications: [],\n    users: [],\n    activeRouteSession: null,\n    routeSessionHistory: [],\n    activeConversationId: null,\n    focusedIncidentId: null,\n    typingByConversation: {},\n    readByConversation: {},\n    pendingSyncCount: 0,\n    lastCacheAt: null,\n    lastSyncedAt: null,\n    isRefreshing: false,\n  };\n}\n\n`,
  ''
);

source = source.replaceAll('idleMobileResources()', 'createIdleMobileResources()');
source = source.replaceAll('getEmptyOperationalState()', 'createEmptyOperationalState()');

const forbidden = [
  'function idleMobileResources(',
  'function getEmptyOperationalState(',
  'const mobileResourceDomains:',
  'idleResourceState,',
];
for (const fragment of forbidden) {
  if (source.includes(fragment)) {
    throw new Error(`postcondition failed: ${fragment}`);
  }
}

if (!source.includes("from './app-state-foundation';")) {
  throw new Error('postcondition failed: app-state-foundation import missing');
}
if (!source.includes('createIdleMobileResources()')) {
  throw new Error('postcondition failed: resource factory is not used');
}
if (!source.includes('createEmptyOperationalState()')) {
  throw new Error('postcondition failed: reset factory is not used');
}

fs.writeFileSync(rootStorePath, source, 'utf8');
console.log('root-store foundation delegation applied');
