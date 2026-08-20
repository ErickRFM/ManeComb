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
  'Falta el hook operations-header-action requerido por el header móvil de Operaciones.'
);
requireText(
  dashboard,
  'nativeID="operations-map-surface"',
  'Falta el hook operations-map-surface requerido para acotar el polish de Operaciones.'
);

// El target táctil global del portal debe seguir existiendo para accesibilidad;
// Operaciones lo neutraliza únicamente en la geometría visual de sus markers.
requireText(globalCss, 'min-height: 44px;', 'El contrato asume el target táctil móvil global de 44px.');

// Este archivo debe cargar al final para tener la última palabra frente a los
// estilos genéricos de global.css y routes-map-polish.css.
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
  'body:has(#operations-map-surface) #portal-content-scroll',
  'Operaciones debe cubrir el glow del shell con una superficie móvil propia.'
);
requireText(
  operationsPolish,
  'grid-template-columns: minmax(0, 1fr) 40px !important;',
  'El header móvil de Operaciones debe conservar título + refresh en una sola fila.'
);
requireText(
  operationsPolish,
  '#portal-header-text > :is([role="heading"], h1)',
  'El título móvil debe cubrir role=heading y h1 de forma explícita.'
);
requireText(
  operationsPolish,
  'font-size: 21px !important;',
  'El título de Operaciones debe conservar escala compacta en móvil.'
);
requireText(
  operationsPolish,
  '#operations-header-action > [role="button"]',
  'El refresh debe tener geometría compacta y estable.'
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
  'El marcador de unidad móvil debe quedar acotado al mapa de Operaciones.'
);
requireText(
  operationsPolish,
  '#operations-map-surface .operations-map-marker::before',
  'Los markers deben conservar pseudoárea táctil sin deformar su visual.'
);

console.log('ok - Centro de Operaciones conserva fondo limpio, header compacto y markers no deformados');
