import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Redirect, router } from '@/src/navigation/router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { StatusBar } from '@/src/native/status-bar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { resolveMobilePostLoginRoute } from '@/src/utils/account-routing';
import type { MobileBlockReason } from '@/src/types/app';
import { getSalesPortalPathForBlockReason, openSalesPortal } from '@/src/utils/sales-portal';

const BLOCK_COPY: Record<MobileBlockReason, {
  action: string;
  body: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
}> = {
  inactive_plan: {
    action: 'Renovar plan',
    body: 'Renueva tu plan para volver a operar ManeComb.',
    icon: 'calendar-alert',
    title: 'Plan no activo',
  },
  missing_tenant: {
    action: 'Continuar configuración',
    body: 'Tu plan está activo. Configura tu empresa para comenzar.',
    icon: 'office-building-cog-outline',
    title: 'Completa tu configuración',
  },
  no_plan: {
    action: 'Comprar plan',
    body: 'Tu cuenta está creada, pero aún no tienes un plan activo.',
    icon: 'credit-card-plus-outline',
    title: 'Activa tu plan',
  },
  payment_pending: {
    action: 'Revisar pago',
    body: 'Tu pago aún no se ha confirmado. Revisa tu cuenta desde el portal web.',
    icon: 'clock-alert-outline',
    title: 'Pago pendiente',
  },
  sync_error: {
    action: 'Reintentar',
    body: 'Revisa tu conexión e intenta de nuevo.',
    icon: 'sync-alert',
    title: 'No pudimos sincronizar tu cuenta',
  },
};

function getBlockReason(value: string | undefined): MobileBlockReason {
  if (
    value === 'inactive_plan' ||
    value === 'missing_tenant' ||
    value === 'no_plan' ||
    value === 'payment_pending' ||
    value === 'sync_error'
  ) {
    return value;
  }

  return value === 'missing_subscription' ? 'no_plan' : 'inactive_plan';
}

export function MobileAccountGateScreen({ mode = 'blocked' }: { mode?: 'blocked' | 'onboarding' | 'sync' }) {
  const { theme } = useAppTheme();
  const { authContext, error, isRefreshing, refreshAll, signOut, user } = useAppStore(
    useShallow((state) => ({
      authContext: state.authContext,
      error: state.error,
      isRefreshing: state.isRefreshing,
      refreshAll: state.refreshAll,
      signOut: state.signOut,
      user: state.user,
    }))
  );
  const resolution = resolveMobilePostLoginRoute({
    authContext,
    error: mode === 'sync' ? error || true : undefined,
    user,
  });
  const reason = getBlockReason(
    mode === 'onboarding'
      ? 'missing_tenant'
      : mode === 'sync'
        ? 'sync_error'
        : resolution.reason
  );
  const copy = BLOCK_COPY[reason];
  const styles = useMemo(() => createStyles(), []);

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (resolution.destination === 'HomeOperativo' || resolution.destination === 'HomeConductor') {
    return <Redirect href="/mapa" />;
  }

  const handlePrimaryAction = () => {
    if (reason === 'missing_tenant') {
      router.replace('/perfil-editar');
      return;
    }

    if (reason === 'sync_error') {
      refreshAll();
      return;
    }

    openSalesPortal(getSalesPortalPathForBlockReason(reason)).catch(() => {
      refreshAll();
    });
  };

  const handleSignOut = () => {
    signOut().finally(() => router.replace('/login'));
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.line }]}>
          <MaterialCommunityIcons name={copy.icon} size={32} color={theme.colors.accent} />
        </View>
        <Text style={[styles.title, { color: theme.colors.text }]}>{copy.title}</Text>
        <Text style={[styles.body, { color: theme.colors.muted }]}>
          {reason === 'sync_error' && error ? String(error) : copy.body}
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={handlePrimaryAction}
            disabled={isRefreshing}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.colors.accent },
              pressed && !isRefreshing ? styles.pressed : undefined,
              isRefreshing ? styles.disabled : undefined,
            ]}>
            {isRefreshing ? <ActivityIndicator size="small" color={theme.colors.text} /> : null}
            <Text style={styles.primaryText}>{isRefreshing ? 'Sincronizando...' : copy.action}</Text>
          </Pressable>
          {reason !== 'sync_error' ? (
            <Pressable
              onPress={refreshAll}
              disabled={isRefreshing}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: theme.colors.line, backgroundColor: theme.colors.surface },
                pressed && !isRefreshing ? styles.pressed : undefined,
              ]}>
              <Text style={[styles.secondaryText, { color: theme.colors.text }]}>Reintentar</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.ghostButton,
              pressed ? styles.pressed : undefined,
            ]}>
            <Text style={[styles.ghostText, { color: theme.colors.muted }]}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    actions: {
      alignSelf: 'stretch',
      gap: AppTheme.spacing.sm,
      marginTop: AppTheme.spacing.lg,
    },
    body: {
      fontFamily: Typography.body,
      fontSize: 15,
      lineHeight: 22,
      maxWidth: 330,
      textAlign: 'center',
    },
    disabled: {
      opacity: 0.65,
    },
    content: {
      alignItems: 'center',
      justifyContent: 'center',
      maxWidth: 430,
      width: '100%',
    },
    ghostButton: {
      alignItems: 'center',
      borderRadius: 8,
      minHeight: 46,
      justifyContent: 'center',
    },
    ghostText: {
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '700',
    },
    iconWrap: {
      alignItems: 'center',
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      height: 64,
      justifyContent: 'center',
      width: 64,
    },
    pressed: {
      opacity: 0.82,
      transform: [{ scale: 0.99 }],
    },
    primaryButton: {
      alignItems: 'center',
      borderRadius: 8,
      flexDirection: 'row',
      gap: AppTheme.spacing.xs,
      justifyContent: 'center',
      minHeight: 52,
      paddingHorizontal: AppTheme.spacing.lg,
    },
    primaryText: {
      color: '#FFFFFF',
      fontFamily: Typography.body,
      fontSize: 15,
      fontWeight: '800',
    },
    screen: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: AppTheme.spacing.xl,
      paddingVertical: AppTheme.spacing.lg,
    },
    secondaryButton: {
      alignItems: 'center',
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      justifyContent: 'center',
      minHeight: 50,
      paddingHorizontal: AppTheme.spacing.lg,
    },
    secondaryText: {
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '800',
    },
    title: {
      fontFamily: Typography.display,
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: 0,
      marginBottom: AppTheme.spacing.sm,
      marginTop: AppTheme.spacing.lg,
      textAlign: 'center',
    },
  });
}
