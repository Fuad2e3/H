/* =========================================================================
   store.js — Data layer with Manual Server Sync & LocalStorage Fallback
   Owns every entity in section 5.0 of the OM SRS 001 specification:
   - Seeds a realistic dataset on first run
   - Synchronizes with dev3 manual API server (/api/*) in real-time
   - Auto-refreshes every 2 seconds (2000ms) with network auto-reconnect
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
              if (!serverState.groups.some(function (sg) { return sg.id === lg.id; })) {
                serverState.groups.push(lg);
                needsPush = true;
              }
            });
          }
          if (state && Array.isArray(state.attendance) && state.attendance.length > 0) {
            serverState.attendance = serverState.attendance || [];
            state.attendance.forEach(function (la) {
              if (!serverState.attendance.some(function (sa) { return sa.id === la.id; })) {
                serverState.attendance.unshift(la);
                needsPush = true;
              }
            });
          }
          if (state && Array.isArray(state.leaves) && state.leaves.length > 0) {
            serverState.leaves = serverState.leaves || [];
            state.leaves.forEach(function (ll) {
              if (!serverState.leaves.some(function (sl) { return sl.id === ll.id; })) {
                serverState.leaves.unshift(ll);
                needsPush = true;
              }
            });
          }
          if (state && Array.isArray(state.users) && state.users.length > 0) {
            serverState.users = serverState.users || [];
            state.users.forEach(function (lu) {
              var su = serverState.users.find(function (u) { return u.id === lu.id; });
              if (su) {
                if (lu.office_details && !su.office_details) { su.office_details = lu.office_details; needsPush = true; }
                if (lu.personal_details && !su.personal_details) { su.personal_details = lu.personal_details; needsPush = true; }
                if (lu.emergency_contacts && !su.emergency_contacts) { su.emergency_contacts = lu.emergency_contacts; needsPush = true; }
                if (lu.bank_details && !su.bank_details) { su.bank_details = lu.bank_details; needsPush = true; }
                if (lu.avatar && !su.avatar) { su.avatar = lu.avatar; needsPush = true; }
                if (lu.scheduled_in && !su.scheduled_in) { su.scheduled_in = lu.scheduled_in; needsPush = true; }
                if (lu.scheduled_out && !su.scheduled_out) { su.scheduled_out = lu.scheduled_out; needsPush = true; }
              }
            });
          }
          // Merge offline-created clients back so they aren't lost when the server state overwrites local state
          if (state && Array.isArray(state.clients) && state.clients.length > 0) {
            serverState.clients = serverState.clients || [];
            state.clients.forEach(function (lc) {
              if (!serverState.clients.some(function (sc) { return sc.id === lc.id; })) {
                serverState.clients.push(lc);
                needsPush = true;
              }
            });
          }
          // Merge offline-created todos back so they survive a sync
          if (state && Array.isArray(state.todos) && state.todos.length > 0) {
            serverState.todos = serverState.todos || [];
            state.todos.forEach(function (lt) {
              if (!serverState.todos.some(function (st) { return st.id === lt.id; })) {
                serverState.todos.push(lt);
                needsPush = true;
              }
            });
          }
          // Merge offline-created instructions back so they survive a sync
          if (state && Array.isArray(state.instructions) && state.instructions.length > 0) {
            serverState.instructions = serverState.instructions || [];
            state.instructions.forEach(function (li) {
              if (!serverState.instructions.some(function (si) { return si.id === li.id; })) {
                serverState.instructions.push(li);
                needsPush = true;
              }
            });
          }
          // Merge offline-queued notifications and synchronize read state
          if (state && Array.isArray(state.notifications) && state.notifications.length > 0) {
            serverState.notifications = serverState.notifications || [];
            state.notifications.forEach(function (ln) {
              var sn = serverState.notifications.find(function (n) { return n.id === ln.id; });
              if (!sn) {
                serverState.notifications.unshift(ln);
                needsPush = true;
              } else if (ln.read && !sn.read) {
                sn.read = true;
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

  // 🔄 Recurring 2-second Live Auto-Refresh Loop
  if (typeof setInterval === 'function' && isHttp()) {
    var syncTimer = setInterval(function () {
      syncWithServer();
    }, 2000);
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
    var defaultSeed = seed(); // single seed() call — reused for both reset and seedUsers check
    state = read();
    if (!state || state.version !== 1 || (state.departments && state.departments.some(function (d) { return d.name === 'Web Development' || (d.levels && d.levels.length > 2); }))) {
      state = defaultSeed;
      write();
    }
    // Clean legacy removed users and ensure clean system admins are present
    if (state && Array.isArray(state.users)) {
      var seedUsers = defaultSeed.users; // reuse the already-computed seed — no second seed() call
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
    initSSE(); // start SSE immediately in parallel with first sync poll — don't wait for fetch to succeed
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
    // 8 random chars (~2.8 trillion combinations) — much lower collision risk than 4 chars
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* ---- lookups --------------------------------------------------------- */
  function byId(list, id) {
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function byIdOrName(list, key) {
    if (!list || !key) return null;
    var clean = String(key).trim().toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (item.id === key) return item;
      if (item.name && item.name.toLowerCase() === clean) return item;
      if (item.id && item.id.toLowerCase() === clean) return item;
    }
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
    department: function (id) { return byIdOrName(state.departments, id); },
    client: function (id) { return byIdOrName(state.clients, id); },
    group: function (id) { return byIdOrName(state.groups, id); },
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

    comment: function (kind, id, body, authorId, extra) {
      var host = kind === 'todo' ? api.todo(id) : api.instruction(id);
      if (!host) return null;
      var entry = {
        id: api.uid('c'), author: authorId, body: body,
        posted_at: new Date().toISOString()
      };
      if (extra && extra.reply_to) entry.reply_to = extra.reply_to;
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

    addGroupMessage: function (groupId, text, authorId, extra) {
      var group = api.group(groupId);
      if (!group) return null;
      var msg = {
        id: api.uid('gm'),
        author: authorId,
        text: text,
        created_at: new Date().toISOString(),
        reactions: {}
      };
      if (extra && typeof extra === 'object') {
        if (extra.media) msg.media = extra.media;
        if (extra.poll) msg.poll = extra.poll;
        if (extra.reply_to) msg.reply_to = extra.reply_to;
      }
      group.messages = group.messages || [];
      group.messages.push(msg);
      return msg;
    },

    voteGroupPoll: function (groupId, messageId, optionId, userId) {
      var group = api.group(groupId);
      if (!group || !group.messages) return null;
      var msg = null;
      for (var i = 0; i < group.messages.length; i++) {
        if (group.messages[i].id === messageId) {
          msg = group.messages[i];
          break;
        }
      }
      if (!msg || !msg.poll || !msg.poll.options) return null;
      var poll = msg.poll;
      poll.options.forEach(function (opt) {
        opt.voters = opt.voters || [];
        var idx = opt.voters.indexOf(userId);
        if (opt.id === optionId) {
          if (idx > -1) {
            opt.voters.splice(idx, 1);
          } else {
            opt.voters.push(userId);
          }
        } else if (!poll.multi) {
          // If single-choice poll, remove vote from other options
          if (idx > -1) {
            opt.voters.splice(idx, 1);
          }
        }
      });
      return poll;
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
      if (!userIds) return;
      if (!Array.isArray(userIds)) userIds = [userIds];
      if (!userIds.length) return;
      var msg = (typeof text === 'object' && text !== null)
        ? (text.title ? (text.title + ' — ' + (text.body || '')) : (text.body || JSON.stringify(text)))
        : String(text || '');
      var at = new Date().toISOString();
      state.notifications = state.notifications || [];
      userIds.forEach(function (uid_) {
        state.notifications.unshift({
          id: 'nt-' + Date.now() + '-' + uid_ + Math.random().toString(36).slice(2, 7),
          user: uid_, text: msg, ref: ref || null, at: at, read: false
        });
      });
      write();
      emit();
      pushMutationToServer({ actor: 'system', action: 'notification.send', target: msg, detail: 'notified ' + userIds.length + ' users' });
    }
  };

  return api;
})();
