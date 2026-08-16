import { Text, TextInput, View } from 'react-native';
import { palette } from '@/constants/theme';
import { router } from '@/src/navigation/router';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { styles } from '../profile.styles';
import type { ProfileForm } from '../profile.types';

type PortalProfileCompanySectionProps = {
  canViewBilling: boolean;
  form: ProfileForm;
  isSubmitting: boolean;
  message: string | null;
  onFieldChange: (field: keyof ProfileForm, value: string) => void;
  onSave: () => void;
};

const companyFields = [
  { key: 'companyName', label: 'Nombre comercial', placeholder: 'Empresa', autoCapitalize: 'words' },
  { key: 'legalName', label: 'Razón social', placeholder: 'Razón social completa', autoCapitalize: 'words' },
] as const;

const billingFields = [
  { key: 'taxId', label: 'RFC', placeholder: 'RFC de 12 o 13 caracteres', autoCapitalize: 'characters' },
  { key: 'billingEmail', label: 'Correo fiscal', placeholder: 'facturacion@empresa.com', autoCapitalize: 'none' },
  { key: 'billingAddress', label: 'Dirección fiscal', placeholder: 'Dirección fiscal completa', autoCapitalize: 'sentences' },
] as const;

function ProfileField({
  field,
  form,
  onFieldChange,
}: {
  field: (typeof companyFields)[number] | (typeof billingFields)[number];
  form: ProfileForm;
  onFieldChange: (field: keyof ProfileForm, value: string) => void;
}) {
  return (
    <View style={styles.fieldGroup}>
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
  );
}

export function PortalProfileCompanySection({
  canViewBilling,
  form,
  isSubmitting,
  message,
  onFieldChange,
  onSave,
}: PortalProfileCompanySectionProps) {
  return (
    <PortalSectionCard
      title="Empresa y facturación"
      subtitle={message || 'Datos comerciales y fiscales utilizados por tu cuenta.'}>
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionHeading}>Empresa</Text>
          <Text style={styles.sectionDescription}>Identidad comercial que se muestra en la operación de ManeComb.</Text>
        </View>
        <View style={styles.formGrid}>
          {companyFields.map((field) => (
            <ProfileField key={field.key} field={field} form={form} onFieldChange={onFieldChange} />
          ))}
        </View>
      </View>

      <View style={styles.sectionDivider} />

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionHeading}>Facturación</Text>
            <Text style={styles.sectionDescription}>Información fiscal usada para comprobantes y descargas.</Text>
          </View>
          {canViewBilling ? (
            <PortalButton
              icon="file-document-outline"
              onPress={() => router.push('/portal/facturacion' as never)}
              size="sm"
              variant="secondary">
              Ver facturas
            </PortalButton>
          ) : null}
        </View>
        <View style={styles.formGrid}>
          {billingFields.map((field) => (
            <ProfileField key={field.key} field={field} form={form} onFieldChange={onFieldChange} />
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <PortalButton icon="content-save-outline" loading={isSubmitting} onPress={onSave}>
          Guardar empresa y facturación
        </PortalButton>
      </View>
    </PortalSectionCard>
  );
}
