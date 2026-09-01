import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Typography } from '@/constants/theme';
import { changePasswordRequest } from '@/src/api/account-security';
import { validatePasswordChangeInput } from '@/src/api/account-security-validation';
import { getApiErrorMessage } from '@/src/api/client';
import { AppCard } from '@/src/components/app-card';
import { PrimaryButton } from '@/src/components/primary-button';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { getPasswordStrength } from '@/src/utils/password-strength';
import { Field } from './field';

type SecurityForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type Props = {
  disabled?: boolean;
};

function createSecurityForm(): SecurityForm {
  return { currentPassword: '', newPassword: '', confirmPassword: '' };
}

export function PasswordChangeSection({ disabled = false }: Props) {
  const { theme } = useAppTheme();
  const [form, setForm] = useState<SecurityForm>(createSecurityForm);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const passwordStrength = useMemo(
    () => getPasswordStrength(form.newPassword),
    [form.newPassword]
  );

  const updateField = <K extends keyof SecurityForm>(field: K, value: SecurityForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handlePasswordChange = async () => {
    if (isSaving || disabled) return;

    setMessage(null);
    setSuccess(false);
    const currentPassword = form.currentPassword;
    const newPassword = form.newPassword.trim();
    const confirmPassword = form.confirmPassword.trim();

    const validationMessage = validatePasswordChangeInput({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setIsSaving(true);
    try {
      const result = await changePasswordRequest({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setSuccess(true);
      setMessage(result.message || 'Contraseña actualizada.');
      setForm(createSecurityForm());
    } catch (error) {
      setMessage(getApiErrorMessage(
        error,
        'No se pudo cambiar la contraseña. Intenta nuevamente.'
      ));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppCard>
      <View style={styles.form}>
        <View style={styles.heading}>
          <MaterialCommunityIcons name="shield-lock-outline" size={20} color={theme.colors.text} />
          <View style={styles.headingCopy}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Seguridad</Text>
            <Text style={[styles.meta, { color: theme.colors.muted }]}>
              Cambiar la contraseña requiere validar la actual y cerrará las demás sesiones abiertas.
            </Text>
          </View>
        </View>
        <Field
          label="Contraseña actual"
          value={form.currentPassword}
          onChangeText={(value) => updateField('currentPassword', value)}
          placeholder="Tu contraseña actual"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
        <Field
          label="Nueva contraseña"
          value={form.newPassword}
          onChangeText={(value) => updateField('newPassword', value)}
          placeholder="Nueva contraseña"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {form.newPassword.trim() ? (
          <Text style={[
            styles.passwordHint,
            {
              color: passwordStrength.tone === 'positive'
                ? theme.colors.success
                : passwordStrength.tone === 'warning'
                  ? theme.colors.warning
                  : theme.colors.danger,
            },
          ]}>
            Seguridad: {passwordStrength.label}
          </Text>
        ) : null}
        <Field
          label="Confirmar nueva contraseña"
          value={form.confirmPassword}
          onChangeText={(value) => updateField('confirmPassword', value)}
          placeholder="Repite la nueva contraseña"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {message ? (
          <Text style={[styles.message, { color: success ? theme.colors.success : theme.colors.danger }]}>
            {message}
          </Text>
        ) : null}
        <PrimaryButton
          label={isSaving ? 'Actualizando seguridad...' : 'Cambiar contraseña'}
          disabled={isSaving || disabled}
          onPress={() => void handlePasswordChange()}
        />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  heading: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  headingCopy: { flex: 1, gap: 3 },
  title: { fontFamily: Typography.display, fontSize: 18, fontWeight: '900' },
  meta: { fontFamily: Typography.body, fontSize: 13, lineHeight: 19 },
  passwordHint: { fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
  message: { fontFamily: Typography.body, fontSize: 13, fontWeight: '800', lineHeight: 19 },
});
