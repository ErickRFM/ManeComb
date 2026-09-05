import React from 'react';
import { TextInput, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AppTheme } from '@/constants/theme';
import { KeyboardSafeScrollView } from '@/src/components/keyboard-safe-layout';
import { CustomerAuthScreen } from '../customer-auth-screen';
import { ensureLoginBackendReady } from './login-readiness';
import { AuthField } from './components/auth-field';

const mockSignIn = jest.fn();
jest.mock('@/src/store/use-app-store', () => ({ useAppStore: (select: any) => select({
  user: null, authContext: null, isSubmitting: false, signIn: mockSignIn, activateDriverWithKey: jest.fn(),
}) }));
jest.mock('@/src/hooks/use-app-theme', () => ({
  useAppTheme: () => ({ theme: jest.requireActual('@/constants/theme').getAppTheme('light') }),
}));
jest.mock('@/src/navigation/router', () => ({ Link: 'Link', Redirect: 'Redirect', router: { replace: jest.fn() } }));
jest.mock('@/src/native/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('@/src/native/haptics', () => ({}));
jest.mock('@/src/components/brand-logo', () => ({ BrandLogo: 'BrandLogo' }));
jest.mock('@/src/api/client', () => ({ API_URL: 'https://backend.test/api' }));
jest.mock('./login-readiness', () => ({ ensureLoginBackendReady: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));

// Bootstrap native Jest getters outside individual physical-contract assertions.
for (const name of ['ActivityIndicator', 'Image', 'Pressable', 'StatusBar', 'Text', 'TextInput', 'View']) {
  void jest.requireActual('react-native')[name];
}
let tree: ReactTestRenderer;
afterEach(() => { if (tree) act(() => tree.unmount()); jest.clearAllMocks(); });

it('adds the theme caret clearance only to login through the existing keyboard controller', () => {
  act(() => { tree = create(<CustomerAuthScreen mode="login" />); });
  const scroll = tree.root.findByType(KeyboardAwareScrollView);
  expect(scroll.props.bottomOffset).toBe(AppTheme.spacing.lg);
  expect(scroll.props.mode).toBe('insets');
  expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(false);
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
});

it('leaves registration and generic scroll consumers on their existing default', () => {
  act(() => { tree = create(<CustomerAuthScreen mode="register" />); });
  expect(tree.root.findByType(KeyboardAwareScrollView).props.bottomOffset).toBeUndefined();
  act(() => { tree.update(<KeyboardSafeScrollView><View /></KeyboardSafeScrollView>); });
  expect(tree.root.findByType(KeyboardAwareScrollView).props.bottomOffset).toBeUndefined();
  expect(tree.root.findByType(KeyboardAwareScrollView).props.mode).toBe('insets');
});

it('retains Next/password semantics and focus does not submit credentials or readiness requests', () => {
  act(() => { tree = create(<CustomerAuthScreen mode="login" />); });
  const fields = tree.root.findAllByType(TextInput);
  expect(fields).toHaveLength(2);
  expect(fields[0].props.returnKeyType).toBe('next');
  expect(fields[1].props.returnKeyType).toBe('done');
  expect(fields[1].props.secureTextEntry).toBe(true);
  act(() => { fields[0].props.onFocus(); fields[1].props.onFocus(); });
  expect(mockSignIn).not.toHaveBeenCalled();
  expect(ensureLoginBackendReady).not.toHaveBeenCalled();
  expect(fields[0].props.value).toBe('');
  expect(fields[1].props.value).toBe('');
});

it('keeps the IME open when login Next transfers focus to password without submitting login', () => {
  act(() => { tree = create(<CustomerAuthScreen mode="login" />); });
  const fields = tree.root.findAllByType(TextInput);
  const passwordField = tree.root.findAllByType(AuthField)[1];
  const focus = jest.fn();
  passwordField.props.inputRef.current = { focus };
  expect(fields[0].props.submitBehavior).toBe('submit');
  expect(fields[1].props.submitBehavior).toBeUndefined();
  act(() => fields[0].props.onSubmitEditing());
  expect(focus).toHaveBeenCalledTimes(1);
  expect(mockSignIn).not.toHaveBeenCalled();
  expect(ensureLoginBackendReady).not.toHaveBeenCalled();
});

it('does not change registration submit behavior or password security', () => {
  act(() => { tree = create(<CustomerAuthScreen mode="register" />); });
  const fields = tree.root.findAllByType(TextInput);
  expect(fields.every(field => field.props.submitBehavior === undefined)).toBe(true);
  expect(fields.filter(field => field.props.secureTextEntry === true)).toHaveLength(2);
});
