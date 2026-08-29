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
| 6.1 invites | Single-use token expiring in 72 hours, resend, revoke, claim; new accounts default to the narrowest level |
| 6.2 todos | Four states, blocked demands a reason, recurrence regenerates on completion, copy yesterday |
| 6.3 instructions | Reverse-chronological feed, read receipts, convert to todo, archive never delete |
| 6.4 tagging | Client / department / type / category plus custom tags created inline; every tag field is a searchable tick list that narrows as you type |
| 6.4 client view | One combined chronological timeline of every todo and instruction for a client, across all departments |
| 6.4 pinned filters | Saved on the board, reachable from the dashboard |
| 5.0 comments | Comment threads on todos and instructions, written to the audit log |
| 3.4 / 4.1 departments | The admin can add a department and edit its ordered hierarchy; the permission engine follows the new order at once |
| 9.1 browser push | Permission request and system notifications for work addressed to you |
| 6.7 dashboard | Own todos by client, unread instructions first, own clients and groups |
| 6.8 reporting | Daily snapshot, per-person status, historical log, CSV export |
| 9.0 notifications | The in-app channel, with per-person channel toggles |
| 9.4 escalation | Overdue work names the chain it has climbed: lead, then head, then leadership |

**Not built:** email and the Discord webhook are sent by a Cloud Function in the
specified build (10.1), so they need the server side to exist. Browser push is
here as far as a page can take it — permission and system notifications — but
true Web Push also needs a service worker and a server to push from. There is no
authentication: the account switcher in the top bar stands in for the
invite-only login so the permission rules in 3.0 can be seen from any role. Data lives in `localStorage` in one browser; "reset
data" in the footer restores the seeded workspace.

## File structure

```
index.html                     application shell, no inline style or script
assets/css/01-tokens.css       colour, spacing, radius, control-height and
                               elevation scales, light and dark themes
assets/css/02-base.css         element defaults, form controls, buttons, utilities
assets/css/03-layout.css       top bar, nav, page, two-panel board, breakpoints
assets/css/04-components.css   chips, segmented controls, cards, todo and note
                               items, filter bar, tables, modal, toasts
assets/css/05-touch.css        coarse-pointer control scale and phone density
                               (loaded last: it overrides earlier files at
                               equal specificity, so order is what makes it win)
assets/js/icons.js             inline SVG icon set, drawn on a 16px grid
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

## Tests

```
node tests/logic.test.js     # 119 checks, no browser needed
python3 tests/ui.test.py     # 112 checks, drives a real browser
python3 tests/sweep.test.py  # clicks every control, as every account
```

`logic.test.js` covers `store.js` and `permissions.js` directly: every lookup,
persistence, the audit stamp, and the full permission matrix across all eleven
accounts — who may see, assign, reassign, create groups, invite, and where each
rule stops at a department boundary.

`sweep.test.py` clicks every control in every view as every one of the eleven
accounts and fails on any console error. It exists because scripted tests only
cover paths someone thought to script: this one found a crash on the dashboard's
own New todo button, on a path no scripted test walked.

`ui.test.py` drives the interface: routing and deep links, theme cycling and
persistence, every filter, pinned filters, all three groupings, all four
recurrence periods, blocked reasons, convert-to-todo including cancellation,
read receipts, archiving, group creation validation, report figures checked
against the underlying data, CSV contents, invite validation, notification
persistence across reload, and reset. It needs Chromium; set `CHROME_PATH` if
Playwright cannot find one.

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

Nothing in the interface should invent its own spacing, radius or control
height — those live as scales in `01-tokens.css`. If a value is not there, it
probably belongs there. Breakpoints are set by content rather than by device: 1100px is where the two
panels stop fitting side by side, 720px is where the top bar has to wrap, and
560px is where the wordmark tips it onto a third row. Touch sizing keys off
`pointer: coarse` rather than width, so a touch laptop gets the larger controls
and a narrow desktop window does not.
