import { isAxiosError } from 'axios';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { apiClient, getApiErrorMessage } from '@/src/api/client';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { portalPalette } from '../../portal-theme';
import { styles } from '../profile.styles';

export function PortalProfilePasswordSection({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  const requirements = useMemo(() => [
    { label: '8 caracteres o más', ok: newPassword.length >= 8 },
    { label: 'Una letra', ok: /[A-Za-z]/.test(newPassword) },
    { label: 'Un número', ok: /\d/.test(newPassword) },
    { label: 'Un carácter especial', ok: /[^A-Za-z0-9]/.test(newPassword) },
    { label: 'La confirmación coincide', ok: Boolean(confirmPassword) && newPassword === confirmPassword },
    { label: 'Diferente de la contraseña actual', ok: Boolean(newPassword) && newPassword !== currentPassword },
  ], [confirmPassword, currentPassword, newPassword]);
  const canSubmit = Boolean(currentPassword) && requirements.every((item) => item.ok) && !isSubmitting;
  const showRequirements = Boolean(newPassword || confirmPassword);

  const clearDraft = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswords(false);
  };

  const cancelEditing = () => {
    clearDraft();
    setFeedback(null);
    setIsEditing(false);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const response = await apiClient.post<{ ok: boolean; message?: string }>(
        '/users/me/change-password',
        { currentPassword, newPassword, confirmPassword }
      );
      clearDraft();
      setIsEditing(false);
      setFeedback({
        tone: 'success',
        message: response.data.message || 'Contraseña actualizada correctamente.',
      });
      onChanged();
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: isAxiosError(error)
          ? getApiErrorMessage(error, 'No fue posible cambiar la contraseña.')
          : 'No fue posible cambiar la contraseña.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PortalSectionCard
      title="Seguridad"
      subtitle="Contraseña y protección de acceso de tu cuenta.">
      <View style={styles.securityHeader}>
        <View style={styles.securityIcon}>
          <MaterialCommunityIcons name="shield-lock-outline" size={22} color={portalPalette.accent} />
        </View>
        <View style={styles.securityCopy}>
          <Text style={styles.securityTitle}>Contraseña de acceso</Text>
          <Text style={styles.securityText}>
            Al cambiarla se cerrarán las demás sesiones por seguridad.
          </Text>
        </View>
        {isEditing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
            onPress={() => setShowPasswords((current) => !current)}
            style={styles.visibilityButton}>
            <MaterialCommunityIcons
              name={showPasswords ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={portalPalette.text}
            />
            <Text style={styles.visibilityText}>{showPasswords ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
        ) : (
          <PortalButton
            icon="lock-reset"
            onPress={() => {
              setFeedback(null);
              setIsEditing(true);
            }}
            size="sm"
            variant="secondary">
            Cambiar contraseña
          </PortalButton>
        )}
      </View>

      {feedback ? (
        <View style={[
          styles.securityFeedback,
          {
            backgroundColor: feedback.tone === 'success' ? portalPalette.successSoft : portalPalette.dangerSoft,
            borderColor: feedback.tone === 'success' ? portalPalette.success : portalPalette.danger,
          },
        ]}>
          <MaterialCommunityIcons
            name={feedback.tone === 'success' ? 'check-circle-outline' : 'alert-circle-outline'}
            size={18}
            color={feedback.tone === 'success' ? portalPalette.success : portalPalette.danger}
          />
          <Text style={styles.securityFeedbackText}>{feedback.message}</Text>
        </View>
      ) : null}

      {isEditing ? (
        <View style={styles.securityEditor}>
          <View style={styles.formGrid}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Contraseña actual</Text>
              <TextInput
                accessibilityLabel="Contraseña actual"
                autoCapitalize="none"
                autoComplete="current-password"
                onChangeText={setCurrentPassword}
                placeholder="Contraseña actual"
                placeholderTextColor={portalPalette.mutedSoft}
                secureTextEntry={!showPasswords}
                style={[styles.input, { borderColor: portalPalette.lineStrong, color: portalPalette.text }]}
                value={currentPassword}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Nueva contraseña</Text>
              <TextInput
                accessibilityLabel="Nueva contraseña"
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={setNewPassword}
                placeholder="Nueva contraseña"
                placeholderTextColor={portalPalette.mutedSoft}
                secureTextEntry={!showPasswords}
                style={[styles.input, { borderColor: portalPalette.lineStrong, color: portalPalette.text }]}
                value={newPassword}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Confirmar contraseña</Text>
              <TextInput
                accessibilityLabel="Confirmar nueva contraseña"
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={setConfirmPassword}
                placeholder="Repite la nueva contraseña"
                placeholderTextColor={portalPalette.mutedSoft}
                secureTextEntry={!showPasswords}
                style={[styles.input, { borderColor: portalPalette.lineStrong, color: portalPalette.text }]}
                value={confirmPassword}
              />
            </View>
          </View>

          {showRequirements ? (
            <View style={styles.requirementsGrid}>
              {requirements.map((item) => (
                <View key={item.label} style={styles.requirementRow}>
                  <MaterialCommunityIcons
                    name={item.ok ? 'check-circle' : 'circle-outline'}
                    size={16}
                    color={item.ok ? portalPalette.success : portalPalette.muted}
                  />
                  <Text style={[styles.requirementText, item.ok ? { color: portalPalette.success } : undefined]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.actions}>
            <PortalButton disabled={isSubmitting} onPress={cancelEditing} size="sm" variant="secondary">
              Cancelar
            </PortalButton>
            <PortalButton
              disabled={!canSubmit}
              icon="lock-check-outline"
              loading={isSubmitting}
              onPress={() => void submit()}>
              Guardar contraseña
            </PortalButton>
          </View>
        </View>
      ) : null}
    </PortalSectionCard>
  );
}
