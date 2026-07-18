/**
 * Contrato operacional canonico.
 *
 * Fuente de verdad: backend/src/domain/operational-unit-snapshot.js
 * Este archivo es la contraparte tipada. Si cambia uno, cambia el otro.
 *
 * Ninguna superficie puede derivar estado, frescura, velocidad ni ETA por su
 * cuenta: todo lo que se muestra viene ya resuelto en este objeto.
 */

export type GpsFreshness = 'fresh' | 'stale' | 'missing';

export type OperationalUnitStatus = 'active' | 'idle' | 'maintenance' | 'offline';

export type OperationalState = 'on_route' | 'stopped' | 'no_route' | 'maintenance';

export type DriverSource = 'session' | 'assignment' | 'none';

export type OperationalVisibility = 'visible' | 'hidden';

export type OperationalGps = {
  lat: number | null;
  lng: number | null;
  /** Ya convertida en backend. Ningun cliente vuelve a convertir. */
  speedKmh: number | null;
  heading: number | null;
  recordedAt: string | null;
  freshness: GpsFreshness;
  ageSeconds: number | null;
};

export type OperationalDriver = {
  id: string;
  name: string;
  source: DriverSource;
};

export type OperationalRoute = {
  id: string;
  name: string;
  startedAt: string | null;
  /** 0..1 */
  progressRatio: number | null;
  remainingTimeSeconds: number | null;
  /** Instante absoluto ISO. UNICA fuente de ETA del sistema. */
  etaAt: string | null;
  deviationMeters: number | null;
  currentCheckpoint: string | null;
};

export type OperationalSession = {
  id: string;
  startedAt: string;
  elapsedSeconds: number;
};

export type OperationalIncidents = {
  open: number;
  inProgress: number;
  lastAt: string | null;
};

export type OperationalUnitSnapshot = {
  unitId: string;
  plates: string | null;
  /** Nombre visible de la unidad. Nunca vacio. */
  label: string;
  status: OperationalUnitStatus;
  operationalState: OperationalState;
  gps: OperationalGps;
  driver: OperationalDriver | null;
  route: OperationalRoute | null;
  session: OperationalSession | null;
  incidents: OperationalIncidents;
  lastEventAt: string | null;
  /**
   * Depende solo del alta de la unidad.
   * JAMAS de la frescura del GPS ni del estado de tracking.
   */
  visibility: OperationalVisibility;
};
