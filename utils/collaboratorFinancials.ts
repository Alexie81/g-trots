import type { ClientCollaboratorFormData } from '@/types';

export type CollaboratorDistributionRow = ClientCollaboratorFormData & {
  calculatedCost: number;
};

export type CollaboratorDistribution = {
  rows: CollaboratorDistributionRow[];
  fixedTotal: number;
  percentageNetBase: number;
  total: number;
};

export function clampCollaboratorPercentage(value: string | number | null | undefined) {
  const numeric = Number(value || 0);
  return Math.min(100, Math.max(0, Number.isFinite(numeric) ? numeric : 0));
}

export function calculateCollaboratorDistribution(
  items: ClientCollaboratorFormData[],
  baseBeforeCollaborators: number
): CollaboratorDistribution {
  const safeBase = Math.max(Number(baseBeforeCollaborators) || 0, 0);
  const fixedTotal = items.reduce(
    (sum, item) => item.cost_type === 'percentage'
      ? sum
      : sum + Math.max(parseFloat(item.cost) || 0, 0),
    0
  );
  const percentageNetBase = Math.max(safeBase - fixedTotal, 0);
  const rows = items.map((item) => {
    const calculatedCost = item.cost_type === 'percentage'
      ? percentageNetBase * (clampCollaboratorPercentage(item.percentage) / 100)
      : Math.max(parseFloat(item.cost) || 0, 0);
    return { ...item, calculatedCost };
  });

  return {
    rows,
    fixedTotal,
    percentageNetBase,
    total: rows.reduce((sum, item) => sum + item.calculatedCost, 0),
  };
}
