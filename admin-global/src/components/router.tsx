import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, Text, type TextStyle, type StyleProp } from 'react-native';

type RouteTarget = string | { pathname: string; params?: Record<string, string | number | boolean | undefined | null> };

type LocationSnapshot = { pathname: string; search: string; key: string };

function readLocationSnapshot(): LocationSnapshot {
  if (typeof window === 'undefined') return { pathname: '/', search: '', key: 'server' };
  const pathname = window.location.pathname || '/';
  const search = window.location.search || '';
  return { pathname, search, key: `${pathname}${search}` };
}

let cachedSnapshot = readLocationSnapshot();
const RouterContext = createContext<LocationSnapshot>({ ...cachedSnapshot });
const listeners = new Set<() => void>();

function emitRouteChange() {
  cachedSnapshot = readLocationSnapshot();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  const handlePopState = () => { cachedSnapshot = readLocationSnapshot(); listener(); };
  listeners.add(listener);
  window.addEventListener('popstate', handlePopState);
  return () => { listeners.delete(listener); window.removeEventListener('popstate', handlePopState); };
}

function getSnapshot(): LocationSnapshot {
  return cachedSnapshot;
}

export function RouterProvider({ children }: PropsWithChildren) {
  return <RouterContext.Provider value={cachedSnapshot}>{children}</RouterContext.Provider>;
}

export function usePathname(): string {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  return snapshot.pathname;
}

export const router = {
  push(target: RouteTarget) {
    const href = typeof target === 'string' ? target : target.pathname;
    window.history.pushState(null, '', href);
    emitRouteChange();
  },
  replace(target: RouteTarget) {
    const href = typeof target === 'string' ? target : target.pathname;
    window.history.replaceState(null, '', href);
    emitRouteChange();
  },
  back() { window.history.back(); },
};

export function Redirect({ href }: { href: string }) {
  const currentPath = usePathname();
  useEffect(() => {
    if (currentPath !== href) router.replace(href);
  }, [href, currentPath]);
  return null;
}

type LinkProps = { href: string; children: ReactNode; style?: StyleProp<TextStyle> };
export function Link({ href, children, style }: LinkProps) {
  return (
    <Pressable onPress={() => router.push(href)}>
      <Text style={style}>{children}</Text>
    </Pressable>
  );
}
