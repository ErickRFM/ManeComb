import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme } from '@/constants/theme';
import { ConnectionBanner } from '@/src/components/connection-banner';
import { useAppStore } from '@/src/store/use-app-store';

/** The native map does not use AppShell; cached map data must not hide terminal auth. */
export function MapSessionNotice() {
  const socketStatus = useAppStore((state) => state.socketStatus);
  const insets = useSafeAreaInsets();

  if (socketStatus !== 'unauthorized') return null;

  return (
    <View
      pointerEvents="box-none"
      testID="map-session-notice"
      style={[styles.overlay, { top: insets.top + AppTheme.spacing.sm }]}>
      <ConnectionBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: AppTheme.spacing.sm,
    right: AppTheme.spacing.sm,
    zIndex: 40,
  },
});
