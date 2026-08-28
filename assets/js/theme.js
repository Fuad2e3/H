/* =========================================================================
   theme.js — colour theme control
   Cycles the fixed toggle through system → dark → light by setting
   data-theme on <html>, and remembers the choice in localStorage. Storage
   is wrapped: private windows and blocked site data must not break the page.
   Originate Command · OM SRS 001
   ========================================================================= */

(function () {
  'use strict';

  var KEY = 'oc-theme';
  var STATES = [null, 'dark', 'light'];
  var LABELS = ['Theme: system', 'Theme: dark', 'Theme: light'];

  var root = document.documentElement;
  var button = document.getElementById('themeToggle');
  if (!button) return;

  var index = 0;

  function read() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function write(value) {
    try {
      value ? localStorage.setItem(KEY, value) : localStorage.removeItem(KEY);
    } catch (e) {
      /* storage unavailable: the toggle still works for this page view */
    }
  }

  function apply() {
    var state = STATES[index];
    if (state) {
      root.setAttribute('data-theme', state);
    } else {
      root.removeAttribute('data-theme');
    }
    button.textContent = LABELS[index];
  }

  var saved = read();
  if (saved && STATES.indexOf(saved) > -1) index = STATES.indexOf(saved);
  apply();

  button.addEventListener('click', function () {
    index = (index + 1) % STATES.length;
    apply();
    write(STATES[index]);
  });
})();
