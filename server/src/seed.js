#!/usr/bin/env node
/* =========================================================================
   seed.js — a workspace to start from
   Fills an empty database with the departments, people, clients and work the
   specification uses as its examples, so the system can be tried before any
   real data is entered. Running it again on a database that already has
   accounts refuses, rather than overwriting somebody's real workspace.

   node server/src/seed.js            fill an empty database
   node server/src/seed.js --force    replace whatever is there
   Originate Command · OM SRS 001
   ========================================================================= */

'use strict';

const path = require('node:path');
const db = require('./db');
const auth = require('./auth');

const ROOT = path.resolve(__dirname, '..', '..');
const DB_FILE = process.env.OC_DB || path.join(ROOT, 'server', 'data', 'originate.db');
const PASSWORD = process.env.OC_SEED_PASSWORD || 'originate';

const DEPARTMENTS = [
  { id: 'd-admin', name: 'Admin & HR', levels: ['head', 'lead', 'member'] },
  { id: 'd-bizops', name: 'Business Operations', levels: ['head', 'lead', 'member'] },
  { id: 'd-leadgen', name: 'Lead Generation', levels: ['head', 'lead', 'member'] },
  { id: 'd-outreach', name: 'Outreach Operations', levels: ['head', 'lead', 'senior', 'member'] },
  { id: 'd-social', name: 'Social Media Management', levels: ['head', 'lead', 'member'] },
  { id: 'd-web', name: 'Web Development', levels: ['head', 'lead', 'member'] }
];

const PEOPLE = [
  ['u-shohag', 'Shohag Munshe', 'Founder', true, []],
  ['u-imran', 'Imran Sheikh', 'Operations Manager', false,
    [['d-bizops', 'head'], ['d-admin', 'head']]],
  ['u-nadia', 'Nadia Rahman', 'Outreach Director', false,
    [['d-outreach', 'head'], ['d-bizops', 'member']]],
  ['u-tanvir', 'Tanvir Hasan', 'Outreach Lead', false, [['d-outreach', 'lead']]],
  ['u-mim', 'Mim Akter', 'Senior Strategist', false, [['d-outreach', 'senior']]],
  ['u-rifat', 'Rifat Chowdhury', 'Outreach Associate', false, [['d-outreach', 'member']]],
  ['u-sadia', 'Sadia Islam', 'Lead Gen Head', false, [['d-leadgen', 'head']]],
  ['u-jubayer', 'Jubayer Alam', 'Researcher', false, [['d-leadgen', 'member']]],
  ['u-farhan', 'Farhan Kabir', 'Web Lead', false, [['d-web', 'head']]],
  ['u-ayesha', 'Ayesha Noor', 'Front-end Developer', false, [['d-web', 'member']]],
  ['u-piya', 'Piya Das', 'Social Media Head', false,
    [['d-social', 'head'], ['d-admin', 'member']]]
];

const CLIENTS = [
  ['c-chaim', 'Chaim', 'Chaim Weiss', 'active'],
  ['c-rafa', 'Rafa', 'Rafa Moreno', 'active'],
  ['c-annette', 'Annette', 'Annette Boyer', 'active'],
  ['c-orbit', 'Orbit Dental', 'Dr. Imelda Roy', 'active'],
  ['c-vertex', 'Vertex Legal', 'Peter Nam', 'paused']
];

const TAGS = [
  ['t-policy', 'Policy', 'type'], ['t-correction', 'Correction', 'type'],
  ['t-notice', 'Notice', 'type'], ['t-standing', 'Standing rule', 'category'],
  ['t-onboarding', 'Onboarding', 'category'], ['t-urgent', 'Urgent', 'custom']
];

function shift(days) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function stamp(daysAgo, hour) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hour || 10, 5, 0, 0);
  return d.toISOString();
}

