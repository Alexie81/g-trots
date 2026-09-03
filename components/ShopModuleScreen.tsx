import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarChart3,
  Boxes,
  Camera,
  ChevronRight,
  CircleEllipsis,
  CloudUpload,
  CreditCard,
  FileText,
  FileCog,
  Factory,
  FolderTree,
  Globe2,
  Handshake,
  House,
  ImageIcon,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  BadgePercent,
  Building2,
  ShoppingCart,
  Sparkles,
  Tags,
  Trash2,
  TrendingUp,
  Truck,
  UsersRound,
  X,
} from 'lucide-react-native';
import Header from '@/components/Header';
import ShopInventoryManager from '@/components/ShopInventoryManager';
import ShopOrdersManager from '@/components/ShopOrdersManager';
import ShopProductsManager from '@/components/ShopProductsManager';
import ShopCustomersManager from '@/components/ShopCustomersManager';
import ShopDiscountsManager from '@/components/ShopDiscountsManager';
import ShopCompanySettingsManager from '@/components/ShopCompanySettingsManager';
import ShopSuppliersManager from '@/components/ShopSuppliersManager';
import ShopNirManager from '@/components/ShopNirManager';
import ShopInvoiceConfigurator from '@/components/ShopInvoiceConfigurator';
import ShopInvoicesManager from '@/components/ShopInvoicesManager';
import { ShopPaymentMethodsManager, ShopProductSourcesManager, ShopShippingManager } from '@/components/ShopMoreManagers';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  shopApi,
  ShopBrand,
  ShopBrandPayload,
  ShopCategory,
  ShopCategoryPayload,
  ShopDashboardStats,
  ShopManufacturer,
  ShopManufacturerPayload,
} from '@/services/shopApi';

type CatalogView = 'categories' | 'brands' | 'manufacturers';
type SettingsView = 'sources' | 'suppliers' | 'nirs' | 'invoices' | 'invoice-configurator' | 'spv' | 'payments' | 'shipping' | 'customers' | 'discounts' | 'company';
type PrimaryTab = 'home' | 'orders' | 'products' | 'inventory' | 'more';
type ShopView = PrimaryTab | CatalogView | SettingsView;
type DeleteTarget = { type: 'category'; item: ShopCategory } | { type: 'brand'; item: ShopBrand } | { type: 'manufacturer'; item: ShopManufacturer };

// Revalidarea sesiunii poate reconstrui layout-ul Expo. Pastram sectiunea
// SHOP activa, astfel incat utilizatorul sa nu fie trimis inapoi pe Acasa.
let persistedShopView: ShopView = 'home';
const SHOP_VIEW_STORAGE_KEY = 'gtrots.shopView.v2';
const shopViews = new Set<ShopView>(['home', 'orders', 'products', 'inventory', 'more', 'categories', 'brands', 'manufacturers', 'sources', 'suppliers', 'nirs', 'invoices', 'invoice-configurator', 'spv', 'payments', 'shipping', 'customers', 'discounts', 'company']);

const orderStatusLabels: Record<string, string> = {
  new: 'NOUĂ',
  confirmed: 'CONFIRMATĂ',
  processing: 'ÎN PREGĂTIRE',
  shipped: 'PREDATĂ CURIERULUI',
  completed: 'LIVRATĂ',
  refunded: 'RAMBURSATĂ',
  cancelled: 'COMANDĂ ANULATĂ',
};

const primaryTabs = [
  { key: 'home', title: 'Acasă', Icon: House },
  { key: 'orders', title: 'Comenzi', Icon: ShoppingCart },
  { key: 'products', title: 'Produse', Icon: Package },
  { key: 'inventory', title: 'Stocuri', Icon: Boxes },
  { key: 'more', title: 'Mai multe', Icon: CircleEllipsis },
] as const;

const homeAreas = [
  { key: 'orders', title: 'Comenzi', description: 'Fluxul comenzilor si statusurile lor.', Icon: ShoppingCart, color: '#38BDF8' },
  { key: 'products', title: 'Produse', description: 'Catalog, preturi si informatii comerciale.', Icon: Package, color: '#A78BFA' },
  { key: 'inventory', title: 'Stocuri', description: 'Cantitati, miscari si alerte de stoc.', Icon: Boxes, color: '#22C55E' },
  { key: 'categories', title: 'Categorii', description: 'Categorii, subcategorii si imagini.', Icon: FolderTree, color: '#FB7185' },
  { key: 'brands', title: 'Compatibilitati branduri', description: 'Marcile cu care sunt compatibile produsele.', Icon: Tags, color: '#2DD4BF' },
  { key: 'manufacturers', title: 'Producatori', description: 'Companiile care fabrica produsele.', Icon: Factory, color: '#818CF8' },
  { key: 'invoices', title: 'Facturi emise', description: 'Documentele emise și situația încasărilor.', Icon: FileText, color: '#F59E0B' },
] as const;

const primaryTabDetails = {
  orders: {
    eyebrow: 'GESTIONARE COMENZI',
    title: 'Comenzi',
    description: 'Urmareste comenzile si statusurile lor dintr-un singur loc.',
    emptyTitle: 'Zona de comenzi este pregatita',
    emptyText: 'Lista si actiunile pentru comenzi vor fi adaugate aici.',
    Icon: ShoppingCart,
    color: '#38BDF8',
  },
  products: {
    eyebrow: 'CATALOG COMERCIAL',
    title: 'Produse',
    description: 'Administreaza produsele, preturile si informatiile comerciale.',
    emptyTitle: 'Zona de produse este pregatita',
    emptyText: 'Produsele si actiunile catalogului vor fi adaugate aici.',
    Icon: Package,
    color: '#A78BFA',
  },
  inventory: {
    eyebrow: 'GESTIONARE STOC',
    title: 'Stocuri',
    description: 'Consulta cantitatile, miscarile si alertele de stoc.',
    emptyTitle: 'Zona de stocuri este pregatita',
    emptyText: 'Cantitatile si miscarile de stoc vor fi adaugate aici.',
    Icon: Boxes,
    color: '#22C55E',
  },
  more: {
    eyebrow: 'ADMINISTRARE SHOP',
    title: 'Mai multe',
    description: 'Gasesti aici instrumentele actuale si toate sectiunile care vor fi adaugate pe viitor.',
    emptyTitle: '',
    emptyText: '',
    Icon: CircleEllipsis,
    color: Colors.orange,
  },
} as const;

const moreAreaGroups = [
  {
    key: 'sales', title: 'VÂNZĂRI', color: '#38BDF8',
    areas: [
      { key: 'shipping', title: 'Livrări', description: 'Costuri, praguri gratuite și termene de livrare.', Icon: Truck, color: '#22C55E' },
      { key: 'customers', title: 'Clienți', description: 'Conturi, comenzi, valoare totală și controlul accesului.', Icon: UsersRound, color: '#38BDF8' },
      { key: 'invoices', title: 'Facturi emise', description: 'Documentele emise și situația încasărilor.', Icon: FileText, color: '#F59E0B' },
    ],
  },
  {
    key: 'catalog', title: 'CATALOG', color: '#A78BFA',
    areas: [
      { key: 'categories', title: 'Categorii', description: 'Categorii, subcategorii și imagini.', Icon: FolderTree, color: '#FB7185' },
      { key: 'brands', title: 'Compatibilități branduri', description: 'Mărcile cu care sunt compatibile produsele.', Icon: Tags, color: '#2DD4BF' },
      { key: 'manufacturers', title: 'Producători', description: 'Companiile care fabrică produsele.', Icon: Factory, color: '#818CF8' },
      { key: 'discounts', title: 'Reduceri', description: 'Campanii globale sau per produs și anunțuri pe site.', Icon: BadgePercent, color: '#F59E0B' },
    ],
  },
  {
    key: 'stock', title: 'STOC & ACHIZIȚII', color: '#2DD4BF',
    areas: [
      { key: 'nirs', title: 'NIR-uri', description: 'Recepții, facturi de achiziție și costuri istorice.', Icon: FileText, color: '#14B8A6' },
      { key: 'suppliers', title: 'Furnizori', description: 'Firme partenere, contacte și date comerciale pentru achiziții.', Icon: Handshake, color: '#5EEAD4' },
      { key: 'sources', title: 'Surse de aprovizionare', description: 'Canalele și partenerii din care provin produsele.', Icon: Globe2, color: '#38BDF8' },
    ],
  },
  {
    key: 'settings', title: 'CONFIGURARE', color: '#FB923C',
    areas: [
      { key: 'payments', title: 'Metode de plată', description: 'Activează plata cu cardul sau ramburs la curier.', Icon: CreditCard, color: '#A78BFA' },
      { key: 'invoice-configurator', title: 'Configurator factură', description: 'Structura, aspectul și tema facturilor viitoare.', Icon: FileCog, color: '#FB923C' },
      { key: 'spv', title: 'SPV / e-Factura', description: 'Conectarea ANAF și trimiterea facturilor vor fi configurate aici.', Icon: CloudUpload, color: '#60A5FA' },
      { key: 'company', title: 'Datele firmei', description: 'Identitate juridică, adresă, contact și date bancare.', Icon: Building2, color: '#FE8C19' },
    ],
  },
] as const;

