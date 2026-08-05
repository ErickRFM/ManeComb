import { Text, TextInput, View } from 'react-native';
import { palette } from '@/constants/theme';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { styles } from '../profile.styles';
import type { ProfileForm } from '../profile.types';

type PortalProfileCompanySectionProps = {
  form: ProfileForm;
  isSubmitting: boolean;
  onFieldChange: (field: keyof ProfileForm, value: string) => void;
  onSave: () => void;
};

const fields = [
  { key: 'companyName', label: 'Nombre comercial', placeholder: 'Empresa', autoCapitalize: 'words' },
  { key: 'legalName', label: 'Razón social', placeholder: 'Razón social completa', autoCapitalize: 'words' },
  { key: 'taxId', label: 'RFC', placeholder: 'RFC de 12 o 13 caracteres', autoCapitalize: 'characters' },
  { key: 'billingEmail', label: 'Correo fiscal', placeholder: 'facturacion@empresa.com', autoCapitalize: 'none' },
  { key: 'billingAddress', label: 'Dirección fiscal', placeholder: 'Dirección fiscal completa', autoCapitalize: 'sentences' },
] as const;

export function PortalProfileCompanySection({
  form,
  isSubmitting,
  onFieldChange,
  onSave,
}: PortalProfileCompanySectionProps) {
  return (
    <PortalSectionCard title="Datos de empresa" subtitle="Información comercial y fiscal utilizada en tu cuenta.">
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
              keyboardType={field.key === 'billingEmail' ? 'email-address' : 'default'}
              style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
            />
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <PortalButton icon="domain" loading={isSubmitting} onPress={onSave}>
          Guardar datos de empresa
        </PortalButton>
      </View>
    </PortalSectionCard>
  );
}
