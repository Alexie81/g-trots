import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Colors } from '@/constants/colors';

export const TABLE_PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100] as const;

function TablePagination({ page, pageSize, total, loading = false, onPageChange, onPageSizeChange }: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const [menuVisible, setMenuVisible] = useState(false);
  const pendingPageRef = useRef<number | null>(null);
  const pendingReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pages);
  const first = total ? (safePage - 1) * pageSize + 1 : 0;
  const last = Math.min(total, safePage * pageSize);

  const releasePendingPage = useCallback(() => {
    pendingPageRef.current = null;
    if (pendingReleaseRef.current) {
      clearTimeout(pendingReleaseRef.current);
      pendingReleaseRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (pendingPageRef.current === safePage) releasePendingPage();
  }, [releasePendingPage, safePage]);

  useEffect(() => releasePendingPage, [releasePendingPage]);

  const requestPage = useCallback((targetPage: number) => {
    if (targetPage < 1 || targetPage > pages || pendingPageRef.current === targetPage) return;
    pendingPageRef.current = targetPage;
    if (pendingReleaseRef.current) clearTimeout(pendingReleaseRef.current);
    // Impiedica doar dublul tap accidental. Un cache-hit elibereaza imediat
    // blocajul cand `page` se actualizeaza, iar o cerere esuata poate fi reluata rapid.
    pendingReleaseRef.current = setTimeout(releasePendingPage, 650);
    onPageChange(targetPage);
  }, [onPageChange, pages, releasePendingPage]);

  if (!total) return null;

  return (
    <View style={styles.card}>
      <View style={styles.mainRow}>
        <View style={styles.sizeGroup}>
          <Text style={styles.caption}>AFIȘARE</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Afișare ${pageSize} rezultate pe pagină`}
            accessibilityState={{ expanded: menuVisible }}
            activeOpacity={0.76}
            style={[styles.sizeButton, menuVisible && styles.sizeButtonOpen]}
            onPress={() => setMenuVisible((current) => !current)}>
            <Text style={styles.sizeValue}>{pageSize}</Text>
            <ChevronDown size={14} color={menuVisible ? Colors.orange : Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.rangeGroup}>
          {loading ? <ActivityIndicator size="small" color={Colors.orange} /> : <Text accessibilityLiveRegion="polite" style={styles.range}>{first}–{last} din {total}</Text>}
          <Text style={styles.page}>Pagina {safePage} din {pages}</Text>
        </View>

        <View style={styles.arrows}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Pagina precedentă" disabled={safePage <= 1} style={[styles.arrow, safePage <= 1 && styles.disabled]} onPress={() => requestPage(safePage - 1)}><ChevronLeft size={20} color={Colors.textSecondary} /></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Pagina următoare" disabled={safePage >= pages} style={[styles.arrow, safePage >= pages && styles.disabled]} onPress={() => requestPage(safePage + 1)}><ChevronRight size={20} color={Colors.textSecondary} /></TouchableOpacity>
        </View>
      </View>

      {menuVisible ? <View style={styles.sizeMenu} accessibilityRole="menu">{TABLE_PAGE_SIZE_OPTIONS.map((option) => {
        const active = option === pageSize;
        return <TouchableOpacity key={option} accessibilityRole="menuitem" accessibilityState={{ selected: active }} activeOpacity={0.75} style={[styles.sizeOption, active && styles.sizeOptionActive]} onPress={() => { setMenuVisible(false); if (!active) onPageSizeChange(option); }}><Text style={[styles.sizeOptionText, active && styles.sizeOptionTextActive]}>{option}</Text>{active ? <Check size={14} color={Colors.orange} strokeWidth={2.6} /> : null}</TouchableOpacity>;
      })}</View> : null}
    </View>
  );
}

export default memo(TablePagination);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#302D34', borderRadius: 18, padding: 8, backgroundColor: '#1B1B1F', marginTop: 10, marginHorizontal: 14, marginBottom: 18 },
  mainRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sizeGroup: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  caption: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.75 },
  sizeButton: { minWidth: 48, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: '#3A373E', borderRadius: 11, backgroundColor: '#27252B' },
  sizeButtonOpen: { borderColor: 'rgba(255,107,0,0.5)', backgroundColor: 'rgba(255,107,0,0.08)' },
  sizeValue: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  rangeGroup: { minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'center' },
  range: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  page: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 2 },
  arrows: { flexDirection: 'row', gap: 2 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#252329' },
  disabled: { opacity: 0.28 },
  sizeMenu: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#39363D', paddingTop: 8, marginTop: 5 },
  sizeOption: { minWidth: 48, minHeight: 36, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#38353C', borderRadius: 11, backgroundColor: '#242228' },
  sizeOptionActive: { borderColor: 'rgba(255,107,0,0.44)', backgroundColor: 'rgba(255,107,0,0.1)' },
  sizeOptionText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  sizeOptionTextActive: { color: Colors.orange, fontFamily: 'Inter-Bold' },
});
