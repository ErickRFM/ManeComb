import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from '@/src/navigation/router';
import { useAdminStore } from '../store';
import { Typography, palette } from '@/constants/theme';

export function AdminPlaceholderScreen() {
  const { session, sessionInfo, logout, refreshSession } = useAdminStore();

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  if (!session) return null;

  const user = session.user;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brandText}>ManeComb</Text>
          <Text style={styles.brandBadge}>Admin</Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Panel de Administración</Text>
        <Text style={styles.subtitle}>
          Bienvenido, {user.name || user.email}
        </Text>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Usuario</Text>
            <Text style={styles.infoValue}>{user.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Correo</Text>
            <Text style={styles.infoValue}>{user.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Rol</Text>
            <Text style={styles.infoValue}>{user.role}</Text>
          </View>
          {sessionInfo ? (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>MFA</Text>
                <Text style={[styles.infoValue, sessionInfo.mfaVerified ? styles.successText : styles.warningText]}>
                  {sessionInfo.mfaVerified ? 'Verificado' : 'No verificado'}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderTitle}>En construcción</Text>
          <Text style={styles.placeholderBody}>
            El panel de administración completo estará disponible próximamente.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050816',
    minHeight: '100vh' as any,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandText: {
    color: '#F8FAFC',
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
  },
  brandBadge: {
    color: '#FF8FB0',
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    backgroundColor: 'rgba(255, 36, 92, 0.1)',
    borderColor: 'rgba(255, 77, 125, 0.32)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  logoutButton: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  logoutText: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    padding: 24,
    gap: 20,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    color: '#F8FAFC',
    fontFamily: Typography.display,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 15,
    lineHeight: 21,
  },
  card: {
    backgroundColor: 'rgba(18, 24, 33, 0.92)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
    gap: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    color: palette.mutedSoft,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoValue: {
    color: palette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  successText: {
    color: palette.success,
  },
  warningText: {
    color: palette.warning,
  },
  placeholderCard: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 24,
    gap: 8,
    alignItems: 'center',
  },
  placeholderTitle: {
    color: palette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  placeholderBody: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
