# Originate Command

The system described in **OM SRS 001** — a unified todo board and instruction /
notice board for Originate Marketing, built as a working application.

- **`/`** — the application. Open `index.html` in a browser.
- **`/spec/`** — the specification it is built from.

No build step, no framework, no package manager. Plain classic scripts, so it
runs from disk as well as from a server.

## What works

| Spec | In the app |
| --- | --- |
| 2.0 two panels | Todos left, instructions right, one shared filter set, tabbed on small screens |
| 3.0 roles | Four roles computed from each department's ordered hierarchy, not from role names |
| 3.2 assignment | Anyone may post an instruction; only admin, heads and leads may assign work to others |
| 3.4 custom levels | Outreach Operations carries a `senior` level the others do not, with no code change |
| 4.2 groups | Cross-department groups, created by admin and heads, archived not deleted |
| 5.2 mandatory tags | A todo or instruction cannot be posted without a client **and** a department |
| 6.1 invites | Invite flow, new accounts default to the narrowest level in the department |
| 6.2 todos | Four states, blocked demands a reason, recurrence regenerates on completion, copy yesterday |
| 6.3 instructions | Reverse-chronological feed, read receipts, convert to todo, archive never delete |
| 6.4 tagging | Client / department / type / category plus custom tags created inline, and pinned filters |
| 6.7 dashboard | Own todos by client, unread instructions first, own clients and groups |
| 6.8 reporting | Daily snapshot, per-person status, historical log, CSV export |
| 9.0 notifications | The in-app channel, with per-person channel toggles |
| 9.4 escalation | Overdue work names the chain it has climbed: lead, then head, then leadership |

**Not built:** browser push, email and the Discord webhook are server-side in the
specified build (9.0), and there is no authentication — the account switcher in
the top bar stands in for the invite-only login so the permission rules in 3.0
can be seen from any role. Data lives in `localStorage` in one browser; "reset
data" in the footer restores the seeded workspace.

## File structure

```
index.html                     application shell, no inline style or script
assets/css/01-tokens.css       design tokens, light and dark themes
assets/css/02-base.css         element defaults, form controls, utilities
assets/css/03-layout.css       top bar, nav, page, two-panel board, breakpoints
assets/css/04-components.css   chips, cards, todo and note items, modal, toasts
assets/js/store.js             every entity in 5.0, seed data, persistence, audit
assets/js/permissions.js       the permission engine of 3.0
assets/js/ui.js                element construction, dates, chips, modal, toasts
assets/js/board.js             the two-panel board (6.2, 6.3, 6.4)
assets/js/dashboard.js         the personal dashboard (6.7)
assets/js/groups.js            cross-department groups (4.2, 6.5)
assets/js/reports.js           snapshot, per-person table, CSV export (6.8)
assets/js/people.js            accounts, departments, invites, preferences
assets/js/app.js               shell, routing, notifications, theme
spec/                          the specification document
```

Scripts load in that order and it matters: `store.js` and `permissions.js` must
exist before any view runs. Stylesheets are numbered because the cascade depends
on their order — tokens first, every later file reads those properties.

## Working on it

`store.js` is the only file that touches storage. Everything else asks it for
data and calls `mutate()` to change it, which stamps the audit log and re-renders.
Moving to Firestore means reimplementing `read()` and `write()` there and leaving
the rest alone.

`permissions.js` decides who may see and do what. It is the only place that
should know about hierarchy. **It gates the interface only** — the specification
is explicit (8.1) that the same rules must be enforced again in Firestore
Security Rules, because a UI check is not a security boundary.

Adding a department, a level, a client or a tag is data, not code: add it in
`seed()` (or through the app) and the permission engine follows it.
