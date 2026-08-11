import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';

import {
  REGISTRATION_PASSWORD_REQUIREMENTS,
  type RegistrationPasswordChecks,
} from '../auth.utils';
import { authStyles as s } from '../auth.styles';

type Props = {
  checks: RegistrationPasswordChecks;
  confirmation: string;
  password: string;
};

export function AuthPasswordRequirements({ checks, confirmation, password }: Props) {
  const confirmationStarted = confirmation.length > 0;
  const passwordsMatch = confirmationStarted && confirmation === password;
  const confirmationMismatch = confirmationStarted && !passwordsMatch;

  return (
    <View
      accessibilityLabel="Requisitos de contraseña"
      accessibilityRole="summary"
      style={s.passwordRequirements}>
      <Text style={s.passwordRequirementsTitle}>Tu contraseña debe tener:</Text>

      {REGISTRATION_PASSWORD_REQUIREMENTS.map((requirement) => {
        const met = checks[requirement.key];
        return (
          <View key={requirement.key} style={s.passwordRequirementRow}>
            <MaterialCommunityIcons
              name={met ? 'check-circle-outline' : 'circle-outline'}
              size={16}
              color={met ? '#9AE6B4' : 'rgba(216, 226, 245, 0.58)'}
            />
            <Text style={[s.passwordRequirementText, met ? s.passwordRequirementMet : undefined]}>
              {requirement.label}
            </Text>
          </View>
        );
      })}

      <View style={s.passwordRequirementRow}>
        <MaterialCommunityIcons
          name={passwordsMatch ? 'check-circle-outline' : confirmationMismatch ? 'alert-circle-outline' : 'circle-outline'}
          size={16}
          color={passwordsMatch ? '#9AE6B4' : confirmationMismatch ? '#FFB4C8' : 'rgba(216, 226, 245, 0.58)'}
        />
        <Text
          style={[
            s.passwordRequirementText,
            passwordsMatch ? s.passwordRequirementMet : undefined,
            confirmationMismatch ? s.passwordRequirementError : undefined,
          ]}>
          {confirmationMismatch ? 'Las contraseñas no coinciden' : 'Las contraseñas coinciden'}
        </Text>
      </View>
    </View>
  );
}
