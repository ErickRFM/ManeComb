const fs = require('node:fs');
const path = require('node:path');
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { create as createStore } from 'zustand';
import { AppTheme } from '@/constants/theme';
import { MapSessionNotice } from './components/MapSessionNotice';

const mockSignOut = jest.fn();
const mockRefreshAll = jest.fn();
const mockStore = createStore<any>(() => ({}));
let mockInsetTop = 24;

jest.mock('@/src/store/use-app-store', () => ({ useAppStore: (selector: any) => mockStore(selector) }));
jest.mock('@/src/hooks/use-app-theme', () => ({
  useAppTheme: () => ({ theme: jest.requireActual('@/constants/theme').getAppTheme('light') }),
}));
jest.mock('@/src/native/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: mockInsetTop, bottom: 24, left: 0, right: 0 }) }));

let tree: ReactTestRenderer;
beforeEach(() => {
  jest.useFakeTimers();
  mockSignOut.mockClear(); mockRefreshAll.mockClear(); mockInsetTop = 24;
  mockStore.setState({ socketStatus: 'connected', networkStatus: 'online', user: { id: 'test-user' },
    realtimeDiagnostics: { lastPongAt: new Date().toISOString(), missedHeartbeatAcks: 0 },
    pendingSyncCount: 0, isRefreshing: false, signOut: mockSignOut, refreshAll: mockRefreshAll }, true);
});
afterEach(() => { if (tree) act(() => tree.unmount()); jest.useRealTimers(); });

function renderNotice() { act(() => { tree = create(<MapSessionNotice />); }); }

describe('native map terminal session authority', () => {
  it('mounts the shared terminal notice outside every map content/selector/recovery branch', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../map-screen.native.tsx'), 'utf8');
    const wrapper = source.slice(source.indexOf('export function MapScreen()'), source.indexOf('function MapScreenContent()'));
    expect(wrapper).toContain('<MapScreenContent />');
    expect(wrapper).toContain('<MapSessionNotice />');
    expect(wrapper.indexOf('<MapSessionNotice />')).toBeGreaterThan(wrapper.indexOf('<MapScreenContent />'));
  });

  it.each(['connected', 'connecting', 'reconnecting', 'disconnected', 'error', 'idle'])('does not invent expiry for %s', socketStatus => {
    mockStore.setState({ socketStatus }); renderNotice();
    act(() => jest.advanceTimersByTime(5000));
    expect(tree.toJSON()).toBeNull();
  });

  it('reacts to terminal auth even with cached data, shows existing copy and uses signOut, never refreshAll', () => {
    renderNotice();
    act(() => mockStore.setState({ socketStatus: 'unauthorized', mapData: { vehicles: [] } }));
    expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Sesión expirada. Vuelve a iniciar sesión.')).toBe(true);
    const action = tree.root.findAllByProps({ accessibilityLabel: 'Volver a iniciar sesión' })
      .find(node => typeof node.props.onPress === 'function')!;
    expect(action.props.accessibilityLabel).toBe('Volver a iniciar sesión');
    act(() => action.props.onPress());
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockRefreshAll).not.toHaveBeenCalled();
    act(() => mockStore.setState({ socketStatus: 'connected' }));
    expect(tree.toJSON()).toBeNull();
  });

  it.each([0, 24, 48])('keeps the terminal notice outside layout flow and below the %i inset without a second SafeArea', top => {
    mockInsetTop = top; mockStore.setState({ socketStatus: 'unauthorized' }); renderNotice();
    const style = StyleSheet.flatten(tree.root.findByProps({ testID: 'map-session-notice' }).props.style);
    expect(style).toMatchObject({ position: 'absolute', top: top + AppTheme.spacing.sm, left: AppTheme.spacing.sm, right: AppTheme.spacing.sm, zIndex: 40 });
  });
});
