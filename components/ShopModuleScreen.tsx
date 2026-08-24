import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart3, Boxes, FileText, Package, ShoppingCart, Sparkles } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import Header from '@/components/Header';

const areas = [
  { title: 'Comenzi', description: 'Fluxul comenzilor si statusurile lor.', Icon: ShoppingCart, color: '#38BDF8' },
  { title: 'Produse', description: 'Catalog, preturi si informatii comerciale.', Icon: Package, color: '#A78BFA' },
  { title: 'Stoc', description: 'Cantitati, miscari si alerte de stoc.', Icon: Boxes, color: '#22C55E' },
  { title: 'Facturi', description: 'Documentele si situatia incasarilor.', Icon: FileText, color: '#F59E0B' },
];

export default function ShopModuleScreen() {
  return (
    <View style={styles.container}>
      <Header title="" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Sparkles size={21} color="#38BDF8" />
          </View>
          <Text style={styles.kicker}>MODUL NOU</Text>
          <Text style={styles.title}>SHOP</Text>
          <Text style={styles.subtitle}>
            Spatiul pentru vanzari este pregatit. Aici vom construi gestionarea comenzilor,
            produselor, stocului si facturilor.
          </Text>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Structura initiala pregatita</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionKicker}>SPATII DE LUCRU</Text>
            <Text style={styles.sectionTitle}>Administrare magazin</Text>
          </View>
          <BarChart3 size={20} color={Colors.textMuted} />
        </View>

        <View style={styles.grid}>
          {areas.map(({ title, description, Icon, color }) => (
            <View key={title} style={styles.card}>
              <View style={[styles.cardIcon, { borderColor: `${color}44`, backgroundColor: `${color}14` }]}>
                <Icon size={22} color={color} />
              </View>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.cardDescription}>{description}</Text>
              <Text style={[styles.cardState, { color }]}>URMEAZA</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 38 },
  hero: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.22)',
    borderRadius: 24,
    padding: 22,
    backgroundColor: 'rgba(56,189,248,0.065)',
  },
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
  card: { width: '48%', minHeight: 178, flexGrow: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 19, padding: 15, backgroundColor: 'rgba(255,255,255,0.035)' },
  cardIcon: { width: 42, height: 42, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  cardTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-Bold' },
  cardDescription: { flex: 1, color: Colors.textSecondary, fontSize: 10, lineHeight: 15, fontFamily: 'Inter-Regular', marginTop: 5 },
  cardState: { fontSize: 8, fontFamily: 'Inter-Bold', letterSpacing: 1.1, marginTop: 11 },
});
