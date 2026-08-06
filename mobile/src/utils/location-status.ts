export type UserLocationPermission = 'granted' | 'denied' | 'undetermined';

export type UserLocationIssue =
  | 'permission_denied'
  | 'services_disabled'
  | 'timeout'
  | 'unavailable'
  | 'low_accuracy'
  | 'unknown'
  | null;

export type LocationStatusTone = 'ok' | 'warning' | 'error' | 'pending';

export type LocationStatus = {
  canRetry: boolean;
  hudLabel: string;
  issue: UserLocationIssue;
  message: string | null;
  title: string | null;
  tone: LocationStatusTone;
};

type LocationStatusInput = {
  coordinatesReady: boolean;
  issue: UserLocationIssue;
  loading: boolean;
  permission: UserLocationPermission;
  servicesEnabled: boolean;
};

export function getLocationStatus({
  coordinatesReady,
  issue,
  loading,
  permission,
  servicesEnabled,
}: LocationStatusInput): LocationStatus {
  if (permission === 'denied' || issue === 'permission_denied') {
    return {
      canRetry: true,
      hudLabel: 'OFF',
      issue: 'permission_denied',
      message: 'Activa el permiso de ubicacion para reportar tu posicion.',
      title: 'GPS sin permiso',
      tone: 'error',
    };
  }

  if (issue === 'services_disabled' || !servicesEnabled) {
    return {
      canRetry: true,
      hudLabel: 'GPS',
      issue: 'services_disabled',
      message: 'Enciende la ubicacion del telefono y vuelve a intentar.',
      title: 'GPS apagado',
      tone: 'error',
    };
  }

  if (issue === 'timeout') {
    return {
      canRetry: true,
      hudLabel: 'TIME',
      issue,
      message: 'La senal GPS tardo demasiado. Intenta desde un punto con mejor cobertura.',
      title: 'GPS sin respuesta',
      tone: 'warning',
    };
  }

  if (issue === 'low_accuracy') {
    return {
      canRetry: true,
      hudLabel: 'LOW',
      issue,
      message: 'La precision actual es baja. Mantendremos la ultima posicion confiable.',
      title: 'Precision baja',
      tone: 'warning',
    };
  }

  if (issue === 'unavailable') {
    return {
      canRetry: true,
      hudLabel: 'WAIT',
      issue,
      message: 'No hay posicion disponible todavia. La operacion sigue activa.',
      title: 'GPS buscando senal',
      tone: 'warning',
    };
  }

  if (issue === 'unknown') {
    return {
      canRetry: true,
      hudLabel: 'ERR',
      issue,
      message: 'No pudimos leer el GPS. Reintenta sin cerrar la operacion.',
      title: 'GPS no disponible',
      tone: 'warning',
    };
  }

  if (coordinatesReady) {
    return {
      canRetry: false,
      hudLabel: 'OK',
      issue: null,
      message: null,
      title: null,
      tone: 'ok',
    };
  }

  if (loading) {
    return {
      canRetry: false,
      hudLabel: '...',
      issue: null,
      message: 'Buscando una posicion confiable.',
      title: 'GPS sincronizando',
      tone: 'pending',
    };
  }

  if (permission === 'undetermined') {
    return {
      canRetry: true,
      hudLabel: 'WAIT',
      issue: null,
      message: 'Estamos verificando el permiso y la disponibilidad del GPS.',
      title: 'GPS pendiente',
      tone: 'pending',
    };
  }

  return {
    canRetry: true,
    hudLabel: 'WAIT',
    issue: 'unavailable',
    message: 'Aun no hay una posicion confiable, pero puedes seguir operando.',
    title: 'GPS pendiente',
    tone: 'warning',
  };
}
