const assert = require('assert');
require('./harness.js');

function makeElement(tag, props, children) {
  var el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: (props && props.class) || '',
    value: (props && props.value !== undefined) ? props.value : '',
    style: {},
    attributes: {},
    children: [],
    events: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    addEventListener: function (evt, fn) { this.events[evt] = fn; },
    click: function () { if (this.events.click) this.events.click({ stopPropagation: function () {} }); },
    remove: function () {},
    appendChild: function (child) {
      if (typeof child === 'string') this.children.push({ nodeType: 3, text: child });
      else if (child) this.children.push(child);
      return child;
    },
    querySelector: function (sel) {
      for (var i = 0; i < this.children.length; i++) {
        var c = this.children[i];
        if (c.className && c.className.indexOf(sel.replace('.', '')) > -1) return c;
        if (c.tagName && c.tagName.toLowerCase() === sel.toLowerCase()) return c;
      }
      return null;
    },
    querySelectorAll: function () { return []; }
  };
  if (props) {
    if (props.id) el.id = props.id;
    if (props.value !== undefined) el.value = props.value;
    if (props.onClick) el.events.click = props.onClick;
    if (props.onChange) el.events.change = props.onChange;
  }
  return el;
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) { return { nodeType: 3, text: String(text) }; },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function () { return null; },
  body: { appendChild: function () {} }
};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/board.js');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  NOTICE BOARD DEPARTMENT LOCKING & ADMIN PERMISSIONS TEST SUITE    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

OC.store.load();

// 1. Setup mock workspace state
OC.store.state.departments = [
  { id: 'd-web', name: 'Web Development' },
  { id: 'd-outreach', name: 'Outreach & Marketing' },
  { id: 'd-design', name: 'Creative Design' }
];
OC.store.state.users = [
  {
    id: 'u-admin',
    name: 'System Admin Fuad',
    admin: true,
    departments: []
  },
  {
    id: 'u-regular',
    name: 'Regular Developer',
    admin: false,
    departments: [{ department: 'd-web', level: 'member' }]
  }
];
OC.store.state.clients = [
  { id: 'c-1', name: 'Client Apex', client_code: 'APX', department: 'd-web' }
];
OC.store.state.instructions = [
  {
    id: 'n-1',
    body: 'Web department notice',
    department: 'd-web',
    departments: ['d-web'],
    author: 'u-regular',
    posted_at: new Date().toISOString()
  }
];
OC.store.state.todos = [
  {
    id: 't-1',
    title: 'Fix website bug',
    department: 'd-web',
    departments: ['d-web'],
    created_by: 'u-regular'
  }
];
OC.store.setSession('u-regular');

// Test 1: deptPicker behavior for regular user vs admin
console.log('--- [1/3] Testing deptPicker Component Locking ---');
const regularUser = OC.store.user('u-regular');
const adminUser = OC.store.user('u-admin');

// Regular user picker
const regPicker = OC.ui.deptPicker([], regularUser);
assert.ok(regPicker, 'deptPicker must return instance');
const regDepts = regPicker.getDepartments();
assert.deepStrictEqual(regDepts, ['d-web'], 'Regular user must have their assigned department automatically fixed');

// Admin user picker
const adminPicker = OC.ui.deptPicker([], adminUser);
assert.ok(adminPicker, 'deptPicker must return instance');
assert.strictEqual(adminPicker.getDepartments().length, 0, 'Admin starts with clean picker so they can choose freely');
console.log('  ✓ deptPicker locks department for regular user and remains flexible for admin');

// Test 2: Post Instruction modal locking
console.log('\n--- [2/3] Testing Notice Board: newInstruction() Department Locking ---');
let capturedModalConfig = null;
OC.ui.modal = function (cfg) { capturedModalConfig = cfg; };

// Case A: Regular user posts instruction
OC.store.setSession('u-regular');
OC.board.newInstruction();
assert.ok(capturedModalConfig, 'Modal should be triggered');
let isFixedBadge = false;

function scanNodes(node) {
  if (!node) return;
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(scanNodes);
  }
  if (node.text && node.text.indexOf('Fixed to your assigned department') > -1) {
    isFixedBadge = true;
  }
}
scanNodes(capturedModalConfig.content);
assert.strictEqual(isFixedBadge, true, 'Regular user must see fixed department badge on Notice Board');
console.log('  ✓ Regular user department is strictly fixed to their own department when posting instruction');

// Case B: System Admin posts instruction
OC.store.setSession('u-admin');
capturedModalConfig = null;
OC.board.newInstruction();
assert.ok(capturedModalConfig, 'Modal should be triggered');

let adminHasPicker = false;
function scanAdminNodes(node) {
  if (!node) return;
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(scanAdminNodes);
  }
  if (node.className && node.className.indexOf('dept-multi-picker') > -1) {
    adminHasPicker = true;
  }
}
scanAdminNodes(capturedModalConfig.content);
assert.strictEqual(adminHasPicker, true, 'System Admin must have multi-select picker with all departments available');
console.log('  ✓ System Admin can select any department freely when posting instruction');

// Test 3: Edit Instruction modal locking
console.log('\n--- [3/3] Testing Notice Board: editInstruction() Department Locking ---');
const testNote = OC.store.state.instructions[0];

// Case A: Regular user edits instruction
OC.store.setSession('u-regular');
capturedModalConfig = null;
OC.board.editInstruction(testNote);
assert.ok(capturedModalConfig, 'Modal should be triggered');

let editRegFixed = false;
function scanEditReg(node) {
  if (!node) return;
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(scanEditReg);
  }
  if (node.text && node.text.indexOf('Fixed to department') > -1) {
    editRegFixed = true;
  }
}
scanEditReg(capturedModalConfig.content);
assert.strictEqual(editRegFixed, true, 'Regular user cannot change department when editing instruction');
console.log('  ✓ Regular user has department fixed when editing instruction');

// Case B: System Admin edits instruction
OC.store.setSession('u-admin');
capturedModalConfig = null;
OC.board.editInstruction(testNote);
assert.ok(capturedModalConfig, 'Modal should be triggered');

let editAdminPicker = false;
function scanEditAdmin(node) {
  if (!node) return;
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(scanEditAdmin);
  }
  if (node.className && node.className.indexOf('dept-multi-picker') > -1) {
    editAdminPicker = true;
  }
}
scanEditAdmin(capturedModalConfig.content);
assert.strictEqual(editAdminPicker, true, 'System Admin can change/select any department when editing instruction');
console.log('  ✓ System Admin can change to any department when editing instruction');

console.log('\n======================================================');
console.log(' 🎉 NOTICE BOARD DEPARTMENT LOCKING FULLY VERIFIED! ✅');
console.log('======================================================\n');
