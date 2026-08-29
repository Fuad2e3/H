/* =========================================================================
   rules.test.js — the security rules of section 8.1, actually enforced
   Runs against the Firestore emulator, so these are real reads and writes
   refused by real rules, not a reading of the rules file.

   From backend/:  npm run test:rules
   Originate Command · OM SRS 001
   ========================================================================= */

const {
  initializeTestEnvironment, assertFails, assertSucceeds
} = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

/* the same workspace the application seeds, in claim form.
   rank 0 = department head, 1 = team lead, higher sits further down (3.4) */
const ACCOUNTS = {
  shohag:  { admin: true,  departments: {} },
  nadia:   { admin: false, departments: { outreach: 0, bizops: 2 } },
  tanvir:  { admin: false, departments: { outreach: 1 } },
  mim:     { admin: false, departments: { outreach: 2 } },   // senior
  rifat:   { admin: false, departments: { outreach: 3 } },   // member
  farhan:  { admin: false, departments: { web: 0 } },
  ayesha:  { admin: false, departments: { web: 2 } },
  jubayer: { admin: false, departments: { leadgen: 2 } }
};

let env;
let passed = 0;
const failures = [];

async function check(label, promise) {
  try { await promise; passed++; console.log('  PASS ' + label); }
  catch (e) { failures.push(label); console.log('  FAIL ' + label + ' — ' + e.message.slice(0, 110)); }
}

function as(who) {
  const claims = ACCOUNTS[who];
  return env.authenticatedContext(who, claims).firestore();
}

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('groups/relaunch').set({
      name: 'Chaim Site Relaunch', members: ['tanvir', 'ayesha', 'shohag'],
      created_by: 'shohag', status: 'active'
    });
    await db.doc('todos/outreach-1').set({
      title: 'Manual reply check', client: 'chaim', department: 'outreach',
      assignee_type: 'user', assignee: 'rifat', created_by: 'tanvir', state: 'open'
    });
    await db.doc('todos/web-1').set({
      title: 'Fix the booking form', client: 'annette', department: 'web',
      assignee_type: 'user', assignee: 'ayesha', created_by: 'farhan', state: 'open'
    });
    await db.doc('todos/group-1').set({
      title: 'Rebuild the hero', client: 'chaim', department: 'web',
      assignee_type: 'group', assignee: 'relaunch', created_by: 'shohag', state: 'open'
    });
    await db.doc('instructions/outreach-note').set({
      body: 'Document context in ActiveCampaign before booking.',
      client: 'chaim', department: 'outreach', author: 'shohag',
      read_by: ['nadia'], archived: false
    });
    await db.doc('notifications/n1').set({ user: 'rifat', text: 'assigned', read: false });
    await db.doc('audit/a1').set({ actor: 'shohag', action: 'seed' });
    await db.doc('users/rifat').set({ name: 'Rifat', admin: false, status: 'active', departments: [] });
    /* a record written before a field existed: indexing a missing key in a
       rule raises an evaluation error, and an error denies */
    await db.doc('todos/legacy-1').set({
      title: 'Older record', client: 'chaim', department: 'outreach',
      assignee_type: 'user', assignee: 'rifat', state: 'open'
    });                                  /* note: no created_by */
    await db.doc('instructions/legacy-note').set({
      body: 'Older instruction', client: 'chaim', department: 'outreach',
      author: 'shohag', archived: false
    });                                  /* note: no read_by */
    await db.doc('departments/outreach').set({ name: 'Outreach Operations', levels: ['head','lead','senior','member'] });
  });
}

