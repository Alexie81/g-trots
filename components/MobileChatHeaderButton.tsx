import React, { useCallback, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import ChatModal from '@/components/ChatModal';
import { getAgentChatUnread, getMobileChatUnread } from '@/services/api';

interface Props {
  compact?: boolean;
}

export default function MobileChatHeaderButton({ compact }: Props) {
  const { token, user } = useAuth();
  const [showChat, setShowChat] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const chatPollInFlight = useRef(false);
  const isCompact = compact ?? false;

  const pollChatUnread = useCallback(async () => {
    if (showChat || chatPollInFlight.current || AppState.currentState !== 'active') return;
    chatPollInFlight.current = true;
    try {
      if (!token) return;
      const agentMode = Boolean(user?.support_chat_access);
      const data = agentMode ? await getAgentChatUnread(token) : await getMobileChatUnread(token);
      setChatUnread(data.unread_count);
    } catch {
    } finally {
      chatPollInFlight.current = false;
    }
  }, [showChat, token, user?.support_chat_access]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return undefined;
      pollChatUnread();
      const timer = setInterval(pollChatUnread, 45000);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') pollChatUnread();
      });
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, [pollChatUnread, token])
  );

  return (
    <>
      <TouchableOpacity
        style={[styles.chatBtn, isCompact && styles.chatBtnCompact]}
        onPress={() => setShowChat(true)}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel="Deschide chatul de support">
        <LinearGradient
          colors={[Colors.orangeLight, Colors.orange]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.chatBtnGradient, isCompact && styles.chatBtnGradientCompact]}>
          <View style={styles.chatIconWrap}>
            <MessageCircle size={16} color={Colors.white} />
          </View>
          {!isCompact && (
            <Text style={styles.chatBtnText}>
              {user?.support_chat_access ? 'Agent Support' : 'Support'}
            </Text>
          )}
        </LinearGradient>
        {chatUnread > 0 && (
          <View style={styles.chatBadge}>
            <Text style={styles.chatBadgeText}>{chatUnread > 9 ? '9+' : chatUnread}</Text>
          </View>
        )}
      </TouchableOpacity>

      {showChat ? (
        <ChatModal
          visible
          onClose={() => {
            setShowChat(false);
            pollChatUnread();
          }}
          onUnreadChange={setChatUnread}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chatBtn: {
    height: 38,
    minWidth: 104,
    borderRadius: 19,
    shadowColor: Colors.orange,
    shadowOpacity: 0.28,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  chatBtnCompact: {
    minWidth: 44,
    width: 44,
  },
  chatBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  chatBtnGradientCompact: {
    paddingHorizontal: 0,
  },
  chatIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  chatBtnText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  chatBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 10,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  chatBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontFamily: 'Inter-Bold',
    lineHeight: 11,
  },
});
