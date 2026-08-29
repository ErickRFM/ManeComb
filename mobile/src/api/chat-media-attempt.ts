import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClientMessageId, normalizeClientMessageId } from '@/src/utils/chat-message-id';

const STORAGE_KEY = 'manecomb:chat-media-attempts:v1';
const ATTEMPT_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 200;

export type ChatMediaAttemptKind = 'audio' | 'media';

type ChatMediaAttemptRecord = {
  clientMessageId: string;
  createdAt: string;
  signature: string;
};

type ChatMediaAttemptInput = {
  conversationId: string;
  formData: FormData;
  kind: ChatMediaAttemptKind;
};

let mutationTail: Promise<void> = Promise.resolve();

function serializeMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = mutationTail.then(mutation, mutation);
  mutationTail = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function getFormValue(formData: FormData, name: string): any {
  const candidate = formData as any;
  const getter = candidate?.get;
  if (typeof getter === 'function') {
    return getter.call(formData, name);
  }

  // React Native's Android FormData runtime keeps entries in `_parts`.
  // Do not assume the browser FormData API is present on-device.
  const parts = Array.isArray(candidate?._parts) ? candidate._parts : [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (Array.isArray(part) && part[0] === name) {
      return part[1] ?? null;
    }
  }

  return null;
}

function normalizeFileIdentity(file: any) {
  const uri = String(file?.uri || '').trim();
  const type = String(file?.type || '').trim().toLowerCase();

  // Android conserva la misma URI entre el intento inmediato y pending-sync.
  // La URI es más estable que un nombre generado al reconstruir el FormData.
  if (uri) {
    return { uri, type };
  }

  return {
    name: String(file?.name || '').trim(),
    type,
    size: Number.isFinite(Number(file?.size)) ? Number(file.size) : null,
    lastModified: Number.isFinite(Number(file?.lastModified)) ? Number(file.lastModified) : null,
  };
}

export function buildChatMediaAttemptSignature({
  conversationId,
  formData,
  kind,
}: ChatMediaAttemptInput) {
  const file = getFormValue(formData, 'file');
  return JSON.stringify({
    conversationId: String(conversationId || '').trim(),
    kind,
    file: normalizeFileIdentity(file),
    caption: String(getFormValue(formData, 'caption') || ''),
    durationSeconds: kind === 'audio'
      ? String(getFormValue(formData, 'durationSeconds') || '')
      : '',
  });
}

function parseRecords(raw: string | null): ChatMediaAttemptRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry) =>
          normalizeClientMessageId(entry?.clientMessageId) &&
          typeof entry?.signature === 'string' &&
          typeof entry?.createdAt === 'string'
        )
      : [];
  } catch {
    return [];
  }
}

function pruneRecords(records: ChatMediaAttemptRecord[], nowMs = Date.now()) {
  return records
    .filter((entry) => {
      const createdAt = Date.parse(entry.createdAt);
      return Number.isFinite(createdAt) && nowMs - createdAt <= ATTEMPT_TTL_MS;
    })
    .slice(-MAX_ATTEMPTS);
}

async function loadRecords() {
  return pruneRecords(parseRecords(await AsyncStorage.getItem(STORAGE_KEY)));
}

async function saveRecords(records: ChatMediaAttemptRecord[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pruneRecords(records)));
}

export async function ensureChatMediaAttemptIdentity(input: ChatMediaAttemptInput) {
  const signature = buildChatMediaAttemptSignature(input);
  const existingOnForm = normalizeClientMessageId(getFormValue(input.formData, 'clientMessageId'));
  if (existingOnForm) {
    return { clientMessageId: existingOnForm, signature };
  }

  const clientMessageId = await serializeMutation(async () => {
    const records = await loadRecords();
    const existing = records.find((entry) => entry.signature === signature);
    if (existing) {
      return existing.clientMessageId;
    }

    const nextId = createClientMessageId();
    await saveRecords([
      ...records,
      {
        clientMessageId: nextId,
        createdAt: new Date().toISOString(),
        signature,
      },
    ]);
    return nextId;
  });

  input.formData.append('clientMessageId', clientMessageId);
  return { clientMessageId, signature };
}

export async function confirmChatMediaAttempt(signature: string, clientMessageId: string) {
  const safeId = normalizeClientMessageId(clientMessageId);
  if (!signature || !safeId) return;

  await serializeMutation(async () => {
    const records = await loadRecords();
    const next = records.filter((entry) =>
      entry.signature !== signature || entry.clientMessageId !== safeId
    );
    if (next.length === records.length) return;
    await saveRecords(next);
  });
}

export async function clearChatMediaAttemptStateForTests() {
  await serializeMutation(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
  });
}
