const fs = require('fs');

const file = 'mobile/src/screens/checklist-screen.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceExact(oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`);
  source = source.replace(oldValue, newValue);
}

replaceExact(
  '      void loadSessionHistory();\n',
  '      loadSessionHistory().catch(() => undefined);\n',
  'history promise consumption'
);
replaceExact(
  '  }, [historyRefreshKey, loadSessionHistory, user?.id]);\n',
  '  }, [historyRefreshKey, loadSessionHistory, user]);\n',
  'history effect dependencies'
);

fs.writeFileSync(file, source);
console.log('reconnect lint fix applied');
