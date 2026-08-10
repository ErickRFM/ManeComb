import { Alert, Platform } from 'react-native';

import {
  callPermissionFailureNeedsSettings,
  getCallPermissionFailure,
  getCallPermissionFailureCopy,
  openCallPermissionSettings,
  requestCallMediaPermissions,
  type CallMediaMode,
} from './call-permissions';

/**
 * Puerta única de UX antes de señalizar o aceptar una llamada.
 *
 * Android muestra primero el prompt del sistema. Si el permiso ya quedó en
 * NEVER_ASK_AGAIN, ManeComb explica el bloqueo y ofrece abrir Ajustes. En web/iOS
 * el adaptador actual no requiere esta puerta nativa y devuelve granted.
 */
export async function ensureCallMediaPermissionsForUi(mode: CallMediaMode): Promise<boolean> {
  const permissions = await requestCallMediaPermissions(mode);
  const failure = getCallPermissionFailure(permissions, mode);
  if (!failure) return true;

  const copy = getCallPermissionFailureCopy(failure);
  if (Platform.OS !== 'android') return false;

  if (callPermissionFailureNeedsSettings(failure)) {
    Alert.alert('Permiso bloqueado', copy, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Abrir ajustes',
        onPress: () => {
          void openCallPermissionSettings();
        },
      },
    ]);
    return false;
  }

  Alert.alert('Permiso requerido', copy, [{ text: 'Entendido' }]);
  return false;
}
