import * as Keychain from 'react-native-keychain';

const SERVICE_PREFIX = 'manecomb.mobile';
const SESSION_CREDENTIAL_KEYS = new Set([
  'combis-session-token',
  'combis-refresh-token',
  'combis-session-mode',
]);

let sessionCredentialMutationTail: Promise<void> = Promise.resolve();
let sessionCredentialWritesSuspended = false;

function isSessionCredentialKey(key: string) {
  return SESSION_CREDENTIAL_KEYS.has(key);
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
 * Bloquea nuevas escrituras de credenciales cuando cambia la sessionEpoch.
 * Los deletes siguen permitidos y se serializan detras de cualquier write que
 * ya hubiera entrado a Keychain, por lo que el teardown siempre tiene la ultima
 * palabra aunque un refresh hubiera empezado unos milisegundos antes.
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
    if (isSessionCredentialKey(key) && sessionCredentialWritesSuspended) {
      return;
    }

    await Keychain.setGenericPassword(key, value, {
      service: `${SERVICE_PREFIX}.${key}`,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  };

  if (!isSessionCredentialKey(key)) {
    await write();
    return;
  }

  await serializeSessionCredentialMutation(write);
}

export async function getItemAsync(key: string) {
  if (isSessionCredentialKey(key)) {
    // Una lectura de sesion nunca adelanta un write/delete ya confirmado por el
    // flujo anterior. Esto evita hidratar una mezcla token/modo entre carreras.
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

  if (!isSessionCredentialKey(key)) {
    await remove();
    return;
  }

  // Delete nunca se bloquea durante teardown. Al compartir la cola con writes,
  // queda fisicamente despues de cualquier operacion que ya estaba en Keychain.
  await serializeSessionCredentialMutation(remove);
}
