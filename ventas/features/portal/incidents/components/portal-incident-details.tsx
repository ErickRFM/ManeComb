import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Linking, Pressable, Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { Incident } from '@/src/types/app';
import { formatDate } from '@/src/utils/format';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { styles } from '../incidents.styles';
import { formatIncidentType, getSeverityMeta, getStatusMeta } from '../incidents.utils';

type PortalIncidentDetailsProps = {
  canManage: boolean;
  incident: Incident;
  message: string | null;
  onChangeStatus: (incident: Incident) => void;
  onClose: () => void;
};

export function PortalIncidentDetails({
  canManage,
  incident,
  message,
  onChangeStatus,
  onClose,
}: PortalIncidentDetailsProps) {
  const status = getStatusMeta(incident.status);
  const severity = getSeverityMeta(incident.severity);

  return (
    <PortalSectionCard
      title={incident.title}
      subtitle={message || `${incident.type} · ${formatDate(incident.createdAt, { fallback: '' })}`}
      right={<PortalButton accessibilityLabel="Cerrar detalle" icon="close" onPress={onClose} size="sm" variant="icon" />}>
      <View style={styles.detailGrid}>
        <View style={styles.detailField}>
          <Text style={styles.detailLabel}>Estado</Text>
          <StatusBadge label={status.label} tone={status.tone} />
        </View>
        <View style={styles.detailField}>
          <Text style={styles.detailLabel}>Prioridad</Text>
          <StatusBadge label={severity.label} tone={severity.tone} />
        </View>
        <View style={styles.detailField}>
          <Text style={styles.detailLabel}>Tipo</Text>
          <Text style={[styles.detailValue, { color: palette.text }]}>{formatIncidentType(incident.type)}</Text>
        </View>
        <View style={styles.detailField}>
          <Text style={styles.detailLabel}>Reportado por</Text>
          <Text style={[styles.detailValue, { color: palette.text }]}>{incident.reporter?.name || 'Conductor no disponible'}</Text>
        </View>
        {incident.vehicleId ? (
          <View style={styles.detailField}>
            <Text style={styles.detailLabel}>Unidad</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>{incident.vehicle?.code || 'Unidad no disponible'}</Text>
          </View>
        ) : null}
        {incident.location ? (
          <View style={styles.detailField}>
            <Text style={styles.detailLabel}>Ubicación</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>
              {incident.location.latitude.toFixed(5)}, {incident.location.longitude.toFixed(5)}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.detailDescription, { color: palette.text }]}>{incident.description}</Text>
      {incident.media?.length ? (
        <View style={styles.mediaRow}>
          {incident.media.map((url, idx) => (
            <Pressable
              key={`${url}:${idx}`}
              accessibilityRole="button"
              accessibilityLabel={`Abrir evidencia ${idx + 1} de ${incident.media.length}`}
              onPress={() => void Linking.openURL(url)}
              style={[styles.mediaThumb, { backgroundColor: palette.surfaceAlt }]}>
              <MaterialCommunityIcons name="image" size={20} color={palette.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {canManage && incident.status !== 'resolved' ? (
        <PortalButton icon="pencil-outline" onPress={() => onChangeStatus(incident)} size="sm">Cambiar estado</PortalButton>
      ) : null}
    </PortalSectionCard>
  );
}
