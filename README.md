# Originate Command

Unified todo board and instruction system for Originate Marketing, built to the
specification in [`spec/`](spec/) (OM SRS 001).

```
npm run seed     # create the database and fill it with a workspace to try
npm start        # http://localhost:3000
```

Sign in as `shohag@originate.example` (admin) or `rifat@originate.example`
(team member). Password: `originate`.

Node 22.5 or newer, and **no dependencies at all** — not one `npm install`.
The server is Node's own `http` module and its own SQLite driver.

## What it is

Two panels sharing one tag system: what needs doing on the left, what people
need to know on the right. Behind them, a permission model where authority
flows down a department and never sideways, and a database that enforces it.

| Spec | Built |
| --- | --- |
| 2.0 two panels | Todos and instructions, one filter set, tabbed on a phone |
| 3.0 roles | Four roles, computed from each department's own ordered hierarchy |
| 3.2 assignment | Anyone may post an instruction; only admin, heads and leads assign work |
| 3.4 custom levels | A department may carry levels the others do not |
| 4.2 groups | Cross-department groups, the one line authority crosses |
| 5.0 comments | Threads on todos and instructions, all of it in the audit log |
| 5.2 mandatory tags | Nothing is posted without a client and a department |
| 6.1 invites | Single-use token, 72 hour expiry, resend, revoke, claim |
| 6.2 todos | Four states, blocked needs a reason, recurrence, copy yesterday |
| 6.3 instructions | Reverse-chronological, read receipts, convert to todo, archive only |
| 6.4 tagging | Searchable tick lists, inline new tags, pinned filters, client timeline |
| 6.7 dashboard | Own work by client, unread first, own clients and groups |
| 6.8 reporting | Daily snapshot, per-person status, historical log, CSV export |
| 9.0 notifications | In-app, delivered live to every open screen |
| 9.4 escalation | Overdue work names the chain it has climbed |

Email and Discord (9.2, 9.3) are not built: they need an outbound mail service
and a webhook, which are yours to choose. The escalation chain and the in-app
channel work without them.

## Structure

```
index.html                     the application shell
assets/
  css/    01-tokens 02-base 03-layout 04-components 05-touch   (cascade order)
  js/
    core/     permissions.js   what the interface offers
              api-store.js     the workspace, backed by the server
              session.js       signing in, and what runs on load
    ui/       ui.js icons.js   elements, dates, chips, modal, toasts
    views/    dashboard board groups reports people
    app.js                     shell, routing, notifications, theme
server/
  src/
    index.js       http: static files, the API, live updates
    api.js         every route, each deciding what the caller may do
    permissions.js section 3.0, enforced here
    auth.js        scrypt passwords, sessions, invites
    db.js          SQLite schema and access
    seed.js        a workspace to start from
  tests/api.test.js
  data/            the database (created by seed, not in git)
tests/             logic, ui and sweep suites
spec/              the specification this is built to
```

## How a permission is enforced

Twice, on purpose, and the two are not the same thing.

`assets/js/core/permissions.js` decides what the interface **offers** — whether
to draw a Reassign button. `server/src/permissions.js` decides what the server
**does** — whether a reassignment is carried out. Section 8.1 is explicit about
the difference: "the app does not show it to you" and "the system will not give
it to you" are different statements, and only the second is protection.

The server scopes `GET /api/state` before it answers, so work a person may not
see never reaches their browser at all. Changing someone's department, or
reordering a hierarchy, ends their sessions, because their old reach must not
outlive the change.

## Tests

```
npm test              server API and client logic
npm run test:api      56 checks: permissions enforced over HTTP
npm run test:logic    33 checks: what the interface offers
npm run test:ui       55 checks: a real browser against a real server
npm run test:sweep    every control, every view, all eleven accounts
```

The browser suites start their own server on their own port with their own
database, and stop it afterwards. Nothing depends on a server you started by
hand — an earlier version did, and a stale one silently served a deleted
database, which looked exactly like the application duplicating its writes.

## Deploying

Any machine with Node 22.5 or newer:

```
git clone <this repo> && cd originate-command
npm run seed
PORT=8080 node server/src/index.js
```

Put it behind nginx or Caddy for TLS. Section 8.2 asks for HTTPS everywhere;
session cookies are `HttpOnly` and `SameSite=Strict` already, and should be
`Secure` too once there is a certificate in front.

The database is one file: `server/data/originate.db`. Back it up by copying it.
