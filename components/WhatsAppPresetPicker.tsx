import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MessageCircle, Send, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { getWhatsAppPredefinedMessages } from '@/services/api';
import type { WhatsAppPredefinedMessage } from '@/types';

interface Props {
  visible: boolean;
  phone: string;
  clientName: string;
  onClose: () => void;
}

function whatsappPhone(phone: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) digits = `40${digits.slice(1)}`;
  return digits;
}

export default function WhatsAppPresetPicker({ visible, phone, clientName, onClose }: Props) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<WhatsAppPredefinedMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !token) return;
    setLoading(true);
    getWhatsAppPredefinedMessages(token).then(setMessages).finally(() => setLoading(false));
  }, [token, visible]);

  const send = async (message: WhatsAppPredefinedMessage) => {
    const text = message.body.replace(/\{\{\s*nume\s*\}\}/gi, clientName);
    const number = whatsappPhone(phone);
    const appUrl = `whatsapp://send?phone=${number}&text=${encodeURIComponent(text)}`;
    const webUrl = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
    await Linking.openURL((await Linking.canOpenURL(appUrl)) ? appUrl : webUrl);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.logo}><MessageCircle size={20} color="#25D366" /></View>
            <View style={styles.headText}>
              <Text style={styles.title}>Trimite mesaj WhatsApp</Text>
              <Text style={styles.sub}>{clientName} · {phone}</Text>
            </View>
            <TouchableOpacity style={styles.close} onPress={onClose}><X size={19} color={Colors.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {loading ? <ActivityIndicator color={Colors.orange} /> : messages.map((message) => (
              <TouchableOpacity key={message.id} style={styles.message} onPress={() => send(message)}>
                <View style={styles.messageMain}>
                  <Text style={styles.messageTitle}>{message.title}</Text>
                  <Text style={styles.messageBody} numberOfLines={3}>{message.body}</Text>
                </View>
                <Send size={17} color="#25D366" />
              </TouchableOpacity>
            ))}
            {!loading && !messages.length && <Text style={styles.empty}>Adauga mai intai un mesaj din Setari.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: { maxHeight: '82%', backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: Colors.cardBorder, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  logo: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#25D36618', borderWidth: 1, borderColor: '#25D36655' },
  headText: { flex: 1 }, title: { color: Colors.textPrimary, fontSize: 16, fontFamily: 'Inter-Bold' },
  sub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 }, close: { padding: 8 },
  list: { gap: 8, paddingBottom: 24 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.cardBorder },
  messageMain: { flex: 1 }, messageTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 13 },
  messageBody: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 16, marginTop: 3 },
  empty: { color: Colors.textMuted, textAlign: 'center', padding: 24 },
});
