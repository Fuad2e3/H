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

  /* The instruction panel already stops at 12; the todo panel did not, so a
     person with hundreds of open tasks paid for all of them on every render. */
  var TODO_PAGE = 40;
  var todoLimit = TODO_PAGE;

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
    if (!user || !Array.isArray(OC.store.state.instructions)) return [];
    return OC.store.state.instructions
      .filter(function (n) { return !n.archived && !n.client_only && OC.can.seeInstruction(user, n); })
      .sort(function (a, b) {
        var aRead = Array.isArray(a.read_by) ? a.read_by : [];
        var bRead = Array.isArray(b.read_by) ? b.read_by : [];
        var au = aRead.indexOf(user.id) === -1 ? 0 : 1;
        var bu = bRead.indexOf(user.id) === -1 ? 0 : 1;
        if (au !== bu) return au - bu;                       /* unread first */
        return (b.posted_at || '').localeCompare(a.posted_at || '');
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

    var badgeLabel = tag || deptName || (t.priority && t.priority !== 'normal' ? t.priority.toUpperCase() : 'General');
    var badgeIcon = 'mail';
    var badgeStyleClass = 'badge-channel';

    var lowerBadge = badgeLabel.toLowerCase();
    if (lowerBadge.indexOf('urgent') > -1 || lowerBadge.indexOf('high') > -1) {
      badgeIcon = 'alert';
      badgeStyleClass = 'badge-urgent';
    } else if (lowerBadge.indexOf('linkedin') > -1) {
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

    // Assigner (the person who assigned the task / creator)
    var assignerId = t.created_by || (t.assignee || (Array.isArray(t.assignees) ? t.assignees[0] : ''));
    var assignerUser = OC.store.user(assignerId);
    var assignerText = assignerUser ? assignerUser.name : (assignerId || '');
    var assignerTitle = assignerUser ? assignerUser.title : '';

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

    var topBar = h('div', { class: 'dashboard-todo-top-bar' }, [
      channelBadge,
      overdue
        ? h('span', { class: 'chip overdue due', style: 'font-size:10.5px;padding:1px 7px;' }, OC.ui.dueLabel(t.due))
        : (t.due ? h('span', { class: 'due muted mono', style: 'font-size:11px;' }, OC.ui.dueLabel(t.due)) : null)
    ].filter(Boolean));

    var mainRow = h('div', { class: 'dashboard-todo-main-row' }, [
      checkbox,
      clientCode ? h('span', { class: 'dashboard-client-name' }, clientCode) : null,
      h('span', { class: 'dashboard-todo-title' + (isDone ? ' strikethrough' : '') }, t.title),
      assignerUser
        ? h('span', { class: 'dashboard-assignee-text', style: 'display:inline-flex;align-items:center;gap:6px;', title: 'Assigned by ' + assignerText + (assignerTitle ? ' (' + assignerTitle + ')' : '') }, [
            OC.ui.mark(assignerUser.id),
            h('span', { class: 'name' }, assignerText)
          ])
        : (assignerText ? h('span', { class: 'dashboard-assignee-text' }, assignerText) : null)
    ].filter(Boolean));

    return h('article', {
      class: 'dashboard-todo-row' + (isDone ? ' is-done' : '') + (overdue ? ' is-overdue' : ''),
      'data-id': t.id
    }, [
      topBar,
      mainRow
    ]);
  }

  function render(host, rerender) {
    var h = OC.ui.h;
    var user = me();
    var allTodos = allMyTodos(user);
    var todos = myTodos(user);
    var notes = myInstructions(user);
    var unread = notes.filter(function (n) { return (n.read_by || []).indexOf(user.id) === -1; });
    var overdue = allTodos.filter(function (t) { return OC.ui.daysLate(t.due) > 0; });
    var upcoming = allTodos.filter(function (t) { return OC.ui.daysLate(t.due) < 0; });


    var clientIds = {};
    allTodos.forEach(function (t) {
      if (t.client) clientIds[t.client] = true;
      if (Array.isArray(t.clients)) t.clients.forEach(function (cid) { if (cid) clientIds[cid] = true; });
    });
    notes.forEach(function (n) {
      if ((n.read_by || []).indexOf(user.id) === -1) {
        if (n.client) clientIds[n.client] = true;
        if (Array.isArray(n.clients)) n.clients.forEach(function (cid) { if (cid) clientIds[cid] = true; });
      }
    });
    var clients = Object.keys(clientIds).map(OC.store.client).filter(function (c) {
      /* a client scoped to another department stays off this list even when a
         task happens to reference it */
      return !!c && (!OC.can.seeClient || OC.can.seeClient(user, c));
    });

    var empId = user.employee_id || 'N/A';
    var orgName = user.org || 'N/A';
    var joinedDate = user.joined_date || 'N/A';
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

    var todayStr = new Date().toISOString().split('T')[0];
    var attendanceList = OC.store.state.attendance || [];
    var todayLog = attendanceList.find(function (a) { return a.user_id === user.id && a.date === todayStr; });
    var isPunchComplete = Boolean(todayLog && todayLog.punch_in && todayLog.punch_out);
    var schedIn = user.scheduled_in || (user.office_details && user.office_details.scheduled_in) || '09:00 AM';

    var punchBtnLabel = isPunchComplete
      ? 'Completed (' + todayLog.punch_in + ' - ' + todayLog.punch_out + ')'
      : (!todayLog ? 'Quick Punch In' : 'Quick Punch Out (' + todayLog.punch_in + ')');

    function handleDashboardPunch(e) {
      if (e && e.stopPropagation) e.stopPropagation();
      var latestAtt = OC.store.state.attendance || [];
      var currentLog = latestAtt.find(function (a) { return a.user_id === user.id && a.date === todayStr; });
      if (currentLog && currentLog.punch_in && currentLog.punch_out) {
        OC.ui.toast('Your attendance for today is already completed and locked.', true);
        return;
      }

      var nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      OC.store.mutate({
        actor: user.id,
        action: 'attendance.punch',
        target: user.name,
        detail: 'Punched at ' + nowTime
      }, function () {
        var existing = (OC.store.state.attendance || []).find(function (a) { return a.user_id === user.id && a.date === todayStr; });
        if (!existing) {
            // Use the user's own scheduled_in time for late detection, not a hardcoded 10:15
            var schedParts = (schedIn || '09:00 AM').match(/(\d+):(\d+)\s*(AM|PM)?/i);
            var schedHour = schedParts ? parseInt(schedParts[1], 10) : 9;
            var schedMin = schedParts ? parseInt(schedParts[2], 10) : 0;
            if (schedParts && /PM/i.test(schedParts[3] || '') && schedHour !== 12) schedHour += 12;
            if (schedParts && /AM/i.test(schedParts[3] || '') && schedHour === 12) schedHour = 0;
            var nowH = new Date().getHours();
            var nowM = new Date().getMinutes();
            var isLate = (nowH > schedHour) || (nowH === schedHour && nowM > schedMin + 15);
          OC.store.state.attendance.unshift({
            id: OC.store.uid('att'),
            user_id: user.id,
            date: todayStr,
            scheduled_in: schedIn,
            punch_in: nowTime,
            punch_out: null,
            status: isLate ? 'Late' : 'Present',
            note: 'Auto Quick Punch In'
          });
          OC.ui.toast('Punch In recorded with date ' + todayStr + ' at ' + nowTime + '.');
        } else if (!existing.punch_out) {
          existing.punch_out = nowTime;
          OC.ui.toast('Punch Out recorded with date ' + todayStr + ' at ' + nowTime + '.');
        }
      });
      if (typeof rerender === 'function') {
        rerender();
      } else {
        render(host, rerender);
      }
    }

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
      h('div', { class: 'user-profile-right', style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
        h('button', {
          class: 'btn primary' + (isPunchComplete ? ' disabled' : ''),
          type: 'button',
          id: 'dashboard-attendance-punch-btn',
          disabled: isPunchComplete,
          title: isPunchComplete ? 'Attendance completed for today' : 'Click to punch attendance directly from Dashboard',
          style: 'font-weight:700;font-size:12.5px;padding:7px 14px;border-radius:8px;box-shadow:0 2px 8px rgba(37,99,235,0.35);white-space:nowrap;z-index:2;' + (isPunchComplete ? 'opacity:0.65;cursor:not-allowed;' : ''),
          onClick: handleDashboardPunch
        }, [punchBtnLabel]),
        h('div', { class: 'user-profile-status-badge' }, [
          h('div', { class: 'user-profile-status-label' }, 'OFFICIAL EMAIL'),
          h('div', { class: 'user-profile-status-val' }, 'Verified Portal Active')
        ]),
        h('div', { class: 'user-profile-edit-hint' }, [OC.icon('edit'), 'Edit Profile'])
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
                todoLimit = TODO_PAGE;
                rerender();
              }
            }, showUpcoming ? 'Show Today & Overdue only' : 'Show Upcoming (' + upcoming.length + ')') : null
          ]),
          h('div', { class: 'panel-body', style: 'padding:12px;' }, todos.length
            ? (function () {
                var rows = todos.slice(0, todoLimit).map(function (t) {
                  return dashboardTodoRow(t, user, rerender);
                });
                if (todos.length > todoLimit) {
                  rows.push(h('div', { class: 'list-more' }, [
                    h('button', { class: 'btn small', type: 'button', onClick: function () {
                      todoLimit += TODO_PAGE;
                      rerender();
                    } }, [OC.icon('down'), 'Show ' + (todos.length - todoLimit) + ' more'])
                  ]));
                }
                return rows;
              })()
            : h('div', { class: 'empty' }, [OC.icon('check'), 'Nothing assigned to you right now.']))
        ]),

        h('section', { class: 'panel' }, [
          h('div', { class: 'panel-head' }, [
            h('h2', {}, 'My instructions'),
            h('span', { class: 'sub' }, unread.length ? unread.length + ' unread first' : 'all read')
          ]),
          h('div', { class: 'panel-body' }, notes.length
            ? notes.slice(0, 12).map(function (n) {
                var isUnread = (n.read_by || []).indexOf(user.id) === -1;
                var readers = (n.read_by || []).map(OC.ui.personName);

                var actions = [];
                if (isUnread) {
                  actions.push(h('button', {
                    class: 'btn small', type: 'button', onClick: function () {
                      OC.store.mutate(null, function () { n.read_by = n.read_by || []; n.read_by.push(user.id); });
                    }
                  }, 'Mark as read'));
                }
                if (!n.linked_todo && OC.board && OC.board.convertToTodo) {
                  actions.push(h('button', {
                    class: 'btn small', type: 'button', onClick: function () { OC.board.convertToTodo(n); }
                  }, 'Convert to todo'));
                }
                if (OC.can && OC.can.canEditInstruction && OC.can.canEditInstruction(user, n) && OC.board && OC.board.editInstruction) {
                  actions.push(h('button', {
                    class: 'btn small', type: 'button', onClick: function () { OC.board.editInstruction(n); }
                  }, 'Edit'));
                }

                return h('article', { class: 'note' + (isUnread ? ' unread' : '') }, [
                  h('div', { class: 'byline' }, [
                    OC.ui.person(n.author || n.posted_by, 'strong'),
                    h('span', {}, OC.ui.fmtWhen(n.posted_at)),
                    isUnread ? h('span', { class: 'chip overdue' }, 'unread') : null,
                    n.linked_todo ? h('span', { class: 'chip group' }, 'todo created') : null
                  ]),
                  h('div', { class: 'body' }, n.body),
                  h('div', { class: 'tags' }, [
                    (Array.isArray(n.clients) && n.clients.length > 1)
                      ? h('span', { class: 'multi-clients-wrap', style: 'display:inline-flex;gap:4px;flex-wrap:wrap;' }, n.clients.map(OC.ui.clientChip))
                      : OC.ui.clientChip(n.client),
                    (Array.isArray(n.departments) && n.departments.length > 1)
                      ? h('span', { class: 'multi-depts-wrap', style: 'display:inline-flex;gap:4px;flex-wrap:wrap;' }, n.departments.map(OC.ui.deptChip))
                      : OC.ui.deptChip(n.department),
                    (n.tags || []).map(OC.ui.tagChip)
                  ]),
                  h('div', { class: 'readers' }, readers.length
                    ? 'Read by ' + readers.length + ': ' + readers.join(', ')
                    : 'Nobody has read this yet'),
                  actions.length ? h('div', { class: 'actions', style: 'margin-top:8px;' }, actions) : null,
                  OC.ui.reactionsBar('instruction', n),
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
