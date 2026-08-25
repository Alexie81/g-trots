import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Colors } from '@/constants/colors';

export default function ShopPagination({ page, pageSize, total, onPageChange }: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const first = (safePage - 1) * pageSize + 1;
  const last = Math.min(total, safePage * pageSize);
  return (
    <View style={styles.wrap}>
      <TouchableOpacity disabled={safePage === 1} style={[styles.button, safePage === 1 && styles.disabled]} onPress={() => onPageChange(safePage - 1)}>
        <ChevronLeft size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
      <View style={styles.copy}><Text style={styles.page}>Pagina {safePage} din {pageCount}</Text><Text style={styles.range}>{first}–{last} din {total}</Text></View>
      <TouchableOpacity disabled={safePage === pageCount} style={[styles.button, safePage === pageCount && styles.disabled]} onPress={() => onPageChange(safePage + 1)}>
        <ChevronRight size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 13, borderRadius: 18, padding: 8, backgroundColor: '#1B1B1F', marginTop: 10 },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#2B292F' },
  disabled: { opacity: 0.32 },
  copy: { minWidth: 110, alignItems: 'center' },
  page: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  range: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 },
});
