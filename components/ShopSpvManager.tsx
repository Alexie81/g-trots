import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Check, CloudUpload, KeyRound, RefreshCw, Save, ShieldCheck, Unplug, Zap } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopSpvConnection, ShopSpvMode, ShopSpvSettings } from '@/services/shopApi';

const modeOptions: { value: ShopSpvMode; title: string; hint: string }[] = [
  { value: 'manual', title: 'Manual', hint: 'Trimiți din factura aleasă' },
  { value: 'on_issue', title: 'La emitere', hint: 'Intră imediat în coada ANAF' },
  { value: 'delayed', title: 'Programat', hint: 'După 1–5 zile lucrătoare' },
];

function dateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
}

function AutomationCard({ title, subtitle, mode, delay, onMode, onDelay, color }: { title: string; subtitle: string; mode: ShopSpvMode; delay: number; onMode: (value: ShopSpvMode) => void; onDelay: (value: number) => void; color: string }) {
  return <View style={[styles.automationCard, { borderColor: `${color}55` }]}>
    <View style={styles.automationHead}><View style={[styles.automationIcon, { backgroundColor: `${color}18` }]}><CloudUpload size={21} color={color} /></View><View style={styles.flex}><Text style={styles.automationTitle}>{title}</Text><Text style={styles.automationSubtitle}>{subtitle}</Text></View></View>
    <View style={styles.modeList}>{modeOptions.map((option) => <TouchableOpacity key={option.value} activeOpacity={0.72} style={[styles.modeOption, mode === option.value && { borderColor: color, backgroundColor: `${color}12` }]} onPress={() => onMode(option.value)}><View style={[styles.radio, mode === option.value && { borderColor: color, backgroundColor: color }]}>{mode === option.value ? <Check size={12} color="#141216" strokeWidth={3} /> : null}</View><View style={styles.flex}><Text style={[styles.modeTitle, mode === option.value && { color }]}>{option.title}</Text><Text style={styles.modeHint}>{option.hint}</Text></View></TouchableOpacity>)}</View>
    {mode === 'delayed' ? <View style={styles.delayBlock}><Text style={styles.delayLabel}>TRIMITE DUPĂ</Text><View style={styles.delayList}>{[1, 2, 3, 4, 5].map((day) => <TouchableOpacity key={day} style={[styles.delayButton, delay === day && { borderColor: color, backgroundColor: color }]} onPress={() => onDelay(day)}><Text style={[styles.delayText, delay === day && styles.delayTextActive]}>{day}</Text></TouchableOpacity>)}</View><Text style={styles.delayHint}>zile lucrătoare de la emitere</Text></View> : null}
  </View>;
}

