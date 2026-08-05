import { Suspense } from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { EmptyState } from '@/src/components/ui/empty-state';
import { PortalButton } from '../../components/portal-button';
import { portalPalette } from '../../portal-theme';
import { styles } from '../routes.styles';
import type { SavedRoute } from '@/src/types/app';

type RoutePreviewPanelProps = {
  canAssign: boolean;
  children: React.ReactNode;
  isAssigning: boolean;
  onAssignRoute: () => void;
  onEditRoute: () => void;
  selectedSavedRoute: SavedRoute | null;
};

export function RoutePreviewPanel({
  canAssign,
  children,
  isAssigning,
  onAssignRoute,
  onEditRoute,
  selectedSavedRoute,
}: RoutePreviewPanelProps) {
  void canAssign;
  void isAssigning;
  void onAssignRoute;

  return (
    <>
      <View style={styles.previewMapShell}>
        <View style={styles.mapLabel}>
          <MaterialCommunityIcons name="map-outline" size={15} color={portalPalette.text} />
          <Text style={styles.mapLabelText}>Vista previa de la ruta seleccionada</Text>
        </View>
        {selectedSavedRoute ? (
          <Suspense fallback={<View style={styles.mapFallback}><Text style={styles.mapFallbackText}>Cargando vista previa...</Text></View>}>
            {children}
          </Suspense>
        ) : (
          <EmptyState icon="map-search-outline" title="Selecciona una ruta" description="La geometría aparecerá aquí." />
        )}
      </View>
      {selectedSavedRoute ? (
        <View style={styles.mapActionBar}>
          <View style={styles.mapRouteIdentity}>
            <View style={styles.mapRouteIcon}>
              <MaterialCommunityIcons name="routes" size={22} color={portalPalette.accent} />
            </View>
            <View style={styles.routeBody}>
              <Text numberOfLines={1} style={styles.mapRouteName}>{selectedSavedRoute.name}</Text>
              <Text numberOfLines={1} style={styles.mapRoutePath}>{selectedSavedRoute.originLabel || 'Origen'} → {selectedSavedRoute.destinationLabel || 'Destino'}</Text>
            </View>
          </View>
          <View style={styles.mapStats}>
            <View><Text style={styles.statValue}>{((selectedSavedRoute.distanceMeters || 0) / 1000).toFixed(1)} km</Text><Text style={styles.statLabel}>Distancia</Text></View>
            <View><Text style={styles.statValue}>{selectedSavedRoute.stops?.length || 0}</Text><Text style={styles.statLabel}>Checkpoints</Text></View>
            <View><Text style={styles.statValue}>{Math.round((selectedSavedRoute.durationSeconds || 0) / 60)} min</Text><Text style={styles.statLabel}>Duración</Text></View>
          </View>
          <View style={styles.mapActions}>
            <PortalButton onPress={onEditRoute} size="sm" variant="secondary">Editar catálogo</PortalButton>
          </View>
          <View style={{ alignItems: 'flex-start', backgroundColor: portalPalette.infoSoft, borderColor: portalPalette.line, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10, width: '100%' }}>
            <MaterialCommunityIcons name="information-outline" size={17} color={portalPalette.info} />
            <Text style={[styles.mapRoutePath, { flex: 1 }]}>
              Crea la asignación en el panel inferior. La vista previa ya no sobrescribe directamente la ruta de la unidad.
            </Text>
          </View>
        </View>
      ) : null}
    </>
  );
}
