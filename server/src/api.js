/* =========================================================================
   api.js — the HTTP API
   Every route decides for itself what the caller is entitled to. The browser
   never sends "I am an admin"; it sends a session cookie, and the server
   looks up who that is and what section 3.0 lets them do.

   GET  /api/state          the workspace, already scoped to the caller (3.1)
   POST /api/session        sign in            DELETE /api/session  sign out
   POST /api/todos          create             PATCH /api/todos/:id
   POST /api/instructions   post               PATCH /api/instructions/:id
   POST /api/groups         create             PATCH /api/groups/:id
   POST /api/users          invite             PATCH /api/users/:id
   POST /api/departments    create             PATCH /api/departments/:id
   POST /api/comments       comment on either kind
   POST /api/filters        pin a filter       DELETE /api/filters/:id
   GET  /api/events         server sent events, so other screens keep up
   Originate Command · OM SRS 001
   ========================================================================= */

'use strict';

const db = require('./db');
const auth = require('./auth');
const P = require('./permissions');

const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toISOString();

/* everything the permission functions need to decide */
function context(database) {
  return {
    users: db.all(database, 'users'),
    departments: db.all(database, 'departments'),
    groups: db.all(database, 'groups')
  };
}

/* ---- the workspace, scoped (3.1) -----------------------------------------
   Scoping happens here rather than in the browser. What a person is not
   entitled to see never leaves the server, so no amount of poking at the page
   reveals it. */
function stateFor(database, user) {
  const ctx = context(database);
  const todos = db.all(database, 'todos').filter((t) => P.seeTodo(user, t, ctx));
  const instructions = db.all(database, 'instructions').filter((n) => P.seeInstruction(user, n));

  return {
    me: user.id,
    users: ctx.users.map((u) => {
      const safe = Object.assign({}, u);
      delete safe.password_hash;                       /* never leaves the server */
      delete safe.session_token;
      if (!P.manageInvite(user, u) && !user.admin) delete safe.invite;
      return safe;
    }),
    departments: ctx.departments,
    groups: ctx.groups,
    clients: db.all(database, 'clients'),
    tags: db.all(database, 'tags'),
    todos,
    instructions,
    notifications: db.all(database, 'notifications', 'user = ?', [user.id]),
    audit: P.seeAudit(user) ? db.all(database, 'audit').sort((a, b) => b.at.localeCompare(a.at)) : [],
    saved_filters: db.all(database, 'saved_filters', 'owner = ?', [user.id])
  };
}

