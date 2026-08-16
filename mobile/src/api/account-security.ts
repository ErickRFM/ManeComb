import { apiClient } from '@/src/api/client';

type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type ChangePasswordResult = {
  ok: boolean;
  data?: {
    revokedSessions?: number;
  };
  message?: string;
};

export async function changePasswordRequest(payload: ChangePasswordPayload) {
  const response = await apiClient.post<ChangePasswordResult>(
    '/users/me/change-password',
    payload,
    {
      // Cambiar una credencial no es idempotente desde la perspectiva de sesion;
      // nunca se reintenta automaticamente ante una respuesta perdida.
      _skipNetworkRetry: true,
    } as never
  );
  return response.data;
}
