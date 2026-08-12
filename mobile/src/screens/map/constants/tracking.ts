export const MAX_ACCEPTED_ACCURACY_METERS = 120;
export const MIN_NATIVE_DISTANCE_METERS = 8;
export const MIN_NATIVE_INTERVAL_MS = 5000;
export const LOCATION_SYNC_INTERVAL_MS = 5000;

// Aunque la unidad este detenida, una posicion valida debe renovar la prueba de
// vida del GPS. El filtro de distancia evita ruido entre fixes, pero no puede
// convertir una parada real en una falsa desconexion.
// El backend retira el estado `live` despues de 8 s sin recibir un paquete.
// El watcher pide fixes cada ~5 s, pero Android puede entregarlos con un poco de
// jitter. Usar un umbral menor que el intervalo solicitado permite aceptar cada
// ciclo real sin duplicar callbacks rapidos y conserva margen antes del lease.
export const LOCATION_HEARTBEAT_INTERVAL_MS = 4000;

// Dos/tres ciclos nativos sin ningun fix ya son suficientes para tratar la
// captura como sospechosa. El chequeo es barato (permiso + proveedor) y corre
// solo mientras el watcher foreground esta activo.
export const LOCATION_FIX_WATCHDOG_MS = 15000;
export const LOCATION_FIX_WATCHDOG_POLL_MS = 2500;
