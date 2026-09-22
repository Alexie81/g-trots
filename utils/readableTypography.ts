import { StyleSheet } from 'react-native';

const MINIMUM_FONT_SIZE = 12;
const MINIMUM_LINE_HEIGHT = 16;

let installed = false;

export function readableFontSize(value: unknown): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (value < MINIMUM_FONT_SIZE) return MINIMUM_FONT_SIZE;
  if (value < 18) return value + 2;
  return Math.round(value * 1.08 * 2) / 2;
}

export function readableLineHeight(value: unknown): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (value < MINIMUM_LINE_HEIGHT) return MINIMUM_LINE_HEIGHT;
  if (value < 24) return value + 2;
  return Math.round(value * 1.08 * 2) / 2;
}

export function installReadableTypography() {
  if (installed) return;
  installed = true;

  const globalStyleSheet = StyleSheet as typeof StyleSheet & {
    setStyleAttributePreprocessor?: (
      property: string,
      process: (nextValue: unknown) => unknown,
    ) => void;
  };

  if (typeof globalStyleSheet.setStyleAttributePreprocessor !== 'function') return;

  globalStyleSheet.setStyleAttributePreprocessor('fontSize', readableFontSize);
  globalStyleSheet.setStyleAttributePreprocessor('lineHeight', readableLineHeight);
}

