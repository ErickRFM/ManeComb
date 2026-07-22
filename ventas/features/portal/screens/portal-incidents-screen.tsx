import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, palette, Typography } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { formatDate } from '@/src/utils/format';
import { PortalSectionCard } from '../cards';
import { PortalLayout } from '../components/portal-layout';
import { PortalDataList, PortalDataRow } from '../components/portal-data-list';
import { PortalButton } from '../components/portal-button';
import { portalButtonGradient, portalPalette } from '../portal-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { usePortalStore } from '../store/use-portal-store';
import type { Incident } from '@/src/types/app';

function getSeverityMeta(severity: string) {
  if (severity === 'critical') return { label: 'Crítica', tone: 'danger' as const };
  if (severity === 'high') return { label: 'Alta', tone: 'warning' as const };
  if (severity === 'medium') return { label: 'Media', tone: 'neutral' as const };
  return { label: 'Baja', tone: 'positive' as const };
}

function getStatusMeta(status: string) {
  if (status === 'resolved') return { label: 'Resuelto', tone: 'positive' as const };
  if (status === 'in_progress') return { label: 'En proceso', tone: 'warning' as const };
  return { label: 'Abierto', tone: 'danger' as const };
}

function getTypeIcon(type: string) {
  if (/accident|choque|colision/i.test(type)) return 'car-crash';
  if (/mecanic|falla|descompostura/i.test(type)) return 'engine-outline';
  if (/cliente|queja|reclamo/i.test(type)) return 'account-alert-outline';
  if (/seguridad|robo|asalto/i.test(type)) return 'shield-alert-outline';
  return 'alert-circle-outline';
}

