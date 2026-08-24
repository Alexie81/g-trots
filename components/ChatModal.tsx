import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AlertTriangle, CheckCircle2, Headphones, LogOut, RefreshCw, Send, Sparkles, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import {
  getMobileChatContacts,
  getMobileChatMessages,
  leaveMobileChat,
  markMobileChatRead,
  sendMobileChatMessage,
} from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import type { ChatContact, ChatMessage } from '@/types';
import AgentChatModal from '@/components/AgentChatModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}

const QUICK_REPLIES = [
  'Salut, am nevoie de ajutor.',
  'Putem verifica o lucrare?',
  'Am o intrebare despre un client.',
];

export default function ChatModal(props: Props) {
  const { user } = useAuth();
  return user?.support_chat_access
    ? <AgentChatModal {...props} />
    : <RequesterChatModal {...props} />;
}

function RequesterChatModal({ visible, onClose, onUnreadChange }: Props) {
  const { token, user } = useAuth();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const footerRef = useRef<View | null>(null);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedContact, setSelectedContact] = useState('admin');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [error, setError] = useState('');
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [supportName, setSupportName] = useState('Support');
  const loadInFlight = useRef(false);
  const keyboardMeasureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const compact = width < 380;
  const supportTitle = supportName === 'Support' ? 'Support G-Trots' : supportName;
  const supportHasReplied = messages.some((message) => message.sender_role === 'admin');

  const loadChat = useCallback(
    async (markRead: boolean) => {
      if (loadInFlight.current) return;
      loadInFlight.current = true;
      try {
        if (!token) return;
        setError('');
        const [nextContacts, response] = await Promise.all([
          getMobileChatContacts(token),
          getMobileChatMessages(token),
        ]);
        const assignedName = response.conversation?.assigned_agent_name || nextContacts[0]?.assigned_agent_name || '';
        setSupportName(assignedName ? `${assignedName} (Agent Support)` : 'Support');
        setMessages(response.messages);
        if (nextContacts.length && !nextContacts.some((contact) => contact.id === selectedContact)) {
          setSelectedContact(nextContacts[0].id);
        }
        if (markRead) {
          await markMobileChatRead(token);
          setContacts(nextContacts.map((contact) => ({ ...contact, unread_count: 0 })));
          onUnreadChange?.(0);
        } else {
          setContacts(nextContacts);
        }
      } catch (e: any) {
        setError(e.message || 'Eroare la incarcarea chatului.');
      } finally {
        loadInFlight.current = false;
      }
    },
    [onUnreadChange, selectedContact, token]
  );

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    loadChat(true).finally(() => setLoading(false));
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') loadChat(true);
    }, 8000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadChat(true);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [visible, loadChat]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      if (Platform.OS === 'android') {
        if (keyboardMeasureTimer.current) clearTimeout(keyboardMeasureTimer.current);
        setKeyboardLift(0);
        keyboardMeasureTimer.current = setTimeout(() => {
          footerRef.current?.measureInWindow((_x, y, _width, height) => {
            const overlap = Math.max(0, y + height - event.endCoordinates.screenY);
            setKeyboardLift(overlap > 0 ? Math.min(overlap + 6, event.endCoordinates.height) : 0);
          });
        }, 120);
      }
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      if (keyboardMeasureTimer.current) clearTimeout(keyboardMeasureTimer.current);
      setKeyboardLift(0);
    });
    return () => {
      if (keyboardMeasureTimer.current) clearTimeout(keyboardMeasureTimer.current);
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const refreshChat = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadChat(true);
    setRefreshing(false);
  };

  const onSend = async (preset?: string) => {
    const text = (preset ?? draft).trim();
    if (!text || !selectedContact || sending || !token) return;
    setSending(true);
    try {
      await sendMobileChatMessage(token, text);
      if (!preset) setDraft('');
      await loadChat(true);
    } catch (e: any) {
      setError(e.message || 'Eroare la trimiterea mesajului.');
    } finally {
      setSending(false);
    }
  };

  const leaveChat = async () => {
    if (!token || leaving || !supportHasReplied) return;
    setLeaving(true);
    try {
      await leaveMobileChat(token);
      setMessages([]);
      setContacts([]);
      setDraft('');
      setSupportName('Support');
      setLeaveConfirmVisible(false);
      onUnreadChange?.(0);
      await loadChat(true);
    } catch (e: any) {
      setError(e.message || 'Conversatia nu a putut fi parasita.');
    } finally {
      setLeaving(false);
    }
  };

  const fmtTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={[styles.screen, keyboardLift > 0 && { paddingBottom: keyboardLift }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}>
          <View style={styles.header}>
            <View style={styles.supportAvatar}>
              <Headphones size={compact ? 20 : 23} color={Colors.white} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{supportTitle}</Text>
              <View style={styles.statusRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.subtitle}>Online pentru {user?.display_name || user?.username}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.iconBtn} onPress={refreshChat} disabled={refreshing}>
              {refreshing ? (
                <ActivityIndicator size="small" color={Colors.orange} />
              ) : (
                <RefreshCw size={19} color={Colors.orange} />
              )}
            </TouchableOpacity>
            {supportHasReplied ? (
              <TouchableOpacity
                style={[styles.iconBtn, styles.leaveIconBtn]}
                onPress={() => setLeaveConfirmVisible(true)}
                disabled={leaving}
                accessibilityLabel="Paraseste conversatia">
                <LogOut size={19} color={Colors.error} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
              <X size={21} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.supportPanel}>
            <View style={styles.supportPanelIcon}>
              <Sparkles size={16} color={Colors.orange} />
            </View>
            <View style={styles.supportPanelText}>
              <Text style={styles.supportPanelTitle}>Discuti cu echipa de support</Text>
              <Text style={styles.supportPanelSub}>
                {supportName === 'Support'
                  ? 'Trimite mesajul aici si iti raspundem direct in aplicatie.'
                  : `Vorbesti cu ${supportName}.`}
              </Text>
            </View>
          </View>

          {contacts.length > 1 && (
            <View style={styles.contactStrip}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contactScroll}>
                {contacts.map((contact) => (
                  <TouchableOpacity
                    key={contact.id}
                    style={[
                      styles.contactChip,
                      selectedContact === contact.id && styles.contactChipActive,
                    ]}
                    onPress={() => setSelectedContact(contact.id)}>
                    <Text
                      style={[
                        styles.contactText,
                        selectedContact === contact.id && styles.contactTextActive,
                      ]}>
                      {contact.name || 'Support'}
                    </Text>
                    {contact.unread_count > 0 && (
                      <View style={styles.smallBadge}>
                        <Text style={styles.smallBadgeText}>{contact.unread_count > 9 ? '9+' : contact.unread_count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {error ? <Text style={styles.errorText} selectable>{error}</Text> : null}

          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={Colors.orange} />
                <Text style={styles.loadingText}>Se incarca discutia...</Text>
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <Headphones size={28} color={Colors.orange} />
                </View>
                <Text style={styles.emptyTitle}>Supportul este aici</Text>
                <Text style={styles.emptySub}>Scrie primul mesaj si conversatia ramane salvata pe contul tau.</Text>
              </View>
            ) : (
              messages.map((message) => {
                const mine = message.sender_role === 'mobile';
                return (
                  <View
                    key={message.id}
                    style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}>
                    {!mine && (
                      <View style={styles.messageAvatar}>
                        <Headphones size={14} color={Colors.orange} />
                      </View>
                    )}
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                      {!mine && <Text style={styles.senderName}>{supportName}</Text>}
                      <Text style={[styles.messageText, mine && styles.messageTextMine]} selectable>
                        {message.body}
                      </Text>
                      <View style={styles.timeRow}>
                        <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>
                          {fmtTime(message.created_at)}
                        </Text>
                        {mine && <CheckCircle2 size={12} color="rgba(255,255,255,0.74)" />}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View ref={footerRef} style={styles.footer}>
            <View style={styles.quickWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickScroll}>
                {QUICK_REPLIES.map((reply) => (
                  <TouchableOpacity key={reply} style={styles.quickChip} onPress={() => setDraft(reply)} disabled={sending}>
                    <Text style={styles.quickText}>{reply}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                placeholder="Scrie catre Support..."
                placeholderTextColor={Colors.textMuted}
                value={draft}
                onChangeText={setDraft}
                multiline
                returnKeyType="send"
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120)}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
                onPress={() => onSend()}
                disabled={!draft.trim() || sending}>
                {sending ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Send size={18} color={Colors.white} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={leaveConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !leaving && setLeaveConfirmVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}><AlertTriangle size={23} color={Colors.error} /></View>
            <Text style={styles.confirmTitle}>Parasesti conversatia?</Text>
            <Text style={styles.confirmText}>
              Conversatia curenta va fi inchisa. Vei reveni la un chat nou, fara Agent Support atribuit.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setLeaveConfirmVisible(false)} disabled={leaving}>
                <Text style={styles.confirmCancelText}>Renunta</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmLeave} onPress={leaveChat} disabled={leaving}>
                {leaving ? <ActivityIndicator size="small" color={Colors.white} /> : <LogOut size={17} color={Colors.white} />}
                <Text style={styles.confirmLeaveText}>Paraseste</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  screen: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  supportAvatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: Colors.textPrimary, fontSize: 18, fontFamily: 'Inter-Bold', flexShrink: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.success },
  subtitle: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Regular', flexShrink: 1 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveIconBtn: { borderColor: Colors.errorDim, backgroundColor: Colors.errorDim },
  supportPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.orangeMid,
    backgroundColor: Colors.orangeDim,
  },
  supportPanelIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportPanelText: { flex: 1 },
  supportPanelTitle: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' },
  supportPanelSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
    lineHeight: 15,
  },
  contactStrip: { paddingVertical: 10 },
  contactScroll: { paddingHorizontal: 14, gap: 8 },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
  },
  contactChipActive: { backgroundColor: Colors.orangeDim, borderColor: Colors.orange },
  contactText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  contactTextActive: { color: Colors.orange },
  smallBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  smallBadgeText: { color: Colors.white, fontSize: 10, fontFamily: 'Inter-Bold' },
  messages: { flex: 1 },
  messagesContent: { padding: 14, gap: 10, flexGrow: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: Colors.orangeDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold' },
  emptySub: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 7,
    lineHeight: 19,
  },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowOther: { justifyContent: 'flex-start' },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  bubbleMine: {
    backgroundColor: Colors.orange,
    borderColor: Colors.orange,
    borderBottomRightRadius: 5,
  },
  bubbleOther: {
    backgroundColor: Colors.card,
    borderColor: Colors.cardBorder,
    borderBottomLeftRadius: 5,
  },
  senderName: {
    color: Colors.orange,
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  messageText: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20 },
  messageTextMine: { color: Colors.white },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  messageTime: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular' },
  messageTimeMine: { color: 'rgba(255,255,255,0.74)' },
  footer: {
    backgroundColor: Colors.surface,
  },
  quickWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
    backgroundColor: Colors.surface,
  },
  quickScroll: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.orangeMid,
    backgroundColor: Colors.orangeDim,
  },
  quickText: { color: Colors.orange, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 14 : 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 118,
    backgroundColor: Colors.card,
    color: Colors.textPrimary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.textMuted },
  errorText: {
    marginHorizontal: 14,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    color: Colors.error,
    backgroundColor: Colors.errorDim,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  confirmOverlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: Colors.overlay },
  confirmCard: { padding: 18, gap: 10, borderRadius: 18, borderWidth: 1, borderColor: Colors.error, backgroundColor: Colors.surface },
  confirmIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.errorDim },
  confirmTitle: { color: Colors.textPrimary, fontSize: 18, fontFamily: 'Inter-Bold' },
  confirmText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, fontFamily: 'Inter-Regular' },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, paddingTop: 8 },
  confirmCancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 13, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card },
  confirmCancelText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Bold' },
  confirmLeave: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: 13, backgroundColor: Colors.error },
  confirmLeaveText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter-Bold' },
});
