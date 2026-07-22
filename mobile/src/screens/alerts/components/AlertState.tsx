import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';

export function AlertState({
  hasIncidents,
  loading,
  styles,
  theme,
}: {
  hasIncidents: boolean;
  loading: boolean;
  styles: any;
  theme: any;
}) {
  if (loading) {
    return (
      <View style={styles.stateBox}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={styles.stateTitle}>Cargando</Text>
      </View>
    );
  }

  return (
    <View style={styles.stateBox}>
      <MaterialCommunityIcons
        name={hasIncidents ? 'magnify-close' : 'clipboard-text-clock-outline'}
        size={27}
        color={theme.colors.muted}
      />
      <Text style={styles.stateTitle}>
        {hasIncidents ? 'Sin coincidencias' : 'Sin alertas recientes'}
      </Text>
      <Text style={styles.stateBody}>
        {hasIncidents ? 'Ajusta los filtros o la busqueda.' : 'Sin alertas recientes'}
      </Text>
    </View>
  );
}
