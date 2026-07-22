import { Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { EmptyState } from '@/src/components/ui/empty-state';
import { RouteGeometryThumbnail } from '../../components/route-geometry-thumbnail';
import { palette } from '@/constants/theme';
import { portalPalette } from '../../portal-theme';
import { styles } from '../routes.styles';
import type { SavedRoute } from '@/src/types/app';

type RouteCatalogPanelProps = {
  search: string;
  onSearchChange: (value: string) => void;
  filterMode: 'all' | 'assigned' | 'unused';
  onFilterModeChange: (mode: 'all' | 'assigned' | 'unused') => void;
  sortMode: 'recent' | 'name' | 'distance';
  onSortModeChange: (mode: 'recent' | 'name' | 'distance') => void;
  filteredRoutes: SavedRoute[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  onDeleteRoute: (route: SavedRoute) => void;
  savedRoutes: SavedRoute[];
};

export function RouteCatalogPanel({
  search,
  onSearchChange,
  filterMode,
  onFilterModeChange,
  sortMode,
  onSortModeChange,
  filteredRoutes,
  selectedRouteId,
  onSelectRoute,
  onDeleteRoute,
  savedRoutes,
}: RouteCatalogPanelProps) {
  return (
    <View style={styles.catalogPanel}>
      <View style={styles.panelHeading}><Text style={styles.panelTitle}>Rutas disponibles</Text><Text style={styles.panelCount}>{filteredRoutes.length}</Text></View>
      <TextInput accessibilityLabel="Buscar rutas" value={search} onChangeText={onSearchChange} placeholder="Buscar ruta" placeholderTextColor={palette.muted} style={[styles.compactSearch, { borderColor: palette.lineStrong, color: palette.text }]} />
      <View style={styles.compactFilters}>{(['all','assigned','unused'] as const).map((mode) => <Pressable key={mode} onPress={() => onFilterModeChange(mode)} style={[styles.filterChip, filterMode === mode ? styles.filterChipActive : undefined]}><Text style={styles.filterChipText}>{mode === 'all' ? 'Todas' : mode === 'assigned' ? 'Asignadas' : 'Sin uso'}</Text></Pressable>)}</View>
      <View style={styles.compactFilters}>{(['recent','name','distance'] as const).map((mode) => <Pressable key={mode} onPress={() => onSortModeChange(mode)} style={[styles.sortChip, sortMode === mode ? styles.sortChipActive : undefined]}><Text style={styles.sortChipText}>{mode === 'recent' ? 'Recientes' : mode === 'name' ? 'Nombre' : 'Distancia'}</Text></Pressable>)}</View>
      <View style={styles.catalogList}>{filteredRoutes.length ? filteredRoutes.map((route) => <Pressable {...({ className: 'route-catalog-card' } as any)} accessibilityRole="button" accessibilityState={{ selected: selectedRouteId === route.id }} key={route.id} onPress={() => onSelectRoute(route.id)} style={[styles.compactRouteCard, selectedRouteId === route.id ? styles.compactRouteCardActive : undefined]}>
        <View style={styles.compactRouteInfo}><Text numberOfLines={1} style={styles.compactRouteName}>{route.name}</Text><View style={styles.compactMetrics}><Text style={styles.compactMetric}>{((route.distanceMeters || 0) / 1000).toFixed(1)} km</Text><Text style={styles.compactMetric}>{route.stops?.length || 0} paradas</Text></View></View>
        <View style={styles.thumbnailWrap}><RouteGeometryThumbnail color={route.color} polyline={route.polyline} stops={route.stops} /></View>
        <Pressable accessibilityLabel={`Eliminar ruta ${route.name}`} onPress={(event) => { event.stopPropagation(); onDeleteRoute(route); }} style={styles.deleteRouteButton}><MaterialCommunityIcons name="trash-can-outline" size={16} color={portalPalette.danger} /></Pressable>
      </Pressable>) : <EmptyState icon="routes" title={savedRoutes.length ? 'Sin coincidencias' : 'Aún no hay rutas'} description={savedRoutes.length ? 'Ajusta los filtros.' : 'Crea la primera ruta.'} />}</View>
    </View>
  );
}
