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

  var showUpcoming = true;

  function allMyTodos(user) {
    if (!user || !OC.store.state.todos) return [];
    return OC.store.state.todos.filter(function (t) {
      if (t.archived || t.state === 'done') return false;
      // Check single-assignee fields
      if (t.assignee === user.id || (t.assignee_type === 'user' && t.assignee === user.id)) return true;
      if (OC.can.inGroup(user, t.assignee) || (t.assignee_type === 'group' && OC.can.inGroup(user, t.assignee))) return true;
      // Check multi-assignee array (handles raw ids, user:uid, group:gid prefixes)
      if (Array.isArray(t.assignees) && t.assignees.some(function (aid) {
        if (aid === user.id) return true;
        if (typeof aid === 'string') {
          if (aid.indexOf('user:') === 0 && aid.slice(5) === user.id) return true;
          if (aid.indexOf('group:') === 0 && OC.can.inGroup(user, aid.slice(6))) return true;
        }
        return OC.can.inGroup(user, aid);
      })) return true;
      return false;
    }).sort(function (a, b) { return (a.due || '').localeCompare(b.due || ''); });
  }

  function myTodos(user) {
    var all = allMyTodos(user);
    if (showUpcoming) return all;
    // Show only Due Today & Overdue tasks by default (hide future/tomorrow tasks until their due date arrives)
    // NOTE: This filter is currently bypassed because showUpcoming defaults to true.
    return all.filter(function (t) {
      return !t.due || OC.ui.daysLate(t.due) >= 0;
    });
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

  function dashboardTodoRow(t, user, rerender) {
    var h = OC.ui.h;
    var isDone = t.state === 'done';
    var late = OC.ui.daysLate(t.due) > 0;
    var overdue = !isDone && late;

    // Determine channel / department badge info
    var dept = OC.store.department(t.department || (Array.isArray(t.departments) ? t.departments[0] : ''));
    var deptName = dept ? dept.name : '';
    var tag = (t.tags && t.tags.length) ? ((OC.store.tag(t.tags[0]) || {}).label || t.tags[0]) : '';

    var badgeLabel = tag || deptName || 'General';
    var badgeIcon = 'mail';
    var badgeStyleClass = 'badge-channel';

    var lowerBadge = badgeLabel.toLowerCase();
    if (lowerBadge.indexOf('linkedin') > -1) {
      badgeIcon = 'linkedin';
      badgeStyleClass = 'badge-linkedin';
    } else if (lowerBadge.indexOf('mail') > -1 || lowerBadge.indexOf('email') > -1 || lowerBadge.indexOf('outreach') > -1) {
      badgeIcon = 'mail';
      badgeStyleClass = 'badge-email';
    } else if (lowerBadge.indexOf('web') > -1 || lowerBadge.indexOf('dev') > -1) {
      badgeIcon = 'monitor';
      badgeStyleClass = 'badge-web';
    } else {
      badgeIcon = 'inbox';
      badgeStyleClass = 'badge-default';
    }

    // Client name - now standardized to show only Client code via OC.ui.clientLabel
    var clientCode = OC.ui.clientLabel(t.client || (Array.isArray(t.clients) ? t.clients[0] : ''));

    // Assignee / Creator name on right side
    var assigneeUser = OC.store.user(t.assignee || (Array.isArray(t.assignees) ? t.assignees[0] : ''));
    var assigneeText = assigneeUser ? assigneeUser.name : (t.assignee || '');
    var assigneeTitle = assigneeUser ? assigneeUser.title : '';

    if (!assigneeText && t.created_by) {
      var creator = OC.store.user(t.created_by);
      assigneeText = creator ? creator.name : t.created_by;
      assigneeTitle = creator ? creator.title : '';
    }

    var checkbox = h('button', {
      type: 'button',
      class: 'todo-check-btn' + (isDone ? ' checked' : ''),
      'aria-label': isDone ? 'Mark as incomplete' : 'Mark as completed',
      onClick: function (e) {
        e.stopPropagation();
        var nextState = isDone ? 'open' : 'done';
        OC.store.mutate({
          actor: user.id, action: 'todo.state', target: t.title, detail: nextState
        }, function () {
          t.state = nextState;
        });
        OC.ui.toast(nextState === 'done' ? 'Task completed.' : 'Task reopened.');
        rerender();
      }
    }, [
      isDone ? (OC.icon ? OC.icon('check', 'check-icon') : '✓') : null
    ]);

    var channelBadge = h('span', { class: 'channel-badge ' + badgeStyleClass }, [
      (OC.icon && badgeIcon) ? OC.icon(badgeIcon, 'channel-icon') : null,
      h('span', {}, badgeLabel)
    ]);

    return h('article', {
      class: 'dashboard-todo-row' + (isDone ? ' is-done' : '') + (overdue ? ' is-overdue' : ''),
      'data-id': t.id,
      onClick: function () {
        if (OC.board && OC.board.editTodo && OC.can && OC.can.canEditTodo && OC.can.canEditTodo(user, t)) {
          OC.board.editTodo(t);
        }
      }
    }, [
      checkbox,
      channelBadge,
      clientCode ? h('span', { class: 'dashboard-client-name' }, clientCode) : null,
      h('span', { class: 'dashboard-todo-title' + (isDone ? ' strikethrough' : '') }, t.title),
      overdue ? h('span', { class: 'chip overdue due', style: 'font-size:11px;padding:2px 8px;' }, OC.ui.dueLabel(t.due)) : null,
      assigneeUser
        ? h('span', { class: 'dashboard-assignee-text', style: 'display:inline-flex;align-items:center;gap:6px;' }, [
            OC.ui.mark(assigneeUser.id),
            h('span', { class: 'name' }, assigneeText),
            assigneeTitle ? h('span', { class: 'chip role', style: 'font-size:10px;padding:1px 6px;' }, assigneeTitle) : null
          ].filter(Boolean))
        : (assigneeText ? h('span', { class: 'dashboard-assignee-text' }, assigneeText) : null)
    ].filter(Boolean));
  }

  function render(host, rerender) {
    var h = OC.ui.h;
    var user = me();
    var allTodos = allMyTodos(user);
    var todos = myTodos(user);
    var notes = myInstructions(user);
    var unread = notes.filter(function (n) { return n.read_by.indexOf(user.id) === -1; });
    var overdue = allTodos.filter(function (t) { return OC.ui.daysLate(t.due) > 0; });
    var upcoming = allTodos.filter(function (t) { return OC.ui.daysLate(t.due) < 0; });


    var clientIds = {};
    allTodos.forEach(function (t) {
      if (t.client) clientIds[t.client] = true;
      if (Array.isArray(t.clients)) t.clients.forEach(function (cid) { if (cid) clientIds[cid] = true; });
    });
    notes.forEach(function (n) {
      if (n.read_by.indexOf(user.id) === -1) {
        if (n.client) clientIds[n.client] = true;
        if (Array.isArray(n.clients)) n.clients.forEach(function (cid) { if (cid) clientIds[cid] = true; });
      }
    });
    var clients = Object.keys(clientIds).map(OC.store.client).filter(Boolean);

    var empId = user.employee_id || (user.id ? user.id.replace('u-', 'EMP-').toUpperCase() : 'EMP-1188');
    var orgName = user.org || 'MUNSHE IT';
    var joinedDate = user.joined_date || '23-Jul-2026';
    var deptNames = (user.departments && user.departments.length)
      ? user.departments.map(function (m) { return (OC.store.department(m.department) || {}).name; }).join(', ')
      : '';
    
    var roleLine = user.title || (user.admin ? 'System Admin' : OC.can.roleLabel(user));
    if (deptNames) {
      roleLine += ' • ' + deptNames;
    } else if (user.admin) {
      roleLine += ' • Operations';
    }
    
    var joinLine = 'Joined ' + joinedDate + ' (' + orgName + ')';

    var profileBanner = h('div', {
      class: 'user-profile-banner',
      role: 'button',
      tabIndex: 0,
      title: 'Click to open Employee Portal, Attendance, Leave Management & Profile Details',
      onClick: function () {
        if (OC.app && OC.app.go) {
          OC.app.go('profile');
        } else if (OC.app && OC.app.openProfileModal) {
          OC.app.openProfileModal(user, rerender);
        }
      }
    }, [
      h('div', { class: 'user-profile-banner-left' }, [
        h('div', { class: 'user-profile-avatar-wrap' }, [
          user.avatar
            ? h('img', { src: user.avatar, alt: user.name })
            : h('div', { class: 'user-profile-avatar-placeholder' }, OC.ui.initials(user.name))
        ]),
        h('div', { class: 'user-profile-info' }, [
          h('div', { class: 'user-profile-title-row' }, [
            h('span', { class: 'user-profile-name' }, user.name),
            h('span', { class: 'user-profile-badge' }, empId)
          ]),
          h('div', { class: 'user-profile-role-line' }, roleLine),
          h('div', { class: 'user-profile-meta-line' }, joinLine)
        ])
      ]),
      h('div', { class: 'user-profile-right' }, [
        h('div', { class: 'user-profile-status-badge' }, [
          h('div', { class: 'user-profile-status-label' }, 'OFFICIAL EMAIL'),
          h('div', { class: 'user-profile-status-val' }, 'Verified Portal Active')
        ]),
        h('div', { class: 'user-profile-edit-hint' }, ['✏️ Edit Profile'])
      ])
    ]);

    OC.ui.clear(host);
    OC.ui.append(host, [
      profileBanner,

      h('div', { class: 'stats' }, [
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'My open todos'), h('div', { class: 'v tabular' }, String(allTodos.length))]),
        h('div', { class: 'stat' + (overdue.length ? ' alert' : '') }, [
          h('span', { class: 'k' }, 'Overdue'), h('div', { class: 'v tabular' }, String(overdue.length))]),
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Unread instructions'), h('div', { class: 'v tabular' }, String(unread.length))]),
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Active clients'), h('div', { class: 'v tabular' }, String(clients.length))])
      ]),

      h('div', { class: 'board' }, [
        h('section', { class: 'panel' }, [
          h('div', { class: 'panel-head' }, [
            h('h2', {}, 'My todos'),
            h('span', { class: 'sub' }, showUpcoming ? 'showing all open tasks' : 'due today & overdue first'),
            upcoming.length ? h('button', {
              class: 'btn small',
              type: 'button',
              style: 'margin-left:auto;',
              onClick: function () {
                showUpcoming = !showUpcoming;
                rerender();
              }
            }, showUpcoming ? 'Show Today & Overdue only' : 'Show Upcoming (' + upcoming.length + ')') : null
          ]),
          h('div', { class: 'panel-body', style: 'padding:12px;' }, todos.length
            ? todos.map(function (t) {
                return dashboardTodoRow(t, user, rerender);
              })
            : h('div', { class: 'empty' }, [OC.icon('check'), 'Nothing assigned to you right now.']))
        ]),

        h('section', { class: 'panel' }, [
          h('div', { class: 'panel-head' }, [
            h('h2', {}, 'My instructions'),
            h('span', { class: 'sub' }, unread.length ? unread.length + ' unread first' : 'all read')
          ]),
          h('div', { class: 'panel-body' }, notes.length
            ? notes.slice(0, 8).map(function (n) {
                var isUnread = n.read_by.indexOf(user.id) === -1;
                return h('article', { class: 'note' + (isUnread ? ' unread' : '') }, [
                  h('div', { class: 'byline' }, [
                    OC.ui.person(n.author, 'strong'),
                    h('span', {}, OC.ui.fmtWhen(n.posted_at)),
                    isUnread ? h('span', { class: 'chip overdue' }, 'unread') : null
                  ]),
                  h('div', { class: 'body' }, n.body),
                  h('div', { class: 'tags' }, [
                    (Array.isArray(n.clients) && n.clients.length > 1)
                      ? h('span', { class: 'multi-clients-wrap', style: 'display:inline-flex;gap:4px;flex-wrap:wrap;' }, n.clients.map(OC.ui.clientChip))
                      : OC.ui.clientChip(n.client),
                    (Array.isArray(n.departments) && n.departments.length > 1)
                      ? h('span', { class: 'multi-depts-wrap', style: 'display:inline-flex;gap:4px;flex-wrap:wrap;' }, n.departments.map(OC.ui.deptChip))
                      : OC.ui.deptChip(n.department),
                    n.tags.map(OC.ui.tagChip)
                  ]),
                  OC.ui.reactionsBar('instruction', n),
                  isUnread ? h('div', { class: 'actions' }, [
                    h('button', {
                      class: 'btn small', type: 'button', onClick: function () {
                        OC.store.mutate(null, function () { n.read_by.push(user.id); });
                      }
                    }, 'Mark as read')
                  ]) : null,
                  OC.can.canSeeComments(user, n) ? OC.ui.commentThread('instruction', n) : null
                ]);
              })
            : h('div', { class: 'empty' }, [OC.icon('inbox'), 'No instructions are addressed to you.']))
        ])
      ]),

      (function () {
        var filters = OC.store.state.saved_filters || [];
        var pinned = filters.filter(function (f) { return f.owner === user.id; });
        if (!pinned.length) return null;
        return h('div', { class: 'card', style: 'margin-top:18px' }, [
          h('h3', {}, 'Pinned filters'),
          h('p', { class: 'muted', style: 'font-size:13px;margin:4px 0 10px' },
            'Saved on the board so they do not have to be rebuilt each visit (6.4).'),
          h('div', { class: 'row' }, pinned.map(function (f) {
            return h('button', {
              class: 'chip client', type: 'button', style: 'cursor:pointer',
              onClick: function () { OC.board.applyFilter(f.filters); OC.app.go('board'); }
            }, f.name);
          }))
        ]);
      })()
    ].filter(Boolean));
  }

  return { render: render };
})();
