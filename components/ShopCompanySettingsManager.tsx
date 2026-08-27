import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Building2, Check, Landmark, MapPin, Plus, Save, ShieldCheck, Stamp, Trash2, Upload } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { ShopCompanySettings, shopApi } from '@/services/shopApi';

const FieldFocusContext = React.createContext<((target: number) => void) | undefined>(undefined);

const emptyCompany = (): ShopCompanySettings => ({
  id: 0, legal_name: '', trade_name: 'G-Trots România', cui: '', registration_number: '', address: '', city: '', county: '', postal_code: '', country: 'România', email: '', phone: '', website: 'https://g-trots.ro', bank_name: '', iban: '', share_capital: '', stamp_url: null, is_default: false, vat_payer: false,
});

export default function ShopCompanySettingsManager({ onFieldFocus }: { onFieldFocus?: (target: number) => void }) {
  const { token } = useAuth();
  const [companies, setCompanies] = useState<ShopCompanySettings[]>([]);
  const [company, setCompany] = useState<ShopCompanySettings>(emptyCompany());
  const [stampPreview, setStampPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectCompany = (next: ShopCompanySettings) => {
    setCompany({ ...next, stamp_base64: undefined, remove_stamp: false });
    setStampPreview(next.stamp_url || null);
  };
  const load = useCallback(async (preferredId?: number) => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await shopApi.listCompanySettings(token);
      setCompanies(list);
      selectCompany(list.find((item) => item.id === preferredId) || list.find((item) => item.is_default) || list[0] || emptyCompany());
    } catch (error) { Alert.alert('Firmele nu s-au putut încărca', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const update = <K extends keyof ShopCompanySettings>(key: K, value: ShopCompanySettings[K]) => setCompany((current) => ({ ...current, [key]: value }));
  const addCompany = () => { const next = emptyCompany(); next.is_default = companies.length === 0; setCompany(next); setStampPreview(null); };
  const pickStamp = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Acces necesar', 'Permite accesul la fotografii pentru a selecta ștampila.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: .85, base64: true });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.base64) {
      setStampPreview(asset.uri);
      setCompany((current) => ({ ...current, stamp_base64: `data:${asset.mimeType || 'image/png'};base64,${asset.base64}`, remove_stamp: false }));
    }
  };
  const removeStamp = () => { setStampPreview(null); setCompany((current) => ({ ...current, stamp_base64: undefined, stamp_url: null, remove_stamp: true })); };
  const save = async () => {
    if (!token || saving) return;
    if (!company.legal_name.trim()) return Alert.alert('Denumire obligatorie', 'Completează denumirea legală a firmei.');
    setSaving(true);
    try {
      const saved = company.id ? await shopApi.updateCompanySettings(token, company.id, company) : await shopApi.createCompanySettings(token, company);
      await load(saved.id);
      Alert.alert('Firmă salvată', saved.is_default ? 'Aceasta este firma folosită implicit.' : 'Datele firmei au fost salvate.');
    } catch (error) { Alert.alert('Datele nu s-au putut salva', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setSaving(false); }
  };
  const removeCompany = () => {
    if (!token || !company.id) return;
    Alert.alert('Ștergi firma?', 'Datele și ștampila asociată vor fi eliminate.', [{ text: 'Renunță', style: 'cancel' }, { text: 'Șterge', style: 'destructive', onPress: async () => {
      try { await shopApi.deleteCompanySettings(token, company.id); await load(); }
      catch (error) { Alert.alert('Firma nu s-a putut șterge', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    } }]);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#FE8C19" /><Text style={styles.loadingText}>Se încarcă firmele</Text></View>;
  return <FieldFocusContext.Provider value={onFieldFocus}><View style={styles.page}>
    <View style={styles.hero}><View style={styles.heroIcon}><Building2 size={27} color="#FEA13B" /></View><View style={styles.heroCopy}><Text style={styles.kicker}>IDENTITATE COMERCIALĂ</Text><Text style={styles.title}>Datele firmelor</Text><Text style={styles.subtitle}>Adaugă mai multe societăți și alege firma folosită implicit.</Text></View><TouchableOpacity style={styles.add} onPress={addCompany}><Plus size={21} color="#1A0B01" /></TouchableOpacity></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.companyRail}>
      {companies.map((item) => <TouchableOpacity key={item.id} onPress={() => selectCompany(item)} style={[styles.companyChip, company.id === item.id && styles.companyChipActive]}><View style={[styles.companyMark, item.is_default && styles.companyMarkDefault]}>{item.is_default ? <Check size={16} color="#1A0B01" /> : <Building2 size={16} color="#AAA2A8" />}</View><View><Text numberOfLines={1} style={styles.companyChipTitle}>{item.trade_name || item.legal_name}</Text><Text style={styles.companyChipMeta}>{item.cui || 'Fără CUI'}{item.is_default ? ' · IMPLICITĂ' : ''}</Text></View></TouchableOpacity>)}
      <TouchableOpacity style={styles.newChip} onPress={addCompany}><Plus size={18} color="#FE8C19" /><Text style={styles.newChipText}>Firmă nouă</Text></TouchableOpacity>
    </ScrollView>
    <View style={styles.defaultCard}><View style={styles.defaultIcon}><ShieldCheck size={21} color={company.is_default ? '#4ADE80' : '#9D949B'} /></View><View style={styles.defaultCopy}><Text style={styles.defaultTitle}>Folosește această firmă</Text><Text style={styles.defaultText}>Va fi aleasă implicit pentru documente și comenzi.</Text></View><Switch value={company.is_default} onValueChange={(value) => update('is_default', value)} trackColor={{ false: '#3B363D', true: '#24563F' }} thumbColor={company.is_default ? '#4ADE80' : '#8D858E'} /></View>
    <Section Icon={Building2} title="Identitate juridică" description="Datele de identificare ale societății.">
      <Row><Field label="DENUMIRE LEGALĂ *" value={company.legal_name} onChangeText={(value) => update('legal_name', value)} placeholder="Denumirea completă a firmei" /><Field label="NUME COMERCIAL" value={company.trade_name} onChangeText={(value) => update('trade_name', value)} placeholder="G-Trots România" /></Row>
      <Row><Field label="CUI / CIF" value={company.cui} onChangeText={(value) => update('cui', value)} /><Field label="NR. REGISTRUL COMERȚULUI" value={company.registration_number} onChangeText={(value) => update('registration_number', value)} /></Row>
      <View style={styles.toggle}><View style={styles.defaultCopy}><Text style={styles.toggleTitle}>Plătitoare de TVA</Text><Text style={styles.toggleText}>Societate înregistrată în scopuri de TVA.</Text></View><Switch value={company.vat_payer} onValueChange={(value) => update('vat_payer', value)} trackColor={{ false: '#3B363D', true: '#704319' }} thumbColor={company.vat_payer ? '#FE8C19' : '#8D858E'} /></View>
    </Section>
    <Section Icon={MapPin} title="Sediu și contact" description="Adresa și datele publice de contact.">
      <Field label="ADRESĂ COMPLETĂ" value={company.address} onChangeText={(value) => update('address', value)} />
      <Row><Field label="LOCALITATE" value={company.city} onChangeText={(value) => update('city', value)} /><Field label="JUDEȚ" value={company.county} onChangeText={(value) => update('county', value)} /></Row>
      <Row><Field label="COD POȘTAL" value={company.postal_code} onChangeText={(value) => update('postal_code', value)} /><Field label="ȚARĂ" value={company.country} onChangeText={(value) => update('country', value)} /></Row>
      <Row><Field label="E-MAIL" value={company.email} onChangeText={(value) => update('email', value)} keyboardType="email-address" autoCapitalize="none" /><Field label="TELEFON" value={company.phone} onChangeText={(value) => update('phone', value)} keyboardType="phone-pad" /></Row>
      <Field label="WEBSITE" value={company.website} onChangeText={(value) => update('website', value)} autoCapitalize="none" />
    </Section>
    <Section Icon={Landmark} title="Date bancare" description="Informații folosite în documentele financiare.">
      <Row><Field label="BANCA" value={company.bank_name} onChangeText={(value) => update('bank_name', value)} /><Field label="IBAN" value={company.iban} onChangeText={(value) => update('iban', value.toUpperCase().replace(/\s/g, ''))} autoCapitalize="characters" /></Row>
      <Field label="CAPITAL SOCIAL" value={company.share_capital} onChangeText={(value) => update('share_capital', value)} placeholder="Ex: 200 lei" />
    </Section>
    <Section Icon={Stamp} title="Ștampila firmei" description="Imaginea va putea fi folosită pe documentele generate.">
      <View style={styles.stampRow}><View style={styles.stampPreview}>{stampPreview ? <Image source={{ uri: stampPreview }} resizeMode="contain" style={styles.stampImage} /> : <Stamp size={34} color="#756D74" />}</View><View style={styles.stampActions}><TouchableOpacity style={styles.stampButton} onPress={() => void pickStamp()}><Upload size={17} color="#FE8C19" /><Text>{stampPreview ? 'Înlocuiește ștampila' : 'Alege ștampila'}</Text></TouchableOpacity>{stampPreview ? <TouchableOpacity style={styles.stampDelete} onPress={removeStamp}><Trash2 size={17} color="#FB7185" /><Text>Șterge</Text></TouchableOpacity> : null}</View></View>
    </Section>
    <View style={styles.actions}><TouchableOpacity style={[styles.save, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>{saving ? <ActivityIndicator color="#1A0B01" /> : <><Text style={styles.saveText}>{company.id ? 'Salvează firma' : 'Adaugă firma'}</Text><View style={styles.saveIcon}><Save size={19} color="#1A0B01" /></View></>}</TouchableOpacity>{company.id && companies.length > 1 ? <TouchableOpacity style={styles.deleteCompany} onPress={removeCompany}><Trash2 size={18} color="#FB7185" /></TouchableOpacity> : null}</View>
  </View></FieldFocusContext.Provider>;
}

function Section({ Icon, title, description, children }: React.PropsWithChildren<{ Icon: typeof Building2; title: string; description: string }>) { return <View style={styles.section}><View style={styles.sectionHead}><View style={styles.sectionIcon}><Icon size={20} color="#FEA13B" /></View><View style={styles.defaultCopy}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionText}>{description}</Text></View></View><View style={styles.sectionBody}>{children}</View></View>; }
function Row({ children }: React.PropsWithChildren) { return <View style={styles.row}>{children}</View>; }
function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) { const focus = React.useContext(FieldFocusContext); const { label, onFocus, ...input } = props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...input} onFocus={(event) => { onFocus?.(event); focus?.(event.nativeEvent.target); }} placeholderTextColor="#6F686F" style={styles.input} /></View>; }

const styles = StyleSheet.create({
  page: { padding: 14, gap: 12 }, loading: { minHeight: 380, alignItems: 'center', justifyContent: 'center', gap: 9 }, loadingText: { color: '#EEE8ED', fontSize: 13, fontWeight: '800' },
  hero: { minHeight: 128, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: '#403125', borderRadius: 26, backgroundColor: '#1B1714' }, heroIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#FE8C1916' }, heroCopy: { minWidth: 0, flex: 1 }, kicker: { color: '#FE8C19', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, title: { marginTop: 4, color: '#FFF8F1', fontSize: 27, fontWeight: '900' }, subtitle: { marginTop: 3, color: '#948C87', fontSize: 10, lineHeight: 15 }, add: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FE8C19' },
  companyRail: { gap: 8, paddingVertical: 1 }, companyChip: { width: 220, minHeight: 67, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#363137', borderRadius: 18, backgroundColor: '#1B191D' }, companyChipActive: { borderColor: '#FE8C19', backgroundColor: '#2A1D14' }, companyMark: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#29262B' }, companyMarkDefault: { backgroundColor: '#4ADE80' }, companyChipTitle: { maxWidth: 145, color: '#FFF', fontSize: 11, fontWeight: '900' }, companyChipMeta: { marginTop: 3, color: '#8A8188', fontSize: 8, fontWeight: '800' }, newChip: { minWidth: 125, minHeight: 67, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: '#775027', borderRadius: 18, backgroundColor: '#211A15' }, newChipText: { color: '#FFF7F0', fontSize: 10, fontWeight: '900' },
  defaultCard: { minHeight: 70, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#31513F', borderRadius: 19, backgroundColor: '#17231D' }, defaultIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FFFFFF0A' }, defaultCopy: { minWidth: 0, flex: 1 }, defaultTitle: { color: '#F4FFF8', fontSize: 11, fontWeight: '900' }, defaultText: { marginTop: 3, color: '#83A18F', fontSize: 9, lineHeight: 13 },
  section: { overflow: 'hidden', borderWidth: 1, borderColor: '#343036', borderRadius: 22, backgroundColor: '#1B191E' }, sectionHead: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: '#302C32' }, sectionIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FE8C1913' }, sectionTitle: { color: '#FFF', fontSize: 13, fontWeight: '900' }, sectionText: { marginTop: 2, color: '#7D757D', fontSize: 9 }, sectionBody: { padding: 14, gap: 11 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { minWidth: 220, flex: 1, gap: 6 }, label: { color: '#908891', fontSize: 8, fontWeight: '900', letterSpacing: .8 }, input: { minHeight: 51, paddingHorizontal: 13, borderWidth: 1, borderColor: '#3C373E', borderRadius: 15, color: '#FFF', backgroundColor: '#121114', fontSize: 12, fontWeight: '700' },
  toggle: { minHeight: 65, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#353138', borderRadius: 17, backgroundColor: '#201D22' }, toggleTitle: { color: '#FFF', fontSize: 11, fontWeight: '900' }, toggleText: { marginTop: 3, color: '#777079', fontSize: 9 },
  stampRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, stampPreview: { width: 150, height: 110, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#484149', borderRadius: 18, backgroundColor: '#F2EEE8' }, stampImage: { width: '100%', height: '100%' }, stampActions: { minWidth: 180, flex: 1, justifyContent: 'center', gap: 8 }, stampButton: { minHeight: 48, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#785128', borderRadius: 15, backgroundColor: '#2B2017' }, stampDelete: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: '#3A1E26' },
  actions: { flexDirection: 'row', gap: 8 }, save: { minHeight: 59, paddingLeft: 18, paddingRight: 6, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 19, backgroundColor: '#FE8C19' }, disabled: { opacity: .62 }, saveText: { color: '#1A0B01', fontSize: 12, fontWeight: '900' }, saveIcon: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFFFFF42' }, deleteCompany: { width: 59, height: 59, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#3A1D25' },
});
