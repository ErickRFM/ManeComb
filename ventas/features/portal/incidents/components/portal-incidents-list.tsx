import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { Incident } from '@/src/types/app';
import { formatDate } from '@/src/utils/format';
import { PortalSectionCard } from '../../cards';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { incidentFilterStatuses } from '../incidents.constants';
import { styles } from '../incidents.styles';
import { getSeverityMeta, getStatusMeta, getTypeIcon } from '../incidents.utils';

type PortalIncidentsListProps = {
  filterStatus: string;
  incidents: Incident[];
  message: string | null;
  onFilterChange: (status: string) => void;
  onSelect: (incident: Incident) => void;
};

export function PortalIncidentsList({
  filterStatus,
  incidents,
  message,
  onFilterChange,
  onSelect,
}: PortalIncidentsListProps) {
  return (
    <PortalSectionCard title="Incidencias" subtitle={message || `${incidents.length} registro${incidents.length === 1 ? '' : 's'}`}>
      <View style={styles.filterRow}>
        {incidentFilterStatuses.map((status) => (
          <Pressable
            key={status}
            accessibilityRole="button"
            onPress={() => onFilterChange(status)}
            style={[styles.filterChip, filterStatus === status ? styles.filterChipActive : undefined]}>
            <Text style={[styles.filterChipText, filterStatus === status ? styles.filterChipTextActive : undefined]}>
              {status ? getStatusMeta(status).label : 'Todos'}
            </Text>
          </Pressable>
        ))}
      </View>

      {incidents.length ? (
        <PortalDataList>
          {incidents.map((incident) => {
            const status = getStatusMeta(incident.status);
            const severity = getSeverityMeta(incident.severity);
            return (
              <PortalDataRow
                key={incident.id}
                onPress={() => onSelect(incident)}
                leading={<View style={[styles.incIcon, { backgroundColor: incident.severity === 'critical' ? palette.dangerSoft : palette.surfaceAlt }]}>
                  <MaterialCommunityIcons name={getTypeIcon(incident.type)} size={20} color={incident.severity === 'critical' ? palette.danger : palette.accent} />
                </View>}
                body={<>
                  <Text style={[styles.incTitle, { color: palette.text }]}>{incident.title}</Text>
                  <Text style={[styles.incMeta, { color: palette.muted }]} numberOfLines={1}>
                    {incident.type} · {incident.vehicle?.code || incident.vehicleId || 'Sin unidad'} · {formatDate(incident.createdAt, { fallback: '' })}
                  </Text>
                </>}
                meta={<View style={styles.incBadges}>
                  <StatusBadge label={incident.severity === 'critical' ? 'SOS' : severity.label} tone={severity.tone} />
                  <StatusBadge label={status.label} tone={status.tone} />
                </View>}
              />
            );
          })}
        </PortalDataList>
      ) : (
        <EmptyState icon="alert-circle-outline" title="Sin incidencias" description="No hay incidencias registradas." />
      )}
    </PortalSectionCard>
  );
}
