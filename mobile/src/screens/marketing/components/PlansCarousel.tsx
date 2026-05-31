import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { COMMERCIAL_FEATURES } from '@/src/constants/commercial';
import { AnimatedSection, MarketingFeature } from './MarketingPrimitives';
import type { MarketingPalette } from '../styles';
import type { CommercialPlan } from '@/src/types/app';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface PlansCarouselProps {
  palette: MarketingPalette;
  styles: any;
  plans: CommercialPlan[];
  selectedPlanId: string;
  selectedPlanIndex: number;
  planCardStep: number;
  planCardWidth: number;
  carouselRef: React.RefObject<ScrollView | null>;
  onSelectPlan: (id: string) => void;
  onScrollEnd: (event: any) => void;
  onLayout: (event: any) => void;
  formatCurrency: (val: number) => string;
}

export function PlansCarousel({
  palette, styles, plans, selectedPlanId, selectedPlanIndex, planCardStep, planCardWidth, carouselRef, onSelectPlan, onScrollEnd, onLayout, formatCurrency
}: PlansCarouselProps) {
  return (
    <AnimatedSection index={3} style={styles.section} onLayout={onLayout}>
       <View style={styles.sectionHeader}>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>PRECIOS</Text>
          <Text style={[styles.sectionTitle, { color: palette.ink }]}>Paquetes comerciales escalables.</Text>
       </View>

       <ScrollView ref={carouselRef} horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={planCardStep} onMomentumScrollEnd={onScrollEnd} contentContainerStyle={styles.plansTrack}>
          {plans.map((p, i) => (
            <PlanCard key={p.id} plan={p} selected={selectedPlanId === p.id} isFocus={i === selectedPlanIndex} width={planCardWidth} onSelect={() => onSelectPlan(p.id)} palette={palette} styles={styles} formatCurrency={formatCurrency} />
          ))}
       </ScrollView>
    </AnimatedSection>
  );
}

function PlanCard({ plan, selected, isFocus, width, onSelect, palette, styles, formatCurrency }: any) {
  const isDark = palette.mode === 'dark';
  const cardStyle = useMemo(() => [
    styles.pCard,
    {
      width,
      minWidth: width,
      borderColor: selected ? palette.accent : palette.line,
      backgroundColor: palette.card,
      transform: [{ scale: isFocus ? 1.05 : 1 }]
    }
  ], [styles.pCard, width, selected, palette.accent, palette.line, palette.card, isFocus]);

  const headerStyle = useMemo(() => [
    styles.pHeader,
    { backgroundColor: selected ? palette.accent : palette.panel }
  ], [styles.pHeader, selected, palette.accent, palette.panel]);

  const actionStyle = useMemo(() => [
    styles.pAction,
    { backgroundColor: selected ? palette.accent : (isDark ? '#1E293B' : '#F1F5F9') }
  ], [styles.pAction, selected, palette.accent, isDark]);

  return (
    <Pressable onPress={onSelect} style={cardStyle}>
       <View style={headerStyle}><Text style={[styles.pTitle, { color: selected ? '#FFF' : palette.ink }]}>{plan.name}</Text></View>
       <View style={styles.pBody}>
          <Text style={[styles.pPrice, { color: palette.ink }]}>{formatCurrency(plan.price)}<Text style={[styles.pFreq, { color: palette.mutedSoft }]}>/mes</Text></Text>
          <Text style={[styles.pSubtitle, { color: palette.muted }]}>{plan.subtitle}</Text>
          <View style={[styles.pDivider, { backgroundColor: palette.line }]} />
          <View style={styles.pFeatures}>
             <MarketingFeature icon="check-circle" text={`${plan.units} Unidades`} palette={palette} styles={styles} />
             <MarketingFeature icon="check-circle" text={plan.strategy} palette={palette} styles={styles} />
             <MarketingFeature icon="check-circle" text={plan.includesRadioModule ? "Radio PTT Incluido" : "Radio PTT Opcional"} palette={palette} styles={styles} />
          </View>
          <View style={actionStyle}>
             <Text style={[styles.pActionText, { color: selected ? '#FFF' : palette.ink }]}>{selected ? 'Seleccionado' : 'Elegir Plan'}</Text>
          </View>
       </View>
    </Pressable>
  );
}

export function FeaturesSection({ palette, styles }: { palette: MarketingPalette, styles: any }) {
    return (
        <AnimatedSection index={2} style={styles.section}>
            <View style={styles.sectionHeader}>
                <Text style={[styles.eyebrow, { color: palette.accent }]}>CAPACIDADES</Text>
                <Text style={[styles.sectionTitle, { color: palette.ink }]}>Todo lo necesario para el despacho moderno.</Text>
            </View>
            <View style={styles.featureGrid}>
                {COMMERCIAL_FEATURES.map(f => (
                    <View key={f.title} style={[styles.featureCard, { backgroundColor: palette.card, borderColor: palette.line }]}>
                        <View style={[styles.featureIcon, { backgroundColor: palette.panel }]}><MaterialCommunityIcons name={f.icon as any} size={24} color={palette.accent} /></View>
                        <Text style={[styles.featureTitle, { color: palette.ink }]}>{f.title}</Text>
                        <Text style={[styles.featureBody, { color: palette.muted }]}>{f.body}</Text>
                    </View>
                ))}
            </View>
        </AnimatedSection>
    )
}
