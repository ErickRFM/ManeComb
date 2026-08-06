import { StyleSheet, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { mapStyles as styles } from '../map-styles';
import { getTrackingHudRouteSummary } from '../utils/tracking';

type TrackingHudProps = {
  activeRouteCount: number;
  unknownStateCount: number;
  incidentCount: number;
  locationStatusColor: string;
  locationStatusLabel: string;
  serverSyncColor: string;
  serverSyncLabel: string;
  onOpenMenu: () => void;
  paddingTop: number;
  trafficEnabled: boolean;
};

const COMPACT_HUD_BREAKPOINT = 430;

export function TrackingHud({
  activeRouteCount,
  unknownStateCount,
  incidentCount,
  locationStatusColor,
  locationStatusLabel,
  serverSyncColor,
  serverSyncLabel,
  onOpenMenu,
  paddingTop,
  trafficEnabled,
}: TrackingHudProps) {
  const { theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < COMPACT_HUD_BREAKPOINT;
  const routeSummary = getTrackingHudRouteSummary(activeRouteCount, unknownStateCount);
  const items = [
    {
      label: routeSummary.active.label,
      value: routeSummary.active.value,
      icon: 'bus' as const,
      color: theme.colors.success,
    },
    {
      label: routeSummary.unknown.label,
      value: routeSummary.unknown.value,
      icon: 'help-circle-outline' as const,
      color: unknownStateCount ? theme.colors.warning : theme.colors.muted,
    },
    {
      label: 'GPS local',
      value: locationStatusLabel,
      icon: 'crosshairs-gps' as const,
      color: locationStatusColor,
    },
    {
      label: 'GPS unidad',
      value: serverSyncLabel,
      icon: 'bus-marker' as const,
      color: serverSyncColor,
    },
  ];

  return (
    <View
      style={[styles.topOverlay, { paddingTop }]}
      accessibilityLabel={`Seguimiento. ${routeSummary.active.label}: ${routeSummary.active.value}. ${routeSummary.unknown.label}: ${routeSummary.unknown.value}. GPS local: ${locationStatusLabel}. GPS de unidad asignada: ${serverSyncLabel}. Tráfico ${trafficEnabled ? 'activado' : 'desactivado'}.`}>
      <View style={styles.topBar}>
        <Pressable
          hitSlop={10}
          onPress={() => router.push('/incidencias')}
          style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}
          accessibilityLabel="Abrir incidencias">
          <MaterialCommunityIcons name={incidentCount ? 'alert-decagram' : 'alert-outline'} size={22} color={incidentCount ? theme.colors.danger : theme.colors.text} />
        </Pressable>

        <View
          style={[
            styles.hud,
            compact ? compactStyles.hud : undefined,
            { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line },
          ]}>
          {items.map((item, index) => (
            <View
              key={item.label}
              style={[
                compactStyles.itemShell,
                index > 0 ? { borderLeftColor: theme.colors.line, borderLeftWidth: StyleSheet.hairlineWidth } : undefined,
              ]}>
              <HUDItem {...item} compact={compact} />
            </View>
          ))}
        </View>

        <Pressable
          hitSlop={10}
          onPress={onOpenMenu}
          style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}
          accessibilityLabel="Abrir menu operativo">
          <MaterialCommunityIcons name="menu" size={22} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

function HUDItem({
  color,
  compact,
  icon,
  label,
  value,
}: {
  color: string;
  compact: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
}) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.hudItem, compact ? compactStyles.hudItem : undefined]}>
      {!compact ? <MaterialCommunityIcons name={icon} size={14} color={color} /> : null}
      <View style={[styles.hudTextBlock, compact ? compactStyles.textBlock : undefined]}>
        <Text
          style={[
            styles.hudLabel,
            compact ? compactStyles.label : undefined,
            { color: compact ? color : theme.colors.muted },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}>
          {label}
        </Text>
        <Text
          style={[styles.hudValue, compact ? compactStyles.value : undefined, { color: theme.colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const compactStyles = StyleSheet.create({
  hud: {
    paddingHorizontal: 2,
  },
  itemShell: {
    flex: 1,
    minWidth: 0,
  },
  hudItem: {
    justifyContent: 'center',
    gap: 0,
    paddingHorizontal: 3,
  },
  textBlock: {
    alignItems: 'center',
  },
  label: {
    fontSize: 8,
    lineHeight: 10,
    textAlign: 'center',
  },
  value: {
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
  },
});
