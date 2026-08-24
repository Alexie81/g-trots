import React from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, PackageCheck, ShoppingBag, Wrench } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAppModule, type AppModule } from '@/contexts/AppModuleContext';

const appLogo = require('../assets/images/logo.png');

const modules: {
  id: AppModule;
  title: string;
  eyebrow: string;
  description: string;
  detail: string;
  Icon: typeof Wrench;
  tone: string;
}[] = [
  {
    id: 'service',
    title: 'SERVICE',
    eyebrow: 'Modul activ',
    description: 'Clienti, fise de service, scanare QR si statistici.',
    detail: 'Continua activitatea curenta',
    Icon: Wrench,
    tone: Colors.orange,
  },
  {
    id: 'shop',
    title: 'SHOP',
    eyebrow: 'Modul nou',
    description: 'Comenzi, produse, stoc si facturi intr-un singur loc.',
    detail: 'Intra in spatiul de magazin',
    Icon: ShoppingBag,
    tone: '#38BDF8',
  },
];

export default function ModuleSelectionScreen() {
  const { initializing, selectModule } = useAppModule();

  if (initializing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.orange} />
        <Text style={styles.loadingText}>Se incarca modulele...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.brand}>
          <Image source={appLogo} style={styles.logo} />
          <View>
            <Text style={styles.brandName}>G-Trots</Text>
            <Text style={styles.brandCaption}>Alege spatiul de lucru</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.kicker}>MODUL DE LUCRU</Text>
          <Text style={styles.title}>Unde vrei sa lucrezi?</Text>
          <Text style={styles.subtitle}>
            Poti schimba modulul oricand, direct din partea de sus a aplicatiei.
          </Text>
        </View>

        <View style={styles.cards}>
          {modules.map(({ id, title, eyebrow, description, detail, Icon, tone }) => (
            <TouchableOpacity
              key={id}
              activeOpacity={0.82}
              style={styles.card}
              onPress={() => selectModule(id)}
              accessibilityRole="button"
              accessibilityLabel={`Deschide modulul ${title}`}>
              <View style={[styles.iconWrap, { borderColor: `${tone}55`, backgroundColor: `${tone}16` }]}>
                <Icon size={27} color={tone} strokeWidth={2.2} />
              </View>
              <View style={styles.cardCopy}>
                <Text style={[styles.eyebrow, { color: tone }]}>{eyebrow}</Text>
                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.cardDescription}>{description}</Text>
                <View style={styles.cardAction}>
                  <Text style={styles.cardDetail}>{detail}</Text>
                  <ArrowRight size={16} color={tone} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footerNote}>
          <PackageCheck size={16} color={Colors.textSecondary} />
          <Text style={styles.footerText}>Selectia este salvata automat pe acest dispozitiv.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 22, paddingVertical: 38 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter-Medium' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 38 },
  logo: { width: 48, height: 48, borderRadius: 18 },
  brandName: { color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold' },
  brandCaption: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Medium', marginTop: 2 },
  intro: { marginBottom: 23 },
  kicker: { color: Colors.orange, fontSize: 10, fontFamily: 'Inter-Bold', letterSpacing: 1.6 },
  title: { color: Colors.textPrimary, fontSize: 29, lineHeight: 35, fontFamily: 'Inter-Bold', marginTop: 8 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20, fontFamily: 'Inter-Regular', marginTop: 9, maxWidth: 430 },
  cards: { gap: 13 },
  card: {
    flexDirection: 'row',
    gap: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 22,
    padding: 17,
    backgroundColor: 'rgba(255,255,255,0.045)',
    boxShadow: '0 18px 40px rgba(0,0,0,0.24)',
  },
  iconWrap: { width: 52, height: 52, borderWidth: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 1.1, textTransform: 'uppercase' },
  cardTitle: { color: Colors.textPrimary, fontSize: 20, fontFamily: 'Inter-Bold', letterSpacing: 0.5, marginTop: 4 },
  cardDescription: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, fontFamily: 'Inter-Regular', marginTop: 5 },
  cardAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 13 },
  cardDetail: { color: '#D8D3CE', fontSize: 10, fontFamily: 'Inter-SemiBold' },
  footerNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 },
  footerText: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular' },
});