const TODOS = [
  ['Manual reply check', 'Sweep the ActiveCampaign inbox and log every reply that needs a human answer.',
    'c-chaim', 'd-outreach', 'user', 'u-rifat', 'open', 'high', shift(0), 'daily', 'u-tanvir', 1],
  ['Book the Thursday demo slots', 'Three qualified replies waiting on a calendar link.',
    'c-chaim', 'd-outreach', 'user', 'u-mim', 'progress', 'high', shift(-2), 'none', 'u-nadia', 4],
  ['Rebuild the Chaim landing page hero', 'New copy is approved, the old hero image stays.',
    'c-chaim', 'd-web', 'group', 'g-relaunch', 'progress', 'normal', shift(3), 'none', 'u-shohag', 5],
  ['Weekly sequence performance report', 'Open rate, reply rate and booked calls per sequence.',
    'c-chaim', 'd-outreach', 'user', 'u-tanvir', 'done', 'normal', shift(-3), 'weekly', 'u-nadia', 8],
  ['Clean the Rafa prospect list', 'Strip duplicates and anything without a verified email.',
    'c-rafa', 'd-leadgen', 'user', 'u-jubayer', 'open', 'normal', shift(1), 'none', 'u-sadia', 2],
  ['Rafa: rewrite sequence two', 'Reply rate has dropped for three weeks running.',
    'c-rafa', 'd-outreach', 'user', 'u-mim', 'blocked', 'high', shift(-1), 'none', 'u-nadia', 6],
  ['Annette: schedule the October grid', 'Twelve posts, captions already written.',
    'c-annette', 'd-social', 'user', 'u-piya', 'open', 'normal', shift(2), 'monthly', 'u-piya', 3],
  ['Annette: fix the booking form redirect', 'Form submits but lands on a 404 instead of the thank-you page.',
    'c-annette', 'd-web', 'user', 'u-ayesha', 'open', 'high', shift(-4), 'none', 'u-farhan', 7],
  ['Orbit Dental: build the seed list', 'Practices within 40km, three or more chairs.',
    'c-orbit', 'd-leadgen', 'user', 'u-jubayer', 'open', 'normal', shift(4), 'none', 'u-sadia', 2],
  ['Monthly invoicing pack', 'Hours and deliverables per client for the finance handover.',
    'c-vertex', 'd-bizops', 'user', 'u-imran', 'open', 'normal', shift(6), 'monthly', 'u-shohag', 4],
  ['Draft the new hire onboarding checklist', 'One page: accounts, tools, first-week reading.',
    'c-vertex', 'd-admin', 'user', 'u-piya', 'progress', 'low', shift(8), 'none', 'u-imran', 5],
  ['Quarterly client health review', 'Every active client, red, amber or green, with a reason.',
    'c-orbit', 'd-bizops', 'user', 'u-nadia', 'open', 'normal', shift(12), 'quarterly', 'u-imran', 6],
  ['Chaim: verify tracking on the new pages', 'Events firing for form submits and calendar clicks.',
    'c-chaim', 'd-web', 'user', 'u-ayesha', 'open', 'normal', shift(5), 'none', 'u-farhan', 1]
];

const INSTRUCTIONS = [
  ['Before any meeting is booked for Chaim, the context of the conversation must be documented in ActiveCampaign. Not after the call, before the invite goes out. If it is not in the account, it did not happen.',
    'u-shohag', 'c-chaim', 'd-outreach', ['t-policy', 't-standing'], ['u-nadia', 'u-tanvir'], 6, 9],
  ['Chaim does not want weekend follow-ups. Anything that would land Saturday or Sunday waits until Monday morning.',
    'u-nadia', 'c-chaim', 'd-outreach', ['t-standing'], ['u-tanvir', 'u-mim', 'u-rifat'], 5, 14],
  ['Correction on the Rafa sequence: the second email was going out with the old pricing line. Fixed in the template, but check anything queued before today.',
    'u-tanvir', 'c-rafa', 'd-outreach', ['t-correction', 't-urgent'], ['u-mim'], 3, 11],
  ['Annette has asked that no design changes go live on a Friday. Ship Monday to Thursday, or hold.',
    'u-piya', 'c-annette', 'd-web', ['t-policy', 't-standing'], ['u-farhan'], 4, 16],
  ['Orbit Dental onboarding: the practice manager is the only approver. Do not action requests from the front desk without her on the thread.',
    'u-sadia', 'c-orbit', 'd-leadgen', ['t-onboarding', 't-standing'], [], 2, 10],
  ['Vertex Legal is paused until the new retainer is signed. No outreach, no posts, no dev work billed against them.',
    'u-imran', 'c-vertex', 'd-bizops', ['t-notice'], ['u-shohag'], 2, 15],
  ['All new prospect lists need a source column from now on. If we cannot say where a contact came from, it does not go in the sequence.',
    'u-sadia', 'c-rafa', 'd-leadgen', ['t-policy'], ['u-jubayer'], 1, 12],
  ['Reminder for everyone on the Chaim relaunch: staging links only in the group, nothing goes to the client until Farhan has reviewed it.',
    'u-shohag', 'c-chaim', 'd-web', ['t-notice'], [], 0, 9]
];

