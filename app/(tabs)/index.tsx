import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import * as SecureStore from 'expo-secure-store';
import { Colors } from '@/constants/colors';
import Header from '@/components/Header';
import ClientCard from '@/components/ClientCard';
import MobileChatHeaderButton from '@/components/MobileChatHeaderButton';
import TablePagination from '@/components/TablePagination';
import { deleteClient, getClientById, getClientsPage, getProfiles, type ClientsTableQuery } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import type { Client, Profile } from '@/types';
import { runWhenIdle } from '@/utils/runWhenIdle';
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

function readSavedClientsScrollOffset() {
  return savedClientsScrollOffset;
}

function rememberClientsScrollOffset(offset: number) {
  savedClientsScrollOffset = offset;
}

type ClientSortMode = '' | 'new' | 'old' | 'name_az' | 'name_za';
type ClientLifecycleFilter = '' | 'active' | 'finalized';
type SortIcon = typeof CalendarArrowDown;
const CLIENTS_PAGE_SIZE_KEY = 'gtrots.clientsPageSize.v1';
const DEFAULT_CLIENTS_PAGE_SIZE = 10;
const TABLE_PAGE_SIZES = new Set([10, 15, 25, 50, 100]);
const CLIENTS_PAGE_CACHE_LIMIT = 12;
type ClientsPageResult = Awaited<ReturnType<typeof getClientsPage>> & {
  prefetch_end_page?: number;
};
let savedClientsTotal = 0;
let savedClientsPage = 1;
let savedClientsHasMore = false;
let savedClientsPageSize = DEFAULT_CLIENTS_PAGE_SIZE;
let savedClientsSnapshotToken = '';
let savedClientsSearch = '';
let savedClientsProfile = '';
let savedClientsSort: ClientSortMode = '';
let savedClientsLifecycle: ClientLifecycleFilter = '';
const savedClientsPageCache = new Map<string, ClientsPageResult>();
const CLIENT_DETAIL_CACHE_LIMIT = 12;
const CLIENT_DETAIL_CACHE_TTL_MS = 60_000;
const savedClientDetailCache = new Map<string, { value: Client; cachedAt: number }>();
const savedClientDetailRequests = new Map<string, Promise<Client | null>>();

function clientsPageCacheKey(query: ClientsTableQuery, authToken = '') {
  return JSON.stringify([authToken, query.search || '', query.profileId || '', query.lifecycle || '', query.sortBy || '', query.sortDir || '', query.page || 1, query.pageSize || DEFAULT_CLIENTS_PAGE_SIZE]);
}

function clientsPageCacheLimit(pageSize: number) {
  return Math.max(5, Math.min(CLIENTS_PAGE_CACHE_LIMIT, Math.floor(500 / Math.max(pageSize, 10))));
}

// O pagina noua schimba datele, nu structura vizibila. Cheile stabile pe slot
// permit FlatList sa refoloseasca randurile native si instantele Swipeable in
// loc sa distruga si sa reconstruiasca toate cardurile la fiecare apasare.
function clientPageSlotKey(_item: Client, index: number) {
  return `client-page-slot-${index}`;
}

function clientDetailCacheKey(authToken: string, clientId: string) {
  return `${authToken.length}:${authToken}|${clientId}`;
}

function rememberClientDetail(key: string, value: Client) {
  if (savedClientDetailCache.has(key)) savedClientDetailCache.delete(key);
  while (savedClientDetailCache.size >= CLIENT_DETAIL_CACHE_LIMIT) {
    const oldest = savedClientDetailCache.keys().next().value;
    if (!oldest) break;
    savedClientDetailCache.delete(oldest);
  }
  savedClientDetailCache.set(key, { value, cachedAt: Date.now() });
}

