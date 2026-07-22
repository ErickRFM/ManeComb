import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, ScrollView, Text } from 'react-native';
import { FILTERS, type IncidentFilterKey } from '../constants/alerts.constants';

export function AlertFilters({ activeFilter, onChange, styles, theme }: { activeFilter: IncidentFilterKey; onChange: (filter: IncidentFilterKey) => void; styles: any; theme: any }) {
  return (
    <ScrollView horizontal contentContainerStyle={styles.filtersContent} showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
      {FILTERS.map((filter) => {
        const isActive = filter.key === activeFilter;
        return (
          <Pressable accessibilityRole="button" key={filter.key} onPress={() => onChange(filter.key)} style={[styles.filterChip, isActive ? styles.filterChipActive : undefined]}>
            <MaterialCommunityIcons name={filter.icon} size={14} color={isActive ? theme.colors.info : theme.colors.muted} />
            <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : undefined]}>{filter.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
