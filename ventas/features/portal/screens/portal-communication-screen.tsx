import { useEffect, useMemo, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import {
  getPeerParticipant,
  isDirectChatEncryptionActive,
  isDirectCommunicationConversation,
  type CommunicationConversation,
} from '@shared/communication';
import { PortalButton } from '../components/portal-button';
import { PortalLayout } from '../components/portal-layout';
import { hasPortalRtcAccess } from '../utils/access';
import { useAppStore } from '@/src/store/use-app-store';
import { AuthenticatedCommunicationMedia } from '../communication/authenticated-media';
import { usePortalCallStore } from '../communication/call-store';
import { usePortalCommunicationStore } from '../communication/communication-store';
import { usePortalE2eeStore } from '../communication/e2ee-store';
import { usePortalVoiceRecorder } from '../communication/use-voice-recorder';
import '../communication/communication.css';

function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'MC';
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function messageStatus(status: string | undefined) {
  switch (status) {
    case 'sending': return '◷';
    case 'sent': return '✓';
    case 'delivered': return '✓✓';
    case 'read': return '✓✓';
    case 'failed': return '!';
    default: return '';
  }
}

function conversationDisplayName(conversation: CommunicationConversation, userId: string | null) {
  return getPeerParticipant(conversation, userId)?.name || conversation.title || 'Conversación';
}

function lastMessagePreview(conversation: CommunicationConversation) {
  const message = conversation.lastMessage;
  if (!message) return 'Sin mensajes';
  if (message.e2eeEnvelope?.ciphertext || message.encrypted) return 'Mensaje cifrado';
  if (message.kind === 'audio') return 'Nota de voz';
  if (message.kind === 'image') return 'Imagen';
  if (message.kind === 'video') return 'Video';
  return message.text || message.textPreview || 'Mensaje';
}

export function PortalCommunicationScreen() {
  const user = useAppStore((state) => state.user) as (ReturnType<typeof useAppStore.getState>['user'] & {
    capabilities?: string[] | null;
    e2eePublicKey?: string | null;
  }) | null;
  const userId = user?.id || null;
  const canCall = hasPortalRtcAccess(user);
  const {
    contacts,
    conversations,
    error,
    loading,
    messagesByConversation,
    onlineUserIds,
    openDirect,
    refreshDirectory,
    retryText,
    selectedConversationId,
    selectConversation,
    sendMedia,
    sending,
    sendText,
    sendVoice,
    setTyping,
    typingByConversation,
  } = usePortalCommunicationStore();
  const startCall = usePortalCallStore((state) => state.startCall);
  const callPhase = usePortalCallStore((state) => state.phase);
  const e2ee = usePortalE2eeStore();
  const recorder = usePortalVoiceRecorder();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((entry) => entry.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );
  const selectedPeer = getPeerParticipant(selectedConversation, userId);
  const selectedMessages = selectedConversationId
    ? messagesByConversation[selectedConversationId]?.items || []
    : [];
  const selectedBucket = selectedConversationId ? messagesByConversation[selectedConversationId] : undefined;
  const encryptedThread = Boolean(
    userId && selectedConversation && isDirectChatEncryptionActive({ currentUserId: userId, conversation: selectedConversation })
  );
  const encryptionLocked = encryptedThread && e2ee.status !== 'ready';
  const selectedOnline = Boolean(selectedPeer && onlineUserIds.includes(selectedPeer.id));
  const selectedTyping = Boolean(
    selectedConversationId && (typingByConversation[selectedConversationId] || []).length
  );
  const directCallAllowed = Boolean(
    canCall &&
    selectedConversation &&
    isDirectCommunicationConversation(selectedConversation) &&
    selectedPeer &&
    selectedPeer.userStatus !== 'suspended' &&
    !selectedPeer.deletedAt
  );

  const visibleConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return conversations;
    return conversations.filter((conversation) => {
      const peer = getPeerParticipant(conversation, userId);
      return `${conversation.title} ${peer?.name || ''} ${lastMessagePreview(conversation)}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [conversations, query, userId]);

  const visibleContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const existingPeers = new Set(
      conversations
        .filter((entry) => entry.kind === 'direct' && entry.channelMode !== 'radio')
        .map((entry) => getPeerParticipant(entry, userId)?.id)
        .filter(Boolean)
    );
    return contacts.filter((contact) => {
      if (contact.id === userId || contact.deletedAt || contact.userStatus === 'suspended') return false;
      if (existingPeers.has(contact.id) && !normalized) return false;
      if (!normalized) return true;
      return `${contact.name} ${contact.email || ''}`.toLowerCase().includes(normalized);
    });
  }, [contacts, conversations, query, userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [selectedConversationId, selectedMessages.length]);

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, []);

  const displayMessageText = (message: (typeof selectedMessages)[number]) => {
    if (!message.e2eeEnvelope?.ciphertext || !selectedConversation || !userId) {
      return message.text || message.textPreview || '';
    }
    try {
      return e2ee.decryptMessage({ message, currentUserId: userId, conversation: selectedConversation });
    } catch {
      return 'Mensaje cifrado';
    }
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (!selectedConversationId) return;
    setTyping(selectedConversationId, Boolean(value.trim()));
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setTyping(selectedConversationId, false);
    }, 1_500);
  };

  const handleSend = async () => {
    if (!selectedConversation || !userId || !draft.trim() || sending) return;
    setNotice(null);
    try {
      const payload = e2ee.buildMessagePayload({
        text: draft,
        currentUserId: userId,
        conversation: selectedConversation,
      });
      const result = payload.e2eeEnvelope
        ? await sendText(selectedConversation.id, '', {
            e2eeEnvelope: payload.e2eeEnvelope,
            textPreview: payload.textPreview,
          })
        : await sendText(selectedConversation.id, payload.text || draft);
      if (!result.ok) {
        setNotice(result.message || 'No fue posible enviar el mensaje.');
        return;
      }
      setDraft('');
      setTyping(selectedConversation.id, false);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'No fue posible preparar el mensaje.');
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file || !selectedConversation) return;
    if (file.size > 20 * 1024 * 1024) {
      setNotice('El archivo no puede superar 20 MB.');
      return;
    }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setNotice('Selecciona una imagen o video.');
      return;
    }
    const result = await sendMedia(selectedConversation.id, file);
    if (!result.ok) setNotice(result.message || 'No fue posible enviar el archivo.');
  };

  const handleVoice = async () => {
    if (!selectedConversation || sending) return;
    if (!recorder.recording) {
      await recorder.start();
      return;
    }
    const result = await recorder.stop();
    if (!result) return;
    const sent = await sendVoice(selectedConversation.id, result.blob, result.durationSeconds);
    if (!sent.ok) setNotice(sent.message || 'No fue posible enviar la nota de voz.');
  };

  const handleEncryptionAction = async () => {
    if (!password) return;
    const result = e2ee.status === 'setup_required'
      ? await e2ee.setup(password)
      : await e2ee.restore(password);
    if (result.ok) {
      setPassword('');
      await refreshDirectory();
    } else {
      setNotice(result.message || 'No fue posible desbloquear el cifrado.');
    }
  };

  const handleCall = async (mode: 'audio' | 'video') => {
    if (!selectedConversation || !selectedPeer || !directCallAllowed || callPhase !== 'IDLE') return;
    const result = await startCall({
      conversationId: selectedConversation.id,
      mode,
      peerUserId: selectedPeer.id,
    });
    if (!result.ok) setNotice(result.code === 'busy' ? 'Ya hay una llamada en curso.' : 'No fue posible iniciar la llamada.');
  };

  return (
    <PortalLayout
      title="Comunicación"
      actions={<PortalButton icon="refresh" size="sm" variant="secondary" onPress={() => void refreshDirectory()}>Actualizar</PortalButton>}
      compact
      wide>
      <div className="portal-comms-shell">
        <aside className="portal-comms-sidebar" data-hidden-mobile={selectedConversation ? 'true' : 'false'}>
          <input
            className="portal-comms-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            aria-label="Buscar conversaciones y contactos"
          />
          <div className="portal-comms-list">
            {visibleConversations.map((conversation) => {
              const name = conversationDisplayName(conversation, userId);
              const peer = getPeerParticipant(conversation, userId);
              const online = Boolean(peer && onlineUserIds.includes(peer.id));
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className="portal-comms-contact"
                  data-active={selectedConversationId === conversation.id ? 'true' : 'false'}
                  onClick={() => void selectConversation(conversation.id)}>
                  <span className="portal-comms-avatar">{initials(name)}</span>
                  <span className="portal-comms-contact-copy">
                    <span className="portal-comms-contact-name">{name}</span>
                    <span className="portal-comms-contact-preview">{online ? 'En línea · ' : ''}{lastMessagePreview(conversation)}</span>
                  </span>
                  {conversation.unreadCount > 0 ? <span className="portal-comms-unread">{conversation.unreadCount}</span> : null}
                </button>
              );
            })}

            {visibleContacts.map((contact) => (
              <button key={`contact:${contact.id}`} type="button" className="portal-comms-contact" onClick={() => void openDirect(contact.id)}>
                <span className="portal-comms-avatar">{initials(contact.name)}</span>
                <span className="portal-comms-contact-copy">
                  <span className="portal-comms-contact-name">{contact.name}</span>
                  <span className="portal-comms-contact-preview">{onlineUserIds.includes(contact.id) ? 'En línea' : 'Iniciar chat'}</span>
                </span>
              </button>
            ))}

            {!loading && !visibleConversations.length && !visibleContacts.length ? (
              <div className="portal-comms-empty">No hay conversaciones disponibles.</div>
            ) : null}
          </div>
        </aside>

        <section className="portal-comms-thread" data-hidden-mobile={!selectedConversation ? 'true' : 'false'}>
          {!selectedConversation ? (
            <div className="portal-comms-empty">Selecciona un chat para comenzar.</div>
          ) : (
            <>
              <header className="portal-comms-thread-header">
                <button className="portal-comms-icon-button portal-comms-back" type="button" aria-label="Volver a conversaciones" onClick={() => void selectConversation(null)}>
                  <MaterialCommunityIcons name="arrow-left" size={20} color="#F5F7FB" />
                </button>
                <span className="portal-comms-avatar">{initials(conversationDisplayName(selectedConversation, userId))}</span>
                <div className="portal-comms-thread-copy">
                  <div className="portal-comms-conversation-title">{conversationDisplayName(selectedConversation, userId)}</div>
                  <div className="portal-comms-presence">
                    {selectedTyping ? 'Escribiendo…' : selectedPeer ? (selectedOnline ? 'En línea' : 'Sin conexión') : selectedConversation.description || ''}
                    {encryptedThread ? ' · 🔒' : ''}
                  </div>
                </div>
                {directCallAllowed ? (
                  <div className="portal-comms-header-actions">
                    <button className="portal-comms-icon-button" type="button" aria-label="Llamada de audio" disabled={callPhase !== 'IDLE'} onClick={() => void handleCall('audio')}>
                      <MaterialCommunityIcons name="phone-outline" size={20} color="#F5F7FB" />
                    </button>
                    <button className="portal-comms-icon-button" type="button" aria-label="Videollamada" disabled={callPhase !== 'IDLE'} onClick={() => void handleCall('video')}>
                      <MaterialCommunityIcons name="video-outline" size={21} color="#F5F7FB" />
                    </button>
                  </div>
                ) : null}
              </header>

              {encryptionLocked ? (
                <div className="portal-comms-e2ee">
                  <div className="portal-comms-contact-name">
                    {e2ee.status === 'setup_required' ? 'Activar cifrado en este navegador' : 'Restaurar cifrado en este navegador'}
                  </div>
                  <div className="portal-comms-e2ee-hint">
                    Usa tu contraseña de ManeComb. La contraseña no se guarda en el navegador.
                  </div>
                  <div className="portal-comms-e2ee-row">
                    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña" autoComplete="current-password" />
                    <button type="button" disabled={e2ee.status === 'working'} onClick={() => void handleEncryptionAction()}>
                      {e2ee.status === 'working' ? 'Procesando…' : e2ee.status === 'setup_required' ? 'Activar' : 'Restaurar'}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="portal-comms-messages" aria-live="polite">
                {selectedBucket?.pageInfo?.hasMore ? (
                  <button className="portal-comms-load-more" type="button" disabled={selectedBucket.loading} onClick={() => void usePortalCommunicationStore.getState().loadMore(selectedConversation.id)}>
                    {selectedBucket.loading ? 'Cargando…' : 'Mensajes anteriores'}
                  </button>
                ) : null}

                {selectedMessages.map((message) => {
                  const own = message.senderId === userId;
                  const status = message.localStatus || message.status;
                  const body = displayMessageText(message);
                  return (
                    <article key={message.id} className="portal-comms-message" data-own={own ? 'true' : 'false'}>
                      {message.kind === 'image' && message.imageUrl ? <AuthenticatedCommunicationMedia kind="image" source={message.imageUrl} alt={message.text || 'Imagen enviada'} /> : null}
                      {message.kind === 'video' && message.videoUrl ? <AuthenticatedCommunicationMedia kind="video" source={message.videoUrl} /> : null}
                      {message.kind === 'audio' && message.audioUrl ? <AuthenticatedCommunicationMedia kind="audio" source={message.audioUrl} /> : null}
                      {body ? <p className="portal-comms-message-text">{body}</p> : null}
                      <div className="portal-comms-message-meta" aria-label={own && status ? `Estado ${status}` : undefined}>
                        <span>{formatMessageTime(message.createdAt)}</span>
                        {own ? <span>{messageStatus(status)}</span> : null}
                      </div>
                      {message.localStatus === 'failed' && message.clientMessageId ? (
                        <button className="portal-comms-message-error" type="button" onClick={() => void retryText(selectedConversation.id, message.clientMessageId!)}>
                          No enviado · Reintentar
                        </button>
                      ) : null}
                    </article>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {notice || error || recorder.error ? (
                <div className="portal-call-error" role="status">{notice || recorder.error || error}</div>
              ) : null}

              <div className="portal-comms-composer">
                <div className="portal-comms-composer-actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    hidden
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] || null;
                      event.currentTarget.value = '';
                      void handleFile(file);
                    }}
                  />
                  <button className="portal-comms-icon-button" type="button" aria-label="Adjuntar imagen o video" disabled={sending || encryptionLocked} onClick={() => fileInputRef.current?.click()}>
                    <MaterialCommunityIcons name="paperclip" size={21} color="#F5F7FB" />
                  </button>
                  <button className="portal-comms-icon-button" type="button" aria-label={recorder.recording ? 'Enviar nota de voz' : 'Grabar nota de voz'} disabled={sending || encryptionLocked} onClick={() => void handleVoice()}>
                    <MaterialCommunityIcons name={recorder.recording ? 'send' : 'microphone-outline'} size={21} color={recorder.recording ? '#FF6673' : '#F5F7FB'} />
                  </button>
                </div>
                <div>
                  {recorder.recording ? <div className="portal-comms-recording">Grabando · {recorder.durationSeconds}s / {recorder.maxSeconds}s</div> : null}
                  <textarea
                    value={draft}
                    disabled={encryptionLocked}
                    placeholder={encryptionLocked ? 'Desbloquea el cifrado para escribir' : 'Escribe un mensaje'}
                    aria-label="Mensaje"
                    onChange={(event) => handleDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                </div>
                <button className="portal-comms-send" type="button" aria-label="Enviar mensaje" disabled={!draft.trim() || sending || encryptionLocked} onClick={() => void handleSend()}>
                  <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </PortalLayout>
  );
}
