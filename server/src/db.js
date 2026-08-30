/* =========================================================================
   db.js — the database
   SQLite through Node's own built-in driver, so the server has no npm
   dependencies at all: nothing to install, nothing to keep patched, and the
   whole workspace is one file on disk you can copy or back up.

   The shape follows section 5.0 of the specification. Where a field is a list
   (tags on a todo, members of a group) it is stored as JSON in a text column
   rather than a join table: at the scale 7.0 specifies, 10 to 50 people and a
   few hundred clients, a join table would buy nothing and cost clarity.
   Originate Command · OM SRS 001
   ========================================================================= */

'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  title TEXT,
  admin INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'invited',
  password_hash TEXT,
  departments TEXT NOT NULL DEFAULT '[]',
  prefs TEXT NOT NULL DEFAULT '{}',
  invite TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  levels TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT,
  members TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  client TEXT NOT NULL,
  department TEXT NOT NULL,
  assignee_type TEXT NOT NULL,
  assignee TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  due TEXT,
  recurrence TEXT NOT NULL DEFAULT 'none',
  blocked_reason TEXT,
  spawned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  comments TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS instructions (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  client TEXT NOT NULL,
  department TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  read_by TEXT NOT NULL DEFAULT '[]',
  comments TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  linked_todo TEXT,
  posted_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  text TEXT NOT NULL,
  ref TEXT,
  at TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);

/* immutable by construction: the API offers no update or delete for it (5.0) */
CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_filters (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  filters TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_department ON todos(department);
CREATE INDEX IF NOT EXISTS idx_todos_assignee ON todos(assignee);
CREATE INDEX IF NOT EXISTS idx_todos_client ON todos(client);
CREATE INDEX IF NOT EXISTS idx_instructions_department ON instructions(department);
CREATE INDEX IF NOT EXISTS idx_instructions_client ON instructions(client);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user);
`;

/* which columns hold JSON, so rows come back as the shapes the app expects */
const JSON_COLUMNS = {
  users: ['departments', 'prefs', 'invite'],
  departments: ['levels'],
  groups: ['members'],
  todos: ['tags', 'comments'],
  instructions: ['tags', 'read_by', 'comments'],
  saved_filters: ['filters']
};
const BOOL_COLUMNS = {
  users: ['admin'],
  todos: ['spawned', 'archived'],
  instructions: ['archived'],
  notifications: ['read']
};

function open(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');      /* readers never block the writer */
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

function decode(table, row) {
  if (!row) return null;
  const out = Object.assign({}, row);
  (JSON_COLUMNS[table] || []).forEach(function (col) {
    if (typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]); } catch (e) { out[col] = null; }
    }
  });
  (BOOL_COLUMNS[table] || []).forEach(function (col) { out[col] = !!out[col]; });
  return out;
}

function encode(table, row) {
  const out = Object.assign({}, row);
  (JSON_COLUMNS[table] || []).forEach(function (col) {
    if (out[col] !== undefined && typeof out[col] !== 'string') out[col] = JSON.stringify(out[col]);
  });
  (BOOL_COLUMNS[table] || []).forEach(function (col) {
    if (out[col] !== undefined) out[col] = out[col] ? 1 : 0;
  });
  return out;
}

function all(db, table, where, params) {
  const sql = 'SELECT * FROM ' + table + (where ? ' WHERE ' + where : '');
  return db.prepare(sql).all(...(params || [])).map(function (r) { return decode(table, r); });
}

function get(db, table, id) {
  return decode(table, db.prepare('SELECT * FROM ' + table + ' WHERE id = ?').get(id));
}

function insert(db, table, row) {
  const data = encode(table, row);
  const cols = Object.keys(data);
  const sql = 'INSERT INTO ' + table + ' (' + cols.join(', ') + ') VALUES (' +
              cols.map(function () { return '?'; }).join(', ') + ')';
  db.prepare(sql).run(...cols.map(function (c) { return data[c] === undefined ? null : data[c]; }));
  return row;
}

function update(db, table, id, patch) {
  const data = encode(table, patch);
  const cols = Object.keys(data).filter(function (c) { return c !== 'id'; });
  if (!cols.length) return;
  const sql = 'UPDATE ' + table + ' SET ' + cols.map(function (c) { return c + ' = ?'; }).join(', ') +
              ' WHERE id = ?';
  db.prepare(sql).run(...cols.map(function (c) { return data[c] === undefined ? null : data[c]; }), id);
}

function audit(db, actor, action, target, detail) {
  insert(db, 'audit', {
    id: 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    actor, action, target: target || '', detail: detail || '',
    at: new Date().toISOString()
  });
}

module.exports = { open, all, get, insert, update, audit, decode, encode, SCHEMA };
