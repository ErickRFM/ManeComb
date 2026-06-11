import React, { useEffect, type PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type TextProps } from 'react-native';
import {
  StackActions,
  createNavigationContainerRef,
  useNavigation,
  useRoute,
  type NavigationProp,
} from '@react-navigation/native';

type RouteParamValue = string | string[] | number | boolean | null | undefined;
type RouteParams = Record<string, RouteParamValue>;
type HrefObject = {
  pathname?: string;
  params?: RouteParams;
};
type Href = string | HrefObject;

export type ErrorBoundaryProps = {
  error: Error;
  retry: () => void;
};

export const navigationRef = createNavigationContainerRef<Record<string, RouteParams | undefined>>();

function decodeQueryParams(search: string) {
  const params: RouteParams = {};
  const query = search.replace(/^\?/, '');

  if (!query) {
    return params;
  }

  query.split('&').forEach((pair) => {
    const [rawKey, rawValue = ''] = pair.split('=');
    const key = decodeURIComponent(rawKey || '').trim();

    if (!key) {
      return;
    }

    params[key] = decodeURIComponent(rawValue);
  });

  return params;
}

export function normalizeRouteName(pathname: string | undefined | null) {
  const rawPath = String(pathname || '/').trim() || '/';
  const [pathWithoutQuery] = rawPath.split('?');
  const normalized = pathWithoutQuery.startsWith('/') ? pathWithoutQuery : `/${pathWithoutQuery}`;
  const withoutTrailingSlash = normalized.replace(/\/+$/, '') || '/';

  if (withoutTrailingSlash === '/(tabs)' || withoutTrailingSlash === '/index') {
    return '/dashboard';
  }

  return withoutTrailingSlash;
}

export function resolveHref(href: Href) {
  if (typeof href === 'string') {
    const [, query = ''] = href.split('?');
    return {
      name: normalizeRouteName(href),
      params: decodeQueryParams(query),
    };
  }

  return {
    name: normalizeRouteName(href.pathname),
    params: href.params || {},
  };
}

function navigateWith(method: 'push' | 'replace', href: Href) {
  const { name, params } = resolveHref(href);

  if (!navigationRef.isReady()) {
    return;
  }

  if (method === 'replace') {
    navigationRef.dispatch(StackActions.replace(name, params));
    return;
  }

  navigationRef.navigate(name, params);
}

export const router = {
  push: (href: Href) => navigateWith('push', href),
  replace: (href: Href) => navigateWith('replace', href),
  back: () => {
    if (!navigationRef.isReady()) {
      return;
    }

    if (navigationRef.canGoBack()) {
      navigationRef.goBack();
      return;
    }

    navigationRef.navigate('/mapa');
  },
};

export function useRouter() {
  return router;
}

export function usePathname() {
  const route = useRoute();
  return normalizeRouteName(route.name);
}

export function useLocalSearchParams<T extends RouteParams = RouteParams>() {
  const route = useRoute();
  return ((route.params || {}) as T);
}

export function Redirect({ href }: { href: Href }) {
  const navigation = useNavigation<NavigationProp<Record<string, RouteParams | undefined>>>();

  useEffect(() => {
    const { name, params } = resolveHref(href);
    navigation.dispatch(StackActions.replace(name, params));
  }, [href, navigation]);

  return (
    <View style={redirectStyles.container}>
      <ActivityIndicator color="#E31E24" />
      <Text style={redirectStyles.text}>Cargando...</Text>
    </View>
  );
}

type LinkProps = PropsWithChildren<
  TextProps & {
    href: Href;
    dismissTo?: boolean;
  }
>;

export function Link({ href, children, onPress, ...props }: LinkProps) {
  return (
    <Text
      {...props}
      onPress={(event) => {
        onPress?.(event);
        router.push(href);
      }}>
      {children}
    </Text>
  );
}

function StackContainer({ children }: PropsWithChildren<Record<string, unknown>>) {
  return <>{children}</>;
}

function StackScreen(_props: Record<string, unknown>) {
  return null;
}

export const Stack = Object.assign(StackContainer, {
  Screen: StackScreen,
});

export function Slot() {
  return null;
}

const redirectStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#090B10',
    paddingHorizontal: 24,
  },
  text: {
    color: '#F5F7FB',
    fontSize: 13,
    fontWeight: '700',
  },
});
