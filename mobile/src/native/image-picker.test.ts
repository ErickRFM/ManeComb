const mockCheck = jest.fn();
const mockRequest = jest.fn();
const mockLaunchCamera = jest.fn();

jest.mock('react-native-image-picker', () => ({
  __esModule: true,
  launchCamera: mockLaunchCamera,
  launchImageLibrary: jest.fn(),
}));

import { PermissionsAndroid, Platform } from 'react-native';
import { launchCameraAsync, requestCameraPermissionAsync } from './image-picker';

describe('launchCameraAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    PermissionsAndroid.PERMISSIONS.CAMERA = 'android.permission.CAMERA';
    PermissionsAndroid.RESULTS.GRANTED = 'granted';
    PermissionsAndroid.check = mockCheck;
    PermissionsAndroid.request = mockRequest;
    mockLaunchCamera.mockResolvedValue({
      assets: [{ uri: 'file:///camera/photo.jpg', type: 'image/jpeg' }],
    });
  });

  it('no vuelve a solicitar CAMERA si el permiso ya estaba concedido', async () => {
    mockCheck.mockResolvedValue(true);

    const granted = await requestCameraPermissionAsync();

    expect(granted).toBe(true);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('solicita CAMERA y no abre la camara cuando se deniega', async () => {
    mockCheck.mockResolvedValue(false);
    mockRequest.mockResolvedValue('denied');

    await expect(launchCameraAsync()).rejects.toThrow('permiso de camara');
    expect(mockRequest).toHaveBeenCalledWith('android.permission.CAMERA');
    expect(mockLaunchCamera).not.toHaveBeenCalled();
  });
});
