import { AppState, type AppStateStatus } from 'react-native';
import { activateRadio, getRadioSnapshot, setRadioSessionAuthState, subscribeToRadioState } from '@/src/native/audio';
import { createRadioLiveRuntime } from './radio-live-runtime';

jest.mock('@/src/native/audio', () => ({
  RADIO_NATIVE_AVAILABLE: true,
  activateRadio: jest.fn(async () => {}),
  getRadioSnapshot: jest.fn(),
  setRadioSessionAuthState: jest.fn(async () => {}),
  subscribeToRadioState: jest.fn(() => jest.fn()),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, AppState: { addEventListener: jest.fn() } }));

afterEach(() => jest.restoreAllMocks());

it('passes rotated credentials and the non-sensitive revision through the real native bridge adapter', async () => {
  const runtime = createRadioLiveRuntime();
  const input = { userId: 'test-user', userName: 'Operador', token: 'test-new-token', socketUrl: 'https://backend.test', channelId: 'general', authRevision: 42 };
  await runtime.activate(input);
  expect(activateRadio).toHaveBeenCalledWith(input);
  await runtime.setSessionAuthState('unauthorized');
  expect(setRadioSessionAuthState).toHaveBeenCalledWith('unauthorized');
});

it('reconciles the native auth rejection after background/foreground and unsubscribes cleanly', async () => {
  let resume: (state: AppStateStatus) => void = () => {};
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { resume = listener; return { remove }; });
  (getRadioSnapshot as jest.Mock).mockResolvedValue({ phase: 'RECONNECTING', authRevision: 42, channelId: 'general', connected: false, errorCode: 'radio_auth_refresh_required' });
  const listener = jest.fn();
  const unsubscribe = createRadioLiveRuntime().subscribe(listener);
  resume('background');
  expect(getRadioSnapshot).not.toHaveBeenCalled();
  resume('active');
  await Promise.resolve();
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({ phase: 'RECONNECTING', authRevision: 42, lastErrorCode: 'radio_auth_refresh_required' }));
  expect(subscribeToRadioState).toHaveBeenCalled();
  unsubscribe();
  expect(remove).toHaveBeenCalled();
});
