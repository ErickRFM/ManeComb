import { Platform, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { neonPalette } from '../constants';
import { styles } from '../styles';
import { getCheckoutReturnCopy, getFirstParam, webStyle } from '../utils';
import type { IconName } from '../types';

export function CheckoutReturnBanner({
  confirmation,
  onPrimaryPress,
  status,
}: {
  confirmation?: { status?: string; message?: string };
  onPrimaryPress: () => void;
  status?: string | string[];
}) {
  const copy = getCheckoutReturnCopy(getFirstParam(status), confirmation);

  if (!copy) {
    return null;
  }

  const toneColor =
    copy.tone === 'success'
      ? neonPalette.mint
      : copy.tone === 'pending'
        ? neonPalette.cyan
        : neonPalette.accent;

  return (
    <View style={[styles.checkoutReturnBanner, { borderColor: `${toneColor}66`, backgroundColor: `${toneColor}14` }]}>
      <View style={[styles.checkoutReturnIcon, { backgroundColor: `${toneColor}22` }]}>
        <MaterialCommunityIcons name={copy.icon} size={24} color={toneColor} />
      </View>
      <View style={styles.checkoutReturnCopy}>
        <Text style={styles.checkoutReturnTitle}>{copy.title}</Text>
        <Text style={styles.checkoutReturnBody}>{copy.body}</Text>
      </View>
      <Pressable onPress={onPrimaryPress} style={[styles.checkoutReturnButton, { backgroundColor: toneColor }]}>
        <Text style={styles.checkoutReturnButtonText}>{copy.action}</Text>
      </Pressable>
    </View>
  );
}
