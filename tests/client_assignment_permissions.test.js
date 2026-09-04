/* Client member assignment & department head permissions — test
   Tests the business rule:
   - Department head sees all clients of their department.
   - System admin sees all clients.
   - Specific members assigned to a client can see and work on it.
   - Non-assigned members of the department cannot see or work on it.
   Run: node tests/client_assignment_permissions.test.js
*/

require('./harness.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');

let pass = 0, fail = [];
function ok(label, got, want = true) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (good) pass++; else fail.push(`${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const S = OC.store, C = OC.can;
S.load();

const admin = S.user('u-shohag');

// Department: d-web
const webHead = {
  id: 'u-web-head', name: 'Web Head', email: 'webhead@example.com',
  admin: false, departments: [{ department: 'd-web', level: 'head' }],
  status: 'active'
};
const webWorker1 = {
  id: 'u-web-w1', name: 'Web Worker 1', email: 'worker1@example.com',
  admin: false, departments: [{ department: 'd-web', level: 'member' }],
  status: 'active'
};
const webWorker2 = {
  id: 'u-web-w2', name: 'Web Worker 2', email: 'worker2@example.com',
  admin: false, departments: [{ department: 'd-web', level: 'member' }],
  status: 'active'
};

// Department: d-marketing
const mktHead = {
  id: 'u-mkt-head', name: 'Marketing Head', email: 'mkthead@example.com',
  admin: false, departments: [{ department: 'd-leadgen', level: 'head' }],
  status: 'active'
};

S.state.users.push(webHead, webWorker1, webWorker2, mktHead);

// Client belonging to d-web, assigned specifically to webWorker1
const clientWebAssigned = {
  id: 'c-web-assigned',
  name: 'Web Assigned Client',
  client_id: 'CL-WA',
  departments: ['d-web'],
  department: 'd-web',
  assignees: ['u-web-w1'],
  status: 'active'
};

// Client belonging to d-web, but with empty assignees
const clientWebUnassigned = {
  id: 'c-web-unassigned',
  name: 'Web Unassigned Client',
  client_id: 'CL-WU',
  departments: ['d-web'],
  department: 'd-web',
  assignees: [],
  status: 'active'
};

S.state.clients.push(clientWebAssigned, clientWebUnassigned);

console.log('=== 1. System Admin full access ===');
ok('Admin sees assigned client', C.seeClient(admin, clientWebAssigned), true);
ok('Admin sees unassigned client', C.seeClient(admin, clientWebUnassigned), true);
ok('Admin can assign client members', C.canAssignClientMembers(admin, clientWebAssigned), true);

console.log('=== 2. Department Head sees all clients in their department ===');
ok('Web Head sees client in their department with assignees', C.seeClient(webHead, clientWebAssigned), true);
ok('Web Head sees client in their department without assignees', C.seeClient(webHead, clientWebUnassigned), true);
ok('Web Head can assign members to client in their department', C.canAssignClientMembers(webHead, clientWebAssigned), true);
ok('Web Head cannot see or assign client belonging solely to marketing', C.canAssignClientMembers(webHead, { departments: ['d-leadgen'] }), false);

console.log('=== 3. Marketing Head cannot see web clients ===');
ok('Marketing Head cannot see web assigned client', C.seeClient(mktHead, clientWebAssigned), false);
ok('Marketing Head cannot see web unassigned client', C.seeClient(mktHead, clientWebUnassigned), false);
ok('Marketing Head cannot assign members to web client', C.canAssignClientMembers(mktHead, clientWebAssigned), false);

console.log('=== 4. Assigned member access ===');
ok('Web Worker 1 (assigned) CAN see the client', C.seeClient(webWorker1, clientWebAssigned), true);
ok('Web Worker 1 can work on the client', C.canWorkOnClient(webWorker1, clientWebAssigned), true);
ok('Web Worker 1 cannot assign members', C.canAssignClientMembers(webWorker1, clientWebAssigned), false);

console.log('=== 5. Non-assigned department member access is restricted ===');
ok('Web Worker 2 (NOT assigned) CANNOT see the client', C.seeClient(webWorker2, clientWebAssigned), false);
ok('Web Worker 2 CANNOT work on the client', C.canWorkOnClient(webWorker2, clientWebAssigned), false);
ok('Web Worker 2 CANNOT see unassigned client with restricted assignees list', C.seeClient(webWorker2, clientWebUnassigned), false);

console.log('=== 6. Dynamically assigning Web Worker 2 grants immediate access ===');
clientWebAssigned.assignees.push('u-web-w2');
ok('Web Worker 2 now sees the client after being assigned', C.seeClient(webWorker2, clientWebAssigned), true);
ok('Web Worker 2 can now work on the client', C.canWorkOnClient(webWorker2, clientWebAssigned), true);

console.log(`\n${pass} passed, ${fail.length} failed`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
