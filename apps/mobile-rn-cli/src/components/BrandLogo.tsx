import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function BrandLogo() {
  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <Text style={styles.markText}>MC</Text>
      </View>
      <View>
        <Text style={styles.title}>ManeComb</Text>
        <Text style={styles.subtitle}>Control operativo de combis</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  markText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
