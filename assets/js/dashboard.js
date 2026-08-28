/* =========================================================================
   dashboard.js — the personal dashboard (6.7)
   What one account sees on arrival: their open todos grouped by client with
   the oldest due date first, the instructions addressed to them with unread
   surfaced, the clients they currently hold work for, and their groups.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.dashboard = (function () {
  'use strict';

  function me() { return OC.store.user(OC.store.session()); }

  function myTodos(user) {
    return OC.store.state.todos.filter(function (t) {
      if (t.archived || t.state === 'done') return false;
      if (t.assignee_type === 'user') return t.assignee === user.id;
      return OC.can.inGroup(user, t.assignee);
    }).sort(function (a, b) { return (a.due || '').localeCompare(b.due || ''); });
  }

  function myInstructions(user) {
    return OC.store.state.instructions
      .filter(function (n) { return !n.archived && OC.can.seeInstruction(user, n); })
      .sort(function (a, b) {
        var au = a.read_by.indexOf(user.id) === -1 ? 0 : 1;
        var bu = b.read_by.indexOf(user.id) === -1 ? 0 : 1;
        if (au !== bu) return au - bu;                       /* unread first */
        return b.posted_at.localeCompare(a.posted_at);
      });
  }

  function render(host, rerender) {
    var h = OC.ui.h;
    var user = me();
    var todos = myTodos(user);
    var notes = myInstructions(user);
    var unread = notes.filter(function (n) { return n.read_by.indexOf(user.id) === -1; });
    var overdue = todos.filter(function (t) { return OC.ui.daysLate(t.due) > 0; });
    var groups = OC.store.state.groups.filter(function (g) { return g.status === 'active' && g.members.indexOf(user.id) > -1; });

    var clientIds = {};
    todos.forEach(function (t) { clientIds[t.client] = true; });
    notes.forEach(function (n) { if (n.read_by.indexOf(user.id) === -1) clientIds[n.client] = true; });
    var clients = Object.keys(clientIds).map(OC.store.client).filter(Boolean);

    /* todos grouped by client, oldest due first */
    var byClient = {};
    todos.forEach(function (t) {
      var name = (OC.store.client(t.client) || {}).name || 'No client';
      (byClient[name] = byClient[name] || []).push(t);
    });

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, 'Good to see you, ' + user.name.split(' ')[0]),
        h('p', {}, OC.can.roleLabel(user) + ' · ' + (user.departments.length
          ? user.departments.map(function (m) { return (OC.store.department(m.department) || {}).name + ' (' + m.level + ')'; }).join(' · ')
          : 'leadership tier, every department'))
      ]),

      h('div', { class: 'grid-3', style: 'margin-bottom:20px' }, [
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Open todos'), h('div', { class: 'v tabular' }, String(todos.length))]),
        h('div', { class: 'stat' + (overdue.length ? ' alert' : '') }, [
          h('span', { class: 'k' }, 'Overdue'), h('div', { class: 'v tabular' }, String(overdue.length))]),
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Unread instructions'), h('div', { class: 'v tabular' }, String(unread.length))]),
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Active clients'), h('div', { class: 'v tabular' }, String(clients.length))])
      ]),

      h('div', { class: 'board' }, [
        h('section', { class: 'panel' }, [
          h('div', { class: 'panel-head' }, [
            h('h2', {}, 'My todos'),
            h('span', { class: 'sub' }, 'by client, oldest due first'),
            h('div', { class: 'tools' }, [
              h('button', { class: 'btn small primary', type: 'button', onClick: function () { OC.board.newTodo(); } },
                [OC.icon('plus'), 'New todo'])])
          ]),
          h('div', { class: 'panel-body' }, todos.length
            ? Object.keys(byClient).sort().map(function (name) {
                return h('div', { class: 'stack' }, [
                  h('div', { class: 'group-head' }, [name, h('span', { class: 'n push' }, byClient[name].length)]),
                  byClient[name].map(function (t) {
                    var late = OC.ui.daysLate(t.due) > 0;
                    return h('article', { class: 'item is-' + t.state + (late ? ' is-overdue' : '') }, [
                      h('div', { class: 'title' }, t.title),
                      h('div', { class: 'meta' }, [
                        OC.ui.deptChip(t.department),
                        OC.ui.stateChip(t.state),
                        h('span', { class: late ? 'chip overdue' : '' }, OC.ui.dueLabel(t.due)),
                        t.assignee_type === 'group' ? h('span', { class: 'chip group' }, OC.ui.assigneeName(t)) : null
                      ])
                    ]);
                  })
                ]);
              })
            : h('div', { class: 'empty' }, [OC.icon('check'), 'Nothing assigned to you right now.']))
        ]),

        h('section', { class: 'panel' }, [
          h('div', { class: 'panel-head' }, [
            h('h2', {}, 'My instructions'),
            h('span', { class: 'sub' }, unread.length ? unread.length + ' unread first' : 'all read'),
            h('div', { class: 'tools' }, [
              h('button', { class: 'btn small primary', type: 'button', onClick: function () { OC.board.newInstruction(); } },
                [OC.icon('plus'), 'Post instruction'])])
          ]),
          h('div', { class: 'panel-body' }, notes.length
            ? notes.slice(0, 8).map(function (n) {
                var isUnread = n.read_by.indexOf(user.id) === -1;
                return h('article', { class: 'note' + (isUnread ? ' unread' : '') }, [
                  h('div', { class: 'byline' }, [
                    h('strong', {}, OC.ui.personName(n.author)),
                    h('span', {}, OC.ui.fmtWhen(n.posted_at)),
                    isUnread ? h('span', { class: 'chip overdue' }, 'unread') : null
                  ]),
                  h('div', { class: 'body' }, n.body),
                  h('div', { class: 'tags' }, [OC.ui.clientChip(n.client), OC.ui.deptChip(n.department), n.tags.map(OC.ui.tagChip)]),
                  isUnread ? h('div', { class: 'actions' }, [
                    h('button', {
                      class: 'btn small', type: 'button', onClick: function () {
                        OC.store.mutate(null, function () { n.read_by.push(user.id); });
                      }
                    }, 'Mark as read')
                  ]) : null
                ]);
              })
            : h('div', { class: 'empty' }, [OC.icon('inbox'), 'No instructions are addressed to you.']))
        ])
      ]),

      h('div', { class: 'grid-2', style: 'margin-top:18px' }, [
        h('div', { class: 'card' }, [
          h('h3', {}, 'My clients'),
          clients.length
            ? h('div', { class: 'row', style: 'margin-top:8px' }, clients.map(function (c) { return OC.ui.clientChip(c.id); }))
            : h('p', { class: 'muted' }, 'No client work assigned.')
        ]),
        h('div', { class: 'card' }, [
          h('h3', {}, 'My groups'),
          groups.length
            ? h('div', { class: 'stack', style: 'margin-top:8px' }, groups.map(function (g) {
                return h('div', {}, [
                  h('span', { class: 'chip group' }, g.name),
                  h('p', { class: 'muted', style: 'font-size:13px;margin-top:5px' }, g.purpose)
                ]);
              }))
            : h('p', { class: 'muted' }, 'You are not in a group. Groups cut across departments (4.2).')
        ])
      ])
    ]);
  }

  return { render: render };
})();
