/* =========================================================================
   index.js — Cloud Functions
   The work section 10.1 puts on the server: setting the custom claims the
   security rules read, keeping the mirrored membership arrays in step,
   sending invites, regenerating recurring todos, escalating overdue work,
   and writing the audit log.

   The decisions live in lib/logic.js and are unit tested there. This file
   is the wiring: triggers, reads, writes and outbound calls.
   Originate Command · OM SRS 001
   ========================================================================= */

'use strict';

const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const L = require('./lib/logic');

admin.initializeApp();
const db = admin.firestore();

const RESEND_KEY = defineSecret('RESEND_API_KEY');
const DISCORD_WEBHOOK = defineSecret('DISCORD_WEBHOOK_URL');
const APP_URL = defineSecret('APP_URL');

/* ---- helpers ------------------------------------------------------------ */
async function audit(actor, action, target, detail) {
  await db.collection('audit').add({
    actor, action, target, detail: detail || '',
    at: new Date().toISOString()
  });
}

async function notify(userIds, text, ref) {
  if (!userIds.length) return;
  const at = new Date().toISOString();
  const batch = db.batch();
  userIds.forEach(function (user) {
    batch.set(db.collection('notifications').doc(), { user, text, ref: ref || null, at, read: false });
  });
  await batch.commit();
}

async function sendEmail(to, subject, text) {
  const key = RESEND_KEY.value();
  if (!key) return;                       /* not configured yet: skip quietly */
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Originate Command <command@originate.example>', to, subject, text })
  });
}

