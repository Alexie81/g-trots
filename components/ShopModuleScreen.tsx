import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarChart3,
  Boxes,
  Camera,
  ChevronRight,
  FileText,
  Factory,
  FolderTree,
  ImageIcon,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShoppingCart,
  Sparkles,
  Tags,
  Trash2,
  X,
} from 'lucide-react-native';
import Header from '@/components/Header';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  shopApi,
  ShopBrand,
  ShopBrandPayload,
  ShopCategory,
  ShopCategoryPayload,
  ShopManufacturer,
  ShopManufacturerPayload,
} from '@/services/shopApi';

type CatalogView = 'categories' | 'brands' | 'manufacturers';
type DeleteTarget = { type: 'category'; item: ShopCategory } | { type: 'brand'; item: ShopBrand } | { type: 'manufacturer'; item: ShopManufacturer };

const dashboardAreas = [
  { key: 'orders', title: 'Comenzi', description: 'Fluxul comenzilor si statusurile lor.', Icon: ShoppingCart, color: '#38BDF8' },
  { key: 'products', title: 'Produse', description: 'Catalog, preturi si informatii comerciale.', Icon: Package, color: '#A78BFA' },
  { key: 'categories', title: 'Categorii', description: 'Categorii, subcategorii si imagini.', Icon: FolderTree, color: '#FB7185' },
  { key: 'brands', title: 'Compatibilitati branduri', description: 'Marcile cu care sunt compatibile produsele.', Icon: Tags, color: '#2DD4BF' },
  { key: 'manufacturers', title: 'Producatori', description: 'Companiile care fabrica produsele.', Icon: Factory, color: '#818CF8' },
  { key: 'inventory', title: 'Stoc', description: 'Cantitati, miscari si alerte de stoc.', Icon: Boxes, color: '#22C55E' },
  { key: 'invoices', title: 'Facturi', description: 'Documentele si situatia incasarilor.', Icon: FileText, color: '#F59E0B' },
] as const;

export default function ShopModuleScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<'dashboard' | CatalogView>('dashboard');
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

  const openCatalog = (next: CatalogView) => {
    setView(next);
    void loadCatalog();
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

  if (view === 'dashboard') {
    return (
      <View style={styles.container}>
        <Header title="" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Sparkles size={21} color="#38BDF8" /></View>
            <Text style={styles.kicker}>MODUL COMERCIAL</Text>
            <Text style={styles.title}>SHOP</Text>
            <Text style={styles.subtitle}>Administreaza comenzile, produsele, catalogul, stocul si facturile din acelasi loc.</Text>
            <View style={styles.statusPill}><View style={styles.statusDot} /><Text style={styles.statusText}>Catalog online conectat</Text></View>
          </View>
          <View style={styles.sectionHeader}>
            <View><Text style={styles.sectionKicker}>SPATII DE LUCRU</Text><Text style={styles.sectionTitle}>Administrare magazin</Text></View>
            <BarChart3 size={20} color={Colors.textMuted} />
          </View>
          <View style={styles.grid}>
            {dashboardAreas.map(({ key, title, description, Icon, color }) => {
              const enabled = key === 'categories' || key === 'brands' || key === 'manufacturers';
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.card}
                  activeOpacity={enabled ? 0.72 : 1}
                  onPress={() => enabled && openCatalog(key)}>
                  <View style={[styles.cardIcon, { borderColor: `${color}44`, backgroundColor: `${color}14` }]}><Icon size={22} color={color} /></View>
                  <Text style={styles.cardTitle}>{title}</Text>
                  <Text style={styles.cardDescription}>{description}</Text>
                  <View style={styles.cardFooter}>
                    <Text style={[styles.cardState, { color }]}>{enabled ? 'DESCHIDE' : 'URMEAZA'}</Text>
                    {enabled && <ChevronRight size={16} color={color} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
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
        onBack={() => setView('dashboard')}
        right={
          <TouchableOpacity style={styles.headerAction} onPress={() => void loadCatalog()} disabled={loading}>
            <RefreshCw size={18} color={Colors.orange} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={[styles.catalogContent, { paddingBottom: 104 + insets.bottom }]} showsVerticalScrollIndicator={false}>
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
        style={[styles.fab, { bottom: 22 + insets.bottom }]}
        activeOpacity={0.82}
        accessibilityLabel={isCategories ? 'Adauga categorie' : isBrands ? 'Adauga compatibilitate brand' : 'Adauga producator'}
        onPress={() => isCategories ? openCategoryForm() : isBrands ? openBrandForm() : openManufacturerForm()}>
        <Plus size={28} color={Colors.white} strokeWidth={2.6} />
      </TouchableOpacity>

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
        <View style={styles.colImage}>{category.thumbnail_url ? <Image source={{ uri: category.thumbnail_url }} style={styles.tableImage} /> : <View style={styles.tableImageFallback}><ImageIcon size={18} color={Colors.textMuted} /></View>}</View>
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
  content: { padding: 16, paddingBottom: 38 },
  hero: { overflow: 'hidden', borderWidth: 0, borderRadius: 28, padding: 24, backgroundColor: '#151B1E' },
  heroIcon: { width: 44, height: 44, borderWidth: 1, borderColor: 'rgba(56,189,248,0.30)', borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(56,189,248,0.10)', marginBottom: 18 },
  kicker: { color: '#38BDF8', fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 1.5 },
  title: { color: Colors.textPrimary, fontSize: 31, fontFamily: 'Inter-Bold', letterSpacing: 1, marginTop: 5 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20, fontFamily: 'Inter-Regular', marginTop: 8 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(34,197,94,0.07)', marginTop: 18 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  statusText: { color: '#9CD9AE', fontSize: 9, fontFamily: 'Inter-SemiBold' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 13, paddingHorizontal: 2 },
  sectionKicker: { color: Colors.orange, fontSize: 8, fontFamily: 'Inter-Bold', letterSpacing: 1.3 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '48%', minHeight: 188, flexGrow: 1, borderWidth: 0, borderRadius: 24, padding: 18, backgroundColor: '#1B1B1F' },
  cardIcon: { width: 46, height: 46, borderWidth: 0, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  cardTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-Bold' },
  cardDescription: { flex: 1, color: Colors.textSecondary, fontSize: 10, lineHeight: 15, fontFamily: 'Inter-Regular', marginTop: 5 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 },
  cardState: { fontSize: 8, fontFamily: 'Inter-Bold', letterSpacing: 1.1 },
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
