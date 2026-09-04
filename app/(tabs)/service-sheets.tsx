import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { CalendarArrowDown, CalendarClock, CheckCircle2, CircleDollarSign, Clock, Edit3, FileText, Plus, RefreshCw, Search, Trash2, UserRound, X } from 'lucide-react-native';
import Header from '@/components/Header';
import MobileChatHeaderButton from '@/components/MobileChatHeaderButton';
import TablePagination from '@/components/TablePagination';
import { Colors, fmt } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { deleteServiceSheet, getServiceSheetsPage, type ServiceSheetsQuery } from '@/services/api';
import type { ServiceSheet } from '@/types';
import { runWhenIdle } from '@/utils/runWhenIdle';

type SheetPaymentFilter = '' | 'incasati' | 'de_incasat';
type SheetFilterIcon = typeof CalendarClock;

const SORTS: { label: string; sortBy: ServiceSheetsQuery['sortBy']; sortDir: ServiceSheetsQuery['sortDir']; Icon: SheetFilterIcon }[] = [
  { label: 'Noi', sortBy: 'created_at', sortDir: 'desc', Icon: CalendarArrowDown },
  { label: 'Modificate', sortBy: 'updated_at', sortDir: 'desc', Icon: CalendarClock },
  { label: 'Nr fisa', sortBy: 'sheet_number', sortDir: 'asc', Icon: FileText },
  { label: 'Client', sortBy: 'client', sortDir: 'asc', Icon: UserRound },
  { label: 'Pret', sortBy: 'total_price', sortDir: 'desc', Icon: CircleDollarSign },
];

const PAYMENT_FILTERS: { label: string; value: Exclude<SheetPaymentFilter, ''>; Icon: SheetFilterIcon }[] = [
  { label: 'Achitate', value: 'incasati', Icon: CheckCircle2 },
  { label: 'Neachitate', value: 'de_incasat', Icon: Clock },
];
const SERVICE_PAGE_SIZE_KEY = 'gtrots.serviceSheetsPageSize.v1';
const DEFAULT_SERVICE_PAGE_SIZE = 10;
const TABLE_PAGE_SIZES = new Set([10, 15, 25, 50, 100]);
const SERVICE_PAGE_CACHE_LIMIT = 12;
const SERVICE_SNAPSHOT_LIMIT = 2;
type ServicePageResult = Awaited<ReturnType<typeof getServiceSheetsPage>> & {
  prefetch_end_page?: number;
};

