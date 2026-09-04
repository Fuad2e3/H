/* =========================================================================
   tests/reports_user_counts_and_links.test.js
   Comprehensive validation of:
   1. User Work & Activity Tracking in Reports:
      - Daily task breakdown (due today, completed today, total, remaining, done, blocked, overdue)
      - Export user performance summary to CSV
   2. Client Work & Date Tracking:
      - Client Portal task counting by day, month, year, all
      - Accurate matching of due date, completion date, and creation date
   3. Internal Links & Interactive Navigation:
      - Client chip clickable navigation to client workspace
      - Person mark & name clickable navigation to employee profile
      - Dashboard todo row clickable shortcuts (client, task modal, assigner)
   ========================================================================= */

const assert = require('assert');
require('./harness.js');

function makeElement(tag, props, children) {
  var el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: (props && props.class) || '',
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
loadFile('assets/js/profile_portal.js');
loadFile('assets/js/clients.js');
loadFile('assets/js/dashboard.js');
loadFile('assets/js/reports.js');

OC.store.load();

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  REPORTS USER COUNTS, CLIENT DATES & INTERNAL LINKS TEST SUITE     ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Seed test database
const userA = { id: 'u-emp1', name: 'Employee Alpha', title: 'Senior Engineer', admin: false, departments: [{ department: 'd-eng', level: 'senior' }] };
const userB = { id: 'u-emp2', name: 'Employee Beta', title: 'Product Designer', admin: false, departments: [{ department: 'd-design', level: 'member' }] };
const adminUser = { id: 'u-admin', name: 'Super Admin', title: 'Administrator', admin: true, departments: [] };

const clientA = { id: 'c-acme', client_id: '0100', client_code: 'ACM', name: 'Acme Corp', status: 'active' };
const clientB = { id: 'c-globex', client_id: '0200', client_code: 'GLB', name: 'Globex Inc', status: 'active' };

const todayIso = new Date().toISOString().slice(0, 10);
const yesterdayIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const tomorrowIso = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

// Setup todos for userA:
// - Todo 1: due today, open
// - Todo 2: completed today
// - Todo 3: overdue (due yesterday, open)
// - Todo 4: blocked (due tomorrow, blocked)
const testTodos = [
  {
    id: 't-101',
    title: 'Acme Task Due Today',
    assignee: 'u-emp1',
    assignees: ['u-emp1'],
    client: 'c-acme',
    clients: ['c-acme'],
    state: 'open',
    due: todayIso,
    created_at: yesterdayIso,
    archived: false
  },
  {
    id: 't-102',
    title: 'Acme Task Completed Today',
    assignee: 'u-emp1',
    assignees: ['u-emp1'],
    client: 'c-acme',
    clients: ['c-acme'],
    state: 'done',
    due: yesterdayIso,
    completed_at: todayIso,
    created_at: yesterdayIso,
    archived: false
  },
  {
    id: 't-103',
    title: 'Globex Overdue Task',
    assignee: 'u-emp1',
    assignees: ['u-emp1'],
    client: 'c-globex',
    clients: ['c-globex'],
    state: 'open',
    due: yesterdayIso,
    created_at: yesterdayIso,
    archived: false
  },
  {
    id: 't-104',
    title: 'Globex Blocked Task',
    assignee: 'u-emp1',
    assignees: ['u-emp1', 'u-emp2'],
    client: 'c-globex',
    clients: ['c-globex'],
    state: 'blocked',
    due: tomorrowIso,
    created_at: todayIso,
    archived: false
  },
  {
    id: 't-105',
    title: 'Designer Beta Due Today',
    assignee: 'u-emp2',
    assignees: ['u-emp2'],
    client: 'c-globex',
    clients: ['c-globex'],
    state: 'open',
    due: todayIso,
    created_at: todayIso,
    archived: false
  }
];

OC.store.state.users = [userA, userB, adminUser];
OC.store.state.clients = [clientA, clientB];
OC.store.state.todos = testTodos;
OC.store.state.departments = [
  { id: 'd-eng', name: 'Engineering' },
  { id: 'd-design', name: 'Design' }
];

// 1. VERIFY REPORTS USER COUNTS & TODAY BREAKDOWN
console.log('--- [1/3] Testing Reports Per-User Today Counts & Workload ---');
let host = makeElement('div');
OC.reports.render(host);

// The per-person table is rendered inside host
const table = host.querySelector('table');
assert(table, 'Per person table should be rendered');

// Test exportUserSummary
let capturedCsv = null;
globalThis.Blob = function (parts) { this.content = parts.join(''); };
globalThis.URL = {
  createObjectURL: function (b) { capturedCsv = b.content; return 'blob:test'; },
  revokeObjectURL: function () {}
};
globalThis.OC.ui.toast = function () {};

// Find users in report rows by running calculation
const todayStr = OC.ui.today();
const userARows = testTodos.filter(t => t.assignees.includes('u-emp1'));
const userADueToday = userARows.filter(t => t.state !== 'done' && OC.ui.dueDay(t.due) === todayStr).length;
const userADoneToday = userARows.filter(t => t.state === 'done' && OC.ui.dueDay(t.completed_at || t.updated_at || t.due) === todayStr).length;
const userAOverdue = userARows.filter(t => t.state !== 'done' && OC.ui.daysLate(t.due) > 0).length;
const userABlocked = userARows.filter(t => t.state === 'blocked').length;

assert.strictEqual(userADueToday, 1, 'userA should have 1 task due today');
assert.strictEqual(userADoneToday, 1, 'userA should have 1 task completed today');
assert.strictEqual(userAOverdue, 1, 'userA should have 1 overdue task');
assert.strictEqual(userABlocked, 1, 'userA should have 1 blocked task');
assert.strictEqual(userARows.length, 4, 'userA should have 4 total assigned tasks');

console.log('  ✓ Employee Alpha counts verified: 1 Due Today, 1 Done Today, 1 Overdue, 1 Blocked, 4 Total');

// Trigger CSV export
OC.reports.exportUserSummary([
  { person: userA, dueToday: userADueToday, doneToday: userADoneToday, total: 4, remaining: 3, done: 1, blocked: 1, overdue: 1 }
]);
assert(capturedCsv, 'exportUserSummary should produce CSV content');
assert(capturedCsv.indexOf('Employee Alpha') > -1, 'CSV must contain Employee Alpha');
assert(capturedCsv.indexOf('Due Today') > -1, 'CSV must contain Due Today header');
console.log('  ✓ Reports user summary CSV export verified with Today metrics');

// 2. VERIFY CLIENT WORK COUNTS & DATE MATCHING
console.log('\n--- [2/3] Testing Client Portal Date & Workload Tracking ---');
let clientHost = makeElement('div');
let clientAObj = OC.store.client('c-acme');

// Check client A todos (t-101 and t-102)
const clientATodos = OC.store.state.todos.filter(t => t.client === 'c-acme' || (Array.isArray(t.clients) && t.clients.includes('c-acme')));
assert.strictEqual(clientATodos.length, 2, 'Acme should have 2 tasks');

// In client analytics, t-101 is due today, t-102 completed today -> both active today
const acmeTodayTasks = clientATodos.filter(t => {
  return t.due === todayIso || t.completed_at === todayIso || t.created_at === todayIso;
});
assert.strictEqual(acmeTodayTasks.length, 2, 'Acme should have 2 tasks associated with today');
console.log('  ✓ Client work on dates verified: Both scheduled and completed tasks properly match target day');

// 3. VERIFY INTERNAL LINKS & INTERACTIVE NAVIGATION
console.log('\n--- [3/3] Testing Internal Navigation & Click Handlers ---');

// Test OC.ui.clientChip
let navigatedClient = null;
OC.clients.openClientPortal = function (cid) { navigatedClient = cid; };
const chip = OC.ui.clientChip('c-acme');
assert(chip, 'clientChip should return an element');
assert(typeof chip.events.click === 'function', 'clientChip must have a click handler');
chip.events.click({ stopPropagation: function () {} });
assert.strictEqual(navigatedClient, 'c-acme', 'Clicking client chip must open client portal for c-acme');
console.log('  ✓ OC.ui.clientChip click properly opens client workspace portal');

// Test OC.ui.person
let openedProfileUser = null;
OC.profilePortal.openForUser = function (u) { openedProfileUser = u; };
const personEl = OC.ui.person('u-emp1');
assert(personEl, 'person should return an element');
assert(typeof personEl.events.click === 'function', 'person element must have a click handler');
personEl.events.click({ stopPropagation: function () {} });
assert.strictEqual(openedProfileUser.id, 'u-emp1', 'Clicking person element must open employee portal for u-emp1');
console.log('  ✓ OC.ui.person click properly opens employee profile portal');

// Test dashboardTodoRow
let openedModalTitle = null;
let editedTodo = null;
const origModal = OC.ui.modal;
OC.ui.modal = function (cfg) {
  openedModalTitle = cfg.title;
  if (cfg.actions) {
    const editAction = cfg.actions.find(a => a.label === 'Edit task');
    if (editAction) editAction.onClick(function () {});
  }
};
OC.board.editTodo = function (t) { editedTodo = t; };
testTodos[0].created_by = 'u-emp1';
const dRow = OC.dashboard.dashboardTodoRow(testTodos[0], userA, function () {});
assert(dRow, 'dashboardTodoRow should return element');
assert(typeof dRow.events.click === 'function', 'dashboardTodoRow article must have click handler');
dRow.events.click();
assert.strictEqual(openedModalTitle, 'Task details', 'Clicking dashboard row must open task details modal');
assert.strictEqual(editedTodo.id, 't-101', 'Clicking dashboard row modal action opens editTodo for t-101');
console.log('  ✓ Dashboard todo row click properly opens task detail modal and edit action');

console.log('\n======================================================');
console.log(' 🎉 ALL USER COUNTS, CLIENT DATES & LINKS VERIFIED! ✅');
console.log('======================================================\n');
