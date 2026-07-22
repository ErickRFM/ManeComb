import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { StatusPill } from '@/src/components/status-pill';
import type { useAppTheme } from '@/src/hooks/use-app-theme';
import type { ChatMessage } from '@/src/types/app';
import { getPresenceStatus, type PresenceMap } from '@/src/utils/presence';
import type { AudioFilter } from '../types';
import type { createStyles } from '../radio-screen.styles';
import { VoiceTransmissionCard } from './radio-transmission-card';

export function RadioAudiosPage({
  activeFilter,
  filters,
  onFilterChange,
  presenceByUser,
  styles,
  theme,
  token,
  voiceNotes,
}: {
  activeFilter: AudioFilter;
  filters: { key: AudioFilter; label: string }[];
  onFilterChange: (filter: AudioFilter) => void;
  presenceByUser: PresenceMap;
  styles: ReturnType<typeof createStyles>;
  theme: ReturnType<typeof useAppTheme>['theme'];
  token: string | null;
  voiceNotes: { id: string; channelId: string; channelTitle: string; message: ChatMessage }[];
}) {
  return (
    <View style={styles.historyPanel}>
      <View style={styles.audioPageHeader}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Audios</Text>
          <StatusPill label={`${voiceNotes.length}`} tone="info" />
        </View>

        {filters.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}>
            {filters.map((filter) => (
              <Pressable
                key={filter.key}
                onPress={() => onFilterChange(filter.key)}
                style={[
                  styles.filterChip,
                  activeFilter === filter.key ? styles.filterChipActive : undefined,
                ]}>
                <Text
                  style={[
                    styles.filterChipText,
                    activeFilter === filter.key ? styles.filterChipTextActive : undefined,
                  ]}>
                  {filter.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <FlatList
        data={voiceNotes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.historyContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <VoiceTransmissionCard
            message={item.message}
            presence={getPresenceStatus(presenceByUser, item.message.sender?.id)}
            channelTitle={item.channelTitle}
            token={token}
            theme={theme}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconShell}>
              <MaterialCommunityIcons name="radio-handheld" size={28} color={theme.colors.muted} />
            </View>
            <Text style={styles.emptyTitle}>Sin audios</Text>
          </View>
        }
      />
    </View>
  );
}
