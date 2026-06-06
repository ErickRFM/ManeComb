import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, Text, type TextStyle, type StyleProp } from 'react-native';

type RouteTarget =
  | string
  | {
      pathname: string;
      params?: Record<string, string | number | boolean | undefined | null>;
    };

type LocationSnapshot = {
  pathname: string;
  search: string;
  key: string;
};

function readLocationSnapshot(): LocationSnapshot {
  if (typeof window === 'undefined') {
    return { pathname: '/', search: '', key: 'server' };
  }

  const pathname = window.location.pathname || '/';
  const search = window.location.search || '';

  return {
    pathname,
    search,
    key: `${pathname}${search}`,
  };
}

let cachedSnapshot = readLocationSnapshot();
const RouterContext = createContext<LocationSnapshot>({
  ...cachedSnapshot,
});

const listeners = new Set<() => void>();

function emitRouteChange() {
  cachedSnapshot = readLocationSnapshot();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  const handlePopState = () => {
    cachedSnapshot = readLocationSnapshot();
    listener();
  };

  listeners.add(listener);
  window.addEventListener('popstate', handlePopState);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', handlePopState);
  };
}

function getSnapshot(): LocationSnapshot {
  if (typeof window === 'undefined') {
    return cachedSnapshot;
  }

  const nextSnapshot = readLocationSnapshot();

  if (nextSnapshot.key !== cachedSnapshot.key) {
    cachedSnapshot = nextSnapshot;
  }

  return cachedSnapshot;
}

function toUrl(target: RouteTarget) {
  if (typeof target === 'string') {
    return target === '/portal' ? '/portal/' : target;
  }

  const pathname = target.pathname === '/portal' ? '/portal/' : target.pathname;
  const params = new URLSearchParams();
  Object.entries(target.params || {}).forEach(([key, value]) => {
    if (typeof value === 'undefined' || value === null || value === '') {
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function navigate(target: RouteTarget, replace = false) {
  if (typeof window === 'undefined') {
    return;
  }

  const url = toUrl(target);
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', url);
  emitRouteChange();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

export const router = {
  push: (target: RouteTarget) => navigate(target),
  replace: (target: RouteTarget) => navigate(target, true),
  back: () => {
    window.history.back();
  },
};

export function RouterProvider({ children }: PropsWithChildren) {
  const location = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const value = useMemo(() => location, [location.key]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function usePathname() {
  return useContext(RouterContext).pathname;
}

export function useLocalSearchParams<T extends Record<string, string | string[] | undefined> = Record<string, string>>() {
  const { search } = useContext(RouterContext);

  return useMemo(() => {
    const params = new URLSearchParams(search);
    const entries: Record<string, string | string[]> = {};

    params.forEach((value, key) => {
      const current = entries[key];
      entries[key] = current ? (Array.isArray(current) ? [...current, value] : [current, value]) : value;
    });

    return entries as T;
  }, [search]);
}

export function Redirect({ href }: { href: RouteTarget }) {
  useEffect(() => {
    router.replace(href);
  }, [href]);

  return null;
}

export function Link({
  children,
  href,
  style,
}: {
  children: ReactNode;
  href: RouteTarget;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable onPress={() => router.push(href)}>
      <Text style={style}>{children}</Text>
    </Pressable>
  );
}