type ServiceSnapshot = {
  rows: ServiceSheet[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  query: ServiceSheetsQuery;
};

type ServicePageRequest = {
  generation: number;
  promise: Promise<ServicePageResult>;
};

const servicePageCache = new Map<string, ServicePageResult>();
const servicePageRequests = new Map<string, ServicePageRequest>();
const serviceCacheGenerations = new Map<string, number>();
const serviceSnapshots = new Map<string, ServiceSnapshot>();

function serviceTokenPrefix(authToken: string) {
  return `${authToken.length}:${authToken}|`;
}

function serviceQueryKey(query: ServiceSheetsQuery) {
  return JSON.stringify([
    query.search || '',
    query.clientId || '',
    query.paymentStatus || '',
    query.sortBy || '',
    query.sortDir || '',
  ]);
}

function servicePageCacheKey(authToken: string, query: ServiceSheetsQuery) {
  return `${serviceTokenPrefix(authToken)}${JSON.stringify([
    serviceQueryKey(query),
    query.page || 1,
    query.pageSize || DEFAULT_SERVICE_PAGE_SIZE,
  ])}`;
}

function serviceCacheGeneration(authToken: string) {
  return serviceCacheGenerations.get(authToken) || 0;
}

function readServicePage(authToken: string, query: ServiceSheetsQuery) {
  const key = servicePageCacheKey(authToken, query);
  const cached = servicePageCache.get(key);
  if (!cached) return undefined;
  servicePageCache.delete(key);
  servicePageCache.set(key, cached);
  return cached;
}

function rememberServicePage(authToken: string, query: ServiceSheetsQuery, result: ServicePageResult) {
  const key = servicePageCacheKey(authToken, query);
  if (servicePageCache.has(key)) servicePageCache.delete(key);
  const limit = Math.max(5, Math.min(
    SERVICE_PAGE_CACHE_LIMIT,
    Math.floor(500 / Math.max(query.pageSize || DEFAULT_SERVICE_PAGE_SIZE, 10))
  ));
  while (servicePageCache.size >= limit) {
    const oldest = servicePageCache.keys().next().value;
    if (!oldest) break;
    servicePageCache.delete(oldest);
  }
  servicePageCache.set(key, result);
}

function rememberServicePageBlock(authToken: string, request: ServiceSheetsQuery, result: ServicePageResult, generation: number) {
  if (generation !== serviceCacheGeneration(authToken)) return;
  const prefetchEndPage = result.prefetch_pages?.reduce(
    (furthest, item) => Math.max(furthest, item.page),
    result.page
  ) ?? result.page;
  rememberServicePage(authToken, request, {
    ...result,
    prefetch_pages: undefined,
    prefetch_end_page: prefetchEndPage,
  });
  result.prefetch_pages?.forEach((prefetched) => {
    rememberServicePage(authToken, { ...request, page: prefetched.page }, {
      ...result,
      items: prefetched.items,
      page: prefetched.page,
      has_more: prefetched.has_more,
      prefetch_pages: undefined,
      prefetch_end_page: prefetchEndPage,
    });
  });
}

function readServiceSnapshot(authToken: string) {
  if (!authToken) return undefined;
  const snapshot = serviceSnapshots.get(authToken);
  if (!snapshot) return undefined;
  serviceSnapshots.delete(authToken);
  serviceSnapshots.set(authToken, snapshot);
  return snapshot;
}

function rememberServiceSnapshot(authToken: string, snapshot: ServiceSnapshot) {
  if (!authToken) return;
  if (serviceSnapshots.has(authToken)) serviceSnapshots.delete(authToken);
  while (serviceSnapshots.size >= SERVICE_SNAPSHOT_LIMIT) {
    const oldest = serviceSnapshots.keys().next().value;
    if (!oldest) break;
    serviceSnapshots.delete(oldest);
  }
  serviceSnapshots.set(authToken, snapshot);
}

function invalidateServiceCache(authToken: string) {
  serviceCacheGenerations.set(authToken, serviceCacheGeneration(authToken) + 1);
  const prefix = serviceTokenPrefix(authToken);
  for (const key of servicePageCache.keys()) {
    if (key.startsWith(prefix)) servicePageCache.delete(key);
  }
  for (const key of servicePageRequests.keys()) {
    if (key.startsWith(prefix)) servicePageRequests.delete(key);
  }
  serviceSnapshots.delete(authToken);
}

function serviceBaseQuery(query: ServiceSheetsQuery): ServiceSheetsQuery {
  return {
    search: query.search || undefined,
    clientId: query.clientId || undefined,
    paymentStatus: query.paymentStatus || undefined,
    sortBy: query.sortBy || undefined,
    sortDir: query.sortDir || undefined,
  };
}

function serviceSortIndex(query?: ServiceSheetsQuery) {
  if (!query?.sortBy || !query.sortDir) return null;
  const index = SORTS.findIndex((item) => item.sortBy === query.sortBy && item.sortDir === query.sortDir);
  return index >= 0 ? index : null;
}

function fmtDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function serviceSheetsVersion(items: ServiceSheet[]) {
  return items
    .map((item) => `${item.id}:${item.updated_at || item.created_at || ''}:${item.is_finalized ? 1 : 0}`)
    .join('|');
}

export default function ServiceSheetsScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const sheetDismissY = Math.max(windowHeight, 700);
  const { token, user } = useAuth();
  const initialSnapshot = useMemo(() => readServiceSnapshot(token || ''), [token]);
  const initialQuery = initialSnapshot?.query || {
    sortBy: SORTS[0].sortBy,
    sortDir: SORTS[0].sortDir,
  };
  const [rows, setRows] = useState<ServiceSheet[]>(() => initialSnapshot?.rows || []);
  const [totalRows, setTotalRows] = useState(() => initialSnapshot?.total || 0);
  const [loadedPage, setLoadedPage] = useState(() => initialSnapshot?.page || 1);
  const [pageSize, setPageSize] = useState(() => initialSnapshot?.pageSize || DEFAULT_SERVICE_PAGE_SIZE);
  const [pageSizeReady, setPageSizeReady] = useState(false);
  const [hasMore, setHasMore] = useState(() => initialSnapshot?.hasMore || false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState(() => initialQuery.search || '');
  const [sortIndex, setSortIndex] = useState<number | null>(() => initialSnapshot ? serviceSortIndex(initialQuery) : 0);
  const [paymentFilter, setPaymentFilter] = useState<SheetPaymentFilter>(() => initialQuery.paymentStatus || '');
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [error, setError] = useState('');
  const [selectedSheet, setSelectedSheet] = useState<ServiceSheet | null>(null);
  const [deletingId, setDeletingId] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef<ServiceSheetsQuery>(serviceBaseQuery(initialQuery));
  const committedQueryRef = useRef<ServiceSheetsQuery>(serviceBaseQuery(initialQuery));
  const activeQueryKeyRef = useRef(serviceQueryKey(initialQuery));
  const hasLoadedRef = useRef(Boolean(initialSnapshot));
  const requestIdRef = useRef(0);
  const listRef = useRef<FlatList<ServiceSheet> | null>(null);
  const rowsRef = useRef<ServiceSheet[]>(initialSnapshot?.rows || []);
  const totalRowsRef = useRef(initialSnapshot?.total || 0);
  const currentPageRef = useRef(initialSnapshot?.page || 1);
  const hasMoreRef = useRef(initialSnapshot?.hasMore || false);
  const pageSizeRef = useRef(initialSnapshot?.pageSize || DEFAULT_SERVICE_PAGE_SIZE);
  const actionSheetY = useSharedValue(sheetDismissY);
  const actionSheetStartY = useSharedValue(0);
  const canDeleteSheet = user?.role === 'admin' || user?.role === 'manager';

  const query = useMemo<ServiceSheetsQuery>(() => ({
    search: search.trim(),
    paymentStatus: paymentFilter || undefined,
    sortBy: sortIndex === null ? undefined : SORTS[sortIndex].sortBy,
    sortDir: sortIndex === null ? undefined : SORTS[sortIndex].sortDir,
  }), [paymentFilter, search, sortIndex]);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const fetchServicePage = useCallback((request: ServiceSheetsQuery, preferCache = false) => {
    const authToken = token || '';
    const key = servicePageCacheKey(authToken, request);
    const cached = preferCache ? readServicePage(authToken, request) : undefined;
    if (cached) return Promise.resolve(cached);
    const generation = serviceCacheGeneration(authToken);
    const pending = servicePageRequests.get(key);
    if (pending?.generation === generation) return pending.promise;
    const networkRequest = getServiceSheetsPage(authToken, request, preferCache);
    servicePageRequests.set(key, { generation, promise: networkRequest });
    void networkRequest.then((result) => {
      rememberServicePageBlock(authToken, request, result, generation);
    }, () => {}).finally(() => {
      if (servicePageRequests.get(key)?.promise === networkRequest) servicePageRequests.delete(key);
    });
    return networkRequest;
  }, [token]);

  const commitServicePage = useCallback((result: ServicePageResult, request: ServiceSheetsQuery, append = false, scrollToTop = false) => {
    if (scrollToTop) listRef.current?.scrollToOffset({ offset: 0, animated: false });
    const currentRows = rowsRef.current;
    const nextRows = append
      ? [...currentRows, ...result.items.filter((item) => !currentRows.some((currentItem) => currentItem.id === item.id))]
      : result.items;
    const nextPageSize = result.page_size || pageSizeRef.current;
    const committedQuery = serviceBaseQuery(request);

    rowsRef.current = nextRows;
    totalRowsRef.current = result.total;
    currentPageRef.current = result.page;
    hasMoreRef.current = result.has_more;
    pageSizeRef.current = nextPageSize;
    committedQueryRef.current = committedQuery;

    setRows((current) => serviceSheetsVersion(current) === serviceSheetsVersion(nextRows) ? current : nextRows);
    setTotalRows(result.total);
    setLoadedPage(result.page);
    setHasMore(result.has_more);
    setPageSize((current) => current === nextPageSize ? current : nextPageSize);
    rememberServiceSnapshot(token || '', {
      rows: nextRows,
      total: result.total,
      page: result.page,
      pageSize: nextPageSize,
      hasMore: result.has_more,
      query: committedQuery,
    });
  }, [token]);

  const prefetchNextBlock = useCallback((request: ServiceSheetsQuery, result: ServicePageResult) => {
    const furthestPrefetchedPage = result.prefetch_end_page ?? result.prefetch_pages?.reduce(
      (furthest, item) => Math.max(furthest, item.page),
      result.page
    ) ?? result.page;
    if ((furthestPrefetchedPage * result.page_size) < result.total) {
      void fetchServicePage({ ...request, page: furthestPrefetchedPage + 1 }, true).catch(() => {});
    }
  }, [fetchServicePage]);

  const invalidateServiceData = useCallback(() => {
    requestIdRef.current += 1;
    invalidateServiceCache(token || '');
    setLoadingMore(false);
  }, [token]);

  const load = useCallback(async (nextQuery: ServiceSheetsQuery, options: { showLoading?: boolean; append?: boolean; preferCache?: boolean; scrollToTop?: boolean; silent?: boolean } = {}) => {
    if (!token) return;
    const showLoading = options.showLoading ?? true;
    const append = options.append ?? false;
    const requestId = ++requestIdRef.current;
    if (showLoading) setLoading(true);
    if (append) setLoadingMore(true);
    if (!options.silent) setError('');
    try {
      const request: ServiceSheetsQuery = {
        ...nextQuery,
        page: Math.max(nextQuery.page || 1, 1),
        pageSize: pageSizeRef.current,
      };
      if (options.preferCache && !servicePageCache.has(servicePageCacheKey(token, request))) setLoadingMore(true);
      const result = await fetchServicePage(request, options.preferCache);
      if (requestId !== requestIdRef.current) return;
      commitServicePage(result, request, append, Boolean(options.scrollToTop));
      prefetchNextBlock(request, result);
    } catch (e: any) {
      if (requestId !== requestIdRef.current) return;
      if (!options.silent || rowsRef.current.length === 0) {
        setError(e.message || 'Fisele nu au putut fi incarcate.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        hasLoadedRef.current = true;
        if (showLoading) setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [commitServicePage, fetchServicePage, prefetchNextBlock, token]);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(SERVICE_PAGE_SIZE_KEY).then((saved) => {
      const nextSize = Number(saved || DEFAULT_SERVICE_PAGE_SIZE);
      if (!active || !TABLE_PAGE_SIZES.has(nextSize) || nextSize === pageSizeRef.current) return;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      invalidateServiceData();
      pageSizeRef.current = nextSize;
      setPageSize(nextSize);
    }).catch(() => {}).finally(() => {
      if (active) setPageSizeReady(true);
    });
    return () => { active = false; };
  }, [invalidateServiceData]);

  useFocusEffect(
    useCallback(() => {
      if (!pageSizeReady) return undefined;
      let active = true;
      let frame: number | null = null;
      let interactionTask: ReturnType<typeof runWhenIdle> | null = null;
      const hasSnapshot = hasLoadedRef.current;

      const revalidate = () => {
        if (!active) return;
        void load(
          { ...queryRef.current, page: currentPageRef.current },
          {
            showLoading: !hasSnapshot,
            preferCache: !hasSnapshot,
            silent: hasSnapshot,
          }
        );
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
    }, [load, pageSizeReady])
  );

  useEffect(() => {
    if (!token) return;
    const nextQueryKey = serviceQueryKey(query);
    if (nextQueryKey === activeQueryKeyRef.current) return;
    activeQueryKeyRef.current = nextQueryKey;
    invalidateServiceData();
    currentPageRef.current = 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => load(query, { showLoading: true, scrollToTop: true }), 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [invalidateServiceData, load, query, token]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!selectedSheet) return;
    actionSheetY.value = sheetDismissY;
    actionSheetY.value = withSpring(0, {
      damping: 22,
      stiffness: 230,
      mass: 0.85,
    });
  }, [actionSheetY, selectedSheet, sheetDismissY]);

  const openSheet = useCallback((item: ServiceSheet) => {
    router.push({ pathname: '/service-sheet/[id]', params: { id: item.id } });
  }, [router]);

  const dismissActions = useCallback((afterClose?: () => void) => {
    if (!selectedSheet || deletingId) return;
    actionSheetY.value = withTiming(sheetDismissY, { duration: 220 }, (finished) => {
      if (finished) {
        runOnJS(setSelectedSheet)(null);
        if (afterClose) runOnJS(afterClose)();
      }
    });
  }, [actionSheetY, deletingId, selectedSheet, sheetDismissY]);

  const actionSheetPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => !deletingId,
      onMoveShouldSetPanResponder: (_event, gestureState) =>
        !deletingId
        && Math.abs(gestureState.dy) > 3
        && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderGrant: () => {
        actionSheetStartY.value = actionSheetY.value;
      },
      onPanResponderMove: (_event, gestureState) => {
        actionSheetY.value = Math.max(0, actionSheetStartY.value + gestureState.dy);
      },
      onPanResponderRelease: (_event, gestureState) => {
        const currentY = Math.max(0, actionSheetStartY.value + gestureState.dy);
        if (gestureState.vy > 0.65 || currentY > 70) {
          actionSheetY.value = withTiming(sheetDismissY, { duration: 210 }, (finished) => {
            if (finished) runOnJS(setSelectedSheet)(null);
          });
          return;
        }
        actionSheetY.value = withSpring(0, {
          damping: 22,
          stiffness: 230,
          mass: 0.85,
        });
      },
      onPanResponderTerminate: () => {
        actionSheetY.value = withSpring(0, {
          damping: 22,
          stiffness: 230,
          mass: 0.85,
        });
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
    [actionSheetStartY, actionSheetY, deletingId, sheetDismissY]
  );

  const actionSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: actionSheetY.value }],
  }));
  const actionBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(actionSheetY.value, [0, sheetDismissY], [1, 0]),
  }));

  const closeActions = useCallback(() => {
    dismissActions();
  }, [dismissActions]);

  const editSelectedSheet = useCallback(() => {
    if (!selectedSheet) return;
    const sheet = selectedSheet;
    dismissActions(() => openSheet(sheet));
  }, [dismissActions, openSheet, selectedSheet]);

  const confirmDeleteSelectedSheet = useCallback(() => {
    if (!selectedSheet || !token) return;
    if (!canDeleteSheet) {
      Alert.alert('Fisa protejata', 'Doar adminul sau managerul poate sterge fise de service.');
      return;
    }

    const sheet = selectedSheet;
    Alert.alert(
      'Sterge fisa?',
      `Sigur vrei sa stergi ${sheet.sheet_number || 'aceasta fisa'}?`,
      [
        { text: 'Renunta', style: 'cancel' },
        {
          text: 'Sterge',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(sheet.id);
            try {
              await deleteServiceSheet(token, sheet.id);
              invalidateServiceData();
              const nextTotal = Math.max(0, totalRowsRef.current - 1);
              const targetPage = Math.min(
                currentPageRef.current,
                Math.max(1, Math.ceil(nextTotal / pageSizeRef.current))
              );
              const nextRows = targetPage === currentPageRef.current
                ? rowsRef.current.filter((row) => row.id !== sheet.id)
                : [];
              const nextHasMore = targetPage * pageSizeRef.current < nextTotal;
              if (targetPage !== currentPageRef.current) {
                listRef.current?.scrollToOffset({ offset: 0, animated: false });
              }
              rowsRef.current = nextRows;
              totalRowsRef.current = nextTotal;
              currentPageRef.current = targetPage;
              hasMoreRef.current = nextHasMore;
              setRows(nextRows);
              setTotalRows(nextTotal);
              setLoadedPage(targetPage);
              setHasMore(nextHasMore);
              rememberServiceSnapshot(token, {
                rows: nextRows,
                total: nextTotal,
                page: targetPage,
                pageSize: pageSizeRef.current,
                hasMore: nextHasMore,
                query: committedQueryRef.current,
              });
              dismissActions();
              void load(
                { ...committedQueryRef.current, page: targetPage },
                { showLoading: false, silent: true, scrollToTop: targetPage !== loadedPage }
              );
            } catch (e: any) {
              Alert.alert('Eroare', e.message || 'Fisa nu a putut fi stearsa.');
            } finally {
              setDeletingId('');
            }
          },
        },
      ]
    );
  }, [canDeleteSheet, dismissActions, invalidateServiceData, load, loadedPage, selectedSheet, token]);

  const renderItem = useCallback(({ item }: { item: ServiceSheet }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.86}
      delayLongPress={320}
      onLongPress={() => setSelectedSheet(item)}
      onPress={() => openSheet(item)}>
      <View style={styles.cardTop}>
        <View style={styles.iconBox}>
          <FileText size={18} color={Colors.orange} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetNo}>{item.sheet_number}</Text>
          {item.is_finalized ? (
            <View style={styles.finalizedPill}>
              <CheckCircle2 size={12} color={Colors.success} />
              <Text style={styles.finalizedText}>Finalizata</Text>
            </View>
          ) : null}
          <Text style={styles.clientName} numberOfLines={1}>{item.client_name || 'Client fara nume'}</Text>
        </View>
        <Text style={styles.price}>{item.financials_hidden ? 'Ascuns' : [fmt(item.final_price || item.total_price || 0), item.currency_code || 'RON'].join(' ')}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Adaugata {fmtDate(item.created_at)}</Text>
        <Text style={styles.metaText}>Modif. {fmtDate(item.updated_at)}</Text>
      </View>
      {!!item.vehicle_brand_model && <Text style={styles.vehicle}>{item.vehicle_brand_model}</Text>}
    </TouchableOpacity>
  ), [openSheet]);

  const changePage = useCallback((page: number) => {
    if (page < 1 || (page > loadedPage && !hasMore)) return;
    const request: ServiceSheetsQuery = {
      ...queryRef.current,
      page,
      pageSize: pageSizeRef.current,
    };
    const cached = readServicePage(token || '', request);
    if (cached) {
      requestIdRef.current += 1;
      setLoading(false);
      setLoadingMore(false);
      commitServicePage(cached, request, false, true);
      prefetchNextBlock(request, cached);
      return;
    }
    void load(request, { showLoading: false, preferCache: true, scrollToTop: true, silent: true });
  }, [commitServicePage, hasMore, load, loadedPage, prefetchNextBlock, token]);

  const changePageSize = useCallback((nextSize: number) => {
    if (!TABLE_PAGE_SIZES.has(nextSize) || nextSize === pageSizeRef.current) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    invalidateServiceData();
    pageSizeRef.current = nextSize;
    currentPageRef.current = 1;
    setPageSize(nextSize);
    setLoadedPage(1);
    void SecureStore.setItemAsync(SERVICE_PAGE_SIZE_KEY, String(nextSize)).catch(() => {});
    void load({ ...queryRef.current, page: 1 }, { showLoading: false, scrollToTop: true });
  }, [invalidateServiceData, load]);

  return (
    <View style={styles.container}>
      <Header
        title=""
        right={
          <View style={styles.headerActions}>
            <MobileChatHeaderButton />
            {user?.role !== 'user' || Boolean(user?.client_panel_access) ? (
              <TouchableOpacity
                style={styles.addClientBtn}
                onPress={() => router.push('/client/new')}
                activeOpacity={0.86}
                accessibilityRole="button"
                accessibilityLabel="Adauga client">
                <Plus size={20} color={Colors.white} />
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />

      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Search size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Cauta nr fisa, client, telefon..."
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => load({ ...query, page: currentPageRef.current }, { showLoading: true })}
          disabled={loading}>
          {loading ? <ActivityIndicator size="small" color={Colors.orange} /> : <RefreshCw size={17} color={Colors.orange} />}
        </TouchableOpacity>
      </View>

      <View style={styles.sortRow}>
        {PAYMENT_FILTERS.map((filter) => {
          const active = paymentFilter === filter.value;
          const Icon = filter.Icon;
          return (
            <TouchableOpacity
              key={filter.value}
              style={[styles.sortChip, active && styles.paymentChipActive]}
              onPress={() => setPaymentFilter((current) => current === filter.value ? '' : filter.value)}
              activeOpacity={0.82}>
              <Icon size={13} color={active ? '#60A5FA' : Colors.textMuted} />
              <Text style={[styles.sortText, active && styles.paymentTextActive]}>{filter.label}</Text>
            </TouchableOpacity>
          );
        })}
        {SORTS.map((sort, index) => {
          const active = sortIndex === index;
          const Icon = sort.Icon;
          return (
            <TouchableOpacity
              key={sort.label}
              style={[styles.sortChip, active && styles.sortChipActive]}
              onPress={() => setSortIndex((current) => current === index ? null : index)}
              activeOpacity={0.82}>
              <Icon size={13} color={active ? Colors.orange : Colors.textMuted} />
              <Text style={[styles.sortText, active && styles.sortTextActive]}>{sort.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={() => load({ ...query, page: currentPageRef.current }, { showLoading: true })}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={rows.length ? <TablePagination page={loadedPage} pageSize={pageSize} total={totalRows} loading={loadingMore} onPageChange={changePage} onPageSizeChange={changePageSize} /> : null}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <FileText size={42} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nicio fisa gasita</Text>
            <Text style={styles.emptySub}>Scaneaza un client sau creeaza fisa din detaliul clientului.</Text>
          </View>
        ) : null}
      />

      <Modal
        visible={Boolean(selectedSheet)}
        transparent
        animationType="none"
        onRequestClose={closeActions}>
        <Animated.View style={[styles.modalBackdrop, actionBackdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeActions} />
          <Animated.View style={[styles.actionSheet, actionSheetStyle]}>
              <View style={styles.sheetHandleHitArea} {...actionSheetPanResponder.panHandlers}>
                <View style={styles.sheetHandle} />
              </View>
              <View style={styles.actionHeader}>
                <View style={styles.actionIcon}>
                  <FileText size={22} color={Colors.orange} />
                </View>
                <View style={styles.actionTitleWrap}>
                  <Text style={styles.actionKicker}>Fisa de service</Text>
                  <Text style={styles.actionTitle} numberOfLines={1}>
                    {selectedSheet?.sheet_number || 'Fisa fara numar'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.closeActionBtn} onPress={closeActions} activeOpacity={0.82}>
                  <X size={18} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={styles.actionMetaGrid}>
                <View style={styles.actionMeta}>
                  <UserRound size={15} color={Colors.textMuted} />
                  <Text style={styles.actionMetaText} numberOfLines={1}>
                    {selectedSheet?.client_name || 'Client fara nume'}
                  </Text>
                </View>
                <View style={styles.actionMeta}>
                  <CalendarClock size={15} color={Colors.textMuted} />
                  <Text style={styles.actionMetaText}>{fmtDate(selectedSheet?.updated_at)}</Text>
                </View>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.primaryAction} activeOpacity={0.88} onPress={editSelectedSheet}>
                  <Edit3 size={19} color={Colors.white} />
                  <Text style={styles.primaryActionText}>Editeaza fisa</Text>
                </TouchableOpacity>

                {canDeleteSheet ? (
                  <TouchableOpacity
                    style={[styles.deleteAction, deletingId === selectedSheet?.id && styles.actionDisabled]}
                    activeOpacity={0.88}
                    onPress={confirmDeleteSelectedSheet}
                    disabled={deletingId === selectedSheet?.id}>
                    {deletingId === selectedSheet?.id ? (
                      <ActivityIndicator size="small" color={Colors.error} />
                    ) : (
                      <Trash2 size={19} color={Colors.error} />
                    )}
                    <Text style={styles.deleteActionText}>Sterge fisa</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addClientBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  search: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 14, paddingVertical: 11 },
  refreshBtn: {
    width: 44,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  sortChipActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  paymentChipActive: { borderColor: '#60A5FA', backgroundColor: 'rgba(96,165,250,0.14)' },
  sortText: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Medium' },
  sortTextActive: { color: Colors.orange },
  paymentTextActive: { color: '#60A5FA' },
  listContent: { padding: 14, paddingBottom: 100, gap: 10 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.orangeDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetNo: { color: Colors.orange, fontSize: 12, fontFamily: 'Inter-Bold' },
  finalizedPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
    backgroundColor: Colors.successDim,
    borderWidth: 1,
    borderColor: Colors.success + '44',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  finalizedText: { color: Colors.success, fontSize: 10, fontFamily: 'Inter-Bold' },
  clientName: { color: Colors.textPrimary, fontSize: 16, fontFamily: 'Inter-Bold', marginTop: 2 },
  price: { color: Colors.success, fontSize: 13, fontFamily: 'Inter-Bold' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  metaText: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular' },
  vehicle: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 8 },
  pagination: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 4,
  },
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
  pageLabel: { minWidth: 120, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter-SemiBold' },
  pageRange: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Regular', marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 14,
    paddingBottom: 22,
  },
  actionSheet: {
    backgroundColor: '#171717',
    borderRadius: 26,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: Colors.orangeMid,
    padding: 18,
    gap: 16,
    boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: Colors.cardBorder,
  },
  sheetHandleHitArea: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -12,
    marginBottom: -8,
  },
  actionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    borderCurve: 'continuous',
    backgroundColor: Colors.orangeDim,
    borderWidth: 1,
    borderColor: Colors.orangeMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitleWrap: { flex: 1 },
  actionKicker: {
    color: Colors.orange,
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actionTitle: { color: Colors.textPrimary, fontSize: 20, fontFamily: 'Inter-Bold', marginTop: 2 },
  closeActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionMetaGrid: { gap: 8 },
  actionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionMetaText: { flex: 1, color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Medium' },
  actionButtons: { gap: 10 },
  primaryAction: {
    height: 50,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: Colors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryActionText: { color: Colors.white, fontSize: 14, fontFamily: 'Inter-Bold' },
  deleteAction: {
    height: 50,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: Colors.errorDim,
    borderWidth: 1,
    borderColor: Colors.error + '55',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  deleteActionText: { color: Colors.error, fontSize: 14, fontFamily: 'Inter-Bold' },
  actionDisabled: { opacity: 0.58 },
  error: {
    marginHorizontal: 14,
    marginBottom: 8,
    color: Colors.error,
    backgroundColor: Colors.errorDim,
    borderColor: Colors.error + '33',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { color: Colors.textPrimary, fontSize: 18, fontFamily: 'Inter-Bold' },
  emptySub: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center' },
});
