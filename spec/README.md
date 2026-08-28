# Originate Command — SRS

Software Requirements Specification **OM SRS 001** (draft 0.1) for Originate
Command, a unified todo board and instruction / notice system for Originate
Marketing.

Open `index.html` in a browser. There is no build step, no package manager and
no framework — the scripts are plain classic scripts, so the page works when
opened straight from disk as well as when served.

## File structure

| File | Responsibility |
| --- | --- |
| `index.html` | Document content only: the 14 numbered sections, title block, contents rail and footer. No inline styles or scripts. |
| `assets/css/01-tokens.css` | Design tokens. The light palette on `:root`, the dark palette under `prefers-color-scheme`, and the same dark palette under `[data-theme="dark"]` so the manual toggle wins. |
| `assets/css/02-base.css` | Element defaults: box sizing, body type, links, focus states, reduced motion, skip link, blueprint grid texture. |
| `assets/css/03-layout.css` | Page structure: the two-column shell and its collapse under 920px, title block, contents rail, content sections, footer. |
| `assets/css/04-components.css` | Reusable pieces: callouts, captioned tables, permission pills, entity cards, roadmap phase blocks, theme toggle. |
| `assets/css/05-print.css` | Print and PDF rules. Loaded with `media="print"`. |
| `assets/js/theme.js` | Cycles the toggle system → dark → light and persists the choice in `localStorage`. |
| `assets/js/contents.js` | Marks the section in view in the contents rail via `aria-current`. |

## Working on it

**Stylesheets load in numeric order and the cascade depends on it** — tokens
must come first, since every later file reads those custom properties. Add a
new rule to the file that owns its concern rather than to whichever file is
open; if a rule is a reusable piece of UI it belongs in `04-components.css`,
if it positions a region of the page it belongs in `03-layout.css`.

Changing a colour means changing it in `01-tokens.css` in **three** places —
`:root`, the `prefers-color-scheme` block, and the `[data-theme="dark"]`
block — or the manual toggle and the OS preference will disagree.

The two scripts are independent, load with `defer`, and each exits quietly if
the element it needs is absent, so either can be removed without touching the
other.