export default function ShopSpvManager() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [connection, setConnection] = useState<ShopSpvConnection | null>(null);
  const [draft, setDraft] = useState<ShopSpvSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [waitingForOAuth, setWaitingForOAuth] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    try {
      const next = await shopApi.getSpvConnection(token);
      setConnection(next);
      if (next.settings) setDraft(next.settings);
      setError('');
      if (next.connected) setWaitingForOAuth(false);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Conexiunea SPV nu a putut fi verificată.'); }
    finally { if (!quiet) setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!waitingForOAuth) return;
    const timer = setInterval(() => void load(true), 3000);
    return () => clearInterval(timer);
  }, [load, waitingForOAuth]);

  const changed = useMemo(() => Boolean(connection?.settings && draft && JSON.stringify(connection.settings) !== JSON.stringify(draft)), [connection?.settings, draft]);
  const connect = async () => {
    if (!token || busy) return;
    setBusy('connect');
    try {
      const result = await shopApi.beginSpvOAuth(token);
      setWaitingForOAuth(true);
      await Linking.openURL(result.authorization_url);
    } catch (connectError) { Alert.alert('Conectarea nu a pornit', connectError instanceof Error ? connectError.message : 'Încearcă din nou.'); }
    finally { setBusy(''); }
  };
  const save = async () => {
    if (!token || !draft || busy) return;
    setBusy('save');
    try { const next = await shopApi.updateSpvSettings(token, draft); setConnection(next); if (next.settings) setDraft(next.settings); Alert.alert('Automatizări salvate', 'Coada tuturor facturilor netrimise a fost recalculată după noile reguli.'); }
    catch (saveError) { Alert.alert('Setările nu au fost salvate', saveError instanceof Error ? saveError.message : 'Încearcă din nou.'); }
    finally { setBusy(''); }
  };
  const test = async () => {
    if (!token || busy) return;
    setBusy('test');
    try { const next = await shopApi.testSpvConnection(token); setConnection(next); Alert.alert('Conexiune validă', 'ANAF a acceptat tokenul OAuth al firmei.'); }
    catch (testError) { Alert.alert('Test nereușit', testError instanceof Error ? testError.message : 'ANAF nu a răspuns.'); }
    finally { setBusy(''); }
  };
  const disconnect = () => Alert.alert('Deconectezi SPV?', 'Tokenurile criptate vor fi revocate și șterse de pe server.', [{ text: 'Renunță', style: 'cancel' }, { text: 'Deconectează', style: 'destructive', onPress: async () => { if (!token) return; setBusy('disconnect'); try { const next = await shopApi.disconnectSpv(token); setConnection(next); setDraft(null); } catch (disconnectError) { Alert.alert('Nu s-a putut deconecta', disconnectError instanceof Error ? disconnectError.message : 'Încearcă din nou.'); } finally { setBusy(''); } } }]);

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#8AB4F8" /><Text style={styles.loadingText}>Verificăm legătura securizată cu ANAF...</Text></View>;

  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]} showsVerticalScrollIndicator={false}>
    <View style={styles.hero}><View style={styles.heroOrbit} /><View style={styles.logo}><Image source={require('../assets/images/anaf-ro.png')} resizeMode="contain" style={styles.logoImage} /></View><View style={[styles.statePill, connection?.connected ? styles.stateConnected : styles.stateDisconnected]}><View style={[styles.stateDot, { backgroundColor: connection?.connected ? '#6EE7B7' : '#A8C7FA' }]} /><Text style={[styles.stateText, { color: connection?.connected ? '#6EE7B7' : '#A8C7FA' }]}>{connection?.connected ? 'CONECTAT SECURIZAT' : 'NECONECTAT'}</Text></View><Text style={styles.kicker}>CONFIGURARE ANAF</Text><Text style={styles.title}>SPV - RO e-Factura</Text><Text style={styles.heroText}>{connection?.connected ? 'Tokenurile sunt păstrate criptat pe server. Aceeași conexiune funcționează pe telefon, desktop și orice dispozitiv autentificat.' : 'Conectează o singură dată certificatul digital calificat. Certificatul și datele OAuth nu sunt salvate în aplicație.'}</Text></View>
    {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => void load()}><RefreshCw size={18} color="#FDA4AF" /></TouchableOpacity></View> : null}
    {!connection?.connected ? <View style={styles.connectCard}><View style={styles.connectIcon}><KeyRound size={25} color="#A8C7FA" /></View><Text style={styles.connectTitle}>Conectează firma la SPV</Text><Text style={styles.connectText}>{connection?.configured ? 'Vei fi redirecționat pe pagina oficială ANAF pentru alegerea certificatului. După confirmare, revino aici.' : 'Datele OAuth trebuie configurate mai întâi în zona securizată a serverului.'}</Text><TouchableOpacity disabled={!connection?.configured || Boolean(busy)} style={[styles.connectButton, (!connection?.configured || Boolean(busy)) && styles.disabled]} onPress={() => void connect()}>{busy === 'connect' ? <ActivityIndicator color="#111217" /> : <ShieldCheck size={20} color="#111217" />}<Text style={styles.connectButtonText}>{waitingForOAuth ? 'Așteptăm confirmarea ANAF' : 'Conectează SPV'}</Text></TouchableOpacity>{waitingForOAuth ? <TouchableOpacity style={styles.refreshLink} onPress={() => void load()}><RefreshCw size={16} color="#A8C7FA" /><Text style={styles.refreshText}>Am confirmat certificatul · verifică acum</Text></TouchableOpacity> : null}</View> : <>
      <View style={styles.connectionCard}><View style={styles.connectionTop}><View style={styles.connectionCheck}><ShieldCheck size={23} color="#6EE7B7" /></View><View style={styles.flex}><Text style={styles.connectionTitle}>Conexiune server activă</Text><Text style={styles.connectionMeta}>Certificat {connection.certificate_hint || 'verificat de ANAF'} · testat {dateTime(connection.last_tested_at)}</Text></View></View><View style={styles.tokenRow}><View><Text style={styles.tokenLabel}>ACCESS TOKEN</Text><Text style={styles.tokenValue}>Reînnoire automată · expiră {dateTime(connection.access_expires_at)}</Text></View></View><View style={styles.tokenRow}><View><Text style={styles.tokenLabel}>REFRESH TOKEN</Text><Text style={styles.tokenValue}>Valabil până la {dateTime(connection.refresh_expires_at)}</Text></View></View><View style={styles.connectionActions}><TouchableOpacity disabled={Boolean(busy)} style={styles.testButton} onPress={() => void test()}><RefreshCw size={16} color="#A8C7FA" /><Text style={styles.testText}>Testează</Text></TouchableOpacity><TouchableOpacity disabled={Boolean(busy)} style={styles.disconnectButton} onPress={disconnect}><Unplug size={16} color="#FDA4AF" /><Text style={styles.disconnectText}>Deconectează</Text></TouchableOpacity></View></View>
      {draft ? <><View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>MEDIU DE TRANSMITERE</Text><Text style={styles.sectionTitle}>Unde trimitem</Text></View><Zap size={21} color="#FBBF24" /></View><View style={styles.environment}><TouchableOpacity style={[styles.environmentButton, draft.environment === 'test' && styles.environmentTest]} onPress={() => setDraft({ ...draft, environment: 'test' })}><Text style={[styles.environmentText, draft.environment === 'test' && styles.environmentTextActive]}>Test ANAF</Text></TouchableOpacity><TouchableOpacity style={[styles.environmentButton, draft.environment === 'production' && styles.environmentProduction]} onPress={() => setDraft({ ...draft, environment: 'production' })}><Text style={[styles.environmentText, draft.environment === 'production' && styles.environmentTextActive]}>Producție</Text></TouchableOpacity></View>{draft.environment === 'test' ? <Text style={styles.environmentHint}>Mediul de test nu produce efecte fiscale reale. Treci în Producție numai după verificarea fluxului complet.</Text> : <Text style={[styles.environmentHint, { color: '#FCD34D' }]}>Mod Producție: documentele acceptate sunt transmise oficial în RO e-Factura.</Text>}
      <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>REGULI AUTOMATE</Text><Text style={styles.sectionTitle}>Momentul transmiterii</Text></View></View>
      <AutomationCard title="Facturi emise" subtitle="Facturile pozitive din vânzări" mode={draft.invoice_mode} delay={draft.invoice_delay_days} color="#60A5FA" onMode={(invoice_mode) => setDraft({ ...draft, invoice_mode })} onDelay={(invoice_delay_days) => setDraft({ ...draft, invoice_delay_days })} />
      <AutomationCard title="Facturi de retur" subtitle="Facturi de corecție · cod 381" mode={draft.return_mode} delay={draft.return_delay_days} color="#F472B6" onMode={(return_mode) => setDraft({ ...draft, return_mode })} onDelay={(return_delay_days) => setDraft({ ...draft, return_delay_days })} />
      <View style={styles.reminderRow}><View style={styles.flex}><Text style={styles.reminderTitle}>Alerte termen legal</Text><Text style={styles.reminderText}>Notifică atunci când mai sunt cel mult 2 zile lucrătoare din termenul legal de 5 zile.</Text></View><Switch value={draft.reminders_enabled} onValueChange={(reminders_enabled) => setDraft({ ...draft, reminders_enabled })} trackColor={{ false: '#3D3941', true: '#315C49' }} thumbColor={draft.reminders_enabled ? '#6EE7B7' : '#979198'} /></View>
      <TouchableOpacity disabled={!changed || Boolean(busy)} style={[styles.saveButton, (!changed || Boolean(busy)) && styles.disabled]} onPress={() => void save()}>{busy === 'save' ? <ActivityIndicator color="#151216" /> : <Save size={19} color="#151216" />}<Text style={styles.saveText}>Salvează și recalculează coada</Text></TouchableOpacity></> : null}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 12, padding: 15 }, flex: { flex: 1, minWidth: 0 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: Colors.bg }, loadingText: { color: Colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 11 },
  hero: { minHeight: 310, justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#35527A', borderRadius: 30, padding: 24, backgroundColor: '#18202C' }, heroOrbit: { width: 260, height: 260, position: 'absolute', right: -110, top: -105, borderWidth: 45, borderColor: '#A8C7FA0A', borderRadius: 130 }, logo: { width: 184, height: 62, overflow: 'hidden', borderRadius: 18, backgroundColor: '#FFFFFF' }, logoImage: { width: 172, height: 58, alignSelf: 'center' }, statePill: { position: 'absolute', right: 18, top: 18, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 8 }, stateConnected: { borderColor: '#6EE7B744', backgroundColor: '#6EE7B70D' }, stateDisconnected: { borderColor: '#A8C7FA33', backgroundColor: '#A8C7FA0B' }, stateDot: { width: 7, height: 7, borderRadius: 4 }, stateText: { fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.7 }, kicker: { color: '#A8C7FA', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.2, marginTop: 24 }, title: { color: '#FFF8F2', fontFamily: 'Inter-Bold', fontSize: 31, marginTop: 8 }, heroText: { maxWidth: 570, color: '#B5B0B8', fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 18, marginTop: 9 },
  errorCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#7F3344', borderRadius: 18, padding: 14, backgroundColor: '#321A21' }, errorText: { flex: 1, color: '#FDA4AF', fontFamily: 'Inter-Medium', fontSize: 10, lineHeight: 15 }, connectCard: { alignItems: 'center', borderWidth: 1, borderColor: '#3D4555', borderRadius: 26, padding: 23, backgroundColor: '#1B1C21' }, connectIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#A8C7FA14' }, connectTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 18, marginTop: 14 }, connectText: { maxWidth: 530, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7 }, connectButton: { width: '100%', minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 17, marginTop: 20, backgroundColor: '#8AB4F8' }, connectButtonText: { color: '#111217', fontFamily: 'Inter-Bold', fontSize: 12 }, disabled: { opacity: 0.45 }, refreshLink: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 12, marginTop: 6 }, refreshText: { color: '#A8C7FA', fontFamily: 'Inter-SemiBold', fontSize: 9 },
  connectionCard: { borderWidth: 1, borderColor: '#285341', borderRadius: 24, padding: 17, backgroundColor: '#17231E' }, connectionTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, connectionCheck: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#6EE7B714' }, connectionTitle: { color: '#ECFDF5', fontFamily: 'Inter-Bold', fontSize: 15 }, connectionMeta: { color: '#9AB6AA', fontFamily: 'Inter-Medium', fontSize: 9, lineHeight: 14, marginTop: 4 }, tokenRow: { borderTopWidth: 1, borderTopColor: '#FFFFFF0C', paddingTop: 12, marginTop: 12 }, tokenLabel: { color: '#6EE7B7', fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 0.9 }, tokenValue: { color: '#C4CDC8', fontFamily: 'Inter-Medium', fontSize: 9.5, marginTop: 4 }, connectionActions: { flexDirection: 'row', gap: 8, marginTop: 14 }, testButton: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#41638A', borderRadius: 14, backgroundColor: '#1C2938' }, testText: { color: '#A8C7FA', fontFamily: 'Inter-Bold', fontSize: 9 }, disconnectButton: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#733043', borderRadius: 14, backgroundColor: '#2D1920' }, disconnectText: { color: '#FDA4AF', fontFamily: 'Inter-Bold', fontSize: 9 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 4 }, sectionKicker: { color: '#8AB4F8', fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 1 }, sectionTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 18, marginTop: 4 }, environment: { flexDirection: 'row', gap: 7, borderWidth: 1, borderColor: '#39363D', borderRadius: 18, padding: 5, backgroundColor: '#1B1A1E' }, environmentButton: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 13 }, environmentTest: { borderColor: '#4672A5', backgroundColor: '#203149' }, environmentProduction: { borderColor: '#9B6A1C', backgroundColor: '#352716' }, environmentText: { color: '#918B93', fontFamily: 'Inter-Bold', fontSize: 10 }, environmentTextActive: { color: '#FFF8F2' }, environmentHint: { color: '#9F99A1', fontFamily: 'Inter-Regular', fontSize: 9.5, lineHeight: 15, paddingHorizontal: 5 },
  automationCard: { borderWidth: 1, borderRadius: 24, padding: 16, backgroundColor: '#1B1A1E' }, automationHead: { flexDirection: 'row', alignItems: 'center', gap: 11 }, automationIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, automationTitle: { color: '#FFF8F2', fontFamily: 'Inter-Bold', fontSize: 15 }, automationSubtitle: { color: '#969098', fontFamily: 'Inter-Medium', fontSize: 9, marginTop: 3 }, modeList: { gap: 7, marginTop: 14 }, modeOption: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#3A373E', borderRadius: 16, paddingHorizontal: 12, backgroundColor: '#201E22' }, radio: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#5A555D', borderRadius: 11 }, modeTitle: { color: '#D6D0D7', fontFamily: 'Inter-Bold', fontSize: 10.5 }, modeHint: { color: '#8F8991', fontFamily: 'Inter-Regular', fontSize: 8.5, marginTop: 2 }, delayBlock: { borderTopWidth: 1, borderTopColor: '#FFFFFF0B', paddingTop: 14, marginTop: 14 }, delayLabel: { color: '#8E8890', fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 0.8 }, delayList: { flexDirection: 'row', gap: 7, marginTop: 9 }, delayButton: { flex: 1, height: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#49454D', borderRadius: 13, backgroundColor: '#252329' }, delayText: { color: '#C1BBC2', fontFamily: 'Inter-Bold', fontSize: 11 }, delayTextActive: { color: '#141216' }, delayHint: { color: '#878189', fontFamily: 'Inter-Regular', fontSize: 8.5, marginTop: 8 }, reminderRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#514329', borderRadius: 21, padding: 15, backgroundColor: '#242016' }, reminderTitle: { color: '#FFF8E7', fontFamily: 'Inter-Bold', fontSize: 12 }, reminderText: { color: '#A69D87', fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14, marginTop: 4 }, saveButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 17, backgroundColor: '#8AB4F8' }, saveText: { color: '#151216', fontFamily: 'Inter-Bold', fontSize: 11 },
});
