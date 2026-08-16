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
  // Los POST no se reintentan automaticamente por el interceptor de ManeComb;
  // cambiar credenciales conserva asi semantica de una sola intencion.
  const response = await apiClient.post<ChangePasswordResult>(
    '/users/me/change-password',
    payload
  );
  return response.data;
}
