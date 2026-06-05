import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';

export function ConnectionBanner() {
  const { theme } = useAppTheme();
  const { networkStatus, pendingSyncCount, socketStatus } = useAppStore(
    useShallow((state) => ({
      networkStatus: state.networkStatus,
      pendingSyncCount: state.pendingSyncCount,
      socketStatus: state.socketStatus,
    }))
  );

  const offline = networkStatus === 'offline';
  const recovering = networkStatus === 'recovering' || socketStatus === 'reconnecting';

  if (!offline && !recovering && pendingSyncCount === 0) {
    return null;
  }

  const label = offline
    ? 'Sin conexion. Operando con datos guardados.'
    : pendingSyncCount > 0
      ? 'Sincronizando pendientes...'
      : 'Reconectando servicios en tiempo real...';

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: offline ? theme.colors.warningSoft : theme.colors.infoSoft,
          borderColor: offline ? theme.colors.warning : theme.colors.info,
        },
      ]}>
      <MaterialCommunityIcons
        name={offline ? 'wifi-off' : 'sync'}
        size={16}
        color={offline ? theme.colors.warning : theme.colors.info}
      />
      <Text
        numberOfLines={2}
        style={[
          styles.text,
          {
            color: offline ? theme.colors.warning : theme.colors.info,
          },
        ]}>
        {pendingSyncCount > 0 ? `${label} (${pendingSyncCount})` : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
});
