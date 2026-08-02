import type { DocumentUploadFile } from '@/src/api/client';
import { validatePickedDocument } from '@/src/screens/documents/documents.utils';

export type PickedDocument = DocumentUploadFile & { size?: number | null };

export function toSupportedDocument(selected: { uri: string; name: string | null; type: string | null; size: number | null }): PickedDocument {
  const validation = validatePickedDocument(selected);
  if (validation) throw new Error(validation);
  return { uri: selected.uri, name: selected.name || 'documento', type: selected.type || 'application/octet-stream', size: selected.size };
}
