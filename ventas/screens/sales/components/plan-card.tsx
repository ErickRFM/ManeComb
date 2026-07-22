import { Platform, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { CommercialPlan } from '@/src/types/app';
import { neonPalette } from '../constants';
import { styles } from '../styles';
import { formatCurrency, getPlanVisualTone, webStyle } from '../utils';

export function PlanCard({
  index,
  plan,
  width,
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
  const features = [
    `${plan.units} unidades incluidas`,
    `${formatCurrency(plan.pricePerVehicle)} por unidad`,
    plan.includesRadioModule ? 'Radio incluido' : 'Radio opcional',
    plan.trialEligible ? `Prueba de ${plan.trialDays || 7} días` : 'Activación directa',
  ];

  return (
    <Pressable
      onPress={onPress}
      style={(state) => {
        const pressed = state.pressed;
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);

        return [
          styles.planCard,
          {
            width,
            borderColor: active ? visual.edge : hovered ? `${visual.secondary}CC` : `${visual.edge}44`,
            ...(Platform.OS === 'web'
              ? null
              : {
                  shadowColor: cardEdge,
                  shadowOpacity: active ? 0.58 : hovered ? 0.36 : 0.18,
                }),
            transform: [
              { translateY: active ? -6 : hovered ? -3 : 0 },
              { scale: hovered ? 1.02 : 1 },
            ],
            ...(Platform.OS === 'web'
              ? ({
                  backgroundImage: active
                    ? 'linear-gradient(145deg, rgba(11, 18, 36, 0.98) 0%, rgba(19, 27, 51, 0.94) 58%, rgba(11, 18, 36, 0.98) 100%)'
                    : 'linear-gradient(145deg, rgba(10, 17, 34, 0.94) 0%, rgba(15, 24, 46, 0.9) 100%)',
                  boxShadow:
                    active || hovered
                      ? `0 0 0 1px ${visual.edge}88, 0 0 30px ${visual.edge}42, 0 26px 70px rgba(0, 0, 0, 0.42)`
                      : `0 0 0 1px ${visual.edge}22, 0 18px 46px rgba(0, 0, 0, 0.26)`,
                  transitionDelay: `${index * 35}ms`,
                  transitionDuration: '340ms',
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
        <View>
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
          <Text style={styles.planName}>{plan.name}</Text>
        </View>
        <View style={[styles.planSymbol, { borderColor: `${cardEdge}66`, backgroundColor: 'rgba(255, 255, 255, 0.06)' }]}>
          <MaterialCommunityIcons name="bus-electric" size={24} color={cardEdge} />
        </View>
      </View>
      <Text style={styles.planSubtitle}>{plan.subtitle}</Text>
      <View style={styles.planPriceRow}>
        <Text style={styles.planPrice}>{formatCurrency(plan.price)}</Text>
        <Text style={styles.planPeriod}>/mes</Text>
      </View>
      <View style={styles.planList}>
        {features.map((entry) => (
          <View key={entry} style={styles.planListRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={17} color={cardEdge} />
            <Text style={styles.planListText}>{entry}</Text>
          </View>
        ))}
      </View>
      <View style={styles.planActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onBuy}
          style={(state) => {
            const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
            const pressed = state.pressed;

            return [
              styles.planButton,
              {
                backgroundColor: neonPalette.accent,
                borderColor: neonPalette.accent,
                transform: [{ scale: hovered ? 1.025 : 1 }],
                ...(Platform.OS === 'web'
                  ? ({
                      boxShadow: hovered
                        ? `0 0 24px ${neonPalette.accentGlow}, 0 18px 40px rgba(255, 45, 122, 0.3)`
                        : `0 0 16px ${neonPalette.accentGlow}, 0 12px 30px rgba(255, 45, 122, 0.2)`,
                      transitionDuration: '260ms',
                      transitionProperty: 'transform, box-shadow',
                      cursor: 'pointer',
                    } as any)
                  : null),
              },
              pressed ? styles.buttonPressed : undefined,
            ];
          }}>
          <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" />
          <Text style={styles.planButtonLabel} numberOfLines={1}>{userLabel}</Text>
        </Pressable>
        {onTrial ? (
          <Pressable
            accessibilityRole="button"
            onPress={onTrial}
            style={(state) => {
              const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
              const pressed = state.pressed;

              return [
                styles.planTrialButton,
                {
                  borderColor: hovered ? neonPalette.accent : `${neonPalette.accent}88`,
                  backgroundColor: hovered ? 'rgba(255, 45, 122, 0.2)' : neonPalette.accentSoft,
                  transform: [{ scale: hovered ? 1.018 : 1 }],
                  ...(Platform.OS === 'web'
                    ? ({
                        boxShadow: hovered ? `0 0 18px ${neonPalette.accent}44` : 'none',
                        transitionDuration: '240ms',
                        transitionProperty: 'transform, box-shadow, border-color, background-color',
                        cursor: 'pointer',
                      } as any)
                    : null),
                },
                pressed ? styles.buttonPressed : undefined,
              ];
            }}>
            <MaterialCommunityIcons name="credit-card-clock-outline" size={17} color={neonPalette.accent} />
            <Text style={[styles.planTrialLabel, { color: neonPalette.accent }]} numberOfLines={1}>{trialLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
