export const Colors = {
  bg: '#0A0A0A',
  surface: '#141414',
  card: '#1C1C1C',
  cardBorder: '#2A2A2A',

  orange: '#FF6B00',
  orangeLight: '#FF8C38',
  orangeDim: '#FF6B0022',
  orangeMid: '#FF6B0044',

  white: '#FFFFFF',
  textPrimary: '#F5F5F5',
  textSecondary: '#9A9A9A',
  textMuted: '#5A5A5A',

  success: '#22C55E',
  successDim: '#22C55E22',
  warning: '#F59E0B',
  warningDim: '#F59E0B22',
  error: '#EF4444',
  errorDim: '#EF444422',

  statusInteresat: '#3B82F6',
  statusVaFolosi: '#22C55E',
  statusFolosit: '#22C55E',

  separator: '#1E1E1E',
  overlay: 'rgba(0,0,0,0.7)',
};

export const StatusColors: Record<string, string> = {
  interesat: Colors.statusInteresat,
  va_folosi_codul: Colors.statusVaFolosi,
  cod_folosit: Colors.statusFolosit,
};

export const StatusLabels: Record<string, string> = {
  interesat: 'Interesat',
  va_folosi_codul: 'Cod QR Generat',
  cod_folosit: 'Cod Folosit',
};

/** 1 decimal max, trailing zero dropped: 1500 → "1500", 1500.5 → "1500.5" */
export function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r | 0) : r.toFixed(1);
}
