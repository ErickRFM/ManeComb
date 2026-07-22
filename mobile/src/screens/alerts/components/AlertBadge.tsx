import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { IncidentIcon, SeverityVisualStyle } from '../constants/alerts.constants';

export function AlertBadge({
  icon,
  label,
  visualStyle,
}: {
  icon?: IncidentIcon;
  label: string;
  visualStyle: SeverityVisualStyle;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: visualStyle.backgroundColor }]}>
      {icon ? <MaterialCommunityIcons name={icon} size={13} color={visualStyle.color} /> : null}
      <Text style={[styles.label, { color: visualStyle.color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  label: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '900',
  },
});
