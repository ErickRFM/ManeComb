import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { formatRole } from '@/src/utils/format';
import { pickProfileAvatarDataUrl } from '@/src/utils/profile-avatar';
import { Field } from './profile-edit/components/field';
import { PasswordChangeSection } from './profile-edit/components/password-change-section';

type PersonalProfileForm = {
  name: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
};

function createPersonalProfileForm(): PersonalProfileForm {
  return {
    name: '',
    email: '',
    phone: '',
    avatarUrl: null,
  };
}

export function DriverProfileEditScreen() {
  const { theme } = useAppTheme();
  const { isSubmitting, updateProfile, user } = useAppStore(
    useShallow((state) => ({
      isSubmitting: state.isSubmitting,
      updateProfile: state.updateProfile,
      user: state.user,
    }))
  );
  const initializedUserIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<PersonalProfileForm>(createPersonalProfileForm);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [photoSuccess, setPhotoSuccess] = useState(false);
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const styles = useMemo(createStyles, []);

  useEffect(() => {
    if (!user) {
      initializedUserIdRef.current = null;
      return;
    }
    if (initializedUserIdRef.current === user.id) return;

    initializedUserIdRef.current = user.id;
    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      avatarUrl: user.avatarUrl || null,
    });
  }, [user]);

  const updateField = <K extends keyof PersonalProfileForm>(field: K, value: PersonalProfileForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handlePhotoUpload = async () => {
    if (!user || isPhotoSaving || isSubmitting) return;

    const previousAvatarUrl = form.avatarUrl || user.avatarUrl || null;
    setPhotoMessage(null);
    setPhotoSuccess(false);
    setIsPhotoSaving(true);

    try {
      const avatarUrl = await pickProfileAvatarDataUrl();
      if (!avatarUrl) return;

      updateField('avatarUrl', avatarUrl);
      const result = await updateProfile({ avatarUrl });
      if (!result.ok) {
        updateField('avatarUrl', previousAvatarUrl);
        setPhotoMessage(result.message || 'No se pudo guardar la foto.');
        return;
      }

      setPhotoSuccess(true);
      setPhotoMessage('Foto guardada y sincronizada.');
    } catch (error) {
      updateField('avatarUrl', previousAvatarUrl);
      setPhotoMessage(error instanceof Error ? error.message : 'No se pudo preparar la foto.');
    } finally {
      setIsPhotoSaving(false);
    }
  };

  const handleSave = async () => {
    setMessage(null);
    setSuccess(false);

    if (!form.name.trim() || !form.email.trim()) {
      setMessage('Nombre y correo son obligatorios.');
      return;
    }

    const result = await updateProfile({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      avatarUrl: form.avatarUrl,
    });

    if (!result.ok) {
      setMessage(result.message || 'No se pudo actualizar tu perfil.');
      return;
    }

    setSuccess(true);
    setMessage('Perfil actualizado. Los administradores verán estos datos en el directorio.');
  };

  if (!user) return null;

  const roleLabel = formatRole(user.role);
  const isDriver = user.role === 'driver';

  return (
    <AppShell
      sectionKey="perfil"
      mobileTitle="Editar mi perfil"
      header={
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/perfil')}
            style={[styles.backButton, { borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceAlt }]}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={theme.colors.text} />
            <Text style={[styles.backButtonText, { color: theme.colors.text }]}>Volver</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.colors.text }]}>{isDriver ? 'Tu perfil de conductor' : 'Tu perfil operativo'}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted }]}>Estos datos identifican tu cuenta dentro de la empresa, Chat, Radio y Directorio.</Text>
        </View>
      }>
      <AppCard>
        <View style={styles.identityRow}>
          <UserAvatar
            user={{
              avatar: user.avatar,
              avatarUrl: form.avatarUrl || user.avatarUrl || null,
              name: form.name || user.name,
            }}
            size={104}
          />
          <View style={styles.identityCopy}>
            <Text style={[styles.name, { color: theme.colors.text }]}>{form.name || user.name}</Text>
            <Text style={[styles.meta, { color: theme.colors.muted }]}>{roleLabel}{isDriver ? ` · ${user.vehicleId ? 'Unidad asignada' : 'Sin unidad asignada'}` : ''}</Text>
            <PrimaryButton
              label={isPhotoSaving ? 'Guardando foto...' : 'Cambiar foto'}
              variant="ghost"
              disabled={isPhotoSaving || isSubmitting}
              onPress={() => void handlePhotoUpload()}
            />
            {photoMessage ? (
              <Text style={[styles.message, { color: photoSuccess ? theme.colors.success : theme.colors.danger }]}>
                {photoMessage}
              </Text>
            ) : null}
          </View>
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.form}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Información personal</Text>
          <Field label="Nombre completo" value={form.name} onChangeText={(value) => updateField('name', value)} placeholder="Nombre del usuario" />
          <Field label="Correo" value={form.email} onChangeText={(value) => updateField('email', value)} placeholder="usuario@correo.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Teléfono" value={form.phone} onChangeText={(value) => updateField('phone', value)} placeholder="+52 55 0000 0000" keyboardType="phone-pad" />
          <Text style={[styles.scopeNote, { color: theme.colors.muted, borderColor: theme.colors.line }]}>{isDriver ? 'La unidad, turno, horario operativo y rol los administra tu empresa. Tus documentos se gestionan desde “Mis documentos”.' : 'El rol, asignaciones y configuración de la empresa se administran con las herramientas de la cuenta empresarial.'}</Text>
          {message ? <Text style={[styles.message, { color: success ? theme.colors.success : theme.colors.danger }]}>{message}</Text> : null}
          <PrimaryButton label={isSubmitting ? 'Guardando...' : 'Guardar cambios'} disabled={isSubmitting || isPhotoSaving} onPress={() => void handleSave()} />
        </View>
      </AppCard>

      <PasswordChangeSection disabled={isSubmitting || isPhotoSaving} />
    </AppShell>
  );
}

function createStyles() {
  return StyleSheet.create({
    header: { gap: 8, paddingTop: AppTheme.spacing.sm },
    backButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    backButtonText: { fontFamily: Typography.body, fontSize: 13, fontWeight: '800' },
    title: { fontFamily: Typography.display, fontSize: 26, fontWeight: '900' },
    subtitle: { fontFamily: Typography.body, fontSize: 14, lineHeight: 21 },
    identityRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    identityCopy: { flex: 1, gap: 8, minWidth: 190 },
    name: { fontFamily: Typography.display, fontSize: 22, fontWeight: '900' },
    meta: { fontFamily: Typography.body, fontSize: 13, lineHeight: 19 },
    form: { gap: 14 },
    sectionTitle: { fontFamily: Typography.display, fontSize: 18, fontWeight: '900' },
    scopeNote: { borderTopWidth: 1, fontFamily: Typography.body, fontSize: 12, lineHeight: 19, paddingTop: 12 },
    message: { fontFamily: Typography.body, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  });
}
