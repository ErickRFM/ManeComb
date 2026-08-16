import { isAxiosError } from 'axios';
import { getAdminActivationKeysRequest, getApiErrorMessage } from '../api';

export async function getOptionalActivationKeys() {
  try {
    return await getAdminActivationKeysRequest();
  } catch (error) {
    // Activation keys are optional only when the authenticated account is not
    // allowed to use that capability. Availability failures must remain errors
    // instead of impersonating a legitimate empty collection.
    if (isAxiosError(error) && error.response?.status === 403) {
      return { keys: [], summary: null };
    }
    throw error;
  }
}

export function getMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    return getApiErrorMessage(error, fallback);
  }

  return error instanceof Error ? error.message : fallback;
}

export function getErrorCode(error: unknown) {
  if (isAxiosError(error)) {
    return String(error.response?.data?.code || error.code || `http_${error.response?.status || 'unknown'}`);
  }
  return error instanceof Error && error.name ? error.name : 'request_failed';
}
