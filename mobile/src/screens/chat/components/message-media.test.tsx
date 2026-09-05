import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Image, StyleSheet } from 'react-native';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { apiClient, configureApiSessionRecovery, refreshAccessToken, setAuthToken } from '@/src/api/client';
import { useAppStore } from '@/src/store/use-app-store';
import { ImageMessageBubble, VideoMessageBubble, VoiceMessageBubble } from './message-media';

let mockVideoRenders = 0;
let mockVideoProps: any;
let mockAudioSource: any;
jest.mock('react-native-video', () => ({
  __esModule: true,
  default: (props: any) => { mockVideoProps = props; mockVideoRenders += 1; if (mockVideoRenders > 30) throw new Error('video_source_render_loop'); return null; },
}));
jest.mock('@/src/native/audio', () => ({
  useAudioPlayer: (source: any) => { mockAudioSource = source; return { play: jest.fn(async () => {}), pause: jest.fn(async () => {}), seekTo: jest.fn(async () => {}) }; },
  useAudioPlayerStatus: () => ({ playing: false, isLoaded: false, duration: 0, currentTime: 0 }),
  getAudioPlaybackErrorMessage: () => 'test-error',
}));
jest.mock('@/src/native/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('@/src/hooks/use-app-theme', () => ({ useAppTheme: () => ({ theme: jest.requireActual('@/constants/theme').getAppTheme('light') }) }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/src/api/mobile-runtime', () => ({
  API_URL: 'https://backend.test/api', API_ORIGIN: 'https://backend.test', SOCKET_URL: 'https://backend.test',
  API_TIMEOUT_MS: 1000, mobileLog: jest.fn(), runtimeNetworkConfig: { platform: 'android' }, wait: async () => {},
}));
jest.mock('@/src/native/background-location', () => ({
  getBackgroundLocationCredentialStateAsync: jest.fn(async () => null),
  setBackgroundLocationCredentialsAsync: jest.fn(async () => true),
  setBackgroundLocationRefreshRequestIdAsync: jest.fn(async () => true),
}));
jest.mock('@/src/store/use-app-store', () => {
  const { create: makeStore } = jest.requireActual('zustand');
  return { useAppStore: makeStore(() => ({ token: 'test-old', networkStatus: 'online' })) };
});

// RN exports lazy getters. Bootstrap the real Jest native primitives while the
// suite loads, not inside the first auth test's unchanged 5s assertion budget.
// Cold Windows: first render ~4.2s before bootstrap, ~14ms after; no mock swap.
for (const name of ['ActivityIndicator', 'Image', 'Modal', 'Pressable', 'Text', 'View']) {
  void jest.requireActual('react-native')[name];
}
let tree: ReactTestRenderer | undefined;
let requests: Array<{ url: string | undefined; authorization: unknown; range: unknown }>;
const originalAdapter = apiClient.defaults.adapter;
const settle = async () => { for (let index = 0; index < 60; index += 1) await Promise.resolve(); };
const response = (config: InternalAxiosRequestConfig, status: number, data: unknown = {}): AxiosResponse => ({ config, status, data, headers: {}, statusText: String(status) });
const reject = (config: InternalAxiosRequestConfig, status?: number): never => {
  throw new AxiosError('test-response', status ? 'ERR_BAD_REQUEST' : 'ERR_NETWORK', config, undefined, status ? response(config, status) : undefined);
};
const imageMessage = { id: 'test-image', imageUrl: 'https://backend.test/api/chat/media/test-image' } as any;
function CurrentImage({ message = imageMessage }: { message?: any }) {
  const token = useAppStore(state => state.token);
  return <ImageMessageBubble message={message} token={token} />;
}
const preview = () => tree!.root.findAllByType(Image).find(node => typeof node.props.onError === 'function')!;
async function renderImage() { await act(async () => { tree = create(<CurrentImage />); }); }
async function imageError() { await act(async () => { preview().props.onError(); await settle(); }); }
async function network(networkStatus: 'online' | 'offline' | 'recovering') { await act(async () => { useAppStore.setState({ networkStatus }); await settle(); }); }

