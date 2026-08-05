import { Platform, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusBadge, type StatusBadgeTone } from '@/src/components/ui/status-badge';
import { formatCurrency } from '@/src/utils/format';
import { planVisualTones } from '@/screens/sales/constants';
import { styles } from '../plan.styles';
import type { CommercialPlanView } from '@/features/commercial';

export function PlanComparisonCard({
  active,
  index,
  plan,
  selected,
  onSelect,
}: {
  active: boolean;
  index: number;
  plan: CommercialPlanView;
  selected: boolean;
  onSelect: () => void;
}) {
  const indicator = active ? 'Plan actual' : plan.indicator;
  const indicatorTone: StatusBadgeTone = active ? 'positive' : plan.id === 'value-4' ? 'info' : 'neutral';
  const visual = planVisualTones[index % planVisualTones.length];
  const emphasized = selected || active;

  return (
    <View
      style={[
        styles.planCard,
        {
          backgroundColor: visual.soft,
          borderColor: emphasized ? visual.edge : `${visual.edge}55`,
          ...(Platform.OS === 'web'
            ? ({
                backgroundImage: `linear-gradient(145deg, ${visual.soft}, rgba(18, 24, 33, 0.94) 68%)`,
                boxShadow: emphasized
                  ? `0 0 0 1px ${visual.edge}55, 0 18px 42px ${visual.cursor}`
                  : '0 14px 34px rgba(0, 0, 0, 0.24)',
                transition: 'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
              } as any)
            : undefined),
        },
      ]}>
      <View style={styles.planCardHeader}>
        <View style={styles.planCardTitleWrap}>
          <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: 10, minWidth: 0 }}>
            <View
              style={{
                alignItems: 'center',
                backgroundColor: visual.secondarySoft,
                borderColor: `${visual.edge}66`,
                borderRadius: 12,
                borderWidth: 1,
                flexShrink: 0,
                height: 42,
                justifyContent: 'center',
                width: 42,
              }}>
              <MaterialCommunityIcons name="bus-electric" size={21} color={visual.edge} />
            </View>
            <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
              <Text style={[styles.planName, { color: visual.edge }]}>{plan.displayName}</Text>
              <Text style={styles.planDescription}>{plan.description}</Text>
            </View>
          </View>
        </View>
        <StatusBadge label={indicator} tone={indicatorTone} />
      </View>

      <View style={styles.priceRow}>
        <Text style={[styles.planPrice, { color: visual.edge }]}>{formatCurrency(plan.price)}</Text>
        <Text style={styles.pricePeriod}>al mes</Text>
      </View>
      <Text style={styles.unitPrice}>
        {plan.units} unidades incluidas · aprox. {formatCurrency(plan.pricePerVehicle)} por unidad
      </Text>

      <View style={{ backgroundColor: visual.edge, borderRadius: 99, height: 3, opacity: 0.85, width: 54 }} />

      <View style={styles.benefitList}>
        {plan.benefits.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={17} color={visual.secondary} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      {active ? (
        <View style={[styles.currentPlanAction, { borderColor: `${visual.secondary}66`, borderWidth: 1, backgroundColor: visual.secondarySoft }]}>
          <MaterialCommunityIcons name="check" size={17} color={visual.secondary} />
          <Text style={[styles.currentPlanActionText, { color: visual.secondary }]}>Este es tu plan actual</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Comparar plan ${plan.displayName}`}
          accessibilityState={{ selected }}
          onPress={onSelect}
          style={[
            styles.compareButton,
            selected
              ? {
                  backgroundColor: visual.edge,
                  borderColor: visual.edge,
                  ...(Platform.OS === 'web' ? ({ boxShadow: `0 10px 24px ${visual.cursor}` } as any) : undefined),
                }
              : { borderColor: `${visual.edge}77`, backgroundColor: 'rgba(255,255,255,0.035)' },
          ]}>
          <Text style={[styles.compareButtonText, selected ? styles.compareButtonTextSelected : { color: visual.edge }]}>
            {selected ? 'Seleccionado' : 'Comparar'}
          </Text>
          <MaterialCommunityIcons
            name={selected ? 'check' : 'arrow-right'}
            size={17}
            color={selected ? '#FFFFFF' : visual.edge}
          />
        </Pressable>
      )}
    </View>
  );
}
