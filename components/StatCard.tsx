import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
}

export default function StatCard({ label, value, sub, color, icon, onPress }: Props) {
  const accent = color || Colors.orange;
  const content = (
    <>
      <View style={[styles.iconWrap, { backgroundColor: accent + '18' }]}>
        {icon}
      </View>
      <Text style={[styles.value, { color: accent }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, { borderColor: accent + '33' }]}
        onPress={onPress}
        activeOpacity={0.75}>
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, { borderColor: accent + '33' }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    alignItems: 'center',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  value: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    marginBottom: 2,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  sub: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
    textAlign: 'center',
  },
});
