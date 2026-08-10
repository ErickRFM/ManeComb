import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { CheckoutStep } from '../checkout.types';
import { styles as s } from '../checkout.styles';
import { palette } from '../checkout.constants';

type Props = {
  currentStep: CheckoutStep;
};

const items = [
  { id: 'payment' as const, label: 'Pago', icon: 'credit-card-outline' as const },
  { id: 'done' as const, label: 'Listo', icon: 'check-circle-outline' as const },
];

export function Stepper({ currentStep }: Props) {
  const completed = currentStep === 'done';

  return (
    <View accessibilityLabel={completed ? 'Checkout completado' : 'Checkout en proceso'} style={s.stepper}>
      {items.map((item, index) => {
        const active = item.id === 'payment' || completed;

        return (
          <View key={item.id} style={s.stepItem}>
            <View style={[s.stepBadge, active ? s.stepBadgeActive : undefined]}>
              <Text style={[s.stepNumber, active ? s.stepNumberActive : undefined]}>{index + 1}</Text>
            </View>
            <MaterialCommunityIcons name={item.icon} size={22} color={active ? palette.violet : palette.mutedSoft} />
            <Text style={[s.stepLabel, active ? s.stepLabelActive : undefined]}>{item.label}</Text>
            {index < items.length - 1 ? <View style={s.stepLine} /> : null}
          </View>
        );
      })}
    </View>
  );
}