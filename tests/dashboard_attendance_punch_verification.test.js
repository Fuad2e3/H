const assert = require('assert');
require('./harness.js');

function makeElement(tag) {
  return {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    classList: {
      add: function () {},
      remove: function () {},
      contains: function () { return false; }
    },
    style: {},
    attributes: {},
    children: [],
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    appendChild: function (child) {
      if (typeof child === 'string') {
        this.children.push({ nodeType: 3, text: child });
      } else if (child) {
        this.children.push(child);
      }
      return child;
    },
    addEventListener: function (ev, fn) { this['on' + ev] = fn; },
    removeEventListener: function () {},
    remove: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    focus: function () {}
  };
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (t) { return { nodeType: 3, text: String(t) }; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  getElementById: function () { return null; },
  addEventListener: function () {},
  body: makeElement('body'),
  documentElement: { setAttribute: function () {}, removeAttribute: function () {} }
};

globalThis.window = {
  addEventListener: function () {},
  location: { hash: '' }
};

globalThis.OC = {};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/board.js');
loadFile('assets/js/dashboard.js');
loadFile('assets/js/profile_portal.js');

console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║       DASHBOARD ATTENDANCE QUICK PUNCH IN/OUT VERIFICATION TEST          ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

// Initialize store
OC.store.load();
const currentUser = OC.store.state.users[0];
assert(currentUser, 'Must have at least one user');

const host = makeElement('div');
let renderedElements = null;

// Mock OC.ui.append and clear to capture DOM output
const origAppend = OC.ui.append;
OC.ui.append = function (parent, nodes) {
  renderedElements = nodes;
  return origAppend(parent, nodes);
};

console.log('--- [1/3] Verifying Dashboard Renders Attendance Punch Button ---');
OC.dashboard.render(host);
assert(renderedElements && renderedElements.length > 0, 'Dashboard must render elements');
const profileBanner = renderedElements[0];
assert(profileBanner, 'Profile banner must be rendered');

// Search for the punch button inside profileBanner
let punchBtn = null;
function findPunchBtn(node) {
  if (!node) return;
  if (node.attributes && node.attributes.id === 'dashboard-attendance-punch-btn') punchBtn = node;
  if (Array.isArray(node.children)) {
    node.children.forEach(findPunchBtn);
  }
}
findPunchBtn(profileBanner);
assert(punchBtn, 'Dashboard must contain #dashboard-attendance-punch-btn');
console.log('  ✓ Attendance button found on Dashboard: "' + punchBtn.children[0].text + '"');

console.log('\n--- [2/3] Verifying Quick Punch In Directly from Dashboard ---');
// Trigger punch in click
(punchBtn.onclick || punchBtn.onClick).call(punchBtn, { stopPropagation: () => {} });

const updatedAtt = OC.store.state.attendance || [];
const todayStr = new Date().toISOString().split('T')[0];
const myTodayLog = updatedAtt.find(a => a.user_id === currentUser.id && a.date === todayStr);

assert(myTodayLog, 'Attendance record must be created for today');
assert(myTodayLog.punch_in, 'Punch in time must be set');
console.log('  ✓ Quick Punch In successful: ' + myTodayLog.punch_in + ' (Status: ' + myTodayLog.status + ')');

console.log('\n--- [3/3] Verifying Quick Punch Out Directly from Dashboard ---');
// Rerender and find updated punch button
OC.dashboard.render(host);
punchBtn = null;
findPunchBtn(renderedElements[0]);
assert(punchBtn, 'Updated punch button must exist');
console.log('  ✓ Updated button label on Dashboard: "' + punchBtn.children[0].text + '"');

// Trigger punch out click
(punchBtn.onclick || punchBtn.onClick).call(punchBtn, { stopPropagation: () => {} });

const finalLog = (OC.store.state.attendance || []).find(a => a.user_id === currentUser.id && a.date === todayStr);
assert(finalLog.punch_out, 'Punch out time must be set');
console.log('  ✓ Quick Punch Out successful: ' + finalLog.punch_out);

// Rerender to verify completed state
OC.dashboard.render(host);
punchBtn = null;
findPunchBtn(renderedElements[0]);
assert(punchBtn.attributes.disabled !== undefined, 'Punch button must be disabled after completing both in and out');
console.log('  ✓ Punch button correctly disabled & locked: "' + punchBtn.children[0].text + '"');

console.log('\n==========================================================================');
console.log('  🎉 DASHBOARD ATTENDANCE QUICK PUNCH VERIFIED 100% (0 ERRORS)! ✅');
console.log('==========================================================================\n');
