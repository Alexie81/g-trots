import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft, Check, Palette, Plus, ReceiptText, Search, Trash2, X } from 'lucide-react-native';
import { Colors, fmt } from '@/constants/colors';
import type { ClientExpenseFormData, ExpenseCategory } from '@/types';

const EXPENSE_COLORS = ['#FF6B00', '#F59E0B', '#22C55E', '#3B82F6', '#EC4899', '#14B8A6', '#EF4444', '#8B5CF6'];

type Props = {
  expenses: ExpenseCategory[];
  value: ClientExpenseFormData[];
  onChange: (value: ClientExpenseFormData[]) => void;
  onCreateExpense?: (name: string, color: string) => Promise<ExpenseCategory>;
  disabled?: boolean;
  currencyCode?: string;
};

export default function ClientExpenseSelector({
  expenses,
  value,
  onChange,
  onCreateExpense,
  disabled = false,
  currencyCode = 'RON',
}: Props) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [createPanel, setCreatePanel] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState(EXPENSE_COLORS[0]);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const selected = useMemo(
    () => value
      .map((item) => ({ item, expense: expenses.find((expense) => expense.id === item.expense_id) }))
      .filter((entry) => entry.expense),
    [expenses, value]
  );

  const available = useMemo(() => {
    const selectedIds = new Set(value.map((item) => item.expense_id));
    const query = search.trim().toLocaleLowerCase('ro');
    return expenses.filter((expense) =>
      !selectedIds.has(expense.id)
      && (!query || expense.name.toLocaleLowerCase('ro').includes(query))
    );
  }, [expenses, search, value]);

  const searchedName = search.trim().replace(/\s+/g, ' ');
  const exactMatchExists = expenses.some(
    (expense) => expense.name.trim().toLocaleLowerCase('ro') === searchedName.toLocaleLowerCase('ro')
  );
  const canCreateSearchedExpense = Boolean(onCreateExpense && searchedName && !exactMatchExists);
  const total = value.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);

  const resetModal = () => {
    setVisible(false);
    setSearch('');
    setCreatePanel(false);
    setCreateName('');
    setCreateColor(EXPENSE_COLORS[0]);
    setCreateError('');
  };

  const addExpense = (expenseId: string) => {
    if (!value.some((entry) => entry.expense_id === expenseId)) {
      onChange([...value, { expense_id: expenseId, cost: '' }]);
    }
    resetModal();
  };

  const openCreatePanel = () => {
    setCreateName(searchedName);
    setCreateColor(EXPENSE_COLORS[0]);
    setCreateError('');
    setCreatePanel(true);
  };

  const saveCreatedExpense = async () => {
    const name = createName.trim().replace(/\s+/g, ' ');
    if (!name || !onCreateExpense || creating) return;

    setCreating(true);
    setCreateError('');
    try {
      const expense = await onCreateExpense(name, createColor);
      addExpense(expense.id);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Cheltuiala nu a putut fi salvată.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <View style={[styles.card, disabled && styles.cardDisabled]}>
        <View style={styles.head}>
          <View style={styles.headCopy}>
            <ReceiptText size={18} color={Colors.orange} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Cheltuieli</Text>
              <Text style={styles.subtitle}>
                {selected.length ? `${selected.length} adăugate` : 'Nicio cheltuială adăugată'}
              </Text>
            </View>
          </View>
          {!disabled ? (
            <TouchableOpacity style={styles.addButton} onPress={() => setVisible(true)}>
              <Plus size={15} color={Colors.orange} />
              <Text style={styles.addButtonText}>Adaugă cheltuiala</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {selected.map(({ item, expense }) => (
          <View key={item.expense_id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: expense!.color }]} />
            <Text style={styles.name} numberOfLines={1}>{expense!.name}</Text>
            <View style={styles.costWrap}>
              <TextInput
                style={[styles.costInput, disabled && styles.inputDisabled]}
                value={item.cost}
                onChangeText={(cost) => onChange(value.map((entry) =>
                  entry.expense_id === item.expense_id ? { ...entry, cost } : entry
                ))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                editable={!disabled}
              />
              <Text style={styles.currency}>{currencyCode}</Text>
            </View>
            {!disabled ? (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => onChange(value.filter((entry) => entry.expense_id !== item.expense_id))}
                accessibilityLabel={`Șterge ${expense!.name}`}>
                <Trash2 size={15} color={Colors.error} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        {!selected.length ? (
          <Text style={styles.empty}>
            Alege din cheltuielile salvate în Setări și completează valoarea pentru acest client.
          </Text>
        ) : null}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total alte cheltuieli</Text>
          <Text style={styles.totalValue}>{fmt(total)} {currencyCode}</Text>
        </View>
      </View>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={resetModal}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            {createPanel ? (
              <ScrollView
                style={styles.createScroll}
                contentContainerStyle={styles.createScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.modalHead}>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => {
                      setCreatePanel(false);
                      setCreateError('');
                    }}
                    disabled={creating}
                    accessibilityLabel="Înapoi">
                    <ArrowLeft size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <View style={styles.centeredModalCopy}>
                    <Text style={styles.modalTitle}>Cheltuială nouă</Text>
                    <Text style={styles.modalSubtitle}>Se salvează și în Setări</Text>
                  </View>
                  <TouchableOpacity style={styles.closeButton} onPress={resetModal} disabled={creating} accessibilityLabel="Închide">
                    <X size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Denumire</Text>
                <TextInput
                  style={styles.nameInput}
                  value={createName}
                  onChangeText={(text) => {
                    setCreateName(text);
                    setCreateError('');
                  }}
                  placeholder="Denumirea cheltuielii"
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                  editable={!creating}
                />

                <View style={styles.paletteTitleRow}>
                  <Palette size={16} color={Colors.orange} />
                  <Text style={styles.fieldLabel}>Alege culoarea</Text>
                </View>
                <View style={styles.palette}>
                  {EXPENSE_COLORS.map((color) => {
                    const active = color === createColor;
                    return (
                      <TouchableOpacity
                        key={color}
                        style={[styles.colorButton, { backgroundColor: color }, active && styles.colorButtonActive]}
                        onPress={() => setCreateColor(color)}
                        disabled={creating}
                        accessibilityLabel={`Culoare ${color}`}>
                        {active ? <Check size={17} color={Colors.white} strokeWidth={3} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={[styles.preview, { borderColor: createColor + '66', backgroundColor: createColor + '14' }]}>
                  <View style={[styles.optionIcon, { backgroundColor: createColor + '22', borderColor: createColor + '66' }]}>
                    <ReceiptText size={17} color={createColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewLabel}>Previzualizare</Text>
                    <Text style={styles.optionName} numberOfLines={1}>{createName.trim() || 'Cheltuială nouă'}</Text>
                  </View>
                </View>

                {createError ? <Text style={styles.errorText}>{createError}</Text> : null}
                <TouchableOpacity
                  style={[styles.saveButton, (!createName.trim() || creating) && styles.saveButtonDisabled]}
                  onPress={saveCreatedExpense}
                  disabled={!createName.trim() || creating}>
                  {creating ? <ActivityIndicator size="small" color={Colors.white} /> : <Plus size={18} color={Colors.white} />}
                  <Text style={styles.saveButtonText}>{creating ? 'Se salvează...' : 'Adaugă și selectează'}</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <>
                <View style={styles.modalHead}>
                  <View>
                    <Text style={styles.modalTitle}>Adaugă cheltuiala</Text>
                    <Text style={styles.modalSubtitle}>Caută în opțiunile configurate în Setări</Text>
                  </View>
                  <TouchableOpacity style={styles.closeButton} onPress={resetModal} accessibilityLabel="Închide">
                    <X size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.search}>
                  <Search size={16} color={Colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Caută cheltuiala..."
                    placeholderTextColor={Colors.textMuted}
                    autoFocus
                  />
                </View>
                <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                  {available.map((expense) => (
                    <TouchableOpacity key={expense.id} style={styles.option} onPress={() => addExpense(expense.id)}>
                      <View style={[styles.optionIcon, { backgroundColor: expense.color + '22', borderColor: expense.color + '55' }]}>
                        <ReceiptText size={17} color={expense.color} />
                      </View>
                      <Text style={styles.optionName}>{expense.name}</Text>
                      <Plus size={18} color={Colors.orange} />
                    </TouchableOpacity>
                  ))}

                  {canCreateSearchedExpense ? (
                    <TouchableOpacity style={styles.createOption} onPress={openCreatePanel}>
                      <View style={styles.createOptionIcon}>
                        <Plus size={18} color={Colors.orange} />
                      </View>
                      <Text style={styles.createOptionText} numberOfLines={2}>
                        Adaugă cheltuiala <Text style={styles.createOptionName}>„{searchedName}”</Text>
                      </Text>
                      <Plus size={19} color={Colors.orange} />
                    </TouchableOpacity>
                  ) : null}

                  {!available.length && !canCreateSearchedExpense ? (
                    <Text style={styles.modalEmpty}>
                      {searchedName
                        ? (exactMatchExists ? 'Cheltuiala este deja adăugată sau există deja în listă.' : 'Nu există rezultate.')
                        : (expenses.length ? 'Toate cheltuielile sunt deja adăugate.' : 'Nu există cheltuieli în Setări.')}
                    </Text>
                  ) : null}
                </ScrollView>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 12, padding: 12, gap: 10 },
  cardDisabled: { backgroundColor: Colors.bg, borderColor: Colors.separator },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' },
  subtitle: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 2 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.orangeDim, borderWidth: 1, borderColor: Colors.orange + '44' },
  addButtonText: { color: Colors.orange, fontSize: 11, fontFamily: 'Inter-SemiBold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.separator, borderRadius: 10, padding: 9 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: { flex: 1, color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  costWrap: { width: 112, height: 38, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 8, paddingHorizontal: 8 },
  costInput: { flex: 1, color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter-SemiBold', textAlign: 'right', paddingVertical: 0 },
  inputDisabled: { color: Colors.textMuted },
  currency: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Bold', marginLeft: 4 },
  removeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: Colors.errorDim },
  empty: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 17 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.separator, paddingTop: 10 },
  totalLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Medium' },
  totalValue: { color: Colors.orange, fontSize: 13, fontFamily: 'Inter-Bold' },
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: 18 },
  modal: { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: Colors.cardBorder, maxHeight: '88%' },
  createScroll: { flexGrow: 0, flexShrink: 1 },
  createScrollContent: { paddingBottom: 2 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  centeredModalCopy: { flex: 1, alignItems: 'center' },
  modalTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: 'Inter-Bold' },
  modalSubtitle: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  closeButton: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 10, paddingHorizontal: 11, marginBottom: 10 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 13, paddingVertical: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.separator },
  optionIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  optionName: { flex: 1, color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  createOption: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 11, borderRadius: 11, backgroundColor: Colors.orangeDim, borderWidth: 1, borderColor: Colors.orange + '55' },
  createOptionIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orange + '18', borderWidth: 1, borderColor: Colors.orange + '55' },
  createOptionText: { flex: 1, color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Medium', lineHeight: 17 },
  createOptionName: { color: Colors.orange, fontFamily: 'Inter-Bold' },
  modalEmpty: { color: Colors.textMuted, textAlign: 'center', fontSize: 12, fontFamily: 'Inter-Regular', paddingVertical: 24 },
  fieldLabel: { color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  nameInput: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 12, marginTop: 7, marginBottom: 16 },
  paletteTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginBottom: 18 },
  colorButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  colorButtonActive: { borderColor: Colors.white, transform: [{ scale: 1.07 }] },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 11, marginBottom: 10 },
  previewLabel: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Bold', textTransform: 'uppercase', marginBottom: 2 },
  errorText: { color: Colors.error, fontSize: 11, fontFamily: 'Inter-Medium', lineHeight: 16, marginBottom: 10 },
  saveButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 11, backgroundColor: Colors.orange, marginTop: 4 },
  saveButtonDisabled: { opacity: 0.48 },
  saveButtonText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter-Bold' },
});
