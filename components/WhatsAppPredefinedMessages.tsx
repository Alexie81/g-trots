import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, MessageSquareText, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  createWhatsAppPredefinedMessage,
  deleteWhatsAppPredefinedMessage,
  getWhatsAppPredefinedMessages,
  updateWhatsAppPredefinedMessage,
} from '@/services/api';
import type { WhatsAppPredefinedMessage } from '@/types';
import KeyboardAwareScrollView from '@/components/KeyboardAwareScrollView';
import SwipeDownSheet from '@/components/SwipeDownSheet';

interface Props {
  expanded?: boolean;
}

export default function WhatsAppPredefinedMessages({ expanded = false }: Props) {
  const { token } = useAuth();
  const [open, setOpen] = useState(expanded);
  const [messages, setMessages] = useState<WhatsAppPredefinedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<WhatsAppPredefinedMessage | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!token) return;
    try {
      setMessages(await getWhatsAppPredefinedMessages(token));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const edit = (message?: WhatsAppPredefinedMessage) => {
    setEditing(message || null);
    setTitle(message?.title || '');
    setBody(message?.body || '');
    setError('');
    setModal(true);
  };

  const save = async () => {
    if (!title.trim() || !body.trim()) return setError('Titlul si mesajul sunt obligatorii.');
    setSaving(true);
    setError('');
    try {
      if (editing) await updateWhatsAppPredefinedMessage(token, editing.id, title.trim(), body.trim());
      else await createWhatsAppPredefinedMessage(token, title.trim(), body.trim());
      setModal(false);
      await load();
    } catch (e: any) {
      setError(e.message || 'Mesajul nu a putut fi salvat.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (message: WhatsAppPredefinedMessage) => Alert.alert(
    'Sterge mesajul',
    `Stergi mesajul "${message.title}"?`,
    [
      { text: 'Anuleaza', style: 'cancel' },
      { text: 'Sterge', style: 'destructive', onPress: async () => {
        await deleteWhatsAppPredefinedMessage(token, message.id);
        await load();
      } },
    ]
  );

  return (
    <>
      <TouchableOpacity style={styles.header} onPress={() => setOpen((value) => !value)}>
        <MessageSquareText size={17} color="#25D366" />
        <Text style={styles.headerTitle}>WhatsApp Predefined Messages</Text>
        <View style={styles.count}><Text style={styles.countText}>{messages.length}</Text></View>
        {open ? <ChevronUp size={17} color={Colors.textMuted} /> : <ChevronDown size={17} color={Colors.textMuted} />}
      </TouchableOpacity>
      {open && (
        <View style={styles.content}>
          {loading ? <ActivityIndicator color={Colors.orange} /> : messages.map((message) => (
            <View key={message.id} style={styles.card}>
              <View style={styles.cardMain}>
                <Text style={styles.title}>{message.title}</Text>
                <Text style={styles.body} numberOfLines={3}>{message.body}</Text>
              </View>
              <TouchableOpacity style={styles.iconBtn} onPress={() => edit(message)}><Pencil size={15} color={Colors.orange} /></TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => remove(message)}><Trash2 size={15} color={Colors.error} /></TouchableOpacity>
            </View>
          ))}
          {!loading && !messages.length && <Text style={styles.empty}>Nu exista mesaje predefinite.</Text>}
          <TouchableOpacity style={styles.add} onPress={() => edit()}>
            <Plus size={16} color="#25D366" /><Text style={styles.addText}>Adauga mesaj</Text>
          </TouchableOpacity>
        </View>
      )}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SwipeDownSheet
            visible={modal}
            onClose={() => setModal(false)}
            disabled={saving}
            style={styles.sheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{editing ? 'Editeaza mesaj' : 'Mesaj WhatsApp nou'}</Text>
              <TouchableOpacity style={styles.iconBtn} onPress={() => setModal(false)}><X size={18} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            <KeyboardAwareScrollView extraScrollHeight={120}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.label}>Titlu</Text>
              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex: Confirmare programare" placeholderTextColor={Colors.textMuted} />
              <Text style={styles.label}>Mesaj</Text>
              <TextInput style={[styles.input, styles.textarea]} value={body} onChangeText={setBody} multiline placeholder="Scrie mesajul..." placeholderTextColor={Colors.textMuted} />
              <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Salveaza mesajul</Text>}
              </TouchableOpacity>
            </KeyboardAwareScrollView>
          </SwipeDownSheet>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: 2 },
  headerTitle: { flex: 1, color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-SemiBold' },
  count: { backgroundColor: '#25D36622', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { color: '#25D366', fontSize: 12, fontFamily: 'Inter-Bold' },
  content: { gap: 8, padding: 12, marginBottom: 16, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: Colors.cardBorder },
  cardMain: { flex: 1 }, title: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  body: { color: Colors.textMuted, fontSize: 11, lineHeight: 16, fontFamily: 'Inter-Regular', marginTop: 3 },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.cardBorder },
  empty: { color: Colors.textMuted, textAlign: 'center', padding: 12 },
  add: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, padding: 11, borderWidth: 1, borderStyle: 'dashed', borderColor: '#25D36688', borderRadius: 10 },
  addText: { color: '#25D366', fontFamily: 'Inter-SemiBold', fontSize: 13 },
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, borderWidth: 1, borderColor: Colors.cardBorder },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  modalTitle: { flex: 1, color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold' },
  label: { color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter-Medium', textTransform: 'uppercase', marginTop: 12, marginBottom: 5 },
  input: { color: Colors.textPrimary, backgroundColor: Colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.cardBorder },
  textarea: { minHeight: 130, textAlignVertical: 'top' },
  error: { color: Colors.error, padding: 10, backgroundColor: Colors.errorDim, borderRadius: 8 },
  save: { marginTop: 18, alignItems: 'center', backgroundColor: Colors.orange, borderRadius: 10, padding: 13 },
  saveText: { color: Colors.white, fontFamily: 'Inter-SemiBold' },
});
