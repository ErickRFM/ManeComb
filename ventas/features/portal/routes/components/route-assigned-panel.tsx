import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { EmptyState } from '@/src/components/ui/empty-state';
import { RouteGeometryThumbnail } from '../../components/route-geometry-thumbnail';
import { portalPalette } from '../../portal-theme';
import { styles } from '../routes.styles';
import type { SavedRoute, GeoPoint } from '@/src/types/app';

export function RouteAssignedPanel({
  selectedVehicle,
  selectedSavedRoute,
  routeLabel,
  routeGeometry,
  onEdit,
  onClear,
}: {
  selectedVehicle: { code: string; assignedRoute?: any; routeColor?: string } | null;
  selectedSavedRoute: SavedRoute | null;
  routeLabel: string;
  routeGeometry: GeoPoint[];
  onEdit: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.assignedPanel}>
      <View style={styles.panelHeading}>
        <Text style={styles.panelTitle}>Rutas asignadas a {selectedVehicle?.code || '—'}</Text>
        <Text style={styles.panelCount}>{selectedVehicle?.assignedRoute ? 1 : 0}</Text>
      </View>
      {selectedVehicle?.assignedRoute ? (
        <View style={styles.assignedCard}>
          <View style={styles.assignedHeader}>
            <Text numberOfLines={1} style={styles.assignedName}>{selectedVehicle.assignedRoute.route?.label || routeLabel}</Text>
            <StatusBadge label="Activa" tone="positive" />
          </View>
          <RouteGeometryThumbnail color={selectedVehicle.routeColor} polyline={routeGeometry} stops={selectedVehicle.assignedRoute.stops} />
          <Text style={styles.assignedDate}>Asignada: {selectedVehicle.assignedRoute.assignedAt ? new Date(selectedVehicle.assignedRoute.assignedAt).toLocaleString('es-MX') : 'Sin fecha'}</Text>
          <View style={styles.assignedActions}>
            <Pressable accessibilityLabel="Editar ruta asignada" disabled={!selectedSavedRoute} onPress={onEdit} style={styles.iconAction}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={portalPalette.info} />
            </Pressable>
            <Pressable accessibilityLabel="Liberar ruta" onPress={onClear} style={styles.iconAction}>
              <MaterialCommunityIcons name="delete-outline" size={18} color={portalPalette.danger} />
            </Pressable>
          </View>
        </View>
      ) : (
        <EmptyState icon="routes" title="Sin ruta asignada" description="Selecciona una ruta del catálogo y asígnala." />
      )}
    </View>
  );
}
