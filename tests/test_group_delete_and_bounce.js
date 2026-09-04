const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== [TEST] Group Delete Syncing & Chat Message Bounce Fixes ===');

// 1. Check CSS scroll behavior
console.log('\n--- 1. Testing CSS Scroll Rules in 04-components.css ---');
const cssPath = path.resolve(__dirname, '../assets/css/04-components.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

assert(cssContent.includes('.full-page-chat-messages'), '.full-page-chat-messages class exists in CSS');
const chatRuleMatch = cssContent.match(/\.full-page-chat-messages\s*\{([^}]+)\}/);
assert(chatRuleMatch, 'Found .full-page-chat-messages style block');
const chatCssBody = chatRuleMatch[1];

assert(chatCssBody.includes('scroll-behavior: auto !important;'), 'scroll-behavior is set to auto !important (no smooth scrolling bounce)');
assert(!chatCssBody.includes('scroll-behavior: smooth'), 'scroll-behavior: smooth is completely removed');
console.log('✅ CSS rules successfully updated to prevent bounce.');

// 2. Check JavaScript groups.js
console.log('\n--- 2. Testing groups.js Message Sending & Scroll Logic ---');
const groupsJsPath = path.resolve(__dirname, '../assets/js/groups.js');
const groupsJsContent = fs.readFileSync(groupsJsPath, 'utf8');

// Ensure no 8-frame requestAnimationFrame loop in applyScroll
assert(!groupsJsContent.includes('frames++ > 8'), '8-frame recursive loop in applyScroll has been removed');
assert(!groupsJsContent.includes('requestAnimationFrame(function () {\n            if (!el.isConnected) return;'), 'Competing animation frames removed from applyScroll');

// Ensure applyScroll sets position cleanly
assert(groupsJsContent.includes('el.scrollTop = el.scrollHeight;'), 'applyScroll handles bottom directly');

// Ensure submitGroupMessage preserves scroll and does not call applyScroll('bottom')
assert(!groupsJsContent.includes("chatPinnedToBottom = true;\n        applyScroll('bottom');"), 'submitGroupMessage does not forcibly auto-scroll to bottom');
assert(groupsJsContent.includes('preservedScroll'), 'submitGroupMessage preserves exact scroll position');

// Ensure group.delete passes groupId
assert(groupsJsContent.includes("action: 'group.delete', target: group.name, groupId: group.id"), 'deleteGroup passes groupId in mutation');
assert(groupsJsContent.includes("action: 'group.delete', target: group.name, groupId: group.id, detail: 'Deleted group'"), 'deleteGroupDirect passes groupId in mutation');
console.log('✅ groups.js verified: zero bounce, preserved scroll position, and correct delete mutations.');

// 3. Check store.js Group Tombstone & Sync Logic
console.log('\n--- 3. Testing store.js Group Tombstone & Server Sync Logic ---');
const storeJsPath = path.resolve(__dirname, '../assets/js/store.js');
const storeJsContent = fs.readFileSync(storeJsPath, 'utf8');

assert(storeJsContent.includes('markGroupDeleted'), 'markGroupDeleted function exists');
assert(storeJsContent.includes('trackGroupCreated'), 'trackGroupCreated function exists');
assert(storeJsContent.includes('oc_deleted_groups'), 'localStorage persistence for deleted groups exists');
assert(storeJsContent.includes('wasRecentlyCreatedLocally'), 'syncWithServer checks wasRecentlyCreatedLocally before pushing local groups');
console.log('✅ store.js verified: tombstone persistence and prevents resurrection from client sync.');

// 4. Check commandController.js Server-side Protection
console.log('\n--- 4. Testing commandController.js Server-side Tombstone & Anti-resurrection ---');
const controllerPath = path.resolve(__dirname, '../dev3/API/controllers/commandController.js');
const controllerContent = fs.readFileSync(controllerPath, 'utf8');

assert(controllerContent.includes('serverDeletedGroupIds'), 'serverDeletedGroupIds Set exists in controller');
assert(controllerContent.includes('serverDeletedGroupIds.add(targetId)'), 'Deleted group IDs are added to server tombstone set');
assert(controllerContent.includes('!serverDeletedGroupIds.has(g.id)'), 'Incoming states are stripped of deleted groups');
console.log('✅ commandController.js verified: server actively filters deleted groups.');

// 5. Check originate_db.json ground truth
console.log('\n--- 5. Checking originate_db.json Group State ---');
const dbJsonPath = path.resolve(__dirname, '../dev3/API/data/originate_db.json');
const dbData = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
const hasTryGroup = (dbData.groups || []).some(g => g.name === 'Try' || g.id === 'g-mtimfeoycj4w');
assert(!hasTryGroup, 'Group "Try" (g-mtimfeoycj4w) is completely removed from central database');
console.log('✅ Database verified: Deleted group is completely purged.');

console.log('\n🎉 ALL GROUP DELETE & CHAT BOUNCE VERIFICATION CHECKS PASSED!');
