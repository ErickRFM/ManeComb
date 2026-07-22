import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusBadge, type StatusBadgeTone } from '@/src/components/ui/status-badge';
import { formatCurrency } from '@/src/utils/format';
import { portalButtonGradient, portalPalette } from '../../portal-theme';
import { styles } from '../plan.styles';
import type { CommercialPlanView } from '@/features/commercial';

export function PlanComparisonCard({
  active,
  plan,
  selected,
  onSelect,
}: {
  active: boolean;
  plan: CommercialPlanView;
  selected: boolean;
  onSelect: () => void;
}) {
  const indicator = active ? 'Plan actual' : plan.indicator;
  const indicatorTone: StatusBadgeTone = active ? 'positive' : plan.id === 'value-4' ? 'info' : 'neutral';

  return (
    <View style={[styles.planCard, selected ? styles.planCardSelected : undefined, active ? styles.planCardActive : undefined]}>
      <View style={styles.planCardHeader}>
        <View style={styles.planCardTitleWrap}>
          <Text style={styles.planName}>{plan.displayName}</Text>
          <Text style={styles.planDescription}>{plan.description}</Text>
        </View>
        <StatusBadge label={indicator} tone={indicatorTone} />
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.planPrice}>{formatCurrency(plan.price)}</Text>
        <Text style={styles.pricePeriod}>al mes</Text>
      </View>
      <Text style={styles.unitPrice}>
        {plan.units} unidades incluidas · aprox. {formatCurrency(plan.pricePerVehicle)} por unidad
      </Text>

      <View style={styles.benefitList}>
        {plan.benefits.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={17} color={portalPalette.success} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      {active ? (
        <View style={styles.currentPlanAction}>
          <MaterialCommunityIcons name="check" size={17} color={portalPalette.success} />
          <Text style={styles.currentPlanActionText}>Este es tu plan actual</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Comparar plan ${plan.displayName}`}
          accessibilityState={{ selected }}
          onPress={onSelect}
          style={[styles.compareButton, selected ? portalButtonGradient() : undefined]}>
          <Text style={[styles.compareButtonText, selected ? styles.compareButtonTextSelected : undefined]}>
            {selected ? 'Seleccionado' : 'Comparar'}
          </Text>
          <MaterialCommunityIcons
            name={selected ? 'check' : 'arrow-right'}
            size={17}
            color={selected ? '#FFFFFF' : portalPalette.text}
          />
        </Pressable>
      )}
    </View>
  );
}
