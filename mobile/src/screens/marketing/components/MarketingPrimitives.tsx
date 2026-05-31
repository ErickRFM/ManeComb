import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { MarketingPalette } from '../styles';

export function AnimatedSection({ children, index, style, onLayout }: any) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 600, delay: index * 100, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
  }, [anim, index]);
  return <Animated.View onLayout={onLayout} style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>{children}</Animated.View>;
}

export function VisualMetric({ icon, label, value, palette, styles }: { icon: any, label: string, value: string, palette: MarketingPalette, styles: any }) {
  return (
    <View style={styles.vMetric}>
       <View style={[styles.vIcon, { backgroundColor: palette.accentSoft }]}><MaterialCommunityIcons name={icon} size={18} color={palette.accent} /></View>
       <View><Text style={[styles.vLabel, { color: palette.mutedSoft }]}>{label}</Text><Text style={[styles.vValue, { color: palette.ink }]}>{value}</Text></View>
    </View>
  );
}

export function MarketingField({ label, value, onChange, placeholder, palette, styles, secure, keyboard }: any) {
  return (
    <View style={styles.field}>
       <Text style={[styles.inputLabel, { color: palette.muted }]}>{label}</Text>
       <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={palette.mutedSoft} secureTextEntry={secure} keyboardType={keyboard}
         style={[styles.input, { color: palette.ink, borderColor: palette.line, backgroundColor: palette.card }]} />
    </View>
  );
}

export function MarketingFeature({ icon, text, palette, styles }: { icon: any, text: string, palette: MarketingPalette, styles: any }) {
  return (
    <View style={styles.fItem}>
       <MaterialCommunityIcons name={icon} size={18} color={palette.success} />
       <Text style={[styles.fText, { color: palette.muted }]}>{text}</Text>
    </View>
  );
}
