import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { useAppStore } from '@/src/store/use-app-store';
import type { Incident } from '@/src/types/app';
import { PortalSectionCard } from '../cards';
import { PortalButton } from '../components/portal-button';
import { PortalLayout } from '../components/portal-layout';
import { PortalIncidentDetails } from '../incidents/components/portal-incident-details';
import { PortalIncidentStatusSelector } from '../incidents/components/portal-incident-status-selector';
import { PortalIncidentsContextNotice } from '../incidents/components/portal-incidents-context-notice';
import { PortalIncidentsList } from '../incidents/components/portal-incidents-list';
import { portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';

export function PortalIncidentsScreen() {
  const { user } = useAppStore(
    useShallow((state) => ({ user: state.user }))
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

  const summary = useMemo(() => ({
    total: incidents.length,
    open: incidents.filter((incident) => incident.status === 'open').length,
    inProgress: incidents.filter((incident) => incident.status === 'in_progress').length,
    resolved: incidents.filter((incident) => incident.status === 'resolved').length,
    critical: incidents.filter((incident) => incident.severity === 'critical' && incident.status !== 'resolved').length,
  }), [incidents]);

  const filtered = useMemo(() => {
    if (!filterStatus) return incidents;
    return incidents.filter((incident) => incident.status === filterStatus);
  }, [incidents, filterStatus]);

  const handleStatusChange = async () => {
    if (!statusTarget) return;
    const result = await updateIncidentStatus(statusTarget.id, selectedStatus as 'open' | 'in_progress' | 'resolved');
    setMessage(result.ok ? 'Estado actualizado.' : result.message || 'No fue posible actualizar.');
    if (result.ok) {
      setDetailTarget((current) => current?.id === statusTarget.id ? { ...current, status: selectedStatus as Incident['status'] } : current);
      setStatusTarget(null);
    }
  };

  const summaryItems = [
    { key: '', label: 'Total', value: summary.total, icon: 'alert-circle-outline' as const, color: portalPalette.info },
    { key: 'open', label: 'Abiertas', value: summary.open, icon: 'alert-outline' as const, color: portalPalette.warning },
    { key: 'in_progress', label: 'En atención', value: summary.inProgress, icon: 'progress-wrench' as const, color: portalPalette.accent },
    { key: 'resolved', label: 'Resueltas', value: summary.resolved, icon: 'check-circle-outline' as const, color: portalPalette.success },
  ];

  return (
    <PortalLayout
      title="Incidencias"
      subtitle="Reportes operativos, alertas SOS y seguimiento de resolución."
      actions={<PortalButton icon="refresh" onPress={() => void loadIncidents()} size="sm" variant="secondary">Actualizar</PortalButton>}>
      {canManage ? <PortalIncidentsContextNotice /> : null}

      {!detailTarget ? (
        <PortalSectionCard
          compact
          title="Estado operativo"
          subtitle={summary.critical ? `${summary.critical} alerta${summary.critical === 1 ? '' : 's'} crítica${summary.critical === 1 ? '' : 's'} sin resolver` : 'No hay alertas críticas pendientes.'}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {summaryItems.map((item) => (
              <PortalButton
                key={item.label}
                accessibilityLabel={`Filtrar ${item.label}: ${item.value}`}
                onPress={() => setFilterStatus(item.key)}
                variant={filterStatus === item.key ? 'primary' : 'secondary'}>
                <MaterialCommunityIcons name={item.icon} size={17} color={filterStatus === item.key ? '#FFFFFF' : item.color} />
                <Text style={{ color: filterStatus === item.key ? '#FFFFFF' : portalPalette.text, fontWeight: '800' }}>
                  {item.label} · {item.value}
                </Text>
              </PortalButton>
            ))}
          </View>
        </PortalSectionCard>
      ) : null}

      {detailTarget ? (
        <PortalIncidentDetails
          canManage={canManage}
          incident={detailTarget}
          message={message}
          onChangeStatus={(incident) => {
            setStatusTarget(incident);
            setSelectedStatus(incident.status);
          }}
          onClose={() => setDetailTarget(null)}
        />
      ) : (
        <PortalIncidentsList
          filterStatus={filterStatus}
          incidents={filtered}
          message={message}
          onFilterChange={setFilterStatus}
          onSelect={setDetailTarget}
        />
      )}

      <ConfirmModal
        visible={Boolean(statusTarget)}
        title="Cambiar estado"
        description={statusTarget ? statusTarget.title : ''}
        confirmLabel="Guardar"
        processing={isSubmitting}
        onCancel={() => setStatusTarget(null)}
        onConfirm={handleStatusChange}>
        <PortalIncidentStatusSelector onChange={setSelectedStatus} value={selectedStatus} />
      </ConfirmModal>
    </PortalLayout>
  );
}
