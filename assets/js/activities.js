/* =========================================================================
   activities.js — team activities & organizational hub (4.1, 4.2, 6.1, 6.5)
   Unified workspace combining cross-department groups, discussions,
   departments, member accounts, and pending invites onto a single page.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.activities = (function () {
  'use strict';

  var activeTab = 'all'; /* all | groups | departments | accounts | invites */
  var groupSearchQuery = '';
  var groupFilterStatus = 'all'; /* all | active | archived | mine */

  function me() { return OC.store.user(OC.store.session()); }

  function render(host, rerender) {
    var h = OC.ui.h;
    var user = me();

    var allGroups = OC.store.state.groups || [];
    var myGroups = allGroups.filter(function (g) { return (g.members || []).indexOf(user.id) > -1; });
    var activeGroups = allGroups.filter(function (g) { return g.status === 'active'; });

    var depts = OC.store.state.departments || [];
    var users = OC.store.state.users || [];
    var pending = users.filter(function (u) {
      return u.status === 'invited' && u.invite && !u.invite.claimed_at && OC.can.manageInvite(user, u);
    });

    var canCreateGroup = !!(OC.can && OC.can.createGroup ? OC.can.createGroup(user) : (user && user.admin));
    var canInvite = !!(OC.can && OC.can.invite ? OC.can.invite(user) : (user && user.admin));
    var canManageDept = !!(OC.can && OC.can.manageDepartments ? OC.can.manageDepartments(user) : (user && user.admin));
    var canEditAnyAccount = users.some(function (u) { return OC.can && OC.can.editAccount && OC.can.editAccount(user, u); });

    OC.ui.clear(host);

    /* ---- 1. Page Header ---- */
    var pageHead = h('div', { class: 'page-head' }, [
      h('h1', {}, 'Activities'),
      h('p', {}, 'Centralized team collaboration & organization hub: cross-department groups, live discussions, departments, member accounts, and pending invites.')
    ]);

    /* ---- 2. Quick Action Buttons Bar ---- */
    var topActions = h('div', { class: 'activities-toolbar', style: 'margin-bottom:18px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;' }, [
      canCreateGroup
        ? h('button', {
            class: 'btn primary', type: 'button',
            onClick: function () {
              if (OC.groups && OC.groups.newGroup) {
                OC.groups.newGroup(function () { render(host, rerender); });
              }
            }
          }, [OC.icon('plus'), 'New group'])
        : null,
      canInvite
        ? h('button', {
            class: 'btn', type: 'button',
            onClick: function () {
              if (OC.people && OC.people.invite) {
                OC.people.invite(function () { render(host, rerender); });
              }
            }
          }, [OC.icon('plus'), 'Invite member'])
        : null,
      canManageDept
        ? h('button', {
            class: 'btn', type: 'button',
            onClick: function () {
              if (OC.people && OC.people.newDepartment) {
                OC.people.newDepartment(function () { render(host, rerender); });
              }
            }
          }, [OC.icon('plus'), 'New department'])
        : null,
      h('button', {
        class: 'btn', type: 'button',
        onClick: function () {
          if (OC.people && OC.people.editPrefs) OC.people.editPrefs();
        }
      }, [OC.icon('bell'), 'Notification preferences'])
    ].filter(Boolean));

    /* ---- 3. Sub-navigation tabs ---- */
    var tabs = [
      ['all', 'All Overview'],
      ['departments', 'Departments & Groups (' + (depts.length + allGroups.length) + ')'],
      ['accounts', 'Team Accounts (' + users.length + ')'],
      ['reports', 'Work Reports & Analytics']
    ];
    if (pending.length) {
      tabs.push(['invites', 'Pending Invites (' + pending.length + ')']);
    }

    var subNav = h('div', {
      class: 'segmented activities-tabs',
      role: 'group',
      'aria-label': 'Filter Activities section',
      style: 'margin-bottom:24px;flex-wrap:wrap;'
    }, tabs.map(function (opt) {
      return h('button', {
        type: 'button',
        'aria-pressed': String(activeTab === opt[0]),
        onClick: function () {
          activeTab = opt[0];
          render(host, rerender);
        }
      }, opt[1]);
    }));

    var content = [pageHead, topActions, subNav];

    /* ---- Section A: Departments & Cross-Department Groups ---- */
    if (activeTab === 'all' || activeTab === 'departments') {
      var deptSection = h('div', { class: 'activities-section', id: 'activities-depts-sec', style: 'margin-bottom:32px;' }, [
        h('div', { class: 'row', style: 'align-items:center;margin-bottom:12px;' }, [
          h('h2', { class: 'section-head', style: 'margin:0;' }, [
            'Departments',
            h('span', { class: 'chip count' }, depts.length + ' total')
          ]),
          canManageDept
            ? h('button', {
                class: 'btn small push', type: 'button',
                onClick: function () {
                  if (OC.people && OC.people.newDepartment) {
                    OC.people.newDepartment(function () { render(host, rerender); });
                  }
                }
              }, [OC.icon('plus'), 'New department'])
            : null
        ]),
        h('div', { class: 'grid-2', style: 'margin-top:12px;margin-bottom:28px;' }, depts.map(function (d) {
          var members = users.filter(function (u) { return OC.can && OC.can.inDept && OC.can.inDept(u, d.id); });
          return h('div', { class: 'card' }, [
            h('div', { class: 'row' }, [
              h('h3', {}, d.name),
              h('span', { class: 'chip custom push' }, members.length + ' people')
            ]),
            h('div', { class: 'row', style: 'margin:8px 0 10px;gap:6px;flex-wrap:wrap;' }, (d.levels || []).map(function (lv, i) {
              return h('span', { class: 'chip ' + (i === 0 ? 'dept' : 'custom') }, (i + 1) + '. ' + lv);
            })),
            canManageDept
              ? h('div', { class: 'row', style: 'margin-bottom:10px;gap:8px;' }, [
                  h('button', {
                    class: 'btn small', type: 'button',
                    onClick: function () {
                      if (OC.people && OC.people.editDepartment) {
                        OC.people.editDepartment(d);
                      }
                    }
                  }, 'Edit department')
                ])
              : null,
            h('div', { class: 'stack' }, members.length ? members.map(function (u) {
              return h('div', { class: 'row', style: 'font-size:13.5px;align-items:center;' }, [
                OC.ui.person(u.id),
                h('span', { class: 'chip role push' }, OC.can.levelIn(u, d.id)),
                u.status === 'invited' ? h('span', { class: 'chip overdue' }, 'invited') : null,
                (OC.can && OC.can.editAccount && OC.can.editAccount(user, u))
                  ? h('button', {
                      class: 'btn small', type: 'button',
                      style: 'padding:2px 8px;font-size:11.5px;margin-left:6px;',
                      onClick: function () {
                        if (OC.people && OC.people.editAccount) {
                          OC.people.editAccount(u);
                        }
                      }
                    }, 'Edit')
                  : null
              ]);
            }) : [h('p', { class: 'muted', style: 'font-size:12.5px;' }, 'No members yet.')])
          ]);
        }))
      ]);

      // Cross-Department Groups & Discussions embedded inside Department section
      var groupsSection = h('div', { class: 'activities-section', id: 'activities-groups-sec', style: 'margin-bottom:32px;' }, [
        h('div', { class: 'row', style: 'align-items:center;margin-bottom:12px;' }, [
          h('h2', { class: 'section-head', style: 'margin:0;' }, [
            'Cross-Department Groups & Teams',
            h('span', { class: 'chip count' }, allGroups.length + ' total')
          ])
        ])
      ]);
      var groupsHost = h('div', { class: 'groups-sub-host' });
      if (OC.groups && OC.groups.render) {
        OC.groups.render(groupsHost, function () { render(host, rerender); }, true);
      }
      groupsSection.appendChild(groupsHost);
      deptSection.appendChild(groupsSection);
      content.push(deptSection);
    }

    /* ---- Section B: Team Accounts Directory ---- */
    if (activeTab === 'all' || activeTab === 'accounts') {
      var accountsSection = h('div', { class: 'activities-section', style: 'margin-bottom:32px;' }, [
        h('div', { class: 'row', style: 'align-items:center;margin-bottom:12px;' }, [
          h('h2', { class: 'section-head', style: 'margin:0;' }, [
            'Team Accounts Directory',
            h('span', { class: 'chip count' }, users.length + ' accounts')
          ]),
          canInvite
            ? h('button', {
                class: 'btn small push', type: 'button',
                onClick: function () {
                  if (OC.people && OC.people.invite) {
                    OC.people.invite(function () { render(host, rerender); });
                  }
                }
              }, [OC.icon('plus'), 'Invite member'])
            : null
        ]),
        h('div', { class: 'tablewrap' }, [
          h('table', {}, [
            h('caption', {}, 'Accounts'),
            h('thead', {}, h('tr', {}, [
              h('th', { scope: 'col' }, 'Name'),
              h('th', { scope: 'col' }, 'Title'),
              h('th', { scope: 'col' }, 'Role'),
              h('th', { scope: 'col' }, 'Departments'),
              h('th', { scope: 'col' }, 'Status'),
              canEditAnyAccount ? h('th', { scope: 'col', style: 'text-align:right;' }, 'Actions') : null
            ].filter(Boolean))),
            h('tbody', {}, users.map(function (u) {
              return h('tr', {}, [
                h('th', { scope: 'row' }, OC.ui.person(u.id)),
                h('td', { class: 'muted' }, u.title || '—'),
                h('td', {}, h('span', { class: 'chip role' }, OC.can.roleLabel(u))),
                h('td', {}, (u.departments && u.departments.length)
                  ? u.departments.map(function (m) {
                      return h('span', { class: 'chip custom', style: 'margin-right:4px' },
                        (OC.store.department(m.department) || {}).name + ' · ' + m.level);
                    })
                  : h('span', { class: 'muted' }, 'leadership tier, every department')),
                h('td', { class: 'mono' }, u.status || 'active'),
                canEditAnyAccount ? h('td', { style: 'text-align:right;' }, [
                  (OC.can && OC.can.editAccount && OC.can.editAccount(user, u))
                    ? h('button', {
                        class: 'btn small', type: 'button',
                        onClick: function () {
                          if (OC.people && OC.people.editAccount) {
                            OC.people.editAccount(u);
                          }
                        }
                      }, 'Edit')
                    : null
                ]) : null
              ].filter(Boolean));
            }))
          ])
        ])
      ]);
      content.push(accountsSection);
    }

    /* ---- Section C: Work Reports & Analytics ---- */
    if (activeTab === 'all' || activeTab === 'reports') {
      var reportsSection = h('div', { class: 'activities-section', id: 'activities-reports-sec', style: 'margin-bottom:32px;' }, [
        h('div', { class: 'row', style: 'align-items:center;margin-bottom:12px;' }, [
          h('h2', { class: 'section-head', style: 'margin:0;' }, 'Work Reports & Analytics')
        ])
      ]);
      var reportsHost = h('div', { class: 'reports-sub-host' });
      if (OC.reports && OC.reports.render) {
        OC.reports.render(reportsHost, function () { render(host, rerender); }, true);
      }
      reportsSection.appendChild(reportsHost);
      content.push(reportsSection);
    }

    /* ---- Section D: Pending Invites (if any) ---- */
    if ((activeTab === 'all' || activeTab === 'invites') && pending.length) {
      var invitesSection = h('div', { class: 'activities-section', style: 'margin-bottom:32px;' }, [
        h('h2', { class: 'section-head' }, [
          'Pending Invites',
          h('span', { class: 'chip count' }, pending.length + ' awaiting')
        ]),
        h('p', { class: 'muted', style: 'font-size:13.5px;margin-bottom:12px;max-width:74ch;' },
          'Single-use links that expire 72 hours after issue. Unclaimed invites can be resent or revoked by whoever sent them or system admin.'
        )
      ]);

      var invitesGrid = h('div', { class: 'grid-2' }, pending.map(function (u) {
        var inv = u.invite;
        return h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [
            h('h3', {}, u.name),
            h('span', { class: 'chip overdue push' }, 'unclaimed')
          ]),
          h('p', { class: 'muted', style: 'font-size:13px;margin:6px 0 10px;' }, 'Email: ' + u.email + ' · ' + u.title),
          h('div', { class: 'row', style: 'font-size:12.5px;align-items:center;' }, [
            h('span', { class: 'chip custom' }, 'Expires ' + OC.ui.fmtWhen(inv.expires_at)),
            h('button', {
              class: 'btn small push', type: 'button',
              onClick: function () {
                var link = location.origin + location.pathname + '#claim=' + inv.token;
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(link);
                  OC.ui.toast('Invite link copied to clipboard.');
                } else {
                  OC.ui.toast('Token: ' + inv.token);
                }
              }
            }, 'Copy link'),
            h('button', {
              class: 'btn small danger', type: 'button', style: 'margin-left:6px;',
              onClick: function () {
                OC.ui.confirm('Revoke invite for ' + u.name + '?', function () {
                  OC.store.mutate({ actor: user.id, action: 'invite.revoke', target: u.name }, function () {
                    OC.store.state.users = OC.store.state.users.filter(function (x) { return x.id !== u.id; });
                  });
                  OC.ui.toast('Invite revoked.');
                  render(host, rerender);
                });
              }
            }, 'Revoke')
          ])
        ]);
      }));

      invitesSection.appendChild(invitesGrid);
      content.push(invitesSection);
    }

    OC.ui.append(host, content);
  }

  return {
    render: render
  };
})();
