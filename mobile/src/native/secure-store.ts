import * as Keychain from 'react-native-keychain';

const SERVICE_PREFIX = 'manecomb.mobile';

export async function setItemAsync(key: string, value: string) {
  await Keychain.setGenericPassword(key, value, {
    service: `${SERVICE_PREFIX}.${key}`,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getItemAsync(key: string) {
  const credentials = await Keychain.getGenericPassword({
    service: `${SERVICE_PREFIX}.${key}`,
  });

  return credentials ? credentials.password : null;
}

export async function deleteItemAsync(key: string) {
  await Keychain.resetGenericPassword({
    service: `${SERVICE_PREFIX}.${key}`,
  });
}
