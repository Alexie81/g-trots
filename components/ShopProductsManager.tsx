import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  GripVertical,
  ImagePlus,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import RichTextEditor from '@/components/RichTextEditor';
import ShopPagination from '@/components/ShopPagination';
import ShopProductPicture from '@/components/ShopProductPicture';
import {
  shopApi,
  ShopBrand,
  ShopCategory,
  ShopManufacturer,
  ShopProduct,
  ShopProductImage,
  ShopProductPayload,
  ShopProductQuestion,
  ShopProductReview,
  ShopProductSource,
  ShopProductSpecification,
  ShopProductStats,
} from '@/services/shopApi';

type EditorImage = ShopProductImage & { key: string; preview_uri: string };
type EditorSpecification = ShopProductSpecification & { key: string };
type EditorQuestion = ShopProductQuestion & { key: string };

const MOBILE_GALLERY_STEP = 182;

function DraggableGalleryImage({ image, index, total, isMain, onRemove, onMakeMain, onDrop, onDragStateChange }: {
  image: EditorImage;
  index: number;
  total: number;
  isMain: boolean;
  onRemove: () => void;
  onMakeMain: () => void;
  onDrop: (from: number, to: number) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const dragX = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const indexRef = useRef(index);
  const totalRef = useRef(total);
  const onDropRef = useRef(onDrop);
  const onDragStateRef = useRef(onDragStateChange);
  indexRef.current = index;
  totalRef.current = total;
  onDropRef.current = onDrop;
  onDragStateRef.current = onDragStateChange;

  const finishDrag = (dx: number, shouldReorder: boolean) => {
    const from = indexRef.current;
    const target = shouldReorder ? Math.max(0, Math.min(totalRef.current - 1, from + Math.round(dx / MOBILE_GALLERY_STEP))) : from;
    Animated.spring(dragX, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 5 }).start(() => {
      setDragging(false);
      onDragStateRef.current(false);
      if (target !== from) onDropRef.current(from, target);
    });
  };

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => { dragX.stopAnimation(); dragX.setValue(0); setDragging(true); onDragStateRef.current(true); },
    onPanResponderMove: (_event, gesture) => dragX.setValue(gesture.dx),
    onPanResponderRelease: (_event, gesture) => finishDrag(gesture.dx, true),
    onPanResponderTerminate: (_event, gesture) => finishDrag(gesture.dx, false),
    onShouldBlockNativeResponder: () => true,
  })).current;

  return <Animated.View {...panResponder.panHandlers} style={[styles.galleryCard, isMain && styles.galleryMain, dragging && styles.galleryDragging, { transform: [{ translateX: dragX }, { scale: dragging ? 1.035 : 1 }] }]}>
    <View style={styles.galleryPhoto}>
      <ShopProductPicture image={image} width={164} height={148} borderRadius={14} />
      <TouchableOpacity style={styles.galleryRemove} onPress={onRemove}><X size={16} color="#111" /></TouchableOpacity>
      {isMain ? <View style={styles.mainBadge}><Text style={styles.mainBadgeText}>PRINCIPALA</Text></View> : null}
    </View>
    <View style={styles.galleryFooter}>
      <View style={styles.dragHint}><GripVertical size={17} color={Colors.textMuted} /><Text style={styles.dragHintText}>Tine si trage</Text></View>
      <TouchableOpacity disabled={isMain} onPress={onMakeMain} style={[styles.makeMain, isMain && styles.makeMainActive]}><Star size={14} color={isMain ? Colors.orange : Colors.textSecondary} fill={isMain ? Colors.orange : 'transparent'} /><Text style={[styles.makeMainText, isMain && styles.makeMainTextActive]}>{isMain ? 'Principala' : 'Alege'}</Text></TouchableOpacity>
    </View>
  </Animated.View>;
}

type FormState = {
  id: string | null;
  source_id: string | null;
  source_domain: string;
  name: string;
  slug: string;
  sku: string;
  short_description: string;
  description_html: string;
  meta_title: string;
  meta_description: string;
  cost_price: string;
  price: string;
  discount_type: 'percent' | 'fixed';
  discount_value: string;
  category_id: string | null;
  manufacturer_id: string | null;
  brand_ids: string[];
  stock_mode: 'tracked' | 'unlimited';
  stock_quantity: string;
  low_stock_threshold: string;
  is_active: boolean;
  is_featured: boolean;
  images: EditorImage[];
  specifications: EditorSpecification[];
  questions: EditorQuestion[];
};

