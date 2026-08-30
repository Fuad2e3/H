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

  var KEY = 'oc-state-v2';
  var SESSION_KEY = 'oc-session-v2';
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
      {
        id: 'u-shohag',
        name: 'Shohag Munshe',
        email: 'shohag@originate.example',
        title: 'Founder & System Admin',
        admin: true,
        departments: [],
        status: 'active',
        prefs: { push: true, email: true, discord: true },
        invite: null
      }
    ];

    var clients = [];
    var tags = [
      { id: 't-policy',     label: 'Policy',        kind: 'type' },
      { id: 't-correction', label: 'Correction',    kind: 'type' },
      { id: 't-notice',     label: 'Notice',        kind: 'type' },
      { id: 't-standing',   label: 'Standing rule', kind: 'category' },
      { id: 't-onboarding', label: 'Onboarding',    kind: 'category' },
      { id: 't-urgent',     label: 'Urgent',        kind: 'custom' }
    ];

    var groups = [];
    var todos = [];
    var instructions = [];

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
        {
          id: 'a-1',
          actor: 'u-shohag',
          action: 'system.init',
          target: 'Originate Command',
          detail: 'Clean workspace initialized for production with System Admin.',
          at: new Date().toISOString()
        }
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
    if (!state || state.version !== 1 || (state.departments && state.departments.some(function (d) { return d.name === 'Web Development' || (d.levels && d.levels.length > 2); }))) {
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
