import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { EmptyState } from '@/src/components/ui/empty-state';
import type { Vehicle } from '@/src/types/app';
import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import { formatDate } from '@/src/utils/format';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { palette } from '@/constants/theme';
import { styles } from '../units.styles';
import { getKilometersLabel, getMaintenanceInfo, getUnitStatus } from '../units.utils';

type PortalUnitsListProps = {
  canManageUnits: boolean;
  onContinueToRoutes: () => void;
  onDelete: (vehicle: Vehicle) => void;
  onEdit: (vehicle: Vehicle) => void;
  operationalUnits: OperationalUnitSnapshot[];
  vehicles: Vehicle[];
};

export function PortalUnitsList({
  canManageUnits,
  onContinueToRoutes,
  onDelete,
  onEdit,
  operationalUnits,
  vehicles,
}: PortalUnitsListProps) {
  const unitByVehicleId = new Map(operationalUnits.map((unit) => [unit.unitId, unit]));
  return (
    <PortalSectionCard
      title="Unidades registradas"
      subtitle={`${vehicles.length} ${vehicles.length === 1 ? 'unidad visible' : 'unidades visibles'}`}
      right={vehicles.length && canManageUnits ? (
        <PortalButton onPress={onContinueToRoutes} variant="secondary">Continuar a rutas</PortalButton>
      ) : undefined}>
      {vehicles.length ? (
        <PortalDataList>
          {vehicles.map((vehicle) => {
            const unit = unitByVehicleId.get(vehicle.id);
            const status = getUnitStatus(vehicle);
            const retired = Boolean(vehicle.retiredAt);
            const routeLabel = vehicle.assignedRoute
              ? `${vehicle.assignedRoute.originLabel || 'Origen'} → ${vehicle.assignedRoute.destinationLabel || 'Destino'}`
              : null;
            const maintenance = getMaintenanceInfo(vehicle);

            return (
              <PortalDataRow
                key={vehicle.id}
                leading={
                  <View style={[styles.unitIcon, { backgroundColor: palette.surfaceAlt }]}>
                    <MaterialCommunityIcons
                      name={retired ? 'archive-outline' : 'bus'}
                      size={21}
                      color={retired ? palette.muted : palette.accent}
                    />
                  </View>
                }
                body={
                  <>
                    <Text style={[styles.unitName, { color: palette.text }]}>{vehicle.code}</Text>
                    <Text style={[styles.unitMeta, { color: palette.muted }]}>
                      {vehicle.plate} · {getKilometersLabel(vehicle.currentKilometers)}
                    </Text>
                    <Text style={[styles.unitMeta, { color: palette.muted }]}>
                      Conductor: {unit?.driver?.name || 'Sin conductor'}
                    </Text>
                    {routeLabel ? (
                      <Text style={[styles.unitMeta, { color: palette.muted }]} numberOfLines={1}>
                        Ruta: {routeLabel}
                      </Text>
                    ) : null}
                    {unit?.gps.recordedAt ? (
                      <Text style={[styles.unitMeta, { color: palette.muted }]}>
                        Última actividad: {formatDate(unit.gps.recordedAt, { fallback: 'Sin registro' })}
                      </Text>
                    ) : null}
                    {retired ? (
                      <Text style={[styles.unitMeta, { color: palette.warning }]}>
                        Retirada: {formatDate(vehicle.retiredAt, { fallback: 'Sin fecha' })}. El historial permanece disponible.
                      </Text>
                    ) : maintenance ? (
                      <View style={[styles.maintenanceRow, { borderColor: maintenance.overdue ? palette.dangerSoft : palette.line }]}>
                        <MaterialCommunityIcons
                          name={maintenance.overdue ? 'alert-circle-outline' : 'wrench-outline'}
                          size={14}
                          color={maintenance.overdue ? palette.danger : palette.muted}
                        />
                        <Text style={[styles.unitMeta, { color: maintenance.overdue ? palette.danger : palette.muted }]}>
                          {maintenance.overdue
                            ? `Mantenimiento vencido (${maintenance.kmRemaining.toLocaleString('es-MX')} km excedidos)`
                            : `Próximo mantenimiento: ${maintenance.kmRemaining.toLocaleString('es-MX')} km`}
                        </Text>
                      </View>
                    ) : null}
                  </>
                }
                meta={<StatusBadge label={status.label} tone={status.tone} />}
                actions={canManageUnits && !retired ? (
                  <View style={styles.rowActions}>
                    <PortalButton
                      accessibilityLabel={`Editar unidad ${vehicle.code}`}
                      onPress={() => onEdit(vehicle)}
                      icon="pencil-outline"
                      size="sm"
                      variant="icon"
                    />
                    <PortalButton
                      accessibilityLabel={`Revisar retiro o eliminación de unidad ${vehicle.code}`}
                      onPress={() => onDelete(vehicle)}
                      icon="archive-arrow-down-outline"
                      size="sm"
                      variant="danger"
                    />
                  </View>
                ) : undefined}
              />
            );
          })}
        </PortalDataList>
      ) : (
        <EmptyState
          icon="bus-alert"
          title="Sin unidades registradas"
          description="Crea la primera unidad real de la empresa antes de asignar conductores o rutas."
        />
      )}
    </PortalSectionCard>
  );
}
