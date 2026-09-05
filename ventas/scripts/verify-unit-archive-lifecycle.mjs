import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

const screen = read('features/portal/screens/portal-units-screen.tsx');
const list = read('features/portal/units/components/portal-units-list.tsx');

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

requireText(
  screen,
  "failureMessage.includes('unidad retirada')",
  'El alta debe reconocer el conflicto con una unidad retirada.'
);
requireText(
  screen,
  'await loadVehicles({ includeRetired: true })',
  'El Portal debe revelar las unidades retiradas cuando bloquean una identidad.'
);
requireText(
  screen,
  'else void loadVehicles();',
  'Ocultar retiradas debe volver a cargar solamente la flota activa.'
);
requireText(
  screen,
  'Eliminar ficha archivada',
  'La confirmacion debe distinguir eliminar la ficha archivada de retirar una unidad activa.'
);
requireText(
  screen,
  'El historial, documentos e incidencias permaneceran disponibles.',
  'La UI debe explicar que borrar la ficha archivada no borra evidencia historica.'
);
requireText(
  list,
  'Eliminar ficha archivada de unidad',
  'Una unidad retirada debe exponer la accion para eliminar su ficha archivada.'
);
requireText(
  list,
  "icon={retired ? 'delete-outline' : 'archive-arrow-down-outline'}",
  'La accion de una unidad retirada debe diferenciarse visualmente del retiro de una activa.'
);

if (list.includes('actions={canManageUnits && !retired')) {
  throw new Error('Regresion: las unidades retiradas volvieron a quedar sin accion de limpieza de ficha.');
}

console.log('unit archive lifecycle contracts passed');
