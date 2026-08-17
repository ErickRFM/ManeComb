/**
 * Contrato operacional canonico.
 *
 * Fuente de verdad: backend/src/domain/operational-unit-snapshot.js y
 * backend/src/domain/operational-journey-snapshot.js.
 * Si cambia uno, cambia este archivo.
 *
 * Ninguna superficie puede derivar estado, frescura, velocidad, ETA o estado
 * de Jornada por su cuenta: todo lo que se muestra viene resuelto aqui.
 */

/**
 * Proyeccion legada de tres estados. DERIVADA de `GpsConnectionState`, nunca
 * calculada aparte. Se conserva para consumidores en migracion.
 * @deprecated Presenta `GpsConnectionState`.
 */
export type GpsFreshness = 'fresh' | 'stale' | 'missing';

/**
 * Taxonomia canonica del enlace GPS. Autoridad:
 * `backend/src/domain/gps-telemetry-state.js`.
 *
 * Ningun cliente recalcula umbrales ni re-deriva estos valores: solo los presenta.
 *
 *  never_reported -> "Esperando primera ubicacion"
 *  live           -> "GPS en vivo"
 *  delayed        -> "GPS retrasado - hace X"
 *  stale          -> "GPS sin senal - hace X"
 *  lost           -> "GPS perdido - ultima ubicacion hace X"
 *
 * `never_reported` es distinto de `lost`: el primero significa que jamas llego un
 * paquete de esta unidad; el segundo, que hubo telemetria y se perdio la senal.
 * Confundirlos hacia que una unidad recien dada de alta dijera "GPS vencido".
 */
export type GpsConnectionState = 'never_reported' | 'live' | 'delayed' | 'stale' | 'lost';
export type OperationalUnitStatus = 'active' | 'idle' | 'maintenance' | 'offline';
export type OperationalState = 'on_route' | 'stopped' | 'no_route' | 'maintenance' | 'unknown';
export type DriverSource = 'session' | 'assignment' | 'none';
export type OperationalVisibility = 'visible' | 'hidden';
export type OperationalJourneyStatus = 'ASSIGNED' | 'READY' | 'RUNNING' | 'PAUSED';

export type OperationalGps = {
  lat: number | null;
  lng: number | null;
  /** Ya convertida en backend. Ningun cliente vuelve a convertir. */
  speedKmh: number | null;
  heading: number | null;
  recordedAt: string | null;
  /** Instante de recepcion del servidor; autoridad para reconciliar REST y Socket. */
  receivedAt: string | null;
  freshness: GpsFreshness;
  connectionState: GpsConnectionState;
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
  isOffRoute?: boolean;
  currentCheckpoint: string | null;
};

/** Compatibilidad con consumidores anteriores: solo existe tras inicio real. */
export type OperationalSession = {
  id: string;
  startedAt: string;
  elapsedSeconds: number;
};

export type OperationalJourney = {
  id: string;
  status: OperationalJourneyStatus;
  driverId: string | null;
  vehicleId: string | null;
  routeId: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  elapsedSeconds: number | null;
  requiresDriverConfirmation: boolean;
  canStart: boolean;
  isDriving: boolean;
  isPaused: boolean;
  legacyTiming: {
    inferredScheduledStartAt: string | null;
    reason: string | null;
  };
};

export type OperationalIncidents = {
  open: number;
  inProgress: number;
  lastAt: string | null;
};

export type OperationalUnitSnapshot = {
  snapshotVersion: 2;
  unitId: string;
  plates: string | null;
  /** Nombre visible de la unidad. Nunca vacio. */
  label: string;
  status: OperationalUnitStatus;
  operationalState: OperationalState;
  gps: OperationalGps;
  driver: OperationalDriver | null;
  route: OperationalRoute | null;
  /** Campo legado conservado durante la migracion. */
  session: OperationalSession | null;
  /** Autoridad completa de la Jornada activa, incluso ASSIGNED y READY. */
  journey: OperationalJourney | null;
  incidents: OperationalIncidents;
  lastEventAt: string | null;
  /** Depende solo del alta de la unidad, nunca de la frescura del GPS. */
  visibility: OperationalVisibility;
};
