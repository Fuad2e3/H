/* =========================================================================
   auth.js — accounts and sessions
   Passwords are hashed with scrypt from Node's own crypto, never stored or
   logged in the clear (8.2). Sessions are opaque random tokens held in the
   database and sent as an HttpOnly cookie, so a script on the page cannot
   read one even if something manages to inject a script.

   Section 6.1 sets the session lengths: 14 days on a trusted device, 12 hours
   otherwise, and an invite link that is single use and expires after 72 hours.
   Originate Command · OM SRS 001
   ========================================================================= */

'use strict';

const crypto = require('node:crypto');
const db = require('./db');

const SESSION_TRUSTED_DAYS = 14;
const SESSION_HOURS = 12;
const INVITE_HOURS = 72;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + derived.toString('hex');
}

function verifyPassword(password, stored) {
  if (!stored || stored.indexOf('scrypt$') !== 0) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  /* constant time, so a wrong password cannot be narrowed down by timing */
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

function token() { return crypto.randomBytes(32).toString('hex'); }

function createSession(database, userId, trusted) {
  const expires = new Date();
  if (trusted) expires.setDate(expires.getDate() + SESSION_TRUSTED_DAYS);
  else expires.setHours(expires.getHours() + SESSION_HOURS);
  const row = {
    token: token(), user: userId,
    created_at: new Date().toISOString(), expires_at: expires.toISOString()
  };
  database.prepare('INSERT INTO sessions (token, user, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(row.token, row.user, row.created_at, row.expires_at);
  return row;
}

function readSession(database, sessionToken) {
  if (!sessionToken) return null;
  const row = database.prepare('SELECT * FROM sessions WHERE token = ?').get(sessionToken);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    database.prepare('DELETE FROM sessions WHERE token = ?').run(sessionToken);
    return null;
  }
  return row;
}

function endSession(database, sessionToken) {
  database.prepare('DELETE FROM sessions WHERE token = ?').run(sessionToken);
}

function endAllSessionsFor(database, userId) {
  database.prepare('DELETE FROM sessions WHERE user = ?').run(userId);
}

function issueInvite(byUserId) {
  const expires = new Date();
  expires.setHours(expires.getHours() + INVITE_HOURS);
  return {
    token: 'inv-' + crypto.randomBytes(12).toString('hex'),
    issued_by: byUserId,
    issued_at: new Date().toISOString(),
    expires_at: expires.toISOString(),
    claimed_at: null
  };
}

function inviteUsable(invite) {
  if (!invite || invite.claimed_at) return false;      /* single use */
  return new Date(invite.expires_at) > new Date();
}

/* the signed-in account for a request, or null */
function currentUser(database, cookies) {
  const session = readSession(database, cookies.oc_session);
  if (!session) return null;
  const user = db.get(database, 'users', session.user);
  if (!user || user.status !== 'active') return null;
  user.session_token = session.token;
  return user;
}

module.exports = {
  hashPassword, verifyPassword, createSession, readSession, endSession,
  endAllSessionsFor, issueInvite, inviteUsable, currentUser,
  SESSION_TRUSTED_DAYS, SESSION_HOURS, INVITE_HOURS
};
