import { Text, View } from 'react-native';

export function AlertSummary({ open, styles }: { open: number; styles: any }) {
  return (
    <View style={styles.summaryHUD}>
      <Text style={styles.summaryHUDLabel}>Abiertas / activas</Text>
      <Text style={styles.summaryHUDText}>{open}</Text>
    </View>
  );
}
