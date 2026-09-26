import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const dashboard = read('features/portal/screens/portal-dashboard-screen.tsx');
const dashboardTypes = read('features/portal/dashboard/dashboard.types.ts');
const globalCss = read('src/global.css');
const main = read('src/main.tsx');
const operationsMap = read('features/portal/components/operations-map.tsx');
const operationsPolish = read('src/operations-mobile-polish.css');

const requireText = (source, text, message) => {
  if (!source.includes(text)) throw new Error(message);
};

requireText(dashboard, 'nativeID="operations-header-action"', 'Refresh debe seguir disponible en Operaciones.');
requireText(dashboard, 'nativeID="operations-map-surface"', 'Falta la superficie map-first.');
requireText(dashboard, 'nativeID="operations-unit-selector"', 'Falta el bottom-sheet de unidades.');
requireText(dashboard, 'nativeID="operations-mobile-kpis"', 'Los KPIs móviles deben vivir dentro del sheet expandido.');
requireText(dashboard, "useState<'collapsed' | 'medium' | 'expanded'>('collapsed')", 'El sheet móvil debe conservar sus tres estados.');
requireText(dashboard, "current === 'collapsed' ? 'medium' : current === 'medium' ? 'expanded' : 'collapsed'", 'El encabezado debe ciclar collapsed/medium/expanded.');
requireText(dashboard, 'operationsCounts.GPS_LOST', 'El resumen móvil debe presentar GPS perdido desde el snapshot canónico.');
requireText(dashboard, "unit?.gps.connectionState === 'lost'", 'GPS perdido debe contar solo el estado lost canónico, no delayed/stale/never_reported.');
requireText(dashboard, "unit?.journey?.status === 'RUNNING'", 'Activas debe salir de la Jornada canónica en vivo.');
requireText(dashboard, 'operationalUnits={visibleOperationalUnits}', 'Filtro, lista, marcadores y bounds deben compartir el mismo subconjunto.');
requireText(dashboardTypes, "'GPS_LOST'", 'OperationsFilter debe admitir el filtro GPS perdido.');

requireText(globalCss, 'min-height: 44px;', 'El Portal debe conservar targets táctiles móviles de al menos 44px.');

requireText(main, "import './operations-mobile-polish.css';", 'Debe importarse el polish dedicado de Operaciones.');
if (main.indexOf("import './operations-mobile-polish.css';") < main.indexOf("import './routes-map-polish.css';")) {
  throw new Error('operations-mobile-polish.css debe cargarse después de routes-map-polish.css.');
}

for (const required of [
  '#operations-map-canvas',
  '#operations-camera-controls',
  'height: calc(100dvh - 66px - env(safe-area-inset-bottom)) !important;',
  '#operations-mobile-kpis',
  '.operations-sheet-collapsed',
  '.operations-sheet-medium',
  '.operations-sheet-expanded',
  '#operations-kpi-grid',
  'display: none !important;',
  '@media (max-width: 920px) and (orientation: landscape)',
  'env(safe-area-inset-bottom)',
  '.mapboxgl-ctrl-group button',
  'height: 40px !important;',
]) {
  requireText(operationsPolish, required, `Falta contrato responsive: ${required}`);
}

requireText(
  operationsPolish,
  'bottom: 8px !important;',
  'El bottom-sheet móvil debe quedar pegado al borde útil, no encima de un dock KPI gigante.'
);
requireText(
  operationsPolish,
  'max-height: min(62dvh, 560px) !important;',
  'El sheet expandido debe conservar mapa visible detrás.'
);

const circleRule = operationsPolish.match(/\.operations-map-marker--circle\s*\{([\s\S]*?)\}/)?.[1] || '';
for (const declaration of [
  'height: 34px !important;',
  'max-height: 34px !important;',
  'min-height: 34px !important;',
  'width: 34px !important;',
  'max-width: 34px !important;',
  'min-width: 34px !important;',
]) {
  if (!circleRule.includes(declaration)) {
    throw new Error(`El checkpoint perdió geometría compacta: falta ${declaration}`);
  }
}

for (const required of [
  'MIN_OPERATIONAL_AUTO_ZOOM = 8.5',
  'SINGLE_VEHICLE_AUTO_ZOOM = 15',
  'map.cameraForBounds',
  "map.on('zoomstart'",
  "map.on('rotatestart'",
  'showCompass: false',
  'nativeID="operations-camera-controls"',
  'FLEET_CLUSTER_THRESHOLD = 30',
  'cluster: true',
  'clusterMaxZoom: 13',
  "unit.gps.connectionState !== 'lost'",
  'zoom: Math.max(14, mapRef.current.getZoom())',
]) {
  requireText(operationsMap, required, `Falta protección de cámara/interacción: ${required}`);
}

console.log('ok - Operaciones móvil usa mapa principal, sheet de 3 estados, autoridad canónica, cámara protegida y clustering');
