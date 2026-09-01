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

  function invite(onSuccess) {
    var h = OC.ui.h;
    var user = me();
    if (!user || (!user.admin && !OC.can.headOfAny(user))) {
      OC.ui.toast('Access Denied: Only System Admin and Department Heads may send invitations (6.1).', true);
      return;
    }
    var email = h('input', { type: 'email', placeholder: 'name@originate.example' });

    var levelOptions = [
      { value: 'member', label: 'Member' },
      { value: 'head', label: 'Department Head' }
    ];
    if (user && user.admin) {
      levelOptions.push({ value: 'admin', label: 'System Admin' });
    }

    var levelSelect = OC.ui.select(levelOptions, 'member');

    OC.ui.modal({
      title: 'Invite someone',
      content: h('div', {}, [
        OC.ui.field('Email', email, { required: true, hint: 'Receives a single-use 72-hour invite link and password.' }),
        OC.ui.field('Starting level', levelSelect, { required: true, hint: 'Role and permission level for this account (Department and profile can be configured later).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Send invite', primary: true, onClick: function (close) {
            var rawEmail = email.value.trim().toLowerCase();
            if (!/.+@.+\..+/.test(rawEmail)) return 'Enter a valid email address.';

            var prefix = rawEmail.split('@')[0].replace(/[._-]/g, ' ').trim();
            var derivedName = prefix.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) || 'Invited Member';
            var chosenLevel = levelSelect.value || 'member';
            var isAdmin = chosenLevel === 'admin';

            var inv = OC.store.issueInvite(user.id, {
              email: rawEmail,
              name: derivedName,
              department: '',
              level: chosenLevel
            });

            var defaultTitle = isAdmin ? 'System Admin'
              : (chosenLevel === 'head' ? 'Department Head'
              : (chosenLevel === 'lead' ? 'Team Lead' : 'Team Member'));

            var account = {
              id: OC.store.uid('u'),
              name: derivedName,
              email: rawEmail,
              title: defaultTitle,
              admin: isAdmin,
              status: 'invited',
              departments: [],
              prefs: { push: true, email: true, discord: false },
              invite: inv
            };

            OC.store.mutate({
              actor: user.id,
              action: 'user.invite',
              target: account.email,
              detail: 'Invited as ' + chosenLevel.toUpperCase() + ' (department & profile can be assigned later)'
            }, function () {
              OC.store.state.users.push(account);
            });

            dispatchInviteEmail(account, false);
            close();
            if (typeof onSuccess === 'function') {
              try { onSuccess(account); } catch (e) {}
            }
            showInviteSuccessModal(account);
          }
        }
      ]
    });
  }

  function getInviteDetails(account) {
    var base = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'http://localhost:7000';
    var path = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '/';
    var link = base + path + '#claim=' + (account.invite ? account.invite.token : '');
    var pass = account.invite ? account.invite.passcode : '';
    var deptObj = OC.store.department(account.departments && account.departments[0] ? account.departments[0].department : '');
    var deptName = deptObj ? deptObj.name : 'Originate Command';
    var levelName = (account.departments && account.departments[0] && account.departments[0].level)
      ? account.departments[0].level
      : (account.invite && account.invite.level ? account.invite.level : (account.admin ? 'Admin' : 'Member'));
    var levelCap = levelName.charAt(0).toUpperCase() + levelName.slice(1);

    var fullText = [
      'Hello ' + (account.name || 'there') + ',',
      '',
      'You have been invited to join the Originate Command portal (' + (deptObj ? deptName + ' · ' : '') + levelCap + ').',
      '',
      '📧 Gmail: ' + account.email,
      '🔑 72-Hour Password: ' + pass,
      '🔗 72-Hour Invite Link: ' + link,
      '',
      '⏳ Security Notice: Both the link and password are valid for 72 hours.',
      'Upon your first login, this password becomes your permanent password for all future logins.',
      '',
      '© Originate Command — Owner: Abdullah Al Fuad'
    ].join('\n');

    var gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1' +
      '&to=' + encodeURIComponent(account.email) +
      '&su=' + encodeURIComponent('Invitation to join Originate Command workspace') +
      '&body=' + encodeURIComponent(fullText);

    return { link: link, pass: pass, fullText: fullText, gmailUrl: gmailUrl };
  }

  function showInviteSuccessModal(account) {
    var h = OC.ui.h;
    var details = getInviteDetails(account);

    OC.ui.modal({
      title: '🎉 Invite Created for ' + account.name,
      content: h('div', { style: 'font-size:13.5px;' }, [
        h('p', { class: 'muted', style: 'margin-bottom:14px;' },
          'A 72-hour invite link and unique password have been generated for this account.'),
        h('div', { class: 'card', style: 'background:var(--card-bg-alt);border:1px solid var(--rule);padding:14px;margin-bottom:16px;' }, [
          h('p', { style: 'margin:0 0 6px;' }, ['📧 ', h('strong', {}, 'Gmail: '), account.email]),
          h('p', { style: 'margin:0 0 6px;' }, ['🔑 ', h('strong', {}, '72-Hour Password: '), h('span', { class: 'mono', style: 'color:var(--blueprint);font-weight:700;' }, details.pass)]),
          h('p', { style: 'margin:0;word-break:break-all;font-size:12px;' }, ['🔗 ', h('strong', {}, 'Link: '), details.link]),
        ]),
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;' }, [
          h('button', {
            class: 'btn primary',
            type: 'button',
            style: 'display:inline-flex;align-items:center;gap:6px;',
            onClick: function () {
              dispatchInviteEmail(account, true);
            }
          }, [OC.icon('send'), '⚡ Send Email Now']),
          h('a', {
            class: 'btn',
            href: details.gmailUrl,
            target: '_blank',
            style: 'display:inline-flex;align-items:center;gap:6px;text-decoration:none;'
          }, [OC.icon('send'), 'Open in Gmail (Manual)']),
          h('button', {
            class: 'btn',
            type: 'button',
            onClick: function () {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(details.fullText).then(function () {
                  OC.ui.toast('Full invite message copied to clipboard!');
                });
              } else {
                prompt('Copy full message:', details.fullText);
              }
            }
          }, [OC.icon('copy'), 'Copy Full Message']),
          h('button', {
            class: 'btn',
            type: 'button',
            onClick: function () {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(details.pass).then(function () {
                  OC.ui.toast('Password (' + details.pass + ') copied!');
                });
              } else {
                prompt('Copy Passcode:', details.pass);
              }
            }
          }, 'Copy Passcode'),
          h('button', {
            class: 'btn',
            type: 'button',
            onClick: function () {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(details.link).then(function () {
                  OC.ui.toast('Link copied to clipboard!');
                });
              } else {
                prompt('Copy Link:', details.link);
              }
            }
          }, 'Copy Link')
        ])
      ]),
      actions: [
        { label: 'Done', primary: true, onClick: function (close) { close(); } }
      ]
    });
  }

  function getApiEndpoint(endpoint) {
    if (typeof window === 'undefined' || !window.location) return endpoint;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || window.location.port === '7000') {
      return endpoint;
    }
    var cfg = window.OC_CONFIG || window.LGS_CONFIG;
    if (cfg && cfg.API_URL && cfg.API_URL.indexOf('http') === 0) {
      return cfg.API_URL.replace(/\/+$/, '') + endpoint;
    }
    return endpoint;
  }

  function dispatchInviteEmail(account, isResend) {
    var deptObj = OC.store.department(account.departments && account.departments[0] ? account.departments[0].department : '');
    var deptName = deptObj ? deptObj.name : 'Originate Command';
    var levelName = (account.departments && account.departments[0] && account.departments[0].level)
      ? account.departments[0].level
      : (account.invite && account.invite.level ? account.invite.level : (account.admin ? 'Admin' : 'Member'));
    var base = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'http://localhost:7000';

    OC.ui.toast('📧 Dispatching auto-email to ' + account.email + '...');

    if (typeof fetch === 'function') {
      var targetUrl = getApiEndpoint('/api/invites/send-email');
      fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'bypass-tunnel-reminder': 'true'
        },
        body: JSON.stringify({
          to: account.email,
          name: account.name,
          departmentName: deptObj ? deptObj.name : 'Development Operations',
          levelName: levelName,
          token: account.invite ? account.invite.token : '',
          passcode: account.invite ? account.invite.passcode : '',
          appUrl: base
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.ok) {
            OC.ui.toast('🚀 Auto-email successfully delivered to ' + account.email + '!');
          } else {
            OC.ui.toast('⚠️ Mail notice: ' + (data.error || 'Server processed request'));
          }
        })
        .catch(function (err) {
          console.warn('Auto email dispatch warning:', err);
          OC.ui.toast('⚠️ Could not connect to mail server. Use Open in Gmail button.');
        });
    }
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
    if (!user || (!user.admin && !OC.can.headOfAny(user))) {
      OC.ui.toast('Access Denied: Only System Admin and Department Heads can resend invitations.', true);
      return;
    }
    OC.store.mutate({ actor: user.id, action: 'user.invite.resend', target: account.name,
                      detail: 'new single use link and 72-hr password' }, function () {
      account.invite = OC.store.issueInvite(user.id);
    });
    dispatchInviteEmail(account, true);
    showInviteSuccessModal(account);
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
      var pass = account.invite ? account.invite.passcode : 'admin';
      OC.store.mutate({ actor: account.id, action: 'user.invite.claim', target: account.name }, function () {
        if (account.invite) account.invite.claimed_at = new Date().toISOString();
        account.status = 'active';
      });
      if (typeof fetch === 'function' && account.email) {
        fetch(getApiEndpoint('/api/auth/set-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: account.email, password: pass, token: account.invite ? account.invite.token : '' })
        }).catch(function () {});
      }
      OC.ui.toast(account.name + ' is now an active account in MySQL database.');
    });
  }

  function inviteRow(account) {
    var h = OC.ui.h;
    var user = me();
    var expired = OC.store.inviteExpired(account.invite);
    var actions = [];
    var details = getInviteDetails(account);

    if (OC.can.manageInvite(user, account)) {
      if (!expired) {
        actions.push(h('a', {
          class: 'btn primary small',
          href: details.gmailUrl,
          target: '_blank',
          style: 'display:inline-flex;align-items:center;gap:4px;text-decoration:none;'
        }, [OC.icon('send'), 'Open in Gmail']));

        actions.push(h('button', {
          class: 'btn small', type: 'button', onClick: function () {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(details.fullText).then(function () {
                OC.ui.toast('Full invite message copied to clipboard!');
              });
            } else {
              prompt('Copy full message:', details.fullText);
            }
          }
        }, 'Copy Message'));

        actions.push(h('button', {
          class: 'btn small', type: 'button', onClick: function () {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(details.link).then(function () {
                OC.ui.toast('Invite link copied to clipboard!');
              });
            } else {
              prompt('Copy invite link:', details.link);
            }
          }
        }, 'Copy Link'));

        if (account.invite && account.invite.passcode) {
          actions.push(h('button', {
            class: 'btn small', type: 'button', onClick: function () {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(account.invite.passcode).then(function () {
                  OC.ui.toast('72-Hour Password (' + account.invite.passcode + ') copied!');
                });
              } else {
                prompt('Copy 72-Hour Password:', account.invite.passcode);
              }
            }
          }, 'Copy Passcode'));
        }

        actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { claim(account); } }, 'Simulate claim'));
      }
      actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { resend(account); } }, 'Resend'));
      actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { revoke(account); } }, 'Revoke'));
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
      account.invite && account.invite.passcode ? h('p', { style: 'font-size:12.5px;color:var(--blueprint);margin:6px 0 2px;' }, [
        '🔑 72-Hour Password: ',
        h('strong', { class: 'mono', style: 'background:var(--card-bg-alt);padding:2px 6px;border-radius:4px;' }, account.invite.passcode)
      ]) : null,
      h('p', { class: 'mono muted', style: 'font-size:10.5px;margin-top:6px' },
        'Token ' + account.invite.token + ' · expires ' + OC.ui.fmtDate(account.invite.expires_at) + ' (72 hrs)'),
      actions.length ? h('div', { class: 'row', style: 'margin-top:10px;gap:6px;flex-wrap:wrap;' }, actions) : null
    ]);
  }

  /* ---- departments are data, not schema (3.4, 4.1) ----------------------- */
  function newDepartment() {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', placeholder: 'for example: Paid Advertising' });
    var levels = h('input', { type: 'text', value: 'head, member' });
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

  function editDepartment(dept) {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', value: dept.name });
    var levels = h('input', { type: 'text', value: dept.levels.join(', ') });
    var members = OC.store.state.users.filter(function (u) { return OC.can.inDept(u, dept.id); });

    var actions = [
      { label: 'Cancel', onClick: function (close) { close(); } },
      {
        label: 'Save changes', primary: true, onClick: function (close) {
          var newName = name.value.trim();
          if (!newName) return 'Department name cannot be empty.';
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
          var oldName = dept.name;
          OC.store.mutate({
            actor: user.id,
            action: 'department.update',
            target: newName,
            detail: oldName + ' → ' + newName + ' (' + list.join(' → ') + ')'
          }, function () {
            dept.name = newName;
            dept.levels = list;
          });
          OC.ui.toast('Department updated.');
          close();
        }
      }
    ];

    if (members.length === 0 && OC.store.state.departments.length > 1) {
      actions.unshift({
        label: 'Delete department', onClick: function (close) {
          OC.ui.confirm('Delete department "' + dept.name + '"? This cannot be undone.', function () {
            OC.store.mutate({ actor: user.id, action: 'department.delete', target: dept.name }, function () {
              OC.store.state.departments = OC.store.state.departments.filter(function (d) { return d.id !== dept.id; });
            });
            OC.ui.toast('Department deleted.');
            close();
          });
        }
      });
    }

    OC.ui.modal({
      title: 'Edit department: ' + dept.name,
      content: h('div', {}, [
        OC.ui.field('Department name', name, { required: true, hint: 'You can customize or rename this department at any time.' }),
        OC.ui.field('Hierarchy, highest first', levels, { required: true, hint: 'Comma-separated levels (e.g. head, member).' })
      ]),
      actions: actions
    });
  }

  function addPersonToDepartment(dept, onAdded) {
    var h = OC.ui.h;
    var user = me();
    if (!user || !user.admin) {
      OC.ui.toast('Access Denied: Only System Admin may add members to departments.', true);
      return;
    }

    var allUsers = (OC.store.state.users || []).filter(function (u) { return u.status === 'active'; });
    if (!allUsers.length) allUsers = (OC.store.state.users || []).slice();

    var userOptions = allUsers.map(function (u) {
      var currentLevel = OC.can.levelIn(u, dept.id);
      var currentLabel = currentLevel ? ' (Current: ' + currentLevel + ')' : '';
      return { value: u.id, label: u.name + ' <' + u.email + '>' + currentLabel };
    });

    var userSelect = OC.ui.select(userOptions, userOptions[0] ? userOptions[0].value : '');

    var levelOptions = (dept.levels || ['head', 'member']).map(function (lv, idx) {
      return { value: lv, label: (idx + 1) + '. ' + lv.charAt(0).toUpperCase() + lv.slice(1) + (idx === 0 ? ' (Department Head)' : '') };
    });

    var defaultLevel = (dept.levels && dept.levels.length > 1) ? dept.levels[1] : (dept.levels[0] || 'member');
    var levelSelect = OC.ui.select(levelOptions, defaultLevel);

    OC.ui.modal({
      title: 'Add Person to ' + dept.name,
      content: h('div', {}, [
        h('p', { class: 'muted', style: 'font-size:13.5px;margin-bottom:14px;' },
          'Select an employee and assign their authority level in ' + dept.name + '. Only System Admin can add members.'),
        OC.ui.field('Select Employee / Person *', userSelect, { required: true }),
        OC.ui.field('Assign Level in Department *', levelSelect, { required: true, hint: 'Rank 1 is Department Head; lower ranks are Members (3.4).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Add to Department', primary: true, onClick: function (close) {
            var selectedUserId = userSelect.value || (userOptions[0] ? userOptions[0].value : '');
            var selectedLevel = levelSelect.value || defaultLevel;
            var targetUser = OC.store.user(selectedUserId);
            if (!targetUser) return 'Please select a valid user.';

            OC.store.mutate({
              actor: user.id,
              action: 'department.member.assign',
              target: targetUser.name,
              detail: 'Assigned ' + targetUser.name + ' to ' + dept.name + ' as ' + selectedLevel
            }, function () {
              targetUser.departments = targetUser.departments || [];
              var existingIdx = -1;
              for (var i = 0; i < targetUser.departments.length; i++) {
                if (targetUser.departments[i].department === dept.id) {
                  existingIdx = i;
                  break;
                }
              }
              if (existingIdx > -1) {
                targetUser.departments[existingIdx].level = selectedLevel;
              } else {
                targetUser.departments.push({ department: dept.id, level: selectedLevel });
              }
            });

            OC.ui.toast('✅ Added ' + targetUser.name + ' to ' + dept.name + ' as ' + selectedLevel + '.');
            close();
            if (typeof onAdded === 'function') onAdded();
          }
        }
      ]
    });
  }

  function editClient(client) {
    var h = OC.ui.h;
    var user = me();
    var clientId = h('input', { type: 'text', value: client.client_id || '' });
    var clientCode = h('input', { type: 'text', value: client.client_code || '' });
    var name = h('input', { type: 'text', value: client.name || '' });
    var contact = h('input', { type: 'text', value: client.contact || client.name });
    var status = OC.ui.select([
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' }
    ], client.status || 'active');

    var currentLabel = OC.ui.clientLabel ? OC.ui.clientLabel(client) : client.name;

    OC.ui.modal({
      title: 'Edit client: ' + currentLabel,
      content: h('div', {}, [
        OC.ui.field('Client ID', clientId, { hint: 'Unique client identifier or account number (optional).' }),
        OC.ui.field('Client code', clientCode, { hint: 'Short ticker or abbreviation code (optional).' }),
        OC.ui.field('Client / Company name', name, { required: true }),
        OC.ui.field('Primary contact', contact, { hint: 'Contact person name.' }),
        OC.ui.field('Status', status)
      ]),
      actions: [
        {
          label: 'Delete client', onClick: function (close) {
            OC.ui.confirm('Delete client "' + client.name + '"? Existing tasks will remain.', function () {
              OC.store.mutate({ actor: user.id, action: 'client.delete', target: client.name }, function () {
                OC.store.state.clients = OC.store.state.clients.filter(function (c) { return c.id !== client.id; });
              });
              OC.ui.toast('Client deleted.');
              close();
            });
          }
        },
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Save', primary: true, onClick: function (close) {
            if (!name.value.trim()) return 'Client name cannot be empty.';
            OC.store.mutate({
              actor: user.id, action: 'client.update', target: name.value.trim(),
              detail: 'Updated details for ' + client.name
            }, function () {
              client.client_id = clientId.value.trim();
              client.client_code = clientCode.value.trim();
              client.name = name.value.trim();
              client.contact = contact.value.trim() || client.name;
              client.status = status.value;
            });
            OC.ui.toast('Client updated.');
            close();
          }
        }
      ]
    });
  }

  function editAccount(account) {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', value: account.name });
    var email = h('input', { type: 'email', value: account.email });
    var title = h('input', { type: 'text', value: account.title });
    var isAdmin = h('input', { type: 'checkbox', checked: account.admin });

    var currentDept = (account.departments && account.departments[0]) ? account.departments[0].department : '';
    var currentLevel = (account.departments && account.departments[0]) ? account.departments[0].level : '';

    var allowedDepts = user.admin
      ? OC.store.state.departments
      : OC.store.state.departments.filter(function (d) { return OC.can.isHead(user, d.id); });

    var deptOptions = [{ value: '', label: 'None (Independent)' }].concat(
      allowedDepts.map(function (d) { return { value: d.id, label: d.name }; })
    );

    var deptSelect = OC.ui.select(deptOptions, currentDept);
    var levelSelect = OC.ui.select([], '');

    function refreshLevels() {
      var d = OC.store.department(deptSelect.value);
      OC.ui.clear(levelSelect);
      if (!d) {
        levelSelect.appendChild(h('option', { value: '' }, 'N/A'));
        return;
      }
      d.levels.forEach(function (lv) {
        var opt = h('option', { value: lv }, lv);
        if (lv === currentLevel) opt.selected = true;
        levelSelect.appendChild(opt);
      });
    }
    deptSelect.addEventListener('change', refreshLevels);
    refreshLevels();

    var statusSelect = OC.ui.select([
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' }
    ], account.status || 'active');

    var uploader = OC.ui.photoUploader(account.avatar, account.name);

    var actions = [
      { label: 'Cancel', onClick: function (close) { close(); } },
      {
        label: '🚀 Open Employee Portal', onClick: function (close) {
          close();
          if (OC.profilePortal && OC.profilePortal.openForUser) {
            OC.profilePortal.openForUser(account);
          }
        }
      },
      {
        label: 'Save account', primary: true, onClick: function (close) {
          if (!name.value.trim()) return 'Name cannot be empty.';
          if (!/.+@.+\..+/.test(email.value)) return 'Enter a valid email address.';

          OC.store.mutate({
            actor: user.id, action: 'user.update', target: name.value.trim(),
            detail: 'Updated profile for ' + account.name
          }, function () {
            account.name = name.value.trim();
            account.email = email.value.trim();
            account.avatar = uploader.getValue();
            account.title = title.value.trim() || 'Team Member';
            if (user.admin) {
              account.admin = isAdmin.checked;
            }
            account.status = statusSelect.value;
            if (deptSelect.value && levelSelect.value) {
              account.departments = [{ department: deptSelect.value, level: levelSelect.value }];
            } else if (user.admin && !deptSelect.value) {
              account.departments = [];
            }
          });
          OC.ui.toast('Account updated successfully.');
          close();
        }
      }
    ];

    if (OC.can.deleteAccount(user, account)) {
      actions.unshift({
        label: 'Delete account', onClick: function (close) {
          OC.ui.confirm('Delete account "' + account.name + '"? This user will be permanently removed and cannot log in.', function () {
            OC.store.mutate({ actor: user.id, action: 'user.delete', target: account.name }, function () {
              OC.store.state.users = OC.store.state.users.filter(function (u) { return u.id !== account.id; });
            });
            OC.ui.toast('Account permanently deleted.');
            close();
          });
        }
      });
    }

    var fields = [
      OC.ui.field('Profile photo', uploader.node, { hint: 'Custom profile picture or photo URL.' }),
      OC.ui.field('Full name', name, { required: true }),
      OC.ui.field('Email address', email, { required: true }),
      OC.ui.field('Job title', title)
    ];

    if (user && user.admin) {
      fields.push(OC.ui.field('Department (System Admin Only)', deptSelect));
      fields.push(OC.ui.field('Department level (System Admin Only)', levelSelect));
    }

    fields.push(OC.ui.field('Status', statusSelect));

    if (user && user.admin && account.id !== user.id) {
      fields.push(h('label', { class: 'checkline', style: 'margin-top:12px;' }, [isAdmin, ' Grant System Admin superuser access']));
    }

    OC.ui.modal({
      title: 'Edit account: ' + account.name,
      content: h('div', {}, fields),
      actions: actions
    });
  }

  function render(host) {
    var h = OC.ui.h;
    var user = me();
    // Only System Admins or the person who issued the invite can see and manage pending invites (6.1)
    var pending = OC.store.state.users.filter(function (u) {
      return u.status === 'invited' && u.invite && !u.invite.claimed_at && OC.can.manageInvite(user, u);
    });
    var canEditAny = OC.store.state.users.some(function (u) { return OC.can.editAccount(user, u); });

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, 'People and departments'),
        h('p', {}, 'Departments are data, not schema — any department can be renamed, customized, or added without development work (4.1). ' +
          'System Admin and Department Heads can edit, manage, and delete member accounts directly.')
      ]),

      h('div', { class: 'row', style: 'margin-bottom:16px' }, [
        OC.can.invite(user)
          ? h('button', { class: 'btn primary', type: 'button', onClick: invite }, [OC.icon('plus'), 'Invite someone'])
          : h('p', { class: 'muted' }, 'Invites are sent by the system admin or a department head (6.1).'),
        OC.can.createClient(user)
          ? h('button', { class: 'btn', type: 'button', onClick: function () { OC.ui.newClientModal(function () { render(host); }); } }, [OC.icon('plus'), 'Add client'])
          : null,
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

      h('div', { class: 'row', style: 'align-items:center;margin-top:20px;' }, [
        h('h2', { class: 'section-head', style: 'margin:0;' }, [
          'Clients & Accounts',
          h('span', { class: 'chip count' }, OC.store.state.clients.length + ' total')
        ]),
        OC.can.createClient(user)
          ? h('button', { class: 'btn small push', type: 'button', onClick: function () { OC.ui.newClientModal(function () { render(host); }); } }, [OC.icon('plus'), 'New client'])
          : null
      ]),
      OC.store.state.clients.length ? h('div', { class: 'grid-2', style: 'margin:12px 0 22px' }, OC.store.state.clients.map(function (c) {
        var clientTodos = OC.store.state.todos.filter(function (t) {
          return !t.archived && t.state !== 'done' && (t.client === c.id || (Array.isArray(t.clients) && t.clients.indexOf(c.id) > -1));
        });
        var displayTitle = OC.ui.clientLabel ? OC.ui.clientLabel(c) : c.name;
        return h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [
            h('h3', {}, displayTitle),
            h('span', { class: 'chip ' + (c.status === 'active' ? 'dept' : 'custom') + ' push' }, c.status)
          ]),
          h('p', { class: 'muted', style: 'font-size:13px;margin:6px 0 10px;' }, 'Primary contact: ' + (c.contact || c.name)),
          h('div', { class: 'row', style: 'font-size:12.5px' }, [
            h('span', { class: 'chip count' }, clientTodos.length + ' active tasks'),
            OC.can.createClient(user)
              ? h('button', { class: 'btn small push', type: 'button', onClick: function () { editClient(c); } }, 'Edit client')
              : null
          ])
        ]);
      })) : h('div', { class: 'card', style: 'margin:12px 0 22px;text-align:center;padding:24px;' }, [
        h('p', { class: 'muted', style: 'margin-bottom:12px;' }, 'No clients registered yet. Admin and Department Heads can add custom clients (5.2).'),
        OC.can.createClient(user)
          ? h('button', { class: 'btn primary small', type: 'button', onClick: function () { OC.ui.newClientModal(function () { render(host); }); } }, [OC.icon('plus'), 'Add your first client'])
          : null
      ]),

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
            ? h('div', { class: 'row', style: 'margin-bottom:10px;gap:8px;' }, [
                h('button', { class: 'btn small', type: 'button', onClick: function () { editDepartment(d); } }, 'Edit department'),
                (user && user.admin)
                  ? h('button', {
                      class: 'btn small primary', type: 'button',
                      style: 'background:#2563eb;border-color:#2563eb;color:#fff;font-weight:600;',
                      onClick: function () { addPersonToDepartment(d, function () { render(host); }); }
                    }, [OC.icon('plus'), 'Add person'])
                  : null
              ].filter(Boolean))
            : null,
          h('div', { class: 'stack' }, members.length ? members.map(function (u) {
            return h('div', { class: 'row', style: 'font-size:13.5px;align-items:center;' }, [
              OC.ui.person(u.id),
              h('span', { class: 'chip role push' }, OC.can.levelIn(u, d.id)),
              u.status === 'invited' ? h('span', { class: 'chip overdue' }, 'invited') : null,
              OC.can.editAccount(user, u)
                ? h('button', {
                    class: 'btn small',
                    type: 'button',
                    style: 'padding:2px 8px;font-size:11.5px;margin-left:6px;',
                    onClick: function () {
                      if (OC.profilePortal && OC.profilePortal.openForUser) {
                        OC.profilePortal.openForUser(u);
                      } else {
                        editAccount(u);
                      }
                    }
                  }, 'Edit')
                : null
            ]);
          }) : [h('p', { class: 'muted', style: 'font-size:12.5px;' }, 'No members yet.')])
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
            h('th', { scope: 'col' }, 'Status'),
            canEditAny ? h('th', { scope: 'col', style: 'text-align:right;' }, 'Actions') : null
          ].filter(Boolean))),
          h('tbody', {}, OC.store.state.users.map(function (u) {
            return h('tr', {}, [
              h('th', { scope: 'row' }, OC.ui.person(u.id)),
              h('td', { class: 'muted' }, u.title),
              h('td', {}, h('span', { class: 'chip role' }, OC.can.roleLabel(u))),
              h('td', {}, u.departments.length
                ? u.departments.map(function (m) {
                    return h('span', { class: 'chip custom', style: 'margin-right:4px' },
                      (OC.store.department(m.department) || {}).name + ' · ' + m.level);
                  })
                : h('span', { class: 'muted' }, 'leadership tier, every department')),
              h('td', { class: 'mono' }, u.status),
              canEditAny ? h('td', { style: 'text-align:right;' }, [
                OC.can.editAccount(user, u)
                  ? h('button', {
                      class: 'btn small',
                      type: 'button',
                      onClick: function () {
                        if (OC.profilePortal && OC.profilePortal.openForUser) {
                          OC.profilePortal.openForUser(u);
                        } else {
                          editAccount(u);
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
  }

  return {
    render: render,
    invite: invite,
    newDepartment: newDepartment,
    editPrefs: editPrefs,
    editDepartment: editDepartment,
    addPersonToDepartment: addPersonToDepartment,
    editClient: editClient,
    editAccount: editAccount,
    getApiEndpoint: getApiEndpoint,
    dispatchInviteEmail: dispatchInviteEmail
  };
})();
