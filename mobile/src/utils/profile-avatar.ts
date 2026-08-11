import { Platform } from 'react-native';
import * as ImagePicker from '@/src/native/image-picker';

export const PROFILE_AVATAR_MAX_DIMENSION = 512;
export const PROFILE_AVATAR_MAX_BYTES = 768 * 1024;
const PROFILE_AVATAR_QUALITY = 0.72;

const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function estimateBase64Bytes(base64: string) {
  const compact = base64.replace(/\s+/g, '');
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

export function normalizeProfileAvatarDataUrl(value: string) {
  const match = value.trim().match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error('La foto seleccionada no se pudo preparar para guardarse.');
  }

  const mimeType = String(match[1] || '').trim().toLowerCase();
  if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    throw new Error('Selecciona una imagen JPG, PNG, WEBP, HEIC o HEIF.');
  }

  const base64 = String(match[2] || '').replace(/\s+/g, '');
  if (!base64 || estimateBase64Bytes(base64) > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error('La foto sigue siendo demasiado pesada. Prueba con otra imagen.');
  }

  return `data:${mimeType};base64,${base64}`;
}

async function pickWebAvatar(): Promise<string | null> {
  const runtime = globalThis as typeof globalThis & { document?: any };
  const doc = runtime.document;
  if (!doc?.createElement) {
    throw new Error('No fue posible abrir el selector de imagen.');
  }

  return await new Promise<string | null>((resolve, reject) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No fue posible leer la foto seleccionada.'));
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('No fue posible leer la foto seleccionada.'));
          return;
        }

        const image = doc.createElement('img');
        image.onerror = () => reject(new Error('La imagen seleccionada no es valida.'));
        image.onload = () => {
          const sourceWidth = Math.max(1, Number(image.naturalWidth || image.width || 1));
          const sourceHeight = Math.max(1, Number(image.naturalHeight || image.height || 1));
          const scale = Math.min(1, PROFILE_AVATAR_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
          const width = Math.max(1, Math.round(sourceWidth * scale));
          const height = Math.max(1, Math.round(sourceHeight * scale));
          const canvas = doc.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('No fue posible procesar la foto seleccionada.'));
            return;
          }

          context.drawImage(image, 0, 0, width, height);
          try {
            resolve(normalizeProfileAvatarDataUrl(canvas.toDataURL('image/jpeg', PROFILE_AVATAR_QUALITY)));
          } catch (error) {
            reject(error);
          }
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

export async function pickProfileAvatarDataUrl(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return await pickWebAvatar();
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: PROFILE_AVATAR_QUALITY,
    base64: true,
    maxWidth: PROFILE_AVATAR_MAX_DIMENSION,
    maxHeight: PROFILE_AVATAR_MAX_DIMENSION,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset?.base64) {
    throw new Error('La foto no pudo prepararse para guardarse. Vuelve a seleccionarla.');
  }

  return normalizeProfileAvatarDataUrl(
    `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
  );
}
