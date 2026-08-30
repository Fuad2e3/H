/* =========================================================================
   api.test.js — the rules of section 3.0, enforced over HTTP
   Real requests against a real server with a real database. What the browser
   would or would not draw is irrelevant here: these check what the server
   itself hands over and accepts, which is the enforcement section 8.1 asks
   for.

   From the project root:  npm run test:api
   Originate Command · OM SRS 001
   ========================================================================= */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const DB = path.join(os.tmpdir(), 'oc-api-test-' + Date.now() + '.db');
process.env.OC_DB = DB;
process.env.PORT = '0';

const seed = require('../src/seed');
seed.run();

const { server } = require('../src/index');

let base = '';
let passed = 0;
const failures = [];

function ok(label, got, want = true) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  good ? passed++ : failures.push(`${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
  console.log((good ? '  PASS ' : '  FAIL ') + label);
}

async function call(method, path_, { body, cookie } = {}) {
  const res = await fetch(base + path_, {
    method,
    headers: Object.assign(
      body ? { 'Content-Type': 'application/json' } : {},
      cookie ? { Cookie: 'oc_session=' + cookie } : {}
    ),
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  const setCookie = res.headers.get('set-cookie') || '';
  const token = (setCookie.match(/oc_session=([^;]*)/) || [])[1];
  return { status: res.status, data, token };
}

async function signIn(email) {
  const res = await call('POST', '/api/session', { body: { email, password: 'originate' } });
  if (!res.token) throw new Error('could not sign in as ' + email + ': ' + JSON.stringify(res.data));
  return res.token;
}

(async function run() {
  await new Promise((resolve) => server.listen(0, resolve));
  base = 'http://127.0.0.1:' + server.address().port;

  console.log('\n=== signing in (6.1) ===');
  ok('no session, no workspace', (await call('GET', '/api/state')).status, 401);
  ok('a wrong password is refused',
    (await call('POST', '/api/session', { body: { email: 'rifat@originate.example', password: 'nope' } })).status, 401);
  const unknown = await call('POST', '/api/session', { body: { email: 'nobody@example.com', password: 'originate' } });
  ok('an unknown address gets the same answer, so accounts cannot be discovered',
    unknown.data.error, 'That email and password do not match an account.');

  const admin = await signIn('shohag@originate.example');
  const head = await signIn('nadia@originate.example');
  const lead = await signIn('tanvir@originate.example');
  const senior = await signIn('mim@originate.example');
  const member = await signIn('rifat@originate.example');
  const otherDept = await signIn('ayesha@originate.example');
  ok('a correct password returns a session', typeof member, 'string');

  console.log('\n=== 3.1 the server sends only what a person may see ===');
  const adminState = (await call('GET', '/api/state', { cookie: admin })).data;
  const memberState = (await call('GET', '/api/state', { cookie: member })).data;
  console.log(`   admin: ${adminState.todos.length} todos, ${adminState.instructions.length} instructions`);
  console.log(`   member: ${memberState.todos.length} todos, ${memberState.instructions.length} instructions`);
  ok('a member receives fewer todos than the admin', memberState.todos.length < adminState.todos.length);
  ok('and fewer instructions', memberState.instructions.length < adminState.instructions.length);
  ok('another department\'s work never arrives',
    memberState.todos.some((t) => t.department === 'd-web'), false);
  ok('the audit log does not reach a member (8.2)', memberState.audit.length, 0);
  ok('it does reach the admin', adminState.audit.length > 0);
  ok('password hashes never leave the server',
    JSON.stringify(memberState).includes('scrypt$'), false);
  ok('a member sees their own notifications only',
    memberState.notifications.every((n) => n.user === 'u-rifat'));

  console.log('\n=== 5.2 client and department are required ===');
  ok('no client is refused',
    (await call('POST', '/api/todos', { cookie: lead, body: { title: 'x', department: 'd-outreach', assignee: 'u-rifat' } })).status, 400);
  ok('no department is refused',
    (await call('POST', '/api/todos', { cookie: lead, body: { title: 'x', client: 'c-chaim', assignee: 'u-rifat' } })).status, 400);
  ok('no title is refused',
    (await call('POST', '/api/todos', { cookie: lead, body: { client: 'c-chaim', department: 'd-outreach', assignee: 'u-rifat' } })).status, 400);

  console.log('\n=== 3.2 who may hand work to whom ===');
  const asLead = await call('POST', '/api/todos', { cookie: lead, body: {
    title: 'From the lead', client: 'c-chaim', department: 'd-outreach', assignee: 'u-rifat' } });
  ok('a lead may assign to a member below them', asLead.status, 200);
  ok('a member may not assign to a peer',
    (await call('POST', '/api/todos', { cookie: member, body: {
      title: 'x', client: 'c-chaim', department: 'd-outreach', assignee: 'u-mim' } })).status, 403);
  ok('a member may take work themselves',
    (await call('POST', '/api/todos', { cookie: member, body: {
      title: 'Mine', client: 'c-chaim', department: 'd-outreach', assignee: 'u-rifat' } })).status, 200);
  ok('a senior may not assign to a member',
    (await call('POST', '/api/todos', { cookie: senior, body: {
      title: 'x', client: 'c-chaim', department: 'd-outreach', assignee: 'u-rifat' } })).status, 403);
  ok('a lead may not assign upward to their head',
    (await call('POST', '/api/todos', { cookie: lead, body: {
      title: 'x', client: 'c-chaim', department: 'd-outreach', assignee: 'u-nadia' } })).status, 403);
  ok('a head may not assign into another department',
    (await call('POST', '/api/todos', { cookie: head, body: {
      title: 'x', client: 'c-chaim', department: 'd-web', assignee: 'u-ayesha' } })).status, 403);

  console.log('\n=== 6.2 the assignee moves state but cannot hand work on ===');
  const mine = asLead.data.id;
  ok('the assignee marks it done',
    (await call('PATCH', '/api/todos/' + mine, { cookie: member, body: { state: 'done' } })).status, 200);
  ok('the assignee cannot reassign it',
    (await call('PATCH', '/api/todos/' + mine, { cookie: member, body: { assignee: 'u-mim' } })).status, 403);
  ok('nor move it to another department',
    (await call('PATCH', '/api/todos/' + mine, { cookie: member, body: { department: 'd-web' } })).status, 403);
  ok('their lead may reassign it',
    (await call('PATCH', '/api/todos/' + mine, { cookie: lead, body: { assignee: 'u-mim' } })).status, 200);
  ok('someone in another department cannot even see it',
    (await call('PATCH', '/api/todos/' + mine, { cookie: otherDept, body: { state: 'open' } })).status, 404);
  ok('blocked demands a reason',
    (await call('PATCH', '/api/todos/' + mine, { cookie: lead, body: { state: 'blocked' } })).status, 400);
  ok('with a reason it is accepted',
    (await call('PATCH', '/api/todos/' + mine, { cookie: lead, body: { state: 'blocked', blocked_reason: 'waiting on the client' } })).status, 200);

  console.log('\n=== 6.3 posting is open, editing is not ===');
  const note = await call('POST', '/api/instructions', { cookie: member, body: {
    body: 'Heard from the client this morning.', client: 'c-chaim', department: 'd-outreach' } });
  ok('any authenticated person may post an instruction', note.status, 200);
  ok('a reader may mark it read',
    (await call('PATCH', '/api/instructions/' + note.data.id, { cookie: senior, body: { read: true } })).status, 200);
  ok('a reader may not rewrite the body',
    (await call('PATCH', '/api/instructions/' + note.data.id, { cookie: senior, body: { body: 'rewritten' } })).status, 403);
  ok('the author may',
    (await call('PATCH', '/api/instructions/' + note.data.id, { cookie: member, body: { body: 'clarified' } })).status, 200);
  ok('a department head may archive it',
    (await call('PATCH', '/api/instructions/' + note.data.id, { cookie: head, body: { archived: true } })).status, 200);

  console.log('\n=== 4.2 groups, the default in section 13 ===');
  ok('a head may create a group',
    (await call('POST', '/api/groups', { cookie: head, body: {
      name: 'Test group', purpose: 'testing', members: ['u-nadia', 'u-tanvir'] } })).status, 200);
  ok('a lead may not',
    (await call('POST', '/api/groups', { cookie: lead, body: {
      name: 'x', purpose: 'x', members: ['u-tanvir', 'u-mim'] } })).status, 403);
  ok('a member may not',
    (await call('POST', '/api/groups', { cookie: member, body: {
      name: 'x', purpose: 'x', members: ['u-rifat', 'u-mim'] } })).status, 403);
  ok('a group needs two people',
    (await call('POST', '/api/groups', { cookie: head, body: {
      name: 'x', purpose: 'x', members: ['u-nadia'] } })).status, 400);

  console.log('\n=== 8.2 least privilege: nobody promotes themselves ===');
  ok('a person edits their own profile',
    (await call('PATCH', '/api/users/u-rifat', { cookie: member, body: { title: 'Outreach Associate II' } })).status, 200);
  ok('but cannot make themselves an admin',
    (await call('PATCH', '/api/users/u-rifat', { cookie: member, body: { admin: true } })).status, 403);
  ok('nor move their own department',
    (await call('PATCH', '/api/users/u-rifat', { cookie: member, body: { departments: [{ department: 'd-web', level: 'head' }] } })).status, 403);
  ok('nor edit someone else',
    (await call('PATCH', '/api/users/u-mim', { cookie: member, body: { title: 'x' } })).status, 403);
  ok('a lead cannot invite (6.1)',
    (await call('POST', '/api/users', { cookie: lead, body: { name: 'x', email: 'x@y.com' } })).status, 403);
  ok('a head can',
    (await call('POST', '/api/users', { cookie: head, body: {
      name: 'Invited Person', email: 'invited@originate.example',
      departments: [{ department: 'd-outreach', level: 'member' }] } })).status, 200);

  console.log('\n=== 3.4 / 4.1 departments are the admin\'s ===');
  ok('a head cannot add a department',
    (await call('POST', '/api/departments', { cookie: head, body: { name: 'x', levels: ['head', 'member'] } })).status, 403);
  const dept = await call('POST', '/api/departments', { cookie: admin, body: {
    name: 'Paid Advertising', levels: ['head', 'lead', 'buyer', 'analyst'] } });
  ok('the admin can', dept.status, 200);
  ok('and can reorder a hierarchy',
    (await call('PATCH', '/api/departments/' + dept.data.id, { cookie: admin, body: {
      levels: ['head', 'lead', 'senior buyer', 'buyer', 'analyst'] } })).status, 200);
  ok('but not strip a level people still hold',
    (await call('PATCH', '/api/departments/d-outreach', { cookie: admin, body: {
      levels: ['head', 'lead', 'member'] } })).status, 409);

  console.log('\n=== the session itself ===');
  const beforeChange = await signIn('mim@originate.example');
  ok('the session works', (await call('GET', '/api/state', { cookie: beforeChange })).status, 200);
  await call('PATCH', '/api/users/u-mim', { cookie: admin, body: {
    departments: [{ department: 'd-web', level: 'member' }] } });
  ok('changing someone\'s department ends their sessions, so old reach cannot persist (8.1)',
    (await call('GET', '/api/state', { cookie: beforeChange })).status, 401);

  const toEnd = await signIn('jubayer@originate.example');
  ok('signing out ends the session',
    (await call('DELETE', '/api/session', { cookie: toEnd })).status, 200);
  ok('and it stops working', (await call('GET', '/api/state', { cookie: toEnd })).status, 401);
  ok('a forged session token is refused',
    (await call('GET', '/api/state', { cookie: 'not-a-real-token' })).status, 401);

  console.log('\n=== 7.0 nothing is hard deleted ===');
  ok('there is no endpoint to delete a todo',
    (await call('DELETE', '/api/todos/' + mine, { cookie: admin })).status, 404);
  ok('nor an instruction',
    (await call('DELETE', '/api/instructions/' + note.data.id, { cookie: admin })).status, 404);

  console.log('\n=== the server refuses nonsense ===');
  ok('an unknown endpoint is a 404', (await call('GET', '/api/nothing', { cookie: admin })).status, 404);
  const bad = await fetch(base + '/api/todos', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'oc_session=' + admin },
    body: '{not json'
  });
  ok('malformed JSON is a 400, not a crash', bad.status, 400);
  ok('a path that climbs out of the project is refused',
    (await fetch(base + '/../../etc/passwd')).status !== 200);

  server.close();
  fs.rmSync(DB, { force: true });
  fs.rmSync(DB + '-wal', { force: true });
  fs.rmSync(DB + '-shm', { force: true });

  console.log('\npassed: ' + passed);
  console.log(failures.length ? 'FAILED ' + failures.length + ':\n    ' + failures.join('\n    ') : 'FAILURES: none');
  process.exit(failures.length ? 1 : 0);
})();
