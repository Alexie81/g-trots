import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CalendarDays, Check, FileSpreadsheet, FolderArchive, X } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi } from '@/services/shopApi';

type Kind = 'categories' | 'brands' | 'manufacturers' | 'invoices';
const titles: Record<Kind, string> = { categories: 'Categorii', brands: 'Compatibilități', manufacturers: 'Producători', invoices: 'Facturi emise' };
const periods = [{ id: 'all', label: 'Toată perioada' }, { id: 'year', label: 'Tot anul' }, { id: 'six_months', label: '6 luni' }, { id: 'three_months', label: '3 luni' }, { id: 'last_month', label: 'Luna trecută' }, { id: 'current_month', label: 'Luna curentă' }, { id: 'custom', label: 'Personalizat' }];
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function range(period: string, from: string, to: string) {
  const now = new Date();
  if (period === 'all') return ['', ''];
  if (period === 'custom') return [from, to];
  if (period === 'last_month') return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
  let start = new Date(now.getFullYear(), period === 'year' ? 0 : now.getMonth(), 1);
  if (period === 'six_months' || period === 'three_months') {
    start = new Date(now.getFullYear(), now.getMonth() - (period === 'six_months' ? 6 : 3), 1);
    start.setDate(Math.min(now.getDate(), new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()));
  }
  return [iso(start), iso(now)];
}

