import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { CalendarDays, Check, FileSpreadsheet, X } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi } from '@/services/shopApi';

const periods = [
  { id: 'all', label: 'Toată perioada' },
  { id: 'year', label: 'Tot anul' },
  { id: 'six_months', label: 'Ultimele 6 luni' },
  { id: 'three_months', label: 'Ultimele 3 luni' },
  { id: 'last_month', label: 'Luna trecută' },
  { id: 'current_month', label: 'Luna curentă' },
  { id: 'custom', label: 'Perioadă personalizată' },
] as const;

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function dateRange(period: string, from: string, to: string) {
  const now = new Date();
  if (period === 'all') return ['', ''] as const;
  if (period === 'custom') return [from, to] as const;
  if (period === 'last_month') return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))] as const;
  if (period === 'year') return [iso(new Date(now.getFullYear(), 0, 1)), iso(now)] as const;
  if (period === 'current_month') return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)] as const;
  const months = period === 'six_months' ? 6 : 3;
  const start = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return [iso(start), iso(now)] as const;
}

type Estimate = { product_count: number; movement_count: number; document_count: number; estimated_seconds: number };

export default function ShopInventoryExportButton() {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 700;
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState('current_month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState('Pregătim exportul');
  const active = useRef(false);
  const spin = useRef(new Animated.Value(0)).current;
  const dates = useMemo(() => dateRange(period, from, to), [period, from, to]);

  useEffect(() => {
    if (!busy) return undefined;
    spin.setValue(0);
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1150, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [busy, spin]);

  const download = async () => {
    if (!token || active.current) return;
    if (period === 'custom' && (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)) {
      Alert.alert('Perioadă invalidă', 'Completează ambele date în format AAAA-LL-ZZ, în ordine cronologică.');
      return;
    }
    active.current = true;
    setBusy(true); setEstimate(null); setProgress(3); setElapsed(0); setStage('Numărăm produsele și documentele');
    const started = Date.now();
    let expected = 2;
    const timer = setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      setElapsed(seconds);
      setProgress(Math.min(92, Math.round(8 + 84 * (1 - Math.exp(-seconds / Math.max(1, expected))))));
    }, 220);
    try {
      const nextEstimate = await shopApi.getInventoryExportEstimate(token, dates[0], dates[1]);
      expected = Math.max(1, nextEstimate.estimated_seconds);
      setEstimate(nextEstimate); setProgress((current) => Math.max(current, 18)); setStage('Construim registrul contabil și fișele de magazie');
      const file = await shopApi.exportInventoryLedger(token, dates[0], dates[1]);
      setProgress(96); setStage('Salvăm fișierul Excel');
      const uri = `${FileSystem.cacheDirectory}${file.file_name.replace(/[\\/:*?"<>|]/g, '-')}`;
      await FileSystem.writeAsStringAsync(uri, file.content_base64, { encoding: FileSystem.EncodingType.Base64 });
      setProgress(100); setStage('Export finalizat');
      await new Promise((resolve) => setTimeout(resolve, 220));
      setVisible(false); setBusy(false);
      await Sharing.shareAsync(uri, { mimeType: file.mime_type, UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: 'Export stocuri G-Trots' });
    } catch (error) {
      Alert.alert('Export nereușit', error instanceof Error ? error.message : 'Fișierul nu a putut fi generat.');
    } finally {
      clearInterval(timer); active.current = false; setBusy(false);
    }
  };

  const remaining = estimate ? Math.max(0, Math.ceil(estimate.estimated_seconds - elapsed)) : null;
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Exportă stocurile și mișcările în Excel" style={[s.trigger, compact && s.triggerCompact]} onPress={() => setVisible(true)}>
      <FileSpreadsheet size={18} color="#9FE8C1" />{!compact ? <Text style={s.triggerText}>Exportă</Text> : null}
    </TouchableOpacity>
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!busy) setVisible(false); }}>
      <View style={[s.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}><View style={s.panel}>
        {busy ? <View style={s.busy}>
          <View style={s.orbit}><Animated.View style={[s.ring, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} /><Image source={require('../assets/images/logo.png')} style={s.logo} resizeMode="contain" /></View>
          <Text style={s.eyebrow}>EXPORT STOCURI G-TROTS</Text><Text style={s.title}>{stage}</Text>
          {estimate ? <View style={s.counts}><View><Text style={s.countValue}>{estimate.product_count}</Text><Text style={s.countLabel}>PRODUSE</Text></View><View><Text style={s.countValue}>{estimate.movement_count}</Text><Text style={s.countLabel}>MIȘCĂRI</Text></View><View><Text style={s.countValue}>{estimate.document_count}</Text><Text style={s.countLabel}>DOCUMENTE</Text></View></View> : <Text style={s.hint}>Verificăm volumul real al perioadei selectate.</Text>}
          <View style={s.progressLabels}><Text style={s.percent}>{progress}%</Text><Text style={s.hint}>{remaining === null ? 'Calculăm timpul…' : remaining > 0 ? `Timp estimat rămas: ~${remaining} sec.` : progress < 100 ? 'Finalizăm fișierul…' : 'Gata'}</Text></View>
          <View style={s.track}><View style={[s.fill, { width: `${progress}%` }]} /></View><Text style={s.note}>Timpul este o estimare bazată pe numărul real de produse, mișcări și documente.</Text>
        </View> : <>
          <View style={s.header}><View style={s.icon}><FileSpreadsheet size={24} color="#6EE7C7" /></View><View style={{ flex: 1 }}><Text style={s.eyebrow}>EXPORT CONTABIL DE STOC</Text><Text style={s.title}>Alege perioada</Text></View><TouchableOpacity accessibilityLabel="Închide exportul" onPress={() => setVisible(false)} style={s.close}><X size={20} color="#CCC5CF" /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            <Text style={s.hint}>Primești un singur Excel cu rezumat, stoc pe produse, fișe de magazie, toate mișcările, documentele-sursă și metodologia exportului.</Text>
            <Text style={s.section}>Perioada registrului</Text>
            <View style={s.periods}>{periods.map((option) => <TouchableOpacity key={option.id} accessibilityRole="radio" accessibilityState={{ checked: period === option.id }} style={[s.period, period === option.id && s.periodActive]} onPress={() => setPeriod(option.id)}><CalendarDays size={18} color={period === option.id ? '#FFB36B' : '#7DD3FC'} /><Text style={s.periodText}>{option.label}</Text>{period === option.id ? <Check size={15} color="#5EEAD4" /> : null}</TouchableOpacity>)}</View>
            {period === 'custom' ? <View style={s.dates}><View style={{ flex: 1 }}><Text style={s.note}>DE LA</Text><TextInput accessibilityLabel="Data de început" value={from} onChangeText={setFrom} placeholder="AAAA-LL-ZZ" placeholderTextColor="#99919D" style={s.input} /></View><View style={{ flex: 1 }}><Text style={s.note}>PÂNĂ LA</Text><TextInput accessibilityLabel="Data de sfârșit" value={to} onChangeText={setTo} placeholder="AAAA-LL-ZZ" placeholderTextColor="#99919D" style={s.input} /></View></View> : null}
            <View style={s.summary}><Check size={20} color="#5EEAD4" /><View style={{ flex: 1 }}><Text style={s.optionTitle}>Registru Excel complet</Text><Text style={s.hint}>{dates[0] && dates[1] ? `${dates[0]} — ${dates[1]}` : period === 'custom' ? 'Completează ambele date.' : 'Toată perioada disponibilă.'}</Text></View></View>
            <Text style={s.note}>Exportul este doar în citire: nu schimbă stocuri, facturi, comenzi sau documente NIR.</Text>
          </ScrollView>
          <TouchableOpacity style={s.submit} onPress={() => void download()}><FileSpreadsheet size={20} color="#FFFFFF" /><Text style={s.submitText}>Generează Excel</Text></TouchableOpacity>
        </>}
      </View></View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  trigger: { height: 42, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: '#376A50', backgroundColor: '#193328' }, triggerCompact: { width: 42, paddingHorizontal: 0 }, triggerText: { color: '#BAF1D4', fontSize: 10, fontFamily: 'Inter-SemiBold' },
  overlay: { flex: 1, backgroundColor: '#000000C4', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 }, panel: { width: '100%', maxWidth: 650, maxHeight: '100%', backgroundColor: '#1C1A1F', borderRadius: 26, padding: 18, borderWidth: 1, borderColor: '#444049' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }, icon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#233D36', justifyContent: 'center', alignItems: 'center' }, close: { padding: 8, backgroundColor: '#302D34', borderRadius: 13 }, eyebrow: { color: '#5EEAD4', fontSize: 9, letterSpacing: 1, fontFamily: 'Inter-Bold', marginBottom: 5 }, title: { color: '#F6F1F7', fontSize: 21, fontFamily: 'Inter-Bold' }, body: { gap: 10, paddingBottom: 8 }, section: { color: '#F1EBF3', fontSize: 14, fontFamily: 'Inter-Bold', marginTop: 10, marginBottom: 2 },
  hint: { color: '#B9B1BE', fontSize: 11, lineHeight: 17, marginTop: 4 }, note: { color: '#9F97A4', fontSize: 9, lineHeight: 15, marginTop: 8 }, periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, period: { minWidth: 145, flexGrow: 1, flexBasis: '30%', minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#403B45', borderRadius: 15, padding: 10 }, periodActive: { backgroundColor: '#35271E', borderColor: '#BA702E' }, periodText: { flex: 1, fontSize: 10, fontFamily: 'Inter-SemiBold', color: '#DED7E0' }, dates: { flexDirection: 'row', gap: 10 }, input: { color: '#FFFFFF', backgroundColor: '#28242C', borderWidth: 1, borderColor: '#49424F', borderRadius: 12, padding: 12, marginTop: 5, fontSize: 12 }, summary: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#1F312D', borderWidth: 1, borderColor: '#285A4D', borderRadius: 17, padding: 14, marginTop: 8 }, optionTitle: { color: '#F1EBF3', fontFamily: 'Inter-SemiBold', fontSize: 12 },
  submit: { minHeight: 50, borderRadius: 16, backgroundColor: '#128878', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 15 }, submitText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-Bold' }, busy: { alignItems: 'center', paddingVertical: 18 }, orbit: { width: 108, height: 108, justifyContent: 'center', alignItems: 'center', marginBottom: 22 }, ring: { position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 3, borderColor: '#FF900025', borderTopColor: '#FF9000', borderRightColor: '#FFB25D' }, logo: { width: 66, height: 66, borderRadius: 18 }, counts: { width: '100%', flexDirection: 'row', justifyContent: 'space-around', borderRadius: 18, backgroundColor: '#242127', borderWidth: 1, borderColor: '#3F3A43', paddingVertical: 14, marginTop: 16 }, countValue: { color: '#F6F1F7', fontFamily: 'Inter-Bold', fontSize: 18, textAlign: 'center' }, countLabel: { color: '#8F8794', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.7, marginTop: 4 }, progressLabels: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }, percent: { color: '#FFA455', fontSize: 23, fontFamily: 'Inter-Bold' }, track: { width: '100%', height: 7, borderRadius: 4, backgroundColor: '#363039', marginTop: 12, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: '#FF9000', borderRadius: 4 },
});