export default function ShopModuleScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<ShopView>(persistedShopView);
  const viewRef = useRef<ShopView>(persistedShopView);
  const settingsScrollRef = useRef<ScrollView | null>(null);
  const revealSettingsField = useCallback((target: number) => {
    setTimeout(() => {
      const responder = settingsScrollRef.current?.getScrollResponder?.() as { scrollResponderScrollNativeHandleToKeyboard?: (nodeHandle: number, extraHeight: number, preventNegativeScrollOffset: boolean) => void } | undefined;
      responder?.scrollResponderScrollNativeHandleToKeyboard?.(target, 150, true);
    }, 180);
  }, []);
  const [ordersInitialFilter, setOrdersInitialFilter] = useState<'all' | 'new'>('all');
  const [initialOrderId, setInitialOrderId] = useState<string | null>(null);
  const [initialNirId, setInitialNirId] = useState<string | null>(null);
  const [initialInvoiceId, setInitialInvoiceId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ShopDashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [brands, setBrands] = useState<ShopBrand[]>([]);
  const [manufacturers, setManufacturers] = useState<ShopManufacturer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categoryModal, setCategoryModal] = useState(false);
  const [brandModal, setBrandModal] = useState(false);
  const [manufacturerModal, setManufacturerModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ShopCategory | null>(null);
  const [editingBrand, setEditingBrand] = useState<ShopBrand | null>(null);
  const [editingManufacturer, setEditingManufacturer] = useState<ShopManufacturer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryParent, setCategoryParent] = useState<string | null>(null);
  const [categoryActive, setCategoryActive] = useState(true);
  const [categoryImage, setCategoryImage] = useState<string | null>(null);
  const [categoryImageBase64, setCategoryImageBase64] = useState<string | null>(null);
  const [categoryImageRemoved, setCategoryImageRemoved] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [brandWebsite, setBrandWebsite] = useState('');
  const [brandActive, setBrandActive] = useState(true);
  const [manufacturerName, setManufacturerName] = useState('');
  const [manufacturerWebsite, setManufacturerWebsite] = useState('');
  const [manufacturerActive, setManufacturerActive] = useState(true);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(SHOP_VIEW_STORAGE_KEY).then((stored) => {
      if (!active || !stored || !shopViews.has(stored as ShopView)) return;
      // Do not override a navigation action that happened while storage loaded.
      if (viewRef.current === 'home' && persistedShopView === 'home') setView(stored as ShopView);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    persistedShopView = view;
    viewRef.current = view;
    void SecureStore.setItemAsync(SHOP_VIEW_STORAGE_KEY, view).catch(() => {});
  }, [view]);

  const loadCatalog = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [nextCategories, nextBrands, nextManufacturers] = await Promise.all([
        shopApi.listCategories(token),
        shopApi.listBrands(token),
        shopApi.listManufacturers(token),
      ]);
      setCategories(nextCategories);
      setBrands(nextBrands);
      setManufacturers(nextManufacturers);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Datele SHOP nu au putut fi incarcate.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setDashboardLoading(true);
    try { setDashboard(await shopApi.getDashboardStats(token)); }
    catch { setDashboard(null); }
    finally { setDashboardLoading(false); }
  }, [token]);

  useEffect(() => { if (view === 'home') void loadDashboard(); }, [view, loadDashboard]);

  const openCatalog = (next: CatalogView) => {
    setView(next);
    void loadCatalog();
  };

  const openOrders = (filter: 'all' | 'new' = 'all', orderId: string | null = null) => {
    setOrdersInitialFilter(filter);
    setInitialOrderId(orderId);
    setView('orders');
  };

  const openNirFromInventory = (nirId: string) => {
    setInitialNirId(nirId);
    setView('nirs');
  };

  const openInvoiceFromOrder = (invoiceId: string) => {
    setInitialInvoiceId(invoiceId);
    setView('invoices');
  };

  const openCategoryForm = (category?: ShopCategory) => {
    const current = category || null;
    setEditingCategory(current);
    setCategoryName(current?.name || '');
    setCategoryDescription(current?.description || '');
    setCategoryParent(current?.parent_id || null);
    setCategoryActive(current?.is_active ?? true);
    setCategoryImage(current?.thumbnail_url || null);
    setCategoryImageBase64(null);
    setCategoryImageRemoved(false);
    setCategoryModal(true);
  };

  const openBrandForm = (brand?: ShopBrand) => {
    const current = brand || null;
    setEditingBrand(current);
    setBrandName(current?.name || '');
    setBrandWebsite(current?.website_url || '');
    setBrandActive(current?.is_active ?? true);
    setBrandModal(true);
  };

  const openManufacturerForm = (manufacturer?: ShopManufacturer) => {
    const current = manufacturer || null;
    setEditingManufacturer(current);
    setManufacturerName(current?.name || '');
    setManufacturerWebsite(current?.website_url || '');
    setManufacturerActive(current?.is_active ?? true);
    setManufacturerModal(true);
  };

  const pickCategoryImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Acces necesar', 'Permite accesul la fotografii pentru a alege miniatura categoriei.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.base64) {
      setCategoryImage(asset.uri);
      setCategoryImageBase64(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
      setCategoryImageRemoved(false);
    }
  };

  const saveCategory = async () => {
    if (!token || saving) return;
    if (!categoryName.trim()) {
      Alert.alert('Nume obligatoriu', 'Completeaza numele categoriei.');
      return;
    }
    setSaving(true);
    try {
      const payload: ShopCategoryPayload = {
        name: categoryName.trim(),
        description: categoryDescription.trim(),
        parent_id: categoryParent,
        is_active: categoryActive,
        ...(categoryImageBase64 ? { thumbnail_base64: categoryImageBase64 } : {}),
        ...(categoryImageRemoved ? { thumbnail_remove: true } : {}),
      };
      if (editingCategory) await shopApi.updateCategory(token, editingCategory.id, payload);
      else await shopApi.createCategory(token, payload);
      setCategoryModal(false);
      await loadCatalog(true);
    } catch (saveError) {
      Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Incearca din nou.');
    } finally {
      setSaving(false);
    }
  };

  const saveBrand = async () => {
    if (!token || saving) return;
    if (!brandName.trim()) {
      Alert.alert('Nume obligatoriu', 'Completeaza numele brandului.');
      return;
    }
    setSaving(true);
    try {
      const payload: ShopBrandPayload = {
        name: brandName.trim(),
        website_url: brandWebsite.trim(),
        is_active: brandActive,
      };
      if (editingBrand) await shopApi.updateBrand(token, editingBrand.id, payload);
      else await shopApi.createBrand(token, payload);
      setBrandModal(false);
      await loadCatalog(true);
    } catch (saveError) {
      Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Incearca din nou.');
    } finally {
      setSaving(false);
    }
  };

  const saveManufacturer = async () => {
    if (!token || saving) return;
    if (!manufacturerName.trim()) {
      Alert.alert('Nume obligatoriu', 'Completeaza numele producatorului.');
      return;
    }
    setSaving(true);
    try {
      const payload: ShopManufacturerPayload = {
        name: manufacturerName.trim(),
        website_url: manufacturerWebsite.trim(),
        is_active: manufacturerActive,
      };
      if (editingManufacturer) await shopApi.updateManufacturer(token, editingManufacturer.id, payload);
      else await shopApi.createManufacturer(token, payload);
      setManufacturerModal(false);
      await loadCatalog(true);
    } catch (saveError) {
      Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Incearca din nou.');
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (!token || !deleteTarget || saving) return;
    setSaving(true);
    try {
      if (deleteTarget.type === 'category') await shopApi.deleteCategory(token, deleteTarget.item.id);
      else if (deleteTarget.type === 'brand') await shopApi.deleteBrand(token, deleteTarget.item.id);
      else await shopApi.deleteManufacturer(token, deleteTarget.item.id);
      setDeleteTarget(null);
      await loadCatalog(true);
    } catch (deleteError) {
      Alert.alert('Nu s-a putut sterge', deleteError instanceof Error ? deleteError.message : 'Incearca din nou.');
    } finally {
      setSaving(false);
    }
  };

  const availableParents = useMemo(
    () => categories.filter((category) => (
      category.id !== editingCategory?.id
      && (!editingCategory || !isCategoryDescendant(category.id, editingCategory.id, categories))
    )),
    [categories, editingCategory]
  );

  if (view === 'home') {
    return (
      <View style={styles.container}>
        <Header title="Acasă" />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 94 + insets.bottom }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroTop}><View style={styles.heroIcon}><TrendingUp size={21} color="#38BDF8" /></View><TouchableOpacity style={styles.heroRefresh} onPress={() => void loadDashboard()}><RefreshCw size={17} color={Colors.textSecondary} /></TouchableOpacity></View>
            <Text style={styles.kicker}>DASHBOARD COMERCIAL</Text>
            <Text style={styles.title}>Magazinul tău, pe scurt.</Text>
            <Text style={styles.subtitle}>Vânzări, comenzi, achiziții și profit actualizate direct din baza magazinului online.</Text>
            <View style={styles.statusPill}><View style={styles.statusDot} /><Text style={styles.statusText}>Date sincronizate cu magazinul</Text></View>
          </View>
          <View style={styles.sectionHeader}><View><Text style={styles.sectionKicker}>PERFORMANTA SHOP</Text><Text style={styles.sectionTitle}>Statistici generale</Text></View><BarChart3 size={20} color={Colors.textMuted} /></View>
          {dashboardLoading ? <View style={styles.dashboardLoading}><ActivityIndicator color={Colors.orange} /><Text style={styles.dashboardLoadingText}>Se actualizeaza statisticile...</Text></View> : <View style={styles.dashboardMetrics}>
            <DashboardMetric title="VÂNZĂRI" value={formatShopMoney(dashboard?.revenue || 0)} color="#38BDF8" />
            <DashboardMetric title="COMENZI" value={String(dashboard?.orders_count || 0)} color="#A78BFA" />
            <DashboardMetric title="ACHIZIȚII" value={formatShopMoney(dashboard?.acquisitions || 0)} color="#F59E0B" />
            <DashboardMetric title="PROFIT" value={formatShopMoney(dashboard?.profit || 0)} color="#22C55E" />
          </View>}
          <View style={styles.newOrdersBanner}><View style={styles.newOrdersIcon}><ShoppingCart size={21} color="#38BDF8" /></View><View style={styles.newOrdersCopy}><Text style={styles.newOrdersValue}>{dashboard?.new_orders_count || 0}</Text><Text style={styles.newOrdersLabel}>comenzi noi</Text></View><TouchableOpacity style={styles.newOrdersButton} onPress={() => openOrders('new')}><Text style={styles.newOrdersButtonText}>Vezi comenzile</Text><ChevronRight size={16} color={Colors.white} /></TouchableOpacity></View>
          <View style={styles.sectionHeader}><View><Text style={styles.sectionKicker}>SCURTATURI</Text><Text style={styles.sectionTitle}>Acțiuni rapide</Text></View></View>
          <View style={styles.quickActions}><TouchableOpacity style={styles.quickAction} onPress={() => setView('products')}><View style={[styles.cardIcon, { backgroundColor: '#A78BFA14' }]}><Package size={22} color="#A78BFA" /></View><View style={styles.quickActionCopy}><Text style={styles.quickActionTitle}>Produse</Text><Text style={styles.quickActionText}>Adaugă sau editează catalogul.</Text></View><ChevronRight size={18} color="#A78BFA" /></TouchableOpacity><TouchableOpacity style={styles.quickAction} onPress={() => openOrders()}><View style={[styles.cardIcon, { backgroundColor: '#38BDF814' }]}><ShoppingCart size={22} color="#38BDF8" /></View><View style={styles.quickActionCopy}><Text style={styles.quickActionTitle}>Comenzi</Text><Text style={styles.quickActionText}>Verifică și procesează comenzile.</Text></View><ChevronRight size={18} color="#38BDF8" /></TouchableOpacity><TouchableOpacity style={[styles.quickAction, styles.quickActionInvoice]} onPress={() => setView('invoices')}><View style={[styles.cardIcon, { backgroundColor: '#F59E0B16' }]}><FileText size={22} color="#F59E0B" /></View><View style={styles.quickActionCopy}><Text style={styles.quickActionTitle}>Facturi emise</Text><Text style={styles.quickActionText}>Vezi documentele fiscale și starea lor.</Text></View><ChevronRight size={18} color="#F59E0B" /></TouchableOpacity></View>
          <View style={styles.sectionHeader}><View><Text style={styles.sectionKicker}>ACTIVITATE RECENTA</Text><Text style={styles.sectionTitle}>Ultimele comenzi</Text></View><TouchableOpacity style={styles.sectionSeeAll} onPress={() => openOrders('new')}><Text style={styles.sectionSeeAllText}>Vezi toate</Text><ChevronRight size={15} color={Colors.white} /></TouchableOpacity></View>
          <View style={styles.recentOrders}>{dashboard?.recent_orders?.filter((order) => order.status === 'new').length ? dashboard.recent_orders.filter((order) => order.status === 'new').slice(0, 5).map((order) => <TouchableOpacity key={order.id} style={styles.recentOrder} onPress={() => openOrders('new', order.id)}><View><Text style={styles.recentOrderNumber}>{order.order_number}</Text><Text style={styles.recentOrderMeta}>{order.customer_name} · {order.created_at}</Text></View><View style={styles.recentOrderRight}><Text style={styles.recentOrderTotal}>{formatShopMoney(order.total)}</Text><Text style={[styles.recentOrderStatus, styles.recentOrderNew]}>{orderStatusLabels[order.status] || order.status.toUpperCase()}</Text></View></TouchableOpacity>) : <Text style={styles.dashboardEmpty}>Nu există comenzi noi.</Text>}</View>
        </ScrollView>

        <ShopBottomNavigation activeTab="home" onSelect={(tab) => tab === 'orders' ? openOrders() : setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  if (view === 'orders' || view === 'products' || view === 'inventory' || view === 'more') {
    const details = primaryTabDetails[view];
    const ScreenIcon = details.Icon;
    const isMore = view === 'more';

    return (
      <View style={styles.container}>
        <Header title={details.title} />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 94 + insets.bottom }]}
          showsVerticalScrollIndicator={false}>
          {!isMore ? <View style={[styles.hero, { backgroundColor: `${details.color}12` }]}>
            <View style={[styles.heroIcon, { borderColor: `${details.color}40`, backgroundColor: `${details.color}18` }]}>
              <ScreenIcon size={22} color={details.color} />
            </View>
            <Text style={[styles.kicker, { color: details.color }]}>{details.eyebrow}</Text>
            <Text style={styles.title}>{details.title}</Text>
            <Text style={styles.subtitle}>{details.description}</Text>
          </View> : null}

          {view === 'orders' ? (
            <ShopOrdersManager initialStatusFilter={ordersInitialFilter} initialOrderId={initialOrderId} onInitialOrderHandled={() => setInitialOrderId(null)} onOpenInvoice={openInvoiceFromOrder} />
          ) : view === 'products' ? (
            <ShopProductsManager onOpenOrder={(orderId) => openOrders('all', orderId)} />
          ) : view === 'inventory' ? (
            <ShopInventoryManager onOpenNir={openNirFromInventory} />
          ) : isMore ? (
            <>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionKicker}>TOATE INSTRUMENTELE</Text>
                  <Text style={styles.sectionTitle}>Administrare magazin</Text>
                </View>
              </View>
              <View style={styles.moreGroups}>
                {moreAreaGroups.map((group, groupIndex) => (
                  <View key={group.key} style={styles.moreGroup}>
                    <View style={styles.moreGroupHeader}>
                      <View style={[styles.moreGroupIndex, { backgroundColor: `${group.color}18` }]}><Text style={[styles.moreGroupIndexText, { color: group.color }]}>{String(groupIndex + 1).padStart(2, '0')}</Text></View>
                      <Text style={[styles.moreGroupTitle, { color: group.color }]}>{group.title}</Text>
                      <View style={[styles.moreGroupLine, { backgroundColor: `${group.color}28` }]} />
                    </View>
                    <View style={styles.moreList}>
                      {group.areas.map(({ key, title, description, Icon, color }) => {
                        const openArea = () => {
                          if (key === 'categories' || key === 'brands' || key === 'manufacturers') openCatalog(key);
                          else setView(key);
                        };
                        return (
                          <TouchableOpacity key={key} style={styles.moreCard} activeOpacity={0.72} accessibilityRole="button" onPress={openArea}>
                            <View style={[styles.moreCardIcon, { backgroundColor: `${color}16` }]}><Icon size={21} color={color} /></View>
                            <View style={styles.moreCardCopy}><Text style={styles.moreCardTitle}>{title}</Text><Text style={styles.moreCardDescription}>{description}</Text></View>
                            <View style={[styles.moreCardArrow, { backgroundColor: `${color}12` }]}><ChevronRight size={18} color={color} /></View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.primaryEmpty}>
              <View style={[styles.primaryEmptyIcon, { backgroundColor: `${details.color}14` }]}>
                <ScreenIcon size={32} color={details.color} />
              </View>
              <Text style={styles.primaryEmptyTitle}>{details.emptyTitle}</Text>
              <Text style={styles.primaryEmptyText}>{details.emptyText}</Text>
              <View style={[styles.comingSoonPill, { backgroundColor: `${details.color}14` }]}>
                <Text style={[styles.comingSoonText, { color: details.color }]}>IN CURAND</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <ShopBottomNavigation activeTab={view} onSelect={(tab) => tab === 'orders' ? openOrders() : setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  if (view === 'nirs') {
    return (
      <View style={styles.container}>
        <Header title="NIR-uri" showBack onBack={() => setView('more')} />
        <ShopNirManager initialNirId={initialNirId} onInitialNirHandled={() => setInitialNirId(null)} />
      </View>
    );
  }

  if (view === 'invoice-configurator') {
    return (
      <View style={styles.container}>
        <Header title="Configurator factură" showBack onBack={() => setView('more')} />
        <ShopInvoiceConfigurator bottomInset={insets.bottom} />
        <ShopBottomNavigation activeTab="more" onSelect={(tab) => setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  if (view === 'invoices') {
    return (
      <View style={styles.container}>
        <Header title="Facturi emise" showBack onBack={() => setView('more')} />
        <ShopInvoicesManager initialInvoiceId={initialInvoiceId} onInitialInvoiceHandled={() => setInitialInvoiceId(null)} />
        <ShopBottomNavigation activeTab="more" onSelect={(tab) => setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  if (view === 'spv') {
    return (
      <View style={styles.container}>
        <Header title="SPV / e-Factura" showBack onBack={() => setView('more')} />
        <ScrollView contentContainerStyle={[styles.spvContent, { paddingBottom: 120 + insets.bottom }]} showsVerticalScrollIndicator={false}>
          <View style={styles.spvHero}>
            <View style={styles.spvGlow} />
            <View style={styles.spvIcon}><CloudUpload size={33} color="#A8C7FA" /></View>
            <View style={styles.spvState}><View style={styles.spvStateDot} /><Text style={styles.spvStateText}>ÎN LUCRU</Text></View>
            <Text style={styles.spvKicker}>CONFIGURARE ANAF</Text>
            <Text style={styles.spvTitle}>SPV și RO e-Factura</Text>
            <Text style={styles.spvText}>Aici vom configura autentificarea, firmele autorizate și transmiterea facturilor către ANAF.</Text>
          </View>
          <View style={styles.spvInfo}>
            <ShieldCheck size={24} color="#6EE7B7" />
            <View style={styles.spvInfoCopy}><Text style={styles.spvInfoTitle}>Secțiune pregătită</Text><Text style={styles.spvInfoText}>Momentan nu se trimit date și nu se solicită niciun certificat. Continuăm când stabilești fluxul dorit.</Text></View>
          </View>
        </ScrollView>
        <ShopBottomNavigation activeTab="more" onSelect={(tab) => setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  if (view === 'sources' || view === 'suppliers' || view === 'payments' || view === 'shipping' || view === 'customers' || view === 'discounts' || view === 'company') {
    const title = view === 'sources' ? 'Surse de aprovizionare' : view === 'suppliers' ? 'Furnizori' : view === 'payments' ? 'Metode de plată' : view === 'shipping' ? 'Livrări' : view === 'customers' ? 'Clienți' : view === 'company' ? 'Datele firmei' : 'Reduceri';
    return (
      <View style={styles.container}>
        <Header title={title} showBack onBack={() => setView('more')} />
        <KeyboardAvoidingView style={styles.settingsKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          <ScrollView
            ref={settingsScrollRef}
            contentContainerStyle={{ paddingBottom: 180 + insets.bottom }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets>
            {view === 'sources' ? <ShopProductSourcesManager /> : view === 'suppliers' ? <ShopSuppliersManager /> : view === 'payments' ? <ShopPaymentMethodsManager /> : view === 'shipping' ? <ShopShippingManager /> : view === 'customers' ? <ShopCustomersManager onSearchFocus={() => setTimeout(() => settingsScrollRef.current?.scrollTo({ y: 390, animated: true }), 120)} onOpenOrder={(orderId) => openOrders('all', orderId)} /> : view === 'company' ? <ShopCompanySettingsManager onFieldFocus={revealSettingsField} /> : <ShopDiscountsManager />}
          </ScrollView>
        </KeyboardAvoidingView>
        <ShopBottomNavigation activeTab="more" onSelect={(tab) => setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  const isCategories = view === 'categories';
  const isBrands = view === 'brands';
  const viewTitle = isCategories ? 'Categorii si subcategorii' : isBrands ? 'Compatibilitati branduri' : 'Producatori';
  const viewSubtitle = isCategories ? 'Organizeaza produsele pe niveluri si adauga o miniatura.' : isBrands ? 'Administreaza marcile cu care sunt compatibile produsele.' : 'Administreaza companiile care fabrica produsele.';
  const viewCount = isCategories ? categories.length : isBrands ? brands.length : manufacturers.length;
  return (
    <View style={styles.container}>
      <Header
        title="Catalog SHOP"
        showBack
        onBack={() => setView('more')}
        right={
          <TouchableOpacity style={styles.headerAction} onPress={() => void loadCatalog()} disabled={loading}>
            <RefreshCw size={18} color={Colors.orange} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={[styles.catalogContent, { paddingBottom: 178 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <View style={styles.catalogHero}>
          <View style={styles.catalogHeroIcon}>{isCategories ? <FolderTree size={24} color="#FB7185" /> : isBrands ? <Tags size={24} color="#2DD4BF" /> : <Factory size={24} color="#818CF8" />}</View>
          <View style={styles.catalogHeroText}>
            <Text style={styles.catalogKicker}>CATALOG PRODUSE</Text>
            <Text style={styles.catalogTitle}>{viewTitle}</Text>
            <Text style={styles.catalogSubtitle}>{viewSubtitle}</Text>
          </View>
          <View style={styles.counter}><Text style={styles.counterValue}>{viewCount}</Text><Text style={styles.counterLabel}>TOTAL</Text></View>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, isCategories && styles.tabActive]} onPress={() => setView('categories')}><FolderTree size={16} color={isCategories ? Colors.white : Colors.textSecondary} /><Text style={[styles.tabText, isCategories && styles.tabTextActive]}>Categorii</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tab, isBrands && styles.tabActive]} onPress={() => setView('brands')}><Tags size={16} color={isBrands ? Colors.white : Colors.textSecondary} /><Text style={[styles.tabText, isBrands && styles.tabTextActive]}>Compatibilitati</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tab, view === 'manufacturers' && styles.tabActive]} onPress={() => setView('manufacturers')}><Factory size={16} color={view === 'manufacturers' ? Colors.white : Colors.textSecondary} /><Text style={[styles.tabText, view === 'manufacturers' && styles.tabTextActive]}>Producatori</Text></TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.stateBox}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se incarca datele...</Text></View>
        ) : error ? (
          <View style={styles.stateBox}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retryButton} onPress={() => void loadCatalog()}><Text style={styles.retryText}>Incearca din nou</Text></TouchableOpacity></View>
        ) : isCategories ? (
          <CategoryTable categories={categories} onEdit={openCategoryForm} onDelete={(item) => setDeleteTarget({ type: 'category', item })} />
        ) : isBrands ? (
          <BrandTable brands={brands} onEdit={openBrandForm} onDelete={(item) => setDeleteTarget({ type: 'brand', item })} />
        ) : (
          <ManufacturerTable manufacturers={manufacturers} onEdit={openManufacturerForm} onDelete={(item) => setDeleteTarget({ type: 'manufacturer', item })} />
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: 86 + insets.bottom }]}
        activeOpacity={0.82}
        accessibilityLabel={isCategories ? 'Adauga categorie' : isBrands ? 'Adauga compatibilitate brand' : 'Adauga producator'}
        onPress={() => isCategories ? openCategoryForm() : isBrands ? openBrandForm() : openManufacturerForm()}>
        <Plus size={28} color={Colors.white} strokeWidth={2.6} />
      </TouchableOpacity>

      <ShopBottomNavigation activeTab="more" onSelect={(tab) => setView(tab)} bottomInset={insets.bottom} />

      <Modal visible={categoryModal} transparent animationType="slide" onRequestClose={() => !saving && setCategoryModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !saving && setCategoryModal(false)}>
          <Pressable style={[styles.modalCard, { paddingBottom: Math.max(20, insets.bottom) }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View><Text style={styles.modalKicker}>CATEGORIE SHOP</Text><Text style={styles.modalTitle}>{editingCategory ? 'Editeaza categoria' : 'Categorie noua'}</Text></View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setCategoryModal(false)} disabled={saving}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>MINIATURA</Text>
              <View style={styles.imageRow}>
                <TouchableOpacity style={styles.imagePicker} onPress={() => void pickCategoryImage()}>
                  {categoryImage && !categoryImageRemoved ? <Image source={{ uri: categoryImage }} style={styles.previewImage} /> : <ImageIcon size={27} color={Colors.textMuted} />}
                </TouchableOpacity>
                <View style={styles.imageActions}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => void pickCategoryImage()}><Camera size={16} color={Colors.orange} /><Text style={styles.secondaryButtonText}>Alege poza</Text></TouchableOpacity>
                  {categoryImage && !categoryImageRemoved && <TouchableOpacity onPress={() => { setCategoryImage(null); setCategoryImageBase64(null); setCategoryImageRemoved(true); }}><Text style={styles.removeImageText}>Sterge miniatura</Text></TouchableOpacity>}
                </View>
              </View>

              <Text style={styles.fieldLabel}>NUME *</Text>
              <TextInput style={styles.input} value={categoryName} onChangeText={setCategoryName} placeholder="Ex: Accesorii" placeholderTextColor={Colors.textMuted} maxLength={120} />
              <Text style={styles.fieldLabel}>DESCRIERE</Text>
              <TextInput style={[styles.input, styles.textarea]} value={categoryDescription} onChangeText={setCategoryDescription} placeholder="Descriere scurta pentru categorie" placeholderTextColor={Colors.textMuted} multiline maxLength={1000} />
              <Text style={styles.fieldLabel}>CATEGORIE PARINTE</Text>
              <Text style={styles.fieldHint}>Alege un parinte doar daca aceasta este o subcategorie.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.parentOptions}>
                <ParentChip label="Fara parinte" selected={categoryParent === null} onPress={() => setCategoryParent(null)} />
                {availableParents.map((category) => <ParentChip key={category.id} label={categoryHierarchyLabel(category, categories)} selected={categoryParent === category.id} onPress={() => setCategoryParent(category.id)} />)}
              </ScrollView>
              <View style={styles.switchRow}><View><Text style={styles.switchTitle}>Categorie activa</Text><Text style={styles.fieldHint}>Poate fi folosita in catalog.</Text></View><Switch value={categoryActive} onValueChange={setCategoryActive} trackColor={{ false: '#363636', true: Colors.orangeMid }} thumbColor={categoryActive ? Colors.orange : '#8A8A8A'} /></View>
              <TouchableOpacity style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={() => void saveCategory()} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={18} color={Colors.white} /><Text style={styles.saveButtonText}>Salveaza categoria</Text></>}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={brandModal} transparent animationType="slide" onRequestClose={() => !saving && setBrandModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !saving && setBrandModal(false)}>
          <Pressable style={[styles.modalCard, styles.brandModal, { paddingBottom: Math.max(20, insets.bottom) }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View><Text style={styles.modalKicker}>COMPATIBILITATE SHOP</Text><Text style={styles.modalTitle}>{editingBrand ? 'Editeaza compatibilitatea' : 'Compatibilitate noua'}</Text></View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setBrandModal(false)} disabled={saving}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>NUME *</Text>
            <TextInput style={styles.input} value={brandName} onChangeText={setBrandName} placeholder="Ex: Apple, Samsung" placeholderTextColor={Colors.textMuted} maxLength={120} />
            <Text style={styles.fieldLabel}>SITE WEB</Text>
            <TextInput style={styles.input} value={brandWebsite} onChangeText={setBrandWebsite} placeholder="https://..." placeholderTextColor={Colors.textMuted} autoCapitalize="none" keyboardType="url" maxLength={255} />
            <View style={styles.switchRow}><View><Text style={styles.switchTitle}>Compatibilitate activa</Text><Text style={styles.fieldHint}>Poate fi asociata produselor.</Text></View><Switch value={brandActive} onValueChange={setBrandActive} trackColor={{ false: '#363636', true: Colors.orangeMid }} thumbColor={brandActive ? Colors.orange : '#8A8A8A'} /></View>
            <TouchableOpacity style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={() => void saveBrand()} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={18} color={Colors.white} /><Text style={styles.saveButtonText}>Salveaza compatibilitatea</Text></>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={manufacturerModal} transparent animationType="slide" onRequestClose={() => !saving && setManufacturerModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !saving && setManufacturerModal(false)}>
          <Pressable style={[styles.modalCard, styles.brandModal, { paddingBottom: Math.max(20, insets.bottom) }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View><Text style={styles.modalKicker}>PRODUCATOR SHOP</Text><Text style={styles.modalTitle}>{editingManufacturer ? 'Editeaza producatorul' : 'Producator nou'}</Text></View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setManufacturerModal(false)} disabled={saving}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>NUME *</Text>
            <TextInput style={styles.input} value={manufacturerName} onChangeText={setManufacturerName} placeholder="Ex: Bosch" placeholderTextColor={Colors.textMuted} maxLength={120} />
            <Text style={styles.fieldLabel}>SITE WEB</Text>
            <TextInput style={styles.input} value={manufacturerWebsite} onChangeText={setManufacturerWebsite} placeholder="https://..." placeholderTextColor={Colors.textMuted} autoCapitalize="none" keyboardType="url" maxLength={255} />
            <View style={styles.switchRow}><View><Text style={styles.switchTitle}>Producator activ</Text><Text style={styles.fieldHint}>Poate fi asociat produselor.</Text></View><Switch value={manufacturerActive} onValueChange={setManufacturerActive} trackColor={{ false: '#363636', true: Colors.orangeMid }} thumbColor={manufacturerActive ? Colors.orange : '#8A8A8A'} /></View>
            <TouchableOpacity style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={() => void saveManufacturer()} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={18} color={Colors.white} /><Text style={styles.saveButtonText}>Salveaza producatorul</Text></>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => !saving && setDeleteTarget(null)}>
        <Pressable style={[styles.modalBackdrop, styles.deleteBackdrop]} onPress={() => !saving && setDeleteTarget(null)}>
          <Pressable style={styles.deletePanel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.deleteIcon}><Trash2 size={25} color={Colors.error} /></View>
            <Text style={styles.deleteKicker}>CONFIRMARE STERGERE</Text>
            <Text style={styles.deleteTitle}>{deleteTarget?.type === 'category' ? 'Stergi categoria?' : deleteTarget?.type === 'brand' ? 'Stergi compatibilitatea?' : 'Stergi producatorul?'}</Text>
            <Text style={styles.deleteText}>
              {deleteTarget ? `„${deleteTarget.item.name}” va fi sters definitiv.` : ''}
              {deleteTarget?.type === 'category' ? ' Subcategoriile sale vor ramane in catalog fara parinte.' : ''}
            </Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setDeleteTarget(null)} disabled={saving}><Text style={styles.cancelButtonText}>Renunta</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.deleteButton, saving && styles.buttonDisabled]} onPress={() => void performDelete()} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <><Trash2 size={17} color={Colors.white} /><Text style={styles.deleteButtonText}>Sterge</Text></>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ShopBottomNavigation({
  activeTab,
  onSelect,
  bottomInset,
}: {
  activeTab: PrimaryTab;
  onSelect: (tab: PrimaryTab) => void;
  bottomInset: number;
}) {
  return (
    <View
      style={[
        styles.bottomNavigation,
        { height: 66 + bottomInset, paddingBottom: Math.max(bottomInset, 6) },
      ]}>
      {primaryTabs.map(({ key, title, Icon }) => {
        const active = activeTab === key;
        return (
          <TouchableOpacity
            key={key}
            style={styles.bottomNavigationItem}
            activeOpacity={0.72}
            accessibilityRole="tab"
            accessibilityLabel={title}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(key)}>
            <View style={styles.bottomNavigationIcon}>
              <Icon
                size={21}
                color={active ? Colors.orange : Colors.textMuted}
                strokeWidth={active ? 2.6 : 2.1}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.bottomNavigationLabel, active && styles.bottomNavigationLabelActive]}>
              {title}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function isCategoryDescendant(candidateId: string, ancestorId: string, categories: ShopCategory[]): boolean {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const visited = new Set<string>();
  let cursor = byId.get(candidateId);
  while (cursor?.parent_id && !visited.has(cursor.id)) {
    if (cursor.parent_id === ancestorId) return true;
    visited.add(cursor.id);
    cursor = byId.get(cursor.parent_id);
  }
  return false;
}

function categoryHierarchyLabel(category: ShopCategory, categories: ShopCategory[]): string {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const names = [category.name];
  const visited = new Set([category.id]);
  let parentId = category.parent_id;
  while (parentId && !visited.has(parentId) && names.length < 8) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parent_id;
  }
  return names.join(' › ');
}

function ParentChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity style={[styles.parentChip, selected && styles.parentChipActive]} onPress={onPress}><Text numberOfLines={1} style={[styles.parentChipText, selected && styles.parentChipTextActive]}>{label}</Text></TouchableOpacity>;
}

function CategoryTable({ categories, onEdit, onDelete }: { categories: ShopCategory[]; onEdit: (item: ShopCategory) => void; onDelete: (item: ShopCategory) => void }) {
  if (!categories.length) return <EmptyCatalog icon={<FolderTree size={31} color="#FB7185" />} title="Nicio categorie" text="Apasa butonul + pentru prima categorie." />;
  return (
    <View style={styles.tableCard}><ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.tableWide}>
      <View style={[styles.tableRow, styles.tableHead]}><Text style={[styles.th, styles.colImage]}>POZA</Text><Text style={[styles.th, styles.colName]}>CATEGORIE</Text><Text style={[styles.th, styles.colParent]}>PARINTE</Text><Text style={[styles.th, styles.colStatus]}>STATUS</Text><Text style={[styles.th, styles.colActions]}>ACTIUNI</Text></View>
      {categories.map((category) => <View key={category.id} style={styles.tableRow}>
        <View style={styles.colImage}>{category.thumbnail_url ? <Image source={{ uri: category.thumbnail_url }} style={styles.tableImage} /> : category.parent_id ? <View style={styles.tableImageFallback}><ImageIcon size={18} color={Colors.textMuted} /></View> : null}</View>
        <View style={styles.colName}><Text style={styles.cellTitle}>{category.name}</Text><Text style={styles.cellSub} numberOfLines={1}>/{category.slug}</Text>{category.description ? <Text style={styles.cellDescription} numberOfLines={1}>{category.description}</Text> : null}</View>
        <View style={styles.colParent}><Text style={category.parent_name ? styles.cellText : styles.cellMuted}>{category.parent_name || 'Categorie principala'}</Text></View>
        <View style={styles.colStatus}><StatusBadge active={category.is_active} /></View>
        <View style={[styles.colActions, styles.actionRow]}><TableAction label="Editeaza" onPress={() => onEdit(category)} icon={<Pencil size={16} color="#38BDF8" />} /><TableAction label="Sterge" onPress={() => onDelete(category)} icon={<Trash2 size={16} color={Colors.error} />} danger /></View>
      </View>)}
    </View></ScrollView></View>
  );
}

function BrandTable({ brands, onEdit, onDelete }: { brands: ShopBrand[]; onEdit: (item: ShopBrand) => void; onDelete: (item: ShopBrand) => void }) {
  if (!brands.length) return <EmptyCatalog icon={<Tags size={31} color="#2DD4BF" />} title="Nicio compatibilitate" text="Apasa butonul + pentru prima compatibilitate de brand." />;
  return (
    <View style={styles.tableCard}><ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.tableWide}>
      <View style={[styles.tableRow, styles.tableHead]}><Text style={[styles.th, styles.colBrandName]}>COMPATIBILITATE</Text><Text style={[styles.th, styles.colWebsite]}>SITE WEB</Text><Text style={[styles.th, styles.colStatus]}>STATUS</Text><Text style={[styles.th, styles.colActions]}>ACTIUNI</Text></View>
      {brands.map((brand) => <View key={brand.id} style={styles.tableRow}>
        <View style={styles.colBrandName}><Text style={styles.cellTitle}>{brand.name}</Text><Text style={styles.cellSub}>/{brand.slug}</Text></View>
        <View style={styles.colWebsite}><Text style={brand.website_url ? styles.cellText : styles.cellMuted} numberOfLines={1}>{brand.website_url || '—'}</Text></View>
        <View style={styles.colStatus}><StatusBadge active={brand.is_active} /></View>
        <View style={[styles.colActions, styles.actionRow]}><TableAction label="Editeaza" onPress={() => onEdit(brand)} icon={<Pencil size={16} color="#38BDF8" />} /><TableAction label="Sterge" onPress={() => onDelete(brand)} icon={<Trash2 size={16} color={Colors.error} />} danger /></View>
      </View>)}
    </View></ScrollView></View>
  );
}

function ManufacturerTable({ manufacturers, onEdit, onDelete }: { manufacturers: ShopManufacturer[]; onEdit: (item: ShopManufacturer) => void; onDelete: (item: ShopManufacturer) => void }) {
  if (!manufacturers.length) return <EmptyCatalog icon={<Factory size={31} color="#818CF8" />} title="Niciun producator" text="Apasa butonul + pentru primul producator." />;
  return (
    <View style={styles.tableCard}><ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.tableWide}>
      <View style={[styles.tableRow, styles.tableHead]}><Text style={[styles.th, styles.colBrandName]}>PRODUCATOR</Text><Text style={[styles.th, styles.colWebsite]}>SITE WEB</Text><Text style={[styles.th, styles.colStatus]}>STATUS</Text><Text style={[styles.th, styles.colActions]}>ACTIUNI</Text></View>
      {manufacturers.map((manufacturer) => <View key={manufacturer.id} style={styles.tableRow}>
        <View style={styles.colBrandName}><Text style={styles.cellTitle}>{manufacturer.name}</Text><Text style={styles.cellSub}>/{manufacturer.slug}</Text></View>
        <View style={styles.colWebsite}><Text style={manufacturer.website_url ? styles.cellText : styles.cellMuted} numberOfLines={1}>{manufacturer.website_url || '—'}</Text></View>
        <View style={styles.colStatus}><StatusBadge active={manufacturer.is_active} /></View>
        <View style={[styles.colActions, styles.actionRow]}><TableAction label="Editeaza" onPress={() => onEdit(manufacturer)} icon={<Pencil size={16} color="#38BDF8" />} /><TableAction label="Sterge" onPress={() => onDelete(manufacturer)} icon={<Trash2 size={16} color={Colors.error} />} danger /></View>
      </View>)}
    </View></ScrollView></View>
  );
}

function formatShopMoney(value: number) {
  return `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} lei`;
}

function DashboardMetric({ title, value, color }: { title: string; value: string; color: string }) {
  return <View style={styles.dashboardMetric}><View style={[styles.dashboardMetricDot, { backgroundColor: color }]} /><Text style={styles.dashboardMetricTitle}>{title}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.dashboardMetricValue, { color }]}>{value}</Text></View>;
}

function StatusBadge({ active }: { active: boolean }) {
  return <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}><View style={[styles.badgeDot, { backgroundColor: active ? Colors.success : Colors.textMuted }]} /><Text style={[styles.badgeText, { color: active ? '#9CD9AE' : Colors.textSecondary }]}>{active ? 'Activa' : 'Inactiva'}</Text></View>;
}

function TableAction({ label, icon, onPress, danger }: { label: string; icon: React.ReactNode; onPress: () => void; danger?: boolean }) {
  return <TouchableOpacity accessibilityLabel={label} style={[styles.tableAction, danger && styles.tableActionDanger]} onPress={onPress}>{icon}</TouchableOpacity>;
}

function EmptyCatalog({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <View style={styles.emptyBox}><View style={styles.emptyIcon}>{icon}</View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  settingsKeyboard: { flex: 1 },
  content: { padding: 16, paddingBottom: 38 },
  hero: { overflow: 'hidden', borderWidth: 0, borderRadius: 28, padding: 24, backgroundColor: '#151B1E' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }, heroIcon: { width: 44, height: 44, borderWidth: 1, borderColor: 'rgba(56,189,248,0.30)', borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(56,189,248,0.10)' }, heroRefresh: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  kicker: { color: '#38BDF8', fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 1.5 },
  title: { color: Colors.textPrimary, fontSize: 31, fontFamily: 'Inter-Bold', letterSpacing: 1, marginTop: 5 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20, fontFamily: 'Inter-Regular', marginTop: 8 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(34,197,94,0.07)', marginTop: 18 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  statusText: { color: '#9CD9AE', fontSize: 9, fontFamily: 'Inter-SemiBold' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 13, paddingHorizontal: 2 },
  sectionKicker: { color: Colors.orange, fontSize: 8, fontFamily: 'Inter-Bold', letterSpacing: 1.3 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold', marginTop: 4 },
  sectionSeeAll: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#4A4650', borderRadius: 999, paddingHorizontal: 13, backgroundColor: '#343139' },
  sectionSeeAllText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 9 },
  dashboardLoading: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 22, backgroundColor: '#1B1B1F' }, dashboardLoadingText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10 }, dashboardMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, dashboardMetric: { width: '48%', minHeight: 112, flexGrow: 1, borderRadius: 22, padding: 16, backgroundColor: '#1B1B1F' }, dashboardMetricDot: { width: 8, height: 8, borderRadius: 4 }, dashboardMetricTitle: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.9, marginTop: 12 }, dashboardMetricValue: { fontFamily: 'Inter-Bold', fontSize: 18, marginTop: 7 },
  newOrdersBanner: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(56,189,248,0.16)', borderRadius: 22, padding: 13, backgroundColor: 'rgba(56,189,248,0.07)', marginTop: 11 }, newOrdersIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: 'rgba(56,189,248,0.11)' }, newOrdersCopy: { flex: 1 }, newOrdersValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 20 }, newOrdersLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 13, marginTop: 2 }, newOrdersButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 13, paddingHorizontal: 11, backgroundColor: '#1684B4' }, newOrdersButtonText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 9 },
  quickActions: { gap: 9 }, quickAction: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: 'transparent', borderRadius: 20, padding: 13, backgroundColor: '#1B1B1F' }, quickActionInvoice: { borderColor: '#F59E0B30', backgroundColor: '#211D17' }, quickActionCopy: { flex: 1 }, quickActionTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 }, quickActionText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 3 }, recentOrders: { overflow: 'hidden', borderRadius: 21, backgroundColor: '#1B1B1F' }, recentOrder: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#353137', paddingHorizontal: 14 }, recentOrderNumber: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 }, recentOrderMeta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 }, recentOrderRight: { alignItems: 'flex-end' }, recentOrderTotal: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 11 }, recentOrderStatus: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, marginTop: 4 }, recentOrderNew: { color: '#38BDF8' }, dashboardEmpty: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10, padding: 22, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '48%', minHeight: 188, flexGrow: 1, borderWidth: 0, borderRadius: 24, padding: 18, backgroundColor: '#1B1B1F' },
  cardIcon: { width: 46, height: 46, borderWidth: 0, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  cardTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-Bold' },
  cardDescription: { flex: 1, color: Colors.textSecondary, fontSize: 10, lineHeight: 15, fontFamily: 'Inter-Regular', marginTop: 5 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 },
  cardState: { fontSize: 8, fontFamily: 'Inter-Bold', letterSpacing: 1.1 },
  moreGroups: { gap: 24 },
  moreGroup: { gap: 10 },
  moreGroupHeader: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 3 },
  moreGroupIndex: { width: 28, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  moreGroupIndexText: { fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.5 },
  moreGroupTitle: { fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 1.25 },
  moreGroupLine: { flex: 1, height: StyleSheet.hairlineWidth },
  moreList: { gap: 9 },
  moreCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 20, padding: 13, backgroundColor: '#1B1B1F' },
  moreCardIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  moreCardCopy: { flex: 1, minWidth: 0 },
  moreCardTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 13 },
  moreCardDescription: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15, marginTop: 3 },
  moreCardArrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  soonBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: 'rgba(245,158,11,0.11)' },
  soonBadgeText: { color: '#F59E0B', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.7 },
  primaryEmpty: { minHeight: 280, alignItems: 'center', justifyContent: 'center', borderRadius: 26, padding: 28, backgroundColor: '#1B1B1F', marginTop: 16 },
  primaryEmptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  primaryEmptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16, textAlign: 'center' },
  primaryEmptyText: { maxWidth: 310, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7 },
  comingSoonPill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginTop: 17 },
  comingSoonText: { fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1 },
  spvContent: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 12, padding: 15 },
  spvHero: { minHeight: 310, justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#35527A', borderRadius: 30, padding: 24, backgroundColor: '#18202C' },
  spvGlow: { position: 'absolute', right: -70, top: -80, width: 230, height: 230, borderRadius: 115, borderWidth: 38, borderColor: '#60A5FA0D', backgroundColor: '#60A5FA08' },
  spvIcon: { width: 67, height: 67, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#60A5FA18', marginBottom: 18 },
  spvState: { position: 'absolute', right: 20, top: 20, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#A8C7FA12' },
  spvStateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#A8C7FA' },
  spvStateText: { color: '#A8C7FA', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.9 },
  spvKicker: { color: '#A8C7FA', fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 1.2 },
  spvTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 27, marginTop: 7 },
  spvText: { maxWidth: 520, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 19, marginTop: 10 },
  spvInfo: { flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: '#285341', borderRadius: 22, padding: 17, backgroundColor: '#17231E' },
  spvInfoCopy: { flex: 1 },
  spvInfoTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 },
  spvInfoText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 4 },
  bottomNavigation: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 6, paddingHorizontal: 4, backgroundColor: 'rgba(20,20,20,0.98)', shadowColor: '#000', shadowOpacity: 0.36, shadowRadius: 14, shadowOffset: { width: 0, height: -5 }, elevation: 18 },
  bottomNavigationItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  bottomNavigationIcon: { width: 38, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  bottomNavigationLabel: { color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 9 },
  bottomNavigationLabelActive: { color: Colors.orange, fontFamily: 'Inter-SemiBold' },
  headerAction: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orangeDim, borderWidth: 1, borderColor: Colors.orangeMid },
  catalogContent: { padding: 16 },
  catalogHero: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 19, borderRadius: 24, borderWidth: 0, backgroundColor: '#1D1B20' },
  catalogHeroIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  catalogHeroText: { flex: 1 },
  catalogKicker: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.2 },
  catalogTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 17, marginTop: 3 },
  catalogSubtitle: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15, marginTop: 4 },
  counter: { alignItems: 'center', minWidth: 52, padding: 9, borderRadius: 16, backgroundColor: '#27242A' },
  counterValue: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 18 },
  counterLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8 },
  tabs: { flexDirection: 'row', gap: 6, marginVertical: 16, padding: 5, borderRadius: 22, backgroundColor: '#1D1B20' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 18 },
  tabActive: { backgroundColor: Colors.orange },
  tabText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  tabTextActive: { color: Colors.white },
  stateBox: { minHeight: 230, alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 0, borderRadius: 24, backgroundColor: '#1D1B20' },
  stateText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 12 },
  errorText: { color: '#FCA5A5', fontFamily: 'Inter-Regular', fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
  retryButton: { borderRadius: 10, backgroundColor: Colors.orangeDim, paddingHorizontal: 14, paddingVertical: 9 },
  retryText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  tableCard: { overflow: 'hidden', borderWidth: 0, borderRadius: 24, backgroundColor: '#1D1B20' },
  tableWide: { minWidth: 770 },
  tableRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#353137', paddingHorizontal: 16 },
  tableHead: { minHeight: 46, backgroundColor: '#252329' },
  th: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8 },
  colImage: { width: 64 }, colName: { width: 255 }, colParent: { width: 190 }, colStatus: { width: 110 }, colActions: { width: 115 },
  colBrandName: { width: 260 }, colWebsite: { width: 280 },
  tableImage: { width: 42, height: 42, borderRadius: 11 },
  tableImageFallback: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  cellTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  cellSub: { color: Colors.orange, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 2 },
  cellDescription: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 2, maxWidth: 225 },
  cellText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11 },
  cellMuted: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tableAction: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 0, backgroundColor: 'rgba(56,189,248,0.11)' },
  tableActionDanger: { backgroundColor: 'rgba(239,68,68,0.11)' },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  badgeActive: { borderColor: 'rgba(34,197,94,0.22)', backgroundColor: 'rgba(34,197,94,0.07)' },
  badgeInactive: { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' },
  badgeDot: { width: 6, height: 6, borderRadius: 3 }, badgeText: { fontFamily: 'Inter-SemiBold', fontSize: 9 },
  emptyBox: { minHeight: 250, alignItems: 'center', justifyContent: 'center', borderWidth: 0, borderRadius: 24, backgroundColor: '#1D1B20' },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 14 },
  emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15 },
  emptyText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11, marginTop: 5 },
  fab: { position: 'absolute', right: 22, width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orange, shadowColor: '#000', shadowOpacity: 0.34, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.76)' },
  modalCard: { maxHeight: '91%', paddingHorizontal: 22, paddingTop: 22, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 0, backgroundColor: '#1D1B20' },
  brandModal: { maxHeight: '76%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalKicker: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.2 },
  modalTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 20, marginTop: 3 },
  closeButton: { width: 39, height: 39, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  fieldLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 0.8, marginBottom: 7, marginTop: 3 },
  fieldHint: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: -3, marginBottom: 7 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#49454F', borderRadius: 12, backgroundColor: 'transparent', color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 13, paddingHorizontal: 15, marginBottom: 18 },
  textarea: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  imagePicker: { width: 82, height: 82, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: Colors.cardBorder, borderStyle: 'dashed', backgroundColor: '#101010' },
  previewImage: { width: '100%', height: '100%' },
  imageActions: { flex: 1, alignItems: 'flex-start', gap: 9 },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 0, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 11, backgroundColor: Colors.orangeDim },
  secondaryButtonText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  removeImageText: { color: '#FCA5A5', fontFamily: 'Inter-SemiBold', fontSize: 9 },
  parentOptions: { gap: 7, paddingBottom: 16 },
  parentChip: { maxWidth: 220, borderWidth: 1, borderColor: '#49454F', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'transparent' },
  parentChipActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  parentChipText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  parentChipTextActive: { color: Colors.orange },
  switchRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.cardBorder, marginBottom: 18 },
  switchTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  saveButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 999, backgroundColor: Colors.orange, marginBottom: 4 },
  saveButtonText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 12 },
  buttonDisabled: { opacity: 0.58 },
  deleteBackdrop: { justifyContent: 'center', paddingHorizontal: 22 },
  deletePanel: { width: '100%', maxWidth: 440, alignSelf: 'center', alignItems: 'center', borderWidth: 0, borderRadius: 28, padding: 26, backgroundColor: '#1D1B20' },
  deleteIcon: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.errorDim, marginBottom: 14 },
  deleteKicker: { color: '#FCA5A5', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.2 },
  deleteTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 20, marginTop: 5 },
  deleteText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  deleteActions: { width: '100%', flexDirection: 'row', gap: 9, marginTop: 20 },
  cancelButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 0, borderRadius: 999, backgroundColor: '#2B292F' },
  cancelButtonText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  deleteButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, backgroundColor: Colors.error },
  deleteButtonText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 11 },
});
