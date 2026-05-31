import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AnimatedSection } from './MarketingPrimitives';
import type { MarketingPalette } from '../styles';

interface NavbarProps {
  palette: MarketingPalette;
  styles: any;
  themeMode: string;
  setThemeMode: (mode: 'light' | 'dark') => void;
  onJumpToCheckout: () => void;
}

export function Navbar({ palette, styles, themeMode, setThemeMode, onJumpToCheckout }: NavbarProps) {
  return (
    <AnimatedSection index={0} style={styles.navbar}>
       <View style={styles.brand}>
          <View style={[styles.brandBadge, { backgroundColor: palette.accent }]}><MaterialCommunityIcons name="bus-multiple" size={24} color="#FFF" /></View>
          <Text style={[styles.brandTitle, { color: palette.ink }]}>ManeComb <Text style={{ color: palette.muted, fontSize: 14, fontWeight: '400' }}>Enterprise</Text></Text>
       </View>
       <View style={styles.navActions}>
          <Pressable onPress={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')} style={[styles.navGhost, { borderColor: palette.line }]}>
             <MaterialCommunityIcons name={themeMode === 'dark' ? 'white-balance-sunny' : 'moon-waning-crescent'} size={20} color={palette.ink} />
          </Pressable>
          <Pressable onPress={() => router.push('/login')} style={[styles.navGhost, { borderColor: palette.line }]}><Text style={[styles.navGhostText, { color: palette.ink }]}>Entrar</Text></Pressable>
          <Pressable onPress={onJumpToCheckout} style={[styles.navPrimary, { backgroundColor: palette.accent }]}><Text style={styles.navPrimaryText}>Empezar</Text></Pressable>
       </View>
    </AnimatedSection>
  );
}
