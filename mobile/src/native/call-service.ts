import { NativeModules, Platform } from 'react-native';

export type CallFeedbackMode = 'none' | 'incoming' | 'ringback';

type ManeCombCallNativeModule = {
  startCallForegroundService: (isVideo: boolean) => Promise<void>;
  stopCallForegroundService: () => Promise<void>;
  setCallFeedbackMode?: (mode: CallFeedbackMode, callId: string | null) => Promise<boolean | void>;
  setIncomingCallWindowActive?: (active: boolean) => Promise<boolean | void>;
  setCallSpeakerEnabled?: (enabled: boolean) => Promise<boolean | void>;
  resetCallAudioRoute?: () => Promise<boolean | void>;
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

/**
 * La maquina de llamada solo expresa el modo. Android conserva una sola autoridad
 * para ringtone, vibracion y ringback, de modo que no haya MediaPlayer/Vibration
 * paralelos compitiendo con CallStyle o con WebRTC.
 */
export async function setCallFeedbackMode(
  mode: CallFeedbackMode,
  callId: string | null = null
): Promise<void> {
  if (!nativeModule?.setCallFeedbackMode) return;

  try {
    await nativeModule.setCallFeedbackMode(mode, callId);
  } catch {
    // Feedback nunca debe bloquear signaling ni el cleanup de una llamada.
  }
}

export async function setIncomingCallWindowActive(active: boolean): Promise<void> {
  if (!nativeModule?.setIncomingCallWindowActive) return;

  try {
    await nativeModule.setIncomingCallWindowActive(active);
  } catch {
    // MainActivity mantiene un autocierre nativo; este bridge es un cierre temprano best-effort.
  }
}

export async function setCallSpeakerEnabled(enabled: boolean): Promise<boolean> {
  if (!nativeModule?.setCallSpeakerEnabled) return false;

  try {
    return (await nativeModule.setCallSpeakerEnabled(enabled)) !== false;
  } catch {
    return false;
  }
}

export async function resetCallAudioRoute(): Promise<void> {
  if (!nativeModule?.resetCallAudioRoute) return;

  try {
    await nativeModule.resetCallAudioRoute();
  } catch {
    // El cleanup de WebRTC debe continuar aunque el cambio de salida falle.
  }
}
