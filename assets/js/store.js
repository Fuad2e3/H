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
        email: 'sm@originatemarketing.com',
        title: 'Founder & System Admin',
        admin: true,
        departments: [],
        status: 'active',
        password: null,
        prefs: { push: true, email: true, discord: true },
        invite: null
      },
      {
        id: 'u-fuad',
        name: 'Abdullah al Fuad',
        email: 'fuadkalaroa2002@gmail.com',
        title: 'System Admin',
        admin: true,
        departments: [],
        status: 'active',
        password: null,
        prefs: { push: true, email: true, discord: true },
        invite: null
      },
      {
        id: 'u-fuadogt',
        name: 'Abdullah Al Fuad',
        email: 'fuadogt@gmail.com',
        title: 'Full Stack Developer',
        admin: false,
        departments: [{ department: 'd-web', level: 'head' }],
        status: 'active',
        password: null,
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
      attendance: [],
      leaves: [],
      audit: [
        {
          id: 'a-1',
          actor: 'u-shohag',
          ip: '127.0.0.1',
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
  function isHttp() {
    if (typeof window === 'undefined' || !window.location) return false;
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  }

  function getApiUrl(endpoint) {
    if (typeof window === 'undefined' || !window.location) return endpoint;
    var host = window.location.hostname;
    // If running on local server directly, use relative URL
    if (host === 'localhost' || host === '127.0.0.1' || window.location.port === '7000') {
      return endpoint;
    }
    // Otherwise use configured tunnel URL from assets/config.js
    var cfg = window.OC_CONFIG || window.LGS_CONFIG;
    if (cfg && cfg.API_URL && cfg.API_URL.indexOf('http') === 0) {
      return cfg.API_URL.replace(/\/+$/, '') + endpoint;
    }
    return endpoint;
  }

  function syncWithServer() {
    if (!isHttp() || typeof fetch !== 'function') return;

    fetch(getApiUrl('/api/state'), {
      headers: { 'bypass-tunnel-reminder': 'true' }
    })
      .then(function (res) {
        if (res.ok) return res.json();
        throw new Error('Server returned ' + res.status);
      })
      .then(function (serverState) {
        if (serverState && serverState.version === 1) {
          var needsPush = false;
          if (state && Array.isArray(state.groups) && state.groups.length > 0) {
            serverState.groups = serverState.groups || [];
            state.groups.forEach(function (lg) {
              if (!serverState.groups.some(function (sg) { return sg.id === lg.id || sg.name === lg.name; })) {
                serverState.groups.push(lg);
                needsPush = true;
              }
            });
          }

          var prevRaw = JSON.stringify(state);
          var nextRaw = JSON.stringify(serverState);
          if (prevRaw !== nextRaw) {
            state = serverState;
            write();
            emit();
          }
          if (needsPush) {
            pushMutationToServer({ actor: 'system', action: 'state.sync', target: 'workspace' });
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

    fetch(getApiUrl('/api/mutate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
      body: JSON.stringify({ entry: entry, state: state })
    }).catch(function () {});
  }

  function initSSE() {
    if (sseSource || !isHttp() || typeof EventSource !== 'function') return;

    try {
      sseSource = new EventSource(getApiUrl('/api/events'));
      sseSource.onmessage = function (event) {
        try {
          var data = JSON.parse(event.data);
          if (data.type === 'mutate' || data.type === 'reset' || data.type === 'state_saved') {
            fetch(getApiUrl('/api/state'), { headers: { 'bypass-tunnel-reminder': 'true' } })
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
    // Clean legacy removed users and ensure clean system admins are present
    if (state && Array.isArray(state.users)) {
      var seedUsers = seed().users;
      var modified = false;
      // Filter out removed legacy test users
      var filtered = state.users.filter(function (u) {
        return u.id !== 'u-fuad2' && u.email !== 'fuadkalaroa2000@gmail.com';
      });
      if (filtered.length !== state.users.length) {
        state.users = filtered;
        modified = true;
      }
      seedUsers.forEach(function (su) {
        var existing = state.users.find(function (u) { return u.id === su.id; });
        if (!existing) {
          state.users.push(su);
          modified = true;
        } else {
          // Ensure system admin superuser flag integrity without wiping custom avatar/title
          if (su.admin && !existing.admin) {
            existing.admin = true;
            modified = true;
          }
        }
      });
      // Deduplicate: If an active account exists for an email, purge any duplicate pending invite records
      var activeEmails = {};
      state.users.forEach(function (u) {
        if (u.status === 'active' && u.email) activeEmails[u.email.toLowerCase()] = true;
      });
      var deduped = state.users.filter(function (u) {
        if (u.status === 'invited' && u.email && activeEmails[u.email.toLowerCase()]) {
          modified = true;
          return false; // drop duplicate pending invite
        }
        return true;
      });
      if (deduped.length !== state.users.length) {
        state.users = deduped;
        modified = true;
      }
      if (state && Array.isArray(state.audit)) {
        var dedupedAudit = [];
        for (var ai = 0; ai < state.audit.length; ai++) {
          var currA = state.audit[ai];
          if (!currA.ip) currA.ip = '127.0.0.1';
          var nextA = state.audit[ai + 1];
          if (nextA && currA.actor === nextA.actor && currA.action === nextA.action && currA.target === nextA.target && currA.detail === nextA.detail && Math.abs(new Date(currA.at).getTime() - new Date(nextA.at).getTime()) < 3000) {
            modified = true;
            continue; // skip duplicate adjacent log
          }
          dedupedAudit.push(currA);
        }
        state.audit = dedupedAudit;
      }
      if (state) {
        if (!Array.isArray(state.attendance)) { state.attendance = []; modified = true; }
        if (!Array.isArray(state.leaves)) { state.leaves = []; modified = true; }
      }
      if (modified) write();
    }
    syncWithServer();
    fetchClientIp();
    return state;
  }

  /* ---- client IP resolution -------------------------------------------- */
  var currentClientIp = '127.0.0.1';
  function fetchClientIp() {
    if (typeof fetch !== 'function') return;
    try {
      fetch('https://api.ipify.org?format=json')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.ip) {
            currentClientIp = data.ip;
          }
        })
        .catch(function () {
          if (typeof window !== 'undefined' && window.location && window.location.hostname) {
            currentClientIp = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
          }
        });
    } catch (_) {}
  }
  fetchClientIp();

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
      var clientIp = entry.ip || currentClientIp || '127.0.0.1';
      state.audit = state.audit || [];
      var isDup = false;
      if (state.audit.length > 0) {
        var top = state.audit[0];
        if (top.actor === entry.actor && top.action === entry.action && top.target === entry.target && top.detail === (entry.detail || '') && (Date.now() - new Date(top.at).getTime()) < 3000) {
          isDup = true;
        }
      }
      if (!isDup) {
        state.audit.unshift({
          id: 'a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          actor: entry.actor, action: entry.action, target: entry.target,
          detail: entry.detail || '', ip: clientIp, at: new Date().toISOString()
        });
        if (state.audit.length > 500) {
          state.audit = state.audit.slice(0, 500);
        }
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

    /* a single use link and password that expires 72 hours after it is issued (6.1) */
    issueInvite: function (byUserId, meta) {
      var expires = new Date();
      expires.setHours(expires.getHours() + 72);
      var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      var rand = '';
      for (var i = 0; i < 10; i++) {
        rand += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      var passcode = 'OC-' + rand;
      var payload = {
        by: byUserId,
        exp: expires.getTime(),
        pass: passcode,
        email: meta ? meta.email : '',
        name: meta ? meta.name : '',
        dept: meta ? meta.department : '',
        lvl: meta ? meta.level : ''
      };
      var token = 'inv-' + Math.random().toString(36).slice(2, 8);
      try {
        var rawJson = JSON.stringify(payload);
        var b64 = btoa(unescape(encodeURIComponent(rawJson))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        token = 'inv-' + b64;
      } catch (e) {}

      return {
        token: token,
        passcode: passcode,
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

    editComment: function (kind, id, commentId, body) {
      var host = kind === 'todo' ? api.todo(id) : api.instruction(id);
      if (!host || !host.comments) return null;
      var target = null;
      for (var i = 0; i < host.comments.length; i++) {
        if (host.comments[i].id === commentId) {
          target = host.comments[i];
          break;
        }
      }
      if (!target) return null;
      target.body = body;
      target.edited_at = new Date().toISOString();
      return target;
    },

    deleteComment: function (kind, id, commentId) {
      var host = kind === 'todo' ? api.todo(id) : api.instruction(id);
      if (!host || !host.comments) return;
      host.comments = host.comments.filter(function (c) { return c.id !== commentId; });
      return host.comments;
    },

    deleteInstruction: function (id) {
      if (!state.instructions) return;
      state.instructions = state.instructions.filter(function (n) { return n.id !== id; });
    },

    deleteGroup: function (id) {
      if (!state.groups) return;
      state.groups = state.groups.filter(function (g) { return g.id !== id; });
    },

    addGroupMessage: function (groupId, text, authorId) {
      var group = api.group(groupId);
      if (!group) return null;
      var msg = {
        id: api.uid('gm'),
        author: authorId,
        text: text,
        created_at: new Date().toISOString(),
        reactions: {}
      };
      group.messages = group.messages || [];
      group.messages.push(msg);
      return msg;
    },

    editGroupMessage: function (groupId, messageId, newText) {
      var group = api.group(groupId);
      if (!group || !group.messages) return null;
      var msg = null;
      for (var i = 0; i < group.messages.length; i++) {
        if (group.messages[i].id === messageId) {
          msg = group.messages[i];
          break;
        }
      }
      if (!msg) return null;
      msg.text = newText;
      msg.edited_at = new Date().toISOString();
      return msg;
    },

    deleteGroupMessage: function (groupId, messageId) {
      var group = api.group(groupId);
      if (!group || !group.messages) return;
      group.messages = group.messages.filter(function (m) { return m.id !== messageId; });
      return group.messages;
    },

    reactGroupMessage: function (groupId, messageId, emoji, userId) {
      var group = api.group(groupId);
      if (!group || !group.messages) return null;
      var msg = null;
      for (var i = 0; i < group.messages.length; i++) {
        if (group.messages[i].id === messageId) {
          msg = group.messages[i];
          break;
        }
      }
      if (!msg) return null;
      msg.reactions = msg.reactions || {};
      var list = (msg.reactions[emoji] || []).slice();
      var idx = list.indexOf(userId);
      if (idx > -1) {
        list.splice(idx, 1);
        if (list.length === 0) delete msg.reactions[emoji];
        else msg.reactions[emoji] = list;
      } else {
        list.push(userId);
        msg.reactions[emoji] = list;
      }
      return msg.reactions;
    },

    react: function (kind, id, emoji, userId) {
      var host = kind === 'todo' ? api.todo(id) : api.instruction(id);
      if (!host) return null;
      host.reactions = host.reactions || {};
      var list = (host.reactions[emoji] || []).slice();
      var idx = list.indexOf(userId);
      if (idx > -1) {
        list.splice(idx, 1);
        if (list.length === 0) {
          delete host.reactions[emoji];
        } else {
          host.reactions[emoji] = list;
        }
      } else {
        list.push(userId);
        host.reactions[emoji] = list;
      }
      return host.reactions;
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
