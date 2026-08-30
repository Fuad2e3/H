/**
 * server.js — Originate Command local development server
 *
 * Serves the static application AND exposes a lightweight REST API at /api/*
 * so the store data can be inspected from any HTTP client without opening
 * a browser. All data is seeded from the same seed() values used by store.js,
 * held in-memory (resets when the process restarts).
 *
 * Usage:
 *   node server.js            → http://localhost:7000
 *   node server.js 8080       → http://localhost:8080
 *
 * API endpoints:
 *   GET  /api/state              full state snapshot
 *   GET  /api/departments        all departments
 *   GET  /api/users              all users
 *   GET  /api/clients            all clients
 *   GET  /api/tags               all tags
 *   GET  /api/groups             all groups
 *   GET  /api/todos              all todos
 *   GET  /api/instructions       all instructions
 *   GET  /api/notifications      all notifications
 *   GET  /api/audit              audit log
 *   GET  /api/todos/:id          single todo
 *   GET  /api/instructions/:id   single instruction
 *   GET  /api/users/:id          single user
 *   POST /api/reset              re-seed all data (returns fresh state)
 */

'use strict';

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = parseInt(process.argv[2] || process.env.PORT || '7000', 10);
const ROOT = __dirname;

/* =========================================================================
   Seed data (mirrors store.js seed())
   ========================================================================= */
function makeISO(d)   { return d.toISOString().slice(0, 10); }
function shift(days)  {
  const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() + days);
  return makeISO(d);
}
function stamp(daysAgo, hour) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour || 10, 5, 0, 0);
  return d.toISOString();
}

