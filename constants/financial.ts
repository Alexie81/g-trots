export type SelectOption = {
  value: string;
  label: string;
  search?: string;
};

export const DEFAULT_CURRENCY = 'RON';

export const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'RON', label: 'RON - Leu romanesc', search: 'lei leu romania' },
  { value: 'EUR', label: 'EUR - Euro', search: 'euro europa' },
  { value: 'USD', label: 'USD - Dolar american', search: 'dolar sua america' },
  { value: 'GBP', label: 'GBP - Lira sterlina', search: 'lira marea britanie uk' },
  { value: 'CHF', label: 'CHF - Franc elvetian', search: 'franc elvetia' },
  { value: 'HUF', label: 'HUF - Forint maghiar', search: 'forint ungaria' },
  { value: 'BGN', label: 'BGN - Leva bulgareasca', search: 'leva bulgaria' },
  { value: 'PLN', label: 'PLN - Zlot polonez', search: 'zlot polonia' },
  { value: 'CZK', label: 'CZK - Coroana ceha', search: 'coroana cehia' },
  { value: 'MDL', label: 'MDL - Leu moldovenesc', search: 'leu moldova' },
  { value: 'UAH', label: 'UAH - Grivna ucraineana', search: 'grivna ucraina' },
  { value: 'TRY', label: 'TRY - Lira turceasca', search: 'lira turcia' },
  { value: 'CAD', label: 'CAD - Dolar canadian', search: 'dolar canada' },
  { value: 'AUD', label: 'AUD - Dolar australian', search: 'dolar australia' },
  { value: 'JPY', label: 'JPY - Yen japonez', search: 'yen japonia' },
  { value: 'CNY', label: 'CNY - Yuan chinezesc', search: 'yuan china' },
  { value: 'SEK', label: 'SEK - Coroana suedeza', search: 'coroana suedia' },
  { value: 'NOK', label: 'NOK - Coroana norvegiana', search: 'coroana norvegia' },
  { value: 'DKK', label: 'DKK - Coroana daneza', search: 'coroana danemarca' },
];

export const DEADLINE_UNIT_OPTIONS: SelectOption[] = [
  { value: 'minute', label: 'Minute' },
  { value: 'ore', label: 'Ore' },
  { value: 'zile', label: 'Zile' },
  { value: 'saptamani', label: 'Saptamani' },
  { value: 'luni', label: 'Luni' },
  { value: 'ani', label: 'Ani' },
];

export const WARRANTY_UNIT_OPTIONS: SelectOption[] = [
  { value: 'zile', label: 'Zile' },
  { value: 'saptamani', label: 'Saptamani' },
  { value: 'ani', label: 'Ani' },
];

const DURATION_UNIT_ALIASES: Record<string, string> = {
  minut: 'minute',
  minute: 'minute',
  ora: 'ore',
  ore: 'ore',
  zi: 'zile',
  zile: 'zile',
  saptamana: 'saptamani',
  saptamani: 'saptamani',
  luna: 'luni',
  luni: 'luni',
  an: 'ani',
  ani: 'ani',
};

const DURATION_LABELS: Record<string, { one: string; many: string }> = {
  minute: { one: 'minut', many: 'minute' },
  ore: { one: 'ora', many: 'ore' },
  zile: { one: 'zi', many: 'zile' },
  saptamani: { one: 'saptamana', many: 'saptamani' },
  luni: { one: 'luna', many: 'luni' },
  ani: { one: 'an', many: 'ani' },
};

export function normalizeDurationUnit(value?: string | null, fallback = 'zile') {
  const raw = String(value || '').trim().toLowerCase();
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const unit = DURATION_UNIT_ALIASES[raw] || DURATION_UNIT_ALIASES[normalized] || raw || fallback;
  return DURATION_LABELS[unit] ? unit : fallback;
}

export function sanitizeDurationNumber(value?: string | number | null) {
  const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? match[0] : '';
}

export function parseDurationText(value?: string | number | null, fallbackUnit = 'zile') {
  const raw = String(value ?? '').trim();
  const number = sanitizeDurationNumber(raw);
  const unitMatch = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/(?:^|[\d\s,.])([a-z]+)\s*$/);
  return {
    value: number,
    unit: normalizeDurationUnit(unitMatch?.[1], fallbackUnit),
  };
}

export function formatDurationLabel(value?: string | number | null, unitValue = 'zile') {
  const number = sanitizeDurationNumber(value);
  if (!number) return '';
  const unit = normalizeDurationUnit(unitValue);
  const numeric = Number(number);
  const label = DURATION_LABELS[unit] || DURATION_LABELS.zile;
  return `${number} ${Math.abs(numeric - 1) < 0.00001 ? label.one : label.many}`;
}

export function normalizeCurrency(value?: string | null) {
  const currency = String(value || DEFAULT_CURRENCY).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : DEFAULT_CURRENCY;
}

export function moneyLabel(value: number, currency?: string | null) {
  return `${Number(value || 0).toFixed(2)} ${normalizeCurrency(currency)}`;
}

export function normalizeServiceSheetWorkPrice(
  totalPriceValue: number | string | null | undefined,
  diagnosticPriceValue: number | string | null | undefined,
  clientPackagePriceValue?: number | string | null | undefined
) {
  const totalPrice = Math.max(Number(totalPriceValue) || 0, 0);
  const diagnosticPrice = Math.max(Number(diagnosticPriceValue) || 0, 0);
  return totalPrice > 0 ? totalPrice : diagnosticPrice;
}

export function calculateClientPayment(
  workPriceValue: number | string | null | undefined,
  diagnosticPriceValue: number | string | null | undefined,
  discountValue: number | string | null | undefined = 0,
  advanceValue: number | string | null | undefined = 0
) {
  const workPrice = Math.max(Number(workPriceValue) || 0, 0);
  const diagnosticPrice = Math.max(Number(diagnosticPriceValue) || 0, 0);
  const discount = Math.min(100, Math.max(Number(discountValue) || 0, 0));
  const advance = Math.max(Number(advanceValue) || 0, 0);
  const grossTotal = workPrice > 0 ? workPrice : diagnosticPrice;
  const total = Math.max(grossTotal * (1 - discount / 100), 0);
  const amountDue = Math.max(total - advance, 0);

  return {
    workPrice,
    diagnosticPrice,
    discount,
    advance,
    grossTotal,
    total,
    amountDue,
  };
}

export function isTotalOnlyPayment(
  workPriceValue: number | string | null | undefined,
  diagnosticPriceValue: number | string | null | undefined,
  advanceValue: number | string | null | undefined = 0
) {
  return false;
}

export function displayAmountDueForPayment(
  workPriceValue: number | string | null | undefined,
  diagnosticPriceValue: number | string | null | undefined,
  amountDueValue: number | string | null | undefined,
  advanceValue: number | string | null | undefined = 0
) {
  return Math.max(Number(amountDueValue) || 0, 0);
}
