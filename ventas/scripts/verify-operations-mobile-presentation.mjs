import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const dashboard = read('features/portal/screens/portal-dashboard-screen.tsx');
const globalCss = read('src/global.css');
const main = read('src/main.tsx');
const operationsPolish = read('src/operations-mobile-polish.css');

const requireText = (source, text, message) => {
  if (!source.includes(text)) throw new Error(message);
};

requireText(
  dashboard,
  'nativeID="operations-header-action"',
  'Falta el hook operations-header-action requerido para conservar Refresh en Operaciones.'
);
requireText(
  dashboard,
  'nativeID="operations-map-surface"',
  'Falta el hook operations-map-surface requerido para acotar el workspace map-first.'
);
requireText(
  dashboard,
  'nativeID="operations-unit-selector"',
  'Falta el selector de unidades usado como bottom-sheet móvil.'
);
requireText(
  dashboard,
  'nativeID="operations-kpi-grid"',
  'Falta el dock de KPIs operativos.'
);

// El target táctil global permanece; Operaciones controla únicamente la forma
// visual de los markers para no volver a producir óvalos.
requireText(globalCss, 'min-height: 44px;', 'El contrato asume el target táctil móvil global de 44px.');

requireText(
  main,
  "import './operations-mobile-polish.css';",
  'operations-mobile-polish.css debe importarse explícitamente desde main.tsx.'
);
if (main.indexOf("import './operations-mobile-polish.css';") < main.indexOf("import './routes-map-polish.css';")) {
  throw new Error('operations-mobile-polish.css debe cargarse después de routes-map-polish.css.');
}

requireText(
  operationsPolish,
  'body:has(#operations-map-surface) #portal-header-text',
  'El map-first debe retirar el título visual de Centro de Operaciones.'
);
requireText(
  operationsPolish,
  'display: none !important;',
  'El título visual de Operaciones debe ocultarse para liberar altura útil.'
);
requireText(
  operationsPolish,
  '#operations-header-action > [role="button"]',
  'Refresh debe conservar una geometría compacta sobre el mapa.'
);
requireText(
  operationsPolish,
  'height: calc(100svh - 86px) !important;',
  'El mapa móvil debe ocupar prácticamente toda la ventana útil.'
);
requireText(
  operationsPolish,
  '#operations-unit-selector',
  'Las unidades deben seguir disponibles como superficie flotante.'
);
requireText(
  operationsPolish,
  'bottom: 164px !important;',
  'El selector de unidades móvil debe quedar por encima del dock KPI 2x2.'
);
requireText(
  operationsPolish,
  'grid-template-columns: repeat(2, minmax(0, 1fr)) !important;',
  'Los cuatro KPIs principales deben formar una grilla 2x2 legible en móvil.'
);
requireText(
  operationsPolish,
  '#operations-kpi-grid > div > :nth-child(n + 5)',
  'Los KPIs secundarios deben reservarse para superficies con más espacio.'
);

const circleRule = operationsPolish.match(/\.operations-map-marker--circle\s*\{([\s\S]*?)\}/)?.[1] || '';
for (const declaration of [
  'height: 36px !important;',
  'max-height: 36px !important;',
  'min-height: 36px !important;',
  'width: 36px !important;',
  'max-width: 36px !important;',
  'min-width: 36px !important;',
]) {
  if (!circleRule.includes(declaration)) {
    throw new Error(`El checkpoint móvil perdió su geometría cuadrada: falta ${declaration}`);
  }
}

requireText(
  operationsPolish,
  '#operations-map-surface .operations-map-marker--pill',
  'El marcador de unidad debe permanecer acotado al mapa de Operaciones.'
);
requireText(
  operationsPolish,
  '#operations-map-surface .operations-map-marker::before',
  'Los markers deben conservar pseudoárea táctil sin deformar su visual.'
);

console.log('ok - Centro de Operaciones usa map-first, bottom-sheet, KPI 2x2 y markers no deformados');
