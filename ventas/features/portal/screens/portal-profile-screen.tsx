import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useLocalSearchParams } from '@/src/navigation/router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';

type ProfileSection = 'resumen' | 'empresa' | 'seguridad' | 'soporte';

function getParam(value: string | string[] | undefined): ProfileSection {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (['empresa', 'seguridad', 'soporte'].includes(String(normalized || ''))) {
    return normalized as ProfileSection;
  }

  return 'resumen';
}

export function PortalProfileScreen() {
  const { theme } = useAppTheme();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const activeSection = getParam(params.section);
  const { updateProfile, user } = useAppStore(
    useShallow((state) => ({
      updateProfile: state.updateProfile,
      user: state.user,
    }))
  );
  const { loadSessions, revokeSession, sessions } = usePortalStore(
    useShallow((state) => ({
      loadSessions: state.loadSessions,
      revokeSession: state.revokeSession,
      sessions: state.sessions,
    }))
  );
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    companyName: '',
    legalName: '',
    taxId: '',
    billingEmail: '',
    billingAddress: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [sessionToRevoke, setSessionToRevoke] = useState<{ id: string; deviceName: string } | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      companyName: user.companyProfile?.companyName || '',
      legalName: user.companyProfile?.legalName || '',
      taxId: user.companyProfile?.taxId || '',
      billingEmail: user.companyProfile?.billingEmail || user.email || '',
      billingAddress: user.companyProfile?.billingAddress || '',
    });
  }, [user]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const setField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = async () => {
    const result = await updateProfile({
      name: form.name,
      email: form.email,
      phone: form.phone,
      companyName: form.companyName,
      legalName: form.legalName,
      taxId: form.taxId,
      billingEmail: form.billingEmail,
      billingAddress: form.billingAddress,
    });

    setMessage(result.ok ? 'Perfil actualizado.' : result.message || 'No fue posible actualizar el perfil.');
  };

  return (
    <PortalLayout
      title={
        activeSection === 'empresa'
          ? 'Empresa'
          : activeSection === 'seguridad'
            ? 'Seguridad'
            : activeSection === 'soporte'
                ? 'Soporte'
                : 'Perfil'
      }
      subtitle="Configuración de cuenta, empresa y acceso administrativo.">
      {activeSection === 'resumen' ? (
        <PortalSectionCard title="Datos personales" subtitle={message || undefined}>
          <View style={styles.formGrid}>
            {(['name', 'email', 'phone'] as const).map((field) => (
              <TextInput
                key={field}
                value={form[field]}
                onChangeText={(value) => setField(field, value)}
                 placeholder={field === 'name' ? 'Nombre' : field === 'email' ? 'Correo' : 'Telefono'}
                 accessibilityLabel={field === 'name' ? 'Nombre' : field === 'email' ? 'Correo' : 'Teléfono'}
                placeholderTextColor={theme.colors.muted}
                autoCapitalize={field === 'email' ? 'none' : 'sentences'}
                style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
              />
            ))}
          </View>
        </PortalSectionCard>
      ) : null}

      {activeSection === 'resumen' || activeSection === 'empresa' ? (
        <PortalSectionCard title="Datos de empresa" subtitle="Información fiscal y de activación.">
          <View style={styles.formGrid}>
            {(['companyName', 'legalName', 'taxId', 'billingEmail', 'billingAddress'] as const).map((field) => (
              <TextInput
                key={field}
                value={form[field]}
                onChangeText={(value) => setField(field, value)}
                 placeholder={
                  field === 'companyName'
                    ? 'Empresa'
                    : field === 'legalName'
                      ? 'Razon social'
                      : field === 'taxId'
                        ? 'RFC'
                        : field === 'billingEmail'
                          ? 'Correo fiscal'
                          : 'Direccion fiscal'
                 }
                accessibilityLabel={
                  field === 'companyName' ? 'Empresa' : field === 'legalName' ? 'Razón social' : field === 'taxId' ? 'RFC' : field === 'billingEmail' ? 'Correo fiscal' : 'Dirección fiscal'
                }
                placeholderTextColor={theme.colors.muted}
                autoCapitalize={field === 'billingEmail' ? 'none' : 'sentences'}
                style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
              />
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => void saveProfile()} style={[styles.primaryButton, portalButtonGradient()]}>
              <MaterialCommunityIcons name="content-save-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryText}>Guardar perfil</Text>
            </Pressable>
          </View>
        </PortalSectionCard>
      ) : null}

      {activeSection === 'resumen' || activeSection === 'seguridad' ? (
        <PortalSectionCard title="Sesiones activas" subtitle={sessions.length ? `${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'}` : undefined}>
          {sessions.length ? (
            <View style={styles.sessionList}>
              {sessions.map((session) => (
                <View key={session.id} style={[styles.sessionRow, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
                  <MaterialCommunityIcons name="monitor-cellphone" size={22} color={theme.colors.accent} />
                  <View style={styles.sessionBody}>
                    <Text style={[styles.sessionTitle, { color: theme.colors.text }]}>{session.deviceName}</Text>
                    <Text style={[styles.sessionMeta, { color: theme.colors.muted }]}>
                      Vence: {session.expiresAt ? new Date(session.expiresAt).toLocaleDateString('es-MX') : 'Sin fecha disponible'}
                    </Text>
                  </View>
                  <StatusBadge label={session.current ? 'actual' : 'activa'} tone="positive" />
                  {!session.current ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Cerrar sesión en ${session.deviceName}`}
                       onPress={() => setSessionToRevoke({ id: session.id, deviceName: session.deviceName })}
                      style={[styles.iconButton, { backgroundColor: theme.colors.dangerSoft }]}>
                      <MaterialCommunityIcons name="close" size={18} color={theme.colors.danger} />
                    </Pressable>
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
      ) : null}

      {activeSection === 'soporte' ? (
        <PortalSectionCard title="Soporte" subtitle="Canales y contexto para administradores.">
          <View style={styles.supportGrid}>
            <View style={[styles.supportItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
              <MaterialCommunityIcons name="lifebuoy" size={22} color={theme.colors.info} />
              <View style={styles.supportCopy}>
                <Text style={[styles.sessionTitle, { color: theme.colors.text }]}>Soporte comercial</Text>
                <Text style={[styles.sessionMeta, { color: theme.colors.muted }]}>Pagos, facturación, contrato y activación.</Text>
              </View>
            </View>
            <View style={[styles.supportItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
              <MaterialCommunityIcons name="bus-alert" size={22} color={theme.colors.warning} />
              <View style={styles.supportCopy}>
                <Text style={[styles.sessionTitle, { color: theme.colors.text }]}>Soporte operativo</Text>
                <Text style={[styles.sessionMeta, { color: theme.colors.muted }]}>Incidencias de rutas, radio y monitoreo se atienden desde el panel operativo.</Text>
              </View>
            </View>
          </View>
        </PortalSectionCard>
      ) : null}
      <ConfirmModal
        visible={Boolean(sessionToRevoke)}
        title="Cerrar sesión remota"
        description={`Se cerrará la sesión en ${sessionToRevoke?.deviceName || 'el dispositivo seleccionado'}. La persona deberá iniciar sesión de nuevo.`}
        confirmLabel="Cerrar sesión"
        destructive
        onCancel={() => setSessionToRevoke(null)}
        onConfirm={() => {
          if (sessionToRevoke) void revokeSession(sessionToRevoke.id);
          setSessionToRevoke(null);
        }}
      />
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 0,
  },
  input: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 220,
    fontFamily: Typography.body,
    fontSize: 14,
    minHeight: 46,
    minWidth: 0,
    paddingHorizontal: 14,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexShrink: 0,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  primaryText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
    flexShrink: 1,
  },
  sessionList: {
    gap: 10,
    minWidth: 0,
  },
  sessionRow: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
    padding: 12,
  },
  sessionBody: {
    flex: 1,
    flexBasis: 240,
    minWidth: 0,
  },
  sessionTitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 0,
  },
  sessionMeta: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  supportGrid: {
    gap: 10,
    minWidth: 0,
  },
  supportItem: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
    padding: 12,
  },
  supportCopy: {
    flex: 1,
    flexBasis: 240,
    minWidth: 0,
  },
});
