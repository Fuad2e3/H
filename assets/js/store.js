/* =========================================================================
   store.js — Data layer with Manual Server Sync & LocalStorage Fallback
   Owns every entity in section 5.0 of the OM SRS 001 specification:
   - Seeds a realistic dataset on first run
   - Synchronizes with dev3 manual API server (/api/*) in real-time
   - Auto-refreshes every 5 seconds (5000ms) with network auto-reconnect
   - Fallback to localStorage for offline resilience
   - Every write goes through mutate(), which stamps the audit log (5.1)
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.store = (function () {
  'use strict';

  var KEY = 'oc-state-v1';
  var SESSION_KEY = 'oc-session-v1';
  var state = null;
  var listeners = [];
  var sseSource = null;

  function isHttp() {
    return typeof window !== 'undefined' &&
           window.location &&
           typeof window.location.protocol === 'string' &&
           window.location.protocol.indexOf('http') === 0;
  }

  /* ---- date helpers ---------------------------------------------------- */
  function iso(d) { return d.toISOString().slice(0, 10); }
  function shift(days) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return iso(d);
  }
  function stamp(daysAgo, hour) {
    var d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour || 10, 5, 0, 0);
    return d.toISOString();
  }

  /* ---- seed (5.0) ------------------------------------------------------ */
  function seed() {
    var departments = [
      { id: 'd-admin',    name: 'Admin & HR',              levels: ['head', 'member'] },
      { id: 'd-bizops',   name: 'Business Operations',     levels: ['head', 'member'] },
      { id: 'd-leadgen',  name: 'Lead Generation',         levels: ['head', 'member'] },
      { id: 'd-outreach', name: 'Outreach Operations',     levels: ['head', 'member'] },
      { id: 'd-social',   name: 'Social Media Management', levels: ['head', 'member'] },
      { id: 'd-web',      name: 'Development Operations',  levels: ['head', 'member'] }
    ];

    var users = [
      { id: 'u-shohag',  name: 'Shohag Munshe',    title: 'Founder',            admin: true,  departments: [] },
      { id: 'u-imran',   name: 'Imran Sheikh',     title: 'Operations Manager', admin: false, departments: [{ department: 'd-bizops', level: 'head' }, { department: 'd-admin', level: 'head' }] },
      { id: 'u-nadia',   name: 'Nadia Rahman',     title: 'Outreach Director',  admin: false, departments: [{ department: 'd-outreach', level: 'head' }, { department: 'd-bizops', level: 'member' }] },
      { id: 'u-tanvir',  name: 'Tanvir Hasan',     title: 'Outreach Specialist', admin: false, departments: [{ department: 'd-outreach', level: 'member' }] },
      { id: 'u-mim',     name: 'Mim Akter',        title: 'Senior Strategist',  admin: false, departments: [{ department: 'd-outreach', level: 'member' }] },
      { id: 'u-rifat',   name: 'Rifat Chowdhury',  title: 'Outreach Associate', admin: false, departments: [{ department: 'd-outreach', level: 'member' }] },
      { id: 'u-sadia',   name: 'Sadia Islam',      title: 'Lead Gen Head',      admin: false, departments: [{ department: 'd-leadgen', level: 'head' }] },
      { id: 'u-jubayer', name: 'Jubayer Alam',     title: 'Researcher',         admin: false, departments: [{ department: 'd-leadgen', level: 'member' }] },
      { id: 'u-farhan',  name: 'Farhan Kabir',     title: 'Web Lead',           admin: false, departments: [{ department: 'd-web', level: 'head' }] },
      { id: 'u-ayesha',  name: 'Ayesha Noor',      title: 'Front-end Developer', admin: false, departments: [{ department: 'd-web', level: 'member' }] },
      { id: 'u-piya',    name: 'Piya Das',         title: 'Social Media Head',  admin: false, departments: [{ department: 'd-social', level: 'head' }, { department: 'd-admin', level: 'member' }] }
    ];

    users.forEach(function (u) {
      u.email = u.id.replace('u-', '') + '@originate.example';
      u.status = 'active';
      u.prefs = { push: true, email: true, discord: u.admin };
      u.invite = null;
    });

    var clients = [
      { id: 'c-chaim',   name: 'Chaim',        contact: 'Chaim Weiss',   status: 'active' },
      { id: 'c-rafa',    name: 'Rafa',         contact: 'Rafa Moreno',   status: 'active' },
      { id: 'c-annette', name: 'Annette',      contact: 'Annette Boyer', status: 'active' },
      { id: 'c-orbit',   name: 'Orbit Dental', contact: 'Dr. Imelda Roy', status: 'active' },
      { id: 'c-vertex',  name: 'Vertex Legal', contact: 'Peter Nam',     status: 'paused' }
    ];

    var tags = [
      { id: 't-policy',     label: 'Policy',        kind: 'type' },
      { id: 't-correction', label: 'Correction',    kind: 'type' },
      { id: 't-notice',     label: 'Notice',        kind: 'type' },
      { id: 't-standing',   label: 'Standing rule', kind: 'category' },
      { id: 't-onboarding', label: 'Onboarding',    kind: 'category' },
      { id: 't-urgent',     label: 'Urgent',        kind: 'custom' }
    ];

    var groups = [
      {
        id: 'g-relaunch', name: 'Chaim Site Relaunch',
        purpose: 'Cross-department push to ship the new Chaim landing pages before the Q4 campaign.',
        members: ['u-tanvir', 'u-ayesha', 'u-shohag'], created_by: 'u-shohag',
        status: 'active', created_at: stamp(9)
      }
    ];

    var todos = [
      { title: 'Manual reply check', description: 'Sweep the ActiveCampaign inbox and log every reply that needs a human answer.',
        client: 'c-chaim', department: 'd-outreach', assignee_type: 'user', assignee: 'u-rifat',
        state: 'open', priority: 'high', due: shift(0), recurrence: 'daily', created_by: 'u-tanvir', created_at: stamp(1) },
      { title: 'Book the Thursday demo slots', description: 'Three qualified replies waiting on a calendar link.',
        client: 'c-chaim', department: 'd-outreach', assignee_type: 'user', assignee: 'u-mim',
        state: 'progress', priority: 'high', due: shift(-2), recurrence: 'none', created_by: 'u-nadia', created_at: stamp(4) },
      { title: 'Rebuild the Chaim landing page hero', description: 'New copy is approved, the old hero image stays.',
        client: 'c-chaim', department: 'd-web', assignee_type: 'group', assignee: 'g-relaunch',
        state: 'progress', priority: 'normal', due: shift(3), recurrence: 'none', created_by: 'u-shohag', created_at: stamp(5) },
      { title: 'Weekly sequence performance report', description: 'Open rate, reply rate and booked calls per sequence.',
        client: 'c-chaim', department: 'd-outreach', assignee_type: 'user', assignee: 'u-tanvir',
        state: 'done', priority: 'normal', due: shift(-3), recurrence: 'weekly', created_by: 'u-nadia', created_at: stamp(8) },
      { title: 'Clean the Rafa prospect list', description: 'Strip duplicates and anything without a verified email.',
        client: 'c-rafa', department: 'd-leadgen', assignee_type: 'user', assignee: 'u-jubayer',
        state: 'open', priority: 'normal', due: shift(1), recurrence: 'none', created_by: 'u-sadia', created_at: stamp(2) },
      { title: 'Rafa: rewrite sequence two', description: 'Reply rate has dropped for three weeks running.',
        client: 'c-rafa', department: 'd-outreach', assignee_type: 'user', assignee: 'u-mim',
        state: 'blocked', priority: 'high', due: shift(-1), recurrence: 'none', created_by: 'u-nadia', created_at: stamp(6),
        blocked_reason: 'Waiting on the client to approve the new positioning line.' },
      { title: 'Annette: schedule the October grid', description: 'Twelve posts, captions already written.',
        client: 'c-annette', department: 'd-social', assignee_type: 'user', assignee: 'u-piya',
        state: 'open', priority: 'normal', due: shift(2), recurrence: 'monthly', created_by: 'u-piya', created_at: stamp(3) },
      { title: 'Annette: fix the booking form redirect', description: 'Form submits but lands on a 404 instead of the thank-you page.',
        client: 'c-annette', department: 'd-web', assignee_type: 'user', assignee: 'u-ayesha',
        state: 'open', priority: 'high', due: shift(-4), recurrence: 'none', created_by: 'u-farhan', created_at: stamp(7) },
      { title: 'Orbit Dental: build the seed list', description: 'Practices within 40km, 3+ chairs.',
        client: 'c-orbit', department: 'd-leadgen', assignee_type: 'user', assignee: 'u-jubayer',
        state: 'open', priority: 'normal', due: shift(4), recurrence: 'none', created_by: 'u-sadia', created_at: stamp(2) },
      { title: 'Orbit Dental: onboarding call notes to ActiveCampaign', description: 'Everything from the kickoff call, in the account notes.',
        client: 'c-orbit', department: 'd-outreach', assignee_type: 'user', assignee: 'u-rifat',
        state: 'done', priority: 'normal', due: shift(-1), recurrence: 'none', created_by: 'u-tanvir', created_at: stamp(3) },
      { title: 'Monthly invoicing pack', description: 'Hours and deliverables per client for the finance handover.',
        client: 'c-vertex', department: 'd-bizops', assignee_type: 'user', assignee: 'u-imran',
        state: 'open', priority: 'normal', due: shift(6), recurrence: 'monthly', created_by: 'u-shohag', created_at: stamp(4) },
      { title: 'Draft the new hire onboarding checklist', description: 'One page, covers accounts, tools and the first-week reading.',
        client: 'c-vertex', department: 'd-admin', assignee_type: 'user', assignee: 'u-piya',
        state: 'progress', priority: 'low', due: shift(8), recurrence: 'none', created_by: 'u-imran', created_at: stamp(5) },
      { title: 'Quarterly client health review', description: 'Every active client, red / amber / green with a reason.',
        client: 'c-orbit', department: 'd-bizops', assignee_type: 'user', assignee: 'u-nadia',
        state: 'open', priority: 'normal', due: shift(12), recurrence: 'quarterly', created_by: 'u-imran', created_at: stamp(6) },
      { title: 'Chaim: verify tracking on the new pages', description: 'Events firing for form submits and calendar clicks.',
        client: 'c-chaim', department: 'd-web', assignee_type: 'user', assignee: 'u-ayesha',
        state: 'open', priority: 'normal', due: shift(5), recurrence: 'none', created_by: 'u-farhan', created_at: stamp(1) }
    ];

    todos.forEach(function (t, i) {
      t.id = 't-' + (i + 1);
      t.tags = t.tags || [];
      if (t.priority === 'high' && t.tags.indexOf('t-urgent') === -1) t.tags.push('t-urgent');
      t.comments = [];
    });

    var instructions = [
      { body: 'Before any meeting is booked for Chaim, the context of the conversation must be documented in ActiveCampaign. Not after the call, before the invite goes out. If it is not in the account, it did not happen.',
        author: 'u-shohag', client: 'c-chaim', department: 'd-outreach',
        tags: ['t-policy', 't-standing'], posted_at: stamp(6, 9), read_by: ['u-nadia', 'u-tanvir'] },
      { body: 'Chaim does not want weekend follow-ups. Anything that would land Saturday or Sunday waits until Monday morning.',
        author: 'u-nadia', client: 'c-chaim', department: 'd-outreach',
        tags: ['t-standing'], posted_at: stamp(5, 14), read_by: ['u-tanvir', 'u-mim', 'u-rifat'] },
      { body: 'Correction on the Rafa sequence: the second email was going out with the old pricing line. It has been fixed in the template, but check anything queued before today.',
        author: 'u-tanvir', client: 'c-rafa', department: 'd-outreach',
        tags: ['t-correction', 't-urgent'], posted_at: stamp(3, 11), read_by: ['u-mim'] },
      { body: 'Annette has asked that no design changes go live on a Friday. Ship Monday to Thursday, or hold.',
        author: 'u-piya', client: 'c-annette', department: 'd-web',
        tags: ['t-policy', 't-standing'], posted_at: stamp(4, 16), read_by: ['u-farhan'] },
      { body: 'Orbit Dental onboarding: the practice manager is the only approver. Do not action requests that come from the front desk without her on the thread.',
        author: 'u-sadia', client: 'c-orbit', department: 'd-leadgen',
        tags: ['t-onboarding', 't-standing'], posted_at: stamp(2, 10), read_by: [] },
      { body: 'Vertex Legal is paused until the new retainer is signed. No outreach, no posts, no dev work billed against them.',
        author: 'u-imran', client: 'c-vertex', department: 'd-bizops',
        tags: ['t-notice'], posted_at: stamp(2, 15), read_by: ['u-shohag'] },
      { body: 'All new prospect lists need a source column from now on. If we cannot say where a contact came from, it does not go in the sequence.',
        author: 'u-sadia', client: 'c-rafa', department: 'd-leadgen',
        tags: ['t-policy'], posted_at: stamp(1, 12), read_by: ['u-jubayer'] },
      { body: 'Reminder for everyone on the Chaim relaunch: staging links only in the group, nothing gets sent to the client directly until Farhan has reviewed it.',
        author: 'u-shohag', client: 'c-chaim', department: 'd-web',
        tags: ['t-notice'], posted_at: stamp(0, 9), read_by: [] }
    ];

    instructions.forEach(function (n, i) {
      n.id = 'n-' + (i + 1);
      n.archived = false;
      n.linked_todo = null;
      n.comments = [];
    });

    return {
      version: 1,
      seeded_at: new Date().toISOString(),
      departments: departments,
      users: users,
      clients: clients,
      tags: tags,
      groups: groups,
      todos: todos,
      instructions: instructions,
      notifications: [],
      audit: [
        { id: 'a-1', actor: 'u-shohag', action: 'system.seed', target: 'Originate Command',
          detail: 'Workspace created with six departments and eleven accounts.', at: stamp(10) }
      ],
      saved_filters: []
    };
  }

  /* ---- persistence ----------------------------------------------------- */
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  /* ---- Manual Server API Sync & Auto-Refresh (Every 5s) ---------------- */
  function syncWithServer() {
    if (!isHttp() || typeof fetch !== 'function') return;

    fetch('/api/state')
      .then(function (res) {
        if (res.ok) return res.json();
        throw new Error('Server returned ' + res.status);
      })
      .then(function (serverState) {
        if (serverState && serverState.version === 1) {
          var prevRaw = JSON.stringify(state);
          var nextRaw = JSON.stringify(serverState);
          if (prevRaw !== nextRaw) {
            state = serverState;
            write();
            emit();
          }
          if (OC.backend && OC.backend.setServerStatus) {
            OC.backend.setServerStatus(true);
          }
          initSSE();
        }
      })
      .catch(function () {
        if (OC.backend && OC.backend.setServerStatus) {
          OC.backend.setServerStatus(false);
        }
      });
  }

  function pushMutationToServer(entry) {
    if (!isHttp() || typeof fetch !== 'function') return;

    fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: entry, state: state })
    }).catch(function () {});
  }

  function initSSE() {
    if (sseSource || !isHttp() || typeof EventSource !== 'function') return;

    try {
      sseSource = new EventSource('/api/events');
      sseSource.onmessage = function (event) {
        try {
          var data = JSON.parse(event.data);
          if (data.type === 'mutate' || data.type === 'reset' || data.type === 'state_saved') {
            fetch('/api/state')
              .then(function (res) { return res.json(); })
              .then(function (fresh) {
                if (fresh && fresh.version === 1) {
                  state = fresh;
                  write();
                  emit();
                }
              })
              .catch(function () {});
          }
        } catch (_) {}
      };
      sseSource.onerror = function () {};
    } catch (_) {}
  }

  // 🔄 Recurring 5-second Auto-Refresh Loop
  if (typeof setInterval === 'function' && isHttp()) {
    var syncTimer = setInterval(function () {
      syncWithServer();
    }, 5000);
    if (syncTimer && typeof syncTimer.unref === 'function') {
      syncTimer.unref();
    }
  }

  // 🌐 Instant auto-sync when network reconnects
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', function () {
      syncWithServer();
    });
  }

  function load() {
    state = read();
    if (!state || state.version !== 1) {
      state = seed();
      write();
    }
    syncWithServer();
    return state;
  }

  function reset() {
    state = seed();
    write();
    emit();

    if (isHttp() && typeof fetch === 'function') {
      fetch('/api/reset', { method: 'POST' }).catch(function () {});
    }
  }

  /* ---- change notification --------------------------------------------- */
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { fn(); }); }

  function mutate(entry, fn) {
    if (typeof fn === 'function') {
      fn();
    }
    if (entry) {
      state.audit.unshift({
        id: 'a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        actor: entry.actor, action: entry.action, target: entry.target,
        detail: entry.detail || '', at: new Date().toISOString()
      });
      if (state.audit.length > 500) {
        state.audit = state.audit.slice(0, 500);
      }
    }
    write();
    emit();
    pushMutationToServer(entry);
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ---- lookups --------------------------------------------------------- */
  function byId(list, id) {
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  var api = {
    load: load,
    reset: reset,
    sync: syncWithServer,
    save: write,
    onChange: onChange,
    emit: emit,
    mutate: mutate,
    uid: uid,
    get state() { return state; },

    user: function (id) { return byId(state.users, id); },
    userByEmail: function (email) {
      if (!email || !state.users) return null;
      var clean = String(email).trim().toLowerCase();
      for (var i = 0; i < state.users.length; i++) {
        if (String(state.users[i].email).trim().toLowerCase() === clean) return state.users[i];
      }
      return null;
    },
    department: function (id) { return byId(state.departments, id); },
    client: function (id) { return byId(state.clients, id); },
    group: function (id) { return byId(state.groups, id); },
    tag: function (id) { return byId(state.tags, id); },
    todo: function (id) { return byId(state.todos, id); },
    instruction: function (id) { return byId(state.instructions, id); },

    /* the signed-in account, held separately from the data itself */
    session: function () {
      try {
        var id = localStorage.getItem(SESSION_KEY);
        if (id && byId(state.users, id)) return id;
      } catch (e) {}
      return 'u-shohag';
    },
    setSession: function (id) {
      try { localStorage.setItem(SESSION_KEY, id); } catch (e) {}
      emit();
    },

    /* a single use link that expires 72 hours after it is issued (6.1) */
    issueInvite: function (byUserId) {
      var expires = new Date();
      expires.setHours(expires.getHours() + 72);
      return {
        token: 'inv-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6),
        issued_by: byUserId,
        issued_at: new Date().toISOString(),
        expires_at: expires.toISOString(),
        claimed_at: null
      };
    },

    inviteExpired: function (invite) {
      return !!invite && !invite.claimed_at && new Date(invite.expires_at) < new Date();
    },

    comment: function (kind, id, body, authorId) {
      var host = kind === 'todo' ? api.todo(id) : api.instruction(id);
      if (!host) return null;
      var entry = {
        id: api.uid('c'), author: authorId, body: body,
        posted_at: new Date().toISOString()
      };
      host.comments = host.comments || [];
      host.comments.push(entry);
      return entry;
    },

    notify: function (userIds, text, ref) {
      if (!userIds || !userIds.length) return;
      var at = new Date().toISOString();
      userIds.forEach(function (uid_) {
        state.notifications.unshift({
          id: 'nt-' + Date.now() + '-' + uid_ + Math.random().toString(36).slice(2, 5),
          user: uid_, text: text, ref: ref || null, at: at, read: false
        });
      });
      write();
      emit();
      pushMutationToServer({ actor: 'system', action: 'notification.send', target: text, detail: 'notified ' + userIds.length + ' users' });
    }
  };

  return api;
})();
