import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Check, Eraser, Signature, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';

type Point = [number, number];
type Stroke = Point[];

type Props = {
  visible: boolean;
  value?: string | null;
  onClose: () => void;
  onSave: (signature: string) => Promise<void> | void;
};

function readSignature(value?: string | null): Stroke[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (parsed?.v !== 1 || !Array.isArray(parsed?.strokes)) return [];
    return parsed.strokes
      .filter(Array.isArray)
      .map((stroke: unknown[]) =>
        stroke
          .filter((point) => Array.isArray(point) && point.length >= 2)
          .map((point: any) => [
            Math.max(0, Math.min(1, Number(point[0]) || 0)),
            Math.max(0, Math.min(1, Number(point[1]) || 0)),
          ] as Point)
      )
      .filter((stroke: Stroke) => stroke.length >= 2);
  } catch {
    return [];
  }
}

export function hasClientSignature(value?: string | null) {
  return readSignature(value).length > 0;
}

export default function ClientSignatureModal({ visible, value, onClose, onSave }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [saving, setSaving] = useState(false);
  const activeStroke = useRef(-1);

  useEffect(() => {
    if (visible) setStrokes(readSignature(value));
  }, [visible, value]);

  const normalizedPoint = (x: number, y: number): Point => [
    Math.max(0, Math.min(1, x / Math.max(1, canvasSize.width))),
    Math.max(0, Math.min(1, y / Math.max(1, canvasSize.height))),
  ];

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const point = normalizedPoint(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY
          );
          setStrokes((current) => {
            activeStroke.current = current.length;
            return [...current, [point]];
          });
        },
        onPanResponderMove: (event) => {
          const point = normalizedPoint(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY
          );
          setStrokes((current) => {
            const index = activeStroke.current;
            if (index < 0 || !current[index]) return current;
            const stroke = current[index];
            const previous = stroke[stroke.length - 1];
            if (
              previous &&
              Math.abs(previous[0] - point[0]) + Math.abs(previous[1] - point[1]) < 0.004
            ) {
              return current;
            }
            const next = [...current];
            next[index] = [...stroke, point];
            return next;
          });
        },
        onPanResponderRelease: () => {
          activeStroke.current = -1;
        },
        onPanResponderTerminate: () => {
          activeStroke.current = -1;
        },
      }),
    [canvasSize.height, canvasSize.width]
  );

  const save = async () => {
    const validStrokes = strokes.filter((stroke) => stroke.length >= 2);
    if (!validStrokes.length || saving) return;
    setSaving(true);
    try {
      await onSave(JSON.stringify({
        v: 1,
        aspect_ratio: canvasSize.width / Math.max(1, canvasSize.height),
        strokes: validStrokes,
      }));
      onClose();
    } catch (error: any) {
      Alert.alert(
        'Eroare semnatura',
        error?.message || 'Semnatura clientului nu a putut fi salvata.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleIcon}>
              <Signature size={20} color={Colors.orange} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Semnare client</Text>
              <Text style={styles.subtitle}>Clientul semneaza cu degetul in caseta.</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={19} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View
            style={styles.canvas}
            onLayout={(event) => setCanvasSize(event.nativeEvent.layout)}
            {...panResponder.panHandlers}>
            <Svg width="100%" height="100%" pointerEvents="none">
              {strokes.map((stroke, index) => (
                <Polyline
                  key={`${index}-${stroke.length}`}
                  points={stroke
                    .map(([x, y]) => `${x * canvasSize.width},${y * canvasSize.height}`)
                    .join(' ')}
                  fill="none"
                  stroke="#17120F"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
            {!strokes.length ? (
              <View pointerEvents="none" style={styles.canvasHint}>
                <Signature size={25} color="#9A918A" />
                <Text style={styles.canvasHintText}>Semneaza aici</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.legalText}>
            Prin semnare, clientul confirma datele si conditiile din fisa de service.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setStrokes([])}
              disabled={saving}>
              <Eraser size={16} color={Colors.textSecondary} />
              <Text style={styles.clearText}>Sterge</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, !strokes.some((stroke) => stroke.length >= 2) && styles.disabled]}
              onPress={save}
              disabled={saving || !strokes.some((stroke) => stroke.length >= 2)}>
              {saving ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Check size={17} color={Colors.white} />
              )}
              <Text style={styles.saveText}>{saving ? 'Se salveaza...' : 'Salveaza semnatura'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
    backgroundColor: 'rgba(6, 5, 4, 0.82)',
  },
  card: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.orange + '55',
    gap: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.orangeDim,
  },
  headerCopy: { flex: 1, gap: 2 },
  title: { color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold' },
  subtitle: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular' },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  canvas: {
    height: 220,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D8D0C8',
    backgroundColor: '#FFFDFC',
  },
  canvasHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  canvasHintText: { color: '#9A918A', fontSize: 13, fontFamily: 'Inter-Medium' },
  legalText: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter-Regular',
  },
  actions: { flexDirection: 'row', gap: 9 },
  clearButton: {
    flex: 0.7,
    minHeight: 46,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  clearText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  saveButton: {
    flex: 1.3,
    minHeight: 46,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: Colors.orange,
  },
  disabled: { opacity: 0.45 },
  saveText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter-Bold' },
});
