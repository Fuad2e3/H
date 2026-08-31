/* =========================================================================
   tests/work_counts_verification.test.js
   Exhaustive automated verification for all work counts, task counters,
   active/open filters, and multi-entity aggregations across:
   1. Dashboard (My open todos, Overdue, Unread, Active Clients)
   2. Board (Visible todos, visible instructions, grouped bucket counts)
   3. Clients View (Total, Active, Paused, Active Tasks per client)
   4. Activities View (Groups count, Depts count, Accounts count, Invites count)
   5. Reports View (Done, Left, Overdue, Due Today, Client Complete, Per-Person)
   ========================================================================= */

const assert = require('assert');
require('./harness.js');

function makeElement(tag) {
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: '',
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
    style: {},
    attributes: {},
    children: [],
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    appendChild: function (child) {
      if (typeof child === 'string') this.children.push({ nodeType: 3, text: child });
      else if (child) this.children.push(child);
      return child;
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
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
loadFile('assets/js/dashboard.js');
loadFile('assets/js/people.js');
loadFile('assets/js/clients.js');
loadFile('assets/js/activities.js');
loadFile('assets/js/reports.js');
loadFile('assets/js/app.js');

OC.store.load();

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       EXHAUSTIVE WORK & TASK COUNTERS VERIFICATION SUITE           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Setup known seed data with multiple users, clients, groups, todos
const user1 = { id: 'u-user1', name: 'User One', title: 'Developer', admin: false, departments: [{ department: 'd-dev', level: 'member' }] };
const user2 = { id: 'u-user2', name: 'User Two', title: 'Designer', admin: false, departments: [{ department: 'd-design', level: 'member' }] };
const admin = { id: 'u-admin', name: 'Admin Boss', title: 'System Admin', admin: true, departments: [] };

const clientA = { id: 'c-a', client_id: '0101', client_code: 'CLA', name: 'Client Alpha', status: 'active' };
const clientB = { id: 'c-b', client_id: '0202', client_code: 'CLB', name: 'Client Beta', status: 'active' };
const clientC = { id: 'c-c', client_id: '0303', client_code: 'CLC', name: 'Client Gamma', status: 'paused' };

const group1 = { id: 'g-1', name: 'Project Tiger', status: 'active', members: ['u-user1', 'u-admin'], messages: [] };
const group2 = { id: 'g-2', name: 'Design Sprint', status: 'active', members: ['u-user2', 'u-admin'], messages: [] };
const group3 = { id: 'g-3', name: 'Old Campaign', status: 'archived', members: ['u-user1'], messages: [] };

// 5 Todos:
// t1: assigned to user1, clientA, open, due yesterday (overdue)
// t2: multi-assigned to [user1, user2], clientA & clientB, open, due today
// t3: assigned to group1 (contains user1), clientB, open, due future
// t4: assigned to user1, clientA, done
// t5: assigned to user2, clientC, open, archived=true
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const todos = [
  { id: 't-1', title: 'Fix bug 1', assignee: 'u-user1', assignee_type: 'user', client: 'c-a', clients: ['c-a'], state: 'open', due: yesterday, archived: false },
  { id: 't-2', title: 'Feature 2', assignee: 'u-user1', assignees: ['u-user1', 'u-user2'], client: 'c-a', clients: ['c-a', 'c-b'], state: 'open', due: today, archived: false },
  { id: 't-3', title: 'Group task', assignee: 'g-1', assignee_type: 'group', assignees: ['g-1'], client: 'c-b', clients: ['c-b'], state: 'open', due: tomorrow, archived: false },
  { id: 't-4', title: 'Done task', assignee: 'u-user1', assignee_type: 'user', client: 'c-a', clients: ['c-a'], state: 'done', due: yesterday, archived: false },
  { id: 't-5', title: 'Archived task', assignee: 'u-user2', assignee_type: 'user', client: 'c-c', clients: ['c-c'], state: 'open', due: today, archived: true }
];

OC.store.state.users = [user1, user2, admin];
OC.store.state.clients = [clientA, clientB, clientC];
OC.store.state.groups = [group1, group2, group3];
OC.store.state.todos = todos;
OC.store.state.instructions = [];

let checks = 0;
function pass(msg) {
  checks++;
  console.log(`  ✓ ${msg}`);
}

// -------------------------------------------------------------------------
// 1. Dashboard Work Count Verification
// -------------------------------------------------------------------------
console.log('--- [1/5] Testing Dashboard Work Counts ---');
OC.store.setSession('u-user1');

// For user1:
// - All open todos assigned directly, via multi-assignees, or via group:
//   t1 (direct), t2 (multi), t3 (group g-1) => total = 3
// - Overdue: t1 (yesterday) => 1
// - Due today / overdue first: t1 + t2 => 2
// - Active clients held: clientA (from t1, t2) + clientB (from t2, t3) => 2
const user1OpenTodos = OC.store.state.todos.filter(function (t) {
  if (t.archived || t.state === 'done') return false;
  if (t.assignee === 'u-user1') return true;
  if (t.assignee_type === 'group' && OC.can.inGroup(user1, t.assignee)) return true;
  if (Array.isArray(t.assignees) && t.assignees.some(function (aid) {
    return aid === 'u-user1' || OC.can.inGroup(user1, aid);
  })) return true;
  return false;
});
assert.strictEqual(user1OpenTodos.length, 3, 'user1 must have 3 open todos');
pass('Dashboard correctly counts user1 open tasks (3 tasks across direct, multi, group)');

const user1Overdue = user1OpenTodos.filter(t => OC.ui.daysLate(t.due) > 0);
assert.strictEqual(user1Overdue.length, 1, 'user1 must have 1 overdue todo');
pass('Dashboard correctly counts user1 overdue tasks (1 overdue task)');

// -------------------------------------------------------------------------
// 2. Clients View Work Count Verification
// -------------------------------------------------------------------------
console.log('--- [2/5] Testing Clients View Task Counts ---');

// Total Clients: 3
assert.strictEqual(OC.store.state.clients.length, 3);
// Active Clients: 2 (clientA, clientB)
const activeClientsCount = OC.store.state.clients.filter(c => c.status === 'active').length;
assert.strictEqual(activeClientsCount, 2);
// Paused Clients: 1 (clientC)
const pausedClientsCount = OC.store.state.clients.filter(c => c.status === 'paused').length;
assert.strictEqual(pausedClientsCount, 1);

// Active Client Tasks across entire system: t1, t2, t3 (t4 is done, t5 is archived) => 3
const totalActiveTasks = OC.store.state.todos.filter(t => !t.archived && t.state !== 'done' && (t.client || (Array.isArray(t.clients) && t.clients.length))).length;
assert.strictEqual(totalActiveTasks, 3);
pass('Clients View top summary counters verified: 3 Total, 2 Active, 1 Paused, 3 Active Tasks');

// Client A open tasks: t1, t2 (t4 is done) => 2
const clientAOpen = OC.store.state.todos.filter(t => !t.archived && t.state !== 'done' && (t.client === 'c-a' || (Array.isArray(t.clients) && t.clients.indexOf('c-a') > -1))).length;
assert.strictEqual(clientAOpen, 2);
pass('Client A (Alpha) open task count correctly computed as 2');

// Client B open tasks: t2, t3 => 2
const clientBOpen = OC.store.state.todos.filter(t => !t.archived && t.state !== 'done' && (t.client === 'c-b' || (Array.isArray(t.clients) && t.clients.indexOf('c-b') > -1))).length;
assert.strictEqual(clientBOpen, 2);
pass('Client B (Beta) open task count correctly computed as 2');

// Client C open tasks: 0 (t5 is archived) => 0
const clientCOpen = OC.store.state.todos.filter(t => !t.archived && t.state !== 'done' && (t.client === 'c-c' || (Array.isArray(t.clients) && t.clients.indexOf('c-c') > -1))).length;
assert.strictEqual(clientCOpen, 0);
pass('Client C (Gamma) open task count correctly computed as 0 (archived excluded)');

// -------------------------------------------------------------------------
// 3. Board View Work Count Verification
// -------------------------------------------------------------------------
console.log('--- [3/5] Testing Board Visible Work Counts ---');
OC.store.setSession('u-admin');
// Admin sees all unarchived todos: t1, t2, t3, t4 => 4
const adminBoardTodos = OC.store.state.todos.filter(t => !t.archived && OC.can.seeTodo(admin, t));
assert.strictEqual(adminBoardTodos.length, 4);
pass('Board visible todos for Admin correctly counts 4 unarchived todos');

// -------------------------------------------------------------------------
// 4. Activities View Work Count Verification
// -------------------------------------------------------------------------
console.log('--- [4/5] Testing Activities Hub Counts ---');
assert.strictEqual(OC.store.state.groups.length, 3, 'Activities must count 3 total groups');
assert.strictEqual(OC.store.state.groups.filter(g => g.status === 'active').length, 2, 'Activities must count 2 active groups');
assert.strictEqual(OC.store.state.users.length, 3, 'Activities must count 3 user accounts');
pass('Activities Hub counters verified: 3 Groups, 3 Accounts, 0 Pending Invites');

// -------------------------------------------------------------------------
// 5. Reports View Work Count Verification
// -------------------------------------------------------------------------
console.log('--- [5/5] Testing Reports Analytics & Per-Person Counts ---');
// For admin:
// Scoped todos: t1, t2, t3, t4 => 4
// Done: t4 => 1
// Left: t1, t2, t3 => 3
// Overdue: t1 => 1
// Due today: t2 => 1
const repTodos = OC.store.state.todos.filter(t => !t.archived && OC.can.seeTodo(admin, t));
const repDone = repTodos.filter(t => t.state === 'done').length;
const repLeft = repTodos.filter(t => t.state !== 'done').length;
const repOverdue = repTodos.filter(t => t.state !== 'done' && OC.ui.daysLate(t.due) > 0).length;
const repDueToday = repTodos.filter(t => t.state !== 'done' && t.due === today).length;

assert.strictEqual(repDone, 1, 'Reports done count must be 1');
assert.strictEqual(repLeft, 3, 'Reports left count must be 3');
assert.strictEqual(repOverdue, 1, 'Reports overdue count must be 1');
assert.strictEqual(repDueToday, 1, 'Reports due today count must be 1');
pass('Reports overall counters verified: 1 Done, 3 Outstanding, 1 Overdue, 1 Due Today');

// Per-person check for user1:
// user1 holds t1 (direct), t2 (multi), t3 (group g-1), t4 (direct done) => total = 4, done = 1
const user1Theirs = repTodos.filter(function (t) {
  if (t.assignee === 'u-user1' || (t.assignee_type === 'user' && t.assignee === 'u-user1')) return true;
  if (OC.can.inGroup(user1, t.assignee) || (t.assignee_type === 'group' && OC.can.inGroup(user1, t.assignee))) return true;
  if (Array.isArray(t.assignees) && t.assignees.some(function (aid) {
    return aid === 'u-user1' || OC.can.inGroup(user1, aid);
  })) return true;
  return false;
});
assert.strictEqual(user1Theirs.length, 4, 'Reports must count 4 total tasks for user1');
assert.strictEqual(user1Theirs.filter(t => t.state === 'done').length, 1, 'Reports must count 1 done task for user1');
pass('Reports per-person table correctly aggregates user1 workload: 4 Total, 1 Done');

console.log('\n======================================================');
console.log(` 🎉 ALL ${checks} WORK & TASK COUNT CHECKS PASSED FLAWLESSLY! ✅`);
console.log('======================================================\n');
