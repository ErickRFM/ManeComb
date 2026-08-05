import { Text, TextInput, View } from 'react-native';
import { palette } from '@/constants/theme';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { styles } from '../profile.styles';
import type { ProfileForm } from '../profile.types';

type PortalProfilePersonalSectionProps = {
  form: ProfileForm;
  isSubmitting: boolean;
  message: string | null;
  onFieldChange: (field: keyof ProfileForm, value: string) => void;
  onSave: () => void;
};

const fields = [
  { key: 'name', label: 'Nombre completo', placeholder: 'Nombre completo', autoCapitalize: 'words' },
  { key: 'email', label: 'Correo de acceso', placeholder: 'correo@empresa.com', autoCapitalize: 'none' },
  { key: 'phone', label: 'Teléfono', placeholder: 'Número de contacto', autoCapitalize: 'none' },
] as const;

export function PortalProfilePersonalSection({
  form,
  isSubmitting,
  message,
  onFieldChange,
  onSave,
}: PortalProfilePersonalSectionProps) {
  return (
    <PortalSectionCard title="Datos personales" subtitle={message || 'Información principal de la cuenta administrativa.'}>
      <View style={styles.formGrid}>
        {fields.map((field) => (
          <View key={field.key} style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <TextInput
              value={form[field.key]}
              onChangeText={(value) => onFieldChange(field.key, value)}
              placeholder={field.placeholder}
              accessibilityLabel={field.label}
              placeholderTextColor={palette.muted}
              autoCapitalize={field.autoCapitalize}
              keyboardType={field.key === 'phone' ? 'phone-pad' : field.key === 'email' ? 'email-address' : 'default'}
              style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
            />
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <PortalButton icon="account-check-outline" loading={isSubmitting} onPress={onSave}>
          Guardar datos personales
        </PortalButton>
      </View>
    </PortalSectionCard>
  );
}
