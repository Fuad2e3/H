/* =========================================================================
   firebase-config.js
   Paste the values from your Firebase project here (Project settings,
   General, your Web app). While they are still placeholders the application
   runs on localStorage and says so in the footer, so a local-only workspace
   never looks like a shared one.

   This file ships with placeholders rather than being absent: a missing
   script is a 404 in every visitor's console.

   This file holds no secret. A Firebase web config is public by design —
   what protects the data is the security rules in backend/firestore.rules,
   which is exactly the point section 8.1 makes about enforcement belonging
   at the database rather than in the interface.

   The service account private key is a secret and never belongs here, or
   anywhere in this repository. It goes to the Cloud Functions runtime.
   Originate Command · OM SRS 001
   ========================================================================= */

window.OC = window.OC || {};

OC.firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE_PROJECT.appspot.com',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID'
};
