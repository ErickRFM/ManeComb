import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { portalPalette } from '../portal-theme';
import type { PortalActivationEvent } from '@/src/types/app';
import { formatPortalStatus } from './format-portal-status';
import { getStatusTone } from './get-portal-status-tone';

export function ActivationTimeline({ events, limit }: { events: PortalActivationEvent[]; limit?: number }) {
  const theme = { colors: portalPalette };
  const visible = typeof limit === 'number' ? events.slice(0, limit) : events;

  return (
    <View style={styles.timeline}>
      {visible.map((event) => {
        const done = event.status === 'completed';

        return (
          <View key={event.id} style={styles.timelineItem}>
            <View
              style={[
                styles.timelineDot,
                {
                  backgroundColor: done ? portalPalette.success : portalPalette.surfaceSoft,
                  borderColor: done ? portalPalette.success : portalPalette.line,
                },
              ]}>
              <MaterialCommunityIcons
                name={done ? 'check' : 'clock-outline'}
                size={14}
                color={done ? '#FFFFFF' : theme.colors.muted}
              />
            </View>
            <View style={styles.timelineContent}>
              <View style={styles.row}>
                <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={2}>{event.title}</Text>
                <StatusBadge label={formatPortalStatus(event.status)} tone={getStatusTone(event.status)} />
              </View>
              {event.description ? <Text style={[styles.itemDescription, { color: theme.colors.muted }]} numberOfLines={3}>{event.description}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: {
    gap: 10,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 10,
  },
  timelineDot: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    marginTop: 2,
    width: 28,
  },
  timelineContent: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  itemTitle: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
    minWidth: 0,
  },
  itemDescription: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
  },
});
