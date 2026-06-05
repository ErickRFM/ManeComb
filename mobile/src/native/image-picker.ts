import { launchImageLibrary, type Asset, type ImageLibraryOptions } from 'react-native-image-picker';

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
