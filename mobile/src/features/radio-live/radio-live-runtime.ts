import { Platform } from 'react-native';
import {
  RADIO_NATIVE_AVAILABLE,
  activateRadio,
  deactivateRadio,
  endRadioTransmission,
  getRadioSnapshot,
  requestRadioTransmission,
  selectRadioChannel,
  setRadioCallActive,
  subscribeToRadioState,
} from '@/src/native/audio';
import {
  initialRadioLiveState,
  projectNativeSnapshot,
  type RadioLiveRuntime,
} from './radio-live-types';

/**
 * Adaptador Android: traduce comandos de React a comandos del servicio nativo y
 * proyecta sus instantaneas. No posee transporte, socket, captura ni
 * reproduccion; todo eso vive en ManeCombRadioService.
 *
 * Por eso desmontar la pantalla de Radio, mandar la app a segundo plano o
 * suspender el runtime JS no interrumpe la sesion.
 */
const nativeRadioLiveRuntime: RadioLiveRuntime = {
  async activate(input) {
    await activateRadio({
      token: input.token,
      userId: input.userId,
      userName: input.userName,
      socketUrl: input.socketUrl,
      channelId: input.channelId,
    });
  },
  async selectChannel(channelId) {
    await selectRadioChannel(channelId);
  },
  async requestTransmission() {
    try {
      await requestRadioTransmission();
      // El resultado real (concedido, ocupado, sin permisos) llega como
      // instantanea: la autoridad es el backend a traves del servicio.
      return { ok: true };
    } catch (error) {
      return { ok: false, error: readErrorCode(error) };
    }
  },
  async endTransmission() {
    try {
      await endRadioTransmission();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: readErrorCode(error) };
    }
  },
  async setCallActive(active) {
    await setRadioCallActive(active);
  },
  async deactivate() {
    await deactivateRadio();
  },
  subscribe(listener) {
    return subscribeToRadioState((snapshot) => listener(projectNativeSnapshot(snapshot)));
  },
  async readSnapshot() {
    return projectNativeSnapshot(await getRadioSnapshot());
  },
};

/**
 * Plataformas sin PTT en vivo. Web envia notas de voz completas y no levanta
 * ninguna sesion de canal; declararlo explicitamente evita que la UI simule un
 * canal que no existe.
 */
const unsupportedRadioLiveRuntime: RadioLiveRuntime = {
  async activate() {},
  async selectChannel() {},
  async requestTransmission() {
    return { ok: false, error: 'radio_unsupported_platform' };
  },
  async endTransmission() {
    return { ok: false, error: 'radio_unsupported_platform' };
  },
  async setCallActive() {},
  async deactivate() {},
  subscribe() {
    return () => undefined;
  },
  async readSnapshot() {
    return initialRadioLiveState();
  },
};

export const RADIO_LIVE_SUPPORTED = Platform.OS === 'android' && RADIO_NATIVE_AVAILABLE;

export function createRadioLiveRuntime(): RadioLiveRuntime {
  return RADIO_LIVE_SUPPORTED ? nativeRadioLiveRuntime : unsupportedRadioLiveRuntime;
}

function readErrorCode(error: unknown) {
  const code = (error as { code?: string })?.code;
  return typeof code === 'string' && code ? code : 'radio_command_failed';
}
