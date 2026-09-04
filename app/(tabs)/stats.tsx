import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Redirect, useFocusEffect } from 'expo-router';
import { Colors, StatusColors, StatusLabels, fmt } from '@/constants/colors';
import Header from '@/components/Header';
import MobileChatHeaderButton from '@/components/MobileChatHeaderButton';
import StatCard from '@/components/StatCard';
import { useAuth } from '@/contexts/AuthContext';
import { getStats } from '@/services/api';
import type { StatsData } from '@/types';
import { runWhenIdle } from '@/utils/runWhenIdle';
import {
  Users,
  CircleDollarSign,
  TrendingUp,
  CheckCircle,
  Clock,
  Wrench,
} from 'lucide-react-native';

type Period = 'today' | 'week' | 'month' | 'year' | 'all';

type StatsSnapshot = {
  lastPeriod: Period;
  byPeriod: Partial<Record<Period, StatsData>>;
};

const STATS_SNAPSHOT_LIMIT = 2;
const statsSnapshots = new Map<string, StatsSnapshot>();

function readStatsSnapshot(authToken: string) {
  if (!authToken) return undefined;
  const snapshot = statsSnapshots.get(authToken);
  if (!snapshot) return undefined;
  statsSnapshots.delete(authToken);
  statsSnapshots.set(authToken, snapshot);
  return snapshot;
}

function rememberStatsSnapshot(authToken: string, period: Period, data: StatsData) {
  if (!authToken) return;
  const current = statsSnapshots.get(authToken);
  if (current) statsSnapshots.delete(authToken);
  while (statsSnapshots.size >= STATS_SNAPSHOT_LIMIT) {
    const oldest = statsSnapshots.keys().next().value;
    if (!oldest) break;
    statsSnapshots.delete(oldest);
  }
  statsSnapshots.set(authToken, {
    lastPeriod: period,
    byPeriod: { ...current?.byPeriod, [period]: data },
  });
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Azi' },
  { key: 'week', label: '7 Zile' },
  { key: 'month', label: 'Luna' },
  { key: 'year', label: 'An' },
  { key: 'all', label: 'Total' },
];

const PERIOD_LABELS: Record<Period, string> = {
  today: 'astazi',
  week: 'ultimele 7 zile',
  month: 'luna aceasta',
  year: 'anul acesta',
  all: 'toate timpurile',
};

const formatStatDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { token, user, refreshUser } = useAuth();
  const initialSnapshot = useMemo(() => readStatsSnapshot(token), [token]);
  const initialPeriod = initialSnapshot?.lastPeriod || 'all';
  const initialStats = initialSnapshot?.byPeriod[initialPeriod] || null;
  const [stats, setStats] = useState<StatsData | null>(initialStats);
  const [loading, setLoading] = useState(() => !initialStats && user?.role !== 'user');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [showCollaboratorsModal, setShowCollaboratorsModal] = useState(false);
  const statsRef = useRef<StatsData | null>(initialStats);
  const statsRequestRef = useRef(0);
  const collaboratorSheetY = useSharedValue(windowHeight);
  const collaboratorSheetStartY = useSharedValue(0);
  const collapsedSheetY = Math.max(210, Math.min(windowHeight * 0.38, 360));

  const finishCollaboratorModalClose = useCallback(() => {
    setShowCollaboratorsModal(false);
  }, []);

  const closeCollaboratorsModal = useCallback(() => {
    collaboratorSheetY.value = withTiming(windowHeight, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishCollaboratorModalClose)();
    });
  }, [collaboratorSheetY, finishCollaboratorModalClose, windowHeight]);

  useEffect(() => {
    if (!showCollaboratorsModal) return;
    collaboratorSheetY.value = windowHeight;
    collaboratorSheetY.value = withSpring(collapsedSheetY, {
      damping: 22,
      stiffness: 220,
      mass: 0.85,
    });
  }, [collapsedSheetY, collaboratorSheetY, showCollaboratorsModal, windowHeight]);

  const collaboratorSheetPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gestureState) =>
        Math.abs(gestureState.dy) > 3
        && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderGrant: () => {
        collaboratorSheetStartY.value = collaboratorSheetY.value;
      },
      onPanResponderMove: (_event, gestureState) => {
        collaboratorSheetY.value = Math.max(
          0,
          Math.min(windowHeight, collaboratorSheetStartY.value + gestureState.dy)
        );
      },
      onPanResponderRelease: (_event, gestureState) => {
        const currentY = Math.max(
          0,
          Math.min(windowHeight, collaboratorSheetStartY.value + gestureState.dy)
        );
        if (gestureState.vy > 0.7 || currentY > collapsedSheetY + 90) {
          collaboratorSheetY.value = withTiming(windowHeight, { duration: 210 }, (finished) => {
            if (finished) runOnJS(finishCollaboratorModalClose)();
          });
          return;
        }
        const expand = gestureState.vy < -0.42 || currentY < collapsedSheetY * 0.52;
        collaboratorSheetY.value = withSpring(expand ? 0 : collapsedSheetY, {
          damping: 22,
          stiffness: 230,
          mass: 0.85,
        });
      },
      onPanResponderTerminate: () => {
        collaboratorSheetY.value = withSpring(collapsedSheetY, {
          damping: 22,
          stiffness: 230,
          mass: 0.85,
        });
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
    [
      collapsedSheetY,
      collaboratorSheetStartY,
      collaboratorSheetY,
      finishCollaboratorModalClose,
      windowHeight,
    ]
  );

  const collaboratorSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: collaboratorSheetY.value }],
  }));

  const load = useCallback(async (p: Period, silent = false) => {
    if (!token) return null;
    const requestId = ++statsRequestRef.current;
    try {
      if (!silent) setError('');
      const data = await getStats(token, p);
      if (requestId !== statsRequestRef.current) return null;
      statsRef.current = data;
      setStats(data);
      rememberStatsSnapshot(token, p, data);
      return data;
    } catch {
      if (requestId === statsRequestRef.current && (!silent || !statsRef.current)) {
        setError('Eroare la incarcarea statisticilor.');
      }
      return null;
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (user?.role === 'user') return;
      let active = true;
      const hasSnapshot = Boolean(statsRef.current);
      if (!hasSnapshot) setLoading(true);
      const frame = requestAnimationFrame(() => {
        const task = runWhenIdle(() => {
          if (!active) return;
          void refreshUser();
          void load(period, hasSnapshot).finally(() => {
            if (active) setLoading(false);
          });
        });
        interactionTask = task;
      });
      let interactionTask: ReturnType<typeof runWhenIdle> | null = null;
      return () => {
        active = false;
        cancelAnimationFrame(frame);
        interactionTask?.cancel();
        statsRequestRef.current += 1;
      };
    }, [load, period, refreshUser, user?.role])
  );

  const handlePeriod = (p: Period) => {
    if (p === period) return;
    const cached = readStatsSnapshot(token)?.byPeriod[p] || null;
    statsRequestRef.current += 1;
    setPeriod(p);
    statsRef.current = cached;
    setStats(cached);
    setError('');
    setLoading(!cached);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        refreshUser(),
        load(period, Boolean(statsRef.current)),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (user?.role === 'user') {
    return <Redirect href="/(tabs)" />;
  }

  const totalCollaboratorCosts = stats?.collaboratorStats.reduce((s, c) => s + c.totalCost, 0) ?? 0;
  const totalCollaboratorPaid = stats?.collaboratorStats.reduce(
    (sum, item) => sum + Number(item.paidCost ?? item.totalCost ?? 0),
    0
  ) ?? 0;
  const totalCollaboratorOnHold = stats?.collaboratorStats.reduce(
    (sum, item) => sum + Number(item.onHoldCost ?? 0),
    0
  ) ?? 0;
  const totalGtrotsNet = stats ? (stats.netProfit ?? (stats.totalRevenue - (stats.totalExpenses ?? 0))) : 0;

  return (
    <View style={styles.container}>
      <Header title="" right={<MobileChatHeaderButton />} />

      {/* Period selector */}
      <View style={styles.periodWrap}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            onPress={() => handlePeriod(p.key)}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.orange}
            colors={[Colors.orange]}
          />
        }>
        {loading && !stats ? (
          <View style={styles.inlineLoader}>
            <ActivityIndicator color={Colors.orange} size="small" />
            <Text style={styles.inlineLoaderText}>Se sincronizează statisticile...</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {stats && (
          <>
            <View style={styles.periodLabel}>
              <Text style={styles.periodLabelText}>
                Afisare pentru: <Text style={{ color: Colors.orange }}>{PERIOD_LABELS[period]}</Text>
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Prezentare Generala</Text>
            <View style={styles.grid}>
              <StatCard
                label="Total Clienti"
                value={String(stats.totalClients)}
                color={Colors.orange}
                icon={<Users size={20} color={Colors.orange} />}
              />
              <StatCard
                label="Venituri Totale"
                value={`${fmt(stats.totalRevenue)} RON`}
                color={Colors.success}
                icon={<CircleDollarSign size={20} color={Colors.success} />}
              />
              <StatCard
                label="Clienti in asteptare"
                value={String(stats.onHoldClients ?? stats.statusCounts.va_folosi_codul)}
                color={Colors.statusVaFolosi}
                icon={<Clock size={20} color={Colors.statusVaFolosi} />}
              />
              <StatCard
                label="Venituri On Hold"
                value={`${fmt(stats.onHoldRevenue ?? 0)} RON`}
                color={Colors.warning}
                sub="Totaluri si resturi neachitate"
                icon={<CircleDollarSign size={20} color={Colors.warning} />}
              />
              <StatCard
                label="Cod Folosit"
                value={String(stats.statusCounts.cod_folosit)}
                color={Colors.statusFolosit}
                icon={<CheckCircle size={20} color={Colors.statusFolosit} />}
              />
              <StatCard
                label="G-Trots Net"
                value={`${fmt(totalGtrotsNet)} RON`}
                color={Colors.orangeLight}
                sub="dupa comisioane si cheltuieli"
                icon={<TrendingUp size={20} color={Colors.orangeLight} />}
              />
              <StatCard
                label="Colaboratori"
                value={`${fmt(totalCollaboratorCosts)} RON`}
                color={Colors.warning}
                sub={`${fmt(totalCollaboratorPaid)} incasat / ${fmt(totalCollaboratorOnHold)} on hold`}
                icon={<Wrench size={20} color={Colors.warning} />}
                onPress={() => setShowCollaboratorsModal(true)}
              />
            </View>

            {stats.profileStats.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Profiluri Afiliere</Text>
                {stats.profileStats.map((ps) => (
                  <View key={ps.profile.id} style={[styles.profileCard, { borderColor: ps.profile.color + '55' }]}>
                    <View style={styles.profileHeader}>
                      <View style={[styles.colorDot, { backgroundColor: ps.profile.color }]} />
                      <Text style={styles.profileName}>{ps.profile.name}</Text>
                      <View style={[styles.pctBadge, { backgroundColor: ps.profile.color + '22' }]}>
                        <Text style={[styles.pctText, { color: ps.profile.color }]}>
                          {ps.profile.percentage}%
                        </Text>
                      </View>
                    </View>
                    {ps.profile.role ? (
                      <Text style={styles.profileRole}>{ps.profile.role}</Text>
                    ) : null}

                    <View style={styles.profileStats}>
                      <View style={styles.profileStat}>
                        <Text style={styles.profileStatValue}>{ps.clientCount}</Text>
                        <Text style={styles.profileStatLabel}>Clienti</Text>
                      </View>
                      <View style={[styles.divider]} />
                      <View style={styles.profileStat}>
                        <Text style={styles.profileStatValue}>{fmt(ps.totalRevenue)} RON</Text>
                        <Text style={styles.profileStatLabel}>Valoare Totala</Text>
                      </View>
                      <View style={[styles.divider]} />
                      <View style={styles.profileStat}>
                        <Text style={[styles.profileStatValue, { color: ps.profile.color }]}>
                          {fmt(ps.profileEarnings)} RON
                        </Text>
                        <Text style={styles.profileStatLabel}>Comision ({ps.profile.percentage}%)</Text>
                      </View>
                    </View>

                    <View style={styles.progressWrap}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${ps.profile.percentage}%` as any,
                              backgroundColor: ps.profile.color,
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.progressLabels}>
                        <Text style={[styles.progressLabel, { color: ps.profile.color }]}>
                          {ps.profile.name}: {ps.profile.percentage}%
                        </Text>
                        <Text style={styles.progressLabel}>
                          G-Trots: {(100 - ps.profile.percentage).toFixed(0)}%
                        </Text>
                      </View>
                      <View style={styles.earningsRow}>
                        <View style={[styles.earningBox, { backgroundColor: ps.profile.color + '18' }]}>
                          <Text style={[styles.earningVal, { color: ps.profile.color }]}>
                            {fmt(ps.profileEarnings)} RON
                          </Text>
                          <Text style={styles.earningLabel}>{ps.profile.name}</Text>
                        </View>
                        <View style={[styles.earningBox, { backgroundColor: Colors.orangeDim }]}>
                          <Text style={[styles.earningVal, { color: Colors.orange }]}>
                            {fmt(ps.gtrotsEarnings)} RON
                          </Text>
                          <Text style={styles.earningLabel}>G-Trots</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}

          </>
        )}
      </ScrollView>

      <Modal
        visible={showCollaboratorsModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeCollaboratorsModal}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeCollaboratorsModal} />
          <Animated.View style={[styles.modalSheet, collaboratorSheetStyle]}>
              <Animated.View
                style={[styles.modalDragArea, { paddingTop: insets.top + 10 }]}
                {...collaboratorSheetPanResponder.panHandlers}>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Colaboratori</Text>
                    <Text style={styles.modalSub}>
                      {PERIOD_LABELS[period]} - {fmt(totalCollaboratorCosts)} RON
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.modalClose}
                    onPress={closeCollaboratorsModal}>
                    <Text style={styles.modalCloseText}>Inchide</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>

              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                {stats && stats.collaboratorStats.length > 0 ? (
                  stats.collaboratorStats.map((cs) => (
                    <View
                      key={cs.collaborator.id}
                      style={[styles.collaboratorCard, { borderColor: cs.collaborator.color + '55' }]}>
                      <View style={styles.profileHeader}>
                        <View style={[styles.colorDot, { backgroundColor: cs.collaborator.color }]} />
                        <Text style={styles.profileName}>{cs.collaborator.name}</Text>
                        <View style={[styles.pctBadge, { backgroundColor: cs.collaborator.color + '22' }]}>
                          <Text style={[styles.pctText, { color: cs.collaborator.color }]}>
                            {fmt(cs.totalCost)} RON
                          </Text>
                        </View>
                      </View>
                      {cs.collaborator.role ? (
                        <Text style={styles.profileRole}>{cs.collaborator.role}</Text>
                      ) : null}

                      <View style={styles.profileStats}>
                        <View style={styles.profileStat}>
                          <Text style={styles.profileStatValue}>{cs.clientCount}</Text>
                          <Text style={styles.profileStatLabel}>Clienti</Text>
                        </View>
                        <View style={[styles.divider]} />
                        <View style={styles.profileStat}>
                          <Text style={[styles.profileStatValue, { color: Colors.success }]}>
                            {fmt(cs.paidCost ?? cs.totalCost)} RON
                          </Text>
                          <Text style={styles.profileStatLabel}>Incasat</Text>
                        </View>
                        <View style={[styles.divider]} />
                        <View style={styles.profileStat}>
                          <Text style={[styles.profileStatValue, { color: Colors.warning }]}>
                            {fmt(cs.onHoldCost ?? 0)} RON
                          </Text>
                          <Text style={styles.profileStatLabel}>Mai ai de dat</Text>
                        </View>
                      </View>

                      <View style={styles.dailyWrap}>
                        {cs.daily.map((day) => (
                          <View key={`${cs.collaborator.id}-${day.date}`} style={styles.dailyRow}>
                            <Text style={styles.dailyDate}>{formatStatDay(day.date)}</Text>
                            <Text style={styles.dailyClients}>{day.clientCount} clienti</Text>
                            <View style={styles.dailyAmounts}>
                              <Text style={[styles.dailyAmount, { color: Colors.success }]}>
                                {fmt(day.paidCost ?? day.totalCost)} incasat
                              </Text>
                              <Text style={[styles.dailyAmount, { color: Colors.warning }]}>
                                {fmt(day.onHoldCost ?? 0)} de dat
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyModalText}>Nu exista costuri pe colaboratori in perioada selectata.</Text>
                )}
              </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: 14, paddingBottom: 40 },
  inlineLoader: { minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 8 },
  inlineLoaderText: { color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 11 },

  periodWrap: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  periodBtnActive: {
    backgroundColor: Colors.orangeDim,
    borderColor: Colors.orange,
  },
  periodBtnText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: Colors.textSecondary,
  },
  periodBtnTextActive: {
    color: Colors.orange,
    fontFamily: 'Inter-SemiBold',
  },
  periodLabel: {
    marginBottom: 12,
    marginTop: 2,
  },
  periodLabelText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: 'Inter-Regular',
  },

  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 16,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  profileCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  collaboratorCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  profileName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    flex: 1,
  },
  pctBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pctText: { fontSize: 13, fontFamily: 'Inter-Bold' },
  profileRole: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginBottom: 12,
  },
  profileStats: {
    flexDirection: 'row',
    marginBottom: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.separator,
  },
  profileStat: { flex: 1, alignItems: 'center' },
  profileStatValue: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    marginBottom: 2,
  },
  profileStatLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular' },
  divider: { width: 1, backgroundColor: Colors.separator },
  progressWrap: {},
  progressBar: {
    height: 6,
    backgroundColor: Colors.cardBorder,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular' },
  earningsRow: { flexDirection: 'row', gap: 10 },
  earningBox: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  earningVal: { fontSize: 15, fontFamily: 'Inter-Bold', marginBottom: 2 },
  earningLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular' },
  dailyWrap: {
    gap: 8,
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  dailyDate: { flex: 1, color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Medium' },
  dailyClients: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular' },
  dailyAmounts: { minWidth: 112, alignItems: 'flex-end', gap: 2 },
  dailyAmount: { textAlign: 'right', fontSize: 11, fontFamily: 'Inter-Bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    height: '100%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  modalDragArea: {
    minHeight: 54,
    paddingTop: 12,
    backgroundColor: Colors.surface,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: Colors.cardBorder,
    marginBottom: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  modalTitle: { color: Colors.textPrimary, fontSize: 18, fontFamily: 'Inter-Bold' },
  modalSub: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  modalClose: {
    marginLeft: 'auto',
    backgroundColor: Colors.card,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modalCloseText: { color: Colors.orange, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  modalContent: { padding: 14, paddingBottom: 24 },
  emptyModalText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingVertical: 24,
  },
  errorText: {
    color: Colors.error,
    backgroundColor: Colors.errorDim,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    fontFamily: 'Inter-Regular',
  },
});
