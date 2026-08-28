/* Logic suite — store.js and permissions.js, no browser required.
   Run from the repository root:  node tests/logic.test.js
   Originate Command · application */

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
const u = id => S.user(id);

console.log('=== store.js ===');
ok('load returns state', !!S.state.users.length);
ok('user lookup', u('u-nadia').name, 'Nadia Rahman');
ok('department lookup', S.department('d-outreach').name, 'Outreach Operations');
ok('client lookup', S.client('c-chaim').name, 'Chaim');
ok('group lookup', S.group('g-relaunch').members.length, 3);
ok('tag lookup', S.tag('t-urgent').label, 'Urgent');
ok('todo lookup', S.todo('t-1').title, 'Manual reply check');
ok('instruction lookup', S.instruction('n-1').author, 'u-shohag');
ok('missing id returns null', S.user('nope'), null);
ok('uid is unique', S.uid('x') !== S.uid('x'));
ok('default session is admin', S.session(), 'u-shohag');
S.setSession('u-mim'); ok('session set', S.session(), 'u-mim');
S.setSession('u-shohag');

let fired = 0; S.onChange(() => fired++);
const auditBefore = S.state.audit.length;
S.mutate({ actor: 'u-shohag', action: 'test.action', target: 'x', detail: 'd' }, () => {});
ok('mutate writes an audit entry', S.state.audit.length, auditBefore + 1);
ok('mutate emits a change', fired, 1);
ok('audit newest first', S.state.audit[0].action, 'test.action');
S.mutate(null, () => {});
ok('mutate with null skips the audit', S.state.audit.length, auditBefore + 1);

const notifBefore = S.state.notifications.length;
S.notify(['u-mim', 'u-rifat'], 'hello', 'ref1');
ok('notify adds one row per person', S.state.notifications.length, notifBefore + 2);
ok('notify marks unread', S.state.notifications[0].read, false);
S.notify([], 'ignored');
ok('notify with nobody is a no-op', S.state.notifications.length, notifBefore + 2);
ok('notify persisted to storage',
   JSON.parse(localStorage.getItem('oc-state-v1')).notifications.length, notifBefore + 2);

S.reset();
ok('reset restores the seed', S.state.todos.length, 14);
ok('reset clears notifications', S.state.notifications.length, 0);

console.log('=== permissions.js: hierarchy ===');
ok('levelIn finds a membership', C.levelIn(u('u-tanvir'), 'd-outreach'), 'lead');
ok('levelIn outside a department', C.levelIn(u('u-tanvir'), 'd-web'), null);
ok('rank head is 0', C.rank('d-outreach', 'head'), 0);
ok('custom level ranks between lead and member', C.rank('d-outreach', 'senior'), 2);
ok('unknown level ranks last', C.rank('d-outreach', 'nope'), Infinity);
ok('isHead', C.isHead(u('u-nadia'), 'd-outreach'));
ok('isHead is department-scoped', C.isHead(u('u-nadia'), 'd-web'), false);
ok('isLead', C.isLead(u('u-tanvir'), 'd-outreach'));
ok('inDept', C.inDept(u('u-rifat'), 'd-outreach'));
ok('headOfAny for a head', C.headOfAny(u('u-piya')));
ok('headOfAny false for a lead', C.headOfAny(u('u-tanvir')), false);
ok('one person heads two departments', C.departmentsOf(u('u-imran')), ['d-bizops', 'd-admin']);
ok('inGroup', C.inGroup(u('u-ayesha'), 'g-relaunch'));
ok('inGroup false for an outsider', C.inGroup(u('u-rifat'), 'g-relaunch'), false);

console.log('=== permissions.js: role labels ===');
ok('admin label', C.roleLabel(u('u-shohag')), 'System Admin');
ok('head label', C.roleLabel(u('u-nadia')), 'Department Head');
ok('lead label', C.roleLabel(u('u-tanvir')), 'Team Lead');
ok('custom level label', C.roleLabel(u('u-mim')), 'Senior');
ok('member label', C.roleLabel(u('u-rifat')), 'Member');
ok('highest grant wins across departments', C.roleLabel(u('u-piya')), 'Department Head');

