import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { portalPalette } from '../../portal-theme';
import { styles } from '../app-mobile.styles';

export type TabKey = 'info' | 'history';

export function AppMobileTabBar({ activeTab, onTabChange }: { activeTab: TabKey; onTabChange: (tab: TabKey) => void }) {
  const tabs: { key: TabKey; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }[] = [
    { key: 'info', icon: 'information-outline', label: 'Información' },
    { key: 'history', icon: 'history', label: 'Historial' },
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          accessibilityRole="button"
          accessibilityState={{ selected: activeTab === tab.key }}
          onPress={() => onTabChange(tab.key)}
          style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}>
          <MaterialCommunityIcons
            name={tab.icon}
            size={16}
            color={activeTab === tab.key ? portalPalette.accent : portalPalette.muted}
          />
          <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
