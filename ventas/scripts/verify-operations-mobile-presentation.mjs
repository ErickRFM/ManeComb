import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const dashboard = read('features/portal/screens/portal-dashboard-screen.tsx');
const globalCss = read('src/global.css');
const polishCss = read('src/routes-map-polish.css');

const requireText = (source, text, message) => {
  if (!source.includes(text)) throw new Error(message);
};

// El Centro de Operaciones debe conservar hooks estables para limitar cualquier
// ajuste responsive a esta pantalla y no afectar Rutas, replay u otros mapas.
requireText(
  dashboard,
  'nativeID="operations-header-action"',
  'Falta el hook operations-header-action requerido por el header móvil de Operaciones.'
);
requireText(
  dashboard,
  'nativeID="operations-map-surface"',
  'Falta el hook operations-map-surface requerido para acotar los marcadores móviles.'
);

// El target táctil global es intencional, pero no puede deformar los marcadores
// visuales de Mapbox. La excepción debe vivir únicamente dentro del mapa de
// Operaciones y conservar un círculo cuadrado (mismo alto y ancho).
requireText(
  globalCss,
  'min-height: 44px;',
  'El contrato asume el target táctil móvil global de 44px.'
);
requireText(
  polishCss,
  '#operations-map-surface .operations-map-marker--circle',
  'El marcador circular móvil debe estar acotado a operations-map-surface.'
);
requireText(
  polishCss,
  '#operations-map-surface .operations-map-marker--pill',
  'El marcador de unidad móvil debe estar acotado a operations-map-surface.'
);
requireText(
  polishCss,
  '#operations-map-surface .operations-map-marker::before',
  'Los marcadores móviles deben conservar pseudoárea táctil sin deformar su visual.'
);

const circleRule = polishCss.match(/#operations-map-surface \.operations-map-marker--circle\s*\{([\s\S]*?)\}/)?.[1] || '';
if (!circleRule.includes('height: 36px !important;') || !circleRule.includes('width: 36px !important;')) {
  throw new Error('El checkpoint móvil debe conservar geometría visual 36x36 para no volver al óvalo.');
}

// React Native Web puede exponer el título como role=heading. El selector debe
// cubrir esa salida además de h1 y mantenerse limitado al header de Operaciones.
requireText(
  polishCss,
  '#portal-header:has(#operations-header-action)',
  'El polish del header móvil debe limitarse al Centro de Operaciones.'
);
requireText(
  polishCss,
  '#portal-header-text > :is([role="heading"], h1)',
  'El título móvil debe cubrir role=heading y h1 de forma explícita.'
);
requireText(
  polishCss,
  'font-size: 22px !important;',
  'El título de Operaciones debe conservar su escala móvil compacta.'
);

console.log('ok - Centro de Operaciones conserva header compacto y marcadores móviles no deformados');
