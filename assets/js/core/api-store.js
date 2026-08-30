/* =========================================================================
   api-store.js — the store, backed by the server
   store.js keeps the workspace in memory and persists it to localStorage.
   This keeps the same in-memory shape and the same methods, but fills it from
   GET /api/state and sends every change to the API. No view knows the
   difference, which is what makes the swap one file.

   What arrives is already scoped by the server (3.1), so this holds no data
   the signed-in person is not entitled to. The interface is not what is
   keeping anything back.
   Originate Command · OM SRS 001
   ========================================================================= */

window.OC = window.OC || {};

OC.apiStore = (function () {
  'use strict';

  var state = null;
  var listeners = [];
  var events = null;
  var refreshing = false;

  function emit() { listeners.forEach(function (fn) { fn(); }); }
  function onChange(fn) { listeners.push(fn); }

  function request(method, path, body) {
    return fetch(path, {
      method: method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok) return data;
        var error = new Error(data.error || ('Request failed: ' + res.status));
        error.status = res.status;
        throw error;
      });
    });
  }

  /* every write re-reads the workspace. At the scale 7.0 specifies that is a
     few kilobytes, and it means the screen always shows what the server
     actually holds rather than what the browser hoped for. */
  function refresh() {
    if (refreshing) return refreshing;
    refreshing = request('GET', '/api/state').then(function (next) {
      var savedSession = state && state.me;
      state = next;
      state.saved_filters = state.saved_filters || [];
      refreshing = false;
      emit();
      return state;
    }).catch(function (error) {
      refreshing = false;
      /* the session ended, or authority changed and the server closed it
         (8.2). Show the gate rather than throwing into the console. */
      if (error.status === 401) {
        if (OC.session) OC.session.signedOut();
        return null;
      }
      throw error;
    });
    return refreshing;
  }

  /* a refused write is reported once, on screen, and the workspace is re-read
     so nothing the server rejected is left showing. The rejection stops here:
     callers chain onto success only. */
  function act(promise) {
    return promise.then(function (result) {
      return refresh().then(function () { return result; });
    }).catch(function (error) {
      if (error.status !== 401 && OC.ui && OC.ui.toast) OC.ui.toast(error.message, true);
      return refresh().then(function () { return Promise.reject(error); });
    });
  }

  /* the server tells every open screen when anything changed (9.0) */
  function listen() {
    if (events || !window.EventSource) return;
    events = new EventSource('/api/events');
    events.onmessage = function () { refresh(); };
    events.onerror = function () { /* EventSource reconnects on its own */ };
  }

  function byId(list, id) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  var api = {
    /* refresh() resolves with null when the server says "sign in first", so
       stop there: no live channel is opened and no interface is started on an
       empty workspace. */
    start: function () {
      return refresh().then(function (loaded) {
        if (!loaded) throw new Error('not signed in');
        listen();
        return loaded;
      });
    },
    stop: function () { if (events) { events.close(); events = null; } state = null; },

    load: function () { return state; },
    save: function () { },
    reset: function () {
      if (OC.ui && OC.ui.toast) {
        OC.ui.toast('The workspace lives on the server now. Reseed it there with: npm run seed -- --force', true);
      }
    },
    onChange: onChange,
    emit: emit,
    refresh: refresh,
    request: request,
    get state() { return state; },

    uid: function (prefix) {
      return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    },

    /* store.js exposes mutate(entry, fn); here the views call the verbs below
       instead, and mutate stays only for the local-only saved filter list */
    mutate: function (entry, fn) { fn(); emit(); },

    user: function (id) { return byId(state && state.users, id); },
    department: function (id) { return byId(state && state.departments, id); },
    client: function (id) { return byId(state && state.clients, id); },
    group: function (id) { return byId(state && state.groups, id); },
    tag: function (id) { return byId(state && state.tags, id); },
    todo: function (id) { return byId(state && state.todos, id); },
    instruction: function (id) { return byId(state && state.instructions, id); },

    session: function () { return state ? state.me : null; },
    setSession: function () { /* identity comes from the session cookie */ },

    /* ---- the verbs the views use ---------------------------------------- */
    createTodo: function (todo) { return act(request('POST', '/api/todos', todo)); },
    updateTodo: function (id, patch) { return act(request('PATCH', '/api/todos/' + id, patch)); },
    postInstruction: function (note) { return act(request('POST', '/api/instructions', note)); },
    updateInstruction: function (id, patch) { return act(request('PATCH', '/api/instructions/' + id, patch)); },
    addComment: function (kind, id, body) { return act(request('POST', '/api/comments', { kind: kind, id: id, body: body })); },
    createGroup: function (group) { return act(request('POST', '/api/groups', group)); },
    updateGroup: function (id, patch) { return act(request('PATCH', '/api/groups/' + id, patch)); },
    inviteUser: function (account) { return act(request('POST', '/api/users', account)); },
    updateUser: function (id, patch) { return act(request('PATCH', '/api/users/' + id, patch)); },
    deleteUser: function (id) { return act(request('DELETE', '/api/users/' + id)); },
    createDepartment: function (dept) { return act(request('POST', '/api/departments', dept)); },
    updateDepartment: function (id, patch) { return act(request('PATCH', '/api/departments/' + id, patch)); },
    createTag: function (label, kind) { return act(request('POST', '/api/tags', { label: label, kind: kind })); },
    pinFilter: function (name, filters) { return act(request('POST', '/api/filters', { name: name, filters: filters })); },
    unpinFilter: function (id) { return act(request('DELETE', '/api/filters/' + id)); },
    markNotificationsRead: function () { return act(request('POST', '/api/notifications/read', {})); },

    issueInvite: function () { return null; },      /* the server issues these */
    inviteExpired: function (invite) {
      return !!invite && !invite.claimed_at && new Date(invite.expires_at) < new Date();
    },
    notify: function () { }                          /* the server notifies */
  };

  return api;
})();
