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

  var ROUTES = [
    { id: 'dashboard', label: 'Dashboard', view: function () { return OC.dashboard; } },
    { id: 'board', label: 'Board', view: function () { return OC.board; } },
    { id: 'groups', label: 'Groups', view: function () { return OC.groups; } },
    { id: 'reports', label: 'Reports', view: function () { return OC.reports; } },
    { id: 'people', label: 'People', view: function () { return OC.people; } }
  ];

  /* ---- theme ------------------------------------------------------------ */
  var THEME_KEY = 'oc-theme';
  var THEMES = [null, 'dark', 'light'];
  var THEME_LABELS = ['Theme: system', 'Theme: dark', 'Theme: light'];
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
    if (!pushSupported() || Notification.permission !== 'granted') return;
    var user = OC.store.user(OC.store.session());
    if (!user || !user.prefs.push) return;
    var mine = myNotifications();
    if (!mine.length) return;
    var newest = mine[0];
    if (lastSeenNotification === null) { lastSeenNotification = newest.id; return; }
    if (newest.id === lastSeenNotification || newest.read) return;
    lastSeenNotification = newest.id;
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
        return h('div', { class: 'notif' + (n.read ? '' : ' unread') }, [
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
    var rawUsers = (OC.store.state.users || []).filter(function (u) { return u.status === 'active'; });
    var accountsList = [];
    var seen = {};

    rawUsers.forEach(function (u) {
      var email = (u.email || '').trim().toLowerCase();
      // Only include Google/Gmail accounts or Fuad's account; exclude non-google internal seeds and removed test emails
      if (!email || email === 'shohag@originate.example' || email === 'fuadkalaroa2000@gmail.com') return;
      if (!seen[email]) {
        seen[email] = true;
        accountsList.push({
          name: u.name || 'Abdullah al Fuad',
          email: u.email,
          avatar: u.name ? u.name.slice(0, 2).toUpperCase() : 'AF',
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

  function renderLoginScreen(host) {
    OC.ui.clear(host);

    var errorBox = h('div', { class: 'error', style: 'display:none;margin-bottom:16px;' });

    function performLogin(email) {
      if (!email) {
        errorBox.textContent = 'Please select your Google account.';
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

      isAuthenticated = true;
      try { localStorage.setItem(AUTH_KEY, found.id); } catch (e) { }
      OC.store.setSession(found.id);
      OC.ui.toast('Connected successfully as ' + found.name + ' (' + OC.can.roleLabel(found) + ')');
      render();
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

      h('div', { class: 'authorized-notice-box' }, [
        h('div', { class: 'authorized-notice-head' }, [
          OC.icon('alert'),
          h('strong', {}, 'Authorized Personnel Only')
        ]),
        h('p', { class: 'authorized-notice-text' },
          'Access is restricted to invited team members and authorized staff. Please log in with your authorized Google account.')
      ]),

      h('button', {
        class: 'portal-google-btn',
        type: 'button',
        onClick: handleGoogleSignIn
      }, [
        OC.icon('google'),
        'Sign in with Google Account'
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

      var nameInput = h('input', { type: 'text', value: target.name });
      var passInput = h('input', { type: 'password', placeholder: 'Choose a password' });

      OC.ui.modal({
        title: 'Complete your profile',
        content: h('div', {}, [
          h('p', { class: 'muted', style: 'font-size:13.5px;margin-bottom:12px' },
            'Welcome to Originate Command! Confirm your details to activate your account.'),
          OC.ui.field('Full Name', nameInput, { required: true }),
          OC.ui.field('Password', passInput, { required: true }),
          OC.ui.field('Email', h('input', { type: 'text', value: target.email, disabled: true }))
        ]),
        actions: [
          {
            label: 'Activate Account', primary: true, onClick: function (close) {
              if (!nameInput.value.trim()) return 'Name is required.';
              OC.store.mutate({
                actor: target.id, action: 'user.invite.claim', target: nameInput.value.trim(),
                detail: 'Account activated via invite token'
              }, function () {
                target.name = nameInput.value.trim();
                target.status = 'active';
                target.invite.claimed_at = new Date().toISOString();
              });
              isAuthenticated = true;
              try { localStorage.setItem(AUTH_KEY, target.id); } catch (e) { }
              OC.store.setSession(target.id);
              OC.ui.toast('Welcome, ' + target.name + '! Your account is now active.');
              location.hash = '#dashboard';
              close();
            }
          }
        ]
      });
    }
  }

  /* ---- chrome ----------------------------------------------------------- */
  function topbar() {
    var user = OC.store.user(OC.store.session()) || { id: 'u-shohag', name: 'User', email: 'shohag@originate.example' };
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
      h('div', { class: 'who push', style: 'display:flex;align-items:center;gap:10px;' }, [
        h('span', { class: 'mark-tint tint-blueprint', style: 'width:26px;height:26px;font-size:10.5px;font-weight:700;' }, userInitials),
        h('div', { style: 'display:flex;flex-direction:column;line-height:1.2;' }, [
          h('strong', { style: 'font-size:13px;color:var(--ink);font-weight:600;' }, user.name),
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
    route = id;
    if (typeof location !== 'undefined' && location.hash.slice(1) !== id) location.hash = id;
    render();
  }

  function currentView() {
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
      } else if (hash && ROUTES.some(function (r) { return r.id === hash; })) {
        route = hash;
      }

      window.addEventListener('hashchange', function () {
        var id = location.hash.slice(1);
        if (id && id.indexOf('claim=') === 0) {
          checkClaimToken();
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
