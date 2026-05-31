import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COMMERCIAL_HIGHLIGHTS } from '@/src/constants/commercial';
import { AnimatedSection, VisualMetric } from './MarketingPrimitives';
import type { MarketingPalette } from '../styles';
import type { CommercialPlan } from '@/src/types/app';

interface HeroSectionProps {
  palette: MarketingPalette;
  styles: any;
  isCompact: boolean;
  selectedPlan: CommercialPlan;
  onJumpToCheckout: () => void;
  onJumpToPlans: () => void;
  formatCurrency: (val: number) => string;
}

export function HeroSection({ palette, styles, isCompact, selectedPlan, onJumpToCheckout, onJumpToPlans, formatCurrency }: HeroSectionProps) {
  return (
    <AnimatedSection index={1} style={[styles.hero, isCompact && styles.heroCompact]}>
       <View style={styles.heroLeft}>
          <View style={[styles.heroTag, { backgroundColor: palette.accentSoft }]}><Text style={[styles.heroTagText, { color: palette.accent }]}>Operación Profesional 2026</Text></View>
          <Text style={[styles.heroTitle, { color: palette.ink }]}>Software de alta precisión para <Text style={{ color: palette.accent }}>flotillas de transporte.</Text></Text>
          <Text style={[styles.heroSubtitle, { color: palette.muted }]}>ManeComb centraliza el monitoreo GPS, la gestión documental, radio PTT y despacho operativo en una plataforma de grado industrial.</Text>

          <View style={styles.heroFeatures}>
             {COMMERCIAL_HIGHLIGHTS.map(h => (
               <View key={h} style={styles.heroFeatureItem}>
                  <MaterialCommunityIcons name="check-decagram" size={20} color={palette.accent} />
                  <Text style={[styles.heroFeatureText, { color: palette.ink }]}>{h}</Text>
               </View>
             ))}
          </View>

          <View style={styles.heroButtons}>
             <Pressable onPress={onJumpToCheckout} style={[styles.heroBtnPrimary, { backgroundColor: palette.accent }]}><Text style={styles.heroBtnPrimaryText}>Solicitar Prueba de 7 días</Text></Pressable>
             <Pressable onPress={onJumpToPlans} style={[styles.heroBtnSecondary, { borderColor: palette.line, backgroundColor: palette.card }]}><Text style={[styles.heroBtnSecondaryText, { color: palette.ink }]}>Ver Planes</Text></Pressable>
          </View>
       </View>

       {!isCompact && (
         <View style={styles.heroRight}>
            <View style={[styles.heroVisualCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
               <View style={styles.visualHeader}>
                  <Text style={[styles.visualOverline, { color: palette.mutedSoft }]}>Panel Seleccionado</Text>
                  <Text style={[styles.visualTitle, { color: palette.ink }]}>{selectedPlan.name}</Text>
               </View>
               <Text style={[styles.visualPrice, { color: palette.ink }]}>{formatCurrency(selectedPlan.price)}<Text style={styles.visualFreq}>/mes</Text></Text>
               <View style={[styles.visualDivider, { backgroundColor: palette.line }]} />
               <View style={styles.visualGrid}>
                  <VisualMetric icon="bus" label="Unidades" value={String(selectedPlan.units)} palette={palette} styles={styles} />
                  <VisualMetric icon="shield-check" label="Estrategia" value={selectedPlan.strategy} palette={palette} styles={styles} />
                  <VisualMetric icon="radio-handheld" label="Radio PTT" value={selectedPlan.includesRadioModule ? "Incluido" : "Opcional"} palette={palette} styles={styles} />
               </View>
            </View>
         </View>
       )}
    </AnimatedSection>
  );
}
