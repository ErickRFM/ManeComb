import { TextInput, View } from 'react-native';
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

export function PortalProfileCompanySection({
  form,
  isSubmitting,
  onFieldChange,
  onSave,
}: PortalProfileCompanySectionProps) {
  return (
    <PortalSectionCard title="Datos de empresa" subtitle="Información fiscal y de activación.">
      <View style={styles.formGrid}>
        {(['companyName', 'legalName', 'taxId', 'billingEmail', 'billingAddress'] as const).map((field) => (
          <TextInput
            key={field}
            value={form[field]}
            onChangeText={(value) => onFieldChange(field, value)}
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
            placeholderTextColor={palette.muted}
            autoCapitalize={field === 'billingEmail' ? 'none' : 'sentences'}
            style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <PortalButton icon="content-save-outline" loading={isSubmitting} onPress={onSave}>
          {isSubmitting ? 'Guardando...' : 'Guardar perfil'}
        </PortalButton>
      </View>
    </PortalSectionCard>
  );
}
