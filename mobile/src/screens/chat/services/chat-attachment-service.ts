import * as ImagePicker from '@/src/native/image-picker';
import { Platform } from 'react-native';

type SendMediaMessage = (
  conversationId: string,
  formData: FormData
) => Promise<{ ok: boolean; message?: string }>;

type SendPickedMediaOptions = {
  activeConversationId: string;
  draft: string;
  sendMediaMessage: SendMediaMessage;
  source?: 'library' | 'camera';
  type: 'image' | 'video';
};

export async function sendPickedChatMedia({
  activeConversationId,
  draft,
  sendMediaMessage,
  source = 'library',
  type,
}: SendPickedMediaOptions) {
  const pickerOptions = {
    mediaTypes: [type === 'image' ? 'images' as const : 'videos' as const],
    allowsEditing: true,
    quality: 0.8,
  };
  const pickerResult =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

  if (pickerResult.canceled) {
    return { clearDraft: false, notice: null };
  }

  const asset = pickerResult.assets[0];

  if (!asset?.uri) {
    return { clearDraft: false, notice: 'No se pudo leer el archivo seleccionado.' };
  }

  const formData = new FormData();
  formData.append('caption', draft.trim());

  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    formData.append('file', blob, asset.fileName || (type === 'image' ? 'image.jpg' : 'video.mp4'));
  } else {
    formData.append('file', {
      uri: asset.uri,
      name: asset.fileName || (type === 'image' ? 'image.jpg' : 'video.mp4'),
      type: asset.mimeType || (type === 'image' ? 'image/jpeg' : 'video/mp4'),
    } as any);
  }

  const resultMessage = await sendMediaMessage(activeConversationId, formData);

  if (resultMessage.ok) {
    return {
      clearDraft: true,
      notice: type === 'image' ? 'Imagen enviada.' : 'Video enviado.',
    };
  }

  return {
    clearDraft: false,
    notice: resultMessage.message || 'Archivo listo, pero no se pudo enviar.',
  };
}