function seed() {
  const departments = [
    { id: 'd-admin',    name: 'Admin & HR',              levels: ['head','lead','member'] },
    { id: 'd-bizops',   name: 'Business Operations',     levels: ['head','lead','member'] },
    { id: 'd-leadgen',  name: 'Lead Generation',         levels: ['head','lead','member'] },
    { id: 'd-outreach', name: 'Outreach Operations',     levels: ['head','lead','senior','member'] },
    { id: 'd-social',   name: 'Social Media Management', levels: ['head','lead','member'] },
    { id: 'd-web',      name: 'Web Development',         levels: ['head','lead','member'] }
  ];

  const users = [
    { id:'u-shohag',  name:'Shohag Munshe',    title:'Founder',             admin:true,  departments:[] },
    { id:'u-imran',   name:'Imran Sheikh',     title:'Operations Manager',  admin:false, departments:[{department:'d-bizops',level:'head'},{department:'d-admin',level:'head'}] },
    { id:'u-nadia',   name:'Nadia Rahman',     title:'Outreach Director',   admin:false, departments:[{department:'d-outreach',level:'head'},{department:'d-bizops',level:'member'}] },
    { id:'u-tanvir',  name:'Tanvir Hasan',     title:'Outreach Lead',       admin:false, departments:[{department:'d-outreach',level:'lead'}] },
    { id:'u-mim',     name:'Mim Akter',        title:'Senior Strategist',   admin:false, departments:[{department:'d-outreach',level:'senior'}] },
    { id:'u-rifat',   name:'Rifat Chowdhury',  title:'Outreach Associate',  admin:false, departments:[{department:'d-outreach',level:'member'}] },
    { id:'u-sadia',   name:'Sadia Islam',      title:'Lead Gen Head',       admin:false, departments:[{department:'d-leadgen',level:'head'}] },
    { id:'u-jubayer', name:'Jubayer Alam',     title:'Researcher',          admin:false, departments:[{department:'d-leadgen',level:'member'}] },
    { id:'u-farhan',  name:'Farhan Kabir',     title:'Web Lead',            admin:false, departments:[{department:'d-web',level:'head'}] },
    { id:'u-ayesha',  name:'Ayesha Noor',      title:'Front-end Developer', admin:false, departments:[{department:'d-web',level:'member'}] },
    { id:'u-piya',    name:'Piya Das',         title:'Social Media Head',   admin:false, departments:[{department:'d-social',level:'head'},{department:'d-admin',level:'member'}] }
  ];
  users.forEach(u => {
    u.email  = u.id.replace('u-', '') + '@originate.example';
    u.status = 'active';
    u.prefs  = { push: true, email: true, discord: u.admin };
    u.invite = null;
  });

  const clients = [
    { id:'c-chaim',   name:'Chaim',        contact:'Chaim Weiss',    status:'active' },
    { id:'c-rafa',    name:'Rafa',         contact:'Rafa Moreno',    status:'active' },
    { id:'c-annette', name:'Annette',      contact:'Annette Boyer',  status:'active' },
    { id:'c-orbit',   name:'Orbit Dental', contact:'Dr. Imelda Roy', status:'active' },
    { id:'c-vertex',  name:'Vertex Legal', contact:'Peter Nam',      status:'paused' }
  ];

  const tags = [
    { id:'t-policy',     label:'Policy',        kind:'type'     },
    { id:'t-correction', label:'Correction',    kind:'type'     },
    { id:'t-notice',     label:'Notice',        kind:'type'     },
    { id:'t-standing',   label:'Standing rule', kind:'category' },
    { id:'t-onboarding', label:'Onboarding',    kind:'category' },
    { id:'t-urgent',     label:'Urgent',        kind:'custom'   }
  ];

  const groups = [
    { id:'g-relaunch', name:'Chaim Site Relaunch',
      purpose:'Cross-department push to ship the new Chaim landing pages before the Q4 campaign.',
      members:['u-tanvir','u-ayesha','u-shohag'], created_by:'u-shohag',
      status:'active', created_at:stamp(9) }
  ];

  const todos = [
    { title:'Manual reply check', description:'Sweep the ActiveCampaign inbox and log every reply that needs a human answer.',
      client:'c-chaim', department:'d-outreach', assignee_type:'user', assignee:'u-rifat',
      state:'open', priority:'high', due:shift(0), recurrence:'daily', created_by:'u-tanvir', created_at:stamp(1) },
    { title:'Book the Thursday demo slots', description:'Three qualified replies waiting on a calendar link.',
      client:'c-chaim', department:'d-outreach', assignee_type:'user', assignee:'u-mim',
      state:'progress', priority:'high', due:shift(-2), recurrence:'none', created_by:'u-nadia', created_at:stamp(4) },
    { title:'Rebuild the Chaim landing page hero', description:'New copy is approved, the old hero image stays.',
      client:'c-chaim', department:'d-web', assignee_type:'group', assignee:'g-relaunch',
      state:'progress', priority:'normal', due:shift(3), recurrence:'none', created_by:'u-shohag', created_at:stamp(5) },
    { title:'Weekly sequence performance report', description:'Open rate, reply rate and booked calls per sequence.',
      client:'c-chaim', department:'d-outreach', assignee_type:'user', assignee:'u-tanvir',
      state:'done', priority:'normal', due:shift(-3), recurrence:'weekly', created_by:'u-nadia', created_at:stamp(8) },
    { title:'Clean the Rafa prospect list', description:'Strip duplicates and anything without a verified email.',
      client:'c-rafa', department:'d-leadgen', assignee_type:'user', assignee:'u-jubayer',
      state:'open', priority:'normal', due:shift(1), recurrence:'none', created_by:'u-sadia', created_at:stamp(2) },
    { title:'Rafa: rewrite sequence two', description:'Reply rate has dropped for three weeks running.',
      client:'c-rafa', department:'d-outreach', assignee_type:'user', assignee:'u-mim',
      state:'blocked', priority:'high', due:shift(-1), recurrence:'none', created_by:'u-nadia', created_at:stamp(6),
      blocked_reason:'Waiting on the client to approve the new positioning line.' },
    { title:'Annette: schedule the October grid', description:'Twelve posts, captions already written.',
      client:'c-annette', department:'d-social', assignee_type:'user', assignee:'u-piya',
      state:'open', priority:'normal', due:shift(2), recurrence:'monthly', created_by:'u-piya', created_at:stamp(3) },
    { title:'Annette: fix the booking form redirect', description:'Form submits but lands on a 404 instead of the thank-you page.',
      client:'c-annette', department:'d-web', assignee_type:'user', assignee:'u-ayesha',
      state:'open', priority:'high', due:shift(-4), recurrence:'none', created_by:'u-farhan', created_at:stamp(7) },
    { title:'Orbit Dental: build the seed list', description:'Practices within 40km, 3+ chairs.',
      client:'c-orbit', department:'d-leadgen', assignee_type:'user', assignee:'u-jubayer',
      state:'open', priority:'normal', due:shift(4), recurrence:'none', created_by:'u-sadia', created_at:stamp(2) },
    { title:'Orbit Dental: onboarding call notes to ActiveCampaign', description:'Everything from the kickoff call, in the account notes.',
      client:'c-orbit', department:'d-outreach', assignee_type:'user', assignee:'u-rifat',
      state:'done', priority:'normal', due:shift(-1), recurrence:'none', created_by:'u-tanvir', created_at:stamp(3) },
    { title:'Monthly invoicing pack', description:'Hours and deliverables per client for the finance handover.',
      client:'c-vertex', department:'d-bizops', assignee_type:'user', assignee:'u-imran',
      state:'open', priority:'normal', due:shift(6), recurrence:'monthly', created_by:'u-shohag', created_at:stamp(4) },
    { title:'Draft the new hire onboarding checklist', description:'One page, covers accounts, tools and the first-week reading.',
      client:'c-vertex', department:'d-admin', assignee_type:'user', assignee:'u-piya',
      state:'progress', priority:'low', due:shift(8), recurrence:'none', created_by:'u-imran', created_at:stamp(5) },
    { title:'Quarterly client health review', description:'Every active client, red / amber / green with a reason.',
      client:'c-orbit', department:'d-bizops', assignee_type:'user', assignee:'u-nadia',
      state:'open', priority:'normal', due:shift(12), recurrence:'quarterly', created_by:'u-imran', created_at:stamp(6) },
    { title:'Chaim: verify tracking on the new pages', description:'Events firing for form submits and calendar clicks.',
      client:'c-chaim', department:'d-web', assignee_type:'user', assignee:'u-ayesha',
      state:'open', priority:'normal', due:shift(5), recurrence:'none', created_by:'u-farhan', created_at:stamp(1) }
  ];
  todos.forEach((t, i) => {
    t.id       = 't-' + (i + 1);
    t.tags     = t.tags || [];
    if (t.priority === 'high') t.tags.push('t-urgent');
    t.comments = [];
  });

  const instructions = [
    { body:'Before any meeting is booked for Chaim, the context of the conversation must be documented in ActiveCampaign. Not after the call, before the invite goes out. If it is not in the account, it did not happen.',
      author:'u-shohag', client:'c-chaim', department:'d-outreach',
      tags:['t-policy','t-standing'], posted_at:stamp(6,9), read_by:['u-nadia','u-tanvir'] },
    { body:'Chaim does not want weekend follow-ups. Anything that would land Saturday or Sunday waits until Monday morning.',
      author:'u-nadia', client:'c-chaim', department:'d-outreach',
      tags:['t-standing'], posted_at:stamp(5,14), read_by:['u-tanvir','u-mim','u-rifat'] },
    { body:'Correction on the Rafa sequence: the second email was going out with the old pricing line. It has been fixed in the template, but check anything queued before today.',
      author:'u-tanvir', client:'c-rafa', department:'d-outreach',
      tags:['t-correction','t-urgent'], posted_at:stamp(3,11), read_by:['u-mim'] },
    { body:'Annette has asked that no design changes go live on a Friday. Ship Monday to Thursday, or hold.',
      author:'u-piya', client:'c-annette', department:'d-web',
      tags:['t-policy','t-standing'], posted_at:stamp(4,16), read_by:['u-farhan'] },
    { body:'Orbit Dental onboarding: the practice manager is the only approver. Do not action requests that come from the front desk without her on the thread.',
      author:'u-sadia', client:'c-orbit', department:'d-leadgen',
      tags:['t-onboarding','t-standing'], posted_at:stamp(2,10), read_by:[] },
    { body:'Vertex Legal is paused until the new retainer is signed. No outreach, no posts, no dev work billed against them.',
      author:'u-imran', client:'c-vertex', department:'d-bizops',
      tags:['t-notice'], posted_at:stamp(2,15), read_by:['u-shohag'] },
    { body:'All new prospect lists need a source column from now on. If we cannot say where a contact came from, it does not go in the sequence.',
      author:'u-sadia', client:'c-rafa', department:'d-leadgen',
      tags:['t-policy'], posted_at:stamp(1,12), read_by:['u-jubayer'] },
    { body:'Reminder for everyone on the Chaim relaunch: staging links only in the group, nothing gets sent to the client directly until Farhan has reviewed it.',
      author:'u-shohag', client:'c-chaim', department:'d-web',
      tags:['t-notice'], posted_at:stamp(0,9), read_by:[] }
  ];
  instructions.forEach((n, i) => {
    n.id          = 'n-' + (i + 1);
    n.archived    = false;
    n.linked_todo = null;
    n.comments    = [];
  });

  return {
    version:      1,
    seeded_at:    new Date().toISOString(),
    departments,
    users,
    clients,
    tags,
    groups,
    todos,
    instructions,
    notifications: [],
    audit: [
      { id:'a-1', actor:'u-shohag', action:'system.seed', target:'Originate Command',
        detail:'Workspace created with six departments and eleven accounts.', at:stamp(10) }
    ],
    saved_filters: []
  };
}

