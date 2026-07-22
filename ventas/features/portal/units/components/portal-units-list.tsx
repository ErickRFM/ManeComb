import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { Vehicle } from '@/src/types/app';
import { formatDate } from '@/src/utils/format';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { styles } from '../units.styles';
import { getKilometersLabel, getMaintenanceInfo, getUnitStatus } from '../units.utils';

type PortalUnitsListProps = {
  canManageUnits: boolean;
  onContinueToRoutes: () => void;
  onDelete: (vehicle: Vehicle) => void;
  onEdit: (vehicle: Vehicle) => void;
  vehicles: Vehicle[];
};

export function PortalUnitsList({
  canManageUnits,
  onContinueToRoutes,
  onDelete,
  onEdit,
  vehicles,
}: PortalUnitsListProps) {
  return (
    <PortalSectionCard
      title="Unidades registradas"
      subtitle={`${vehicles.length} ${vehicles.length === 1 ? 'unidad real' : 'unidades reales'}`}
      right={vehicles.length && canManageUnits ? (
        <PortalButton onPress={onContinueToRoutes} variant="secondary">Continuar a rutas</PortalButton>
      ) : undefined}>
      {vehicles.length ? (
        <PortalDataList>
          {vehicles.map((vehicle) => {
            const status = getUnitStatus(vehicle);
            const routeLabel = vehicle.assignedRoute
              ? `${vehicle.assignedRoute.originLabel || 'Origen'} -> ${vehicle.assignedRoute.destinationLabel || 'Destino'}`
              : null;
            const maintenance = getMaintenanceInfo(vehicle);

            return (
              <PortalDataRow
                key={vehicle.id}
                leading={<View style={[styles.unitIcon, { backgroundColor: palette.surfaceAlt }]}>
                  <MaterialCommunityIcons name="bus" size={21} color={palette.accent} />
                </View>}
                body={<>
                  <Text style={[styles.unitName, { color: palette.text }]}>{vehicle.code}</Text>
                  <Text style={[styles.unitMeta, { color: palette.muted }]}>
                    {vehicle.plate} · {getKilometersLabel(vehicle.currentKilometers)}
                  </Text>
                  <Text style={[styles.unitMeta, { color: palette.muted }]}>
                    Conductor: {vehicle.driver?.name || vehicle.driverName || 'Sin conductor'}
                  </Text>
                  {routeLabel ? (
                    <Text style={[styles.unitMeta, { color: palette.muted }]} numberOfLines={1}>
                      Ruta: {routeLabel}
                    </Text>
                  ) : null}
                  {vehicle.locationTimestamp ? (
                    <Text style={[styles.unitMeta, { color: palette.muted }]}>
                      Última actividad: {formatDate(vehicle.locationTimestamp, { fallback: 'Sin registro' })}
                    </Text>
                  ) : null}
                  {maintenance ? (
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
                </>}
                meta={<StatusBadge label={status.label} tone={status.tone} />}
                actions={canManageUnits ? <View style={styles.rowActions}>
                  <PortalButton
                    accessibilityLabel={`Editar unidad ${vehicle.code}`}
                    onPress={() => onEdit(vehicle)}
                    icon="pencil-outline"
                    size="sm"
                    variant="icon"
                  />
                  <PortalButton
                    accessibilityLabel={`Eliminar unidad ${vehicle.code}`}
                    onPress={() => onDelete(vehicle)}
                    icon="trash-can-outline"
                    size="sm"
                    variant="danger"
                  />
                </View> : undefined}
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
