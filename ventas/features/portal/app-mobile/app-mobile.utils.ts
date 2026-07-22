import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';

export function useNovidadesScroll() {
  const ref = useRef<any>(null);
  const scrollToNovidades = useCallback(() => {
    if (Platform.OS === 'web' && ref.current) {
      const node = ref.current as unknown as HTMLElement;
      const top = node.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);
  return { ref, scrollToNovidades };
}

export function deepEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
