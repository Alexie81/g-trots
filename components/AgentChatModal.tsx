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
  View,
} from 'react-native';
import { AlertTriangle, ArrowLeft, Check, ChevronRight, CircleX, Headphones, Inbox, LogOut, MessageCircle, RefreshCw, Send, Trash2, UserRound, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  acceptAgentChat,
  closeAgentChatConversation,
  deleteAgentChatConversation,
  getAgentChatContacts,
  getAgentChatMessages,
  markAgentChatRead,
  sendAgentChatMessage,
} from '@/services/api';
import type { ChatContact, ChatMessage } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}

export default function AgentChatModal({ visible, onClose, onUnreadChange }: Props) {
  const { token, user } = useAuth();
  const messagesRef = useRef<ScrollView | null>(null);
  const composerRef = useRef<View | null>(null);
  const loadingRef = useRef(false);
  const selectedIdRef = useRef('');
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [closeConfirmVisible, setCloseConfirmVisible] = useState(false);
  const [error, setError] = useState('');
  const [keyboardLift, setKeyboardLift] = useState(0);
  const keyboardMeasureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = user?.role === 'admin';
  const selected = contacts.find((contact) => contact.id === selectedId) || null;
  const selectedLeft = selected?.status === 'left';
  const selectedClosed = selected?.status === 'closed';
  const selectedInactive = selectedLeft || selectedClosed;
  const canReply = Boolean(selected?.can_reply);

  const load = useCallback(async (markRead = true) => {
    if (!token || loadingRef.current) return;
    loadingRef.current = true;
    try {
      setError('');
      const nextContacts = (await getAgentChatContacts(token)).sort((a, b) => {
        const unreadDifference = Number(b.unread_count || 0) - Number(a.unread_count || 0);
        if (unreadDifference !== 0) return unreadDifference;
        const availableDifference = Number(!b.assigned_agent_id) - Number(!a.assigned_agent_id);
        if (availableDifference !== 0) return availableDifference;
        return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
      });
      const currentId = selectedIdRef.current;
      const nextId = currentId && nextContacts.some((contact) => contact.id === currentId)
        ? currentId
        : '';
      selectedIdRef.current = nextId;
      setSelectedId(nextId);
      if (!nextId) {
        setContacts(nextContacts);
        onUnreadChange?.(nextContacts.reduce((sum, contact) => sum + Number(contact.unread_count || 0), 0));
        setMessages([]);
        return;
      }
      const response = await getAgentChatMessages(token, nextId);
      setMessages(response.messages);
      let displayedContacts = nextContacts;
      if (markRead) {
        await markAgentChatRead(token, nextId);
        displayedContacts = nextContacts.map((contact) => (
          contact.id === nextId ? { ...contact, unread_count: 0 } : contact
        ));
      }
      setContacts(displayedContacts);
      onUnreadChange?.(displayedContacts.reduce((sum, contact) => sum + Number(contact.unread_count || 0), 0));
    } catch (e: any) {
      setError(e.message || 'Chatul agentului nu a putut fi incarcat.');
    } finally {
      loadingRef.current = false;
    }
  }, [onUnreadChange, token, user?.id]);

  useEffect(() => {
    if (!visible) {
      selectedIdRef.current = '';
      setSelectedId('');
      setMessages([]);
      setDraft('');
      return;
    }
    selectedIdRef.current = '';
    setSelectedId('');
    setMessages([]);
    setLoading(true);
    load(true).finally(() => setLoading(false));
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') load(true);
    }, 8000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') load(true);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [load, visible]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      if (Platform.OS === 'android') {
        if (keyboardMeasureTimer.current) clearTimeout(keyboardMeasureTimer.current);
        setKeyboardLift(0);
        keyboardMeasureTimer.current = setTimeout(() => {
          composerRef.current?.measureInWindow((_x, y, _width, height) => {
            const overlap = Math.max(0, y + height - event.endCoordinates.screenY);
            setKeyboardLift(overlap > 0 ? Math.min(overlap + 6, event.endCoordinates.height) : 0);
          });
        }, 120);
      }
      setTimeout(() => messagesRef.current?.scrollToEnd({ animated: true }), 80);
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

  useEffect(() => {
    if (!visible || !selectedId) return;
    setLoading(true);
    load(true).finally(() => setLoading(false));
  }, [load, selectedId, visible]);

  const selectContact = (contactId: string) => {
    selectedIdRef.current = contactId;
    setMessages([]);
    setSelectedId(contactId);
  };

  const showContactList = () => {
    selectedIdRef.current = '';
    setSelectedId('');
    setMessages([]);
    setDraft('');
  };

  const accept = async () => {
    if (!token || !selectedId || accepting) return;
    setAccepting(true);
    try {
      await acceptAgentChat(token, selectedId);
      await load(true);
    } catch (e: any) {
      setError(e.message || 'Conversatia nu a putut fi preluata.');
    } finally {
      setAccepting(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!token || !selectedId || !body || sending || !canReply) return;
    setSending(true);
    try {
      await sendAgentChatMessage(token, selectedId, body);
      setDraft('');
      await load(true);
    } catch (e: any) {
      setError(e.message || 'Mesajul nu a putut fi trimis.');
    } finally {
      setSending(false);
    }
  };

  const removeConversation = async () => {
    if (!token || !selectedId || !selectedInactive || deleting) return;
    setDeleting(true);
    try {
      await deleteAgentChatConversation(token, selectedId);
      setDeleteConfirmVisible(false);
      showContactList();
      await load(true);
    } catch (e: any) {
      setError(e.message || 'Conversatia nu a putut fi stearsa.');
    } finally {
      setDeleting(false);
    }
  };

  const closeConversation = async () => {
    if (!token || !selectedId || selectedInactive || !canReply || closing) return;
    setClosing(true);
    try {
      await closeAgentChatConversation(token, selectedId);
      setCloseConfirmVisible(false);
      setDraft('');
      await load(true);
    } catch (e: any) {
      setError(e.message || 'Conversatia nu a putut fi inchisa.');
    } finally {
      setClosing(false);
    }
  };

  const fmtTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  };

  const fmtListTime = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return sameDay
      ? date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={[styles.screen, keyboardLift > 0 && { paddingBottom: keyboardLift }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}>
          <View style={styles.header}>
            <View style={styles.headerIcon}><Headphones size={21} color={Colors.white} /></View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Dashboard Agent</Text>
              <Text style={styles.subtitle}>
                {isAdmin ? 'Admin - toate conversatiile' : `${user?.display_name || user?.username} - conversatii disponibile`}
              </Text>
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={() => load(true)}>
              <RefreshCw size={18} color={Colors.orange} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={onClose}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error} selectable>{error}</Text> : null}

          {!selected ? (
            <ScrollView style={styles.requestList} contentContainerStyle={styles.requestListContent}>
              <View style={styles.requestIntro}>
                <View style={styles.requestIntroIcon}><Inbox size={22} color={Colors.orange} /></View>
                <View style={styles.requestIntroCopy}>
                  <Text style={styles.requestIntroTitle}>{isAdmin ? 'Toate chat-urile' : 'Cereri de chat'}</Text>
                  <Text style={styles.requestIntroSub}>
                    Selecteaza o conversatie pentru a vedea mesajele si a raspunde.
                  </Text>
                </View>
                <Text style={styles.requestTotal}>{contacts.length}</Text>
              </View>

              {loading ? (
                <View style={styles.listEmpty}><ActivityIndicator color={Colors.orange} /><Text style={styles.emptyText}>Se incarca conversatiile...</Text></View>
              ) : contacts.length === 0 ? (
                <View style={styles.listEmpty}><MessageCircle size={30} color={Colors.orange} /><Text style={styles.emptyText}>Nu exista cereri de chat.</Text></View>
              ) : contacts.map((contact) => {
                const assigned = Boolean(contact.assigned_agent_id);
                const left = contact.status === 'left';
                const closed = contact.status === 'closed';
                const latest = contact.latest_message?.body || 'Nu exista mesaje inca.';
                return (
                  <TouchableOpacity key={contact.id} style={styles.requestRow} onPress={() => selectContact(contact.id)}>
                    <View style={styles.requestAvatar}><UserRound size={19} color={Colors.orange} /></View>
                    <View style={styles.requestCopy}>
                      <View style={styles.requestTitleRow}>
                        <Text style={styles.requestName} numberOfLines={1}>{contact.name}</Text>
                        <Text style={styles.requestTime}>{fmtListTime(contact.last_message_at)}</Text>
                      </View>
                      <Text style={[styles.requestStatus, !assigned && styles.requestStatusOpen, (left || closed) && styles.requestStatusLeft]} numberOfLines={1}>
                        {left ? 'Utilizatorul a parasit conversatia'
                          : closed ? 'Conversatie inchisa de Agent Support'
                          : assigned ? `Preluat de ${contact.assigned_agent_name || 'agent'}` : 'Cerere disponibila'}
                      </Text>
                      <Text style={styles.requestPreview} numberOfLines={2}>{latest}</Text>
                    </View>
                    <View style={styles.requestEnd}>
                      {contact.unread_count > 0 ? (
                        <View style={styles.listBadge}><Text style={styles.badgeText}>{contact.unread_count > 99 ? '99+' : contact.unread_count}</Text></View>
                      ) : null}
                      <ChevronRight size={18} color={Colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <>
              <View style={styles.contactsArea}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{isAdmin ? 'Toate conversatiile' : 'Conversatii'}</Text>
                  <Text style={styles.sectionCount}>{contacts.length}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contactsScroll}>
                  {contacts.map((contact) => {
                    const active = contact.id === selectedId;
                    const assigned = Boolean(contact.assigned_agent_id);
                    const left = contact.status === 'left';
                    const closed = contact.status === 'closed';
                    return (
                      <TouchableOpacity
                        key={contact.id}
                        style={[styles.contact, active && styles.contactActive]}
                        onPress={() => selectContact(contact.id)}>
                        <View style={[styles.avatar, active && styles.avatarActive]}>
                          <UserRound size={16} color={active ? Colors.white : Colors.orange} />
                        </View>
                        <View style={styles.contactCopy}>
                          <Text style={[styles.contactName, active && styles.contactNameActive]} numberOfLines={1}>
                            {contact.name}
                          </Text>
                          <Text style={styles.contactState} numberOfLines={1}>
                            {left ? 'Conversatie parasita'
                              : closed ? 'Inchisa de Agent Support'
                              : assigned ? `Preluat de ${contact.assigned_agent_name || 'agent'}` : 'Asteapta preluare'}
                          </Text>
                        </View>
                        {contact.unread_count > 0 ? (
                          <View style={styles.badge}><Text style={styles.badgeText}>{contact.unread_count > 9 ? '9+' : contact.unread_count}</Text></View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.chatHead}>
                <TouchableOpacity style={styles.backButton} onPress={showContactList}>
                  <ArrowLeft size={19} color={Colors.orange} />
                </TouchableOpacity>
                <View style={styles.chatHeadCopy}>
                  <Text style={styles.chatTitle}>{selected.name}</Text>
                  <Text style={styles.chatSub}>
                    {selectedLeft ? 'Utilizatorul a parasit conversatia - raspunsurile sunt blocate'
                      : selectedClosed ? 'Conversatie inchisa de Agent Support - raspunsurile sunt blocate'
                      : selected.assigned_agent_id === user?.id ? 'Conversatie preluata de tine'
                      : canReply && selected.assigned_agent_id ? `Preluata de ${selected.assigned_agent_name || 'alt agent'} - poti raspunde ca Agent Support`
                      : canReply ? 'Acces complet admin - poti raspunde ca Agent Support'
                      : selected.assigned_agent_id ? `Preluata de ${selected.assigned_agent_name || 'alt agent'}`
                      : 'Conversatie libera'}
                  </Text>
                </View>
                {!selectedInactive && !selected.assigned_agent_id && !canReply ? (
                  <TouchableOpacity style={styles.acceptButton} onPress={accept} disabled={accepting}>
                    {accepting ? <ActivityIndicator size="small" color={Colors.white} /> : <><Check size={16} color={Colors.white} /><Text style={styles.acceptText}>Preia chat</Text></>}
                  </TouchableOpacity>
                ) : null}
                {!selectedInactive && canReply ? (
                  <TouchableOpacity style={styles.closeButton} onPress={() => setCloseConfirmVisible(true)} disabled={closing}>
                    <CircleX size={16} color={Colors.error} />
                    <Text style={styles.closeButtonText}>Inchide</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {selectedInactive ? (
                <View style={styles.leftBanner}>
                  <View style={styles.leftBannerIcon}>
                    {selectedLeft ? <LogOut size={18} color={Colors.error} /> : <CircleX size={18} color={Colors.error} />}
                  </View>
                  <View style={styles.leftBannerCopy}>
                    <Text style={styles.leftBannerTitle}>
                      {selectedLeft ? 'Utilizatorul a parasit conversatia' : 'Conversatie inchisa de Agent Support'}
                    </Text>
                    <Text style={styles.leftBannerText}>Nu mai poti trimite mesaje. Conversatia poate fi doar stearsa definitiv.</Text>
                  </View>
                </View>
              ) : null}

              <ScrollView
                ref={messagesRef}
                style={styles.messages}
                contentContainerStyle={styles.messagesContent}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: true })}>
                {loading ? (
                  <View style={styles.empty}><ActivityIndicator color={Colors.orange} /><Text style={styles.emptyText}>Se incarca...</Text></View>
                ) : messages.length === 0 ? (
                  <View style={styles.empty}><MessageCircle size={28} color={Colors.orange} /><Text style={styles.emptyText}>Nu exista mesaje inca.</Text></View>
                ) : messages.map((message) => {
                  const mine = message.sender_role === 'admin';
                  return (
                    <View key={message.id} style={[styles.messageRow, mine ? styles.mineRow : styles.otherRow]}>
                      <View style={[styles.bubble, mine ? styles.mineBubble : styles.otherBubble]}>
                        <Text style={[styles.messageText, mine && styles.mineText]} selectable>{message.body}</Text>
                        <Text style={[styles.time, mine && styles.mineTime]}>{fmtTime(message.created_at)}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              {selectedInactive ? (
                <View style={styles.deleteFooter}>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => setDeleteConfirmVisible(true)} disabled={deleting}>
                    <Trash2 size={18} color={Colors.white} />
                    <Text style={styles.deleteButtonText}>Sterge conversatia</Text>
                  </TouchableOpacity>
                </View>
              ) : <View ref={composerRef} style={styles.composer}>
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={canReply ? 'Scrie raspunsul ca Agent Support...' : 'Preia conversatia pentru a raspunde'}
                  placeholderTextColor={Colors.textMuted}
                  editable={canReply}
                  multiline
                  onFocus={() => setTimeout(() => messagesRef.current?.scrollToEnd({ animated: true }), 120)}
                />
                <TouchableOpacity
                  style={[styles.sendButton, (!canReply || !draft.trim() || sending) && styles.disabled]}
                  onPress={send}
                  disabled={!canReply || !draft.trim() || sending}>
                  {sending ? <ActivityIndicator size="small" color={Colors.white} /> : <Send size={18} color={Colors.white} />}
                </TouchableOpacity>
              </View>}
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal visible={deleteConfirmVisible} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteConfirmVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}><AlertTriangle size={23} color={Colors.error} /></View>
            <Text style={styles.confirmTitle}>Stergi conversatia?</Text>
            <Text style={styles.confirmText}>Mesajele si toate datele acestei conversatii vor fi sterse definitiv din baza de date.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setDeleteConfirmVisible(false)} disabled={deleting}>
                <Text style={styles.confirmCancelText}>Renunta</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDelete} onPress={removeConversation} disabled={deleting}>
                {deleting ? <ActivityIndicator size="small" color={Colors.white} /> : <Trash2 size={17} color={Colors.white} />}
                <Text style={styles.confirmDeleteText}>Sterge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={closeConfirmVisible} transparent animationType="fade" onRequestClose={() => !closing && setCloseConfirmVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}><CircleX size={23} color={Colors.error} /></View>
            <Text style={styles.confirmTitle}>Inchizi conversatia?</Text>
            <Text style={styles.confirmText}>Utilizatorul va primi un chat nou, curat si fara Agent Support atribuit.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setCloseConfirmVisible(false)} disabled={closing}>
                <Text style={styles.confirmCancelText}>Renunta</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDelete} onPress={closeConversation} disabled={closing}>
                {closing ? <ActivityIndicator size="small" color={Colors.white} /> : <CircleX size={17} color={Colors.white} />}
                <Text style={styles.confirmDeleteText}>Inchide</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, backgroundColor: Colors.surface },
  headerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orange },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold' },
  subtitle: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 3 },
  iconButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card },
  error: { color: Colors.error, backgroundColor: Colors.errorDim, padding: 10, fontSize: 11, fontFamily: 'Inter-Regular' },
  requestList: { flex: 1 },
  requestListContent: { flexGrow: 1, padding: 14, gap: 9 },
  requestIntro: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.orangeMid, backgroundColor: Colors.orangeDim },
  requestIntroIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card },
  requestIntroCopy: { flex: 1, minWidth: 0 },
  requestIntroTitle: { color: Colors.textPrimary, fontSize: 15, fontFamily: 'Inter-Bold' },
  requestIntroSub: { color: Colors.textSecondary, fontSize: 10, lineHeight: 14, fontFamily: 'Inter-Regular', marginTop: 3 },
  requestTotal: { minWidth: 30, height: 30, borderRadius: 15, textAlign: 'center', textAlignVertical: 'center', color: Colors.white, backgroundColor: Colors.orange, fontSize: 12, fontFamily: 'Inter-Bold', fontVariant: ['tabular-nums'] },
  requestRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card },
  requestAvatar: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orangeDim },
  requestCopy: { flex: 1, minWidth: 0 },
  requestTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  requestName: { flex: 1, color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-Bold' },
  requestTime: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Regular', fontVariant: ['tabular-nums'] },
  requestStatus: { color: Colors.textSecondary, fontSize: 10, fontFamily: 'Inter-SemiBold', marginTop: 3 },
  requestStatusOpen: { color: Colors.orange },
  requestStatusLeft: { color: Colors.error },
  requestPreview: { color: Colors.textMuted, fontSize: 11, lineHeight: 15, fontFamily: 'Inter-Regular', marginTop: 5 },
  requestEnd: { minWidth: 26, alignItems: 'center', gap: 9 },
  listBadge: { minWidth: 23, height: 23, borderRadius: 12, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orange },
  listEmpty: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 9 },
  contactsArea: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, backgroundColor: Colors.surface },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingBottom: 8 },
  sectionTitle: { color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter-Bold', textTransform: 'uppercase' },
  sectionCount: { color: Colors.white, fontSize: 10, fontFamily: 'Inter-Bold', backgroundColor: Colors.orange, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2 },
  contactsScroll: { paddingHorizontal: 14, gap: 8 },
  contact: { width: 185, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card },
  contactActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  avatar: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orangeDim },
  avatarActive: { backgroundColor: Colors.orange },
  contactCopy: { flex: 1, minWidth: 0 },
  contactName: { color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter-Bold' },
  contactNameActive: { color: Colors.orange },
  contactState: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Regular', marginTop: 3 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orange },
  badgeText: { color: Colors.white, fontSize: 9, fontFamily: 'Inter-Bold' },
  chatHead: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, backgroundColor: Colors.surface },
  backButton: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card },
  chatHeadCopy: { flex: 1, minWidth: 0 },
  chatTitle: { color: Colors.textPrimary, fontSize: 15, fontFamily: 'Inter-Bold' },
  chatSub: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 3 },
  acceptButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: Colors.orange },
  acceptText: { color: Colors.white, fontSize: 11, fontFamily: 'Inter-Bold' },
  closeButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.error, backgroundColor: Colors.errorDim },
  closeButtonText: { color: Colors.error, fontSize: 10, fontFamily: 'Inter-Bold' },
  leftBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 12, marginBottom: 0, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.error, backgroundColor: Colors.errorDim },
  leftBannerIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card },
  leftBannerCopy: { flex: 1, minWidth: 0 },
  leftBannerTitle: { color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter-Bold' },
  leftBannerText: { color: Colors.textSecondary, fontSize: 10, lineHeight: 14, fontFamily: 'Inter-Regular', marginTop: 3 },
  messages: { flex: 1 },
  messagesContent: { flexGrow: 1, padding: 14, gap: 9 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9 },
  emptyText: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular' },
  messageRow: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  otherRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16, borderWidth: 1 },
  mineBubble: { backgroundColor: Colors.orange, borderColor: Colors.orange, borderBottomRightRadius: 5 },
  otherBubble: { backgroundColor: Colors.card, borderColor: Colors.cardBorder, borderBottomLeftRadius: 5 },
  messageText: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20, fontFamily: 'Inter-Regular' },
  mineText: { color: Colors.white },
  time: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Regular', textAlign: 'right', marginTop: 5 },
  mineTime: { color: 'rgba(255,255,255,.72)' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, padding: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder, backgroundColor: Colors.surface },
  input: { flex: 1, minHeight: 46, maxHeight: 110, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, color: Colors.textPrimary, backgroundColor: Colors.card, fontSize: 14, fontFamily: 'Inter-Regular' },
  sendButton: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orange },
  disabled: { opacity: 0.42 },
  deleteFooter: { padding: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder, backgroundColor: Colors.surface },
  deleteButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: Colors.error },
  deleteButtonText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter-Bold' },
  confirmOverlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: Colors.overlay },
  confirmCard: { padding: 18, gap: 10, borderRadius: 18, borderWidth: 1, borderColor: Colors.error, backgroundColor: Colors.surface },
  confirmIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.errorDim },
  confirmTitle: { color: Colors.textPrimary, fontSize: 18, fontFamily: 'Inter-Bold' },
  confirmText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, fontFamily: 'Inter-Regular' },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, paddingTop: 8 },
  confirmCancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 13, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card },
  confirmCancelText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Bold' },
  confirmDelete: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: 13, backgroundColor: Colors.error },
  confirmDeleteText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter-Bold' },
});