(async function run() {
  env = await initializeTestEnvironment({
    projectId: 'demo-originate',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1', port: 8080
    }
  });
  await env.clearFirestore();
  await seed();

  console.log('\n=== 3.1 visibility: authority never crosses a department ===');
  await check('member reads a todo in their own department',
    assertSucceeds(as('rifat').doc('todos/outreach-1').get()));
  await check('member cannot read another department\'s todo',
    assertFails(as('rifat').doc('todos/web-1').get()));
  await check('head cannot read another department\'s todo',
    assertFails(as('nadia').doc('todos/web-1').get()));
  await check('leadership reads everything',
    assertSucceeds(as('shohag').doc('todos/web-1').get()));
  await check('group membership is the one line authority crosses (4.2)',
    assertSucceeds(as('tanvir').doc('todos/group-1').get()));
  await check('a non-member of that group is still refused',
    assertFails(as('rifat').doc('todos/group-1').get()));
  await check('instruction visible inside its department',
    assertSucceeds(as('mim').doc('instructions/outreach-note').get()));
  await check('instruction refused outside it',
    assertFails(as('jubayer').doc('instructions/outreach-note').get()));

  console.log('\n=== 5.2 a todo needs a client and a department ===');
  await check('creating without a client is refused',
    assertFails(as('tanvir').collection('todos').add({
      title: 'x', department: 'outreach', assignee_type: 'user', assignee: 'rifat',
      created_by: 'tanvir', state: 'open' })));
  await check('creating without a department is refused',
    assertFails(as('tanvir').collection('todos').add({
      title: 'x', client: 'chaim', assignee_type: 'user', assignee: 'rifat',
      created_by: 'tanvir', state: 'open' })));
  await check('with both, a lead may create it',
    assertSucceeds(as('tanvir').collection('todos').add({
      title: 'x', client: 'chaim', department: 'outreach', assignee_type: 'user',
      assignee: 'rifat', created_by: 'tanvir', state: 'open' })));

  console.log('\n=== 3.2 / 6.2 who may hand work to whom ===');
  await check('member cannot assign work to a peer',
    assertFails(as('rifat').collection('todos').add({
      title: 'x', client: 'chaim', department: 'outreach', assignee_type: 'user',
      assignee: 'mim', created_by: 'rifat', state: 'open' })));
  await check('member may take work for themselves',
    assertSucceeds(as('rifat').collection('todos').add({
      title: 'x', client: 'chaim', department: 'outreach', assignee_type: 'user',
      assignee: 'rifat', created_by: 'rifat', state: 'open' })));
  await check('senior cannot assign to a member either',
    assertFails(as('mim').collection('todos').add({
      title: 'x', client: 'chaim', department: 'outreach', assignee_type: 'user',
      assignee: 'rifat', created_by: 'mim', state: 'open' })));
  await check('creator cannot forge someone else as author',
    assertFails(as('tanvir').collection('todos').add({
      title: 'x', client: 'chaim', department: 'outreach', assignee_type: 'user',
      assignee: 'rifat', created_by: 'nadia', state: 'open' })));

  console.log('\n=== 6.2 the assignee moves state but cannot reassign ===');
  await check('assignee marks it done',
    assertSucceeds(as('rifat').doc('todos/outreach-1').update({ state: 'done' })));
  await check('assignee cannot hand it to someone else',
    assertFails(as('rifat').doc('todos/outreach-1').update({ assignee: 'mim' })));
  await check('assignee cannot move it to another department',
    assertFails(as('rifat').doc('todos/outreach-1').update({ department: 'web' })));
  await check('their lead may reassign it',
    assertSucceeds(as('tanvir').doc('todos/outreach-1').update({ assignee: 'mim' })));
  await check('a lead in another department may not',
    assertFails(as('farhan').doc('todos/outreach-1').update({ assignee: 'ayesha' })));

  console.log('\n=== records missing a field must not deny their own owner ===');
  await check('assignee of a record with no created_by can still change state',
    assertSucceeds(as('rifat').doc('todos/legacy-1').update({ state: 'done' })));
  await check('and still cannot reassign it',
    assertFails(as('rifat').doc('todos/legacy-1').update({ assignee: 'mim' })));
  await check('a reader can mark an instruction that has no read_by yet',
    assertSucceeds(as('mim').doc('instructions/legacy-note').update({ read_by: ['mim'] })));

  console.log('\n=== 6.3 posting is open, editing is not ===');
  await check('any authenticated person may post an instruction',
    assertSucceeds(as('jubayer').collection('instructions').add({
      body: 'heard from the client', client: 'rafa', department: 'leadgen',
      author: 'jubayer', read_by: ['jubayer'], archived: false })));
  await check('a reader may add only their own read receipt',
    assertSucceeds(as('mim').doc('instructions/outreach-note')
      .update({ read_by: ['nadia', 'mim'] })));
  await check('a reader cannot edit the body',
    assertFails(as('mim').doc('instructions/outreach-note').update({ body: 'rewritten' })));
  await check('the author may edit their own',
    assertSucceeds(as('shohag').doc('instructions/outreach-note').update({ body: 'clarified' })));

  console.log('\n=== 7.0 nothing is hard deleted ===');
  await check('a todo cannot be deleted, even by leadership',
    assertFails(as('shohag').doc('todos/outreach-1').delete()));
  await check('an instruction cannot be deleted',
    assertFails(as('shohag').doc('instructions/outreach-note').delete()));

  console.log('\n=== 8.2 least privilege: nobody promotes themselves ===');
  await check('a person edits their own profile',
    assertSucceeds(as('rifat').doc('users/rifat').update({ name: 'Rifat C' })));
  await check('but cannot make themselves an admin',
    assertFails(as('rifat').doc('users/rifat').update({ admin: true })));
  await check('nor move their own department',
    assertFails(as('rifat').doc('users/rifat').update({ departments: [{ department: 'web', level: 'head' }] })));
  await check('nor reactivate a suspended account',
    assertFails(as('rifat').doc('users/rifat').update({ status: 'suspended' })));
  await check('a person may change their own notification preferences',
    assertSucceeds(as('rifat').doc('users/rifat').update({ prefs: { push: false, email: true, discord: false } })));
  await check('a field outside the whitelist is refused even if harmless-looking',
    assertFails(as('rifat').doc('users/rifat').update({ invite: { token: 'forged' } })));
  await check('a lead cannot reorder a department hierarchy (3.4)',
    assertFails(as('tanvir').doc('departments/outreach').update({ levels: ['lead'] })));
  await check('leadership can',
    assertSucceeds(as('shohag').doc('departments/outreach').update({ levels: ['head','lead','member'] })));

  console.log('\n=== 4.2 group creation, the default in section 13 ===');
  await check('a department head may create a group',
    assertSucceeds(as('nadia').collection('groups').add({
      name: 'g', members: ['nadia'], created_by: 'nadia', status: 'active' })));
  await check('a team lead may not',
    assertFails(as('tanvir').collection('groups').add({
      name: 'g', members: ['tanvir'], created_by: 'tanvir', status: 'active' })));
  await check('a member may not',
    assertFails(as('rifat').collection('groups').add({
      name: 'g', members: ['rifat'], created_by: 'rifat', status: 'active' })));

  console.log('\n=== 5.0 audit log and notifications ===');
  await check('the audit log is not writable by anyone',
    assertFails(as('shohag').collection('audit').add({ actor: 'shohag', action: 'forged' })));
  await check('leadership reads the audit log',
    assertSucceeds(as('shohag').doc('audit/a1').get()));
  await check('a member cannot read it',
    assertFails(as('rifat').doc('audit/a1').get()));
  await check('a person reads their own notification',
    assertSucceeds(as('rifat').doc('notifications/n1').get()));
  await check('but not someone else\'s',
    assertFails(as('mim').doc('notifications/n1').get()));
  await check('marking it read is allowed',
    assertSucceeds(as('rifat').doc('notifications/n1').update({ read: true })));
  await check('rewriting its text is not',
    assertFails(as('rifat').doc('notifications/n1').update({ text: 'changed' })));

  console.log('\n=== the unauthenticated case ===');
  const anon = env.unauthenticatedContext().firestore();
  await check('signed out reads nothing', assertFails(anon.doc('todos/outreach-1').get()));
  await check('signed out writes nothing', assertFails(anon.collection('todos').add({ title: 'x' })));

  await env.cleanup();
  console.log('\npassed: ' + passed);
  console.log(failures.length ? 'FAILED ' + failures.length + ':\n  ' + failures.join('\n  ') : 'FAILURES: none');
  process.exit(failures.length ? 1 : 0);
})();
