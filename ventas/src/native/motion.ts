import { Platform, StyleSheet } from 'react-native';

/**
 * Helpers de animacion para react-native-web.
 *
 * IMPORTANTE: react-native-web solo compila `animationKeyframes` a reglas
 * `@keyframes` reales cuando el estilo pasa por `StyleSheet.create`. Por eso las
 * animaciones con keyframes viven en `motionStyles` (abajo) y los helpers
 * devuelven esos estilos ya registrados. Las transiciones (`transition`) si
 * funcionan inline porque son CSS directo.
 *
 * Solo presentacion: nada de esto cambia el comportamiento de la app. En nativo
 * los estilos se ignoran sin efecto.
 */
const isWeb = Platform.OS === 'web';

/** Curva de easing suave estilo "material" para transiciones de UI. */
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

const motionStyles = StyleSheet.create({
  shimmer: {
    animationKeyframes: {
      '0%': { transform: [{ translateX: '-150%' }] },
      '100%': { transform: [{ translateX: '150%' }] },
    },
    animationDuration: '1400ms',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  } as any,
  fadeInUp: {
    animationKeyframes: {
      '0%': { opacity: 0, transform: [{ translateY: 14 }] },
      '100%': { opacity: 1, transform: [{ translateY: 0 }] },
    },
    animationDuration: '460ms',
    animationFillMode: 'both',
    animationTimingFunction: EASE_OUT,
  } as any,
  slideInDown: {
    animationKeyframes: {
      '0%': { opacity: 0, transform: [{ translateY: -10 }] },
      '100%': { opacity: 1, transform: [{ translateY: 0 }] },
    },
    animationDuration: '320ms',
    animationFillMode: 'both',
    animationTimingFunction: EASE_OUT,
  } as any,
  pulse: {
    animationKeyframes: {
      '0%': { opacity: 0.55, transform: [{ scale: 0.85 }] },
      '50%': { opacity: 1, transform: [{ scale: 1 }] },
      '100%': { opacity: 0.55, transform: [{ scale: 0.85 }] },
    },
    animationDuration: '1600ms',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  } as any,
});

/** Shimmer diagonal que recorre un bloque skeleton mientras carga. */
export function shimmer() {
  return isWeb ? motionStyles.shimmer : undefined;
}

/** Aparicion suave (fade + subida). `delay` en ms para escalonar secciones. */
export function fadeInUp(delay = 0) {
  if (!isWeb) return undefined;
  return delay ? [motionStyles.fadeInUp, { animationDelay: `${delay}ms` } as any] : motionStyles.fadeInUp;
}

/** Entrada de toast: baja y aparece. */
export function slideInDown() {
  return isWeb ? motionStyles.slideInDown : undefined;
}

/** Pulso de escala infinito para puntos "en vivo" o indicadores de estado. */
export function pulse() {
  return isWeb ? motionStyles.pulse : undefined;
}

/** Transicion generica; encadena varias propiedades a la vez. Segura inline. */
export function transition(properties = 'transform, box-shadow, background-color, border-color', duration = 180) {
  if (!isWeb) return undefined;
  return {
    transitionProperty: properties,
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: EASE_OUT,
  } as any;
}