function mergeCachedClientRelations(authToken: string, items: Client[]) {
  if (!authToken) return items;
  return items.map((item) => {
    const key = clientDetailCacheKey(authToken, item.id);
    const cached = savedClientDetailCache.get(key);
    if (!cached) return item;
    const summaryVersion = item.updated_at || item.created_at || '';
    const detailVersion = cached.value.updated_at || cached.value.created_at || '';
    if (summaryVersion !== detailVersion) {
      savedClientDetailCache.delete(key);
      return item;
    }
    return {
      ...item,
      collaborator_costs: cached.value.collaborator_costs,
      expense_costs: cached.value.expense_costs,
      participants: cached.value.participants,
      activity_logs: cached.value.activity_logs,
    };
  });
}

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
  return items.map((item) => [
    item.id,
    item.updated_at || item.created_at,
    item.name,
    item.phone,
    item.status,
    item.qr_code,
    item.qr_used ? 1 : 0,
    item.discount_percentage,
    item.price,
    item.predefined_price,
    item.advance_amount,
    item.currency_code,
    item.payment_status,
    item.amount_due,
    item.manopera_colaboratori,
    item.valoare_piese,
    item.alte_cheltuieli,
    item.is_finalized ? 1 : 0,
    item.profiles?.id || '',
    item.profiles?.name || '',
    item.profiles?.color || '',
    item.profiles?.percentage || 0,
    (item.collaborator_costs || []).map((cost) => `${cost.id}:${cost.cost}:${cost.payment_status}`).join(','),
  ].join(':')).join('|');
}

