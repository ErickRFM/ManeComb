import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTheme, DesignSystem, Typography } from '@/constants/theme';
import { StatusBar } from '@/src/native/status-bar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';

export function AccountSuspendedScreen() {
  const { theme } = useAppTheme();

  const returnToLogin = () => {
    useAppStore.setState({ accountSuspended: false });
    router.replace('/login');
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.content}>
        <View style={[styles.icon, { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.line }]}>
          <MaterialCommunityIcons name="account-lock-outline" size={DesignSystem.icon.xl} color={theme.colors.danger} />
        </View>
        <Text style={[styles.title, { color: theme.colors.text }]}>Acceso suspendido</Text>
        <Text style={[styles.body, { color: theme.colors.muted }]}>
          Tu cuenta fue dada de baja por el administrador de la empresa. Contacta a tu empresa si consideras que se trata de un error.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={returnToLogin}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.colors.accent },
            pressed ? styles.pressed : undefined,
          ]}>
          <Text style={styles.buttonText}>Volver al inicio</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.body.size,
    lineHeight: DesignSystem.typography.body.lineHeight,
    maxWidth: 360,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: DesignSystem.radius.control,
    justifyContent: 'center',
    marginTop: AppTheme.spacing.lg,
    minHeight: DesignSystem.control.md,
  },
  buttonText: {
    color: AppTheme.colors.text,
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.body.size,
    fontWeight: DesignSystem.typography.subtitle.weight,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 430,
    width: '100%',
  },
  icon: {
    alignItems: 'center',
    borderRadius: DesignSystem.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    height: DesignSystem.control.lg,
    justifyContent: 'center',
    marginBottom: AppTheme.spacing.md,
    width: DesignSystem.control.lg,
  },
  pressed: {
    opacity: DesignSystem.opacity.pressed,
  },
  screen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: AppTheme.spacing.lg,
  },
  title: {
    fontFamily: Typography.display,
    fontSize: DesignSystem.typography.title.size,
    fontWeight: DesignSystem.typography.title.weight,
    lineHeight: DesignSystem.typography.title.lineHeight,
    marginBottom: AppTheme.spacing.sm,
    textAlign: 'center',
  },
});
