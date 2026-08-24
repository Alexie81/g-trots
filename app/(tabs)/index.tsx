import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AppState,
  Alert,
  Linking,
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/colors';
import Header from '@/components/Header';
import ClientCard from '@/components/ClientCard';
import MobileChatHeaderButton from '@/components/MobileChatHeaderButton';
import { deleteClient, getClients, getProfiles } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import type { Client, Profile } from '@/types';
import {
  ArrowDownAZ,
  ArrowDownZA,
  CalendarArrowDown,
  CalendarArrowUp,
  CheckCircle,
  Clock,
  Plus,
  Search,
  Filter,
  X,
  RefreshCw,
  AlertTriangle,
  Trash2,
} from 'lucide-react-native';

let savedClientsScrollOffset = 0;
let savedClientsSnapshot: Client[] = [];

type ClientSortMode = '' | 'new' | 'old' | 'name_az' | 'name_za';
type ClientLifecycleFilter = '' | 'active' | 'finalized';
type SortIcon = typeof CalendarArrowDown;

const clientSortOptions: { key: Exclude<ClientSortMode, ''>; label: string; Icon: SortIcon }[] = [
  { key: 'new', label: 'Noi', Icon: CalendarArrowDown },
  { key: 'old', label: 'Vechi', Icon: CalendarArrowUp },
  { key: 'name_az', label: 'Nume A-Z', Icon: ArrowDownAZ },
  { key: 'name_za', label: 'Nume Z-A', Icon: ArrowDownZA },
];

const clientLifecycleOptions: { key: Exclude<ClientLifecycleFilter, ''>; label: string; Icon: SortIcon }[] = [
  { key: 'active', label: 'Activi', Icon: Clock },
  { key: 'finalized', label: 'Finalizati', Icon: CheckCircle },
];

function clientsVersion(items: Client[]) {
  return JSON.stringify(items);
}

