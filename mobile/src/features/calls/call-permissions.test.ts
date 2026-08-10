import {
  assertCallMediaPermissions,
  callPermissionFailureNeedsSettings,
  checkCallMediaPermissions,
  getCallPermissionFailure,
  getCallPermissionFailureCopy,
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

  it('requests microphone and camera sequentially for a video call', async () => {
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
      ['android.permission.RECORD_AUDIO'],
      ['android.permission.CAMERA'],
    ]);
  });

  it('does not request camera if microphone was denied first', async () => {
    const { adapter, requestedPermissions } = createAdapter({
      requested: {
        'android.permission.RECORD_AUDIO': 'denied',
        'android.permission.CAMERA': 'granted',
      },
    });

    const result = await requestCallMediaPermissions('video', adapter);
    expect(result).toEqual({
      microphone: 'denied',
      camera: 'not_requested',
    });
    expect(requestedPermissions).toEqual([['android.permission.RECORD_AUDIO']]);
    expect(getCallPermissionFailure(result, 'video')).toBe('microphone_permission_denied');
  });

  it('does not show another prompt when both permissions already exist', async () => {
    const { adapter, requestedPermissions } = createAdapter({
      granted: ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA'],
    });

    await assertCallMediaPermissions('video', adapter);
    expect(requestedPermissions).toEqual([]);
  });

  it('final media assertion is check-only and never opens a late prompt', async () => {
    const { adapter, requestedPermissions } = createAdapter({
      requested: { 'android.permission.RECORD_AUDIO': 'granted' },
    });

    await expect(assertCallMediaPermissions('audio', adapter)).rejects.toThrow(
      'audio_track_unavailable'
    );
    expect(requestedPermissions).toEqual([]);
  });

  it('checks camera and microphone without requesting during capture defense', async () => {
    const { adapter, requestedPermissions } = createAdapter({
      granted: ['android.permission.RECORD_AUDIO'],
    });

    await expect(checkCallMediaPermissions('video', adapter)).resolves.toEqual({
      microphone: 'granted',
      camera: 'denied',
    });
    expect(requestedPermissions).toEqual([]);
  });

  it('classifies microphone denial before media capture', async () => {
    const { adapter } = createAdapter({
      requested: { 'android.permission.RECORD_AUDIO': 'denied' },
    });
    const permissions = await requestCallMediaPermissions('audio', adapter);

    expect(getCallPermissionFailure(permissions, 'audio')).toBe('microphone_permission_denied');
    await expect(assertCallMediaPermissions('audio', adapter)).rejects.toThrow(
      'audio_track_unavailable'
    );
  });

  it('classifies blocked camera and requires settings', async () => {
    const { adapter } = createAdapter({
      granted: ['android.permission.RECORD_AUDIO'],
      requested: { 'android.permission.CAMERA': 'never_ask_again' },
    });
    const permissions = await requestCallMediaPermissions('video', adapter);
    const failure = getCallPermissionFailure(permissions, 'video');

    expect(failure).toBe('camera_permission_blocked');
    expect(callPermissionFailureNeedsSettings(failure)).toBe(true);
    expect(getCallPermissionFailureCopy(failure)).toContain('Ajustes');
  });

  it('final capture guard maps a missing camera to video_track_unavailable', async () => {
    const { adapter } = createAdapter({
      granted: ['android.permission.RECORD_AUDIO'],
    });

    await expect(assertCallMediaPermissions('video', adapter)).rejects.toThrow(
      'video_track_unavailable'
    );
  });
});
