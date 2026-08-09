import { readFileSync, writeFileSync } from 'node:fs';

const files = [
  'mobile/src/store/root-store.ts',
  'mobile/src/navigation/route-registry.ts',
  'mobile/src/navigation/route-registry.test.ts',
  'mobile/src/desktop/desktop-navigation.test.ts',
  'mobile/src/screens/map-screen.native.tsx',
];

for (const filePath of files) {
  const source = readFileSync(filePath, 'utf8');
  const before = "@/src/store/mobile-capability-authority";
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${filePath}: expected exactly one authority import, found ${count}`);
  }
  writeFileSync(filePath, source.replace(before, "@/src/utils/mobile-authority"));
}

console.log('ok - Mobile authority imports consolidated into utils/mobile-authority');
