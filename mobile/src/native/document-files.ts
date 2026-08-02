import { NativeModules, Platform } from 'react-native';
import { API_URL } from '@/src/api/client';

type DocumentFileModule = {
  downloadAndOpen(url: string, token: string, fileName: string, mimeType: string): Promise<void>;
};

const nativeModule = NativeModules.ManeCombDocumentFile as DocumentFileModule | undefined;

export async function openAuthenticatedDocument(input: {
  storageKey: string;
  token: string;
  fileName: string;
  mimeType: string;
}) {
  const url = `${API_URL}/documents/files/${encodeURIComponent(input.storageKey)}`;
  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${input.token}` } });
    if (!response.ok) throw new Error('No fue posible descargar el documento.');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = input.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return;
  }
  if (!nativeModule) throw new Error('La apertura de documentos no está disponible en este dispositivo.');
  await nativeModule.downloadAndOpen(url, input.token, input.fileName, input.mimeType);
}
