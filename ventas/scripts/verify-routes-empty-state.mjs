import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const sourceUrl = new URL('../features/portal/routes/routes.utils.ts', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { getRouteLabel } = await import(moduleUrl);

assert.equal(getRouteLabel(null), 'Sin ruta asignada');
assert.equal(getRouteLabel(undefined), 'Sin ruta asignada');
assert.equal(getRouteLabel({ assignedRoute: null }), 'Sin ruta asignada');
assert.equal(
  getRouteLabel({
    assignedRoute: {
      originLabel: 'Centro',
      destinationLabel: 'Terminal',
    },
  }),
  'Centro -> Terminal'
);

console.log('Routes empty-account contract verified.');