export function PortalIncidentsScreen() {
  const { user } = useAppStore(
    useShallow((state) => ({
      user: state.user,
    }))
  );
  const { incidents, isSubmitting, loadIncidents, updateIncidentStatus } = usePortalStore(
    useShallow((state) => ({
      incidents: state.incidents,
      isSubmitting: state.isSubmitting,
      loadIncidents: state.loadIncidents,
      updateIncidentStatus: state.updateIncidentStatus,
    }))
  );
  const canManage = Boolean(user && ['owner', 'admin', 'supervisor'].includes(user.role));
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [detailTarget, setDetailTarget] = useState<Incident | null>(null);
  const [statusTarget, setStatusTarget] = useState<Incident | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('open');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  const filtered = useMemo(() => {
    if (!filterStatus) return incidents;
    return incidents.filter((i) => i.status === filterStatus);
  }, [incidents, filterStatus]);

  const handleStatusChange = async () => {
    if (!statusTarget) return;
    const result = await updateIncidentStatus(statusTarget.id, selectedStatus as 'open' | 'in_progress' | 'resolved');
    setMessage(result.ok ? 'Estado actualizado.' : result.message || 'No fue posible actualizar.');
    if (result.ok) setStatusTarget(null);
  };

  const detail = detailTarget;

  return (
    <PortalLayout title="Incidencias" subtitle="Reportes operativos, SOS y gestión de eventos.">
      {canManage ? (
        <View style={[styles.contextNotice, { backgroundColor: palette.infoSoft, borderColor: palette.line }]}>
          <View style={[styles.contextIcon, { backgroundColor: palette.surfaceAlt }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={palette.info} />
          </View>
          <View style={styles.contextCopy}>
            <Text style={[styles.contextTitle, { color: palette.text }]}>Gestión de incidencias</Text>
            <Text style={[styles.contextText, { color: palette.muted }]}>
              Revisa, da seguimiento y cierra las incidencias reportadas durante las operaciones.
            </Text>
          </View>
        </View>
      ) : null}

      {detail ? (
        <PortalSectionCard
          title={detail.title}
          subtitle={message || `${detail.type} · ${formatDate(detail.createdAt, { fallback: '' })}`}
          right={
            <PortalButton accessibilityLabel="Cerrar detalle" icon="close" onPress={() => setDetailTarget(null)} size="sm" variant="icon" />
          }>
          <View style={styles.detailGrid}>
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>Estado</Text>
              <StatusBadge label={getStatusMeta(detail.status).label} tone={getStatusMeta(detail.status).tone} />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>Prioridad</Text>
              <StatusBadge label={getSeverityMeta(detail.severity).label} tone={getSeverityMeta(detail.severity).tone} />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>Tipo</Text>
              <Text style={[styles.detailValue, { color: palette.text }]}>{detail.type}</Text>
            </View>
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>Reportado por</Text>
              <Text style={[styles.detailValue, { color: palette.text }]}>{detail.reporter?.name || detail.reporterId}</Text>
            </View>
            {detail.vehicleId ? (
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Unidad</Text>
                <Text style={[styles.detailValue, { color: palette.text }]}>{detail.vehicle?.code || detail.vehicleId}</Text>
              </View>
            ) : null}
            {detail.location ? (
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Ubicación</Text>
                <Text style={[styles.detailValue, { color: palette.text }]}>
                  {detail.location.latitude.toFixed(5)}, {detail.location.longitude.toFixed(5)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.detailDescription, { color: palette.text }]}>{detail.description}</Text>
          {detail.media?.length ? (
            <View style={styles.mediaRow}>
              {detail.media.map((url, idx) => (
                <Pressable key={idx} accessibilityRole="button" style={[styles.mediaThumb, { backgroundColor: palette.surfaceAlt }]}>
                  <MaterialCommunityIcons name="image" size={20} color={palette.muted} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {canManage && detail.status !== 'resolved' ? (
            <PortalButton icon="pencil-outline" onPress={() => { setStatusTarget(detail); setSelectedStatus(detail.status); }} size="sm">Cambiar estado</PortalButton>
          ) : null}
        </PortalSectionCard>
      ) : (
        <PortalSectionCard title="Incidencias" subtitle={message || `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`}>
          <View style={styles.filterRow}>
            {['', 'open', 'in_progress', 'resolved'].map((status) => (
              <Pressable
                key={status}
                accessibilityRole="button"
                onPress={() => setFilterStatus(status)}
                style={[styles.filterChip, filterStatus === status ? styles.filterChipActive : undefined]}>
                <Text style={[styles.filterChipText, filterStatus === status ? styles.filterChipTextActive : undefined]}>
                  {status ? getStatusMeta(status).label : 'Todos'}
                </Text>
              </Pressable>
            ))}
          </View>

          {filtered.length ? (
            <PortalDataList>
              {filtered.map((inc) => {
                const sm = getStatusMeta(inc.status);
                const sev = getSeverityMeta(inc.severity);
                return (
                  <PortalDataRow
                    key={inc.id}
                    onPress={() => setDetailTarget(inc)}
                    leading={<View style={[styles.incIcon, { backgroundColor: inc.severity === 'critical' ? palette.dangerSoft : palette.surfaceAlt }]}>
                      <MaterialCommunityIcons name={getTypeIcon(inc.type)} size={20} color={inc.severity === 'critical' ? palette.danger : palette.accent} />
                    </View>}
                    body={<>
                      <Text style={[styles.incTitle, { color: palette.text }]}>{inc.title}</Text>
                      <Text style={[styles.incMeta, { color: palette.muted }]} numberOfLines={1}>
                        {inc.type} · {inc.vehicle?.code || inc.vehicleId || 'Sin unidad'} · {formatDate(inc.createdAt, { fallback: '' })}
                      </Text>
                    </>}
                    meta={<View style={styles.incBadges}>
                      <StatusBadge label={inc.severity === 'critical' ? 'SOS' : sev.label} tone={sev.tone} />
                      <StatusBadge label={sm.label} tone={sm.tone} />
                    </View>}
                  />
                );
              })}
            </PortalDataList>
          ) : (
            <EmptyState icon="alert-circle-outline" title="Sin incidencias" description="No hay incidencias registradas." />
          )}
        </PortalSectionCard>
      )}

      <ConfirmModal
        visible={Boolean(statusTarget)}
        title="Cambiar estado"
        description={statusTarget ? statusTarget.title : ''}
        confirmLabel="Guardar"
        processing={isSubmitting}
        onCancel={() => setStatusTarget(null)}
        onConfirm={handleStatusChange}>
        <View style={styles.statusSelector}>
          {(['open', 'in_progress', 'resolved'] as const).map((status) => (
            <Pressable
              key={status}
              accessibilityRole="button"
              onPress={() => setSelectedStatus(status)}
              style={[
                styles.statusOption,
                { borderColor: selectedStatus === status ? palette.info : palette.line },
                selectedStatus === status ? { backgroundColor: palette.infoSoft } : { backgroundColor: palette.surface },
              ]}>
              <Text style={[styles.statusOptionText, { color: selectedStatus === status ? palette.info : palette.text }]}>
                {getStatusMeta(status).label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ConfirmModal>
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
  contextNotice: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: AppTheme.spacing.md,
  },
  contextIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  contextCopy: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  contextTitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  contextText: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    borderColor: portalPalette.lineStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: portalPalette.accent,
    borderColor: portalPalette.accent,
  },
  filterChipText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  list: {
    gap: 8,
    minWidth: 0,
  },
  incRow: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 0,
    padding: 10,
  },
  incIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  incBody: {
    flex: 1,
    flexBasis: 180,
    gap: 2,
    minWidth: 0,
  },
  incTitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  incMeta: {
    fontFamily: Typography.body,
    fontSize: 11,
    lineHeight: 16,
  },
  incBadges: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 4,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  detailField: {
    flexBasis: 140,
    flexGrow: 1,
    gap: 4,
  },
  detailLabel: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontFamily: Typography.body,
    fontSize: 13,
  },
  detailDescription: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  mediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  mediaThumb: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  actionButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 14,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  iconAction: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  statusSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
    paddingVertical: 8,
  },
  statusOption: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusOptionText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
});
