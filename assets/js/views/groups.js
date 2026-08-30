/* =========================================================================
   groups.js — cross-department groups (4.2, 6.5)
   A group is separate from the department tree: its own member list, its own
   assignable identity, archived rather than deleted when the work ends.
   Creation is gated on the working default recorded in section 13: system
   admin plus department heads.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.groups = (function () {
  'use strict';

  function me() { return OC.store.user(OC.store.session()); }

  function newGroup() {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', placeholder: 'for example: Chaim Site Relaunch' });
    var purpose = h('textarea', { placeholder: 'what this group exists to do, and until when' });
    var boxes = OC.store.state.users.map(function (u) {
      var box = h('input', { type: 'checkbox', value: u.id, checked: u.id === user.id });
      return {
        id: u.id, box: box,
        node: h('label', { class: 'checkline' }, [
          box, u.name,
          h('span', { class: 'chip role' }, OC.can.roleLabel(u))
        ])
      };
    });

    OC.ui.modal({
      title: 'New group',
      content: h('div', {}, [
        OC.ui.field('Name', name, { required: true }),
        OC.ui.field('Purpose', purpose, { required: true }),
        OC.ui.field('Members', h('div', {}, boxes.map(function (b) { return b.node; })), {
          hint: 'Anyone, from any department. That is the point of a group (4.2).'
        })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Create group', primary: true, onClick: function (close) {
            if (!name.value.trim()) return 'Give the group a name.';
            if (!purpose.value.trim()) return 'Say what the group is for.';
            var members = boxes.filter(function (b) { return b.box.checked; }).map(function (b) { return b.id; });
            if (members.length < 2) return 'A group needs at least two people.';

            return OC.store.createGroup({
              name: name.value.trim(), purpose: purpose.value.trim(), members: members
            }).then(function () { OC.ui.toast('Group created.'); });
          }
        }
      ]
    });
  }

  function archive(group) {
    OC.ui.confirm('Archive "' + group.name + '"? Groups are archived, never deleted, so their history stays for reporting (6.5).', function () {
      OC.store.updateGroup(group.id, { status: 'archived' })
        .then(function () { OC.ui.toast('Group archived.'); });
    });
  }

  function render(host) {
    var h = OC.ui.h;
    var user = me();
    var canCreate = OC.can.createGroup(user);
    var groups = OC.store.state.groups;

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, 'Groups'),
        h('p', {}, 'Groups cut across the department tree for work that needs people from more than one department. ' +
          (canCreate
            ? 'Your role may create them.'
            : 'Creation is limited to the system admin and department heads under the working default in section 13 — your role may not create one.'))
      ]),
      canCreate
        ? h('button', { class: 'btn primary', type: 'button', style: 'margin-bottom:16px', onClick: newGroup },
            [OC.icon('plus'), 'New group'])
        : null,
      h('h2', { class: 'section-head' }, [
        'All groups',
        h('span', { class: 'chip count' }, groups.length + ' total')
      ]),
      h('div', { class: 'grid-2' }, groups.map(function (g) {
        return h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [
            h('h3', {}, g.name),
            h('span', { class: 'chip ' + (g.status === 'active' ? 'group' : 'custom') + ' push' }, g.status)
          ]),
          h('p', { class: 'muted', style: 'font-size:13.5px;margin:6px 0 10px' }, g.purpose),
          h('div', { class: 'row' }, g.members.map(function (id) {
            var u = OC.store.user(id);
            return h('span', { class: 'chip custom person', title: OC.can.roleLabel(u) },
              [OC.ui.mark(id), u ? u.name : id]);
          })),
          h('div', { class: 'meta muted mono', style: 'font-size:11px;margin-top:10px' },
            'Created by ' + OC.ui.personName(g.created_by) + ' · ' + OC.ui.fmtDate(g.created_at)),
          (g.status === 'active' && (user.admin || g.created_by === user.id))
            ? h('div', { class: 'actions', style: 'margin-top:10px' }, [
                h('button', { class: 'btn small', type: 'button', onClick: function () { archive(g); } }, 'Archive')
              ])
            : null
        ]);
      }))
    ]);
  }

  return { render: render };
})();