beforeEach(() => {
  requests = []; mockVideoRenders = 0; mockVideoProps = null; mockAudioSource = null;
  useAppStore.setState({ token: 'test-old', networkStatus: 'online' });
  setAuthToken('test-old');
  configureApiSessionRecovery({
    getRefreshToken: () => 'test-refresh',
    onTokenRefresh: async session => { useAppStore.setState({ token: session.token }); },
    onSessionExpired: jest.fn(), onAccountSuspended: jest.fn(),
  });
  apiClient.defaults.adapter = async config => {
    requests.push({ url: config.url, authorization: config.headers.Authorization, range: config.headers.Range });
    return response(config, 200);
  };
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); tree = undefined; await settle(); });
  configureApiSessionRecovery(null); apiClient.defaults.adapter = originalAdapter; setAuthToken(null); jest.restoreAllMocks();
});

it('image 401 and realtime consumers share one refresh and reload with rotated headers', async () => {
  let releaseRefresh: () => void = () => {};
  const barrier = new Promise<void>(resolve => { releaseRefresh = resolve; });
  apiClient.defaults.adapter = async config => {
    requests.push({ url: config.url, authorization: config.headers.Authorization, range: config.headers.Range });
    if (config.url === '/auth/refresh') { await barrier; return response(config, 200, { token: 'test-next', refreshToken: 'test-next-refresh' }); }
    if (config.headers.Authorization === 'Bearer test-old') return reject(config, 401);
    return response(config, 206);
  };
  await renderImage();
  await imageError();
  const global = refreshAccessToken();
  const radio = refreshAccessToken();
  await act(async () => { releaseRefresh(); await Promise.all([global, radio]); await settle(); });
  expect(requests.filter(request => request.url === '/auth/refresh')).toHaveLength(1);
  expect(preview().props.source.headers.Authorization).toBe('Bearer test-next');
  expect(preview().props.source.uri).toContain('mediaRetry=1');
  expect(requests.filter(request => request.url === imageMessage.imageUrl).every(request => request.range === 'bytes=0-0')).toBe(true);
});

it('offline does not probe; reconnect performs one bounded recovery', async () => {
  await network('offline'); await renderImage(); await imageError();
  expect(requests).toHaveLength(0);
  await network('online');
  expect(requests).toHaveLength(1);
  expect(preview().props.source.uri).toContain('mediaRetry=1');
  await act(async () => { tree!.update(<CurrentImage />); await settle(); });
  expect(requests).toHaveLength(1);
});

it('duplicate native image errors share one probe and cannot cause a render/retry loop', async () => {
  await renderImage();
  await act(async () => { preview().props.onError(); preview().props.onError(); await settle(); });
  expect(requests).toHaveLength(1);
  await imageError(); await imageError();
  expect(requests).toHaveLength(1);
});

it.each([401, 403, 404])('terminal media %s does not auto/manual retry on network or token changes', async status => {
  apiClient.defaults.adapter = async config => {
    requests.push({ url: config.url, authorization: config.headers.Authorization, range: config.headers.Range });
    return reject(config, status);
  };
  await renderImage(); await imageError();
  const initialRequests = requests.length;
  expect(initialRequests).toBeGreaterThan(0);
  await network('offline'); await network('online');
  await act(async () => { setAuthToken('test-next'); useAppStore.setState({ token: 'test-next' }); await settle(); });
  const button = tree!.root.findAll(node => node.props.accessibilityLabel === 'Imagen no disponible' && node.props.disabled === true)[0];
  expect(button).toBeDefined();
  expect(button.props.disabled).toBe(true);
  const placeholder = tree!.root.findAllByProps({ testID: 'unavailable-image-placeholder' })[0];
  expect(StyleSheet.flatten(placeholder.props.style)).toMatchObject({ width: '100%', aspectRatio: 1 });
  expect(requests).toHaveLength(initialRequests);
  expect(tree!.root.findAllByType(Image).filter(node => node.props.onError)).toHaveLength(0);
});

