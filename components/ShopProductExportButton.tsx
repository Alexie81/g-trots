import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { FileSpreadsheet, X } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopProductSource } from '@/services/shopApi';

export default function ShopProductExportButton({ sources, total }: { sources: ShopProductSource[]; total: number }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState('');
  const spin = useRef(new Animated.Value(0)).current;
  const active = useRef(false);
  const count = sources.reduce((sum, source) => sum + (selected.includes(source.id) ? source.product_count : 0), 0)
    + (selected.includes('__unassigned') ? Math.max(0, total - sources.reduce((sum, source) => sum + source.product_count, 0)) : 0);
  const estimate = Math.max(3, Math.ceil(count * 0.014));

  useEffect(() => {
    if (!busy) return;
    spin.setValue(0);
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [busy, spin]);

  const open = () => {
    setSelected([...sources.map(source => source.id), '__unassigned']);
    setVisible(true);
  };
  const exportFile = async () => {
    if (!token || active.current || !selected.length) return;
    active.current = true;
    setBusy(true); setProgress(0); setElapsed(0); setStage('Centralizăm produsele și furnizorii…');
    const started = Date.now();
    const timer = setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      setElapsed(seconds);
      setProgress(value => Math.max(value, Math.min(92, Math.round(92 * (1 - Math.exp(-seconds / estimate))))));
      setStage('Pregătim catalogul XLSX și imaginile produselor…');
    }, 400);
    let uri: string | null = null;
    try {
      const all = selected.length === sources.length + 1;
      const file = await shopApi.exportProducts(token, all ? null : selected);
      clearInterval(timer);
      setProgress(96); setStage('Salvăm fișierul pe dispozitiv…');
      uri = `${FileSystem.cacheDirectory}${file.file_name.replace(/[\\/:*?"<>|]/g, '-')}`;
      await FileSystem.writeAsStringAsync(uri, file.content_base64, { encoding: FileSystem.EncodingType.Base64 });
      setProgress(100); setStage(`${file.product_count} produse · Export finalizat`);
      await new Promise(resolve => setTimeout(resolve, 200));
      setBusy(false); setVisible(false);
      await Sharing.shareAsync(uri, { mimeType: file.mime_type, UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: 'Export produse G-Trots' });
    } catch (error) {
      Alert.alert('Export nereușit', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      clearInterval(timer); setBusy(false); active.current = false;
    }
  };

  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Exportă produse în XLSX" style={styles.trigger} onPress={open}>
      <FileSpreadsheet size={20} color="#8BE3B8" /><Text style={styles.triggerText}>Exportă</Text>
    </TouchableOpacity>
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!busy) setVisible(false); }}>
      <View style={[styles.overlay, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.panel}>
          {busy ? <View style={styles.progressPanel}>
            <View style={styles.orbit}><Animated.View style={[styles.ring, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} /><Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" /></View>
            <Text style={styles.eyebrow}>EXPORT XLSX</Text><Text style={styles.title}>Pregătim catalogul</Text><Text style={styles.description}>{stage}</Text>
            <View style={styles.progressLabels}><Text style={styles.percent}>{progress}%</Text><Text style={styles.eta}>{elapsed < estimate ? `Estimare: ~${Math.max(1, Math.ceil(estimate - elapsed))} secunde` : 'Catalog mare · procesarea continuă…'}</Text></View>
            <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>
            <Text style={styles.note}>Progres estimat până la primirea fișierului.</Text>
          </View> : <>
            <View style={styles.header}><View style={styles.fileIcon}><FileSpreadsheet size={25} color="#8BE3B8" /></View><View style={{ flex: 1 }}><Text style={styles.eyebrow}>CATALOG G-TROTS</Text><Text style={styles.title}>Exportă produse</Text></View><TouchableOpacity accessibilityLabel="Închide exportul" onPress={() => setVisible(false)} style={styles.close}><X size={20} color="#CCC5CF" /></TouchableOpacity></View>
            <Text style={styles.description}>Alege sursele incluse în fișier. Se exportă toate produsele din sursele selectate.</Text>
            <View style={styles.selectAll}><Text style={styles.sourceTitle}>Toate sursele</Text><Switch accessibilityLabel="Toate sursele" value={selected.length === sources.length + 1} onValueChange={value => setSelected(value ? [...sources.map(source => source.id), '__unassigned'] : [])} trackColor={{ false: '#4D4851', true: '#198754' }} /></View>
            <ScrollView style={styles.sources} contentContainerStyle={{ paddingBottom: 8 }}>
              {[...sources, { id: '__unassigned', name: 'Fără sursă asociată', domain: 'Produse fără o sursă selectată', product_count: null }].map(source => <View key={source.id} style={styles.source}><View style={{ flex: 1 }}><Text style={styles.sourceTitle}>{source.name}</Text><Text style={styles.sourceMeta}>{source.product_count !== null ? `${source.product_count} produse · ` : ''}{source.domain}</Text></View><Switch accessibilityLabel={`Exportă ${source.name}`} value={selected.includes(source.id)} onValueChange={value => setSelected(current => value ? [...current, source.id] : current.filter(id => id !== source.id))} trackColor={{ false: '#4D4851', true: '#198754' }} /></View>)}
            </ScrollView>
            <Text style={styles.note}>Imagini, stocuri, vânzări, vizualizări, coduri și furnizori grupați pe produs.</Text>
            <TouchableOpacity disabled={!selected.length} style={[styles.submit, !selected.length && { opacity: 0.4 }]} onPress={() => void exportFile()}><FileSpreadsheet size={20} color="#FFFFFF" /><Text style={styles.submitText}>Exportă XLSX</Text></TouchableOpacity>
          </>}
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 15, borderWidth: 1, borderColor: '#376A50', backgroundColor: '#193328' }, triggerText: { color: '#BAF1D4', fontSize: 11, fontFamily: 'Inter-SemiBold' },
  overlay: { flex: 1, backgroundColor: '#000000B8', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }, panel: { width: '100%', maxWidth: 520, maxHeight: '100%', backgroundColor: '#1C1A1F', borderRadius: 26, padding: 20, borderWidth: 1, borderColor: '#444049' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 }, fileIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#233D30', justifyContent: 'center', alignItems: 'center' }, close: { padding: 8, backgroundColor: '#302D34', borderRadius: 13 }, eyebrow: { color: '#FFAB65', fontSize: 9, letterSpacing: 1, fontFamily: 'Inter-Bold', marginBottom: 5 }, title: { color: '#F6F1F7', fontSize: 20, fontFamily: 'Inter-Bold' }, description: { color: '#BBB4BF', fontSize: 12, lineHeight: 19, marginTop: 6, marginBottom: 14 },
  selectAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#38343C' }, sources: { maxHeight: 300, flexShrink: 1 }, source: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#302C34' }, sourceTitle: { color: '#F1EBF3', fontSize: 13, fontFamily: 'Inter-SemiBold' }, sourceMeta: { color: '#9F97A4', fontSize: 10, marginTop: 5 }, note: { color: '#9F97A4', fontSize: 10, lineHeight: 16, marginTop: 12 },
  submit: { minHeight: 50, borderRadius: 16, backgroundColor: '#198754', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18 }, submitText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-Bold' },
  progressPanel: { paddingVertical: 22, alignItems: 'center' }, orbit: { width: 108, height: 108, justifyContent: 'center', alignItems: 'center', marginBottom: 22 }, ring: { position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 3, borderColor: '#FF8A0025', borderTopColor: '#FF8A00', borderRightColor: '#FFB25D' }, logo: { width: 66, height: 66, borderRadius: 18 }, progressLabels: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }, percent: { color: '#FFA455', fontSize: 23, fontFamily: 'Inter-Bold' }, eta: { color: '#B9B1BE', fontSize: 10 }, track: { width: '100%', height: 7, borderRadius: 4, backgroundColor: '#363039', marginTop: 12, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: '#FF8A00', borderRadius: 4 },
});
