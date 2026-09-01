/* =========================================================================
   reports.js — reporting (6.8)
   The daily snapshot the current board already shows, a per-person status
   table scoped by what the signed-in account may see (3.0), the historical
   action log, and CSV export for anything a department head needs to carry
   into a client report.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.reports = (function () {
  'use strict';

  var auditLimit = 10;

  function me() { return OC.store.user(OC.store.session()); }

  function scopedTodos(user) {
    return OC.store.state.todos.filter(function (t) { return !t.archived && OC.can.seeTodo(user, t); });
  }

  function csv(rows) {
    return rows.map(function (row) {
      return row.map(function (cell) {
        var s = String(cell === null || cell === undefined ? '' : cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    OC.ui.toast('Exported ' + filename);
  }

  function exportTodos(todos) {
    var rows = [['Title', 'Client', 'Department', 'Assignee', 'State', 'Due', 'Overdue days', 'Recurrence', 'Created by']];
    todos.forEach(function (t) {
      var late = OC.ui.daysLate(t.due);
      var clientNames = (Array.isArray(t.clients) && t.clients.length)
        ? t.clients.map(function (cid) { var c = OC.store.client(cid); return c ? (OC.ui.clientLabel ? OC.ui.clientLabel(c) : c.name) : cid; }).join(', ')
        : (function () { var c = OC.store.client(t.client); return c ? (OC.ui.clientLabel ? OC.ui.clientLabel(c) : c.name) : ''; })();
      var deptNames = (Array.isArray(t.departments) && t.departments.length)
        ? t.departments.map(function (did) { return (OC.store.department(did) || {}).name || did; }).join(', ')
        : ((OC.store.department(t.department) || {}).name || '');
      rows.push([
        t.title,
        clientNames,
        deptNames,
        OC.ui.assigneeName(t),
        OC.ui.STATE_LABEL[t.state],
        t.due,
        t.state === 'done' ? 0 : Math.max(0, late),
        t.recurrence,
        OC.ui.personName(t.created_by)
      ]);
    });
    download('originate-command-todos-' + OC.ui.today() + '.csv', csv(rows));
  }

  function exportAudit(auditLogs) {
    var rows = [['When', 'Actor', 'IP Address', 'Action', 'Target', 'Detail']];
    auditLogs.forEach(function (a) {
      rows.push([
        a.at,
        OC.ui.personName(a.actor),
        a.ip || '127.0.0.1',
        a.action,
        a.target,
        a.detail || ''
      ]);
    });
    download('originate-command-history-' + OC.ui.today() + '.csv', csv(rows));
  }

  function render(host, rerender, hideHead) {
    var h = OC.ui.h;
    var user = me() || (OC.store.state.users && OC.store.state.users[0]) || { id: 'u-admin', name: 'User', admin: true };
    var todos = scopedTodos(user);
    var today = OC.ui.today();

    var done = todos.filter(function (t) { return t.state === 'done'; });
    var left = todos.filter(function (t) { return t.state !== 'done'; });
    var overdue = left.filter(function (t) { return OC.ui.daysLate(t.due) > 0; });
    var dueToday = left.filter(function (t) { return t.due === today; });

    /* a client counts as complete when it has work and none of it is outstanding */
    var byClient = {};
    todos.forEach(function (t) {
      var clientList = (Array.isArray(t.clients) && t.clients.length) ? t.clients : (t.client ? [t.client] : []);
      clientList.forEach(function (cid) {
        var c = (byClient[cid] = byClient[cid] || { total: 0, done: 0 });
        c.total++;
        if (t.state === 'done') c.done++;
      });
    });
    var clientsComplete = Object.keys(byClient).filter(function (id) {
      return byClient[id].total > 0 && byClient[id].done === byClient[id].total;
    }).length;

    /* per person, limited to people this account may review */
    var people = OC.can.visibleUsers(user);
    var rows = people.map(function (p) {
      var theirs = todos.filter(function (t) {
        if (t.assignee === p.id || (t.assignee_type === 'user' && t.assignee === p.id)) return true;
        if (OC.can.inGroup(p, t.assignee) || (t.assignee_type === 'group' && OC.can.inGroup(p, t.assignee))) return true;
        if (Array.isArray(t.assignees) && t.assignees.some(function (aid) {
          if (aid === p.id) return true;
          if (typeof aid === 'string') {
            if (aid.indexOf('user:') === 0 && aid.slice(5) === p.id) return true;
            if (aid.indexOf('group:') === 0 && OC.can.inGroup(p, aid.slice(6))) return true;
          }
          return OC.can.inGroup(p, aid);
        })) return true;
        return false;
      });
        var doneCount = theirs.filter(function (t) { return t.state === 'done'; }).length;
        var remainingCount = theirs.filter(function (t) { return t.state !== 'done'; }).length;
        var blockedCount = theirs.filter(function (t) { return t.state === 'blocked'; }).length;
        var overdueCount = theirs.filter(function (t) { return t.state !== 'done' && OC.ui.daysLate(t.due) > 0; }).length;
        return {
          person: p,
          total: theirs.length,
          remaining: remainingCount,
          done: doneCount,
          blocked: blockedCount,
          overdue: overdueCount
        };
      }).filter(function (r) { return r.total > 0; })
        .sort(function (a, b) { return b.overdue - a.overdue || b.total - a.total; });

      var allAudit = OC.store.state.audit || [];
      var limitNum = auditLimit === 'all' ? allAudit.length : (parseInt(auditLimit, 10) || 10);
      var audit = allAudit.slice(0, limitNum);

      OC.ui.clear(host);
      var elements = [];

      if (!hideHead) {
        elements.push(
          h('div', { class: 'page-head' }, [
            h('h1', {}, 'Reports'),
            h('p', {}, 'The daily snapshot, scoped to what you may see. ' +
              (user.admin ? 'As system admin this covers every department.'
                          : 'As ' + OC.can.roleLabel(user) + ' this covers your department only (6.7).'))
          ])
        );
      }

      elements.push(
        h('div', { class: 'grid-3', style: 'margin-bottom:20px' }, [
          h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Clients complete'), h('div', { class: 'v tabular' }, [String(clientsComplete), h('small', {}, ' / ' + Object.keys(byClient).length)])]),
          h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Tasks complete'), h('div', { class: 'v tabular' }, String(done.length))]),
          h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Tasks left'), h('div', { class: 'v tabular' }, String(left.length))]),
          h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Due today'), h('div', { class: 'v tabular' }, String(dueToday.length))]),
          h('div', { class: 'stat' + (overdue.length ? ' alert' : '') }, [
            h('span', { class: 'k' }, 'Overdue'), h('div', { class: 'v tabular' }, String(overdue.length))])
        ]),

        h('div', { class: 'row', style: 'margin-bottom:14px' }, [
          h('button', { class: 'btn', type: 'button', onClick: function () { exportTodos(todos); } },
            [OC.icon('board'), 'Export todos to CSV'])
        ]),

        h('div', { class: 'tablewrap', style: 'margin-bottom:22px' }, [
          h('table', {}, [
            h('caption', {}, 'Per person status — ' + OC.ui.fmtDate(today)),
            h('thead', {}, h('tr', {}, [
              h('th', { scope: 'col' }, 'Person'),
              h('th', { scope: 'col' }, 'Role'),
              h('th', { scope: 'col' }, 'Total Assigned'),
              h('th', { scope: 'col' }, 'Remaining'),
              h('th', { scope: 'col' }, 'Done'),
              h('th', { scope: 'col' }, 'Blocked'),
              h('th', { scope: 'col' }, 'Overdue')
            ])),
            h('tbody', {}, rows.length ? rows.map(function (r) {
              return h('tr', {}, [
                h('th', { scope: 'row' }, OC.ui.person(r.person.id)),
                h('td', {}, OC.can.roleLabel(r.person)),
                h('td', { class: 'mono tabular' }, String(r.total)),
                h('td', { class: 'mono tabular bold' + (r.remaining > 0 ? '' : ' muted') }, r.remaining > 0 ? String(r.remaining) : '—'),
                h('td', { class: 'mono tabular bold', style: r.done > 0 ? 'color:var(--success, #10b981);' : '' }, String(r.done)),
                h('td', { class: 'mono tabular' }, r.blocked ? String(r.blocked) : '—'),
                h('td', { class: 'mono tabular', style: r.overdue ? 'color:var(--signal);font-weight:600' : '' }, r.overdue ? String(r.overdue) : '—')
              ]);
            }) : h('tr', {}, h('td', { colspan: '7' }, 'No assigned work in your scope.')))
          ])
        ]),

      h('div', { class: 'section-head', style: 'margin-top:28px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;' }, [
        h('div', { class: 'row', style: 'gap:10px;' }, [
          h('span', { style: 'font-weight:600; font-size:16px;' }, 'Historical Log'),
          h('span', { class: 'chip count' },
            (auditLimit === 'all' || audit.length >= allAudit.length
              ? String(allAudit.length)
              : audit.length + ' of ' + allAudit.length) + (allAudit.length === 1 ? ' event' : ' events'))
        ]),
        h('div', { class: 'row', style: 'gap:8px;' }, [
          h('div', { class: 'segmented', role: 'group', 'aria-label': 'Historical log limit' }, [
            h('button', {
              type: 'button',
              'aria-pressed': String(auditLimit !== 'all'),
              title: auditLimit === 'all' ? 'Show 10 events' : 'Show 10 more events',
              onClick: function () {
                if (auditLimit === 'all') {
                  auditLimit = 10;
                } else {
                  auditLimit = (parseInt(auditLimit, 10) || 10) + 10;
                }
                render(host, rerender);
              }
            }, 'See 10+'),
            h('button', {
              type: 'button',
              'aria-pressed': String(auditLimit === 'all'),
              title: 'Show all events',
              onClick: function () {
                auditLimit = 'all';
                render(host, rerender);
              }
            }, 'See all')
          ]),
          h('button', {
            class: 'btn small',
            type: 'button',
            title: 'Export history log to CSV',
            onClick: function () { exportAudit(allAudit); }
          }, [OC.icon('board'), 'Export history'])
        ])
      ]),

      h('div', { class: 'tablewrap' }, [
        h('table', {}, [
          h('caption', {}, 'Historical log — every action, newest first (6.8)'),
          h('thead', {}, h('tr', {}, [
            h('th', { scope: 'col' }, 'When'),
            h('th', { scope: 'col' }, 'Actor'),
            h('th', { scope: 'col' }, 'IP Address'),
            h('th', { scope: 'col' }, 'Action'),
            h('th', { scope: 'col' }, 'Target'),
            h('th', { scope: 'col' }, 'Detail')
          ])),
          h('tbody', {}, audit.length ? audit.map(function (a) {
            return h('tr', {}, [
              h('td', { class: 'mono' }, OC.ui.fmtWhen(a.at)),
              h('td', {}, OC.ui.person(a.actor)),
              h('td', { class: 'mono' }, a.ip ? h('span', { class: 'chip mono' }, a.ip) : h('span', { class: 'muted' }, '—')),
              h('td', { class: 'mono' }, a.action),
              h('td', {}, a.target),
              h('td', { class: 'muted' }, a.detail || '—')
            ]);
          }) : [
            h('tr', {}, h('td', { colspan: '6', class: 'muted', style: 'text-align:center; padding:20px;' }, 'No historical log entries recorded.'))
          ])
        ])
      ]),

      allAudit.length > 10 ? h('div', {
        class: 'row',
        style: 'margin-top: 14px; padding: 10px 16px; background: var(--card-bg); border: 1px solid var(--rule); border-radius: var(--r1); justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;'
      }, [
        h('div', { class: 'row', style: 'gap: 8px; align-items: center;' }, [
          h('span', { class: 'chip count' },
            (auditLimit === 'all' || audit.length >= allAudit.length
              ? String(allAudit.length)
              : audit.length + ' of ' + allAudit.length) + (allAudit.length === 1 ? ' event' : ' events')),
          h('span', { class: 'muted', style: 'font-size: 13px;' }, 'displayed in historical audit trail')
        ]),
        h('div', { class: 'row', style: 'gap: 8px;' }, [
          h('button', {
            class: 'btn small' + (auditLimit !== 'all' ? ' primary' : ''),
            type: 'button',
            title: auditLimit === 'all' ? 'Show initial 10 events' : 'Show 10 more events',
            onClick: function () {
              if (auditLimit === 'all') {
                auditLimit = 10;
              } else {
                auditLimit = (parseInt(auditLimit, 10) || 10) + 10;
              }
              render(host, rerender);
            }
          }, auditLimit === 'all' ? 'Show 10' : 'See 10+'),
          h('button', {
            class: 'btn small' + (auditLimit === 'all' ? ' primary' : ''),
            type: 'button',
            title: 'Show all historical events',
            onClick: function () {
              auditLimit = 'all';
              render(host, rerender);
            }
          }, 'See all (' + allAudit.length + ')')
        ])
      ]) : null
    );

    OC.ui.clear(host);
    OC.ui.append(host, elements);
  }

  return { render: render, csv: csv, exportAudit: exportAudit };
})();