/* In-memory state */
let state = seed();

/* =========================================================================
   MIME types
   ========================================================================= */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.woff2':'font/woff2',
};

/* =========================================================================
   Helpers
   ========================================================================= */
function json(res, data, status) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function notFound(res, msg) {
  json(res, { error: msg || 'Not found' }, 404);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { notFound(res, 'File not found: ' + filePath); return; }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* =========================================================================
   Router
   ========================================================================= */
const API_ROUTES = {
  'GET /api/state':         () => state,
  'GET /api/departments':   () => state.departments,
  'GET /api/users':         () => state.users,
  'GET /api/clients':       () => state.clients,
  'GET /api/tags':          () => state.tags,
  'GET /api/groups':        () => state.groups,
  'GET /api/todos':         () => state.todos,
  'GET /api/instructions':  () => state.instructions,
  'GET /api/notifications': () => state.notifications,
  'GET /api/audit':         () => state.audit,
};

function handleRequest(req, res) {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  const method   = req.method.toUpperCase();

  /* ---- CORS preflight -------------------------------------------------- */
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  /* ---- API: reset ------------------------------------------------------- */
  if (method === 'POST' && pathname === '/api/reset') {
    state = seed();
    return json(res, { ok: true, seeded_at: state.seeded_at, message: 'State re-seeded.' });
  }

  /* ---- API: simple collections ----------------------------------------- */
  const collKey = method + ' ' + pathname;
  if (API_ROUTES[collKey]) {
    return json(res, API_ROUTES[collKey]());
  }

  /* ---- API: single-item lookups (/api/:collection/:id) ----------------- */
  const idMatch = pathname.match(/^\/api\/(todos|instructions|users|departments|clients|tags|groups)\/([^/]+)$/);
  if (idMatch && method === 'GET') {
    const col  = idMatch[1];
    const id   = idMatch[2];
    const item = state[col].find(x => x.id === id);
    if (!item) return notFound(res, col.slice(0,-1) + ' "' + id + '" not found.');
    return json(res, item);
  }

  /* ---- API: unknown ----------------------------------------------------- */
  if (pathname.startsWith('/api/')) {
    return notFound(res, 'Unknown API route: ' + pathname);
  }

  /* ---- Static files ----------------------------------------------------- */
  let fsPath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);

  /* directory → index.html inside it */
  if (fs.existsSync(fsPath) && fs.statSync(fsPath).isDirectory()) {
    fsPath = path.join(fsPath, 'index.html');
  }

  /* guard against path traversal */
  if (!fsPath.startsWith(ROOT + path.sep) && fsPath !== ROOT) {
    return notFound(res, 'Forbidden');
  }

  serveFile(res, fsPath);
}