it.each([undefined, 503])('transient %s is bounded within a network epoch and recovers after return', async status => {
  let available = false;
  apiClient.defaults.adapter = async config => {
    requests.push({ url: config.url, authorization: config.headers.Authorization, range: config.headers.Range });
    if (!available) return reject(config, status);
    return response(config, 206);
  };
  await renderImage(); await imageError();
  const before = requests.length;
  expect(before).toBeGreaterThan(0);
  expect(before).toBeLessThanOrEqual(3); // Existing apiClient bounded retries, no new retry engine.
  await act(async () => { tree!.update(<CurrentImage />); await settle(); });
  expect(requests).toHaveLength(before);
  available = true;
  await network('recovering'); await network('online');
  expect(requests).toHaveLength(before); // HTTP retry/health status alone is not a new network epoch.
  await network('offline'); await network('online');
  expect(requests).toHaveLength(before + 1);
  expect(preview().props.source.uri).toContain('mediaRetry=1');
});

it('a recovery from the previous asset cannot change the replacement image', async () => {
  let releaseOld: () => void = () => {};
  const barrier = new Promise<void>(resolve => { releaseOld = resolve; });
  apiClient.defaults.adapter = async config => { await barrier; return response(config, 206); };
  await renderImage(); await imageError();
  const newMessage = { ...imageMessage, imageUrl: 'https://backend.test/api/chat/media/new-image' };
  await act(async () => { tree!.update(<CurrentImage message={newMessage} />); await settle(); });
  await act(async () => { releaseOld(); await settle(); });
  expect(preview().props.source.uri).toBe(newMessage.imageUrl);
});

it('an unmounted recovery cannot reload a newly mounted image', async () => {
  let releaseOld: () => void = () => {};
  const barrier = new Promise<void>(resolve => { releaseOld = resolve; });
  apiClient.defaults.adapter = async config => { await barrier; return response(config, 206); };
  await renderImage(); await imageError();
  await act(async () => { tree!.unmount(); tree = undefined; });
  await renderImage();
  await act(async () => { releaseOld(); await settle(); });
  expect(preview().props.source.uri).toBe(imageMessage.imageUrl);
});

it('audio resolves current authority at playback time even with an older render token', async () => {
  await act(async () => { tree = create(<VoiceMessageBubble isActive={false} isOwn={false} message={{ id: 'test-voice', audioUrl: 'https://backend.test/api/chat/media/test-voice' } as any} token="test-old" onActivate={jest.fn()} onDeactivate={jest.fn()} />); });
  const getHeaders = mockAudioSource.getHeaders;
  expect(getHeaders().Authorization).toBe('Bearer test-old');
  setAuthToken('test-next');
  expect(getHeaders().Authorization).toBe('Bearer test-next');
});

it('video keeps its source stable across playback/status renders and changes it for token rotation', async () => {
  const message = { id: 'test-video', videoUrl: 'https://backend.test/api/chat/media/test-video' } as any;
  await act(async () => { tree = create(<VideoMessageBubble message={message} token="test-old" />); });
  const source = mockVideoProps.source;
  await act(async () => { mockVideoProps.onLoad({ duration: 10 }); mockVideoProps.onProgress({ currentTime: 2 }); });
  expect(mockVideoProps.source).toBe(source);
  expect(mockVideoRenders).toBeLessThan(10);
  setAuthToken('test-next');
  await act(async () => { tree!.update(<VideoMessageBubble message={message} token="test-next" />); });
  expect(mockVideoProps.source).not.toBe(source);
  expect(mockVideoProps.source.headers.Authorization).toBe('Bearer test-next');
});
