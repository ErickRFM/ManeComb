export const MAX_ACCEPTED_ACCURACY_METERS = 120;
export const MIN_NATIVE_DISTANCE_METERS = 8;
export const MIN_NATIVE_INTERVAL_MS = 5000;
export const LOCATION_SYNC_INTERVAL_MS = 5000;

// Aunque la unidad este detenida, una posicion valida debe renovar la prueba de
// vida del GPS. El filtro de distancia evita ruido entre fixes, pero no puede
// convertir una parada real en una falsa desconexion.
export const LOCATION_HEARTBEAT_INTERVAL_MS = 10000;

// Si el watcher permanece activo pero deja de entregar cualquier fix durante
// esta ventana, la app conserva la ultima coordenada y cambia el HUD a estado
// de senal no disponible. No se confunde con perdida de Internet.
export const LOCATION_FIX_WATCHDOG_MS = 20000;
export const LOCATION_FIX_WATCHDOG_POLL_MS = 5000;
