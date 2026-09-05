import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, CheckCheck, ChevronRight, FileText, KeyRound, RotateCcw, ShoppingCart, Trash2, TriangleAlert, X } from 'lucide-react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolation,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  interpolate,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopNotification, ShopNotificationFeed } from '@/services/shopApi';
import SwipeDownSheet, { type SwipeDownSheetHandle } from '@/components/SwipeDownSheet';

const SWIPE_DISMISS_DISTANCE = 86;
const SWIPE_DISMISS_VELOCITY = 780;
const SWIPE_EXIT_DISTANCE = 520;

function tone(item: ShopNotification) {
  if (item.severity === 'error') return '#FB7185';
  if (item.severity === 'warning') return '#FBBF24';
  if (item.severity === 'success') return '#34D399';
  return '#60A5FA';
}

function NoticeIcon({ item }: { item: ShopNotification }) {
  const color = tone(item);
  if (item.notification_type === 'new_order') return <ShoppingCart size={19} color={color} />;
  if (item.notification_type === 'return_requested') return <RotateCcw size={19} color={color} />;
  if (item.notification_type === 'spv_token_expiry') return <KeyRound size={19} color={color} />;
  if (item.entity_type === 'invoice') return <FileText size={19} color={color} />;
  return <TriangleAlert size={19} color={color} />;
}

