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
              prefs: { push: true, email: true, discord: false }
            };
            OC.store.mutate({
              actor: user.id, action: 'user.invite', target: account.name,
              detail: (OC.store.department(deptSelect.value) || {}).name + ' as ' + levelSelect.value
            }, function () {
              OC.store.state.users.push(account);
            });
            OC.ui.toast('Invite recorded. The account shows as invited until the link is claimed.');
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

  function render(host) {
    var h = OC.ui.h;
    var user = me();

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
        h('button', { class: 'btn', type: 'button', onClick: editPrefs }, [OC.icon('bell'), 'My notification preferences'])
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
          h('div', { class: 'stack' }, members.map(function (u) {
            return h('div', { class: 'row', style: 'font-size:13.5px' }, [
              h('span', {}, u.name),
              h('span', { class: 'chip role push' }, OC.can.levelIn(u, d.id)),
              u.status === 'invited' ? h('span', { class: 'chip overdue' }, 'invited') : null
            ]);
          }))
        ]);
      })),

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
