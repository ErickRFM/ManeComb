import { Text, View } from 'react-native';
import { styles } from '../app-mobile.styles';
import type { DeviceVersionStats } from '@/src/api/client';

export function AppAdminDeviceStats({
  stats,
  loading,
}: {
  stats: DeviceVersionStats | null;
  loading: boolean;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Estado de los dispositivos</Text>
      <Text style={styles.sectionSubtitle}>Versiones instaladas en los teléfonos de los conductores</Text>
      {loading ? (
        <Text style={styles.loadingText}>Cargando...</Text>
      ) : stats ? (
        <View style={styles.statsGrid}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Dispositivos</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.mostUsedVersion || '—'}</Text>
            <Text style={styles.statLabel}>Versión más usada</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.lastPublication ? stats.lastPublication.slice(0, 10) : '—'}</Text>
            <Text style={styles.statLabel}>Última publicación</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{Object.keys(stats.versions).length}</Text>
            <Text style={styles.statLabel}>Versiones distintas</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.loadingText}>Sin datos de dispositivos</Text>
      )}
    </View>
  );
}
