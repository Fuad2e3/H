/* =========================================================================
   logic.js — the decisions the functions make, as pure functions
   Kept apart from the Firebase runtime so they can be tested without a
   project: claim shape, recurrence dates, escalation steps and the Discord
   payload are all decidable from their inputs alone.
   Originate Command · OM SRS 001
   ========================================================================= */

'use strict';

/* ---- claims (8.1) --------------------------------------------------------
   The rules read a person's position from their own token. rank is the index
   of their level in that department's ordered hierarchy, so 0 is the head and
   a department can add levels without any rule changing (3.4). */
function claimsFor(user, departmentsById) {
  const departments = {};
  (user.departments || []).forEach(function (m) {
    const dept = departmentsById[m.department];
    if (!dept) return;
    const rank = dept.levels.indexOf(m.level);
    if (rank === -1) return;
    departments[m.department] = rank;
  });
  return { admin: user.admin === true, departments: departments };
}

/* ---- recurrence (6.2) ----------------------------------------------------
   A completed recurring todo regenerates as a fresh instance with its own
   done state. Editing a rule changes future instances only. */
const PERIODS = ['daily', 'weekly', 'monthly', 'quarterly'];

/* adding a month to the 31st overflows into the month after next in plain
   JavaScript: Jan 31 becomes Mar 3. A monthly task on the 31st belongs on the
   last day of the shorter month, so the day is clamped. */
function addMonths(date, months) {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function nextDue(dueDate, recurrence) {
  if (!dueDate || PERIODS.indexOf(recurrence) === -1) return null;
  let d = new Date(dueDate + 'T12:00:00Z');
  if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  if (recurrence === 'monthly') d = addMonths(d, 1);
  if (recurrence === 'quarterly') d = addMonths(d, 3);
  return d.toISOString().slice(0, 10);
}

function nextInstance(todo, now) {
  if (!todo.recurrence || todo.recurrence === 'none') return null;
  const copy = Object.assign({}, todo);
  delete copy.id;
  copy.state = 'open';
  copy.blocked_reason = null;
  copy.spawned_from = todo.id;
  copy.due = nextDue(todo.due, todo.recurrence);
  copy.created_at = (now || new Date()).toISOString();
  copy.comments = [];
  return copy;
}

/* ---- escalation (9.4) ----------------------------------------------------
   Each step adds a recipient and never removes the ones before it, so the
   assignee and their lead stay in the loop once it reaches leadership. Never
   a company-wide alert. */
function daysLate(dueDate, today) {
  if (!dueDate) return 0;
  const due = Date.parse(dueDate + 'T12:00:00Z');
  const now = Date.parse((today || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
  return Math.round((now - due) / 86400000);
}

function escalationRecipients(todo, people, today) {
  const late = daysLate(todo.due, today);
  if (todo.state === 'done' || late < 1) return [];

  const dept = todo.department;
  const rankOf = function (person) {
    const m = (person.departments || []).filter(function (x) { return x.department === dept; })[0];
    return m ? m.rank : null;
  };

  const assignees = todo.assignee_type === 'group'
    ? (todo.groupMembers || [])
    : [todo.assignee];

  const out = assignees.slice();
  const add = function (ids) {
    ids.forEach(function (id) { if (out.indexOf(id) === -1) out.push(id); });
  };

  if (late >= 1) add(people.filter(function (p) { return rankOf(p) === 1; }).map(function (p) { return p.id; }));
  if (late >= 2) add(people.filter(function (p) { return rankOf(p) === 0; }).map(function (p) { return p.id; }));
  if (late >= 3) add(people.filter(function (p) { return p.admin === true; }).map(function (p) { return p.id; }));
  return out;
}

/* ---- invite (6.1) -------------------------------------------------------- */
const INVITE_HOURS = 72;

function issueInvite(byUserId, now) {
  const issued = now || new Date();
  const expires = new Date(issued.getTime() + INVITE_HOURS * 3600 * 1000);
  return {
    token: 'inv-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6),
    issued_by: byUserId,
    issued_at: issued.toISOString(),
    expires_at: expires.toISOString(),
    claimed_at: null
  };
}

function inviteUsable(invite, now) {
  if (!invite) return false;
  if (invite.claimed_at) return false;                      /* single use */
  return new Date(invite.expires_at) > (now || new Date());
}

/* ---- outbound message bodies (9.2, 9.3) ---------------------------------- */
function inviteEmail(account, baseUrl) {
  return {
    subject: 'Your Originate Command account',
    text: [
      'Hello ' + account.name + ',',
      '',
      'An account has been created for you on Originate Command.',
      'Follow this link to set a password and complete your profile:',
      '',
      baseUrl.replace(/\/$/, '') + '/#claim=' + account.invite.token,
      '',
      'The link is single use and stops working ' + INVITE_HOURS + ' hours after it was issued.',
      'If you were not expecting this, ignore it and the invite will lapse.'
    ].join('\n')
  };
}

function discordPayload(instruction, clientName, authorName) {
  return {
    username: 'Originate Command',
    embeds: [{
      title: 'Instruction · ' + clientName,
      description: String(instruction.body).slice(0, 1800),
      footer: { text: 'posted by ' + authorName }
    }]
  };
}

module.exports = {
  claimsFor, nextDue, nextInstance,
  daysLate, escalationRecipients,
  issueInvite, inviteUsable, INVITE_HOURS,
  inviteEmail, discordPayload
};