/* ---- notifications, the in-app channel (9.0) ----------------------------- */
function notify(database, userIds, text, ref) {
  const at = now();
  userIds.forEach((user) => {
    db.insert(database, 'notifications', { id: uid('nt'), user, text, ref: ref || null, at, read: false });
  });
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

/* ---- routes -------------------------------------------------------------- */
const routes = {
  'POST /api/session': (database, _user, body) => {
    const email = String(body.email || '').trim().toLowerCase();
    const account = db.all(database, 'users', 'lower(email) = ?', [email])[0];
    /* the same answer either way, so this cannot be used to discover which
       addresses have accounts */
    if (!account || !auth.verifyPassword(String(body.password || ''), account.password_hash)) {
      fail(401, 'That email and password do not match an account.');
    }
    if (account.status !== 'active') {
      fail(403, 'That account has not been activated. Accounts are created by invite (6.1).');
    }
    const session = auth.createSession(database, account.id, !!body.trusted);
    db.audit(database, account.id, 'session.start', account.name, body.trusted ? 'trusted device' : '');
    return { session: session.token, expires_at: session.expires_at, user: account.id };
  },

  'DELETE /api/session': (database, user) => {
    auth.endSession(database, user.session_token);
    db.audit(database, user.id, 'session.end', user.name);
    return { ok: true };
  },

  'GET /api/state': (database, user) => stateFor(database, user),

  /* ---- todos (6.2) ------------------------------------------------------- */
  'POST /api/todos': (database, user, body) => {
    const ctx = context(database);
    if (!body.title || !String(body.title).trim()) fail(400, 'A todo needs a title.');
    if (!body.client) fail(400, 'Select a client. This is required by 5.2.');
    if (!body.department) fail(400, 'Select a department. This is required by 5.2.');

    const type = body.assignee_type === 'group' ? 'group' : 'user';
    const allowed = type === 'group'
      ? P.assignToGroup(user, body.assignee, ctx)
      : P.assignTo(user, body.assignee, ctx);
    if (!allowed) fail(403, 'You cannot assign work to that person or group (3.2).');

    const todo = {
      id: uid('t'), title: String(body.title).trim(), description: String(body.description || '').trim(),
      client: body.client, department: body.department,
      assignee_type: type, assignee: body.assignee,
      state: 'open', priority: body.priority || 'normal', due: body.due || null,
      recurrence: body.recurrence || 'none', blocked_reason: null,
      spawned: false, archived: false,
      tags: Array.isArray(body.tags) ? body.tags : [],
      comments: [], created_by: user.id, created_at: now()
    };
    if (todo.priority === 'high' && todo.tags.indexOf('t-urgent') === -1) todo.tags.push('t-urgent');
    db.insert(database, 'todos', todo);
    db.audit(database, user.id, 'todo.create', todo.title, 'assigned to ' + todo.assignee);

    const targets = type === 'group'
      ? ((ctx.groups.find((g) => g.id === todo.assignee) || {}).members || [])
      : [todo.assignee];
    notify(database, targets.filter((id) => id !== user.id), user.name + ' assigned you: ' + todo.title, todo.id);
    return todo;
  },

  'PATCH /api/todos/:id': (database, user, body, params) => {
    const ctx = context(database);
    const todo = db.get(database, 'todos', params.id);
    if (!todo || !P.seeTodo(user, todo, ctx)) fail(404, 'No such todo.');

    const movingWork = ('assignee' in body) || ('assignee_type' in body) || ('department' in body);
    if (movingWork && !P.reassign(user, todo, ctx)) {
      fail(403, 'Your role can change the state of this todo but not hand it on (6.2).');
    }
    if (!movingWork && !P.changeState(user, todo, ctx)) {
      fail(403, 'That todo is not yours to change.');
    }
    if (body.assignee && body.assignee_type !== 'group' && !P.assignTo(user, body.assignee, ctx)) {
      fail(403, 'You cannot assign work to that person (3.2).');
    }
    if (body.state === 'blocked' && !String(body.blocked_reason || '').trim()) {
      fail(400, 'A blocked todo needs a one line reason (6.2).');
    }

    const patch = {};
    ['title', 'description', 'client', 'department', 'assignee', 'assignee_type',
     'state', 'priority', 'due', 'recurrence', 'blocked_reason', 'spawned',
     'archived', 'tags'].forEach((k) => { if (k in body) patch[k] = body[k]; });
    if (patch.state && patch.state !== 'blocked') patch.blocked_reason = null;

    db.update(database, 'todos', todo.id, patch);
    db.audit(database, user.id, 'todo.update', todo.title, Object.keys(patch).join(', '));

    if (patch.assignee && patch.assignee !== todo.assignee) {
      notify(database, [patch.assignee], user.name + ' assigned you: ' + todo.title, todo.id);
    }
    return db.get(database, 'todos', todo.id);
  },

  /* ---- instructions (6.3) ------------------------------------------------ */
  'POST /api/instructions': (database, user, body) => {
    if (!String(body.body || '').trim()) fail(400, 'Write the instruction first.');
    if (!body.client) fail(400, 'Select a client. This is required by 5.2.');
    if (!body.department) fail(400, 'Select a department. This is required by 5.2.');

    const note = {
      id: uid('n'), body: String(body.body).trim(), author: user.id,
      client: body.client, department: body.department,
      tags: Array.isArray(body.tags) ? body.tags : [],
      read_by: [user.id], comments: [], archived: false, linked_todo: null,
      posted_at: now()
    };
    db.insert(database, 'instructions', note);
    db.audit(database, user.id, 'instruction.post', note.body.slice(0, 48), 'client ' + note.client);

    const audience = db.all(database, 'users')
      .filter((u) => u.id !== user.id && u.status === 'active' && P.seeInstruction(u, note))
      .map((u) => u.id);
    notify(database, audience, user.name + ' posted an instruction', note.id);
    return note;
  },

  'PATCH /api/instructions/:id': (database, user, body, params) => {
    const ctx = context(database);
    const note = db.get(database, 'instructions', params.id);
    if (!note || !P.seeInstruction(user, note)) fail(404, 'No such instruction.');

    /* marking it read is open to anyone who may see it; everything else is not */
    const keys = Object.keys(body);
    const onlyRead = keys.length === 1 && keys[0] === 'read';
    if (onlyRead) {
      const read_by = note.read_by.indexOf(user.id) > -1 ? note.read_by : note.read_by.concat([user.id]);
      db.update(database, 'instructions', note.id, { read_by });
      return db.get(database, 'instructions', note.id);
    }
    if (!P.archiveInstruction(user, note, ctx)) {
      fail(403, 'Only the author, a department head or the admin may change this (6.3).');
    }
    const patch = {};
    ['body', 'tags', 'archived', 'linked_todo'].forEach((k) => { if (k in body) patch[k] = body[k]; });
    db.update(database, 'instructions', note.id, patch);
    db.audit(database, user.id, 'instruction.update', note.body.slice(0, 48), Object.keys(patch).join(', '));
    return db.get(database, 'instructions', note.id);
  },

  /* ---- comments (5.0) ---------------------------------------------------- */
  'POST /api/comments': (database, user, body) => {
    const ctx = context(database);
    const table = body.kind === 'todo' ? 'todos' : 'instructions';
    const item = db.get(database, table, body.id);
    if (!item) fail(404, 'No such item.');
    const visible = table === 'todos' ? P.seeTodo(user, item, ctx) : P.seeInstruction(user, item);
    if (!visible) fail(404, 'No such item.');
    if (!String(body.body || '').trim()) fail(400, 'A comment needs some text.');

    const comment = { id: uid('c'), author: user.id, body: String(body.body).trim(), posted_at: now() };
    db.update(database, table, item.id, { comments: (item.comments || []).concat([comment]) });
    db.audit(database, user.id, table.slice(0, -1) + '.comment', item.title || item.body.slice(0, 40), comment.body);
    return comment;
  },

  /* ---- groups (4.2, 6.5) ------------------------------------------------- */
  'POST /api/groups': (database, user, body) => {
    const ctx = context(database);
    if (!P.createGroup(user, ctx)) fail(403, 'Groups are created by the admin and department heads (4.2).');
    if (!String(body.name || '').trim()) fail(400, 'Give the group a name.');
    if (!String(body.purpose || '').trim()) fail(400, 'Say what the group is for.');
    if (!Array.isArray(body.members) || body.members.length < 2) fail(400, 'A group needs at least two people.');

    const group = {
      id: uid('g'), name: String(body.name).trim(), purpose: String(body.purpose).trim(),
      members: body.members, created_by: user.id, status: 'active', created_at: now()
    };
    db.insert(database, 'groups', group);
    db.audit(database, user.id, 'group.create', group.name, group.members.length + ' members');
    notify(database, group.members.filter((id) => id !== user.id),
      user.name + ' added you to ' + group.name, group.id);
    return group;
  },

  'PATCH /api/groups/:id': (database, user, body, params) => {
    const ctx = context(database);
    const group = db.get(database, 'groups', params.id);
    if (!group) fail(404, 'No such group.');
    if (!(user.admin || group.created_by === user.id || P.headOfAny(user, ctx.departments))) {
      fail(403, 'Only the admin, a department head or whoever created it may change a group.');
    }
    const patch = {};
    ['name', 'purpose', 'members', 'status'].forEach((k) => { if (k in body) patch[k] = body[k]; });
    db.update(database, 'groups', group.id, patch);
    db.audit(database, user.id, 'group.update', group.name, Object.keys(patch).join(', '));
    return db.get(database, 'groups', group.id);
  },

  /* ---- people and departments (6.1, 3.4, 4.1) ---------------------------- */
  'POST /api/users': (database, user, body) => {
    const ctx = context(database);
    if (!P.invite(user, ctx)) fail(403, 'Invites are sent by the admin and department heads (6.1).');
    if (!String(body.name || '').trim()) fail(400, 'Enter a name.');
    if (!/.+@.+\..+/.test(String(body.email || ''))) fail(400, 'Enter a valid email address.');
    if (db.all(database, 'users', 'lower(email) = ?', [String(body.email).toLowerCase()]).length) {
      fail(409, 'An account with that address already exists.');
    }
    const account = {
      id: uid('u'), name: String(body.name).trim(), email: String(body.email).trim(),
      title: String(body.title || 'Team member').trim(), admin: false, status: 'invited',
      password_hash: null, departments: body.departments || [],
      prefs: { push: true, email: true, discord: false },
      invite: auth.issueInvite(user.id)
    };
    db.insert(database, 'users', account);
    db.audit(database, user.id, 'user.invite', account.name, 'expires ' + account.invite.expires_at);
    return account;
  },

  'PATCH /api/users/:id': (database, user, body, params) => {
    const ctx = context(database);
    const target = db.get(database, 'users', params.id);
    if (!target) fail(404, 'No such account.');

    const own = target.id === user.id;
    const ownFields = ['name', 'title', 'prefs'];
    const keys = Object.keys(body);

    if (!user.admin) {
      /* a person edits their own profile; role, department and status are
         granted by someone with authority, never taken (8.2) */
      const managingInvite = P.manageInvite(user, target) &&
        keys.every((k) => ['invite', 'status'].indexOf(k) > -1);
      if (!managingInvite && !(own && keys.every((k) => ownFields.indexOf(k) > -1))) {
        fail(403, 'That is not yours to change (8.2).');
      }
    }
    const patch = {};
    ['name', 'title', 'prefs', 'departments', 'status', 'admin', 'invite']
      .forEach((k) => { if (k in body) patch[k] = body[k]; });
    db.update(database, 'users', target.id, patch);
    if (patch.departments || patch.admin !== undefined || patch.status) {
      /* authority changed, so old sessions must not keep the old reach */
      auth.endAllSessionsFor(database, target.id);
    }
    db.audit(database, user.id, 'user.update', target.name, Object.keys(patch).join(', '));
    return Object.assign({}, db.get(database, 'users', target.id), { password_hash: undefined });
  },

  'POST /api/users/:id/invite': (database, user, _body, params) => {
    const target = db.get(database, 'users', params.id);
    if (!target) fail(404, 'No such account.');
    if (!P.manageInvite(user, target)) {
      fail(403, 'An invite is resent by whoever sent it, or by the admin (6.1).');
    }
    const invite = auth.issueInvite(user.id);
    db.update(database, 'users', target.id, { invite });
    db.audit(database, user.id, 'user.invite.resend', target.name,
      'previous link invalidated, expires ' + invite.expires_at);
    return invite;
  },

  'DELETE /api/users/:id': (database, user, _body, params) => {
    const target = db.get(database, 'users', params.id);
    if (!target) fail(404, 'No such account.');
    if (!P.manageInvite(user, target)) fail(403, 'Only an unclaimed invite can be withdrawn (6.1).');
    database.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    db.audit(database, user.id, 'user.invite.revoke', target.name);
    return { ok: true };
  },

  'POST /api/departments': (database, user, body) => {
    if (!P.manageDepartments(user)) fail(403, 'Departments are the admin\'s to add (4.1).');
    if (!String(body.name || '').trim()) fail(400, 'Give the department a name.');
    const levels = Array.isArray(body.levels) ? body.levels.filter(Boolean) : [];
    if (levels.length < 2) fail(400, 'A department needs at least two levels.');
    const dept = { id: uid('d'), name: String(body.name).trim(), levels };
    db.insert(database, 'departments', dept);
    db.audit(database, user.id, 'department.create', dept.name, levels.join(' → '));
    return dept;
  },

  'PATCH /api/departments/:id': (database, user, body, params) => {
    if (!P.manageDepartments(user)) fail(403, 'Departments are the admin\'s to change (3.4).');
    const dept = db.get(database, 'departments', params.id);
    if (!dept) fail(404, 'No such department.');
    if (body.levels) {
      const levels = body.levels.filter(Boolean);
      if (levels.length < 2) fail(400, 'A department needs at least two levels.');
      const orphaned = db.all(database, 'users').filter((u) => {
        const lv = P.levelIn(u, dept.id);
        return lv && levels.indexOf(lv) === -1;
      });
      if (orphaned.length) {
        fail(409, 'Removing a level people still hold: ' + orphaned.map((u) => u.name).join(', ') + '.');
      }
      db.update(database, 'departments', dept.id, { levels });
      /* the hierarchy is the authority, so everyone's reach may have changed */
      db.all(database, 'users').forEach((u) => {
        if (P.levelIn(u, dept.id)) auth.endAllSessionsFor(database, u.id);
      });
    }
    if (body.name) db.update(database, 'departments', dept.id, { name: String(body.name).trim() });
    db.audit(database, user.id, 'department.update', dept.name, Object.keys(body).join(', '));
    return db.get(database, 'departments', dept.id);
  },

  /* ---- tags, clients, filters, notifications ----------------------------- */
  'POST /api/tags': (database, user, body) => {
    if (!String(body.label || '').trim()) fail(400, 'A tag needs a label.');
    const existing = db.all(database, 'tags').find(
      (t) => t.label.toLowerCase() === String(body.label).trim().toLowerCase());
    if (existing) return existing;
    const tag = { id: uid('tag'), label: String(body.label).trim(), kind: body.kind || 'custom' };
    db.insert(database, 'tags', tag);
    return tag;
  },

  'POST /api/filters': (database, user, body) => {
    if (!String(body.name || '').trim()) fail(400, 'Give the filter a name.');
    const filter = {
      id: uid('sf'), owner: user.id, name: String(body.name).trim(),
      filters: body.filters || {}
    };
    db.insert(database, 'saved_filters', filter);
    return filter;
  },

  'DELETE /api/filters/:id': (database, user, _body, params) => {
    const row = db.get(database, 'saved_filters', params.id);
    if (!row || row.owner !== user.id) fail(404, 'No such filter.');
    database.prepare('DELETE FROM saved_filters WHERE id = ?').run(params.id);
    return { ok: true };
  },

  'POST /api/notifications/read': (database, user) => {
    database.prepare('UPDATE notifications SET read = 1 WHERE user = ?').run(user.id);
    return { ok: true };
  }
};

module.exports = { routes, stateFor, context, notify, HttpError, uid };