async function postToDiscord(payload) {
  const url = DISCORD_WEBHOOK.value();
  if (!url) return;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function departmentsById() {
  const snap = await db.collection('departments').get();
  const out = {};
  snap.forEach(function (d) { out[d.id] = d.data(); });
  return out;
}

/* ---- claims and the mirrored membership (5.0, 8.1) -----------------------
   Section 5.0 keeps membership on both the user and the department because
   Firestore cannot join, and says a function keeps the two in step. The same
   trigger refreshes the claims the rules read. */
exports.onUserWritten = onDocumentWritten('users/{userId}', async (event) => {
  const after = event.data.after.exists ? event.data.after.data() : null;
  const before = event.data.before.exists ? event.data.before.data() : null;
  const userId = event.params.userId;

  if (!after) {
    await db.collection('departments').get().then(function (snap) {
      const batch = db.batch();
      snap.forEach(function (d) {
        batch.update(d.ref, { members: admin.firestore.FieldValue.arrayRemove(userId) });
      });
      return batch.commit();
    });
    return;
  }

  const sameMembership =
    before && JSON.stringify(before.departments) === JSON.stringify(after.departments)
    && before.admin === after.admin;
  if (sameMembership) return;

  const claims = L.claimsFor(after, await departmentsById());
  try {
    await admin.auth().setCustomUserClaims(userId, claims);
  } catch (e) {
    /* the account may not exist in Auth until the invite is claimed */
  }

  const batch = db.batch();
  const held = Object.keys(claims.departments);
  const snap = await db.collection('departments').get();
  snap.forEach(function (d) {
    const shouldHold = held.indexOf(d.id) > -1;
    batch.update(d.ref, {
      members: shouldHold
        ? admin.firestore.FieldValue.arrayUnion(userId)
        : admin.firestore.FieldValue.arrayRemove(userId)
    });
  });
  await batch.commit();

  await audit('system', 'user.claims', after.name || userId,
    'departments ' + JSON.stringify(claims.departments) + ', admin ' + claims.admin);
});

/* ---- invites (6.1) ------------------------------------------------------- */
exports.onInvite = onDocumentCreated({ document: 'users/{userId}', secrets: [RESEND_KEY, APP_URL] },
  async (event) => {
    const account = event.data.data();
    if (account.status !== 'invited' || !account.invite) return;
    const mail = L.inviteEmail(account, APP_URL.value() || 'https://originate-command.example');
    await sendEmail(account.email, mail.subject, mail.text);
    await audit(account.invite.issued_by, 'user.invite', account.name,
      'single use link, expires ' + account.invite.expires_at);
  });

/* ---- assignment and instruction notifications (9.0) ---------------------- */
exports.onTodoWritten = onDocumentWritten('todos/{todoId}', async (event) => {
  const after = event.data.after.exists ? event.data.after.data() : null;
  const before = event.data.before.exists ? event.data.before.data() : null;
  if (!after) return;

  const newlyAssigned = !before || before.assignee !== after.assignee;
  if (!newlyAssigned) return;

  let recipients = [after.assignee];
  if (after.assignee_type === 'group') {
    const group = await db.doc('groups/' + after.assignee).get();
    recipients = group.exists ? group.data().members : [];
  }
  recipients = recipients.filter(function (id) { return id !== after.created_by; });
  await notify(recipients, 'You were assigned: ' + after.title, event.params.todoId);

  const people = await Promise.all(recipients.map(function (id) { return db.doc('users/' + id).get(); }));
  await Promise.all(people.map(function (p) {
    const u = p.data();
    if (!u || !u.prefs || !u.prefs.email) return null;
    return sendEmail(u.email, 'Assigned: ' + after.title,
      after.title + '\n\n' + (after.description || '') + '\n\nDue ' + after.due);
  }));
});

exports.onInstructionPosted = onDocumentCreated({ document: 'instructions/{noteId}', secrets: [DISCORD_WEBHOOK] },
  async (event) => {
    const note = event.data.data();
    const [client, author] = await Promise.all([
      db.doc('clients/' + note.client).get(),
      db.doc('users/' + note.author).get()
    ]);
    const clientName = client.exists ? client.data().name : note.client;
    const authorName = author.exists ? author.data().name : note.author;

    const people = await db.collection('users').get();
    const audience = [];
    people.forEach(function (p) {
      const u = p.data();
      if (p.id === note.author || u.status !== 'active') return;
      const inDept = (u.departments || []).some(function (m) { return m.department === note.department; });
      if (u.admin || inDept) audience.push(p.id);
    });
    await notify(audience, authorName + ' posted an instruction for ' + clientName, event.params.noteId);
    await postToDiscord(L.discordPayload(note, clientName, authorName));
    await audit(note.author, 'instruction.post', String(note.body).slice(0, 48), 'tagged ' + clientName);
  });

/* ---- recurring todos (6.2) ----------------------------------------------
   A completed recurring todo regenerates as a fresh instance. Run daily
   rather than on completion so a missed day still catches up. */
exports.generateRecurring = onSchedule('every day 00:15', async () => {
  const snap = await db.collection('todos')
    .where('state', '==', 'done')
    .where('recurrence', 'in', ['daily', 'weekly', 'monthly', 'quarterly'])
    .get();

  const batch = db.batch();
  let made = 0;
  snap.forEach(function (doc) {
    const todo = Object.assign({ id: doc.id }, doc.data());
    if (todo.spawned) return;                       /* one instance per completion */
    const next = L.nextInstance(todo, new Date());
    if (!next) return;
    batch.set(db.collection('todos').doc(), next);
    batch.update(doc.ref, { spawned: true });
    made++;
  });
  if (made) await batch.commit();
  await audit('system', 'todo.recurrence', made + ' instances', 'generated on schedule');
});

/* ---- overdue escalation (9.4) -------------------------------------------- */
exports.escalateOverdue = onSchedule('every day 08:00', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const [todos, users, groups] = await Promise.all([
    db.collection('todos').where('state', '!=', 'done').get(),
    db.collection('users').get(),
    db.collection('groups').get()
  ]);

  const depts = await departmentsById();
  const people = [];
  users.forEach(function (p) {
    const u = p.data();
    people.push({
      id: p.id, admin: u.admin === true,
      departments: (u.departments || []).map(function (m) {
        const d = depts[m.department];
        return { department: m.department, rank: d ? d.levels.indexOf(m.level) : 99 };
      })
    });
  });
  const groupMembers = {};
  groups.forEach(function (g) { groupMembers[g.id] = g.data().members || []; });

  let escalated = 0;
  for (const doc of todos.docs) {
    const todo = Object.assign({ id: doc.id }, doc.data());
    if (todo.archived) continue;
    todo.groupMembers = groupMembers[todo.assignee] || [];
    const recipients = L.escalationRecipients(todo, people, today);
    if (!recipients.length) continue;
    const late = L.daysLate(todo.due, today);
    await notify(recipients, 'Overdue ' + late + ' day' + (late === 1 ? '' : 's') + ': ' + todo.title, doc.id);
    escalated++;
  }
  await audit('system', 'todo.escalation', escalated + ' todos', 'chain of command only, never company wide');
});
