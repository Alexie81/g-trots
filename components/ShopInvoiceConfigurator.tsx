import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Check, FileText, Palette, Save, Settings2, ShieldCheck, Sparkles } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { ShopInvoiceTheme, ShopInvoiceThemePalette, ShopInvoiceThemeSettings, shopApi } from '@/services/shopApi';

type Props = { bottomInset?: number };

const fallbackThemes: Record<ShopInvoiceTheme, ShopInvoiceThemePalette> = {
  orange: { label: 'Portocaliu', accent: '#ff8a00', accent_dark: '#d96500', soft: '#fff3e2', ink: '#7a3300' },
  green: { label: 'Verde', accent: '#19a86b', accent_dark: '#08794a', soft: '#e9f8f1', ink: '#075c3a' },
  red: { label: 'Roșu', accent: '#ef4056', accent_dark: '#b91f36', soft: '#fff0f2', ink: '#8f1428' },
  purple: { label: 'Mov', accent: '#7157d9', accent_dark: '#4c35ad', soft: '#f0edff', ink: '#3f2b92' },
};
const themeOrder: ShopInvoiceTheme[] = ['orange', 'green', 'red', 'purple'];

function InvoicePreview({ palette }: { palette: ShopInvoiceThemePalette }) {
  return <View style={styles.paper}>
    <View style={[styles.paperAccent, { backgroundColor: palette.accent }]} />
    <View style={styles.paperHead}>
      <Image source={require('../assets/images/logo.png')} style={styles.paperLogo} resizeMode="contain" />
      <View style={styles.paperTitle}><Text style={styles.paperBrand}>G-TROTS</Text><Text style={styles.paperCompany}>CAB IT EXPERT SRL</Text></View>
      <View style={styles.paperNumber}><Text style={styles.paperLabel}>FACTURĂ</Text><Text style={[styles.paperNumberText, { color: palette.accent_dark }]}>GT 00100</Text></View>
    </View>
    <View style={[styles.paperStatus, { backgroundColor: palette.soft, borderColor: palette.accent }]}><Text style={[styles.paperPill, { backgroundColor: palette.accent }]}>NEACHITATĂ</Text><Text style={[styles.paperStatusText, { color: palette.accent_dark }]}>Emisă la 02.09.2026</Text></View>
    <View style={styles.paperParties}>
      <View style={[styles.paperParty, { borderTopColor: palette.accent }]}><Text style={styles.paperLabel}>FURNIZOR</Text><Text numberOfLines={1} style={styles.paperPartyName}>CAB IT EXPERT SRL</Text><Text numberOfLines={1} style={styles.paperPartyMeta}>CUI 49972605 · București</Text></View>
      <View style={styles.paperParty}><Text style={styles.paperLabel}>CLIENT</Text><Text numberOfLines={1} style={styles.paperPartyName}>EXEMPLU CLIENT SRL</Text><Text numberOfLines={1} style={styles.paperPartyMeta}>CUI RO12345678 · România</Text></View>
    </View>
    <View style={styles.paperTable}>
      <View style={styles.paperTableHead}><Text style={[styles.paperTableHeadText, styles.paperProduct]}>PRODUS</Text><Text style={styles.paperTableHeadText}>CANT.</Text><Text style={styles.paperTableHeadText}>PREȚ</Text><Text style={styles.paperTableHeadText}>TOTAL</Text></View>
      {[['Cauciuc offroad 10x2.75', '2', '30,00', '60,00'], ['Plăcuțe frână model X', '1', '42,50', '42,50']].map((row) => <View key={row[0]} style={styles.paperTableRow}><View style={styles.paperProduct}><Text numberOfLines={1} style={styles.paperProductName}>{row[0]}</Text><Text style={styles.paperSku}>SKU PRODUS</Text></View><Text style={styles.paperCell}>{row[1]}</Text><Text style={styles.paperCell}>{row[2]} lei</Text><Text style={styles.paperCellStrong}>{row[3]} lei</Text></View>)}
    </View>
    <View style={styles.paperFooter}><View style={styles.paperVat}><Text style={styles.paperVatLabel}>TVA 21%</Text><Text style={styles.paperVatValue}>18,00 lei</Text></View><View style={[styles.paperTotal, { backgroundColor: palette.accent }]}><Text style={styles.paperTotalLabel}>TOTAL</Text><Text style={styles.paperTotalValue}>120,50 lei</Text></View></View>
  </View>;
}

