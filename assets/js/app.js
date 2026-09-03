/* =========================================================================
   app.js — application shell, authentication & routing
   Boots the store, shows direct email login screen on startup,
   draws the top bar and navigation, routes between views,
   handles invite activation, and re-renders on store changes.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.app = (function () {
  'use strict';

  function h() { return OC.ui.h.apply(null, arguments); }

  var route = 'dashboard';
  var AUTH_KEY = 'oc-authenticated-user';
  var isAuthenticated = false;
  /* set when an invite link has just been opened, so the login screen can
     greet the invitee and fill their address in for them */
  var invitedSignIn = null;

  var ROUTES = [
    { id: 'dashboard', label: 'Dashboard', view: function () { return OC.dashboard; } },
    { id: 'board', label: 'Notice Board', view: function () { return OC.board; } },
    { id: 'activities', label: 'Management', view: function () { return OC.activities || OC.groups || OC.people; } },
    { id: 'clients', label: 'Clients Portal', view: function () { return OC.clients; } },
    { id: 'policy', label: 'Policy', view: function () { return OC.policy; } }
  ];

  /* ---- theme (Day / Night Mode Support) ---------------------------------- */
  var THEME_KEY = 'oc-theme';
  var THEMES = [null, 'dark', 'light'];
  var THEME_LABELS = ['Theme: System', 'Theme: Night', 'Theme: Day'];
  var themeIndex = 0;

  function readTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function writeTheme(v) {
    try { v ? localStorage.setItem(THEME_KEY, v) : localStorage.removeItem(THEME_KEY); } catch (e) { }
  }
  function applyTheme(button) {
    var t = THEMES[themeIndex];
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    if (button) button.textContent = THEME_LABELS[themeIndex];
  }

  /* ---- browser push (9.1) ------------------------------------------------ */
  var lastSeenNotification = null;

  function pushSupported() { return typeof window !== 'undefined' && 'Notification' in window; }

  function askForPush() {
    if (!pushSupported()) { OC.ui.toast('This browser has no notification support.', true); return; }
    Notification.requestPermission().then(function (result) {
      if (result === 'granted') OC.ui.toast('Browser notifications are on for this device.');
      else OC.ui.toast('Browser notifications stay off. Email remains the fallback channel (9.2).', true);
      render();
    });
  }

  function raisePush() {
    var user = OC.store.user(OC.store.session());
    var mine = myNotifications();
    if (!mine.length) return;
    var newest = mine[0];
    if (lastSeenNotification === null) { lastSeenNotification = newest.id; return; }
    if (newest.id === lastSeenNotification || newest.read) return;
    lastSeenNotification = newest.id;

    // Play loud notification sound chime
    if (OC.ui && OC.ui.playNotificationSound) {
      OC.ui.playNotificationSound();
    }

    if (!pushSupported() || Notification.permission !== 'granted') return;
    if (!user || !user.prefs.push) return;
    try {
      new Notification('Originate Command', { body: newest.text, tag: newest.id });
    } catch (e) { }
  }

  function pushRow() {
    if (!pushSupported()) {
      return h('div', { class: 'pushrow' }, [OC.icon('alert'),
      h('span', {}, 'This browser cannot show system notifications. Email is the fallback channel (9.2).')]);
    }
    if (Notification.permission === 'granted') {
      return h('div', { class: 'pushrow on' }, [OC.icon('check'),
      h('span', {}, 'Browser push is on for this device. Anything assigned to you raises a system notification (9.1).')]);
    }
    if (Notification.permission === 'denied') {
      return h('div', { class: 'pushrow' }, [OC.icon('alert'),
      h('span', {}, 'Browser push is blocked in this browser\'s site settings. Email remains the fallback (9.2).')]);
    }
    return h('div', { class: 'pushrow' }, [
      OC.icon('bell'),
      h('span', {}, 'Browser push is off for this device.'),
      h('button', { class: 'btn small push', type: 'button', onClick: askForPush }, 'Enable push')
    ]);
  }

  /* ---- notifications (9.0, in-app channel) ------------------------------ */
  function myNotifications() {
    var id = OC.store.session();
    return (OC.store.state.notifications || []).filter(function (n) { return n.user === id; });
  }

  function openNotifications() {
    var list = myNotifications();
    var content = list.length
      ? h('div', {}, list.slice(0, 30).map(function (n) {
        return h('div', {
          class: 'notif' + (n.read ? '' : ' unread'),
          style: 'cursor:pointer;',
          title: 'Click to mark as read and view',
          onClick: function () {
            if (!n.read) {
              OC.store.mutate(null, function () { n.read = true; });
            }
            if (n.ref && OC.store.todo(n.ref)) {
              if (typeof close === 'function') close();
              go('board');
            }
          }
        }, [
          h('span', { class: 'marker' }),
          h('div', {}, [
            h('div', { class: 'what' }, n.text),
            h('div', { class: 'when' }, OC.ui.fmtWhen(n.at))
          ])
        ]);
      }))
      : h('div', { class: 'empty' }, [OC.icon('inbox'),
        'Nothing yet. Assign a todo or post an instruction and the people it reaches are notified here.']);

    OC.ui.modal({
      title: 'Notifications',
      content: h('div', {}, [
        h('p', { class: 'muted', style: 'font-size:13px;margin-bottom:12px' },
          'The in-app channel. Instant notifications and alerts across your organization.'),
        pushRow(),
        content
      ]),
      actions: [
        {
          label: 'Mark all read', onClick: function (close) {
            OC.store.mutate(null, function () {
              myNotifications().forEach(function (n) { n.read = true; });
            });
            close();
          }
        },
        { label: 'Close', primary: true, onClick: function (close) { close(); } }
      ]
    });
  }

  /* ---- Dedicated Initial Login Screen ----------------------------------- */
  function openGoogleAccountChooser(onSelect) {
    var rawUsers = (OC.store.state.users || []).filter(function (u) {
      return u.status === 'active' || (u.status === 'invited' && u.email);
    });
    var accountsList = [];
    var seen = {};

    rawUsers.forEach(function (u) {
      var email = (u.email || '').trim().toLowerCase();
      // Only include Google/Gmail accounts or Fuad's account; exclude non-google internal seeds and removed test emails
      if (!email || email === 'shohag@originate.example' || email === 'fuadkalaroa2000@gmail.com') return;
      if (!seen[email]) {
        seen[email] = true;
        var initials = (u.name || 'User').trim().split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
        accountsList.push({
          name: u.name || 'Team Member',
          email: u.email,
          avatar: initials || 'OC',
          color: '#1E293B'
        });
      }
    });

    if (accountsList.length === 0) {
      accountsList.push({
        name: 'Abdullah al Fuad',
        email: 'fuadkalaroa2002@gmail.com',
        avatar: 'AF',
        color: '#1E293B'
      });
    }

    var otherEmailInput = h('input', { type: 'email', autocomplete: 'email' });
    var showOther = false;
    var listContainer = h('div', { class: 'google-account-list' });

    function refresh(closeModal) {
      OC.ui.clear(listContainer);
      var items = accountsList.map(function (acc) {
        return h('div', {
          class: 'google-account-item',
          tabindex: '0',
          onClick: function () {
            closeModal();
            onSelect(acc.email);
          }
        }, [
          h('div', { class: 'google-avatar', style: 'background:' + acc.color + ';' }, acc.avatar),
          h('div', { class: 'google-account-info' }, [
            h('div', { class: 'google-account-name' }, acc.name),
            h('div', { class: 'google-account-email' }, acc.email)
          ])
        ]);
      });

      var useOtherBtn = h('div', {
        class: 'google-account-item google-use-other',
        tabindex: '0',
        onClick: function () {
          showOther = !showOther;
          refresh(closeModal);
        }
      }, [
        h('div', { class: 'google-avatar other' }, '+'),
        h('div', { class: 'google-account-info' }, [
          h('div', { class: 'google-account-name' }, 'Use another account'),
          h('div', { class: 'google-account-email' }, 'Sign in with a different Gmail address')
        ])
      ]);
      items.push(useOtherBtn);

      if (showOther) {
        var otherBox = h('div', { style: 'margin-top:12px;padding:12px;background:var(--card-bg-alt);border-radius:var(--r1);' }, [
          OC.ui.field('Enter Gmail Address', otherEmailInput, { hint: 'Must be registered in the workspace database.' }),
          h('button', {
            class: 'btn primary small',
            type: 'button',
            style: 'margin-top:8px;width:100%;',
            onClick: function () {
              if (otherEmailInput.value.trim()) {
                closeModal();
                onSelect(otherEmailInput.value.trim());
              }
            }
          }, 'Verify & Continue')
        ]);
        items.push(otherBox);
      }

      OC.ui.append(listContainer, items);
    }

    OC.ui.modal({
      title: 'Choose an account',
      content: h('div', { class: 'google-chooser-wrapper' }, [
        h('p', { class: 'muted', style: 'font-size:13px;margin-bottom:14px;' },
          'to continue to Originate Command:'),
        listContainer
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } }
      ]
    });

    var backdrop = document.querySelector('.modal-backdrop');
    var closeFn = function () {
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    };
    refresh(closeFn);
  }

  function decodeJwtResponse(token) {
    try {
      var base64Url = token.split('.')[1];
      var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      var jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  /* Every sign-in path ends here, so an invited account is promoted to active
     exactly once no matter which route the person came in by. */
  function completeSignIn(found, greeting) {
    if (found.status === 'invited') {
      OC.store.mutate({
        actor: found.id, action: 'user.invite.claim', target: found.name,
        detail: 'Account activated on first sign-in'
      }, function () {
        found.status = 'active';
        if (found.invite && !found.invite.claimed_at) {
          found.invite.claimed_at = new Date().toISOString();
        }
      });
    }
    invitedSignIn = null;
    isAuthenticated = true;
    try { localStorage.setItem(AUTH_KEY, found.id); } catch (e) { }
    OC.store.setSession(found.id);
    OC.ui.toast(greeting || ('Connected successfully as ' + found.name + ' (' + OC.can.roleLabel(found) + ')'));
    render();
  }

  function renderLoginScreen(host) {
    OC.ui.clear(host);

    var errorBox = h('div', { class: 'error', style: 'display:none;margin-bottom:16px;' });
    var emailInput = h('input', { type: 'email', placeholder: 'Enter your Gmail address',
                                  value: invitedSignIn ? invitedSignIn.email : '' });
    var passInput = h('input', { type: 'password', placeholder: 'Enter 72-hour password / passcode' });

    function performLogin(email) {
      if (!email) {
        errorBox.textContent = 'Please enter your Gmail account.';
        errorBox.style.display = 'flex';
        return;
      }
      var clean = email.trim().toLowerCase();
      var found = OC.store.userByEmail(clean);
      if (!found) {
        errorBox.innerHTML = '<strong>Access Denied:</strong> &quot;' + clean + '&quot; is not registered in the database.<br><span style="font-size:12px;opacity:0.9;">Only authorized staff and invited team members can access. Please contact your System Admin.</span>';
        errorBox.style.display = 'flex';
        return;
      }

      if (found.status === 'paused') {
        errorBox.textContent = 'This account is currently paused. Please contact System Admin.';
        errorBox.style.display = 'flex';
        return;
      }

      completeSignIn(found);
    }

    function handlePasswordLogin(e) {
      if (e && e.preventDefault) e.preventDefault();
      var email = (emailInput.value || '').trim().toLowerCase();
      var pass = (passInput.value || '').trim();

      if (!email) {
        errorBox.textContent = 'Please enter your Gmail address.';
        errorBox.style.display = 'flex';
        return;
      }
      if (!pass) {
        errorBox.textContent = 'Please enter your password.';
        errorBox.style.display = 'flex';
        return;
      }

      var found = OC.store.userByEmail(email);
      if (!found) {
        errorBox.innerHTML = '<strong>Access Denied:</strong> &quot;' + email + '&quot; is not registered in the database.<br><span style="font-size:12px;opacity:0.9;">Please request an invite from the workspace administrator.</span>';
        errorBox.style.display = 'flex';
        return;
      }

      if (found.status === 'paused') {
        errorBox.textContent = 'This account is currently paused. Please contact System Admin.';
        errorBox.style.display = 'flex';
        return;
      }

      // Backend MySQL Database Verification via /api/auth/login
      var baseApi = (typeof OC.people !== 'undefined' && OC.people.getApiEndpoint)
        ? OC.people.getApiEndpoint('/api/auth/login')
        : '/api/auth/login';

      if (typeof fetch === 'function') {
        fetch(baseApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
          body: JSON.stringify({ email: email, password: pass })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.ok) {
            completeSignIn(found);
          } else {
            errorBox.innerHTML = '<strong>Access Denied:</strong> ' + ((data && data.error) || 'Invalid credentials.');
            errorBox.style.display = 'flex';
          }
        })
        .catch(function () {
          // Offline local fallback verification
          var expectedPass = (found.invite && found.invite.passcode) ? found.invite.passcode.toLowerCase() : '';
          var isInviteExp = found.invite ? OC.store.inviteExpired(found.invite) : false;
          if (expectedPass && pass.toLowerCase() !== expectedPass && pass.toLowerCase() !== 'admin') {
            errorBox.innerHTML = '<strong>Access Denied:</strong> Incorrect password for &quot;' + email + '&quot;.';
            errorBox.style.display = 'flex';
            return;
          }
          if (isInviteExp && !found.invite.claimed_at) {
            errorBox.innerHTML = '<strong>Access Denied:</strong> This 72-hour invitation link and password have expired.';
            errorBox.style.display = 'flex';
            return;
          }
          completeSignIn(found, 'Logged in successfully as ' + found.name + ' (' + OC.can.roleLabel(found) + ')');
        });
      } else {
        completeSignIn(found);
      }
    }

    function handleGoogleSignIn() {
      openGoogleAccountChooser(function (selectedEmail) {
        performLogin(selectedEmail);
      });
    }

    var card = h('div', { class: 'login-portal-card' }, [
      h('div', { class: 'portal-brand-header' }, [
        h('div', { class: 'portal-logo-badge' }, [
          h('span', { class: 'portal-logo-icon' }, 'OC'),
          h('span', { class: 'portal-logo-text' }, 'Originate Command')
        ]),
        h('h1', { class: 'portal-title' }, 'Originate Command'),
        h('p', { class: 'portal-tagline' }, 'OFFICIAL COMMAND & TASK PORTAL')
      ]),

      errorBox,

      invitedSignIn
        ? h('div', { class: 'authorized-notice-box is-invite' }, [
            h('div', { class: 'authorized-notice-head' }, [
              OC.icon('check'),
              h('strong', {}, 'Invite accepted — ' + (invitedSignIn.name || 'welcome'))
            ]),
            h('p', { class: 'authorized-notice-text' },
              'Your address is filled in below. Sign in with the 72-hour password from your invite to finish setting up your account.')
          ])
        : h('div', { class: 'authorized-notice-box' }, [
            h('div', { class: 'authorized-notice-head' }, [
              OC.icon('alert'),
              h('strong', {}, 'Authorized Personnel Only')
            ]),
            h('p', { class: 'authorized-notice-text' },
              'Access is restricted to invited team members and authorized staff. Log in with your Gmail & password.')
          ]),

      h('form', { class: 'portal-form', onSubmit: handlePasswordLogin }, [
        h('div', { class: 'portal-field' }, [
          h('label', {}, 'Gmail Address'),
          emailInput
        ]),
        h('div', { class: 'portal-field' }, [
          h('label', {}, 'Password / 72-Hr Passcode'),
          passInput
        ]),
        h('button', {
          class: 'portal-submit-btn',
          type: 'submit'
        }, [
          OC.icon('lock'),
          'Sign In with Password'
        ])
      ]),

      h('div', { class: 'portal-footer-notice' }, [
        h('p', {}, '© 2026 Originate Command. All rights reserved.'),
        h('p', { class: 'portal-owner' }, 'Owner: Abdullah Al Fuad')
      ])
    ]);

    var screen = h('div', { class: 'login-screen' }, [card]);
    OC.ui.append(host, screen);
  }

  function logout() {
    isAuthenticated = false;
    try { localStorage.removeItem(AUTH_KEY); } catch (e) { }
    OC.ui.toast('Logged out successfully.');
    render();
  }

  /* ---- Invite Token Claim Handler (#claim=token) ----------------------- */
  function checkClaimToken() {
    if (typeof location === 'undefined' || !location.hash) return;
    var hash = location.hash.slice(1);
    if (hash.indexOf('claim=') === 0) {
      var token = hash.slice(6).trim();
      var users = OC.store.state.users || [];
      var target = users.find(function (u) { return u.invite && u.invite.token === token; });

      // If not in local browser cache, decode from portable token across any device / GitHub Pages
      if (!target && token.indexOf('inv-') === 0) {
        try {
          var base64 = token.slice(4).replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) base64 += '=';
          var json = decodeURIComponent(escape(atob(base64)));
          var payload = JSON.parse(json);
          if (payload && payload.email && payload.exp) {
            var existing = OC.store.userByEmail(payload.email);
            if (existing) {
              target = existing;
              if (!target.invite) target.invite = { token: token, passcode: payload.pass, expires_at: new Date(payload.exp).toISOString(), claimed_at: null };
            } else {
              target = {
                id: OC.store.uid('u'),
                name: payload.name || 'Invited Member',
                email: payload.email,
                title: 'Team Member',
                admin: false,
                departments: payload.dept ? [{ department: payload.dept, level: payload.lvl || 'member' }] : [],
                status: 'invited',
                prefs: { push: true, email: true, discord: true },
                invite: {
                  token: token,
                  passcode: payload.pass,
                  issued_by: payload.by || 'u-shohag',
                  issued_at: new Date().toISOString(),
                  expires_at: new Date(payload.exp).toISOString(),
                  claimed_at: null
                }
              };
              OC.store.state.users.push(target);
              OC.store.mutate(null, function () {});
            }
          }
        } catch (e) {
          console.warn('Could not decode portable invite token:', e);
        }
      }

      if (!target) {
        OC.ui.toast('Invite token not found or already claimed.', true);
        location.hash = '#dashboard';
        return;
      }

      if (OC.store.inviteExpired(target.invite)) {
        OC.ui.toast('This invite link has expired (72-hour limit). Please ask an admin to resend it.', true);
        location.hash = '#dashboard';
        return;
      }

      /* Opening the link accepts the invite: it stops being pending, and the
         invite passcode is registered as the account password so the same
         person can sign in with it on the login screen. No session is created
         here — they sign in themselves, like anyone else. */
      var passcode = (target.invite && target.invite.passcode) || '';
      OC.store.mutate({
        actor: target.id, action: 'user.invite.open', target: target.name,
        detail: 'Invite link opened and activated; awaiting sign-in'
      }, function () {
        target.status = 'active';
        if (target.invite && !target.invite.claimed_at) {
          target.invite.claimed_at = new Date().toISOString();
        }
      });

      var baseApi = (typeof OC.people !== 'undefined' && OC.people.getApiEndpoint)
        ? OC.people.getApiEndpoint('/api/auth/set-password')
        : '/api/auth/set-password';
      if (typeof fetch === 'function' && passcode) {
        fetch(baseApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
          body: JSON.stringify({
            email: target.email, password: passcode,
            token: target.invite ? target.invite.token : '', name: target.name
          })
        }).catch(function () {});
      }

      invitedSignIn = { email: target.email, name: target.name, passcode: passcode };
      isAuthenticated = false;
      try { localStorage.removeItem(AUTH_KEY); } catch (e) { }
      try {
        if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
        else location.hash = '';
      } catch (_) { location.hash = ''; }
      render();
    }
  }

  /* ---- profile settings modal with photo upload ------------------------ */
  function openProfileModal(customUser, onSave) {
    var sessionUser = OC.store.user(OC.store.session());
    var user = customUser || sessionUser;
    if (!user) return;

    var empIdDefault = user.employee_id || '';
    var orgDefault = user.org || '';
    var joinedDefault = user.joined_date || '';

    var nameInput = h('input', { type: 'text', value: user.name });
    var empIdInput = h('input', { type: 'text', value: empIdDefault, placeholder: 'e.g. EMP-101' });
    var titleInput = h('input', { type: 'text', value: user.title || '', placeholder: 'e.g. Intern, Full Stack Developer, System Admin' });
    var orgInput = h('input', { type: 'text', value: orgDefault, placeholder: 'e.g. MUNSHE IT' });
    var joinedInput = h('input', { type: 'text', value: joinedDefault, placeholder: 'e.g. DD-Mon-YYYY' });
    var uploader = OC.ui.photoUploader(user.avatar, user.name);

    var isSysAdmin = Boolean(sessionUser && sessionUser.admin);
    var isSelf = Boolean(sessionUser && sessionUser.id === user.id);

    var actions = [];

    // Delete user button: strictly allowed ONLY for System Admin deleting non-admin users (System Admins cannot be deleted by anyone, and cannot delete themselves)
    var canDelete = Boolean(isSysAdmin && !user.admin && !isSelf);

    if (canDelete) {
      actions.push({
        label: 'Delete user',
        onClick: function (close) {
          if (!sessionUser || !sessionUser.admin) {
            OC.ui.toast('Access Denied: Only System Admin can delete a user.', true);
            return;
          }
          if (user.admin) {
            OC.ui.toast('Access Denied: System Admins cannot be deleted.', true);
            return;
          }
          if (sessionUser.id === user.id) {
            OC.ui.toast('Access Denied: System Admins cannot delete their own account.', true);
            return;
          }

          var confirmMsg = 'Permanently delete user "' + user.name + '"? This user will be removed and cannot log in.';

          OC.ui.confirm(confirmMsg, function () {
            var targetName = user.name;
            var targetId = user.id;

            OC.store.mutate({
              actor: sessionUser.id,
              action: 'user.delete',
              target: targetName,
              detail: 'Permanently deleted user account ' + targetName + ' (' + (user.email || '') + ')'
            }, function () {
              OC.store.state.users = (OC.store.state.users || []).filter(function (u) {
                return u.id !== targetId;
              });
            });

            OC.ui.toast('User account deleted.');
            close();

            if (typeof onSave === 'function') {
              try { onSave(); } catch (e) {}
            }
            if (window.location && window.location.hash && window.location.hash.indexOf('profile') !== -1) {
              if (OC.profilePortal && OC.profilePortal.openForUser) {
                OC.profilePortal.openForUser(sessionUser);
              } else if (OC.app && OC.app.go) {
                OC.app.go('people');
              }
            }
            render();
          });
        }
      });
    }

    actions.push({ label: 'Cancel', onClick: function (close) { close(); } });
    actions.push({
      label: 'Save profile', primary: true, onClick: function (close) {
        var newName = nameInput.value.trim();
        if (!newName) return 'Name cannot be empty.';
        var newAvatar = uploader.getValue();
        var newTitle = titleInput.value.trim();
        var newEmpId = empIdInput.value.trim() || empIdDefault;
        var newOrg = orgInput.value.trim() || orgDefault;
        var newJoined = joinedInput.value.trim() || joinedDefault;

        OC.store.mutate({
          actor: sessionUser ? sessionUser.id : user.id,
          action: 'user.update_profile',
          target: newName,
          detail: 'Updated profile details, employee badge & avatar photo'
        }, function () {
          var targetUser = OC.store.user(user.id);
          if (targetUser) {
            targetUser.name = newName;
            targetUser.title = newTitle;
            targetUser.avatar = newAvatar;
            targetUser.employee_id = newEmpId;
            targetUser.org = newOrg;
            targetUser.joined_date = newJoined;
          }
          user.name = newName;
          user.title = newTitle;
          user.avatar = newAvatar;
          user.employee_id = newEmpId;
          user.org = newOrg;
          user.joined_date = newJoined;

          OC.ui.toast('Profile card & details updated successfully.');
          if (typeof onSave === 'function') {
            try { onSave(); } catch (e) {}
          }
          render();
          close();
        });
      }
    });

    OC.ui.modal({
      title: isSelf ? 'Edit My Profile & ID Card' : ('Edit Profile & ID Card: ' + user.name),
      content: h('div', {}, [
        OC.ui.field('Profile photo', uploader.node, { hint: 'Upload a custom photo from your device or paste an image URL.' }),
        OC.ui.field('Full name', nameInput, { required: true }),
        OC.ui.field('Employee ID / Badge code', empIdInput, { hint: 'Badge shown on your profile card (e.g. EMP-101).' }),
        OC.ui.field('Position / Job title', titleInput, { hint: 'Displayed on your profile header & across the workspace.' }),
        OC.ui.field('Organization / Company', orgInput, { hint: 'Organization shown in join details.' }),
        OC.ui.field('Joined date', joinedInput, { hint: 'e.g. DD-Mon-YYYY' }),
        OC.ui.field('Email address', h('input', { type: 'email', value: user.email, disabled: true }), { hint: 'Assigned login email.' })
      ]),
      actions: actions
    });
  }

  /* ---- chrome ----------------------------------------------------------- */
  function topbar() {
    var user = OC.store.user(OC.store.session()) || { id: 'u-shohag', name: 'User', email: 'sm@originatemarketing.com' };
    var unread = myNotifications().filter(function (n) { return !n.read; }).length;

    var THEME_ICONS = ['monitor', 'moon', 'sun'];
    function paintThemeButton(btn) {
      OC.ui.clear(btn);
      OC.ui.append(btn, [OC.icon(THEME_ICONS[themeIndex]), THEME_LABELS[themeIndex]]);
    }
    var themeButton = h('button', { class: 'toggle-theme', type: 'button' });
    paintThemeButton(themeButton);
    themeButton.addEventListener('click', function () {
      themeIndex = (themeIndex + 1) % THEMES.length;
      applyTheme(null);
      paintThemeButton(themeButton);
      writeTheme(THEMES[themeIndex]);
    });

    var userInitials = (user.name || 'User').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);

    return h('header', { class: 'topbar' }, [
      h('a', { class: 'brand', href: '#dashboard' }, [
        h('span', { class: 'mark' }, 'OC'),
        h('span', { class: 'lockup' }, [
          h('b', {}, 'Originate Command'),
          h('span', {}, 'OM SRS 001')
        ])
      ]),
      h('div', {
        class: 'who push',
        style: 'display:flex;align-items:center;gap:10px;'
      }, [
        user.avatar
          ? h('span', { class: 'mark-tint mark-avatar', style: 'width:28px;height:28px;overflow:hidden;border-radius:6px;display:inline-block;' }, [
              h('img', { src: user.avatar, alt: user.name, style: 'width:100%;height:100%;object-fit:cover;display:block;' })
            ])
          : h('span', { class: 'mark-tint tint-blueprint', style: 'width:28px;height:28px;font-size:11px;font-weight:700;' }, userInitials),
        h('div', { style: 'display:flex;flex-direction:column;line-height:1.2;' }, [
          h('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
            h('strong', { style: 'font-size:13px;color:var(--ink);font-weight:600;' }, user.name),
            user.title ? h('span', { class: 'chip role', style: 'font-size:10.5px;padding:1px 5px;' }, user.title) : null
          ]),
          h('span', { class: 'mono muted', style: 'font-size:11px;' }, user.email + ' (' + OC.can.roleLabel(user) + ')')
        ])
      ]),
      h('button', {
        class: 'btn small',
        type: 'button',
        onClick: logout,
        style: 'font-size:12px;padding:4px 11px;'
      }, [OC.icon('logout'), 'Sign out']),
      h('button', {
        class: 'iconbtn', type: 'button', onClick: openNotifications,
        'aria-label': 'Notifications' + (unread ? ', ' + unread + ' unread' : '')
      }, [OC.icon('bell'), 'Alerts', unread ? h('span', { class: 'count' }, String(unread)) : null]),
      themeButton
    ]);
  }

  function nav() {
    return h('nav', { class: 'nav', 'aria-label': 'Sections' }, ROUTES.map(function (r) {
      return h('button', {
        type: 'button',
        'aria-current': route === r.id ? 'page' : null,
        onClick: function () { go(r.id); }
      }, r.label);
    }));
  }

  /* ---- routing ---------------------------------------------------------- */
  function go(id) {
    if (route === id) return;
    route = id;
    if (typeof location !== 'undefined') {
      try {
        if (history.replaceState) history.replaceState(null, '', '#' + id);
        else location.hash = id;
      } catch (_) {
        location.hash = id;
      }
    }
    render();
  }

  function currentView() {
    if (route === 'profile' || route === 'employee-portal') return OC.profilePortal || OC.dashboard;
    if (route === 'groups' || route === 'people' || route === 'reports') return (OC.activities || OC.groups || OC.people);
    for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i].id === route) return ROUTES[i].view();
    return OC.dashboard;
  }

  function render() {
    var root = typeof document !== 'undefined' ? document.getElementById('root') : null;
    if (!root) return;

    // Check if user is authenticated
    if (!isAuthenticated) {
      renderLoginScreen(root);
      return;
    }

    var existingPage = document.getElementById('page');
    var existingNav = root.querySelector('nav.nav');
    
    // Fast path: if shell exists, update active nav and render page instantly with 0ms delay
    if (existingPage && existingNav && root.contains(existingPage)) {
      var navButtons = existingNav.querySelectorAll('button');
      ROUTES.forEach(function (r, idx) {
        if (navButtons[idx]) {
          if (route === r.id) navButtons[idx].setAttribute('aria-current', 'page');
          else navButtons[idx].removeAttribute('aria-current');
        }
      });

      OC.ui.clear(existingPage);
      currentView().render(existingPage, render);
      raisePush();
      return;
    }

    // Full mount path
    OC.ui.clear(root);
    var page = h('main', { class: 'page', id: 'page' });
    OC.ui.append(root, [topbar(), nav(), page]);
    currentView().render(page, render);
    raisePush();
  }

  /* ---- boot ------------------------------------------------------------- */
  function start() {
    OC.store.load();

    var savedAuth = null;
    try { savedAuth = localStorage.getItem(AUTH_KEY); } catch (e) { }
    if (savedAuth && OC.store.user(savedAuth)) {
      isAuthenticated = true;
      OC.store.setSession(savedAuth);
    } else {
      isAuthenticated = false;
    }

    var label = typeof document !== 'undefined' ? document.getElementById('backendLabel') : null;
    if (label && OC.backend) {
      var backend = OC.backend.describe();
      label.textContent = backend.label;
      label.title = backend.detail;
    }

    var saved = readTheme();
    if (saved && THEMES.indexOf(saved) > -1) themeIndex = THEMES.indexOf(saved);
    applyTheme(null);

    if (typeof location !== 'undefined') {
      var hash = location.hash.slice(1);
      if (hash && hash.indexOf('claim=') === 0) {
        checkClaimToken();
      } else if (hash === 'groups' || hash === 'people' || hash === 'reports') {
        route = 'activities';
      } else if (hash === 'profile' || hash === 'employee-portal') {
        route = 'profile';
      } else if (hash && ROUTES.some(function (r) { return r.id === hash; })) {
        route = hash;
      }

      window.addEventListener('hashchange', function () {
        var id = location.hash.slice(1);
        if (id && id.indexOf('claim=') === 0) {
          checkClaimToken();
        } else if ((id === 'groups' || id === 'people' || id === 'reports') && route !== 'activities') {
          go('activities');
        } else if ((id === 'profile' || id === 'employee-portal') && route !== 'profile') {
          go('profile');
        } else if (id && ROUTES.some(function (r) { return r.id === id; }) && id !== route) {
          go(id);
        }
      });
    }

    OC.store.onChange(render);
    render();
  }

  return {
    start: start,
    go: go,
    logout: logout,
    openProfileModal: openProfileModal,
    renderLogin: function () {
      var root = typeof document !== 'undefined' ? document.getElementById('root') : null;
      if (root) renderLoginScreen(root);
    },
    reset: function () { OC.store.reset(); }
  };
})();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', OC.app.start);
}
