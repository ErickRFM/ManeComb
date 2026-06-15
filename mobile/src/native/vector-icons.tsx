import React from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

let NativeMaterialCommunityIcons: any = null;

try {
  NativeMaterialCommunityIcons = require('react-native-vector-icons/MaterialCommunityIcons').default;
} catch {
  NativeMaterialCommunityIcons = null;
}

type IconProps = TextProps & {
  name: string;
  size?: number;
  color?: string;
};

function FallbackIcon({ name, size = 20, color = '#FFFFFF', style, ...props }: IconProps) {
  return (
    <Text
      {...props}
      accessibilityLabel={name}
      style={[styles.fallbackIcon, { color, fontSize: Math.max(10, size * 0.8) }, style]}>
      {String(name || '?').slice(0, 1).toUpperCase()}
    </Text>
  );
}

export const MaterialCommunityIcons =
  NativeMaterialCommunityIcons ||
  Object.assign(FallbackIcon, {
    glyphMap: {},
    font: {},
    loadFont: async () => undefined,
  });

const styles = StyleSheet.create({
  fallbackIcon: {
    fontWeight: '700',
  },
});
