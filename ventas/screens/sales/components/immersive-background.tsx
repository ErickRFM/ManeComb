import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { neonPalette } from '../constants';
import { styles } from '../styles';
import { usePrefersReducedMotion, usePointerParallax, webStyle } from '../utils';

const ImmersiveBackground = memo(function ImmersiveBackground({ isPhone }: { isPhone: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const reducedMotion = usePrefersReducedMotion();
  const parallaxRef = usePointerParallax(
    Platform.OS === 'web' && !isPhone && !reducedMotion,
    (cursor) => `translateX(${cursor.x * 18}px) translateY(${cursor.y * 14}px)`
  );

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 6500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 6500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reducedMotion]);

  const orbScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <View pointerEvents="none" style={styles.backgroundLayer}>
      <View
        testID="sales-ambient-wash"
        style={[
          styles.animatedWash,
          webStyle({
            backgroundImage:
              'linear-gradient(125deg, rgba(5, 8, 22, 1), rgba(7, 11, 29, 0.96), rgba(21, 8, 42, 0.86), rgba(5, 8, 22, 1))',
            backgroundSize: '180% 180%',
            animation: reducedMotion ? undefined : 'manecombGradientShift 14s ease-in-out infinite',
          }),
        ]}
      />
      <Animated.View ref={parallaxRef as never} style={styles.parallaxField}>
        <Animated.View
          style={[
            styles.backgroundOrb,
            styles.backgroundOrbBlue,
            { transform: [{ scale: orbScale }] },
            webStyle({ filter: 'blur(28px)', animation: reducedMotion ? undefined : 'manecombOrbDrift 18s ease-in-out infinite' }),
          ]}
        />
        <Animated.View
          style={[
            styles.backgroundOrb,
            styles.backgroundOrbPink,
            { transform: [{ scale: orbScale }] },
            webStyle({ filter: 'blur(32px)', animation: reducedMotion ? undefined : 'manecombOrbDrift 22s ease-in-out -5s infinite' }),
          ]}
        />
        <Animated.View
          style={[
            styles.backgroundOrb,
            styles.backgroundOrbViolet,
            { transform: [{ scale: orbScale }] },
            webStyle({ filter: 'blur(30px)', animation: reducedMotion ? undefined : 'manecombOrbDrift 20s ease-in-out -9s infinite' }),
          ]}
        />
      </Animated.View>
      <View style={styles.routeField}>
        {Array.from({ length: isPhone ? 5 : 9 }).map((_, index) => (
          <View
            key={`route-${index}`}
            style={[
              styles.routeLine,
              {
                top: `${8 + index * 11}%`,
                opacity: index % 3 === 0 ? 0.34 : 0.2,
                transform: [{ rotate: `${index % 2 === 0 ? -9 : 8}deg` }],
              },
              webStyle({
                backgroundImage:
                  'linear-gradient(90deg, transparent 0%, rgba(0, 194, 255, 0.08) 18%, rgba(255, 45, 122, 0.65) 46%, rgba(47, 255, 213, 0.48) 57%, transparent 82%)',
                backgroundSize: '260px 100%',
                animation: reducedMotion ? undefined : `manecombRouteFlow ${16 + index * 2}s linear ${index * -1.4}s infinite`,
              }),
            ]}
          />
        ))}
      </View>
      <View style={styles.particleField}>
        {Array.from({ length: isPhone ? 14 : 28 }).map((_, index) => {
          const color = index % 4 === 0 ? neonPalette.accent : index % 3 === 0 ? neonPalette.mint : neonPalette.cyan;
          return (
            <View
              key={`particle-${index}`}
              style={[
                styles.particle,
                {
                  left: `${(index * 37) % 100}%`,
                  top: `${(index * 19 + 8) % 100}%`,
                  backgroundColor: color,
                },
                webStyle({
                  boxShadow: `0 0 18px ${color}`,
                  animation: reducedMotion ? undefined : `manecombParticleDrift ${10 + (index % 7) * 1.5}s ease-in-out ${index * -0.7}s infinite`,
                }),
              ]}
            />
          );
        })}
      </View>
    </View>
  );
});

export { ImmersiveBackground };
