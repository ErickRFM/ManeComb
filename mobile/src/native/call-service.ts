import { NativeModules, Platform } from 'react-native';

type ManeCombCallNativeModule = {
  startCallForegroundService: (isVideo: boolean) => Promise<void>;
  stopCallForegroundService: () => Promise<void>;
};

const nativeModule: ManeCombCallNativeModule | null =
  Platform.OS === 'android' ? NativeModules.ManeCombCall ?? null : null;

/**
 * Sin este foreground service Android 14+ corta la captura de microfono/camara
 * en cuanto la app pasa a segundo plano. Los fallos no deben tumbar la llamada:
 * peor es no poder llamar que llamar sin proteccion en background.
 */
export async function startCallForegroundService(isVideo: boolean): Promise<void> {
  if (!nativeModule) return;

  try {
    await nativeModule.startCallForegroundService(isVideo);
  } catch {
    // El servicio es un refuerzo, no un requisito para establecer la llamada.
  }
}

export async function stopCallForegroundService(): Promise<void> {
  if (!nativeModule) return;

  try {
    await nativeModule.stopCallForegroundService();
  } catch {
    // Detener el servicio nunca debe bloquear el cierre de la llamada.
  }
}
