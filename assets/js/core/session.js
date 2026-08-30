/* =========================================================================
   session.js — signing in (6.1)
   There is no public sign up: an account exists because somebody with the
   authority to invite created it. This only lets a person prove they are it.

   The password goes to the server and nothing else: no token is kept in
   localStorage where a script could read it. The server answers with an
   HttpOnly cookie, which the browser sends on its own and JavaScript cannot
   touch.
   Originate Command · OM SRS 001
   ========================================================================= */

window.OC = window.OC || {};

OC.session = (function () {
  'use strict';

  var busy = false;
  var problem = null;

  function submit(email, password, trusted) {
    busy = true; problem = null; paint();
    OC.apiStore.request('POST', '/api/session', {
      email: email, password: password, trusted: trusted
    }).then(function () {
      busy = false;
      OC.start();
    }).catch(function (error) {
      busy = false;
      problem = error.message;
      paint();
    });
  }

  function paint() {
    var h = OC.ui.h;
    var email = h('input', { type: 'text', name: 'email', placeholder: 'you@originate.example',
                             autocomplete: 'username', value: '' });
    var password = h('input', { type: 'password', name: 'password', placeholder: 'password',
                                autocomplete: 'current-password' });
    var trusted = h('input', { type: 'checkbox' });

    var card = h('form', {
      class: 'signin-card',
      onSubmit: function (e) {
        e.preventDefault();
        if (!email.value.trim() || !password.value) {
          problem = 'Enter your email address and password.';
          paint();
          return;
        }
        submit(email.value.trim(), password.value, trusted.checked);
      }
    }, [
      h('div', { class: 'signin-brand' }, [
        h('span', { class: 'mark' }, 'OC'),
        h('div', {}, [h('b', {}, 'Originate Command'), h('span', {}, 'OM SRS 001')])
      ]),
      problem ? h('div', { class: 'error' }, [OC.icon('alert'), h('span', {}, problem)]) : null,
      OC.ui.field('Email', email, { required: true }),
      OC.ui.field('Password', password, { required: true }),
      h('label', { class: 'checkline' }, [trusted, 'Trust this device for 14 days']),
      h('button', { class: 'btn primary', type: 'submit', disabled: busy },
        busy ? 'Signing in…' : 'Sign in'),
      h('p', { class: 'signin-note' },
        'Accounts are invite only (6.1). If you have not been invited, ask your department head.')
    ]);

    var root = document.getElementById('root');
    OC.ui.clear(root);
    root.appendChild(h('div', { class: 'signin' }, [card]));
    var first = root.querySelector('input');
    if (first) first.focus();
  }

  function signOut() {
    OC.apiStore.request('DELETE', '/api/session').then(function () {
      OC.apiStore.stop();
      paint();
    });
  }

  /* the server refused the session mid-visit: it expired, or someone's
     authority changed and every session of theirs was ended (8.2) */
  function signedOut() {
    OC.apiStore.stop();
    problem = 'Your session ended. Sign in again.';
    paint();
  }

  return { paint: paint, signOut: signOut, signedOut: signedOut };
})();

/* ---- what runs on load ---------------------------------------------------
   Ask the server who this is. With a valid cookie the workspace loads; with
   none, the sign-in screen does. */
OC.start = function () {
  OC.store = OC.apiStore;
  return OC.apiStore.start().then(function () {
    OC.app.start();
  }).catch(function () {
    OC.session.paint();
  });
};

document.addEventListener('DOMContentLoaded', function () { OC.start(); });
