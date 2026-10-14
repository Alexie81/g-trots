import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Colors } from '@/constants/colors';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export default function ShopPagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS }: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
}) {
  const [showPageSizes, setShowPageSizes] = useState(false);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const [pageDraft, setPageDraft] = useState(String(safePage));
  const first = total ? (safePage - 1) * pageSize + 1 : 0;
  const last = Math.min(total, safePage * pageSize);

  useEffect(() => {
    if (page !== safePage) onPageChange(safePage);
  }, [onPageChange, page, safePage]);

  useEffect(() => {
    setPageDraft(String(safePage));
  }, [safePage]);

  if (!total) return null;

  const selectPageSize = (nextPageSize: number) => {
    setShowPageSizes(false);
    if (nextPageSize === pageSize) return;
    onPageChange(1);
    onPageSizeChange(nextPageSize);
  };

  const submitPage = () => {
    const parsedPage = Number.parseInt(pageDraft, 10);
    const nextPage = Number.isFinite(parsedPage) ? Math.min(Math.max(1, parsedPage), pageCount) : safePage;
    setPageDraft(String(nextPage));
    if (nextPage !== safePage) onPageChange(nextPage);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.controls}>
        <View style={styles.summary}>
          <Text style={styles.rowsLabel}>Rânduri pe pagină:</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Rânduri pe pagină: ${pageSize}`}
            accessibilityState={{ expanded: showPageSizes }}
            style={[styles.pageSizeButton, showPageSizes && styles.pageSizeButtonOpen]}
            onPress={() => setShowPageSizes((visible) => !visible)}
          >
            <Text style={styles.pageSizeValue}>{pageSize}</Text>
            <ChevronDown size={14} color={showPageSizes ? Colors.orange : Colors.textMuted} />
          </TouchableOpacity>
          <Text accessibilityLiveRegion="polite" style={styles.range}>{first}–{last} din {total}</Text>
        </View>
        <View style={styles.navigation}>
          <View style={styles.pageJump}>
            <Text style={styles.pageJumpLabel}>Pg</Text>
            <TextInput
              accessibilityLabel={`Mergi la pagina, între 1 și ${pageCount}`}
              value={pageDraft}
              keyboardType="number-pad"
              returnKeyType="go"
              selectTextOnFocus
              maxLength={Math.max(1, String(pageCount).length)}
              style={styles.pageJumpInput}
              onChangeText={(value) => setPageDraft(value.replace(/\D/g, ''))}
              onSubmitEditing={submitPage}
              onEndEditing={submitPage}
            />
            <Text style={styles.pageJumpTotal}>/ {pageCount}</Text>
          </View>
          <View style={styles.arrows}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Pagina anterioară"
              disabled={safePage === 1}
              style={[styles.button, safePage === 1 && styles.disabled]}
              onPress={() => onPageChange(safePage - 1)}
            >
              <ChevronLeft size={19} color={safePage === 1 ? Colors.textMuted : Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Pagina următoare"
              disabled={safePage === pageCount}
              style={[styles.button, safePage === pageCount && styles.disabled]}
              onPress={() => onPageChange(safePage + 1)}
            >
              <ChevronRight size={19} color={safePage === pageCount ? Colors.textMuted : Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {showPageSizes ? (
        <View style={styles.pageSizeMenu} accessibilityRole="menu">
          {pageSizeOptions.map((option) => {
            const selected = option === pageSize;
            return (
              <TouchableOpacity
                key={option}
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
                style={[styles.pageSizeOption, selected && styles.pageSizeOptionSelected]}
                onPress={() => selectPageSize(option)}
              >
                <Text style={[styles.pageSizeOptionText, selected && styles.pageSizeOptionTextSelected]}>{option}</Text>
                {selected ? <Check size={14} color={Colors.orange} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: '#302D34', borderRadius: 18, padding: 8, backgroundColor: '#1B1B1F', marginTop: 10 },
  controls: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8, rowGap: 6 },
  summary: { flexDirection: 'row', alignItems: 'center' },
  navigation: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  rowsLabel: { flexShrink: 1, color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10 },
  pageSizeButton: { minWidth: 48, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: 'transparent', borderRadius: 11, marginLeft: 5, backgroundColor: '#27252B' },
  pageSizeButtonOpen: { borderColor: 'rgba(255,107,0,0.55)', backgroundColor: 'rgba(255,107,0,0.08)' },
  pageSizeValue: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  range: { minWidth: 78, marginLeft: 12, color: Colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 10, textAlign: 'center' },
  pageJump: { minHeight: 36, flexShrink: 0, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 4 },
  pageJumpLabel: { color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 9 },
  pageJumpInput: { width: 42, height: 34, borderWidth: 1, borderColor: '#49454F', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 0, color: Colors.textPrimary, backgroundColor: '#27252B', fontFamily: 'Inter-Bold', fontSize: 11, textAlign: 'center' },
  pageJumpTotal: { color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 9 },
  arrows: { flexDirection: 'row', marginLeft: 2 },
  button: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  disabled: { opacity: 0.28 },
  pageSizeMenu: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, borderTopWidth: 1, borderTopColor: '#302D34', paddingTop: 8, marginTop: 5 },
  pageSizeOption: { minWidth: 52, minHeight: 36, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: '#38353C', borderRadius: 11, backgroundColor: '#242228' },
  pageSizeOptionSelected: { borderColor: 'rgba(255,107,0,0.48)', backgroundColor: 'rgba(255,107,0,0.1)' },
  pageSizeOptionText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  pageSizeOptionTextSelected: { color: Colors.orange },
});
