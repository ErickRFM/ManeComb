import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'mobile/src/store/root-store.ts';
let source = readFileSync(filePath, 'utf8');

function replaceExactlyOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source snippet was not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: source snippet appears more than once`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceExactlyOnce(
  'safe storage import',
  "import {\n  canLoadDirectoryUsers,\n  canRefreshOperationalData,\n} from '@/src/store/mobile-capability-authority';\n",
  "import {\n  canLoadDirectoryUsers,\n  canRefreshOperationalData,\n} from '@/src/store/mobile-capability-authority';\nimport {\n  resolveWebStorage,\n  safeWebStorageGetItem,\n  safeWebStorageRemoveItem,\n  safeWebStorageSetItem,\n} from '@/src/store/safe-web-storage';\n"
);

replaceExactlyOnce(
  'localStorage getter',
  "function getWebStorage() {\n  return (Platform.OS === 'web' && typeof window !== 'undefined') ? window.localStorage : null;\n}\n",
  "function getWebStorage() {\n  return resolveWebStorage(Platform.OS === 'web');\n}\n"
);

replaceExactlyOnce(
  'localStorage getItem',
  "  const web = getWebStorage();\n  if (web) return web.getItem(key);\n  try { return await withStorageTimeout(SecureStore.getItemAsync(key), null); } catch { return null; }\n",
  "  const web = getWebStorage();\n  if (web) return safeWebStorageGetItem(web, key);\n  try { return await withStorageTimeout(SecureStore.getItemAsync(key), null); } catch { return null; }\n"
);

replaceExactlyOnce(
  'localStorage setItem',
  "  const web = getWebStorage();\n  if (web) { web.setItem(key, value); return; }\n  try { await withStorageTimeout(SecureStore.setItemAsync(key, value), undefined); } catch { }\n",
  "  const web = getWebStorage();\n  if (web) { safeWebStorageSetItem(web, key, value); return; }\n  try { await withStorageTimeout(SecureStore.setItemAsync(key, value), undefined); } catch { }\n"
);

replaceExactlyOnce(
  'localStorage removeItem',
  "  const web = getWebStorage();\n  if (web) { web.removeItem(key); return; }\n  try { await withStorageTimeout(SecureStore.deleteItemAsync(key), undefined); } catch { }\n",
  "  const web = getWebStorage();\n  if (web) { safeWebStorageRemoveItem(web, key); return; }\n  try { await withStorageTimeout(SecureStore.deleteItemAsync(key), undefined); } catch { }\n"
);

writeFileSync(filePath, source);
console.log('ok - root-store safe web storage codemod applied exactly once');
