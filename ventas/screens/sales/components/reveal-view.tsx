import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { getStaticRevealStyle, usePrefersReducedMotion } from '../utils';

const WEB_REVEAL_VIEWPORT_RATIO = 0.78;
const NATIVE_REVEAL_VIEWPORT_RATIO = 0.82;
const REVEAL_DURATION_MS = 580;
const REVEAL_OFFSET_PX = 32;

export function RevealView({
  children,
  index = 0,
  immediate = false,
  scrollY,
  style,
  viewportHeight,
}: {
  children: ReactNode;
  index?: number;
  immediate?: boolean;
  scrollY: number;
  style?: any;
  viewportHeight: number;
}) {
  const opacity = useRef(new Animated.Value(immediate ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(immediate ? 0 : REVEAL_OFFSET_PX)).current;
  const nodeRef = useRef<unknown>(null);
  const [layoutY, setLayoutY] = useState(0);
  const [measured, setMeasured] = useState(immediate);
  const [revealed, setRevealed] = useState(immediate);
  const isWeb = Platform.OS === 'web';
  const reducedMotion = usePrefersReducedMotion();
  const staticRevealStyle = getStaticRevealStyle(revealed && reducedMotion);

  useEffect(() => {
    if (!isWeb || revealed) {
      return;
    }

    const node = nodeRef.current as HTMLElement | null;

    if (!node || typeof IntersectionObserver === 'undefined' || reducedMotion) {
      setRevealed(true);
      return;
    }

    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * WEB_REVEAL_VIEWPORT_RATIO && rect.bottom > 0) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -22% 0px', threshold: 0.06 }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [isWeb, reducedMotion, revealed]);

  useEffect(() => {
    if (isWeb || revealed || !measured) {
      return;
    }

    if (scrollY + viewportHeight * NATIVE_REVEAL_VIEWPORT_RATIO >= layoutY) {
      setRevealed(true);
    }
  }, [isWeb, layoutY, measured, revealed, scrollY, viewportHeight]);

  useEffect(() => {
    if (!revealed || reducedMotion) {
      return;
    }

    const delay = Math.min(index * 45, 270);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: REVEAL_DURATION_MS,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: REVEAL_DURATION_MS,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [index, opacity, reducedMotion, revealed, translateY]);

  return (
    <Animated.View
      ref={nodeRef as never}
      onLayout={
        isWeb
          ? undefined
          : (event) => {
              setLayoutY(event.nativeEvent.layout.y);
              setMeasured(true);
            }
      }
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
        staticRevealStyle,
      ]}>
      {children}
    </Animated.View>
  );
}
