import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import type { useAppTheme } from '@/src/hooks/use-app-theme';
import type { ChatDirectoryContact, ConversationSummary } from '@/src/types/app';
import { formatRole } from '@/src/utils/format';
import { getPresenceStatus, type PresenceMap } from '@/src/utils/presence';
import { getTextInputProps } from '@/src/utils/text-input-props';
import type { createStyles } from '../radio-screen.styles';
import { getConversationContact } from '../utils/radio-format';

export function RadioDirectoryPage({
  activeChannelId,
  channels,
  contacts,
  currentUserId,
  hoveredItemId,
  onHoverItem,
  onOpenDirectContact,
  onOpenGeneralRadio,
  onSearchChange,
  onSelectChannel,
  presenceByUser,
  search,
  styles,
  theme,
}: {
  activeChannelId: string | null;
  channels: ConversationSummary[];
  contacts: ChatDirectoryContact[];
  currentUserId: string;
  hoveredItemId: string | null;
  onHoverItem: (itemId: string | null) => void;
  onOpenDirectContact: (contactId: string) => void;
  onOpenGeneralRadio: () => void;
  onSearchChange: (value: string) => void;
  onSelectChannel: (channelId: string) => void;
  presenceByUser: PresenceMap;
  search: string;
  styles: ReturnType<typeof createStyles>;
  theme: ReturnType<typeof useAppTheme>['theme'];
}) {
  return (
    <View style={styles.directoryPanel}>
      <View style={styles.searchShell}>
        <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.muted} />
        <TextInput
          {...getTextInputProps(theme, { autoComplete: 'off', returnKeyType: 'search' })}
          value={search}
          onChangeText={onSearchChange}
          placeholder="Buscar canal o contacto"
          placeholderTextColor={theme.colors.muted}
          style={styles.searchInput}
        />
      </View>

      <Pressable onPress={() => { onOpenGeneralRadio(); }} style={styles.quickActionCard}>
        <View style={styles.quickActionLead}>
          <MaterialCommunityIcons name="radio-tower" size={20} color="#FFFFFF" />
          <Text style={styles.quickActionTitle}>Abrir radio general</Text>
        </View>
        <MaterialCommunityIcons name="radio-handheld" size={22} color="#FFFFFF" />
      </Pressable>

      <ScrollView
        style={styles.directoryScroll}
        contentContainerStyle={styles.directoryContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.sectionBlock}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Canales</Text>
            <StatusPill label={`${channels.length}`} tone="info" />
          </View>

          {channels.map((channel) => {
            const contact = getConversationContact(channel, currentUserId);
            const isActive = channel.id === activeChannelId;
            const connectedCount = channel.participants.length;
            const channelStatus = channel.unreadCount ? 'Nuevo audio' : 'En espera';

            return (
              <Pressable
                key={channel.id}
                onHoverIn={Platform.OS === 'web' ? () => onHoverItem(channel.id) : undefined}
                onHoverOut={Platform.OS === 'web' ? () => onHoverItem(null) : undefined}
                onPress={() => { onSelectChannel(channel.id); }}
                style={[
                  styles.channelCard,
                  isActive ? styles.channelCardActive : undefined,
                  hoveredItemId === channel.id ? styles.listCardHover : undefined,
                ]}>
                <View style={styles.channelRow}>
                  <View style={styles.channelAvatar}>
                    <MaterialCommunityIcons
                      name={channel.kind === 'group' ? 'radio-handheld' : 'radio'}
                      size={20}
                      color={isActive ? '#FFFFFF' : theme.colors.accent}
                    />
                  </View>
                  <View style={styles.channelCopy}>
                    <Text style={styles.channelTitle} numberOfLines={1}>{channel.title}</Text>
                    <Text style={styles.channelMeta} numberOfLines={1}>
                      {contact ? formatRole(contact.role) : 'Canal'}
                      {` - ${channelStatus}`}
                      {connectedCount ? ` - ${connectedCount} usuarios` : ''}
                    </Text>
                  </View>
                  <View style={styles.channelStatusDot} />
                  {channel.unreadCount ? (
                    <View style={styles.unreadBubble}>
                      <Text style={styles.unreadBubbleText}>{channel.unreadCount}</Text>
                    </View>
                  ) : null}
                  <View style={styles.channelActionIcon}>
                    <MaterialCommunityIcons name="radio" size={16} color={theme.colors.accent} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {contacts.length ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Directo rápido</Text>
            <StatusPill label={`${contacts.length}`} tone="info" />
          </View>

          {contacts.map((contact) => (
            <Pressable
              key={contact.id}
              onHoverIn={Platform.OS === 'web' ? () => onHoverItem(`contact-${contact.id}`) : undefined}
              onHoverOut={Platform.OS === 'web' ? () => onHoverItem(null) : undefined}
              onPress={() => { onOpenDirectContact(contact.id); }}
              style={[
                styles.contactRow,
                hoveredItemId === `contact-${contact.id}` ? styles.listCardHover : undefined,
              ]}>
              <View style={styles.contactLead}>
                <UserAvatar user={contact} status={getPresenceStatus(presenceByUser, contact.id)} showStatus size={42} />
                <View style={styles.contactCopy}>
                  <Text style={styles.contactTitle}>{contact.name}</Text>
                </View>
              </View>
              <View style={styles.contactActionButton}>
                <MaterialCommunityIcons name="radio" size={18} color="#FFFFFF" />
              </View>
            </Pressable>
          ))}
        </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