function ShopNotificationRow({ item, onOpen, onDismiss }: {
  item: ShopNotification;
  onOpen: (item: ShopNotification) => void;
  onDismiss: (item: ShopNotification) => void;
}) {
  const color = tone(item);
  const translateX = useSharedValue(0);

  const finishDismiss = useCallback(() => onDismiss(item), [item, onDismiss]);
  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      const distance = Math.abs(event.translationX);
      const resistedDistance = distance <= 150 ? distance : 150 + ((distance - 150) * 0.22);
      translateX.value = Math.sign(event.translationX) * resistedDistance;
    })
    .onEnd((event) => {
      const shouldDismiss = Math.abs(translateX.value) >= SWIPE_DISMISS_DISTANCE
        || Math.abs(event.velocityX) >= SWIPE_DISMISS_VELOCITY;
      if (shouldDismiss) {
        const direction = translateX.value === 0 ? Math.sign(event.velocityX) || 1 : Math.sign(translateX.value);
        translateX.value = withTiming(direction * SWIPE_EXIT_DISTANCE, { duration: 210 }, (finished) => {
          if (finished) runOnJS(finishDismiss)();
        });
        return;
      }
      translateX.value = withSpring(0, { damping: 21, stiffness: 260, mass: 0.72 });
    });

  const cardMotion = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotateZ: `${interpolate(translateX.value, [-180, 0, 180], [-1.8, 0, 1.8], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const leftActionMotion = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 34, 86], [0, 0.55, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(translateX.value, [0, 86], [0.72, 1], Extrapolation.CLAMP) }],
  }));
  const rightActionMotion = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-86, -34, 0], [1, 0.55, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(translateX.value, [-86, 0], [1, 0.72], Extrapolation.CLAMP) }],
  }));

  return <Animated.View layout={LinearTransition.duration(180)} exiting={FadeOutLeft.duration(180)} style={styles.swipeContainer}>
    <View pointerEvents="none" style={styles.swipeActions}>
      <Animated.View style={[styles.swipeAction, styles.swipeActionLeft, leftActionMotion]}><Trash2 size={20} color="#FFF5F7" /><Text style={styles.swipeActionText}>Șterge</Text></Animated.View>
      <Animated.View style={[styles.swipeAction, styles.swipeActionRight, rightActionMotion]}><Trash2 size={20} color="#FFF5F7" /><Text style={styles.swipeActionText}>Șterge</Text></Animated.View>
    </View>
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.cardSurface, cardMotion]}>
      <TouchableOpacity activeOpacity={0.76} style={styles.item} onPress={() => onOpen(item)}>
        <View style={[styles.itemAccent, { backgroundColor: color }]} />
        <View style={[styles.icon, { backgroundColor: `${color}18` }]}><NoticeIcon item={item} /></View>
        <View style={styles.copy}><View style={styles.itemTop}><Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text><View style={[styles.dot, { backgroundColor: color }]} /></View><Text style={styles.itemBody} numberOfLines={2}>{item.body}</Text><Text style={styles.itemDate}>{new Date(item.created_at.replace(' ', 'T')).toLocaleString('ro-RO')}</Text></View>
        <ChevronRight size={17} color="#777078" />
      </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  </Animated.View>;
}

export default function ShopNotificationsButton({ onOpenEntity }: { onOpenEntity?: (item: ShopNotification) => void }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [unread, setUnread] = useState(0);
  const [visible, setVisible] = useState(false);
  const [feed, setFeed] = useState<ShopNotificationFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNewNotice, setShowNewNotice] = useState(false);
  const sheetRef = useRef<SwipeDownSheetHandle>(null);
  const pendingOpen = useRef<ShopNotification | null>(null);
  const previousUnread = useRef<number | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticePulse = useSharedValue(0);

  const showNewNotificationNotice = useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setShowNewNotice(true);
    noticeTimer.current = setTimeout(() => setShowNewNotice(false), 3000);
  }, []);

  const loadSummary = useCallback(async () => {
    if (!token) return;
    try {
      const nextUnread = (await shopApi.getShopNotificationSummary(token)).unread_count;
      if (nextUnread > 0 && (previousUnread.current === null || nextUnread > previousUnread.current)) {
        showNewNotificationNotice();
      }
      previousUnread.current = nextUnread;
      setUnread(nextUnread);
    } catch { }
  }, [showNewNotificationNotice, token]);
  const loadFeed = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const next = await shopApi.listShopNotifications(token);
      setFeed(next);
      setUnread(next.unread_count);
    }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { const initialCheck = setTimeout(() => void loadSummary(), 0); const timer = setInterval(() => void loadSummary(), 60000); return () => { clearTimeout(initialCheck); clearInterval(timer); }; }, [loadSummary]);
  useEffect(() => { if (!visible) return; const loadTimer = setTimeout(() => void loadFeed(), 0); return () => clearTimeout(loadTimer); }, [visible, loadFeed]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  useEffect(() => {
    if (!showNewNotice) {
      cancelAnimation(noticePulse);
      noticePulse.value = 0;
      return;
    }
    noticePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 210 }),
        withTiming(0, { duration: 320 }),
        withTiming(1, { duration: 210 }),
        withTiming(0, { duration: 520 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(noticePulse);
  }, [noticePulse, showNewNotice]);

  const noticeIconMotion = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(noticePulse.value, [0, 1], [1, 1.18]) },
      { rotateZ: `${interpolate(noticePulse.value, [0, 1], [-7, 7])}deg` },
    ],
  }));

  const removeItemLocally = useCallback((item: ShopNotification) => {
    setFeed((current) => current ? {
      unread_count: Math.max(0, current.unread_count - 1),
      items: current.items.filter((notice) => notice.id !== item.id),
    } : current);
    setUnread((current) => Math.max(0, current - 1));
  }, []);
  const dismissItem = useCallback((item: ShopNotification) => {
    if (!token) return;
    removeItemLocally(item);
    void shopApi.markShopNotificationRead(token, item.id).catch(() => void loadFeed());
  }, [loadFeed, removeItemLocally, token]);
  const closePanel = useCallback(() => {
    setVisible(false);
    const item = pendingOpen.current;
    pendingOpen.current = null;
    if (item) onOpenEntity?.(item);
  }, [onOpenEntity]);
  const dismissPanel = useCallback(() => sheetRef.current?.dismiss(), []);
  const openItem = useCallback((item: ShopNotification) => {
    dismissItem(item);
    pendingOpen.current = item;
    dismissPanel();
  }, [dismissItem, dismissPanel]);
  const markAll = async () => {
    if (!token || !feed?.unread_count) return;
    setFeed({ unread_count: 0, items: [] });
    setUnread(0);
    try { await shopApi.markShopNotificationRead(token, '', true); }
    catch { void loadFeed(); }
  };

  return <><View style={styles.buttonWrap}>{showNewNotice ? <Animated.View entering={FadeInRight.duration(220)} exiting={FadeOutRight.duration(180)} pointerEvents="none" style={styles.newNotice}><Animated.View style={[styles.noticeIcon, noticeIconMotion]}><Text style={styles.noticeIconText}>!</Text></Animated.View><Text style={styles.newNoticeText}>Ai notificări noi</Text><View style={styles.noticeArrow} /></Animated.View> : null}<TouchableOpacity accessibilityRole="button" accessibilityLabel={`Notificări SHOP${unread ? `, ${unread} necitite` : ''}`} style={styles.button} onPress={() => setVisible(true)}><Bell size={20} color={unread ? '#FFB36B' : '#C5BFC6'} />{unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View> : null}</TouchableOpacity></View>
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={dismissPanel}><GestureHandlerRootView style={styles.modalRoot}><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={dismissPanel} /><SwipeDownSheet ref={sheetRef} visible={visible} onClose={closePanel} style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 10) }]} header={<View style={styles.header}><View><Text style={styles.kicker}>CENTRU SHOP</Text><Text style={styles.title}>Notificări</Text></View><View style={styles.headerActions}>{Boolean(feed?.unread_count) && <TouchableOpacity style={styles.readAll} onPress={() => void markAll()}><CheckCheck size={17} color="#8AB4F8" /><Text style={styles.readAllText}>Toate</Text></TouchableOpacity>}<TouchableOpacity style={styles.close} onPress={dismissPanel}><X size={20} color={Colors.textPrimary} /></TouchableOpacity></View></View>}>
      {loading && !feed ? <View style={styles.loading}><ActivityIndicator color="#FF8A00" /><Text style={styles.emptyText}>Se actualizează notificările...</Text></View> : <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>{feed?.items.length ? feed.items.map((item) => <ShopNotificationRow key={item.id} item={item} onOpen={openItem} onDismiss={dismissItem} />) : <View style={styles.empty}><Bell size={28} color="#777078" /><Text style={styles.emptyTitle}>Totul este la zi</Text><Text style={styles.emptyText}>Comenzile, retururile și termenele SPV vor apărea aici.</Text></View>}</ScrollView>}
    </SwipeDownSheet></View></GestureHandlerRootView></Modal></>;
}

const styles = StyleSheet.create({
  buttonWrap: { position: 'relative', zIndex: 20 }, button: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#49444C', borderRadius: 14, backgroundColor: '#232126' }, badge: { minWidth: 18, height: 18, position: 'absolute', right: -5, top: -5, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#171619', borderRadius: 9, paddingHorizontal: 3, backgroundColor: '#FB5D38' }, badgeText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 7 }, newNotice: { position: 'absolute', right: 54, top: 0, height: 42, minWidth: 154, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#FF8A0066', borderRadius: 14, paddingHorizontal: 11, backgroundColor: '#302117', shadowColor: '#000000', shadowOpacity: 0.34, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 9 }, newNoticeText: { color: '#FFE7D0', fontFamily: 'Inter-Bold', fontSize: 10 }, noticeIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FF7A20' }, noticeIconText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 15, lineHeight: 18 }, noticeArrow: { position: 'absolute', right: -6, top: 15, width: 12, height: 12, borderTopWidth: 1, borderRightWidth: 1, borderColor: '#FF8A0066', backgroundColor: '#302117', transform: [{ rotateZ: '45deg' }] }, modalRoot: { flex: 1 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#050405CC' }, sheet: { width: '100%', maxWidth: 720, maxHeight: '88%', alignSelf: 'center', overflow: 'hidden', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderBottomWidth: 0, borderColor: '#403C43', backgroundColor: '#141316' }, header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: '#2B292E', paddingHorizontal: 14, paddingBottom: 8 }, kicker: { color: '#FF9C52', fontFamily: 'Inter-Bold', fontSize: 8.5, letterSpacing: 1 }, title: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 21, marginTop: 4 }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, readAll: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#41638A', borderRadius: 12, paddingHorizontal: 10, backgroundColor: '#1C2938' }, readAllText: { color: '#A8C7FA', fontFamily: 'Inter-Bold', fontSize: 9 }, close: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFFFFF0A' }, list: { gap: 10, padding: 12, paddingBottom: 22 }, cardSurface: { position: 'relative', zIndex: 2, width: '100%', overflow: 'hidden', borderRadius: 18, backgroundColor: '#1D1C20', elevation: 1 }, item: { position: 'relative', minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#35343A', borderRadius: 18, paddingVertical: 13, paddingLeft: 15, paddingRight: 13, backgroundColor: '#1D1C20' }, itemAccent: { position: 'absolute', top: 14, bottom: 14, left: 0, width: 3, borderTopRightRadius: 4, borderBottomRightRadius: 4 }, icon: { width: 46, height: 46, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF0A', borderRadius: 15 }, copy: { flex: 1, minWidth: 0 }, itemTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, itemTitle: { flex: 1, color: '#F4EFF5', fontFamily: 'Inter-Bold', fontSize: 13, lineHeight: 17 }, dot: { width: 8, height: 8, borderRadius: 4, shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 3 }, itemBody: { color: '#B5AEB7', fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 16, marginTop: 5 }, itemDate: { color: '#837C85', fontFamily: 'Inter-Medium', fontSize: 9, lineHeight: 12, marginTop: 7 }, loading: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10 }, empty: { minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 24 }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16, marginTop: 11 }, emptyText: { maxWidth: 290, color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 },
  swipeContainer: { position: 'relative', overflow: 'hidden', borderRadius: 18, backgroundColor: '#1D1C20' }, swipeActions: { position: 'absolute', zIndex: 0, top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#9F2947' }, swipeAction: { width: 92, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 5 }, swipeActionLeft: { borderTopLeftRadius: 18, borderBottomLeftRadius: 18 }, swipeActionRight: { borderTopRightRadius: 18, borderBottomRightRadius: 18 }, swipeActionText: { color: '#FFF5F7', fontFamily: 'Inter-Bold', fontSize: 10 },
});
