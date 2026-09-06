import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { create as createStore } from 'zustand';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTheme } from '@/constants/theme';
import { AppShell } from './app-shell';
import { ConnectionBanner } from './connection-banner';

const mockStore = createStore<any>(() => ({}));
const mockSignOut = jest.fn();
const mockRefresh = jest.fn();
let mockTopInset = 24;
let mockDesktop = false;
jest.mock('@/src/store/use-app-store', () => ({ useAppStore: (select: any) => mockStore(select) }));
jest.mock('@/src/navigation/router', () => ({ usePathname: () => '/mensajes' }));
jest.mock('@/src/desktop/use-desktop-mode', () => ({ useDesktopMode: () => mockDesktop }));
jest.mock('@/src/desktop/desktop-navigation', () => ({ getSectionByPathname: () => ({ key: 'messages' }) }));
jest.mock('@/src/hooks/use-app-theme', () => ({
  useAppTheme: () => ({ theme: jest.requireActual('@/constants/theme').getAppTheme('light') }),
}));
jest.mock('@/src/native/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('./operational-menu-drawer', () => ({ OperationalMenuDrawer: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: mockTopInset, left: 0, right: 0, bottom: 24 }),
}));
for (const name of ['ActivityIndicator', 'Pressable', 'RefreshControl', 'Text', 'View']) {
  void jest.requireActual('react-native')[name];
}
let tree: ReactTestRenderer;
beforeEach(() => {
  jest.useFakeTimers(); mockTopInset = 24; mockDesktop = false;
  mockStore.setState({ user: { id: 'test-user' }, socketStatus: 'unauthorized', networkStatus: 'online',
    pendingSyncCount: 0, isRefreshing: false, realtimeDiagnostics: { lastPongAt: null, missedHeartbeatAcks: 0 },
    signOut: mockSignOut, refreshAll: mockRefresh }, true);
});
afterEach(() => { if (tree) act(() => tree.unmount()); jest.useRealTimers(); jest.clearAllMocks(); });
const renderShell = (scroll = true) => { act(() => { tree = create(<AppShell scroll={scroll}><Text>Content</Text></AppShell>); }); };

it.each([0, 24, 48])('places the absolute mobile notice below the %idp system inset', top => {
  mockTopInset = top; renderShell();
  const overlay = tree.root.findAllByProps({ pointerEvents: 'box-none' })[0];
  expect(StyleSheet.flatten(overlay.props.style)).toMatchObject({
    position: 'absolute', top: top + AppTheme.spacing.xs, zIndex: 40,
    left: AppTheme.spacing.sm, right: AppTheme.spacing.sm,
  });
  expect(tree.root.findAllByType(SafeAreaView)).toHaveLength(1);
  expect(tree.root.findAllByType(ConnectionBanner)).toHaveLength(1);
});

it('updates the inset in non-scroll screens without changing the terminal action', () => {
  renderShell(false); mockTopInset = 44;
  act(() => tree.update(<AppShell scroll={false}><Text>Content</Text></AppShell>));
  const overlay = tree.root.findAllByProps({ pointerEvents: 'box-none' })[0];
  expect(StyleSheet.flatten(overlay.props.style).top).toBe(44 + AppTheme.spacing.xs);
  const action = tree.root.findAllByProps({ accessibilityLabel: 'Volver a iniciar sesión' }).find(node => typeof node.props.onPress === 'function')!;
  act(() => action.props.onPress());
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockRefresh).not.toHaveBeenCalled();
});

it('retains the desktop inline banner with no mobile overlay', () => {
  mockDesktop = true; renderShell();
  expect(tree.root.findAllByProps({ pointerEvents: 'box-none' })).toHaveLength(0);
  expect(tree.root.findAllByType(ConnectionBanner)).toHaveLength(1);
});
