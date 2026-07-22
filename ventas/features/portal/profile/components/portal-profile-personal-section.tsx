import { TextInput, View } from 'react-native';
import { palette } from '@/constants/theme';
import { PortalSectionCard } from '../../cards';
import { styles } from '../profile.styles';
import type { ProfileForm } from '../profile.types';

type PortalProfilePersonalSectionProps = {
  form: ProfileForm;
  message: string | null;
  onFieldChange: (field: keyof ProfileForm, value: string) => void;
};

export function PortalProfilePersonalSection({ form, message, onFieldChange }: PortalProfilePersonalSectionProps) {
  return (
    <PortalSectionCard title="Datos personales" subtitle={message || undefined}>
      <View style={styles.formGrid}>
        {(['name', 'email', 'phone'] as const).map((field) => (
          <TextInput
            key={field}
            value={form[field]}
            onChangeText={(value) => onFieldChange(field, value)}
            placeholder={field === 'name' ? 'Nombre' : field === 'email' ? 'Correo' : 'Telefono'}
            accessibilityLabel={field === 'name' ? 'Nombre' : field === 'email' ? 'Correo' : 'Teléfono'}
            placeholderTextColor={palette.muted}
            autoCapitalize={field === 'email' ? 'none' : 'sentences'}
            style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
          />
        ))}
      </View>
    </PortalSectionCard>
  );
}
