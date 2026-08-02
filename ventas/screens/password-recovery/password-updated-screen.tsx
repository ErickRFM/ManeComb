import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { readCheckoutContext } from '@/src/utils/checkout-context';
import { AuthFeedback } from '@/screens/auth/components/auth-feedback';
import { AuthSubmitButton } from '@/screens/auth/components/auth-submit-button';
import { authStyles as s } from '@/screens/auth/auth.styles';
import { PasswordRecoveryLayout } from './password-recovery-layout';
import { buildRecoveryRoute, resolveRecoveryCheckoutContext } from './password-recovery.utils';

export function PasswordUpdatedScreen() {
  const params = useLocalSearchParams<{ planId?: string | string[]; trial?: string | string[] }>();
  const context = resolveRecoveryCheckoutContext(params.planId, params.trial, readCheckoutContext());
  const loginRoute = buildRecoveryRoute('/ventas/login', context);
  return (
    <PasswordRecoveryLayout title="Contraseña actualizada" subtitle="Tu contraseña se cambió correctamente. Las sesiones anteriores fueron cerradas.">
      <AuthFeedback tone="success" message="Ya puedes iniciar sesión con tu nueva contraseña." />
      <AuthSubmitButton label="Iniciar sesión" submitting={false} disabled={false} onSubmit={() => router.replace(loginRoute)} />
      <View style={s.recoveryActions}>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/ventas')}>
          <Text style={s.smallActionText}>Volver a ventas</Text>
        </Pressable>
      </View>
    </PasswordRecoveryLayout>
  );
}
