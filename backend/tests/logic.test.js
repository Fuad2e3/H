/* Unit tests for the functions' decisions. No emulator, no project.
   From backend/:  node tests/logic.test.js
   Originate Command · OM SRS 001 */

const L = require('../functions/lib/logic');
let passed = 0; const failures = [];
function ok(label, got, want = true) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  good ? passed++ : failures.push(`${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
  console.log((good ? '  PASS ' : '  FAIL ') + label);
}

const DEPTS = {
  outreach: { levels: ['head', 'lead', 'senior', 'member'] },
  web: { levels: ['head', 'lead', 'member'] }
};

console.log('=== claims (8.1, 3.4) ===');
ok('rank is the position in that department\'s own hierarchy',
  L.claimsFor({ admin: false, departments: [{ department: 'outreach', level: 'senior' }] }, DEPTS),
  { admin: false, departments: { outreach: 2 } });
ok('the same level name can rank differently per department',
  L.claimsFor({ admin: false, departments: [{ department: 'web', level: 'member' }] }, DEPTS),
  { admin: false, departments: { web: 2 } });
ok('one person can hold two departments (3.3)',
  L.claimsFor({ admin: false, departments: [
    { department: 'outreach', level: 'head' }, { department: 'web', level: 'member' }] }, DEPTS),
  { admin: false, departments: { outreach: 0, web: 2 } });
ok('the leadership tier is a flag, not a department',
  L.claimsFor({ admin: true, departments: [] }, DEPTS), { admin: true, departments: {} });
ok('an unknown level grants nothing',
  L.claimsFor({ admin: false, departments: [{ department: 'outreach', level: 'wizard' }] }, DEPTS),
  { admin: false, departments: {} });
ok('an unknown department grants nothing',
  L.claimsFor({ admin: false, departments: [{ department: 'ghost', level: 'head' }] }, DEPTS),
  { admin: false, departments: {} });

console.log('\n=== recurrence (6.2) ===');
ok('daily', L.nextDue('2026-08-28', 'daily'), '2026-08-29');
ok('weekly', L.nextDue('2026-08-28', 'weekly'), '2026-09-04');
ok('monthly', L.nextDue('2026-08-28', 'monthly'), '2026-09-28');
ok('quarterly', L.nextDue('2026-08-28', 'quarterly'), '2026-11-28');
ok('the 31st clamps to the end of a shorter month, it does not skip one',
  L.nextDue('2026-01-31', 'monthly'), '2026-02-28');
ok('and to 29 February in a leap year', L.nextDue('2028-01-31', 'monthly'), '2028-02-29');
ok('the 30th behaves the same way', L.nextDue('2026-01-30', 'monthly'), '2026-02-28');
ok('a normal day is untouched', L.nextDue('2026-03-15', 'monthly'), '2026-04-15');
ok('quarterly clamps too', L.nextDue('2026-08-31', 'quarterly'), '2026-11-30');
ok('a leap day is handled', L.nextDue('2028-02-29', 'daily'), '2028-03-01');
ok('one time todos do not recur', L.nextDue('2026-08-28', 'none'), null);
const spawned = L.nextInstance(
  { id: 't1', title: 'Manual reply check', due: '2026-08-28', recurrence: 'daily',
    state: 'done', blocked_reason: 'was stuck', comments: [{ body: 'old' }] },
  new Date('2026-08-29T09:00:00Z'));
ok('a new instance opens fresh', spawned.state, 'open');
ok('it does not inherit the block', spawned.blocked_reason, null);
ok('it does not inherit the conversation', spawned.comments, []);
ok('it records what it came from', spawned.spawned_from, 't1');
ok('a one time todo spawns nothing', L.nextInstance({ recurrence: 'none' }), null);

console.log('\n=== escalation (9.4) ===');
const PEOPLE = [
  { id: 'nadia', admin: false, departments: [{ department: 'outreach', rank: 0 }] },
  { id: 'tanvir', admin: false, departments: [{ department: 'outreach', rank: 1 }] },
  { id: 'rifat', admin: false, departments: [{ department: 'outreach', rank: 3 }] },
  { id: 'farhan', admin: false, departments: [{ department: 'web', rank: 0 }] },
  { id: 'shohag', admin: true, departments: [] }
];
const TODO = { assignee_type: 'user', assignee: 'rifat', department: 'outreach', state: 'open', due: '2026-08-28' };
ok('nothing before it is late', L.escalationRecipients(TODO, PEOPLE, '2026-08-28'), []);
ok('day one adds the team lead', L.escalationRecipients(TODO, PEOPLE, '2026-08-29'), ['rifat', 'tanvir']);
ok('day two adds the department head', L.escalationRecipients(TODO, PEOPLE, '2026-08-30'), ['rifat', 'tanvir', 'nadia']);
ok('day three reaches leadership', L.escalationRecipients(TODO, PEOPLE, '2026-08-31'), ['rifat', 'tanvir', 'nadia', 'shohag']);
ok('it never drops the people already on it',
  L.escalationRecipients(TODO, PEOPLE, '2026-09-30').slice(0, 2), ['rifat', 'tanvir']);
ok('another department is never pulled in',
  L.escalationRecipients(TODO, PEOPLE, '2026-09-30').indexOf('farhan'), -1);
ok('a done todo never escalates',
  L.escalationRecipients(Object.assign({}, TODO, { state: 'done' }), PEOPLE, '2026-09-30'), []);
ok('a group todo escalates for every member',
  L.escalationRecipients({ assignee_type: 'group', assignee: 'g', groupMembers: ['rifat', 'tanvir'],
    department: 'outreach', state: 'open', due: '2026-08-28' }, PEOPLE, '2026-08-29'),
  ['rifat', 'tanvir']);

console.log('\n=== invites (6.1) ===');
const now = new Date('2026-08-29T10:00:00Z');
const inv = L.issueInvite('shohag', now);
ok('expiry is 72 hours out', (Date.parse(inv.expires_at) - Date.parse(inv.issued_at)) / 3600000, 72);
ok('a fresh invite is usable', L.inviteUsable(inv, now), true);
ok('it lapses after 72 hours', L.inviteUsable(inv, new Date('2026-09-01T11:00:00Z')), false);
ok('it is single use', L.inviteUsable(Object.assign({}, inv, { claimed_at: now.toISOString() }), now), false);
ok('two invites never share a token', L.issueInvite('x', now).token === L.issueInvite('x', now).token, false);
ok('the email carries the claim link',
  L.inviteEmail({ name: 'Ruma', invite: inv }, 'https://command.example/').text.indexOf('#claim=' + inv.token) > -1, true);

console.log('\n=== Discord payload (9.3) ===');
const payload = L.discordPayload({ body: 'x'.repeat(3000) }, 'Chaim', 'Shohag Munshe');
ok('the body is clamped to what Discord accepts', payload.embeds[0].description.length, 1800);
ok('the client is named in the title', payload.embeds[0].title, 'Instruction · Chaim');

console.log('\npassed: ' + passed);
console.log(failures.length ? 'FAILED ' + failures.length + ':\n    ' + failures.join('\n    ') : 'FAILURES: none');
process.exit(failures.length ? 1 : 0);
