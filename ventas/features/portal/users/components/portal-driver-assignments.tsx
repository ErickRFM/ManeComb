import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from '@/src/navigation/router';
import { palette } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { User, Vehicle } from '@/src/types/app';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { PortalPagination } from '../../components/portal-pagination';
import { styles } from '../users.styles';

const PAGE_SIZE = 6;

function formatLastAccess(value?: string | null) {
  if (!value) return 'Sin acceso';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Sin acceso' : parsed.toLocaleString('es-MX');
}

export function PortalDriverAssignments({
  drivers,
  isSubmitting,
  onManage,
  vehicles,
}: {
  drivers: User[];
  isSubmitting: boolean;
  onManage: (driver: User) => void;
  vehicles: Vehicle[];
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(drivers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleDrivers = drivers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <PortalSectionCard title="Conductores" subtitle={`${drivers.length} perfiles vinculados a la empresa`}>
      {drivers.length ? (
        <>
          <PortalDataList>
            {visibleDrivers.map((driver) => {
              const assignedVehicle = vehicles.find((vehicle) => vehicle.id === driver.vehicleId);

              return (
                <PortalDataRow
                  key={driver.id}
                  body={
                    <View style={{ gap: 4 }}>
                      <Text style={[styles.userName, { color: palette.text }]}>{driver.name}</Text>
                      <Text style={[styles.userMeta, { color: palette.muted }]} numberOfLines={1}>
                        {driver.email} · {driver.phone || 'Sin teléfono'}
                      </Text>
                      <Text style={[styles.userMeta, { color: palette.muted }]} numberOfLines={1}>
                        {assignedVehicle?.code || 'Sin unidad'} · {driver.shift || 'Sin turno'} · Último acceso: {formatLastAccess(driver.lastAccessAt)}
                      </Text>
                    </View>
                  }
                  meta={
                    <StatusBadge
                      label={driver.userStatus === 'suspended' ? 'Dado de baja' : 'Activo'}
                      tone={driver.userStatus === 'suspended' ? 'warning' : 'positive'}
                    />
                  }
                  actions={
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <PortalButton
                        accessibilityLabel={`Ver documentos de ${driver.name}`}
                        icon="file-document-multiple-outline"
                        onPress={() => router.push('/portal/documentos' as never)}
                        size="sm"
                        variant="icon"
                      />
                      <PortalButton
                        accessibilityLabel={`Administrar a ${driver.name}`}
                        disabled={isSubmitting}
                        icon="account-cog-outline"
                        onPress={() => onManage(driver)}
                        size="sm"
                        variant="icon"
                      />
                    </View>
                  }
                />
              );
            })}
          </PortalDataList>
          <PortalPagination
            itemLabel="conductores"
            onPageChange={setPage}
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={drivers.length}
          />
        </>
      ) : (
        <EmptyState
          icon="account-hard-hat-outline"
          title="Sin conductores activados"
          description="Genera una key de activación para que el conductor cree su cuenta y elija una unidad disponible de la empresa."
        />
      )}
    </PortalSectionCard>
  );
}
