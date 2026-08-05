import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Mantiene las animaciones alineadas con la preferencia de accesibilidad del
 * sistema. En web dejamos que CSS y el navegador gestionen la preferencia,
 * mientras que en iOS y Android escuchamos los cambios en tiempo real.
 */
export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      typeof AccessibilityInfo?.isReduceMotionEnabled !== 'function' ||
      typeof AccessibilityInfo?.addEventListener !== 'function'
    ) {
      return undefined;
    }

    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) {
          setReducedMotion(enabled);
        }
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
