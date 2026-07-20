import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useSyncWaitStage } from '@/src/hooks/use-sync-wait-stage';
import type { AuthRoutingContext, User } from '@/src/types/app';
import { resolveMobilePostLoginRoute } from '@/src/utils/account-routing';
import { getSalesPortalPathForBlockReason, openSalesPortal } from '@/src/utils/sales-portal';
import { SYNC_ERROR_BODY, SYNC_ERROR_TITLE } from '@/src/utils/sync-copy';
import { BrandSyncLoader } from '@/src/components/brand-sync-loader';
import { mapStyles as styles } from '../map-styles';

type MapDataRecoveryProps = {
  authContext: AuthRoutingContext | null;
  error?: string | null;
  isRefreshing: boolean;
  isSigningOut?: boolean;
  onRefresh: () => void;
  onResetSession: () => void;
  user: User;
};

export function MapDataRecovery({
  authContext,
  error,
  isRefreshing,
  isSigningOut = false,
  onRefresh,
  onResetSession,
  user,
}: MapDataRecoveryProps) {
  const { theme } = useAppTheme();
  const waitStage = useSyncWaitStage(!isSigningOut && !error);
  const resolution = resolveMobilePostLoginRoute({
    authContext,
    error: error && !authContext ? error : undefined,
    user,
  });
  const isBlocked = resolution.destination === 'PlanBlocked';
  const isOnboarding = resolution.destination === 'OperationalOnboarding';
  const isSyncError = !isBlocked && !isOnboarding;
  const recoveryTitle = isBlocked && resolution.reason === 'payment_pending'
    ? 'Pago pendiente'
    : isBlocked && resolution.reason === 'no_plan'
      ? 'Activa tu plan'
      : isBlocked && resolution.reason === 'missing_tenant'
        ? 'Completa tu configuración'
        : isBlocked
          ? 'Plan no activo'
          : isOnboarding
            ? 'Completa tu configuración'
            : SYNC_ERROR_TITLE;
  const recoveryMessage = isBlocked && resolution.reason === 'payment_pending'
    ? 'Tu pago aún no se ha confirmado. Revisa tu cuenta desde el portal web.'
    : isBlocked && resolution.reason === 'no_plan'
      ? 'Tu cuenta esta creada, pero aun no tienes un plan activo.'
      : isBlocked && resolution.reason === 'missing_tenant'
        ? 'Tu plan esta activo. Configura tu empresa para comenzar.'
      : isBlocked
        ? 'Renueva tu plan para volver a operar ManeComb.'
        : isOnboarding
          ? 'Tu plan esta activo. Configura tu empresa para comenzar.'
          : error || SYNC_ERROR_BODY;
  const primaryLabel = isBlocked && resolution.reason === 'payment_pending'
    ? 'Revisar pago'
    : isBlocked && resolution.reason === 'no_plan'
      ? 'Comprar plan'
      : isBlocked
        ? 'Renovar plan'
        : isOnboarding
          ? 'Continuar configuracion'
          : 'Reintentar';

  // Cerrar sesion no depende de sincronizar nada.
  if (isSigningOut) {
    return <BrandSyncLoader message="Cerrando sesión..." />;
  }

  // Sin error confirmado la sincronizacion sigue en curso: mostramos carga real
  // hasta que la peticion falle de verdad o se agote el timeout de arranque en
  // frio, nunca la pantalla de error mientras el request sigue pendiente.
  if (isSyncError && !error && waitStage !== 'expired') {
    return <BrandSyncLoader stage={waitStage === 'slow' ? 'slow' : 'loading'} />;
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.recoveryRoot}>
        <View
          style={[
            styles.recoveryIcon,
            {
              backgroundColor: theme.colors.accentSoft,
              borderColor: theme.colors.line,
            },
          ]}>
          <MaterialCommunityIcons name="map-marker-off-outline" size={30} color={theme.colors.accent} />
        </View>
        <Text style={[styles.recoveryTitle, { color: theme.colors.text }]}>{recoveryTitle}</Text>
        <Text style={[styles.recoveryMessage, { color: theme.colors.muted }]}>
          {recoveryMessage}
        </Text>
        <View style={styles.recoveryActions}>
          <Pressable
            onPress={() => {
              if (isBlocked) {
                openSalesPortal(getSalesPortalPathForBlockReason(resolution.reason)).catch(() => undefined);
                return;
              }

              if (isOnboarding) {
                router.replace('/perfil-editar');
                return;
              }

              onRefresh();
            }}
            style={({ pressed }) => [
              styles.recoveryPrimaryButton,
              { backgroundColor: theme.colors.accent },
              pressed ? styles.recoveryPressed : undefined,
            ]}>
            <Text style={styles.recoveryPrimaryText}>{primaryLabel}</Text>
          </Pressable>
          {/*
            En el caso de sincronizacion el boton primario ya es "Reintentar":
            un secundario que llama al mismo `onRefresh` solo duplicaba la
            accion. Se conserva para los casos de plan/onboarding, donde el
            primario abre el portal de ventas y reintentar sigue teniendo
            sentido.
          */}
          {!isSyncError ? (
            <Pressable
              onPress={onRefresh}
              disabled={isRefreshing}
              style={({ pressed }) => [
                styles.recoverySecondaryButton,
                { borderColor: theme.colors.line, backgroundColor: theme.colors.surface },
                pressed && !isRefreshing ? styles.recoveryPressed : undefined,
                isRefreshing ? styles.recoveryDisabled : undefined,
              ]}>
              {isRefreshing ? (
                <MaterialCommunityIcons name="sync" size={18} color={theme.colors.accent} />
              ) : null}
              <Text style={[styles.recoverySecondaryText, { color: theme.colors.text }]}>
                {isRefreshing ? 'Sincronizando...' : 'Reintentar'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onResetSession}
            style={({ pressed }) => [
              styles.recoveryGhostButton,
              pressed ? styles.recoveryPressed : undefined,
            ]}>
            <Text style={[styles.recoveryGhostText, { color: theme.colors.muted }]}>
              Cerrar sesión
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