export default function ShopInvoiceConfigurator({ bottomInset = 0 }: Props) {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const [settings, setSettings] = useState<ShopInvoiceThemeSettings | null>(null);
  const [selected, setSelected] = useState<ShopInvoiceTheme>('orange');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const wide = width >= 720;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const next = await shopApi.getInvoiceThemeSettings(token);
      setSettings(next);
      setSelected(next.active_theme);
    } catch (error) {
      Alert.alert('Configurarea nu s-a încărcat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const themes = settings?.themes || fallbackThemes;
  const dirty = Boolean(settings && selected !== settings.active_theme);
  const activePalette = themes[selected] || fallbackThemes[selected];
  const lastDocument = useMemo(() => settings?.last_assignment ? `${settings.last_assignment.series} ${settings.last_assignment.number}`.trim() : '', [settings]);
  const save = async () => {
    if (!token || saving || !dirty) return;
    setSaving(true);
    try {
      const next = await shopApi.updateInvoiceThemeSettings(token, selected);
      setSettings(next);
      setSelected(next.active_theme);
      Alert.alert('Tema a fost activată', `${next.themes[next.active_theme].label} se va aplica următoarei facturi noi. Facturile deja emise își păstrează tema inițială.`);
    } catch (error) {
      Alert.alert('Tema nu s-a putut salva', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setSaving(false); }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#FB923C" /><Text style={styles.loadingTitle}>Se încarcă temele facturii</Text><Text style={styles.loadingText}>Sincronizăm aceeași alegere pentru telefon și desktop.</Text></View>;

  return <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 112 + bottomInset }]} showsVerticalScrollIndicator={false}>
    <View style={styles.shell}>
      <View style={[styles.hero, wide && styles.heroWide]}>
        <View style={styles.iconStage}><View style={styles.invoiceIcon}><FileText size={34} color="#FDBA74" strokeWidth={1.8} /></View><View style={styles.settingsIcon}><Settings2 size={20} color={Colors.white} strokeWidth={2.2} /></View></View>
        <View style={styles.heroCopy}><View style={styles.status}><View style={styles.statusDot} /><Text style={styles.statusText}>CONFIGURARE SINCRONIZATĂ</Text></View><Text style={styles.kicker}>DOCUMENTE COMERCIALE</Text><Text style={styles.title}>Alege tema facturii</Text><Text style={styles.subtitle}>Selectează aspectul folosit începând cu următoarea factură. Fiecare document emis își memorează tema și nu se modifică retroactiv.</Text></View>
      </View>

      <View style={styles.currentCard}><View style={[styles.currentIcon, { backgroundColor: `${activePalette.accent}22` }]}><Palette size={22} color={activePalette.accent} /></View><View style={styles.currentCopy}><Text style={styles.currentKicker}>{dirty ? 'SELECȚIE NESALVATĂ' : 'TEMA ACTIVĂ'}</Text><Text style={styles.currentTitle}>{activePalette.label}</Text><Text style={styles.currentText}>{dirty ? 'Apasă butonul de salvare pentru a o folosi la următoarea factură.' : lastDocument ? `Ultimul document fixat: ${lastDocument}. Următoarea factură nouă va folosi această temă.` : 'Prima factură nouă va folosi această temă.'}</Text></View><View style={[styles.currentSwatch, { backgroundColor: activePalette.accent }]} /></View>

      <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>4 PREVIZUALIZĂRI</Text><Text style={styles.sectionTitle}>Paleta documentului</Text></View><Text style={styles.sectionHint}>Atinge o temă</Text></View>
      <View style={styles.themeGrid}>
        {themeOrder.map((theme) => {
          const palette = themes[theme] || fallbackThemes[theme];
          const isSelected = selected === theme;
          const isActive = settings?.active_theme === theme;
          return <TouchableOpacity key={theme} activeOpacity={0.88} accessibilityRole="radio" accessibilityState={{ checked: isSelected }} onPress={() => setSelected(theme)} style={[styles.themeCard, wide && styles.themeCardWide, isSelected && { borderColor: palette.accent, backgroundColor: `${palette.accent}10` }]}>
            <View style={styles.previewWrap}><InvoicePreview palette={palette} /><View pointerEvents="none" style={[styles.previewGlow, { backgroundColor: `${palette.accent}18` }]} /></View>
            <View style={styles.themeFooter}><View style={[styles.themeDot, { backgroundColor: palette.accent }]} /><View style={styles.themeCopy}><Text style={styles.themeName}>{palette.label}</Text><Text style={styles.themeMeta}>{isActive ? 'TEMA FOLOSITĂ ACUM' : isSelected ? 'PREGĂTITĂ PENTRU SALVARE' : 'PREVIZUALIZARE'}</Text></View><View style={[styles.selector, isSelected && { backgroundColor: palette.accent, borderColor: palette.accent }]}>{isSelected ? <Check size={17} color="#FFF" strokeWidth={3} /> : null}</View></View>
          </TouchableOpacity>;
        })}
      </View>

      <View style={styles.protectionCard}><View style={styles.protectionIcon}><ShieldCheck size={24} color="#86EFAC" /></View><View style={styles.protectionCopy}><Text style={styles.protectionTitle}>Temele vechi sunt protejate</Text><Text style={styles.protectionText}>Dacă GT001-GT099 au fost emise cu mov și activezi portocaliu după GT099, schimbarea începe cu GT100. Orice regenerare a documentelor GT001-GT099 folosește în continuare mov.</Text></View></View>
      <TouchableOpacity disabled={!dirty || saving} onPress={() => void save()} style={[styles.saveButton, { backgroundColor: activePalette.accent }, (!dirty || saving) && styles.saveDisabled]}>{saving ? <ActivityIndicator color="#FFF" /> : <><View><Text style={styles.saveKicker}>{dirty ? 'APLICĂ SCHIMBAREA' : 'CONFIGURAȚIE SALVATĂ'}</Text><Text style={styles.saveText}>{dirty ? `Folosește tema ${activePalette.label}` : `${activePalette.label} este activă`}</Text></View><View style={styles.saveIcon}>{dirty ? <Save size={20} color="#FFF" /> : <Sparkles size={20} color="#FFF" />}</View></>}</TouchableOpacity>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' }, content: { padding: 15 }, shell: { width: '100%', maxWidth: 900, alignSelf: 'center', gap: 14 },
  loading: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', padding: 24 }, loadingTitle: { marginTop: 15, color: '#FFF7F1', fontSize: 15, fontWeight: '900' }, loadingText: { marginTop: 5, color: '#8F8782', fontSize: 10, textAlign: 'center' },
  hero: { minHeight: 310, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 30, borderWidth: 1, borderColor: 'rgba(251,146,60,0.22)', padding: 24, backgroundColor: '#211C1A' }, heroWide: { minHeight: 250, flexDirection: 'row', alignItems: 'center', gap: 30 }, heroCopy: { minWidth: 0, flex: 1 },
  iconStage: { width: 82, height: 82, marginBottom: 25 }, invoiceIcon: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(251,146,60,0.32)', backgroundColor: 'rgba(251,146,60,0.10)' }, settingsIcon: { position: 'absolute', right: 0, bottom: 0, width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 3, borderColor: '#211C1A', backgroundColor: '#F97316' },
  status: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: 'rgba(34,197,94,0.11)' }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' }, statusText: { color: '#86EFAC', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, kicker: { color: '#FB923C', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, title: { marginTop: 7, color: Colors.textPrimary, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 }, subtitle: { maxWidth: 600, marginTop: 10, color: Colors.textSecondary, fontSize: 12, lineHeight: 20 },
  currentCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#383338', borderRadius: 23, padding: 13, backgroundColor: '#1B191D' }, currentIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 17 }, currentCopy: { minWidth: 0, flex: 1 }, currentKicker: { color: '#9A9299', fontSize: 7, fontWeight: '900', letterSpacing: 1 }, currentTitle: { marginTop: 4, color: '#FFF', fontSize: 15, fontWeight: '900' }, currentText: { marginTop: 3, color: '#898187', fontSize: 9, lineHeight: 14 }, currentSwatch: { width: 13, height: 48, borderRadius: 8 },
  sectionHead: { marginTop: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }, sectionKicker: { color: '#FB923C', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, sectionTitle: { marginTop: 4, color: '#FFF', fontSize: 18, fontWeight: '900' }, sectionHint: { color: '#7F777D', fontSize: 9, fontWeight: '800' }, themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  themeCard: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: '#39343A', borderRadius: 25, padding: 12, backgroundColor: '#1B191D' }, themeCardWide: { width: '49%', flexGrow: 1, flexBasis: 340 }, previewWrap: { position: 'relative', overflow: 'hidden', borderRadius: 18, padding: 11, backgroundColor: '#ECE8E3' }, previewGlow: { position: 'absolute', width: 170, height: 170, right: -80, top: -90, borderRadius: 90 },
  paper: { zIndex: 1, minHeight: 210, overflow: 'hidden', borderRadius: 9, padding: 10, backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: .16, shadowRadius: 9, elevation: 2 }, paperAccent: { height: 5, marginHorizontal: -10, marginTop: -10, marginBottom: 8 }, paperHead: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 7 }, paperLogo: { width: 27, height: 27, borderRadius: 7 }, paperTitle: { flex: 1 }, paperBrand: { color: '#101828', fontSize: 7, fontWeight: '900' }, paperCompany: { marginTop: 2, color: '#747079', fontSize: 4, fontWeight: '800' }, paperNumber: { width: 52, alignItems: 'flex-end' }, paperLabel: { color: '#99939B', fontSize: 4, fontWeight: '900', letterSpacing: .5 }, paperNumberText: { marginTop: 2, fontSize: 7, fontWeight: '900' },
  paperStatus: { height: 23, marginTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 5, paddingHorizontal: 5 }, paperPill: { overflow: 'hidden', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3, color: '#FFF', fontSize: 4, fontWeight: '900', letterSpacing: .25 }, paperStatusText: { fontSize: 4, fontWeight: '800' }, paperParties: { marginTop: 7, flexDirection: 'row', gap: 5 }, paperParty: { height: 48, flex: 1, borderWidth: 1, borderColor: '#E1DEE2', borderTopWidth: 3, borderTopColor: '#29262B', borderRadius: 5, padding: 5 }, paperPartyName: { marginTop: 4, color: '#29262B', fontSize: 4.6, fontWeight: '900' }, paperPartyMeta: { marginTop: 3, color: '#817B82', fontSize: 3.6 },
  paperTable: { marginTop: 7, overflow: 'hidden', borderWidth: 1, borderColor: '#E0DDE0', borderRadius: 5 }, paperTableHead: { height: 17, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, backgroundColor: '#29262B' }, paperTableHeadText: { width: 42, color: '#FFF', fontSize: 3.4, fontWeight: '900', textAlign: 'right' }, paperTableRow: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 3, borderTopWidth: 1, borderTopColor: '#ECEAEC', paddingHorizontal: 5 }, paperProduct: { minWidth: 0, flex: 1 }, paperProductName: { color: '#343036', fontSize: 4.1, fontWeight: '800' }, paperSku: { marginTop: 2, color: '#9A949B', fontSize: 3.2 }, paperCell: { width: 42, color: '#4A454C', fontSize: 3.8, textAlign: 'right' }, paperCellStrong: { width: 42, color: '#242126', fontSize: 4, fontWeight: '900', textAlign: 'right' }, paperFooter: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9 }, paperVat: { flexDirection: 'row', gap: 5 }, paperVatLabel: { color: '#777178', fontSize: 4 }, paperVatValue: { color: '#333035', fontSize: 4, fontWeight: '800' }, paperTotal: { minWidth: 78, flexDirection: 'row', justifyContent: 'space-between', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 6 }, paperTotalLabel: { color: '#FFFFFFC0', fontSize: 3.5, fontWeight: '900' }, paperTotalValue: { color: '#FFF', fontSize: 5.5, fontWeight: '900' },
  themeFooter: { minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 11, paddingHorizontal: 2 }, themeDot: { width: 12, height: 35, borderRadius: 7 }, themeCopy: { minWidth: 0, flex: 1 }, themeName: { color: '#FFF', fontSize: 14, fontWeight: '900' }, themeMeta: { marginTop: 3, color: '#847C83', fontSize: 7, fontWeight: '900', letterSpacing: .65 }, selector: { width: 33, height: 33, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#514B51', borderRadius: 12, backgroundColor: '#242126' },
  protectionCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: '#2F5842', borderRadius: 22, padding: 15, backgroundColor: '#17231D' }, protectionIcon: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#4ADE8012' }, protectionCopy: { minWidth: 0, flex: 1 }, protectionTitle: { color: '#EFFFF5', fontSize: 12, fontWeight: '900' }, protectionText: { marginTop: 5, color: '#86A492', fontSize: 9, lineHeight: 15 },
  saveButton: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 22, paddingLeft: 19, paddingRight: 9 }, saveDisabled: { opacity: .5 }, saveKicker: { color: '#FFFFFFBB', fontSize: 7, fontWeight: '900', letterSpacing: .9 }, saveText: { marginTop: 3, color: '#FFF', fontSize: 13, fontWeight: '900' }, saveIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#FFFFFF22' },
});
