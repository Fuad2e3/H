/* =========================================================================
   app.js — application shell
   Boots the store, draws the top bar and navigation, routes between views,
   and re-renders whenever the store reports a change. Also carries the
   account switcher, which stands in for the invite-only login in 6.1: the
   real build authenticates, this build lets you look through any account's
   eyes to see the permission rules in section 3.0 actually biting.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.app = (function () {
  'use strict';

  var h;
  var route = 'dashboard';

  var ROUTES = [
    { id: 'dashboard', label: 'Dashboard', view: function () { return OC.dashboard; } },
    { id: 'board',     label: 'Board',     view: function () { return OC.board; } },
    { id: 'groups',    label: 'Groups',    view: function () { return OC.groups; } },
    { id: 'reports',   label: 'Reports',   view: function () { return OC.reports; } },
    { id: 'people',    label: 'People',    view: function () { return OC.people; } }
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
    try { v ? localStorage.setItem(THEME_KEY, v) : localStorage.removeItem(THEME_KEY); } catch (e) {}
  }
  function applyTheme(button) {
    var t = THEMES[themeIndex];
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    if (button) button.textContent = THEME_LABELS[themeIndex];
  }

  /* ---- notifications (9.0, in-app channel) ------------------------------ */
  function myNotifications() {
    var id = OC.store.session();
    return OC.store.state.notifications.filter(function (n) { return n.user === id; });
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
          'The in-app channel. Browser push, email and the Discord webhook are server-side in the specified build (9.0) — ' +
          'your per-channel toggles live under People.'),
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

  /* ---- chrome ----------------------------------------------------------- */
  function topbar() {
    var user = OC.store.user(OC.store.session());
    var unread = myNotifications().filter(function (n) { return !n.read; }).length;

    var switcher = OC.ui.select(
      OC.store.state.users
        .filter(function (u) { return u.status === 'active'; })
        .map(function (u) { return { value: u.id, label: u.name + ' — ' + OC.can.roleLabel(u) }; }),
      user.id,
      {
        'aria-label': 'Signed in as',
        onChange: function (e) { OC.store.setSession(e.target.value); }
      }
    );

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

    return h('header', { class: 'topbar' }, [
      h('a', { class: 'brand', href: '#dashboard' }, [
        h('span', { class: 'mark' }, 'OC'),
        h('span', { class: 'lockup' }, [
          h('b', {}, 'Originate Command'),
          h('span', {}, 'OM SRS 001')
        ])
      ]),
      h('div', { class: 'who push' }, [
        h('span', { class: 'mono muted', style: 'font-size:11px' }, 'Viewing as'),
        switcher
      ]),
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
    if (location.hash.slice(1) !== id) location.hash = id;
    render();
  }

  function currentView() {
    for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i].id === route) return ROUTES[i].view();
    return OC.dashboard;
  }

  function render() {
    var root = document.getElementById('root');
    OC.ui.clear(root);
    var page = h('main', { class: 'page', id: 'page' });
    OC.ui.append(root, [topbar(), nav(), page]);
    currentView().render(page, render);
  }

  /* ---- boot ------------------------------------------------------------- */
  function start() {
    h = OC.ui.h;
    OC.store.load();

    var saved = readTheme();
    if (saved && THEMES.indexOf(saved) > -1) themeIndex = THEMES.indexOf(saved);
    applyTheme(null);

    var hash = location.hash.slice(1);
    if (hash && ROUTES.some(function (r) { return r.id === hash; })) route = hash;

    window.addEventListener('hashchange', function () {
      var id = location.hash.slice(1);
      if (id && ROUTES.some(function (r) { return r.id === id; }) && id !== route) go(id);
    });

    OC.store.onChange(render);
    render();
  }

  return { start: start, go: go, reset: function () { OC.store.reset(); } };
})();

document.addEventListener('DOMContentLoaded', OC.app.start);
