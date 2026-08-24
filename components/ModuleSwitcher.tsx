import React, { useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronDown, ShoppingBag, Wrench, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAppModule, type AppModule } from '@/contexts/AppModuleContext';

const appLogo = require('../assets/images/logo.png');

const moduleOptions: { id: AppModule; title: string; description: string; Icon: typeof Wrench; color: string }[] = [
  { id: 'service', title: 'SERVICE', description: 'Clienti, fise si scanare QR', Icon: Wrench, color: Colors.orange },
  { id: 'shop', title: 'SHOP', description: 'Comenzi, produse, stoc si facturi', Icon: ShoppingBag, color: '#38BDF8' },
];

export default function ModuleSwitcher() {
  const { activeModule, selectModule } = useAppModule();
  const [visible, setVisible] = useState(false);
  const current = moduleOptions.find((option) => option.id === activeModule) || moduleOptions[0];

  const choose = async (module: AppModule) => {
    setVisible(false);
    await selectModule(module);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        activeOpacity={0.75}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={`Modul curent ${current.title}. Schimba modulul.`}>
        <Image source={appLogo} style={styles.logo} />
        <View style={styles.triggerCopy}>
          <Text style={styles.brand}>G-Trots</Text>
          <View style={styles.moduleLine}>
            <View style={[styles.dot, { backgroundColor: current.color }]} />
            <Text style={styles.moduleName}>{current.title}</Text>
            <ChevronDown size={11} color={Colors.textMuted} strokeWidth={2.5} />
          </View>
        </View>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetKicker}>G-TROTS</Text>
                <Text style={styles.sheetTitle}>Schimba modulul</Text>
                <Text style={styles.sheetSubtitle}>Alege spatiul in care vrei sa continui.</Text>
              </View>
              <TouchableOpacity style={styles.close} onPress={() => setVisible(false)}>
                <X size={19} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.options}>
              {moduleOptions.map(({ id, title, description, Icon, color }) => {
                const selected = id === activeModule;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.option, selected && styles.optionSelected]}
                    activeOpacity={0.8}
                    onPress={() => choose(id)}>
                    <View style={[styles.optionIcon, { borderColor: `${color}55`, backgroundColor: `${color}16` }]}>
                      <Icon size={22} color={color} />
                    </View>
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionTitle}>{title}</Text>
                      <Text style={styles.optionDescription}>{description}</Text>
                    </View>
                    <View style={[styles.check, selected && { borderColor: color, backgroundColor: color }]}>
                      {selected ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', minWidth: 102, gap: 7 },
  logo: { width: 30, height: 30, borderRadius: 12 },
  triggerCopy: { justifyContent: 'center' },
  brand: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-SemiBold', lineHeight: 15 },
  moduleLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  moduleName: { color: Colors.textSecondary, fontSize: 8, fontFamily: 'Inter-Bold', letterSpacing: 0.8 },
  overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.78)' },
  sheet: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 26,
    padding: 20,
    backgroundColor: '#171513',
    boxShadow: '0 30px 70px rgba(0,0,0,0.52)',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  sheetKicker: { color: Colors.orange, fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 1.5 },
  sheetTitle: { color: Colors.textPrimary, fontSize: 22, fontFamily: 'Inter-Bold', marginTop: 5 },
  sheetSubtitle: { color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 5 },
  close: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  options: { gap: 10, marginTop: 20 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 17, padding: 13, backgroundColor: 'rgba(255,255,255,0.03)' },
  optionSelected: { borderColor: 'rgba(255,107,0,0.44)', backgroundColor: 'rgba(255,107,0,0.07)' },
  optionIcon: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, minWidth: 0 },
  optionTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-Bold', letterSpacing: 0.5 },
  optionDescription: { color: Colors.textSecondary, fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 4 },
  check: { width: 21, height: 21, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
