import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgePercent, CalendarDays, Check, Clock3, Gift, ImageOff, Megaphone, Package, Pencil, Plus, Search, Sparkles, Tags, Trash2, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopProduct, ShopPromotion, ShopPromotionPayload } from '@/services/shopApi';

type PromotionForm = ShopPromotionPayload & { id: string | null; valueText: string; minText: string };

const emptyForm = (): PromotionForm => ({
  id: null, code: '', title: '', description: '', discount_type: 'percent', discount_value: 10, valueText: '10', min_order_value: 0, minText: '', audience: 'all', scope: 'global', product_id: null, product_ids: [], usage_mode: 'unlimited', auto_apply: true, show_banner: true, banner_text: '', valid_from: '', valid_until: '', is_active: true,
});
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value.replace(' ', 'T'))) : 'oricând';
const parsePromotionDate = (value?: string | null) => { const parsed = value ? new Date(String(value).replace(' ', 'T')) : new Date(); return Number.isNaN(parsed.getTime()) ? new Date() : parsed; };
const promotionDateValue = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
const promotionDateDisplay = (value?: string | null) => value ? new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsePromotionDate(value)) : 'Alege data și ora';

export default function ShopDiscountsManager() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [items, setItems] = useState<ShopPromotion[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [allProductIds, setAllProductIds] = useState<string[] | null>(null);
  const [selectingAllProducts, setSelectingAllProducts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PromotionForm | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [datePicker, setDatePicker] = useState<{ field: 'valid_from' | 'valid_until'; mode: 'date' | 'time'; value: Date } | null>(null);
  const productRequest = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const discounts = await shopApi.listPromotions(token);
      setItems(Array.isArray(discounts) ? discounts : []);
    } catch (error) { Alert.alert('Reducerile nu s-au putut încărca', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const loadProductOptions = useCallback(async (query = '', ids: string[] = []) => {
    if (!token) return;
    const cleanQuery = query.trim();
    const cleanIds = [...new Set(ids.filter(Boolean))];
    if (!cleanQuery && !cleanIds.length) {
      productRequest.current += 1;
      setProducts((current) => current.filter((product) => (form?.product_ids || []).includes(product.id)));
      setProductsLoading(false);
      return;
    }
    const request = ++productRequest.current;
    setProductsLoading(true);
    try {
      const catalog = await shopApi.listProductOptions(token, { q: cleanQuery, ids: cleanIds, limit: cleanIds.length ? 250 : 40 });
      if (request !== productRequest.current) return;
      setProducts(Array.isArray(catalog) ? catalog : []);
    } catch (error) {
      if (request === productRequest.current) Alert.alert('Căutarea nu a reușit', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { if (request === productRequest.current) setProductsLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!form || form.scope !== 'product') return;
    const query = productQuery.trim();
    const timer = setTimeout(() => { void loadProductOptions(query, query ? [] : form.product_ids); }, query ? 180 : 0);
    return () => clearTimeout(timer);
  }, [form?.id, form?.scope, productQuery, loadProductOptions]);

  const activeCount = items.filter((item) => item.is_active).length;
  const bannerCount = items.filter((item) => item.is_active && item.show_banner).length;
  const selectedIds = form?.product_ids || [];
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allProductsSelected = Boolean(allProductIds?.length && allProductIds.every((id) => selectedIdSet.has(id)));
  const selectedProducts = useMemo(() => products.filter((product) => selectedIdSet.has(product.id)).sort((a, b) => a.name.localeCompare(b.name, 'ro-RO', { sensitivity: 'base' })), [products, selectedIdSet]);
  const matchingProducts = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase('ro-RO');
    if (!query) return [];
    return [...products]
      .sort((a, b) => a.name.localeCompare(b.name, 'ro-RO', { sensitivity: 'base' }))
      .filter((product) => `${product.name} ${product.sku || ''} ${product.supplier_product_code || ''}`.toLocaleLowerCase('ro-RO').includes(query));
  }, [products, productQuery]);

  const edit = (item?: ShopPromotion) => {
    setProductQuery('');
    setProducts([]);
    setAllProductIds(null);
    const next = item ? { ...item, product_ids: item.product_ids?.length ? item.product_ids : (item.product_id ? [item.product_id] : []), usage_mode: item.usage_mode || 'unlimited', valueText: String(item.discount_value), minText: item.min_order_value ? String(item.min_order_value) : '' } : emptyForm();
    setForm(next);
    if (next.product_ids.length) void loadProductOptions('', next.product_ids);
  };

  const toggleAllProducts = async () => {
    if (!token || !form || selectingAllProducts) return;
    setSelectingAllProducts(true);
    try {
      const ids = allProductIds || await shopApi.listProductOptionIds(token);
      setAllProductIds(ids);
      const currentIds = new Set(form.product_ids);
      const allSelected = ids.length > 0 && ids.every((id) => currentIds.has(id));
      setForm({ ...form, product_ids: allSelected ? [] : ids, product_id: allSelected ? null : ids[0] || null });
    } catch (error) { Alert.alert('Produsele nu au putut fi selectate', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setSelectingAllProducts(false); }
  };

  const openDatePicker = (field: 'valid_from' | 'valid_until') => setDatePicker({ field, mode: 'date', value: parsePromotionDate(form?.[field]) });
  const handleDatePicker = (event: DateTimePickerEvent, picked?: Date) => {
    if (!datePicker) return;
    if (event.type === 'dismissed' || !picked) return setDatePicker(null);
    const next = new Date(datePicker.value);
    if (datePicker.mode === 'date') {
      next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      setDatePicker({ ...datePicker, mode: 'time', value: next });
      return;
    }
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    setForm((current) => current ? { ...current, [datePicker.field]: promotionDateValue(next) } : current);
    setDatePicker(null);
  };

  const save = async () => {
    if (!token || !form || saving) return;
    const discountValue = Number(form.valueText.replace(',', '.'));
    const minOrder = form.minText.trim() ? Number(form.minText.replace(',', '.')) : 0;
    if (!form.code.trim() || !form.title.trim()) return Alert.alert('Completează reducerea', 'Codul și titlul sunt obligatorii.');
    if (!discountValue || discountValue < 0) return Alert.alert('Valoare invalidă', 'Introdu o valoare mai mare decât zero.');
    if (form.scope === 'product' && !form.product_ids.length) return Alert.alert('Alege produsele', 'Reducerea per produs are nevoie de cel puțin un produs selectat.');
    const productIds = form.scope === 'product' ? form.product_ids : [];
    const payload: ShopPromotionPayload = { ...form, code: form.code.trim().toUpperCase(), title: form.title.trim(), description: form.description.trim(), banner_text: form.banner_text.trim() || form.title.trim(), discount_value: discountValue, min_order_value: minOrder, product_ids: productIds, product_id: productIds[0] || null };
    delete (payload as Partial<PromotionForm>).id; delete (payload as Partial<PromotionForm>).valueText; delete (payload as Partial<PromotionForm>).minText;
    setSaving(true);
    try {
      if (form.id) await shopApi.updatePromotion(token, form.id, payload);
      else await shopApi.createPromotion(token, payload);
      setForm(null); await load();
    } catch (error) { Alert.alert('Reducerea nu s-a putut salva', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setSaving(false); }
  };

  const remove = (item: ShopPromotion) => Alert.alert('Ștergi reducerea?', `${item.title} nu va mai putea fi folosită.`, [{ text: 'Renunță', style: 'cancel' }, { text: 'Șterge', style: 'destructive', onPress: async () => { if (!token) return; try { await shopApi.deletePromotion(token, item.id); await load(); } catch (error) { Alert.alert('Nu s-a putut șterge', error instanceof Error ? error.message : 'Încearcă din nou.'); } } }]);

  if (loading) return <View style={styles.loading}><ActivityIndicator color={Colors.orange} /><Text style={styles.loadingTitle}>Se pregătesc reducerile</Text></View>;

  return <View style={styles.page}>
    <View style={styles.hero}><View style={styles.heroAura} /><View style={styles.heroIcon}><BadgePercent size={28} color="#FEA13B" /></View><View style={styles.heroCopy}><Text style={styles.kicker}>PROMOȚII G-TROTS</Text><Text style={styles.title}>Reduceri</Text><Text style={styles.subtitle}>Campanii globale sau per produs, pentru toți clienții ori doar pentru cei autentificați.</Text></View><TouchableOpacity style={styles.add} onPress={() => edit()}><Plus size={20} color="#1A0B01" /></TouchableOpacity></View>
    <View style={[styles.metrics, compact && styles.metricsCompact]}><Metric Icon={Sparkles} label="ACTIVE" value={activeCount} color="#34D399" /><Metric Icon={Megaphone} label="ÎN BARA SITE-ULUI" value={bannerCount} color="#38BDF8" /><Metric Icon={Tags} label="TOTAL CAMPANII" value={items.length} color="#A78BFA" /></View>
    <View style={styles.info}><View style={styles.infoIcon}><Megaphone size={18} color="#FE8C19" /></View><View style={styles.infoCopy}><Text style={styles.infoTitle}>Vizibile imediat în magazin</Text><Text style={styles.infoText}>Campaniile cu „Afișează în bara site-ului” apar deasupra navigării într-o bandă animată modernă.</Text></View></View>
    <View style={styles.list}>{items.map((item) => <View key={item.id} style={[styles.card, !item.is_active && styles.cardOff]}><View style={[styles.cardIcon, { backgroundColor: item.discount_type === 'percent' ? '#FF7A001A' : '#34D39916' }]}>{item.discount_type === 'percent' ? <BadgePercent size={21} color="#FE8C19" /> : <Gift size={21} color="#34D399" />}</View><View style={styles.cardCopy}><View style={styles.cardTop}><Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text><View style={[styles.activeBadge, !item.is_active && styles.inactiveBadge]}><Text style={[styles.activeText, !item.is_active && styles.inactiveText]}>{item.is_active ? 'ACTIVĂ' : 'OPRITĂ'}</Text></View></View><Text style={styles.cardValue}>{item.discount_type === 'percent' ? `${item.discount_value}%` : `${item.discount_value.toFixed(2)} lei`} <Text style={styles.cardScope}>· {item.scope === 'global' ? 'toate produsele' : item.product_name || 'produs selectat'}</Text></Text><Text numberOfLines={1} style={styles.cardMeta}>{item.audience === 'registered' ? 'Doar clienți autentificați' : 'Toți clienții'} · minim {item.min_order_value ? `${item.min_order_value.toFixed(2)} lei` : 'fără prag'} · {dateLabel(item.valid_from)} — {dateLabel(item.valid_until)}</Text><View style={styles.tags}>{item.show_banner ? <Text style={styles.tag}>BANDĂ SITE</Text> : null}{item.auto_apply ? <Text style={styles.tag}>AUTOMATĂ</Text> : <Text style={styles.tag}>COD {item.code}</Text>}</View></View><TouchableOpacity style={styles.action} onPress={() => edit(item)}><Pencil size={17} color="#38BDF8" /></TouchableOpacity><TouchableOpacity style={[styles.action, styles.delete]} onPress={() => remove(item)}><Trash2 size={17} color="#FB7185" /></TouchableOpacity></View>)}{!items.length ? <View style={styles.empty}><Gift size={27} color="#FE8C19" /><Text style={styles.emptyTitle}>Prima campanie este la un pas</Text><Text style={styles.emptyText}>Creează o reducere și decide exact cine o vede.</Text><TouchableOpacity style={styles.emptyButton} onPress={() => edit()}><Plus size={17} color="#1A0B01" /><Text>Adaugă reducere</Text></TouchableOpacity></View> : null}</View>

    <Modal visible={Boolean(form)} transparent animationType="slide" onRequestClose={() => !saving && setForm(null)}><View style={styles.backdrop}><View style={[styles.sheet, compact && styles.sheetCompact, { paddingBottom: Math.max(14, insets.bottom) }]}>{form ? <><View style={styles.sheetHead}><View><Text style={styles.sheetKicker}>CONFIGURARE CAMPANIE</Text><Text style={styles.sheetTitle}>{form.id ? 'Editează reducerea' : 'Reducere nouă'}</Text></View><TouchableOpacity style={styles.close} onPress={() => setForm(null)}><X size={20} color="#ECE7EC" /></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
      <View style={styles.fieldRow}><Field label="COD REDUCERE *" value={form.code} onChangeText={(value) => setForm({ ...form, code: value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="GTROTS10" /><Field label="TITLU *" value={form.title} onChangeText={(value) => setForm({ ...form, title: value })} placeholder="10% pentru comenzi mari" /></View>
      <Field label="DESCRIERE" value={form.description} onChangeText={(value) => setForm({ ...form, description: value })} placeholder="Detalii interne sau pentru client" multiline />
      <Choice title="TIP REDUCERE" options={[['percent', 'Procent (%)'], ['fixed', 'Sumă fixă']]} selected={form.discount_type} onSelect={(value) => setForm({ ...form, discount_type: value as 'percent' | 'fixed' })} />
      <View style={styles.fieldRow}><Field label={form.discount_type === 'percent' ? 'REDUCERE % *' : 'REDUCERE LEI *'} value={form.valueText} onChangeText={(value) => setForm({ ...form, valueText: value })} keyboardType="decimal-pad" /><Field label="COMANDĂ MINIMĂ (LEI)" value={form.minText} onChangeText={(value) => setForm({ ...form, minText: value })} keyboardType="decimal-pad" placeholder="Fără prag" /></View>
      <Choice title="CINE BENEFICIAZĂ" options={[['all', 'Toți utilizatorii'], ['registered', 'Doar cei înregistrați']]} selected={form.audience} onSelect={(value) => setForm({ ...form, audience: value as 'all' | 'registered' })} />
      <Choice title="UNDE SE APLICĂ" options={[['global', 'Toată comanda'], ['product', 'Produse selectate']]} selected={form.scope} onSelect={(value) => { setForm({ ...form, scope: value as 'global' | 'product', product_id: value === 'global' ? null : form.product_id, product_ids: value === 'global' ? [] : form.product_ids }); if (value === 'product') void loadProductOptions(); }} />
      {form.scope !== 'product' ? <TouchableOpacity style={styles.productPickerShortcut} onPress={() => { setForm({ ...form, scope: 'product' }); void loadProductOptions(); }}><View style={styles.productPickerShortcutIcon}><Package size={22} color="#FEA13B" /></View><View style={styles.productPickerShortcutCopy}><Text style={styles.productPickerShortcutKicker}>SELECTOR PRODUSE</Text><Text style={styles.productPickerShortcutTitle}>Alege produse din catalog</Text><Text style={styles.productPickerShortcutText}>Caută după nume sau cod, vezi poza și stocul ori selectează toate produsele.</Text></View><Plus size={20} color="#FEA13B" /></TouchableOpacity> : null}
      <Choice title="LIMITĂ DE UTILIZARE" options={[['unlimited', 'Fără limită'], ['once_per_customer', 'O dată per utilizator'], ['once_per_device', 'O dată per dispozitiv']]} selected={form.usage_mode} onSelect={(value) => setForm({ ...form, usage_mode: value as ShopPromotion['usage_mode'] })} />
      {form.scope === 'product' ? <View style={styles.productPicker}>
        <View style={styles.productPickerHead}><View><Text style={styles.label}>PRODUSE SELECTATE *</Text><Text style={styles.productPickerHint}>{selectedIds.length} selectate · caută în catalog după nume sau cod</Text></View><View style={styles.productPickerActions}><TouchableOpacity style={[styles.selectAll, allProductsSelected && styles.selectAllActive]} onPress={() => void toggleAllProducts()}>{selectingAllProducts ? <ActivityIndicator size="small" color="#FEA13B" /> : <Check size={15} color={allProductsSelected ? '#1A0B01' : '#FEA13B'} />}<Text style={[styles.selectAllText, allProductsSelected && styles.selectAllTextActive]}>{allProductsSelected ? 'Deselectează toate' : 'Selectează toate produsele'}</Text></TouchableOpacity>{matchingProducts.length ? <TouchableOpacity style={styles.selectResults} onPress={() => { const next = [...new Set([...selectedIds, ...matchingProducts.map((product) => product.id)])]; setForm({ ...form, product_ids: next, product_id: next[0] || null }); }}><Plus size={14} color="#AFA5AE" /><Text style={styles.selectResultsText}>Selectează rezultatele</Text></TouchableOpacity> : null}</View></View>
        {selectedProducts.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedProducts}>{selectedProducts.map((product) => <TouchableOpacity key={product.id} style={styles.selectedProduct} onPress={() => { const next = selectedIds.filter((id) => id !== product.id); setForm({ ...form, product_ids: next, product_id: next[0] || null }); }}><ProductThumb product={product} small /><Text numberOfLines={1}>{product.name}</Text><X size={15} color="#B9B0B8" /></TouchableOpacity>)}</ScrollView> : null}
        <View style={styles.productSearch}><Search size={17} color="#FE8C19" /><TextInput value={productQuery} onChangeText={setProductQuery} placeholder="Caută după nume sau cod produs" placeholderTextColor="#686168" style={styles.productSearchInput} />{productQuery ? <TouchableOpacity onPress={() => setProductQuery('')}><X size={17} color="#A69DA5" /></TouchableOpacity> : null}</View>
        {productsLoading ? <View style={styles.productLoading}><ActivityIndicator color="#FE8C19" /><Text style={styles.productLoadingText}>Căutăm produsele…</Text></View> : productQuery.trim() ? <ScrollView style={styles.productResults} nestedScrollEnabled keyboardShouldPersistTaps="handled">{matchingProducts.map((product) => { const selected = selectedIds.includes(product.id); const nextStock = product.stock_mode === 'unlimited' ? 'Stoc nelimitat' : product.stock_quantity > 0 ? (product.stock_quantity + ' în stoc') : 'Stoc epuizat'; return <TouchableOpacity key={product.id} style={[styles.productResult, selected && styles.productResultSelected]} onPress={() => { const next = selected ? selectedIds.filter((id) => id !== product.id) : [...selectedIds, product.id]; setForm({ ...form, product_ids: next, product_id: next[0] || null }); }}><ProductThumb product={product} /><View style={styles.productResultCopy}><Text numberOfLines={2} style={styles.productName}>{product.name}</Text><View style={styles.productDetails}><Text style={styles.productSku}>{product.sku || product.supplier_product_code || 'Fără cod'}</Text><Text style={[styles.productStock, product.stock_mode !== 'unlimited' && product.stock_quantity <= 0 && styles.productStockOut]}>{nextStock}</Text></View></View><View style={[styles.productCheck, selected && styles.productCheckActive]}>{selected ? <Check size={15} color="#1A0B01" /> : null}</View></TouchableOpacity>; })}{!matchingProducts.length ? <View style={styles.productEmpty}><Search size={20} color="#756C75" /><Text style={styles.productLoadingText}>Nu am găsit produse pentru această căutare.</Text></View> : null}</ScrollView> : <View style={styles.productEmpty}><Search size={21} color="#FE8C19" /><Text style={styles.productEmptyTitle}>Scrie numele sau codul produsului</Text><Text style={styles.productLoadingText}>Catalogul nu este încărcat în fundal. Rezultatele apar pe măsură ce scrii.</Text></View>}
      </View> : null}
      <View style={styles.fieldRow}><DateField label="ÎNCEPE LA" value={form.valid_from} onPress={() => openDatePicker('valid_from')} onClear={() => setForm({ ...form, valid_from: '' })} /><DateField label="SE TERMINĂ LA" value={form.valid_until} onPress={() => openDatePicker('valid_until')} onClear={() => setForm({ ...form, valid_until: '' })} /></View>
      {datePicker ? <View style={styles.nativePicker}><View style={styles.nativePickerHead}><View style={styles.nativePickerIcon}>{datePicker.mode === 'date' ? <CalendarDays size={18} color="#FE8C19" /> : <Clock3 size={18} color="#FE8C19" />}</View><View><Text style={styles.nativePickerTitle}>{datePicker.mode === 'date' ? 'Alege data' : 'Alege ora'}</Text><Text style={styles.nativePickerText}>{datePicker.mode === 'date' ? 'După dată vei selecta și ora.' : 'Ultimul pas pentru programarea promoției.'}</Text></View></View><DateTimePicker value={datePicker.value} mode={datePicker.mode} display={Platform.OS === 'ios' ? 'spinner' : 'default'} minuteInterval={5} onChange={handleDatePicker} themeVariant="dark" /><TouchableOpacity style={styles.pickerCancel} onPress={() => setDatePicker(null)}><Text>Renunță</Text></TouchableOpacity></View> : null}
      <Field label="TEXT ÎN BARA SITE-ULUI" value={form.banner_text} onChangeText={(value) => setForm({ ...form, banner_text: value })} placeholder="Reducere specială G-Trots — descoperă oferta" />
      <Toggle title="Reducere activă" text="Campania poate fi folosită în perioada aleasă." value={form.is_active} onChange={(value) => setForm({ ...form, is_active: value })} />
      <Toggle title="Aplicare automată" text="Clientul primește automat cea mai bună reducere eligibilă." value={form.auto_apply} onChange={(value) => setForm({ ...form, auto_apply: value })} />
      <Toggle title="Afișează în bara site-ului" text="Anunțul apare animat deasupra meniului magazinului." value={form.show_banner} onChange={(value) => setForm({ ...form, show_banner: value })} />
      <TouchableOpacity disabled={saving} style={[styles.save, saving && styles.saveDisabled]} onPress={() => void save()}>{saving ? <ActivityIndicator color="#1A0B01" /> : <><Text style={styles.saveText}>Salvează campania</Text><View style={styles.saveIcon}><Sparkles size={18} color="#1A0B01" /></View></>}</TouchableOpacity>
    </ScrollView></> : null}</View></View></Modal>
  </View>;
}

function Metric({ Icon, label, value, color }: { Icon: typeof Sparkles; label: string; value: number; color: string }) { return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}><Icon size={20} color={color} /></View><View><Text style={[styles.metricLabel, { color }]}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View></View>; }
function ProductThumb({ product, small = false }: { product: ShopProduct; small?: boolean }) {
  const image = product.images?.[0]?.url;
  return <View style={[styles.productThumb, small && styles.productThumbSmall]}>{image ? <Image source={{ uri: image }} style={styles.productThumbImage} resizeMode="cover" /> : <ImageOff size={small ? 14 : 18} color="#817981" />}</View>;
}
function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) { const { label, multiline, ...inputProps } = props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} placeholderTextColor="#686168" style={[styles.input, multiline && styles.textarea]} /></View>; }
function DateField({ label, value, onPress, onClear }: { label: string; value?: string | null; onPress: () => void; onClear: () => void }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TouchableOpacity style={styles.dateField} onPress={onPress}><View style={styles.dateFieldIcon}><CalendarDays size={19} color="#FE8C19" /></View><View style={styles.dateFieldCopy}><Text style={[styles.dateFieldValue, !value && styles.dateFieldPlaceholder]}>{promotionDateDisplay(value)}</Text><Text style={styles.dateFieldHint}>Dată și oră</Text></View>{value ? <TouchableOpacity style={styles.dateClear} onPress={(event) => { event.stopPropagation(); onClear(); }}><X size={15} color="#A89FA8" /></TouchableOpacity> : <Clock3 size={17} color="#6F676F" />}</TouchableOpacity></View>; }
function Choice({ title, options, selected, onSelect }: { title: string; options: string[][]; selected: string; onSelect: (value: string) => void }) { return <View><Text style={styles.label}>{title}</Text><View style={styles.choices}>{options.map(([value, label]) => <TouchableOpacity key={value} style={[styles.choice, selected === value && styles.choiceActive]} onPress={() => onSelect(value)}><View style={[styles.radio, selected === value && styles.radioActive]}>{selected === value ? <View style={styles.radioCore} /> : null}</View><Text style={[styles.choiceText, selected === value && styles.choiceTextActive]}>{label}</Text></TouchableOpacity>)}</View></View>; }
function Toggle({ title, text, value, onChange }: { title: string; text: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={styles.toggle}><View style={styles.toggleCopy}><Text style={styles.toggleTitle}>{title}</Text><Text style={styles.toggleText}>{text}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: '#3A353D', true: '#623813' }} thumbColor={value ? '#FE8C19' : '#8D858E'} /></View>; }

const styles = StyleSheet.create({
  page: { padding: 14, gap: 12 }, loading: { minHeight: 350, alignItems: 'center', justifyContent: 'center', gap: 8 }, loadingTitle: { color: '#FFF', fontSize: 15, fontWeight: '900' }, hero: { minHeight: 132, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#392C23', borderRadius: 26, backgroundColor: '#191512' }, heroAura: { width: 230, height: 230, position: 'absolute', right: -70, top: -130, borderRadius: 115, backgroundColor: '#FF79001E' }, heroIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: '#FF8B2738', backgroundColor: '#FF790014' }, heroCopy: { minWidth: 0, flex: 1 }, kicker: { color: '#FE8C19', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, title: { marginTop: 4, color: '#FFF8F1', fontSize: 30, fontWeight: '900', letterSpacing: -1.1 }, subtitle: { maxWidth: 620, marginTop: 4, color: '#968E88', fontSize: 12, lineHeight: 18 }, add: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FE8C19' },
  metrics: { flexDirection: 'row', gap: 9 }, metricsCompact: { flexDirection: 'column' }, metric: { minHeight: 78, padding: 13, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#302C33', borderRadius: 19, backgroundColor: '#1B191E' }, metricIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, metricLabel: { fontSize: 8, fontWeight: '900', letterSpacing: .8 }, metricValue: { marginTop: 2, color: '#FFF', fontSize: 18, fontWeight: '900' }, info: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#49321F', borderRadius: 18, backgroundColor: '#211912' }, infoIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#FE8C1918' }, infoCopy: { minWidth: 0, flex: 1 }, infoTitle: { color: '#FFF', fontSize: 11, fontWeight: '900' }, infoText: { marginTop: 2, color: '#8F8780', fontSize: 9, lineHeight: 14 },
  list: { gap: 8 }, card: { minHeight: 104, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#322E34', borderRadius: 20, backgroundColor: '#1C191F' }, cardOff: { opacity: .67 }, cardIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, cardCopy: { minWidth: 0, flex: 1, gap: 3 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, cardTitle: { minWidth: 0, flexShrink: 1, color: '#FFF', fontSize: 13, fontWeight: '900' }, activeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, backgroundColor: '#15362A' }, inactiveBadge: { backgroundColor: '#332F34' }, activeText: { color: '#4ADE80', fontSize: 7, fontWeight: '900' }, inactiveText: { color: '#9B939C' }, cardValue: { color: '#FEA13B', fontSize: 12, fontWeight: '900' }, cardScope: { color: '#A49CA5', fontSize: 10, fontWeight: '700' }, cardMeta: { color: '#736C75', fontSize: 9 }, tags: { marginTop: 2, flexDirection: 'row', gap: 4 }, tag: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7, overflow: 'hidden', backgroundColor: '#2A262C', color: '#A9A1AA', fontSize: 7, fontWeight: '900' }, action: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#172934' }, delete: { backgroundColor: '#331C24' }, empty: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: '#3B353D', borderRadius: 23 }, emptyTitle: { color: '#FFF', fontSize: 16, fontWeight: '900' }, emptyText: { color: '#777079', fontSize: 10 }, emptyButton: { marginTop: 8, paddingHorizontal: 15, height: 42, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 14, backgroundColor: '#FE8C19' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#050405DF' }, sheet: { width: '100%', maxWidth: 940, maxHeight: '95%', overflow: 'hidden', borderWidth: 1, borderColor: '#39343B', borderRadius: 28, backgroundColor: '#19171C' }, sheetCompact: { alignSelf: 'stretch', maxHeight: '98%', borderRadius: 24 }, sheetHead: { minHeight: 86, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#302C33', backgroundColor: '#1F1C21' }, sheetKicker: { color: '#FE8C19', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 }, sheetTitle: { marginTop: 3, color: '#FFF', fontSize: 20, fontWeight: '900' }, close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#2A272D' }, form: { padding: 16, gap: 13 }, fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { minWidth: 220, flex: 1, gap: 6 }, label: { color: '#918992', fontSize: 8, fontWeight: '900', letterSpacing: .9 }, input: { minHeight: 50, paddingHorizontal: 13, borderWidth: 1, borderColor: '#3A353D', borderRadius: 15, backgroundColor: '#121114', color: '#FFF', fontSize: 12, fontWeight: '700' }, textarea: { minHeight: 84, paddingTop: 13 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 48, paddingHorizontal: 13, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#38333B', borderRadius: 15, backgroundColor: '#201D22' }, choiceActive: { borderColor: '#9A591E', backgroundColor: '#2A1D13' }, radio: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#625A64', borderRadius: 9 }, radioActive: { borderColor: '#FE8C19' }, radioCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FE8C19' }, choiceText: { color: '#A29AA3', fontSize: 10, fontWeight: '800' }, choiceTextActive: { color: '#FFF' },
  productPicker: { gap: 9 }, productPickerHead: { minHeight: 42, gap: 9 }, productPickerHint: { marginTop: 3, color: '#756E76', fontSize: 9 }, productPickerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, selectAll: { minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#62421F', borderRadius: 13, backgroundColor: '#28211C' }, selectAllActive: { borderColor: '#FEA13B', backgroundColor: '#FEA13B' }, selectAllText: { color: '#FEA13B', fontSize: 9, fontWeight: '900' }, selectAllTextActive: { color: '#1A0B01' }, selectResults: { minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#413B43', borderRadius: 13, backgroundColor: '#242126' }, selectResultsText: { color: '#B9B0B8', fontSize: 9, fontWeight: '900' }, selectedProducts: { gap: 7, paddingVertical: 2 }, selectedProduct: { maxWidth: 250, minHeight: 42, padding: 5, paddingRight: 9, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#805024', borderRadius: 14, backgroundColor: '#2A1D13' }, productSearch: { minHeight: 50, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#3A353D', borderRadius: 15, backgroundColor: '#121114' }, productSearchInput: { minWidth: 0, flex: 1, color: '#FFF', fontSize: 12 }, productResults: { maxHeight: 310, borderWidth: 1, borderColor: '#302C33', borderRadius: 16 }, productResult: { minHeight: 68, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#2B282E', backgroundColor: '#1E1B20' }, productResultSelected: { backgroundColor: '#2A2119' }, productResultCopy: { minWidth: 0, flex: 1 }, productName: { color: '#ECE7ED', fontSize: 10, lineHeight: 14, fontWeight: '800' }, productDetails: { marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 }, productSku: { color: '#8E858E', fontSize: 8, fontWeight: '800' }, productStock: { color: '#44D995', fontSize: 8, fontWeight: '900' }, productStockOut: { color: '#FB7185' }, productCheck: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#5A535C', borderRadius: 9, backgroundColor: '#252228' }, productCheckActive: { borderColor: '#FEA13B', backgroundColor: '#FEA13B' }, productThumb: { width: 48, height: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#F1EEEA' }, productThumbSmall: { width: 31, height: 31, borderRadius: 9 }, productThumbImage: { width: '100%', height: '100%' },
  productPickerShortcut: { minHeight: 82, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#6B421D', borderRadius: 18, backgroundColor: '#251C15' }, productPickerShortcutIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FE8C1917' }, productPickerShortcutCopy: { minWidth: 0, flex: 1 }, productPickerShortcutKicker: { color: '#FEA13B', fontSize: 8, fontWeight: '900', letterSpacing: .8 }, productPickerShortcutTitle: { marginTop: 2, color: '#FFF', fontSize: 12, fontWeight: '900' }, productPickerShortcutText: { marginTop: 3, color: '#8E8580', fontSize: 9, lineHeight: 13 },
  productLoading: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#302C33', borderRadius: 16, backgroundColor: '#18161A' }, productLoadingText: { maxWidth: 360, color: '#A39BA3', fontSize: 10, lineHeight: 15, fontWeight: '800', textAlign: 'center' }, productEmpty: { minHeight: 112, padding: 18, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: '#3A343C', borderRadius: 16, backgroundColor: '#18161A' }, productEmptyTitle: { color: '#F2EDF2', fontSize: 11, fontWeight: '900' }, productMore: { paddingHorizontal: 8, color: '#8B838B', fontSize: 9, lineHeight: 14 },
  dateField: { minHeight: 58, padding: 7, paddingRight: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#3F3941', borderRadius: 17, backgroundColor: '#121114' }, dateFieldIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FE8C1915' }, dateFieldCopy: { minWidth: 0, flex: 1 }, dateFieldValue: { color: '#F6F0F5', fontSize: 11, fontWeight: '900' }, dateFieldPlaceholder: { color: '#746D75' }, dateFieldHint: { marginTop: 2, color: '#6F686F', fontSize: 8, fontWeight: '700' }, dateClear: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#29262B' }, nativePicker: { padding: 12, gap: 9, borderWidth: 1, borderColor: '#60401F', borderRadius: 20, backgroundColor: '#211B17' }, nativePickerHead: { flexDirection: 'row', alignItems: 'center', gap: 10 }, nativePickerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#FE8C1915' }, nativePickerTitle: { color: '#FFF', fontSize: 12, fontWeight: '900' }, nativePickerText: { marginTop: 2, color: '#887F7A', fontSize: 9 }, pickerCancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#302A2C' },
  toggle: { minHeight: 67, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#322E35', borderRadius: 17, backgroundColor: '#1E1B20' }, toggleCopy: { minWidth: 0, flex: 1 }, toggleTitle: { color: '#FFF', fontSize: 11, fontWeight: '900' }, toggleText: { marginTop: 3, color: '#777079', fontSize: 9, lineHeight: 13 }, save: { minHeight: 58, marginTop: 4, paddingLeft: 18, paddingRight: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, backgroundColor: '#FE8C19' }, saveDisabled: { opacity: .62 }, saveText: { color: '#1A0B01', fontSize: 12, fontWeight: '900' }, saveIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FFFFFF38' },
});
