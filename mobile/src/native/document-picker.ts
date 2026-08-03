import { errorCodes, pick, types } from '@react-native-documents/picker';
import { toSupportedDocument, type PickedDocument } from './document-picker.utils';

export async function pickSupportedDocument(): Promise<PickedDocument | null> {
  try {
    const [selected] = await pick({ type: [types.pdf, types.images], allowMultiSelection: false, mode: 'import' });
    return toSupportedDocument(selected);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === errorCodes.OPERATION_CANCELED) return null;
    throw error;
  }
}