export default function ClientsScreen() {
  const router = useRouter();
  const { token, user, refreshUser } = useAuth();
  const canRestoreSnapshot = Boolean(token && savedClientsSnapshotToken === token);
  const [clients, setClients] = useState<Client[]>(canRestoreSnapshot ? savedClientsSnapshot : []);
  const [totalClients, setTotalClients] = useState(canRestoreSnapshot ? (savedClientsTotal || savedClientsSnapshot.length) : 0);
  const [loadedPage, setLoadedPage] = useState(canRestoreSnapshot ? savedClientsPage : 1);
  const [pageSize, setPageSize] = useState(savedClientsPageSize);
  const [pageSizeReady, setPageSizeReady] = useState(false);
  const [hasMore, setHasMore] = useState(canRestoreSnapshot ? savedClientsHasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(!canRestoreSnapshot || savedClientsSnapshot.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState(canRestoreSnapshot ? savedClientsSearch : '');
  const [selectedProfile, setSelectedProfile] = useState<string>(canRestoreSnapshot ? savedClientsProfile : '');
  const [sortMode, setSortMode] = useState<ClientSortMode>(canRestoreSnapshot ? savedClientsSort : '');
  const [lifecycleFilter, setLifecycleFilter] = useState<ClientLifecycleFilter>(canRestoreSnapshot ? savedClientsLifecycle : '');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const clientsSyncInFlight = useRef(false);
  const searchRef = useRef(canRestoreSnapshot ? savedClientsSearch : '');
  const selectedProfileRef = useRef(canRestoreSnapshot ? savedClientsProfile : '');
  const sortModeRef = useRef<ClientSortMode>(canRestoreSnapshot ? savedClientsSort : '');
  const lifecycleFilterRef = useRef<ClientLifecycleFilter>(canRestoreSnapshot ? savedClientsLifecycle : '');
  const listRef = useRef<FlatList<Client> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientsRef = useRef<Client[]>([]);
  const loadRequestIdRef = useRef(0);
  const listRequestInFlightRef = useRef(false);
  const currentPageRef = useRef(canRestoreSnapshot ? savedClientsPage : 1);
  const pageSizeRef = useRef(savedClientsPageSize);
  const pageCacheRef = useRef(savedClientsPageCache);
  const pageRequestsRef = useRef(new Map<string, Promise<ClientsPageResult>>());
  const pageCacheGenerationRef = useRef(0);
  const detailScopeRef = useRef(token || '');
  const hasLoadedRef = useRef(canRestoreSnapshot && savedClientsSnapshot.length > 0);
  const currentScrollOffsetRef = useRef(readSavedClientsScrollOffset());
  const isRestrictedUser = user?.role === 'user';
  const canViewClientPanel = user?.role !== 'user' || Boolean(user?.client_panel_access);
  const sortedClients = clients;

  useEffect(() => {
    clientsRef.current = clients;
    savedClientsSnapshot = clients;
    savedClientsTotal = totalClients;
    savedClientsPage = loadedPage;
    savedClientsHasMore = hasMore;
    savedClientsPageSize = pageSize;
    savedClientsSnapshotToken = token || '';
    savedClientsSearch = search;
    savedClientsProfile = selectedProfile;
    savedClientsSort = sortMode;
    savedClientsLifecycle = lifecycleFilter;
  }, [clients, hasMore, lifecycleFilter, loadedPage, pageSize, search, selectedProfile, sortMode, token, totalClients]);

  useEffect(() => {
    detailScopeRef.current = token || '';
  }, [token]);

  const fetchClientsPage = useCallback((request: ClientsTableQuery, preferCache = false) => {
    const key = clientsPageCacheKey(request, token || '');
    const cached = preferCache ? pageCacheRef.current.get(key) : undefined;
    if (cached) {
      pageCacheRef.current.delete(key);
      pageCacheRef.current.set(key, cached);
      return Promise.resolve(cached);
    }
    const pending = preferCache ? pageRequestsRef.current.get(key) : undefined;
    if (pending) return pending;
    const generation = pageCacheGenerationRef.current;
    const networkRequest = getClientsPage(token || '', request, preferCache);
    pageRequestsRef.current.set(key, networkRequest);
    void networkRequest.then((result) => {
      if (generation !== pageCacheGenerationRef.current) return;
      const cache = pageCacheRef.current;
      const remember = (cacheKey: string, value: ClientsPageResult) => {
        if (cache.has(cacheKey)) cache.delete(cacheKey);
        const limit = clientsPageCacheLimit(request.pageSize || DEFAULT_CLIENTS_PAGE_SIZE);
        while (cache.size >= limit) {
          const oldest = cache.keys().next().value;
          if (!oldest) break;
          cache.delete(oldest);
        }
        cache.set(cacheKey, value);
      };
      const prefetchEndPage = result.prefetch_pages?.reduce(
        (furthest, item) => Math.max(furthest, item.page),
        result.page
      ) ?? result.page;
      remember(key, {
        ...result,
        prefetch_pages: undefined,
        prefetch_end_page: prefetchEndPage,
      });
      result.prefetch_pages?.forEach((prefetched) => {
        const prefetchedRequest = { ...request, page: prefetched.page };
        remember(clientsPageCacheKey(prefetchedRequest, token || ''), {
          ...result,
          items: prefetched.items,
          page: prefetched.page,
          has_more: prefetched.has_more,
          prefetch_pages: undefined,
          prefetch_end_page: prefetchEndPage,
        });
      });
    }, () => {}).finally(() => {
      if (pageRequestsRef.current.get(key) === networkRequest) pageRequestsRef.current.delete(key);
    });
    return networkRequest;
  }, [token]);

  const load = useCallback(async (
    q?: string,
    profileId?: string,
    options: { restoreScroll?: boolean; silent?: boolean; page?: number; append?: boolean; preferCache?: boolean; scrollToTop?: boolean } = {}
  ) => {
    if (!canViewClientPanel) {
      setClients([]);
      setError('');
      return;
    }
    const requestId = ++loadRequestIdRef.current;
    listRequestInFlightRef.current = true;
    const page = Math.max(options.page || 1, 1);
    if (options.append) setLoadingMore(true);
    try {
      if (!options.silent) setError('');
      const activeSort = sortModeRef.current;
      const request: ClientsTableQuery = {
        search: q?.trim() || undefined,
        profileId: profileId || undefined,
        lifecycle: lifecycleFilterRef.current || undefined,
        sortBy: activeSort === 'name_az' || activeSort === 'name_za' ? 'name' : 'created_at',
        sortDir: activeSort === 'old' || activeSort === 'name_az' ? 'asc' : 'desc',
        page,
        pageSize: pageSizeRef.current,
      };
      if (options.preferCache && !pageCacheRef.current.has(clientsPageCacheKey(request, token || ''))) setLoadingMore(true);
      const data = await fetchClientsPage(request, options.preferCache);
      if (requestId !== loadRequestIdRef.current) return;
      const hydratedItems = mergeCachedClientRelations(token || '', data.items);
      setClients((current) => {
        const next = options.append
          ? [...current, ...hydratedItems.filter((item) => !current.some((currentItem) => currentItem.id === item.id))]
          : hydratedItems;
        return clientsVersion(current) === clientsVersion(next) ? current : next;
      });
      setTotalClients(data.total);
      setLoadedPage(data.page);
      currentPageRef.current = data.page;
      setHasMore(data.has_more);
      const furthestPrefetchedPage = data.prefetch_pages?.reduce((max, item) => Math.max(max, item.page), data.page) ?? data.page;
      if ((furthestPrefetchedPage * data.page_size) < data.total) {
        void fetchClientsPage({ ...request, page: furthestPrefetchedPage + 1 }, true).catch(() => {});
      }
      if (options.scrollToTop) requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
      if (!options.append && options.restoreScroll !== false) {
        requestAnimationFrame(() => {
          const savedOffset = readSavedClientsScrollOffset();
          if (savedOffset > 0) {
            listRef.current?.scrollToOffset({ offset: savedOffset, animated: false });
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
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoadingMore(false);
        listRequestInFlightRef.current = false;
      }
    }
  }, [canViewClientPanel, fetchClientsPage, token]);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(CLIENTS_PAGE_SIZE_KEY).then((saved) => {
      const nextSize = Number(saved || DEFAULT_CLIENTS_PAGE_SIZE);
      if (!active || !TABLE_PAGE_SIZES.has(nextSize) || nextSize === pageSizeRef.current) return;
      pageSizeRef.current = nextSize;
      setPageSize(nextSize);
      savedClientsPageSize = nextSize;
      pageCacheGenerationRef.current += 1;
      pageCacheRef.current.clear();
      pageRequestsRef.current.clear();
    }).catch(() => {}).finally(() => {
      if (active) setPageSizeReady(true);
    });
    return () => { active = false; };
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const data = await getProfiles();
      setProfiles(data);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!pageSizeReady) return undefined;
      let active = true;
      let frame: number | null = null;
      let interactionTask: ReturnType<typeof runWhenIdle> | null = null;
      const hasSnapshot = hasLoadedRef.current;

      if (!hasSnapshot && clientsRef.current.length === 0) {
        setLoading(true);
      }

      const revalidate = () => {
        if (!active) return;
        const listRequest = load(searchRef.current, selectedProfileRef.current, {
          page: currentPageRef.current,
          restoreScroll: false,
          silent: hasSnapshot,
          preferCache: !hasSnapshot,
        });
        void listRequest.finally(() => {
          if (active) {
            hasLoadedRef.current = true;
            setLoading(false);
          }
        });
        void loadProfiles();
        void refreshUser().then((freshUser) => {
          if (!active) return;
          const freshCanViewClientPanel = freshUser?.role !== 'user' || Boolean(freshUser?.client_panel_access);
          if (!freshCanViewClientPanel) {
            setClients([]);
            router.replace('/(tabs)/scanner');
          }
        });
      };

      if (hasSnapshot) {
        frame = requestAnimationFrame(() => {
          interactionTask = runWhenIdle(revalidate);
        });
      } else {
        revalidate();
      }

      return () => {
        active = false;
        if (frame !== null) cancelAnimationFrame(frame);
        interactionTask?.cancel();
      };
    }, [load, loadProfiles, pageSizeReady, refreshUser, router])
  );

  useEffect(() => {
    if (!canViewClientPanel) {
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
      await load(searchRef.current, selectedProfileRef.current, { page: currentPageRef.current, restoreScroll: false, silent: true, preferCache: false });
    } finally {
      clientsSyncInFlight.current = false;
    }
  }, [canViewClientPanel, load, token]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  const onSearch = useCallback((text: string) => {
    rememberClientsScrollOffset(0);
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
    rememberClientsScrollOffset(0);
    currentScrollOffsetRef.current = 0;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const next = selectedProfile === id ? '' : id;
    selectedProfileRef.current = next;
    setSelectedProfile(next);
    load(searchRef.current, next);
  };

  const onSelectSort = useCallback((mode: Exclude<ClientSortMode, ''>) => {
    rememberClientsScrollOffset(0);
    currentScrollOffsetRef.current = 0;
    const next = sortModeRef.current === mode ? '' : mode;
    sortModeRef.current = next;
    setSortMode(next);
    load(searchRef.current, selectedProfileRef.current, { restoreScroll: false });
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, [load]);

  const onSelectLifecycle = useCallback((mode: Exclude<ClientLifecycleFilter, ''>) => {
    rememberClientsScrollOffset(0);
    currentScrollOffsetRef.current = 0;
    const next = lifecycleFilterRef.current === mode ? '' : mode;
    lifecycleFilterRef.current = next;
    setLifecycleFilter(next);
    load(searchRef.current, selectedProfileRef.current, { restoreScroll: false });
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, [load]);

  const openClient = useCallback((clientId: string) => {
    rememberClientsScrollOffset(currentScrollOffsetRef.current);
    router.push(`/client/${clientId}`);
  }, [router]);

  const hydrateClientDetails = useCallback((client: Client) => {
    if (!token) return;
    const requestScope = token;
    const key = clientDetailCacheKey(requestScope, client.id);
    const cached = savedClientDetailCache.get(key);
    const commit = (detail: Client) => {
      if (detailScopeRef.current !== requestScope) return;
      setClients((current) => current.map((item) => item.id === detail.id ? { ...item, ...detail } : item));
    };
    if (cached) {
      savedClientDetailCache.delete(key);
      savedClientDetailCache.set(key, cached);
      commit(cached.value);
      const sameVersion = !client.updated_at
        || !cached.value.updated_at
        || client.updated_at === cached.value.updated_at;
      if (sameVersion && Date.now() - cached.cachedAt < CLIENT_DETAIL_CACHE_TTL_MS) return;
    }
    let pending = savedClientDetailRequests.get(key);
    if (!pending) {
      pending = getClientById(client.id, token);
      savedClientDetailRequests.set(key, pending);
      void pending.finally(() => {
        if (savedClientDetailRequests.get(key) === pending) savedClientDetailRequests.delete(key);
      }).catch(() => {});
    }
    void pending.then((detail) => {
      if (!detail || detailScopeRef.current !== requestScope) return;
      rememberClientDetail(key, detail);
      commit(detail);
    }).catch(() => {});
  }, [token]);

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
      pageCacheGenerationRef.current += 1;
      pageCacheRef.current.clear();
      pageRequestsRef.current.clear();
      const detailKey = token ? clientDetailCacheKey(token, deleteTarget.id) : '';
      if (detailKey) {
        savedClientDetailCache.delete(detailKey);
        savedClientDetailRequests.delete(detailKey);
      }
      const nextTotal = Math.max(0, totalClients - 1);
      const targetPage = Math.min(
        currentPageRef.current,
        Math.max(1, Math.ceil(nextTotal / pageSizeRef.current))
      );
      const nextClients = targetPage === currentPageRef.current
        ? clientsRef.current.filter((item) => item.id !== deleteTarget.id)
        : [];
      const nextHasMore = targetPage * pageSizeRef.current < nextTotal;
      clientsRef.current = nextClients;
      currentPageRef.current = targetPage;
      setClients(nextClients);
      setTotalClients(nextTotal);
      setLoadedPage(targetPage);
      setHasMore(nextHasMore);
      setDeleteTarget(null);
      void load(searchRef.current, selectedProfileRef.current, {
        page: targetPage,
        restoreScroll: false,
        silent: true,
        preferCache: true,
        scrollToTop: true,
      });
    } catch (error: any) {
      setDeleteError(error?.message || 'Clientul nu a putut fi sters. Incearca din nou.');
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, load, token, totalClients]);

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
        onExpand={hydrateClientDetails}
        canDelete={canDeleteClient(item)}
      />
    ),
    [canDeleteClient, hydrateClientDetails, openClient, openClientWhatsApp, requestDeleteClient]
  );

  const changePage = useCallback((page: number) => {
    if (page < 1 || (page > loadedPage && !hasMore)) return;
    rememberClientsScrollOffset(0);
    currentScrollOffsetRef.current = 0;
    const activeSort = sortModeRef.current;
    const request: ClientsTableQuery = {
      search: searchRef.current.trim() || undefined,
      profileId: selectedProfileRef.current || undefined,
      lifecycle: lifecycleFilterRef.current || undefined,
      sortBy: activeSort === 'name_az' || activeSort === 'name_za' ? 'name' : 'created_at',
      sortDir: activeSort === 'old' || activeSort === 'name_az' ? 'asc' : 'desc',
      page,
      pageSize: pageSizeRef.current,
    };
    const cacheKey = clientsPageCacheKey(request, token || '');
    const cached = pageCacheRef.current.get(cacheKey);
    if (cached) {
      loadRequestIdRef.current += 1;
      listRequestInFlightRef.current = false;
      setLoadingMore(false);
      pageCacheRef.current.delete(cacheKey);
      pageCacheRef.current.set(cacheKey, cached);
      setClients(mergeCachedClientRelations(token || '', cached.items));
      setTotalClients(cached.total);
      setLoadedPage(cached.page);
      currentPageRef.current = cached.page;
      setHasMore(cached.has_more);
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
      const furthest = cached.prefetch_end_page
        ?? cached.prefetch_pages?.reduce((max, item) => Math.max(max, item.page), cached.page)
        ?? cached.page;
      if ((furthest * cached.page_size) < cached.total) void fetchClientsPage({ ...request, page: furthest + 1 }, true).catch(() => {});
      return;
    }
    void load(searchRef.current, selectedProfileRef.current, {
      restoreScroll: false,
      silent: true,
      page,
      preferCache: true,
      scrollToTop: true,
    });
  }, [fetchClientsPage, hasMore, load, loadedPage, token]);

  const changePageSize = useCallback((nextSize: number) => {
    if (!TABLE_PAGE_SIZES.has(nextSize) || nextSize === pageSizeRef.current) return;
    loadRequestIdRef.current += 1;
    listRequestInFlightRef.current = false;
    setLoadingMore(false);
    pageSizeRef.current = nextSize;
    setPageSize(nextSize);
    setLoadedPage(1);
    currentPageRef.current = 1;
    savedClientsPageSize = nextSize;
    pageCacheGenerationRef.current += 1;
    pageCacheRef.current.clear();
    pageRequestsRef.current.clear();
    void SecureStore.setItemAsync(CLIENTS_PAGE_SIZE_KEY, String(nextSize)).catch(() => {});
    void load(searchRef.current, selectedProfileRef.current, { page: 1, restoreScroll: false, silent: true, scrollToTop: true });
  }, [load]);

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
          keyExtractor={clientPageSlotKey}
          renderItem={renderClient}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={sortedClients.length ? <TablePagination page={loadedPage} pageSize={pageSize} total={totalClients} loading={loadingMore} onPageChange={changePage} onPageSizeChange={changePageSize} /> : null}
          contentContainerStyle={styles.list}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={16}
          windowSize={5}
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
            rememberClientsScrollOffset(offset);
          }}
          scrollEventThrottle={16}
        />
      )}

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
    minHeight: 58,
    paddingVertical: 6,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  countText: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular' },
  pageRange: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Regular', marginTop: 2 },
  pageLabel: { minWidth: 120, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  pageButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  pageButtonDisabled: { opacity: 0.38 },
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
