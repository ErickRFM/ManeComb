import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/**
 * Fondo compartido para llamadas. Es deliberadamente programatico: no agrega
 * imagenes pesadas ni otra dependencia y mantiene la superficie disponible aun
 * cuando Android recrea la app desde una llamada push.
 */
export function CallAmbientBackground(): React.ReactElement {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2600,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const pulseStyle = {
    opacity: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.18, 0.05],
    }),
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1.08],
        }),
      },
    ],
  };

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.topGlow} />
      <View style={styles.lowerGlow} />
      <View style={styles.centerGlow} />
      <Animated.View style={[styles.pulseRing, pulseStyle]} />
      <View style={[styles.gridLine, styles.gridLineOne]} />
      <View style={[styles.gridLine, styles.gridLineTwo]} />
      <View style={[styles.gridLine, styles.gridLineThree]} />
      <View style={[styles.scanLine, styles.scanLineOne]} />
      <View style={[styles.scanLine, styles.scanLineTwo]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#070A10',
  },
  topGlow: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -215,
    left: -130,
    backgroundColor: 'rgba(91, 219, 136, 0.065)',
  },
  lowerGlow: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    right: -265,
    bottom: -120,
    backgroundColor: 'rgba(69, 102, 175, 0.055)',
  },
  centerGlow: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    alignSelf: 'center',
    top: '28%',
    backgroundColor: 'rgba(227, 30, 36, 0.055)',
  },
  pulseRing: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    alignSelf: 'center',
    top: '31%',
    borderWidth: 1,
    borderColor: 'rgba(236, 70, 74, 0.45)',
  },
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.022)',
  },
  gridLineOne: { left: '18%' },
  gridLineTwo: { left: '50%' },
  gridLineThree: { right: '18%' },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.018)',
  },
  scanLineOne: { top: '34%' },
  scanLineTwo: { top: '67%' },
});
