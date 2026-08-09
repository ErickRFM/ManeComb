import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import * as ImagePicker from '@/src/native/image-picker';
import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
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
import { getPasswordStrength, isStrongPassword, PASSWORD_MIN_LENGTH } from '@/src/utils/password-strength';
import { Field } from './profile-edit/components/field';

type PersonalProfileForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  avatarUrl: string | null;
};

function createPersonalProfileForm(): PersonalProfileForm {
  return {
    name: '',
    email: '',
    phone: '',
    password: '',
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
  const [form, setForm] = useState<PersonalProfileForm>(createPersonalProfileForm);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const passwordStrength = useMemo(() => getPasswordStrength(form.password), [form.password]);
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      avatarUrl: user.avatarUrl || null,
    });
  }, [user]);

  const updateField = <K extends keyof PersonalProfileForm>(field: K, value: PersonalProfileForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handlePhotoUpload = async () => {
    setMessage(null);
    setSuccess(false);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    updateField(
      'avatarUrl',
      asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : asset.uri
    );
  };

  const handleSave = async () => {
    setMessage(null);
    setSuccess(false);

    if (!form.name.trim() || !form.email.trim()) {
      setMessage('Nombre y correo son obligatorios.');
      return;
    }

    if (form.password.trim() && !isStrongPassword(form.password.trim())) {
      setMessage(
        `La nueva contraseña debe tener mínimo ${PASSWORD_MIN_LENGTH} caracteres, letras, números y un carácter especial.`
      );
      return;
    }

    const result = await updateProfile({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      avatarUrl: form.avatarUrl,
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
    });

    if (!result.ok) {
      setMessage(result.message || 'No se pudo actualizar tu perfil.');
      return;
    }

    setForm((current) => ({ ...current, password: '' }));
    setSuccess(true);
    setMessage('Perfil actualizado. Los administradores verán estos datos en el directorio.');
  };

  if (!user) return null;

  const roleLabel = formatRole(user.role);
  const isDriver = user.role === 'driver' || user.role === 'conductor';

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
            <PrimaryButton label="Cambiar foto" variant="ghost" onPress={() => void handlePhotoUpload()} />
          </View>
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.form}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Información personal</Text>
          <Field label="Nombre completo" value={form.name} onChangeText={(value) => updateField('name', value)} placeholder="Nombre del usuario" />
          <Field label="Correo" value={form.email} onChangeText={(value) => updateField('email', value)} placeholder="usuario@correo.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Teléfono" value={form.phone} onChangeText={(value) => updateField('phone', value)} placeholder="+52 55 0000 0000" keyboardType="phone-pad" />
          <Field label="Nueva contraseña" value={form.password} onChangeText={(value) => updateField('password', value)} placeholder="Déjala vacía para conservar la actual" secureTextEntry />
          {form.password.trim() ? (
            <Text style={[styles.passwordHint, { color: passwordStrength.tone === 'positive' ? theme.colors.success : passwordStrength.tone === 'warning' ? theme.colors.warning : theme.colors.danger }]}>
              Seguridad: {passwordStrength.label}
            </Text>
          ) : null}
          <Text style={[styles.scopeNote, { color: theme.colors.muted, borderColor: theme.colors.line }]}>{isDriver ? 'La unidad, turno, horario operativo y rol los administra tu empresa. Tus documentos se gestionan desde “Mis documentos”.' : 'El rol, asignaciones y configuración de la empresa se administran con las herramientas de la cuenta empresarial.'}</Text>
          {message ? <Text style={[styles.message, { color: success ? theme.colors.success : theme.colors.danger }]}>{message}</Text> : null}
          <PrimaryButton label={isSubmitting ? 'Guardando...' : 'Guardar cambios'} disabled={isSubmitting} onPress={() => void handleSave()} />
        </View>
      </AppCard>
    </AppShell>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
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
    passwordHint: { fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
    scopeNote: { borderTopWidth: 1, fontFamily: Typography.body, fontSize: 12, lineHeight: 19, paddingTop: 12 },
    message: { fontFamily: Typography.body, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  });
}
