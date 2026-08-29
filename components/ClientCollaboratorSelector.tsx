import React, { useMemo, useState } from 'react';
import {
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
import { Check, Plus, Search, Trash2, UsersRound, X } from 'lucide-react-native';
import { Colors, fmt } from '@/constants/colors';
import type { Collaborator, ClientCollaboratorFormData } from '@/types';
import {
  calculateCollaboratorDistribution,
  clampCollaboratorPercentage,
} from '@/utils/collaboratorFinancials';
import SwipeDownSheet from '@/components/SwipeDownSheet';

type Props = {
  collaborators: Collaborator[];
  value: ClientCollaboratorFormData[];
  onChange: (value: ClientCollaboratorFormData[]) => void;
  disabled?: boolean;
  currencyCode?: string;
  baseBeforeCollaborators?: number;
};

export default function ClientCollaboratorSelector({
  collaborators,
  value,
  onChange,
  disabled = false,
  currencyCode = 'RON',
  baseBeforeCollaborators = 0,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => value
      .map((item) => ({
        item,
        collaborator: collaborators.find((collaborator) => collaborator.id === item.collaborator_id),
      }))
      .filter((entry) => entry.collaborator),
    [collaborators, value]
  );

  const available = useMemo(() => {
    const selectedIds = new Set(value.map((item) => item.collaborator_id));
    const query = search.trim().toLocaleLowerCase('ro-RO');
    return collaborators.filter((collaborator) => {
      if (selectedIds.has(collaborator.id)) return false;
      if (!query) return true;
      return [collaborator.name, collaborator.role, collaborator.phone, collaborator.email]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('ro-RO').includes(query));
    });
  }, [collaborators, search, value]);

  const distribution = useMemo(
    () => calculateCollaboratorDistribution(value, baseBeforeCollaborators),
    [baseBeforeCollaborators, value]
  );

  const addCollaborator = (collaboratorId: string) => {
    const collaborator = collaborators.find((item) => item.id === collaboratorId);
    const percentage = clampCollaboratorPercentage(collaborator?.percentage);
    onChange([...value, {
      collaborator_id: collaboratorId,
      cost_type: percentage > 0 ? 'percentage' : 'fixed',
      percentage: percentage > 0 ? String(percentage) : '0',
      cost: '0',
      payment_status: 'de_incasat',
    }]);
  };

  const removeCollaborator = (collaboratorId: string) => {
    onChange(value.filter((item) => item.collaborator_id !== collaboratorId));
  };

  const updateItem = (collaboratorId: string, patch: Partial<ClientCollaboratorFormData>) => {
    onChange(value.map((item) =>
      item.collaborator_id === collaboratorId ? { ...item, ...patch } : item
    ));
  };

  const closePicker = () => {
    setPickerOpen(false);
    setSearch('');
  };

  return (
    <>
      <View style={[styles.card, disabled && styles.cardDisabled]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <UsersRound size={17} color={Colors.orange} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Colaboratori selectati</Text>
              <Text style={styles.subtitle}>
                {selected.length ? `${selected.length} adaugati la manopera` : 'Niciun colaborator adaugat'}
              </Text>
            </View>
          </View>
          {!disabled ? (
            <TouchableOpacity style={styles.addButton} onPress={() => setPickerOpen(true)}>
              <Plus size={15} color={Colors.white} />
              <Text style={styles.addButtonText}>Adauga colaborator</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {selected.length ? (
          <View style={styles.selectedList}>
            {selected.map(({ item, collaborator }) => {
              const calculated = distribution.rows.find(
                (row) => row.collaborator_id === item.collaborator_id
              )?.calculatedCost || 0;
              const costType = item.cost_type === 'percentage' ? 'percentage' : 'fixed';
              return (
              <View key={item.collaborator_id} style={styles.selectedRow}>
                <View style={styles.person}>
                  <View style={[styles.colorDot, { backgroundColor: collaborator!.color }]} />
                  <View style={styles.personCopy}>
                    <Text style={styles.personName}>{collaborator!.name}</Text>
                    <Text style={styles.personRole} numberOfLines={1}>
                      {collaborator!.role || 'Colaborator'}
                    </Text>
                  </View>
                </View>
                <View style={styles.financialControls}>
                  <View style={styles.typeSwitch}>
                    <TouchableOpacity
                      style={[styles.typeButton, costType === 'fixed' && styles.typeButtonActive]}
                      disabled={disabled}
                      onPress={() => updateItem(item.collaborator_id, { cost_type: 'fixed' })}>
                      <Text style={[styles.typeButtonText, costType === 'fixed' && styles.typeButtonTextActive]}>
                        Suma fixa
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.typeButton, costType === 'percentage' && styles.typeButtonActive]}
                      disabled={disabled}
                      onPress={() => updateItem(item.collaborator_id, {
                        cost_type: 'percentage',
                        percentage: item.percentage || String(clampCollaboratorPercentage(collaborator!.percentage)),
                      })}>
                      <Text style={[styles.typeButtonText, costType === 'percentage' && styles.typeButtonTextActive]}>
                        Procent NET
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.costLine}>
                    <View style={styles.costWrap}>
                      <TextInput
                        style={[styles.costInput, disabled && styles.inputDisabled]}
                        placeholder="0"
                        placeholderTextColor={Colors.textMuted}
                        value={costType === 'percentage' ? item.percentage : item.cost}
                        onChangeText={(inputValue) => updateItem(
                          item.collaborator_id,
                          costType === 'percentage'
                            ? { percentage: inputValue }
                            : { cost: inputValue }
                        )}
                        keyboardType="numeric"
                        editable={!disabled}
                      />
                      <Text style={styles.currency}>{costType === 'percentage' ? '%' : currencyCode}</Text>
                    </View>
                    <View style={styles.payoutBox}>
                      <Text style={styles.payoutLabel}>Castig</Text>
                      <Text style={styles.payoutValue}>{fmt(calculated)} {currencyCode}</Text>
                    </View>
                  </View>
                  <View style={styles.paymentSwitch}>
                    <TouchableOpacity
                      style={[
                        styles.paymentButton,
                        item.payment_status !== 'incasati' && styles.paymentButtonHold,
                      ]}
                      disabled={disabled}
                      onPress={() => updateItem(item.collaborator_id, { payment_status: 'de_incasat' })}>
                      <Text style={[
                        styles.paymentButtonText,
                        item.payment_status !== 'incasati' && styles.paymentButtonTextHold,
                      ]}>Neachitat</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.paymentButton,
                        item.payment_status === 'incasati' && styles.paymentButtonPaid,
                      ]}
                      disabled={disabled}
                      onPress={() => updateItem(item.collaborator_id, { payment_status: 'incasati' })}>
                      <Text style={[
                        styles.paymentButtonText,
                        item.payment_status === 'incasati' && styles.paymentButtonTextPaid,
                      ]}>Achitat</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {!disabled ? (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeCollaborator(item.collaborator_id)}
                    accessibilityLabel={`Sterge ${collaborator!.name} din manopera`}>
                    <Trash2 size={15} color={Colors.error} />
                  </TouchableOpacity>
                ) : null}
              </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              Apasă „Adaugă colaborator” și selectează doar persoanele implicate în lucrare.
            </Text>
          </View>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total manopera</Text>
          <Text style={styles.totalValue}>{fmt(distribution.total)} {currencyCode}</Text>
        </View>
        {value.some((item) => item.cost_type === 'percentage') ? (
          <Text style={styles.netBaseText}>
            Baza NET pentru procente: {fmt(distribution.percentageNetBase)} {currencyCode}
          </Text>
        ) : null}
      </View>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={closePicker}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SwipeDownSheet
            visible={pickerOpen}
            onClose={closePicker}
            style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Adauga colaborator</Text>
                <Text style={styles.modalSubtitle}>Selecteaza din colaboratorii salvati in Setari</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={closePicker}>
                <X size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Search size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cauta dupa nume, rol, telefon sau email"
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>

            <ScrollView
              style={styles.optionsScroll}
              contentContainerStyle={styles.optionsList}
              keyboardShouldPersistTaps="handled">
              {available.length ? available.map((collaborator) => (
                <TouchableOpacity
                  key={collaborator.id}
                  style={styles.option}
                  onPress={() => addCollaborator(collaborator.id)}>
                  <View style={[styles.optionAvatar, { backgroundColor: collaborator.color }]}>
                    <Text style={styles.optionAvatarText}>
                      {(collaborator.name || 'C').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionName}>{collaborator.name}</Text>
                    <Text style={styles.optionMeta} numberOfLines={1}>
                      {[collaborator.role, collaborator.phone, collaborator.email].filter(Boolean).join(' - ') || 'Colaborator'}
                    </Text>
                  </View>
                  <View style={styles.selectIcon}>
                    <Plus size={16} color={Colors.orange} />
                  </View>
                </TouchableOpacity>
              )) : (
                <View style={styles.modalEmpty}>
                  <Check size={20} color={Colors.success} />
                  <Text style={styles.modalEmptyTitle}>
                    {collaborators.length ? 'Toti colaboratorii potriviti sunt deja adaugati' : 'Nu exista colaboratori in Setari'}
                  </Text>
                  <Text style={styles.modalEmptyText}>
                    {collaborators.length
                      ? 'Inchide lista si completeaza valorile manoperei.'
                      : 'Adauga mai intai colaboratori din pagina Setari.'}
                  </Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.doneButton} onPress={closePicker}>
              <Text style={styles.doneButtonText}>Gata</Text>
            </TouchableOpacity>
          </SwipeDownSheet>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardDisabled: { backgroundColor: Colors.bg, borderColor: Colors.separator },
  header: { gap: 10 },
  headerCopy: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  subtitle: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 2 },
  addButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: Colors.orange,
  },
  addButtonText: { color: Colors.white, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  selectedList: { gap: 8 },
  selectedRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 9,
    borderRadius: 9,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  person: { width: 115, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  personRole: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 2 },
  financialControls: { flex: 1, minWidth: 0, gap: 7 },
  typeSwitch: {
    flexDirection: 'row',
    gap: 5,
    padding: 3,
    borderRadius: 8,
    backgroundColor: Colors.bg,
  },
  typeButton: { flex: 1, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  typeButtonActive: { backgroundColor: Colors.orangeDim, borderWidth: 1, borderColor: Colors.orange },
  typeButtonText: { color: Colors.textMuted, fontSize: 8, fontFamily: 'Inter-SemiBold' },
  typeButtonTextActive: { color: Colors.orange },
  costLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  costWrap: { width: 95, position: 'relative' },
  costInput: {
    minHeight: 40,
    paddingLeft: 10,
    paddingRight: 35,
    color: Colors.textPrimary,
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'right',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  inputDisabled: { color: Colors.textMuted, backgroundColor: Colors.bg },
  currency: {
    position: 'absolute',
    right: 8,
    top: 14,
    color: Colors.textMuted,
    fontSize: 8,
    fontFamily: 'Inter-SemiBold',
  },
  payoutBox: { flex: 1, minWidth: 0 },
  payoutLabel: { color: Colors.textMuted, fontSize: 8, fontFamily: 'Inter-Medium' },
  payoutValue: { color: Colors.success, fontSize: 11, fontFamily: 'Inter-Bold', marginTop: 2 },
  paymentSwitch: {
    flexDirection: 'row',
    gap: 6,
  },
  paymentButton: {
    flex: 1,
    minHeight: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.bg,
  },
  paymentButtonHold: {
    borderColor: Colors.warning,
    backgroundColor: Colors.warningDim,
  },
  paymentButtonPaid: {
    borderColor: Colors.success,
    backgroundColor: Colors.successDim,
  },
  paymentButtonText: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Bold' },
  paymentButtonTextHold: { color: Colors.warning },
  paymentButtonTextPaid: { color: Colors.success },
  removeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: Colors.errorDim,
  },
  emptyState: { paddingVertical: 7 },
  emptyText: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 17 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
  },
  totalLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Medium' },
  totalValue: { color: Colors.orange, fontSize: 13, fontFamily: 'Inter-Bold' },
  netBaseText: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Regular', textAlign: 'right' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  modalSheet: {
    maxHeight: '82%',
    padding: 16,
    paddingBottom: 28,
    gap: 13,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold' },
  modalSubtitle: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 3 },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: Colors.card },
  searchWrap: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Regular' },
  optionsScroll: { minHeight: 180 },
  optionsList: { gap: 8, paddingBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
  },
  optionAvatar: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  optionAvatarText: { color: Colors.white, fontSize: 14, fontFamily: 'Inter-Bold' },
  optionCopy: { flex: 1, minWidth: 0 },
  optionName: { color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  optionMeta: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Regular', marginTop: 3 },
  selectIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: Colors.orangeDim },
  modalEmpty: { alignItems: 'center', gap: 6, paddingVertical: 28, paddingHorizontal: 18 },
  modalEmptyTitle: { color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  modalEmptyText: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular', lineHeight: 16, textAlign: 'center' },
  doneButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.orange },
  doneButtonText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter-SemiBold' },
});
