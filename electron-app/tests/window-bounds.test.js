'use strict';

const assert = require('node:assert/strict');
const { clampWindowBounds } = require('../window-bounds');

const laptopArea = { x: 0, y: 0, width: 1366, height: 728 };
assert.deepEqual(
  clampWindowBounds({ x: 193, y: 80, width: 980, height: 1000 }, [laptopArea]),
  { x: 193, y: 0, width: 980, height: 728 },
  'Fereastra înaltă trebuie limitată la zona de lucru deasupra taskbarului.',
);

assert.deepEqual(
  clampWindowBounds({ x: 1200, y: 650, width: 900, height: 700 }, [laptopArea]),
  { x: 466, y: 28, width: 900, height: 700 },
  'Fereastra trebuie repoziționată complet în zona vizibilă.',
);

const primary = { x: 0, y: 0, width: 1366, height: 728 };
const secondary = { x: 1366, y: 0, width: 1920, height: 1040 };
assert.deepEqual(
  clampWindowBounds({ x: 1700, y: 100, width: 1200, height: 820 }, [primary, secondary]),
  { x: 1700, y: 100, width: 1200, height: 820 },
  'Fereastra deja vizibilă pe monitorul secundar nu trebuie mutată.',
);

assert.deepEqual(
  clampWindowBounds({ x: 5000, y: 5000, width: 1000, height: 800 }, [primary, secondary]),
  { x: 366, y: 0, width: 1000, height: 728 },
  'O fereastră rămasă pe un monitor deconectat trebuie readusă pe ecranul principal.',
);

console.log('window_bounds_test: OK');
