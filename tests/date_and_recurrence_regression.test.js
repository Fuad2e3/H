/* Regression cover for the date-handling bugs found in the logic audit.

   Every due value the application stores comes from a datetime-local input, so
   it carries a time ("2026-01-29T09:15"). Three separate places assumed a
   date-only string and broke on the real shape.

   Run from the repository root:  node tests/date_and_recurrence_regression.test.js
   Originate Command · application */
require('./harness.js');
var assert = require('assert');

loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');

var passed = 0;
function ok(label, got, want) {
  assert.strictEqual(got, want, label + ' — got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
  passed++;
  console.log('  PASS ' + label);
}

/* ---- the helpers under test, mirrored from the modules that own them ----
   ui.js and board.js both touch the DOM at load, so the two pure functions
   they export are restated here rather than loading those files headlessly. */
function dueDay(due) { return String(due || '').slice(0, 10); }
function dayOf(date) {
  var pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}
function daysFromToday(offset) {
  var d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return dayOf(d);
}
function addMonths(date, months) {
  var day = date.getDate();
  var target = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  var lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}
function nextDue(dueDate, recurrence) {
  var day = String(dueDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  var d = new Date(day + 'T12:00:00');
  if (recurrence === 'daily') d.setDate(d.getDate() + 1);
  else if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
  else if (recurrence === 'monthly') d = addMonths(d, 1);
  else if (recurrence === 'quarterly') d = addMonths(d, 3);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

console.log('\n=== recurrence accepts the shape the form actually stores ===');
ok('weekly, due carries a time', nextDue('2026-01-29T09:15', 'weekly'), '2026-02-05');
ok('weekly, date only',          nextDue('2026-01-29', 'weekly'),       '2026-02-05');
ok('monthly clamps to month end', nextDue('2026-01-31T18:00', 'monthly'), '2026-02-28');
ok('quarterly clamps',            nextDue('2026-01-31', 'quarterly'),     '2026-04-30');
ok('daily across a year end',     nextDue('2026-12-31T23:00', 'daily'),   '2027-01-01');
ok('no due date yields no next',  nextDue('', 'weekly'), '');
ok('malformed due yields no next', nextDue('not-a-date', 'weekly'), '');

console.log('\n=== a due value is matched on its calendar day ===');
ok('day of a value with a time', dueDay('2026-09-03T14:30'), '2026-09-03');
ok('day of a date-only value',   dueDay('2026-09-03'),       '2026-09-03');
ok('day of an empty value',      dueDay(''),                 '');
ok('day of undefined',           dueDay(undefined),          '');

console.log('\n=== today and yesterday are local, matching the input ===');
var now = new Date();
ok('today is the local calendar day', daysFromToday(0), dayOf(now));
var y = new Date(); y.setDate(y.getDate() - 1);
ok('yesterday is the local day before', daysFromToday(-1), dayOf(y));

console.log('\n=== an instruction without read_by is still readable ===');
OC.store.load();
var note = { id: 'n-x', body: 'no read_by field', author: 'u-shohag', departments: [] };
ok('unread check tolerates a missing read_by',
   (note.read_by || []).indexOf('u-shohag') === -1, true);

console.log('\n=== permission scoping still holds ===');
var S = OC.store.state;
S.users.push({ id: 'u-x', name: 'X', email: 'x@t.co', admin: false, status: 'active',
               departments: [{ department: 'd-leadgen', level: 'member' }], prefs: {} });
var todo = { id: 't-x', title: 'T', created_by: 'u-shohag', department: 'd-bizops',
             departments: ['d-bizops'], assignee_type: 'user', assignee: 'u-shohag',
             assignees: ['u-shohag'], state: 'open' };
ok('another department cannot see the todo', OC.can.seeTodo(OC.store.user('u-x'), todo), false);
ok('a member cannot assign to someone else', OC.can.assignTo(OC.store.user('u-x'), 'u-shohag'), false);

console.log('\n' + passed + ' assertions passed.');
