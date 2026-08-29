/* =========================================================================
   backend.js — which store the application runs on
   store.js owns localStorage and is the only file that touches storage. This
   decides whether that is what runs: with a real firebase-config.js present
   the Firestore adapter takes over, otherwise the local store stays and the
   footer says so, rather than the application pretending to be shared when
   it is not.
   Originate Command · OM SRS 001
   ========================================================================= */

window.OC = window.OC || {};

OC.backend = (function () {
  'use strict';

  function configured() {
    var c = OC.firebaseConfig;
    if (!c) return false;
    var required = ['apiKey', 'projectId', 'appId'];
    return required.every(function (k) {
      return typeof c[k] === 'string' && c[k].length > 0 && c[k].indexOf('PASTE_') !== 0;
    });
  }

  function describe() {
    if (!configured()) {
      return {
        kind: 'local',
        label: 'demonstration data held in this browser only',
        detail: 'No Firebase project is configured yet, so nothing is shared between people. ' +
                'Add assets/js/firebase-config.js to point this at Firestore (10.1).'
      };
    }
    return {
      kind: 'firestore',
      label: 'connected to Firestore, project ' + OC.firebaseConfig.projectId,
      detail: 'Permissions are enforced by the security rules in backend/firestore.rules (8.1), ' +
              'not only by this interface.'
    };
  }

  return { configured: configured, describe: describe };
})();