function clientCreatedTime(client: Client) {
  const timestamp = new Date(client.created_at || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default function ClientsScreen() {
  const router = useRouter();
  const { token, user, refreshUser } = useAuth();
  const [clients, setClients] = useState<Client[]>(savedClientsSnapshot);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [sortMode, setSortMode] = useState<ClientSortMode>('');
  const [lifecycleFilter, setLifecycleFilter] = useState<ClientLifecycleFilter>('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const clientsSyncInFlight = useRef(false);
  const searchRef = useRef('');
  const selectedProfileRef = useRef('');
  const listRef = useRef<FlatList<Client> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientsRef = useRef<Client[]>([]);
  const loadRequestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const currentScrollOffsetRef = useRef(savedClientsScrollOffset);
  const isRestrictedUser = user?.role === 'user';
  const canViewClientPanel = user?.role !== 'user' || Boolean(user?.client_panel_access);
  const sortedClients = useMemo(() => {
    const filtered = lifecycleFilter
      ? clients.filter((client) => lifecycleFilter === 'active' ? !client.is_finalized : !!client.is_finalized)
      : clients;
    if (!sortMode) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortMode === 'new') return clientCreatedTime(b) - clientCreatedTime(a);
      if (sortMode === 'old') return clientCreatedTime(a) - clientCreatedTime(b);
      const aName = (a.name || '').localeCompare(b.name || '', 'ro', { sensitivity: 'base' });
      return sortMode === 'name_az' ? aName : -aName;
    });
    return copy;
  }, [clients, lifecycleFilter, sortMode]);

  useEffect(() => {
    clientsRef.current = clients;
    savedClientsSnapshot = clients;
  }, [clients]);

  const load = useCallback(async (
    q?: string,
    profileId?: string,
    options: { restoreScroll?: boolean; silent?: boolean } = {}
  ) => {
    if (!canViewClientPanel) {
      setClients([]);
      setError('');
      return;
    }
    const requestId = ++loadRequestIdRef.current;
    try {
      if (!options.silent) setError('');
      const data = await getClients(q, profileId, token);
      if (requestId !== loadRequestIdRef.current) return;
      setClients((current) => clientsVersion(current) === clientsVersion(data) ? current : data);
      if (options.restoreScroll !== false) {
        requestAnimationFrame(() => {
          if (savedClientsScrollOffset > 0) {
            listRef.current?.scrollToOffset({ offset: savedClientsScrollOffset, animated: false });
          }
        });
      }
    } catch (e: any) {
      if (requestId !== loadRequestIdRef.current) return;
      if (!options.silent || clientsRef.current.length === 0) {
        setError(
          clientsRef.current.length > 0
            ? 'Conexiune temporara. Este afisata ultima lista incarcata.'
            : (e?.message || 'Eroare la incarcarea clientilor.')
        );
      }
    }
  }, [canViewClientPanel, token]);

  const loadProfiles = useCallback(async () => {
    try {
      const data = await getProfiles();
      setProfiles(data);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!hasLoadedRef.current && clientsRef.current.length === 0) {
        setLoading(true);
      }
      (async () => {
        const freshUser = await refreshUser();
        const freshCanViewClientPanel = freshUser?.role !== 'user' || Boolean(freshUser?.client_panel_access);
        if (!freshCanViewClientPanel) {
          setClients([]);
          router.replace('/(tabs)/scanner');
          return;
        }
        await Promise.all([load(searchRef.current, selectedProfileRef.current), loadProfiles()]);
      })().finally(() => {
        if (active) {
          hasLoadedRef.current = true;
          setLoading(false);
        }
      });
      return () => {
        active = false;
      };
    }, [load, loadProfiles, refreshUser, router])
  );

  useEffect(() => {
    if (!canViewClientPanel) {
      setClients([]);
      router.replace('/(tabs)/scanner');
    }
  }, [canViewClientPanel, router]);

  const onRefresh = async () => {
    setRefreshing(true);
    const freshUser = await refreshUser(true);
    const freshCanViewClientPanel = freshUser?.role !== 'user' || Boolean(freshUser?.client_panel_access);
    if (!freshCanViewClientPanel) {
      setClients([]);
      setRefreshing(false);
      router.replace('/(tabs)/scanner');
      return;
    }
    await Promise.all([load(search, selectedProfile, { restoreScroll: false }), loadProfiles()]);
    setRefreshing(false);
  };

  const syncClientsSilently = useCallback(async () => {
    if (!token || !canViewClientPanel || clientsSyncInFlight.current || AppState.currentState !== 'active') return;
    clientsSyncInFlight.current = true;
    try {
      await load(searchRef.current, selectedProfileRef.current, { restoreScroll: false, silent: true });
    } finally {
      clientsSyncInFlight.current = false;
    }
  }, [canViewClientPanel, load, token]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  const onSearch = useCallback((text: string) => {
    savedClientsScrollOffset = 0;
    currentScrollOffsetRef.current = 0;
    searchRef.current = text;
    setSearch(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const runSearch = () => load(text, selectedProfileRef.current);
    if (!text.trim()) {
      runSearch();
      return;
    }
    searchTimerRef.current = setTimeout(runSearch, 320);
  }, [load]);

  const onSelectProfile = (id: string) => {
    savedClientsScrollOffset = 0;
    currentScrollOffsetRef.current = 0;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const next = selectedProfile === id ? '' : id;
    selectedProfileRef.current = next;
    setSelectedProfile(next);
    load(searchRef.current, next);
  };

  const onSelectSort = useCallback((mode: Exclude<ClientSortMode, ''>) => {
    savedClientsScrollOffset = 0;
    currentScrollOffsetRef.current = 0;
    setSortMode((current) => current === mode ? '' : mode);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, []);

  const onSelectLifecycle = useCallback((mode: Exclude<ClientLifecycleFilter, ''>) => {
    savedClientsScrollOffset = 0;
    currentScrollOffsetRef.current = 0;
    setLifecycleFilter((current) => current === mode ? '' : mode);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, []);

  const openClient = useCallback((clientId: string) => {
    savedClientsScrollOffset = currentScrollOffsetRef.current;
    router.push(`/client/${clientId}`);
  }, [router]);

  const canDeleteClient = useCallback((client: Client) => (
    user?.role === 'admin' || (user?.role === 'manager' && !client.is_finalized)
  ), [user?.role]);

  const requestDeleteClient = useCallback((client: Client) => {
    if (!canDeleteClient(client)) {
      Alert.alert('Stergere indisponibila', 'Doar adminul poate sterge orice client. Managerul poate sterge doar clienti activi.');
      return;
    }
    setDeleteError('');
    setDeleteTarget(client);
  }, [canDeleteClient]);

  const closeDeleteModal = useCallback(() => {
    if (deleteLoading) return;
    setDeleteError('');
    setDeleteTarget(null);
  }, [deleteLoading]);

  const confirmDeleteClient = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteClient(deleteTarget.id, token);
      setClients((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error: any) {
      setDeleteError(error?.message || 'Clientul nu a putut fi sters. Incearca din nou.');
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, token]);

  const openClientWhatsApp = useCallback(async (client: Client) => {
    let phone = String(client.phone || '').replace(/\D/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2);
    if (phone.startsWith('0') && phone.length === 10) phone = `40${phone.slice(1)}`;
    if (!phone) {
      Alert.alert('WhatsApp', 'Clientul nu are un numar de telefon valid.');
      return;
    }
    const appUrl = `whatsapp://send?phone=${phone}`;
    const webUrl = `https://wa.me/${phone}`;
    try {
      await Linking.openURL((await Linking.canOpenURL(appUrl)) ? appUrl : webUrl);
    } catch {
      Alert.alert('WhatsApp', 'Conversatia nu a putut fi deschisa.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (!token || !canViewClientPanel) return undefined;
      const timer = setInterval(syncClientsSilently, 45000);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') syncClientsSilently();
      });
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, [canViewClientPanel, syncClientsSilently, token])
  );

  const renderClient = useCallback(
    ({ item }: { item: Client }) => (
      <ClientCard
        client={item}
        onPress={openClient}
        onDelete={requestDeleteClient}
        onWhatsApp={openClientWhatsApp}
        canDelete={canDeleteClient(item)}
      />
    ),
    [canDeleteClient, openClient, openClientWhatsApp, requestDeleteClient]
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Niciun client gasit</Text>
      <Text style={styles.emptySub}>Apasa + pentru a adauga un client nou</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header
        title=""
        right={<MobileChatHeaderButton />}
      />

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cauta client, telefon, cod..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={onSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => onSearch('')}>
              <X size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/client/new')}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Adauga client nou">
          <Plus size={21} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.refreshRow}>
        <TouchableOpacity
          style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
          onPress={onRefresh}
          disabled={refreshing}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Reincarca lista de clienti">
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.orange} />
          ) : (
            <RefreshCw size={17} color={Colors.orange} />
          )}
        </TouchableOpacity>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortList}>
          {clientLifecycleOptions.map((option) => {
            const active = lifecycleFilter === option.key;
            const Icon = option.Icon;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortChip, active && styles.lifecycleChipActive]}
                onPress={() => onSelectLifecycle(option.key)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={active ? `Sterge filtrul ${option.label}` : `Arata clientii ${option.label.toLowerCase()}`}>
                <Icon size={13} color={active ? '#60A5FA' : Colors.textMuted} />
                <Text style={[styles.sortChipText, active && styles.lifecycleChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
          {clientSortOptions.map((option) => {
            const active = sortMode === option.key;
            const Icon = option.Icon;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortChip, active && styles.sortChipActive]}
                onPress={() => onSelectSort(option.key)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={active ? `Sterge filtrul ${option.label}` : `Sorteaza dupa ${option.label}`}>
                <Icon size={13} color={active ? Colors.orange : Colors.textMuted} />
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {!isRestrictedUser && profiles.length > 0 && (
        <View style={styles.filterRow}>
          <Filter size={14} color={Colors.textMuted} style={{ marginLeft: 16 }} />
          <FlatList
            horizontal
            data={profiles}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterList}
            renderItem={({ item }) => {
              const active = selectedProfile === item.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    active && { backgroundColor: item.color, borderColor: item.color },
                  ]}
                  onPress={() => onSelectProfile(item.id)}>
                  <Text
                    style={[
                      styles.filterChipText,
                      active ? { color: Colors.white } : { color: item.color },
                    ]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={Colors.orange} size="large" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={sortedClients}
          keyExtractor={(item) => item.id}
          renderItem={renderClient}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.list}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.orange}
              colors={[Colors.orange]}
            />
          }
          onScroll={(event) => {
            const offset = event.nativeEvent.contentOffset.y;
            currentScrollOffsetRef.current = offset;
            savedClientsScrollOffset = offset;
          }}
          scrollEventThrottle={16}
        />
      )}

      <View style={styles.countBar}>
        <Text style={styles.countText}>{sortedClients.length} clienti</Text>
      </View>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={closeDeleteModal}>
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteModal}>
            <View style={styles.deleteIconWrap}>
              <AlertTriangle size={24} color={Colors.error} />
            </View>
            <Text style={styles.deleteTitle}>Stergi clientul?</Text>
            <Text style={styles.deleteText}>
              {deleteTarget
                ? `Clientul "${deleteTarget.name}" va fi sters definitiv. Confirma doar daca esti sigur.`
                : 'Confirma stergerea clientului.'}
            </Text>
            {deleteError ? <Text style={styles.deleteError}>{deleteError}</Text> : null}
            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={closeDeleteModal}
                disabled={deleteLoading}
                activeOpacity={0.8}>
                <Text style={styles.deleteCancelText}>Anuleaza</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, deleteLoading && styles.deleteConfirmBtnDisabled]}
                onPress={confirmDeleteClient}
                disabled={deleteLoading}
                activeOpacity={0.85}>
                {deleteLoading ? <ActivityIndicator size="small" color={Colors.white} /> : <Trash2 size={16} color={Colors.white} />}
                <Text style={styles.deleteConfirmText}>Sterge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(20,20,20,0.70)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(20,20,20,0.58)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sortList: {
    gap: 8,
    paddingRight: 16,
    alignItems: 'center',
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
  },
  sortChipActive: {
    backgroundColor: Colors.orangeDim,
    borderColor: Colors.orange,
  },
  lifecycleChipActive: {
    backgroundColor: 'rgba(96,165,250,0.14)',
    borderColor: '#60A5FA',
  },
  sortChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  sortChipTextActive: {
    color: Colors.orange,
  },
  lifecycleChipTextActive: {
    color: '#60A5FA',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(20,20,20,0.70)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  filterList: { paddingHorizontal: 8, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  filterChipText: { fontSize: 12, fontFamily: 'Inter-Medium' },
  list: { padding: 14, paddingBottom: 80 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 6,
  },
  emptySub: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter-Regular' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: {
    color: Colors.error,
    textAlign: 'center',
    padding: 16,
    fontFamily: 'Inter-Regular',
  },
  addBtn: {
    backgroundColor: Colors.orange,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.orange,
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  refreshBtn: {
    backgroundColor: Colors.card,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  refreshBtnDisabled: { opacity: 0.58 },
  countBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(20,20,20,0.84)',
    paddingVertical: 6,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  countText: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular' },
  deleteOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  deleteModal: {
    width: '100%',
    maxWidth: 360,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.38)',
    backgroundColor: Colors.card,
    shadowColor: Colors.error,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  deleteIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: Colors.errorDim,
  },
  deleteTitle: { color: Colors.textPrimary, fontSize: 20, fontFamily: 'Inter-Bold' },
  deleteText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 20, marginTop: 8 },
  deleteError: { color: Colors.error, fontSize: 12, fontFamily: 'Inter-SemiBold', marginTop: 12 },
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  deleteCancelBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  deleteCancelText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Bold' },
  deleteConfirmBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    backgroundColor: Colors.error,
  },
  deleteConfirmBtnDisabled: { opacity: 0.65 },
  deleteConfirmText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter-Bold' },
});
