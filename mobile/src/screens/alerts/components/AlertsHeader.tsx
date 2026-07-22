import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { AlertSummary } from './AlertSummary';

export function AlertsHeader({
  isSubmitting,
  onPanic,
  onUnit,
  open,
  styles,
  theme,
}: {
  isSubmitting: boolean;
  onPanic: () => void;
  onUnit: () => void;
  open: number;
  styles: any;
  theme: any;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>Alertas</Text>
        </View>
        <AlertSummary open={open} styles={styles} />
      </View>
      <View style={styles.sosGrid}>
        <Pressable
          accessibilityLabel="Emitir alerta de panico"
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={onPanic}
          style={[styles.sosBtn, { backgroundColor: theme.colors.danger }, isSubmitting ? styles.sosBtnDisabled : undefined]}>
          <MaterialCommunityIcons name="shield-alert" size={21} color="#FFF" />
          <Text style={styles.sosBtnText}>Panico</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Emitir alerta critica de unidad"
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={onUnit}
          style={[styles.sosBtn, { backgroundColor: theme.colors.warning }, isSubmitting ? styles.sosBtnDisabled : undefined]}>
          <MaterialCommunityIcons name="bus-alert" size={21} color="#FFF" />
          <Text style={styles.sosBtnText}>Unidad</Text>
        </Pressable>
      </View>
    </View>
  );
}