/* =========================================================================
   Start
   ========================================================================= */
const server = http.createServer(handleRequest);

server.listen(PORT, '127.0.0.1', () => {
  const bar = '═'.repeat(52);
  console.log('\n╔' + bar + '╗');
  console.log('║        Originate Command — Local Dev Server        ║');
  console.log('╠' + bar + '╣');
  console.log('║  App  →  http://localhost:' + PORT + '/                     ║');
  console.log('║  Spec →  http://localhost:' + PORT + '/spec/                ║');
  console.log('╠' + bar + '╣');
  console.log('║  REST API (all return JSON)                        ║');
  console.log('║  GET  /api/state          full snapshot            ║');
  console.log('║  GET  /api/users          11 accounts              ║');
  console.log('║  GET  /api/todos          14 todos                 ║');
  console.log('║  GET  /api/instructions   8 instructions           ║');
  console.log('║  GET  /api/departments    6 departments            ║');
  console.log('║  GET  /api/clients        5 clients                ║');
  console.log('║  GET  /api/tags           6 tags                   ║');
  console.log('║  GET  /api/groups         1 group                  ║');
  console.log('║  GET  /api/audit          audit log                ║');
  console.log('║  GET  /api/<col>/:id      single item              ║');
  console.log('║  POST /api/reset          re-seed all data         ║');
  console.log('╚' + bar + '╝\n');
  console.log('  Press Ctrl+C to stop.\n');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n  ✗ Port ' + PORT + ' is already in use. Try: node server.js <port>\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});