console.log('=== permissions.js: assignment matrix ===');
const people = ['u-shohag','u-imran','u-nadia','u-tanvir','u-mim','u-rifat','u-sadia','u-jubayer','u-farhan','u-ayesha','u-piya'];
// every account may assign to itself, and nobody may assign upward
people.forEach(id => ok(`${id} may assign to self`, C.assignTo(u(id), id)));
ok('member cannot assign to a peer', C.assignTo(u('u-rifat'), 'u-mim'), false);
ok('senior cannot assign to a member', C.assignTo(u('u-mim'), 'u-rifat'), false);
ok('lead assigns to senior below', C.assignTo(u('u-tanvir'), 'u-mim'));
ok('lead assigns to member below', C.assignTo(u('u-tanvir'), 'u-rifat'));
ok('lead cannot assign to its head', C.assignTo(u('u-tanvir'), 'u-nadia'), false);
ok('lead cannot assign to another lead', C.assignTo(u('u-tanvir'), 'u-sadia'), false);
ok('head assigns to its lead', C.assignTo(u('u-nadia'), 'u-tanvir'));
ok('head cannot cross departments', C.assignTo(u('u-nadia'), 'u-ayesha'), false);
ok('head cannot assign to another head in the same dept', C.assignTo(u('u-imran'), 'u-imran'));
ok('admin assigns to everyone', C.assignableUsers(u('u-shohag')).length, 11);
ok('member assignable list is self only', C.assignableUsers(u('u-rifat')).map(x => x.id), ['u-rifat']);
ok('lead assignable list', C.assignableUsers(u('u-tanvir')).map(x => x.id).sort(), ['u-mim','u-rifat','u-tanvir']);
ok('head assignable list', C.assignableUsers(u('u-nadia')).map(x => x.id).sort(), ['u-mim','u-nadia','u-rifat','u-tanvir']);

console.log('=== permissions.js: groups ===');
ok('admin may create a group', C.createGroup(u('u-shohag')));
ok('head may create a group', C.createGroup(u('u-nadia')));
ok('lead may not', C.createGroup(u('u-tanvir')), false);
ok('member may not', C.createGroup(u('u-rifat')), false);
ok('admin may assign to a group', C.assignToGroup(u('u-shohag'), 'g-relaunch'));
ok('group member may assign to it', C.assignToGroup(u('u-ayesha'), 'g-relaunch'));
ok('outsider member may not', C.assignToGroup(u('u-rifat'), 'g-relaunch'), false);
ok('assignableGroups excludes archived', (() => {
  S.state.groups[0].status = 'archived';
  const n = C.assignableGroups(u('u-shohag')).length;
  S.state.groups[0].status = 'active';
  return n;
})(), 0);

console.log('=== permissions.js: visibility ===');
const t1 = S.todo('t-1'), t3 = S.todo('t-3'), n1 = S.instruction('n-1');
ok('admin sees every todo', S.state.todos.every(t => C.seeTodo(u('u-shohag'), t)));
ok('assignee sees own todo', C.seeTodo(u('u-rifat'), t1));
ok('department colleague sees it', C.seeTodo(u('u-mim'), t1));
ok('other department does not', C.seeTodo(u('u-ayesha'), t1), false);
ok('group member sees a cross-department todo', C.seeTodo(u('u-tanvir'), t3));
ok('non-group outsider does not', C.seeTodo(u('u-rifat'), t3), false);
ok('author always sees own instruction', C.seeInstruction(u('u-shohag'), n1));
ok('department sees the instruction', C.seeInstruction(u('u-rifat'), n1));
ok('other department does not', C.seeInstruction(u('u-jubayer'), n1), false);
ok('visibleUsers: admin sees all', C.visibleUsers(u('u-shohag')).length, 11);
ok('visibleUsers: member sees own department', C.visibleUsers(u('u-rifat')).map(x=>x.id).sort(),
   ['u-mim','u-nadia','u-rifat','u-tanvir']);

