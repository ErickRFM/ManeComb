import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { RouteSession, User, Vehicle } from '@/src/types/app';
import { statusFilters } from '../dashboard.constants';
import { styles } from '../dashboard.styles';
import type { Filters } from '../dashboard.types';
import { getRouteLabel } from '../dashboard.utils';
import { portalPalette } from '../../portal-theme';
import { formatPortalStatus } from '../../components/portal-cards';

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.filterChip, active ? styles.filterChipActive : undefined]}>
      <Text style={styles.filterChipText}>{label}</Text>
    </Pressable>
  );
}

export function HistoryFilters({
  filters,
  onChange,
  sessions,
  users,
  vehicles,
}: {
  filters: Filters;
  onChange: <T extends keyof Filters>(field: T, value: Filters[T]) => void;
  sessions: RouteSession[];
  users: User[];
  vehicles: Vehicle[];
}) {
  const [expanded, setExpanded] = useState(false);
  const drivers = users.filter((user) => user.role === 'driver');
  const routes = Array.from(new Set(sessions.map((session) => session.routeId).filter(Boolean)))
    .map((routeId) => ({
      id: routeId,
      label: getRouteLabel(vehicles.find((vehicle) => vehicle.routeId === routeId), sessions.find((session) => session.routeId === routeId)),
    }))
    .filter((route) => route.label !== 'Sin ruta asignada');
  const advancedCount = [filters.driverId, filters.routeId, filters.productivity].filter(Boolean).length;
  return (
    <View style={styles.filters}>
      <View style={styles.optionRow}>
        <FilterChip label="Todas" active={!filters.vehicleId} onPress={() => onChange('vehicleId', '')} />
        {vehicles.map((vehicle) => (
          <FilterChip key={vehicle.id} label={vehicle.code} active={filters.vehicleId === vehicle.id} onPress={() => onChange('vehicleId', vehicle.id)} />
        ))}
        <View style={styles.filterSeparator} />
        {statusFilters.map((status) => (
          <FilterChip
            key={status}
            label={status === 'ALL' ? 'Todos' : formatPortalStatus(status)}
            active={filters.status === status}
            onPress={() => onChange('status', status)}
          />
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setExpanded((current) => !current)} style={styles.filterToggle}>
        <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={portalPalette.muted} />
        <Text style={styles.filterToggleText}>
          {expanded ? 'Menos filtros' : advancedCount ? `Más filtros (${advancedCount})` : 'Más filtros'}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.filters}>
          {drivers.length ? (
            <View style={styles.optionRow}>
              <FilterChip label="Todos los choferes" active={!filters.driverId} onPress={() => onChange('driverId', '')} />
              {drivers.map((driver) => (
                <FilterChip key={driver.id} label={driver.name} active={filters.driverId === driver.id} onPress={() => onChange('driverId', driver.id)} />
              ))}
            </View>
          ) : null}
          {routes.length ? (
            <View style={styles.optionRow}>
              <FilterChip label="Todas las rutas" active={!filters.routeId} onPress={() => onChange('routeId', '')} />
              {routes.map((route) => (
                <FilterChip key={route.id} label={route.label} active={filters.routeId === route.id} onPress={() => onChange('routeId', route.id)} />
              ))}
            </View>
          ) : null}
          <View style={styles.formRow}>
            <TextInput
              value={filters.productivity}
              onChangeText={(value) => onChange('productivity', value.replace(/[^0-9.]/g, ''))}
              placeholder="Productividad minima"
              placeholderTextColor={portalPalette.muted}
              style={styles.filterInput}
            />
            <Text style={styles.factLabel}>Ordenar por</Text>
            {(['time', 'distance', 'laps'] as const).map((sortBy) => (
              <FilterChip
                key={sortBy}
                label={sortBy === 'time' ? 'Tiempo' : sortBy === 'distance' ? 'Distancia' : 'Vueltas'}
                active={filters.sortBy === sortBy}
                onPress={() => onChange('sortBy', sortBy)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
