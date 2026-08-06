import { PermissionsAndroid, Platform } from 'react-native';

export type CallMediaMode = 'audio' | 'video';
export type CallPermissionStatus = 'granted' | 'denied' | 'blocked' | 'not_required';

export type CallMediaPermissionResult = {
  microphone: CallPermissionStatus;
  camera: CallPermissionStatus;
};

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
  requestMultiple: (permissions) =>
    PermissionsAndroid.requestMultiple(
      permissions as Parameters<typeof PermissionsAndroid.requestMultiple>[0]
    ),
};

function normalizeRequestedStatus(
  result: string | undefined,
  adapter: CallPermissionAdapter
): CallPermissionStatus {
  if (result === adapter.grantedResult) return 'granted';
  if (result === adapter.blockedResult) return 'blocked';
  return 'denied';
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

  const required = [adapter.microphonePermission];
  if (mode === 'video') required.push(adapter.cameraPermission);

  const checked = await Promise.all(
    required.map(async (permission) => [permission, await adapter.check(permission)] as const)
  );
  const alreadyGranted = new Map(checked);
  const missing = required.filter((permission) => alreadyGranted.get(permission) !== true);
  const requested = missing.length ? await adapter.requestMultiple(missing) : {};

  const statusFor = (permission: string): CallPermissionStatus =>
    alreadyGranted.get(permission)
      ? 'granted'
      : normalizeRequestedStatus(requested[permission], adapter);

  return {
    microphone: statusFor(adapter.microphonePermission),
    camera: mode === 'video' ? statusFor(adapter.cameraPermission) : 'not_required',
  };
}

export async function assertCallMediaPermissions(
  mode: CallMediaMode,
  adapter?: CallPermissionAdapter
): Promise<void> {
  const permissions = await requestCallMediaPermissions(mode, adapter);

  if (permissions.microphone !== 'granted') {
    throw new Error('audio_track_unavailable');
  }

  if (mode === 'video' && permissions.camera !== 'granted') {
    throw new Error('video_track_unavailable');
  }
}