function run() {
  const database = db.open(DB_FILE);
  const existing = database.prepare('SELECT count(*) AS c FROM users').get().c;
  const force = process.argv.indexOf('--force') > -1;

  if (existing && !force) {
    process.stdout.write('This database already holds ' + existing + ' accounts. ' +
      'Seeding would overwrite them.\nRun with --force if that is what you want.\n');
    process.exit(1);
  }
  if (force) {
    ['users', 'departments', 'clients', 'tags', 'groups', 'todos',
     'instructions', 'notifications', 'audit', 'saved_filters', 'sessions']
      .forEach((t) => database.prepare('DELETE FROM ' + t).run());
  }

  DEPARTMENTS.forEach((d) => db.insert(database, 'departments', d));
  CLIENTS.forEach(([id, name, contact, status]) =>
    db.insert(database, 'clients', { id, name, contact, status }));
  TAGS.forEach(([id, label, kind]) => db.insert(database, 'tags', { id, label, kind }));

  const hash = auth.hashPassword(PASSWORD);
  PEOPLE.forEach(([id, name, title, admin, depts]) => {
    db.insert(database, 'users', {
      id, name, title, admin,
      email: id.replace('u-', '') + '@originate.example',
      status: 'active', password_hash: hash,
      departments: depts.map(([department, level]) => ({ department, level })),
      prefs: { push: true, email: true, discord: admin },
      invite: null
    });
  });

  db.insert(database, 'groups', {
    id: 'g-relaunch', name: 'Chaim Site Relaunch',
    purpose: 'Cross-department push to ship the new Chaim landing pages before the Q4 campaign.',
    members: ['u-tanvir', 'u-ayesha', 'u-shohag'], created_by: 'u-shohag',
    status: 'active', created_at: stamp(9)
  });

  TODOS.forEach(([title, description, client, department, atype, assignee,
                  state, priority, due, recurrence, created_by, ago], i) => {
    db.insert(database, 'todos', {
      id: 't-' + (i + 1), title, description, client, department,
      assignee_type: atype, assignee, state, priority, due, recurrence,
      blocked_reason: state === 'blocked' ? 'Waiting on the client to approve the new positioning line.' : null,
      spawned: false, archived: false,
      tags: priority === 'high' ? ['t-urgent'] : [],
      comments: [], created_by, created_at: stamp(ago)
    });
  });

  INSTRUCTIONS.forEach(([body, author, client, department, tags, read_by, ago, hour], i) => {
    db.insert(database, 'instructions', {
      id: 'n-' + (i + 1), body, author, client, department, tags, read_by,
      comments: [], archived: false, linked_todo: null, posted_at: stamp(ago, hour)
    });
  });

  db.audit(database, 'u-shohag', 'system.seed', 'Originate Command',
    PEOPLE.length + ' accounts, ' + DEPARTMENTS.length + ' departments');

  process.stdout.write('Seeded ' + DB_FILE + '\n');
  process.stdout.write('  ' + PEOPLE.length + ' accounts, ' + DEPARTMENTS.length + ' departments, ' +
    CLIENTS.length + ' clients, ' + TODOS.length + ' todos, ' + INSTRUCTIONS.length + ' instructions\n');
  process.stdout.write('  sign in as shohag@originate.example (admin) or rifat@originate.example (member)\n');
  process.stdout.write('  password: ' + PASSWORD + '\n');
}

if (require.main === module) run();
module.exports = { run, PEOPLE, DEPARTMENTS };
