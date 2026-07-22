import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { styles as s } from '../checkout.styles';
import { palette } from '../checkout.constants';

type Props = {
  receiptIsActive: boolean;
  doneTitle: string;
  doneText: string;
  doneButtonLabel: string;
  onGoToPortal: () => void;
};

export function CheckoutDonePanel({
  receiptIsActive,
  doneTitle,
  doneText,
  doneButtonLabel,
  onGoToPortal,
}: Props) {
  return (
    <View style={s.donePanel}>
      <View style={s.doneIcon}>
        <MaterialCommunityIcons
          name={receiptIsActive ? 'check-circle-outline' : 'clock-outline'}
          size={46}
          color={receiptIsActive ? palette.lime : palette.cyan}
        />
      </View>
      <Text style={s.doneTitle}>{doneTitle}</Text>
      <Text style={s.doneText}>{doneText}</Text>
      <Pressable accessibilityRole="button" onPress={onGoToPortal} style={[s.payButton, s.doneButton]}>
        <MaterialCommunityIcons name="view-dashboard-outline" size={22} color="#FFFFFF" />
        <Text style={s.payButtonText}>{doneButtonLabel}</Text>
        <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
