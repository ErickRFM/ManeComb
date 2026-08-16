import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { EmptyState } from '@/src/components/ui/empty-state';
import type { Vehicle } from '@/src/types/app';
import { formatDate } from '@/src/utils/format';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { PortalPagination } from '../../components/portal-pagination';
import { palette } from '@/constants/theme';
import { styles } from '../units.styles';
import { getKilometersLabel, getMaintenanceInfo, getUnitStatus } from '../units.utils';

const PAGE_SIZE = 8;

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
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(vehicles.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleVehicles = vehicles.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [vehicles]);

  return (
    <PortalSectionCard
      title="Unidades registradas"
      subtitle={`${vehicles.length} ${vehicles.length === 1 ? 'unidad visible' : 'unidades visibles'}`}
      right={vehicles.length && canManageUnits ? (
        <PortalButton onPress={onContinueToRoutes} variant="secondary">Continuar a rutas</PortalButton>
      ) : undefined}>
      {vehicles.length ? (
        <>
          <PortalDataList>
            {visibleVehicles.map((vehicle) => {
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
                        {vehicle.plate} · {getKilometersLabel(vehicle.currentKilometers)} · {vehicle.driver?.name || vehicle.driverName || 'Sin conductor'}
                      </Text>
                      {routeLabel ? (
                        <Text style={[styles.unitMeta, { color: palette.muted }]} numberOfLines={1}>
                          Ruta: {routeLabel}
                        </Text>
                      ) : vehicle.locationTimestamp ? (
                        <Text style={[styles.unitMeta, { color: palette.muted }]} numberOfLines={1}>
                          Última actividad: {formatDate(vehicle.locationTimestamp, { fallback: 'Sin registro' })}
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
          <PortalPagination
            itemLabel="unidades"
            onPageChange={setPage}
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={vehicles.length}
          />
        </>
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
