import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { PortalSession } from '@/src/types/app';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { PortalContentModal } from '../../components/portal-content-modal';
import { PortalPagination } from '../../components/portal-pagination';
import { styles } from '../profile.styles';

type PortalProfileSessionsSectionProps = {
  isSubmitting: boolean;
  message?: string | null;
  onRevoke: (session: PortalSession) => void;
  onRevokeAllOthers: () => void;
  sessions: PortalSession[];
};

const SESSION_HISTORY_PAGE_SIZE = 8;

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sin registro'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function getSessionTimestamp(session: PortalSession) {
  const value = session.lastSeenAt || session.createdAt;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PortalProfileSessionsSection({
  isSubmitting,
  message,
  onRevoke,
  onRevokeAllOthers,
  sessions,
}: PortalProfileSessionsSectionProps) {
  const [managerOpen, setManagerOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const activeSessions = useMemo(
    () => sessions
      .filter((session) => session.isActive !== false)
      .sort((left, right) => {
        if (left.current !== right.current) return left.current ? -1 : 1;
        return getSessionTimestamp(right) - getSessionTimestamp(left);
      }),
    [sessions]
  );
  const closedSessions = useMemo(
    () => sessions
      .filter((session) => session.isActive === false)
      .sort((left, right) => getSessionTimestamp(right) - getSessionTimestamp(left)),
    [sessions]
  );
  const previewSessions = activeSessions.slice(0, 3);
  const otherSessions = activeSessions.filter((session) => !session.current);
  const historyPages = Math.max(1, Math.ceil(closedSessions.length / SESSION_HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyPages);
  const visibleHistory = closedSessions.slice(
    (safeHistoryPage - 1) * SESSION_HISTORY_PAGE_SIZE,
    safeHistoryPage * SESSION_HISTORY_PAGE_SIZE
  );
  const countLabel = sessions.length
    ? `${activeSessions.length} activa${activeSessions.length === 1 ? '' : 's'}${closedSessions.length ? ` · ${closedSessions.length} en historial` : ''}`
    : undefined;

  const openManager = () => {
    setHistoryPage(1);
    setManagerOpen(true);
  };

  const renderSession = (session: PortalSession, detailed: boolean) => (
    <View key={session.id} style={[styles.sessionRow, { borderColor: palette.line, backgroundColor: palette.surface }]}>
      <MaterialCommunityIcons
        name={session.platform === 'android' ? 'android' : session.platform === 'ios' ? 'apple-ios' : 'monitor-cellphone'}
        size={22}
        color={palette.accent}
      />
      <View style={styles.sessionBody}>
        <Text style={[styles.sessionTitle, { color: palette.text }]}>{session.deviceName}</Text>
        <Text style={[styles.sessionMeta, { color: palette.muted }]}>Última actividad: {formatDateTime(session.lastSeenAt)}</Text>
        {detailed ? (
          <>
            <Text style={[styles.sessionMeta, { color: palette.muted }]}>Creada: {formatDateTime(session.createdAt)} · Vence: {formatDateTime(session.expiresAt)}</Text>
            {session.locationApprox ? (
              <Text style={[styles.sessionMeta, { color: palette.muted }]}>Ubicación aproximada: {session.locationApprox}</Text>
            ) : null}
          </>
        ) : null}
      </View>
      <StatusBadge label={session.current ? 'Sesión actual' : session.isActive === false ? 'Cerrada' : 'Activa'} tone={session.isActive === false ? 'neutral' : 'positive'} />
      {detailed && !session.current && session.isActive !== false ? (
        <PortalButton
          accessibilityLabel={`Cerrar sesión en ${session.deviceName}`}
          onPress={() => {
            setManagerOpen(false);
            onRevoke(session);
          }}
          icon="close"
          size="sm"
          variant="danger"
        />
      ) : null}
    </View>
  );

  return (
    <>
      <PortalSectionCard
        title="Sesiones activas"
        subtitle={message || countLabel}
        right={sessions.length ? (
          <PortalButton
            icon="devices"
            onPress={openManager}
            size="sm"
            variant="secondary">
            Administrar
          </PortalButton>
        ) : undefined}>
        {previewSessions.length ? (
          <View style={styles.sessionList}>
            {previewSessions.map((session) => renderSession(session, false))}
            {activeSessions.length > previewSessions.length ? (
              <Text style={[styles.sessionMeta, { color: palette.muted }]}>Hay {activeSessions.length - previewSessions.length} sesión{activeSessions.length - previewSessions.length === 1 ? '' : 'es'} activa{activeSessions.length - previewSessions.length === 1 ? '' : 's'} más. Ábrelas desde Administrar.</Text>
            ) : closedSessions.length ? (
              <Text style={[styles.sessionMeta, { color: palette.muted }]}>El historial de {closedSessions.length} sesión{closedSessions.length === 1 ? '' : 'es'} cerrada{closedSessions.length === 1 ? '' : 's'} está disponible en Administrar.</Text>
            ) : null}
          </View>
        ) : (
          <EmptyState
            icon="shield-lock-outline"
            title="Sin sesiones activas"
            description={closedSessions.length
              ? 'No hay sesiones abiertas. El historial de accesos sigue disponible en Administrar.'
              : 'Las sesiones administrativas aparecerán cuando haya accesos registrados.'}
          />
        )}
      </PortalSectionCard>

      <PortalContentModal
        visible={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Administrar sesiones"
        subtitle={`${activeSessions.length} activa${activeSessions.length === 1 ? '' : 's'} · ${closedSessions.length} cerrada${closedSessions.length === 1 ? '' : 's'}`}
        width="lg"
        footer={otherSessions.length ? (
          <PortalButton
            icon="logout-variant"
            loading={isSubmitting}
            onPress={() => {
              setManagerOpen(false);
              onRevokeAllOthers();
            }}
            variant="danger">
            Cerrar las demás sesiones
          </PortalButton>
        ) : undefined}>
        {activeSessions.length ? (
          <View style={styles.sessionList}>
            <Text style={[styles.sessionTitle, { color: palette.text }]}>Activas</Text>
            {activeSessions.map((session) => renderSession(session, true))}
          </View>
        ) : null}

        {closedSessions.length ? (
          <View style={styles.sessionList}>
            <Text style={[styles.sessionTitle, { color: palette.text }]}>Historial de accesos</Text>
            {visibleHistory.map((session) => renderSession(session, true))}
            <PortalPagination
              itemLabel="sesiones"
              onPageChange={setHistoryPage}
              page={safeHistoryPage}
              pageSize={SESSION_HISTORY_PAGE_SIZE}
              totalItems={closedSessions.length}
            />
          </View>
        ) : null}
      </PortalContentModal>
    </>
  );
}
