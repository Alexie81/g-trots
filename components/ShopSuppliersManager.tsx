import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, ChevronDown, ChevronLeft, ChevronRight, Globe2, Handshake, Mail, MapPin, Package, Pencil, Phone, Plus, Save, Trash2, UserRound, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopSupplier, ShopSupplierPayload, ShopSupplierProductReference } from '@/services/shopApi';

type SupplierForm = ShopSupplierPayload & { id: string | null };

const emptySupplier = (): SupplierForm => ({
  id: null,
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  website: '',
  cui: '',
  registration_number: '',
  address: '',
  notes: '',
  is_active: true,
});

export default function ShopSuppliersManager() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SupplierForm | null>(null);
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [productsBySupplier, setProductsBySupplier] = useState<Record<string, ShopSupplierProductReference[]>>({});
  const [productPages, setProductPages] = useState<Record<string, number>>({});
  const [loadingProducts, setLoadingProducts] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const rows = await shopApi.listSuppliers(token);
      setSuppliers(Array.isArray(rows) ? rows : []);
    } catch (error) {
      Alert.alert('Furnizorii nu s-au putut încărca', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const activeCount = useMemo(() => suppliers.filter((supplier) => supplier.is_active).length, [suppliers]);

  const edit = (supplier?: ShopSupplier) => setForm(supplier ? {
    id: supplier.id,
    name: supplier.name || '',
    contact_person: supplier.contact_person || '',
    email: supplier.email || '',
    phone: supplier.phone || '',
    website: supplier.website || '',
    cui: supplier.cui || '',
    registration_number: supplier.registration_number || '',
    address: supplier.address || '',
    notes: supplier.notes || '',
    is_active: supplier.is_active,
  } : emptySupplier());

  const save = async () => {
    if (!token || !form || saving) return;
    if (!form.name.trim()) {
      Alert.alert('Nume obligatoriu', 'Completează numele furnizorului.');
      return;
    }
    setSaving(true);
    try {
      const website = form.website?.trim() || '';
      const payload: ShopSupplierPayload = {
        name: form.name.trim(),
        contact_person: form.contact_person?.trim() || '',
        email: form.email?.trim().toLowerCase() || '',
        phone: form.phone?.trim() || '',
        website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
        cui: form.cui?.trim().toUpperCase() || '',
        registration_number: form.registration_number?.trim().toUpperCase() || '',
        address: form.address?.trim() || '',
        notes: form.notes?.trim() || '',
        is_active: form.is_active,
      };
      if (form.id) await shopApi.updateSupplier(token, form.id, payload);
      else await shopApi.createSupplier(token, payload);
      setForm(null);
      await load();
    } catch (error) {
      Alert.alert('Furnizorul nu a putut fi salvat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (supplier: ShopSupplier) => Alert.alert(
    'Ștergi furnizorul?',
    `„${supplier.name}” va fi șters definitiv din ambele aplicații.`,
    [
      { text: 'Renunță', style: 'cancel' },
      {
        text: 'Șterge',
        style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await shopApi.deleteSupplier(token, supplier.id);
            await load();
          } catch (error) {
            Alert.alert('Furnizorul nu a putut fi șters', error instanceof Error ? error.message : 'Încearcă din nou.');
          }
        },
      },
    ],
  );

  const toggleProducts = async (supplier: ShopSupplier) => {
    if (!token) return;
    if (expandedSupplier === supplier.id) {
      setExpandedSupplier(null);
      return;
    }
    setExpandedSupplier(supplier.id);
    setProductPages((current) => ({ ...current, [supplier.id]: current[supplier.id] || 1 }));
    if (productsBySupplier[supplier.id]) return;
    setLoadingProducts(supplier.id);
    try {
      const rows = await shopApi.listSupplierProducts(token, supplier.id);
      setProductsBySupplier((current) => ({ ...current, [supplier.id]: Array.isArray(rows) ? rows : [] }));
    } catch (error) {
      Alert.alert('Produsele nu s-au putut încărca', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setLoadingProducts(null);
    }
  };

  return <View style={styles.page}>
    <View style={styles.hero}>
      <View style={styles.heroGlow} />
      <View style={styles.heroIcon}><Handshake size={27} color="#5EEAD4" /></View>
      <View style={styles.heroCopy}>
        <Text style={styles.eyebrow}>ACHIZIȚII ȘI PARTENERI</Text>
        <Text style={styles.heroTitle}>Furnizori</Text>
        <Text style={styles.heroText}>Păstrează într-un singur loc firmele, persoanele de contact și datele comerciale.</Text>
      </View>
      <TouchableOpacity accessibilityLabel="Adaugă furnizor" style={styles.addButton} onPress={() => edit()}>
        <Plus size={21} color="#062521" />
      </TouchableOpacity>
    </View>

    <View style={styles.metrics}>
      <View style={styles.metric}><Text style={styles.metricLabel}>TOTAL</Text><Text style={styles.metricValue}>{suppliers.length}</Text></View>
      <View style={[styles.metric, styles.metricActive]}><Text style={styles.metricLabel}>ACTIVI</Text><Text style={[styles.metricValue, styles.metricValueActive]}>{activeCount}</Text></View>
      <View style={styles.metric}><Text style={styles.metricLabel}>INACTIVI</Text><Text style={styles.metricValue}>{suppliers.length - activeCount}</Text></View>
    </View>

    {loading ? <View style={styles.state}><ActivityIndicator color="#5EEAD4" /><Text style={styles.stateText}>Se încarcă furnizorii…</Text></View> : suppliers.length ? <View style={styles.list}>
      {suppliers.map((supplier) => <View key={supplier.id} style={styles.card}>
        <View style={styles.cardHead}>
          <View style={[styles.avatar, !supplier.is_active && styles.avatarInactive]}><Building2 size={21} color={supplier.is_active ? '#5EEAD4' : Colors.textMuted} /></View>
          <View style={styles.cardTitleCopy}>
            <View style={styles.titleLine}><Text numberOfLines={1} style={styles.cardTitle}>{supplier.name}</Text><Text style={[styles.status, !supplier.is_active && styles.statusInactive]}>{supplier.is_active ? 'ACTIV' : 'INACTIV'}</Text></View>
            <Text style={styles.cardSubtitle}>{[supplier.cui ? `CUI ${supplier.cui}` : '', supplier.registration_number ? `RC ${supplier.registration_number}` : ''].filter(Boolean).join(' · ') || 'Fără date fiscale'}</Text>
          </View>
        </View>
        <View style={styles.details}>
          {supplier.contact_person ? <Detail Icon={UserRound} value={supplier.contact_person} /> : null}
          {supplier.phone ? <Detail Icon={Phone} value={supplier.phone} /> : null}
          {supplier.email ? <Detail Icon={Mail} value={supplier.email} /> : null}
          {supplier.website ? <Detail Icon={Globe2} value={supplier.website.replace(/^https?:\/\//i, '')} /> : null}
          {supplier.address ? <Detail Icon={MapPin} value={supplier.address} wide /> : null}
        </View>
        {supplier.notes ? <Text numberOfLines={2} style={styles.notes}>{supplier.notes}</Text> : null}
        <TouchableOpacity style={styles.productsToggle} onPress={() => void toggleProducts(supplier)}>
          <View style={styles.productsToggleIcon}><Package size={15} color="#5EEAD4" /></View>
          <View style={styles.productsToggleCopy}><Text style={styles.productsToggleTitle}>Produse și coduri asociate</Text><Text style={styles.productsToggleText}>Vezi legăturile permanente folosite în NIR</Text></View>
          {loadingProducts === supplier.id ? <ActivityIndicator size="small" color="#5EEAD4" /> : <ChevronDown size={17} color="#8A848D" style={{ transform: [{ rotate: expandedSupplier === supplier.id ? '180deg' : '0deg' }] }} />}
        </TouchableOpacity>
        {expandedSupplier === supplier.id ? <SupplierProductsPanel supplierId={supplier.id} references={productsBySupplier[supplier.id] || []} page={productPages[supplier.id] || 1} loading={loadingProducts === supplier.id} onPageChange={(nextPage) => setProductPages((current) => ({ ...current, [supplier.id]: nextPage }))} /> : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.editButton} onPress={() => edit(supplier)}><Pencil size={16} color="#7DD3FC" /><Text style={styles.editText}>Editează</Text></TouchableOpacity>
          <TouchableOpacity accessibilityLabel={`Șterge ${supplier.name}`} style={styles.deleteButton} onPress={() => remove(supplier)}><Trash2 size={17} color="#FDA4AF" /></TouchableOpacity>
        </View>
      </View>)}
    </View> : <View style={styles.state}><View style={styles.emptyIcon}><Handshake size={29} color="#5EEAD4" /></View><Text style={styles.emptyTitle}>Niciun furnizor adăugat</Text><Text style={styles.stateText}>Adaugă primul partener comercial și datele lui de contact.</Text><TouchableOpacity style={styles.emptyButton} onPress={() => edit()}><Plus size={16} color="#062521" /><Text style={styles.emptyButtonText}>Adaugă furnizor</Text></TouchableOpacity></View>}

    <Modal visible={Boolean(form)} transparent animationType="slide" onRequestClose={() => !saving && setForm(null)}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom) }]}>
            <View style={styles.sheetHeader}><View><Text style={styles.sheetKicker}>FIȘĂ FURNIZOR</Text><Text style={styles.sheetTitle}>{form?.id ? 'Editează furnizorul' : 'Furnizor nou'}</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => !saving && setForm(null)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity></View>
            {form ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
              <Field label="NUME FURNIZOR *" value={form.name} onChangeText={(value) => setForm({ ...form, name: value })} placeholder="Ex: Distribuitor piese SRL" />
              <Field label="PERSOANĂ DE CONTACT" value={form.contact_person || ''} onChangeText={(value) => setForm({ ...form, contact_person: value })} placeholder="Nume și prenume" />
              <View style={styles.twoColumns}><View style={styles.column}><Field label="TELEFON" value={form.phone || ''} onChangeText={(value) => setForm({ ...form, phone: value })} placeholder="07…" keyboardType="phone-pad" /></View><View style={styles.column}><Field label="E-MAIL" value={form.email || ''} onChangeText={(value) => setForm({ ...form, email: value })} placeholder="contact@firma.ro" keyboardType="email-address" autoCapitalize="none" /></View></View>
              <View style={styles.twoColumns}><View style={styles.column}><Field label="CUI / CIF" value={form.cui || ''} onChangeText={(value) => setForm({ ...form, cui: value })} placeholder="RO12345678" autoCapitalize="characters" /></View><View style={styles.column}><Field label="REGISTRUL COMERȚULUI (J)" value={form.registration_number || ''} onChangeText={(value) => setForm({ ...form, registration_number: value })} placeholder="J40/1234/2026" autoCapitalize="characters" /></View></View>
              <Field label="WEBSITE" value={form.website || ''} onChangeText={(value) => setForm({ ...form, website: value })} placeholder="firma.ro" autoCapitalize="none" />
              <Field label="ADRESĂ" value={form.address || ''} onChangeText={(value) => setForm({ ...form, address: value })} placeholder="Stradă, număr, localitate, județ" />
              <Field label="NOTIȚE" value={form.notes || ''} onChangeText={(value) => setForm({ ...form, notes: value })} placeholder="Condiții comerciale, program, observații…" multiline />
              <View style={styles.switchRow}><View><Text style={styles.switchTitle}>Furnizor activ</Text><Text style={styles.switchText}>Poate fi folosit pentru achiziții noi.</Text></View><Switch value={form.is_active} onValueChange={(value) => setForm({ ...form, is_active: value })} trackColor={{ false: '#3B3740', true: '#0F766E' }} thumbColor={form.is_active ? '#5EEAD4' : '#8B858E'} /></View>
              <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>{saving ? <ActivityIndicator color="#062521" /> : <Save size={18} color="#062521" />}<Text style={styles.saveText}>{saving ? 'Se salvează…' : 'Salvează furnizorul'}</Text></TouchableOpacity>
            </ScrollView> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

function SupplierProductsPanel({ supplierId, references, page, loading, onPageChange }: { supplierId: string; references: ShopSupplierProductReference[]; page: number; loading: boolean; onPageChange: (page: number) => void }) {
  if (loading) return <View style={styles.productsPanel}><ActivityIndicator color="#5EEAD4" /></View>;
  if (!references.length) return <View style={styles.productsPanel}><Text style={styles.productsEmpty}>Nu există încă produse asociate acestui furnizor.</Text></View>;
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(references.length / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
  const visible = references.slice((safePage - 1) * pageSize, safePage * pageSize);
  return <View style={styles.productsPanel} key={`${supplierId}-${safePage}`}>
    <View style={styles.productsPanelHeader}><View><Text style={styles.productsPanelEyebrow}>CATALOG ASOCIAT</Text><Text style={styles.productsPanelTitle}>Produsele furnizorului</Text><Text style={styles.productsPanelText}>Câte 5 produse pe pagină</Text></View><View style={styles.productsTotal}><Text style={styles.productsTotalValue}>{references.length}</Text><Text style={styles.productsTotalLabel}>PRODUSE</Text></View></View>
    {visible.map((reference) => <View key={reference.id} style={[styles.productReference, !reference.is_active && styles.productReferenceInactive]}>
      {reference.product_image_url ? <Image source={{ uri: reference.product_image_url }} style={styles.productReferenceImage} resizeMode="cover" /> : <View style={styles.productReferenceIcon}><Package size={17} color="#5EEAD4" /></View>}
      <View style={styles.productReferenceCopy}><Text numberOfLines={2} style={styles.productReferenceName}>{reference.product_name || 'Produs asociat'}</Text><View style={styles.productReferenceCodeChip}><Text style={styles.productReferenceCode}>{reference.supplier_product_code_original}</Text></View><Text style={styles.productReferenceMeta}>{reference.product_sku || 'Fără SKU'} · {reference.purchase_unit} × {reference.conversion_factor} → {reference.stock_unit}</Text></View>
      <View style={[styles.productStatusDot, reference.is_active && styles.productStatusDotActive]} />
    </View>)}
    <View style={styles.productsPagination}><TouchableOpacity disabled={safePage <= 1} style={[styles.productsPageArrow, safePage <= 1 && styles.pageDisabled]} onPress={() => onPageChange(safePage - 1)}><ChevronLeft size={16} color={Colors.textPrimary} /></TouchableOpacity>{pages.map((number) => <TouchableOpacity key={number} style={[styles.productsPageNumber, number === safePage && styles.productsPageNumberActive]} onPress={() => onPageChange(number)}><Text style={[styles.productsPageNumberText, number === safePage && styles.productsPageNumberTextActive]}>{number}</Text></TouchableOpacity>)}<TouchableOpacity disabled={safePage >= totalPages} style={[styles.productsPageArrow, safePage >= totalPages && styles.pageDisabled]} onPress={() => onPageChange(safePage + 1)}><ChevronRight size={16} color={Colors.textPrimary} /></TouchableOpacity></View>
    <Text style={styles.productsPageCaption}>Pagina {safePage} din {totalPages}</Text>
  </View>;
}

function Detail({ Icon, value, wide = false }: { Icon: React.ComponentType<{ size?: number; color?: string }>; value: string; wide?: boolean }) {
  return <View style={[styles.detail, wide && styles.detailWide]}><Icon size={13} color="#6EE7D8" /><Text numberOfLines={1} style={styles.detailText}>{value}</Text></View>;
}

function Field({ label, multiline = false, ...props }: React.ComponentProps<typeof TextInput> & { label: string; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} multiline={multiline} placeholderTextColor="#6F6871" style={[styles.input, multiline && styles.textarea]} /></View>;
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 13 },
  hero: { minHeight: 150, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 27, padding: 18, backgroundColor: '#17211F' },
  heroGlow: { position: 'absolute', width: 190, height: 190, right: -70, top: -90, borderRadius: 95, backgroundColor: 'rgba(45,212,191,0.10)' },
  heroIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: 'rgba(45,212,191,0.12)' },
  heroCopy: { flex: 1 }, eyebrow: { color: '#5EEAD4', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.1 }, heroTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 24, marginTop: 4 }, heroText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15, marginTop: 5 },
  addButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#5EEAD4' },
  metrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, minHeight: 72, justifyContent: 'space-between', borderRadius: 19, padding: 12, backgroundColor: '#1D1B20' }, metricActive: { backgroundColor: '#17211F' }, metricLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8 }, metricValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 20 }, metricValueActive: { color: '#5EEAD4' },
  list: { gap: 10 }, card: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 23, padding: 14, backgroundColor: '#1D1B20' }, cardHead: { flexDirection: 'row', alignItems: 'center', gap: 11 }, avatar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: 'rgba(45,212,191,0.11)' }, avatarInactive: { backgroundColor: 'rgba(255,255,255,0.04)' }, cardTitleCopy: { flex: 1, minWidth: 0 }, titleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 }, cardTitle: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 14 }, cardSubtitle: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 }, status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, color: '#83E7D9', backgroundColor: 'rgba(45,212,191,0.10)', fontFamily: 'Inter-Bold', fontSize: 7 }, statusInactive: { color: Colors.textMuted, backgroundColor: 'rgba(255,255,255,0.05)' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 }, detail: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#27242A' }, detailWide: { flexBasis: '100%' }, detailText: { flexShrink: 1, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 9 }, notes: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14, marginTop: 11 },
  productsToggle: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: 'rgba(94,234,212,0.14)', borderRadius: 15, paddingHorizontal: 10, backgroundColor: 'rgba(94,234,212,0.045)', marginTop: 12 }, productsToggleIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(94,234,212,0.10)' }, productsToggleCopy: { flex: 1 }, productsToggleTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 9 }, productsToggleText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 7, marginTop: 2 }, productsPanel: { gap: 8, padding: 10, marginTop: 8, borderRadius: 18, backgroundColor: '#171B1A', borderWidth: 1, borderColor: '#5EEAD424' }, productsPanelHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 8 }, productsPanelEyebrow: { color: '#5EEAD4', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.9 }, productsPanelTitle: { marginTop: 3, color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 }, productsPanelText: { marginTop: 3, color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8 }, productsTotal: { minWidth: 62, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center', borderRadius: 14, backgroundColor: '#5EEAD410', borderWidth: 1, borderColor: '#5EEAD42E' }, productsTotalValue: { color: '#5EEAD4', fontFamily: 'Inter-Bold', fontSize: 17 }, productsTotalLabel: { marginTop: 2, color: '#8CBEB7', fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.7 }, productReference: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 9, backgroundColor: '#242528', borderWidth: 1, borderColor: '#FFFFFF0A' }, productReferenceInactive: { opacity: 0.48 }, productReferenceIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#17211F' }, productReferenceImage: { width: 54, height: 54, borderRadius: 15, backgroundColor: '#FFFFFF08' }, productReferenceCopy: { flex: 1, minWidth: 0 }, productReferenceName: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10, lineHeight: 14 }, productReferenceCodeChip: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#5EEAD410' }, productReferenceCode: { color: '#5EEAD4', fontFamily: 'Inter-Bold', fontSize: 7 }, productReferenceMeta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 7, marginTop: 4 }, productStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#77717A' }, productStatusDotActive: { backgroundColor: '#34D399' }, productsPagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 5 }, productsPageArrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#2B292F' }, productsPageNumber: { minWidth: 32, height: 34, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, productsPageNumberActive: { backgroundColor: '#5EEAD4' }, productsPageNumberText: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 9 }, productsPageNumberTextActive: { color: '#062521' }, productsPageCaption: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 7, textAlign: 'center' }, pageDisabled: { opacity: 0.3 }, productsEmpty: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, padding: 12, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 13 }, editButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 13, paddingHorizontal: 13, backgroundColor: 'rgba(56,189,248,0.10)' }, editText: { color: '#7DD3FC', fontFamily: 'Inter-SemiBold', fontSize: 9 }, deleteButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: 'rgba(244,63,94,0.10)' },
  state: { minHeight: 230, alignItems: 'center', justifyContent: 'center', borderRadius: 24, padding: 24, backgroundColor: '#1D1B20' }, stateText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 8 }, emptyIcon: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: 'rgba(45,212,191,0.10)' }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 14 }, emptyButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 14, paddingHorizontal: 15, backgroundColor: '#5EEAD4', marginTop: 17 }, emptyButtonText: { color: '#062521', fontFamily: 'Inter-Bold', fontSize: 10 },
  modalRoot: { flex: 1 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.78)' }, sheet: { maxHeight: '92%', borderTopLeftRadius: 29, borderTopRightRadius: 29, paddingHorizontal: 20, paddingTop: 20, backgroundColor: '#1D1B20' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }, sheetKicker: { color: '#5EEAD4', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1 }, sheetTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 20, marginTop: 4 }, closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#2A272D' }, formScroll: { paddingBottom: 12 }, field: { marginBottom: 14 }, fieldLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.7, marginBottom: 7 }, input: { minHeight: 50, borderWidth: 1, borderColor: '#49454F', borderRadius: 14, paddingHorizontal: 14, backgroundColor: '#18171A', color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 12 }, textarea: { minHeight: 86, paddingTop: 13, textAlignVertical: 'top' }, twoColumns: { flexDirection: 'row', gap: 9 }, column: { flex: 1, minWidth: 0 }, switchRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 17, paddingHorizontal: 14, backgroundColor: '#242227', marginBottom: 15 }, switchTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 11 }, switchText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 }, saveButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: '#5EEAD4' }, saveText: { color: '#062521', fontFamily: 'Inter-Bold', fontSize: 11 }, disabled: { opacity: 0.58 },
});
