# Back end — Firestore rules and Cloud Functions

Everything the specified build needs on the server, ready for the moment the
Firebase project exists. Nothing here can run against a real project until you
create one: section 10.2 of the specification is explicit that account creation
is yours, not the delivery team's.

```
firestore.rules          section 3.0 and 8.1, enforced at the database
firestore.indexes.json   the composite indexes the app's queries need
functions/lib/logic.js   the decisions: claims, recurrence, escalation, invites
functions/index.js       the wiring: triggers, reads, writes, outbound calls
tests/rules.test.js      49 checks against the Firestore emulator
tests/logic.test.js      38 checks, no emulator needed
```

## Tests

```
npm install
node tests/logic.test.js     # 38 checks, pure functions, runs anywhere
npm run test:rules           # 49 checks against the emulator (needs Java)
```

The rules tests are real reads and writes refused by real rules, not a reading
of the rules file. They cover the permission matrix of section 3.0: a member
cannot read another department's work, a lead cannot assign upward or sideways,
an assignee can move state but never hand work on, group membership is the one
line authority crosses, nobody promotes themselves, and the audit log is not
writable by anyone at all.

## How authority reaches the rules

Firestore has no server side joins, so a rule cannot look up someone's position
from the department while deciding. It reads it from the token instead:

```
request.auth.token.admin        true for the leadership tier
request.auth.token.departments  { departmentId: rank }   rank 0 = head, 1 = lead
```

`onUserWritten` sets those claims whenever a person's membership changes, and
keeps the mirrored `members` array on each department in step — section 5.0
names that duplication as the one place Firestore's lack of joins shows up
directly.

Section 8.1 records the cost honestly: a claim is carried in a token, so a
change takes effect on the next login or token refresh, and until then the
previous permissions can persist for a short window. The audit log exists partly
to make that window visible.

## Going live

1. Create the Firebase project (10.2) and upgrade it to Blaze — Cloud Functions
   are not available on the free Spark plan at all.
2. `firebase deploy --only firestore:rules,firestore:indexes`
3. Set the function secrets, each optional until you want that channel:
   `firebase functions:secrets:set RESEND_API_KEY` (email, 9.2),
   `DISCORD_WEBHOOK_URL` (9.3), `APP_URL` (the link in invite emails).
4. `firebase deploy --only functions`
5. Paste your web app config into `assets/js/firebase-config.js`, which ships
   with placeholders. The footer will say it is connected.

The web config in that file is public by design; what protects the data is the
rules. The service account private key is a genuine secret and belongs in the
Functions runtime, never in this repository.
