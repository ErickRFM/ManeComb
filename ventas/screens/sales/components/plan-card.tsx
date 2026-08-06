import { Platform, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { CommercialPlan } from '@/src/types/app';
import { neonPalette } from '../constants';
import { styles } from '../styles';
import { formatCurrency, getPlanVisualTone, isPublicDemoPlan } from '../utils';

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
  userLabel,
  trialLabel,
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
  userLabel: string;
  trialLabel?: string;
}) {
  const visual = getPlanVisualTone(index);
  const cardEdge = active ? visual.edge : accent;
  const compactCard = compact;
  const demoEligible = isPublicDemoPlan(plan);
  const features = [
    `${plan.units} unidades incluidas`,
    `${formatCurrency(plan.pricePerVehicle)} por unidad`,
    plan.includesRadioModule ? 'Radio incluido' : 'Radio opcional',
    demoEligible ? `Demo de ${plan.trialDays || 7} días disponible` : 'Activación directa',
  ];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Seleccionar plan ${plan.name}`}
      onPress={onPress}
      style={(state) => {
        const pressed = state.pressed;
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);

        return [
          styles.planCard,
          {
            alignSelf: 'flex-start',
            flexShrink: 0,
            gap: compactCard ? 12 : 15,
            maxWidth: width,
            minHeight: compactCard ? 0 : 382,
            padding: compactCard ? 18 : 20,
            width,
            borderColor: active ? visual.edge : hovered ? `${visual.secondary}CC` : `${visual.edge}44`,
            ...(Platform.OS === 'web'
              ? null
              : {
                  shadowColor: cardEdge,
                  shadowOpacity: active ? 0.5 : hovered ? 0.3 : 0.15,
                }),
            transform: [
              { translateY: active && !compactCard ? -6 : hovered && !compactCard ? -3 : 0 },
              { scale: hovered && !compactCard ? 1.015 : 1 },
            ],
            ...(Platform.OS === 'web'
              ? ({
                  backgroundImage: active
                    ? 'linear-gradient(145deg, rgba(11, 18, 36, 0.98) 0%, rgba(19, 27, 51, 0.94) 58%, rgba(11, 18, 36, 0.98) 100%)'
                    : 'linear-gradient(145deg, rgba(10, 17, 34, 0.94) 0%, rgba(15, 24, 46, 0.9) 100%)',
                  boxShadow:
                    active || hovered
                      ? `0 0 0 1px ${visual.edge}88, 0 0 26px ${visual.edge}38, 0 22px 58px rgba(0, 0, 0, 0.38)`
                      : `0 0 0 1px ${visual.edge}22, 0 16px 38px rgba(0, 0, 0, 0.24)`,
                  transitionDelay: `${index * 35}ms`,
                  transitionDuration: '300ms',
                  transitionProperty: 'transform, box-shadow, border-color, background-image, opacity',
                  backdropFilter: 'blur(18px)',
                  cursor: 'pointer',
                } as any)
              : null),
          },
          pressed ? styles.buttonPressed : undefined,
        ];
      }}>
      {active ? (
        <View
          pointerEvents="none"
          style={[
            styles.planSelectedHalo,
            {
              borderColor: `${visual.edge}B8`,
              backgroundColor: 'transparent',
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
          compactCard ? { fontSize: 13, lineHeight: 19, minHeight: 0 } : undefined,
        ]}>
        {plan.subtitle}
      </Text>
      {demoEligible ? (
        <View
          style={{
            alignItems: 'center',
            alignSelf: 'flex-start',
            backgroundColor: neonPalette.cyanSoft,
            borderColor: 'rgba(0, 194, 255, 0.36)',
            borderRadius: 999,
            borderWidth: 1,
            flexDirection: 'row',
            gap: 6,
            minHeight: 30,
            paddingHorizontal: 10,
          }}>
          <MaterialCommunityIcons name="flask-outline" size={15} color={neonPalette.cyan} />
          <Text
            style={{
              color: neonPalette.cyan,
              fontSize: 10.5,
              fontWeight: '900',
              letterSpacing: 0.3,
            }}>
            DEMO DISPONIBLE
          </Text>
        </View>
      ) : null}
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
      <View style={[styles.planList, compactCard ? { flex: 0, gap: 8 } : undefined]}>
        {features.map((entry) => (
          <View key={entry} style={styles.planListRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={17} color={cardEdge} />
            <Text style={[styles.planListText, compactCard ? { fontSize: 13, lineHeight: 18 } : undefined]}>{entry}</Text>
          </View>
        ))}
      </View>
      <View style={styles.planActions}>
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
        {demoEligible && onTrial ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${trialLabel || 'Probar plan'}: ${plan.name}`}
            onPress={onTrial}
            style={(state) => {
              const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
              const pressed = state.pressed;

              return [
                styles.planTrialButton,
                compactCard ? { minHeight: 44, paddingHorizontal: 10 } : undefined,
                {
                  borderColor: hovered ? neonPalette.cyan : `${neonPalette.cyan}88`,
                  backgroundColor: hovered ? 'rgba(0, 194, 255, 0.18)' : neonPalette.cyanSoft,
                  transform: [{ scale: hovered ? 1.012 : 1 }],
                  ...(Platform.OS === 'web'
                    ? ({
                        boxShadow: hovered ? `0 0 18px ${neonPalette.cyan}44` : 'none',
                        transitionDuration: '220ms',
                        transitionProperty: 'transform, box-shadow, border-color, background-color',
                        cursor: 'pointer',
                      } as any)
                    : null),
                },
                pressed ? styles.buttonPressed : undefined,
              ];
            }}>
            <MaterialCommunityIcons name="flask-outline" size={17} color={neonPalette.cyan} />
            <Text
              style={[styles.planTrialLabel, { color: neonPalette.cyan }]}
              numberOfLines={compactCard ? 2 : 1}>
              {trialLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
