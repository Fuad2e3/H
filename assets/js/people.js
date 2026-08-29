/* =========================================================================
   people.js — accounts, departments and the audit log (3.0, 4.0, 6.1)
   The organisation as data: who is in which department at which level, the
   ordered hierarchy each department defines for itself, the invite flow, and
   the immutable audit trail. Invites are simulated here — in the specified
   build a Cloud Function sends the single-use link described in 6.1.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.people = (function () {
  'use strict';

  function me() { return OC.store.user(OC.store.session()); }

  function invite() {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', placeholder: 'full name' });
    var email = h('input', { type: 'text', placeholder: 'name@originate.example' });
    var title = h('input', { type: 'text', placeholder: 'job title' });

    var depts = user.admin ? OC.store.state.departments
      : OC.store.state.departments.filter(function (d) { return OC.can.isHead(user, d.id); });
    var deptSelect = OC.ui.select(depts.map(function (d) { return { value: d.id, label: d.name }; }), depts[0] && depts[0].id);
    var levelSelect = OC.ui.select([], '');

    function refreshLevels() {
      var d = OC.store.department(deptSelect.value);
      OC.ui.clear(levelSelect);
      (d ? d.levels : []).forEach(function (lv) {
        levelSelect.appendChild(h('option', { value: lv }, lv));
      });
      levelSelect.value = d ? d.levels[d.levels.length - 1] : '';   /* least privilege (8.2) */
    }
    deptSelect.addEventListener('change', refreshLevels);
    refreshLevels();

    OC.ui.modal({
      title: 'Invite someone',
      content: h('div', {}, [
        OC.ui.field('Name', name, { required: true }),
        OC.ui.field('Email', email, { required: true, hint: 'Receives a single-use link that expires after 72 hours (6.1).' }),
        OC.ui.field('Title', title),
        OC.ui.field('Department', deptSelect, { required: true }),
        OC.ui.field('Starting level', levelSelect, { required: true, hint: 'New accounts default to the narrowest level in the department (8.2).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Send invite', primary: true, onClick: function (close) {
            if (!name.value.trim()) return 'Enter a name.';
            if (!/.+@.+\..+/.test(email.value)) return 'Enter a valid email address.';
            var account = {
              id: OC.store.uid('u'), name: name.value.trim(), email: email.value.trim(),
              title: title.value.trim() || 'Team member', admin: false, status: 'invited',
              departments: [{ department: deptSelect.value, level: levelSelect.value }],
              prefs: { push: true, email: true, discord: false },
              invite: OC.store.issueInvite(user.id)
            };
            OC.store.mutate({
              actor: user.id, action: 'user.invite', target: account.name,
              detail: (OC.store.department(deptSelect.value) || {}).name + ' as ' + levelSelect.value
            }, function () {
              OC.store.state.users.push(account);
            });
            OC.ui.toast('Invite issued. The link is single use and expires in 72 hours.');
            close();
          }
        }
      ]
    });
  }

  function editPrefs() {
    var h = OC.ui.h;
    var user = me();
    var push = h('input', { type: 'checkbox', checked: user.prefs.push });
    var email = h('input', { type: 'checkbox', checked: user.prefs.email });
    var discord = h('input', { type: 'checkbox', checked: user.prefs.discord });

    OC.ui.modal({
      title: 'Notification preferences',
      content: h('div', {}, [
        h('p', { class: 'muted', style: 'font-size:13.5px;margin-bottom:12px' },
          'Every channel is a toggle on your own profile, so nobody is forced into a channel they do not use (9.0).'),
        h('label', { class: 'checkline' }, [push, 'Browser push — anything assigned directly to me']),
        h('label', { class: 'checkline' }, [email, 'Email — the dependable fallback']),
        h('label', { class: 'checkline' }, [discord, 'Discord webhook — the team-wide instruction feed'])
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Save', primary: true, onClick: function (close) {
            OC.store.mutate({ actor: user.id, action: 'user.prefs', target: user.name }, function () {
              user.prefs = { push: push.checked, email: email.checked, discord: discord.checked };
            });
            OC.ui.toast('Preferences saved.');
            close();
          }
        }
      ]
    });
  }

  function resend(account) {
    var user = me();
    OC.store.mutate({ actor: user.id, action: 'user.invite.resend', target: account.name,
                      detail: 'new single use link, 72 hour expiry' }, function () {
      account.invite = OC.store.issueInvite(user.id);
    });
    OC.ui.toast('A fresh link was issued. The previous one no longer works.');
  }

  function revoke(account) {
    OC.ui.confirm('Withdraw the invite for ' + account.name + '? The link stops working immediately.', function () {
      OC.store.mutate({ actor: OC.store.session(), action: 'user.invite.revoke', target: account.name }, function () {
        OC.store.state.users = OC.store.state.users.filter(function (u) { return u.id !== account.id; });
      });
      OC.ui.toast('Invite withdrawn.');
    });
  }

  function claim(account) {
    OC.ui.confirm('Simulate ' + account.name + ' following their link and completing their profile?', function () {
      OC.store.mutate({ actor: account.id, action: 'user.invite.claim', target: account.name }, function () {
        account.invite.claimed_at = new Date().toISOString();
        account.status = 'active';
      });
      OC.ui.toast(account.name + ' is now an active account.');
    });
  }

  function inviteRow(account) {
    var h = OC.ui.h;
    var user = me();
    var expired = OC.store.inviteExpired(account.invite);
    var actions = [];
    if (OC.can.manageInvite(user, account)) {
      actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { resend(account); } }, 'Resend'));
      actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { revoke(account); } }, 'Revoke'));
      if (!expired) {
        actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { claim(account); } }, 'Simulate claim'));
      }
    }
    return h('div', { class: 'card invite-card' }, [
      h('div', { class: 'row' }, [
        h('h3', {}, account.name),
        h('span', { class: 'chip ' + (expired ? 'overdue' : 'custom') + ' push' }, expired ? 'link expired' : 'awaiting claim')
      ]),
      h('p', { class: 'muted', style: 'font-size:13px;margin:4px 0 8px' }, account.email + ' · ' + account.title),
      h('div', { class: 'row' }, account.departments.map(function (m) {
        return h('span', { class: 'chip custom' }, (OC.store.department(m.department) || {}).name + ' · ' + m.level);
      })),
      h('p', { class: 'mono muted', style: 'font-size:10.5px;margin-top:8px' },
        'Token ' + account.invite.token + ' · issued by ' + OC.ui.personName(account.invite.issued_by) +
        ' · expires ' + OC.ui.fmtDate(account.invite.expires_at)),
      actions.length ? h('div', { class: 'row', style: 'margin-top:10px' }, actions) : null
    ]);
  }

  /* ---- departments are data, not schema (3.4, 4.1) ----------------------- */
  function newDepartment() {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', placeholder: 'for example: Paid Advertising' });
    var levels = h('input', { type: 'text', value: 'head, lead, member' });
    OC.ui.modal({
      title: 'New department',
      content: h('div', {}, [
        OC.ui.field('Name', name, { required: true }),
        OC.ui.field('Hierarchy, highest first', levels, { required: true,
          hint: 'Comma separated. Permissions come from a level\'s position in this list, so a department may carry levels the others do not (3.4).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Create department', primary: true, onClick: function (close) {
            if (!name.value.trim()) return 'Give the department a name.';
            var list = levels.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
            if (list.length < 2) return 'A department needs at least two levels.';
            var dept = { id: OC.store.uid('d'), name: name.value.trim(), levels: list };
            OC.store.mutate({ actor: user.id, action: 'department.create', target: dept.name,
                              detail: list.join(' → ') }, function () {
              OC.store.state.departments.push(dept);
            });
            OC.ui.toast('Department created. No development work required (4.1).');
            close();
          }
        }
      ]
    });
  }

  function editLevels(dept) {
    var h = OC.ui.h;
    var user = me();
    var levels = h('input', { type: 'text', value: dept.levels.join(', ') });
    OC.ui.modal({
      title: 'Hierarchy for ' + dept.name,
      content: h('div', {}, [
        OC.ui.field('Levels, highest first', levels, { required: true,
          hint: 'Order is the authority. Position 1 is the department head, position 2 the team lead; anything below assigns to nobody (3.4).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Save hierarchy', primary: true, onClick: function (close) {
            var list = levels.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
            if (list.length < 2) return 'A department needs at least two levels.';
            var orphaned = OC.store.state.users.filter(function (u) {
              var lv = OC.can.levelIn(u, dept.id);
              return lv && list.indexOf(lv) === -1;
            });
            if (orphaned.length) {
              return 'Removing a level that people still hold: ' +
                orphaned.map(function (u) { return u.name; }).join(', ') + '. Move them first.';
            }
            var before = dept.levels.join(' → ');
            OC.store.mutate({ actor: user.id, action: 'department.hierarchy', target: dept.name,
                              detail: before + '  =>  ' + list.join(' → ') }, function () {
              dept.levels = list;
            });
            OC.ui.toast('Hierarchy saved. Permissions follow the new order immediately.');
            close();
          }
        }
      ]
    });
  }

  function render(host) {
    var h = OC.ui.h;
    var user = me();
    var pending = OC.store.state.users.filter(function (u) { return u.status === 'invited' && u.invite; });

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, 'People and departments'),
        h('p', {}, 'Departments are data, not schema — a seventh one can be added without development work (4.1). ' +
          'Each department defines its own ordered hierarchy, which is what the permission engine reads instead of a fixed role name (3.4).')
      ]),

      h('div', { class: 'row', style: 'margin-bottom:16px' }, [
        OC.can.invite(user)
          ? h('button', { class: 'btn primary', type: 'button', onClick: invite }, [OC.icon('plus'), 'Invite someone'])
          : h('p', { class: 'muted' }, 'Invites are sent by the system admin or a department head (6.1).'),
        h('button', { class: 'btn', type: 'button', onClick: editPrefs }, [OC.icon('bell'), 'My notification preferences']),
        OC.can.manageDepartments(user)
          ? h('button', { class: 'btn', type: 'button', onClick: newDepartment }, [OC.icon('plus'), 'New department'])
          : null
      ]),

      pending.length ? h('div', { style: 'margin-bottom:22px' }, [
        h('h2', { class: 'section-head' }, [
          'Pending invites',
          h('span', { class: 'chip count' }, pending.length + ' awaiting')
        ]),
        h('p', { class: 'muted', style: 'font-size:13.5px;margin-bottom:12px;max-width:74ch' },
          'Each link is single use and expires 72 hours after it is issued. An unclaimed invite can be resent or ' +
          'revoked by whoever sent it, or by the system admin (6.1).'),
        h('div', { class: 'grid-2' }, pending.map(inviteRow))
      ]) : null,

      h('h2', { class: 'section-head' }, [
        'Departments',
        h('span', { class: 'chip count' }, OC.store.state.departments.length + ' total')
      ]),
      h('div', { class: 'grid-2', style: 'margin-bottom:22px' }, OC.store.state.departments.map(function (d) {
        var members = OC.store.state.users.filter(function (u) { return OC.can.inDept(u, d.id); });
        return h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [
            h('h3', {}, d.name),
            h('span', { class: 'chip custom push' }, members.length + ' people')
          ]),
          h('div', { class: 'row', style: 'margin:8px 0 10px' }, d.levels.map(function (lv, i) {
            return h('span', { class: 'chip ' + (i === 0 ? 'dept' : 'custom') }, (i + 1) + '. ' + lv);
          })),
          OC.can.manageDepartments(user)
            ? h('button', { class: 'btn small', type: 'button', style: 'margin-bottom:10px',
                            onClick: function () { editLevels(d); } }, 'Edit hierarchy')
            : null,
          h('div', { class: 'stack' }, members.map(function (u) {
            return h('div', { class: 'row', style: 'font-size:13.5px' }, [
              h('span', {}, u.name),
              h('span', { class: 'chip role push' }, OC.can.levelIn(u, d.id)),
              u.status === 'invited' ? h('span', { class: 'chip overdue' }, 'invited') : null
            ]);
          }))
        ]);
      })),

      h('h2', { class: 'section-head' }, [
        'Accounts',
        h('span', { class: 'chip count' }, OC.store.state.users.length + ' people')
      ]),
      h('div', { class: 'tablewrap' }, [
        h('table', {}, [
          h('caption', {}, 'Accounts'),
          h('thead', {}, h('tr', {}, [
            h('th', { scope: 'col' }, 'Name'),
            h('th', { scope: 'col' }, 'Title'),
            h('th', { scope: 'col' }, 'Role'),
            h('th', { scope: 'col' }, 'Departments'),
            h('th', { scope: 'col' }, 'Status')
          ])),
          h('tbody', {}, OC.store.state.users.map(function (u) {
            return h('tr', {}, [
              h('th', { scope: 'row' }, u.name),
              h('td', { class: 'muted' }, u.title),
              h('td', {}, h('span', { class: 'chip role' }, OC.can.roleLabel(u))),
              h('td', {}, u.departments.length
                ? u.departments.map(function (m) {
                    return h('span', { class: 'chip custom', style: 'margin-right:4px' },
                      (OC.store.department(m.department) || {}).name + ' · ' + m.level);
                  })
                : h('span', { class: 'muted' }, 'leadership tier, every department')),
              h('td', { class: 'mono' }, u.status)
            ]);
          }))
        ])
      ])
    ]);
  }

  return { render: render, invite: invite, editPrefs: editPrefs };
})();