function emptyForm(): FormState {
  return {
    id: null,
    source_id: null,
    source_domain: 'g-trots.ro',
    name: '',
    slug: '',
    sku: '',
    short_description: '',
    description_html: '',
    meta_title: '',
    meta_description: '',
    cost_price: '0',
    price: '',
    discount_type: 'percent',
    discount_value: '',
    category_id: null,
    manufacturer_id: null,
    brand_ids: [],
    stock_mode: 'tracked',
    stock_quantity: '0',
    low_stock_threshold: '3',
    is_active: true,
    is_featured: false,
    images: [],
    specifications: [],
    questions: [],
  };
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

function skuFromName(value: string, domain = 'g-trots.ro') {
  const prefix = domain.includes('boomag') ? 'BOOM' : 'GT';
  const parts = slugify(value).split('-').filter(Boolean).slice(0, 4).map((part) => part.slice(0, 4).toUpperCase());
  return parts.length ? `${prefix}-${parts.join('-')}`.slice(0, 80) : '';
}

function money(value: number) {
  return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' lei';
}

export default function ShopProductsManager() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [brands, setBrands] = useState<ShopBrand[]>([]);
  const [manufacturers, setManufacturers] = useState<ShopManufacturer[]>([]);
  const [sources, setSources] = useState<ShopProductSource[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ShopProductStats | null>(null);
  const [reviewReplies, setReviewReplies] = useState<Record<string, string>>({});
  const [galleryDragging, setGalleryDragging] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [skuTouched, setSkuTouched] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const bootstrap = await shopApi.loadProductManager(token);
      setProducts(bootstrap.products);
      setCategories(bootstrap.categories);
      setBrands(bootstrap.brands);
      setManufacturers(bootstrap.manufacturers);
      setSources(bootstrap.sources);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Produsele nu au putut fi incarcate.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => `${product.name} ${product.sku || ''} ${product.category_name || ''}`.toLowerCase().includes(term));
  }, [products, query]);
  const pageSize = 20;
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const pagedProducts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const normalizedFormName = form.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ro-RO');
  const duplicateProductName = normalizedFormName
    ? products.find((product) => product.id !== form.id && product.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ro-RO') === normalizedFormName)
    : undefined;

  const patchForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openNew = () => {
    const next = emptyForm();
    const defaultSource = sources.find((source) => source.is_default && source.is_active) || sources.find((source) => source.is_active);
    if (defaultSource) {
      next.source_id = defaultSource.id;
      next.source_domain = defaultSource.domain;
    }
    setForm(next);
    setSlugTouched(false);
    setSkuTouched(false);
    setEditorVisible(true);
  };

  const openEdit = async (product: ShopProduct) => {
    if (!token) return;
    setSaving(true);
    try {
      const full = await shopApi.getProduct(token, product.id);
      setForm({
        id: full.id,
        source_id: full.source_id,
        source_domain: full.source_domain || 'g-trots.ro',
        name: full.name,
        slug: full.slug,
        sku: full.sku || '',
        short_description: full.short_description || '',
        description_html: full.description_html || '',
        meta_title: full.meta_title || '',
        meta_description: full.meta_description || '',
        cost_price: String(full.cost_price || 0),
        price: String(full.price),
        discount_type: full.discount_type || 'percent',
        discount_value: full.discount_value ? String(full.discount_value) : '',
        category_id: full.category_id,
        manufacturer_id: full.manufacturer_id,
        brand_ids: full.brand_ids || [],
        stock_mode: full.stock_mode,
        stock_quantity: String(full.stock_quantity),
        low_stock_threshold: String(full.low_stock_threshold),
        is_active: full.is_active,
        is_featured: full.is_featured,
        images: (full.images || []).map((image, index) => ({ ...image, key: image.id || `existing-${index}`, preview_uri: image.url || '' })),
        specifications: (full.specifications || []).map((item, index) => ({ ...item, key: `spec-${index}-${Date.now()}` })),
        questions: (full.questions || []).map((item, index) => ({ ...item, key: `question-${index}-${Date.now()}` })),
      });
      setSlugTouched(false);
      setSkuTouched(true);
      setEditorVisible(true);
    } catch (editError) {
      Alert.alert('Produs indisponibil', editError instanceof Error ? editError.message : 'Nu s-a putut deschide produsul.');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (product: ShopProduct) => {
    if (!token) return;
    setDetailVisible(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const next = await shopApi.getProductStats(token, product.id);
      setDetail(next);
      setReviewReplies(Object.fromEntries(next.reviews.map((review) => [review.id, review.admin_reply || ''])));
    } catch (detailError) {
      Alert.alert('Fisa indisponibila', detailError instanceof Error ? detailError.message : 'Nu s-a putut deschide fisa produsului.');
      setDetailVisible(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!token || !detail) return;
    const next = await shopApi.getProductStats(token, detail.product.id);
    setDetail(next);
    setReviewReplies(Object.fromEntries(next.reviews.map((review) => [review.id, review.admin_reply || ''])));
  };

  const saveReviewReply = async (review: ShopProductReview) => {
    if (!token) return;
    try {
      await shopApi.replyProductReview(token, review.id, reviewReplies[review.id] || '');
      await refreshDetail();
    } catch (replyError) {
      Alert.alert('Raspuns nesalvat', replyError instanceof Error ? replyError.message : 'Incearca din nou.');
    }
  };

  const removeReview = (review: ShopProductReview) => {
    if (!token) return;
    Alert.alert('Stergi recenzia?', 'Recenzia nu va mai fi vizibila pe site.', [
      { text: 'Renunta', style: 'cancel' },
      { text: 'Sterge', style: 'destructive', onPress: async () => { await shopApi.deleteProductReview(token, review.id); await refreshDetail(); } },
    ]);
  };

  const chooseImages = async () => {
    const remaining = 12 - form.images.length;
    if (remaining <= 0) {
      Alert.alert('Limita atinsa', 'Poti incarca maximum 12 imagini pentru un produs.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Acces necesar', 'Permite accesul la fotografii pentru a incarca imaginile produsului.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      orderedSelection: true,
      quality: 0.72,
      base64: true,
    });
    if (result.canceled) return;
    const added: EditorImage[] = result.assets
      .filter((asset) => Boolean(asset.base64))
      .slice(0, remaining)
      .map((asset, index) => ({
        key: `new-${Date.now()}-${index}`,
        preview_uri: asset.uri,
        base64: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`,
        alt_text: form.name || 'Produs G-Trots',
      }));
    patchForm('images', [...form.images, ...added]);
  };

  const reorderImages = (index: number, nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= form.images.length || index === nextIndex) return;
    const next = [...form.images];
    const [selected] = next.splice(index, 1);
    next.splice(nextIndex, 0, selected);
    patchForm('images', next);
  };

  const makePrimary = (index: number) => {
    if (index === 0) return;
    const next = [...form.images];
    const [selected] = next.splice(index, 1);
    next.unshift(selected);
    patchForm('images', next);
  };

  const save = async () => {
    if (!token || saving) return;
    if (duplicateProductName) {
      Alert.alert('Produs deja existent', 'Acest nume de produs exista deja. Alege un nume diferit.');
      return;
    }
    if (!form.name.trim() || !form.slug.trim() || !form.price.trim()) {
      Alert.alert('Campuri obligatorii', 'Completeaza numele, slug-ul si pretul produsului.');
      return;
    }
    const price = Number(form.price.replace(',', '.'));
    const costPrice = Number(form.cost_price.replace(',', '.'));
    const discountText = form.discount_value || '';
    const discount = discountText.trim() ? Number(discountText.replace(',', '.')) : 0;
    const discountType = form.discount_type || 'percent';
    const invalidDiscount = discountType === 'percent' ? discount >= 100 : discount >= price;
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(costPrice) || costPrice < 0 || !Number.isFinite(discount) || discount < 0 || (discount > 0 && invalidDiscount)) {
      Alert.alert('Valori invalide', 'Verifica pretul si reducerea produsului.');
      return;
    }
    const salePrice = discount > 0
      ? Math.round((discountType === 'percent' ? price * (1 - discount / 100) : price - discount) * 100) / 100
      : null;
    const payload: ShopProductPayload = {
      category_id: form.category_id,
      manufacturer_id: form.manufacturer_id,
      brand_ids: form.brand_ids,
      sku: form.sku.trim(),
      source_domain: form.source_domain,
      source_id: form.source_id,
      source_url: '',
      name: form.name.trim(),
      slug: form.slug.trim(),
      short_description: form.short_description.trim(),
      description_html: form.description_html,
      meta_title: form.meta_title.trim(),
      meta_description: form.meta_description.trim(),
      cost_price: costPrice,
      price,
      sale_price: salePrice,
      discount_type: discountType,
      discount_value: discount || null,
      discount_percent: discountType === 'percent' ? discount || null : null,
      currency: 'RON',
      stock_mode: form.stock_mode,
      stock_quantity: Math.max(0, Number.parseInt(form.stock_quantity || '0', 10) || 0),
      low_stock_threshold: Math.max(0, Number.parseInt(form.low_stock_threshold || '0', 10) || 0),
      is_active: form.is_active,
      is_featured: form.is_featured,
      images: form.images.map(({ id, base64, alt_text }, index) => ({ id, base64, alt_text: alt_text || form.name.trim(), sort_order: index })),
      specifications: form.specifications.map(({ group, label, value }) => ({ group: group.trim(), label: label.trim(), value: value.trim() })),
      questions: form.questions.map(({ question, answer }) => ({ question: question.trim(), answer: answer.trim() })),
    };
    setSaving(true);
    try {
      const saved = form.id
        ? await shopApi.updateProduct(token, form.id, payload)
        : await shopApi.createProduct(token, payload);
      setEditorVisible(false);
      await load(true);
      if (saved.stripe_sync_status === 'error') {
        Alert.alert('Produs salvat in catalog', `Produsul este salvat, dar oglinda Stripe nu s-a actualizat: ${saved.stripe_sync_error || 'sincronizarea va trebui reincercata.'}`);
      }
    } catch (saveError) {
      Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Incearca din nou.');
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = (product: ShopProduct) => {
    if (!token) return;
    Alert.alert('Stergi produsul definitiv?', `„${product.name}” va fi eliminat din catalog, iar toate pozele incarcate pentru el vor fi sterse de pe server.`, [
      { text: 'Renunta', style: 'cancel' },
      {
        text: 'Sterge', style: 'destructive', onPress: async () => {
          try { await shopApi.deleteProduct(token, product.id); await load(true); }
          catch (deleteError) { Alert.alert('Nu s-a putut sterge', deleteError instanceof Error ? deleteError.message : 'Incearca din nou.'); }
        },
      },
    ]);
  };

  const priceValue = Number(form.price.replace(',', '.')) || 0;
  const discountType = form.discount_type || 'percent';
  const discountValue = Number((form.discount_value || '').replace(',', '.')) || 0;
  const reducedPrice = discountValue > 0
    ? Math.max(0, discountType === 'percent' ? priceValue * (1 - discountValue / 100) : priceValue - discountValue)
    : null;
  const seoTitle = form.meta_title.trim() || form.name.trim() || 'Titlul produsului';
  const seoDescription = form.meta_description.trim() || form.short_description.trim() || 'Descrierea produsului va aparea aici.';

  if (loading) return <View style={styles.state}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se incarca produsele...</Text></View>;
  if (error) return <View style={styles.state}><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.retry} onPress={() => void load()}><Text style={styles.retryText}>Incearca din nou</Text></TouchableOpacity></View>;

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <View style={styles.search}><Search size={17} color={Colors.textMuted} /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Cauta produs sau SKU" placeholderTextColor={Colors.textMuted} style={styles.searchInput} /></View>
        <TouchableOpacity style={styles.refresh} onPress={() => void load()}><RefreshCw size={18} color={Colors.textSecondary} /></TouchableOpacity>
        <TouchableOpacity style={styles.add} onPress={openNew}><Plus size={19} color={Colors.white} /><Text style={styles.addText}>Produs</Text></TouchableOpacity>
      </View>
      <View style={styles.summary}><Text style={styles.summaryLabel}>PRODUSE</Text><Text style={styles.summaryValue}>{filtered.length}</Text></View>
      {filtered.length ? pagedProducts.map((product) => (
        <View key={product.id} style={styles.productCard}>
          <TouchableOpacity style={styles.productMain} activeOpacity={0.72} onPress={() => void openDetail(product)}>
            {product.images?.[0]?.url ? <ShopProductPicture image={product.images[0]} width={66} height={66} borderRadius={14} /> : <View style={styles.productImageFallback}><Package size={25} color={Colors.textMuted} /></View>}
            <View style={styles.productCopy}>
              <View style={styles.productTitleRow}><Text numberOfLines={1} style={styles.productName}>{product.name}</Text>{product.is_featured ? <Star size={13} color="#F59E0B" fill="#F59E0B" /> : null}</View>
              <Text style={styles.productMeta}>{product.sku || 'Fara SKU'} · {product.source_domain}</Text>
              <View style={styles.productBottom}>
                <Text style={styles.productPrice}>{money(product.sale_price ?? product.price)}</Text>
                <Text style={[styles.stock, product.stock_mode === 'tracked' && product.stock_quantity <= product.low_stock_threshold && styles.stockLow]}>{product.stock_mode === 'unlimited' ? 'Nelimitat' : `${product.stock_quantity} buc.`}</Text>
              </View>
            </View>
            <ChevronRight size={17} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconAction} onPress={() => void openEdit(product)}><Pencil size={17} color="#38BDF8" /></TouchableOpacity>
          <TouchableOpacity style={[styles.iconAction, styles.deleteAction]} onPress={() => removeProduct(product)}><Trash2 size={17} color={Colors.error} /></TouchableOpacity>
        </View>
      )) : <View style={styles.empty}><Package size={32} color="#A78BFA" /><Text style={styles.emptyTitle}>Niciun produs</Text><Text style={styles.emptyText}>Adauga primul produs pentru a-l publica pe site.</Text></View>}
      <ShopPagination page={safePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />

      <Modal visible={detailVisible} animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <SafeAreaView style={styles.editorSafe} edges={['top', 'bottom']}>
          <View style={styles.editorHeader}>
            <TouchableOpacity style={styles.close} onPress={() => setDetailVisible(false)}><X size={21} color={Colors.textSecondary} /></TouchableOpacity>
            <View style={styles.editorHeaderCopy}><Text style={styles.editorKicker}>FISA PRODUSULUI</Text><Text numberOfLines={1} style={styles.editorTitle}>{detail?.product.name || 'Se incarca...'}</Text></View>
            {detail ? <TouchableOpacity style={styles.saveTop} onPress={() => { setDetailVisible(false); void openEdit(detail.product); }}><Pencil size={17} color={Colors.white} /><Text style={styles.saveTopText}>Editeaza</Text></TouchableOpacity> : null}
          </View>
          {detailLoading || !detail ? <View style={styles.detailLoading}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se incarca fisa produsului...</Text></View> : <ScrollView contentContainerStyle={[styles.detailContent, { paddingBottom: Math.max(insets.bottom, 24) + 30 }]} showsVerticalScrollIndicator={false}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.detailGallery}>{detail.product.images.map((image, index) => <View key={image.id || index} style={styles.detailImage}><ShopProductPicture image={image} width={210} height={190} borderRadius={20} />{index === 0 ? <View style={styles.mainBadge}><Text style={styles.mainBadgeText}>PRINCIPALA</Text></View> : null}</View>)}</ScrollView>
            <View style={styles.metricGrid}>
              <Metric label="VANZARI" value={money(detail.revenue)} />
              <Metric label="COMENZI" value={String(detail.orders_count)} />
              <Metric label="BUCATI VANDUTE" value={String(detail.units_sold)} />
              <Metric label="VIZUALIZARI SITE" value={String(detail.product.view_count)} icon="eye" />
              <Metric label="PRET ACHIZITIE" value={money(detail.product.cost_price)} />
              <Metric label="PRET VANZARE" value={money(detail.product.sale_price ?? detail.product.price)} />
              <Metric label="PROFIT ESTIMAT" value={money(detail.profit)} accent />
              <Metric label="RECENZII" value={`${detail.reviews.length}${detail.product.review_average ? ` · ${detail.product.review_average.toFixed(1)}★` : ''}`} />
            </View>
            <SectionTitle number="01" title="Comenzi si vanzari" text="Comenzile in care apare acest produs." />
            {detail.orders.length ? detail.orders.map((order) => {
              const acquisitionPrice = Number(detail.product.cost_price || 0);
              const salePrice = Number(order.unit_price || 0);
              const orderProfit = Number(order.line_total || 0) - (acquisitionPrice * Number(order.quantity || 0));
              return <View key={order.id} style={styles.saleCard}>
                <View style={styles.saleHead}><View><Text style={styles.saleLabel}>NUMAR COMANDA</Text><Text style={styles.saleNumber}>{order.order_number}</Text></View><View style={styles.saleStatus}><Text style={styles.saleStatusText}>{order.status}</Text></View></View>
                <Text style={styles.saleMeta}>{order.customer_name} · {order.created_at} · {order.quantity} buc.</Text>
                <View style={styles.saleStats}>
                  <View style={styles.saleStat}><Text style={styles.saleLabel}>PRET ACHIZITIE</Text><Text style={styles.saleValue}>{money(acquisitionPrice)}</Text></View>
                  <View style={styles.saleStat}><Text style={styles.saleLabel}>PRET VANZARE</Text><Text style={styles.saleValue}>{money(salePrice)}</Text></View>
                  <View style={styles.saleStat}><Text style={styles.saleLabel}>PROFIT</Text><Text style={styles.saleProfit}>{money(orderProfit)}</Text></View>
                </View>
              </View>;
            }) : <Text style={styles.detailEmpty}>Produsul nu apare in nicio comanda.</Text>}
            <SectionTitle number="02" title="Recenzii" text="Raspunde clientilor sau sterge recenziile direct de aici." />
            {detail.reviews.length ? detail.reviews.map((review) => <View key={review.id} style={styles.reviewCard}><View style={styles.reviewHead}><View><Text style={styles.reviewName}>{review.customer_name}</Text><Text style={styles.reviewMeta}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)} · {review.created_at}</Text></View><TouchableOpacity style={styles.reviewDelete} onPress={() => removeReview(review)}><Trash2 size={16} color={Colors.error} /></TouchableOpacity></View><Text style={styles.reviewMessage}>{review.message}</Text><TextInput value={reviewReplies[review.id] || ''} onChangeText={(value) => setReviewReplies((current) => ({ ...current, [review.id]: value }))} placeholder="Scrie raspunsul magazinului..." placeholderTextColor={Colors.textMuted} multiline style={styles.reviewReply} /><TouchableOpacity style={styles.reviewSave} onPress={() => void saveReviewReply(review)}><MessageSquare size={15} color={Colors.white} /><Text style={styles.reviewSaveText}>Salveaza raspunsul</Text></TouchableOpacity></View>) : <Text style={styles.detailEmpty}>Produsul nu are inca recenzii.</Text>}
          </ScrollView>}
        </SafeAreaView>
      </Modal>

      <Modal visible={editorVisible} animationType="slide" onRequestClose={() => !saving && setEditorVisible(false)}>
        <SafeAreaView style={styles.editorSafe} edges={['top', 'bottom']}>
          <View style={styles.editorHeader}>
            <TouchableOpacity style={styles.close} onPress={() => setEditorVisible(false)} disabled={saving}><X size={21} color={Colors.textSecondary} /></TouchableOpacity>
            <View style={styles.editorHeaderCopy}><Text style={styles.editorKicker}>CRM PRODUSE</Text><Text style={styles.editorTitle}>{form.id ? 'Editeaza produsul' : 'Produs nou'}</Text></View>
            <TouchableOpacity style={[styles.saveTop, saving && styles.disabled]} onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={17} color={Colors.white} /><Text style={styles.saveTopText}>Salveaza</Text></>}</TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={[styles.form, { paddingBottom: Math.max(insets.bottom, 24) + 36 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <SectionTitle number="01" title="Sursa si identitate" text="Alege provenienta produsului si adresa lui publica." />
            <Text style={styles.label}>SURSA PRODUSULUI</Text>
            <View style={styles.sourceRow}>{sources.filter((source) => source.is_active || (Boolean(form.id) && source.id === form.source_id)).map((source) => <Choice key={source.id} label={`${source.name} · ${source.domain}${source.is_default ? ' (implicita)' : ''}${!source.is_active ? ' · ascunsa pe site' : ''}`} selected={form.source_id === source.id} onPress={() => { patchForm('source_id', source.id); patchForm('source_domain', source.domain); if (!skuTouched) patchForm('sku', skuFromName(form.name, source.domain)); }} />)}</View>
            <Field label="NUME PRODUS *" value={form.name} onChangeText={(value) => { patchForm('name', value); if (!slugTouched) patchForm('slug', slugify(value)); if (!skuTouched) patchForm('sku', skuFromName(value, form.source_domain)); }} placeholder="Ex: Anvelopa G10 All-Terrain" error={duplicateProductName ? 'Acest nume de produs exista deja.' : undefined} />
            <Field label="SLUG *" value={form.slug} onChangeText={(value) => { setSlugTouched(true); patchForm('slug', slugify(value)); }} placeholder="anvelopa-g10-all-terrain" autoCapitalize="none" prefix="g-trots.ro/magazin/produs/" />
            <Field label="SKU / COD PRODUS" value={form.sku} onChangeText={(value) => { setSkuTouched(true); patchForm('sku', value.toUpperCase()); }} placeholder="Se genereaza automat" autoCapitalize="characters" />

            <SectionTitle number="02" title="Galerie foto" text="Incarca pana la 12 poze. Tine de o fotografie si trage-o in pozitia dorita." />
            <ScrollView horizontal scrollEnabled={!galleryDragging} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
              {form.images.map((image, index) => <DraggableGalleryImage key={image.key} image={image} index={index} total={form.images.length} isMain={index === 0} onRemove={() => patchForm('images', form.images.filter((_, imageIndex) => imageIndex !== index))} onMakeMain={() => makePrimary(index)} onDrop={reorderImages} onDragStateChange={setGalleryDragging} />)}
              {form.images.length < 12 ? <TouchableOpacity style={styles.imageAdd} onPress={() => void chooseImages()}><View style={styles.imageAddIcon}><ImagePlus size={25} color={Colors.orange} /></View><Text style={styles.imageAddText}>Adauga fotografii</Text><Text style={styles.imageCount}>{form.images.length} din 12</Text></TouchableOpacity> : null}
            </ScrollView>

            <SectionTitle number="03" title="Descriere" text="Formatarea si stilurile lipite din alte pagini sunt pastrate." />
            <Field label="DESCRIERE SCURTA" value={form.short_description} onChangeText={(value) => patchForm('short_description', value)} placeholder="Rezumatul afisat in liste si in Google" multiline />
            <Text style={styles.label}>DESCRIERE COMPLETA</Text>
            <RichTextEditor value={form.description_html} onChange={(value) => patchForm('description_html', value)} />

            <SectionTitle number="04" title="Specificatii" text="Fiecare produs poate avea propriile grupe si caracteristici." />
            <TouchableOpacity style={styles.inlineAdd} onPress={() => patchForm('specifications', [...form.specifications, { key: `spec-${Date.now()}`, group: 'Caracteristici generale', label: '', value: '' }])}><Plus size={16} color={Colors.orange} /><Text style={styles.inlineAddText}>Adauga specificatie</Text></TouchableOpacity>
            {form.specifications.map((specification, index) => <View key={specification.key} style={styles.subEditorCard}><View style={styles.subEditorHead}><Text style={styles.subEditorTitle}>SPECIFICATIE {index + 1}</Text><TouchableOpacity onPress={() => patchForm('specifications', form.specifications.filter((item) => item.key !== specification.key))}><Trash2 size={16} color={Colors.error} /></TouchableOpacity></View><Field label="GRUPA" value={specification.group} onChangeText={(value) => patchForm('specifications', form.specifications.map((item) => item.key === specification.key ? { ...item, group: value } : item))} placeholder="Caracteristici generale" /><Field label="DENUMIRE" value={specification.label} onChangeText={(value) => patchForm('specifications', form.specifications.map((item) => item.key === specification.key ? { ...item, label: value } : item))} placeholder="Ex: Greutate" /><Field label="VALOARE" value={specification.value} onChangeText={(value) => patchForm('specifications', form.specifications.map((item) => item.key === specification.key ? { ...item, value } : item))} placeholder="Ex: 1,2 kg" multiline /></View>)}

            <SectionTitle number="05" title="Intrebari si raspunsuri" text="Sunt afisate numai pe pagina acestui produs." />
            <TouchableOpacity style={styles.inlineAdd} onPress={() => patchForm('questions', [...form.questions, { key: `question-${Date.now()}`, question: '', answer: '' }])}><Plus size={16} color={Colors.orange} /><Text style={styles.inlineAddText}>Adauga intrebare</Text></TouchableOpacity>
            {form.questions.map((question, index) => <View key={question.key} style={styles.subEditorCard}><View style={styles.subEditorHead}><Text style={styles.subEditorTitle}>INTREBARE {index + 1}</Text><TouchableOpacity onPress={() => patchForm('questions', form.questions.filter((item) => item.key !== question.key))}><Trash2 size={16} color={Colors.error} /></TouchableOpacity></View><Field label="INTREBARE" value={question.question} onChangeText={(value) => patchForm('questions', form.questions.map((item) => item.key === question.key ? { ...item, question: value } : item))} placeholder="Intrebarea clientului" multiline /><Field label="RASPUNS" value={question.answer} onChangeText={(value) => patchForm('questions', form.questions.map((item) => item.key === question.key ? { ...item, answer: value } : item))} placeholder="Raspunsul magazinului" multiline /></View>)}

            <SectionTitle number="06" title="Pret si reducere" text="Configureaza pretul de vanzare si reducerea afisata pe site." />
            <Text style={styles.label}>TIP REDUCERE</Text>
            <View style={styles.sourceRow}>
              <Choice label="Procent (%)" selected={discountType === 'percent'} onPress={() => patchForm('discount_type', 'percent')} />
              <Choice label="Suma fixa (lei)" selected={discountType === 'fixed'} onPress={() => patchForm('discount_type', 'fixed')} />
            </View>
            <Field label="PRET VANZARE *" value={form.price} onChangeText={(value) => patchForm('price', value)} placeholder="0,00" keyboardType="decimal-pad" />
            <Field label={discountType === 'percent' ? 'REDUCERE %' : 'REDUCERE LEI'} value={form.discount_value || ''} onChangeText={(value) => patchForm('discount_value', value)} placeholder="0" keyboardType="decimal-pad" />
            <View style={styles.nirNote}><Text style={styles.nirNoteTitle}>Costul de achizitie nu se introduce manual.</Text><Text style={styles.nirNoteText}>Va fi calculat automat din NIR-uri si facturile de intrare, deoarece poate varia la fiecare receptie.</Text></View>
            {reducedPrice !== null ? <View style={styles.pricePreview}><Text style={styles.oldPrice}>{money(priceValue)}</Text><Text style={styles.newPrice}>{money(reducedPrice)}</Text><Text style={styles.discountBadge}>{discountType === 'percent' ? `-${discountValue}%` : `-${money(discountValue)}`}</Text></View> : null}

            <SectionTitle number="07" title="Catalog si compatibilitate" text="Leaga produsul de structura magazinului." />
            <Text style={styles.label}>CATEGORIE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}><Choice label="Fara categorie" selected={!form.category_id} onPress={() => patchForm('category_id', null)} />{categories.map((item) => <Choice key={item.id} label={item.name} selected={form.category_id === item.id} onPress={() => patchForm('category_id', item.id)} />)}</ScrollView>
            <Text style={styles.label}>PRODUCATOR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}><Choice label="Fara producator" selected={!form.manufacturer_id} onPress={() => patchForm('manufacturer_id', null)} />{manufacturers.map((item) => <Choice key={item.id} label={item.name} selected={form.manufacturer_id === item.id} onPress={() => patchForm('manufacturer_id', item.id)} />)}</ScrollView>
            <Text style={styles.label}>COMPATIBILITATI</Text>
            <MultiSelectDropdown items={brands} selectedIds={form.brand_ids} onChange={(ids) => patchForm('brand_ids', ids)} />

            <SectionTitle number="08" title="Stoc" text="Alege stoc online nelimitat sau cantitate urmarita automat." />
            <View style={styles.sourceRow}><Choice label="Stoc cu numar" selected={form.stock_mode === 'tracked'} onPress={() => patchForm('stock_mode', 'tracked')} /><Choice label="Stoc nelimitat" selected={form.stock_mode === 'unlimited'} onPress={() => patchForm('stock_mode', 'unlimited')} /></View>
            {form.stock_mode === 'tracked' ? <View style={styles.twoColumns}><View style={styles.column}><Field label="CANTITATE" value={form.stock_quantity} onChangeText={(value) => patchForm('stock_quantity', value)} placeholder="0" keyboardType="number-pad" /></View><View style={styles.column}><Field label="ALERTA SUB" value={form.low_stock_threshold} onChangeText={(value) => patchForm('low_stock_threshold', value)} placeholder="3" keyboardType="number-pad" /></View></View> : null}

            <SectionTitle number="09" title="SEO si Google" text="Controleaza titlul si descrierea din rezultatele cautarii." />
            <Field label="META TITLU" value={form.meta_title} onChangeText={(value) => patchForm('meta_title', value)} placeholder={form.name || 'Titlul produsului'} />
            <Field label="META DESCRIERE" value={form.meta_description} onChangeText={(value) => patchForm('meta_description', value)} placeholder="Descriere pentru Google" multiline />
            <View style={styles.googlePreview}>
              {form.images[0]?.preview_uri ? <ShopProductPicture image={form.images[0]} width={78} height={78} borderRadius={10} /> : null}
              <View style={styles.googleCopy}><Text style={styles.googleSite}>G-Trots · g-trots.ro</Text><Text numberOfLines={2} style={styles.googleTitle}>{seoTitle}</Text><Text numberOfLines={3} style={styles.googleDescription}>{seoDescription}</Text><Text style={styles.googleUrl}>https://g-trots.ro/magazin/produs/{form.slug || 'slug-produs'}</Text></View>
            </View>

            <View style={styles.toggleCard}><View><Text style={styles.toggleTitle}>Produs activ</Text><Text style={styles.toggleText}>Este vizibil si poate fi comandat pe site.</Text></View><Switch value={form.is_active} onValueChange={(value) => patchForm('is_active', value)} trackColor={{ false: '#39363D', true: Colors.orangeMid }} thumbColor={form.is_active ? Colors.orange : '#8A8A8A'} /></View>
            <View style={styles.toggleCard}><View><Text style={styles.toggleTitle}>Produs recomandat</Text><Text style={styles.toggleText}>Apare prioritar in magazin.</Text></View><Switch value={form.is_featured} onValueChange={(value) => patchForm('is_featured', value)} trackColor={{ false: '#39363D', true: '#F59E0B55' }} thumbColor={form.is_featured ? '#F59E0B' : '#8A8A8A'} /></View>
            <TouchableOpacity style={[styles.saveBottom, saving && styles.disabled]} onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={19} color={Colors.white} /><Text style={styles.saveBottomText}>Salveaza produsul</Text></>}</TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function SectionTitle({ number, title, text }: { number: string; title: string; text: string }) {
  return <View style={styles.sectionTitle}><Text style={styles.sectionNumber}>{number}</Text><View><Text style={styles.sectionName}>{title}</Text><Text style={styles.sectionText}>{text}</Text></View></View>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity style={[styles.choice, selected && styles.choiceActive]} onPress={onPress}>{selected ? <Check size={13} color={Colors.orange} /> : null}<Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{label}</Text></TouchableOpacity>;
}

function MultiSelectDropdown({ items, selectedIds, onChange }: { items: ShopBrand[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const selectedNames = items.filter((item) => selectedIds.includes(item.id)).map((item) => item.name);
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]);
  return <View style={styles.multiSelect}>
    <TouchableOpacity style={[styles.multiSelectButton, open && styles.multiSelectButtonOpen]} onPress={() => setOpen((current) => !current)} disabled={!items.length}>
      <Text numberOfLines={1} style={[styles.multiSelectValue, !selectedNames.length && styles.multiSelectPlaceholder]}>{selectedNames.length ? selectedNames.join(', ') : items.length ? 'Alege marcile compatibile' : 'Nu exista marci disponibile'}</Text>
      <ChevronDown size={18} color={Colors.orange} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
    </TouchableOpacity>
    {open ? <View style={styles.multiSelectOptions}>{items.map((item) => {
      const selected = selectedIds.includes(item.id);
      return <TouchableOpacity key={item.id} style={styles.multiSelectOption} onPress={() => toggle(item.id)}><View style={[styles.multiSelectCheck, selected && styles.multiSelectCheckActive]}>{selected ? <Check size={13} color={Colors.white} /> : null}</View><Text style={[styles.multiSelectOptionText, selected && styles.multiSelectOptionTextActive]}>{item.name}</Text></TouchableOpacity>;
    })}</View> : null}
  </View>;
}

function Field({ label, prefix, multiline, error, ...props }: React.ComponentProps<typeof TextInput> & { label: string; prefix?: string; error?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}<TextInput {...props} multiline={multiline} placeholderTextColor={Colors.textMuted} style={[styles.input, multiline && styles.textarea, prefix && styles.inputWithPrefix, Boolean(error) && styles.inputError]} />{error ? <Text style={styles.fieldError}>{error}</Text> : null}</View>;
}

function Metric({ label, value, accent, icon }: { label: string; value: string; accent?: boolean; icon?: 'eye' }) {
  return <View style={[styles.metricCard, accent && styles.metricCardAccent]}><View style={styles.metricLabelRow}>{icon === 'eye' ? <Eye size={13} color={Colors.orange} /> : null}<Text style={styles.metricLabel}>{label}</Text></View><Text numberOfLines={1} style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 24, backgroundColor: '#1B1B1F', marginTop: 16 },
  stateText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11 },
  error: { color: '#FCA5A5', fontFamily: 'Inter-Regular', fontSize: 11, textAlign: 'center', paddingHorizontal: 22 },
  retry: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: Colors.orangeDim }, retryText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  search: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, paddingHorizontal: 12, backgroundColor: '#1B1B1F' },
  searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11 },
  refresh: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#1B1B1F' },
  add: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 15, paddingHorizontal: 13, backgroundColor: Colors.orange }, addText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 10 },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginVertical: 10, paddingHorizontal: 3 }, summaryLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1 }, summaryValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16 },
  productCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 19, padding: 10, backgroundColor: '#1B1B1F', marginBottom: 8 },
  productMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  productImage: { width: 66, height: 66, borderRadius: 14, backgroundColor: '#111' }, productImageFallback: { width: 66, height: 66, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#27242A' },
  productCopy: { flex: 1, minWidth: 0 }, productTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, productName: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 }, productMeta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 }, productBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 9 }, productPrice: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 11 }, stock: { color: '#9CD9AE', fontFamily: 'Inter-SemiBold', fontSize: 8 }, stockLow: { color: '#FCA5A5' },
  iconAction: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(56,189,248,0.11)' }, deleteAction: { backgroundColor: 'rgba(239,68,68,0.10)' },
  empty: { minHeight: 230, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#1B1B1F' }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 13 }, emptyText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 5 },
  editorSafe: { flex: 1, backgroundColor: Colors.bg }, editorHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#29272B', paddingHorizontal: 12, backgroundColor: '#171513' }, close: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#27242A' }, editorHeaderCopy: { flex: 1 }, editorKicker: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 1 }, editorTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16, marginTop: 2 }, saveTop: { minWidth: 96, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, backgroundColor: Colors.orange }, saveTopText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 9 }, disabled: { opacity: 0.55 },
  form: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: 16 },
  detailLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, detailContent: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: 16 }, detailGallery: { gap: 10, paddingBottom: 12 }, detailImage: { width: 210, height: 190, overflow: 'hidden', borderRadius: 20, backgroundColor: '#211F24' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 8 }, metricCard: { width: '48%', minHeight: 82, justifyContent: 'space-between', borderWidth: 1, borderColor: '#343137', borderRadius: 17, padding: 13, backgroundColor: '#1B1B1F' }, metricCardAccent: { borderColor: 'rgba(34,197,94,0.35)', backgroundColor: 'rgba(34,197,94,0.07)' }, metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, metricLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.6 }, metricValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16, marginTop: 8 }, metricValueAccent: { color: '#9CD9AE' },
  saleCard: { marginTop: 10, padding: 14, borderRadius: 16, backgroundColor: '#201E23', borderWidth: 1, borderColor: '#343137' }, saleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, saleLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.6 }, saleNumber: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 3 }, saleMeta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 6 }, saleStatus: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#33251C' }, saleStatusText: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 7, textTransform: 'uppercase' }, saleStats: { flexDirection: 'row', gap: 7, marginTop: 12 }, saleStat: { flex: 1, minWidth: 0, padding: 9, borderRadius: 11, backgroundColor: '#17161A' }, saleValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10, marginTop: 5 }, saleProfit: { color: '#28D16F', fontFamily: 'Inter-Bold', fontSize: 10, marginTop: 5 }, detailEmpty: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10, paddingVertical: 18 },
  reviewCard: { borderWidth: 1, borderColor: '#37343B', borderRadius: 18, padding: 14, backgroundColor: '#1B1B1F', marginBottom: 10 }, reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, reviewName: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 }, reviewMeta: { color: '#F59E0B', fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 }, reviewDelete: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(239,68,68,0.1)' }, reviewMessage: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginVertical: 12 }, reviewReply: { minHeight: 74, borderWidth: 1, borderColor: '#49454F', borderRadius: 13, padding: 11, color: Colors.textPrimary, backgroundColor: '#161519', fontFamily: 'Inter-Regular', fontSize: 10, textAlignVertical: 'top' }, reviewSave: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: Colors.orange, marginTop: 8 }, reviewSaveText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 9 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, borderTopColor: '#2D2A30', paddingTop: 20, marginTop: 12, marginBottom: 16 }, sectionNumber: { width: 38, height: 38, textAlign: 'center', textAlignVertical: 'center', borderRadius: 12, color: Colors.orange, backgroundColor: Colors.orangeDim, fontFamily: 'Inter-Bold', fontSize: 10 }, sectionName: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15 }, sectionText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 2, maxWidth: 650 },
  inlineAdd: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: 'rgba(255,107,0,0.28)', borderRadius: 14, backgroundColor: Colors.orangeDim, marginBottom: 10 }, inlineAddText: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 10 }, subEditorCard: { borderWidth: 1, borderColor: '#37343B', borderRadius: 17, padding: 13, backgroundColor: '#1B1B1F', marginBottom: 10 }, subEditorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, subEditorTitle: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8 },
  label: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8, marginBottom: 7 }, sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }, choices: { gap: 7, paddingBottom: 15 }, choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 15 }, choice: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#413D45', borderRadius: 999, paddingHorizontal: 13, backgroundColor: '#1B1B1F' }, choiceActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim }, choiceText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 9 }, choiceTextActive: { color: Colors.orange },
  field: { marginBottom: 15 }, input: { minHeight: 50, borderWidth: 1, borderColor: '#49454F', borderRadius: 13, paddingHorizontal: 14, color: Colors.textPrimary, backgroundColor: '#161519', fontFamily: 'Inter-Regular', fontSize: 12 }, inputError: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.055)' }, fieldError: { marginTop: 6, color: '#FF6B72', fontFamily: 'Inter-SemiBold', fontSize: 9 }, textarea: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' }, prefix: { position: 'absolute', zIndex: 2, left: 14, top: 35, color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10 }, inputWithPrefix: { paddingLeft: 150 },
  gallery: { gap: 12, paddingBottom: 10, paddingRight: 16 }, galleryCard: { width: 180, height: 214, padding: 7, borderWidth: 1, borderColor: '#3B373E', borderRadius: 20, backgroundColor: '#211F24' }, galleryMain: { borderColor: Colors.orange }, galleryDragging: { zIndex: 20, elevation: 14, opacity: 0.88, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }, galleryPhoto: { width: 164, height: 148, overflow: 'hidden', borderRadius: 14, backgroundColor: '#F4F3F1' }, galleryRemove: { position: 'absolute', top: 7, right: 7, width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.95)' }, mainBadge: { position: 'absolute', left: 7, bottom: 7, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.95)' }, mainBadgeText: { color: '#111', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.5 }, galleryFooter: { height: 51, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, paddingHorizontal: 2 }, dragHint: { flexDirection: 'row', alignItems: 'center', gap: 2 }, dragHintText: { color: Colors.textMuted, fontFamily: 'Inter-SemiBold', fontSize: 7 }, makeMain: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#48434B', borderRadius: 9, paddingHorizontal: 7, backgroundColor: '#2B282E' }, makeMainActive: { borderColor: 'rgba(255,107,0,0.3)', backgroundColor: Colors.orangeDim }, makeMainText: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 7 }, makeMainTextActive: { color: Colors.orange }, imageAdd: { width: 180, height: 214, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#57515B', borderStyle: 'dashed', borderRadius: 20, backgroundColor: '#161519' }, imageAddIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.orangeDim }, imageAddText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10, marginTop: 11 }, imageCount: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 },
  twoColumns: { flexDirection: 'row', gap: 9 }, column: { flex: 1 }, pricePreview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14, backgroundColor: '#1B1B1F', marginBottom: 10 }, oldPrice: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 11, textDecorationLine: 'line-through' }, newPrice: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 16 }, discountBadge: { color: '#9CD9AE', fontFamily: 'Inter-Bold', fontSize: 9 },
  nirNote: { marginBottom: 10, borderWidth: 1, borderColor: 'rgba(56,189,248,0.18)', borderRadius: 15, padding: 13, backgroundColor: 'rgba(56,189,248,0.055)' }, nirNoteTitle: { color: '#7DD3FC', fontFamily: 'Inter-Bold', fontSize: 10 }, nirNoteText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14, marginTop: 4 },
  multiSelect: { marginBottom: 16 }, multiSelectButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderColor: '#49454F', borderRadius: 13, paddingHorizontal: 14, backgroundColor: '#161519' }, multiSelectButtonOpen: { borderColor: Colors.orange }, multiSelectValue: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10 }, multiSelectPlaceholder: { color: Colors.textMuted, fontFamily: 'Inter-Regular' }, multiSelectOptions: { marginTop: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#49454F', borderRadius: 14, padding: 6, backgroundColor: '#211F24' }, multiSelectOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingHorizontal: 10 }, multiSelectCheck: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#57515B', borderRadius: 7, backgroundColor: '#171519' }, multiSelectCheckActive: { borderColor: Colors.orange, backgroundColor: Colors.orange }, multiSelectOptionText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10 }, multiSelectOptionTextActive: { color: Colors.orange },
  googlePreview: { flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#343137', borderRadius: 19, padding: 14, backgroundColor: '#FFF', marginBottom: 18 }, googleImage: { width: 78, height: 78, borderRadius: 10, backgroundColor: '#EEE' }, googleCopy: { flex: 1, minWidth: 0 }, googleSite: { color: '#202124', fontFamily: 'Inter-Regular', fontSize: 9 }, googleTitle: { color: '#1A0DAB', fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 19, marginTop: 3 }, googleDescription: { color: '#4D5156', fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14, marginTop: 3 }, googleUrl: { color: '#188038', fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 },
  toggleCard: { minHeight: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 17, padding: 13, backgroundColor: '#1B1B1F', marginBottom: 9 }, toggleTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 11 }, toggleText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 },
  saveBottom: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: Colors.orange, marginTop: 14 }, saveBottomText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 11 },
});
