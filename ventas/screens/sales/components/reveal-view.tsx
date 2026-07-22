import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { styles } from '../styles';
import { getStaticRevealStyle, usePrefersReducedMotion } from '../utils';

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
  const translateY = useRef(new Animated.Value(immediate ? 0 : 22)).current;
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

    if (node.getBoundingClientRect().top < window.innerHeight * 0.9) {
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
      { rootMargin: '0px 0px -10% 0px' }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [isWeb, reducedMotion, revealed]);

  useEffect(() => {
    if (isWeb || revealed || !measured) {
      return;
    }

    if (scrollY + viewportHeight * 0.9 >= layoutY) {
      setRevealed(true);
    }
  }, [isWeb, layoutY, measured, revealed, scrollY, viewportHeight]);

  useEffect(() => {
    if (!revealed) {
      return;
    }

    if (reducedMotion) {
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay: Math.min(index * 55, 360),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        delay: Math.min(index * 55, 360),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
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
