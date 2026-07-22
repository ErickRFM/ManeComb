import { Pressable, Text, View } from 'react-native';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { RouteSession, Vehicle } from '@/src/types/app';
import { styles } from '../dashboard.styles';
import { getVehicleStatus, getRouteInfo } from '../dashboard.utils';

export function OperationalUnitCard({
  active,
  activeSession,
  latestSession,
  onOpen,
  vehicle,
}: {
  active: boolean;
  activeSession: RouteSession | null;
  latestSession: RouteSession | null;
  onOpen: () => void;
  vehicle: Vehicle;
}) {
  const session = activeSession || latestSession;
  const status = getVehicleStatus(vehicle, activeSession);
  const routeInfo = getRouteInfo(vehicle, session);
  const hasKnownPosition = Boolean(vehicle.location);
  const gpsMessage = !hasKnownPosition
    ? 'Sin GPS: nunca reportó una posición'
    : vehicle.gpsFreshness?.state === 'stale' || vehicle.gpsFreshness?.state === 'missing'
      ? 'Sin señal: mostrando última posición'
      : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver ${vehicle.code}`}
      onPress={onOpen}
      style={({ hovered, pressed }: any) => [styles.unitCard, active ? styles.unitCardActive : undefined, hovered ? styles.unitCardHover : undefined, pressed ? styles.controlPressed : undefined]}>
      <View style={styles.unitHeader}>
        <View style={styles.flex}>
          <Text style={styles.unitCode}>{vehicle.code}</Text>
          <Text {...({ title: routeInfo.label } as any)} style={styles.unitMeta} numberOfLines={2}>{vehicle.plate} · {routeInfo.label}</Text>
          {gpsMessage ? <Text style={styles.unitGpsMessage} numberOfLines={1}>{gpsMessage}</Text> : null}
        </View>
        <StatusBadge label={status.label} tone={status.tone} />
      </View>
    </Pressable>
  );
}
