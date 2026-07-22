import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { Incident } from '@/src/types/app';
import { formatRelativeTime } from '@/src/utils/format';
import { INCIDENT_TYPE_STYLES, STATUS_STYLES } from '../constants/alerts.constants';
import {
  getIncidentStatusKey,
  getIncidentTypeKey,
  getIncidentUnitLabel,
  getSeverityStyle,
  hasIncidentLocation,
} from '../utils/alerts.utils';
import { AlertBadge } from './AlertBadge';

export function AlertCard({
  canResolve,
  incident,
  onOpenMap,
  onResolve,
  showConnector,
  styles,
  theme,
}: {
  canResolve: boolean;
  incident: Incident;
  onOpenMap: () => void;
  onResolve: () => void;
  showConnector: boolean;
  styles: any;
  theme: any;
}) {
  const typeStyle = INCIDENT_TYPE_STYLES[getIncidentTypeKey(incident)];
  const severityStyle = getSeverityStyle(incident.severity);
  const statusStyle = STATUS_STYLES[getIncidentStatusKey(incident.status)];

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLine}>
        <View style={[styles.timelineDot, { backgroundColor: severityStyle.color }]} />
        {showConnector ? (
          <View style={styles.timelineConnector} />
        ) : null}
      </View>

      <View style={[styles.incidentCard, { borderLeftColor: severityStyle.color }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeIconShell, { backgroundColor: typeStyle.backgroundColor }]}>
            <MaterialCommunityIcons name={typeStyle.icon} size={17} color={typeStyle.color} />
          </View>
          <View style={styles.incidentHeading}>
            <Text style={styles.incidentTitle} numberOfLines={1}>
              {incident.title || 'Incidencia sin titulo'}
            </Text>
            <Text style={styles.incidentTime}>{formatRelativeTime(incident.createdAt)}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.muted} />
        </View>

        <Text style={styles.incidentDesc} numberOfLines={2}>
          {incident.description || 'Sin descripcion disponible.'}
        </Text>

        <View style={styles.incidentMeta}>
          <MaterialCommunityIcons name="account-alert-outline" size={14} color={theme.colors.muted} />
          <Text style={styles.incidentMetaText} numberOfLines={1}>
            {[incident.reporter?.name || 'Reportante no disponible', incident.route?.name || incident.route?.code].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <AlertBadge icon={typeStyle.icon} label={typeStyle.label} visualStyle={typeStyle} />
          <AlertBadge label={statusStyle.label} visualStyle={statusStyle} />
          <AlertBadge label={severityStyle.label} visualStyle={severityStyle} />
          {incident.media.length ? (
            <AlertBadge icon="paperclip" label={`${incident.media.length} ${incident.media.length === 1 ? 'archivo' : 'archivos'}`} visualStyle={INCIDENT_TYPE_STYLES.general} />
          ) : null}
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.incidentMeta}>
            <MaterialCommunityIcons
              name={hasIncidentLocation(incident) ? 'map-marker-check-outline' : 'map-marker-off-outline'}
              size={14}
              color={theme.colors.muted}
            />
            <Text style={styles.incidentMetaText} numberOfLines={1}>
              {hasIncidentLocation(incident)
                ? `${getIncidentUnitLabel(incident)} · GPS${Number.isFinite(Number(incident.location?.accuracy)) ? ` ±${Math.round(Number(incident.location?.accuracy))} m` : ''}${incident.location?.timestamp ? ` · ${formatRelativeTime(incident.location.timestamp)}` : ''}`
                : incident.locationState === 'stale'
                  ? `${getIncidentUnitLabel(incident)} · GPS vencido${incident.locationSourceTimestamp ? ` · ${formatRelativeTime(incident.locationSourceTimestamp)}` : ''}`
                  : `${getIncidentUnitLabel(incident)} · Sin ubicacion GPS`}
            </Text>
          </View>
          {hasIncidentLocation(incident) ? (
            <Pressable
              accessibilityLabel={`Abrir ubicacion de ${incident.title}`}
              accessibilityRole="button"
              onPress={onOpenMap}
              style={styles.mapButton}>
              <MaterialCommunityIcons
                name="map-marker-radius-outline"
                size={14}
                color={theme.colors.info}
              />
              <Text style={styles.mapLink}>Mapa</Text>
            </Pressable>
          ) : null}
          {canResolve ? (
            <Pressable
              accessibilityLabel={`Marcar resuelta ${incident.title}`}
              accessibilityRole="button"
              onPress={onResolve}
              style={styles.resolveButton}>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={14}
                color={theme.colors.success}
              />
              <Text style={styles.resolveLink}>Resolver</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
