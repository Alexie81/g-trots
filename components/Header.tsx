import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import ModuleSwitcher from '@/components/ModuleSwitcher';

interface Props {
  title: string;
  right?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
}

export default function Header({ title, right, showBack, onBack }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        {showBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backSlot}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel="Inapoi">
            <View style={styles.backBtn}>
              <ArrowLeft size={20} color={Colors.orange} strokeWidth={2.4} />
            </View>
          </TouchableOpacity>
        ) : (
          <ModuleSwitcher />
        )}
        <Text style={styles.title}>{title}</Text>
        <View style={styles.right}>{right}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: 'rgba(20,20,20,0.78)' },
  header: {
    backgroundColor: 'rgba(20,20,20,0.78)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backSlot: {
    minWidth: 80,
    alignItems: 'flex-start',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.orangeDim,
    borderWidth: 1,
    borderColor: Colors.orangeMid,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    flex: 1,
    textAlign: 'center',
  },
  right: { minWidth: 80, alignItems: 'flex-end' },
});
