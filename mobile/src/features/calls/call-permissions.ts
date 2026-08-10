import { Linking, PermissionsAndroid, Platform } from 'react-native';

export type CallMediaMode = 'audio' | 'video';
export type CallPermissionStatus = 'granted' | 'denied' | 'blocked' | 'not_required';

export type CallMediaPermissionResult = {
  microphone: CallPermissionStatus;
  camera: CallPermissionStatus;
};

export type CallPermissionFailureCode =
  | 'microphone_permission_denied'
  | 'microphone_permission_blocked'
  | 'camera_permission_denied'
  | 'camera_permission_blocked';

export type CallPermissionAdapter = {
  platform: string;
  microphonePermission: string;
  cameraPermission: string;
  grantedResult: string;
  blockedResult: string;
  check: (permission: string) => Promise<boolean>;
  requestMultiple: (permissions: string[]) => Promise<Record<string, string>>;
};

const defaultAdapter: CallPermissionAdapter = {
  platform: Platform.OS,
  microphonePermission: PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  cameraPermission: PermissionsAndroid.PERMISSIONS.CAMERA,
  grantedResult: PermissionsAndroid.RESULTS.GRANTED,
  blockedResult: PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
  check: (permission) =>
    PermissionsAndroid.check(permission as Parameters<typeof PermissionsAndroid.check>[0]),
  requestMultiple: async (permissions) =>
    (await PermissionsAndroid.requestMultiple(
      permissions as Parameters<typeof PermissionsAndroid.requestMultiple>[0]
    )) as Record<string, string>,
};

function normalizeRequestedStatus(
  result: string | undefined,
  adapter: CallPermissionAdapter
): CallPermissionStatus {
  if (result === adapter.grantedResult) return 'granted';
  if (result === adapter.blockedResult) return 'blocked';
  return 'denied';
}

async function resolvePermissionStatus(
  permission: string,
  adapter: CallPermissionAdapter
): Promise<CallPermissionStatus> {
  if (await adapter.check(permission)) return 'granted';

  // Pedir cada permiso por separado hace explícito qué recurso se solicita y
  // evita que cámara/micrófono queden mezclados en un único resultado opaco.
  const requested = await adapter.requestMultiple([permission]);
  return normalizeRequestedStatus(requested[permission], adapter);
}

export async function requestCallMediaPermissions(
  mode: CallMediaMode,
  adapter: CallPermissionAdapter = defaultAdapter
): Promise<CallMediaPermissionResult> {
  if (adapter.platform !== 'android') {
    return {
      microphone: 'granted',
      camera: mode === 'video' ? 'granted' : 'not_required',
    };
  }

  const microphone = await resolvePermissionStatus(adapter.microphonePermission, adapter);
  if (microphone !== 'granted') {
    return {
      microphone,
      camera: mode === 'video' ? 'denied' : 'not_required',
    };
  }

  const camera =
    mode === 'video'
      ? await resolvePermissionStatus(adapter.cameraPermission, adapter)
      : 'not_required';

  return { microphone, camera };
}

export function getCallPermissionFailure(
  permissions: CallMediaPermissionResult,
  mode: CallMediaMode
): CallPermissionFailureCode | null {
  if (permissions.microphone === 'blocked') return 'microphone_permission_blocked';
  if (permissions.microphone !== 'granted') return 'microphone_permission_denied';
  if (mode === 'video') {
    if (permissions.camera === 'blocked') return 'camera_permission_blocked';
    if (permissions.camera !== 'granted') return 'camera_permission_denied';
  }
  return null;
}

export function callPermissionFailureNeedsSettings(code: string | null | undefined): boolean {
  return code === 'microphone_permission_blocked' || code === 'camera_permission_blocked';
}

export function getCallPermissionFailureCopy(code: string | null | undefined): string {
  switch (code) {
    case 'microphone_permission_blocked':
      return 'El micrófono está bloqueado para ManeComb. Habilítalo desde Ajustes para llamar.';
    case 'microphone_permission_denied':
      return 'ManeComb necesita permiso de micrófono para realizar llamadas.';
    case 'camera_permission_blocked':
      return 'La cámara está bloqueada para ManeComb. Habilítala desde Ajustes para videollamar.';
    case 'camera_permission_denied':
      return 'ManeComb necesita permiso de cámara para realizar videollamadas.';
    default:
      return 'ManeComb necesita acceso al micrófono y la cámara para continuar.';
  }
}

export async function openCallPermissionSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // La UI conserva instrucciones manuales si el OEM no expone el intent de ajustes.
  }
}

export async function assertCallMediaPermissions(
  mode: CallMediaMode,
  adapter?: CallPermissionAdapter
): Promise<void> {
  const permissions = await requestCallMediaPermissions(mode, adapter);
  const failure = getCallPermissionFailure(permissions, mode);

  if (!failure) return;

  // call-media conserva este chequeo como defensa final ante revocación entre el
  // preflight de UI y getUserMedia. El preflight principal ocurre antes de
  // señalizar o aceptar la llamada.
  if (failure.startsWith('camera_')) {
    throw new Error('video_track_unavailable');
  }
  throw new Error('audio_track_unavailable');
}
