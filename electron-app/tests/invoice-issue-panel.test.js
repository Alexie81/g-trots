'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'shop-commerce.js'), 'utf8');
const match = source.match(/function syncInvoiceIssuePanel\(\) \{[\s\S]*?\n  \}\n  async function submitInvoiceIssue/);
assert.ok(match, 'Funcția syncInvoiceIssuePanel nu a fost găsită.');
const functionSource = match[0].replace(/\n  async function submitInvoiceIssue$/, '');

const classList = { toggle() {} };
const emailToggle = { checked: false, disabled: false, closest: () => ({ classList }) };
const returnToggle = { checked: false, disabled: false, closest: () => ({ classList }) };
const output = { textContent: '' };
const confirmButton = { querySelector: () => output };
const elements = {
  'shop-invoice-issue-send-email': emailToggle,
  'shop-invoice-issue-send-return-email': returnToggle,
  'shop-invoice-issue-confirm': confirmButton,
};
const context = {
  state: { invoiceIssueOrder: { status: 'new' } },
  $: id => elements[id] || null,
};

vm.runInNewContext(`${functionSource}\nsyncInvoiceIssuePanel();`, context);
assert.equal(output.textContent, 'Emite factura');

emailToggle.checked = true;
vm.runInNewContext('syncInvoiceIssuePanel();', context);
assert.equal(output.textContent, 'Emite și trimite');

context.state.invoiceIssueOrder.status = 'return_confirmed';
vm.runInNewContext('syncInvoiceIssuePanel();', context);
assert.equal(output.textContent, 'Emite ambele');

console.log('invoice_issue_panel_test: OK');
