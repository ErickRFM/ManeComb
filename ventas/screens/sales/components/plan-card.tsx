import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { CommercialPlan } from '@/src/types/app';
import { neonPalette } from '../constants';
import { styles } from '../styles';
import { formatCurrency, getPlanVisualTone, usePrefersReducedMotion } from '../utils';

const PLAN_REVEAL_DURATION_MS = 620;
const PLAN_REVEAL_STAGGER_MS = 75;
const PLAN_REVEAL_MAX_DELAY_MS = 300;
const ACTIVE_PULSE_DURATION_MS = 1450;

export function PlanCard({
  index,
  plan,
  width,
  compact = false,
  active,
  accent,
  onPress,
  onBuy,
  onTrial,
  trialLabel,
  userLabel,
}: {
  index: number;
  plan: CommercialPlan;
  width: number;
  compact?: boolean;
  active: boolean;
  accent: string;
  onPress: () => void;
  onBuy: () => void;
  onTrial?: () => void;
  trialLabel?: string | null;
  userLabel: string;
}) {
  const visual = getPlanVisualTone(index);
  const cardEdge = active ? visual.edge : accent;
  const showTrialAction = Boolean(onTrial && trialLabel);
  const reducedMotion = usePrefersReducedMotion();
  const cardRef = useRef<unknown>(null);
  const activePulse = useRef(new Animated.Value(0)).current;
  const [entered, setEntered] = useState(Platform.OS !== 'web');
  const [entrySettled, setEntrySettled] = useState(Platform.OS !== 'web');

  // En desktop de cuatro columnas las tarjetas rondan los 295 px. Ese ancho ya necesita
  // la escala compacta aunque no sea un teléfono; en móvil de 360 px la tarjeta conserva
  // la escala completa porque sigue teniendo ~328 px útiles.
  const compactCard = compact || width < 312;
  // El carrusel desktop recorta por diseño el contenido horizontal. Dejamos respiración
  // dentro del mismo footprint de la tarjeta para que hover, halo y glow no choquen con
  // los bordes laterales del viewport ni alteren snapToInterval.
  const cardOuterInset = Platform.OS === 'web' && compactCard ? 12 : 0;
  const renderedCardWidth = Math.max(0, width - cardOuterInset * 2);
  const planListMinHeight = compactCard ? 96 : 106;
  const cardMinHeight = showTrialAction
    ? compactCard
      ? 468
      : 500
    : compactCard
      ? 410
      : 442;
  const features = [
    `${plan.units} unidades incluidas`,
    `${formatCurrency(plan.pricePerVehicle)} por unidad`,
    plan.includesRadioModule ? 'Radio incluido' : 'Radio opcional',
    'Activación directa',
  ];
  const revealDelay = Math.min(index * PLAN_REVEAL_STAGGER_MS, PLAN_REVEAL_MAX_DELAY_MS);
  const motionReady = Platform.OS !== 'web' || reducedMotion || entered;

  useEffect(() => {
    if (Platform.OS !== 'web' || entered) {
      return;
    }

    if (reducedMotion) {
      setEntered(true);
      setEntrySettled(true);
      return;
    }

    const node = cardRef.current as HTMLElement | null;
    if (!node || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setEntered(true);
      return;
    }

    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.82 && rect.bottom > 0) {
      setEntered(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setEntered(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '0px 0px -18% 0px',
        threshold: 0.08,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [entered, reducedMotion]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !entered || entrySettled) {
      return;
    }

    if (reducedMotion) {
      setEntrySettled(true);
      return;
    }

    const timer = window.setTimeout(
      () => setEntrySettled(true),
      PLAN_REVEAL_DURATION_MS + revealDelay + 40
    );
    return () => window.clearTimeout(timer);
  }, [entered, entrySettled, reducedMotion, revealDelay]);

  useEffect(() => {
    activePulse.stopAnimation();

    if (!active) {
      activePulse.setValue(0);
      return;
    }

    if (reducedMotion) {
      activePulse.setValue(0.55);
      return;
    }

    activePulse.setValue(0);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(activePulse, {
          toValue: 1,
          duration: ACTIVE_PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(activePulse, {
          toValue: 0,
          duration: ACTIVE_PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );

    pulse.start();
    return () => {
      pulse.stop();
      activePulse.setValue(0);
    };
  }, [active, activePulse, reducedMotion]);

  const haloOpacity = activePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.52, 0.94],
  });
  const haloScale = activePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.014],
  });

  return (
    <Pressable
      ref={cardRef as never}
      accessibilityRole="button"
      accessibilityLabel={`Seleccionar plan ${plan.name}`}
      onPress={onPress}
      style={(state) => {
        const pressed = state.pressed;
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const hoverLift = compactCard ? -6 : -7;
        const selectedLift = compactCard ? -4 : -6;
        const hoverScale = compactCard ? 1.018 : 1.022;
        const restingTranslateY = active ? selectedLift : hovered ? hoverLift : 0;
        const restingScale = hovered ? hoverScale : 1;

        return [
          styles.planCard,
          {
            // El listado de beneficios no puede colapsar por debajo de su contenido. La altura
            // mínima contempla también la segunda acción del plan demo para que ningún CTA se
            // monte sobre los textos al cambiar viewport, zoom o métrica tipográfica.
            alignSelf: 'stretch',
            flexShrink: 0,
            gap: compactCard ? 12 : 15,
            marginHorizontal: cardOuterInset,
            maxWidth: renderedCardWidth,
            minHeight: cardMinHeight,
            opacity: motionReady ? 1 : 0,
            padding: compactCard ? 18 : 20,
            width: renderedCardWidth,
            borderColor: active ? visual.edge : hovered ? `${visual.secondary}E6` : `${visual.edge}44`,
            ...(Platform.OS === 'web'
              ? null
              : {
                  shadowColor: cardEdge,
                  shadowOpacity: active ? 0.5 : hovered ? 0.34 : 0.15,
                }),
            transform: [
              { translateY: motionReady ? restingTranslateY : 28 },
              { scale: motionReady ? restingScale : 0.985 },
            ],
            ...(Platform.OS === 'web'
              ? ({
                  backgroundImage: active
                    ? 'linear-gradient(145deg, rgba(11, 18, 36, 0.99) 0%, rgba(19, 27, 51, 0.96) 58%, rgba(11, 18, 36, 0.99) 100%)'
                    : hovered
                      ? 'linear-gradient(145deg, rgba(13, 22, 43, 0.98) 0%, rgba(20, 31, 57, 0.94) 100%)'
                      : 'linear-gradient(145deg, rgba(10, 17, 34, 0.94) 0%, rgba(15, 24, 46, 0.9) 100%)',
                  boxShadow:
                    active || hovered
                      ? `0 0 0 1px ${visual.edge}A8, 0 0 22px ${visual.edge}4A, 0 18px 34px rgba(0, 0, 0, 0.38)`
                      : `0 0 0 1px ${visual.edge}22, 0 12px 26px rgba(0, 0, 0, 0.24)`,
                  filter: motionReady ? 'blur(0px)' : 'blur(3px)',
                  transitionDelay: reducedMotion || entrySettled ? '0ms' : `${revealDelay}ms`,
                  transitionDuration: reducedMotion
                    ? '0ms'
                    : entrySettled
                      ? compactCard
                        ? '260ms'
                        : '300ms'
                      : `${PLAN_REVEAL_DURATION_MS}ms`,
                  transitionTimingFunction: entrySettled
                    ? 'cubic-bezier(0.16, 1, 0.3, 1)'
                    : 'cubic-bezier(0.16, 1, 0.3, 1)',
                  transitionProperty: 'transform, box-shadow, border-color, background-image, opacity, filter',
                  backdropFilter: 'blur(18px)',
                  cursor: 'pointer',
                  willChange: entrySettled ? 'transform, box-shadow' : 'transform, opacity, filter',
                } as any)
              : null),
          },
          pressed ? styles.buttonPressed : undefined,
        ];
      }}>
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.planSelectedHalo,
            {
              borderColor: `${visual.edge}D0`,
              backgroundColor: 'transparent',
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
      ) : null}
      <View style={styles.planTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[
              styles.planBadge,
              active ? styles.planBadgeActive : undefined,
              {
                color: cardEdge,
              },
              Platform.OS === 'web'
                ? null
                : { textShadowColor: active ? `${visual.edge}AA` : 'transparent' },
            ]}>
            {plan.badge}
          </Text>
          <Text
            numberOfLines={2}
            style={[
              styles.planName,
              compactCard ? { fontSize: 24, lineHeight: 28 } : undefined,
            ]}>
            {plan.name}
          </Text>
        </View>
        <View
          style={[
            styles.planSymbol,
            compactCard ? { width: 42, height: 42 } : undefined,
            { borderColor: `${cardEdge}66`, backgroundColor: 'rgba(255, 255, 255, 0.06)' },
          ]}>
          <MaterialCommunityIcons name="bus-electric" size={compactCard ? 21 : 24} color={cardEdge} />
        </View>
      </View>
      <Text
        style={[
          styles.planSubtitle,
          compactCard ? { fontSize: 13, lineHeight: 19, minHeight: 38 } : undefined,
        ]}>
        {plan.subtitle}
      </Text>
      <View style={styles.planPriceRow}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[
            styles.planPrice,
            compactCard ? { fontSize: 34, lineHeight: 40 } : undefined,
          ]}>
          {formatCurrency(plan.price)}
        </Text>
        <Text style={styles.planPeriod}>/mes</Text>
      </View>
      <View
        style={[
          styles.planList,
          { minHeight: planListMinHeight, flexShrink: 0 },
          compactCard ? { gap: 8 } : undefined,
        ]}>
        {features.map((entry) => (
          <View key={entry} style={styles.planListRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={17} color={cardEdge} />
            <Text style={[styles.planListText, compactCard ? { fontSize: 13, lineHeight: 18 } : undefined]}>{entry}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.planActions, { gap: 9, flexShrink: 0, width: '100%' }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${userLabel}: ${plan.name}`}
          onPress={onBuy}
          style={(state) => {
            const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
            const pressed = state.pressed;

            return [
              styles.planButton,
              compactCard ? { minHeight: 50, paddingHorizontal: 12 } : undefined,
              {
                backgroundColor: neonPalette.accent,
                borderColor: neonPalette.accent,
                transform: [{ scale: hovered ? 1.018 : 1 }],
                ...(Platform.OS === 'web'
                  ? ({
                      boxShadow: hovered
                        ? `0 0 24px ${neonPalette.accentGlow}, 0 18px 40px rgba(255, 45, 122, 0.3)`
                        : `0 0 16px ${neonPalette.accentGlow}, 0 12px 30px rgba(255, 45, 122, 0.2)`,
                      transitionDuration: '240ms',
                      transitionProperty: 'transform, box-shadow',
                      cursor: 'pointer',
                    } as any)
                  : null),
              },
              pressed ? styles.buttonPressed : undefined,
            ];
          }}>
          <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" />
          <Text style={styles.planButtonLabel} numberOfLines={compactCard ? 2 : 1}>
            {userLabel}
          </Text>
        </Pressable>

        {showTrialAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${trialLabel}: ${plan.name}`}
            onPress={onTrial}
            style={(state) => {
              const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
              const pressed = state.pressed;

              return [
                styles.planButton,
                compactCard ? { minHeight: 48, paddingHorizontal: 12 } : { minHeight: 48 },
                {
                  backgroundColor: hovered ? `${cardEdge}20` : 'rgba(255, 255, 255, 0.035)',
                  borderColor: `${cardEdge}A8`,
                  transform: [{ scale: hovered ? 1.012 : 1 }],
                  ...(Platform.OS === 'web'
                    ? ({
                        boxShadow: hovered ? `0 0 18px ${cardEdge}30` : 'none',
                        transitionDuration: '220ms',
                        transitionProperty: 'transform, box-shadow, background-color',
                        cursor: 'pointer',
                      } as any)
                    : null),
                },
                pressed ? styles.buttonPressed : undefined,
              ];
            }}>
            <MaterialCommunityIcons name="clock-fast" size={18} color={cardEdge} />
            <Text
              style={[styles.planButtonLabel, { color: cardEdge }]}
              numberOfLines={compactCard ? 2 : 1}>
              {trialLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
