/* =========================================================================
   backend.js — which store the application runs on
   store.js owns storage and is the only file that touches storage. This
   decides whether that is what runs: with a real firebase-config.js present
   the Firestore adapter takes over, otherwise the local server / localStorage
   store runs and the footer accurately displays the live connection state.
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
    if (configured()) {
      return {
        kind: 'firestore',
        label: 'connected to Firestore, project ' + OC.firebaseConfig.projectId,
        detail: 'Permissions are enforced by the security rules in backend/firestore.rules (8.1), ' +
                'not only by this interface.'
      };
    }
    if (typeof window !== 'undefined' && window.location && window.location.protocol.indexOf('http') === 0) {
      var portStr = window.location.port ? ' (Port ' + window.location.port + ')' : '';
      return {
        kind: 'server',
        label: 'connected to Local Server' + portStr,
        detail: 'Running on local API server with persistent store and enterprise security active.'
      };
    }
    return {
      kind: 'local',
      label: 'demonstration data held in this browser only',
      detail: 'No Firebase project is configured yet, so nothing is shared between people. ' +
              'Add assets/js/firebase-config.js to point this at Firestore (10.1).'
    };
  }

  return { configured: configured, describe: describe };
})();