console.log('=== permissions.js: state changes ===');
ok('assignee may change state', C.changeState(u('u-rifat'), t1));
ok('their lead may change state', C.changeState(u('u-tanvir'), t1));
ok('a peer may not', C.changeState(u('u-mim'), t1), false);
ok('group member may change a group todo', C.changeState(u('u-ayesha'), t3));
ok('assignee may not reassign', C.reassign(u('u-rifat'), t1), false);
ok('lead may reassign', C.reassign(u('u-tanvir'), t1));
ok('head of the todo department may reassign', C.reassign(u('u-nadia'), t1));
ok('author may archive own instruction', C.archiveInstruction(u('u-shohag'), n1));
ok('department head may archive', C.archiveInstruction(u('u-nadia'), n1));
ok('member may not archive', C.archiveInstruction(u('u-rifat'), n1), false);
ok('manageDepartment: head yes', C.manageDepartment(u('u-nadia'), 'd-outreach'));
ok('manageDepartment: lead no', C.manageDepartment(u('u-tanvir'), 'd-outreach'), false);
ok('invite: head yes', C.invite(u('u-nadia')));
ok('invite: lead no', C.invite(u('u-tanvir')), false);
ok('audit: admin only', [C.seeAudit(u('u-shohag')), C.seeAudit(u('u-nadia'))], [true, false]);
ok('postInstruction is open to everyone', people.every(id => C.postInstruction(u(id))));

console.log('=== permissions.js: escalation (9.4) ===');
const chain = C.escalationChain(S.todo('t-2'));
ok('chain order', chain.map(c => c.step),
   ['Assignee','Team lead, day one','Department head, day two','Leadership, day three']);
ok('chain never removes earlier recipients', chain[0].users, ['u-mim']);
ok('leadership is the admin tier', chain[3].users, ['u-shohag']);
ok('group todo expands to its members', C.escalationChain(t3)[0].users.sort(),
   ['u-ayesha','u-shohag','u-tanvir']);
ok('not escalated before it is late', C.escalationReached(S.todo('t-2'), 0), 0);
ok('one day late reaches the lead', C.escalationReached(S.todo('t-2'), 1), 1);
ok('escalation stops at leadership', C.escalationReached(S.todo('t-2'), 99), 3);

console.log('\npassed: ' + pass);
if (fail.length) { console.log('FAILED ' + fail.length + ':'); fail.forEach(f => console.log('  ' + f)); process.exit(1); }
else console.log('FAILURES: none');

console.log('\n=== reassign, after the fix ===');
let p2 = 0, f2 = [];
function ok2(l, g, w = true) { (JSON.stringify(g) === JSON.stringify(w)) ? p2++ : f2.push(`${l} got=${JSON.stringify(g)}`); }
ok2('member cannot reassign own work', C.reassign(u('u-rifat'), t1), false);
ok2('senior cannot reassign', C.reassign(u('u-mim'), S.todo('t-6')), false);
ok2('lead reassigns work of a member below', C.reassign(u('u-tanvir'), t1));
ok2('lead reassigns work assigned to itself', C.reassign(u('u-tanvir'), S.todo('t-4')));
ok2('head reassigns inside its department', C.reassign(u('u-nadia'), t1));
ok2('head cannot reassign another department', C.reassign(u('u-nadia'), S.todo('t-8')), false);
ok2('admin reassigns anything', C.reassign(u('u-shohag'), S.todo('t-8')));
ok2('group member in a lead role may move group work', C.reassign(u('u-tanvir'), t3));
ok2('member still changes state on own work', C.changeState(u('u-rifat'), t1));
ok2('assignsOthers: member false', C.assignsOthers(u('u-rifat')), false);
ok2('assignsOthers: lead true', C.assignsOthers(u('u-tanvir')));
console.log('passed: ' + p2);
console.log(f2.length ? 'FAILED:\n  ' + f2.join('\n  ') : 'FAILURES: none');
if (f2.length) process.exit(1);
