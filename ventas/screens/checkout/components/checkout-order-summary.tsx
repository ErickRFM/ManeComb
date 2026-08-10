import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { CommercialPlan } from '@/src/types/app';
import { palette } from '../checkout.constants';
import { checkoutBenefits } from '../checkout.constants';
import { formatCurrency } from '../checkout.utils';
import { styles as s } from '../checkout.styles';

type Props = {
  includeRadioAddon: boolean;
  plan: CommercialPlan;
  requestTrial: boolean;
  totalAmount: number;
};

function TotalRow({ label, strong, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <View style={s.totalRow}>
      <Text style={[s.totalLabel, strong ? s.totalLabelStrong : undefined]}>{label}</Text>
      <Text style={[s.totalValue, strong ? s.totalValueStrong : undefined]}>{value}</Text>
    </View>
  );
}

export function OrderSummary({ includeRadioAddon, plan, requestTrial, totalAmount }: Props) {
  return (
    <View style={s.summaryPanel}>
      <View style={s.panelTitleRow}>
        <View style={s.panelTitleIcon}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={24} color={palette.violet} />
        </View>
        <View style={s.panelTitleCopy}>
          <Text style={s.panelTitle}>Resumen de tu pedido</Text>
          <Text style={s.panelSubtitle}>Plan seleccionado para la cuenta.</Text>
        </View>
      </View>

      <View style={s.summaryHero}>
        <View style={s.summaryIcon}>
          <MaterialCommunityIcons name="bus-electric" size={42} color={palette.violet} />
        </View>
        <View style={s.summaryCopy}>
          <Text style={s.summaryPlan}>{plan.name}</Text>
          <Text style={s.summaryPrice}>{formatCurrency(plan.price)} MXN / mes</Text>
          <Text style={s.summaryMeta}>Incluye {plan.units} unidades y acceso administrativo completo.</Text>
        </View>
      </View>

      <View style={s.totals}>
        <TotalRow label="Subtotal" value={`${formatCurrency(plan.price)} MXN`} />
        {includeRadioAddon ? (
          <TotalRow label="Radio operativo" value={`${formatCurrency(plan.radioAddonPrice || 0)} MXN`} />
        ) : null}
        <TotalRow label="IVA incluido" value="Incluido" />
        <View style={s.totalDivider} />
        <TotalRow label="Total mensual" value={`${formatCurrency(totalAmount)} MXN`} strong />
      </View>

      <View style={s.summaryBenefits}>
        <Text style={s.summaryBenefitsTitle}>Incluye:</Text>
        {checkoutBenefits.map((benefit) => (
          <View key={benefit} style={s.summaryBenefitRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={17} color={palette.violet} />
            <Text style={s.summaryBenefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      <View style={s.cancelBox}>
        <MaterialCommunityIcons name={requestTrial ? 'shield-check-outline' : 'shield-check-outline'} size={28} color={palette.violet} />
        <View style={s.cancelCopy}>
          <Text style={s.cancelTitle}>{requestTrial ? 'Prueba 7 días' : 'Control de tu suscripción'}</Text>
          <Text style={s.cancelText}>
            {requestTrial
              ? 'Prueba primero y conserva el plan seleccionado.'
              : 'Puedes cambiar o cancelar la suscripción desde tu portal.'}
          </Text>
        </View>
      </View>
    </View>
  );
}
