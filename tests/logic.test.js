/* =========================================================================
   logic.test.js — the permission engine the browser uses to draw
   permissions.js decides what the interface offers. The server decides what
   it will actually do, and server/tests/api.test.js covers that. Both matter:
   a person should not be shown a button that the server would refuse.

   From the project root:  npm run test:logic
   Originate Command · OM SRS 001
   ========================================================================= */

require('./harness.js');
loadFile('assets/js/core/permissions.js');

let passed = 0;
const failures = [];
function ok(label, got, want = true) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  good ? passed++ : failures.push(`${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  console.log((good ? '  PASS ' : '  FAIL ') + label);
}

/* the workspace the seed creates, as the browser holds it */
const STATE = {
  departments: [
    { id: 'd-outreach', name: 'Outreach Operations', levels: ['head', 'lead', 'senior', 'member'] },
    { id: 'd-web', name: 'Web Development', levels: ['head', 'lead', 'member'] },
    { id: 'd-bizops', name: 'Business Operations', levels: ['head', 'lead', 'member'] }
  ],
  users: [
    { id: 'u-shohag', name: 'Shohag Munshe', admin: true, departments: [] },
    { id: 'u-nadia', name: 'Nadia Rahman', admin: false,
      departments: [{ department: 'd-outreach', level: 'head' }, { department: 'd-bizops', level: 'member' }] },
    { id: 'u-tanvir', name: 'Tanvir Hasan', admin: false, departments: [{ department: 'd-outreach', level: 'lead' }] },
    { id: 'u-mim', name: 'Mim Akter', admin: false, departments: [{ department: 'd-outreach', level: 'senior' }] },
    { id: 'u-rifat', name: 'Rifat Chowdhury', admin: false, departments: [{ department: 'd-outreach', level: 'member' }] },
    { id: 'u-farhan', name: 'Farhan Kabir', admin: false, departments: [{ department: 'd-web', level: 'head' }] },
    { id: 'u-ayesha', name: 'Ayesha Noor', admin: false, departments: [{ department: 'd-web', level: 'member' }] }
  ],
  groups: [{ id: 'g-relaunch', name: 'Chaim Site Relaunch',
             members: ['u-tanvir', 'u-ayesha', 'u-shohag'], status: 'active' }],
  todos: [
    { id: 't-1', title: 'Manual reply check', department: 'd-outreach', assignee_type: 'user',
      assignee: 'u-rifat', state: 'open', due: '2026-08-28' },
    { id: 't-2', title: 'Fix the form', department: 'd-web', assignee_type: 'user',
      assignee: 'u-ayesha', state: 'open', due: '2026-08-28' },
    { id: 't-3', title: 'Rebuild the hero', department: 'd-web', assignee_type: 'group',
      assignee: 'g-relaunch', state: 'open', due: '2026-08-28' }
  ],
  instructions: [{ id: 'n-1', author: 'u-shohag', department: 'd-outreach', read_by: [] }],
  clients: [], tags: [], notifications: [], audit: [], saved_filters: []
};

/* permissions.js reads the workspace through OC.store, so stand in for it */
OC.store = {
  get state() { return STATE; },
  user: (id) => STATE.users.find((u) => u.id === id) || null,
  department: (id) => STATE.departments.find((d) => d.id === id) || null,
  group: (id) => STATE.groups.find((g) => g.id === id) || null,
  todo: (id) => STATE.todos.find((t) => t.id === id) || null,
  instruction: (id) => STATE.instructions.find((n) => n.id === id) || null,
  session: () => 'u-shohag'
};

const C = OC.can;
const u = (id) => OC.store.user(id);

console.log('=== hierarchy is a position, not a name (3.4) ===');
ok('rank comes from the department\'s own list', C.rank('d-outreach', 'senior'), 2);
ok('the same name ranks differently elsewhere', C.rank('d-web', 'member'), 2);
ok('an unknown level ranks last', C.rank('d-outreach', 'director'), Infinity);
ok('head is rank zero', C.isHead(u('u-nadia'), 'd-outreach'));
ok('and only in their own department', C.isHead(u('u-nadia'), 'd-web'), false);
ok('one person can hold two departments (3.3)', C.departmentsOf(u('u-nadia')), ['d-outreach', 'd-bizops']);

console.log('\n=== role labels ===');
ok('admin', C.roleLabel(u('u-shohag')), 'System Admin');
ok('head', C.roleLabel(u('u-nadia')), 'Department Head');
ok('lead', C.roleLabel(u('u-tanvir')), 'Team Lead');
ok('a custom level keeps its own name', C.roleLabel(u('u-mim')), 'Senior');
ok('member', C.roleLabel(u('u-rifat')), 'Member');

console.log('\n=== what the interface offers (3.1, 3.2) ===');
ok('a member is offered their own department\'s work', C.seeTodo(u('u-rifat'), OC.store.todo('t-1')));
ok('not another department\'s', C.seeTodo(u('u-rifat'), OC.store.todo('t-2')), false);
ok('group membership crosses that line (4.2)', C.seeTodo(u('u-tanvir'), OC.store.todo('t-3')));
ok('a member may only assign to themselves', C.assignableUsers(u('u-rifat')).map((x) => x.id), ['u-rifat']);
ok('a lead is offered their own team',
  C.assignableUsers(u('u-tanvir')).map((x) => x.id).sort(), ['u-mim', 'u-rifat', 'u-tanvir']);
ok('a lead is not offered their head', C.assignTo(u('u-tanvir'), 'u-nadia'), false);
ok('nor another department', C.assignTo(u('u-tanvir'), 'u-ayesha'), false);
ok('the admin is offered everyone', C.assignableUsers(u('u-shohag')).length, STATE.users.length);

console.log('\n=== the buttons a role does not get ===');
ok('a member is not shown Reassign (6.2)', C.reassign(u('u-rifat'), OC.store.todo('t-1')), false);
ok('a senior is not either', C.reassign(u('u-mim'), OC.store.todo('t-1')), false);
ok('a lead is', C.reassign(u('u-tanvir'), OC.store.todo('t-1')));
ok('a member is not shown New group (4.2)', C.createGroup(u('u-rifat')), false);
ok('a head is', C.createGroup(u('u-nadia')));
ok('a lead is not shown Invite (6.1)', C.invite(u('u-tanvir')), false);
ok('only the admin is shown department controls (4.1)',
  [C.manageDepartments(u('u-shohag')), C.manageDepartments(u('u-nadia'))], [true, false]);
ok('only the admin sees the audit log (8.2)',
  [C.seeAudit(u('u-shohag')), C.seeAudit(u('u-nadia'))], [true, false]);
ok('anyone may post an instruction (6.3)',
  STATE.users.every((x) => C.postInstruction(x)));

console.log('\n=== escalation, for what the card shows (9.4) ===');
const chain = C.escalationChain(OC.store.todo('t-1'));
ok('the chain climbs in order', chain.map((c) => c.step),
  ['Assignee', 'Team lead, day one', 'Department head, day two', 'Leadership, day three']);
ok('it starts with the assignee', chain[0].users, ['u-rifat']);
ok('a group todo names every member',
  C.escalationChain(OC.store.todo('t-3'))[0].users.sort(), ['u-ayesha', 'u-shohag', 'u-tanvir']);
ok('nothing before it is late', C.escalationReached(OC.store.todo('t-1'), 0), 0);
ok('it stops at leadership', C.escalationReached(OC.store.todo('t-1'), 99), 3);

console.log('\npassed: ' + passed);
console.log(failures.length ? 'FAILED ' + failures.length + ':\n  ' + failures.join('\n  ') : 'FAILURES: none');
process.exit(failures.length ? 1 : 0);
