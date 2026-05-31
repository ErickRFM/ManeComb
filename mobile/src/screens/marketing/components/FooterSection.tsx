import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { COMMERCIAL_FAQS } from '@/src/constants/commercial';
import type { MarketingPalette } from '../styles';

interface FAQProps {
  palette: MarketingPalette;
  styles: any;
}

export function FAQSection({ palette, styles }: FAQProps) {
  return (
    <View style={styles.section}>
       <Text style={[styles.sectionTitle, { color: palette.ink, textAlign: 'center', marginBottom: 32 }]}>Preguntas Frecuentes</Text>
       <View style={styles.faqGrid}>
          {COMMERCIAL_FAQS.map(f => (
            <View key={f.question} style={[styles.faqCard, { borderColor: palette.line }]}>
               <Text style={[styles.faqQ, { color: palette.ink }]}>{f.question}</Text>
               <Text style={[styles.faqA, { color: palette.muted }]}>{f.answer}</Text>
            </View>
          ))}
       </View>
    </View>
  );
}

interface FooterProps {
  palette: MarketingPalette;
  styles: any;
  onJumpToCheckout: () => void;
}

export function FooterSection({ palette, styles, onJumpToCheckout }: FooterProps) {
  return (
    <View style={[styles.footer, { borderColor: palette.line }]}>
       <Text style={{ color: palette.mutedSoft, marginBottom: 20 }}>© 2026 ManeComb Enterprise. Todos los derechos reservados.</Text>
       <View style={styles.footerLinks}>
          <Pressable onPress={() => router.push('/login')} style={[styles.footerBtn, { borderColor: palette.line }]}><Text style={[styles.footerBtnText, { color: palette.ink }]}>Iniciar Sesión</Text></Pressable>
          <Pressable onPress={onJumpToCheckout} style={[styles.footerBtn, { backgroundColor: palette.accent }]}><Text style={[styles.footerBtnText, { color: '#FFF' }]}>Registrarme</Text></Pressable>
       </View>
    </View>
  );
}
