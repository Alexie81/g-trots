import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Check, FileCheck2, Mail, ShieldCheck } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopInvoiceAutomationSettings } from '@/services/shopApi';

const emptySettings: ShopInvoiceAutomationSettings = {
  card_issue_enabled: false,
  card_email_enabled: false,
  cod_issue_enabled: false,
  cod_email_enabled: false,
};

type BooleanSettingKey = 'card_issue_enabled' | 'card_email_enabled' | 'cod_issue_enabled' | 'cod_email_enabled';

const AnimatedPath = Animated.createAnimatedComponent(Path);
type DrawIconKind = 'bolt' | 'card' | 'cash';

const iconPaths: Record<DrawIconKind, string> = {
  bolt: 'M13 2 4 14h7l-1 8 10-13h-7V2Z',
  card: 'M5 5h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3ZM2 10h20M6 15h4',
  cash: 'M4 7.5 12 3l8 4.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9ZM8 12h8M9.5 15h5',
};

function DrawingIcon({ kind, size, color, floating = false }: { kind: DrawIconKind; size: number; color: string; floating?: boolean }) {
  const [draw] = useState(() => new Animated.Value(0));
  const [hover] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const drawing = Animated.loop(Animated.sequence([
      Animated.timing(draw, { toValue: 1, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.delay(620),
      Animated.timing(draw, { toValue: 2, duration: 620, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
      Animated.delay(180),
      Animated.timing(draw, { toValue: 0, duration: 0, useNativeDriver: false }),
    ]));
    const hovering = floating ? Animated.loop(Animated.sequence([
      Animated.timing(hover, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(hover, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])) : null;
    drawing.start();
    hovering?.start();
    return () => { drawing.stop(); hovering?.stop(); };
  }, [draw, floating, hover]);

  const strokeDashoffset = draw.interpolate({ inputRange: [0, 1, 2], outputRange: [76, 0, -76] });
  const opacity = draw.interpolate({ inputRange: [0, 0.15, 1, 1.85, 2], outputRange: [0.25, 0.85, 1, 0.8, 0.2] });
  const animatedStyle = floating ? {
    transform: [
      { translateY: hover.interpolate({ inputRange: [0, 1], outputRange: [2, -4] }) },
      { rotate: hover.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '2deg'] }) },
    ],
  } : undefined;

  return <Animated.View style={animatedStyle}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <AnimatedPath
        d={iconPaths[kind]}
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="76 76"
        strokeDashoffset={strokeDashoffset as never}
        opacity={opacity as never}
      />
    </Svg>
  </Animated.View>;
}

export default function ShopAutomationsManager() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<ShopInvoiceAutomationSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const lastSaved = useRef<ShopInvoiceAutomationSettings>(emptySettings);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveVersion = useRef(0);

  useEffect(() => {
    if (!token) return;
    let active = true;
    shopApi.getInvoiceAutomationSettings(token).then((result) => {
      if (!active) return;
      setSettings(result);
      lastSaved.current = result;
    }).catch((error: unknown) => {
      if (active) Alert.alert('Automatizările nu s-au încărcat', error instanceof Error ? error.message : 'Încearcă din nou.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const persist = (next: ShopInvoiceAutomationSettings) => {
    if (!token) return;
    const version = ++saveVersion.current;
    setSaving(true);
    saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
      try {
        const saved = await shopApi.updateInvoiceAutomationSettings(token, next);
        lastSaved.current = saved;
        if (version === saveVersion.current) setSettings(saved);
      } catch (error) {
        if (version === saveVersion.current) {
          setSettings(lastSaved.current);
          Alert.alert('Modificarea nu s-a salvat', error instanceof Error ? error.message : 'Starea a revenit la ultima variantă salvată.');
        }
      } finally {
        if (version === saveVersion.current) setSaving(false);
      }
    });
  };

  const patch = (key: BooleanSettingKey, value: boolean) => {
    const next = { ...settings, [key]: value };
    if (key === 'card_issue_enabled' && !value) next.card_email_enabled = false;
    if (key === 'cod_issue_enabled' && !value) next.cod_email_enabled = false;
    setSettings(next);
    persist(next);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.orange} /><Text style={styles.loadingTitle}>Încărcăm automatizările</Text><Text style={styles.loadingText}>Verificăm regulile active pe server.</Text></View>;

  return <View style={styles.page}>
    <View style={styles.hero}>
      <View style={styles.heroGlow} />
      <View style={styles.heroIcon}><View style={styles.heroIconRing} /><DrawingIcon kind="bolt" size={31} color="#FFB36B" floating /></View>
      <View style={styles.heroCopy}><Text style={styles.kicker}>FLUXURI AUTOMATE</Text><Text style={styles.heroTitle}>Automatizări</Text><Text style={styles.heroText}>Facturile sunt emise de server la momentul corect, inclusiv când telefonul sau calculatorul sunt închise.</Text></View>
      <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>SERVER</Text></View>
    </View>

    <View style={styles.sectionHead}><View style={styles.sectionIcon}><FileCheck2 size={20} color="#FFB36B" /></View><View><Text style={styles.sectionKicker}>EMITERE FACTURI</Text><Text style={styles.sectionTitle}>Reguli după plată</Text></View></View>

    <AutomationGroup
      color="#60A5FA"
      icon={<DrawingIcon kind="card" size={25} color="#93C5FD" />}
      title="Plată cu cardul"
      text="Se execută după acceptarea plății și confirmarea comenzii."
      issue={{ value: settings.card_issue_enabled, onChange: (value) => patch('card_issue_enabled', value), title: 'Emite factura automat', text: 'Factura este creată după plata acceptată și comanda confirmată.' }}
      email={{ value: settings.card_email_enabled, onChange: (value) => patch('card_email_enabled', value), title: 'Trimite factura automat pe e-mail', text: 'E-mailul facturii pleacă după e-mailul de confirmare a comenzii.', disabled: !settings.card_issue_enabled }}
    />

    <AutomationGroup
      color="#34D399"
      icon={<DrawingIcon kind="cash" size={25} color="#6EE7B7" />}
      title="Plată ramburs"
      text="Se execută imediat ce o comandă ramburs intră în starea Nouă."
      issue={{ value: settings.cod_issue_enabled, onChange: (value) => patch('cod_issue_enabled', value), title: 'Emite factura automat', text: 'Factura este creată automat pentru comanda ramburs nouă.' }}
      email={{ value: settings.cod_email_enabled, onChange: (value) => patch('cod_email_enabled', value), title: 'Trimite factura automat pe e-mail', text: 'E-mailul facturii pleacă după confirmarea de primire a comenzii.', disabled: !settings.cod_issue_enabled }}
    />

    <View style={styles.safety}><ShieldCheck size={21} color="#6EE7B7" /><View style={styles.safetyCopy}><Text style={styles.safetyTitle}>Fără facturi sau e-mailuri duplicate</Text><Text style={styles.safetyText}>Fiecare comandă este procesată idempotent. Dacă un e-mail eșuează, factura rămâne emisă și trimiterea poate fi reluată fără o factură nouă.</Text></View></View>

    <View style={[styles.autosave, saving && styles.autosaveBusy]}>
      {saving ? <ActivityIndicator size="small" color="#FFB36B" /> : <View style={styles.autosaveCheck}><Check size={14} color="#071D15" strokeWidth={3} /></View>}
      <View style={styles.autosaveCopy}><Text style={styles.autosaveTitle}>{saving ? 'Se salvează automat…' : 'Setări salvate automat'}</Text><Text style={styles.autosaveText}>Orice schimbare este aplicată imediat pe telefon, desktop și magazin.</Text></View>
    </View>
  </View>;
}

type Rule = { value: boolean; onChange: (value: boolean) => void; title: string; text: string; disabled?: boolean };

function AutomationGroup({ color, icon, title, text, issue, email }: { color: string; icon: React.ReactNode; title: string; text: string; issue: Rule; email: Rule }) {
  return <View style={[styles.group, { borderColor: `${color}38` }]}>
    <View style={styles.groupHead}><View style={[styles.groupIcon, { backgroundColor: `${color}18` }]}>{icon}</View><View style={styles.groupCopy}><Text style={styles.groupTitle}>{title}</Text><Text style={styles.groupText}>{text}</Text></View></View>
    <RuleSwitch icon={<FileCheck2 size={19} color={issue.value ? color : '#8D8790'} />} {...issue} color={color} />
    <RuleSwitch icon={<Mail size={19} color={email.value ? color : '#716B73'} />} {...email} color={color} />
  </View>;
}

function RuleSwitch({ icon, title, text, value, onChange, disabled = false, color }: Rule & { icon: React.ReactNode; color: string }) {
  return <TouchableOpacity activeOpacity={disabled ? 1 : 0.78} disabled={disabled} onPress={() => onChange(!value)} style={[styles.rule, value && { borderColor: `${color}55`, backgroundColor: `${color}0D` }, disabled && styles.ruleDisabled]}>
    <View style={[styles.ruleIcon, value && { backgroundColor: `${color}18` }]}>{icon}</View>
    <View style={styles.ruleCopy}><View style={styles.ruleTitleRow}><Text style={styles.ruleTitle}>{title}</Text>{disabled ? <Text style={styles.requiredBadge}>ACTIVEAZĂ EMITEREA</Text> : value ? <Text style={[styles.activeBadge, { color, backgroundColor: `${color}18` }]}>ACTIVĂ</Text> : null}</View><Text style={styles.ruleText}>{disabled ? 'Disponibilă numai după activarea emiterii automate.' : text}</Text></View>
    <View pointerEvents="none"><Switch value={value} disabled={disabled} trackColor={{ false: '#47434A', true: `${color}99` }} thumbColor={value ? '#FFFFFF' : '#A49DA6'} ios_backgroundColor="#47434A" /></View>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  page: { gap: 13, padding: 14 },
  loading: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 9 }, loadingTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 17 }, loadingText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10 },
  hero: { minHeight: 178, position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 13, overflow: 'hidden', borderWidth: 1, borderColor: '#FF8A0040', borderRadius: 27, padding: 18, backgroundColor: '#211B18' }, heroGlow: { position: 'absolute', width: 180, height: 180, right: -75, top: -100, borderRadius: 90, backgroundColor: '#FF8A0012' }, heroIcon: { width: 60, height: 60, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FF9A2F3D', borderRadius: 20, backgroundColor: '#FF8A0018', shadowColor: '#FF8A00', shadowOpacity: 0.22, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 3 }, heroIconRing: { position: 'absolute', width: 48, height: 48, borderWidth: 1, borderColor: '#FFB36B20', borderRadius: 17, transform: [{ rotate: '12deg' }] }, heroCopy: { flex: 1, minWidth: 0 }, kicker: { color: '#FFB36B', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1 }, heroTitle: { marginTop: 5, color: '#FFF8F2', fontFamily: 'Inter-Bold', fontSize: 23 }, heroText: { marginTop: 7, color: '#B9AFAB', fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16 }, liveBadge: { position: 'absolute', top: 13, right: 13, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#34D39914' }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' }, liveText: { color: '#6EE7B7', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.7 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5, paddingHorizontal: 3 }, sectionIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FF8A0012' }, sectionKicker: { color: '#FFB36B', fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 0.9 }, sectionTitle: { marginTop: 3, color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16 },
  group: { overflow: 'hidden', borderWidth: 1, borderRadius: 24, padding: 13, backgroundColor: '#1C1B1F' }, groupHead: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 4, paddingBottom: 13 }, groupIcon: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, groupCopy: { flex: 1, minWidth: 0 }, groupTitle: { color: '#FFF9F4', fontFamily: 'Inter-Bold', fontSize: 14 }, groupText: { marginTop: 4, color: '#9E969E', fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14 },
  rule: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: '#363239', paddingVertical: 12, paddingHorizontal: 4 }, ruleDisabled: { opacity: 0.46 }, ruleIcon: { width: 41, height: 41, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FFFFFF08' }, ruleCopy: { flex: 1, minWidth: 0 }, ruleTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, ruleTitle: { flexShrink: 1, color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 15 }, ruleText: { marginTop: 5, color: '#918991', fontFamily: 'Inter-Regular', fontSize: 8.5, lineHeight: 13 }, activeBadge: { overflow: 'hidden', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 3, fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.6 }, requiredBadge: { overflow: 'hidden', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 3, color: '#B0A8B0', backgroundColor: '#FFFFFF09', fontFamily: 'Inter-Bold', fontSize: 5.8, letterSpacing: 0.45 },
  safety: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderWidth: 1, borderColor: '#34D3992E', borderRadius: 20, padding: 15, backgroundColor: '#34D3990A' }, safetyCopy: { flex: 1 }, safetyTitle: { color: '#A7F3D0', fontFamily: 'Inter-Bold', fontSize: 11.5 }, safetyText: { marginTop: 5, color: '#8EB6A7', fontFamily: 'Inter-Regular', fontSize: 8.5, lineHeight: 14 },
  autosave: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#34D3992C', borderRadius: 18, paddingHorizontal: 15, backgroundColor: '#34D39909' }, autosaveBusy: { borderColor: '#FF8A0038', backgroundColor: '#FF8A000A' }, autosaveCheck: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#6EE7B7' }, autosaveCopy: { flex: 1 }, autosaveTitle: { color: '#D9FBEA', fontFamily: 'Inter-Bold', fontSize: 10.5 }, autosaveText: { marginTop: 3, color: '#86A99B', fontFamily: 'Inter-Regular', fontSize: 7.8, lineHeight: 12 },
});
