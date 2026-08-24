import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import type { SelectOption } from '@/constants/financial';

type Props = {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
};

export default function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Selecteaza',
  searchPlaceholder = 'Cauta...',
  disabled = false,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ro');
    if (!needle) return options;
    return options.filter((option) =>
      `${option.value} ${option.label} ${option.search || ''}`.toLocaleLowerCase('ro').includes(needle)
    );
  }, [options, query]);

  const close = () => {
    setVisible(false);
    setQuery('');
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.disabled]}
        onPress={() => !disabled && setVisible(true)}
        disabled={disabled}
        activeOpacity={0.8}>
        <Text style={[styles.triggerText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected?.label || value || placeholder}
        </Text>
        <ChevronDown size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.backdrop} onPress={close}>
            <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.title}>{label || placeholder}</Text>
              <TouchableOpacity style={styles.close} onPress={close}>
                <X size={19} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.search}>
              <Search size={17} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item.value === value && styles.optionSelected]}
                  onPress={() => {
                    onChange(item.value);
                    close();
                  }}>
                  <Text style={[styles.optionText, item.value === value && styles.optionTextSelected]}>
                    {item.label}
                  </Text>
                  {item.value === value ? <Check size={18} color={Colors.orange} /> : null}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Nu am gasit nicio optiune.</Text>}
            />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  wrap: { gap: 6 },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trigger: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  disabled: { opacity: 0.62 },
  triggerText: { flex: 1, color: Colors.textPrimary, fontSize: 15, fontFamily: 'Inter-Medium' },
  placeholder: { color: Colors.textMuted },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '76%',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: Colors.textPrimary, fontSize: 18, fontFamily: 'Inter-Bold' },
  close: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 13,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 15, fontFamily: 'Inter-Regular' },
  option: {
    minHeight: 50,
    paddingHorizontal: 13,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionSelected: { backgroundColor: Colors.orange + '18' },
  optionText: { flex: 1, color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter-Medium' },
  optionTextSelected: { color: Colors.orange, fontFamily: 'Inter-SemiBold' },
  empty: { color: Colors.textMuted, textAlign: 'center', paddingVertical: 28 },
});
