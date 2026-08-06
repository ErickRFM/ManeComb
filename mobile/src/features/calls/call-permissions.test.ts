import {
  assertCallMediaPermissions,
  requestCallMediaPermissions,
  type CallPermissionAdapter,
} from './call-permissions';

function createAdapter(options: {
  granted?: string[];
  requested?: Record<string, string>;
  platform?: string;
} = {}) {
  const requestedPermissions: string[][] = [];
  const granted = new Set(options.granted || []);
  const adapter: CallPermissionAdapter = {
    platform: options.platform || 'android',
    microphonePermission: 'android.permission.RECORD_AUDIO',
    cameraPermission: 'android.permission.CAMERA',
    grantedResult: 'granted',
    blockedResult: 'never_ask_again',
    check: async (permission) => granted.has(permission),
    requestMultiple: async (permissions) => {
      requestedPermissions.push(permissions);
      return Object.fromEntries(
        permissions.map((permission) => [permission, options.requested?.[permission] || 'denied'])
      );
    },
  };

  return { adapter, requestedPermissions };
}

describe('call media permissions', () => {
  it('requests only microphone for an audio call', async () => {
    const { adapter, requestedPermissions } = createAdapter({
      requested: { 'android.permission.RECORD_AUDIO': 'granted' },
    });

    await expect(requestCallMediaPermissions('audio', adapter)).resolves.toEqual({
      microphone: 'granted',
      camera: 'not_required',
    });
    expect(requestedPermissions).toEqual([['android.permission.RECORD_AUDIO']]);
  });

  it('requests microphone and camera together for a video call', async () => {
    const { adapter, requestedPermissions } = createAdapter({
      requested: {
        'android.permission.RECORD_AUDIO': 'granted',
        'android.permission.CAMERA': 'granted',
      },
    });

    await expect(requestCallMediaPermissions('video', adapter)).resolves.toEqual({
      microphone: 'granted',
      camera: 'granted',
    });
    expect(requestedPermissions).toEqual([
      ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA'],
    ]);
  });

  it('does not show another prompt when both permissions already exist', async () => {
    const { adapter, requestedPermissions } = createAdapter({
      granted: ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA'],
    });

    await assertCallMediaPermissions('video', adapter);
    expect(requestedPermissions).toEqual([]);
  });

  it('stops audio capture when microphone permission is denied', async () => {
    const { adapter } = createAdapter({
      requested: { 'android.permission.RECORD_AUDIO': 'denied' },
    });

    await expect(assertCallMediaPermissions('audio', adapter)).rejects.toThrow(
      'audio_track_unavailable'
    );
  });

  it('stops video capture when camera permission is blocked', async () => {
    const { adapter } = createAdapter({
      granted: ['android.permission.RECORD_AUDIO'],
      requested: { 'android.permission.CAMERA': 'never_ask_again' },
    });

    await expect(assertCallMediaPermissions('video', adapter)).rejects.toThrow(
      'video_track_unavailable'
    );
  });
});
