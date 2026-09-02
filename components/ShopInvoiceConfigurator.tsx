import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ReceiptText, Settings2, Sparkles } from 'lucide-react-native';
import { Colors } from '@/constants/colors';

type Props = {
  bottomInset?: number;
};

export default function ShopInvoiceConfigurator({ bottomInset = 0 }: Props) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: 112 + bottomInset }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <View style={styles.iconStage}>
            <View style={styles.invoiceIcon}>
              <ReceiptText size={34} color="#FDBA74" strokeWidth={1.8} />
            </View>
            <View style={styles.settingsIcon}>
              <Settings2 size={20} color={Colors.white} strokeWidth={2.2} />
            </View>
          </View>
          <View style={styles.status}><View style={styles.statusDot} /><Text style={styles.statusText}>PAGINĂ PREGĂTITĂ</Text></View>
          <Text style={styles.kicker}>DOCUMENTE COMERCIALE</Text>
          <Text style={styles.title}>Configurator factură</Text>
          <Text style={styles.subtitle}>Spațiul dedicat configurării facturilor este creat. Îl vom completa în următorul pas, după indicațiile tale.</Text>
        </View>

        <View style={styles.workspace}>
          <View style={styles.workspaceIcon}><Sparkles size={22} color="#FDBA74" /></View>
          <Text style={styles.workspaceKicker}>URMĂTORUL PAS</Text>
          <Text style={styles.workspaceTitle}>Așteaptă configurarea</Text>
          <Text style={styles.workspaceText}>Pagina este separată de lista facturilor și poate primi propriile setări, previzualizări și controale fără să afecteze documentele existente.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16 },
  shell: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 14 },
  hero: {
    minHeight: 310,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(251,146,60,0.22)',
    padding: 24,
    backgroundColor: '#211C1A',
  },
  iconStage: { width: 82, height: 82, marginBottom: 28 },
  invoiceIcon: {
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(251,146,60,0.32)',
    backgroundColor: 'rgba(251,146,60,0.10)',
  },
  settingsIcon: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#211C1A',
    backgroundColor: '#F97316',
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: 'rgba(34,197,94,0.11)' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  statusText: { color: '#86EFAC', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.1 },
  kicker: { color: '#FB923C', fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 1.4 },
  title: { marginTop: 7, color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 29, letterSpacing: -0.8 },
  subtitle: { maxWidth: 570, marginTop: 10, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 21 },
  workspace: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 26,
    backgroundColor: '#1B1B1F',
  },
  workspaceIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 17, marginBottom: 14, backgroundColor: 'rgba(251,146,60,0.10)' },
  workspaceKicker: { color: '#FB923C', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.2 },
  workspaceTitle: { marginTop: 7, color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 17 },
  workspaceText: { maxWidth: 520, marginTop: 8, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 18, textAlign: 'center' },
});
