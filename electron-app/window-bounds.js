'use strict';

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizedWorkArea(value) {
  const x = finiteNumber(value?.x);
  const y = finiteNumber(value?.y);
  const width = finiteNumber(value?.width);
  const height = finiteNumber(value?.height);
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function overlapArea(bounds, area) {
  const left = Math.max(bounds.x, area.x);
  const top = Math.max(bounds.y, area.y);
  const right = Math.min(bounds.x + bounds.width, area.x + area.width);
  const bottom = Math.min(bounds.y + bounds.height, area.y + area.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function clampWindowBounds(bounds, workAreas, options = {}) {
  const width = finiteNumber(bounds?.width);
  const height = finiteNumber(bounds?.height);
  if (width === null || height === null || width <= 0 || height <= 0) return null;

  const areas = (Array.isArray(workAreas) ? workAreas : []).map(normalizedWorkArea).filter(Boolean);
  if (!areas.length) return null;

  const rawX = finiteNumber(bounds?.x);
  const rawY = finiteNumber(bounds?.y);
  const candidate = {
    x: rawX ?? areas[0].x,
    y: rawY ?? areas[0].y,
    width,
    height,
  };
  const rankedAreas = areas
    .map((area, index) => ({ area, index, overlap: overlapArea(candidate, area) }))
    .sort((left, right) => right.overlap - left.overlap || left.index - right.index);
  const workArea = rankedAreas[0].overlap > 0 ? rankedAreas[0].area : areas[0];
  const minWidth = Math.min(finiteNumber(options.minWidth) ?? 720, workArea.width);
  const minHeight = Math.min(finiteNumber(options.minHeight) ?? 560, workArea.height);
  const safeWidth = Math.min(Math.max(width, minWidth), workArea.width);
  const safeHeight = Math.min(Math.max(height, minHeight), workArea.height);
  const maxX = workArea.x + workArea.width - safeWidth;
  const maxY = workArea.y + workArea.height - safeHeight;

  return {
    x: Math.round(Math.min(Math.max(candidate.x, workArea.x), maxX)),
    y: Math.round(Math.min(Math.max(candidate.y, workArea.y), maxY)),
    width: Math.round(safeWidth),
    height: Math.round(safeHeight),
  };
}

module.exports = { clampWindowBounds };
