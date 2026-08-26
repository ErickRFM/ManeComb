import { Pressable, Text, View } from 'react-native';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { RouteSession, Vehicle } from '@/src/types/app';
import { formatGpsAge, type OperationalUnitSnapshot } from '@shared/operational-contract';
import { styles } from '../dashboard.styles';
import { getVehicleStatus, getRouteInfo } from '../dashboard.utils';

export function OperationalUnitCard({
  active,
  activeSession,
  onOpen,
  operationalUnit,
  vehicle,
}: {
  active: boolean;
  activeSession: RouteSession | null;
  onOpen: () => void;
  operationalUnit?: OperationalUnitSnapshot;
  vehicle: Vehicle;
}) {
  const status = getVehicleStatus(vehicle, operationalUnit);
  // La tarjeta es una proyeccion ACTUAL. Una jornada terminada pertenece al
  // historial y nunca vuelve a entrar aqui como fallback de autoridad.
  const routeInfo = getRouteInfo(vehicle, activeSession);
  // Presenta la taxonomia canonica del backend. Una unidad que jamas reporto no
  // esta averiada: esta esperando su primer paquete.
  const connectionState = operationalUnit?.gps.connectionState || 'never_reported';
  const gpsAge = formatGpsAge(operationalUnit?.gps.ageSeconds ?? null);
  const gpsMessage = connectionState === 'never_reported'
    ? 'Esperando primera ubicación'
    : connectionState === 'live'
      ? null
      : gpsAge
        ? `Sin señal: última posición ${gpsAge}`
        : 'Sin señal: mostrando última posición';
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
