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
  onRevoke: (session: PortalSession) => void;
  sessions: PortalSession[];
};

export function PortalProfileSessionsSection({ onRevoke, sessions }: PortalProfileSessionsSectionProps) {
  return (
    <PortalSectionCard title="Sesiones activas" subtitle={sessions.length ? `${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'}` : undefined}>
      {sessions.length ? (
        <View style={styles.sessionList}>
          {sessions.map((session) => (
            <View key={session.id} style={[styles.sessionRow, { borderColor: palette.line, backgroundColor: palette.surface }]}>
              <MaterialCommunityIcons name="monitor-cellphone" size={22} color={palette.accent} />
              <View style={styles.sessionBody}>
                <Text style={[styles.sessionTitle, { color: palette.text }]}>{session.deviceName}</Text>
                <Text style={[styles.sessionMeta, { color: palette.muted }]}>
                  Vence: {session.expiresAt ? new Date(session.expiresAt).toLocaleDateString('es-MX') : 'Sin fecha disponible'}
                </Text>
              </View>
              <StatusBadge label={session.current ? 'actual' : 'activa'} tone="positive" />
              {!session.current ? (
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
