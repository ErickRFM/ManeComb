import {
  launchCamera,
  launchImageLibrary,
  type Asset,
  type CameraOptions,
  type ImageLibraryOptions,
} from 'react-native-image-picker';
import { PermissionsAndroid, Platform } from 'react-native';

type PickerMediaType = 'images' | 'videos';

type ImagePickerOptions = {
  mediaTypes?: PickerMediaType[];
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
  base64?: boolean;
};

type PickerAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  base64?: string | null;
  width?: number;
  height?: number;
};

function toMediaType(mediaTypes?: PickerMediaType[]): ImageLibraryOptions['mediaType'] {
  const safeTypes = mediaTypes || ['images'];
  const hasImages = safeTypes.includes('images');
  const hasVideos = safeTypes.includes('videos');

  if (hasImages && hasVideos) {
    return 'mixed';
  }

  return hasVideos ? 'video' : 'photo';
}

function toPickerAsset(asset: Asset): PickerAsset | null {
  if (!asset.uri) {
    return null;
  }

  return {
    uri: asset.uri,
    fileName: asset.fileName,
    mimeType: asset.type,
    base64: asset.base64,
    width: asset.width,
    height: asset.height,
  };
}

export async function launchImageLibraryAsync(options: ImagePickerOptions = {}) {
  const response = await launchImageLibrary({
    mediaType: toMediaType(options.mediaTypes),
    includeBase64: Boolean(options.base64),
    quality: options.quality as ImageLibraryOptions['quality'],
    selectionLimit: 1,
  });

  if (response.didCancel) {
    return {
      canceled: true,
      assets: [],
    };
  }

  if (response.errorCode) {
    throw new Error(response.errorMessage || response.errorCode);
  }

  return {
    canceled: false,
    assets: (response.assets || []).map(toPickerAsset).filter(Boolean) as PickerAsset[],
  };
}

export async function requestCameraPermissionAsync() {
  if (Platform.OS !== 'android') return true;

  const permission = PermissionsAndroid.PERMISSIONS.CAMERA;
  const alreadyGranted = await PermissionsAndroid.check(permission);

  if (alreadyGranted) return true;

  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function launchCameraAsync(options: ImagePickerOptions = {}) {
  if (!(await requestCameraPermissionAsync())) {
    throw new Error('Se necesita permiso de camara para tomar una foto o video.');
  }

  const response = await launchCamera({
    mediaType: toMediaType(options.mediaTypes) as CameraOptions['mediaType'],
    includeBase64: Boolean(options.base64),
    quality: options.quality as CameraOptions['quality'],
  });

  if (response.didCancel) {
    return {
      canceled: true,
      assets: [],
    };
  }

  if (response.errorCode) {
    throw new Error(response.errorMessage || response.errorCode);
  }

  return {
    canceled: false,
    assets: (response.assets || []).map(toPickerAsset).filter(Boolean) as PickerAsset[],
  };
}
