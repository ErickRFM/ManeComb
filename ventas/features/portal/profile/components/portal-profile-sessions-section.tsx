import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { PortalSession } from '@/src/types/app';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { styles } from '../profile.styles';

type PortalProfileSessionsSectionProps = {
  isSubmitting: boolean;
  onRevoke: (session: PortalSession) => void;
  onRevokeAllOthers: () => void;
  sessions: PortalSession[];
};

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sin registro'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export function PortalProfileSessionsSection({
  isSubmitting,
  onRevoke,
  onRevokeAllOthers,
  sessions,
}: PortalProfileSessionsSectionProps) {
  const otherSessions = sessions.filter((session) => !session.current && session.isActive !== false);

  return (
    <PortalSectionCard
      title="Sesiones activas"
      subtitle={sessions.length ? `${sessions.length} ${sessions.length === 1 ? 'sesión registrada' : 'sesiones registradas'}` : undefined}
      right={otherSessions.length ? (
        <PortalButton
          icon="logout-variant"
          loading={isSubmitting}
          onPress={onRevokeAllOthers}
          size="sm"
          variant="danger">
          Cerrar las demás
        </PortalButton>
      ) : undefined}>
      {sessions.length ? (
        <View style={styles.sessionList}>
          {sessions.map((session) => (
            <View key={session.id} style={[styles.sessionRow, { borderColor: palette.line, backgroundColor: palette.surface }]}>
              <MaterialCommunityIcons
                name={session.platform === 'android' ? 'android' : session.platform === 'ios' ? 'apple-ios' : 'monitor-cellphone'}
                size={22}
                color={palette.accent}
              />
              <View style={styles.sessionBody}>
                <Text style={[styles.sessionTitle, { color: palette.text }]}>{session.deviceName}</Text>
                <Text style={[styles.sessionMeta, { color: palette.muted }]}>Última actividad: {formatDateTime(session.lastSeenAt)}</Text>
                <Text style={[styles.sessionMeta, { color: palette.muted }]}>Creada: {formatDateTime(session.createdAt)} · Vence: {formatDateTime(session.expiresAt)}</Text>
                {session.locationApprox ? (
                  <Text style={[styles.sessionMeta, { color: palette.muted }]}>Ubicación aproximada: {session.locationApprox}</Text>
                ) : null}
              </View>
              <StatusBadge label={session.current ? 'Sesión actual' : session.isActive === false ? 'Cerrada' : 'Activa'} tone={session.isActive === false ? 'neutral' : 'positive'} />
              {!session.current && session.isActive !== false ? (
                <PortalButton
                  accessibilityLabel={`Cerrar sesión en ${session.deviceName}`}
                  onPress={() => onRevoke(session)}
                  icon="close"
                  size="sm"
                  variant="danger"
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          icon="shield-lock-outline"
          title="Sin sesiones activas"
          description="Las sesiones administrativas aparecerán cuando haya accesos registrados."
        />
      )}
    </PortalSectionCard>
  );
}