export default function ShopRegistryExportButton({ kind, total = 0 }: { kind: Kind; total?: number }) {
  const { token } = useAuth(); const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false); const [period, setPeriod] = useState('current_month');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [progress, setProgress] = useState(0); const [elapsed, setElapsed] = useState(0);
  const active = useRef(false); const spin = useRef(new Animated.Value(0)).current;
  const invoices = kind === 'invoices'; const dates = range(period, from, to);
  const estimate = Math.max(3, Math.ceil(total * (invoices && complete ? 1.1 : 0.003)));
  useEffect(() => {
    if (!busy) return;
    spin.setValue(0);
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true }));
    animation.start(); return () => animation.stop();
  }, [busy, spin]);

  const download = async () => {
    if (!token || active.current) return;
    if (invoices && period === 'custom' && (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)) {
      Alert.alert('Perioadă invalidă', 'Completează ambele date în format AAAA-LL-ZZ, în ordine cronologică.'); return;
    }
    active.current = true; setBusy(true); setProgress(0); setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => { const seconds = (Date.now() - started) / 1000; setElapsed(seconds); setProgress(Math.min(92, Math.round(92 * (1 - Math.exp(-seconds / estimate))))); }, 400);
    try {
      const file = invoices ? await shopApi.exportInvoiceRegistry(token, dates[0], dates[1], complete) : await shopApi.exportCatalog(token, kind);
      clearInterval(timer); setProgress(96);
      const uri = `${FileSystem.cacheDirectory}${file.file_name.replace(/[\\/:*?"<>|]/g, '-')}`;
      await FileSystem.writeAsStringAsync(uri, file.content_base64, { encoding: FileSystem.EncodingType.Base64 });
      setProgress(100); await new Promise(resolve => setTimeout(resolve, 200)); setVisible(false); setBusy(false);
      await Sharing.shareAsync(uri, { mimeType: file.mime_type, UTI: file.mime_type === 'application/zip' ? 'public.zip-archive' : 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: `Export ${titles[kind]}` });
    } catch (error) { Alert.alert('Export nereușit', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { clearInterval(timer); active.current = false; setBusy(false); }
  };
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Exportă ${titles[kind]} în XLSX`} style={s.trigger} onPress={() => setVisible(true)}><FileSpreadsheet size={20} color="#9FE8C1" /><Text style={s.triggerText}>Exportă</Text></TouchableOpacity>
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!busy) setVisible(false); }}>
      <View style={[s.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}><View style={s.panel}>
        {busy ? <View style={s.busy}>
          <View style={s.orbit}><Animated.View style={[s.ring, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} /><Image source={require('../assets/images/logo.png')} style={s.logo} resizeMode="contain" /></View>
          <Text style={s.eyebrow}>EXPORT G-TROTS CRM</Text><Text style={s.title}>{progress === 100 ? 'Export finalizat' : 'Pregătim fișierele'}</Text>
          <Text style={s.hint}>{invoices && complete ? 'Centralizator, PDF, XLSX și RO e-Factura XML pentru fiecare factură.' : `Centralizăm ${titles[kind].toLowerCase()} în XLSX.`}</Text>
          <View style={s.progressLabels}><Text style={s.percent}>{progress}%</Text><Text style={s.hint}>{elapsed < estimate ? `Estimare: ~${Math.max(1, Math.ceil(estimate - elapsed))} secunde` : 'Procesarea continuă…'}</Text></View>
          <View style={s.track}><View style={[s.fill, { width: `${progress}%` }]} /></View><Text style={s.note}>Progres estimat până la primirea fișierului.</Text>
        </View> : <>
          <View style={s.header}><View style={s.icon}><FileSpreadsheet size={25} color="#6EE7C7" /></View><View style={{ flex: 1 }}><Text style={s.eyebrow}>{invoices ? 'EXPORT CONTABIL' : 'CATALOG G-TROTS'}</Text><Text style={s.title}>{invoices ? 'Exportă facturile' : titles[kind]}</Text></View><TouchableOpacity accessibilityLabel="Închide exportul" onPress={() => setVisible(false)} style={s.close}><X size={20} color="#CCC5CF" /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={s.body}>
            {invoices ? <>
              <Text style={s.section}>01   Ce vrei să descarci?</Text>
              {[false, true].map(value => <TouchableOpacity key={String(value)} accessibilityRole="radio" accessibilityState={{ checked: complete === value }} onPress={() => setComplete(value)} style={[s.option, complete === value && s.selected]}>{value ? <FolderArchive size={23} color="#7DD3FC" /> : <FileSpreadsheet size={23} color="#7DD3FC" />}<View style={{ flex: 1 }}><Text style={s.optionTitle}>{value ? 'Centralizator + toate facturile' : 'Doar centralizatorul'}</Text><Text style={s.hint}>{value ? 'ZIP · folder Serie-Număr cu PDF, XLSX și XML' : 'Un singur fișier Excel detaliat'}</Text></View>{complete === value && <Check size={18} color="#5EEAD4" />}</TouchableOpacity>)}
              <Text style={s.section}>02   Pentru ce perioadă?</Text><View style={s.periods}>{periods.map(option => <TouchableOpacity key={option.id} accessibilityRole="radio" accessibilityState={{ checked: period === option.id }} style={[s.period, period === option.id && s.periodActive]} onPress={() => setPeriod(option.id)}><CalendarDays size={18} color={period === option.id ? '#FFB36B' : '#7DD3FC'} /><Text style={s.periodText}>{option.label}</Text></TouchableOpacity>)}</View>
              {period === 'custom' && <View style={s.dates}><View style={{ flex: 1 }}><Text style={s.note}>DE LA</Text><TextInput accessibilityLabel="Data de început" value={from} onChangeText={setFrom} placeholder="AAAA-LL-ZZ" placeholderTextColor="#99919D" style={s.input} /></View><View style={{ flex: 1 }}><Text style={s.note}>PÂNĂ LA</Text><TextInput accessibilityLabel="Data de sfârșit" value={to} onChangeText={setTo} placeholder="AAAA-LL-ZZ" placeholderTextColor="#99919D" style={s.input} /></View></View>}
              <View style={s.summary}><Check size={20} color="#5EEAD4" /><View style={{ flex: 1 }}><Text style={s.optionTitle}>{complete ? 'Arhivă completă' : 'Centralizator Excel'}</Text><Text style={s.hint}>{dates[0] && dates[1] ? `${dates[0]} — ${dates[1]}` : period === 'custom' ? 'Completează ambele date.' : 'Toate facturile emise, inclusiv retururile.'}</Text></View></View>
              <Text style={s.note}>Exportul nu emite facturi și nu trimite documente către ANAF.</Text>
            </> : <Text style={s.hint}>Se exportă toate înregistrările, inclusiv cele inactive, cu starea și numărul produselor asociate. Fișierul include logo-ul G-Trots și antetul portocaliu.</Text>}
          </ScrollView>
          <TouchableOpacity style={s.submit} onPress={() => void download()}><FileSpreadsheet size={20} color="#FFFFFF" /><Text style={s.submitText}>Descarcă acum</Text></TouchableOpacity>
        </>}
      </View></View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  trigger: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: '#376A50', backgroundColor: '#193328' }, triggerText: { color: '#BAF1D4', fontSize: 11, fontFamily: 'Inter-SemiBold' },
  overlay: { flex: 1, backgroundColor: '#000000B8', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 }, panel: { width: '100%', maxWidth: 620, maxHeight: '100%', backgroundColor: '#1C1A1F', borderRadius: 26, padding: 20, borderWidth: 1, borderColor: '#444049' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }, icon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#233D36', justifyContent: 'center', alignItems: 'center' }, close: { padding: 8, backgroundColor: '#302D34', borderRadius: 13 }, eyebrow: { color: '#5EEAD4', fontSize: 9, letterSpacing: 1, fontFamily: 'Inter-Bold', marginBottom: 5 }, title: { color: '#F6F1F7', fontSize: 21, fontFamily: 'Inter-Bold' }, body: { gap: 10, paddingBottom: 8 }, section: { color: '#F1EBF3', fontSize: 14, fontFamily: 'Inter-Bold', marginTop: 10, marginBottom: 2 },
  hint: { color: '#B9B1BE', fontSize: 11, lineHeight: 17, marginTop: 4 }, note: { color: '#9F97A4', fontSize: 10, lineHeight: 16, marginTop: 8 }, option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 74, borderWidth: 1, borderColor: '#403B45', borderRadius: 18, backgroundColor: '#252228' }, selected: { borderColor: '#258D7C', backgroundColor: '#203735' }, optionTitle: { color: '#F1EBF3', fontFamily: 'Inter-SemiBold', fontSize: 12 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, period: { width: '31%', flexGrow: 1, minHeight: 66, borderWidth: 1, borderColor: '#403B45', borderRadius: 15, padding: 10, gap: 7 }, periodActive: { backgroundColor: '#35271E', borderColor: '#BA702E' }, periodText: { fontSize: 10, fontFamily: 'Inter-SemiBold', color: '#DED7E0' }, dates: { flexDirection: 'row', gap: 10 }, input: { color: '#FFFFFF', backgroundColor: '#28242C', borderWidth: 1, borderColor: '#49424F', borderRadius: 12, padding: 12, marginTop: 5, fontSize: 12 }, summary: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#1F312D', borderWidth: 1, borderColor: '#285A4D', borderRadius: 17, padding: 14, marginTop: 8 },
  submit: { minHeight: 50, borderRadius: 16, backgroundColor: '#128878', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 15 }, submitText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-Bold' }, busy: { alignItems: 'center', paddingVertical: 20 }, orbit: { width: 108, height: 108, justifyContent: 'center', alignItems: 'center', marginBottom: 24 }, ring: { position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 3, borderColor: '#FF900025', borderTopColor: '#FF9000', borderRightColor: '#FFB25D' }, logo: { width: 66, height: 66, borderRadius: 18 }, progressLabels: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }, percent: { color: '#FFA455', fontSize: 23, fontFamily: 'Inter-Bold' }, track: { width: '100%', height: 7, borderRadius: 4, backgroundColor: '#363039', marginTop: 12, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: '#FF9000', borderRadius: 4 },
});
