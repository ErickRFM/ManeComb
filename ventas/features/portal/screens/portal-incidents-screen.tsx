import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { useAppStore } from '@/src/store/use-app-store';
import type { Incident } from '@/src/types/app';
import { PortalLayout } from '../components/portal-layout';
import { PortalIncidentDetails } from '../incidents/components/portal-incident-details';
import { PortalIncidentStatusSelector } from '../incidents/components/portal-incident-status-selector';
import { PortalIncidentsContextNotice } from '../incidents/components/portal-incidents-context-notice';
import { PortalIncidentsList } from '../incidents/components/portal-incidents-list';
import { portalButtonGradient } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';

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
      {canManage ? <PortalIncidentsContextNotice /> : null}

      {detail ? (
        <PortalIncidentDetails
          canManage={canManage}
          incident={detail}
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
