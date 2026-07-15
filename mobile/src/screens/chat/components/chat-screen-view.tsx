import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import { formatRelativeTime, formatRole, formatStatus } from '@/src/utils/format';
import type { ChatDirectoryContact } from '@/src/types/app';
import type { DirectoryMode, LocalTextMessage } from '../types';
import { formatDuration, formatMessageTime, getConversationContact, getConversationDisplayTitle, getConversationIconName, getConversationPresenceLabel, getConversationPreview, getConversationSubline, getMessageDeliveryStatus, getOperationalStatusRank, getOperationalStatusTone, isSystemMessage } from '../utils/conversation';
import { ChatComposer } from './chat-composer';
import { ChatHeader } from './chat-header';
import { CallMediaTile, ImageMessageBubble, MessageDeliveryMeta, VideoMessageBubble, VoiceMessageBubble } from './message-media';
import type { useChatController } from '../hooks/use-chat-controller';

export type ChatScreenViewProps = ReturnType<typeof useChatController>;

export function ChatScreenView(props: ChatScreenViewProps) {
  const {
    activeAudioMessageId,
    activeCallSession,
    activeContact,
    activeConversation,
    activeConversationCallMode,
    activeMessageItems,
    attachmentMenuOpen,
    callElapsedSeconds,
    callNotice,
    callParticipants,
    callStatusLabel,
    callTone,
    canStartRealtimeCall,
    closeActiveCall,
    conversationFilterCounts,
    directoryHelperText,
    directoryItems,
    directoryMode,
    handleMediaPicked,
    handleMessagesContentSizeChange,
    handleMessagesLayout,
    handleMessagesScroll,
    handleOpenDirect,
    handleOpenGeneral,
    handleOpenRadioFromChat,
    handleRetryTextMessage,
    handleSelectConversation,
    handleStartCall,
    isCallMuted,
    isCameraEnabled,
    isCompact,
    isMobileConversation,
    isPhone,
    leadRemoteParticipant,
    localStreamRef,
    messagesListRef,
    optionsMenuOpen,
    setActiveAudioMessageId,
    setAttachmentMenuOpen,
    setCallNotice,
    setDirectoryMode,
    setMobilePane,
    setOptionsMenuOpen,
    showConversationPanel,
    showDirectoryPanel,
    sortedOperationalContacts,
    styles,
    theme,
    toggleCallMute,
    toggleCamera,
    networkStatus,
    socketStatus,
    token,
    typingByConversation,
    user,
  } = props;

  return (
    <AppShell
      scroll={false}
      contentContainerStyle={[
        styles.container,
        isMobileConversation ? styles.containerConversationOnly : undefined,
      ]}
      header={
        isMobileConversation ? null : <ChatHeader {...props} />
      }
      hideMobileToolbar={isMobileConversation}>
      {socketStatus !== 'connected' || networkStatus !== 'online' ? (
        <View style={styles.connectionNotice}>
          <Text style={styles.connectionNoticeText}>
            {networkStatus === 'offline'
              ? 'Sin conexion a Internet'
              : socketStatus === 'connecting' || socketStatus === 'reconnecting'
                ? 'Reconectando...'
                : 'Conexion perdida'}
          </Text>
        </View>
      ) : null}
      <View style={styles.layout}>
        {showDirectoryPanel ? (
          <View style={styles.directoryPanel}>
            <ScrollView
              horizontal
              style={styles.modeRowScroll}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.modeRow}>
              {[
                {
                  key: 'all',
                  label: 'Todo',
                  icon: 'chat-outline',
                  count: conversationFilterCounts.all,
                },
                {
                  key: 'priority',
                  label: 'Prioridad',
                  icon: 'alert-circle-outline',
                  count: conversationFilterCounts.priority,
                },
                {
                  key: 'unread',
                  label: 'No leidos',
                  icon: 'bell-outline',
                  count: conversationFilterCounts.unread,
                },
              ].map(({ key, label, icon, count }) => (
                <Pressable
                  key={key}
                  onPress={() => setDirectoryMode(key as DirectoryMode)}
                  style={[
                    styles.modeChip,
                    directoryMode === key ? styles.modeChipActive : undefined,
                  ]}>
                  <View style={styles.modeChipCopy}>
                    <MaterialCommunityIcons
                      name={icon as any}
                      size={16}
                      color={directoryMode === key ? '#FFFFFF' : theme.colors.muted}
                    />
                    <Text
                      style={[
                        styles.modeChipText,
                        directoryMode === key ? styles.modeChipTextActive : undefined,
                      ]}>
                      {label}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.modeChipCount,
                      directoryMode === key ? styles.modeChipCountActive : undefined,
                    ]}>
                    <Text
                      style={[
                        styles.modeChipCountText,
                        directoryMode === key ? styles.modeChipCountTextActive : undefined,
                      ]}>
                      {count}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            <FlatList
              style={styles.directoryScroll}
              contentContainerStyle={styles.directoryContent}
              data={directoryItems}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Conversaciones</Text>
                  <Text style={styles.sectionHint}>{directoryHelperText}</Text>
                </View>
              }
              renderItem={({ item }) => {
                if (item.type === 'generalShortcut') {
                  return (
                    <Pressable
                      onPress={() => { handleOpenGeneral('chat'); }}
                      style={styles.quickActionCard}>
                      <View style={styles.groupAvatar}>
                        <MaterialCommunityIcons
                          name="bullhorn-outline"
                          size={20}
                          color={theme.colors.info}
                        />
                      </View>
                      <View style={styles.quickActionCopy}>
                        <Text style={styles.quickActionTitle}>General Operativo</Text>
                        <Text style={styles.quickActionBody} numberOfLines={1}>
                          Abrir grupo operativo
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={theme.colors.muted}
                      />
                    </Pressable>
                  );
                }

                if (item.type === 'conversation') {
                  const { conversation } = item;
                  const contact = getConversationContact(conversation, user?.id);
                  const isActive = conversation.id === activeConversation?.id;
                  const preview = getConversationPreview(conversation);

                  return (
                    <Pressable
                      onPress={() => {
                        handleSelectConversation(conversation.id);
                      }}
                      style={[
                        styles.conversationTile,
                        isActive ? styles.conversationTileActive : undefined,
                      ]}>
                      <View style={styles.tileLead}>
                        {conversation.kind === 'direct' && contact ? (
                          <UserAvatar user={contact} status={contact.status} showStatus size={42} />
                        ) : (
                          <View style={styles.groupAvatar}>
                            <MaterialCommunityIcons
                              name={getConversationIconName(conversation)}
                              size={18}
                              color={theme.colors.info}
                            />
                          </View>
                        )}
                        <View style={styles.tileCopy}>
                          <View style={styles.tileTitleRow}>
                            <Text style={styles.tileTitle} numberOfLines={1}>
                              {getConversationDisplayTitle(conversation)}
                            </Text>
                            <Text style={styles.tileTime} numberOfLines={1}>
                              {conversation.lastMessage?.createdAt
                                ? formatRelativeTime(conversation.lastMessage.createdAt)
                                : 'Sin actividad'}
                            </Text>
                          </View>
                          <View style={styles.tilePreviewRow}>
                            <Text style={styles.tilePreview} numberOfLines={1}>
                              {preview}
                            </Text>
                            {conversation.unreadCount ? (
                              <View style={styles.unreadBubble}>
                                <Text style={styles.unreadBubbleText}>{conversation.unreadCount}</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.tileStatusRow}>
                            <View
                              style={[
                                styles.tileStatusDot,
                                getOperationalStatusRank(contact?.status || 'online') === 3
                                  ? styles.tileStatusDotMuted
                                  : undefined,
                              ]}
                            />
                            <Text style={styles.tileStatusText} numberOfLines={1}>
                              {conversation.kind === 'group'
                                ? 'Canal operativo'
                                : getConversationPresenceLabel(conversation, contact)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                }

                if (item.type === 'contact') {
                  const { contact } = item;

                  return (
                    <View style={styles.contactRow}>
                      <View style={styles.tileLead}>
                        <UserAvatar user={contact} status={contact.status} showStatus size={42} />
                        <View style={styles.tileCopy}>
                          <Text style={styles.tileTitle} numberOfLines={1}>
                            {contact.name}
                          </Text>
                          <Text style={styles.tileMeta} numberOfLines={1}>
                            {formatRole(contact.role)} | {formatStatus(contact.status)}
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={() => { handleOpenDirect(contact.id, 'chat'); }}
                        style={styles.contactActionButton}>
                        <MaterialCommunityIcons
                          name="message-text-outline"
                          size={18}
                          color={theme.colors.text}
                        />
                      </Pressable>
                    </View>
                  );
                }

                return (
                  <View style={styles.emptyStateCard}>
                    <MaterialCommunityIcons
                      name="message-badge-outline"
                      size={20}
                      color={theme.colors.muted}
                    />
                    <View style={styles.emptyStateCopy}>
                      <Text style={styles.emptyStateTitle}>Sin conversaciones</Text>
                      <Text style={styles.emptyStateBody}>
                        Ajusta la busqueda o cambia el filtro.
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          </View>
        ) : null}

        {showConversationPanel ? (
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={0}
            style={[
              styles.conversationPanel,
              isMobileConversation ? styles.conversationPanelMobile : undefined,
            ]}>
            {activeConversation ? (
              <>
                <View style={styles.conversationHeader}>
                  <View style={styles.conversationHeaderTop}>
                    <View style={styles.conversationHeaderMain}>
                      {isCompact ? (
                        <Pressable
                          onPress={() => setMobilePane('directory')}
                          style={styles.headerBackButton}
                          accessibilityLabel="Volver a canales">
                          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.colors.text} />
                        </Pressable>
                      ) : null}

                      {activeConversation.kind === 'direct' && activeContact ? (
                        <UserAvatar
                          user={activeContact}
                          status={activeContact.status}
                          showStatus
                          size={isPhone ? 36 : 40}
                        />
                      ) : (
                        <View style={styles.groupAvatarLarge}>
                          <MaterialCommunityIcons
                            name="account-group-outline"
                            size={isPhone ? 19 : 22}
                            color={theme.colors.info}
                          />
                        </View>
                      )}

                      <View style={styles.conversationCopy}>
                        <Text style={styles.conversationTitle} numberOfLines={1}>
                          {getConversationDisplayTitle(activeConversation)}
                        </Text>
                        <Text style={styles.conversationSubtitle} numberOfLines={1}>
                          {getConversationSubline(activeConversation, activeContact)}  |  {getConversationPresenceLabel(activeConversation, activeContact)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.conversationHeaderActions}>
                      {canStartRealtimeCall ? (
                        <>
                          <Pressable
                            onPress={() => { handleStartCall('audio'); }}
                            style={[
                              styles.conversationActionButton,
                              activeConversationCallMode === 'audio'
                                ? styles.conversationActionButtonActive
                                : undefined,
                            ]}
                            accessibilityLabel="Iniciar llamada de voz">
                            <MaterialCommunityIcons
                              name={activeConversationCallMode === 'audio' ? 'phone' : 'phone-outline'}
                              size={20}
                              color={theme.colors.text}
                            />
                          </Pressable>
                          <Pressable
                            onPress={() => { handleStartCall('video'); }}
                            style={[
                              styles.conversationActionButton,
                              activeConversationCallMode === 'video'
                                ? styles.conversationActionButtonActive
                                : undefined,
                            ]}
                            accessibilityLabel="Iniciar videollamada">
                            <MaterialCommunityIcons
                              name={activeConversationCallMode === 'video' ? 'video' : 'video-outline'}
                              size={20}
                              color={theme.colors.text}
                            />
                          </Pressable>
                        </>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          handleOpenRadioFromChat();
                        }}
                        style={styles.conversationActionButton}
                        accessibilityLabel="Hablar por radio">
                        <MaterialCommunityIcons name="radio-handheld" size={20} color={theme.colors.text} />
                      </Pressable>
                      <Pressable
                        onPress={() => setOptionsMenuOpen(true)}
                        style={styles.conversationActionButton}
                        accessibilityLabel="Mas opciones">
                        <MaterialCommunityIcons name="dots-vertical" size={21} color={theme.colors.text} />
                      </Pressable>
                    </View>
                  </View>
                </View>

                {activeCallSession ? (
                  <View style={styles.callHub}>
                    <View style={styles.callHubHeader}>
                      <View style={styles.callHubCopy}>
                        <Text style={styles.callHubTitle}>Cabina en vivo</Text>
                        <Text style={styles.callHubSubtitle}>
                          La llamada vive dentro del mismo chat y mantiene el contexto visible.
                        </Text>
                      </View>
                      <StatusPill label={callStatusLabel} tone={callTone} />
                    </View>

                    <View style={styles.callStage}>
                      <CallMediaTile
                        stream={activeCallSession.remoteStream}
                        label={leadRemoteParticipant?.name || activeConversation.title}
                        caption={
                          activeCallSession.phase === 'connected'
                            ? 'Conectado'
                            : 'Esperando respuesta'
                        }
                        mode={activeCallSession.mode}
                        muted={false}
                      />
                      <CallMediaTile
                        stream={localStreamRef.current}
                        label="Tu cabina"
                        caption={
                          isCallMuted
                            ? 'Microfono en silencio'
                            : activeCallSession.mode === 'video'
                              ? 'Camara lista'
                              : 'Audio listo'
                        }
                        mode={activeCallSession.mode}
                        muted
                        isSelf
                      />
                    </View>

                    <View style={styles.callControlRow}>
                      <Pressable
                        onPress={toggleCallMute}
                        style={[
                          styles.callControlButton,
                          isCallMuted ? styles.callControlButtonActive : undefined,
                        ]}>
                        <MaterialCommunityIcons
                          name={isCallMuted ? 'microphone-off' : 'microphone'}
                          size={18}
                          color="#FFFFFF"
                        />
                        <Text style={styles.callControlText}>
                          {isCallMuted ? 'Activar micro' : 'Silenciar'}
                        </Text>
                      </Pressable>

                      {activeCallSession.mode === 'video' ? (
                        <Pressable
                          onPress={toggleCamera}
                          style={[
                            styles.callControlButtonSecondary,
                            !isCameraEnabled ? styles.callControlButtonSecondaryActive : undefined,
                          ]}>
                          <MaterialCommunityIcons
                            name={isCameraEnabled ? 'video-outline' : 'video-off-outline'}
                            size={18}
                            color="#FFFFFF"
                          />
                          <Text style={styles.callControlText}>
                            {isCameraEnabled ? 'Pausar camara' : 'Encender camara'}
                          </Text>
                        </Pressable>
                      ) : null}

                      <Pressable
                        onPress={() =>
                          closeActiveCall({
                            reason: 'Llamada finalizada.',
                          })
                        }
                        style={styles.callControlButtonDanger}>
                        <MaterialCommunityIcons name="phone-hangup" size={18} color="#FFFFFF" />
                        <Text style={styles.callControlText}>Colgar</Text>
                      </Pressable>
                    </View>

                    <View style={styles.callMetaRow}>
                      <StatusPill label={`${Math.max(callParticipants.length, 1)} en cabina`} tone="info" />
                      <StatusPill label={formatDuration(callElapsedSeconds)} tone="neutral" />
                      {activeCallSession.mode === 'video' ? (
                        <StatusPill
                          label={isCameraEnabled ? 'Camara activa' : 'Camara pausada'}
                          tone={isCameraEnabled ? 'positive' : 'neutral'}
                        />
                      ) : null}
                    </View>

                    <Text style={styles.callHubNotice}>
                      {callNotice ||
                        'La otra persona puede tocar llamada o video desde este mismo chat para unirse.'}
                    </Text>
                  </View>
                ) : null}

                <FlatList
                  ref={messagesListRef}
                  style={styles.messagesScroll}
                  contentContainerStyle={styles.messagesList}
                  data={activeMessageItems}
                  extraData={activeAudioMessageId}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  onContentSizeChange={handleMessagesContentSizeChange}
                  onLayout={handleMessagesLayout}
                  onScroll={handleMessagesScroll}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    if (item.type === 'date') {
                      return (
                        <View style={styles.dateSeparator}>
                          <Text style={styles.dateSeparatorText}>{item.label}</Text>
                        </View>
                      );
                    }

                    const { message } = item;
                    const isOwn = message.senderId === user?.id;
                    const deliveryStatus = getMessageDeliveryStatus(message, isOwn);
                    const isSystem = isSystemMessage(message);
                    const localTextMessage = message as LocalTextMessage;
                    const canRetryMessage =
                      localTextMessage.localStatus === 'failed' && Boolean(localTextMessage.retryText);

                      return (
                        <View
                          key={message.id}
                          style={[
                            styles.messageRow,
                            isOwn ? styles.messageRowOwn : undefined,
                            isSystem ? styles.messageRowSystem : undefined,
                          ]}>
                          {!isOwn && !isSystem ? (
                            <UserAvatar
                              user={message.sender || activeContact}
                              status={message.sender?.status}
                              size={34}
                            />
                          ) : null}

                          <View
                            style={[
                              styles.messageBubble,
                              isOwn ? styles.messageBubbleOwn : undefined,
                              !isOwn ? styles.messageBubbleOther : undefined,
                              isSystem ? styles.systemMessageBubble : undefined,
                              message.kind === 'audio' ? styles.messageBubbleAudio : undefined,
                              (message.kind === 'image' || message.kind === 'video') ? styles.messageBubbleMedia : undefined,
                            ]}>
                            <View style={styles.messageHeader}>
                              {isSystem ? (
                                <MaterialCommunityIcons
                                  name="clipboard-pulse-outline"
                                  size={15}
                                  color={theme.colors.warning}
                                />
                              ) : null}
                              <Text
                                style={[
                                  styles.messageSender,
                                  isSystem ? styles.systemMessageSender : undefined,
                                  isOwn && !isSystem ? styles.messageSenderOwn : undefined,
                                ]}>
                                {isSystem
                                  ? 'Evento operativo'
                                  : isOwn
                                    ? 'Tu'
                                    : message.sender?.name || activeConversation.title || 'Operacion'}
                              </Text>
                              <Text
                                style={[
                                  styles.messageMeta,
                                  isOwn && !isSystem ? styles.messageMetaOwn : undefined,
                                ]}>
                                {formatMessageTime(message.createdAt)}
                              </Text>
                            </View>

                            {message.kind === 'audio' ? (
                              <VoiceMessageBubble
                                isActive={activeAudioMessageId === message.id}
                                isOwn={isOwn}
                                message={message}
                                onActivate={setActiveAudioMessageId}
                                onDeactivate={() => {
                                  setActiveAudioMessageId((current) =>
                                    current === message.id ? null : current
                                  );
                                }}
                                token={token}
                                isCompact={isCompact}
                                isPhone={isPhone}
                              />
                            ) : message.kind === 'image' ? (
                              <ImageMessageBubble message={message} token={token} isCompact={isCompact} isPhone={isPhone} />
                            ) : message.kind === 'video' ? (
                              <VideoMessageBubble message={message} token={token} isCompact={isCompact} isPhone={isPhone} />
                            ) : (
                              <Text
                                style={[
                                   styles.messageText,
                                   isOwn && !isSystem ? styles.messageTextOwn : undefined,
                                 ]}>
                                {message.text}
                              </Text>
                            )}

                            {deliveryStatus && !isSystem ? (
                              <MessageDeliveryMeta
                                status={deliveryStatus}
                                isOwn={isOwn}
                                time={formatMessageTime(message.createdAt)}
                                isCompact={isCompact}
                                isPhone={isPhone}
                              />
                            ) : null}

                            {canRetryMessage ? (
                              <Pressable
                                onPress={() => { handleRetryTextMessage(localTextMessage); }}
                                style={styles.retryMessageButton}
                                accessibilityRole="button"
                                accessibilityLabel="Reintentar mensaje">
                                <MaterialCommunityIcons
                                  name="refresh"
                                  size={14}
                                  color={isOwn ? '#FFFFFF' : theme.colors.danger}
                                />
                                <Text
                                  style={[
                                    styles.retryMessageText,
                                    isOwn ? styles.retryMessageTextOwn : undefined,
                                  ]}>
                                  Reintentar
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      );
                  }}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <MaterialCommunityIcons
                        name="message-text-outline"
                        size={28}
                        color={theme.colors.muted}
                      />
                      <Text style={styles.emptyTitle}>
                        Chat listo para conversar
                      </Text>
                      <Text style={styles.emptyText}>
                        Escribe el primer mensaje, adjunta un archivo o abre una llamada para empezar.
                      </Text>
                    </View>
                  }
                />

                {activeConversation && typingByConversation[activeConversation.id]?.length ? (
                  <View style={styles.typingIndicator}>
                    <Text style={styles.typingIndicatorText}>
                      {typingByConversation[activeConversation.id].map(t => t.userName).join(', ')}
                      {typingByConversation[activeConversation.id].length === 1 ? ' esta escribiendo...' : ' estan escribiendo...'}
                    </Text>
                  </View>
                ) : null}
                <ChatComposer {...props} />
              </>
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="forum-outline" size={28} color={theme.colors.muted} />
                <Text style={styles.emptyTitle}>Selecciona un canal</Text>
                <Text style={styles.emptyText}>
                  Abre un grupo o un chat directo para empezar a coordinar desde aqui.
                </Text>
              </View>
            )}
          </KeyboardAvoidingView>
        ) : null}
      </View>

      <Modal
        visible={attachmentMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachmentMenuOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setAttachmentMenuOpen(false)}>
          <Pressable style={styles.bottomSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>Conductores</Text>
                <Text style={styles.sheetSubtitle}>Inicia un chat directo ordenado por disponibilidad.</Text>
              </View>
            </View>
            <View style={styles.sheetMediaOptions}>
              <Pressable
                style={styles.sheetMediaButton}
                onPress={() => {
                  setAttachmentMenuOpen(false);
                  handleMediaPicked('camera');
                }}>
                <MaterialCommunityIcons name="camera" size={22} color={theme.colors.text} />
                <Text style={styles.sheetMediaLabel}>Camara</Text>
              </Pressable>
              <Pressable
                style={styles.sheetMediaButton}
                onPress={() => {
                  setAttachmentMenuOpen(false);
                  handleMediaPicked('gallery');
                }}>
                <MaterialCommunityIcons name="image-multiple-outline" size={22} color={theme.colors.text} />
                <Text style={styles.sheetMediaLabel}>Galeria</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
              {sortedOperationalContacts.map((contact) => {
                const unitLabel =
                  (contact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).unit ||
                  (contact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).vehicle ||
                  (contact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).vehicleName ||
                  formatRole(contact.role);
                const statusTone = getOperationalStatusTone(contact.status);

                return (
                  <Pressable
                    key={contact.id}
                    style={styles.driverActionRow}
                    onPress={() => {
                      setAttachmentMenuOpen(false);
                      handleOpenDirect(contact.id, 'chat');
                    }}>
                    <UserAvatar user={contact} status={contact.status} showStatus size={42} />
                    <View style={styles.driverActionCopy}>
                      <Text style={styles.driverActionName} numberOfLines={1}>
                        {contact.name}
                      </Text>
                      <Text style={styles.driverActionUnit} numberOfLines={1}>
                        {unitLabel}
                      </Text>
                    </View>
                    <View style={styles.driverStatusPill}>
                      <View
                        style={[
                          styles.driverStatusDot,
                          statusTone === 'warning' ? styles.driverStatusDotWarning : undefined,
                          statusTone === 'danger' ? styles.driverStatusDotDanger : undefined,
                          statusTone === 'neutral' ? styles.driverStatusDotMuted : undefined,
                        ]}
                      />
                      <Text style={styles.driverStatusText}>{formatStatus(contact.status)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={optionsMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsMenuOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setOptionsMenuOpen(false)}>
          <Pressable style={styles.optionsSheet} onPress={(event) => event.stopPropagation()}>
            {canStartRealtimeCall ? (
              <>
                <Pressable
                  style={styles.optionRow}
                  onPress={() => {
                    setOptionsMenuOpen(false);
                    handleStartCall('audio');
                  }}>
                  <MaterialCommunityIcons name="phone-outline" size={22} color={theme.colors.text} />
                  <Text style={styles.optionRowText}>Llamada de voz</Text>
                </Pressable>
                <Pressable
                  style={styles.optionRow}
                  onPress={() => {
                    setOptionsMenuOpen(false);
                    handleStartCall('video');
                  }}>
                  <MaterialCommunityIcons name="video-outline" size={22} color={theme.colors.text} />
                  <Text style={styles.optionRowText}>Videollamada</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setOptionsMenuOpen(false);
                setCallNotice(
                  Platform.OS === 'web'
                    ? 'Crear reunion esta en preparacion.'
                    : 'Crear reunion esta en preparacion. En Android requiere WebRTC nativo.'
                );
              }}>
              <MaterialCommunityIcons name="account-group-outline" size={22} color={theme.colors.text} />
              <Text style={styles.optionRowText}>Crear reunion</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </AppShell>
  );
}
