import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { portalButtonGradient, portalPalette } from '../../portal-theme';
import { styles } from '../app-mobile.styles';
import type { PortalAppVersion } from '../../types';

function VersionTimelineItem({
  ver,
  isFirst,
  isLast,
  expanded,
  onToggle,
  onDownload,
  compact,
}: {
  ver: PortalAppVersion;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDownload?: () => void;
  compact: boolean;
}) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLine}>
        <View style={[styles.timelineDot, ver.current ? styles.timelineDotCurrent : styles.timelineDotPast]} />
        {!isLast && <View style={styles.timelineConnector} />}
      </View>
      <View style={[styles.timelineContent, compact ? styles.timelineContentCompact : undefined]}>
        <View style={styles.timelineHeader}>
          <View style={styles.timelineVersionWrap}>
            <Text style={styles.timelineVersion}>v{ver.version}</Text>
            <Text style={styles.timelineDate}>{ver.date}</Text>
          </View>
          <View style={styles.timelineBadgeWrap}>
            {ver.current && <StatusBadge label="ACTUAL" tone="positive" />}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Contraer notas' : 'Expandir notas'}
              onPress={onToggle}
              style={styles.expandButton}>
              <MaterialCommunityIcons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={portalPalette.muted}
              />
            </Pressable>
          </View>
        </View>
        <View style={styles.timelineMeta}>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="android" size={12} color={portalPalette.info} />
            <Text style={styles.metaPillSmall}>{ver.androidMin}</Text>
          </View>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="harddisk" size={12} color={portalPalette.info} />
            <Text style={styles.metaPillSmall}>{ver.size}</Text>
          </View>
        </View>
        {expanded && ver.notes.length > 0 && (
          <View style={styles.timelineNotes}>
            {ver.notes.map((note, i) => (
              <View key={i} style={styles.noteRow}>
                <MaterialCommunityIcons name="check-circle-outline" size={15} color={portalPalette.success} />
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ))}
          </View>
        )}
        {onDownload && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Descargar APK de esta versión"
            onPress={onDownload}
            style={[styles.timelineDlButton, portalButtonGradient()]}>
            <MaterialCommunityIcons name="download" size={16} color="#FFFFFF" />
            <Text style={styles.timelineDlButtonText}>Descargar APK</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function AppMobileVersionTimeline({
  versions,
  expandedVersions,
  onToggleVersion,
  onDownload,
  compact,
}: {
  versions: PortalAppVersion[];
  expandedVersions: Set<string>;
  onToggleVersion: (version: string) => void;
  onDownload?: () => void;
  compact: boolean;
}) {
  return (
    <View style={styles.timelineCard}>
      <Text style={styles.timelineTitle}>Historial de versiones</Text>
      <Text style={styles.timelineSubtitle}>Todas las publicaciones de ManeComb</Text>
      <View style={styles.timelineList}>
        {versions.map((ver, index) => (
          <VersionTimelineItem
            key={ver.version}
            ver={ver}
            isFirst={index === 0}
            isLast={index === versions.length - 1}
            expanded={expandedVersions.has(ver.version)}
            onToggle={() => onToggleVersion(ver.version)}
            onDownload={ver.current ? onDownload : undefined}
            compact={compact}
          />
        ))}
      </View>
    </View>
  );
}
