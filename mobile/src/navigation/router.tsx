import React, { useEffect, type PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type TextProps } from 'react-native';
import {
  CommonActions,
  StackActions,
  createNavigationContainerRef,
  useRoute,
  type ParamListBase,
} from '@react-navigation/native';
import {
  canRoleAccessRoute,
  getModuleRouteName,
  getRouteDefinition,
  isModuleRoot,
} from '@/src/navigation/route-registry';
import { NavigationRequestGuard } from '@/src/navigation/navigation-policy';
import { useAppStore } from '@/src/store/use-app-store';

type RouteParamValue = string | string[] | number | boolean | null | undefined;
type RouteParams = Record<string, RouteParamValue>;
type HrefObject = {
  pathname?: string;
  params?: RouteParams;
};
type Href = string | HrefObject;

export const navigationRef = createNavigationContainerRef<ParamListBase>();
const navigationGuard = new NavigationRequestGuard();

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
    return '/mapa';
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

  const currentRoute = navigationRef.getCurrentRoute();

  if (
    navigationGuard.shouldIgnore({
      currentName: currentRoute?.name,
      currentParams: currentRoute?.params as RouteParams | undefined,
      destinationName: name,
      destinationParams: params,
    })
  ) {
    return;
  }

  const destination = getRouteDefinition(name);

  if (destination) {
    const currentName = currentRoute?.name;
    const currentModule = getRouteDefinition(currentName)?.module;
    const user = useAppStore.getState().user;

    if (user && !canRoleAccessRoute(name, user.role)) {
      navigateWith('replace', '/mapa');
      return;
    }

    const moduleRouteName = getModuleRouteName(destination.module);
    const nestedRoute = { screen: name, params };

    // Entering or reopening a module always creates one clean module instance.
    if (currentModule !== destination.module || isModuleRoot(name)) {
      navigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: moduleRouteName, params: nestedRoute }],
        })
      );
      return;
    }

    navigationRef.navigate(moduleRouteName, nestedRoute as never);
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

    navigateWith('replace', '/mapa');
  },
  clearPendingNavigation: () => navigationGuard.clear(),
};

export function usePathname() {
  const route = useRoute();
  return normalizeRouteName(route.name);
}

export function useLocalSearchParams<T extends RouteParams = RouteParams>() {
  const route = useRoute();
  return ((route.params || {}) as T);
}

export function Redirect({ href }: { href: Href }) {
  useEffect(() => {
    router.replace(href);
  }, [href]);

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
