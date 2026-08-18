import * as Keychain from 'react-native-keychain';

const SERVICE_PREFIX = 'manecomb.mobile';
const SESSION_BOUND_KEYS = new Set([
  'combis-session-token',
  'combis-refresh-token',
  'combis-session-mode',
  // El token FCM pertenece a la identidad del dispositivo autenticada. Si una
  // registracion vieja termina durante logout, no debe reaparecer en Keychain.
  'combis-push-token',
]);

let sessionCredentialMutationTail: Promise<void> = Promise.resolve();
let sessionCredentialWritesSuspended = false;

function isSessionBoundKey(key: string) {
  return SESSION_BOUND_KEYS.has(key);
}

function serializeSessionCredentialMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = sessionCredentialMutationTail.then(mutation, mutation);
  sessionCredentialMutationTail = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

/**
 * Bloquea nuevas escrituras ligadas a una identidad cuando cambia la
 * sessionEpoch. Los deletes siguen permitidos y se serializan detras de
 * cualquier write que ya hubiera entrado a Keychain, por lo que el teardown
 * siempre tiene la ultima palabra aunque un refresh o registro FCM hubiera
 * empezado unos milisegundos antes.
 */
export function suspendSessionCredentialWrites() {
  sessionCredentialWritesSuspended = true;
}

/** Se reabre solo cuando un flujo de autenticacion nuevo fue confirmado. */
export function resumeSessionCredentialWrites() {
  sessionCredentialWritesSuspended = false;
}

export async function setItemAsync(key: string, value: string) {
  const write = async () => {
    if (isSessionBoundKey(key) && sessionCredentialWritesSuspended) {
      return;
    }

    await Keychain.setGenericPassword(key, value, {
      service: `${SERVICE_PREFIX}.${key}`,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  };

  if (!isSessionBoundKey(key)) {
    await write();
    return;
  }

  await serializeSessionCredentialMutation(write);
}

export async function getItemAsync(key: string) {
  if (isSessionBoundKey(key)) {
    // Una lectura ligada a la sesion nunca adelanta un write/delete ya
    // confirmado por el flujo anterior. Esto evita hidratar una mezcla de
    // credenciales o un push token perteneciente a otra identidad.
    await sessionCredentialMutationTail;
  }

  const credentials = await Keychain.getGenericPassword({
    service: `${SERVICE_PREFIX}.${key}`,
  });

  return credentials ? credentials.password : null;
}

export async function deleteItemAsync(key: string) {
  const remove = async () => {
    await Keychain.resetGenericPassword({
      service: `${SERVICE_PREFIX}.${key}`,
    });
  };

  if (!isSessionBoundKey(key)) {
    await remove();
    return;
  }

  // Delete nunca se bloquea durante teardown. Al compartir la cola con writes,
  // queda fisicamente despues de cualquier operacion que ya estaba en Keychain.
  await serializeSessionCredentialMutation(remove);
}
