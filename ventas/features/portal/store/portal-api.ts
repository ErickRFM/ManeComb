import { isAxiosError } from 'axios';
import { getAdminActivationKeysRequest, getApiErrorMessage } from '../api';

export async function getOptionalActivationKeys() {
  return await getAdminActivationKeysRequest().catch(() => ({
    keys: [],
    summary: null,
  }));
}

export function getMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    return getApiErrorMessage(error, fallback);
  }

  return error instanceof Error ? error.message : fallback;
}
