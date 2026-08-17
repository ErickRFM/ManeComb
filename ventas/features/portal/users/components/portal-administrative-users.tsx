import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { User } from '@/src/types/app';
import { formatDate, formatRole } from '@/src/utils/format';
import { PortalSectionCard, formatPortalStatus, getPortalStatusTone } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { PortalPagination } from '../../components/portal-pagination';
import { styles } from '../users.styles';

const PAGE_SIZE = 8;

export function PortalAdministrativeUsers({
  canManageUsers,
  onDelete,
  onEdit,
  users,
}: {
  canManageUsers: boolean;
  onDelete: (user: User) => void;
  onEdit: (user: User) => void;
  users: User[];
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleUsers = users.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <PortalSectionCard
      title="Usuarios de gestión"
      subtitle={`${users.length} ${users.length === 1 ? 'usuario de gestión' : 'usuarios de gestión'}`}>
      {users.length ? (
        <>
          <PortalDataList>
            {visibleUsers.map((item) => (
              <PortalDataRow key={item.id} leading={<View style={[styles.avatar, { backgroundColor: palette.accentSoft }]}>
                  <Text style={[styles.avatarText, { color: palette.accent }]}>{item.avatar && !item.avatar.startsWith('http') ? item.avatar : item.name.slice(0, 2)}</Text>
                </View>} body={<>
                  <Text style={[styles.userName, { color: palette.text }]}>{item.name}</Text>
                  <Text style={[styles.userMeta, { color: palette.muted }]} numberOfLines={1}>
                    {item.email} · {item.accountType === 'company_owner' && item.role === 'owner' ? 'Owner' : formatRole(item.role)} · Último acceso: {formatDate(item.lastAccessAt, { fallback: 'Sin acceso' })}
                  </Text>
                </>} meta={<StatusBadge label={formatPortalStatus(item.userStatus || 'active')} tone={getPortalStatusTone(item.userStatus)} />} actions={<View style={styles.rowActions}>
                  {canManageUsers && item.role !== 'owner' ? (
                    <>
                      <PortalButton accessibilityLabel={`Editar ${item.name}`} icon="pencil-outline" onPress={() => onEdit(item)} size="sm" variant="icon" />
                      <PortalButton accessibilityLabel={`Eliminar ${item.name}`} icon="trash-can-outline" onPress={() => onDelete(item)} size="sm" variant="danger" />
                    </>
                  ) : null}
                </View>} />
            ))}
          </PortalDataList>
          <PortalPagination
            itemLabel="usuarios"
            onPageChange={setPage}
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={users.length}
          />
        </>
      ) : (
        <EmptyState
          icon="account-group-outline"
          title="Sin usuarios de gestión"
          description="No hay usuarios de gestión adicionales registrados en esta cuenta."
        />
      )}
    </PortalSectionCard>
  );
}
